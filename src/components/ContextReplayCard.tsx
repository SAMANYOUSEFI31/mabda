/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, GeneratedDeliverable } from '../types';
import { Alert, Badge, Button, Card, Divider, Markdown, ModeBadge, TYPE_META, formatJalaliDate, formatNumber } from '../ui';
import { PlanLine } from './AiNotices';
import { BlockView } from './BlockView';
import { contextDraftFromBlock } from '../core/blocks';

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
    <Card padding="xl" className="flex flex-col gap-stack-lg" aria-label={deliverable.title}>
      {/* Header */}
      <div className="flex flex-col justify-between gap-inline-md border-b border-border-default pb-inset-md sm:flex-row sm:items-center">
        <div className="flex flex-col gap-stack-xs">
          <div className="flex flex-wrap items-center gap-inline-sm">
            <h3 className="title text-text-default">{deliverable.title}</h3>
            <ModeBadge value={deliverable.executionMode} />
            {deliverable.rebuildCount > 0 && (
              <Badge intent="success" icon="RefreshCw">بازسازی‌شده ({formatNumber(deliverable.rebuildCount)})</Badge>
            )}
          </div>
          <span className="caption text-text-subtle">
            {formatJalaliDate(deliverable.createdAt)} · مصرف اعتبار: {formatNumber(deliverable.creditCost)}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-inline-sm">
          <Button variant="secondary" size="sm" iconStart={copied ? 'Check' : 'Copy'} onClick={handleCopy}>
            {copied ? 'کپی شد' : 'کپی خروجی'}
          </Button>
          {deliverable.critiqueFeedback && (
            <Button
              variant="secondary"
              size="sm"
              iconStart="Eye"
              aria-expanded={showCritique}
              onClick={() => setShowCritique(!showCritique)}
            >
              نقد و چک‌لیست ({formatNumber(deliverable.critiqueFeedback.score)}٪)
            </Button>
          )}
        </div>
      </div>

      {deliverable.validationFailed && (
        <Alert intent="warning" title="اعتبارسنج این خروجی را کامل تأیید نکرد">
          بعد از تلاش و ارتقای مدل هم بعضی معیارهای پذیرش یا گاردریل‌ها برقرار نبود. پیش از استفاده خودت بازبینی کن یا دوباره بساز.
        </Alert>
      )}

      {/* Main content (Markdown; blocks keep per-block actions) */}
      <div className="flex flex-col gap-stack-md rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg text-text-default">
        {deliverable.blocks && deliverable.blocks.length > 0 ? (
          deliverable.blocks.map((b) => (
            <BlockView key={b.id} block={b} onAddToContext={(blk) => onOpenContextObject(contextDraftFromBlock(blk, deliverable.workspaceId))} />
          ))
        ) : (
          <Markdown>{deliverable.content}</Markdown>
        )}
      </div>
      <PlanLine plan={deliverable.plan} usage={deliverable.usage} credits={deliverable.creditCost} />

      {/* Critique breakdown */}
      {showCritique && deliverable.critiqueFeedback && (
        <div className="flex flex-col gap-stack-md rounded-control-sm border border-border-info-subtle bg-bg-info-subtle p-inset-lg">
          <div className="flex flex-wrap items-center justify-between gap-inline-sm">
            <span className="label-md text-text-info">ارزیابی منتقد هوشمند و چک‌لیست پذیرش</span>
            <span className="label-md tabular-nums text-text-default">
              امتیاز کیفیت: {formatNumber(deliverable.critiqueFeedback.score)} از ۱۰۰
            </span>
          </div>

          <div className="grid grid-cols-1 gap-inline-md md:grid-cols-2">
            <div className="flex flex-col gap-stack-xs">
              <span className="label-md text-text-success">نقاط قوت محتوا</span>
              <ul className="body-sm list-inside list-disc text-text-default">
                {deliverable.critiqueFeedback.strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-stack-xs">
              <span className="label-md text-text-warning">اصلاحات اعمال‌شده</span>
              <ul className="body-sm list-inside list-disc text-text-default">
                {deliverable.critiqueFeedback.improvementsMade.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Context Replay (the Aha moment) */}
      <div className="flex flex-col gap-stack-md rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
        <div className="flex flex-wrap items-center justify-between gap-inline-sm">
          <div className="flex flex-wrap items-baseline gap-inline-sm">
            <span className="label-md text-text-default">Context Replay</span>
            <span className="body-sm text-text-subtle">
              این خروجی بر پایهٔ {formatNumber(usedObjects.length)} قلم از دانش کسب‌وکار شما ساخته شد.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconEnd={showRawContext ? 'ChevronUp' : 'ChevronDown'}
            aria-expanded={showRawContext}
            onClick={() => setShowRawContext(!showRawContext)}
          >
            {showRawContext ? 'بستن ورودی‌ها' : 'مشاهدهٔ ورودی‌ها'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-inline-sm">
          {usedObjects.map((ctx) => (
            <Button
              key={ctx.id}
              variant="secondary"
              size="sm"
              title="مشاهده و اصلاح این Context"
              onClick={() => onOpenContextObject(ctx)}
            >
              {ctx.title}
              <span className="caption ms-inline-xs text-text-subtle">({TYPE_META[ctx.type].label})</span>
            </Button>
          ))}
        </div>

        {showRawContext && (
          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-md">
            {usedObjects.map((ctx) => (
              <div key={ctx.id} className="rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
                <span className="label-md mb-stack-xs block text-text-default">{ctx.title}</span>
                <span className="body-sm text-text-subtle">{ctx.content}</span>
              </div>
            ))}
          </div>
        )}

        <Divider />
        <div className="flex flex-col justify-between gap-inline-md sm:flex-row sm:items-center">
          <span className="body-sm text-text-subtle">
            آیا دانشی را تغییر دادی؟ بازسازی با نصف قیمت ({formatNumber(Math.ceil(deliverable.creditCost * 0.5))} اعتبار) انجام می‌شود.
          </span>
          <Button variant="secondary" iconStart="RefreshCw" loading={isRebuilding} onClick={() => onRebuild(deliverable)}>
            بازسازی با ۵۰٪ تخفیف
          </Button>
        </div>
      </div>
    </Card>
  );
};
