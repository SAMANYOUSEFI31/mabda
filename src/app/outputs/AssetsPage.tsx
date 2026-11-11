/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Outputs → library of built assets. */

import { Button, Card, EmptyState } from '../../ui';
import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';
import { useAiStatus } from '../../services/aiStatus';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const AssetLibrary = lazyNamed(() => import('../../components/outputs/AssetLibrary'), 'AssetLibrary');

export type AssetsPageProps = Pick<ReadyScope, 'currentWorkspace' | 'data' | 'deliverables' | 'extractingAssetId' | 'focusAsset' | 'handleArchiveDeliverable' | 'handleDeleteDeliverable' | 'handleExtractFromAsset' | 'openContext' | 'openSpecEditor' | 'setActiveTab' | 'setArchiveOpen' | 'setIsSpecLibraryOpen' | 'setPendingRebuild' | 'setSelectedSpecId' | 'specs' | 'stale' | 'workspaceContexts'>;

export function AssetsPage({ currentWorkspace, data, deliverables, extractingAssetId, focusAsset, handleArchiveDeliverable, handleDeleteDeliverable, handleExtractFromAsset, openContext, openSpecEditor, setActiveTab, setArchiveOpen, setIsSpecLibraryOpen, setPendingRebuild, setSelectedSpecId, specs, stale, workspaceContexts }: AssetsPageProps) {
  // «بساز» is Mabda's own generation: with MABDA_MANAGED_AI off the entry is the outside route («آماده‌سازی»)
  const { managedEnabled } = useAiStatus();
  const verb = managedEnabled ? 'بساز' : 'آماده‌سازی';
  return (
        <div className="space-y-stack-lg">
          <div>
            <h1 className="text-heading-md font-bold text-text-default">خروجی‌ها: {currentWorkspace.name}</h1>
            <p className="text-body-sm text-text-subtle mt-stack-xs">{managedEnabled ? 'بالا: با چه چیزی می‌سازی. پایین: چه ساخته‌ای و کدام‌ها دیگر به‌روز نیستند.' : 'بالا: برای چه چیزی آماده‌سازی می‌کنی. پایین: چه خروجی‌ای داری و کدام‌ها دیگر به‌روز نیستند.'}</p>
          </div>
          <section className="flex flex-col gap-stack-md" aria-label={verb} data-testid="outputs-build">
            <h2 className="heading-sm text-text-default">{verb}</h2>
            {specs.length === 0 ? (
              <EmptyState icon="Layers" title="این فضا هنوز جریان کاری ندارد" description="از کتابخانه یک جریان آماده بردار یا خودت یکی بساز." action={<Button variant="secondary" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button>} />
            ) : (
              <ul className="grid gap-stack-md sm:grid-cols-2" aria-label="جریان‌های کار">
                {specs.map((sp) => (
                  <li key={sp.id}>
                    <Card padding="lg" className="flex h-full flex-col justify-between gap-stack-sm">
                      <div className="flex flex-col gap-stack-xs">
                        <span className="label-md text-text-default">{sp.title}</span>
                        <p className="body-sm text-text-subtle">{sp.description}</p>
                      </div>
                      <div><Button size="sm" variant="secondary" iconStart="Package" data-testid={`build-${sp.id}`} aria-label={`${verb}: ${sp.title}`} onClick={() => { setSelectedSpecId(sp.id); setActiveTab('workstreams'); }}>{verb}</Button></div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-inline-sm">
              <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => openSpecEditor()}>جریان کار تازه</Button>
              <Button size="sm" variant="ghost" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button>
            </div>
          </section>
        <PageSuspense><AssetLibrary
          focus={focusAsset}
          currentWorkspace={currentWorkspace}
          deliverables={deliverables}
          allContextObjects={workspaceContexts}
          stale={stale}
          changes={data.changes}
          onGoToWorkstreams={() => setActiveTab('workstreams')}
          onArchive={handleArchiveDeliverable}
          onDelete={handleDeleteDeliverable}
          onOpenArchive={() => setArchiveOpen(true)}
          workstreams={specs}
          onOpenContextModal={(obj) => openContext(obj)}
          onExtractKnowledge={handleExtractFromAsset}
          extractingId={extractingAssetId}
          onRebuild={(del) => {
            setSelectedSpecId(del.workstreamId);
            setPendingRebuild(del);
            setActiveTab('workstreams');
          }}
        /></PageSuspense>
        </div>
  );
}
