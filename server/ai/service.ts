import type { AiPlan, AiStreamEvent, ContentBlock, GenerationResult, JobKind, StageUsage, UsageSummary, UserMode } from '../../src/types/ai.ts';
import { modelsConfig } from './config.ts';
import type { ModelsConfig } from './config.ts';
import { BlockStreamParser, blocksToMarkdown, normalizeBlock, parseBlocks } from './blocks.ts';
import { buildPrompt, estimateTokens, injectedRefs } from './context.ts';
import type { ContextObjectLite, FileExcerpt } from './context.ts';
import { ModelDecisionLayer } from './decision.ts';
import type { DecisionLayer } from './decision.ts';
import { AiError, toAiError } from './errors.ts';
import { runPipeline } from './pipeline.ts';
import { BLOCKS_INSTRUCTION, CHAT_MODE_HINT, EXTRACT_INSTRUCTION, SYSTEM_PROMPT } from './prompts.ts';
import { BLOCKS_SCHEMA, EXTRACT_SCHEMA } from './schemas.ts';
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
  /** node id → label of this workspace (user nodes included) */
  nodeLabels?: Record<string, string>;
  /** node chat: proposals are clamped to these nodes (the scope node + its sub-tree) */
  allowedNodeIds?: string[];
  scopeNodeId?: string;
  excerpts?: FileExcerpt[];
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
  nodeLabels?: Record<string, string>;
  excerpts?: FileExcerpt[];
}

export type Emit = (e: AiStreamEvent) => void;

/** Node chats may only propose updates inside their scope. */
export function clampProposal(b: ContentBlock, allowed?: string[], scope?: string): ContentBlock {
  if (!b.proposal || !allowed?.length || allowed.includes(b.proposal.nodeId)) return b;
  return { ...b, proposal: { ...b.proposal, nodeId: scope && allowed.includes(scope) ? scope : allowed[0] } };
}

export interface ExtractRequest {
  kind: 'note' | 'file';
  text: string;
  /** where Proposed objects land by default */
  nodeId: string;
  nodes: Array<{ id: string; label: string }>;
  wantSummary?: boolean;
}

export interface ExtractedObject { type: 'Fact' | 'Decision' | 'Constraint'; title: string; content: string; nodeId: string }

export interface ExtractResult {
  summary?: string;
  objects: ExtractedObject[];
  usage: UsageSummary;
  /** the text was longer than the extraction window — only its beginning was read */
  truncated: boolean;
}

/** Max tokens of a document read by the one-time extraction (retrieval still covers the whole file). */
export const EXTRACT_WINDOW_TOKENS = 30_000;

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
        req.allowedNodeIds?.length ? `## گره‌های مجاز برای proposal (شناسه=نام)\n${req.allowedNodeIds.map((id) => `${id}=${req.nodeLabels?.[id] ?? id}`).join('، ')}\nپیشنهاد به‌روزرسانی فقط برای همین گره‌ها مجاز است.` : '',
        `## پیام کاربر\n${req.message}`,
        `${BLOCKS_INSTRUCTION}\nطول هدف: ${plan.outputBand.minWords} تا ${plan.outputBand.maxWords} کلمه.`,
      ].filter(Boolean).join('\n\n');
      const prompt = buildPrompt({ contexts: req.contextList, focusNodeIds: req.focusNodeIds, task, nodeLabels: req.nodeLabels, excerpts: req.excerpts });
      const clamp = (b: ContentBlock): ContentBlock => clampProposal(b, req.allowedNodeIds, req.scopeNodeId);

      const s = runner.stream({ stage: 'chat', tier: plan.tier, effort: plan.effort, maxTokens: plan.maxTokens, timeoutMs: this.cfg.timeoutsMs.chat }, prompt, BLOCKS_SCHEMA);
      const parser = new BlockStreamParser();
      const used = new Set<string>();
      let text = '';
      let n = 0;
      for await (const chunk of s.chunks) {
        text += chunk;
        for (const raw of parser.push(chunk)) {
          const nb = normalizeBlock(raw, n, used);
          if (nb) { n++; emit({ type: 'block', block: clamp(nb) }); }
        }
      }
      stages.push(s.usage());
      let blocks: ContentBlock[];
      try { blocks = parseBlocks(JSON.parse(text)).map(clamp); } catch (e) { throw e instanceof AiError ? e : new AiError('bad_output', { stage: 'chat', detail: text.slice(0, 200) }); }
      const result: GenerationResult = {
        blocks, markdown: blocksToMarkdown(blocks), plan, usage: usageSummary(stages, session.source === 'byok'),
        usedContext: injectedRefs(req.contextList), usedFileChunks: (req.excerpts ?? []).map((e) => ({ fileId: e.fileId, index: e.index })),
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

      // What the model sees = the contexts relevant to this deliverable + every Confirmed Constraint (guardrails always apply).
      // This exact set is what Context Replay and the impact engine record (id + version).
      const seen = new Set(req.contextObjects.map((c) => c.id));
      const all = [...req.contextObjects, ...(req.contextList ?? []).filter((c) => c.status === 'Confirmed' && c.type === 'Constraint' && !seen.has(c.id))];
      const guardrails = all.filter((c) => c.status === 'Confirmed' && c.type === 'Constraint').map((c) => `${c.title}: ${c.content}`);
      const task = [
        `## کار: ${req.deliverableTitle}`,
        'فقط بر پایهٔ دانش تأییدشده بنویس و از کلی‌گویی و ادعای بی‌پشتوانه پرهیز کن.',
        req.contextObjects.length ? `دانش مرتبط با این خروجی: ${req.contextObjects.map((c) => c.title).join('، ')}` : '',
        req.rebuildNotes ? `نکات بازسازی: ${req.rebuildNotes}` : '',
      ].filter(Boolean).join('\n');
      const prompt = buildPrompt({ contexts: all, task, nodeLabels: req.nodeLabels, excerpts: req.excerpts });

      const out = await runPipeline({
        runner, plan, prompt, acceptanceCriteria: req.acceptanceCriteria, guardrails, cfg: this.cfg,
        onStage: (stage, tier) => emit({ type: 'stage', stage, tier }),
      });
      const stages = [...prior, ...out.stages];
      const result: GenerationResult = {
        blocks: out.blocks, markdown: out.markdown, plan, usage: usageSummary(stages, session.source === 'byok'),
        critiqueFeedback: out.critiqueFeedback, validationFailed: out.validationFailed,
        usedContext: injectedRefs(all), usedFileChunks: (req.excerpts ?? []).map((e) => ({ fileId: e.fileId, index: e.index })),
      };
      emit({ type: 'done', result });
    } catch (e) {
      emit({ type: 'error', error: toAiError(e).toInfo() });
    } finally { dl.done(); }
  }

  /**
   * One-time extraction on the cheap tier: Proposed objects (+ optional summary) from a note or a file.
   * Always cheap — decisions v3.1 §6 — so no routing/decision call is made.
   */
  async extract(userId: string, req: ExtractRequest, parent?: AbortSignal): Promise<ExtractResult> {
    const dl = this.deadline(req.kind === 'file' ? this.cfg.timeoutsMs.deliverable : this.cfg.timeoutsMs.chat, parent);
    try {
      const session = await this.deps.sessions.resolve(userId);
      const runner = new StageRunner(session, dl.signal, this.cfg);
      const maxChars = Math.floor(EXTRACT_WINDOW_TOKENS * 2.2);
      const truncated = req.text.length > maxChars;
      const text = truncated ? req.text.slice(0, maxChars) : req.text;
      const nodes = req.nodes.map((n) => `${n.id}=${n.label}`).join('، ');
      const user = [
        EXTRACT_INSTRUCTION,
        `## گره‌های مجاز (شناسه=نام)\n${nodes}\nگرهٔ پیش‌فرض: ${req.nodeId}`,
        req.wantSummary ? 'علاوه بر objectها، کلید summary را با خلاصهٔ ۳ تا ۵ جمله‌ای فارسی پر کن.' : 'کلید summary لازم نیست.',
        truncated ? 'توجه: متن بلند است و فقط بخش ابتدایی آن داده شده است.' : '',
        `## متن\n${text}`,
      ].filter(Boolean).join('\n\n');
      const r = await runner.structured(
        { stage: 'extract', tier: 'cheap', effort: 'low', maxTokens: 3000, timeoutMs: req.kind === 'file' ? this.cfg.timeoutsMs.deliverable : this.cfg.timeoutsMs.chat },
        { system: SYSTEM_PROMPT, user }, EXTRACT_SCHEMA,
      );
      const v = (r.value ?? {}) as { summary?: unknown; objects?: unknown };
      if (!Array.isArray(v.objects)) throw new AiError('bad_output', { stage: 'extract', detail: 'missing objects array' });
      const allowed = new Set(req.nodes.map((n) => n.id));
      const types = ['Fact', 'Decision', 'Constraint'];
      const objects: ExtractedObject[] = [];
      for (const o of v.objects.slice(0, 12) as Array<Record<string, unknown>>) {
        if (!o || typeof o.title !== 'string' || typeof o.content !== 'string' || !o.title.trim() || !o.content.trim() || !types.includes(o.type as string)) continue;
        objects.push({ type: o.type as ExtractedObject['type'], title: o.title.trim(), content: o.content.trim(), nodeId: typeof o.nodeId === 'string' && allowed.has(o.nodeId) ? o.nodeId : req.nodeId });
      }
      const summary = req.wantSummary && typeof v.summary === 'string' && v.summary.trim() ? v.summary.trim() : undefined;
      return { summary, objects, usage: usageSummary([r.usage], session.source === 'byok'), truncated };
    } finally { dl.done(); }
  }
}
