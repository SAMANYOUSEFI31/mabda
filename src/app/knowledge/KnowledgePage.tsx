/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Source of truth («منبع»): the structure, the table and the map of the knowledge. */

import { ContextTreeDocView } from '../../components/knowledge/ContextTreeDocView';
import { effectiveObjects } from '../../core/effectiveContext';
import { dataApi } from '../../services/dataApi';
import { useState } from 'react';
import { Button, Dialog, EmptyState, PageHead, SegmentedControl, formatNumber } from '../../ui';
import type { MenuItem } from '../../ui';
import { requestAdd } from '../../core/addRequest';
import { PageSuspense, lazyNamed } from '../lazy';
import { switchPage, useViewAxis, viewEnterClass } from '../../ui/pageTransition';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ContextTableView = lazyNamed(() => import('../../components/knowledge/ContextTableView'), 'ContextTableView', { warm: true });
const DocWorkspace = lazyNamed(() => import('../../components/knowledge/DocWorkspace'), 'DocWorkspace', { warm: true });
const FilesPanel = lazyNamed(() => import('../../components/files/FilesPanel'), 'FilesPanel');

const VIEW_ORDER = ['doc', 'canvas', 'read', 'table'] as const;

export type KnowledgePageProps = Pick<ReadyScope, 'approvals' | 'askDeleteNote' | 'contextViewMode' | 'contradictions' | 'currentWorkspace' | 'data' | 'extractingNoteId' | 'focusNodeId' | 'focusNotes' | 'goFocus' | 'handleAddNote' | 'handleDeleteFile' | 'handleDeleteSamples' | 'handleMoveFile' | 'handleExtractNote' | 'handleProcessFile' | 'handleSplitNote' | 'handleUpdateNote' | 'handleUploadFile' | 'nodeOp' | 'nodes' | 'openContext' | 'openCounts' | 'openThinkingSpace' | 'quota' | 'renderCanvas' | 'reviewIdSet' | 'setAiRequest' | 'setArchiveOpen' | 'setContextViewMode' | 'setEffectNodeId' | 'setIsPacksOpen' | 'setIsStarterOpen' | 'setNodeDialog' | 'setReadNodeId' | 'setTemplateDraft' | 'setThoughtDialog' | 'setThreadNodeId' | 'toast' | 'vf' | 'wid' | 'workspaceContexts'>;

export function KnowledgePage({ approvals, askDeleteNote, contextViewMode, contradictions, currentWorkspace, data, extractingNoteId, focusNodeId, focusNotes, goFocus, handleAddNote, handleDeleteFile, handleDeleteSamples, handleMoveFile, handleExtractNote, handleProcessFile, handleSplitNote, handleUpdateNote, handleUploadFile, nodeOp, nodes, openContext, openCounts, openThinkingSpace, quota, renderCanvas, reviewIdSet, setAiRequest, setArchiveOpen, setContextViewMode, setEffectNodeId, setIsPacksOpen, setIsStarterOpen, setNodeDialog, setReadNodeId, setTemplateDraft, setThoughtDialog, setThreadNodeId, toast, vf, wid, workspaceContexts }: KnowledgePageProps) {
  // the files are an occasional task (§۵۴ ۱۴): a side panel from «⋯ › فایل‌ها», not a tail under every section
  const [filesOpen, setFilesOpen] = useState(false);
  // the four views sit side by side in the switch: the new one comes from the side of its key (pageTransition.ts)
  const axis = useViewAxis(contextViewMode, VIEW_ORDER);
  // «گذشته‌ها» is a view option (what to show, how much), used now and then: in «⋯» with its count, not a switch on a row of the
  // page's own (root-cause audit, the role table: «گزینهٔ نمایش» goes in the view's menu)
  const [showPast, setShowPast] = useState(false);
  const pastCount = workspaceContexts.filter((o) => o.status === 'Superseded').length;
  const moreItems: MenuItem[] = [
                  ...(contextViewMode === 'doc' && pastCount > 0 ? [{ label: showPast ? `پنهان کردن گذشته‌ها (${formatNumber(pastCount)})` : `نمایش گذشته‌ها (${formatNumber(pastCount)})`, icon: 'Replace' as const, onSelect: () => setShowPast((v) => !v) }, { divider: true }] : []),
                  ...(vf.packs ? [{ label: 'بسته‌های دانش', icon: 'Bookmark' as const, onSelect: () => setIsPacksOpen(true) }, { divider: true }] : []),
                  { label: 'افزودن فایل', icon: 'Upload', onSelect: () => requestAdd({ kind: 'file', nodeId: focusNodeId ?? undefined, scoped: true }) },
                  ...(data.files.length ? [{ label: `فایل‌ها (${formatNumber(data.files.length)})`, icon: 'Paperclip' as const, onSelect: () => setFilesOpen(true) }] : []),
                  // the start skeletons and her own saved templates (§۵۳ ۱۱): «ذخیره به‌عنوان قالب» in each section's ⋯ had no way back
                  { label: 'اسکلت شروع و قالب‌ها', icon: 'LayoutTemplate', onSelect: () => setIsStarterOpen(true) },
                  { divider: true },
                  { label: 'بایگانی و حذف‌های اخیر', icon: 'Archive', onSelect: () => setArchiveOpen(true) },
                ];
  return (
        <div className="space-y-stack-lg">
          {/* the page frame every page shares (decisions.md §۵۳ ۹; only «نمای کلی», a canvas, takes the whole main area); the four views are one choice, all visible (patterns.md «نماها»);
              the page's occasional tasks under «⋯», at the end of the title's row on a phone (PageHead) */}
          <div className="mb-page-frame"><PageHead
            title="حقیقت" context={currentWorkspace.name}
            info={{ term: 'حقیقت', text: 'مبدأ منبع حقیقت توست، برای کار، پروژه و زندگی. هر کار از آن شروع می‌شود و هر خروجی به آن برمی‌گردد. هر بخش شاخه‌ای از درخت است با حقیقت‌هایش؛ برای خواندن پیوسته، «سند» را بزن. ◆ حقیقت: تأییدشده و منبع هر خروجی. ◇ پیشنهاد: هنوز تأیید نشده و به هیچ خروجی نمی‌رود. نشانهٔ دوتایی زرد یعنی قدیمی: چیزی که به آن تکیه دارد عوض شده و پیش از استفاده باید نگاهش کنی.' }}
            // the structure's tally («۴۳ حقیقت · ۱ قدیمی»): ContextTreeDocView puts it here, by the title (its numbers are the view's)
            tools={contextViewMode === 'doc' ? <span id="truth-tally-slot" className="contents" /> : undefined}
            moreLabel="کارهای دیگر حقیقت"
            more={moreItems}
            views={<SegmentedControl
              label="نمای حقیقت"
              fullWidth="phone"
              value={contextViewMode}
              onChange={(id) => switchPage(() => setContextViewMode(id as 'doc' | 'read' | 'table' | 'canvas'))}
              items={[
                { id: 'doc', label: 'ساختار', icon: 'FolderTree' },
                { id: 'canvas', label: 'نمای کلی', icon: 'Workflow' },
                { id: 'read', label: 'سند', icon: 'BookOpen' },
                { id: 'table', label: 'جدول', icon: 'Table2' },
              ]}
            />}
          /></div>

          {/* keyed by the view: a new view fades in place like a new page (taste-review.md «تعویض نما»), built in a transition */}
          <div key={contextViewMode} className={viewEnterClass} data-axis={axis}>
          {contextViewMode === 'canvas' ? renderCanvas('truth') : <div className="mb-page-frame space-y-stack-lg">
          {contextViewMode === 'read' ? (
            <PageSuspense><DocWorkspace
              nodes={nodes}
              objects={workspaceContexts}
              relationships={data.relationships}
              approvals={approvals}
              fileName={currentWorkspace.name}
              empty={<EmptyState title="هنوز دانشی ثبت نشده است" />}
              onOpenSuggestions={() => openThinkingSpace()}
              focusNodeId={focusNodeId}
            /></PageSuspense>
          ) : contextViewMode === 'doc' ? (
            <ContextTreeDocView
              showPast={showPast}
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
              onOpenThread={setThreadNodeId}
              onOpenAiRequest={(nodeId) => setAiRequest({ scopeNodeId: nodeId })}
              openNotesFor={focusNotes}
              onReorderNode={async (nodeId, index) => { await nodeOp(() => dataApi.moveNode(wid, nodeId, nodes.find((n) => n.id === nodeId)?.parentId ?? '', index)); }}
              onUploadFile={async (file, nodeId) => { const r = await handleUploadFile(file, nodeId); if (r) toast.show({ intent: 'success', message: 'فایل اضافه شد؛ برای استخراج دانش، در «⋯ › فایل‌ها» پردازشش کن.', action: { label: 'فایل‌ها', onClick: () => setFilesOpen(true) } }); }}
              onAddNote={handleAddNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={askDeleteNote}
              onExtractNote={handleExtractNote}
            />
          ) : (
            <PageSuspense><ContextTableView
              objects={workspaceContexts}
              conflicts={contradictions}
              nodes={nodes}
              onSelectObject={(obj) => openContext(obj)}
              samples={data.samples ?? []}
              focusNodeId={focusNodeId}
            /></PageSuspense>
          )}

          {/* the files (§۵۴ ۱۴): each section already shows its own files where they belong; the whole list (process, move, delete)
              is an occasional task, so it opens beside the page from «⋯ › فایل‌ها» instead of waiting at the end of a long page */}
          <Dialog open={filesOpen} onClose={() => setFilesOpen(false)} side size="lg" title={`فایل‌ها (${formatNumber(data.files.length)})`} description="فایل‌ها منبع‌اند، نه حقیقت: از هر کدام دانش استخراج کن و پیشنهادها را در «فکر» تأیید کن.">
            {filesOpen && <div id="source-files"><PageSuspense><FilesPanel
            files={data.files}
            nodes={nodes}
            quota={quota}
            onUpload={handleUploadFile}
            onProcess={handleProcessFile}
            onDelete={handleDeleteFile}
            onMove={handleMoveFile}
          /></PageSuspense></div>}
          </Dialog>
          </div>}
          </div>
        </div>
  );
}
