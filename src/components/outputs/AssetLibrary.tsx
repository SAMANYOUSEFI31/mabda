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
    toast.show({ intent: 'success', message: 'فایل JSON همهٔ ساخته‌ها دانلود شد.' });
  };

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="flex flex-col gap-stack-xs">
        <div className="flex items-center gap-inline-xs">
          <h2 className="heading-sm text-text-default">خروجی‌های تو</h2>
          {/* the «⋯» sits with the heading it belongs to, quiet, never floating at the far edge */}
          <Menu
          label="بیشتر دربارهٔ ساخته‌ها"
          align="start"
          trigger={<IconButton icon="Ellipsis" label="بیشتر دربارهٔ ساخته‌ها" size="sm" />}
          items={[{ label: 'خروجی گرفتن JSON', icon: 'Download', onSelect: handleExportJson }, ...(onOpenArchive ? [{ label: 'خروجی‌های بایگانی‌شده', icon: 'Archive' as const, onSelect: onOpenArchive }] : [])]}
          />
        </div>
        <p className="body-sm text-text-subtle">از متن هر کدام می‌توانی دانش پیشنهادی بگیری؛ خودشان هرگز دانش نیستند.</p>
      </div>

      {deliverables.length > 0 && (stale.length > 0 || workstreams.filter((w) => deliverables.some((d) => d.workstreamId === w.id)).length > 1) && <Tabs
        label="فیلتر ساخته‌ها"
        value={filter}
        onChange={setFilter}
        items={[
          { id: 'all', label: `همه (${formatNumber(deliverables.length)})` },
          ...(stale.length > 0 ? [{ id: 'stale', label: `به‌روز نیست (${formatNumber(stale.length)})` }] : []),
          ...workstreams.filter((w) => deliverables.some((d) => d.workstreamId === w.id)).map((w) => ({ id: w.id, label: w.title })),
        ]}
      />}

      {filtered.length === 0 ? (
        <EmptyState
          icon="Package"
          title={deliverables.length === 0 ? 'هنوز چیزی نساخته‌ای' : 'با این فیلتر چیزی نیست'}
          description={managedEnabled ? 'از یکی از موارد بالا، اولین را از حقیقت‌هایت بساز.' : 'از یکی از موارد بالا، حقیقت‌هایت را برای هر ابزاری آماده کن.'}
          action={<Button variant="secondary" iconStart={managedEnabled ? 'Package' : 'Copy'} onClick={onGoToWorkstreams}>{managedEnabled ? 'تولید' : 'آماده‌سازی'}</Button>}
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
                <Button variant="secondary" size="sm" iconStart="FolderInput" loading={extractingId === del.id} onClick={() => onExtractKnowledge(del)}>
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
