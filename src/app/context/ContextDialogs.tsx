/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of context: packs, AI request, answer import, the thread of a section. Each lazy dialog loads the first time it is opened. */

import { contextDraftFromBlock } from '../../core/blocks';
import { chatCredits } from '../../core/creditEngine';
import { dataApi } from '../../services/dataApi';
import { ChatSession } from '../../types';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const AiRequestDialog = lazyNamed(() => import('../../components/context/AiRequestDialog'), 'AiRequestDialog');
const ContextPackDialog = lazyNamed(() => import('../../components/context/ContextPackDialog'), 'ContextPackDialog');
const ImportAnswerDialog = lazyNamed(() => import('../../components/context/ImportAnswerDialog'), 'ImportAnswerDialog');
const NodeThreadPanel = lazyNamed(() => import('../../components/context/NodeThreadPanel'), 'NodeThreadPanel');
const SavedPacksDialog = lazyNamed(() => import('../../components/context/SavedPacksDialog'), 'SavedPacksDialog');

export type ContextDialogsProps = Pick<ReadyScope, 'ai' | 'aiRequest' | 'attempt' | 'data' | 'handleDraftFromImport' | 'handleIncrementChatCount' | 'handleProposeFromImport' | 'handleRecordChatUsage' | 'handleSaveAiThought' | 'isImportOpen' | 'isPacksOpen' | 'nodes' | 'openContext' | 'packTarget' | 'patch' | 'persistDeliverable' | 'setAiRequest' | 'setIsImportOpen' | 'setIsPacksOpen' | 'setPackTarget' | 'setThreadNodeId' | 'thinking' | 'threadNodeId' | 'wid' | 'workspaceContexts'>;

export function ContextDialogs({ ai, aiRequest, attempt, data, handleDraftFromImport, handleIncrementChatCount, handleProposeFromImport, handleRecordChatUsage, handleSaveAiThought, isImportOpen, isPacksOpen, nodes, openContext, packTarget, patch, persistDeliverable, setAiRequest, setIsImportOpen, setIsPacksOpen, setPackTarget, setThreadNodeId, thinking, threadNodeId, wid, workspaceContexts }: ContextDialogsProps) {
  return (
    <>
    <Deferred when={isPacksOpen}><SavedPacksDialog open={isPacksOpen} workspaceId={wid} nodes={nodes} objects={workspaceContexts} onClose={() => setIsPacksOpen(false)} onOpenObject={(o) => openContext(o)} /></Deferred>
    <Deferred when={!!aiRequest}><AiRequestDialog
      open={!!aiRequest} workspaceId={wid} nodes={nodes} scopeNodeId={aiRequest?.scopeNodeId} initialKind={aiRequest?.kind} initialRequest={aiRequest?.request} initialThoughtIds={aiRequest?.thoughtIds} thoughts={thinking} onClose={() => setAiRequest(null)} onOpenImport={() => setIsImportOpen(true)}
      sessions={data?.sessions ?? []}
      onSaveSession={(sess: ChatSession) => { void attempt(() => dataApi.saveSession(wid, sess)).then((r) => { if (r) patch((d) => ({ ...d, sessions: d.sessions.some((x) => x.id === sess.id) ? d.sessions.map((x) => (x.id === sess.id ? sess : x)) : [sess, ...d.sessions] })); }); }}
      onAnswered={(res) => { handleIncrementChatCount(); void handleRecordChatUsage(res, ai.managedEnabled ? chatCredits(false) : 0, false); }}
      onAddKnowledge={(b) => openContext(contextDraftFromBlock(b, wid))}
      onSaveAsThought={handleSaveAiThought}
      onOpenObject={(id) => { const o = workspaceContexts.find((x) => x.id === id); if (o) openContext(o); }}
    /></Deferred>
    <Deferred when={!!packTarget}><ContextPackDialog workspaceId={wid} target={packTarget} onClose={() => setPackTarget(null)} onOpenImport={() => setIsImportOpen(true)} /></Deferred>
    <Deferred when={isImportOpen}><ImportAnswerDialog open={isImportOpen} workspaceId={wid} nodes={nodes} objects={workspaceContexts} onClose={() => setIsImportOpen(false)} onProposeContext={handleProposeFromImport} onUpdateDraft={handleDraftFromImport} onSaveAsset={persistDeliverable} /></Deferred>
    <Deferred when={!!threadNodeId}><NodeThreadPanel
      open={!!threadNodeId}
      workspaceId={wid}
      node={nodes.find((n) => n.id === threadNodeId) ?? null}
      onClose={() => setThreadNodeId(null)}
      onProposed={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))}
      onSummary={(note, ledger) => patch((d) => ({ ...d, notes: [note, ...d.notes], ledger }))}
    /></Deferred>
    </>
  );
}
