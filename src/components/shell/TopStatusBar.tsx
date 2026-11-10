/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Workspace } from '../../types';
import type { IconName } from '../../ui';
import { Breadcrumb, Button } from '../../ui';

export const PAGE_TITLE: Record<string, string> = {
  context: 'منبع حقیقت',
  workstreams: 'خروجی‌ها · ساخت',
  thinking: 'فکر',
  chat: 'گفتگو',
  assets: 'خروجی‌ها',
  home: 'خانه',
  ledger: 'مصرف و دفتر کل',
};

export interface PageAction { label: string; icon: IconName; onClick: () => void }

interface TopStatusBarProps {
  currentWorkspace: Workspace;
  activeTab: string;
  /** the ONE action that fits the current page (none → nothing is shown) */
  action?: PageAction;
}

/** Desktop top bar: breadcrumb + the page's single main action. Plan, badges and global buttons live in the account menu. */
export const TopStatusBar: React.FC<TopStatusBarProps> = ({ currentWorkspace, activeTab, action }) => (
  <div className="sticky top-space-0 z-sticky hidden items-center justify-between gap-inline-lg border-b border-border-default bg-surface-sunken px-inset-2xl py-inset-md md:flex">
    <Breadcrumb items={[{ label: 'مبدأ' }, { label: currentWorkspace.name }, { label: PAGE_TITLE[activeTab] || activeTab }]} />
    {action && <Button variant="secondary" iconStart={action.icon} onClick={action.onClick}>{action.label}</Button>}
  </div>
);
