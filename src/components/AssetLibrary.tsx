/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, GeneratedDeliverable, Workspace } from '../types';
import { ContextReplayCard } from './ContextReplayCard';

interface AssetLibraryProps {
  currentWorkspace: Workspace;
  deliverables: GeneratedDeliverable[];
  allContextObjects: ContextObject[];
  onOpenContextModal: (obj: ContextObject) => void;
  onPromoteToContext: (del: GeneratedDeliverable) => void;
  onRebuild: (del: GeneratedDeliverable) => void;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({
  currentWorkspace,
  deliverables,
  allContextObjects,
  onOpenContextModal,
  onPromoteToContext,
  onRebuild,
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const filtered = deliverables.filter((d) => {
    if (d.workspaceId !== currentWorkspace.id) return false;
    if (filter === 'all') return true;
    return d.workstreamId === filter;
  });

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filtered, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `mabda_assets_${currentWorkspace.slug}.json`);
    dlAnchor.click();
    setExportNotice('فایل JSON تمام دارایی‌ها دانلود شد.');
    setTimeout(() => setExportNotice(null), 3000);
  };

  return (
    <div className="space-y-6 text-right">
      {/* Header */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">کتابخانه دارایی‌ها (Asset Library)</h2>
          <p className="text-xs text-[#a1a1aa] mt-1">
            اصل P4: محصول برای دارایی منسجم بهینه می‌شود، نه تعداد پیام. هر خروجی می‌تواند خودش Context کارهای بعدی شود.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 text-xs font-semibold text-[#d4d4d8] hover:text-white bg-[#09090b] border border-[#27272a] hover:border-[#52525b] rounded-lg transition-colors"
          >
            خروجی گرفتن JSON
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="bg-[#10b981]/20 border border-[#10b981]/40 text-[#34d399] p-3 rounded-lg text-xs">
          {exportNotice}
        </div>
      )}

      {/* Filter strip */}
      <div className="flex items-center gap-2 border-b border-[#27272a] pb-2 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'all'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          تمام دارایی‌ها ({deliverables.length})
        </button>
        <button
          onClick={() => setFilter('main_positioning')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'main_positioning'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          پایهٔ موقعیت‌یابی
        </button>
        <button
          onClick={() => setFilter('instagram_foundation')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'instagram_foundation'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          اینستاگرام
        </button>
        <button
          onClick={() => setFilter('freelance_profile')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === 'freelance_profile'
              ? 'bg-[#18181b] text-white font-bold border border-[#3f3f46]'
              : 'text-[#a1a1aa] hover:text-white'
          }`}
        >
          پروفایل فریلنسری
        </button>
      </div>

      {/* Deliverables feed */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center bg-[#18181b] border border-[#27272a] rounded-xl text-xs text-[#a1a1aa] space-y-3">
          <p className="text-sm">هیچ دارایی‌ای با فیلتر انتخابی یافت نشد.</p>
          <p>می‌توانید از بخش جریان‌های کار، نخستین دارایی را با اتکا به Gap Engine تولید کنید.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((del) => (
            <div key={del.id} className="relative group">
              <ContextReplayCard
                deliverable={del}
                allContextObjects={allContextObjects}
                onOpenContextObject={onOpenContextModal}
                onRebuild={onRebuild}
              />
              <div className="mt-2 flex items-center justify-end">
                <button
                  onClick={() => onPromoteToContext(del)}
                  className="text-xs text-[#10b981] hover:text-[#34d399] bg-[#09090b] border border-[#10b981]/30 hover:border-[#10b981] px-3 py-1 rounded-md transition-colors"
                >
                  تبدیل این خروجی به Context جدید (برای کارهای آینده) &larr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
