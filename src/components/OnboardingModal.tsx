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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm text-right animate-in fade-in">
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e11d48] text-white flex items-center justify-center font-bold text-sm">
              {step}/۳
            </span>
            <div>
              <h3 className="text-base font-bold text-white">
                {step === 1
                  ? 'گام اول: ورود ۵ حقیقت اساسی کسب‌وکار'
                  : step === 2
                  ? 'گام دوم: تأیید دانشی که مبدأ فهمید'
                  : 'گام سوم: Aha Moment — اولین دارایی با Context Replay'}
              </h3>
              <p className="text-xs text-[#a1a1aa] mt-0.5">
                مسیر Onboarding سریع تا اولین خروجی منسجم (کمتر از ۱۰ دقیقه)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#a1a1aa] hover:text-white p-1 rounded-md hover:bg-[#27272a] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* STEP 1: 5 Questions */}
        {step === 1 && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[#fafafa] font-semibold mb-1">
                ۱. روی چه کاری کار می‌کنی؟ (حوزه تخصصی)
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#e11d48]"
              />
            </div>

            <div>
              <label className="block text-[#fafafa] font-semibold mb-1">
                ۲. مخاطب اصلی تو کیست؟ (خریدار یا کاربر ایده‌آل)
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#e11d48]"
              />
            </div>

            <div>
              <label className="block text-[#fafafa] font-semibold mb-1">
                ۳. بزرگ‌ترین معضل و درد مشتری‌ات چیست؟
              </label>
              <textarea
                rows={2}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#e11d48]"
              />
            </div>

            <div>
              <label className="block text-[#fafafa] font-semibold mb-1">
                ۴. راه‌حل و پیشنهاد ارزش تو چگونه این درد را حل می‌کند؟
              </label>
              <textarea
                rows={2}
                value={valProp}
                onChange={(e) => setValProp(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#e11d48]"
              />
            </div>

            <div>
              <label className="block text-[#fafafa] font-semibold mb-1">
                ۵. تمایز کلیدی یا خط قرمز تو چیست؟
              </label>
              <input
                type="text"
                value={differentiation}
                onChange={(e) => setDifferentiation(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#e11d48]"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-2 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors shadow-sm"
              >
                بررسی اشیاء پیشنهادی دانش &larr;
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Review Proposed Objects */}
        {step === 2 && (
          <div className="space-y-4 text-xs">
            <p className="text-[#a1a1aa] leading-relaxed">
              این ۵ شیء دانشی است که مبدأ استخراج کرد. در مبدأ تا زمانی که کاربر تأیید نکند، هیچ موردی وارد خروجی‌ها نمی‌شود (اصل P2):
            </p>

            <div className="space-y-2.5">
              <div className="p-3 rounded-lg bg-[#09090b] border border-[#27272a]">
                <span className="font-bold text-white block mb-0.5">حوزه کسب‌وکار:</span>
                <span className="text-[#d4d4d8]">{domain}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#09090b] border border-[#27272a]">
                <span className="font-bold text-white block mb-0.5">مخاطب اصلی (ICP):</span>
                <span className="text-[#d4d4d8]">{audience}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#09090b] border border-[#27272a]">
                <span className="font-bold text-white block mb-0.5">معضل اصلی:</span>
                <span className="text-[#d4d4d8]">{problem}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#09090b] border border-[#27272a]">
                <span className="font-bold text-white block mb-0.5">پیشنهاد ارزش:</span>
                <span className="text-[#d4d4d8]">{valProp}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#09090b] border border-[#27272a]">
                <span className="font-bold text-white block mb-0.5">تمایز کلیدی:</span>
                <span className="text-[#d4d4d8]">{differentiation}</span>
              </div>
            </div>

            <div className="bg-[#10b981]/10 border border-[#10b981]/30 p-3 rounded-lg text-[#34d399] flex items-center justify-between">
              <span>آمادگی برای تولید اولین دارایی (Positioning Statement):</span>
              <span className="font-bold">۱۰۰٪ کامل</span>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-3.5 py-1.5 text-xs text-[#a1a1aa] hover:text-white"
              >
                &rarr; بازگشت و اصلاح
              </button>
              <button
                onClick={handleCreateAndGenerate}
                disabled={isGenerating}
                className="px-5 py-2 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] disabled:opacity-50 rounded-lg transition-colors shadow-sm"
              >
                {isGenerating ? 'در حال ساخت اولین دارایی...' : 'تأیید همه و ساخت اولین دارایی'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Aha Moment Result & Context Replay */}
        {step === 3 && generatedOutput && (
          <div className="space-y-4 text-xs">
            <div className="bg-[#10b981]/15 border border-[#10b981]/40 p-3 rounded-lg text-[#34d399] font-medium">
              نخستین دارایی شما در کمتر از ۱۰ دقیقه ساخته شد! این دارایی از این لحظه در منبع حقیقت قفل است.
            </div>

            <div className="p-4 rounded-xl bg-[#09090b] border border-[#27272a] text-[#fafafa] leading-loose whitespace-pre-line">
              {generatedOutput.content}
            </div>

            {/* Context Replay Aha Box */}
            <div className="bg-[#18181b] p-4 rounded-xl border border-[#fb7185]/30 space-y-2">
              <div className="flex items-center gap-2 text-[#fb7185] font-bold">
                <span>لحظهٔ Aha در مبدأ: Context Replay</span>
              </div>
              <p className="text-[#a1a1aa] leading-relaxed">
                این خروجی به دلیل فکت‌ها و تصمیماتی که در گام اول وارد کردید مخصوص بیزنس شما ساخته شد. هر زمان هر کدام از آن ۵ تصمیم را در درخت دانش تغییر دهید، می‌توانید این خروجی را با نصف قیمت بازسازی کنید.
              </p>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors"
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
