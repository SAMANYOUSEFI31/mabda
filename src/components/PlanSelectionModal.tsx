/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PlanId, Workspace } from '../types';
import { PLANS } from '../core/creditEngine';

interface PlanSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: Workspace;
  onSelectPlan: (planId: PlanId) => void;
}

export const PlanSelectionModal: React.FC<PlanSelectionModalProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
  onSelectPlan,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-space-0 z-dialog flex items-center justify-center p-inset-lg bg-bg-scrim text-end">
      <div className="bg-surface-raised border border-border-default rounded-container w-full max-w-content max-h-[90vh] overflow-y-auto shadow-overlay p-inset-xl sm:p-inset-2xl space-y-stack-lg">
        <div className="flex items-center justify-between border-b border-border-default pb-inset-lg">
          <div>
            <h3 className="text-heading-sm font-bold text-text-default">انتخاب و تغییر پلن اشتراک مبدأ</h3>
            <p className="text-body-sm text-text-subtle mt-stack-xs">
              پلن‌ها با دامنهٔ کار از هم جدا می‌شوند، نه با محدودیت مصنوعی؛ ذخیرهٔ Context و Asset در تمام پلن‌ها رایگان و نامحدود است (اصل P6).
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-default p-inset-xs rounded-control-sm hover:bg-interaction-hover transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-inline-xl">
          {(Object.keys(PLANS) as PlanId[]).map((pid) => {
            const p = PLANS[pid];
            const isCurrent = currentWorkspace.planId === pid;

            return (
              <div
                key={pid}
                className={`bg-surface-sunken rounded-control p-inset-lg border flex flex-col justify-between transition-all ${
                  isCurrent
                    ? 'border-border-brand ring-2 ring-border-brand-subtle shadow-overflow'
                    : 'border-border-default hover:border-border-bold'
                }`}
              >
                <div className="space-y-stack-md">
                  <div className="flex items-center justify-between">
                    <h4 className="text-body-md font-bold text-text-default">{p.title}</h4>
                    {isCurrent && (
                      <span className="text-caption bg-bg-brand-bold text-text-default px-inset-sm py-inset-xs rounded-indicator font-bold">
                        پلن فعال
                      </span>
                    )}
                  </div>

                  <div className="space-y-stack-xs">
                    <div className="flex items-baseline gap-inline-xs">
                      <span className="text-heading-lg font-bold text-text-default tabular-nums">${p.priceMonthlyUsd}</span>
                      <span className="text-body-sm text-text-subtle">/ ماهانه</span>
                    </div>
                    <span className="text-caption text-text-subtlest block">
                      حدود {p.priceMonthlyToman.toLocaleString('fa-IR')} تومان
                    </span>
                  </div>

                  <div className="pt-inset-md border-t border-border-default space-y-stack-sm text-body-sm text-text-default">
                    <div className="flex items-center justify-between">
                      <span className="text-text-subtle">اعتبار ماهانه خروجی:</span>
                      <span className="font-bold text-text-default tabular-nums">{p.creditsMonthly} اعتبار</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-subtle">سقف منصفانه گفتگو:</span>
                      <span className="font-bold text-text-default tabular-nums">{p.dailyChatLimit} پیام/روز</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-subtle">سقف فضای کاری:</span>
                      <span className="font-bold text-text-default tabular-nums">{p.workspaceLimit} عدد</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-subtle">الگوهای اجرا:</span>
                      <span className="font-bold text-text-brand text-caption">{p.allowedModes.join('، ')}</span>
                    </div>
                    <div className="text-caption text-text-subtlest pt-inset-xs">
                      {pid === 'starter'
                        ? 'مناسب برای شروع جدی یک کسب‌وکار (حدود ۱۱ خروجی متعادل)'
                        : pid === 'pro'
                        ? 'مناسب اپراتور روزانه (حدود ۳۴ خروجی متعادل یا ۱۸ عمیق)'
                        : 'مناسب مشاور یا آژانس (حدود ۴۰ خروجی عمیق یا ۲۵ خروجی حساس)'}
                    </div>
                  </div>
                </div>

                <div className="pt-inset-xl">
                  {isCurrent ? (
                    <div className="w-full py-inset-sm text-center text-body-sm font-semibold text-text-success bg-bg-success-subtle border border-border-success-subtle rounded-control-sm">
                      پلن فعلی شما ✓
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        onSelectPlan(pid);
                        onClose();
                      }}
                      className="w-full py-inset-md text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors shadow-raised"
                    >
                      فعال‌سازی پلن {p.title.split(' ')[0]}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
