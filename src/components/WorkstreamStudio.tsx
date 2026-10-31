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
    <div className="space-y-6 text-right">
      {/* Spec Selector Strip */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] text-[#a1a1aa] block mb-1">جریان کار فعال (Workstream Spec):</span>
          <div className="flex flex-wrap items-center gap-2">
            {specs.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedSpecId(s.id);
                  if (s.deliverables[0]) {
                    setSelectedDeliverableId(s.deliverables[0].id);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedSpecId === s.id
                    ? 'bg-[#e11d48] text-white shadow-sm'
                    : 'bg-[#09090b] text-[#a1a1aa] hover:text-white border border-[#27272a]'
                }`}
              >
                {s.title}
              </button>
            ))}
            <button
              onClick={() => setIsCustomSpecModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#fb7185] hover:text-white bg-[#09090b] hover:bg-[#27272a] border border-[#e11d48]/50 transition-colors"
            >
              + تعریف جریان کار سفارشی (Spec)
            </button>
          </div>
        </div>

        {/* Readiness summary badge */}
        <div className="flex items-center gap-2 bg-[#09090b] border border-[#27272a] px-3.5 py-2 rounded-lg shrink-0">
          <span className="text-xs text-[#a1a1aa]">وضعیت Gap Engine:</span>
          <span
            className={`text-xs font-bold tabular-nums ${
              readiness.score >= 85
                ? 'text-[#10b981]'
                : readiness.score >= 50
                ? 'text-[#f59e0b]'
                : 'text-[#e11d48]'
            }`}
          >
            {readiness.score}٪ آماده
          </span>
          <button
            onClick={() => setActiveTab('gap_analysis')}
            className="text-[11px] text-[#fb7185] hover:underline mr-2"
          >
            بررسی شکاف‌ها &larr;
          </button>
        </div>
      </div>

      {/* Tabs: Create Deliverable / Gap Analysis / Generated History */}
      <div className="flex items-center gap-2 border-b border-[#27272a] pb-2 text-xs font-medium">
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'create'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          تولید خروجی جدید
        </button>
        <button
          onClick={() => setActiveTab('gap_analysis')}
          className={`px-4 py-2 rounded-lg transition-colors relative flex items-center gap-2 ${
            activeTab === 'gap_analysis'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          <span>🕸️ رادار و تحلیل شکاف‌ها (Gap Radar)</span>
          {readiness.gaps.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'history'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          خروجی‌های تولیدشده ({workstreamDeliverables.length})
        </button>
      </div>

      {/* TAB 1: Create Deliverable */}
      {activeTab === 'create' && (
        <div className="space-y-4">
          {/* Quick Gap Alert Banner in Create tab */}
          <div className="bg-[#121215] border border-[#27272a] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold font-mono text-xs ${
                  readiness.score >= 80
                    ? 'bg-[#10b981]/15 text-[#10b981]'
                    : readiness.score >= 50
                    ? 'bg-[#f59e0b]/15 text-[#f59e0b]'
                    : 'bg-[#e11d48]/15 text-[#e11d48]'
                }`}
              >
                {readiness.score}٪
              </div>
              <div>
                <span className="font-semibold text-white">
                  وضعیت آمادگی منبع حقیقت: {readiness.status === 'ready' ? 'تأییدشده' : 'نیازمند تکمیل مدارک'}
                </span>
                <p className="text-[#a1a1aa] text-[11px] mt-0.5">
                  {readiness.gaps.filter((g) => g.importance === 'required' && g.status === 'missing').length === 0
                    ? 'تمامی پیش‌نیازهای الزامی در درخت حقیقت موجود است. خروجی با حداکثر دقت تولید خواهد شد.'
                    : `تعداد ${readiness.gaps.filter((g) => g.importance === 'required' && g.status === 'missing').length} شکاف بحرانی در دانش کسب‌وکار شناسایی شد.`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('gap_analysis')}
              className="px-3.5 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-[#3f3f46] text-[#e4e4e7] hover:text-white transition-colors shrink-0 flex items-center gap-1.5"
            >
              <span>مشاهده رادار و برطرف‌سازی شکاف‌ها</span>
              <span>&larr;</span>
            </button>
          </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Deliverables list */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-sm font-bold text-white mb-2">خروجی‌ها به ترتیب ترتیب ارزش (Spec Sequence):</h3>
            {currentSpec.deliverables.map((del) => {
              const isSelected = selectedDeliverableId === del.id;
              const hasGenerated = workstreamDeliverables.some((d) => d.deliverableId === del.id);

              return (
                <div
                  key={del.id}
                  onClick={() => setSelectedDeliverableId(del.id)}
                  className={`p-3.5 rounded-xl border text-right cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#18181b] border-[#e11d48] shadow-sm'
                      : 'bg-[#09090b] border-[#27272a] hover:border-[#52525b]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#27272a] text-[#a1a1aa] text-[10px] font-mono flex items-center justify-center">
                        {del.order}
                      </span>
                      <h4 className="text-xs font-semibold text-white">{del.title}</h4>
                    </div>
                    {hasGenerated && (
                      <span className="text-[10px] text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded">
                        تولیدشده ✓
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#a1a1aa] leading-relaxed line-clamp-2">
                    {del.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Execution Configuration & Trigger */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-5">
              <div>
                <span className="text-[11px] text-[#e11d48] font-bold block mb-1">
                  خروجی انتخابی (گام {currentDeliverableSpec.order} از {currentSpec.deliverables.length})
                </span>
                <h3 className="text-lg font-bold text-white">{currentDeliverableSpec.title}</h3>
                <p className="text-xs text-[#d4d4d8] mt-1 leading-relaxed">
                  {currentDeliverableSpec.description}
                </p>
              </div>

              {/* Acceptance Criteria Checklist */}
              <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-4 space-y-2">
                <span className="text-xs font-semibold text-white block">
                  معیار پذیرش خروجی (Acceptance Checklist):
                </span>
                <ul className="text-xs text-[#a1a1aa] space-y-1 list-disc list-inside">
                  {currentDeliverableSpec.acceptanceCriteria.map((c, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Mode Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">انتخاب سطح اجرا و عمق کار:</span>
                  <span className="text-[#a1a1aa]">اصل P1: کاربر «چه» را تعیین می‌کند، مبدأ «چطور» را.</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setExecutionMode('fast')}
                    className={`p-3 rounded-lg border text-right transition-all ${
                      executionMode === 'fast'
                        ? 'border-[#e11d48] bg-[#e11d48]/10 text-white font-bold'
                        : 'border-[#27272a] bg-[#09090b] text-[#a1a1aa] hover:border-[#3f3f46]'
                    }`}
                  >
                    <span className="block text-xs font-bold text-white">سریع (Fast)</span>
                    <span className="text-[10px] text-[#a1a1aa] block mt-1">تک‌مرحله‌ای</span>
                    <span className="text-[11px] text-[#fb7185] mt-1 block tabular-nums">
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
                    className={`p-3 rounded-lg border text-right transition-all ${
                      executionMode === 'auto'
                        ? 'border-[#e11d48] bg-[#e11d48]/10 text-white font-bold'
                        : 'border-[#27272a] bg-[#09090b] text-[#a1a1aa] hover:border-[#3f3f46]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">متعادل (Auto)</span>
                      <span className="text-[9px] text-[#10b981] bg-[#10b981]/15 px-1 py-0.2 rounded">
                        ۱۰٪ تخفیف
                      </span>
                    </div>
                    <span className="text-[10px] text-[#a1a1aa] block mt-1">پیش‌فرض بهینه</span>
                    <span className="text-[11px] text-[#fb7185] mt-1 block tabular-nums">
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
                    className={`p-3 rounded-lg border text-right transition-all ${
                      executionMode === 'critique'
                        ? 'border-[#e11d48] bg-[#e11d48]/10 text-white font-bold'
                        : 'border-[#27272a] bg-[#09090b] text-[#a1a1aa] hover:border-[#3f3f46] disabled:opacity-40'
                    }`}
                  >
                    <span className="block text-xs font-bold text-white">عمیق (Critique)</span>
                    <span className="text-[10px] text-[#a1a1aa] block mt-1">پیش‌نویس + نقد + اصلاح</span>
                    <span className="text-[11px] text-[#fb7185] mt-1 block tabular-nums">
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
                    className={`p-3 rounded-lg border text-right transition-all ${
                      executionMode === 'sensitive'
                        ? 'border-[#e11d48] bg-[#e11d48]/10 text-white font-bold'
                        : 'border-[#27272a] bg-[#09090b] text-[#a1a1aa] hover:border-[#3f3f46] disabled:opacity-40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">حالت حساس</span>
                      <span className="text-[9px] text-[#fbbf24] bg-[#fbbf24]/10 px-1 py-0.2 rounded">
                        Max
                      </span>
                    </div>
                    <span className="text-[10px] text-[#a1a1aa] block mt-1">نقد + Gap + تناقض</span>
                    <span className="text-[11px] text-[#fb7185] mt-1 block tabular-nums">
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
              <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-[#a1a1aa]">هزینه این اجرا:</span>{' '}
                  <span className="font-bold text-white tabular-nums">{creditCost} اعتبار</span>
                  <span className="text-[#7d7d86] mr-2">
                    (موجودی فعلی: {currentWorkspace.creditsRemaining} اعتبار · حدود {remainingOutputsEstimate} خروجی کامل دیگر)
                  </span>
                </div>

                <button
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] disabled:opacity-50 rounded-lg transition-all shadow-md whitespace-nowrap"
                >
                  {isGenerating ? 'در حال ساخت دارایی...' : 'ساخت دارایی (Generate)'}
                </button>
              </div>

              {/* Generating Animation & Phase indicator */}
              {isGenerating && (
                <div className="bg-[#0c4a6e]/20 border border-[#0284c7]/30 rounded-lg p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-[#38bdf8] font-bold">
                    <span className="animate-spin text-base" aria-hidden="true">
                      ⚙️
                    </span>
                    <span>{generationPhase}</span>
                  </div>
                  <div className="w-full bg-[#27272a] h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0284c7] animate-pulse rounded-full w-3/4" />
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
        <div className="space-y-6">
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
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
            <h3 className="text-base font-bold text-white">
              دارایی‌های تولیدشده در این جریان کاری ({workstreamDeliverables.length})
            </h3>
            <button
              onClick={() => setActiveTab('create')}
              className="text-xs text-[#fb7185] hover:text-white"
            >
              + تولید مورد جدید
            </button>
          </div>

          {workstreamDeliverables.length === 0 ? (
            <div className="p-8 text-center bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-[#a1a1aa] space-y-3">
              <p>هنوز خروجی‌ای برای این جریان کاری تولید نشده است.</p>
              <button
                onClick={() => setActiveTab('create')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#e11d48] rounded-lg"
              >
                تولید اولین دارایی
              </button>
            </div>
          ) : (
            <div className="space-y-6">
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
