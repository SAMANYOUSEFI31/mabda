/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Workspace, WorkstreamSpec } from '../../types';
import { PLANS } from '../../core/creditEngine';
import { BottomNav, BrandMark, Button, Dialog, Icon, IconButton, Menu, MenuChoiceRow, NavItem, useTheme, THEME_LABEL, THEME_ORDER } from '../../ui';
import type { IconName, MenuItem, ThemePref } from '../../ui';
import { useAiStatus } from '../../services/aiStatus';
import { defaultAddKind, requestAdd } from '../../core/addRequest';


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
  contextCount: number;
  deliverablesCount: number;
  /** what waits in «فکر»: suggestions, drafts, open thoughts */
  thinkingCount: number;
  /** the space's top-level sections: the only places listed under a destination */
  sections: Array<{ id: string; label: string }>;
  focusNodeId: string | null;
  /** open a section of «منبع» (null = the whole source) */
  onOpenSection: (id: string | null) => void;
}

/**
 * Shell navigation: four destinations (خانه، فکر، منبع حقیقت، خروجی‌ها). «خروجی‌ها» = what you build with (جریان‌های کار) + what you built (دارایی‌ها). The sidebar lists PLACES, never views or actions:
 * only «منبع» has places inside it (its top-level sections), shown while it is active; views switch on the page itself. Everything that is not daily work lives in the one «حساب کاربری» menu,
 * which is also the only place the plan is shown.
 */
/** each space says what kind it is in the picker (navigation.md «انتخابگر فضا») */
const PURPOSE_FA = { personal: 'شخصی', work: 'کاری', project: 'پروژه', empty: 'خالی' } as const;

/** a media query as state (navigation.md breakpoints) */
function useMedia(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}

export const AppNavigation: React.FC<AppNavigationProps> = (p) => {
  const { currentWorkspace, allWorkspaces, activeTab, onTabChange } = p;
  const [drawer, setDrawer] = useState(false);
  // navigation.md «رفتار در هر پهنا»: ≥1280 open, 1024–1279 narrow (icons only) unless the person opened it, 768–1023 always narrow
  // and «open» means a drawer OVER the page with a scrim (closes on a destination or Esc). The person's choice wins; remembered per device.
  const wide = useMedia('(min-width: 1280px)');
  const roomy = useMedia('(min-width: 1024px)');
  const [pref, setPref] = useState<'docked' | 'hidden' | null>(() => { try { const v = localStorage.getItem('mabda.sidebar'); return v === 'docked' || v === 'hidden' ? v : null; } catch { return null; } });
  const docked = roomy && (pref ? pref === 'docked' : wide);
  const [overlay, setOverlay] = useState(false);
  // «کاغذ کالک» only while content passes under a bar: the top bar once scrolled, the bottom bar until the end (navigation.md)
  const [under, setUnder] = useState({ top: false, bottom: true });
  useEffect(() => {
    const on = () => { const d = document.documentElement; const y = window.scrollY; const next = { top: y > 0, bottom: d.scrollHeight - window.innerHeight - y > 1 }; setUnder((u) => (u.top === next.top && u.bottom === next.bottom ? u : next)); };
    on(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    const ro = new ResizeObserver(on); ro.observe(document.body);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); ro.disconnect(); };
  }, []);
  const setDock = (n: boolean) => { setPref(n ? 'docked' : 'hidden'); setOverlay(false); try { localStorage.setItem('mabda.sidebar', n ? 'docked' : 'hidden'); } catch { /* optional */ } };
  const toggleDock = () => { if (!roomy) setOverlay((v) => !v); else setDock(!docked); };
  const go = (tab: Parameters<typeof onTabChange>[0]) => { setOverlay(false); onTabChange(tab); };
  // the drawer is modal: focus goes in, Tab stays in, Esc closes, and focus returns to what opened it (overlays.md «رفتار»)
  const drawerRef = React.useRef<HTMLElement>(null);
  useEffect(() => {
    if (!overlay) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = drawerRef.current;
    const items = () => Array.from(el?.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input,[tabindex]:not([tabindex="-1"])') ?? []);
    items()[0]?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="menu"]')) { e.preventDefault(); setOverlay(false); }
      if (e.key === 'Tab') {
        const list = items(); if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); if (opener && opener.isConnected) opener.focus(); };
  }, [overlay]);
  // navigation.md «تغییر اندازه»: the inner edge is a separator; 232–360 (tokens), a drag under 200 snaps to the rail,
  // double-click returns to the default, arrows move 8, Home/End, Enter docks/undocks, Ctrl/⌘+\ toggles. Remembered per device.
  const token = (name: string, fallback: number) => { try { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback; } catch { return fallback; } };
  const [width, setWidth] = useState<number | null>(() => { try { const v = Number(localStorage.getItem('mabda.sidebar.width')); return v > 0 ? v : null; } catch { return null; } });
  const bounds = () => ({ min: token('--sidebar-width-min', 232), max: token('--sidebar-width-max', 360), def: token('--sidebar-width', 264) });
  const saveWidth = (w: number | null) => { setWidth(w); try { if (w === null) localStorage.removeItem('mabda.sidebar.width'); else localStorage.setItem('mabda.sidebar.width', String(w)); } catch { /* optional */ } };
  const SNAP = 200; // below this a drag means «narrow», not «narrower» (navigation.md)
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const aside = e.currentTarget.parentElement; if (!aside) return;
    e.preventDefault();
    const rtl = getComputedStyle(aside).direction === 'rtl';
    const rect = aside.getBoundingClientRect();
    const { min, max } = bounds();
    const move = (ev: PointerEvent) => {
      const w = rtl ? rect.right - ev.clientX : ev.clientX - rect.left;
      if (w < SNAP) { stop(); setDock(false); return; }
      setWidth(Math.round(Math.min(max, Math.max(min, w))));
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); setWidth((w) => { try { if (w) localStorage.setItem('mabda.sidebar.width', String(w)); } catch { /* optional */ } return w; }); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  const keyResize = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const { min, max, def } = bounds();
    const now = width ?? def;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    // the edge moves the way the arrow points: in RTL the inner edge is on the left, so ← widens
    const grow = e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') ? 8 : e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') ? -8 : 0;
    if (grow) { e.preventDefault(); saveWidth(Math.min(max, Math.max(min, now + grow))); }
    else if (e.key === 'Home') { e.preventDefault(); saveWidth(min); }
    else if (e.key === 'End') { e.preventDefault(); saveWidth(max); }
    else if (e.key === 'Enter') { e.preventDefault(); setDock(false); }
  };
  useEffect(() => {
    // the physical key (event.code), so it works on a Persian layout too (navigation.md «میان‌برها»)
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.code === 'Backslash') { e.preventDefault(); toggleRef.current(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggleRef = React.useRef(toggleDock);
  toggleRef.current = toggleDock;
  const toggleButton = (
    <IconButton icon="PanelRight" label={docked || overlay ? 'باریک کردن نوار کناری' : 'باز کردن نوار کناری'} aria-expanded={docked || overlay} aria-keyshortcuts={"Control+\\ Meta+\\"} variant="ghost" onClick={toggleDock} />
  );
  const inOutputs = activeTab === 'assets' || activeTab === 'workstreams';
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;
  const planName = plan.title.split(' ')[0];

  const ai = useAiStatus();
  const [theme, setTheme] = useTheme();
  // navigation.md: the space picker sits at the head of the bar; the account menu is at most 7 rows and has no spaces in it
  const workspaceItems: MenuItem[] = [
    ...allWorkspaces.map((w): MenuItem => ({ label: `${w.name}${w.isDemo ? ' (نمونه)' : ''} · ${PURPOSE_FA[w.purpose ?? 'work']}`, icon: w.id === currentWorkspace.id ? 'Check' : undefined, onSelect: () => p.onSelectWorkspace(w) })),
    { label: 'فضای تازه…', icon: 'Plus', onSelect: p.onOpenNewWorkspace },
    { divider: true },
    { label: 'وارد کردن سند یا حافظه', icon: 'FolderInput', onSelect: p.onOpenMemory },
    { label: 'بازسازی فضای نمونه', icon: 'RotateCcw', onSelect: p.onResetDemo },
    ...(p.onDeleteDemo ? [{ label: 'حذف فضای نمونه', icon: 'Trash2' as const, onSelect: p.onDeleteDemo }] : []),
  ];
  const accountItems: MenuItem[] = [
    { label: 'حساب و داده‌ها', icon: 'User', onSelect: p.onOpenAccountModal },
    { label: 'پلن و ارتقا', icon: 'CreditCard', onSelect: p.onOpenPlanModal },
    { label: 'مصرف', icon: 'Wallet', onSelect: p.onOpenLedger },
    ...(p.onOpenUsage && ai.admin ? [{ label: 'استفاده از امکانات', icon: 'ChartColumn' as const, onSelect: p.onOpenUsage }] : []),
    { label: 'بایگانی و حذف‌های اخیر', icon: 'Archive', onSelect: p.onOpenArchive },
    { label: 'راهنما و شروع سریع', icon: 'Compass', onSelect: p.onOpenOnboarding },
    { divider: true },
    { label: 'ظاهر', icon: 'SunMoon', choice: { value: theme, onChoose: (v) => setTheme(v as ThemePref), options: THEME_ORDER.map((t) => ({ value: t, label: THEME_LABEL[t] })) } },
  ];
  const workspacePicker = (compact: boolean) => (
    <Menu
      label="فضاها"
      className="min-w-space-0 flex-1"
      trigger={(
        <button type="button" aria-label={`فضا: ${currentWorkspace.name}، عوض کردن فضا`} className="flex min-h-touch w-full min-w-space-0 items-center gap-inline-sm rounded-control px-inset-sm text-start transition-colors hover:bg-interaction-hover active:bg-interaction-pressed">
          <BrandMark size={compact ? 'sm' : undefined} />
          <span className={compact ? 'body-sm min-w-space-0 flex-1 truncate text-text-subtle' : 'label-md min-w-space-0 flex-1 truncate text-text-default'}>{currentWorkspace.name}</span>
          <Icon name="ChevronsUpDown" size="md" className="shrink-0 text-icon-subtle" />
        </button>
      )}
      items={workspaceItems}
    />
  );

  const sidebar = (
    <div className="flex h-full min-h-space-0 flex-col gap-stack-lg select-none">
      <div className="flex shrink-0 flex-col gap-stack-lg">
        <div className="flex items-center justify-between gap-inline-xs">
          {workspacePicker(false)}
          {toggleButton}
        </div>

        <button type="button" onClick={p.onOpenSearch} aria-keyshortcuts="Control+K Meta+K" className="label-md flex min-h-touch w-full items-center gap-inline-md rounded-control border border-border-default bg-surface-raised px-inset-md text-start text-text-subtle transition-colors hover:bg-interaction-hover hover:text-text-default active:bg-interaction-pressed">
          <Icon name="Search" size="lg" className="text-icon-subtle" />
          <span className="flex-1">جستجو</span>
          <span className="caption text-text-subtlest" dir="ltr">Ctrl K</span>
        </button>
      </div>

      {/* the only part that scrolls (navigation.md): vertical only, never sideways */}
      <nav className="mb-sidebar__nav flex min-h-space-0 flex-1 flex-col gap-stack-xs" aria-label="بخش‌های اصلی نرم‌افزار">
          <NavItem icon="House" label="خانه" selected={activeTab === 'home'} onClick={() => go('home')} />
          {/* counters only for «منتظر تو» (navigation.md): a destination never shows how much it holds */}
          <NavItem icon="Lightbulb" label="فکر" selected={activeTab === 'thinking'} onClick={() => go('thinking')} />
          <NavItem icon="BookOpen" label="منبع حقیقت" selected={activeTab === 'context' && !p.sections.some((n) => n.id === p.focusNodeId)} expanded={activeTab === 'context' && p.sections.length > 0} onClick={() => { go('context'); p.onOpenSection(null); }} />
          {/* the sidebar holds PLACES, never views or actions (navigation.md): only «منبع» has places inside it, its sections */}
          {activeTab === 'context' && p.sections.length > 0 && (
            <div className="ms-inline-xl flex flex-col gap-stack-xs border-s border-border-default ps-inset-sm" role="group" aria-label="بخش‌های منبع">
              {p.sections.map((n) => <NavItem nested key={n.id} label={n.label} selected={p.focusNodeId === n.id} onClick={() => { setOverlay(false); p.onOpenSection(n.id); }} />)}
            </div>
          )}

          <NavItem icon="Package" label="خروجی‌ها" selected={inOutputs} onClick={() => go('assets')} />
      </nav>

      <div className="shrink-0 border-t border-border-default pt-inset-lg">
        <Menu
          label="حساب کاربری"
          side="top"
          className="w-full"
          trigger={(
            <button type="button" aria-label={`حساب کاربری، پلن ${planName}`} className="flex min-h-touch w-full items-center gap-inline-md rounded-control p-inset-sm text-start transition-colors hover:bg-interaction-hover active:bg-interaction-pressed">
              <span className="grid size-control-sm shrink-0 place-items-center rounded-control-sm bg-bg-neutral-subtle text-icon-subtle"><Icon name="User" size="lg" /></span>
              <span className="min-w-space-0 flex-1">
                <span className="label-md block truncate text-text-default">حساب من</span>
                <span className="body-sm block whitespace-nowrap text-text-subtle">پلن {planName}</span>
              </span>
              <Icon name="ChevronsUpDown" size="md" className="text-icon-subtle" />
            </button>
          )}
          items={accountItems}
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
      {/* Desktop sidebar (inline-start edge): open, or a narrow icons-only rail */}
      {docked ? (
        <aside className="sticky top-space-0 z-dropdown hidden h-screen w-sidebar shrink-0 border-e border-border-default bg-surface-sunken p-inset-lg md:flex md:flex-col" style={width ? { inlineSize: `${width}px` } : undefined}>
          {sidebar}
          <div role="separator" tabIndex={0} aria-orientation="vertical" aria-label="پهنای نوار کناری" aria-valuemin={bounds().min} aria-valuemax={bounds().max} aria-valuenow={width ?? bounds().def}
            className="mb-sidebar-handle" onPointerDown={startResize} onDoubleClick={() => saveWidth(null)} onKeyDown={keyResize} />
        </aside>
      ) : (
        <aside data-testid="sidebar-rail" className="mb-rail sticky top-space-0 z-dropdown hidden h-screen shrink-0 flex-col items-center border-e border-border-default bg-surface-sunken md:flex" aria-label="نوار کناری باریک">
          <Menu label="فضاها" trigger={<button type="button" aria-label={`فضا: ${currentWorkspace.name}، عوض کردن فضا`} title={currentWorkspace.name} className="grid min-h-touch min-w-touch place-items-center rounded-control transition-colors hover:bg-interaction-hover active:bg-interaction-pressed"><BrandMark /></button>} items={workspaceItems} />
          {toggleButton}
          <IconButton icon="Search" label="جستجو" aria-keyshortcuts="Control+K Meta+K" variant="ghost" onClick={p.onOpenSearch} />
          <nav className="mb-rail__nav flex min-h-space-0 w-full flex-1 flex-col overflow-y-auto" aria-label="بخش‌های اصلی نرم‌افزار">
            <NavItem compact icon="House" label="خانه" selected={activeTab === 'home'} onClick={() => go('home')} />
            <NavItem compact icon="Lightbulb" label="فکر" selected={activeTab === 'thinking'} onClick={() => go('thinking')} />
            <NavItem compact icon="BookOpen" label="منبع حقیقت" selected={activeTab === 'context'} onClick={() => go('context')} />
            <NavItem compact icon="Package" label="خروجی‌ها" selected={inOutputs} onClick={() => go('assets')} />
          </nav>
          <Menu label="حساب کاربری" side="top" trigger={<IconButton icon="User" label={`حساب کاربری، پلن ${planName}`} variant="ghost" />} items={accountItems} />
        </aside>
      )}
      {overlay && !docked && (
        // over the rail and the page (layer «dialog»), entering from its own edge with the scrim fading in (motion.md)
        <div className="fixed inset-space-0 z-dialog hidden md:block">
          <button type="button" aria-label="بستن نوار کناری" tabIndex={-1} className="mb-drawer-scrim absolute inset-space-0 bg-bg-scrim" onClick={() => setOverlay(false)} />
          <aside ref={drawerRef} role="dialog" aria-modal="true" data-testid="sidebar-overlay" className="mb-drawer absolute bottom-space-0 top-space-0 start-space-0 flex w-sidebar flex-col border-e border-border-default bg-surface-overlay p-inset-lg shadow-overlay" aria-label="نوار کناری">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Mobile top bar: brand + current workspace. The plan is NOT repeated here. */}
      <header data-pin="app" data-under={under.top || undefined} className="mb-glass sticky top-space-0 z-sticky flex items-center justify-between gap-inline-md border-b border-border-default px-inset-lg py-inset-sm md:hidden">
        <span className="flex min-w-space-0 flex-1 items-center">{workspacePicker(true)}</span>
        <span className="flex items-center gap-inline-xs">
          <IconButton icon="Search" label="جستجو" variant="secondary" onClick={p.onOpenSearch} />
          <IconButton icon="User" label="حساب کاربری" variant="secondary" onClick={() => setDrawer(true)} />
        </span>
      </header>

      {/* Mobile account drawer */}
      <Dialog open={drawer} onClose={close} title="حساب کاربری" description={`پلن ${planName}`} size="sm">
        <div className="flex flex-col gap-stack-xs">{accountItems.map(drawerRow)}</div>
      </Dialog>

      {/* Mobile bottom navigation: four destinations and «ثبت» in the middle (the account drawer is the button in the top bar) */}
      <BottomNav
        fixed
        under={under.bottom}
        className="md:hidden"
        label="منوی پایینی موبایل"
        value={activeTab === 'workstreams' ? 'assets' : activeTab}
        onChange={(id) => (id === 'capture' ? requestAdd({ kind: defaultAddKind(activeTab) }) : onTabChange(id))}
        items={[
          { id: 'home', label: 'خانه', icon: 'House' },
          { id: 'thinking', label: 'فکر', icon: 'Lightbulb' },
          // capture lives in the bar itself: always reachable, and it never floats over the page
          { id: 'capture', label: 'افزودن', icon: 'Plus', action: true, testId: 'quick-capture-fab' },
          { id: 'context', label: 'منبع', icon: 'BookOpen' },
          { id: 'assets', label: 'خروجی‌ها', icon: 'Package' },
        ]}
      />
    </>
  );
};
