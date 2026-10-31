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
    <article className="bg-surface-raised border border-border-default rounded-control p-inset-xl space-y-stack-lg text-end shadow-raised">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-inline-md border-b border-border-default pb-inset-md">
        <div>
          <div className="flex items-center gap-inline-sm">
            <h3 className="text-body-md font-bold text-text-default">{deliverable.title}</h3>
            <span className="text-caption bg-bg-brand-subtle text-text-brand px-inset-sm py-inset-xs rounded-indicator font-semibold">
              حالت {deliverable.executionMode === 'critique' ? 'Critique عمیق' : deliverable.executionMode === 'sensitive' ? 'حساس (Sensitive)' : 'متعادل (Auto)'}
            </span>
            {deliverable.rebuildCount > 0 && (
              <span className="text-caption bg-bg-success-subtle text-text-success px-inset-sm py-inset-xs rounded-indicator">
                بازسازی‌شده ({deliverable.rebuildCount})
              </span>
            )}
          </div>
          <span className="text-caption text-text-subtlest">
            {new Date(deliverable.createdAt).toLocaleDateString('fa-IR')} · مصرف اعتبار: {deliverable.creditCost}
          </span>
        </div>

        <div className="flex items-center gap-inline-sm shrink-0">
          <button
            onClick={handleCopy}
            className="px-inset-md py-inset-xs text-body-sm text-text-default hover:text-text-default bg-surface-sunken border border-border-default rounded-indicator hover:border-border-bold transition-colors"
          >
            {copied ? 'کپی شد ✓' : 'کپی خروجی'}
          </button>
          {deliverable.critiqueFeedback && (
            <button
              onClick={() => setShowCritique(!showCritique)}
              className="px-inset-md py-inset-xs text-body-sm text-text-info bg-bg-info-subtle hover:bg-bg-info-subtle border border-border-info-subtle rounded-indicator transition-colors"
            >
              نقد و چک‌لیست ({deliverable.critiqueFeedback.score}٪)
            </button>
          )}
        </div>
      </div>

      {/* Main Content Render */}
      <div className="bg-surface-sunken border border-border-default rounded-control-sm p-inset-lg text-body-sm text-text-default leading-relaxed whitespace-pre-line font-regular">
        {deliverable.content}
      </div>

      {/* Critique breakdown if enabled */}
      {showCritique && deliverable.critiqueFeedback && (
        <div className="bg-bg-info-subtle border border-border-info-subtle rounded-control-sm p-inset-lg space-y-stack-md text-body-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-text-info">
              ارزیابی منتقد هوشمند و چک‌لیست پذیرش:
            </span>
            <span className="font-bold text-text-default tabular-nums">
              امتیاز کیفیت: {deliverable.critiqueFeedback.score} از ۱۰۰
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-inline-md text-caption">
            <div className="space-y-stack-xs">
              <span className="text-text-success font-semibold">نقاط قوت محتوا:</span>
              <ul className="list-disc list-inside text-text-default space-y-stack-xs">
                {deliverable.critiqueFeedback.strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-stack-xs">
              <span className="text-text-warning font-semibold">اصلاحات اعمال‌شده:</span>
              <ul className="list-disc list-inside text-text-default space-y-stack-xs">
                {deliverable.critiqueFeedback.improvementsMade.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Context Replay Section (The Aha Moment) */}
      <div className="bg-surface-sunken border border-border-default rounded-control-sm p-inset-lg space-y-stack-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-inline-sm">
            <span className="text-text-brand font-bold text-body-sm">Context Replay:</span>
            <span className="text-body-sm text-text-subtle">
              این خروجی بر پایهٔ {usedObjects.length} قلم از دانش کسب‌وکار شما ساخته شد.
            </span>
          </div>

          <button
            onClick={() => setShowRawContext(!showRawContext)}
            className="text-caption text-text-subtlest hover:text-text-subtle"
          >
            {showRawContext ? 'بستن پیش‌نمایش ▲' : 'مشاهده ورودی‌ها ▼'}
          </button>
        </div>

        {/* Source context badges */}
        <div className="flex flex-wrap gap-inline-sm pt-inset-xs">
          {usedObjects.map((ctx) => (
            <button
              key={ctx.id}
              onClick={() => onOpenContextObject(ctx)}
              title="کلیک برای مشاهده و اصلاح زمینه"
              className="flex items-center gap-inline-sm bg-surface-raised hover:bg-interaction-hover border border-border-default hover:border-border-brand px-inset-md py-inset-xs rounded-control-sm text-body-sm text-text-default transition-all group"
            >
              <span className="w-space-1 h-space-1 rounded-pill bg-bg-brand-bold" />
              <span className="group-hover:text-text-brand">{ctx.title}</span>
              <span className="text-caption text-text-subtlest">({ctx.type})</span>
            </button>
          ))}
        </div>

        {showRawContext && (
          <div className="pt-inset-sm border-t border-border-default space-y-stack-sm">
            {usedObjects.map((ctx) => (
              <div key={ctx.id} className="text-caption bg-surface-raised p-inset-sm rounded-indicator border border-border-subtle">
                <span className="font-semibold text-text-default block mb-stack-xs">{ctx.title}:</span>
                <span className="text-text-subtle">{ctx.content}</span>
              </div>
            ))}
          </div>
        )}

        {/* Rebuild Action (50% Discount) */}
        <div className="pt-inset-sm flex flex-col sm:flex-row sm:items-center justify-between gap-inline-md border-t border-border-subtle">
          <span className="text-caption text-text-subtle">
            آیا دانشی را تغییر دادی؟ بازسازی با نصف قیمت ({Math.ceil(deliverable.creditCost * 0.5)} اعتبار) انجام می‌شود.
          </span>
          <button
            onClick={() => onRebuild(deliverable)}
            disabled={isRebuilding}
            className="px-inset-lg py-inset-sm text-body-sm font-semibold text-text-default bg-surface-sunken hover:bg-interaction-hover border border-border-brand rounded-control-sm transition-colors shrink-0 disabled:opacity-50"
          >
            {isRebuilding ? 'در حال بازسازی خروجی...' : 'بازسازی با ۵۰٪ تخفیف (Rebuild)'}
          </button>
        </div>
      </div>
    </article>
  );
};
