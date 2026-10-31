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

/** Top-of-app guidance when no key is configured (or the server is unreachable). Not a fake answer — a setup hint. */
export const AiStatusBanner: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const { status, error, loading, refresh } = useAiStatus();
  if (loading && !status && !error) return null;

  if (error) {
    return (
      <Alert intent="danger" title="سرور هوش مصنوعی در دسترس نیست" action={<Button size="sm" variant="secondary" iconStart="RefreshCw" onClick={() => void refresh()}>بررسی دوباره</Button>}>
        {error.message}
      </Alert>
    );
  }
  if (!status) return null;
  if (!status.available) {
    return (
      <Alert
        intent="warning"
        title="هوش مصنوعی هنوز راه‌اندازی نشده"
        action={<Button size="sm" variant="secondary" iconStart="Settings" onClick={onOpenSettings}>تنظیم کلید API</Button>}
      >
        <ol className="list-decimal ps-inset-xl">
          <li>یک کلید Gemini از Google AI Studio بگیر (سهمیهٔ رایگان کافی است).</li>
          <li>روی «تنظیم کلید API» بزن و کلید را وارد کن؛ کلید رمزنگاری‌شده روی سرور ذخیره می‌شود.</li>
          <li>برای توسعه می‌توانی به‌جای آن در فایل <span dir="ltr" className="code">.env</span> مقدار <span dir="ltr" className="code">MABDA_MANAGED_AI=on</span> و <span dir="ltr" className="code">GEMINI_API_KEY</span> را بگذاری.</li>
        </ol>
        {status.unavailable && <p className="mt-stack-xs body-sm text-text-subtle">{status.unavailable.message}</p>}
      </Alert>
    );
  }
  if (status.warnings.length) {
    return (
      <Alert intent="info" title="هشدار پیکربندی مدل‌ها">
        <ul className="list-disc ps-inset-xl">{status.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      </Alert>
    );
  }
  return null;
};

const TIER_FA = { cheap: 'سبک', balanced: 'متعادل', frontier: 'پیشرو' } as const;
const EFFORT_FA = { minimal: 'حداقل', low: 'کم', medium: 'متوسط', high: 'زیاد', max: 'بیشینه' } as const;
const PATTERN_FA = { single: 'تک‌مرحله‌ای', cascade: 'آبشاری', critique: 'نقد و اصلاح' } as const;

/** «چرا این حالت؟» — tier, effort, pattern, reason and the real usage, under every AI output. */
export const PlanLine: React.FC<{ plan?: AiPlan; usage?: UsageSummary; credits?: number; className?: string }> = ({ plan, usage, credits, className }) => {
  const [open, setOpen] = React.useState(false);
  if (!plan) return null;
  const finalTier = usage?.stages.filter((s) => s.stage !== 'decision' && s.stage !== 'validate').at(-1)?.tier ?? plan.tier;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-inline-sm text-text-subtle caption">
        <Icon name="Sparkles" size="xs" />
        <span>
          با حالت «{TIER_FA[finalTier]}» ساخته شد · effort {EFFORT_FA[plan.effort]} · الگوی {PATTERN_FA[plan.pattern]}
          {typeof credits === 'number' && <> · {usage?.byok ? 'کلید شخصی (بدون کسر اعتبار)' : `${formatNumber(credits)} اعتبار`}</>}
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
