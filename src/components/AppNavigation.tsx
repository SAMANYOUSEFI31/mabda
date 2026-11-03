/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Workspace, WorkstreamSpec } from '../types';
import { PLANS } from '../core/creditEngine';
import { BottomNav, BrandMark, Button, Dialog, Icon, IconButton, Menu, NavItem, formatNumber } from '../ui';
import type { IconName, MenuItem } from '../ui';

type ContextView = 'doc' | 'read' | 'table' | 'canvas';

interface AppNavigationProps {
  currentWorkspace: Workspace;
  allWorkspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  onOpenNewWorkspace: () => void;
  onOpenOnboarding: () => void;
  /** builds (or rebuilds from nothing) the showcase workspace */
  onResetDemo: () => void;
  onOpenPlanModal: () => void;
  onOpenAccountModal: () => void;
  /** Ctrl/⌘+K: the global search and commands */
  onOpenSearch: () => void;
  onOpenLedger: () => void;
  onOpenAiSettings: () => void;
  onOpenConnect: () => void;
  onOpenMemory: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  specs: WorkstreamSpec[];
  selectedSpecId: string;
  onSelectSpecId: (specId: string) => void;
  onOpenCustomSpecModal: () => void;
  onOpenSpecLibrary: () => void;
  contextViewMode: ContextView;
  onChangeContextViewMode: (mode: ContextView) => void;
  contextCount: number;
  deliverablesCount: number;
}

const VIEWS: Array<{ id: ContextView; label: string }> = [
  { id: 'doc', label: 'ساختار' },
  { id: 'read', label: 'سند خوانا' },
  { id: 'table', label: 'جدول' },
  { id: 'canvas', label: 'بوم' },
];

/**
 * Shell navigation: four destinations (منبع حقیقت، جریان‌های کار، گفتگو، دارایی‌ها). Each has a sub-menu that is open ONLY while
 * its section is active (accordion, aria-expanded). Everything that is not daily work lives in the one «حساب کاربری» menu,
 * which is also the only place the plan is shown.
 */
export const AppNavigation: React.FC<AppNavigationProps> = (p) => {
  const { currentWorkspace, allWorkspaces, activeTab, onTabChange } = p;
  const [drawer, setDrawer] = useState(false);
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;
  const planName = plan.title.split(' ')[0];

  const accountItems: Array<MenuItem & { section: 'workspace' | 'tools' | 'account' }> = [
    ...allWorkspaces.map((w): MenuItem & { section: 'workspace' } => ({ section: 'workspace', label: w.isDemo ? `${w.name} (نمونه)` : w.name, icon: w.id === currentWorkspace.id ? 'Check' : undefined, onSelect: () => p.onSelectWorkspace(w) })),
    { section: 'workspace', label: 'فضای کاری تازه', icon: 'Plus', onSelect: p.onOpenNewWorkspace },
    { section: 'workspace', label: 'ساخت یا بازنشانی فضای نمونه', icon: 'Sparkles', onSelect: p.onResetDemo },
    { section: 'tools', label: 'پلن و ارتقا', icon: 'Sparkles', onSelect: p.onOpenPlanModal },
    { section: 'tools', label: 'مصرف و دفتر کل', icon: 'Wallet', onSelect: p.onOpenLedger },
    { section: 'tools', label: 'کلید هوش مصنوعی', icon: 'Settings', onSelect: p.onOpenAiSettings },
    { section: 'tools', label: 'اتصال به هوش مصنوعی (MCP)', icon: 'Link2', onSelect: p.onOpenConnect },
    { section: 'tools', label: 'وارد کردن حافظهٔ AI', icon: 'Brain', onSelect: p.onOpenMemory },
    { section: 'tools', label: 'شروع سریع', icon: 'Zap', onSelect: p.onOpenOnboarding },
    { section: 'account', label: 'حساب کاربری و داده‌ها', icon: 'User', onSelect: p.onOpenAccountModal },
  ];
  const withDividers = (): MenuItem[] => {
    const out: MenuItem[] = [];
    accountItems.forEach((it, i) => {
      if (i > 0 && accountItems[i - 1].section !== it.section) out.push({ divider: true });
      out.push(it);
    });
    return out;
  };

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-stack-lg select-none">
      <div className="flex flex-col gap-stack-lg">
        <div className="flex items-center gap-inline-md px-inset-sm">
          <BrandMark />
          <div>
            <span className="text-heading-xs text-text-default">مبدأ</span>
            <span className="body-sm block text-text-subtle">منبع حقیقت کسب‌وکار</span>
          </div>
        </div>

        <Button variant="secondary" iconStart="Search" onClick={p.onOpenSearch} aria-keyshortcuts="Control+K Meta+K">جستجو <span className="caption text-text-subtle" dir="ltr">Ctrl K</span></Button>

        <nav className="flex flex-col gap-stack-xs" aria-label="بخش‌های اصلی نرم‌افزار">
          <NavItem icon="House" label="خانه" selected={activeTab === 'home'} onClick={() => onTabChange('home')} />
          <NavItem icon="BookOpen" label="منبع حقیقت" trailing={formatNumber(p.contextCount)} selected={activeTab === 'context'} expanded={activeTab === 'context'} onClick={() => onTabChange('context')} />
          {activeTab === 'context' && (
            <div className="ms-inline-xl flex flex-col gap-stack-xs border-s border-border-default ps-inset-sm">
              {VIEWS.map((v) => <NavItem nested key={v.id} label={v.label} selected={p.contextViewMode === v.id} onClick={() => p.onChangeContextViewMode(v.id)} />)}
            </div>
          )}

          <NavItem icon="Layers" label="جریان‌های کار" trailing={formatNumber(p.specs.length)} selected={activeTab === 'workstreams'} expanded={activeTab === 'workstreams'} onClick={() => onTabChange('workstreams')} />
          {activeTab === 'workstreams' && (
            <div className="ms-inline-xl flex flex-col gap-stack-xs border-s border-border-default ps-inset-sm">
              {p.specs.map((s) => <NavItem nested key={s.id} label={s.title} selected={p.selectedSpecId === s.id} onClick={() => p.onSelectSpecId(s.id)} />)}
              <Button size="sm" variant="ghost" iconStart="Plus" onClick={p.onOpenCustomSpecModal}>جریان کار تازه</Button>
              <Button size="sm" variant="ghost" iconStart="Layers" onClick={p.onOpenSpecLibrary}>افزودن از کتابخانه</Button>
            </div>
          )}

          <NavItem icon="MessageSquare" label="گفتگو" selected={activeTab === 'chat'} onClick={() => onTabChange('chat')} />
          <NavItem icon="Package" label="دارایی‌ها" trailing={formatNumber(p.deliverablesCount)} selected={activeTab === 'assets'} onClick={() => onTabChange('assets')} />
        </nav>
      </div>

      <div className="border-t border-border-default pt-inset-lg">
        <Menu
          label="حساب کاربری"
          side="top"
          className="w-full"
          trigger={(
            <button type="button" className="flex min-h-touch w-full items-center gap-inline-md rounded-control p-inset-sm text-start transition-colors hover:bg-interaction-hover active:bg-interaction-pressed">
              <span className="grid size-control-sm shrink-0 place-items-center rounded-control-sm bg-bg-neutral-subtle text-icon-subtle"><Icon name="User" size="lg" /></span>
              <span className="min-w-space-0 flex-1">
                <span className="label-md block truncate text-text-default">{currentWorkspace.name}</span>
                <span className="body-sm block whitespace-nowrap text-text-subtle">{currentWorkspace.isDemo ? 'نمونه · ' : ''}پلن {planName}</span>
              </span>
              <Icon name="ChevronUp" size="md" className="text-icon-subtle" />
            </button>
          )}
          items={withDividers()}
        />
      </div>
    </div>
  );

  const close = () => setDrawer(false);
  const drawerRow = (it: MenuItem, i: number) => it.divider ? <div key={i} role="separator" className="my-stack-xs border-t border-border-default" /> : (
    <button key={i} type="button" onClick={() => { it.onSelect?.(); close(); }}
      className="flex min-h-touch w-full items-center gap-inline-md rounded-control px-inset-md text-start body-md text-text-default hover:bg-interaction-hover active:bg-interaction-pressed">
      {it.icon ? <Icon name={it.icon as IconName} size="md" /> : <span className="inline-block w-icon-md" aria-hidden="true" />}
      <span>{it.label}</span>
    </button>
  );

  return (
    <>
      {/* Desktop persistent sidebar (inline-start edge) */}
      <aside className="sticky top-space-0 z-dropdown hidden h-screen w-overlay-xs shrink-0 overflow-y-auto border-e border-border-default bg-surface-sunken p-inset-lg md:flex md:flex-col">
        {sidebar}
      </aside>

      {/* Mobile top bar: brand + current workspace. The plan is NOT repeated here. */}
      <header className="sticky top-space-0 z-sticky flex items-center justify-between gap-inline-md border-b border-border-default bg-surface-sunken px-inset-lg py-inset-sm md:hidden">
        <span className="flex min-w-space-0 items-center gap-inline-sm">
          <BrandMark size="sm" />
          <span className="title text-text-default">مبدأ</span>
          <span className="body-sm truncate text-text-subtle">· {currentWorkspace.name}</span>
        </span>
        <span className="flex items-center gap-inline-xs">
          <IconButton icon="Search" label="جستجو" variant="secondary" onClick={p.onOpenSearch} />
          <IconButton icon="User" label="حساب کاربری" variant="secondary" onClick={() => setDrawer(true)} />
        </span>
      </header>

      {/* Mobile account drawer */}
      <Dialog open={drawer} onClose={close} title="حساب کاربری" description={`فضای کاری: ${currentWorkspace.name} · پلن ${planName}`} size="sm">
        <div className="flex flex-col gap-stack-xs">{withDividers().map(drawerRow)}</div>
      </Dialog>

      {/* Mobile bottom navigation: home + the four destinations (the account drawer is the button in the top bar) */}
      <BottomNav
        fixed
        className="md:hidden"
        label="منوی پایینی موبایل"
        value={activeTab}
        onChange={onTabChange}
        items={[
          { id: 'home', label: 'خانه', icon: 'House' },
          { id: 'context', label: 'منبع', icon: 'BookOpen' },
          { id: 'workstreams', label: 'جریان‌ها', icon: 'Layers' },
          { id: 'chat', label: 'گفتگو', icon: 'MessageSquare' },
          { id: 'assets', label: 'دارایی‌ها', icon: 'Package', badge: p.deliverablesCount || undefined, badgeLabel: 'دارایی' },
        ]}
      />
    </>
  );
};
