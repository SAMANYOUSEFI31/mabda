/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of knowledge: detail, compare, options, effect, reader, batch, memory import, archive. Each lazy dialog loads the first time it is opened. */

import { defaultNodeId } from '../../core/nodeTree';
import { convertedTo } from '../../core/thinkingMarkers';
import { dataApi } from '../../services/dataApi';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ArchiveDialog = lazyNamed(() => import('../../components/knowledge/ArchiveDialog'), 'ArchiveDialog');
const ContextDetailModal = lazyNamed(() => import('../../components/knowledge/ContextDetailModal'), 'ContextDetailModal');
const DecisionOptionsDialog = lazyNamed(() => import('../../components/knowledge/DecisionOptionsDialog'), 'DecisionOptionsDialog');
const KnowledgeBatchDialog = lazyNamed(() => import('../../components/knowledge/KnowledgeBatchDialog'), 'KnowledgeBatchDialog');
const MemoryImportDialog = lazyNamed(() => import('../../components/knowledge/MemoryImportDialog'), 'MemoryImportDialog');
const NodeEffectDialog = lazyNamed(() => import('../../components/knowledge/NodeEffectDialog'), 'NodeEffectDialog');
const NodeReaderDialog = lazyNamed(() => import('../../components/knowledge/NodeReaderDialog'), 'NodeReaderDialog');
const TruthCompareDialog = lazyNamed(() => import('../../components/knowledge/TruthCompareDialog'), 'TruthCompareDialog');

export type KnowledgeDialogsProps = Pick<ReadyScope, 'archiveOpen' | 'attempt' | 'compare' | 'currentWorkspace' | 'currentWorkspaceId' | 'data' | 'deliverables' | 'effectNodeId' | 'handleAcceptReview' | 'handleApproveDraft' | 'handleArchiveContext' | 'handleChooseOption' | 'handlePatchObject' | 'handleProposeBatch' | 'handleRejectDraft' | 'handleSaveContextObject' | 'handleSetDependencies' | 'handleSupersedeContext' | 'handleUpdateNote' | 'isBatchOpen' | 'isContextModalOpen' | 'isMemoryOpen' | 'metrics' | 'modalDefaultNodeId' | 'nodes' | 'openContext' | 'openThinkingSpace' | 'optionsItem' | 'optionsNote' | 'patch' | 'readNodeId' | 'reload' | 'reviewNeeds' | 'selectedContextObject' | 'setActiveTab' | 'setAiRequest' | 'setArchiveOpen' | 'setCompare' | 'setEffectNodeId' | 'setIsBatchOpen' | 'setIsContextModalOpen' | 'setIsMemoryOpen' | 'setOptionsItemKey' | 'setReadNodeId' | 'setThoughtDialog' | 'setWs' | 'thinking' | 'toast' | 'wid' | 'workspaceContexts' | 'workspaces'>;

export function KnowledgeDialogs({ archiveOpen, attempt, compare, currentWorkspace, currentWorkspaceId, data, deliverables, effectNodeId, handleAcceptReview, handleApproveDraft, handleArchiveContext, handleChooseOption, handlePatchObject, handleProposeBatch, handleRejectDraft, handleSaveContextObject, handleSetDependencies, handleSupersedeContext, handleUpdateNote, isBatchOpen, isContextModalOpen, isMemoryOpen, metrics, modalDefaultNodeId, nodes, openContext, openThinkingSpace, optionsItem, optionsNote, patch, readNodeId, reload, reviewNeeds, selectedContextObject, setActiveTab, setAiRequest, setArchiveOpen, setCompare, setEffectNodeId, setIsBatchOpen, setIsContextModalOpen, setIsMemoryOpen, setOptionsItemKey, setReadNodeId, setThoughtDialog, setWs, thinking, toast, wid, workspaceContexts, workspaces }: KnowledgeDialogsProps) {
  return (
    <>
    <Deferred when={archiveOpen}><ArchiveDialog open={archiveOpen} workspaceId={wid} nodes={nodes} workspaces={workspaces} currentWorkspaceId={wid} onClose={() => setArchiveOpen(false)} onChanged={() => void reload(wid)} onWorkspacesChange={setWs} /></Deferred>
    <Deferred when={isContextModalOpen}><ContextDetailModal
      isOpen={isContextModalOpen}
      object={selectedContextObject}
      onClose={() => setIsContextModalOpen(false)}
      onSave={handleSaveContextObject}
      onApproveDraft={handleApproveDraft}
      onRejectDraft={handleRejectDraft}
      onSupersede={handleSupersedeContext}
      onArchive={handleArchiveContext}
      nodes={nodes}
      workspaceId={currentWorkspace.id}
      defaultNodeId={modalDefaultNodeId}
      allObjects={workspaceContexts}
      onOpenBatch={() => setIsBatchOpen(true)}
      thoughts={thinking.filter((t) => !convertedTo(t, workspaceContexts))}
      onOpenThinking={() => { setIsContextModalOpen(false); openThinkingSpace(); }}
      onThinkAbout={(object) => {
        setIsContextModalOpen(false);
        setThoughtDialog({ nodeId: object.nodeId, initialKind: 'question', initialAbout: [{ kind: 'object', id: object.id, label: object.title }] });
      }}
      metrics={metrics}
      relationships={data?.relationships ?? []}
      onSetDependencies={handleSetDependencies}
      reviewNeed={selectedContextObject ? reviewNeeds.get(selectedContextObject.id) : undefined}
      titleOf={(id) => workspaceContexts.find((o) => o.id === id)?.title ?? id}
      onAcceptReview={handleAcceptReview}
      deliverables={deliverables}
      notes={data?.notes ?? []}
      onOpenNote={(_id, nodeId) => { setIsContextModalOpen(false); openThinkingSpace(nodeId); }}
      onOpenAssets={() => { setIsContextModalOpen(false); setActiveTab('assets'); }}
      onOpenRelated={(o) => openContext(o)}
      onPatchObject={handlePatchObject}
    /></Deferred>
    <Deferred when={!!compare}><TruthCompareDialog
      open={!!compare} onClose={() => setCompare(null)} mode={compare?.mode} scopeNodeId={compare?.scopeNodeId}
      objects={data?.objects ?? []} changes={data?.changes ?? []} nodes={nodes} deliverables={deliverables}
      onOpenObject={(o) => openContext(o)} onOpenAssets={() => setActiveTab('assets')}
    /></Deferred>
    <Deferred when={!!optionsItem}><DecisionOptionsDialog
      open={!!optionsItem} onClose={() => setOptionsItemKey(null)} item={optionsItem} noteContent={optionsNote?.content ?? ''}
      objects={workspaceContexts} nodes={nodes} relationships={data?.relationships ?? []}
      onChangeNote={async (content) => { if (optionsNote) await handleUpdateNote(optionsNote.id, content); }}
      onChoose={handleChooseOption}
      onAskAi={(text) => { setOptionsItemKey(null); setAiRequest({ scopeNodeId: optionsItem?.nodeId ?? '', kind: 'decision', request: text }); }}
    /></Deferred>
    <Deferred when={!!effectNodeId}><NodeEffectDialog
      nodeId={effectNodeId}
      nodes={nodes}
      objects={workspaceContexts}
      relationships={data?.relationships ?? []}
      onClose={() => setEffectNodeId(null)}
      onOverride={async (byId, targetId, reason) => {
        const r = await dataApi.setOverride(wid, byId, targetId, reason);
        patch((d) => ({ ...d, relationships: r.relationships, changes: r.changes }));
        toast.show({ intent: 'success', message: 'کنار گذاشته شد؛ برای این گره و زیرشاخه‌هایش دیگر اثر ندارد.' });
      }}
      onRemoveOverride={async (byId, targetId) => {
        const r = await attempt(() => dataApi.removeOverride(wid, byId, targetId));
        if (r) patch((d) => ({ ...d, relationships: r.relationships, changes: r.changes }));
      }}
      onAddToNode={(nodeId) => { setEffectNodeId(null); openContext(null, nodeId); }}
      onOpenObject={(o) => { setEffectNodeId(null); openContext(o); }}
    /></Deferred>
    <Deferred when={!!readNodeId}><NodeReaderDialog nodeId={readNodeId} nodes={nodes} objects={workspaceContexts} relationships={data?.relationships ?? []} onClose={() => setReadNodeId(null)} /></Deferred>
    <Deferred when={isBatchOpen}><KnowledgeBatchDialog open={isBatchOpen} onClose={() => setIsBatchOpen(false)} nodes={nodes} onPropose={handleProposeBatch} /></Deferred>
    <Deferred when={isMemoryOpen}><MemoryImportDialog open={isMemoryOpen} workspaceId={wid} onClose={() => setIsMemoryOpen(false)} onDocumentImported={() => void reload(wid)} onImported={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))} /></Deferred>
    </>
  );
}
