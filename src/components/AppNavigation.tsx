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
    <div className="flex flex-col h-full justify-between text-end font-sans select-none">
      {/* Top Section: Brand & Workspace Switcher */}
      <div className="space-y-stack-md">
        {/* Brand identity */}
        <div className="flex items-center justify-between px-inset-sm pt-inset-xs">
          <div className="flex items-center gap-inline-md">
            <span className="w-space-8 h-space-8 rounded-control bg-bg-brand-bold flex items-center justify-center text-text-default font-bold text-body-md shadow-raised">
              م
            </span>
            <div>
              <div className="flex items-center gap-inline-sm">
                <span className="text-body-md font-bold text-text-default leading-tight">
                  مبدأ
                </span>
                <span className="text-caption text-text-subtlest font-mono">v3.0</span>
              </div>
              <span className="text-caption text-text-subtle block mt-stack-xs">منبع حقیقت کسب‌وکار</span>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden text-text-subtle hover:text-text-default p-inset-xs"
            aria-label="بستن منو"
          >
            ✕
          </button>
        </div>

        {/* Workspace Switcher Card */}
        <div className="bg-surface-raised border border-border-default rounded-control p-inset-md space-y-stack-sm">
          <div className="flex items-center justify-between text-caption text-text-subtle">
            <span>فضای کاری فعال:</span>
            <span className="text-caption text-text-success font-semibold bg-bg-success-subtle px-inset-sm py-inset-lg rounded-indicator">
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
              className="w-full bg-surface-raised border border-border-default hover:border-border-bold text-text-default text-body-sm py-inset-sm px-inset-md rounded-control-sm focus:outline-none focus:border-border-brand cursor-pointer transition-colors truncate"
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
        <nav className="space-y-stack-xs text-body-sm" aria-label="بخش‌های اصلی نرم‌افزار">
          {/* Item 1: Source of Truth */}
          <div>
            <button
              onClick={() => {
                onTabChange('context');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-inset-md py-inset-md rounded-control transition-all ${
                activeTab === 'context'
                  ? 'bg-surface-raised text-text-default font-bold border border-border-default shadow-raised'
                  : 'text-text-subtle hover:text-text-default hover:bg-surface-raised'
              }`}
            >
              <div className="flex items-center gap-inline-md">
                <span className="text-body-md">📖</span>
                <span>منبع حقیقت (Source of Truth)</span>
              </div>
              <span className="text-caption font-mono text-text-subtlest">{contextCount}</span>
            </button>

            {/* Sub-modes for Context View (Document vs Table) */}
            {activeTab === 'context' && (
              <div className="me-inline-xl mt-stack-xs space-y-stack-xs border-e border-border-default pe-inset-sm text-caption">
                <button
                  onClick={() => onChangeContextViewMode('doc')}
                  className={`w-full text-end py-inset-xs px-inset-sm rounded-control-sm transition-colors ${
                    contextViewMode === 'doc'
                      ? 'text-text-brand font-bold bg-bg-brand-subtle'
                      : 'text-text-subtle hover:text-text-default'
                  }`}
                >
                  • نمای سندی و درختی
                </button>
                <button
                  onClick={() => onChangeContextViewMode('table')}
                  className={`w-full text-end py-inset-xs px-inset-sm rounded-control-sm transition-colors ${
                    contextViewMode === 'table'
                      ? 'text-text-brand font-bold bg-bg-brand-subtle'
                      : 'text-text-subtle hover:text-text-default'
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
              className={`w-full flex items-center justify-between px-inset-md py-inset-md rounded-control transition-all ${
                activeTab === 'workstreams'
                  ? 'bg-surface-raised text-text-default font-bold border border-border-default shadow-raised'
                  : 'text-text-subtle hover:text-text-default hover:bg-surface-raised'
              }`}
            >
              <div className="flex items-center gap-inline-md">
                <span className="text-body-md">⚙️</span>
                <span>استودیو جریان‌های کار & رادار</span>
              </div>
              <span className="text-caption text-text-brand bg-bg-brand-subtle px-inset-sm py-inset-lg rounded-indicator font-mono">
                {specs.length}
              </span>
            </button>

            {/* Sub-menu of defined workstreams */}
            <div className="me-inline-xl mt-stack-sm space-y-stack-xs border-e border-border-default pe-inset-sm text-caption">
              <div className="flex items-center justify-between text-caption text-text-subtlest pb-inset-xs">
                <span>جریان‌های تعریف‌شده:</span>
                <button
                  onClick={() => {
                    onOpenCustomSpecModal();
                    setIsMobileMenuOpen(false);
                  }}
                  className="text-text-brand hover:underline"
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
                  className={`w-full text-end py-inset-sm px-inset-sm rounded-control-sm transition-all truncate block ${
                    activeTab === 'workstreams' && selectedSpecId === s.id
                      ? 'text-text-default font-bold bg-surface-raised border border-border-bold'
                      : 'text-text-subtle hover:text-text-default hover:bg-surface-raised'
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
            className={`w-full flex items-center justify-between px-inset-md py-inset-md rounded-control transition-all ${
              activeTab === 'chat'
                ? 'bg-surface-raised text-text-default font-bold border border-border-default shadow-raised'
                : 'text-text-subtle hover:text-text-default hover:bg-surface-raised'
            }`}
          >
            <div className="flex items-center gap-inline-md">
              <span className="text-body-md">💬</span>
              <span>گفتگو و استخراج دانش</span>
            </div>
            <span className="text-caption font-mono text-text-subtlest">
              {todayChatCount}/{plan.dailyChatLimit}
            </span>
          </button>

          {/* Item 4: Asset Library */}
          <button
            onClick={() => {
              onTabChange('assets');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-inset-md py-inset-md rounded-control transition-all ${
              activeTab === 'assets'
                ? 'bg-surface-raised text-text-default font-bold border border-border-default shadow-raised'
                : 'text-text-subtle hover:text-text-default hover:bg-surface-raised'
            }`}
          >
            <div className="flex items-center gap-inline-md">
              <span className="text-body-md">📦</span>
              <span>کتابخانه دارایی‌ها (Assets)</span>
            </div>
            <span className="text-caption font-mono text-text-subtlest">{deliverablesCount}</span>
          </button>

          {/* Item 5: Ledger & Economics */}
          <button
            onClick={() => {
              onTabChange('ledger');
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-inset-md py-inset-md rounded-control transition-all ${
              activeTab === 'ledger'
                ? 'bg-surface-raised text-text-default font-bold border border-border-default shadow-raised'
                : 'text-text-subtle hover:text-text-default hover:bg-surface-raised'
            }`}
          >
            <div className="flex items-center gap-inline-md">
              <span className="text-body-md">💳</span>
              <span>دفتر کل و شفافیت مالی</span>
            </div>
            <span className="text-caption text-text-success font-mono">✓</span>
          </button>
        </nav>
      </div>

      {/* Bottom Section: Credit Gauge, Onboarding, and User Account */}
      <div className="pt-inset-lg mt-stack-md border-t border-border-default space-y-stack-md">
        {/* Credits Gauge Card */}
        <div
          onClick={() => {
            onOpenPlanModal();
            setIsMobileMenuOpen(false);
          }}
          className="bg-surface-raised hover:bg-surface-raised border border-border-default hover:border-border-bold rounded-control p-inset-md cursor-pointer transition-all space-y-stack-sm"
          title="مشاهده پلن‌ها و افزایش اعتبار"
        >
          <div className="flex items-center justify-between text-body-sm">
            <span className="text-text-subtle">موجودی اعتبار:</span>
            <span className="font-bold text-text-default font-mono">
              {currentWorkspace.creditsRemaining} / {plan.creditsMonthly}
            </span>
          </div>

          <div className="w-full bg-bg-neutral-subtle h-space-1 rounded-pill overflow-hidden">
            <div
              className={`h-full rounded-pill transition-all ${
                creditPercentage > 40
                  ? 'bg-bg-success-bold'
                  : creditPercentage > 15
                  ? 'bg-bg-warning-bold'
                  : 'bg-bg-brand-bold'
              }`}
              style={{ width: `${creditPercentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-caption text-text-subtlest">
            <span>پلن {plan.title}</span>
            <span className="text-text-brand hover:underline">ارتقا یا تغییر &larr;</span>
          </div>
        </div>

        {/* 10-Minute Onboarding Launcher */}
        <button
          onClick={() => {
            onOpenOnboarding();
            setIsMobileMenuOpen(false);
          }}
          className="w-full py-inset-sm px-inset-md text-body-sm font-semibold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control transition-colors shadow-raised flex items-center justify-center gap-inline-sm"
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
          className="flex items-center justify-between p-inset-sm rounded-control hover:bg-surface-raised border border-transparent hover:border-border-default cursor-pointer transition-all"
        >
          <div className="flex items-center gap-inline-sm text-body-sm">
            <span className="w-space-8 h-space-8 rounded-control-sm bg-bg-neutral-subtle flex items-center justify-center text-body-md">
              👤
            </span>
            <div>
              <span className="text-text-default font-semibold block text-caption" dir="ltr">
                ۰۹۱۲۳۴۵۶۷۸۹
              </span>
              <span className="text-caption text-text-success">حساب تأییدشده ✓</span>
            </div>
          </div>
          <span className="text-body-sm text-text-subtlest">⚙️</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (RTL: on the right) */}
      <aside className="hidden md:flex w-container-overlay-xs h-screen sticky top-space-0 bg-surface-sunken border-s border-border-default p-inset-lg flex-col shrink-0 z-dropdown overflow-y-auto">
        {navContent}
      </aside>

      {/* Mobile Top Minimal Bar */}
      <header className="md:hidden sticky top-space-0 z-sticky bg-surface-sunken border-b border-border-default px-inset-lg py-inset-md flex items-center justify-between">
        <div className="flex items-center gap-inline-md">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-space-8 h-space-8 rounded-control-sm bg-surface-raised border border-border-default flex items-center justify-center text-text-default text-body-md"
            aria-label="باز کردن منو"
          >
            ☰
          </button>
          <div className="flex items-center gap-inline-sm">
            <span className="w-space-6 h-space-6 rounded-control-sm bg-bg-brand-bold flex items-center justify-center text-text-default font-bold text-body-sm">
              م
            </span>
            <span className="font-bold text-text-default text-body-md">مبدأ</span>
          </div>
        </div>

        <div className="flex items-center gap-inline-sm text-body-sm">
          <button
            onClick={onOpenPlanModal}
            className="px-inset-md py-inset-xs rounded-control-sm bg-surface-raised border border-border-default text-text-default font-mono text-caption"
          >
            {currentWorkspace.creditsRemaining} cr
          </button>
          <button
            onClick={onOpenAccountModal}
            className="w-space-8 h-space-8 rounded-control-sm bg-surface-raised border border-border-default flex items-center justify-center text-body-sm"
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
          className="md:hidden fixed inset-space-0 z-dialog flex justify-end bg-bg-scrim"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-4/5 max-w-overlay-sm h-full bg-surface-sunken border-s border-border-default p-inset-lg flex flex-col shadow-overlay"
          >
            {navContent}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Apple / Google Design Standard) */}
      <nav
        aria-label="منوی پایینی موبایل"
        className="md:hidden fixed bottom-space-0 start-space-0 end-space-0 z-sticky bg-surface-sunken border-t border-border-default flex items-center justify-around px-inset-sm py-inset-sm pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <button
          onClick={() => onTabChange('context')}
          className={`flex flex-col items-center justify-center py-inset-xs px-inset-sm rounded-control-sm transition-colors flex-1 ${
            activeTab === 'context'
              ? 'text-text-brand font-bold'
              : 'text-text-subtlest hover:text-text-default'
          }`}
        >
          <span className="text-heading-xs leading-tight">📖</span>
          <span className="text-caption mt-stack-xs">منبع حقیقت</span>
        </button>

        <button
          onClick={() => onTabChange('workstreams')}
          className={`flex flex-col items-center justify-center py-inset-xs px-inset-sm rounded-control-sm transition-colors flex-1 ${
            activeTab === 'workstreams'
              ? 'text-text-brand font-bold'
              : 'text-text-subtlest hover:text-text-default'
          }`}
        >
          <span className="text-heading-xs leading-tight">⚡</span>
          <span className="text-caption mt-stack-xs">جریان‌ها</span>
        </button>

        <button
          onClick={() => onTabChange('chat')}
          className={`flex flex-col items-center justify-center py-inset-xs px-inset-sm rounded-control-sm transition-colors flex-1 relative ${
            activeTab === 'chat'
              ? 'text-text-brand font-bold'
              : 'text-text-subtlest hover:text-text-default'
          }`}
        >
          <span className="text-heading-xs leading-tight">💬</span>
          <span className="text-caption mt-stack-xs">گفتگو</span>
        </button>

        <button
          onClick={() => onTabChange('assets')}
          className={`flex flex-col items-center justify-center py-inset-xs px-inset-sm rounded-control-sm transition-colors flex-1 relative ${
            activeTab === 'assets'
              ? 'text-text-brand font-bold'
              : 'text-text-subtlest hover:text-text-default'
          }`}
        >
          <span className="text-heading-xs leading-tight">📦</span>
          <span className="text-caption mt-stack-xs">دارایی‌ها</span>
          {deliverablesCount > 0 && (
            <span className="absolute top-space-1 end-space-3 w-space-4 h-space-4 rounded-pill bg-surface-raised border border-border-default text-[9px] font-mono flex items-center justify-center text-text-subtle">
              {deliverablesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('ledger')}
          className={`flex flex-col items-center justify-center py-inset-xs px-inset-sm rounded-control-sm transition-colors flex-1 ${
            activeTab === 'ledger'
              ? 'text-text-brand font-bold'
              : 'text-text-subtlest hover:text-text-default'
          }`}
        >
          <span className="text-heading-xs leading-tight">💳</span>
          <span className="text-caption mt-stack-xs">دفتر کل</span>
        </button>
      </nav>
    </>
  );
};
