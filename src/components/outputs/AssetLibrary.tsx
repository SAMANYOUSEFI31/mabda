/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { ContextChange, ContextObject, GeneratedDeliverable, Workspace } from '../../types';
import { ContextReplayCard } from './ContextReplayCard';
import type { StaleAsset } from '../../core/impactEngine';
import { useAiStatus } from '../../services/aiStatus';
import { Button, EmptyState, formatNumber } from '../../ui';

interface AssetLibraryProps {
  currentWorkspace: Workspace;
  deliverables: GeneratedDeliverable[];
  allContextObjects: ContextObject[];
  onOpenContextModal: (obj: ContextObject) => void;
  /** proposes knowledge (Proposed + quote) from the output's text; the output itself never becomes Context */
  onExtractKnowledge: (del: GeneratedDeliverable) => void;
  extractingId?: string | null;
  /** Mabda's own rebuild (managed AI, frozen): only offered when that is on */
  onRebuild: (del: GeneratedDeliverable) => void;
  /** the outward way to bring an output back in step: a fresh request for another tool from today's truth */
  onRerequest?: (del: GeneratedDeliverable) => void;
  /** per output: the required truths its recipe still lacks («چه کم است») */
  missingOf?: (del: GeneratedDeliverable) => string[];
  stale: StaleAsset[];
  changes?: ContextChange[];
  /** «بایگانی» and «حذف» of one output (the page offers «واگرد») */
  onArchive?: (d: GeneratedDeliverable) => void;
  onDelete?: (d: GeneratedDeliverable) => void;
  /** the empty page's one action (the page header carries it once there is something) */
  emptyAction?: React.ReactNode;
  /** the global search points at one asset: show it among all and scroll to it */
  focus?: { id: string; n: number } | null;
}

/**
 * «خروجی‌ها» at its core (docs/product-scope.md): what she made from her truths or sent to another tool, the text that came back,
 * which truths it rests on (the trail) and whether it is still up to date (Context Replay). One filter only: «به‌روز نیست».
 * The production workshop (workstreams, specs, acceptance criteria, the library) is not on this page any more; its data stays.
 */
export const AssetLibrary: React.FC<AssetLibraryProps> = ({
  currentWorkspace,
  deliverables,
  allContextObjects,
  onOpenContextModal,
  onExtractKnowledge,
  extractingId,
  onRebuild,
  onRerequest,
  missingOf,
  stale,
  changes,
  focus,
  onArchive,
  onDelete,
  emptyAction,
}) => {
  const { managedEnabled } = useAiStatus();
  useEffect(() => {
    if (!focus) return undefined;
    const t = setTimeout(() => { const el = document.getElementById(`asset-${focus.id}`); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }); }, 80);
    return () => clearTimeout(t);
  }, [focus]);

  const live = deliverables.filter((d) => d.workspaceId === currentWorkspace.id && !d.archivedAt);
  const staleIds = new Set(stale.map((x) => x.deliverableId));
  const staleLive = live.filter((d) => staleIds.has(d.id));
  const rest = live.filter((d) => !staleIds.has(d.id));
  const card = (del: GeneratedDeliverable) => (
    <div key={del.id} id={`asset-${del.id}`} tabIndex={-1} className="doc-anchor flex flex-col gap-stack-sm">
      <ContextReplayCard
        deliverable={del}
        allContextObjects={allContextObjects}
        stale={stale.find((x) => x.deliverableId === del.id)}
        changes={changes}
        onOpenContextObject={onOpenContextModal}
        onRebuild={onRebuild}
        onRerequest={onRerequest}
        missing={missingOf?.(del)}
        onArchive={onArchive}
        onDelete={onDelete}
      />
      {/* reading knowledge out of an output needs the managed AI: with it off the button is not offered (no dead end) */}
      {managedEnabled && <div className="flex flex-wrap items-center justify-end">
        <Button variant="secondary" size="sm" iconStart="ScanText" loading={extractingId === del.id} onClick={() => onExtractKnowledge(del)}>
          پیشنهاد دانش از این خروجی
        </Button>
      </div>}
    </div>
  );

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* «به‌روز نیست» is a group that needs her, not a second place (root-cause audit «نقش‌کور»): no tabs that read as two
          pages when one is part of the other. It comes first under its own heading, the rest under theirs (iOS Settings, Mail) */}
      {live.length === 0 ? (
        <EmptyState
          title="هنوز خروجی‌ای نداری"
          description="درخواستی برای ابزار دیگر آماده کن و پاسخش را برگردان؛ اینجا با ردپایش می‌ماند و اگر حقیقتی که در آن بود عوض شود، می‌گوید."
          action={emptyAction}
        />
      ) : staleLive.length === 0 ? (
        <div className="flex flex-col gap-stack-lg">{live.map(card)}</div>
      ) : (
        <>
          <section aria-labelledby="assets-stale" className="flex flex-col gap-stack-md">
            <h2 id="assets-stale" className="heading-sm text-text-default">به‌روز نیست ({formatNumber(staleLive.length)})</h2>
            <div className="flex flex-col gap-stack-lg">{staleLive.map(card)}</div>
          </section>
          {rest.length > 0 && <section aria-labelledby="assets-rest" className="flex flex-col gap-stack-md">
            <h2 id="assets-rest" className="heading-sm text-text-default">بقیه ({formatNumber(rest.length)})</h2>
            <div className="flex flex-col gap-stack-lg">{rest.map(card)}</div>
          </section>}
        </>
      )}
    </div>
  );
};
