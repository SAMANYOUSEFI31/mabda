/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LedgerEntry, Workspace } from '../../types';
import { chatCountToday } from '../../core/limits';
import { tehranDay } from '../../core/tehranDate';
import { Badge, Card, LedgerStatusBadge, MODE_META, ModeBadge, Stat, Table, Tabs, formatNumber, formatTime } from '../../ui';
import { useAiStatus } from '../../services/aiStatus';
import { UsagePanel } from './UsagePanel';
import { ManagerLedger } from './ManagerLedger';

interface LedgerPanelProps {
  currentWorkspace: Workspace;
  ledgerEntries: LedgerEntry[];
}

/** Usage of the (frozen) managed-AI layer: fair-use meters, every AI call with its real tokens, and the manager view. No plans, prices or credits exist. */
export const LedgerPanel: React.FC<LedgerPanelProps> = ({ currentWorkspace, ledgerEntries }) => {
  const ai = useAiStatus();
  const [activeSubTab, setActiveSubTab] = useState<'usage' | 'ledger' | 'manager'>('usage');

  const TIER_FA = { cheap: 'سبک', balanced: 'متعادل', frontier: 'پیشرو' } as const;
  const EFFORT_FA = { minimal: 'حداقل', low: 'کم', medium: 'متوسط', high: 'زیاد', max: 'بیشینه' } as const;
  const PATTERN_FA = { single: 'تک‌مرحله‌ای', cascade: 'آبشاری', critique: 'نقد و اصلاح' } as const;

  return (
    <div className="flex flex-col gap-stack-lg">
      <Card section className="flex flex-col gap-stack-md">
        <div className="border-b border-border-default pb-inset-lg">
          <h2 className="heading-sm text-text-default">مصرف</h2>
          <p className="body-sm mt-stack-xs text-text-subtle">سقف‌های منصفانهٔ روزانه و هزینهٔ واقعی هر فراخوانی هوش مصنوعی؛ هیچ مصرفی پنهان نیست.</p>
        </div>

        <div className="grid grid-cols-2 gap-inline-lg sm:grid-cols-4">
          <Stat
            label="گفتگوی خودکار امروز"
            value={formatNumber(chatCountToday(currentWorkspace.todayChatCount, currentWorkspace.chatCountDay, tehranDay()))}
            delta="بدون قفل؛ بعد از سقف روزانه سبک‌تر می‌شود"
          />
        </div>
      </Card>

      <Tabs
        label="بخش‌های مصرف"
        value={activeSubTab}
        onChange={(id) => setActiveSubTab(id as typeof activeSubTab)}
        items={[
          { id: 'usage', label: 'مصرف و سهمیه‌ها' },
          { id: 'ledger', label: `تراکنش‌های مصرف (${formatNumber(ledgerEntries.length)})` },
          ...(ai.admin ? [{ id: 'manager', label: 'نمای مدیر' }] : []),
        ]}
      />

      {activeSubTab === 'usage' && <UsagePanel workspaceId={currentWorkspace.id} refreshKey={ledgerEntries.length} />}

      {activeSubTab === 'manager' && ai.admin && <ManagerLedger />}

      {activeSubTab === 'ledger' && (
        <Table
          caption="تراکنش‌های مصرف"
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
            { key: 'status', label: 'وضعیت', render: (e) => <LedgerStatusBadge value={e.status} /> },
          ]}
        />
      )}

    </div>
  );
};
