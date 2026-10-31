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
    <div className="space-y-stack-lg text-end">
      {/* Header Overview Banner */}
      <div className="bg-surface-raised border border-border-default rounded-control p-inset-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-inline-lg border-b border-border-default pb-inset-lg mb-stack-md">
          <div>
            <h2 className="text-heading-sm font-bold text-text-default">دفتر کل، اقتصاد و اعتبارها (Usage Ledger)</h2>
            <p className="text-body-sm text-text-subtle mt-stack-xs">
              اصل P5 (اقتصاد صادقانه): شفافیت کامل در مصرف اعتبارها، سقف‌های منصفانه روزانه و هزینه‌های زیرساخت AI.
            </p>
          </div>

          <div className="flex items-center gap-inline-md shrink-0">
            <button
              onClick={() => onAddCredits(100)}
              className="px-inset-md py-inset-sm text-body-sm font-semibold text-text-default bg-surface-sunken hover:bg-interaction-hover border border-border-brand rounded-control-sm transition-colors"
            >
              + خرید بسته ۱۰۰ اعتبار (۴ دلار)
            </button>
            <button
              onClick={() => onAddCredits(300)}
              className="px-inset-lg py-inset-sm text-body-sm font-semibold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors"
            >
              + خرید بسته ۳۰۰ اعتبار (۱۰٫۵ دلار)
            </button>
          </div>
        </div>

        {/* 4 KPI blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-inline-lg text-body-sm">
          <div className="bg-surface-sunken p-inset-lg rounded-control-sm border border-border-default space-y-stack-xs">
            <span className="text-text-subtle block">اعتبار باقی‌مانده</span>
            <span className="text-heading-sm font-bold text-text-default tabular-nums">
              {currentWorkspace.creditsRemaining}
            </span>
            <span className="text-caption text-text-success block">پلن {plan.title.split(' ')[0]}</span>
          </div>

          <div className="bg-surface-sunken p-inset-lg rounded-control-sm border border-border-default space-y-stack-xs">
            <span className="text-text-subtle block">مجموع اعتبار مصرف‌شده</span>
            <span className="text-heading-sm font-bold text-text-default tabular-nums">
              {totalCreditsUsed}
            </span>
            <span className="text-caption text-text-subtle block">در تمام خروجی‌ها</span>
          </div>

          <div className="bg-surface-sunken p-inset-lg rounded-control-sm border border-border-default space-y-stack-xs">
            <span className="text-text-subtle block">گفتگوی Auto امروز</span>
            <span className="text-heading-sm font-bold text-text-default tabular-nums">
              {currentWorkspace.todayChatCount} / {plan.dailyChatLimit}
            </span>
            <span className="text-caption text-text-subtle block">سقف منصفانه روزانه</span>
          </div>

          <div className="bg-surface-sunken p-inset-lg rounded-control-sm border border-border-default space-y-stack-xs">
            <span className="text-text-subtle block">تخمین هزینه زیرساخت AI</span>
            <span className="text-heading-sm font-bold text-text-success tabular-nums">
              ${totalAiCostUsd.toFixed(4)}
            </span>
            <span className="text-caption text-text-subtle block">حاشیه سود پایدار (P5)</span>
          </div>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex items-center gap-inline-sm border-b border-border-default pb-inset-sm text-body-sm">
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`px-inset-md py-inset-sm rounded-control-sm transition-colors ${
            activeSubTab === 'ledger'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          جدول تراکنش‌های Ledger ({ledgerEntries.length})
        </button>
        <button
          onClick={() => setActiveSubTab('plans')}
          className={`px-inset-md py-inset-sm rounded-control-sm transition-colors ${
            activeSubTab === 'plans'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          مقایسه و ارتقای پلن‌ها
        </button>
        <button
          onClick={() => setActiveSubTab('economics')}
          className={`px-inset-md py-inset-sm rounded-control-sm transition-colors ${
            activeSubTab === 'economics'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          خطوط قرمز اقتصادی (Red Lines)
        </button>
      </div>

      {/* Subtab 1: Ledger Table */}
      {activeSubTab === 'ledger' && (
        <div className="bg-surface-raised border border-border-default rounded-control overflow-hidden shadow-raised">
          <div className="overflow-x-auto">
            <table className="w-full text-end text-body-sm">
              <thead className="bg-surface-sunken text-text-subtle uppercase border-b border-border-default">
                <tr>
                  <th scope="col" className="px-inset-lg py-inset-md font-semibold">زمان</th>
                  <th scope="col" className="px-inset-lg py-inset-md font-semibold">عملیات / کار</th>
                  <th scope="col" className="px-inset-md py-inset-md font-semibold">الگوی اجرا</th>
                  <th scope="col" className="px-inset-md py-inset-md font-semibold">توکن ورودی/خروجی</th>
                  <th scope="col" className="px-inset-md py-inset-md font-semibold">اعتبار کسرشده</th>
                  <th scope="col" className="px-inset-md py-inset-md font-semibold">هزینه AI</th>
                  <th scope="col" className="px-inset-md py-inset-md font-semibold">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {ledgerEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-interaction-hover transition-colors">
                    <td className="px-inset-lg py-inset-md text-text-subtlest whitespace-nowrap tabular-nums">
                      {new Date(entry.timestamp).toLocaleTimeString('fa-IR')}
                    </td>
                    <td className="px-inset-lg py-inset-md font-semibold text-text-default whitespace-nowrap">
                      {entry.action}
                    </td>
                    <td className="px-inset-md py-inset-md whitespace-nowrap">
                      <span className="text-caption bg-surface-sunken border border-border-default px-inset-sm py-inset-xs rounded-indicator text-text-default">
                        {entry.mode}
                      </span>
                    </td>
                    <td className="px-inset-md py-inset-md text-text-subtle whitespace-nowrap tabular-nums">
                      {entry.inputTokens} / {entry.outputTokens}
                    </td>
                    <td className="px-inset-md py-inset-md font-bold text-text-default whitespace-nowrap tabular-nums">
                      {entry.creditCost === 0 ? (
                        <span className="text-text-success">رایگان (Auto)</span>
                      ) : (
                        <span>{entry.creditCost} اعتبار</span>
                      )}
                    </td>
                    <td className="px-inset-md py-inset-md text-text-success whitespace-nowrap tabular-nums">
                      ${entry.estimatedAiCostUsd.toFixed(4)}
                    </td>
                    <td className="px-inset-md py-inset-md whitespace-nowrap">
                      <span className="text-caption text-text-success bg-bg-success-subtle px-inset-sm py-inset-xs rounded-indicator">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-inline-xl">
          {(Object.keys(PLANS) as PlanId[]).map((pid) => {
            const p = PLANS[pid];
            const isCurrent = currentWorkspace.planId === pid;

            return (
              <div
                key={pid}
                className={`bg-surface-raised rounded-control p-inset-xl border flex flex-col justify-between transition-all ${
                  isCurrent ? 'border-border-brand shadow-overflow ring-1 ring-border-brand' : 'border-border-default'
                }`}
              >
                <div className="space-y-stack-md">
                  <div className="flex items-center justify-between">
                    <h3 className="text-body-md font-bold text-text-default">{p.title}</h3>
                    {isCurrent && (
                      <span className="text-caption bg-bg-brand-bold text-text-default px-inset-sm py-inset-xs rounded-indicator font-semibold">
                        پلن فعلی
                      </span>
                    )}
                  </div>

                  <div className="space-y-stack-xs">
                    <div className="flex items-baseline gap-inline-xs">
                      <span className="text-heading-md font-bold text-text-default tabular-nums">${p.priceMonthlyUsd}</span>
                      <span className="text-body-sm text-text-subtle">/ ماهانه</span>
                    </div>
                    <span className="text-body-sm text-text-subtlest block">
                      معادل حدود {p.priceMonthlyToman.toLocaleString('fa-IR')} تومان
                    </span>
                  </div>

                  <div className="pt-inset-md border-t border-border-default space-y-stack-sm text-body-sm text-text-default">
                    <div className="flex items-center justify-between">
                      <span className="text-text-subtle">اعتبار ماهانه:</span>
                      <span className="font-bold text-text-default tabular-nums">{p.creditsMonthly} اعتبار</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-subtle">سقف ورک‌اسپیس:</span>
                      <span className="font-bold text-text-default tabular-nums">{p.workspaceLimit} فضای کاری</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-subtle">سقف منصفانه گفتگو:</span>
                      <span className="font-bold text-text-default tabular-nums">{p.dailyChatLimit} پیام در روز</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-subtle">حالت‌های مجاز:</span>
                      <span className="font-bold text-text-brand">{p.allowedModes.join('، ')}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-inset-xl">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-inset-sm text-body-sm font-semibold text-text-subtle bg-surface-sunken border border-border-default rounded-control-sm cursor-default"
                    >
                      فعال برای این فضای کاری
                    </button>
                  ) : (
                    <button
                      onClick={() => onChangePlan(pid)}
                      className="w-full py-inset-sm text-body-sm font-semibold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors shadow-raised"
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
        <div className="bg-surface-raised border border-border-default rounded-control p-inset-xl space-y-stack-lg text-body-sm text-text-default">
          <h3 className="text-body-md font-bold text-text-default">
            اصول و شاخص‌های خط قرمز در Ledger (بخش اقتصاد واحد PRD)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-inline-lg">
            <div className="bg-surface-sunken p-inset-lg rounded-control-sm border border-border-default space-y-stack-sm">
              <span className="text-text-default font-bold block">سهم هزینه AI از درآمد کاربر:</span>
              <p className="text-text-subtle leading-relaxed">
                آستانه هشدار: بیشتر از ۵۰٪ درآمد. در شبیه‌سازی ۲۰ هزار کاربره مبدأ، هزینه AI در مصرف متوسط بین ۱۷٪ تا ۱۸٪ درآمد خالص کنترل شده است.
              </p>
            </div>

            <div className="bg-surface-sunken p-inset-lg rounded-control-sm border border-border-default space-y-stack-sm">
              <span className="text-text-default font-bold block">هزینه واقعی هر اعتبار:</span>
              <p className="text-text-subtle leading-relaxed">
                آستانه قرمز: بیشتر از ۰٫۰۰۶ دلار دو هفته متوالی. در این حالت وزن اعتبار یا جدول routing مدل‌ها به طور خودکار اصلاح می‌شود.
              </p>
            </div>

            <div className="bg-surface-sunken p-inset-lg rounded-control-sm border border-border-default space-y-stack-sm">
              <span className="text-text-default font-bold block">بازسازی با نصف قیمت:</span>
              <p className="text-text-subtle leading-relaxed">
                برای جلوگیری از سوءاستفاده، بازسازی ۵۰٪ تخفیف تنها یک بار به ازای هر ویرایش Context مجاز است (اصلاحیه ممیزی شماره ۷).
              </p>
            </div>

            <div className="bg-surface-sunken p-inset-lg rounded-control-sm border border-border-default space-y-stack-sm">
              <span className="text-text-default font-bold block">سقف ورک‌اسپیس در پلن Max:</span>
              <p className="text-text-subtle leading-relaxed">
                با استناد به اصل P5 (بدون وعده نامحدود)، سقف ورک‌اسپیس Max دقیقاً ۱۰ تعیین شده است تا هزینه‌های ذخیره‌سازی و پردازش پایدار بماند.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
