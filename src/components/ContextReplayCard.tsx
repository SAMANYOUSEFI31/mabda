/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, GeneratedDeliverable } from '../types';
import { Alert, Badge, Button, Card, Divider, Markdown, ModeBadge, TYPE_META, formatJalaliDate, formatNumber } from '../ui';
import { PlanLine } from './AiNotices';
import { useAiStatus } from '../services/aiStatus';
import { halfPriceRebuildAvailable } from '../core/impactEngine';
import type { StaleAsset } from '../core/impactEngine';
import { BlockView } from './BlockView';
import { contextDraftFromBlock } from '../core/blocks';

interface ContextReplayCardProps {
  deliverable: GeneratedDeliverable;
  allContextObjects: ContextObject[];
  onOpenContextObject: (obj: ContextObject) => void;
  onRebuild: (deliverable: GeneratedDeliverable) => void;
  isRebuilding?: boolean;
  /** present when a Context this asset was built from has changed */
  stale?: StaleAsset;
}


export const ContextReplayCard: React.FC<ContextReplayCardProps> = ({
  deliverable,
  allContextObjects,
  onOpenContextObject,
  onRebuild,
  isRebuilding = false,
  stale,
}) => {
  const [showCritique, setShowCritique] = useState(false);
  const [showRawContext, setShowRawContext] = useState(false);
  const [copied, setCopied] = useState(false);

  // exactly what was injected: id + the version the model saw; the object may have moved on since
  const usedObjects = (deliverable.usedContext || [])
    .map((ref) => ({ ref, obj: allContextObjects.find((c) => c.id === ref.id) }))
    .filter((x): x is { ref: typeof x.ref; obj: ContextObject } => !!x.obj);
  const ai = useAiStatus();
  const halfPrice = ai.managedEnabled && halfPriceRebuildAvailable(deliverable, stale);
  // chat-made assets have no workstream spec, so there is nothing to rebuild automatically
  const canRebuild = deliverable.workstreamId !== 'chat';

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
            {stale && <Badge intent="warning" icon="TriangleAlert">قدیمی</Badge>}
            {deliverable.rebuildCount > 0 && (
              <Badge intent="success" icon="RefreshCw">بازسازی‌شده ({formatNumber(deliverable.rebuildCount)})</Badge>
            )}
          </div>
          <span className="caption text-text-subtle">
            {formatJalaliDate(deliverable.createdAt)}{ai.managedEnabled ? ` · مصرف اعتبار: ${formatNumber(deliverable.creditCost)}` : ''}
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

      {stale && (
        <Alert
          intent="warning"
          title="این دارایی قدیمی شده است"
          action={
            canRebuild ? (
              <Button variant="secondary" size="sm" iconStart="RefreshCw" loading={isRebuilding} onClick={() => onRebuild(deliverable)}>
                {halfPrice ? 'بازسازی با نصف قیمت' : 'بازسازی'}
              </Button>
            ) : undefined
          }
        >
          <ul className="list-inside list-disc">
            {stale.reasons.map((r) => (
              <li key={`${r.objectId}-${r.kind}`}>{r.message}</li>
            ))}
          </ul>
        </Alert>
      )}

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

      {deliverable.checks && deliverable.checks.length > 0 && (
        <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg" aria-label="نتیجهٔ بررسی معیارها و گاردریل‌ها">
          <div className="flex flex-wrap items-center justify-between gap-inline-sm">
            <span className="label-md text-text-default">معیارهای پذیرش و گاردریل‌ها</span>
            <Badge intent={deliverable.checks.every((c) => c.passed) ? 'success' : 'warning'} icon={false}>
              {formatNumber(deliverable.checks.filter((c) => c.passed).length)} از {formatNumber(deliverable.checks.length)} برقرار
            </Badge>
          </div>
          <ul className="flex flex-col gap-stack-xs">
            {deliverable.checks.map((c, i) => (
              <li key={i} className="flex items-start gap-inline-sm">
                <Badge intent={c.passed ? 'success' : 'danger'} icon={c.passed ? 'Check' : 'X'}>{c.passed ? 'برقرار' : 'نقض'}</Badge>
                <div className="flex min-w-space-0 flex-col">
                  <span className="body-md text-text-default">{c.kind === 'guardrail' ? 'گاردریل: ' : ''}{c.text}</span>
                  <span className="caption text-text-subtle">{c.reason}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          {usedObjects.map(({ ref, obj: ctx }) => (
            <Button
              key={`${ref.id}-${ref.version}`}
              variant="secondary"
              size="sm"
              title="مشاهده و اصلاح این Context"
              onClick={() => onOpenContextObject(ctx)}
            >
              {ctx.title}
              <span className="caption ms-inline-xs text-text-subtle">
                ({TYPE_META[ctx.type].label} · نسخهٔ {formatNumber(ref.version)}{ctx.version !== ref.version ? `، اکنون ${formatNumber(ctx.version)}` : ''})
              </span>
            </Button>
          ))}
        </div>

        {showRawContext && (
          <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-md">
            {usedObjects.map(({ ref, obj: ctx }) => (
              <div key={`${ref.id}-${ref.version}`} className="rounded-control-sm border border-border-subtle bg-surface-raised p-inset-md">
                <span className="label-md mb-stack-xs block text-text-default">{ctx.title}</span>
                <span className="body-sm text-text-subtle">{ctx.content}</span>
              </div>
            ))}
          </div>
        )}

        <Divider />
        {canRebuild && (
        <div className="flex flex-col justify-between gap-inline-md sm:flex-row sm:items-center">
          <span className="body-sm text-text-subtle">
            {!ai.managedEnabled
              ? (stale ? 'دانشی که این خروجی بر پایهٔ آن ساخته شد تغییر کرده؛ می‌توانی با آخرین نسخه بازسازی کنی.' : 'دانشی تغییر نکرده؛ بازسازی خروجی تازه‌ای با همان دانش می‌سازد.')
              : halfPrice
              ? `دانشی که این خروجی بر پایهٔ آن ساخته شد تغییر کرده؛ بازسازی یک‌بار برای این تغییر با نصف قیمت (حدود ${formatNumber(Math.ceil(deliverable.creditCost * 0.5))} اعتبار) انجام می‌شود.`
              : stale
              ? 'تخفیف نصف‌قیمت برای این تغییر قبلاً استفاده شده است.'
              : 'دانشی تغییر نکرده؛ بازسازی با قیمت کامل انجام می‌شود.'}
          </span>
          <Button variant="secondary" iconStart="RefreshCw" loading={isRebuilding} onClick={() => onRebuild(deliverable)}>
            {halfPrice ? 'بازسازی با نصف قیمت' : 'بازسازی'}
          </Button>
        </div>
        )}
      </div>
    </Card>
  );
};
