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
import { Button, EmptyState, IconButton, Menu, useToast } from '../../ui';
import { useAiStatus } from '../../services/aiStatus';
import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const AssetLibrary = lazyNamed(() => import('../../components/outputs/AssetLibrary'), 'AssetLibrary');

export type AssetsPageProps = Pick<ReadyScope, 'currentWorkspace' | 'data' | 'deliverables' | 'extractingAssetId' | 'focusAsset' | 'handleArchiveDeliverable' | 'handleDeleteDeliverable' | 'handleExtractFromAsset' | 'openContext' | 'openSpecEditor' | 'setActiveTab' | 'setAiRequest' | 'setArchiveOpen' | 'setIsImportOpen' | 'setIsPacksOpen' | 'setIsSpecLibraryOpen' | 'setPendingRebuild' | 'setSelectedSpecId' | 'specs' | 'stale' | 'workspaceContexts'>;

/** the request an output came from, to ask again from today's truth (a pasted answer keeps its request as its source label) */
const requestOf = (d: GeneratedDeliverable): string => {
  const label = d.source?.label?.trim();
  return label && label !== 'نمونهٔ دستی' ? label : d.title;
};

export function AssetsPage({ currentWorkspace, data, deliverables, extractingAssetId, focusAsset, handleArchiveDeliverable, handleDeleteDeliverable, handleExtractFromAsset, openContext, openSpecEditor, setActiveTab, setAiRequest, setArchiveOpen, setIsImportOpen, setIsPacksOpen, setIsSpecLibraryOpen, setPendingRebuild, setSelectedSpecId, specs, stale, workspaceContexts }: AssetsPageProps) {
  const toast = useToast();
  const { managedEnabled } = useAiStatus();
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
        <div className="flex shrink-0 items-center gap-inline-sm">
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
      {managedEnabled && <FrozenBuild specs={specs} openSpecEditor={openSpecEditor} setIsSpecLibraryOpen={setIsSpecLibraryOpen} setSelectedSpecId={setSelectedSpecId} setActiveTab={setActiveTab} />}
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

/**
 * Mabda's own generation (managed AI, frozen behind MABDA_MANAGED_AI, off by default): its entry stays exactly as it was so the
 * frozen path keeps working, and it neither grows nor shows when the flag is off (docs/product-scope.md, docs/later.md).
 */
function FrozenBuild({ specs, openSpecEditor, setIsSpecLibraryOpen, setSelectedSpecId, setActiveTab }: Pick<AssetsPageProps, 'specs' | 'openSpecEditor' | 'setIsSpecLibraryOpen' | 'setSelectedSpecId' | 'setActiveTab'>) {
  return (
    <section className="flex flex-col gap-stack-md" aria-label="بساز" data-testid="outputs-build">
      <h2 className="heading-sm text-text-default">بساز</h2>
      {specs.length === 0 ? (
        <EmptyState title="هنوز چیزی برای ساختن انتخاب نکرده‌ای" description="از کتابخانه یکی را بردار یا خودت یکی بنویس." action={<Button variant="secondary" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button>} />
      ) : (
        <ul className="flex flex-col" aria-label="جریان‌های کار">
          {specs.map((sp) => (
            <li key={sp.id} className="flex flex-col gap-stack-sm border-b border-border-subtle py-inset-md sm:flex-row sm:items-center sm:justify-between sm:gap-inline-lg">
              <div className="flex min-w-space-0 flex-col gap-stack-xs">
                <span className="headline text-text-default">{sp.title}</span>
                <p className="body-sm text-pretty text-text-subtle">{sp.description}</p>
              </div>
              <div className="shrink-0"><Button size="sm" variant="secondary" iconStart="Package" data-testid={`build-${sp.id}`} aria-label={`بساز: ${sp.title}`} onClick={() => { setSelectedSpecId(sp.id); setActiveTab('workstreams'); }}>بساز</Button></div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-inline-sm">
        <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => openSpecEditor()}>جریان کار تازه</Button>
        {specs.length > 0 && <Button size="sm" variant="ghost" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button>}
      </div>
    </section>
  );
}
