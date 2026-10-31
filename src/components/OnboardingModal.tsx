/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, GeneratedDeliverable, Workspace } from '../types';
import { generateDeliverableApi } from '../services/apiClient';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  onCompleteOnboarding: (newObjects: ContextObject[], firstDeliverable: GeneratedDeliverable) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
  onCompleteOnboarding,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<number>(1);
  const [domain, setDomain] = useState('مشاوره استراتژی برند و دیزاین سیستم');
  const [audience, setAudience] = useState('سولو فاندرها، فریلنسرها و مشاوران مستقل');
  const [problem, setProblem] = useState('پراکندگی اطلاعات و تصمیمات؛ هر بار توضیح دوباره به چت‌بات‌ها و دریافت خروجی‌های متناقض');
  const [valProp, setValProp] = useState('تبدیل دانش پراکنده به یک منبع حقیقت یکپارچه و ساخت دارایی‌های منسجم با Context Replay');
  const [differentiation, setDifferentiation] = useState('دانش ساختاریافته نوع‌دار با موتور تحلیل شکاف (Gap Engine) و بازسازی نصف‌قیمت');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedOutput, setGeneratedOutput] = useState<GeneratedDeliverable | null>(null);

  const handleCreateAndGenerate = async () => {
    setIsGenerating(true);

    const now = new Date().toISOString();
    const createdObjects: ContextObject[] = [
      {
        id: `ctx_onb_${Date.now()}_1`,
        workspaceId: currentWorkspace.id,
        type: 'Fact',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'حوزهٔ کسب‌وکار و تخصص',
        content: domain,
        nodeId: 'business',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `ctx_onb_${Date.now()}_2`,
        workspaceId: currentWorkspace.id,
        type: 'Decision',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'مخاطب اصلی (ICP)',
        content: audience,
        nodeId: 'business',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `ctx_onb_${Date.now()}_3`,
        workspaceId: currentWorkspace.id,
        type: 'Fact',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'معضل اصلی مخاطب',
        content: problem,
        nodeId: 'business',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `ctx_onb_${Date.now()}_4`,
        workspaceId: currentWorkspace.id,
        type: 'Decision',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'پیشنهاد ارزش و راه‌حل',
        content: valProp,
        nodeId: 'product',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `ctx_onb_${Date.now()}_5`,
        workspaceId: currentWorkspace.id,
        type: 'Fact',
        status: 'Confirmed',
        provenance: 'Onboarding',
        title: 'تمایز کلیدی',
        content: differentiation,
        nodeId: 'brand',
        createdAt: now,
        updatedAt: now,
      },
    ];

    try {
      const response = await generateDeliverableApi({
        deliverableId: 'del_positioning_statement',
        deliverableTitle: 'جملهٔ موقعیت‌یابی اختصاصی (First Asset)',
        acceptanceCriteria: [
          'عدم وجود ادعاهای عمومی و کلیشه‌ای',
          'اشاره صریح به مخاطب هدف و معضل محوری',
          'انعکاس تمایز ساختاری مبدأ',
        ],
        contextObjects: createdObjects,
        executionMode: 'auto',
      });

      const firstAsset: GeneratedDeliverable = {
        id: `del_first_${Date.now()}`,
        workspaceId: currentWorkspace.id,
        workstreamId: 'main_positioning',
        deliverableId: 'del_positioning_statement',
        title: 'جملهٔ موقعیت‌یابی اختصاصی (First Asset)',
        content: response.content,
        executionMode: 'auto',
        creditCost: 2,
        usedContextIds: createdObjects.map((c) => c.id),
        critiqueFeedback: response.critiqueFeedback,
        rebuildCount: 0,
        createdAt: new Date().toISOString(),
      };

      setGeneratedOutput(firstAsset);
      onCompleteOnboarding(createdObjects, firstAsset);
      setStep(3); // Result & Replay step
    } catch (e) {
      console.error(e);
      alert('خطا در تولید اولین دارایی.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-space-0 z-dialog flex items-center justify-center p-inset-lg bg-bg-scrim text-end">
      <div className="bg-surface-raised border border-border-default rounded-container w-full max-w-form max-h-[90vh] overflow-y-auto shadow-overlay p-inset-xl sm:p-inset-2xl space-y-stack-lg">
        {/* Step indicator */}
        <div className="flex items-center justify-between border-b border-border-default pb-inset-lg">
          <div className="flex items-center gap-inline-md">
            <span className="w-space-8 h-space-8 rounded-control-sm bg-bg-brand-bold text-text-default flex items-center justify-center font-bold text-body-md">
              {step}/۳
            </span>
            <div>
              <h3 className="text-body-md font-bold text-text-default">
                {step === 1
                  ? 'گام اول: ورود ۵ حقیقت اساسی کسب‌وکار'
                  : step === 2
                  ? 'گام دوم: تأیید دانشی که مبدأ فهمید'
                  : 'گام سوم: Aha Moment — اولین دارایی با Context Replay'}
              </h3>
              <p className="text-body-sm text-text-subtle mt-stack-xs">
                مسیر Onboarding سریع تا اولین خروجی منسجم (کمتر از ۱۰ دقیقه)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-default p-inset-xs rounded-control-sm hover:bg-interaction-hover transition-colors"
          >
            ✕
          </button>
        </div>

        {/* STEP 1: 5 Questions */}
        {step === 1 && (
          <div className="space-y-stack-md text-body-sm">
            <div>
              <label className="block text-text-default font-semibold mb-stack-xs">
                ۱. روی چه کاری کار می‌کنی؟ (حوزه تخصصی)
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm p-inset-md text-text-default focus:outline-none focus:border-border-brand"
              />
            </div>

            <div>
              <label className="block text-text-default font-semibold mb-stack-xs">
                ۲. مخاطب اصلی تو کیست؟ (خریدار یا کاربر ایده‌آل)
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm p-inset-md text-text-default focus:outline-none focus:border-border-brand"
              />
            </div>

            <div>
              <label className="block text-text-default font-semibold mb-stack-xs">
                ۳. بزرگ‌ترین معضل و درد مشتری‌ات چیست؟
              </label>
              <textarea
                rows={2}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm p-inset-md text-text-default focus:outline-none focus:border-border-brand"
              />
            </div>

            <div>
              <label className="block text-text-default font-semibold mb-stack-xs">
                ۴. راه‌حل و پیشنهاد ارزش تو چگونه این درد را حل می‌کند؟
              </label>
              <textarea
                rows={2}
                value={valProp}
                onChange={(e) => setValProp(e.target.value)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm p-inset-md text-text-default focus:outline-none focus:border-border-brand"
              />
            </div>

            <div>
              <label className="block text-text-default font-semibold mb-stack-xs">
                ۵. تمایز کلیدی یا خط قرمز تو چیست؟
              </label>
              <input
                type="text"
                value={differentiation}
                onChange={(e) => setDifferentiation(e.target.value)}
                className="w-full bg-surface-sunken border border-border-default rounded-control-sm p-inset-md text-text-default focus:outline-none focus:border-border-brand"
              />
            </div>

            <div className="pt-inset-lg flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="px-inset-lg py-inset-sm text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors shadow-raised"
              >
                بررسی اشیاء پیشنهادی دانش &larr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Review Proposed Objects */}
        {step === 2 && (
          <div className="space-y-stack-md text-body-sm">
            <p className="text-text-subtle leading-relaxed">
              این ۵ شیء دانشی است که مبدأ استخراج کرد. در مبدأ تا زمانی که کاربر تأیید نکند، هیچ موردی وارد خروجی‌ها نمی‌شود (اصل P2):
            </p>

            <div className="space-y-stack-sm">
              <div className="p-inset-md rounded-control-sm bg-surface-sunken border border-border-default">
                <span className="font-bold text-text-default block mb-stack-xs">حوزه کسب‌وکار:</span>
                <span className="text-text-default">{domain}</span>
              </div>
              <div className="p-inset-md rounded-control-sm bg-surface-sunken border border-border-default">
                <span className="font-bold text-text-default block mb-stack-xs">مخاطب اصلی (ICP):</span>
                <span className="text-text-default">{audience}</span>
              </div>
              <div className="p-inset-md rounded-control-sm bg-surface-sunken border border-border-default">
                <span className="font-bold text-text-default block mb-stack-xs">معضل اصلی:</span>
                <span className="text-text-default">{problem}</span>
              </div>
              <div className="p-inset-md rounded-control-sm bg-surface-sunken border border-border-default">
                <span className="font-bold text-text-default block mb-stack-xs">پیشنهاد ارزش:</span>
                <span className="text-text-default">{valProp}</span>
              </div>
              <div className="p-inset-md rounded-control-sm bg-surface-sunken border border-border-default">
                <span className="font-bold text-text-default block mb-stack-xs">تمایز کلیدی:</span>
                <span className="text-text-default">{differentiation}</span>
              </div>
            </div>

            <div className="bg-bg-success-subtle border border-border-success-subtle p-inset-md rounded-control-sm text-text-success flex items-center justify-between">
              <span>آمادگی برای تولید اولین دارایی (Positioning Statement):</span>
              <span className="font-bold">۱۰۰٪ کامل</span>
            </div>

            <div className="pt-inset-lg flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-inset-lg py-inset-sm text-body-sm text-text-subtle hover:text-text-default"
              >
                &rarr; بازگشت و اصلاح
              </button>
              <button
                onClick={handleCreateAndGenerate}
                disabled={isGenerating}
                className="px-inset-lg py-inset-sm text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover disabled:opacity-50 rounded-control-sm transition-colors shadow-raised"
              >
                {isGenerating ? 'در حال ساخت اولین دارایی...' : 'تأیید همه و ساخت اولین دارایی'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Aha Moment Result & Context Replay */}
        {step === 3 && generatedOutput && (
          <div className="space-y-stack-md text-body-sm">
            <div className="bg-bg-success-subtle border border-border-success-subtle p-inset-md rounded-control-sm text-text-success font-semibold">
              نخستین دارایی شما در کمتر از ۱۰ دقیقه ساخته شد! این دارایی از این لحظه در منبع حقیقت قفل است.
            </div>

            <div className="p-inset-lg rounded-control bg-surface-sunken border border-border-default text-text-default leading-relaxed whitespace-pre-line">
              {generatedOutput.content}
            </div>

            {/* Context Replay Aha Box */}
            <div className="bg-surface-raised p-inset-lg rounded-control border border-border-brand-subtle space-y-stack-sm">
              <div className="flex items-center gap-inline-sm text-text-brand font-bold">
                <span>لحظهٔ Aha در مبدأ: Context Replay</span>
              </div>
              <p className="text-text-subtle leading-relaxed">
                این خروجی به دلیل فکت‌ها و تصمیماتی که در گام اول وارد کردید مخصوص بیزنس شما ساخته شد. هر زمان هر کدام از آن ۵ تصمیم را در درخت دانش تغییر دهید، می‌توانید این خروجی را با نصف قیمت بازسازی کنید.
              </p>
            </div>

            <div className="pt-inset-lg flex justify-end">
              <button
                onClick={onClose}
                className="px-inset-xl py-inset-sm text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors"
              >
                ورود به استودیوی مبدأ &larr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
