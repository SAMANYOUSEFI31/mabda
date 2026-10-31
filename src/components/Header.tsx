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
    <header className="border-b border-[#27272a] bg-[#09090b] sticky top-0 z-40 px-3 sm:px-6 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-6">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onTabChange('context')}
            className="flex items-center gap-1.5 group text-right focus:outline-none"
            aria-label="صفحه اصلی مبدأ"
          >
            <span className="w-7 h-7 rounded-lg bg-[#e11d48] flex items-center justify-center text-white font-bold text-sm shadow-xs group-hover:bg-[#be123c] transition-colors">
              م
            </span>
            <span className="text-base sm:text-lg font-bold tracking-tight text-white leading-none">
              مبدأ
            </span>
          </button>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav
          className="hidden md:flex items-center gap-1.5 lg:gap-3 text-xs lg:text-sm font-medium"
          aria-label="بخش‌های اصلی برنامه"
        >
          <button
            onClick={() => onTabChange('context')}
            className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'context'
                ? 'bg-[#18181b] text-white font-semibold border border-[#3f3f46]'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            دانش و منبع حقیقت
          </button>
          <button
            onClick={() => onTabChange('workstreams')}
            className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'workstreams'
                ? 'bg-[#18181b] text-white font-semibold border border-[#3f3f46]'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            جریان‌های کار و Gap
          </button>
          <button
            onClick={() => onTabChange('chat')}
            className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-[#18181b] text-white font-semibold border border-[#3f3f46]'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            گفتگوی هوشمند
          </button>
          <button
            onClick={() => onTabChange('assets')}
            className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'assets'
                ? 'bg-[#18181b] text-white font-semibold border border-[#3f3f46]'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            دارایی‌ها و Replay
          </button>
          <button
            onClick={() => onTabChange('ledger')}
            className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'ledger'
                ? 'bg-[#18181b] text-white font-semibold border border-[#3f3f46]'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            دفتر کل و اعتبارها
          </button>
        </nav>

        {/* Zone 3: Primary Action & Workspace Selector */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
              className="bg-[#18181b] border border-[#27272a] text-[#fafafa] text-xs py-1.5 px-2 rounded-lg focus:outline-none focus:border-[#e11d48] cursor-pointer max-w-[140px] sm:max-w-[220px] truncate"
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
            className="flex items-center gap-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-[#52525b] px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0"
          >
            <span className="text-[#a1a1aa] hidden sm:inline">اعتبار:</span>
            <span className="font-bold text-[#fafafa] tabular-nums">
              {currentWorkspace.creditsRemaining}
            </span>
            <span className="text-[10px] text-[#10b981] bg-[#10b981]/15 px-1.5 py-0.5 rounded font-bold">
              {plan.title.split(' ')[0]}
            </span>
          </button>

          {/* User Account Button (F1) */}
          <button
            onClick={onOpenAccountModal}
            title="حساب کاربری و حریم خصوصی"
            className="w-8 h-8 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-[#52525b] flex items-center justify-center text-xs text-[#d4d4d8] transition-colors shrink-0"
            aria-label="حساب کاربری"
          >
            👤
          </button>

          {/* 10-Minute Onboarding Button */}
          <button
            onClick={onOpenOnboarding}
            className="hidden sm:block px-3 py-1.5 text-xs font-semibold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors shadow-xs whitespace-nowrap shrink-0"
          >
            Onboarding سریع
          </button>
        </div>
      </div>
    </header>
  );
};
