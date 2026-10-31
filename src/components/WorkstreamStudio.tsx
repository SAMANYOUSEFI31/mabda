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
import { Alert, Badge, Button, Card, EmptyState, List, ListItem, OptionCard, Progress, Select, Spinner, Tabs, formatNumber, useToast } from '../ui';

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
  const toast = useToast();

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
      toast.show({ intent: 'warning', message: 'اعتبار ناکافی است. می‌توانی از بخش دفتر کل بستهٔ اعتباری تهیه کنی.' });
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
      toast.show({ intent: 'danger', message: 'خروجی ساخته نشد. دوباره تلاش کن.' });
    } finally {
      setIsGenerating(false);
      setGenerationPhase('');
    }
  };

  // Filter deliverables generated for this workstream
  const workstreamDeliverables = allDeliverables.filter(
    (d) => d.workstreamId === currentSpec.id && d.workspaceId === currentWorkspace.id
  );

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
                  if (s?.deliverables[0]) setSelectedDeliverableId(s.deliverables[0].id);
                }}
                options={specs.map((s) => ({ value: s.id, label: s.title }))}
              />
            </div>
            <Button variant="secondary" iconStart="Plus" onClick={() => setIsCustomSpecModalOpen(true)}>
              تعریف جریان کار سفارشی
            </Button>
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
                {currentSpec.deliverables.map((del) => (
                  <ListItem
                    key={del.id}
                    selected={selectedDeliverableId === del.id}
                    onClick={() => setSelectedDeliverableId(del.id)}
                    leading={<span className="label-sm tabular-nums">{formatNumber(del.order)}</span>}
                    title={
                      <span className="flex flex-wrap items-center gap-inline-sm">
                        {del.title}
                        {workstreamDeliverables.some((d) => d.deliverableId === del.id) && <Badge intent="success">تولیدشده</Badge>}
                      </span>
                    }
                    description={del.description}
                  />
                ))}
              </List>
            </div>

            {/* Execution */}
            <Card padding="xl" className="flex flex-col gap-stack-lg lg:col-span-2">
              <div className="flex flex-col gap-stack-xs">
                <span className="label-md text-text-subtle">
                  خروجی انتخابی (گام {formatNumber(currentDeliverableSpec.order)} از {formatNumber(currentSpec.deliverables.length)})
                </span>
                <h3 className="heading-xs text-text-default">{currentDeliverableSpec.title}</h3>
                <p className="body-sm text-text-default">{currentDeliverableSpec.description}</p>
              </div>

              <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
                <span className="label-md text-text-default">معیار پذیرش خروجی (Acceptance Checklist)</span>
                <ul className="body-sm list-inside list-disc text-text-subtle">
                  {currentDeliverableSpec.acceptanceCriteria.map((c, idx) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
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
                    meta={`${formatNumber(modeCost('fast'))} اعتبار`}
                    selected={executionMode === 'fast'}
                    onClick={() => setExecutionMode('fast')}
                  />
                  <OptionCard
                    title="متعادل (Auto)"
                    badge={<Badge intent="success" icon={false}>۱۰٪ تخفیف</Badge>}
                    description="پیش‌فرض بهینه"
                    meta={`${formatNumber(modeCost('auto'))} اعتبار`}
                    selected={executionMode === 'auto'}
                    onClick={() => setExecutionMode('auto')}
                  />
                  <OptionCard
                    title="عمیق (Critique)"
                    description="پیش‌نویس + نقد + اصلاح"
                    meta={`${formatNumber(modeCost('critique'))} اعتبار`}
                    selected={executionMode === 'critique'}
                    disabled={!plan.allowedModes.includes('critique')}
                    onClick={() => setExecutionMode('critique')}
                  />
                  <OptionCard
                    title="حالت حساس"
                    badge={<Badge intent="neutral" icon={false}>Max</Badge>}
                    description="نقد + Gap + تناقض"
                    meta={`${formatNumber(modeCost('sensitive'))} اعتبار`}
                    selected={executionMode === 'sensitive'}
                    disabled={!plan.allowedModes.includes('sensitive')}
                    onClick={() => setExecutionMode('sensitive')}
                  />
                </div>
              </div>

              {/* Pre-execution credit indicator (P2) */}
              <div className="flex flex-col justify-between gap-inline-md rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg sm:flex-row sm:items-center">
                <div className="body-sm">
                  <span className="text-text-subtle">هزینهٔ این اجرا: </span>
                  <span className="label-md tabular-nums text-text-default">{formatNumber(creditCost)} اعتبار</span>
                  <span className="mt-stack-xs block caption text-text-subtle">
                    موجودی فعلی: {formatNumber(currentWorkspace.creditsRemaining)} اعتبار · حدود {formatNumber(remainingOutputsEstimate)} خروجی کامل دیگر
                  </span>
                </div>
                <Button variant="primary" size="lg" iconStart="Sparkles" loading={isGenerating} onClick={() => handleGenerate(false)}>
                  ساخت دارایی
                </Button>
              </div>

              {isGenerating && (
                <Alert intent="info" title={generationPhase || 'در حال ساخت دارایی…'}>
                  <div className="flex items-center gap-inline-sm pt-inset-xs">
                    <Spinner size="sm" label="در حال ساخت" />
                    <Progress indeterminate label="پیشرفت ساخت" intent="neutral" />
                  </div>
                </Alert>
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
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }}
          />

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
                  onOpenContextObject={onOpenContextModal}
                  onRebuild={(target) => handleGenerate(true, target)}
                />
              ))}
            </div>
          )}
        </div>
      )}

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
