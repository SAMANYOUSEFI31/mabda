/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Workspace, WorkstreamSpec } from '../../types';
import { PLANS } from '../../core/creditEngine';
import { BottomNav, BrandMark, Button, Dialog, Icon, IconButton, Menu, MenuChoiceRow, NavItem, formatNumber, useTheme, THEME_LABEL, THEME_ORDER } from '../../ui';
import type { IconName, MenuItem, ThemePref } from '../../ui';
import { useAiStatus } from '../../services/aiStatus';
import { requestQuickCapture } from '../../core/quickCapture';

type ContextView = 'doc' | 'read' | 'table' | 'canvas';

interface AppNavigationProps {
  currentWorkspace: Workspace;
  allWorkspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  onOpenNewWorkspace: () => void;
  onOpenOnboarding: () => void;
  /** builds (or rebuilds from nothing) the showcase workspace */
  onResetDemo: () => void;
  /** the showcase can be wiped with one confirm (absent when there is none) */
  onDeleteDemo?: () => void;
  onOpenArchive: () => void;
  onOpenPlanModal: () => void;
  onOpenAccountModal: () => void;
  /** Ctrl/⌘+K: the global search and commands */
  onOpenSearch: () => void;
  /** admin only: how often each feature is used on this install */
  onOpenUsage?: () => void;
  onOpenLedger: () => void;
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
  /** what waits in «فکر»: suggestions, drafts, open thoughts */
  thinkingCount: number;
}

const VIEWS: Array<{ id: ContextView; label: string }> = [
  { id: 'doc', label: 'ساختار' },
  { id: 'read', label: 'سند خوانا' },
  { id: 'canvas', label: 'نمای کلی' },
];

/**
 * Shell navigation: four destinations (خانه، فکر، منبع حقیقت، خروجی‌ها). «خروجی‌ها» = what you build with (جریان‌های کار) + what you built (دارایی‌ها). Each has a sub-menu that is open ONLY while
 * its section is active (accordion, aria-expanded). Everything that is not daily work lives in the one «حساب کاربری» menu,
 * which is also the only place the plan is shown.
 */
export const AppNavigation: React.FC<AppNavigationProps> = (p) => {
  const { currentWorkspace, allWorkspaces, activeTab, onTabChange } = p;
  const [drawer, setDrawer] = useState(false);
  // desktop sidebar: «docked» takes a column; «hidden» leaves only the toggle, and hovering it slides the bar OVER the page (the page never moves);
  // pressing the toggle docks it again. Where there is no hover (touch / keyboard) the toggle alone switches between the two. Remembered.
  const [docked, setDocked] = useState(() => { try { return localStorage.getItem('mabda.sidebar') !== 'hidden'; } catch { return true; } });
  const [peek, setPeek] = useState(false);
  const peekTimer = React.useRef<number | undefined>(undefined);
  const showPeek = () => { window.clearTimeout(peekTimer.current); setPeek(true); };
  const hidePeek = () => { window.clearTimeout(peekTimer.current); peekTimer.current = window.setTimeout(() => setPeek(false), 220); };
  const toggleDock = () => setDocked((v) => { const n = !v; try { localStorage.setItem('mabda.sidebar', n ? 'docked' : 'hidden'); } catch { /* optional */ } setPeek(false); return n; });
  const toggleButton = (
    <IconButton icon="PanelRight" label={docked ? 'پنهان کردن نوار کناری' : 'جا دادن نوار کناری'} aria-expanded={docked} variant="ghost" onClick={toggleDock} />
  );
  const inOutputs = activeTab === 'assets' || activeTab === 'workstreams';
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;
  const planName = plan.title.split(' ')[0];

  const ai = useAiStatus();
  const [theme, setTheme] = useTheme();
  const accountItems: Array<MenuItem & { section: 'workspace' | 'import' | 'plan' | 'account' }> = [
    ...allWorkspaces.map((w): MenuItem & { section: 'workspace' } => ({ section: 'workspace', label: w.isDemo ? `${w.name} (نمونه)` : w.name, icon: w.id === currentWorkspace.id ? 'Check' : undefined, onSelect: () => p.onSelectWorkspace(w) })),
    { section: 'workspace', label: 'فضای کاری تازه', icon: 'Plus', onSelect: p.onOpenNewWorkspace },
    { section: 'workspace', label: 'بازسازی فضای نمونه', icon: 'RotateCcw', onSelect: p.onResetDemo },
    ...(p.onDeleteDemo ? [{ section: 'workspace' as const, label: 'پاک کردن فضای نمونه', icon: 'Trash2' as const, onSelect: p.onDeleteDemo }] : []),
    // grouped by what you are doing: plan and usage · the account (a divider between groups)
    { section: 'import', label: 'وارد کردن سند یا حافظه', icon: 'Brain', onSelect: p.onOpenMemory },
    { section: 'plan', label: 'پلن و ارتقا', icon: 'CreditCard', onSelect: p.onOpenPlanModal },
    { section: 'plan', label: 'مصرف و دفتر کل', icon: 'Wallet', onSelect: p.onOpenLedger },
    ...(p.onOpenUsage && ai.admin ? [{ section: 'plan' as const, label: 'استفاده از امکانات', icon: 'ChartColumn' as const, onSelect: p.onOpenUsage }] : []),
    { section: 'account', label: 'شروع سریع', icon: 'Zap', onSelect: p.onOpenOnboarding },
    { section: 'account', label: 'بایگانی و حذف‌های اخیر', icon: 'Archive', onSelect: p.onOpenArchive },
    { section: 'account', label: 'حساب و داده‌ها', icon: 'User', onSelect: p.onOpenAccountModal },
    { section: 'account', label: 'ظاهر', icon: 'SunMoon', choice: { value: theme, onChoose: (v) => setTheme(v as ThemePref), options: THEME_ORDER.map((t) => ({ value: t, label: THEME_LABEL[t] })) } },
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
        <div className="flex items-center justify-between gap-inline-md px-inset-sm">
          <span className="flex min-w-space-0 items-center gap-inline-md">
            <BrandMark />
            <span className="text-heading-xs text-text-default">مبدأ</span>
          </span>
          {toggleButton}
        </div>

        <button type="button" onClick={p.onOpenSearch} aria-keyshortcuts="Control+K Meta+K" className="label-md flex min-h-touch w-full items-center gap-inline-md rounded-control border border-border-default bg-surface-raised px-inset-md text-start text-text-subtle transition-colors hover:bg-interaction-hover hover:text-text-default active:bg-interaction-pressed">
          <Icon name="Search" size="lg" className="text-icon-subtle" />
          <span className="flex-1">جستجو</span>
          <span className="caption text-text-subtlest" dir="ltr">Ctrl K</span>
        </button>

        <nav className="flex flex-col gap-stack-xs" aria-label="بخش‌های اصلی نرم‌افزار">
          <NavItem icon="House" label="خانه" selected={activeTab === 'home'} onClick={() => onTabChange('home')} />
          <NavItem icon="Lightbulb" label="فکر" trailing={p.thinkingCount ? formatNumber(p.thinkingCount) : undefined} selected={activeTab === 'thinking'} onClick={() => onTabChange('thinking')} />
          <NavItem icon="BookOpen" label="منبع حقیقت" trailing={formatNumber(p.contextCount)} selected={activeTab === 'context'} expanded={activeTab === 'context'} onClick={() => onTabChange('context')} />
          {activeTab === 'context' && (
            <div className="ms-inline-xl flex flex-col gap-stack-xs border-s border-border-default ps-inset-sm">
              {VIEWS.map((v) => <NavItem nested key={v.id} label={v.label} selected={p.contextViewMode === v.id} onClick={() => p.onChangeContextViewMode(v.id)} />)}
            </div>
          )}

          <NavItem icon="Package" label="خروجی‌ها" trailing={formatNumber(p.deliverablesCount)} selected={inOutputs} expanded={inOutputs} onClick={() => onTabChange('assets')} />
          {inOutputs && (
            <div className="ms-inline-xl flex flex-col gap-stack-xs border-s border-border-default ps-inset-sm">
              <NavItem nested label="خروجی‌های تو" selected={activeTab === 'assets'} onClick={() => onTabChange('assets')} />
              {p.specs.map((s) => <NavItem nested key={s.id} label={`${ai.managedEnabled ? 'بساز' : 'آماده‌سازی'}: ${s.title}`} selected={activeTab === 'workstreams' && p.selectedSpecId === s.id} onClick={() => p.onSelectSpecId(s.id)} />)}
              <Button size="sm" variant="ghost" iconStart="Plus" onClick={p.onOpenCustomSpecModal}>جریان کار تازه</Button>
              <Button size="sm" variant="ghost" iconStart="Layers" onClick={p.onOpenSpecLibrary}>افزودن از کتابخانه</Button>
            </div>
          )}
        </nav>
      </div>

      <div className="border-t border-border-default pt-inset-lg">
        <Menu
          label="حساب کاربری"
          side="top"
          className="w-full"
          trigger={(
            <button type="button" aria-label={`حساب کاربری، ${currentWorkspace.name}، پلن ${planName}`} className="flex min-h-touch w-full items-center gap-inline-md rounded-control p-inset-sm text-start transition-colors hover:bg-interaction-hover active:bg-interaction-pressed">
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
  const drawerRow = (it: MenuItem, i: number) => it.divider ? <div key={i} role="separator" className="my-stack-xs border-t border-border-default" /> : it.choice ? <MenuChoiceRow key={i} item={it} labelId={`drawer-choice-${i}`} /> : (
    <button key={i} type="button" onClick={() => { it.onSelect?.(); close(); }}
      className="flex min-h-touch w-full items-center gap-inline-md rounded-control px-inset-md text-start body-md text-text-default hover:bg-interaction-hover active:bg-interaction-pressed">
      {it.icon ? <Icon name={it.icon as IconName} size="md" /> : <span className="inline-block w-icon-md" aria-hidden="true" />}
      <span>{it.label}</span>
    </button>
  );

  return (
    <>
      {/* Desktop persistent sidebar (inline-start edge) */}
      {docked ? (
        <aside className="sticky top-space-0 z-dropdown hidden h-screen w-overlay-xs shrink-0 overflow-y-auto border-e border-border-default bg-surface-sunken p-inset-lg md:flex md:flex-col">
          {sidebar}
        </aside>
      ) : (
        <div className="sticky top-space-0 z-dropdown hidden h-screen shrink-0 md:block" style={{ inlineSize: 64 }} onMouseEnter={showPeek} onMouseLeave={hidePeek} onFocus={showPeek} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hidePeek(); }}>
          <div className="flex justify-center p-inset-lg" style={{ paddingInline: 0 }}>{toggleButton}</div>
          {peek && (
            <aside data-testid="sidebar-peek" className="fixed bottom-space-0 top-space-0 start-space-0 z-overlay flex w-overlay-xs flex-col overflow-y-auto border-e border-border-default bg-surface-overlay p-inset-lg shadow-overlay" aria-label="نوار کناری">
              {sidebar}
            </aside>
          )}
        </div>
      )}

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

      {/* Mobile bottom navigation: four destinations and «ثبت» in the middle (the account drawer is the button in the top bar) */}
      <BottomNav
        fixed
        className="md:hidden"
        label="منوی پایینی موبایل"
        value={activeTab === 'workstreams' ? 'assets' : activeTab}
        onChange={(id) => (id === 'capture' ? requestQuickCapture() : onTabChange(id))}
        items={[
          { id: 'home', label: 'خانه', icon: 'House' },
          { id: 'thinking', label: 'فکر', icon: 'Lightbulb', badge: p.thinkingCount || undefined, badgeLabel: 'مورد باز' },
          // capture lives in the bar itself: always reachable, and it never floats over the page
          { id: 'capture', label: 'ثبت', icon: 'Plus', action: true, testId: 'quick-capture-fab' },
          { id: 'context', label: 'منبع', icon: 'BookOpen' },
          { id: 'assets', label: 'خروجی‌ها', icon: 'Package', badge: p.deliverablesCount || undefined, badgeLabel: 'خروجی' },
        ]}
      />
    </>
  );
};
