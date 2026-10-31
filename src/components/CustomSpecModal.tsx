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
    <div className="fixed inset-space-0 z-dialog flex items-center justify-center p-inset-lg bg-bg-scrim text-end">
      <div className="bg-surface-raised border border-border-default rounded-container w-full max-w-form max-h-[90vh] overflow-y-auto shadow-overlay p-inset-xl sm:p-inset-2xl space-y-stack-lg">
        <div className="flex items-center justify-between border-b border-border-default pb-inset-lg">
          <div>
            <h3 className="text-heading-xs font-bold text-text-default">تعریف جریان کار سفارشی (Custom Workstream Spec)</h3>
            <p className="text-body-sm text-text-subtle mt-stack-xs">
              اصل F8: هر Workstream یک spec داده‌محور است؛ پیش‌نیازها و خروجی‌های خود را تعریف کنید.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-default p-inset-xs rounded-control-sm hover:bg-interaction-hover transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-stack-lg text-body-sm">
          {/* Workstream Info */}
          <div className="space-y-stack-md bg-surface-sunken p-inset-lg rounded-control border border-border-default">
            <h4 className="text-body-sm font-bold text-text-default text-text-brand">۱. مشخصات کلی جریان کار:</h4>
            <div>
              <label className="block text-text-default font-semibold mb-stack-xs">
                عنوان جریان کار <span className="text-text-brand">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="مثلاً: طراحی کمپین پرتاب محصول، نگارش پروپوزال، تدوین کتابچه برند..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-surface-raised border border-border-default rounded-control-sm p-inset-md text-text-default focus:outline-none focus:border-border-brand"
              />
            </div>

            <div>
              <label className="block text-text-default font-semibold mb-stack-xs">
                هدف و مقصد کار (Target) <span className="text-text-brand">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="چه نتیجه مشخصی باید برای کسب‌وکار یا کارفرما خلق شود؟"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full bg-surface-raised border border-border-default rounded-control-sm p-inset-md text-text-default focus:outline-none focus:border-border-brand"
              />
            </div>
          </div>

          {/* Context Requirements */}
          <div className="space-y-stack-md bg-surface-sunken p-inset-lg rounded-control border border-border-default">
            <h4 className="text-body-sm font-bold text-text-info">۲. الزامات دانش (Required Contexts برای Gap Engine):</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-inline-md">
              <div>
                <label className="block text-text-subtle mb-stack-xs">پیش‌نیاز اول:</label>
                <input
                  type="text"
                  value={reqLabel1}
                  onChange={(e) => setReqLabel1(e.target.value)}
                  className="w-full bg-surface-raised border border-border-default rounded-control-sm p-inset-sm text-text-default"
                />
              </div>
              <div>
                <label className="block text-text-subtle mb-stack-xs">شاخه در درخت دانش:</label>
                <select
                  value={reqNode1}
                  onChange={(e) => setReqNode1(e.target.value)}
                  className="w-full bg-surface-raised border border-border-default rounded-control-sm p-inset-sm text-text-default"
                >
                  <option value="business">کسب‌وکار و بنیان</option>
                  <option value="brand">برند و پیام</option>
                  <option value="product">محصول و خدمت</option>
                  <option value="offer">آفر و قیمت‌گذاری</option>
                  <option value="content">محتوا و بازاریابی</option>
                </select>
              </div>

              <div>
                <label className="block text-text-subtle mb-stack-xs">پیش‌نیاز دوم:</label>
                <input
                  type="text"
                  value={reqLabel2}
                  onChange={(e) => setReqLabel2(e.target.value)}
                  className="w-full bg-surface-raised border border-border-default rounded-control-sm p-inset-sm text-text-default"
                />
              </div>
              <div>
                <label className="block text-text-subtle mb-stack-xs">شاخه در درخت دانش:</label>
                <select
                  value={reqNode2}
                  onChange={(e) => setReqNode2(e.target.value)}
                  className="w-full bg-surface-raised border border-border-default rounded-control-sm p-inset-sm text-text-default"
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
          <div className="space-y-stack-md bg-surface-sunken p-inset-lg rounded-control border border-border-default">
            <h4 className="text-body-sm font-bold text-text-success">۳. خروجی‌ها و معیارهای پذیرش (Deliverables):</h4>

            <div className="p-inset-md bg-surface-raised rounded-control-sm border border-border-default space-y-stack-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-default">خروجی اول (گام ۱):</span>
                <select
                  value={delType1}
                  onChange={(e) => setDelType1(e.target.value as any)}
                  className="bg-surface-sunken border border-border-default rounded-indicator p-inset-xs text-caption text-text-default"
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
                className="w-full bg-surface-sunken border border-border-default rounded-indicator p-inset-sm text-text-default"
              />
              <input
                type="text"
                placeholder="معیار پذیرش خروجی اول (با کاما جدا کنید)"
                value={delCriteria1}
                onChange={(e) => setDelCriteria1(e.target.value)}
                className="w-full bg-surface-sunken border border-border-default rounded-indicator p-inset-sm text-text-default text-caption"
              />
            </div>

            <div className="p-inset-md bg-surface-raised rounded-control-sm border border-border-default space-y-stack-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-default">خروجی دوم (گام ۲):</span>
                <select
                  value={delType2}
                  onChange={(e) => setDelType2(e.target.value as any)}
                  className="bg-surface-sunken border border-border-default rounded-indicator p-inset-xs text-caption text-text-default"
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
                className="w-full bg-surface-sunken border border-border-default rounded-indicator p-inset-sm text-text-default"
              />
              <input
                type="text"
                placeholder="معیار پذیرش خروجی دوم (با کاما جدا کنید)"
                value={delCriteria2}
                onChange={(e) => setDelCriteria2(e.target.value)}
                className="w-full bg-surface-sunken border border-border-default rounded-indicator p-inset-sm text-text-default text-caption"
              />
            </div>
          </div>

          <div className="pt-inset-md border-t border-border-default flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-inset-lg py-inset-sm text-body-sm text-text-subtle hover:text-text-default"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-inset-lg py-inset-sm text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors shadow-raised"
            >
              ذخیره و فعال‌سازی این Spec &larr;
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
