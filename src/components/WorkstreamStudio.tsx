/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ContextObject,
  DeliverableSpec,
  ExecutionMode,
  GeneratedDeliverable,
  Workspace,
  WorkstreamSpec,
} from '../types';
import { WORKSTREAM_SPECS } from '../core/specs';
import { calculateReadinessAndGaps, resolveActiveContextsForNode } from '../core/contextEngine';
import { calculateCreditCost, estimateRemainingOutputs, PLANS } from '../core/creditEngine';
import { GapEnginePanel } from './GapEnginePanel';
import { ContextReplayCard } from './ContextReplayCard';
import { generateDeliverableApi } from '../services/apiClient';
import { CustomSpecModal } from './CustomSpecModal';
import { KnowledgeGapChart } from './KnowledgeGapChart';

interface WorkstreamStudioProps {
  currentWorkspace: Workspace;
  allContextObjects: ContextObject[];
  allDeliverables: GeneratedDeliverable[];
  specs: WorkstreamSpec[];
  selectedSpecId?: string;
  onSelectSpecId?: (id: string) => void;
  onAddCustomSpec: (spec: WorkstreamSpec) => void;
  onAddContextObject: (obj: ContextObject) => void;
  onSaveDeliverable: (del: GeneratedDeliverable, creditCost: number) => void;
  onOpenContextModal: (obj: ContextObject) => void;
  onOpenLedger: () => void;
}

export const WorkstreamStudio: React.FC<WorkstreamStudioProps> = ({
  currentWorkspace,
  allContextObjects,
  allDeliverables,
  specs,
  selectedSpecId: externalSelectedSpecId,
  onSelectSpecId: externalOnSelectSpecId,
  onAddCustomSpec,
  onAddContextObject,
  onSaveDeliverable,
  onOpenContextModal,
  onOpenLedger,
}) => {
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
  const [generationPhase, setGenerationPhase] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'create' | 'gap_analysis' | 'history'>('create');
  const [isCustomSpecModalOpen, setIsCustomSpecModalOpen] = useState(false);

  const currentSpec =
    specs.find((s) => s.id === selectedSpecId) || specs[0] || WORKSTREAM_SPECS[0];
  const currentDeliverableSpec =
    currentSpec.deliverables.find((d) => d.id === selectedDeliverableId) ||
    currentSpec.deliverables[0];

  const readiness = calculateReadinessAndGaps(currentSpec, allContextObjects);
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;

  // Credit calculation
  const creditCost = calculateCreditCost({
    deliverableType: currentDeliverableSpec.type,
    executionMode,
    baseCreditCost: currentDeliverableSpec.baseCreditCost,
  });

  const remainingOutputsEstimate = estimateRemainingOutputs(currentWorkspace.creditsRemaining);

  const handleGenerate = async (isRebuild = false, rebuildTarget?: GeneratedDeliverable) => {
    if (currentWorkspace.creditsRemaining < creditCost) {
      alert('اعتبار ناکافی است. می‌توانید از بخش دفتر کل بسته اعتباری تهیه کنید.');
      onOpenLedger();
      return;
    }

    setIsGenerating(true);
    setGenerationPhase('مرحله ۱/۴: سنجش زمینه و تزریق حافظه پایدار منبع حقیقت...');

    try {
      setTimeout(() => {
        setGenerationPhase('مرحله ۲/۴: تولید پیش‌نویس ساختاری با مدل هوش مصنوعی...');
      }, 700);

      setTimeout(() => {
        setGenerationPhase('مرحله ۳/۴: اجرای چک‌لیست پذیرش و اعتبارسنجی منتقد (Validator)...');
      }, 1500);

      // Context relevant to the workstream
      const relevantContexts = resolveActiveContextsForNode('content', allContextObjects);

      const response = await generateDeliverableApi({
        deliverableId: currentDeliverableSpec.id,
        deliverableTitle: currentDeliverableSpec.title,
        acceptanceCriteria: currentDeliverableSpec.acceptanceCriteria,
        contextObjects: relevantContexts,
        executionMode,
      });

      setGenerationPhase('مرحله ۴/۴: ذخیره‌سازی دارایی و ثبت در Context Replay...');

      const newDeliverable: GeneratedDeliverable = {
        id: `del_run_${Date.now()}`,
        workspaceId: currentWorkspace.id,
        workstreamId: currentSpec.id,
        deliverableId: currentDeliverableSpec.id,
        title: currentDeliverableSpec.title,
        content: response.content,
        executionMode,
        creditCost: isRebuild ? Math.ceil(creditCost * 0.5) : creditCost,
        usedContextIds: response.usedContextIds,
        critiqueFeedback: response.critiqueFeedback,
        rebuildCount: isRebuild && rebuildTarget ? rebuildTarget.rebuildCount + 1 : 0,
        createdAt: new Date().toISOString(),
      };

      onSaveDeliverable(newDeliverable, newDeliverable.creditCost);
      setActiveTab('history');
    } catch (err: any) {
      console.error(err);
      alert('خطا در تولید خروجی. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsGenerating(false);
      setGenerationPhase('');
    }
  };

  // Filter deliverables generated for this workstream
  const workstreamDeliverables = allDeliverables.filter(
    (d) => d.workstreamId === currentSpec.id && d.workspaceId === currentWorkspace.id
  );

  return (
    <div className="space-y-stack-lg text-end">
      {/* Spec Selector Strip */}
      <div className="bg-surface-raised border border-border-default rounded-control p-inset-lg flex flex-col md:flex-row md:items-center justify-between gap-inline-lg">
        <div>
          <span className="text-caption text-text-subtle block mb-stack-xs">جریان کار فعال (Workstream Spec):</span>
          <div className="flex flex-wrap items-center gap-inline-sm">
            {specs.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedSpecId(s.id);
                  if (s.deliverables[0]) {
                    setSelectedDeliverableId(s.deliverables[0].id);
                  }
                }}
                className={`px-inset-md py-inset-sm rounded-control-sm text-body-sm font-semibold transition-all ${
                  selectedSpecId === s.id
                    ? 'bg-bg-brand-bold text-text-default shadow-raised'
                    : 'bg-surface-sunken text-text-subtle hover:text-text-default border border-border-default'
                }`}
              >
                {s.title}
              </button>
            ))}
            <button
              onClick={() => setIsCustomSpecModalOpen(true)}
              className="px-inset-md py-inset-sm rounded-control-sm text-body-sm font-semibold text-text-brand hover:text-text-default bg-surface-sunken hover:bg-interaction-hover border border-border-brand-subtle transition-colors"
            >
              + تعریف جریان کار سفارشی (Spec)
            </button>
          </div>
        </div>

        {/* Readiness summary badge */}
        <div className="flex items-center gap-inline-sm bg-surface-sunken border border-border-default px-inset-lg py-inset-sm rounded-control-sm shrink-0">
          <span className="text-body-sm text-text-subtle">وضعیت Gap Engine:</span>
          <span
            className={`text-body-sm font-bold tabular-nums ${
              readiness.score >= 85
                ? 'text-text-success'
                : readiness.score >= 50
                ? 'text-text-warning'
                : 'text-text-brand'
            }`}
          >
            {readiness.score}٪ آماده
          </span>
          <button
            onClick={() => setActiveTab('gap_analysis')}
            className="text-caption text-text-brand hover:underline me-inline-sm"
          >
            بررسی شکاف‌ها &larr;
          </button>
        </div>
      </div>

      {/* Tabs: Create Deliverable / Gap Analysis / Generated History */}
      <div className="flex items-center gap-inline-sm border-b border-border-default pb-inset-sm text-body-sm font-semibold">
        <button
          onClick={() => setActiveTab('create')}
          className={`px-inset-lg py-inset-sm rounded-control-sm transition-colors ${
            activeTab === 'create'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          تولید خروجی جدید
        </button>
        <button
          onClick={() => setActiveTab('gap_analysis')}
          className={`px-inset-lg py-inset-sm rounded-control-sm transition-colors relative flex items-center gap-inline-sm ${
            activeTab === 'gap_analysis'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          <span>🕸️ رادار و تحلیل شکاف‌ها (Gap Radar)</span>
          {readiness.gaps.length > 0 && (
            <span className="w-space-2 h-space-2 rounded-pill bg-bg-warning-bold" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-inset-lg py-inset-sm rounded-control-sm transition-colors ${
            activeTab === 'history'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          خروجی‌های تولیدشده ({workstreamDeliverables.length})
        </button>
      </div>

      {/* TAB 1: Create Deliverable */}
      {activeTab === 'create' && (
        <div className="space-y-stack-md">
          {/* Quick Gap Alert Banner in Create tab */}
          <div className="bg-surface-raised border border-border-default rounded-control p-inset-lg flex flex-col sm:flex-row sm:items-center justify-between gap-inline-md text-body-sm">
            <div className="flex items-center gap-inline-md">
              <div
                className={`w-control-sm h-control-sm rounded-control-sm flex items-center justify-center font-bold font-mono text-body-sm ${
                  readiness.score >= 80
                    ? 'bg-bg-success-subtle text-text-success'
                    : readiness.score >= 50
                    ? 'bg-bg-warning-subtle text-text-warning'
                    : 'bg-bg-brand-subtle text-text-brand'
                }`}
              >
                {readiness.score}٪
              </div>
              <div>
                <span className="font-semibold text-text-default">
                  وضعیت آمادگی منبع حقیقت: {readiness.status === 'ready' ? 'تأییدشده' : 'نیازمند تکمیل مدارک'}
                </span>
                <p className="text-text-subtle text-caption mt-stack-xs">
                  {readiness.gaps.filter((g) => g.importance === 'required' && g.status === 'missing').length === 0
                    ? 'تمامی پیش‌نیازهای الزامی در درخت حقیقت موجود است. خروجی با حداکثر دقت تولید خواهد شد.'
                    : `تعداد ${readiness.gaps.filter((g) => g.importance === 'required' && g.status === 'missing').length} شکاف بحرانی در دانش کسب‌وکار شناسایی شد.`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('gap_analysis')}
              className="px-inset-lg py-inset-sm rounded-control-sm bg-surface-raised hover:bg-interaction-hover border border-border-bold text-text-default hover:text-text-default transition-colors shrink-0 flex items-center gap-inline-sm"
            >
              <span>مشاهده رادار و برطرف‌سازی شکاف‌ها</span>
              <span>&larr;</span>
            </button>
          </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-inline-xl">
          {/* Deliverables list */}
          <div className="lg:col-span-1 space-y-stack-md">
            <h3 className="text-body-md font-bold text-text-default mb-stack-sm">خروجی‌ها به ترتیب ترتیب ارزش (Spec Sequence):</h3>
            {currentSpec.deliverables.map((del) => {
              const isSelected = selectedDeliverableId === del.id;
              const hasGenerated = workstreamDeliverables.some((d) => d.deliverableId === del.id);

              return (
                <div
                  key={del.id}
                  onClick={() => setSelectedDeliverableId(del.id)}
                  className={`p-inset-lg rounded-control border text-end cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-surface-raised border-border-brand shadow-raised'
                      : 'bg-surface-sunken border-border-default hover:border-border-bold'
                  }`}
                >
                  <div className="flex items-center justify-between gap-inline-sm mb-stack-sm">
                    <div className="flex items-center gap-inline-sm">
                      <span className="w-space-5 h-space-5 rounded-pill bg-bg-neutral-subtle text-text-subtle text-caption font-mono flex items-center justify-center">
                        {del.order}
                      </span>
                      <h4 className="text-body-sm font-semibold text-text-default">{del.title}</h4>
                    </div>
                    {hasGenerated && (
                      <span className="text-caption text-text-success bg-bg-success-subtle px-inset-sm py-inset-xs rounded-indicator">
                        تولیدشده ✓
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-text-subtle leading-relaxed line-clamp-2">
                    {del.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Execution Configuration & Trigger */}
          <div className="lg:col-span-2 space-y-stack-lg">
            <div className="bg-surface-raised border border-border-default rounded-control p-inset-xl space-y-stack-lg">
              <div>
                <span className="text-caption text-text-brand font-bold block mb-stack-xs">
                  خروجی انتخابی (گام {currentDeliverableSpec.order} از {currentSpec.deliverables.length})
                </span>
                <h3 className="text-heading-xs font-bold text-text-default">{currentDeliverableSpec.title}</h3>
                <p className="text-body-sm text-text-default mt-stack-xs leading-relaxed">
                  {currentDeliverableSpec.description}
                </p>
              </div>

              {/* Acceptance Criteria Checklist */}
              <div className="bg-surface-sunken border border-border-default rounded-control-sm p-inset-lg space-y-stack-sm">
                <span className="text-body-sm font-semibold text-text-default block">
                  معیار پذیرش خروجی (Acceptance Checklist):
                </span>
                <ul className="text-body-sm text-text-subtle space-y-stack-xs list-disc list-inside">
                  {currentDeliverableSpec.acceptanceCriteria.map((c, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Mode Selector */}
              <div className="space-y-stack-sm">
                <div className="flex items-center justify-between text-body-sm">
                  <span className="font-semibold text-text-default">انتخاب سطح اجرا و عمق کار:</span>
                  <span className="text-text-subtle">اصل P1: کاربر «چه» را تعیین می‌کند، مبدأ «چطور» را.</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-inline-sm">
                  <button
                    type="button"
                    onClick={() => setExecutionMode('fast')}
                    className={`p-inset-md rounded-control-sm border text-end transition-all ${
                      executionMode === 'fast'
                        ? 'border-border-brand bg-bg-brand-subtle text-text-default font-bold'
                        : 'border-border-default bg-surface-sunken text-text-subtle hover:border-border-bold'
                    }`}
                  >
                    <span className="block text-body-sm font-bold text-text-default">سریع (Fast)</span>
                    <span className="text-caption text-text-subtle block mt-stack-xs">تک‌مرحله‌ای</span>
                    <span className="text-caption text-text-brand mt-stack-xs block tabular-nums">
                      {calculateCreditCost({
                        deliverableType: currentDeliverableSpec.type,
                        executionMode: 'fast',
                        baseCreditCost: currentDeliverableSpec.baseCreditCost,
                      })}{' '}
                      اعتبار
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExecutionMode('auto')}
                    className={`p-inset-md rounded-control-sm border text-end transition-all ${
                      executionMode === 'auto'
                        ? 'border-border-brand bg-bg-brand-subtle text-text-default font-bold'
                        : 'border-border-default bg-surface-sunken text-text-subtle hover:border-border-bold'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm font-bold text-text-default">متعادل (Auto)</span>
                      <span className="text-[9px] text-text-success bg-bg-success-subtle px-inset-xs py-inset-lg rounded-indicator">
                        ۱۰٪ تخفیف
                      </span>
                    </div>
                    <span className="text-caption text-text-subtle block mt-stack-xs">پیش‌فرض بهینه</span>
                    <span className="text-caption text-text-brand mt-stack-xs block tabular-nums">
                      {calculateCreditCost({
                        deliverableType: currentDeliverableSpec.type,
                        executionMode: 'auto',
                        baseCreditCost: currentDeliverableSpec.baseCreditCost,
                      })}{' '}
                      اعتبار
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!plan.allowedModes.includes('critique')}
                    onClick={() => setExecutionMode('critique')}
                    className={`p-inset-md rounded-control-sm border text-end transition-all ${
                      executionMode === 'critique'
                        ? 'border-border-brand bg-bg-brand-subtle text-text-default font-bold'
                        : 'border-border-default bg-surface-sunken text-text-subtle hover:border-border-bold disabled:opacity-40'
                    }`}
                  >
                    <span className="block text-body-sm font-bold text-text-default">عمیق (Critique)</span>
                    <span className="text-caption text-text-subtle block mt-stack-xs">پیش‌نویس + نقد + اصلاح</span>
                    <span className="text-caption text-text-brand mt-stack-xs block tabular-nums">
                      {calculateCreditCost({
                        deliverableType: currentDeliverableSpec.type,
                        executionMode: 'critique',
                        baseCreditCost: currentDeliverableSpec.baseCreditCost,
                      })}{' '}
                      اعتبار
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!plan.allowedModes.includes('sensitive')}
                    onClick={() => setExecutionMode('sensitive')}
                    className={`p-inset-md rounded-control-sm border text-end transition-all ${
                      executionMode === 'sensitive'
                        ? 'border-border-brand bg-bg-brand-subtle text-text-default font-bold'
                        : 'border-border-default bg-surface-sunken text-text-subtle hover:border-border-bold disabled:opacity-40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm font-bold text-text-default">حالت حساس</span>
                      <span className="text-[9px] text-text-warning bg-bg-warning-subtle px-inset-xs py-inset-lg rounded-indicator">
                        Max
                      </span>
                    </div>
                    <span className="text-caption text-text-subtle block mt-stack-xs">نقد + Gap + تناقض</span>
                    <span className="text-caption text-text-brand mt-stack-xs block tabular-nums">
                      {calculateCreditCost({
                        deliverableType: currentDeliverableSpec.type,
                        executionMode: 'sensitive',
                        baseCreditCost: currentDeliverableSpec.baseCreditCost,
                      })}{' '}
                      اعتبار
                    </span>
                  </button>
                </div>
              </div>

              {/* Pre-Execution Credit Indicator (P2 Transparency) */}
              <div className="bg-surface-sunken border border-border-default rounded-control-sm p-inset-lg flex flex-col sm:flex-row sm:items-center justify-between gap-inline-md text-body-sm">
                <div>
                  <span className="text-text-subtle">هزینه این اجرا:</span>{' '}
                  <span className="font-bold text-text-default tabular-nums">{creditCost} اعتبار</span>
                  <span className="text-text-subtlest me-inline-sm">
                    (موجودی فعلی: {currentWorkspace.creditsRemaining} اعتبار · حدود {remainingOutputsEstimate} خروجی کامل دیگر)
                  </span>
                </div>

                <button
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating}
                  className="px-inset-xl py-inset-md text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover disabled:opacity-50 rounded-control-sm transition-all shadow-overflow whitespace-nowrap"
                >
                  {isGenerating ? 'در حال ساخت دارایی...' : 'ساخت دارایی (Generate)'}
                </button>
              </div>

              {/* Generating Animation & Phase indicator */}
              {isGenerating && (
                <div className="bg-bg-info-subtle border border-border-info-subtle rounded-control-sm p-inset-lg space-y-stack-sm text-body-sm">
                  <div className="flex items-center gap-inline-sm text-text-info font-bold">
                    <span className="animate-spin text-body-md" aria-hidden="true">
                      ⚙️
                    </span>
                    <span>{generationPhase}</span>
                  </div>
                  <div className="w-full bg-bg-neutral-subtle h-space-1 rounded-pill overflow-hidden">
                    <div className="h-full bg-bg-info-bold rounded-pill w-3/4" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* TAB 2: Visual Knowledge Gap Radar & Gap Engine Panel */}
      {activeTab === 'gap_analysis' && (
        <div className="space-y-stack-lg">
          {/* Visual Radar & Bar Chart */}
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
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }}
          />

          {/* Interactive Gap resolution cards */}
          <GapEnginePanel
            spec={currentSpec}
            readiness={readiness}
            onAnswerGap={(gap, answer) => {
              const newObj: ContextObject = {
                id: `ctx_gap_${Date.now()}`,
                workspaceId: currentWorkspace.id,
                type: gap.importance === 'required' ? 'Decision' : 'Fact',
                status: 'Confirmed',
                provenance: 'User Input',
                title: gap.label,
                content: answer,
                nodeId: gap.nodeId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              onAddContextObject(newObj);
            }}
            onIgnoreGap={(gap) => {
              alert(`شکاف «${gap.label}» نادیده گرفته شد و مانع ادامه روند نخواهد شد.`);
            }}
            onProceedAnyway={() => setActiveTab('create')}
          />
        </div>
      )}

      {/* TAB 3: History & Context Replay */}
      {activeTab === 'history' && (
        <div className="space-y-stack-lg">
          <div className="flex items-center justify-between border-b border-border-default pb-inset-md">
            <h3 className="text-body-md font-bold text-text-default">
              دارایی‌های تولیدشده در این جریان کاری ({workstreamDeliverables.length})
            </h3>
            <button
              onClick={() => setActiveTab('create')}
              className="text-body-sm text-text-brand hover:text-text-default"
            >
              + تولید مورد جدید
            </button>
          </div>

          {workstreamDeliverables.length === 0 ? (
            <div className="p-inset-2xl text-center bg-surface-raised border border-border-default rounded-control text-body-sm text-text-subtle space-y-stack-md">
              <p>هنوز خروجی‌ای برای این جریان کاری تولید نشده است.</p>
              <button
                onClick={() => setActiveTab('create')}
                className="px-inset-lg py-inset-sm text-body-sm font-semibold text-text-default bg-bg-brand-bold rounded-control-sm"
              >
                تولید اولین دارایی
              </button>
            </div>
          ) : (
            <div className="space-y-stack-lg">
              {workstreamDeliverables.map((del) => (
                <ContextReplayCard
                  key={del.id}
                  deliverable={del}
                  allContextObjects={allContextObjects}
                  onOpenContextObject={onOpenContextModal}
                  onRebuild={(target) => handleGenerate(true, target)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Custom Spec Modal */}
      <CustomSpecModal
        isOpen={isCustomSpecModalOpen}
        onClose={() => setIsCustomSpecModalOpen(false)}
        onSaveSpec={(newSpec) => {
          onAddCustomSpec(newSpec);
          setSelectedSpecId(newSpec.id);
          if (newSpec.deliverables[0]) {
            setSelectedDeliverableId(newSpec.deliverables[0].id);
          }
        }}
      />
    </div>
  );
};
