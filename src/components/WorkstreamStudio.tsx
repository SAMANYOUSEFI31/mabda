/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ContextChange,
  ContextDraft,
  ContextObject,
  TreeNode,
  DeliverableSpec,
  ExecutionMode,
  GeneratedDeliverable,
  Workspace,
  WorkstreamSpec,
} from '../types';
import type { AiErrorInfo, StageName, Tier, UsageSummary } from '../types';
import { LIBRARY } from '../core/specs';
import { resolveNodeId } from '../core/nodeTree';
import { calculateReadinessAndGaps, objectsToJudge } from '../core/contextEngine';
import type { AmbiguityMap } from '../core/contextEngine';
import { lockOf, lockReason, topologicalOrder } from '../core/specGraph';
import { halfPriceRebuildAvailable } from '../core/impactEngine';
import type { StaleAsset } from '../core/impactEngine';
import { calculateCreditCost, creditModeForPlan, estimateRemainingOutputs, PLANS, previewCredits, rebuildCredits } from '../core/creditEngine';
import { GapEnginePanel } from './GapEnginePanel';
import { ContextReplayCard } from './ContextReplayCard';
import { asAiError, generateDeliverableApi, previewPlan } from '../services/apiClient';
import type { PlanPreview } from '../services/apiClient';
import { useAiStatus } from '../services/aiStatus';
import { AiErrorNotice, PlanLine } from './AiNotices';
import { BlockView } from './BlockView';
import { contextDraftFromBlock } from '../core/blocks';
import { Alert, Badge, Button, Card, EmptyState, IconButton, List, ListItem, Menu, OptionCard, Progress, Select, Spinner, Switch, Tabs, TextField, formatNumber, useToast } from '../ui';

interface WorkstreamStudioProps {
  currentWorkspace: Workspace;
  allContextObjects: ContextObject[];
  allDeliverables: GeneratedDeliverable[];
  specs: WorkstreamSpec[];
  selectedSpecId?: string;
  onSelectSpecId?: (id: string) => void;
  /** opens the spec editor (new, or the given custom spec) */
  onOpenSpecEditor: (spec?: WorkstreamSpec) => void;
  /** Gap ambiguity verdicts from the decision layer, per object version */
  judgments: AmbiguityMap;
  onJudge: (objectIds: string[]) => Promise<void>;
  /** «ذخیره به‌عنوان قالب» for the user's own workstream */
  onSaveTemplate?: (spec: WorkstreamSpec) => void;
  /** assets that are stale because the Context they were built from changed */
  stale: StaleAsset[];
  /** the change log (what changed since an output was built) */
  changes?: ContextChange[];
  nodes: TreeNode[];
  onAddContextObject: (obj: ContextDraft) => void;
  onSaveDeliverable: (del: GeneratedDeliverable, creditCost: number, usage: UsageSummary, kind: 'new' | 'rebuild') => void;
  onOpenContextModal: (obj: ContextObject) => void;
  onOpenLedger: () => void;
  /** «کپی برای هوش مصنوعی»: a Context pack for this spec (and output) */
  onOpenPack: (target: { specId?: string; deliverableId?: string; title: string }) => void;
  onOpenImport: () => void;
  /** an asset the user asked to rebuild from the library: the studio runs it once on mount/arrival */
  pendingRebuild?: GeneratedDeliverable | null;
  onPendingRebuildHandled?: () => void;
}

export const WorkstreamStudio: React.FC<WorkstreamStudioProps> = ({
  currentWorkspace,
  allContextObjects,
  allDeliverables,
  specs,
  selectedSpecId: externalSelectedSpecId,
  onSelectSpecId: externalOnSelectSpecId,
  onOpenSpecEditor,
  judgments,
  onJudge,
  onSaveTemplate,
  stale,
  changes,
  nodes,
  onAddContextObject,
  onSaveDeliverable,
  onOpenContextModal,
  onOpenLedger,
  onOpenPack,
  onOpenImport,
  pendingRebuild,
  onPendingRebuildHandled,
}) => {
  const ai = useAiStatus();
  // credits exist only in the managed-AI layer (feature flag); with it off nothing about credits is shown or charged
  const managed = ai.managedEnabled;
  const [internalSelectedSpecId, setInternalSelectedSpecId] = useState<string>(
    specs[0]?.id || 'main_positioning'
  );

  const selectedSpecId = externalSelectedSpecId || internalSelectedSpecId;
  const setSelectedSpecId = (id: string) => {
    setInternalSelectedSpecId(id);
    if (externalOnSelectSpecId) externalOnSelectSpecId(id);
  };
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string>(
    specs[0]?.deliverables[0]?.id || 'del_positioning_statement'
  );
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto');
  const [manualModeOpen, setManualModeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const importantMode: ExecutionMode | null = PLANS[currentWorkspace.planId].allowedModes.includes('sensitive') ? 'sensitive' : PLANS[currentWorkspace.planId].allowedModes.includes('critique') ? 'critique' : null;
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageLabel, setStageLabel] = useState<string>('');
  const [genError, setGenError] = useState<AiErrorInfo | null>(null);
  const lastRun = useRef<{ rebuild: boolean; target?: GeneratedDeliverable } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [previewError, setPreviewError] = useState<AiErrorInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'gap_analysis' | 'history'>('create');
  const toast = useToast();

  const currentSpec =
    specs.find((s) => s.id === selectedSpecId) || specs[0];
  // execution order = dependency graph (dependencies first); a cyclic spec cannot be saved, the fallback is only defensive
  const orderedDeliverables = (() => { try { return topologicalOrder(currentSpec.deliverables); } catch { return [...currentSpec.deliverables].sort((a, b) => a.order - b.order); } })();
  const currentDeliverableSpec =
    orderedDeliverables.find((d) => d.id === selectedDeliverableId) ||
    orderedDeliverables[0];
  const isCustomSpec = !LIBRARY.some((s) => s.id === currentSpec.id);

  const readiness = calculateReadinessAndGaps(currentSpec, allContextObjects, [], judgments);

  // Gap ambiguity: ask the decision layer once per object version (cached on the server)
  const judgeRequested = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!ai.judgmentsAvailable || activeTab === 'create') return;
    const todo = objectsToJudge(currentSpec, allContextObjects).filter((o) => judgments[o.id]?.version !== o.version && !judgeRequested.current.has(`${o.id}@${o.version}`));
    if (!todo.length) return;
    todo.forEach((o) => judgeRequested.current.add(`${o.id}@${o.version}`));
    void onJudge(todo.map((o) => o.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.judgmentsAvailable, activeTab, currentSpec.id, allContextObjects, judgments]);
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;

  // The router's plan for the selected deliverable + mode. Credits are derived from it BEFORE the run,
  // and the same plan is sent back to the server so the charge equals the preview.
  const jobKind = currentDeliverableSpec.type === 'Asset' ? 'asset' : 'deliverable';
  useEffect(() => {
    if (!ai.available) { setPreview(null); setPreviewState('idle'); return; }
    const ctl = new AbortController();
    setPreviewState('loading');
    setPreviewError(null);
    const t = setTimeout(() => {
      previewPlan({ executionMode, jobKind, text: `${currentDeliverableSpec.title}\n${currentDeliverableSpec.acceptanceCriteria.join('\n')}`, workspaceId: currentWorkspace.id }, ctl.signal)
        .then((p) => { setPreview(p); setPreviewState('ready'); })
        .catch((e) => { if (ctl.signal.aborted) return; setPreview(null); setPreviewState('error'); setPreviewError(asAiError(e)); });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
    // contexts only matter for their size; re-plan when the deliverable, mode or availability changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.available, executionMode, currentDeliverableSpec.id, jobKind, currentWorkspace.id]);

  const costArgs = { deliverableType: currentDeliverableSpec.type, baseCreditCost: currentDeliverableSpec.baseCreditCost };
  const planCredits = preview ? previewCredits({ ...costArgs, plan: preview.plan }) : null;
  const creditCost = planCredits ?? calculateCreditCost({ ...costArgs, executionMode });
  const chargedPreview = creditCost;
  const planMode = preview ? creditModeForPlan(preview.plan) : executionMode;

  const remainingOutputsEstimate = estimateRemainingOutputs(currentWorkspace.creditsRemaining);

  const STAGE_FA: Record<StageName, string> = {
    decision: 'تعیین حالت اجرا', chat: 'نوشتن پاسخ', draft: 'نوشتن پیش‌نویس', critique: 'نقد پیش‌نویس',
    revise: 'اصلاح بر پایهٔ نقد', validate: 'اعتبارسنجی با معیارهای پذیرش', upgrade: 'ارتقا به مدل قوی‌تر و بازنویسی',
    extract: 'استخراج دانش', coach: 'مربی دانش',
  };
  const TIER_FA: Record<Tier, string> = { cheap: 'سبک', balanced: 'متعادل', frontier: 'پیشرو' };

  const findSpec = (workstreamId: string, deliverableId: string): { spec: WorkstreamSpec; del: DeliverableSpec } | undefined => {
    const spec = specs.find((x) => x.id === workstreamId) ?? specs.find((x) => x.deliverables.some((d) => d.id === deliverableId));
    const del = spec?.deliverables.find((d) => d.id === deliverableId);
    return spec && del ? { spec, del } : undefined;
  };

  const handleGenerate = async (isRebuild = false, rebuildTarget?: GeneratedDeliverable) => {
    // a rebuild always rebuilds the asset it was clicked on (its own spec + mode), not whatever is selected on screen
    const found = isRebuild && rebuildTarget ? findSpec(rebuildTarget.workstreamId, rebuildTarget.deliverableId) : undefined;
    if (isRebuild && !found) {
      toast.show({ intent: 'info', message: 'مشخصات این دارایی (جریان کار) پیدا نشد یا از گفتگو ساخته شده؛ بازسازی خودکار ندارد. دوباره بسازش.' });
      return;
    }
    const runSpec = found?.del ?? currentDeliverableSpec;
    const runWorkstream = found?.spec ?? currentSpec;
    const runLock = lockOf(runSpec, runWorkstream.deliverables, builtIds);
    if (runLock.locked) { toast.show({ intent: 'warning', message: lockReason(runLock) }); return; }
    // the finished assets this output depends on (their text is read by the server from the database)
    const dependencyAssetIds = (runSpec.dependsOn ?? []).map((dep) => workstreamDeliverables.find((d) => d.deliverableId === dep)?.id).filter((x): x is string => !!x);
    const runMode: ExecutionMode = isRebuild && rebuildTarget ? rebuildTarget.executionMode : executionMode;
    const staleOfTarget = rebuildTarget ? stale.find((s) => s.deliverableId === rebuildTarget.id) : undefined;
    // half price only for an asset made stale by a Context change, once per change
    const halfPrice = managed && !!(isRebuild && rebuildTarget && halfPriceRebuildAvailable(rebuildTarget, staleOfTarget));

    lastRun.current = { rebuild: isRebuild, target: rebuildTarget };
    setGenError(null);
    setIsGenerating(true);
    setStageLabel('در حال آماده‌سازی…');
    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      // the plan shown to the user is the plan that runs; for a rebuild it is previewed for that asset first
      let runPreview = preview;
      if (isRebuild && rebuildTarget) {
        runPreview = await previewPlan({ executionMode: runMode, jobKind: runSpec.type === 'Asset' ? 'asset' : 'deliverable', text: `${runSpec.title}\n${runSpec.acceptanceCriteria.join('\n')}`, workspaceId: currentWorkspace.id }, ctl.signal);
      }
      const base = runPreview ? previewCredits({ deliverableType: runSpec.type, baseCreditCost: runSpec.baseCreditCost, plan: runPreview.plan }) : calculateCreditCost({ deliverableType: runSpec.type, baseCreditCost: runSpec.baseCreditCost, executionMode: runMode });
      const cost = halfPrice ? rebuildCredits(base) : base;
      if (managed && currentWorkspace.creditsRemaining < cost) {
        toast.show({ intent: 'warning', message: 'اعتبار ناکافی است. می‌توانی از بخش دفتر کل بستهٔ اعتباری تهیه کنی.' });
        onOpenLedger();
        return;
      }
      setStageLabel('در حال آماده‌سازی…');

      const result = await generateDeliverableApi(
        {
          deliverableId: runSpec.id,
          deliverableTitle: runSpec.title,
          deliverableType: runSpec.type,
          acceptanceCriteria: runSpec.acceptanceCriteria,
          workspaceId: currentWorkspace.id,
          targetNodeId: '*', // the whole workspace: the tree is the user's, no node is special
          specTarget: runWorkstream.target,
          specGuardrails: runWorkstream.guardrails,
          outputBand: runSpec.outputBand,
          dependencyAssetIds,
          executionMode: runMode,
          preview: runPreview ?? undefined,
        },
        { onStage: (stage, tier) => setStageLabel(`${STAGE_FA[stage]} (مدل ${TIER_FA[tier]})`) },
        ctl.signal,
      );

      const newDeliverable: GeneratedDeliverable = {
        id: isRebuild && rebuildTarget ? rebuildTarget.id : `del_run_${Date.now()}`,
        workspaceId: currentWorkspace.id,
        workstreamId: isRebuild && rebuildTarget ? rebuildTarget.workstreamId : currentSpec.id,
        deliverableId: runSpec.id,
        title: runSpec.title,
        content: result.markdown,
        blocks: result.blocks,
        plan: result.plan,
        usage: result.usage,
        validationFailed: result.validationFailed,
        executionMode: runMode,
        creditCost: managed ? cost : 0,
        usedContext: result.usedContext,
        usedFileChunks: result.usedFileChunks,
        checks: result.checks,
        critiqueFeedback: result.critiqueFeedback,
        rebuildCount: isRebuild && rebuildTarget ? rebuildTarget.rebuildCount + 1 : 0,
        halfPriceUsedFor: halfPrice ? staleOfTarget?.signature : rebuildTarget?.halfPriceUsedFor,
        createdAt: new Date().toISOString(),
      };

      onSaveDeliverable(newDeliverable, newDeliverable.creditCost, result.usage, isRebuild ? 'rebuild' : 'new');
      setActiveTab('history');
    } catch (err) {
      const info = asAiError(err);
      if (!(info.kind === 'aborted' && ctl.signal.aborted)) setGenError(info);
    } finally {
      setIsGenerating(false);
      setStageLabel('');
      if (abortRef.current === ctl) abortRef.current = null;
    }
  };

  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingRebuild) { handled.current = null; return; }
    if (handled.current === pendingRebuild.id || isGenerating) return;
    handled.current = pendingRebuild.id;
    setActiveTab('history');
    onPendingRebuildHandled?.();
    void handleGenerate(true, pendingRebuild);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRebuild]);

  // Filter deliverables generated for this workstream
  const workstreamDeliverables = allDeliverables.filter(
    (d) => d.workstreamId === currentSpec.id && d.workspaceId === currentWorkspace.id
  );

  const builtIds = new Set(workstreamDeliverables.map((d) => d.deliverableId));
  const lock = lockOf(currentDeliverableSpec, currentSpec.deliverables, builtIds);
  // what is missing, required first: at most THREE questions are asked here; the rest wait in «چه چیزی کم است»
  const todo = [...readiness.gaps].filter((g) => g.status !== 'confirmed').sort((a, b) => (a.importance === 'required' ? 0 : 1) - (b.importance === 'required' ? 0 : 1)).slice(0, 3);
  const answerGap = (gap: (typeof readiness.gaps)[number]) => {
    const text = (answers[gap.key] ?? '').trim();
    if (!text) return;
    onAddContextObject({ workspaceId: currentWorkspace.id, type: gap.importance === 'required' ? 'Decision' : 'Fact', status: 'Confirmed', provenance: 'User Input', title: gap.label, content: text, nodeId: resolveNodeId(nodes, gap.nodeId), slotKey: gap.key });
    setAnswers((m) => { const n = { ...m }; delete n[gap.key]; return n; });
  };
  const modeCost = (m: ExecutionMode) =>
    calculateCreditCost({
      deliverableType: currentDeliverableSpec.type,
      executionMode: m,
      baseCreditCost: currentDeliverableSpec.baseCreditCost,
    });

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* which workflow — the library, the editor and the template live under «⋯» */}
      <Card padding="lg" className="flex flex-col gap-inline-sm sm:flex-row sm:items-end">
        <div className="min-w-overlay-xs sm:flex-1">
          <Select
            label="جریان کار فعال"
            value={selectedSpecId}
            onChange={(e) => {
              const id = e.target.value;
              const sp = specs.find((x) => x.id === id);
              setSelectedSpecId(id);
              if (sp?.deliverables.length) { try { setSelectedDeliverableId(topologicalOrder(sp.deliverables)[0].id); } catch { setSelectedDeliverableId(sp.deliverables[0].id); } }
            }}
            options={specs.map((sp) => ({ value: sp.id, label: sp.title }))}
          />
        </div>
        <Menu
          label="بیشتر دربارهٔ جریان کار"
          align="end"
          trigger={<IconButton icon="Ellipsis" label="بیشتر دربارهٔ جریان کار" variant="secondary" />}
          items={[
            { label: 'تعریف جریان کار سفارشی', icon: 'Plus', onSelect: () => onOpenSpecEditor() },
            ...(isCustomSpec ? [{ label: 'ویرایش این جریان کار', icon: 'Pencil' as const, onSelect: () => onOpenSpecEditor(currentSpec) }] : []),
            ...(isCustomSpec && onSaveTemplate ? [{ label: 'ذخیره به‌عنوان قالب', icon: 'Package' as const, onSelect: () => onSaveTemplate(currentSpec) }] : []),
            { divider: true },
            { label: 'کپی جریان کار برای AI', icon: 'Copy', onSelect: () => onOpenPack({ specId: currentSpec.id, title: currentSpec.title }) },
          ]}
        />
      </Card>

      <Tabs
        label="بخش‌های استودیو"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        items={[
          { id: 'create', label: 'تولید' },
          { id: 'gap_analysis', label: readiness.gaps.length > 0 ? `چه چیزی کم است (${formatNumber(readiness.gaps.length)})` : 'چه چیزی کم است' },
          { id: 'history', label: `خروجی‌ها (${formatNumber(workstreamDeliverables.length)})` },
        ]}
      />

      {/* TAB 1: create — three steps: pick an output ← one sentence about readiness (+ at most three questions, answered here) ← «ساخت» */}
      {activeTab === 'create' && (
        <div className="flex flex-col gap-stack-md">
          <div className="grid grid-cols-1 gap-inline-xl lg:grid-cols-3">
            {/* step 1: which output */}
            <div className="flex flex-col gap-stack-sm lg:col-span-1">
              <h3 className="title text-text-default">کدام خروجی؟</h3>
              <List label="خروجی‌های این جریان کار">
                {orderedDeliverables.map((del, idx) => {
                  const dl = lockOf(del, currentSpec.deliverables, builtIds);
                  return (
                    <ListItem
                      key={del.id}
                      selected={selectedDeliverableId === del.id}
                      onClick={() => setSelectedDeliverableId(del.id)}
                      leading={<span className="label-sm tabular-nums">{formatNumber(idx + 1)}</span>}
                      title={
                        <span className="flex flex-wrap items-center gap-inline-sm">
                          {del.title}
                          {builtIds.has(del.id) && <Badge intent="success">تولیدشده</Badge>}
                          {dl.locked && <Badge intent="neutral" icon="Lock">قفل</Badge>}
                        </span>
                      }
                      description={dl.locked ? lockReason(dl) : del.description}
                    />
                  );
                })}
              </List>
            </div>

            <Card padding="xl" className="flex flex-col gap-stack-lg lg:col-span-2">
              <div className="flex items-start justify-between gap-inline-sm">
                <div className="flex min-w-space-0 flex-col gap-stack-xs">
                  <h3 className="heading-xs text-text-default">{currentDeliverableSpec.title}</h3>
                  <p className="body-sm text-text-subtle">{currentDeliverableSpec.description}</p>
                </div>
                <Menu
                  label="بیشتر دربارهٔ این خروجی"
                  align="end"
                  trigger={<IconButton icon="Ellipsis" label="بیشتر دربارهٔ این خروجی" size="sm" />}
                  items={[
                    { label: 'کپی برای هوش مصنوعی', icon: 'Copy', onSelect: () => onOpenPack({ specId: currentSpec.id, deliverableId: currentDeliverableSpec.id, title: currentDeliverableSpec.title }) },
                    { label: 'وارد کردن پاسخ AI', icon: 'Upload', onSelect: onOpenImport },
                    { label: moreOpen ? 'بستن جزئیات اجرا' : 'جزئیات اجرا (حالت، معیارها)', icon: 'Settings', onSelect: () => setMoreOpen((v) => !v) },
                  ]}
                />
              </div>

              {lock.locked && <Alert intent="warning" title="این خروجی هنوز قفل است">{lockReason(lock)}</Alert>}

              {/* step 2: one sentence about readiness, then at most three questions, answered right here */}
              <div className="flex flex-col gap-stack-sm" data-testid="readiness-line">
                <p className="body-md text-text-default">
                  {todo.length === 0
                    ? 'همه‌چیز لازم را داریم؛ آمادهٔ ساخت است.'
                    : `برای ساخت بهتر ${formatNumber(todo.length)} چیز کم است${readiness.gaps.length > todo.length ? ` (${formatNumber(readiness.gaps.length - todo.length)} مورد دیگر در «چه چیزی کم است»)` : ''}؛ می‌توانی همین‌جا جواب بدهی یا بدون آن‌ها بسازی.`}
                </p>
                {todo.map((g) => (
                  <div key={g.key} className="flex flex-col gap-stack-xs sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <TextField label={g.question} value={answers[g.key] ?? ''} onChange={(e) => setAnswers((m) => ({ ...m, [g.key]: e.target.value }))} />
                    </div>
                    <Button size="sm" variant="secondary" disabled={!(answers[g.key] ?? '').trim()} onClick={() => answerGap(g)}>ثبت</Button>
                  </div>
                ))}
              </div>

              {moreOpen && (
                <div className="flex flex-col gap-stack-md rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg" id="run-details">
                  <div className="flex flex-col gap-stack-sm">
                    <span className="label-md text-text-default">معیار پذیرش خروجی</span>
                    <ul className="body-sm list-inside list-disc text-text-subtle">
                      {currentDeliverableSpec.acceptanceCriteria.map((c, idx) => (<li key={idx}>{c}</li>))}
                    </ul>
                    {(currentSpec.guardrails?.length ?? 0) > 0 && (
                      <>
                        <span className="label-md mt-stack-sm text-text-default">خط قرمزهای این جریان کار</span>
                        <ul className="body-sm list-inside list-disc text-text-subtle">{currentSpec.guardrails!.map((g, idx) => <li key={idx}>{g}</li>)}</ul>
                      </>
                    )}
                    <span className="body-sm text-text-subtle">خط قرمزهای تأییدشدهٔ فضای کار هم خودکار به‌عنوان خط قرمز بررسی می‌شوند.</span>
                  </div>
                  <div className="flex flex-col gap-stack-sm" role="group" aria-label="نحوهٔ اجرا">
                    <Switch
                      checked={executionMode === 'sensitive' || executionMode === 'critique'}
                      disabled={!importantMode}
                      onChange={(e) => setExecutionMode(e.target.checked && importantMode ? importantMode : 'auto')}
                      label="این خروجی مهم است (بررسی دقیق‌تر)"
                    />
                    {!importantMode && <span className="body-sm text-text-subtle">بررسی دقیق‌تر در پلن فعلی فعال نیست.</span>}
                    <div className="flex flex-wrap items-center gap-inline-sm">
                      <Button variant="ghost" size="sm" iconEnd={manualModeOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={manualModeOpen} onClick={() => setManualModeOpen((v) => !v)}>تغییر دستی</Button>
                      {executionMode !== 'auto' && executionMode !== 'sensitive' && (
                        <Button variant="ghost" size="sm" iconStart="Undo2" onClick={() => setExecutionMode('auto')}>برگرد به خودکار</Button>
                      )}
                    </div>
                    {manualModeOpen && (
                      <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-2">
                        <OptionCard title="سریع" description="تک‌مرحله‌ای، ارزان‌تر" meta={managed ? `${formatNumber(modeCost('fast'))} اعتبار` : undefined} selected={executionMode === 'fast'} onClick={() => setExecutionMode('fast')} />
                        <OptionCard title="خودکار" description="پیشنهاد مبدأ" meta={managed ? `${formatNumber(modeCost('auto'))} اعتبار` : undefined} selected={executionMode === 'auto'} onClick={() => setExecutionMode('auto')} />
                        <OptionCard title="عمیق" description="پیش‌نویس، نقد و اصلاح" meta={managed ? `${formatNumber(modeCost('critique'))} اعتبار` : undefined} selected={executionMode === 'critique'} disabled={!PLANS[currentWorkspace.planId].allowedModes.includes('critique')} onClick={() => setExecutionMode('critique')} />
                        <OptionCard title="حساس" description="بررسی دقیق + شکاف + تناقض" meta={managed ? `${formatNumber(modeCost('sensitive'))} اعتبار` : undefined} selected={executionMode === 'sensitive'} disabled={!PLANS[currentWorkspace.planId].allowedModes.includes('sensitive')} onClick={() => setExecutionMode('sensitive')} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* step 3: build. The reason for «auto» is ONE plain line */}
              {previewState === 'error' && previewError && <AiErrorNotice error={previewError} />}
              <div className="flex flex-col justify-between gap-inline-md border-t border-border-subtle pt-inset-lg sm:flex-row sm:items-center">
                <div className="body-sm flex flex-col gap-stack-xs">
                  {previewState === 'loading' ? (
                    <span className="inline-flex items-center gap-inline-xs text-text-subtle"><Spinner size="sm" label="در حال تعیین حالت" />در حال تعیین حالت اجرا…</span>
                  ) : managed ? (
                    <span className="label-md tabular-nums text-text-default">{`${formatNumber(chargedPreview)} اعتبار`}</span>
                  ) : null}
                  {preview && previewState === 'ready' && (
                    <span className="body-sm text-text-subtle" data-testid="auto-reason">
                      {executionMode === 'auto' ? 'مبدأ خودش انتخاب کرد: ' : 'حالت انتخابی: '}{preview.plan.reason}
                      {managed && planMode !== executionMode && ` (قیمت‌گذاری در سطح «${planMode === 'critique' ? 'عمیق' : planMode === 'fast' ? 'سریع' : planMode === 'sensitive' ? 'حساس' : 'متعادل'}»)`}
                    </span>
                  )}
                  {!ai.available && previewState === 'idle' && <span className="body-sm text-text-subtle">هوش مصنوعی فعلاً در دسترس نیست؛ بعداً دوباره تلاش کن.</span>}
                  {managed && <span className="body-sm text-text-subtle">موجودی فعلی: {formatNumber(currentWorkspace.creditsRemaining)} اعتبار · حدود {formatNumber(remainingOutputsEstimate)} خروجی کامل دیگر</span>}
                </div>
                {isGenerating ? (
                  <Button variant="secondary" size="lg" iconStart="X" onClick={() => abortRef.current?.abort()}>توقف</Button>
                ) : (
                  <Button variant="primary" size="lg" iconStart="Sparkles" disabled={previewState !== 'ready' || lock.locked} onClick={() => handleGenerate(false)}>
                    ساخت دارایی
                  </Button>
                )}
              </div>

              {isGenerating && (
                <Alert intent="info" title={stageLabel || 'در حال ساخت دارایی…'}>
                  <div className="flex items-center gap-inline-sm pt-inset-xs">
                    <Spinner size="sm" label="در حال ساخت" />
                    <Progress indeterminate label="پیشرفت ساخت" intent="neutral" />
                  </div>
                </Alert>
              )}

              {genError && !isGenerating && (
                <AiErrorNotice
                  error={genError}
                  onRetry={() => { const r = lastRun.current; void handleGenerate(r?.rebuild ?? false, r?.target); }}
                />
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: gap radar & panel */}
      {activeTab === 'gap_analysis' && (
        <div className="flex flex-col gap-stack-lg">
          <GapEnginePanel
            nodes={nodes}
            spec={currentSpec}
            readiness={readiness}
            onAnswerGap={(gap, answer) => {
              const newObj: ContextDraft = {
                workspaceId: currentWorkspace.id,
                type: gap.importance === 'required' ? 'Decision' : 'Fact',
                status: 'Confirmed',
                provenance: 'User Input',
                title: gap.label,
                content: answer,
                nodeId: resolveNodeId(nodes, gap.nodeId), // the spec's node is only a hint: when that node is gone the answer goes to the default place
                slotKey: gap.key,
              };
              onAddContextObject(newObj);
            }}
            onIgnoreGap={(gap) => {
              toast.show({ intent: 'info', message: `شکاف «${gap.label}» نادیده گرفته شد و مانع ادامهٔ روند نخواهد شد.` });
            }}
            onProceedAnyway={() => setActiveTab('create')}
          />
        </div>
      )}

      {/* TAB 3: history & context replay */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-stack-lg">
          <div className="flex items-center justify-between gap-inline-md border-b border-border-default pb-inset-md">
            <h3 className="title text-text-default">دارایی‌های تولیدشده در این جریان کار ({formatNumber(workstreamDeliverables.length)})</h3>
            <Button variant="secondary" size="sm" iconStart="Plus" onClick={() => setActiveTab('create')}>تولید مورد جدید</Button>
          </div>

          {genError && !isGenerating && activeTab === 'history' && (
            <AiErrorNotice error={genError} onRetry={() => { const r = lastRun.current; void handleGenerate(r?.rebuild ?? false, r?.target); }} />
          )}
          {isGenerating && <Alert intent="info" title={stageLabel || 'در حال ساخت دارایی…'}><Progress indeterminate label="پیشرفت ساخت" intent="neutral" /></Alert>}

          {workstreamDeliverables.length === 0 ? (
            <EmptyState
              icon="Package"
              title="هنوز خروجی‌ای برای این جریان کار تولید نشده"
              action={<Button variant="primary" onClick={() => setActiveTab('create')}>تولید اولین دارایی</Button>}
            />
          ) : (
            <div className="flex flex-col gap-stack-lg">
              {workstreamDeliverables.map((del) => (
                <ContextReplayCard
                  key={del.id}
                  deliverable={del}
                  allContextObjects={allContextObjects}
                  stale={stale.find((x) => x.deliverableId === del.id)}
                  changes={changes}
                  onOpenContextObject={onOpenContextModal}
                  onRebuild={(target) => handleGenerate(true, target)}
                  isRebuilding={isGenerating}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
