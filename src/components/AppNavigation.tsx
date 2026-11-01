/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PlanId, Workspace, WorkstreamSpec } from '../types';
import { PLANS } from '../core/creditEngine';
import { useAiStatus } from '../services/aiStatus';
import { BottomNav, BrandMark, Button, Card, Dialog, Icon, IconButton, NavItem, Progress, Select, formatNumber } from '../ui';

interface AppNavigationProps {
  currentWorkspace: Workspace;
  allWorkspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  onOpenNewWorkspace: () => void;
  onOpenOnboarding: () => void;
  onOpenPlanModal: () => void;
  onOpenAccountModal: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  specs: WorkstreamSpec[];
  selectedSpecId: string;
  onSelectSpecId: (specId: string) => void;
  onOpenCustomSpecModal: () => void;
  contextViewMode: 'doc' | 'table';
  onChangeContextViewMode: (mode: 'doc' | 'table') => void;
  contextCount: number;
  deliverablesCount: number;
  todayChatCount: number;
}

export const AppNavigation: React.FC<AppNavigationProps> = ({
  currentWorkspace,
  allWorkspaces,
  onSelectWorkspace,
  onOpenNewWorkspace,
  onOpenOnboarding,
  onOpenPlanModal,
  onOpenAccountModal,
  activeTab,
  onTabChange,
  specs,
  selectedSpecId,
  onSelectSpecId,
  onOpenCustomSpecModal,
  contextViewMode,
  onChangeContextViewMode,
  contextCount,
  deliverablesCount,
  todayChatCount,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;

  const { managedEnabled } = useAiStatus();
  const creditPercentage = Math.min(
    100,
    Math.round((currentWorkspace.creditsRemaining / plan.creditsMonthly) * 100)
  );

  const close = () => setIsMobileMenuOpen(false);
  const go = (tab: string) => { onTabChange(tab); close(); };

  const navContent = (
    <div className="flex h-full flex-col justify-between gap-stack-lg select-none">
      <div className="flex flex-col gap-stack-md">
        {/* Brand */}
        <div className="flex items-center gap-inline-md px-inset-sm">
          <BrandMark />
          <div>
            <div className="flex items-baseline gap-inline-sm">
              <span className="text-heading-xs text-text-default">مبدأ</span>
              <span className="caption text-text-subtlest" dir="ltr">v3.1</span>
            </div>
            <span className="caption block text-text-subtle">منبع حقیقت کسب‌وکار</span>
          </div>
        </div>

        {/* Workspace switcher */}
        <Card padding="md" className="flex flex-col gap-stack-sm">
          <Select
            label="فضای کاری فعال"
            value={currentWorkspace.id}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                onOpenNewWorkspace();
                close();
              } else {
                const ws = allWorkspaces.find((w) => w.id === e.target.value);
                if (ws) onSelectWorkspace(ws);
              }
            }}
            options={[
              ...allWorkspaces.map((w) => ({ value: w.id, label: `${w.name} (${PLANS[w.planId].title.split(' ')[0]})` })),
              { value: '__new__', label: 'ایجاد فضای کاری جدید' },
            ]}
          />
          <span className="caption text-text-subtle">پلن {plan.title.split(' ')[0]}</span>
        </Card>

        {/* Primary navigation */}
        <nav className="flex flex-col gap-stack-xs" aria-label="بخش‌های اصلی نرم‌افزار">
          <NavItem icon="BookOpen" label="منبع حقیقت" trailing={formatNumber(contextCount)} selected={activeTab === 'context'} onClick={() => go('context')} />
          {activeTab === 'context' && (
            <div className="ms-inline-xl flex flex-col gap-stack-xs border-s border-border-default ps-inset-sm">
              <NavItem nested label="نمای سندی و درختی" selected={contextViewMode === 'doc'} onClick={() => { onChangeContextViewMode('doc'); close(); }} />
              <NavItem nested label="نمای پایگاه‌داده و جدول" selected={contextViewMode === 'table'} onClick={() => { onChangeContextViewMode('table'); close(); }} />
            </div>
          )}

          <NavItem icon="Layers" label="استودیوی جریان‌های کار" trailing={formatNumber(specs.length)} selected={activeTab === 'workstreams'} onClick={() => go('workstreams')} />
          <div className="ms-inline-xl flex flex-col gap-stack-xs border-s border-border-default ps-inset-sm">
            <div className="flex items-center justify-between caption text-text-subtlest">
              <span>جریان‌های تعریف‌شده</span>
              <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => { onOpenCustomSpecModal(); close(); }}>جدید</Button>
            </div>
            {specs.map((s) => (
              <NavItem
                nested
                key={s.id}
                label={s.title}
                selected={activeTab === 'workstreams' && selectedSpecId === s.id}
                onClick={() => { onTabChange('workstreams'); onSelectSpecId(s.id); close(); }}
              />
            ))}
          </div>

          <NavItem icon="MessageSquare" label="گفتگو و استخراج دانش" trailing={`${formatNumber(todayChatCount)} / ${formatNumber(plan.dailyChatLimit)}`} selected={activeTab === 'chat'} onClick={() => go('chat')} />
          <NavItem icon="Package" label="کتابخانهٔ دارایی‌ها" trailing={formatNumber(deliverablesCount)} selected={activeTab === 'assets'} onClick={() => go('assets')} />
          <NavItem icon="Wallet" label="دفتر کل و شفافیت مالی" selected={activeTab === 'ledger'} onClick={() => go('ledger')} />
        </nav>
      </div>

      <div className="flex flex-col gap-stack-md border-t border-border-default pt-inset-lg">
        <Card padding="md" onClick={() => { onOpenPlanModal(); close(); }} className="flex flex-col gap-stack-sm">
          {managedEnabled && (
            <>
          <div className="flex items-center justify-between gap-inline-sm body-sm">
            <span className="text-text-subtle">موجودی اعتبار</span>
            <span className="label-md tabular-nums text-text-default">{formatNumber(currentWorkspace.creditsRemaining)} / {formatNumber(plan.creditsMonthly)}</span>
          </div>
          <Progress value={creditPercentage} label="اعتبار باقی‌مانده" showValue={false} intent={creditPercentage > 15 ? 'success' : 'warning'} />
            </>
          )}
          <div className="flex items-center justify-between caption text-text-subtle">
            <span>پلن {plan.title.split(' ')[0]}</span>
            <span className="inline-flex items-center gap-inline-xs">ارتقا یا تغییر پلن <Icon name="ChevronLeft" size="sm" className="bsh-flip" /></span>
          </div>
        </Card>

        <Button variant="secondary" fullWidth iconStart="Zap" onClick={() => { onOpenOnboarding(); close(); }}>
          راه‌اندازی ۱۰ دقیقه‌ای برند
        </Button>

        <button
          type="button"
          onClick={() => { onOpenAccountModal(); close(); }}
          className="flex min-h-touch items-center gap-inline-md rounded-control p-inset-sm text-start transition-colors hover:bg-interaction-hover active:bg-interaction-pressed"
        >
          <span className="grid size-control-sm place-items-center rounded-control-sm bg-bg-neutral-subtle text-icon-subtle"><Icon name="User" size="lg" /></span>
          <span className="flex-1">
            <span className="code block text-text-default" dir="ltr">09123456789</span>
            <span className="caption inline-flex items-center gap-inline-xs text-text-success"><Icon name="CircleCheck" size="xs" />حساب تأییدشده</span>
          </span>
          <Icon name="Settings" size="lg" className="text-icon-subtle" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar (inline-start edge) */}
      <aside className="sticky top-space-0 z-dropdown hidden h-screen w-overlay-xs shrink-0 overflow-y-auto border-e border-border-default bg-surface-sunken p-inset-lg md:flex md:flex-col">
        {navContent}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-space-0 z-sticky flex items-center justify-between border-b border-border-default bg-surface-sunken px-inset-lg py-inset-sm md:hidden">
        <div className="flex items-center gap-inline-md">
          <IconButton icon="Menu" label="باز کردن منو" variant="secondary" onClick={() => setIsMobileMenuOpen(true)} />
          <span className="flex items-center gap-inline-sm">
            <BrandMark size="sm" />
            <span className="title text-text-default">مبدأ</span>
          </span>
        </div>
        <div className="flex items-center gap-inline-sm">
          <Button size="sm" variant="secondary" onClick={onOpenPlanModal}>{managedEnabled ? `${formatNumber(currentWorkspace.creditsRemaining)} اعتبار` : `پلن ${plan.title.split(' ')[0]}`}</Button>
          <IconButton icon="User" label="پروفایل" variant="secondary" onClick={onOpenAccountModal} />
        </div>
      </header>

      {/* Mobile drawer */}
      <Dialog open={isMobileMenuOpen} onClose={close} title="منوی مبدأ" size="sm">
        {navContent}
      </Dialog>

      {/* Mobile bottom navigation */}
      <BottomNav
        fixed
        className="md:hidden"
        label="منوی پایینی موبایل"
        value={activeTab}
        onChange={onTabChange}
        items={[
          { id: 'context', label: 'منبع حقیقت', icon: 'BookOpen' },
          { id: 'workstreams', label: 'جریان‌ها', icon: 'Layers' },
          { id: 'chat', label: 'گفتگو', icon: 'MessageSquare' },
          { id: 'assets', label: 'دارایی‌ها', icon: 'Package', badge: deliverablesCount || undefined, badgeLabel: 'دارایی' },
          { id: 'ledger', label: 'دفتر کل', icon: 'Wallet' },
        ]}
      />
    </>
  );
};
