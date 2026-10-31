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
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-4 text-right">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#27272a] pb-4">
        <div>
          <h2 className="text-xl font-bold text-white">جدول پایگاه دانش (Table View)</h2>
          <p className="text-xs text-[#a1a1aa] mt-1">
            مشاهده، فیلتر چندبعدی و جستجو در ردیف‌های Context با ساختار و منشأ شفاف
          </p>
        </div>
        <button
          onClick={onAddNew}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors whitespace-nowrap"
        >
          + تعریف شیء جدید (Context)
        </button>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="جستجو در عنوان یا متن..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#e11d48]"
        />

        <select
          aria-label="فیلتر بر اساس نوع شیء"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#e11d48]"
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
          className="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#e11d48]"
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
          className="bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#e11d48]"
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
      <div className="block md:hidden space-y-2.5">
        {filteredObjects.length === 0 ? (
          <div className="p-6 text-center text-[#7d7d86] bg-[#09090b] rounded-xl border border-[#27272a]">
            هیچ داده‌ای با فیلترهای انتخابی یافت نشد.
          </div>
        ) : (
          filteredObjects.map((obj) => (
            <div
              key={obj.id}
              onClick={() => onSelectObject(obj)}
              className="bg-[#09090b] border border-[#27272a] rounded-xl p-3.5 space-y-2 cursor-pointer hover:border-[#3f3f46] transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white text-xs">{obj.title}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    obj.type === 'Decision'
                      ? 'bg-[#e11d48]/20 text-[#fb7185]'
                      : obj.type === 'Constraint'
                      ? 'bg-[#f59e0b]/20 text-[#fbbf24]'
                      : obj.type === 'Asset'
                      ? 'bg-[#10b981]/20 text-[#34d399]'
                      : 'bg-[#0284c7]/20 text-[#38bdf8]'
                  }`}
                >
                  {obj.type}
                </span>
              </div>

              <p className="text-[11px] text-[#a1a1aa] line-clamp-2 leading-relaxed">
                {obj.content}
              </p>

              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#1f1f23] text-[#71717a]">
                <span>شاخه: {getNodeLabel(obj.nodeId)}</span>
                <span
                  className={`px-1.5 py-0.5 rounded ${
                    obj.status === 'Confirmed'
                      ? 'text-[#10b981] bg-[#10b981]/10'
                      : obj.status === 'Proposed'
                      ? 'text-[#f59e0b] bg-[#f59e0b]/10'
                      : 'text-[#a1a1aa] bg-[#27272a]'
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
      <div className="hidden md:block overflow-x-auto border border-[#27272a] rounded-lg">
        <table className="w-full text-right text-xs">
          <thead className="bg-[#09090b] text-[#a1a1aa] uppercase border-b border-[#27272a]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">عنوان</th>
              <th scope="col" className="px-3 py-3 font-semibold">نوع</th>
              <th scope="col" className="px-3 py-3 font-semibold">وضعیت</th>
              <th scope="col" className="px-3 py-3 font-semibold">شاخه</th>
              <th scope="col" className="px-3 py-3 font-semibold">منبع (Provenance)</th>
              <th scope="col" className="px-4 py-3 font-semibold">محتوا</th>
              <th scope="col" className="px-3 py-3 font-semibold">اقدام</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272a]/60">
            {filteredObjects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#7d7d86]">
                  هیچ داده‌ای با فیلترهای انتخابی یافت نشد.
                </td>
              </tr>
            ) : (
              filteredObjects.map((obj) => (
                <tr
                  key={obj.id}
                  onClick={() => onSelectObject(obj)}
                  className="hover:bg-[#27272a]/30 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3 font-medium text-white group-hover:text-[#fb7185] transition-colors whitespace-nowrap">
                    {obj.title}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        obj.type === 'Decision'
                          ? 'bg-[#e11d48]/15 text-[#fb7185]'
                          : obj.type === 'Constraint'
                          ? 'bg-[#f59e0b]/15 text-[#fbbf24]'
                          : obj.type === 'Asset'
                          ? 'bg-[#10b981]/15 text-[#34d399]'
                          : 'bg-[#0284c7]/15 text-[#38bdf8]'
                      }`}
                    >
                      {obj.type}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        obj.status === 'Confirmed'
                          ? 'text-[#10b981] bg-[#10b981]/10'
                          : obj.status === 'Proposed'
                          ? 'text-[#f59e0b] bg-[#f59e0b]/10'
                          : obj.status === 'Needs Review'
                          ? 'text-[#38bdf8] bg-[#38bdf8]/10'
                          : 'text-[#7d7d86] bg-[#27272a]'
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
                  <td className="px-3 py-3 text-[#d4d4d8] whitespace-nowrap">
                    {getNodeLabel(obj.nodeId)}
                  </td>
                  <td className="px-3 py-3 text-[#a1a1aa] whitespace-nowrap">
                    {obj.provenance}
                  </td>
                  <td className="px-4 py-3 text-[#a1a1aa] max-w-xs truncate">
                    {obj.content}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-left">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectObject(obj);
                      }}
                      className="text-xs text-[#a1a1aa] hover:text-white bg-[#27272a] hover:bg-[#3f3f46] px-2.5 py-1 rounded transition-colors"
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
