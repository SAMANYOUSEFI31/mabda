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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs text-right animate-in fade-in">
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
          <div>
            <h3 className="text-xl font-bold text-white">انتخاب و تغییر پلن اشتراک مبدأ</h3>
            <p className="text-xs text-[#a1a1aa] mt-1">
              پلن‌ها با دامنهٔ کار از هم جدا می‌شوند، نه با محدودیت مصنوعی؛ ذخیرهٔ Context و Asset در تمام پلن‌ها رایگان و نامحدود است (اصل P6).
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#a1a1aa] hover:text-white p-1 rounded-md hover:bg-[#27272a] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(Object.keys(PLANS) as PlanId[]).map((pid) => {
            const p = PLANS[pid];
            const isCurrent = currentWorkspace.planId === pid;

            return (
              <div
                key={pid}
                className={`bg-[#09090b] rounded-xl p-5 border flex flex-col justify-between transition-all ${
                  isCurrent
                    ? 'border-[#e11d48] ring-2 ring-[#e11d48]/40 shadow-lg'
                    : 'border-[#27272a] hover:border-[#3f3f46]'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-white">{p.title}</h4>
                    {isCurrent && (
                      <span className="text-[10px] bg-[#e11d48] text-white px-2 py-0.5 rounded font-bold">
                        پلن فعال
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-white tabular-nums">${p.priceMonthlyUsd}</span>
                      <span className="text-xs text-[#a1a1aa]">/ ماهانه</span>
                    </div>
                    <span className="text-[11px] text-[#7d7d86] block">
                      حدود {p.priceMonthlyToman.toLocaleString('fa-IR')} تومان
                    </span>
                  </div>

                  <div className="pt-3 border-t border-[#27272a] space-y-2.5 text-xs text-[#d4d4d8]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">اعتبار ماهانه خروجی:</span>
                      <span className="font-bold text-white tabular-nums">{p.creditsMonthly} اعتبار</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">سقف منصفانه گفتگو:</span>
                      <span className="font-bold text-white tabular-nums">{p.dailyChatLimit} پیام/روز</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">سقف فضای کاری:</span>
                      <span className="font-bold text-white tabular-nums">{p.workspaceLimit} عدد</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">الگوهای اجرا:</span>
                      <span className="font-bold text-[#fb7185] text-[11px]">{p.allowedModes.join('، ')}</span>
                    </div>
                    <div className="text-[11px] text-[#7d7d86] pt-1">
                      {pid === 'starter'
                        ? 'مناسب برای شروع جدی یک کسب‌وکار (حدود ۱۱ خروجی متعادل)'
                        : pid === 'pro'
                        ? 'مناسب اپراتور روزانه (حدود ۳۴ خروجی متعادل یا ۱۸ عمیق)'
                        : 'مناسب مشاور یا آژانس (حدود ۴۰ خروجی عمیق یا ۲۵ خروجی حساس)'}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <div className="w-full py-2 text-center text-xs font-semibold text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 rounded-lg">
                      پلن فعلی شما ✓
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        onSelectPlan(pid);
                        onClose();
                      }}
                      className="w-full py-2.5 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors shadow-sm"
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
