/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Outputs → build: workstreams and the gap engine. */

import { Button, EmptyState } from '../../ui';
import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const WorkstreamStudio = lazyNamed(() => import('../../components/outputs/WorkstreamStudio'), 'WorkstreamStudio');

export type WorkstreamsPageProps = Pick<ReadyScope, 'currentWorkspace' | 'data' | 'deliverables' | 'handleJudge' | 'handleSaveContextObject' | 'handleSaveDeliverable' | 'nodes' | 'openContext' | 'openSpecEditor' | 'pendingRebuild' | 'selectedSpecId' | 'setActiveTab' | 'setIsImportOpen' | 'setIsSpecLibraryOpen' | 'setPackTarget' | 'setPendingRebuild' | 'setSelectedSpecId' | 'setTemplateDraft' | 'specs' | 'stale' | 'workspaceContexts'>;

export function WorkstreamsPage({ currentWorkspace, data, deliverables, handleJudge, handleSaveContextObject, handleSaveDeliverable, nodes, openContext, openSpecEditor, pendingRebuild, selectedSpecId, setActiveTab, setIsImportOpen, setIsSpecLibraryOpen, setPackTarget, setPendingRebuild, setSelectedSpecId, setTemplateDraft, specs, stale, workspaceContexts }: WorkstreamsPageProps) {
  return (
    <>
        {specs.length === 0 && (
          <EmptyState
            icon="Layers"
            title="این فضا هنوز جریان کاری ندارد"
            description="از کتابخانه یک جریان آماده بردار یا خودت یکی بساز."
            action={<div className="flex flex-wrap justify-center gap-inline-md"><Button variant="secondary" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button><Button variant="secondary" iconStart="Plus" onClick={() => openSpecEditor()}>جریان کار تازه</Button></div>}
          />
        )}
        {specs.length > 0 && (
          <Button variant="ghost" size="sm" iconStart="ArrowRight" onClick={() => setActiveTab('assets')}>همهٔ خروجی‌ها</Button>
        )}
        {specs.length > 0 && (
          <PageSuspense><WorkstreamStudio
            currentWorkspace={currentWorkspace}
            allContextObjects={workspaceContexts}
            allDeliverables={deliverables}
            specs={specs}
            stale={stale}
            changes={data.changes}
            nodes={nodes}
            selectedSpecId={selectedSpecId}
            onSelectSpecId={setSelectedSpecId}
            onOpenSpecEditor={openSpecEditor}
            judgments={data.judgments}
            onJudge={handleJudge}
            onSaveTemplate={(spec) => setTemplateDraft({ kind: 'workstream', sourceId: spec.id, name: spec.title })}
            onAddContextObject={handleSaveContextObject}
            onSaveDeliverable={handleSaveDeliverable}
            pendingRebuild={pendingRebuild}
            onPendingRebuildHandled={() => setPendingRebuild(null)}
            onOpenContextModal={(obj) => openContext(obj)}
            onOpenLedger={() => setActiveTab('ledger')}
            onOpenPack={setPackTarget}
            onOpenImport={() => setIsImportOpen(true)}
          /></PageSuspense>
        )}
    </>
  );
}
