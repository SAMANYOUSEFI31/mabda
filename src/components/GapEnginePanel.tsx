/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GapItem, ReadinessResult, WorkstreamSpec } from '../types';

interface GapEnginePanelProps {
  spec: WorkstreamSpec;
  readiness: ReadinessResult;
  onAnswerGap: (gap: GapItem, answer: string) => void;
  onIgnoreGap: (gap: GapItem) => void;
  onProceedAnyway: () => void;
}

export const GapEnginePanel: React.FC<GapEnginePanelProps> = ({
  spec,
  readiness,
  onAnswerGap,
  onIgnoreGap,
  onProceedAnyway,
}) => {
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [expandedGapKey, setExpandedGapKey] = useState<string | null>(
    readiness.gaps.length > 0 ? readiness.gaps[0].key : null
  );

  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-6 text-right">
      {/* Header & Readiness Gauge */}
      <div className="border-b border-[#27272a] pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">موتور تحلیل شکاف‌ها (Gap Engine)</h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                readiness.status === 'ready'
                  ? 'bg-[#10b981]/15 text-[#34d399]'
                  : readiness.status === 'needs_work'
                  ? 'bg-[#f59e0b]/15 text-[#fbbf24]'
                  : 'bg-[#e11d48]/15 text-[#fb7185]'
              }`}
            >
              {readiness.status === 'ready'
                ? 'آماده تولید'
                : readiness.status === 'needs_work'
                ? 'آمادگی متوسط'
                : 'نیاز به داده‌های پایه'}
            </span>
          </div>
          <p className="text-xs text-[#a1a1aa] mt-1 leading-relaxed">
            {readiness.summary}
          </p>
        </div>

        {/* Readiness Score Pill & Progress */}
        <div className="flex items-center gap-3 bg-[#09090b] border border-[#27272a] px-4 py-2.5 rounded-xl shrink-0">
          <div className="text-left">
            <span className="text-[11px] text-[#a1a1aa] block">میزان آمادگی (Readiness)</span>
            <span className="text-xl font-bold text-white tabular-nums">
              {readiness.score}٪
            </span>
          </div>
          <div className="w-16 h-2 bg-[#27272a] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                readiness.score >= 85
                  ? 'bg-[#10b981]'
                  : readiness.score >= 50
                  ? 'bg-[#f59e0b]'
                  : 'bg-[#e11d48]'
              }`}
              style={{ width: `${readiness.score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Free Gap Cost Notice (Principle P3) */}
      <div className="bg-[#09090b] p-3 rounded-lg border border-[#27272a] flex items-center justify-between text-xs text-[#a1a1aa]">
        <div className="flex items-center gap-2">
          <span className="text-[#38bdf8] font-bold">اصل P3:</span>
          <span>تحلیل Gap و ساختاردهی به دانش برای کاربر کاملاً رایگان است؛ هزینه تنها برای خروجی‌های تأییدشده است.</span>
        </div>
        <span className="text-[11px] text-[#10b981] font-semibold bg-[#10b981]/10 px-2 py-0.5 rounded">
          ۰ اعتبار (Free)
        </span>
      </div>

      {/* Gaps List */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-white">
          شکاف‌های شناسایی‌شده ({readiness.gaps.length} مورد):
        </h4>

        {readiness.gaps.length === 0 ? (
          <div className="p-6 rounded-lg bg-[#09090b] border border-[#10b981]/30 text-center space-y-2">
            <p className="text-[#34d399] font-bold text-sm">
              هیچ شکافی وجود ندارد! تمام مؤلفه‌های لازم و پیشنهادی در منبع حقیقت ثبت شده‌اند.
            </p>
            <p className="text-xs text-[#a1a1aa]">
              می‌توانید خروجی‌های این جریان کاری را با حداکثر انسجام و غنای تخصصی تولید نمایید.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {readiness.gaps.map((gap, idx) => {
              const isExpanded = expandedGapKey === gap.key;

              return (
                <div
                  key={gap.key}
                  className={`border rounded-xl transition-all overflow-hidden ${
                    gap.importance === 'required'
                      ? 'border-[#e11d48]/30 bg-[#09090b]'
                      : 'border-[#27272a] bg-[#09090b]/60'
                  }`}
                >
                  <div
                    onClick={() => setExpandedGapKey(isExpanded ? null : gap.key)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#18181b]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-[#27272a] text-[#a1a1aa] flex items-center justify-center text-xs font-mono">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">
                            {gap.label}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              gap.importance === 'required'
                                ? 'bg-[#e11d48]/20 text-[#fb7185] font-bold'
                                : 'bg-[#27272a] text-[#a1a1aa]'
                            }`}
                          >
                            {gap.importance === 'required' ? 'الزامی' : 'پیشنهادی'}
                          </span>
                          {gap.status === 'ambiguous' && (
                            <span className="text-[10px] bg-[#f59e0b]/20 text-[#fbbf24] px-1.5 py-0.5 rounded">
                              مبهم
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#a1a1aa] mt-0.5">{gap.question}</p>
                      </div>
                    </div>

                    <span className="text-xs text-[#7d7d86]">
                      {isExpanded ? 'بستن ▲' : 'پاسخ و تکمیل ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="p-4 border-t border-[#27272a] bg-[#18181b]/80 space-y-3">
                      <p className="text-xs text-[#d4d4d8] font-medium">
                        گزینه‌های پیشنهادی برای ثبت سریع در منبع حقیقت:
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {gap.suggestedAnswers.map((ans, aIdx) => (
                          <button
                            key={aIdx}
                            onClick={() => onAnswerGap(gap, ans)}
                            className="text-xs text-right bg-[#09090b] hover:bg-[#27272a] text-[#fafafa] border border-[#27272a] hover:border-[#e11d48] px-3 py-1.5 rounded-lg transition-all"
                          >
                            «{ans}»
                          </button>
                        ))}
                      </div>

                      {/* Custom answer input */}
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          placeholder="یا پاسخ دقیق خود را اینجا بنویسید..."
                          value={customAnswers[gap.key] || ''}
                          onChange={(e) =>
                            setCustomAnswers({ ...customAnswers, [gap.key]: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customAnswers[gap.key]?.trim()) {
                              onAnswerGap(gap, customAnswers[gap.key].trim());
                            }
                          }}
                          className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#e11d48]"
                        />
                        <button
                          onClick={() => {
                            if (customAnswers[gap.key]?.trim()) {
                              onAnswerGap(gap, customAnswers[gap.key].trim());
                            }
                          }}
                          disabled={!customAnswers[gap.key]?.trim()}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#e11d48] hover:bg-[#be123c] disabled:opacity-40 rounded-lg transition-colors"
                        >
                          ثبت پاسخ
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#27272a]/40 text-xs text-[#a1a1aa]">
                        <button
                          onClick={() => onIgnoreGap(gap)}
                          className="hover:text-white transition-colors text-[11px]"
                        >
                          نادیده گرفتن این شکاف
                        </button>
                        <span className="text-[11px] text-[#7d7d86]">
                          پاسخ مستقیم به عنوان یک شیء تأییدشده در شاخه {gap.nodeId} ثبت می‌شود.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Permission to continue even with gaps */}
      {readiness.gaps.length > 0 && (
        <div className="pt-2 flex items-center justify-between border-t border-[#27272a]">
          <span className="text-xs text-[#f59e0b]">
            نکته مبدأ: Gap راهنماست نه درِ بسته؛ در صورت تمایل می‌توانید با همین اطلاعات ادامه دهید.
          </span>
          <button
            onClick={onProceedAnyway}
            className="px-3 py-1.5 text-xs font-medium text-[#d4d4d8] hover:text-white bg-[#27272a] hover:bg-[#3f3f46] rounded-lg transition-colors"
          >
            ادامه با هشدار کیفیت کمتر &larr;
          </button>
        </div>
      )}
    </div>
  );
};
