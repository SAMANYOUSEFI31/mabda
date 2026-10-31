/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Workspace, Contradiction } from '../types';
import { PLANS } from '../core/creditEngine';
import { Badge, Breadcrumb, Button, formatNumber } from '../ui';

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
    workstreams: 'استودیوی جریان‌های کار و رادار شکاف',
    chat: 'گفتگو و استخراج هوشمند دانش',
    assets: 'کتابخانهٔ دارایی‌ها و بازسازی',
    ledger: 'دفتر کل و شفافیت مالی',
  };

  return (
    <div className="sticky top-space-0 z-sticky hidden items-center justify-between gap-inline-lg border-b border-border-default bg-surface-sunken px-inset-2xl py-inset-md md:flex">
      <Breadcrumb
        items={[{ label: 'مبدأ' }, { label: currentWorkspace.name }, { label: tabLabels[activeTab] || activeTab }]}
      />

      <div className="flex items-center gap-inline-md">
        {contradictions.length > 0 && (
          <Badge intent="warning" icon="TriangleAlert">{formatNumber(contradictions.length)} تناقض نیازمند حل</Badge>
        )}
        <Button variant="ghost" size="sm" onClick={onOpenPlanModal}>پلن: {plan.title}</Button>
        <Button variant="secondary" iconStart="Plus" onClick={onOpenContextModal}>ثبت شیء دانش</Button>
        <Button variant="secondary" iconStart="Plus" onClick={onOpenCustomSpecModal}>جریان کار سفارشی</Button>
      </div>
    </div>
  );
};
