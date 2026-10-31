/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PlanId, Workspace } from '../types';
import { PLANS } from '../core/creditEngine';

interface HeaderProps {
  currentWorkspace: Workspace;
  allWorkspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  onOpenNewWorkspace: () => void;
  onOpenOnboarding: () => void;
  onOpenPlanModal: () => void;
  onOpenAccountModal: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentWorkspace,
  allWorkspaces,
  onSelectWorkspace,
  onOpenNewWorkspace,
  onOpenOnboarding,
  onOpenPlanModal,
  onOpenAccountModal,
  activeTab,
  onTabChange,
}) => {
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;

  return (
    <header className="border-b border-border-default bg-surface-sunken sticky top-space-0 z-sticky px-inset-md sm:px-inset-xl py-inset-sm">
      <div className="max-w-wide mx-auto flex items-center justify-between gap-inline-sm sm:gap-inline-xl">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-inline-sm shrink-0">
          <button
            onClick={() => onTabChange('context')}
            className="flex items-center gap-inline-sm group text-end focus:outline-none"
            aria-label="صفحه اصلی مبدأ"
          >
            <span className="w-space-8 h-space-8 rounded-control-sm bg-bg-brand-bold flex items-center justify-center text-text-default font-bold text-body-md shadow-raised group-hover:bg-bg-brand-bold-hover transition-colors">
              م
            </span>
            <span className="text-body-md sm:text-heading-xs font-bold text-text-default leading-tight">
              مبدأ
            </span>
          </button>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav
          className="hidden md:flex items-center gap-inline-sm lg:gap-inline-md text-body-sm lg:text-body-md font-semibold"
          aria-label="بخش‌های اصلی برنامه"
        >
          <button
            onClick={() => onTabChange('context')}
            className={`px-inset-md py-inset-sm rounded-control-sm transition-colors whitespace-nowrap ${
              activeTab === 'context'
                ? 'bg-surface-raised text-text-default font-semibold border border-border-bold'
                : 'text-text-subtle hover:text-text-default'
            }`}
          >
            دانش و منبع حقیقت
          </button>
          <button
            onClick={() => onTabChange('workstreams')}
            className={`px-inset-md py-inset-sm rounded-control-sm transition-colors whitespace-nowrap ${
              activeTab === 'workstreams'
                ? 'bg-surface-raised text-text-default font-semibold border border-border-bold'
                : 'text-text-subtle hover:text-text-default'
            }`}
          >
            جریان‌های کار و Gap
          </button>
          <button
            onClick={() => onTabChange('chat')}
            className={`px-inset-md py-inset-sm rounded-control-sm transition-colors whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-surface-raised text-text-default font-semibold border border-border-bold'
                : 'text-text-subtle hover:text-text-default'
            }`}
          >
            گفتگوی هوشمند
          </button>
          <button
            onClick={() => onTabChange('assets')}
            className={`px-inset-md py-inset-sm rounded-control-sm transition-colors whitespace-nowrap ${
              activeTab === 'assets'
                ? 'bg-surface-raised text-text-default font-semibold border border-border-bold'
                : 'text-text-subtle hover:text-text-default'
            }`}
          >
            دارایی‌ها و Replay
          </button>
          <button
            onClick={() => onTabChange('ledger')}
            className={`px-inset-md py-inset-sm rounded-control-sm transition-colors whitespace-nowrap ${
              activeTab === 'ledger'
                ? 'bg-surface-raised text-text-default font-semibold border border-border-bold'
                : 'text-text-subtle hover:text-text-default'
            }`}
          >
            دفتر کل و اعتبارها
          </button>
        </nav>

        {/* Zone 3: Primary Action & Workspace Selector */}
        <div className="flex items-center gap-inline-sm sm:gap-inline-md shrink-0">
          {/* Workspace select dropdown */}
          <div className="relative">
            <select
              aria-label="انتخاب فضای کاری"
              value={currentWorkspace.id}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  onOpenNewWorkspace();
                } else {
                  const ws = allWorkspaces.find((w) => w.id === e.target.value);
                  if (ws) onSelectWorkspace(ws);
                }
              }}
              className="bg-surface-raised border border-border-default text-text-default text-body-sm py-inset-sm px-inset-sm rounded-control-sm focus:outline-none focus:border-border-brand cursor-pointer max-w-[140px] sm:max-w-[220px] truncate"
            >
              {allWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({PLANS[w.planId].title.split(' ')[0]})
                </option>
              ))}
              <option value="__new__">+ ایجاد فضای کاری جدید</option>
            </select>
          </div>

          {/* Credits & Plan trigger button */}
          <button
            onClick={onOpenPlanModal}
            title="مشاهده و تغییر پلن کاربری"
            className="flex items-center gap-inline-sm bg-surface-raised hover:bg-interaction-hover border border-border-default hover:border-border-bold px-inset-md py-inset-sm rounded-control-sm text-body-sm transition-colors shrink-0"
          >
            <span className="text-text-subtle hidden sm:inline">اعتبار:</span>
            <span className="font-bold text-text-default tabular-nums">
              {currentWorkspace.creditsRemaining}
            </span>
            <span className="text-caption text-text-success bg-bg-success-subtle px-inset-sm py-inset-xs rounded-indicator font-bold">
              {plan.title.split(' ')[0]}
            </span>
          </button>

          {/* User Account Button (F1) */}
          <button
            onClick={onOpenAccountModal}
            title="حساب کاربری و حریم خصوصی"
            className="w-space-8 h-space-8 rounded-control-sm bg-surface-raised hover:bg-interaction-hover border border-border-default hover:border-border-bold flex items-center justify-center text-body-sm text-text-default transition-colors shrink-0"
            aria-label="حساب کاربری"
          >
            👤
          </button>

          {/* 10-Minute Onboarding Button */}
          <button
            onClick={onOpenOnboarding}
            className="hidden sm:block px-inset-md py-inset-sm text-body-sm font-semibold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors shadow-raised whitespace-nowrap shrink-0"
          >
            Onboarding سریع
          </button>
        </div>
      </div>
    </header>
  );
};
