/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PlanId, Workspace, WorkstreamSpec } from '../types';
import { PLANS } from '../core/creditEngine';

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

  const creditPercentage = Math.min(
    100,
    Math.round((currentWorkspace.creditsRemaining / plan.creditsMonthly) * 100)
  );

  const navContent = (
    <div className="flex flex-col h-full justify-between text-right font-sans select-none">
      {/* Top Section: Brand & Workspace Switcher */}
      <div className="space-y-4">
        {/* Brand identity */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#e11d48] flex items-center justify-center text-white font-bold text-base shadow-sm">
              م
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold tracking-tight text-white leading-none">
                  مبدأ
                </span>
                <span className="text-[10px] text-[#71717a] font-mono">v3.0</span>
              </div>
              <span className="text-[10px] text-[#a1a1aa] block mt-0.5">منبع حقیقت کسب‌وکار</span>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden text-[#a1a1aa] hover:text-white p-1"
            aria-label="بستن منو"
          >
            ✕
          </button>
        </div>

        {/* Workspace Switcher Card */}
        <div className="bg-[#121215] border border-[#27272a] rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[#a1a1aa]">
            <span>فضای کاری فعال:</span>
            <span className="text-[10px] text-[#10b981] font-semibold bg-[#10b981]/10 px-1.5 py-0.2 rounded">
              پلن {plan.title.split(' ')[0]}
            </span>
          </div>

          <div className="relative">
            <select
              aria-label="انتخاب فضای کاری"
              value={currentWorkspace.id}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  onOpenNewWorkspace();
                  setIsMobileMenuOpen(false);
                } else {
                  const ws = allWorkspaces.find((w) => w.id === e.target.value);
                  if (ws) onSelectWorkspace(ws);
                }
              }}
              className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] text-[#fafafa] text-xs py-2 px-2.5 rounded-lg focus:outline-none focus:border-[#e11d48] cursor-pointer transition-colors truncate"
            >
              {allWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({PLANS[w.planId].title.split(' ')[0]})
                </option>
              ))}
              <option value="__new__">+ ایجاد فضای کاری جدید</option>
            </select>
          </div>
        </div>

        {/* Primary Navigation Links */}
        <nav className="space-y-1 text-xs" aria-label="بخش‌های اصلی نرم‌افزار">
          {/* Item 1: Source of Truth */}
          <div>
            <button
              onClick={() => {
                onTabChange('context');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeTab === 'context'
                  ? 'bg-[#18181b] text-white font-bold border border-[#27272a] shadow-xs'
                  : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">📖</span>
                <span>منبع حقیقت (Source of Truth)</span>
              </div>
              <span className="text-[10px] font-mono text-[#71717a]">{contextCount}</span>
            </button>

            {/* Sub-modes for Context View (Document vs Table) */}
            {activeTab === 'context' && (
              <div className="mr-8 mt-1 space-y-0.5 border-r border-[#27272a] pr-2 text-[11px]">
                <button
                  onClick={() => onChangeContextViewMode('doc')}
                  className={`w-full text-right py-1 px-2 rounded-md transition-colors ${
                    contextViewMode === 'doc'
                      ? 'text-[#e11d48] font-bold bg-[#e11d48]/10'
                      : 'text-[#a1a1aa] hover:text-white'
                  }`}
                >
                  • نمای سندی و درختی
                </button>
                <button
                  onClick={() => onChangeContextViewMode('table')}
                  className={`w-full text-right py-1 px-2 rounded-md transition-colors ${
                    contextViewMode === 'table'
                      ? 'text-[#e11d48] font-bold bg-[#e11d48]/10'
                      : 'text-[#a1a1aa] hover:text-white'
                  }`}
                >
                  • نمای پایگاه‌داده و جدول
                </button>
              </div>
            )}
          </div>

          {/* Item 2: Workstreams & Gap Radar */}
          <div>
            <button
              onClick={() => {
                onTabChange('workstreams');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
                activeTab === 'workstreams'
                  ? 'bg-[#18181b] text-white font-bold border border-[#27272a] shadow-xs'
                  : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">⚙️</span>
                <span>استودیو جریان‌های کار & رادار</span>
              </div>
              <span className="text-[10px] text-[#fb7185] bg-[#e11d48]/10 px-1.5 py-0.2 rounded font-mono">
                {specs.length}
              </span>
            </button>

            {/* Sub-menu of defined workstreams */}
            <div className="mr-8 mt-1.5 space-y-1 border-r border-[#27272a] pr-2 text-[11px]">
              <div className="flex items-center justify-between text-[10px] text-[#71717a] pb-0.5">
                <span>جریان‌های تعریف‌شده:</span>
                <button
                  onClick={() => {
                    onOpenCustomSpecModal();
                    setIsMobileMenuOpen(false);
                  }}
                  className="text-[#fb7185] hover:underline"
                >
                  + جدید
                </button>
              </div>

              {specs.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onTabChange('workstreams');
                    onSelectSpecId(s.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-right py-1.5 px-2 rounded-md transition-all truncate block ${
                    activeTab === 'workstreams' && selectedSpecId === s.id
                      ? 'text-white font-bold bg-[#18181b] border border-[#3f3f46]'
                      : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/30'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          {/* Item 3: Smart Discovery Chat */}
          <button
            onClick={() => {
              onTabChange('chat');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
              activeTab === 'chat'
                ? 'bg-[#18181b] text-white font-bold border border-[#27272a] shadow-xs'
                : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">💬</span>
              <span>گفتگو و استخراج دانش</span>
            </div>
            <span className="text-[10px] font-mono text-[#71717a]">
              {todayChatCount}/{plan.dailyChatLimit}
            </span>
          </button>

          {/* Item 4: Asset Library */}
          <button
            onClick={() => {
              onTabChange('assets');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
              activeTab === 'assets'
                ? 'bg-[#18181b] text-white font-bold border border-[#27272a] shadow-xs'
                : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">📦</span>
              <span>کتابخانه دارایی‌ها (Assets)</span>
            </div>
            <span className="text-[10px] font-mono text-[#71717a]">{deliverablesCount}</span>
          </button>

          {/* Item 5: Ledger & Economics */}
          <button
            onClick={() => {
              onTabChange('ledger');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${
              activeTab === 'ledger'
                ? 'bg-[#18181b] text-white font-bold border border-[#27272a] shadow-xs'
                : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">💳</span>
              <span>دفتر کل و شفافیت مالی</span>
            </div>
            <span className="text-[10px] text-[#10b981] font-mono">✓</span>
          </button>
        </nav>
      </div>

      {/* Bottom Section: Credit Gauge, Onboarding, and User Account */}
      <div className="pt-4 mt-4 border-t border-[#27272a] space-y-3">
        {/* Credits Gauge Card */}
        <div
          onClick={() => {
            onOpenPlanModal();
            setIsMobileMenuOpen(false);
          }}
          className="bg-[#121215] hover:bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] rounded-xl p-3 cursor-pointer transition-all space-y-2"
          title="مشاهده پلن‌ها و افزایش اعتبار"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#a1a1aa]">موجودی اعتبار:</span>
            <span className="font-bold text-white font-mono">
              {currentWorkspace.creditsRemaining} / {plan.creditsMonthly}
            </span>
          </div>

          <div className="w-full bg-[#27272a] h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                creditPercentage > 40
                  ? 'bg-[#10b981]'
                  : creditPercentage > 15
                  ? 'bg-[#f59e0b]'
                  : 'bg-[#e11d48]'
              }`}
              style={{ width: `${creditPercentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#71717a]">
            <span>پلن {plan.title}</span>
            <span className="text-[#fb7185] hover:underline">ارتقا یا تغییر &larr;</span>
          </div>
        </div>

        {/* 10-Minute Onboarding Launcher */}
        <button
          onClick={() => {
            onOpenOnboarding();
            setIsMobileMenuOpen(false);
          }}
          className="w-full py-2 px-3 text-xs font-semibold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5"
        >
          <span>⚡</span>
          <span>راه‌اندازی ۱۰ دقیقه‌ای برند</span>
        </button>

        {/* User Account / Profile */}
        <div
          onClick={() => {
            onOpenAccountModal();
            setIsMobileMenuOpen(false);
          }}
          className="flex items-center justify-between p-2 rounded-xl hover:bg-[#18181b] border border-transparent hover:border-[#27272a] cursor-pointer transition-all"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="w-7 h-7 rounded-lg bg-[#27272a] flex items-center justify-center text-sm">
              👤
            </span>
            <div>
              <span className="text-[#fafafa] font-semibold block text-[11px]" dir="ltr">
                ۰۹۱۲۳۴۵۶۷۸۹
              </span>
              <span className="text-[10px] text-[#10b981]">حساب تأییدشده ✓</span>
            </div>
          </div>
          <span className="text-xs text-[#71717a]">⚙️</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (RTL: on the right) */}
      <aside className="hidden md:flex w-72 h-screen sticky top-0 bg-[#09090b] border-l border-[#27272a] p-4 flex-col shrink-0 z-30 overflow-y-auto">
        {navContent}
      </aside>

      {/* Mobile Top Minimal Bar */}
      <header className="md:hidden sticky top-0 z-40 bg-[#09090b]/95 backdrop-blur-md border-b border-[#27272a] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-8 h-8 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center text-white text-sm"
            aria-label="باز کردن منو"
          >
            ☰
          </button>
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-md bg-[#e11d48] flex items-center justify-center text-white font-bold text-xs">
              م
            </span>
            <span className="font-bold text-white text-sm">مبدأ</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={onOpenPlanModal}
            className="px-2.5 py-1 rounded-lg bg-[#18181b] border border-[#27272a] text-[#fafafa] font-mono text-[11px]"
          >
            {currentWorkspace.creditsRemaining} cr
          </button>
          <button
            onClick={onOpenAccountModal}
            className="w-7 h-7 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center text-xs"
            aria-label="پروفایل"
          >
            👤
          </button>
        </div>
      </header>

      {/* Mobile Drawer (Slide in from Right) */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="md:hidden fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-4/5 max-w-sm h-full bg-[#09090b] border-l border-[#27272a] p-4 flex flex-col shadow-2xl"
          >
            {navContent}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Apple / Google Design Standard) */}
      <nav
        aria-label="منوی پایینی موبایل"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 backdrop-blur-md border-t border-[#27272a] flex items-center justify-around px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <button
          onClick={() => onTabChange('context')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors flex-1 ${
            activeTab === 'context'
              ? 'text-[#e11d48] font-bold'
              : 'text-[#71717a] hover:text-[#fafafa]'
          }`}
        >
          <span className="text-lg leading-none">📖</span>
          <span className="text-[10px] mt-1">منبع حقیقت</span>
        </button>

        <button
          onClick={() => onTabChange('workstreams')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors flex-1 ${
            activeTab === 'workstreams'
              ? 'text-[#e11d48] font-bold'
              : 'text-[#71717a] hover:text-[#fafafa]'
          }`}
        >
          <span className="text-lg leading-none">⚡</span>
          <span className="text-[10px] mt-1">جریان‌ها</span>
        </button>

        <button
          onClick={() => onTabChange('chat')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors flex-1 relative ${
            activeTab === 'chat'
              ? 'text-[#e11d48] font-bold'
              : 'text-[#71717a] hover:text-[#fafafa]'
          }`}
        >
          <span className="text-lg leading-none">💬</span>
          <span className="text-[10px] mt-1">گفتگو</span>
        </button>

        <button
          onClick={() => onTabChange('assets')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors flex-1 relative ${
            activeTab === 'assets'
              ? 'text-[#e11d48] font-bold'
              : 'text-[#71717a] hover:text-[#fafafa]'
          }`}
        >
          <span className="text-lg leading-none">📦</span>
          <span className="text-[10px] mt-1">دارایی‌ها</span>
          {deliverablesCount > 0 && (
            <span className="absolute top-1 right-2.5 w-3.5 h-3.5 rounded-full bg-[#18181b] border border-[#27272a] text-[9px] font-mono flex items-center justify-center text-[#a1a1aa]">
              {deliverablesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('ledger')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors flex-1 ${
            activeTab === 'ledger'
              ? 'text-[#e11d48] font-bold'
              : 'text-[#71717a] hover:text-[#fafafa]'
          }`}
        >
          <span className="text-lg leading-none">💳</span>
          <span className="text-[10px] mt-1">دفتر کل</span>
        </button>
      </nav>
    </>
  );
};
