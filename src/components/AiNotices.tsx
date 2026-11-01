/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { AiErrorInfo, AiPlan, UsageSummary } from '../types';
import { Alert, Button, Icon, formatNumber } from '../ui';
import { useAiStatus } from '../services/aiStatus';

/** A failed AI request: clear message + "دوباره". Never replaced by canned content. */
export const AiErrorNotice: React.FC<{ error: AiErrorInfo; onRetry?: () => void; retrying?: boolean; onOpenSettings?: () => void; className?: string }> = ({
  error, onRetry, retrying, onOpenSettings, className,
}) => {
  const needsKey = error.kind === 'no_key' || error.kind === 'invalid_key' || error.kind === 'disabled';
  return (
    <Alert
      intent={error.retryable ? 'warning' : 'danger'}
      title={needsKey ? 'کلید هوش مصنوعی لازم است' : 'پاسخ ساخته نشد'}
      className={className}
      action={
        <div className="flex flex-wrap gap-inline-sm">
          {error.retryable && onRetry && (
            <Button size="sm" variant="secondary" iconStart="RefreshCw" loading={retrying} onClick={onRetry}>دوباره</Button>
          )}
          {needsKey && onOpenSettings && <Button size="sm" variant="secondary" iconStart="Settings" onClick={onOpenSettings}>تنظیم کلید</Button>}
        </div>
      }
    >
      {error.message}
    </Alert>
  );
};

/**
 * One-line setup hint, shown only on pages that need AI (workstreams, chat). It is guidance, not an answer.
 * Config warnings (unverified model ids…) live in the AI settings dialog, not here.
 */
export const AiStatusBanner: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const { status, error, loading, refresh } = useAiStatus();
  if (loading && !status && !error) return null;
  const bar = (tone: 'warning' | 'danger', text: string, action: React.ReactNode) => (
    <div role="status" className={`flex flex-wrap items-center justify-between gap-inline-md rounded-control-sm border px-inset-md py-inset-xs ${tone === 'danger' ? 'border-border-danger-subtle bg-bg-danger-subtle' : 'border-border-warning-subtle bg-bg-warning-subtle'}`}>
      <span className="flex items-center gap-inline-sm body-sm text-text-default"><Icon name="TriangleAlert" size="sm" className={tone === 'danger' ? 'text-icon-danger' : 'text-icon-warning'} />{text}</span>
      {action}
    </div>
  );
  if (error) return bar('danger', 'ارتباط با سرور برقرار نشد.', <Button size="sm" variant="secondary" iconStart="RefreshCw" onClick={() => void refresh()}>بررسی دوباره</Button>);
  if (status && !status.available) return bar('warning', 'برای ساخت خروجی و گفتگو، کلید هوش مصنوعی لازم است.', <Button size="sm" variant="secondary" iconStart="Settings" onClick={onOpenSettings}>تنظیم کلید</Button>);
  return null;
};

const TIER_FA = { cheap: 'سبک', balanced: 'متعادل', frontier: 'پیشرو' } as const;
const EFFORT_FA = { minimal: 'حداقل', low: 'کم', medium: 'متوسط', high: 'زیاد', max: 'بیشینه' } as const;
const PATTERN_FA = { single: 'تک‌مرحله‌ای', cascade: 'آبشاری', critique: 'نقد و اصلاح' } as const;

/** «چرا این حالت؟» — tier, effort, pattern, reason and the real usage, under every AI output. */
export const PlanLine: React.FC<{ plan?: AiPlan; usage?: UsageSummary; credits?: number; className?: string }> = ({ plan, usage, credits, className }) => {
  const [open, setOpen] = React.useState(false);
  const { managedEnabled } = useAiStatus();
  if (!plan) return null;
  const finalTier = usage?.stages.filter((s) => s.stage !== 'decision' && s.stage !== 'validate').at(-1)?.tier ?? plan.tier;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-inline-sm text-text-subtle caption">
        <Icon name="Sparkles" size="xs" />
        <span>
          با حالت «{TIER_FA[finalTier]}» ساخته شد · effort {EFFORT_FA[plan.effort]} · الگوی {PATTERN_FA[plan.pattern]}
          {managedEnabled && typeof credits === 'number' && <> · {usage?.byok ? 'کلید شخصی (بدون کسر اعتبار)' : `${formatNumber(credits)} اعتبار`}</>}
        </span>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>چرا؟</Button>
      </div>
      {open && (
        <div className="mt-stack-xs flex flex-col gap-stack-xs rounded-control-sm border border-border-subtle bg-surface-sunken p-inset-md body-sm text-text-subtle">
          <p>{plan.reason}</p>
          {usage && (
            <ul className="caption tabular-nums" dir="auto">
              {usage.stages.map((s, i) => (
                <li key={i}>
                  {s.stage} · <span dir="ltr">{s.modelId}</span> · ورودی {formatNumber(s.inputTokens)} + cache {formatNumber(s.cachedTokens)} · خروجی {formatNumber(s.outputTokens)} + thinking {formatNumber(s.thinkingTokens)} · <span dir="ltr">${s.costUsd.toFixed(5)}</span>
                </li>
              ))}
              <li className="label-sm text-text-default">جمع: <span dir="ltr">${usage.totals.costUsd.toFixed(5)}</span></li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
