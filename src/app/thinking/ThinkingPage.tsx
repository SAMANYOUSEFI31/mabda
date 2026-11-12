/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Thinking: notes and thoughts. */

import { optionsOf } from '../../core/decisionOptions';
import { Button, SegmentedControl } from '../../ui';
import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ThinkingSpace = lazyNamed(() => import('../../components/thinking/ThinkingSpace'), 'ThinkingSpace');

export type ThinkingPageProps = Pick<ReadyScope, 'currentWorkspace' | 'data' | 'focusNodeId' | 'handleAcceptProposal' | 'handleApproveDraft' | 'handleConvertItem' | 'handleDeriveThought' | 'handleRejectDraft' | 'handleRejectProposal' | 'handleReplaceWithProposal' | 'handleReviseThought' | 'handleSynthesizeThought' | 'nodes' | 'openContext' | 'previewTruth' | 'renderCanvas' | 'scopeChip' | 'setCompare' | 'setIsImportOpen' | 'setIsMemoryOpen' | 'setOptionsItemKey' | 'setPackTarget' | 'setSpaceNode' | 'setThinkingView' | 'setThoughtDialog' | 'spaceNode' | 'startSectionFromThought' | 'startThoughtAi' | 'thinking' | 'thinkingView' | 'workspaceContexts'>;

export function ThinkingPage({ currentWorkspace, data, focusNodeId, handleAcceptProposal, handleApproveDraft, handleConvertItem, handleDeriveThought, handleRejectDraft, handleRejectProposal, handleReplaceWithProposal, handleReviseThought, handleSynthesizeThought, nodes, openContext, previewTruth, renderCanvas, scopeChip, setCompare, setIsImportOpen, setIsMemoryOpen, setOptionsItemKey, setPackTarget, setSpaceNode, setThinkingView, setThoughtDialog, spaceNode, startSectionFromThought, startThoughtAi, thinking, thinkingView, workspaceContexts }: ThinkingPageProps) {
  return (
        <div className="space-y-stack-lg">
          <div className="flex flex-col gap-inline-md sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-heading-md font-bold text-text-default">فکر: {currentWorkspace.name}</h1>
              <p className="text-body-sm text-text-subtle mt-stack-xs">هرچه هنوز حقیقت نیست اینجاست: فکر ← پیشنهادی ← تأییدشده. منبع حقیقت تمیز می‌ماند.</p>
            </div>
            <div className="flex flex-wrap items-center gap-inline-sm">
              <SegmentedControl
                label="نمای فکر"
                value={thinkingView}
                onChange={(id) => setThinkingView(id as 'list' | 'canvas')}
                items={[{ id: 'list', label: 'فهرست', icon: 'ListChecks' }, { id: 'canvas', label: 'بوم', icon: 'Workflow' }]}
              />
              {/* adding a thought is the top bar's «افزودن» (and the phone bar's): one way for one thing (patterns.md §۳) */}
            </div>
          </div>
          <div id="thinking-view" />
          {thinkingView === 'canvas' ? renderCanvas('thinking') : (
            <div className="flex flex-col gap-stack-sm">
            {spaceNode === focusNodeId && scopeChip}
            <PageSuspense><ThinkingSpace
        objects={workspaceContexts}
        notes={data.notes}
        nodes={nodes}
        relationships={data.relationships}
        thoughts={thinking}
        nodeId={spaceNode}
        onNodeChange={setSpaceNode}
        onCompareIfApproved={() => setCompare({ mode: 'pending', scopeNodeId: spaceNode })}
        onOptions={(item) => setOptionsItemKey(item.key)}
        optionCount={(item) => optionsOf((data?.notes ?? []).find((n) => n.id === item.noteId)?.content ?? '', item.endLine ?? item.line, workspaceContexts, nodes).length}
        onToKnowledge={handleConvertItem}
        onReviseThought={handleReviseThought}
        onDeriveThought={handleDeriveThought}
        onSynthesizeThought={handleSynthesizeThought}
        onThinkWithAi={startThoughtAi}
        onOpenObject={(o) => openContext(o)}
        onApproveDraft={handleApproveDraft}
        onRejectDraft={handleRejectDraft}
        proposals={{
          onAccept: handleAcceptProposal, onReplace: handleReplaceWithProposal, onEdit: (o) => openContext(o), onReject: handleRejectProposal,
          onOpenImport: () => setIsImportOpen(true), onOpenPack: () => setPackTarget({ title: currentWorkspace.name }), onOpenMemory: () => setIsMemoryOpen(true),
        }}
              onPreviewTruth={previewTruth}
              onToSection={(item) => startSectionFromThought(item)}
            /></PageSuspense>
            </div>
          )}
        </div>
  );
}
