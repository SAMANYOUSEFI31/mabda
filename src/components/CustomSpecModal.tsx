/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { WorkstreamSpec } from '../types';
import { Button, Card, Dialog, Select, TextField } from '../ui';

interface CustomSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSpec: (spec: WorkstreamSpec) => void;
}

/** Form state resets on every open: the stateful part mounts fresh when the modal opens. */
export const CustomSpecModal: React.FC<CustomSpecModalProps> = (props) =>
  props.isOpen ? <CustomSpecForm {...props} /> : null;

const NODE_OPTIONS = [
  { value: 'business', label: 'کسب‌وکار و بنیان' },
  { value: 'brand', label: 'برند و پیام' },
  { value: 'product', label: 'محصول و خدمت' },
  { value: 'offer', label: 'آفر و قیمت‌گذاری' },
  { value: 'content', label: 'محتوا و بازاریابی' },
];
const DEL_TYPE_OPTIONS = [
  { value: 'Asset', label: 'Asset (کوچک و سریع)' },
  { value: 'Deliverable', label: 'Deliverable (اصلی و تفصیلی)' },
];

const CustomSpecForm: React.FC<CustomSpecModalProps> = ({ onClose, onSaveSpec }) => {
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
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="تعریف جریان کار سفارشی"
      description="اصل F8: هر Workstream یک spec داده‌محور است؛ پیش‌نیازها و خروجی‌های خودت را تعریف کن."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button variant="primary" type="submit" form="custom-spec-form" iconEnd="ArrowLeft">ذخیره و فعال‌سازی این Spec</Button>
        </>
      }
    >
      <form id="custom-spec-form" onSubmit={handleSubmit} className="flex flex-col gap-stack-lg">
        <Card padding="lg" className="flex flex-col gap-stack-md">
          <h4 className="title text-text-default">۱. مشخصات کلی جریان کار</h4>
          <TextField
            label="عنوان جریان کار"
            required
            placeholder="مثلاً: طراحی کمپین عرضهٔ محصول، نگارش پروپوزال، تدوین کتابچهٔ برند…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            label="هدف و مقصد کار (Target)"
            required
            placeholder="چه نتیجهٔ مشخصی باید برای کسب‌وکار یا کارفرما ساخته شود؟"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Card>

        <Card padding="lg" className="flex flex-col gap-stack-md">
          <h4 className="title text-text-default">۲. الزامات دانش (Required Contexts برای Gap Engine)</h4>
          <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2">
            <TextField label="پیش‌نیاز اول" value={reqLabel1} onChange={(e) => setReqLabel1(e.target.value)} />
            <Select label="شاخه در درخت دانش" value={reqNode1} onChange={(e) => setReqNode1(e.target.value)} options={NODE_OPTIONS} />
            <TextField label="پیش‌نیاز دوم" value={reqLabel2} onChange={(e) => setReqLabel2(e.target.value)} />
            <Select label="شاخه در درخت دانش" value={reqNode2} onChange={(e) => setReqNode2(e.target.value)} options={NODE_OPTIONS} />
          </div>
        </Card>

        <Card padding="lg" className="flex flex-col gap-stack-md">
          <h4 className="title text-text-default">۳. خروجی‌ها و معیارهای پذیرش (Deliverables)</h4>

          <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
            <span className="label-md text-text-default">خروجی اول (گام ۱)</span>
            <Select label="نوع خروجی" value={delType1} onChange={(e) => setDelType1(e.target.value as 'Asset' | 'Deliverable')} options={DEL_TYPE_OPTIONS} />
            <TextField label="عنوان خروجی اول" value={delTitle1} onChange={(e) => setDelTitle1(e.target.value)} />
            <TextField label="معیار پذیرش خروجی اول" hint="با «،» جدا کن" value={delCriteria1} onChange={(e) => setDelCriteria1(e.target.value)} />
          </div>

          <div className="flex flex-col gap-stack-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
            <span className="label-md text-text-default">خروجی دوم (گام ۲)</span>
            <Select label="نوع خروجی" value={delType2} onChange={(e) => setDelType2(e.target.value as 'Asset' | 'Deliverable')} options={[...DEL_TYPE_OPTIONS].reverse()} />
            <TextField label="عنوان خروجی دوم" value={delTitle2} onChange={(e) => setDelTitle2(e.target.value)} />
            <TextField label="معیار پذیرش خروجی دوم" hint="با «،» جدا کن" value={delCriteria2} onChange={(e) => setDelCriteria2(e.target.value)} />
          </div>
        </Card>
      </form>
    </Dialog>
  );
};
