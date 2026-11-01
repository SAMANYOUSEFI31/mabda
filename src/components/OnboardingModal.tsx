/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { ContextDraft, ContextObject, GeneratedDeliverable, LedgerEntry, TreeNode, Workspace } from '../types';
import { CoachPanel } from './CoachPanel';
import { asAiError, generateDeliverableApi } from '../services/apiClient';
import { useAiStatus } from '../services/aiStatus';
import { AiErrorNotice } from './AiNotices';
import type { AiErrorInfo } from '../types';
import { Alert, Button, Card, Dialog, Icon, Markdown, Progress, TextField, Textarea, formatNumber } from '../ui';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  /** saves the 5 confirmed objects on the server and returns them (with ids + versions) */
  onCreateObjects: (drafts: ContextDraft[]) => Promise<ContextObject[]>;
  onCompleteOnboarding: (firstDeliverable: GeneratedDeliverable) => void;
  onOpenAiSettings: () => void;
  nodes: TreeNode[];
  onSaveProposals: (proposals: Array<{ type: 'Fact' | 'Decision' | 'Constraint'; title: string; content: string; nodeId: string }>) => Promise<void>;
  onLedger: (ledger: LedgerEntry[]) => void;
}

/** Wizard state resets on every open: the stateful part mounts fresh when the modal opens. */
export const OnboardingModal: React.FC<OnboardingModalProps> = (props) =>
  props.isOpen ? <OnboardingWizard {...props} /> : null;

const STEP_TITLES = [
  'گام اول: ورود ۵ حقیقت اساسی کسب‌وکار',
  'گام دوم: تأیید دانشی که مبدأ فهمید',
  'گام سوم: لحظهٔ Aha — اولین دارایی با Context Replay',
];

const OnboardingWizard: React.FC<OnboardingModalProps> = ({ onClose, currentWorkspace, onCreateObjects, onCompleteOnboarding, onOpenAiSettings, nodes, onSaveProposals, onLedger }) => {
  const ai = useAiStatus();
  const [genError, setGenError] = useState<AiErrorInfo | null>(null);
  const [step, setStep] = useState<number>(1);
  const [domain, setDomain] = useState('مشاوره استراتژی برند و دیزاین سیستم');
  const [audience, setAudience] = useState('سولو فاندرها، فریلنسرها و مشاوران مستقل');
  const [problem, setProblem] = useState('پراکندگی اطلاعات و تصمیمات؛ هر بار توضیح دوباره به چت‌بات‌ها و دریافت خروجی‌های متناقض');
  const [valProp, setValProp] = useState('تبدیل دانش پراکنده به یک منبع حقیقت یکپارچه و ساخت دارایی‌های منسجم با Context Replay');
  const [differentiation, setDifferentiation] = useState('دانش ساختاریافته نوع‌دار با موتور تحلیل شکاف (Gap Engine) و بازسازی نصف‌قیمت');

  /** saved once: a retry after an AI error must not create the five objects again */
  const savedObjects = useRef<ContextObject[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedOutput, setGeneratedOutput] = useState<GeneratedDeliverable | null>(null);

  const handleCreateAndGenerate = async () => {
    setIsGenerating(true);
    setGenError(null);

    const drafts: ContextDraft[] = [
      {
        workspaceId: currentWorkspace.id,
        type: 'Fact',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'حوزهٔ کسب‌وکار و تخصص',
        content: domain,
        nodeId: 'business',
      },
      {
        workspaceId: currentWorkspace.id,
        type: 'Decision',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'مخاطب اصلی (ICP)',
        content: audience,
        nodeId: 'business',
      },
      {
        workspaceId: currentWorkspace.id,
        type: 'Fact',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'معضل اصلی مخاطب',
        content: problem,
        nodeId: 'business',
      },
      {
        workspaceId: currentWorkspace.id,
        type: 'Decision',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'پیشنهاد ارزش و راه‌حل',
        content: valProp,
        nodeId: 'product',
      },
      {
        workspaceId: currentWorkspace.id,
        type: 'Fact',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'تمایز کلیدی',
        content: differentiation,
        nodeId: 'brand',
      },
    ];

    try {
      savedObjects.current ??= await onCreateObjects(drafts);
      const response = await generateDeliverableApi({
        deliverableId: 'del_positioning_statement',
        deliverableTitle: 'جملهٔ موقعیت‌یابی اختصاصی (First Asset)',
        deliverableType: 'Asset',
        acceptanceCriteria: [
          'عدم وجود ادعاهای عمومی و کلیشه‌ای',
          'اشاره صریح به مخاطب هدف و معضل محوری',
          'انعکاس تمایز ساختاری مبدأ',
        ],
        workspaceId: currentWorkspace.id,
        targetNodeId: '*',
        executionMode: 'auto',
      });

      const firstAsset: GeneratedDeliverable = {
        id: `del_first_${Date.now()}`,
        workspaceId: currentWorkspace.id,
        workstreamId: 'main_positioning',
        deliverableId: 'del_positioning_statement',
        title: 'جملهٔ موقعیت‌یابی اختصاصی (First Asset)',
        content: response.markdown,
        blocks: response.blocks,
        plan: response.plan,
        usage: response.usage,
        validationFailed: response.validationFailed,
        executionMode: 'auto',
        creditCost: 2,
        usedContext: response.usedContext,
        usedFileChunks: response.usedFileChunks,
        critiqueFeedback: response.critiqueFeedback,
        rebuildCount: 0,
        createdAt: new Date().toISOString(),
      };

      setGeneratedOutput(firstAsset);
      onCompleteOnboarding(firstAsset);
      setStep(3); // Result & Replay step
    } catch (e) {
      setGenError(asAiError(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const review: Array<[string, string]> = [
    ['حوزهٔ کسب‌وکار', domain],
    ['مخاطب اصلی (ICP)', audience],
    ['معضل اصلی', problem],
    ['پیشنهاد ارزش', valProp],
    ['تمایز کلیدی', differentiation],
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={STEP_TITLES[step - 1]}
      description="مسیر سریع تا اولین خروجی منسجم (کمتر از ۱۰ دقیقه)"
      footer={
        step === 1 ? (
          <Button variant="primary" iconEnd="ArrowLeft" onClick={() => setStep(2)}>بررسی اشیاء پیشنهادی دانش</Button>
        ) : step === 2 ? (
          <>
            <Button variant="ghost" onClick={() => setStep(1)}>بازگشت و اصلاح</Button>
            <Button variant="primary" loading={isGenerating} disabled={!ai.available} onClick={handleCreateAndGenerate}>
              تأیید همه و ساخت اولین دارایی
            </Button>
          </>
        ) : (
          <Button variant="primary" iconEnd="ArrowLeft" onClick={onClose}>ورود به استودیوی مبدأ</Button>
        )
      }
    >
      <div className="flex flex-col gap-stack-lg">
        <Progress value={step} max={3} label={`گام ${formatNumber(step)} از ۳`} showValue={false} />

        {step === 1 && (
          <div className="flex flex-col gap-stack-md">
            <TextField label="۱. روی چه کاری کار می‌کنی؟ (حوزهٔ تخصصی)" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <TextField label="۲. مخاطب اصلی تو کیست؟ (خریدار یا کاربر ایده‌آل)" value={audience} onChange={(e) => setAudience(e.target.value)} />
            <Textarea label="۳. بزرگ‌ترین معضل و درد مشتری‌ات چیست؟" rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} />
            <Textarea label="۴. راه‌حل و پیشنهاد ارزش تو چگونه این درد را حل می‌کند؟" rows={2} value={valProp} onChange={(e) => setValProp(e.target.value)} />
            <TextField label="۵. تمایز کلیدی یا خط قرمز تو چیست؟" value={differentiation} onChange={(e) => setDifferentiation(e.target.value)} />
            <CoachPanel
              workspaceId={currentWorkspace.id}
              scope="onboarding"
              nodeId="business"
              nodes={nodes}
              seedText={`حوزه: ${domain}\nمخاطب: ${audience}\nمعضل: ${problem}\nراه‌حل: ${valProp}\nتمایز: ${differentiation}`}
              onSaveProposals={onSaveProposals}
              onLedger={onLedger}
              onOpenAiSettings={onOpenAiSettings}
            />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-stack-md">
            <p className="body-sm text-text-subtle">
              این ۵ شیء دانشی است که مبدأ استخراج کرد. تا زمانی که تأیید نکنی، هیچ موردی وارد خروجی‌ها نمی‌شود.
            </p>
            <div className="flex flex-col gap-stack-sm">
              {review.map(([label, value]) => (
                <div key={label} className="rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                  <span className="label-md mb-stack-xs block text-text-default">{label}</span>
                  <span className="body-sm text-text-subtle">{value}</span>
                </div>
              ))}
            </div>
            <Alert intent="success" title="آمادگی برای تولید اولین دارایی (جملهٔ موقعیت‌یابی): ۱۰۰٪ کامل" />
            {!ai.available && <AiErrorNotice error={{ kind: 'no_key', message: 'برای ساخت اولین دارایی، کلید API لازم است.', retryable: false }} onOpenSettings={onOpenAiSettings} />}
            {genError && <AiErrorNotice error={genError} onRetry={handleCreateAndGenerate} retrying={isGenerating} onOpenSettings={onOpenAiSettings} />}
          </div>
        )}

        {step === 3 && generatedOutput && (
          <div className="flex flex-col gap-stack-md">
            <Alert intent="success" title="نخستین دارایی تو در کمتر از ۱۰ دقیقه ساخته شد">
              این دارایی از این لحظه در منبع حقیقت قفل است.
            </Alert>
            <div className="rounded-control border border-border-default bg-surface-sunken p-inset-lg"><Markdown>{generatedOutput.content}</Markdown></div>
            <Card padding="lg" className="flex flex-col gap-stack-sm">
              <span className="label-md inline-flex items-center gap-inline-xs text-text-default">
                <Icon name="Lightbulb" size="md" className="text-icon-subtle" />
                لحظهٔ Aha در مبدأ: Context Replay
              </span>
              <p className="body-sm text-text-subtle">
                این خروجی به‌دلیل واقعیت‌ها و تصمیم‌هایی که در گام اول وارد کردی، مخصوص کسب‌وکار تو ساخته شد. هر زمان یکی از آن ۵ مورد را در درخت دانش تغییر بدهی، می‌توانی این خروجی را با نصف قیمت بازسازی کنی.
              </p>
            </Card>
          </div>
        )}
      </div>
    </Dialog>
  );
};
