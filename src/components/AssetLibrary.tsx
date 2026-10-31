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
    <div className="space-y-stack-lg text-end">
      {/* Header */}
      <div className="bg-surface-raised border border-border-default rounded-control p-inset-xl flex flex-col md:flex-row md:items-center justify-between gap-inline-lg">
        <div>
          <h2 className="text-heading-sm font-bold text-text-default">کتابخانه دارایی‌ها (Asset Library)</h2>
          <p className="text-body-sm text-text-subtle mt-stack-xs">
            اصل P4: محصول برای دارایی منسجم بهینه می‌شود، نه تعداد پیام. هر خروجی می‌تواند خودش Context کارهای بعدی شود.
          </p>
        </div>

        <div className="flex items-center gap-inline-sm shrink-0">
          <button
            onClick={handleExportJson}
            className="px-inset-md py-inset-sm text-body-sm font-semibold text-text-default hover:text-text-default bg-surface-sunken border border-border-default hover:border-border-bold rounded-control-sm transition-colors"
          >
            خروجی گرفتن JSON
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="bg-bg-success-subtle border border-border-success-subtle text-text-success p-inset-md rounded-control-sm text-body-sm">
          {exportNotice}
        </div>
      )}

      {/* Filter strip */}
      <div className="flex items-center gap-inline-sm border-b border-border-default pb-inset-sm text-body-sm">
        <button
          onClick={() => setFilter('all')}
          className={`px-inset-md py-inset-sm rounded-control-sm transition-colors ${
            filter === 'all'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          تمام دارایی‌ها ({deliverables.length})
        </button>
        <button
          onClick={() => setFilter('main_positioning')}
          className={`px-inset-md py-inset-sm rounded-control-sm transition-colors ${
            filter === 'main_positioning'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          پایهٔ موقعیت‌یابی
        </button>
        <button
          onClick={() => setFilter('instagram_foundation')}
          className={`px-inset-md py-inset-sm rounded-control-sm transition-colors ${
            filter === 'instagram_foundation'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          اینستاگرام
        </button>
        <button
          onClick={() => setFilter('freelance_profile')}
          className={`px-inset-md py-inset-sm rounded-control-sm transition-colors ${
            filter === 'freelance_profile'
              ? 'bg-surface-raised text-text-default font-bold border border-border-bold'
              : 'text-text-subtle hover:text-text-default'
          }`}
        >
          پروفایل فریلنسری
        </button>
      </div>

      {/* Deliverables feed */}
      {filtered.length === 0 ? (
        <div className="p-inset-2xl text-center bg-surface-raised border border-border-default rounded-control text-body-sm text-text-subtle space-y-stack-md">
          <p className="text-body-md">هیچ دارایی‌ای با فیلتر انتخابی یافت نشد.</p>
          <p>می‌توانید از بخش جریان‌های کار، نخستین دارایی را با اتکا به Gap Engine تولید کنید.</p>
        </div>
      ) : (
        <div className="space-y-stack-lg">
          {filtered.map((del) => (
            <div key={del.id} className="relative group">
              <ContextReplayCard
                deliverable={del}
                allContextObjects={allContextObjects}
                onOpenContextObject={onOpenContextModal}
                onRebuild={onRebuild}
              />
              <div className="mt-stack-sm flex items-center justify-end">
                <button
                  onClick={() => onPromoteToContext(del)}
                  className="text-body-sm text-text-success hover:text-text-success bg-surface-sunken border border-border-success-subtle hover:border-border-success px-inset-md py-inset-xs rounded-control-sm transition-colors"
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
