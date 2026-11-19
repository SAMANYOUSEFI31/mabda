/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * «خروجی‌ها»: using the truth elsewhere and staying in step with it — the last loop of the cycle (docs/product-scope.md).
 * What she sent to another tool (a request, a pack), the text she brought back, which truths it rests on, and whether it is still
 * up to date. The production workshop (workstreams, specs, the library, generation) is no longer reachable from here; its code and
 * data stay (docs/later.md «نامزدهای محصول خانواده»), and its gap engine still says what each output needs and lacks.
 */

import { useMemo } from 'react';
import { calculateReadinessAndGaps } from '../../core/contextEngine';
import type { GeneratedDeliverable } from '../../types';
import { Button, IconButton, Menu, useToast } from '../../ui';
import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const AssetLibrary = lazyNamed(() => import('../../components/outputs/AssetLibrary'), 'AssetLibrary');

export type AssetsPageProps = Pick<ReadyScope, 'currentWorkspace' | 'data' | 'deliverables' | 'extractingAssetId' | 'focusAsset' | 'handleArchiveDeliverable' | 'handleDeleteDeliverable' | 'handleExtractFromAsset' | 'openContext' | 'setActiveTab' | 'setAiRequest' | 'setArchiveOpen' | 'setIsImportOpen' | 'setIsPacksOpen' | 'setPendingRebuild' | 'setSelectedSpecId' | 'specs' | 'stale' | 'workspaceContexts'>;

/** the request an output came from, to ask again from today's truth (a pasted answer keeps its request as its source label) */
const requestOf = (d: GeneratedDeliverable): string => {
  const label = d.source?.label?.trim();
  return label && label !== 'نمونهٔ دستی' ? label : d.title;
};

export function AssetsPage({ currentWorkspace, data, deliverables, extractingAssetId, focusAsset, handleArchiveDeliverable, handleDeleteDeliverable, handleExtractFromAsset, openContext, setActiveTab, setAiRequest, setArchiveOpen, setIsImportOpen, setIsPacksOpen, setPendingRebuild, setSelectedSpecId, specs, stale, workspaceContexts }: AssetsPageProps) {
  const toast = useToast();
  const live = deliverables.filter((d) => d.workspaceId === currentWorkspace.id && !d.archivedAt);
  // «این خروجی به چه حقیقت‌هایی نیاز دارد و کدام کم است»: the required gaps of the recipe it was made from (deterministic)
  const missing = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const sp of specs) {
      const gaps = calculateReadinessAndGaps(sp, workspaceContexts, data.relationships ?? []).gaps.filter((g) => g.importance === 'required' && g.status !== 'confirmed');
      out.set(sp.id, gaps.map((g) => g.label));
    }
    return out;
  }, [specs, workspaceContexts, data.relationships]);
  const request = (d?: GeneratedDeliverable) => setAiRequest({ scopeNodeId: '', ...(d ? { request: requestOf(d) } : {}) });
  const exportJson = () => {
    const a = document.createElement('a');
    a.setAttribute('href', `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(live, null, 2))}`);
    a.setAttribute('download', `mabda_outputs_${currentWorkspace.slug}.json`);
    a.click();
    toast.show({ intent: 'success', message: 'فایل JSON همهٔ خروجی‌ها دانلود شد.' });
  };
  const requestButton = <Button variant="secondary" iconStart="PackageOpen" onClick={() => request()}>درخواست برای ابزار دیگر</Button>;
  return (
    <div className="space-y-stack-lg">
      <div className="flex flex-col gap-stack-sm sm:flex-row sm:items-start sm:justify-between sm:gap-inline-md">
        <div className="flex min-w-space-0 flex-col gap-stack-xs">
          <h1 className="text-heading-md font-bold text-text-default">خروجی‌ها: {currentWorkspace.name}</h1>
          <p className="text-body-sm text-pretty text-text-subtle">هر چه از حقیقت‌هایت برای جای دیگری ساختی یا فرستادی، با ردپایش اینجا می‌ماند؛ اگر حقیقتی که در آن بود عوض شود، می‌گوید.</p>
        </div>
        {/* the page's one outward step (the same quiet secondary as on Home); the rest are occasional and stay in «بیشتر» */}
        <div className="flex flex-wrap items-center gap-inline-sm">
          {live.length > 0 && requestButton}
          <Menu
            label="بیشتر"
            align="end"
            trigger={<IconButton icon="Ellipsis" label="بیشتر دربارهٔ خروجی‌ها" variant="secondary" />}
            items={[
              { label: 'وارد کردن پاسخ ابزار دیگر', icon: 'Upload', onSelect: () => setIsImportOpen(true) },
              { label: 'بسته‌های دانش', icon: 'Package', onSelect: () => setIsPacksOpen(true) },
              { divider: true },
              ...(live.length > 0 ? [{ label: 'خروجی گرفتن JSON', icon: 'Download' as const, onSelect: exportJson }] : []),
              { label: 'خروجی‌های بایگانی‌شده', icon: 'Archive', onSelect: () => setArchiveOpen(true) },
            ]}
          />
        </div>
      </div>
      <PageSuspense><AssetLibrary
        focus={focusAsset}
        currentWorkspace={currentWorkspace}
        deliverables={deliverables}
        allContextObjects={workspaceContexts}
        stale={stale}
        changes={data.changes}
        onArchive={handleArchiveDeliverable}
        onDelete={handleDeleteDeliverable}
        onOpenContextModal={(obj) => openContext(obj)}
        onExtractKnowledge={handleExtractFromAsset}
        extractingId={extractingAssetId}
        onRerequest={(d) => request(d)}
        missingOf={(d) => missing.get(d.workstreamId) ?? []}
        emptyAction={requestButton}
        // Mabda's own rebuild runs in the (frozen) studio; it is only offered when MABDA_MANAGED_AI is on (ContextReplayCard)
        onRebuild={(del) => {
          setSelectedSpecId(del.workstreamId);
          setPendingRebuild(del);
          setActiveTab('workstreams');
        }}
      /></PageSuspense>
    </div>
  );
}
