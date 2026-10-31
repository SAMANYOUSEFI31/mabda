/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LedgerEntry, PlanId, Workspace } from '../types';
import { PLANS } from '../core/creditEngine';

interface LedgerPanelProps {
  currentWorkspace: Workspace;
  ledgerEntries: LedgerEntry[];
  onChangePlan: (planId: PlanId) => void;
  onAddCredits: (amount: number) => void;
}

export const LedgerPanel: React.FC<LedgerPanelProps> = ({
  currentWorkspace,
  ledgerEntries,
  onChangePlan,
  onAddCredits,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ledger' | 'plans' | 'economics'>('ledger');
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;

  const totalCreditsUsed = ledgerEntries.reduce((sum, e) => sum + e.creditCost, 0);
  const totalAiCostUsd = ledgerEntries.reduce((sum, e) => sum + e.estimatedAiCostUsd, 0);

  return (
    <div className="space-y-6 text-right">
      {/* Header Overview Banner */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#27272a] pb-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">دفتر کل، اقتصاد و اعتبارها (Usage Ledger)</h2>
            <p className="text-xs text-[#a1a1aa] mt-1">
              اصل P5 (اقتصاد صادقانه): شفافیت کامل در مصرف اعتبارها، سقف‌های منصفانه روزانه و هزینه‌های زیرساخت AI.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onAddCredits(100)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#09090b] hover:bg-[#27272a] border border-[#e11d48] rounded-lg transition-colors"
            >
              + خرید بسته ۱۰۰ اعتبار (۴ دلار)
            </button>
            <button
              onClick={() => onAddCredits(300)}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors"
            >
              + خرید بسته ۳۰۰ اعتبار (۱۰٫۵ دلار)
            </button>
          </div>
        </div>

        {/* 4 KPI blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-[#09090b] p-3.5 rounded-lg border border-[#27272a] space-y-1">
            <span className="text-[#a1a1aa] block">اعتبار باقی‌مانده</span>
            <span className="text-xl font-bold text-white tabular-nums">
              {currentWorkspace.creditsRemaining}
            </span>
            <span className="text-[10px] text-[#10b981] block">پلن {plan.title.split(' ')[0]}</span>
          </div>

          <div className="bg-[#09090b] p-3.5 rounded-lg border border-[#27272a] space-y-1">
            <span className="text-[#a1a1aa] block">مجموع اعتبار مصرف‌شده</span>
            <span className="text-xl font-bold text-white tabular-nums">
              {totalCreditsUsed}
            </span>
            <span className="text-[10px] text-[#a1a1aa] block">در تمام خروجی‌ها</span>
          </div>

          <div className="bg-[#09090b] p-3.5 rounded-lg border border-[#27272a] space-y-1">
            <span className="text-[#a1a1aa] block">گفتگوی Auto امروز</span>
            <span className="text-xl font-bold text-white tabular-nums">
              {currentWorkspace.todayChatCount} / {plan.dailyChatLimit}
            </span>
            <span className="text-[10px] text-[#a1a1aa] block">سقف منصفانه روزانه</span>
          </div>

          <div className="bg-[#09090b] p-3.5 rounded-lg border border-[#27272a] space-y-1">
            <span className="text-[#a1a1aa] block">تخمین هزینه زیرساخت AI</span>
            <span className="text-xl font-bold text-[#10b981] tabular-nums">
              ${totalAiCostUsd.toFixed(4)}
            </span>
            <span className="text-[10px] text-[#a1a1aa] block">حاشیه سود پایدار (P5)</span>
          </div>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex items-center gap-2 border-b border-[#27272a] pb-2 text-xs">
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab === 'ledger'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          جدول تراکنش‌های Ledger ({ledgerEntries.length})
        </button>
        <button
          onClick={() => setActiveSubTab('plans')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab === 'plans'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          مقایسه و ارتقای پلن‌ها
        </button>
        <button
          onClick={() => setActiveSubTab('economics')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeSubTab === 'economics'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          خطوط قرمز اقتصادی (Red Lines)
        </button>
      </div>

      {/* Subtab 1: Ledger Table */}
      {activeSubTab === 'ledger' && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#09090b] text-[#a1a1aa] uppercase border-b border-[#27272a]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">زمان</th>
                  <th scope="col" className="px-4 py-3 font-semibold">عملیات / کار</th>
                  <th scope="col" className="px-3 py-3 font-semibold">الگوی اجرا</th>
                  <th scope="col" className="px-3 py-3 font-semibold">توکن ورودی/خروجی</th>
                  <th scope="col" className="px-3 py-3 font-semibold">اعتبار کسرشده</th>
                  <th scope="col" className="px-3 py-3 font-semibold">هزینه AI</th>
                  <th scope="col" className="px-3 py-3 font-semibold">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]/60">
                {ledgerEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#27272a]/20 transition-colors">
                    <td className="px-4 py-3 text-[#7d7d86] whitespace-nowrap tabular-nums">
                      {new Date(entry.timestamp).toLocaleTimeString('fa-IR')}
                    </td>
                    <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                      {entry.action}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-[11px] bg-[#09090b] border border-[#27272a] px-2 py-0.5 rounded text-[#d4d4d8]">
                        {entry.mode}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#a1a1aa] whitespace-nowrap tabular-nums">
                      {entry.inputTokens} / {entry.outputTokens}
                    </td>
                    <td className="px-3 py-3 font-bold text-white whitespace-nowrap tabular-nums">
                      {entry.creditCost === 0 ? (
                        <span className="text-[#10b981]">رایگان (Auto)</span>
                      ) : (
                        <span>{entry.creditCost} اعتبار</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[#10b981] whitespace-nowrap tabular-nums">
                      ${entry.estimatedAiCostUsd.toFixed(4)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="text-[10px] text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">
                        موفق
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 2: Plans Comparison */}
      {activeSubTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(Object.keys(PLANS) as PlanId[]).map((pid) => {
            const p = PLANS[pid];
            const isCurrent = currentWorkspace.planId === pid;

            return (
              <div
                key={pid}
                className={`bg-[#18181b] rounded-xl p-6 border flex flex-col justify-between transition-all ${
                  isCurrent ? 'border-[#e11d48] shadow-md ring-1 ring-[#e11d48]' : 'border-[#27272a]'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">{p.title}</h3>
                    {isCurrent && (
                      <span className="text-[10px] bg-[#e11d48] text-white px-2 py-0.5 rounded font-semibold">
                        پلن فعلی
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white tabular-nums">${p.priceMonthlyUsd}</span>
                      <span className="text-xs text-[#a1a1aa]">/ ماهانه</span>
                    </div>
                    <span className="text-xs text-[#7d7d86] block">
                      معادل حدود {p.priceMonthlyToman.toLocaleString('fa-IR')} تومان
                    </span>
                  </div>

                  <div className="pt-3 border-t border-[#27272a] space-y-2.5 text-xs text-[#d4d4d8]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">اعتبار ماهانه:</span>
                      <span className="font-bold text-white tabular-nums">{p.creditsMonthly} اعتبار</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">سقف ورک‌اسپیس:</span>
                      <span className="font-bold text-white tabular-nums">{p.workspaceLimit} فضای کاری</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">سقف منصفانه گفتگو:</span>
                      <span className="font-bold text-white tabular-nums">{p.dailyChatLimit} پیام در روز</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">حالت‌های مجاز:</span>
                      <span className="font-bold text-[#fb7185]">{p.allowedModes.join('، ')}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2 text-xs font-semibold text-[#a1a1aa] bg-[#09090b] border border-[#27272a] rounded-lg cursor-default"
                    >
                      فعال برای این فضای کاری
                    </button>
                  ) : (
                    <button
                      onClick={() => onChangePlan(pid)}
                      className="w-full py-2 text-xs font-semibold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors shadow-sm"
                    >
                      انتخاب این پلن
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Subtab 3: Red Lines & Economics */}
      {activeSubTab === 'economics' && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-6 text-xs text-[#d4d4d8]">
          <h3 className="text-sm font-bold text-white">
            اصول و شاخص‌های خط قرمز در Ledger (بخش اقتصاد واحد PRD)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#09090b] p-4 rounded-lg border border-[#27272a] space-y-2">
              <span className="text-white font-bold block">سهم هزینه AI از درآمد کاربر:</span>
              <p className="text-[#a1a1aa] leading-relaxed">
                آستانه هشدار: بیشتر از ۵۰٪ درآمد. در شبیه‌سازی ۲۰ هزار کاربره مبدأ، هزینه AI در مصرف متوسط بین ۱۷٪ تا ۱۸٪ درآمد خالص کنترل شده است.
              </p>
            </div>

            <div className="bg-[#09090b] p-4 rounded-lg border border-[#27272a] space-y-2">
              <span className="text-white font-bold block">هزینه واقعی هر اعتبار:</span>
              <p className="text-[#a1a1aa] leading-relaxed">
                آستانه قرمز: بیشتر از ۰٫۰۰۶ دلار دو هفته متوالی. در این حالت وزن اعتبار یا جدول routing مدل‌ها به طور خودکار اصلاح می‌شود.
              </p>
            </div>

            <div className="bg-[#09090b] p-4 rounded-lg border border-[#27272a] space-y-2">
              <span className="text-white font-bold block">بازسازی با نصف قیمت:</span>
              <p className="text-[#a1a1aa] leading-relaxed">
                برای جلوگیری از سوءاستفاده، بازسازی ۵۰٪ تخفیف تنها یک بار به ازای هر ویرایش Context مجاز است (اصلاحیه ممیزی شماره ۷).
              </p>
            </div>

            <div className="bg-[#09090b] p-4 rounded-lg border border-[#27272a] space-y-2">
              <span className="text-white font-bold block">سقف ورک‌اسپیس در پلن Max:</span>
              <p className="text-[#a1a1aa] leading-relaxed">
                با استناد به اصل P5 (بدون وعده نامحدود)، سقف ورک‌اسپیس Max دقیقاً ۱۰ تعیین شده است تا هزینه‌های ذخیره‌سازی و پردازش پایدار بماند.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
