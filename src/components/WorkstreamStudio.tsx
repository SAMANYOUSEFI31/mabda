/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
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
import { WORKSTREAM_SPECS } from '../core/specs';
import { calculateReadinessAndGaps, objectsToJudge } from '../core/contextEngine';
import type { AmbiguityMap } from '../core/contextEngine';
import { lockOf, lockReason, topologicalOrder } from '../core/specGraph';
import { halfPriceRebuildAvailable } from '../core/impactEngine';
import type { StaleAsset } from '../core/impactEngine';
import { calculateCreditCost, creditModeForPlan, effectiveCredits, estimateRemainingOutputs, PLANS, previewCredits, rebuildCredits } from '../core/creditEngine';
import { GapEnginePanel } from './GapEnginePanel';
import { ContextReplayCard } from './ContextReplayCard';
import { asAiError, generateDeliverableApi, previewPlan } from '../services/apiClient';
import type { PlanPreview } from '../services/apiClient';
import { useAiStatus } from '../services/aiStatus';
import { AiErrorNotice, PlanLine } from './AiNotices';
import { BlockView } from './BlockView';
import { contextDraftFromBlock } from '../core/blocks';
import { KnowledgeGapChart } from './KnowledgeGapChart';
import { Alert, Badge, Button, Card, EmptyState, List, ListItem, OptionCard, Progress, Select, Spinner, Tabs, formatNumber, useToast } from '../ui';

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
  /** assets that are stale because the Context they were built from changed */
  stale: StaleAsset[];
  nodes: TreeNode[];
  onAddContextObject: (obj: ContextDraft) => void;
  onSaveDeliverable: (del: GeneratedDeliverable, creditCost: number, usage: UsageSummary, kind: 'new' | 'rebuild') => void;
  onOpenAiSettings: () => void;
  onOpenContextModal: (obj: ContextObject) => void;
  onOpenLedger: () => void;
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
  stale,
  nodes,
  onAddContextObject,
  onSaveDeliverable,
  onOpenContextModal,
  onOpenLedger,
  onOpenAiSettings,
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
    specs.find((s) => s.id === selectedSpecId) || specs[0] || WORKSTREAM_SPECS[0];
  // execution order = dependency graph (dependencies first); a cyclic spec cannot be saved, the fallback is only defensive
  const orderedDeliverables = (() => { try { return topologicalOrder(currentSpec.deliverables); } catch { return [...currentSpec.deliverables].sort((a, b) => a.order - b.order); } })();
  const currentDeliverableSpec =
    orderedDeliverables.find((d) => d.id === selectedDeliverableId) ||
    orderedDeliverables[0];
  const isCustomSpec = !WORKSTREAM_SPECS.some((s) => s.id === currentSpec.id);

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
  const chargedPreview = effectiveCredits(creditCost, ai.byok);
  const planMode = preview ? creditModeForPlan(preview.plan) : executionMode;

  const remainingOutputsEstimate = estimateRemainingOutputs(currentWorkspace.creditsRemaining);

  const STAGE_FA: Record<StageName, string> = {
    decision: 'تعیین حالت اجرا', chat: 'نوشتن پاسخ', draft: 'نوشتن پیش‌نویس', critique: 'نقد پیش‌نویس',
    revise: 'اصلاح بر پایهٔ نقد', validate: 'اعتبارسنجی با معیارهای پذیرش', upgrade: 'ارتقا به مدل قوی‌تر و بازنویسی',
    extract: 'استخراج دانش', coach: 'Context Coach',
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
      if (managed && !ai.byok && currentWorkspace.creditsRemaining < cost) {
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
          targetNodeId: 'content',
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
        creditCost: managed ? effectiveCredits(cost, result.usage.byok) : 0,
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
  const requiredMissing = readiness.gaps.filter((g) => g.importance === 'required' && g.status === 'missing').length;
  const modeCost = (m: ExecutionMode) =>
    calculateCreditCost({
      deliverableType: currentDeliverableSpec.type,
      executionMode: m,
      baseCreditCost: currentDeliverableSpec.baseCreditCost,
    });

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* Spec selector + readiness summary */}
      <Card padding="lg" className="flex flex-col justify-between gap-inline-lg md:flex-row md:items-end">
        <div className="flex min-w-space-0 flex-1 flex-col gap-stack-sm">
          <div className="flex flex-col gap-inline-sm sm:flex-row sm:items-end">
            <div className="min-w-overlay-xs sm:flex-1">
              <Select
                label="جریان کار فعال (Workstream Spec)"
                value={selectedSpecId}
                onChange={(e) => {
                  const id = e.target.value;
                  const s = specs.find((x) => x.id === id);
                  setSelectedSpecId(id);
                  if (s?.deliverables.length) { try { setSelectedDeliverableId(topologicalOrder(s.deliverables)[0].id); } catch { setSelectedDeliverableId(s.deliverables[0].id); } }
                }}
                options={specs.map((s) => ({ value: s.id, label: s.title }))}
              />
            </div>
            <Button variant="secondary" iconStart="Plus" onClick={() => onOpenSpecEditor()}>
              تعریف جریان کار سفارشی
            </Button>
            {isCustomSpec && <Button variant="secondary" iconStart="Pencil" onClick={() => onOpenSpecEditor(currentSpec)}>ویرایش</Button>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-inline-sm rounded-control border border-border-default bg-surface-sunken px-inset-lg py-inset-sm">
          <span className="body-sm text-text-subtle">وضعیت Gap Engine:</span>
          <span className="label-md tabular-nums text-text-default">{formatNumber(readiness.score)}٪ آماده</span>
          <Button size="sm" variant="ghost" iconEnd="ArrowLeft" onClick={() => setActiveTab('gap_analysis')}>بررسی شکاف‌ها</Button>
        </div>
      </Card>

      <Tabs
        label="بخش‌های استودیو"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        items={[
          { id: 'create', label: 'تولید' },
          { id: 'gap_analysis', label: readiness.gaps.length > 0 ? `شکاف‌ها (${formatNumber(readiness.gaps.length)})` : 'شکاف‌ها' },
          { id: 'history', label: `خروجی‌ها (${formatNumber(workstreamDeliverables.length)})` },
        ]}
      />

      {/* TAB 1: create */}
      {activeTab === 'create' && (
        <div className="flex flex-col gap-stack-md">
          <Alert
            intent={requiredMissing === 0 ? 'success' : 'warning'}
            title={`وضعیت آمادگی منبع حقیقت: ${readiness.status === 'ready' ? 'تأییدشده' : 'نیازمند تکمیل مدارک'} (${formatNumber(readiness.score)}٪)`}
            action={<Button variant="secondary" size="sm" iconEnd="ArrowLeft" onClick={() => setActiveTab('gap_analysis')}>مشاهدهٔ رادار و برطرف‌سازی شکاف‌ها</Button>}
          >
            {requiredMissing === 0
              ? 'تمامی پیش‌نیازهای الزامی در درخت حقیقت موجود است. خروجی با حداکثر دقت تولید می‌شود.'
              : `${formatNumber(requiredMissing)} شکاف بحرانی در دانش کسب‌وکار شناسایی شد.`}
          </Alert>

          <div className="grid grid-cols-1 gap-inline-xl lg:grid-cols-3">
            {/* Deliverables list */}
            <div className="flex flex-col gap-stack-sm lg:col-span-1">
              <h3 className="title text-text-default">خروجی‌ها به ترتیب ارزش (Spec Sequence)</h3>
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

            {/* Execution */}
            <Card padding="xl" className="flex flex-col gap-stack-lg lg:col-span-2">
              <div className="flex flex-col gap-stack-xs">
                <span className="label-md text-text-subtle">
                  خروجی انتخابی (گام {formatNumber(orderedDeliverables.indexOf(currentDeliverableSpec) + 1)} از {formatNumber(orderedDeliverables.length)})
                </span>
                <h3 className="heading-xs text-text-default">{currentDeliverableSpec.title}</h3>
                <p className="body-sm text-text-default">{currentDeliverableSpec.description}</p>
              </div>

              {lock.locked && <Alert intent="warning" title="این خروجی هنوز قفل است">{lockReason(lock)}</Alert>}

              <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
                <span className="label-md text-text-default">معیار پذیرش خروجی (Acceptance Checklist)</span>
                <ul className="body-sm list-inside list-disc text-text-subtle">
                  {currentDeliverableSpec.acceptanceCriteria.map((c, idx) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
                {(currentSpec.guardrails?.length ?? 0) > 0 && (
                  <>
                    <span className="label-md mt-stack-sm text-text-default">گاردریل‌های این جریان کار</span>
                    <ul className="body-sm list-inside list-disc text-text-subtle">{currentSpec.guardrails!.map((g, idx) => <li key={idx}>{g}</li>)}</ul>
                  </>
                )}
                <span className="caption text-text-subtle">Constraintهای تأییدشدهٔ فضای کار هم خودکار به‌عنوان گاردریل بررسی می‌شوند.</span>
              </div>

              <div className="flex flex-col gap-stack-sm" role="group" aria-label="سطح اجرا و عمق کار">
                <div className="flex flex-col justify-between gap-inline-xs sm:flex-row sm:items-center">
                  <span className="label-md text-text-default">انتخاب سطح اجرا و عمق کار</span>
                  <span className="caption text-text-subtle">اصل P1: کاربر «چه» را تعیین می‌کند، مبدأ «چطور» را.</span>
                </div>
                <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-2">
                  <OptionCard
                    title="سریع"
                    description="تک‌مرحله‌ای"
                    meta={managed ? `${formatNumber(modeCost('fast'))} اعتبار` : undefined}
                    selected={executionMode === 'fast'}
                    onClick={() => setExecutionMode('fast')}
                  />
                  <OptionCard
                    title="متعادل (Auto)"
                    badge={<Badge intent="success" icon={false}>۱۰٪ تخفیف</Badge>}
                    description="پیش‌فرض بهینه"
                    meta={managed ? `${formatNumber(modeCost('auto'))} اعتبار` : undefined}
                    selected={executionMode === 'auto'}
                    onClick={() => setExecutionMode('auto')}
                  />
                  <OptionCard
                    title="عمیق (Critique)"
                    description="پیش‌نویس + نقد + اصلاح"
                    meta={managed ? `${formatNumber(modeCost('critique'))} اعتبار` : undefined}
                    selected={executionMode === 'critique'}
                    disabled={!plan.allowedModes.includes('critique')}
                    onClick={() => setExecutionMode('critique')}
                  />
                  <OptionCard
                    title="حالت حساس"
                    badge={<Badge intent="neutral" icon={false}>Max</Badge>}
                    description="نقد + Gap + تناقض"
                    meta={managed ? `${formatNumber(modeCost('sensitive'))} اعتبار` : undefined}
                    selected={executionMode === 'sensitive'}
                    disabled={!plan.allowedModes.includes('sensitive')}
                    onClick={() => setExecutionMode('sensitive')}
                  />
                </div>
              </div>

              {/* Pre-execution credit indicator (P2): derived from the router's plan, the same plan is executed */}
              {!ai.available && (
                <Alert intent="warning" title="هوش مصنوعی راه‌اندازی نشده" action={<Button size="sm" variant="secondary" iconStart="Settings" onClick={onOpenAiSettings}>تنظیم کلید API</Button>}>
                  برای ساخت دارایی، کلید API لازم است.
                </Alert>
              )}
              {previewState === 'error' && previewError && <AiErrorNotice error={previewError} onOpenSettings={onOpenAiSettings} />}
              <div className="flex flex-col justify-between gap-inline-md rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg sm:flex-row sm:items-center">
                <div className="body-sm flex flex-col gap-stack-xs">
                  <div>
                    <span className="text-text-subtle">{managed ? 'هزینهٔ این اجرا: ' : 'حالت اجرا: '}</span>
                    {previewState === 'loading' ? (
                      <span className="inline-flex items-center gap-inline-xs text-text-subtle"><Spinner size="sm" label="در حال تعیین حالت" />در حال تعیین حالت اجرا…</span>
                    ) : (
                      <span className="label-md tabular-nums text-text-default">
                        {!managed ? (preview ? 'آمادهٔ اجرا' : '—') : ai.byok ? 'بدون کسر اعتبار (کلید شخصی)' : `${formatNumber(chargedPreview)} اعتبار`}
                      </span>
                    )}
                  </div>
                  {preview && previewState === 'ready' && (
                    <>
                      <span className="caption text-text-subtle">
                        {preview.plan.reason}
                        {managed && planMode !== executionMode && ` (قیمت‌گذاری در سطح «${planMode === 'critique' ? 'عمیق' : planMode === 'fast' ? 'سریع' : planMode === 'sensitive' ? 'حساس' : 'متعادل'}»)`}
                      </span>
                      {ai.byok && <span className="caption text-text-subtle">{managed ? 'با کلید شخصی هزینه در دفتر کل ثبت می‌شود ولی اعتبار کم نمی‌شود.' : 'هزینهٔ توکن روی کلید خودت است و در دفتر کل ثبت می‌شود.'}</span>}
                    </>
                  )}
                  {managed && <span className="caption text-text-subtle">
                    موجودی فعلی: {formatNumber(currentWorkspace.creditsRemaining)} اعتبار · حدود {formatNumber(remainingOutputsEstimate)} خروجی کامل دیگر
                  </span>}
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
                  onOpenSettings={onOpenAiSettings}
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
          <KnowledgeGapChart
            currentSpec={currentSpec}
            allContextObjects={allContextObjects}
            readiness={readiness}
            onOpenContextModalForNode={(nodeId) => {
              onOpenContextModal({
                id: '',
                workspaceId: currentWorkspace.id,
                type: 'Fact',
                status: 'Confirmed',
                provenance: 'User Input',
                title: '',
                content: '',
                nodeId,
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }}
          />

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
                nodeId: gap.nodeId,
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
            <AiErrorNotice error={genError} onOpenSettings={onOpenAiSettings} onRetry={() => { const r = lastRun.current; void handleGenerate(r?.rebuild ?? false, r?.target); }} />
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
