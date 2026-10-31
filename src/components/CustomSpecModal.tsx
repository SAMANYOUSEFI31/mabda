/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { WorkstreamSpec } from '../types';

interface CustomSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSpec: (spec: WorkstreamSpec) => void;
}

export const CustomSpecModal: React.FC<CustomSpecModalProps> = ({
  isOpen,
  onClose,
  onSaveSpec,
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');

  // Required contexts
  const [reqLabel1, setReqLabel1] = useState('مخاطب اصلی این پروژه');
  const [reqNode1, setReqNode1] = useState('business');
  const [reqLabel2, setReqLabel2] = useState('خروجی یا هدف اصلی کارفرما');
  const [reqNode2, setReqNode2] = useState('product');

  // Deliverables
  const [delTitle1, setDelTitle1] = useState('پیش‌نویس اولیه سند تحویل‌پذیر');
  const [delType1, setDelType1] = useState<'Asset' | 'Deliverable'>('Asset');
  const [delDesc1, setDelDesc1] = useState('نسخه خلاصه و ساختاریافته برای توافق اولیه');
  const [delCriteria1, setDelCriteria1] = useState('پوشش اهداف کارفرما، شفافیت تعهدات');

  const [delTitle2, setDelTitle2] = useState('سند نهایی و دستورالعمل اجرایی');
  const [delType2, setDelType2] = useState<'Asset' | 'Deliverable'>('Deliverable');
  const [delDesc2, setDelDesc2] = useState('سند کامل آماده تحویل به مشتری');
  const [delCriteria2, setDelCriteria2] = useState('جزئیات مرحله‌به‌مرحله، انطباق با معیارهای کیفی');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target.trim()) return;

    const newSpec: WorkstreamSpec = {
      id: `spec_custom_${Date.now()}`,
      title: title.trim(),
      target: target.trim(),
      description: description.trim() || target.trim(),
      requiredContext: [
        {
          key: 'custom_req_1',
          label: reqLabel1.trim(),
          description: 'پیش‌نیاز تعریف‌شده توسط کاربر در جریان کار سفارشی',
          nodeId: reqNode1,
        },
        {
          key: 'custom_req_2',
          label: reqLabel2.trim(),
          description: 'پیش‌نیاز دوم تعریف‌شده توسط کاربر',
          nodeId: reqNode2,
        },
      ],
      suggestedContext: [
        {
          key: 'custom_sug_1',
          label: 'تمایز یا خط قرمز پروژه',
          description: 'پیشنهاد برای افزایش کیفیت خروجی',
          nodeId: 'brand',
        },
      ],
      optionalContext: [],
      deliverables: [
        {
          id: `del_custom_${Date.now()}_1`,
          title: delTitle1.trim(),
          type: delType1,
          description: delDesc1.trim(),
          order: 1,
          baseCreditCost: { fast: 1, auto: 2, critique: 10, sensitive: 20 },
          acceptanceCriteria: delCriteria1.split('،').map((s) => s.trim()).filter(Boolean),
        },
        {
          id: `del_custom_${Date.now()}_2`,
          title: delTitle2.trim(),
          type: delType2,
          description: delDesc2.trim(),
          order: 2,
          baseCreditCost: { fast: 18, auto: 26, critique: 50, sensitive: 80 },
          acceptanceCriteria: delCriteria2.split('،').map((s) => s.trim()).filter(Boolean),
        },
      ],
    };

    onSaveSpec(newSpec);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs text-right animate-in fade-in">
      <div className="bg-[#18181b] border border-[#27272a] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">تعریف جریان کار سفارشی (Custom Workstream Spec)</h3>
            <p className="text-xs text-[#a1a1aa] mt-0.5">
              اصل F8: هر Workstream یک spec داده‌محور است؛ پیش‌نیازها و خروجی‌های خود را تعریف کنید.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#a1a1aa] hover:text-white p-1 rounded-md hover:bg-[#27272a] transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {/* Workstream Info */}
          <div className="space-y-3 bg-[#09090b] p-4 rounded-xl border border-[#27272a]">
            <h4 className="text-xs font-bold text-white text-[#fb7185]">۱. مشخصات کلی جریان کار:</h4>
            <div>
              <label className="block text-[#fafafa] font-semibold mb-1">
                عنوان جریان کار <span className="text-[#e11d48]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="مثلاً: طراحی کمپین پرتاب محصول، نگارش پروپوزال، تدوین کتابچه برند..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#e11d48]"
              />
            </div>

            <div>
              <label className="block text-[#fafafa] font-semibold mb-1">
                هدف و مقصد کار (Target) <span className="text-[#e11d48]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="چه نتیجه مشخصی باید برای کسب‌وکار یا کارفرما خلق شود؟"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2.5 text-white focus:outline-none focus:border-[#e11d48]"
              />
            </div>
          </div>

          {/* Context Requirements */}
          <div className="space-y-3 bg-[#09090b] p-4 rounded-xl border border-[#27272a]">
            <h4 className="text-xs font-bold text-[#38bdf8]">۲. الزامات دانش (Required Contexts برای Gap Engine):</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#a1a1aa] mb-1">پیش‌نیاز اول:</label>
                <input
                  type="text"
                  value={reqLabel1}
                  onChange={(e) => setReqLabel1(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-[#a1a1aa] mb-1">شاخه در درخت دانش:</label>
                <select
                  value={reqNode1}
                  onChange={(e) => setReqNode1(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-white"
                >
                  <option value="business">کسب‌وکار و بنیان</option>
                  <option value="brand">برند و پیام</option>
                  <option value="product">محصول و خدمت</option>
                  <option value="offer">آفر و قیمت‌گذاری</option>
                  <option value="content">محتوا و بازاریابی</option>
                </select>
              </div>

              <div>
                <label className="block text-[#a1a1aa] mb-1">پیش‌نیاز دوم:</label>
                <input
                  type="text"
                  value={reqLabel2}
                  onChange={(e) => setReqLabel2(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-[#a1a1aa] mb-1">شاخه در درخت دانش:</label>
                <select
                  value={reqNode2}
                  onChange={(e) => setReqNode2(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-white"
                >
                  <option value="business">کسب‌وکار و بنیان</option>
                  <option value="brand">برند و پیام</option>
                  <option value="product">محصول و خدمت</option>
                  <option value="offer">آفر و قیمت‌گذاری</option>
                  <option value="content">محتوا و بازاریابی</option>
                </select>
              </div>
            </div>
          </div>

          {/* Deliverables */}
          <div className="space-y-4 bg-[#09090b] p-4 rounded-xl border border-[#27272a]">
            <h4 className="text-xs font-bold text-[#34d399]">۳. خروجی‌ها و معیارهای پذیرش (Deliverables):</h4>

            <div className="p-3 bg-[#18181b] rounded-lg border border-[#27272a] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">خروجی اول (گام ۱):</span>
                <select
                  value={delType1}
                  onChange={(e) => setDelType1(e.target.value as any)}
                  className="bg-[#09090b] border border-[#27272a] rounded p-1 text-[11px] text-white"
                >
                  <option value="Asset">Asset (کوچک و سریع)</option>
                  <option value="Deliverable">Deliverable (اصلی و تفصیلی)</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="عنوان خروجی اول"
                value={delTitle1}
                onChange={(e) => setDelTitle1(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-white"
              />
              <input
                type="text"
                placeholder="معیار پذیرش خروجی اول (با کاما جدا کنید)"
                value={delCriteria1}
                onChange={(e) => setDelCriteria1(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded p-1.5 text-white text-[11px]"
              />
            </div>

            <div className="p-3 bg-[#18181b] rounded-lg border border-[#27272a] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">خروجی دوم (گام ۲):</span>
                <select
                  value={delType2}
                  onChange={(e) => setDelType2(e.target.value as any)}
                  className="bg-[#09090b] border border-[#27272a] rounded p-1 text-[11px] text-white"
                >
                  <option value="Deliverable">Deliverable (اصلی و تفصیلی)</option>
                  <option value="Asset">Asset (کوچک و سریع)</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="عنوان خروجی دوم"
                value={delTitle2}
                onChange={(e) => setDelTitle2(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded p-2 text-white"
              />
              <input
                type="text"
                placeholder="معیار پذیرش خروجی دوم (با کاما جدا کنید)"
                value={delCriteria2}
                onChange={(e) => setDelCriteria2(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded p-1.5 text-white text-[11px]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#27272a] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs text-[#a1a1aa] hover:text-white"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors shadow-sm"
            >
              ذخیره و فعال‌سازی این Spec &larr;
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
