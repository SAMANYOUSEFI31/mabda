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
    <div className="hidden md:flex items-center justify-between px-inset-2xl py-inset-lg border-b border-border-default bg-surface-sunken sticky top-space-0 z-sticky">
      {/* Breadcrumb Path */}
      <div className="flex items-center gap-inline-sm text-body-sm">
        <span className="text-text-subtlest">مبدأ</span>
        <span className="text-text-disabled">/</span>
        <span className="text-text-subtle font-semibold">{currentWorkspace.name}</span>
        <span className="text-text-disabled">/</span>
        <span className="text-text-default font-semibold">{tabLabels[activeTab] || activeTab}</span>
      </div>

      {/* Status Indicators & Actions */}
      <div className="flex items-center gap-inline-md text-body-sm">
        {/* Contradiction indicator if active */}
        {contradictions.length > 0 && (
          <div className="flex items-center gap-inline-sm bg-bg-brand-subtle border border-border-brand-subtle text-text-brand px-inset-md py-inset-xs rounded-control-sm">
            <span className="w-space-2 h-space-2 rounded-pill bg-bg-brand-bold" />
            <span className="font-semibold">{contradictions.length} تناقض نیازمند حل</span>
          </div>
        )}

        {/* Plan badge */}
        <button
          onClick={onOpenPlanModal}
          className="flex items-center gap-inline-sm px-inset-md py-inset-xs rounded-control-sm bg-surface-raised hover:bg-interaction-hover border border-border-default text-text-subtle hover:text-text-default transition-colors"
        >
          <span>پلن:</span>
          <span className="font-semibold text-text-default">{plan.title}</span>
        </button>

        {/* Quick Context Add button */}
        <button
          onClick={onOpenContextModal}
          className="px-inset-md py-inset-sm rounded-control-sm bg-surface-raised hover:bg-interaction-hover border border-border-bold text-text-default font-semibold transition-colors flex items-center gap-inline-sm shadow-raised"
        >
          <span>+</span>
          <span>ثبت شیء دانش</span>
        </button>

        {/* Quick Custom Spec button */}
        <button
          onClick={onOpenCustomSpecModal}
          className="px-inset-md py-inset-sm rounded-control-sm bg-bg-brand-bold hover:bg-bg-brand-bold-hover text-text-default font-semibold transition-colors flex items-center gap-inline-sm shadow-raised"
        >
          <span>+</span>
          <span>جریان کار سفارشی</span>
        </button>
      </div>
    </div>
  );
};
