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
import { REQUEST_KINDS } from '../../core/aiRequest';
import type { RequestKind } from '../../core/aiRequest';
import { dataApi } from '../../services/dataApi';
import type { GeneratedDeliverable } from '../../types';
import { Button, EmptyState, IconButton, Menu, useToast } from '../../ui';
import { useAiStatus } from '../../services/aiStatus';
import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const AssetLibrary = lazyNamed(() => import('../../components/outputs/AssetLibrary'), 'AssetLibrary');

export type AssetsPageProps = Pick<ReadyScope, 'currentWorkspace' | 'data' | 'deliverables' | 'extractingAssetId' | 'focusAsset' | 'handleArchiveDeliverable' | 'handleDeleteDeliverable' | 'handleExtractFromAsset' | 'openContext' | 'openSpecEditor' | 'setActiveTab' | 'setAiRequest' | 'setArchiveOpen' | 'setIsImportOpen' | 'setIsPacksOpen' | 'setIsSpecLibraryOpen' | 'setPendingRebuild' | 'setSelectedSpecId' | 'specs' | 'stale' | 'workspaceContexts'>;

/**
 * The request an output came from, when its record does not keep it (older records, samples): the record is named
 * «<kind> — <line>», so the kind comes back as the kind and only the line goes into the line (it used to land in the line whole).
 */
export const requestOf = (d: Pick<GeneratedDeliverable, 'title' | 'source'>): { kind?: RequestKind; request: string } => {
  const label = d.source?.label?.trim();
  if (!label || label === 'نمونهٔ دستی') return { request: d.title };
  for (const k of REQUEST_KINDS) if (label.startsWith(`${k.label} — `)) return { kind: k.kind, request: label.slice(k.label.length + 3).trim() };
  return { request: label };
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
  // «درخواست دوباره»: the same request (kind, line, sections, hand-added items) read from today's truth, all still editable;
  // the record keeps it since migration 33, an older one gives back its kind and line (§۴۹)
  const request = async (d?: GeneratedDeliverable) => {
    if (!d) { setAiRequest({ scopeNodeId: '' }); return; }
    const asked = d.sourcePackId ? await dataApi.getPack(currentWorkspace.id, d.sourcePackId).then((p) => p.request).catch(() => undefined) : undefined;
    if (asked) setAiRequest({ scopeNodeId: '', kind: asked.kind, request: asked.request, scopeNodeIds: asked.scopeNodeIds, withChildren: asked.withChildren, extraIds: asked.extraIds });
    else { const r = requestOf(d); setAiRequest({ scopeNodeId: '', ...(r.kind ? { kind: r.kind } : {}), request: r.request }); }
  };
  const exportJson = () => {
    // a Blob, not a data: address: a space with many long outputs is past what an address can carry (like «دانلود» of the document)
    const url = URL.createObjectURL(new Blob([JSON.stringify(live, null, 2)], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `mabda_outputs_${currentWorkspace.slug}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.show({ intent: 'success', message: 'فایل JSON همهٔ خروجی‌ها دانلود شد.' });
  };
  const requestButton = <Button variant="secondary" iconStart="PackageOpen" onClick={() => void request()}>درخواست برای ابزار دیگر</Button>;
  // the loop has two halves and this page is where both live: send (the request) and bring back (the answer). The answer's way
  // in sat under «⋯», so the path from a request to an output of her own could not be found (decisions.md §۴۹)
  const importButton = <Button variant="secondary" iconStart="Upload" onClick={() => setIsImportOpen(true)}>وارد کردن پاسخ</Button>;
  return (
    <div className="mb-page-frame space-y-stack-lg">
      <div className="mb-page-head">
        <div className="mb-page-head__title flex flex-col gap-stack-xs">
          <h1 className="text-heading-md font-bold text-text-default">خروجی‌ها: {currentWorkspace.name}</h1>
          <p className="text-body-sm text-pretty text-text-subtle">هر چه از حقیقت‌هایت برای جای دیگری ساختی یا فرستادی، با ردپایش اینجا می‌ماند؛ اگر حقیقتی که در آن بود عوض شود، می‌گوید.</p>
        </div>
        {/* the page's one outward step (the same quiet secondary as on Home); the rest are occasional and stay in «بیشتر» */}
        <div className="mb-page-head__actions">
          {live.length > 0 && requestButton}
          {importButton}
          <Menu
            label="بیشتر"
            align="end"
            trigger={<IconButton icon="Ellipsis" label="بیشتر دربارهٔ خروجی‌ها" variant="secondary" />}
            items={[
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
        onRerequest={(d) => void request(d)}
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
