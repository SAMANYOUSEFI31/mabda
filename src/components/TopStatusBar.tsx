/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Workspace, Contradiction } from '../types';
import { PLANS } from '../core/creditEngine';

interface TopStatusBarProps {
  currentWorkspace: Workspace;
  activeTab: string;
  contradictions: Contradiction[];
  onOpenContextModal: () => void;
  onOpenCustomSpecModal: () => void;
  onOpenPlanModal: () => void;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  currentWorkspace,
  activeTab,
  contradictions,
  onOpenContextModal,
  onOpenCustomSpecModal,
  onOpenPlanModal,
}) => {
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;

  const tabLabels: Record<string, string> = {
    context: 'منبع حقیقت و درخت دانش',
    workstreams: 'استودیو جریان‌های کار و رادار شکاف',
    chat: 'گفتگو و استخراج هوشمند دانش',
    assets: 'کتابخانه دارایی‌ها و بازسازی',
    ledger: 'دفتر کل و شفافیت مالی',
  };

  return (
    <div className="hidden md:flex items-center justify-between px-8 py-3.5 border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-20">
      {/* Breadcrumb Path */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#71717a]">مبدأ</span>
        <span className="text-[#3f3f46]">/</span>
        <span className="text-[#a1a1aa] font-medium">{currentWorkspace.name}</span>
        <span className="text-[#3f3f46]">/</span>
        <span className="text-white font-semibold">{tabLabels[activeTab] || activeTab}</span>
      </div>

      {/* Status Indicators & Actions */}
      <div className="flex items-center gap-3 text-xs">
        {/* Contradiction indicator if active */}
        {contradictions.length > 0 && (
          <div className="flex items-center gap-1.5 bg-[#e11d48]/10 border border-[#e11d48]/30 text-[#fb7185] px-2.5 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-[#e11d48] animate-pulse" />
            <span className="font-semibold">{contradictions.length} تناقض نیازمند حل</span>
          </div>
        )}

        {/* Plan badge */}
        <button
          onClick={onOpenPlanModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:text-white transition-colors"
        >
          <span>پلن:</span>
          <span className="font-semibold text-white">{plan.title}</span>
        </button>

        {/* Quick Context Add button */}
        <button
          onClick={onOpenContextModal}
          className="px-3 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-[#3f3f46] text-[#fafafa] font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <span>+</span>
          <span>ثبت شیء دانش</span>
        </button>

        {/* Quick Custom Spec button */}
        <button
          onClick={onOpenCustomSpecModal}
          className="px-3 py-1.5 rounded-lg bg-[#e11d48] hover:bg-[#be123c] text-white font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <span>+</span>
          <span>جریان کار سفارشی</span>
        </button>
      </div>
    </div>
  );
};
