import type { AiPlan, AiStreamEvent, ContentBlock, GenerationResult, JobKind, StageUsage, UsageSummary, UserMode } from '../../src/types/ai.ts';
import { modelsConfig } from './config.ts';
import type { ModelsConfig } from './config.ts';
import { BlockStreamParser, blocksToMarkdown, normalizeBlock, parseBlocks } from './blocks.ts';
import { buildPrompt, estimateTokens } from './context.ts';
import type { ContextObjectLite } from './context.ts';
import { ModelDecisionLayer } from './decision.ts';
import type { DecisionLayer } from './decision.ts';
import { AiError, toAiError } from './errors.ts';
import { runPipeline } from './pipeline.ts';
import { BLOCKS_INSTRUCTION, CHAT_MODE_HINT } from './prompts.ts';
import { BLOCKS_SCHEMA } from './schemas.ts';
import { route, sanitizePlan } from './router.ts';
import { StageRunner, sumUsage } from './runner.ts';
import type { SessionResolver } from './session.ts';

export interface ChatRequest {
  message: string;
  contextList: ContextObjectLite[];
  focusNodeIds?: string[];
  chatMode?: 'discovery' | 'audit' | 'advisor';
  mode: 'auto' | 'deep';
  history?: Array<{ role: string; content: string }>;
  plan?: unknown;
  decisionUsage?: unknown;
}

export interface GenerateRequest {
  deliverableId: string;
  deliverableTitle: string;
  deliverableType: 'Asset' | 'Deliverable';
  acceptanceCriteria: string[];
  /** contexts relevant to this deliverable (what Context Replay will list) */
  contextObjects: ContextObjectLite[];
  /** the whole workspace (stable prefix); defaults to contextObjects */
  contextList?: ContextObjectLite[];
  userMode: UserMode;
  rebuildNotes?: string;
  plan?: unknown;
  decisionUsage?: unknown;
}

export type Emit = (e: AiStreamEvent) => void;

const sanitizeUsage = (u: unknown): StageUsage | null => {
  const x = u as Partial<StageUsage> | null;
  if (!x || x.stage !== 'decision' || typeof x.inputTokens !== 'number') return null;
  const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const cfgTier = modelsConfig.tiers.cheap;
  return {
    stage: 'decision', tier: 'cheap', provider: String(x.provider ?? cfgTier.provider), modelId: String(x.modelId ?? ''), effort: 'minimal',
    inputTokens: n(x.inputTokens), cachedTokens: n(x.cachedTokens), outputTokens: n(x.outputTokens), thinkingTokens: n(x.thinkingTokens),
    costUsd: Math.max(0, Number(x.costUsd) || 0), durationMs: n(x.durationMs),
  };
};

const usageSummary = (stages: StageUsage[], byok: boolean): UsageSummary => {
  const { costUsd, ...t } = sumUsage(stages);
  return { stages, totals: { ...t, costUsd }, byok };
};

export interface ServiceDeps {
  sessions: SessionResolver;
  cfg?: ModelsConfig;
  /** swap the decision implementation (default: cheap model + structured output) */
  decisionFactory?: (runner: StageRunner) => DecisionLayer;
}

export class AiService {
  private readonly cfg: ModelsConfig;
  constructor(private readonly deps: ServiceDeps) {
    this.cfg = deps.cfg ?? modelsConfig;
  }

  private decisions(runner: StageRunner): DecisionLayer {
    return this.deps.decisionFactory ? this.deps.decisionFactory(runner) : new ModelDecisionLayer(runner, this.cfg.timeoutsMs.decision);
  }

  /** request-wide deadline + client disconnect */
  private deadline(ms: number, parent?: AbortSignal) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort('deadline'), ms);
    const onParent = () => ctl.abort(parent?.reason ?? 'client');
    parent?.addEventListener('abort', onParent, { once: true });
    return { signal: ctl.signal, done: () => { clearTimeout(timer); parent?.removeEventListener('abort', onParent); } };
  }

  async previewPlan(userId: string, req: { userMode: UserMode; jobKind: JobKind; text: string; contextList: ContextObjectLite[] }, parent?: AbortSignal): Promise<{ plan: AiPlan; decisionUsage?: StageUsage }> {
    const session = await this.deps.sessions.resolve(userId);
    const dl = this.deadline(this.cfg.timeoutsMs.decision * 2, parent);
    try {
      const runner = new StageRunner(session, dl.signal, this.cfg);
      return await route(
        { userMode: req.userMode, jobKind: req.jobKind, text: req.text, contextTokens: estimateTokens(req.contextList.map((c) => c.content).join(' ')) },
        { decisions: this.decisions(runner), cfg: this.cfg },
      );
    } finally { dl.done(); }
  }

  async chat(userId: string, req: ChatRequest, emit: Emit, parent?: AbortSignal): Promise<void> {
    const dl = this.deadline(this.cfg.timeoutsMs.chat, parent);
    try {
      const session = await this.deps.sessions.resolve(userId);
      const runner = new StageRunner(session, dl.signal, this.cfg);
      const stages: StageUsage[] = [];

      let plan = sanitizePlan(req.plan, this.cfg);
      const pre = sanitizeUsage(req.decisionUsage);
      if (plan) { if (pre) stages.push(pre); }
      else {
        const r = await route(
          { userMode: req.mode === 'deep' ? 'deep' : 'auto', jobKind: 'chat', text: req.message, contextTokens: estimateTokens(req.contextList.map((c) => c.content).join(' ')) },
          { decisions: this.decisions(runner), cfg: this.cfg },
        );
        plan = r.plan;
        if (r.decisionUsage) stages.push(r.decisionUsage);
      }
      emit({ type: 'plan', plan });
      emit({ type: 'stage', stage: 'chat', tier: plan.tier });

      const history = (req.history ?? []).slice(-6).map((m) => `${m.role === 'user' ? 'کاربر' : 'مبدأ'}: ${m.content}`).join('\n');
      const task = [
        CHAT_MODE_HINT[req.chatMode ?? 'discovery'],
        history ? `## تاریخچهٔ اخیر گفتگو\n${history}` : '',
        `## پیام کاربر\n${req.message}`,
        `${BLOCKS_INSTRUCTION}\nطول هدف: ${plan.outputBand.minWords} تا ${plan.outputBand.maxWords} کلمه.`,
      ].filter(Boolean).join('\n\n');
      const prompt = buildPrompt({ contexts: req.contextList, focusNodeIds: req.focusNodeIds, task });

      const s = runner.stream({ stage: 'chat', tier: plan.tier, effort: plan.effort, maxTokens: plan.maxTokens, timeoutMs: this.cfg.timeoutsMs.chat }, prompt, BLOCKS_SCHEMA);
      const parser = new BlockStreamParser();
      const used = new Set<string>();
      let text = '';
      let n = 0;
      for await (const chunk of s.chunks) {
        text += chunk;
        for (const raw of parser.push(chunk)) {
          const b = normalizeBlock(raw, n, used);
          if (b) { n++; emit({ type: 'block', block: b }); }
        }
      }
      stages.push(s.usage());
      let blocks: ContentBlock[];
      try { blocks = parseBlocks(JSON.parse(text)); } catch (e) { throw e instanceof AiError ? e : new AiError('bad_output', { stage: 'chat', detail: text.slice(0, 200) }); }
      const result: GenerationResult = {
        blocks, markdown: blocksToMarkdown(blocks), plan, usage: usageSummary(stages, session.source === 'byok'), usedContextIds: [],
      };
      emit({ type: 'done', result });
    } catch (e) {
      emit({ type: 'error', error: toAiError(e).toInfo() });
    } finally { dl.done(); }
  }

  async generate(userId: string, req: GenerateRequest, emit: Emit, parent?: AbortSignal): Promise<void> {
    const dl = this.deadline(this.cfg.timeoutsMs.deliverable, parent);
    try {
      const session = await this.deps.sessions.resolve(userId);
      const runner = new StageRunner(session, dl.signal, this.cfg);
      const jobKind: JobKind = req.deliverableType === 'Asset' ? 'asset' : 'deliverable';
      const prior: StageUsage[] = [];

      let plan = sanitizePlan(req.plan, this.cfg);
      const pre = sanitizeUsage(req.decisionUsage);
      if (plan) { if (pre) prior.push(pre); }
      else {
        const r = await route(
          { userMode: req.userMode, jobKind, text: `${req.deliverableTitle}\n${req.acceptanceCriteria.join('\n')}`, contextTokens: estimateTokens((req.contextList ?? req.contextObjects).map((c) => c.content).join(' ')) },
          { decisions: this.decisions(runner), cfg: this.cfg },
        );
        plan = r.plan;
        if (r.decisionUsage) prior.push(r.decisionUsage);
      }
      emit({ type: 'plan', plan });

      const all = req.contextList ?? req.contextObjects;
      const guardrails = all.filter((c) => c.status === 'Confirmed' && c.type === 'Constraint').map((c) => `${c.title}: ${c.content}`);
      const task = [
        `## کار: ${req.deliverableTitle}`,
        'فقط بر پایهٔ دانش تأییدشده بنویس و از کلی‌گویی و ادعای بی‌پشتوانه پرهیز کن.',
        req.contextObjects.length ? `دانش مرتبط با این خروجی: ${req.contextObjects.map((c) => c.title).join('، ')}` : '',
        req.rebuildNotes ? `نکات بازسازی: ${req.rebuildNotes}` : '',
      ].filter(Boolean).join('\n');
      const prompt = buildPrompt({ contexts: all, task });

      const out = await runPipeline({
        runner, plan, prompt, acceptanceCriteria: req.acceptanceCriteria, guardrails, cfg: this.cfg,
        onStage: (stage, tier) => emit({ type: 'stage', stage, tier }),
      });
      const stages = [...prior, ...out.stages];
      const result: GenerationResult = {
        blocks: out.blocks, markdown: out.markdown, plan, usage: usageSummary(stages, session.source === 'byok'),
        critiqueFeedback: out.critiqueFeedback, validationFailed: out.validationFailed,
        usedContextIds: req.contextObjects.filter((c) => c.status === 'Confirmed').map((c) => c.id),
      };
      emit({ type: 'done', result });
    } catch (e) {
      emit({ type: 'error', error: toAiError(e).toInfo() });
    } finally { dl.done(); }
  }
}
