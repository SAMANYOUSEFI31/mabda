/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ContextObject, GeneratedDeliverable, Workspace } from '../types';
import { ContextReplayCard } from './ContextReplayCard';
import type { StaleAsset } from '../core/impactEngine';
import { Button, Card, EmptyState, Tabs, formatNumber, useToast } from '../ui';

interface AssetLibraryProps {
  currentWorkspace: Workspace;
  deliverables: GeneratedDeliverable[];
  allContextObjects: ContextObject[];
  onOpenContextModal: (obj: ContextObject) => void;
  onPromoteToContext: (del: GeneratedDeliverable) => void;
  onRebuild: (del: GeneratedDeliverable) => void;
  stale: StaleAsset[];
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({
  currentWorkspace,
  deliverables,
  allContextObjects,
  onOpenContextModal,
  onPromoteToContext,
  onRebuild,
  stale,
}) => {
  const [filter, setFilter] = useState<string>('all');
  const toast = useToast();

  const filtered = deliverables.filter((d) => {
    if (d.workspaceId !== currentWorkspace.id) return false;
    if (filter === 'all') return true;
    if (filter === 'stale') return stale.some((x) => x.deliverableId === d.id);
    return d.workstreamId === filter;
  });

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filtered, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `mabda_assets_${currentWorkspace.slug}.json`);
    dlAnchor.click();
    toast.show({ intent: 'success', message: 'فایل JSON تمام دارایی‌ها دانلود شد.' });
  };

  return (
    <div className="flex flex-col gap-stack-lg">
      <Card padding="xl" className="flex flex-col justify-between gap-inline-lg md:flex-row md:items-center">
        <div>
          <h2 className="heading-sm text-text-default">کتابخانهٔ دارایی‌ها</h2>
          <p className="body-sm mt-stack-xs text-text-subtle">
            هر خروجی می‌تواند خودش Context کارهای بعدی شود.
          </p>
        </div>
        <Button variant="secondary" iconStart="Download" onClick={handleExportJson}>خروجی گرفتن JSON</Button>
      </Card>

      <Tabs
        label="فیلتر دارایی‌ها"
        value={filter}
        onChange={setFilter}
        items={[
          { id: 'all', label: `تمام دارایی‌ها (${formatNumber(deliverables.length)})` },
          ...(stale.length > 0 ? [{ id: 'stale', label: `قدیمی (${formatNumber(stale.length)})` }] : []),
          { id: 'main_positioning', label: 'پایهٔ موقعیت‌یابی' },
          { id: 'instagram_foundation', label: 'اینستاگرام' },
          { id: 'freelance_profile', label: 'پروفایل فریلنسری' },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon="Package"
          title="هیچ دارایی‌ای با این فیلتر پیدا نشد"
          description="از بخش جریان‌های کار، نخستین دارایی را با اتکا به Gap Engine تولید کن."
        />
      ) : (
        <div className="flex flex-col gap-stack-lg">
          {filtered.map((del) => (
            <div key={del.id} className="flex flex-col gap-stack-sm">
              <ContextReplayCard
                deliverable={del}
                allContextObjects={allContextObjects}
                stale={stale.find((x) => x.deliverableId === del.id)}
                onOpenContextObject={onOpenContextModal}
                onRebuild={onRebuild}
              />
              <div className="flex flex-wrap items-center justify-end">
                <Button variant="secondary" size="sm" iconEnd="ArrowLeft" onClick={() => onPromoteToContext(del)}>
                  تبدیل به Context برای کارهای بعدی
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
