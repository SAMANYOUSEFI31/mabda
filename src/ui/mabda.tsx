import type { ContextObject, ContextProvenance, ContextStatus, ContextType, ExecutionMode, GapItem, LedgerEntry, ReadinessResult } from '../types';
import { cx } from './cx.ts';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';

/**
 * Mabda domain badges. Colors come ONLY from the semantic aliases in mabda-tokens.css
 * (which in turn point at Bushido intents). Each value also carries an icon + Persian label,
 * so meaning never depends on color alone.
 * Class strings are written out in full so Tailwind can see them.
 */
interface Entry { label: string; icon: IconName; cls: string }
const BASE = 'inline-flex items-center gap-inline-xs rounded-pill border px-inset-sm min-h-space-6 whitespace-nowrap label-sm';

function MabdaBadge({ entry, className, iconOnly = false }: { entry: Entry; className?: string; iconOnly?: boolean }) {
  return (
    <span className={cx(BASE, entry.cls, className)}>
      <Icon name={entry.icon} size="xs" />
      {!iconOnly && entry.label}
    </span>
  );
}

export const TYPE_META: Record<ContextType, Entry> = {
  Fact: { label: 'واقعیت', icon: 'FileText', cls: 'bg-mabda-type-fact-bg text-mabda-type-fact-fg border-mabda-type-fact-border' },
  Decision: { label: 'تصمیم', icon: 'Target', cls: 'bg-mabda-type-decision-bg text-mabda-type-decision-fg border-mabda-type-decision-border' },
  Constraint: { label: 'خط قرمز', icon: 'Lock', cls: 'bg-mabda-type-constraint-bg text-mabda-type-constraint-fg border-mabda-type-constraint-border' },
};
export function TypeBadge({ value, className, iconOnly }: { value: ContextType; className?: string; iconOnly?: boolean }) {
  return <MabdaBadge entry={TYPE_META[value]} className={className} iconOnly={iconOnly} />;
}

export const STATUS_META: Record<ContextStatus, Entry> = {
  Confirmed: { label: 'تأییدشده', icon: 'CircleCheck', cls: 'bg-mabda-status-confirmed-bg text-mabda-status-confirmed-fg border-mabda-status-confirmed-border' },
  Proposed: { label: 'پیشنهادی', icon: 'Lightbulb', cls: 'bg-mabda-status-proposed-bg text-mabda-status-proposed-fg border-mabda-status-proposed-border' },
  'Needs Review': { label: 'نیازمند بررسی', icon: 'TriangleAlert', cls: 'bg-mabda-status-needs-review-bg text-mabda-status-needs-review-fg border-mabda-status-needs-review-border' },
  Superseded: { label: 'جایگزین‌شده', icon: 'History', cls: 'bg-mabda-status-superseded-bg text-mabda-status-superseded-fg border-mabda-status-superseded-border' },
  Archived: { label: 'بایگانی‌شده', icon: 'Archive', cls: 'bg-mabda-status-archived-bg text-mabda-status-archived-fg border-mabda-status-archived-border' },
};
export function StatusBadge({ value, className, iconOnly }: { value: ContextStatus; className?: string; iconOnly?: boolean }) {
  return <MabdaBadge entry={STATUS_META[value]} className={className} iconOnly={iconOnly} />;
}

export const GAP_META: Record<GapItem['importance'], Entry> = {
  required: { label: 'ضروری', icon: 'OctagonAlert', cls: 'bg-mabda-gap-required-bg text-mabda-gap-required-fg border-mabda-gap-required-border' },
  suggested: { label: 'پیشنهادی', icon: 'Lightbulb', cls: 'bg-mabda-gap-suggested-bg text-mabda-gap-suggested-fg border-mabda-gap-suggested-border' },
  optional: { label: 'اختیاری', icon: 'Minus', cls: 'bg-mabda-gap-optional-bg text-mabda-gap-optional-fg border-mabda-gap-optional-border' },
};
export function GapBadge({ value, className, iconOnly }: { value: GapItem['importance']; className?: string; iconOnly?: boolean }) {
  return <MabdaBadge entry={GAP_META[value]} className={className} iconOnly={iconOnly} />;
}

export const READY_META: Record<ReadinessResult['status'], Entry> = {
  ready: { label: 'آماده', icon: 'CircleCheck', cls: 'bg-mabda-ready-ready-bg text-mabda-ready-ready-fg border-mabda-ready-ready-border' },
  'needs_work': { label: 'نیازمند تکمیل', icon: 'TriangleAlert', cls: 'bg-mabda-ready-needs-work-bg text-mabda-ready-needs-work-fg border-mabda-ready-needs-work-border' },
  blocked: { label: 'مسدود', icon: 'OctagonAlert', cls: 'bg-mabda-ready-blocked-bg text-mabda-ready-blocked-fg border-mabda-ready-blocked-border' },
};
export function ReadinessBadge({ value, className, iconOnly }: { value: ReadinessResult['status']; className?: string; iconOnly?: boolean }) {
  return <MabdaBadge entry={READY_META[value]} className={className} iconOnly={iconOnly} />;
}

export const MODE_META: Record<ExecutionMode, Entry> = {
  fast: { label: 'سریع', icon: 'Zap', cls: 'bg-mabda-mode-fast-bg text-mabda-mode-fast-fg border-mabda-mode-fast-border' },
  auto: { label: 'متعادل (خودکار)', icon: 'Sparkles', cls: 'bg-mabda-mode-auto-bg text-mabda-mode-auto-fg border-mabda-mode-auto-border' },
  critique: { label: 'عمیق (نقد)', icon: 'Eye', cls: 'bg-mabda-mode-critique-bg text-mabda-mode-critique-fg border-mabda-mode-critique-border' },
  sensitive: { label: 'اجرای حساس', icon: 'Shield', cls: 'bg-mabda-mode-sensitive-bg text-mabda-mode-sensitive-fg border-mabda-mode-sensitive-border' },
};
export function ModeBadge({ value, className, iconOnly }: { value: ExecutionMode; className?: string; iconOnly?: boolean }) {
  return <MabdaBadge entry={MODE_META[value]} className={className} iconOnly={iconOnly} />;
}

export const LEDGER_META: Record<LedgerEntry['status'], Entry> = {
  completed: { label: 'انجام‌شده', icon: 'CircleCheck', cls: 'bg-mabda-ledger-completed-bg text-mabda-ledger-completed-fg border-mabda-ledger-completed-border' },
  refunded: { label: 'بازگشت اعتبار', icon: 'Undo2', cls: 'bg-mabda-ledger-refunded-bg text-mabda-ledger-refunded-fg border-mabda-ledger-refunded-border' },
};
export function LedgerStatusBadge({ value, className, iconOnly }: { value: LedgerEntry['status']; className?: string; iconOnly?: boolean }) {
  return <MabdaBadge entry={LEDGER_META[value]} className={className} iconOnly={iconOnly} />;
}

export const PROVENANCE_LABEL: Record<ContextProvenance, string> = {
  Onboarding: 'راه‌اندازی اولیه',
  'User Input': 'ورودی کاربر',
  'AI Suggested': 'پیشنهاد هوش مصنوعی',
  'Asset Derived': 'برگرفته از دارایی',
  Imported: 'واردشده',
};

export const CONTEXT_TYPE_OPTIONS = (Object.keys(TYPE_META) as ContextType[]).map((value) => ({ value, label: TYPE_META[value].label }));
export const CONTEXT_STATUS_OPTIONS = (Object.keys(STATUS_META) as ContextStatus[]).map((value) => ({ value, label: STATUS_META[value].label }));

/** where an object applies: a Constraint says «همه‌جا» or «فقط این بخش»; any other object is shown only when it was widened or ended */
const REACH_GLOBAL: Entry = { label: 'همه‌جا', icon: 'Layers', cls: 'bg-surface-sunken text-text-default border-border-default' };
const REACH_POSITION: Entry = { label: 'فقط این بخش', icon: 'Target', cls: 'bg-surface-sunken text-text-default border-border-default' };
export function ReachBadge({ object, className }: { object: Pick<ContextObject, 'type' | 'reach'>; className?: string }) {
  const reach = object.reach ?? (object.type === 'Constraint' ? 'global' : 'position');
  if (object.type !== 'Constraint' && reach === 'position') return null;
  return <MabdaBadge entry={reach === 'global' ? REACH_GLOBAL : REACH_POSITION} className={className} />;
}

/** why an object is (or is not) in force at a node — src/core/effectiveContext.ts. Label + icon, never colour alone. */
export const ORIGIN_META: Record<'own' | 'inherited' | 'global' | 'overridden' | 'expired', Entry> = {
  own: { label: 'مال این گره', icon: 'Target', cls: 'bg-surface-sunken text-text-default border-border-default' },
  inherited: { label: 'از بخش بالاتر', icon: 'Network', cls: 'bg-surface-sunken text-text-default border-border-default' },
  global: { label: 'همه‌جا', icon: 'Layers', cls: 'bg-surface-sunken text-text-default border-border-default' },
  overridden: { label: 'کنار گذاشته‌شده', icon: 'Minus', cls: 'bg-surface-sunken text-text-subtle border-border-default' },
  expired: { label: 'منقضی', icon: 'History', cls: 'bg-surface-sunken text-text-subtle border-border-default' },
};
export function OriginBadge({ value, className }: { value: keyof typeof ORIGIN_META; className?: string }) {
  return <MabdaBadge entry={ORIGIN_META[value]} className={className} />;
}

/** a working assumption: «فرض» — never shown as fact. Label + icon, never colour alone. */
const ASSUMPTION: Entry = { label: 'فرض', icon: 'Lightbulb', cls: 'bg-surface-sunken text-text-default border-border-default' };
export function AssumptionBadge({ object, className }: { object: Pick<ContextObject, 'assumption'>; className?: string }) {
  return object.assumption ? <MabdaBadge entry={ASSUMPTION} className={className} /> : null;
}

/** the kinds of a thinking item (derived from a note line): idea, question, assumption, open decision */
const THINKING: Record<'idea' | 'question' | 'assumption' | 'open_decision', Entry> = {
  idea: { label: 'ایده', icon: 'Zap', cls: 'bg-surface-sunken text-text-default border-border-default' },
  question: { label: 'سؤال', icon: 'MessageSquare', cls: 'bg-surface-sunken text-text-default border-border-default' },
  assumption: { label: 'فرض', icon: 'Lightbulb', cls: 'bg-surface-sunken text-text-default border-border-default' },
  open_decision: { label: 'تصمیم باز', icon: 'Target', cls: 'bg-surface-sunken text-text-default border-border-default' },
};
export function ThinkingBadge({ kind, className }: { kind: keyof typeof THINKING; className?: string }) {
  return <MabdaBadge entry={THINKING[kind]} className={className} />;
}

/** an example that came with a starter / template: grey, «نمونه». It is never knowledge and no AI or engine sees it. */
const SAMPLE: Entry = { label: 'نمونه', icon: 'Eye', cls: 'bg-surface-sunken text-text-subtle border-border-default border-dashed' };
export function SampleBadge({ className }: { className?: string }) {
  return <MabdaBadge entry={SAMPLE} className={className} />;
}
