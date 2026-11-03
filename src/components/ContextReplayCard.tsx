/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextChange, ContextObject, GeneratedDeliverable } from '../types';
import { versionTexts } from '../core/versionHistory';
import { BeforeAfter } from './BeforeAfter';
import { Alert, Badge, Button, Card, IconButton, Markdown, Menu, ModeBadge, TYPE_META, formatJalaliDate, formatNumber } from '../ui';
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
  /** the change log: with it, a piece of knowledge that moved on since this output was built shows WHAT changed */
  changes?: ContextChange[];
}


export const ContextReplayCard: React.FC<ContextReplayCardProps> = ({
  deliverable,
  allContextObjects,
  onOpenContextObject,
  onRebuild,
  isRebuilding = false,
  stale,
  changes,
}) => {
  const [showCritique, setShowCritique] = useState(false);
  const [showRawContext, setShowRawContext] = useState(false);
  const [copied, setCopied] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);

  // exactly what was injected: id + the version the model saw; the object may have moved on since
  const usedObjects = (deliverable.usedContext || [])
    .map((ref) => ({ ref, obj: allContextObjects.find((c) => c.id === ref.id) }))
    .filter((x): x is { ref: typeof x.ref; obj: ContextObject } => !!x.obj);
  const ai = useAiStatus();
  const halfPrice = ai.managedEnabled && halfPriceRebuildAvailable(deliverable, stale);
  // chat-made assets have no workstream spec, so there is nothing to rebuild automatically
  const canRebuild = deliverable.workstreamId !== 'chat';
  /** a hand-written example in the showcase workspace: clearly NOT an AI output; «ساخت با AI» replaces it with a real one made with the user's own key */
  const sample = deliverable.source?.label === 'نمونهٔ دستی';

  const handleCopy = () => {
    navigator.clipboard.writeText(deliverable.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rebuildLabel = sample ? 'ساخت با AI' : halfPrice ? 'بازسازی با نصف قیمت' : 'بازسازی';
  const failed = (deliverable.checks ?? []).filter((c) => !c.passed).length;
  const passedAll = !!deliverable.checks?.length && failed === 0;
  const traceId = `trace-${deliverable.id}`;

  return (
    <Card padding="lg" className="flex flex-col gap-stack-md" aria-label={deliverable.title}>
      {/* the same anatomy as a canvas card: title · a row of badges · a short line · one action (+ «⋯») */}
      <div className="flex flex-col justify-between gap-inline-md sm:flex-row sm:items-start">
        <div className="flex min-w-space-0 flex-col gap-stack-xs">
          <h3 className="title text-text-default">{deliverable.title}</h3>
          <div className="flex flex-wrap items-center gap-inline-xs">
            {sample ? <Badge intent="neutral" icon="Pencil">نمونهٔ دستی</Badge> : <ModeBadge value={deliverable.executionMode} />}
            {stale && <Badge intent="warning" icon="TriangleAlert">به‌روز نیست</Badge>}
            {deliverable.rebuildCount > 0 && <Badge intent="success" icon="RefreshCw">بازسازی‌شده ({formatNumber(deliverable.rebuildCount)})</Badge>}
            {deliverable.checks && deliverable.checks.length > 0 && <Badge intent={passedAll ? 'success' : 'warning'} icon={false}>{formatNumber(deliverable.checks.filter((c) => c.passed).length)} از {formatNumber(deliverable.checks.length)} معیار برقرار</Badge>}
          </div>
          <span className="caption text-text-subtle">
            {formatJalaliDate(deliverable.createdAt)}{ai.managedEnabled ? ` · مصرف اعتبار: ${formatNumber(deliverable.creditCost)}` : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-inline-xs">
          {sample && !stale && canRebuild && <Button variant="secondary" size="sm" iconStart="Sparkles" loading={isRebuilding} onClick={() => onRebuild(deliverable)}>ساخت با AI</Button>}
          <Button variant="secondary" size="sm" iconStart={copied ? 'Check' : 'Copy'} onClick={handleCopy}>{copied ? 'کپی شد' : 'کپی خروجی'}</Button>
          <Menu
            label="بیشتر دربارهٔ این خروجی"
            align="end"
            trigger={<IconButton icon="Ellipsis" label={`بیشتر دربارهٔ ${deliverable.title}`} size="sm" />}
            items={[
              ...(deliverable.critiqueFeedback ? [{ label: 'نقد و چک‌لیست', icon: 'Eye' as const, onSelect: () => { setShowCritique(true); setTraceOpen(true); } }] : []),
              ...(canRebuild && !stale && !sample ? [{ label: rebuildLabel, icon: 'RefreshCw' as const, disabled: isRebuilding, onSelect: () => onRebuild(deliverable) }] : []),
              { label: traceOpen ? 'بستن ردپای دانش' : 'ردپای دانش و معیارها', icon: 'History' as const, onSelect: () => setTraceOpen((v) => !v) },
            ]}
          />
        </div>
      </div>

      {/* «به‌روز نیست»: ONE sentence of reason and ONE action */}
      {stale && (
        <Alert
          intent="warning"
          title="این خروجی به‌روز نیست"
          action={canRebuild ? <Button variant="secondary" size="sm" iconStart="RefreshCw" loading={isRebuilding} onClick={() => onRebuild(deliverable)}>{rebuildLabel}</Button> : undefined}
        >
          {stale.reasons[0]?.message}{stale.reasons.length > 1 ? ` (و ${formatNumber(stale.reasons.length - 1)} دلیل دیگر)` : ''}
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

      {/* the trail (what it was built from) and the criteria: a closed section */}
      <div className="flex flex-col gap-stack-sm">
        <div>
          <Button variant="ghost" size="sm" iconStart={traceOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={traceOpen} aria-controls={traceId} onClick={() => setTraceOpen((v) => !v)}>
            ردپای دانش و معیارها
          </Button>
          <span className="body-sm ms-inline-sm text-text-subtle">بر پایهٔ {formatNumber(usedObjects.length)} قلم از دانش تو ساخته شد.</span>
        </div>
        {traceOpen && (
          <div id={traceId} className="flex flex-col gap-stack-md rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
            <div className="flex flex-wrap gap-inline-sm">
              {usedObjects.map(({ ref, obj: ctx }) => (
                <Button
                  key={`${ref.id}-${ref.version}`}
                  variant="secondary"
                  size="sm"
                  className="h-auto min-h-touch-comfortable max-w-full flex-wrap whitespace-normal py-inset-xs text-start"
                  title="مشاهده و اصلاح این قلم دانش"
                  onClick={() => onOpenContextObject(ctx)}
                >
                  {ctx.title}
                  <span className="caption ms-inline-xs text-text-subtle">
                    ({TYPE_META[ctx.type].label} · نسخهٔ {formatNumber(ref.version)}{ctx.version !== ref.version ? `، اکنون ${formatNumber(ctx.version)}` : ''})
                  </span>
                </Button>
              ))}
            </div>
            {/* what changed since this output was built: the text of the version it saw next to the text now */}
            {usedObjects.filter(({ ref, obj }) => obj.version !== ref.version).map(({ ref, obj }) => {
              const texts = versionTexts((changes ?? []).filter((c) => c.objectId === obj.id));
              const then = texts.find((t) => t.version === ref.version);
              const now = texts.find((t) => t.version === obj.version);
              if (!then || !now || (then.content === now.content && then.title === now.title)) return null;
              return (
                <div key={`${obj.id}-diff`} className="flex flex-col gap-stack-xs" data-testid="replay-diff">
                  <span className="label-md text-text-default">«{obj.title}» از نسخهٔ {formatNumber(ref.version)} به {formatNumber(obj.version)}</span>
                  <BeforeAfter before={then.content} after={now.content} />
                </div>
              );
            })}
            <div>
              <Button variant="ghost" size="sm" iconEnd={showRawContext ? 'ChevronUp' : 'ChevronDown'} aria-expanded={showRawContext} onClick={() => setShowRawContext(!showRawContext)}>
                {showRawContext ? 'بستن ورودی‌ها' : 'مشاهدهٔ ورودی‌ها'}
              </Button>
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

            {deliverable.checks && deliverable.checks.length > 0 && (
              <div className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-md" aria-label="نتیجهٔ بررسی معیارها و گاردریل‌ها">
                <span className="label-md text-text-default">معیارهای پذیرش و گاردریل‌ها</span>
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

            {showCritique && deliverable.critiqueFeedback && (
              <div className="flex flex-col gap-stack-md border-t border-border-default pt-inset-md">
                <span className="label-md text-text-default">ارزیابی منتقد و چک‌لیست پذیرش</span>
                <div className="grid grid-cols-1 gap-inline-md md:grid-cols-2">
                  <div className="flex flex-col gap-stack-xs">
                    <span className="label-md text-text-success">نقاط قوت محتوا</span>
                    <ul className="body-sm list-inside list-disc text-text-default">{deliverable.critiqueFeedback.strengths.map((x, idx) => (<li key={idx}>{x}</li>))}</ul>
                  </div>
                  <div className="flex flex-col gap-stack-xs">
                    <span className="label-md text-text-warning">اصلاحات اعمال‌شده</span>
                    <ul className="body-sm list-inside list-disc text-text-default">{deliverable.critiqueFeedback.improvementsMade.map((x, idx) => (<li key={idx}>{x}</li>))}</ul>
                  </div>
                </div>
              </div>
            )}
            {sample && <p className="body-sm text-text-subtle">این متن را دستی نوشته‌ایم و خروجی هوش مصنوعی نیست. با «ساخت با AI» از همین دانش و با کلید خودت یک خروجی واقعی می‌سازی.</p>}
          </div>
        )}
      </div>
    </Card>
  );
};
