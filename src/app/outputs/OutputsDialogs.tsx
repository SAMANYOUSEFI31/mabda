/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of outputs: the spec editor and the spec library. Each lazy dialog loads the first time it is opened. */

import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const SpecEditorModal = lazyNamed(() => import('../../components/outputs/SpecEditorModal'), 'SpecEditorModal');
const SpecLibraryDialog = lazyNamed(() => import('../../components/outputs/SpecLibraryDialog'), 'SpecLibraryDialog');

export type OutputsDialogsProps = Pick<ReadyScope, 'addSpec' | 'currentWorkspace' | 'editingSpec' | 'handleApplyTemplate' | 'handleSetLibrarySpecs' | 'isCustomSpecModalOpen' | 'isSpecLibraryOpen' | 'nodes' | 'setActiveTab' | 'setIsCustomSpecModalOpen' | 'setIsPlanModalOpen' | 'setIsSpecLibraryOpen' | 'setSelectedSpecId' | 'specs'>;

export function OutputsDialogs({ addSpec, currentWorkspace, editingSpec, handleApplyTemplate, handleSetLibrarySpecs, isCustomSpecModalOpen, isSpecLibraryOpen, nodes, setActiveTab, setIsCustomSpecModalOpen, setIsPlanModalOpen, setIsSpecLibraryOpen, setSelectedSpecId, specs }: OutputsDialogsProps) {
  return (
    <>
    {currentWorkspace && <Deferred when={isSpecLibraryOpen}><SpecLibraryDialog open={isSpecLibraryOpen} workspace={currentWorkspace} onClose={() => setIsSpecLibraryOpen(false)} onChange={handleSetLibrarySpecs} onApplyTemplate={handleApplyTemplate} nodes={nodes.map((n) => ({ id: n.id, label: n.label }))} /></Deferred>}
    {/* Custom Spec Modal (F8) */}
    <Deferred when={isCustomSpecModalOpen}><SpecEditorModal
      key={editingSpec?.id ?? 'new'}
      isOpen={isCustomSpecModalOpen}
      onClose={() => setIsCustomSpecModalOpen(false)}
      planId={currentWorkspace.planId}
      nodes={nodes}
      specs={specs}
      initial={editingSpec}
      onUpgrade={() => setIsPlanModalOpen(true)}
      onSaveSpec={async (newSpec) => {
        const ok = await addSpec(newSpec);
        if (ok) { setSelectedSpecId(newSpec.id); setActiveTab('workstreams'); }
        return ok;
      }}
    /></Deferred>
    </>
  );
}
