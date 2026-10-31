/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GapItem, ReadinessResult, WorkstreamSpec } from '../types';
import { DEFAULT_TREE_NODES } from '../core/specs';
import type { TreeNode } from '../types';
import { Badge, Button, Card, GapBadge, Icon, Progress, ReadinessBadge, TextField, formatNumber } from '../ui';

interface GapEnginePanelProps {
  spec: WorkstreamSpec;
  readiness: ReadinessResult;
  onAnswerGap: (gap: GapItem, answer: string) => void;
  onIgnoreGap: (gap: GapItem) => void;
  onProceedAnyway: () => void;
  nodes?: TreeNode[];
}

export const GapEnginePanel: React.FC<GapEnginePanelProps> = ({
  spec,
  readiness,
  onAnswerGap,
  onIgnoreGap,
  onProceedAnyway,
  nodes,
}) => {
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [expandedGapKey, setExpandedGapKey] = useState<string | null>(
    readiness.gaps.length > 0 ? readiness.gaps[0].key : null
  );

  const nodeLabel = (id: string) => (nodes ?? DEFAULT_TREE_NODES).find((n) => n.id === id)?.label ?? id;
  const submitCustom = (gap: GapItem) => {
    const v = customAnswers[gap.key]?.trim();
    if (v) onAnswerGap(gap, v);
  };

  return (
    <Card padding="xl" className="flex flex-col gap-stack-lg">
      {/* Header & readiness */}
      <div className="flex flex-col justify-between gap-inline-lg border-b border-border-default pb-inset-lg md:flex-row md:items-center">
        <div className="flex flex-col gap-stack-xs">
          <div className="flex flex-wrap items-center gap-inline-sm">
            <h3 className="heading-xs text-text-default">موتور تحلیل شکاف‌ها (Gap Engine)</h3>
            <ReadinessBadge value={readiness.status} />
          </div>
          <p className="body-sm text-text-subtle">{readiness.summary}</p>
        </div>

        <div className="flex min-w-overlay-xs shrink-0 flex-col gap-stack-xs rounded-control border border-border-default bg-surface-sunken px-inset-lg py-inset-md">
          <span className="caption text-text-subtle">میزان آمادگی (Readiness)</span>
          <span className="text-numeric-md tabular-nums text-text-default">{formatNumber(readiness.score)}٪</span>
          <Progress value={readiness.score} label="آمادگی خروجی" showValue={false} intent={readiness.score >= 85 ? 'success' : 'warning'} />
        </div>
      </div>

      {/* Free gap cost notice (P3) */}
      <div className="flex flex-col gap-inline-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-md sm:flex-row sm:items-center sm:justify-between">
        <p className="body-sm text-text-subtle">
          <span className="label-md text-text-info">اصل P3: </span>
          تحلیل Gap و ساختاردهی به دانش برای کاربر کاملاً رایگان است؛ هزینه فقط برای خروجی‌های تأییدشده است.
        </p>
        <Badge intent="success">۰ اعتبار</Badge>
      </div>

      {/* Gaps */}
      <div className="flex flex-col gap-stack-md">
        <h4 className="title text-text-default">شکاف‌های شناسایی‌شده ({formatNumber(readiness.gaps.length)} مورد)</h4>

        {readiness.gaps.length === 0 ? (
          <div className="flex flex-col items-center gap-stack-sm rounded-control-sm border border-border-success-subtle bg-surface-sunken p-inset-xl text-center">
            <Icon name="CircleCheck" size="2xl" className="text-icon-success" />
            <p className="title text-text-success">هیچ شکافی وجود ندارد! تمام مؤلفه‌های لازم و پیشنهادی در منبع حقیقت ثبت شده‌اند.</p>
            <p className="body-sm text-text-subtle">می‌توانی خروجی‌های این جریان کاری را با حداکثر انسجام و غنای تخصصی تولید کنی.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-stack-md">
            {readiness.gaps.map((gap, idx) => {
              const isExpanded = expandedGapKey === gap.key;
              return (
                <div key={gap.key} className="overflow-hidden rounded-control border border-border-default bg-surface-sunken">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedGapKey(isExpanded ? null : gap.key)}
                    className="flex min-h-touch-comfortable w-full items-center justify-between gap-inline-md p-inset-lg text-start transition-colors hover:bg-interaction-hover active:bg-interaction-pressed"
                  >
                    <span className="flex items-start gap-inline-md">
                      <span className="grid size-space-6 shrink-0 place-items-center rounded-pill bg-bg-neutral-subtle label-sm tabular-nums text-text-subtle">
                        {formatNumber(idx + 1)}
                      </span>
                      <span className="flex flex-col gap-stack-xs">
                        <span className="flex flex-wrap items-center gap-inline-sm">
                          <span className="title text-text-default">{gap.label}</span>
                          <GapBadge value={gap.importance} />
                          {gap.status === 'ambiguous' && <Badge intent="warning">مبهم</Badge>}
                        </span>
                        <span className="body-sm text-text-subtle">{gap.question}</span>
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-inline-xs body-sm text-text-subtle">
                      {isExpanded ? 'بستن' : 'پاسخ و تکمیل'}
                      <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size="md" />
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-stack-md border-t border-border-default bg-surface-raised p-inset-lg">
                      <p className="label-md text-text-default">گزینه‌های پیشنهادی برای ثبت سریع در منبع حقیقت:</p>
                      <div className="flex flex-wrap gap-inline-sm">
                        {gap.suggestedAnswers.map((ans, aIdx) => (
                          <Button key={aIdx} variant="secondary" onClick={() => onAnswerGap(gap, ans)}>
                            «{ans}»
                          </Button>
                        ))}
                      </div>

                      <div className="flex flex-col items-stretch gap-inline-sm sm:flex-row sm:items-end">
                        <TextField
                          label="یا پاسخ دقیق خودت را بنویس"
                          placeholder="پاسخ…"
                          value={customAnswers[gap.key] || ''}
                          onChange={(e) => setCustomAnswers({ ...customAnswers, [gap.key]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitCustom(gap);
                          }}
                        />
                        <Button variant="secondary" disabled={!customAnswers[gap.key]?.trim()} onClick={() => submitCustom(gap)}>
                          ثبت پاسخ
                        </Button>
                      </div>

                      <div className="flex flex-col gap-inline-sm border-t border-border-subtle pt-inset-md sm:flex-row sm:items-center sm:justify-between">
                        <Button variant="ghost" size="sm" onClick={() => onIgnoreGap(gap)}>نادیده گرفتن این شکاف</Button>
                        <span className="caption text-text-subtle">
                          پاسخ مستقیم به‌عنوان یک شیء تأییدشده در شاخهٔ «{nodeLabel(gap.nodeId)}» ثبت می‌شود.
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

      {readiness.gaps.length > 0 && (
        <div className="flex flex-col gap-inline-md border-t border-border-default pt-inset-md sm:flex-row sm:items-center sm:justify-between">
          <span className="body-sm text-text-warning">
            نکتهٔ مبدأ: Gap راهنماست نه درِ بسته؛ اگر بخواهی می‌توانی با همین اطلاعات ادامه بدهی.
          </span>
          <Button variant="secondary" iconEnd="ArrowLeft" onClick={onProceedAnyway}>
            ادامه با هشدار کیفیت کمتر
          </Button>
        </div>
      )}
    </Card>
  );
};
