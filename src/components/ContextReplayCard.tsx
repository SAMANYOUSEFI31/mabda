/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, GeneratedDeliverable } from '../types';

interface ContextReplayCardProps {
  deliverable: GeneratedDeliverable;
  allContextObjects: ContextObject[];
  onOpenContextObject: (obj: ContextObject) => void;
  onRebuild: (deliverable: GeneratedDeliverable) => void;
  isRebuilding?: boolean;
}

export const ContextReplayCard: React.FC<ContextReplayCardProps> = ({
  deliverable,
  allContextObjects,
  onOpenContextObject,
  onRebuild,
  isRebuilding = false,
}) => {
  const [showCritique, setShowCritique] = useState(false);
  const [showRawContext, setShowRawContext] = useState(false);
  const [copied, setCopied] = useState(false);

  const usedObjects = (deliverable.usedContextIds || [])
    .map((id) => allContextObjects.find((c) => c.id === id))
    .filter(Boolean) as ContextObject[];

  const handleCopy = () => {
    navigator.clipboard.writeText(deliverable.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-5 text-right shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#27272a] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">{deliverable.title}</h3>
            <span className="text-[10px] bg-[#e11d48]/15 text-[#fb7185] px-2 py-0.5 rounded font-semibold">
              حالت {deliverable.executionMode === 'critique' ? 'Critique عمیق' : deliverable.executionMode === 'sensitive' ? 'حساس (Sensitive)' : 'متعادل (Auto)'}
            </span>
            {deliverable.rebuildCount > 0 && (
              <span className="text-[10px] bg-[#10b981]/15 text-[#34d399] px-2 py-0.5 rounded">
                بازسازی‌شده ({deliverable.rebuildCount})
              </span>
            )}
          </div>
          <span className="text-[11px] text-[#7d7d86]">
            {new Date(deliverable.createdAt).toLocaleDateString('fa-IR')} · مصرف اعتبار: {deliverable.creditCost}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 text-xs text-[#d4d4d8] hover:text-white bg-[#09090b] border border-[#27272a] rounded hover:border-[#52525b] transition-colors"
          >
            {copied ? 'کپی شد ✓' : 'کپی خروجی'}
          </button>
          {deliverable.critiqueFeedback && (
            <button
              onClick={() => setShowCritique(!showCritique)}
              className="px-2.5 py-1 text-xs text-[#38bdf8] bg-[#0284c7]/10 hover:bg-[#0284c7]/20 border border-[#0284c7]/30 rounded transition-colors"
            >
              نقد و چک‌لیست ({deliverable.critiqueFeedback.score}٪)
            </button>
          )}
        </div>
      </div>

      {/* Main Content Render */}
      <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-5 text-xs text-[#fafafa] leading-loose whitespace-pre-line font-normal">
        {deliverable.content}
      </div>

      {/* Critique breakdown if enabled */}
      {showCritique && deliverable.critiqueFeedback && (
        <div className="bg-[#0c4a6e]/20 border border-[#0284c7]/40 rounded-lg p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#38bdf8]">
              ارزیابی منتقد هوشمند و چک‌لیست پذیرش:
            </span>
            <span className="font-bold text-white tabular-nums">
              امتیاز کیفیت: {deliverable.critiqueFeedback.score} از ۱۰۰
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div className="space-y-1">
              <span className="text-[#34d399] font-semibold">نقاط قوت محتوا:</span>
              <ul className="list-disc list-inside text-[#d4d4d8] space-y-0.5">
                {deliverable.critiqueFeedback.strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-1">
              <span className="text-[#fbbf24] font-semibold">اصلاحات اعمال‌شده:</span>
              <ul className="list-disc list-inside text-[#d4d4d8] space-y-0.5">
                {deliverable.critiqueFeedback.improvementsMade.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Context Replay Section (The Aha Moment) */}
      <div className="bg-[#09090b]/80 border border-[#27272a] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#fb7185] font-bold text-xs">Context Replay:</span>
            <span className="text-xs text-[#a1a1aa]">
              این خروجی بر پایهٔ {usedObjects.length} قلم از دانش کسب‌وکار شما ساخته شد.
            </span>
          </div>

          <button
            onClick={() => setShowRawContext(!showRawContext)}
            className="text-[11px] text-[#7d7d86] hover:text-[#a1a1aa]"
          >
            {showRawContext ? 'بستن پیش‌نمایش ▲' : 'مشاهده ورودی‌ها ▼'}
          </button>
        </div>

        {/* Source context badges */}
        <div className="flex flex-wrap gap-2 pt-1">
          {usedObjects.map((ctx) => (
            <button
              key={ctx.id}
              onClick={() => onOpenContextObject(ctx)}
              title="کلیک برای مشاهده و اصلاح زمینه"
              className="flex items-center gap-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-[#fb7185] px-2.5 py-1 rounded-md text-xs text-[#fafafa] transition-all group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#e11d48]" />
              <span className="group-hover:text-[#fb7185]">{ctx.title}</span>
              <span className="text-[10px] text-[#7d7d86]">({ctx.type})</span>
            </button>
          ))}
        </div>

        {showRawContext && (
          <div className="pt-2 border-t border-[#27272a] space-y-2">
            {usedObjects.map((ctx) => (
              <div key={ctx.id} className="text-[11px] bg-[#18181b] p-2 rounded border border-[#27272a]/60">
                <span className="font-semibold text-white block mb-0.5">{ctx.title}:</span>
                <span className="text-[#a1a1aa]">{ctx.content}</span>
              </div>
            ))}
          </div>
        )}

        {/* Rebuild Action (50% Discount) */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#27272a]/60">
          <span className="text-[11px] text-[#a1a1aa]">
            آیا دانشی را تغییر دادی؟ بازسازی با نصف قیمت ({Math.ceil(deliverable.creditCost * 0.5)} اعتبار) انجام می‌شود.
          </span>
          <button
            onClick={() => onRebuild(deliverable)}
            disabled={isRebuilding}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#09090b] hover:bg-[#27272a] border border-[#e11d48] rounded-lg transition-colors shrink-0 disabled:opacity-50"
          >
            {isRebuilding ? 'در حال بازسازی خروجی...' : 'بازسازی با ۵۰٪ تخفیف (Rebuild)'}
          </button>
        </div>
      </div>
    </article>
  );
};
