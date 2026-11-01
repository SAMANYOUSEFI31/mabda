import type { AiPlan, AiStreamEvent, ContentBlock, GenerationResult, JobKind, StageUsage, UsageSummary, UserMode } from '../../src/types/ai.ts';
import { modelsConfig } from './config.ts';
import type { ModelsConfig } from './config.ts';
import { BlockStreamParser, blocksToMarkdown, normalizeBlock, parseBlocks } from './blocks.ts';
import { buildPrompt, estimateTokens, injectedRefs } from './context.ts';
import type { ContextObjectLite, FileExcerpt } from './context.ts';
import { ModelDecisionLayer } from './decision.ts';
import type { DecisionLayer, DecisionQuestion } from './decision.ts';
import { AiError, toAiError } from './errors.ts';
import { runPipeline } from './pipeline.ts';
import { BLOCKS_INSTRUCTION, CHAT_MODE_HINT, COACH_INSTRUCTION, EXTRACT_INSTRUCTION, PARSE_INSTRUCTION, SYSTEM_PROMPT } from './prompts.ts';
import { BLOCKS_SCHEMA, COACH_SCHEMA, EXTRACT_SCHEMA, PARSE_SCHEMA } from './schemas.ts';
import type { ParsedBlock } from '../../src/core/answerParser.ts';
import { applyBand, route, sanitizePlan } from './router.ts';
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
  /** workstream goal (for the critic and the drafter) */
  specTarget?: string;
  /** rules of the workstream spec; Confirmed Constraint objects are added automatically */
  specGuardrails?: string[];
  outputBand?: 'short' | 'medium' | 'long';
  /** finished outputs this deliverable depends on (its inputs) */
  dependencyOutputs?: Array<{ title: string; markdown: string }>;
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

export interface CoachRequest {
  scope: 'onboarding' | 'node';
  text: string;
  nodeId: string;
  nodeLabel?: string;
  nodeDescription?: string;
  nodes: Array<{ id: string; label: string }>;
  /** one-line summaries of Confirmed context near the node */
  existing?: string[];
  history?: Array<{ role: 'user' | 'coach'; content: string }>;
}

export interface CoachResult {
  questions: string[];
  ambiguities: Array<{ quote: string; why: string }>;
  proposals: ExtractedObject[];
  usage: UsageSummary;
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
      plan = applyBand(plan, jobKind, req.outputBand, this.cfg);
      emit({ type: 'plan', plan });

      // What the model sees = the contexts relevant to this deliverable + every Confirmed Constraint (guardrails always apply).
      // This exact set is what Context Replay and the impact engine record (id + version).
      const seen = new Set(req.contextObjects.map((c) => c.id));
      const all = [...req.contextObjects, ...(req.contextList ?? []).filter((c) => c.status === 'Confirmed' && c.type === 'Constraint' && !seen.has(c.id))];
      // guardrails = the spec's own rules + every Confirmed Constraint of the workspace (applied automatically)
      const guardrails = [...new Set([...(req.specGuardrails ?? []).map((g) => g.trim()).filter(Boolean), ...all.filter((c) => c.status === 'Confirmed' && c.type === 'Constraint').map((c) => `${c.title}: ${c.content}`)])];
      const task = [
        `## کار: ${req.deliverableTitle}`,
        req.specTarget ? `هدف جریان کار: ${req.specTarget}` : '',
        req.dependencyOutputs?.length ? `## خروجی‌های قبلی این جریان کار (ورودی این خروجی؛ با آن‌ها سازگار بمان)\n${req.dependencyOutputs.map((d) => `### ${d.title}\n${d.markdown}`).join('\n\n')}` : '',
        'فقط بر پایهٔ دانش تأییدشده بنویس و از کلی‌گویی و ادعای بی‌پشتوانه پرهیز کن.',
        req.contextObjects.length ? `دانش مرتبط با این خروجی: ${req.contextObjects.map((c) => c.title).join('، ')}` : '',
        req.rebuildNotes ? `نکات بازسازی: ${req.rebuildNotes}` : '',
      ].filter(Boolean).join('\n');
      const prompt = buildPrompt({ contexts: all, task, nodeLabels: req.nodeLabels, excerpts: req.excerpts });

      const out = await runPipeline({
        runner, plan, prompt, acceptanceCriteria: req.acceptanceCriteria, guardrails, cfg: this.cfg, decisions: this.decisions(runner), specTarget: req.specTarget,
        onStage: (stage, tier) => emit({ type: 'stage', stage, tier }),
      });
      const stages = [...prior, ...out.stages];
      const result: GenerationResult = {
        blocks: out.blocks, markdown: out.markdown, plan, usage: usageSummary(stages, session.source === 'byok'),
        critiqueFeedback: out.critiqueFeedback, validationFailed: out.validationFailed, checks: out.checks,
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
      const session = await this.deps.sessions.resolve(userId, 'platform');
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

  /**
   * Gap «مبهم» detection: the decision layer judges, per Context object version, whether the text is too vague to build on.
   * One batched call; the caller caches the answers per (id, version). Meaning decides — not text length.
   */
  async judgeAmbiguity(userId: string, items: Array<{ id: string; title: string; content: string }>, parent?: AbortSignal): Promise<{ judgments: Record<string, { ambiguous: boolean; reason: string; probability: number }>; usage?: UsageSummary }> {
    if (!items.length) return { judgments: {} };
    const dl = this.deadline(this.cfg.timeoutsMs.validator, parent);
    try {
      const session = await this.deps.sessions.resolve(userId, 'platform');
      const runner = new StageRunner(session, dl.signal, this.cfg);
      const questions: DecisionQuestion[] = items.map((it, i) => ({
        id: `o${i}`, question: `آیا این Context برای ساختن خروجی به‌اندازهٔ کافی روشن و مشخص است یا مبهم؟ «${it.title}»: ${it.content}`, options: ['clear', 'ambiguous'], reason: true,
      }));
      const res = await this.decisions(runner).decide({ text: 'قضاوت دربارهٔ روشن‌بودن دانش کسب‌وکار (نه طول متن؛ معنا)', stage: 'decision' }, questions);
      const judgments: Record<string, { ambiguous: boolean; reason: string; probability: number }> = {};
      res.answers.forEach((a, i) => { judgments[items[i].id] = { ambiguous: a.choice === 'ambiguous', reason: a.reason ?? '', probability: a.probability }; });
      return { judgments, usage: res.usage ? usageSummary([res.usage], session.source === 'byok') : undefined };
    } finally { dl.done(); }
  }

  /**
   * Context Coach (balanced tier): asks clarifying questions, points at ambiguity and drafts PROPOSED objects.
   * It never writes anything itself — the caller saves proposals only when the user agrees.
   */
  async coach(userId: string, req: CoachRequest, parent?: AbortSignal): Promise<CoachResult> {
    const dl = this.deadline(this.cfg.timeoutsMs.chat, parent);
    try {
      const session = await this.deps.sessions.resolve(userId, 'platform');
      const runner = new StageRunner(session, dl.signal, this.cfg);
      const user = [
        req.scope === 'onboarding' ? '## موقعیت\nکاربر در شروع کار (onboarding) است و حقایق اساسی کسب‌وکارش را می‌نویسد.' : `## موقعیت\nکاربر گرهٔ «${req.nodeLabel ?? req.nodeId}» را تعریف می‌کند.${req.nodeDescription ? ` توضیح گره: ${req.nodeDescription}` : ''}`,
        `## گره‌های مجاز برای proposal (شناسه=نام)\n${req.nodes.map((n) => `${n.id}=${n.label}`).join('، ')}\nگرهٔ پیش‌فرض: ${req.nodeId}`,
        req.existing?.length ? `## دانش تأییدشدهٔ موجود\n${req.existing.map((c) => `- ${c}`).join('\n')}` : '',
        req.history?.length ? `## گفتگوی قبلی با Coach\n${req.history.map((m) => `${m.role === 'user' ? 'کاربر' : 'Coach'}: ${m.content}`).join('\n')}` : '',
        `## متن کاربر\n${req.text}`,
      ].filter(Boolean).join('\n\n');
      const r = await runner.structured(
        { stage: 'coach', tier: 'balanced', effort: 'low', maxTokens: 2500, timeoutMs: this.cfg.timeoutsMs.chat },
        { system: `${SYSTEM_PROMPT}\n\n${COACH_INSTRUCTION}`, user },
        COACH_SCHEMA,
      );
      const v = (r.value ?? {}) as { questions?: unknown; ambiguities?: unknown; proposals?: unknown };
      if (!Array.isArray(v.questions) || !Array.isArray(v.ambiguities) || !Array.isArray(v.proposals)) throw new AiError('bad_output', { stage: 'coach', detail: 'shape' });
      const allowed = new Set(req.nodes.map((n) => n.id));
      const types = ['Fact', 'Decision', 'Constraint'];
      const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
      const proposals: ExtractedObject[] = [];
      for (const o of v.proposals.slice(0, 6) as Array<Record<string, unknown>>) {
        if (!o || !str(o.title) || !str(o.content) || !types.includes(o.type as string)) continue;
        proposals.push({ type: o.type as ExtractedObject['type'], title: str(o.title), content: str(o.content), nodeId: typeof o.nodeId === 'string' && allowed.has(o.nodeId) ? o.nodeId : req.nodeId });
      }
      return {
        questions: (v.questions as unknown[]).map(str).filter(Boolean).slice(0, 4),
        ambiguities: (v.ambiguities as Array<Record<string, unknown>>).map((a) => ({ quote: str(a?.quote), why: str(a?.why) })).filter((a) => a.quote && a.why).slice(0, 6),
        proposals,
        usage: usageSummary([r.usage], session.source === 'byok'),
      };
    } finally { dl.done(); }
  }

  /**
   * Fallback for a pasted answer that has no recognisable headings: the cheap decision layer cuts it into labelled
   * blocks. The text is never rewritten (the prompt asks for verbatim sections).
   */
  async parseExternal(userId: string, text: string, parent?: AbortSignal): Promise<{ blocks: ParsedBlock[]; usage: UsageSummary; truncated: boolean }> {
    const dl = this.deadline(this.cfg.timeoutsMs.chat, parent);
    try {
      const session = await this.deps.sessions.resolve(userId, 'platform');
      const runner = new StageRunner(session, dl.signal, this.cfg);
      const maxChars = Math.floor(EXTRACT_WINDOW_TOKENS * 2.2);
      const truncated = text.length > maxChars;
      const r = await runner.structured(
        { stage: 'extract', tier: 'cheap', effort: 'low', maxTokens: 6000, timeoutMs: this.cfg.timeoutsMs.chat },
        { system: SYSTEM_PROMPT, user: `${PARSE_INSTRUCTION}\n\n## پاسخ بیرونی\n${truncated ? text.slice(0, maxChars) : text}` }, PARSE_SCHEMA,
      );
      const items = (r.value as { items?: unknown })?.items;
      if (!Array.isArray(items)) throw new AiError('bad_output', { stage: 'extract', detail: 'missing items' });
      const kinds = ['decision', 'fact', 'constraint', 'asset', 'question', 'paragraph'];
      const blocks: ParsedBlock[] = [];
      for (const it of items as Array<Record<string, unknown>>) {
        const md = typeof it?.markdown === 'string' ? it.markdown.trim() : '';
        if (!md || !kinds.includes(it.kind as string)) continue;
        blocks.push({ id: `a${blocks.length + 1}`, kind: it.kind as ParsedBlock['kind'], title: typeof it.title === 'string' && it.title.trim() ? it.title.trim().slice(0, 100) : md.slice(0, 60), markdown: md, method: 'ai' });
      }
      if (!blocks.length) throw new AiError('bad_output', { stage: 'extract', detail: 'no usable blocks' });
      return { blocks, usage: usageSummary([r.usage], session.source === 'byok'), truncated };
    } finally { dl.done(); }
  }
}
