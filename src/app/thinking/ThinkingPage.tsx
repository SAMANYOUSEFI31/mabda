/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Thinking: notes and thoughts. */

import { optionsOf } from '../../core/decisionOptions';
import { requestAdd } from '../../core/addRequest';
import { Button, SegmentedControl } from '../../ui';
import { PageSuspense, lazyNamed } from '../lazy';
import { switchPage, useViewAxis, viewEnterClass } from '../../ui/pageTransition';
import type { ReadyScope } from '../shared';
import { ContradictionPanel } from '../../components/knowledge/ContradictionPanel';
import { LIMITS } from '../../core/limits';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ThinkingSpace = lazyNamed(() => import('../../components/thinking/ThinkingSpace'), 'ThinkingSpace', { warm: true });

const THINKING_ORDER = ['list', 'canvas'] as const;

export type ThinkingPageProps = Pick<ReadyScope, 'canJudge' | 'contradictions' | 'handleCheckContradictions' | 'handleKeepContradiction' | 'handleSeparateContradiction' | 'judgedToday' | 'judging' | 'vf' | 'currentWorkspace' | 'data' | 'focusNodeId' | 'handleAcceptProposal' | 'handleAcceptReview' | 'handleApproveDraft' | 'handleConvertItem' | 'handleDeriveThought' | 'handleRejectDraft' | 'handleRejectProposal' | 'handleReplaceWithProposal' | 'handleReviseThought' | 'handleSynthesizeThought' | 'nodes' | 'openContext' | 'previewTruth' | 'renderCanvas' | 'scopeChip' | 'setCompare' | 'setIsImportOpen' | 'setIsMemoryOpen' | 'setOptionsItemKey' | 'setPackTarget' | 'setSpaceNode' | 'setThinkingView' | 'setThoughtDialog' | 'spaceNode' | 'startSectionFromThought' | 'startThoughtAi' | 'thinking' | 'thinkingView' | 'workspaceContexts'>;

export function ThinkingPage({ canJudge, contradictions, handleCheckContradictions, handleKeepContradiction, handleSeparateContradiction, judgedToday, judging, vf, currentWorkspace, data, focusNodeId, handleAcceptProposal, handleAcceptReview, handleApproveDraft, handleConvertItem, handleDeriveThought, handleRejectDraft, handleRejectProposal, handleReplaceWithProposal, handleReviseThought, handleSynthesizeThought, nodes, openContext, previewTruth, renderCanvas, scopeChip, setCompare, setIsImportOpen, setIsMemoryOpen, setOptionsItemKey, setPackTarget, setSpaceNode, setThinkingView, setThoughtDialog, spaceNode, startSectionFromThought, startThoughtAi, thinking, thinkingView, workspaceContexts }: ThinkingPageProps) {
  const axis = useViewAxis(thinkingView, THINKING_ORDER);
  return (
        <div className="space-y-stack-lg">
          {/* the page frame every page shares (decisions.md §۵۳ ۹): the header spans the frame like Home's; the list keeps the 680px
              reading column (§۵۱) with the filters in the margin beside it. Only the canvas takes the whole main area; the header stays
              in the frame in both views so «فهرست / بوم» does not move under the pointer */}
          <div className="mb-page-frame"><div className="mb-page-head">
            <div className="mb-page-head__title">
              <h1 className="text-heading-md font-bold text-text-default">فکر: {currentWorkspace.name}</h1>
              <p className="text-body-sm text-text-subtle mt-stack-xs">هرچه هنوز حقیقت نیست اینجاست. هر چیز فقط با تأیید تو حقیقت می‌شود.</p>
            </div>
            <div className="mb-page-head__actions">
              <SegmentedControl
                label="نمای فکر"
                value={thinkingView}
                onChange={(id) => switchPage(() => setThinkingView(id as 'list' | 'canvas'))}
                items={[{ id: 'list', label: 'فهرست', icon: 'ListChecks' }, { id: 'canvas', label: 'بوم', icon: 'Workflow' }]}
              />
              {/* adding a thought is the top bar's «افزودن» (and the phone bar's): one way for one thing (patterns.md §۳) */}
            </div>
          </div></div>
          <div id="thinking-view" />
          {/* keyed by the view: a new view fades in place like a new page (taste-review.md «تعویض نما»), built in a transition */}
          <div key={thinkingView} className={viewEnterClass} data-axis={axis}>
          {thinkingView === 'canvas' ? renderCanvas('thinking') : (
            <div className="mb-page-frame">
            <PageSuspense><ThinkingSpace
        lead={<>
            {spaceNode === focusNodeId && scopeChip}
            {/* two truths that do not agree are a decision that waits for her, like a proposal or a draft: «فکر» is where such
                decisions are made (decisions.md §۴۹الف, §۵۱). Home keeps its line and its «جزئیات بیشتر» mirror, as for proposals */}
            {vf.contradictions && contradictions.length > 0 && <ContradictionPanel contradictions={contradictions} nodes={nodes} onKeep={handleKeepContradiction} onSeparate={handleSeparateContradiction} check={canJudge ? { busy: judging, onCheck: handleCheckContradictions, used: judgedToday, cap: LIMITS.decisionJudgmentsPerDay } : undefined} />}
        </>}
        objects={workspaceContexts}
        notes={data.notes}
        nodes={nodes}
        relationships={data.relationships}
        thoughts={thinking}
        nodeId={spaceNode}
        onNodeChange={setSpaceNode}
        onNewThought={() => requestAdd({ kind: 'thought', nodeId: spaceNode, scoped: true })}
        onCompareIfApproved={() => setCompare({ mode: 'pending', scopeNodeId: spaceNode })}
        onOptions={(item) => setOptionsItemKey(item.key)}
        optionTitles={(item) => optionsOf((data?.notes ?? []).find((n) => n.id === item.noteId)?.content ?? '', item.endLine ?? item.line, workspaceContexts, nodes).map((o) => o.title)}
        optionCount={(item) => optionsOf((data?.notes ?? []).find((n) => n.id === item.noteId)?.content ?? '', item.endLine ?? item.line, workspaceContexts, nodes).length}
        onToKnowledge={handleConvertItem}
        onReviseThought={handleReviseThought}
        onDeriveThought={handleDeriveThought}
        onSynthesizeThought={handleSynthesizeThought}
        onThinkWithAi={startThoughtAi}
        onOpenObject={(o) => openContext(o)}
        onAcceptReview={(id) => void handleAcceptReview(id)}
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
        </div>
  );
}
