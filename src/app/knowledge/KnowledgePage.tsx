/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Source of truth («منبع»): the structure, the table and the map of the knowledge. */

import { ContextTreeDocView } from '../../components/knowledge/ContextTreeDocView';
import { effectiveObjects } from '../../core/effectiveContext';
import { dataApi } from '../../services/dataApi';
import { Button, EmptyState, IconButton, Menu, SegmentedControl, formatNumber } from '../../ui';
import { requestAdd } from '../../core/addRequest';
import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ContextTableView = lazyNamed(() => import('../../components/knowledge/ContextTableView'), 'ContextTableView');
const DocWorkspace = lazyNamed(() => import('../../components/knowledge/DocWorkspace'), 'DocWorkspace');
const FilesPanel = lazyNamed(() => import('../../components/files/FilesPanel'), 'FilesPanel');

export type KnowledgePageProps = Pick<ReadyScope, 'approvals' | 'askDeleteNote' | 'contextViewMode' | 'contradictions' | 'currentWorkspace' | 'data' | 'extractingNoteId' | 'focusNodeId' | 'focusNotes' | 'goFocus' | 'handleAddNote' | 'handleDeleteFile' | 'handleDeleteSamples' | 'handleMoveFile' | 'handleExtractNote' | 'handleProcessFile' | 'handleSplitNote' | 'handleUpdateNote' | 'handleUploadFile' | 'nodeOp' | 'nodes' | 'openContext' | 'openCounts' | 'openThinkingSpace' | 'quota' | 'renderCanvas' | 'reviewIdSet' | 'setAiRequest' | 'setArchiveOpen' | 'setContextViewMode' | 'setEffectNodeId' | 'setIsPacksOpen' | 'setIsStarterOpen' | 'setNodeDialog' | 'setReadNodeId' | 'setTemplateDraft' | 'setThoughtDialog' | 'setThreadNodeId' | 'toast' | 'vf' | 'wid' | 'workspaceContexts'>;

export function KnowledgePage({ approvals, askDeleteNote, contextViewMode, contradictions, currentWorkspace, data, extractingNoteId, focusNodeId, focusNotes, goFocus, handleAddNote, handleDeleteFile, handleDeleteSamples, handleMoveFile, handleExtractNote, handleProcessFile, handleSplitNote, handleUpdateNote, handleUploadFile, nodeOp, nodes, openContext, openCounts, openThinkingSpace, quota, renderCanvas, reviewIdSet, setAiRequest, setArchiveOpen, setContextViewMode, setEffectNodeId, setIsPacksOpen, setIsStarterOpen, setNodeDialog, setReadNodeId, setTemplateDraft, setThoughtDialog, setThreadNodeId, toast, vf, wid, workspaceContexts }: KnowledgePageProps) {
  return (
        <div className="space-y-stack-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-inline-lg">
            <div>
              <h1 className="text-heading-md font-bold text-text-default">
                حقیقت: {currentWorkspace.name}
              </h1>
              <p className="text-body-sm text-text-subtle mt-stack-xs">
                «مبدأ منبع حقیقت توست، برای کار، پروژه و زندگی. هر کار از آن شروع می‌شود و هر خروجی به آن برمی‌گردد.»
              </p>
            </div>

            {/* patterns.md «نماها و «…»»: the four views are one choice, all visible. The page's occasional tasks (a file, the files, the
                archive) sit at the TOP under «⋯», so they never wait behind every section (docs/ux/decisions.md §۳) */}
            <div className="flex flex-wrap items-center gap-inline-sm max-md:w-full">
              {vf.packs && <Button variant="secondary" iconStart="Package" onClick={() => setIsPacksOpen(true)}>بسته‌های دانش</Button>}
              <Menu
                label="کارهای دیگر حقیقت"
                align="end"
                trigger={<IconButton icon="Ellipsis" label="کارهای دیگر حقیقت" variant="secondary" />}
                items={[
                  { label: 'افزودن فایل', icon: 'Upload', onSelect: () => requestAdd({ kind: 'file', nodeId: focusNodeId ?? undefined, scoped: true }) },
                  ...(data.files.length ? [{ label: `فایل‌ها (${formatNumber(data.files.length)})`, icon: 'FileText' as const, onSelect: () => document.getElementById('source-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }] : []),
                  { divider: true },
                  { label: 'بایگانی و حذف‌های اخیر', icon: 'Archive', onSelect: () => setArchiveOpen(true) },
                ]}
              />
              <SegmentedControl
                label="نمای حقیقت"
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
              onOpenSuggestions={() => openThinkingSpace()}
            /></PageSuspense>
          ) : contextViewMode === 'doc' ? (
            <ContextTreeDocView
              objects={workspaceContexts}
              conflicts={contradictions}
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
              conflicts={contradictions}
              nodes={nodes}
              onSelectObject={(obj) => openContext(obj)}
              samples={data.samples ?? []}
            /></PageSuspense>
          )}

          {/* the files are reference material, like attachments at the end of a document: shown at the end once there is one;
              adding one is under «⋯» above and in each section's «⋯» */}
          {data.files.length > 0 && <div id="source-files" style={{ scrollMarginTop: 80 }}><PageSuspense><FilesPanel
            files={data.files}
            nodes={nodes}
            quota={quota}
            onUpload={handleUploadFile}
            onProcess={handleProcessFile}
            onDelete={handleDeleteFile}
            onMove={handleMoveFile}
          /></PageSuspense></div>}
        </div>
  );
}
