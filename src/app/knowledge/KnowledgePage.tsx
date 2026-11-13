/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Source of truth («منبع»): the structure, the table and the map of the knowledge. */

import { ContextTreeDocView } from '../../components/knowledge/ContextTreeDocView';
import { effectiveObjects } from '../../core/effectiveContext';
import { dataApi } from '../../services/dataApi';
import { Button, EmptyState, SegmentedControl } from '../../ui';
import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ContextTableView = lazyNamed(() => import('../../components/knowledge/ContextTableView'), 'ContextTableView');
const DocWorkspace = lazyNamed(() => import('../../components/knowledge/DocWorkspace'), 'DocWorkspace');
const FilesPanel = lazyNamed(() => import('../../components/files/FilesPanel'), 'FilesPanel');

export type KnowledgePageProps = Pick<ReadyScope, 'approvals' | 'askDeleteNote' | 'contextViewMode' | 'currentWorkspace' | 'data' | 'extractingNoteId' | 'focusNodeId' | 'focusNotes' | 'goFocus' | 'handleAddNote' | 'handleDeleteFile' | 'handleDeleteSamples' | 'handleExtractNote' | 'handleProcessFile' | 'handleSplitNote' | 'handleUpdateNote' | 'handleUploadFile' | 'nodeOp' | 'nodes' | 'openContext' | 'openCounts' | 'openThinkingSpace' | 'quota' | 'renderCanvas' | 'reviewIdSet' | 'setAiRequest' | 'setArchiveOpen' | 'setContextViewMode' | 'setEffectNodeId' | 'setIsPacksOpen' | 'setIsStarterOpen' | 'setNodeDialog' | 'setReadNodeId' | 'setTemplateDraft' | 'setThoughtDialog' | 'setThreadNodeId' | 'toast' | 'vf' | 'wid' | 'workspaceContexts'>;

export function KnowledgePage({ approvals, askDeleteNote, contextViewMode, currentWorkspace, data, extractingNoteId, focusNodeId, focusNotes, goFocus, handleAddNote, handleDeleteFile, handleDeleteSamples, handleExtractNote, handleProcessFile, handleSplitNote, handleUpdateNote, handleUploadFile, nodeOp, nodes, openContext, openCounts, openThinkingSpace, quota, renderCanvas, reviewIdSet, setAiRequest, setArchiveOpen, setContextViewMode, setEffectNodeId, setIsPacksOpen, setIsStarterOpen, setNodeDialog, setReadNodeId, setTemplateDraft, setThoughtDialog, setThreadNodeId, toast, vf, wid, workspaceContexts }: KnowledgePageProps) {
  return (
        <div className="space-y-stack-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-inline-lg">
            <div>
              <h1 className="text-heading-md font-bold text-text-default">
                منبع حقیقت: {currentWorkspace.name}
              </h1>
              <p className="text-body-sm text-text-subtle mt-stack-xs">
                «مبدأ منبع حقیقت توست، برای کار، پروژه و زندگی. هر کار از آن شروع می‌شود و هر خروجی به آن برمی‌گردد.»
              </p>
            </div>

            {/* patterns.md «نماها و «…»»: the four views are one choice, all visible; «افزودن» is the app's (top bar, phone bar),
                never repeated by a page; the archive is a place, at the end of the page */}
            <div className="flex flex-wrap items-center gap-inline-sm max-md:w-full">
              {vf.packs && <Button variant="secondary" iconStart="Package" onClick={() => setIsPacksOpen(true)}>بسته‌های دانش</Button>}
              <SegmentedControl
                label="نمای منبع حقیقت"
                fullWidth="phone"
                value={contextViewMode}
                onChange={(id) => setContextViewMode(id as 'doc' | 'read' | 'table' | 'canvas')}
                items={[
                  { id: 'doc', label: 'ساختار', icon: 'FolderTree' },
                  { id: 'canvas', label: 'نمای کلی', icon: 'Workflow' },
                  { id: 'read', label: 'سند', icon: 'BookOpen' },
                  { id: 'table', label: 'جدول', icon: 'Table2' },
                ]}
              />
            </div>
          </div>

          <div id="context-view" style={{ scrollMarginTop: 80 }} />
          {contextViewMode === 'read' ? (
            <PageSuspense><DocWorkspace
              nodes={nodes}
              objects={workspaceContexts}
              relationships={data.relationships}
              approvals={approvals}
              fileName={currentWorkspace.name}
              empty={<EmptyState title="هنوز دانشی ثبت نشده است" />}
            /></PageSuspense>
          ) : contextViewMode === 'doc' ? (
            <ContextTreeDocView
              objects={workspaceContexts}
              relationships={data.relationships ?? []}
              staleIds={reviewIdSet}
              openCounts={openCounts}
              focusId={focusNodeId}
              onFocus={goFocus}
              nodes={nodes}
              notes={data.notes}
              files={data.files}
              extractingNoteId={extractingNoteId}
              onSelectObject={(obj) => openContext(obj)}
              onAddNewToNode={(nodeId) => openContext(null, nodeId)}
              onNodeAction={setNodeDialog}
              onChatWithNode={(nodeId) => setAiRequest({ scopeNodeId: nodeId })}
              onReadNode={setReadNodeId}
              onShowEffect={setEffectNodeId}
              effectCount={(id) => effectiveObjects(id, workspaceContexts, nodes, data.relationships ?? [], new Date()).length}
              openCount={(id) => openCounts.get(id) ?? 0}
              onOpenThinking={(id) => openThinkingSpace(id)}
              onNewThought={(id) => setThoughtDialog({ nodeId: id })}
              onSplitNote={handleSplitNote}
              samples={data.samples ?? []}
              onDeleteSamples={handleDeleteSamples}
              onSaveAsTemplate={(nodeId) => setTemplateDraft({ kind: 'node', sourceId: nodeId, name: nodes.find((n) => n.id === nodeId)?.label ?? '' })}
              onOpenStarters={() => setIsStarterOpen(true)}
              onOpenThread={setThreadNodeId}
              onOpenAiRequest={(nodeId) => setAiRequest({ scopeNodeId: nodeId })}
              openNotesFor={focusNotes}
              onReorderNode={async (nodeId, index) => { await nodeOp(() => dataApi.moveNode(wid, nodeId, nodes.find((n) => n.id === nodeId)?.parentId ?? '', index)); }}
              onUploadFile={async (file, nodeId) => { const r = await handleUploadFile(file, nodeId); if (r) toast.show({ intent: 'success', message: 'فایل اضافه شد؛ برای استخراج دانش، در بخش «فایل‌ها» پردازشش کن.' }); }}
              onAddNote={handleAddNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={askDeleteNote}
              onExtractNote={handleExtractNote}
            />
          ) : contextViewMode === 'canvas' ? (
            renderCanvas('truth')
          ) : (
            <PageSuspense><ContextTableView
              objects={workspaceContexts}
              nodes={nodes}
              onSelectObject={(obj) => openContext(obj)}
              samples={data.samples ?? []}
            /></PageSuspense>
          )}

          <PageSuspense><FilesPanel
            files={data.files}
            nodes={nodes}
            quota={quota}
            credits={currentWorkspace.creditsRemaining}
            onUpload={handleUploadFile}
            onProcess={handleProcessFile}
            onDelete={handleDeleteFile}
          /></PageSuspense>
          <div className="flex justify-start border-t border-border-subtle pt-inset-md">
            <Button variant="ghost" iconStart="Archive" onClick={() => setArchiveOpen(true)}>بایگانی و حذف‌های اخیر</Button>
          </div>
        </div>
  );
}
