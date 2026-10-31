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
    <div className="bg-surface-raised border border-border-default rounded-control p-inset-xl space-y-stack-lg text-end">
      {/* Header & Readiness Gauge */}
      <div className="border-b border-border-default pb-inset-lg flex flex-col md:flex-row md:items-center justify-between gap-inline-lg">
        <div>
          <div className="flex items-center gap-inline-sm">
            <h3 className="text-heading-xs font-bold text-text-default">موتور تحلیل شکاف‌ها (Gap Engine)</h3>
            <span
              className={`text-caption px-inset-sm py-inset-xs rounded-indicator font-semibold ${
                readiness.status === 'ready'
                  ? 'bg-bg-success-subtle text-text-success'
                  : readiness.status === 'needs_work'
                  ? 'bg-bg-warning-subtle text-text-warning'
                  : 'bg-bg-brand-subtle text-text-brand'
              }`}
            >
              {readiness.status === 'ready'
                ? 'آماده تولید'
                : readiness.status === 'needs_work'
                ? 'آمادگی متوسط'
                : 'نیاز به داده‌های پایه'}
            </span>
          </div>
          <p className="text-body-sm text-text-subtle mt-stack-xs leading-relaxed">
            {readiness.summary}
          </p>
        </div>

        {/* Readiness Score Pill & Progress */}
        <div className="flex items-center gap-inline-md bg-surface-sunken border border-border-default px-inset-lg py-inset-md rounded-control shrink-0">
          <div className="text-start">
            <span className="text-caption text-text-subtle block">میزان آمادگی (Readiness)</span>
            <span className="text-heading-sm font-bold text-text-default tabular-nums">
              {readiness.score}٪
            </span>
          </div>
          <div className="w-space-16 h-space-2 bg-bg-neutral-subtle rounded-pill overflow-hidden">
            <div
              className={`h-full transition-all ${
                readiness.score >= 85
                  ? 'bg-bg-success-bold'
                  : readiness.score >= 50
                  ? 'bg-bg-warning-bold'
                  : 'bg-bg-brand-bold'
              }`}
              style={{ width: `${readiness.score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Free Gap Cost Notice (Principle P3) */}
      <div className="bg-surface-sunken p-inset-md rounded-control-sm border border-border-default flex items-center justify-between text-body-sm text-text-subtle">
        <div className="flex items-center gap-inline-sm">
          <span className="text-text-info font-bold">اصل P3:</span>
          <span>تحلیل Gap و ساختاردهی به دانش برای کاربر کاملاً رایگان است؛ هزینه تنها برای خروجی‌های تأییدشده است.</span>
        </div>
        <span className="text-caption text-text-success font-semibold bg-bg-success-subtle px-inset-sm py-inset-xs rounded-indicator">
          ۰ اعتبار (Free)
        </span>
      </div>

      {/* Gaps List */}
      <div className="space-y-stack-md">
        <h4 className="text-body-md font-semibold text-text-default">
          شکاف‌های شناسایی‌شده ({readiness.gaps.length} مورد):
        </h4>

        {readiness.gaps.length === 0 ? (
          <div className="p-inset-xl rounded-control-sm bg-surface-sunken border border-border-success-subtle text-center space-y-stack-sm">
            <p className="text-text-success font-bold text-body-md">
              هیچ شکافی وجود ندارد! تمام مؤلفه‌های لازم و پیشنهادی در منبع حقیقت ثبت شده‌اند.
            </p>
            <p className="text-body-sm text-text-subtle">
              می‌توانید خروجی‌های این جریان کاری را با حداکثر انسجام و غنای تخصصی تولید نمایید.
            </p>
          </div>
        ) : (
          <div className="space-y-stack-md">
            {readiness.gaps.map((gap, idx) => {
              const isExpanded = expandedGapKey === gap.key;

              return (
                <div
                  key={gap.key}
                  className={`border rounded-control transition-all overflow-hidden ${
                    gap.importance === 'required'
                      ? 'border-border-brand-subtle bg-surface-sunken'
                      : 'border-border-default bg-surface-sunken'
                  }`}
                >
                  <div
                    onClick={() => setExpandedGapKey(isExpanded ? null : gap.key)}
                    className="p-inset-lg flex items-center justify-between cursor-pointer hover:bg-surface-raised transition-colors"
                  >
                    <div className="flex items-center gap-inline-md">
                      <span className="w-space-5 h-space-5 rounded-pill bg-bg-neutral-subtle text-text-subtle flex items-center justify-center text-body-sm font-mono">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-inline-sm">
                          <span className="font-semibold text-text-default text-body-md">
                            {gap.label}
                          </span>
                          <span
                            className={`text-caption px-inset-sm py-inset-xs rounded-indicator ${
                              gap.importance === 'required'
                                ? 'bg-bg-brand-subtle text-text-brand font-bold'
                                : 'bg-bg-neutral-subtle text-text-subtle'
                            }`}
                          >
                            {gap.importance === 'required' ? 'الزامی' : 'پیشنهادی'}
                          </span>
                          {gap.status === 'ambiguous' && (
                            <span className="text-caption bg-bg-warning-subtle text-text-warning px-inset-sm py-inset-xs rounded-indicator">
                              مبهم
                            </span>
                          )}
                        </div>
                        <p className="text-body-sm text-text-subtle mt-stack-xs">{gap.question}</p>
                      </div>
                    </div>

                    <span className="text-body-sm text-text-subtlest">
                      {isExpanded ? 'بستن ▲' : 'پاسخ و تکمیل ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="p-inset-lg border-t border-border-default bg-surface-raised space-y-stack-md">
                      <p className="text-body-sm text-text-default font-semibold">
                        گزینه‌های پیشنهادی برای ثبت سریع در منبع حقیقت:
                      </p>

                      <div className="flex flex-wrap gap-inline-sm">
                        {gap.suggestedAnswers.map((ans, aIdx) => (
                          <button
                            key={aIdx}
                            onClick={() => onAnswerGap(gap, ans)}
                            className="text-body-sm text-end bg-surface-sunken hover:bg-interaction-hover text-text-default border border-border-default hover:border-border-brand px-inset-md py-inset-sm rounded-control-sm transition-all"
                          >
                            «{ans}»
                          </button>
                        ))}
                      </div>

                      {/* Custom answer input */}
                      <div className="flex items-center gap-inline-sm pt-inset-sm">
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
                          className="flex-1 bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-body-sm text-text-default focus:outline-none focus:border-border-brand"
                        />
                        <button
                          onClick={() => {
                            if (customAnswers[gap.key]?.trim()) {
                              onAnswerGap(gap, customAnswers[gap.key].trim());
                            }
                          }}
                          disabled={!customAnswers[gap.key]?.trim()}
                          className="px-inset-md py-inset-sm text-body-sm font-semibold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover disabled:opacity-40 rounded-control-sm transition-colors"
                        >
                          ثبت پاسخ
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-inset-sm border-t border-border-subtle text-body-sm text-text-subtle">
                        <button
                          onClick={() => onIgnoreGap(gap)}
                          className="hover:text-text-default transition-colors text-caption"
                        >
                          نادیده گرفتن این شکاف
                        </button>
                        <span className="text-caption text-text-subtlest">
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
        <div className="pt-inset-sm flex items-center justify-between border-t border-border-default">
          <span className="text-body-sm text-text-warning">
            نکته مبدأ: Gap راهنماست نه درِ بسته؛ در صورت تمایل می‌توانید با همین اطلاعات ادامه دهید.
          </span>
          <button
            onClick={onProceedAnyway}
            className="px-inset-md py-inset-sm text-body-sm font-semibold text-text-default hover:text-text-default bg-bg-neutral-subtle hover:bg-interaction-hover rounded-control-sm transition-colors"
          >
            ادامه با هشدار کیفیت کمتر &larr;
          </button>
        </div>
      )}
    </div>
  );
};
