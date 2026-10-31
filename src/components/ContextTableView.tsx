/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, ContextStatus, ContextType, TreeNode } from '../types';
import { DEFAULT_TREE_NODES } from '../core/specs';

interface ContextTableViewProps {
  objects: ContextObject[];
  nodes?: TreeNode[];
  onSelectObject: (obj: ContextObject) => void;
  onAddNew: () => void;
}

export const ContextTableView: React.FC<ContextTableViewProps> = ({
  objects,
  nodes = DEFAULT_TREE_NODES,
  onSelectObject,
  onAddNew,
}) => {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedNode, setSelectedNode] = useState<string>('all');

  const filteredObjects = objects.filter((o) => {
    if (selectedType !== 'all' && o.type !== selectedType) return false;
    if (selectedStatus !== 'all' && o.status !== selectedStatus) return false;
    if (selectedNode !== 'all' && o.nodeId !== selectedNode) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = o.title.toLowerCase().includes(q);
      const matchContent = o.content.toLowerCase().includes(q);
      if (!matchTitle && !matchContent) return false;
    }
    return true;
  });

  const getNodeLabel = (nodeId: string) => {
    const n = nodes.find((node) => node.id === nodeId);
    return n ? n.label : nodeId;
  };

  return (
    <div className="bg-surface-raised border border-border-default rounded-control p-inset-xl space-y-stack-md text-end">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-inline-lg border-b border-border-default pb-inset-lg">
        <div>
          <h2 className="text-heading-sm font-bold text-text-default">جدول پایگاه دانش (Table View)</h2>
          <p className="text-body-sm text-text-subtle mt-stack-xs">
            مشاهده، فیلتر چندبعدی و جستجو در ردیف‌های Context با ساختار و منشأ شفاف
          </p>
        </div>
        <button
          onClick={onAddNew}
          className="px-inset-lg py-inset-sm text-body-sm font-semibold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors whitespace-nowrap"
        >
          + تعریف شیء جدید (Context)
        </button>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-inline-md">
        <input
          type="text"
          placeholder="جستجو در عنوان یا متن..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-body-sm text-text-default focus:outline-none focus:border-border-brand"
        />

        <select
          aria-label="فیلتر بر اساس نوع شیء"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-body-sm text-text-default focus:outline-none focus:border-border-brand"
        >
          <option value="all">تمام انواع (Fact, Decision...)</option>
          <option value="Fact">Fact (واقعیت)</option>
          <option value="Decision">Decision (تصمیم)</option>
          <option value="Constraint">Constraint (مرز/محدودیت)</option>
          <option value="Asset">Asset (خروجی تأییدشده)</option>
        </select>

        <select
          aria-label="فیلتر بر اساس وضعیت"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-body-sm text-text-default focus:outline-none focus:border-border-brand"
        >
          <option value="all">تمام وضعیت‌ها</option>
          <option value="Confirmed">تأییدشده (Confirmed)</option>
          <option value="Proposed">پیشنهادی (Proposed)</option>
          <option value="Needs Review">نیاز به بررسی (Needs Review)</option>
          <option value="Superseded">جایگزین‌شده (Superseded)</option>
          <option value="Archived">بایگانی (Archived)</option>
        </select>

        <select
          aria-label="فیلتر بر اساس شاخه درخت"
          value={selectedNode}
          onChange={(e) => setSelectedNode(e.target.value)}
          className="bg-surface-sunken border border-border-default rounded-control-sm px-inset-md py-inset-sm text-body-sm text-text-default focus:outline-none focus:border-border-brand"
        >
          <option value="all">تمام شاخه‌ها</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      {/* Mobile Card List (Hidden on md+) */}
      <div className="block md:hidden space-y-stack-sm">
        {filteredObjects.length === 0 ? (
          <div className="p-inset-xl text-center text-text-subtlest bg-surface-sunken rounded-control border border-border-default">
            هیچ داده‌ای با فیلترهای انتخابی یافت نشد.
          </div>
        ) : (
          filteredObjects.map((obj) => (
            <div
              key={obj.id}
              onClick={() => onSelectObject(obj)}
              className="bg-surface-sunken border border-border-default rounded-control p-inset-lg space-y-stack-sm cursor-pointer hover:border-border-bold transition-all"
            >
              <div className="flex items-center justify-between gap-inline-sm">
                <span className="font-bold text-text-default text-body-sm">{obj.title}</span>
                <span
                  className={`px-inset-sm py-inset-xs rounded-indicator text-caption font-semibold ${
                    obj.type === 'Decision'
                      ? 'bg-bg-brand-subtle text-text-brand'
                      : obj.type === 'Constraint'
                      ? 'bg-bg-warning-subtle text-text-warning'
                      : obj.type === 'Asset'
                      ? 'bg-bg-success-subtle text-text-success'
                      : 'bg-bg-info-subtle text-text-info'
                  }`}
                >
                  {obj.type}
                </span>
              </div>

              <p className="text-caption text-text-subtle line-clamp-2 leading-relaxed">
                {obj.content}
              </p>

              <div className="flex items-center justify-between text-caption pt-inset-xs border-t border-border-subtle text-text-subtlest">
                <span>شاخه: {getNodeLabel(obj.nodeId)}</span>
                <span
                  className={`px-inset-sm py-inset-xs rounded-indicator ${
                    obj.status === 'Confirmed'
                      ? 'text-text-success bg-bg-success-subtle'
                      : obj.status === 'Proposed'
                      ? 'text-text-warning bg-bg-warning-subtle'
                      : 'text-text-subtle bg-bg-neutral-subtle'
                  }`}
                >
                  {obj.status === 'Confirmed'
                    ? 'تأییدشده'
                    : obj.status === 'Proposed'
                    ? 'پیشنهادی'
                    : obj.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View (Hidden on mobile) */}
      <div className="hidden md:block overflow-x-auto border border-border-default rounded-control-sm">
        <table className="w-full text-end text-body-sm">
          <thead className="bg-surface-sunken text-text-subtle uppercase border-b border-border-default">
            <tr>
              <th scope="col" className="px-inset-lg py-inset-md font-semibold">عنوان</th>
              <th scope="col" className="px-inset-md py-inset-md font-semibold">نوع</th>
              <th scope="col" className="px-inset-md py-inset-md font-semibold">وضعیت</th>
              <th scope="col" className="px-inset-md py-inset-md font-semibold">شاخه</th>
              <th scope="col" className="px-inset-md py-inset-md font-semibold">منبع (Provenance)</th>
              <th scope="col" className="px-inset-lg py-inset-md font-semibold">محتوا</th>
              <th scope="col" className="px-inset-md py-inset-md font-semibold">اقدام</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filteredObjects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-inset-lg py-inset-2xl text-center text-text-subtlest">
                  هیچ داده‌ای با فیلترهای انتخابی یافت نشد.
                </td>
              </tr>
            ) : (
              filteredObjects.map((obj) => (
                <tr
                  key={obj.id}
                  onClick={() => onSelectObject(obj)}
                  className="hover:bg-interaction-hover transition-colors cursor-pointer group"
                >
                  <td className="px-inset-lg py-inset-md font-semibold text-text-default group-hover:text-text-brand transition-colors whitespace-nowrap">
                    {obj.title}
                  </td>
                  <td className="px-inset-md py-inset-md whitespace-nowrap">
                    <span
                      className={`px-inset-sm py-inset-xs rounded-indicator text-caption font-semibold ${
                        obj.type === 'Decision'
                          ? 'bg-bg-brand-subtle text-text-brand'
                          : obj.type === 'Constraint'
                          ? 'bg-bg-warning-subtle text-text-warning'
                          : obj.type === 'Asset'
                          ? 'bg-bg-success-subtle text-text-success'
                          : 'bg-bg-info-subtle text-text-info'
                      }`}
                    >
                      {obj.type}
                    </span>
                  </td>
                  <td className="px-inset-md py-inset-md whitespace-nowrap">
                    <span
                      className={`px-inset-sm py-inset-xs rounded-indicator text-caption ${
                        obj.status === 'Confirmed'
                          ? 'text-text-success bg-bg-success-subtle'
                          : obj.status === 'Proposed'
                          ? 'text-text-warning bg-bg-warning-subtle'
                          : obj.status === 'Needs Review'
                          ? 'text-text-info bg-bg-info-subtle'
                          : 'text-text-subtlest bg-bg-neutral-subtle'
                      }`}
                    >
                      {obj.status === 'Confirmed'
                        ? 'تأییدشده'
                        : obj.status === 'Proposed'
                        ? 'پیشنهادی'
                        : obj.status === 'Needs Review'
                        ? 'نیاز به بررسی'
                        : obj.status === 'Superseded'
                        ? 'جایگزین‌شده'
                        : 'بایگانی'}
                    </span>
                  </td>
                  <td className="px-inset-md py-inset-md text-text-default whitespace-nowrap">
                    {getNodeLabel(obj.nodeId)}
                  </td>
                  <td className="px-inset-md py-inset-md text-text-subtle whitespace-nowrap">
                    {obj.provenance}
                  </td>
                  <td className="px-inset-lg py-inset-md text-text-subtle max-w-overlay-xs truncate">
                    {obj.content}
                  </td>
                  <td className="px-inset-md py-inset-md whitespace-nowrap text-start">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectObject(obj);
                      }}
                      className="text-body-sm text-text-subtle hover:text-text-default bg-bg-neutral-subtle hover:bg-interaction-hover px-inset-md py-inset-xs rounded-indicator transition-colors"
                    >
                      ویرایش
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
