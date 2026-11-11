/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ContextChange, ContextObject, GeneratedDeliverable, Workspace } from '../../types';
import { ContextReplayCard } from './ContextReplayCard';
import type { StaleAsset } from '../../core/impactEngine';
import { useAiStatus } from '../../services/aiStatus';
import { Button, EmptyState, IconButton, Menu, Tabs, formatNumber, useToast } from '../../ui';

interface AssetLibraryProps {
  currentWorkspace: Workspace;
  deliverables: GeneratedDeliverable[];
  allContextObjects: ContextObject[];
  onOpenContextModal: (obj: ContextObject) => void;
  /** proposes knowledge (Proposed + quote) from the output's text; the output itself never becomes Context */
  onExtractKnowledge: (del: GeneratedDeliverable) => void;
  extractingId?: string | null;
  onRebuild: (del: GeneratedDeliverable) => void;
  stale: StaleAsset[];
  changes?: ContextChange[];
  onGoToWorkstreams: () => void;
  /** «بایگانی» and «حذف» of one output (the page offers «برگرداندن») */
  onArchive?: (d: GeneratedDeliverable) => void;
  onDelete?: (d: GeneratedDeliverable) => void;
  /** opens the archive on its outputs */
  onOpenArchive?: () => void;
  /** this workspace's own workstreams (the filter tabs); only those that already have an output are listed */
  workstreams: Array<{ id: string; title: string }>;
  /** the global search points at one asset: show it among all and scroll to it */
  focus?: { id: string; n: number } | null;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({
  currentWorkspace,
  deliverables,
  allContextObjects,
  onOpenContextModal,
  onExtractKnowledge,
  extractingId,
  onRebuild,
  workstreams,
  stale,
  changes,
  onGoToWorkstreams,
  focus,
  onArchive,
  onDelete,
  onOpenArchive,
}) => {
  const { managedEnabled } = useAiStatus();
  const [filter, setFilter] = useState<string>('all');
  const toast = useToast();
  useEffect(() => {
    if (!focus) return undefined;
    setFilter('all');
    const t = setTimeout(() => { const el = document.getElementById(`asset-${focus.id}`); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }); }, 80);
    return () => clearTimeout(t);
  }, [focus]);

  const filtered = deliverables.filter((d) => {
    if (d.workspaceId !== currentWorkspace.id || d.archivedAt) return false;
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
      <div className="flex items-start justify-between gap-inline-md">
        <div>
          <h2 className="heading-sm text-text-default">خروجی‌های تو</h2>
          <p className="body-sm mt-stack-xs text-text-subtle">از متن هر خروجی می‌توانی دانش پیشنهادی بگیری؛ خود خروجی هرگز دانش نیست.</p>
        </div>
        <Menu
          label="بیشتر دربارهٔ کتابخانه"
          align="end"
          trigger={<IconButton icon="Ellipsis" label="بیشتر دربارهٔ کتابخانه" variant="secondary" />}
          items={[{ label: 'خروجی گرفتن JSON', icon: 'Download', onSelect: handleExportJson }, ...(onOpenArchive ? [{ label: 'خروجی‌های بایگانی‌شده', icon: 'Archive' as const, onSelect: onOpenArchive }] : [])]}
        />
      </div>

      <Tabs
        label="فیلتر دارایی‌ها"
        value={filter}
        onChange={setFilter}
        items={[
          { id: 'all', label: `تمام دارایی‌ها (${formatNumber(deliverables.length)})` },
          ...(stale.length > 0 ? [{ id: 'stale', label: `به‌روز نیست (${formatNumber(stale.length)})` }] : []),
          ...workstreams.filter((w) => deliverables.some((d) => d.workstreamId === w.id)).map((w) => ({ id: w.id, label: w.title })),
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon="Package"
          title={deliverables.length === 0 ? (managedEnabled ? 'هنوز دارایی‌ای نساخته‌ای' : 'هنوز خروجی‌ای نداری') : 'دارایی‌ای با این فیلتر نیست'}
          description={managedEnabled ? 'در جریان‌های کار، اولین دارایی را از دانش تأییدشده‌ات بساز.' : 'در جریان‌های کار، بستهٔ دانش تأییدشده‌ات را برای هر ابزار آماده کن.'}
          action={<Button variant="secondary" iconStart={managedEnabled ? 'Sparkles' : 'Copy'} onClick={onGoToWorkstreams}>{managedEnabled ? 'ساخت دارایی' : 'آماده‌سازی خروجی'}</Button>}
        />
      ) : (
        <div className="flex flex-col gap-stack-lg">
          {filtered.map((del) => (
            <div key={del.id} id={`asset-${del.id}`} tabIndex={-1} className="doc-anchor flex flex-col gap-stack-sm">
              <ContextReplayCard
                deliverable={del}
                allContextObjects={allContextObjects}
                stale={stale.find((x) => x.deliverableId === del.id)}
                changes={changes}
                onOpenContextObject={onOpenContextModal}
                onRebuild={onRebuild}
                onArchive={onArchive}
                onDelete={onDelete}
              />
              <div className="flex flex-wrap items-center justify-end">
                <Button variant="secondary" size="sm" iconStart="Wand2" loading={extractingId === del.id} onClick={() => onExtractKnowledge(del)}>
                  پیشنهاد دانش از این خروجی
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
