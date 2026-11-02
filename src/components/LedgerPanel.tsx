/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LedgerEntry, PlanId, Workspace } from '../types';
import { PLANS, chatCountToday, tehranDay } from '../core/creditEngine';
import { Badge, Button, Card, LedgerStatusBadge, MODE_META, ModeBadge, Stat, Table, Tabs, formatNumber, formatTime, formatUsd } from '../ui';
import { useAiStatus } from '../services/aiStatus';
import { UsagePanel } from './UsagePanel';
import { ManagerLedger } from './ManagerLedger';

interface LedgerPanelProps {
  currentWorkspace: Workspace;
  ledgerEntries: LedgerEntry[];
  onChangePlan: (planId: PlanId) => void;
  onAddCredits: (amount: number) => void;
  onOpenPlans: () => void;
}

export const LedgerPanel: React.FC<LedgerPanelProps> = ({
  currentWorkspace,
  ledgerEntries,
  onChangePlan,
  onAddCredits,
  onOpenPlans,
}) => {
  const ai = useAiStatus();
  // credits exist only in the managed-AI layer: with the flag off no credit number is shown anywhere
  const managed = ai.managedEnabled;
  const [activeSubTab, setActiveSubTab] = useState<'usage' | 'ledger' | 'plans' | 'economics' | 'manager'>('usage');
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;

  const totalCreditsUsed = ledgerEntries.reduce((sum, e) => sum + e.creditCost, 0);
  const totalAiCostUsd = ledgerEntries.reduce((sum, e) => sum + e.estimatedAiCostUsd, 0);

  const TIER_FA = { cheap: 'سبک', balanced: 'متعادل', frontier: 'پیشرو' } as const;
  const EFFORT_FA = { minimal: 'حداقل', low: 'کم', medium: 'متوسط', high: 'زیاد', max: 'بیشینه' } as const;
  const PATTERN_FA = { single: 'تک‌مرحله‌ای', cascade: 'آبشاری', critique: 'نقد و اصلاح' } as const;
  const redLines: Array<{ title: string; text: string }> = [
    {
      title: 'سهم هزینهٔ AI از درآمد کاربر',
      text: 'آستانهٔ هشدار: بیشتر از ۵۰٪ درآمد. در شبیه‌سازی ۲۰ هزار کاربرهٔ مبدأ، هزینهٔ AI در مصرف متوسط بین ۱۷٪ تا ۱۸٪ درآمد خالص کنترل شده است.',
    },
    {
      title: 'هزینهٔ واقعی هر اعتبار',
      text: 'آستانهٔ قرمز: بیشتر از ۰٫۰۰۶ دلار دو هفتهٔ متوالی. در این حالت وزن اعتبار یا جدول انتخاب مدل اصلاح می‌شود.',
    },
    {
      title: 'بازسازی با نصف قیمت',
      text: 'برای جلوگیری از سوءاستفاده، بازسازی با ۵۰٪ تخفیف فقط یک بار به ازای هر ویرایش دانش مجاز است (اصلاحیهٔ ممیزی شمارهٔ ۷).',
    },
    {
      title: 'سقف فضای کاری در پلن Max',
      text: 'برای اینکه هیچ وعدهٔ «نامحدود»ی نداده باشیم، سقف فضای کاری Max دقیقاً ۱۰ تعیین شده است تا هزینه‌های ذخیره‌سازی و پردازش پایدار بماند.',
    },
  ];

  return (
    <div className="flex flex-col gap-stack-lg">
      <Card padding="xl" className="flex flex-col gap-stack-lg">
        <div className="flex flex-col justify-between gap-inline-lg border-b border-border-default pb-inset-lg md:flex-row md:items-center">
          <div>
            <h2 className="heading-sm text-text-default">{managed ? 'دفتر کل، اقتصاد و اعتبارها' : 'مصرف و دفتر کل'}</h2>
            <p className="body-sm mt-stack-xs text-text-subtle">
              {managed ? 'شفافیت کامل در مصرف اعتبارها، سقف‌های منصفانهٔ روزانه و هزینه‌های زیرساخت AI.' : 'سهمیه‌ها، سقف‌های روزانه و هزینهٔ واقعی هر فراخوانی AI؛ هیچ مصرفی پنهان نیست.'}
            </p>
          </div>
          {managed ? (
            <div className="flex flex-wrap items-center gap-inline-md">
              <Button variant="secondary" iconStart="Plus" onClick={() => onAddCredits(100)}>بستهٔ ۱۰۰ اعتبار (۴ دلار)</Button>
              <Button variant="secondary" iconStart="Plus" onClick={() => onAddCredits(300)}>بستهٔ ۳۰۰ اعتبار (۱۰٫۵ دلار)</Button>
            </div>
          ) : (
            <Button variant="secondary" iconEnd="ArrowLeft" onClick={onOpenPlans}>مقایسهٔ پلن‌ها</Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-inline-lg sm:grid-cols-4">
          {managed && <Stat label="اعتبار باقی‌مانده" value={formatNumber(currentWorkspace.creditsRemaining)} delta={`پلن ${plan.title.split(' ')[0]}`} />}
          {managed && <Stat label="مجموع اعتبار مصرف‌شده" value={formatNumber(totalCreditsUsed)} delta="در تمام خروجی‌ها" />}
          <Stat
            label="گفتگوی خودکار امروز"
            value={formatNumber(chatCountToday(currentWorkspace.todayChatCount, currentWorkspace.chatCountDay, tehranDay()))}
            delta="بدون قفل؛ بعد از سقف روزانه سبک‌تر می‌شود"
          />
          <Stat label="هزینهٔ AI (مصرف ثبت‌شده، قیمت لیست)" value={formatUsd(totalAiCostUsd, 4)} delta={ai.byok ? 'روی کلید شخصی تو' : 'ثبت‌شده در دفتر کل'} />
        </div>
      </Card>

      <Tabs
        label="بخش‌های دفتر کل"
        value={activeSubTab}
        onChange={(id) => setActiveSubTab(id as typeof activeSubTab)}
        items={[
          { id: 'usage', label: 'مصرف و سهمیه‌ها' },
          { id: 'ledger', label: `تراکنش‌های دفتر کل (${formatNumber(ledgerEntries.length)})` },
          ...(managed ? [{ id: 'plans', label: 'پلن‌ها و اعتبار' }, { id: 'economics', label: 'خطوط قرمز اقتصادی' }] : []),
          ...(ai.admin ? [{ id: 'manager', label: 'نمای مدیر' }] : []),
        ]}
      />

      {activeSubTab === 'usage' && <UsagePanel workspaceId={currentWorkspace.id} planId={currentWorkspace.planId} refreshKey={ledgerEntries.length} onOpenPlans={onOpenPlans} />}

      {activeSubTab === 'manager' && ai.admin && <ManagerLedger />}

      {activeSubTab === 'ledger' && (
        <Table
          caption="تراکنش‌های دفتر کل"
          rows={ledgerEntries as unknown as Array<Record<string, unknown> & LedgerEntry>}
          empty="هنوز تراکنشی ثبت نشده است."
          columns={[
            { key: 'timestamp', label: 'زمان', render: (e) => <span className="tabular-nums text-text-subtle">{formatTime(e.timestamp)}</span> },
            { key: 'action', label: 'عملیات / کار', render: (e) => <span className="label-md text-text-default">{e.action}</span> },
            {
              key: 'mode',
              label: 'الگوی اجرا',
              render: (e) => e.mode in MODE_META
                ? <ModeBadge value={e.mode as keyof typeof MODE_META} />
                : <Badge intent="neutral" icon={false}>{e.mode === 'chat_deep' ? 'گفتگوی عمیق' : 'گفتگوی خودکار'}</Badge>,
            },
            {
              key: 'plan',
              label: 'مدل و الگو',
              render: (e) => e.plan ? (
                <span className="flex flex-col gap-stack-xs caption text-text-subtle">
                  <span>{TIER_FA[e.stages?.filter((x) => x.stage !== 'decision' && x.stage !== 'validate').at(-1)?.tier ?? e.plan.tier]} · {EFFORT_FA[e.plan.effort]} · {PATTERN_FA[e.plan.pattern]}</span>
                  {e.byok && <Badge intent="info" icon="Lock">کلید شخصی</Badge>}
                </span>
              ) : <span className="caption text-text-subtlest">—</span>,
            },
            {
              key: 'tokens',
              label: 'توکن ورودی / خروجی',
              numeric: true,
              render: (e) => (
                <span className="flex flex-col">
                  <span>{formatNumber(e.inputTokens)} / {formatNumber(e.outputTokens)}</span>
                  {(e.cachedTokens || e.thinkingTokens) ? <span className="caption text-text-subtle">cache {formatNumber(e.cachedTokens ?? 0)} · thinking {formatNumber(e.thinkingTokens ?? 0)}</span> : null}
                </span>
              ),
            },
            ...(managed ? [{
              key: 'creditCost',
              label: 'اعتبار کسرشده',
              numeric: true,
              render: (e: LedgerEntry) => (e.creditCost === 0 ? <span className="text-text-success">{e.byok ? 'بدون کسر (کلید شخصی)' : 'رایگان (خودکار)'}</span> : `${formatNumber(e.creditCost)} اعتبار`),
            }] : []),
            { key: 'estimatedAiCostUsd', label: 'هزینهٔ AI', numeric: true, render: (e) => formatUsd(e.estimatedAiCostUsd, 4) },
            { key: 'status', label: 'وضعیت', render: (e) => <LedgerStatusBadge value={e.status} /> },
          ]}
        />
      )}

      {managed && activeSubTab === 'plans' && (
        <div className="grid grid-cols-1 gap-inline-xl md:grid-cols-3">
          {(Object.keys(PLANS) as PlanId[]).map((pid) => {
            const p = PLANS[pid];
            const isCurrent = currentWorkspace.planId === pid;
            return (
              <Card key={pid} padding="xl" selected={isCurrent || undefined} className="flex h-full flex-col justify-between gap-stack-xl">
                <div className="flex flex-col gap-stack-md">
                  <div className="flex items-center justify-between gap-inline-sm">
                    <h3 className="title text-text-default">{p.title}</h3>
                    {isCurrent && <Badge intent="neutral" emphasis="bold" icon="Check">پلن فعلی</Badge>}
                  </div>
                  <div className="flex flex-col gap-stack-xs">
                    <div className="flex items-baseline gap-inline-xs">
                      <span className="text-numeric-md text-text-default">{formatUsd(p.priceMonthlyUsd, 0)}</span>
                      <span className="body-sm text-text-subtle">در ماه</span>
                    </div>
                  </div>
                  <dl className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-md body-sm">
                    <div className="flex items-center justify-between gap-inline-sm">
                      <dt className="text-text-subtle">اعتبار ماهانه</dt>
                      <dd className="label-md tabular-nums text-text-default">{formatNumber(p.creditsMonthly)} اعتبار</dd>
                    </div>
                    <div className="flex items-center justify-between gap-inline-sm">
                      <dt className="text-text-subtle">سقف فضای کاری</dt>
                      <dd className="label-md tabular-nums text-text-default">{formatNumber(p.workspaceLimit)} فضای کاری</dd>
                    </div>
                    <div className="flex items-center justify-between gap-inline-sm">
                      <dt className="text-text-subtle">سقف منصفانهٔ گفتگو</dt>
                      <dd className="label-md tabular-nums text-text-default">{formatNumber(p.dailyChatLimit)} پیام در روز</dd>
                    </div>
                    <div className="flex flex-col gap-stack-xs">
                      <dt className="text-text-subtle">حالت‌های مجاز</dt>
                      <dd className="flex flex-wrap gap-inline-xs">{p.allowedModes.map((m) => <ModeBadge key={m} value={m} />)}</dd>
                    </div>
                  </dl>
                </div>
                <Button variant="secondary" fullWidth disabled={isCurrent} onClick={() => onChangePlan(pid)}>
                  {isCurrent ? 'فعال برای این فضای کاری' : 'انتخاب این پلن'}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {managed && activeSubTab === 'economics' && (
        <Card padding="xl" className="flex flex-col gap-stack-lg">
          <h3 className="title text-text-default">اصول و شاخص‌های خط قرمز در دفتر کل</h3>
          <div className="grid grid-cols-1 gap-inline-lg md:grid-cols-2">
            {redLines.map((r) => (
              <div key={r.title} className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-lg">
                <span className="label-md text-text-default">{r.title}</span>
                <p className="body-sm text-text-subtle">{r.text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
