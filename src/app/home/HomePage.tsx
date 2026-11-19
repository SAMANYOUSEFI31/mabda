/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Home: where to start — what needs you, this week, waiting decisions, the inbox, recent changes. */

import { AttentionPanel } from '../../components/home/AttentionPanel';
import { DueItems } from '../../components/home/DueItems';
import { HomeSections } from '../../components/home/HomeSections';
import { InheritNoticeList } from '../../components/home/InheritNoticeList';
import { ContradictionPanel } from '../../components/knowledge/ContradictionPanel';
import { ProposalInbox } from '../../components/knowledge/ProposalInbox';
import { ThinkingList } from '../../components/thinking/ThinkingList';
import { LIMITS } from '../../core/limits';
import { convertedTo } from '../../core/thinkingMarkers';
import { gapAnswer, gapDraft } from '../../core/homeActions';
import { resolveNodeId } from '../../core/nodeTree';
import { CHANGE_KIND_FA } from '../../core/changeLog';
import { spaceTally } from '../../core/spaceTally';
import { Button, Card, EmptyState, IconButton, Menu } from '../../ui';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ChangesPanel = lazyNamed(() => import('../../components/knowledge/ChangesPanel'), 'ChangesPanel');

export type HomePageProps = Pick<ReadyScope, 'attentionGaps' | 'attentionSpec' | 'canJudge' | 'changesOpen' | 'contradictions' | 'currentWorkspace' | 'data' | 'deliverables' | 'dueAssumptions' | 'dueDecisions' | 'dueProps' |  'flips' | 'focusNodeId' | 'goFocus' | 'handleAcceptProposal' | 'handleAcceptReview' | 'handleCheckContradictions' | 'handleConvertItem' | 'handleDeriveThought' | 'handleHomeAct' | 'handleKeepContradiction' | 'handleRejectProposal' | 'handleReplaceWithProposal' | 'handleReviseThought' | 'handleSaveContextObject' | 'handleSeparateContradiction' | 'homeAllOpen' | 'homePlan' | 'homeView' | 'openThinkingSpace' | 'inheritNotices' | 'judgedToday' | 'judging' | 'markInheritSeen' | 'nodes' | 'openContext' | 'reviewNeeds' | 'setActiveTab' | 'setAiRequest' | 'setChangesOpen' | 'setCompare' | 'setContextViewMode' | 'setHomeAllOpen' | 'setIsImportOpen' | 'setIsMemoryOpen' | 'setIsOnboardingOpen' | 'setIsPacksOpen' | 'setPackTarget' | 'setWeeklyOpen' | 'stale' |  'thinking' | 'vf' | 'waiting' | 'waitingOrdered' | 'weekly' | 'weeklyDue' | 'wid' | 'workspaceContexts'>;

/** something of hers is already here: knowledge, a thought, a note or a to-do. Only with none of it is Home the empty page (UX-05). */
export const homeHasStarted = (p: { knowledge: number; actions: number; openThoughts: number; notes: number }): boolean => p.knowledge + p.actions + p.openThoughts + p.notes > 0;

export function HomePage({ attentionGaps, attentionSpec, canJudge, changesOpen, contradictions, currentWorkspace, data, deliverables, dueAssumptions, dueDecisions, dueProps,  flips, focusNodeId, goFocus, handleAcceptProposal, handleAcceptReview, handleCheckContradictions, handleConvertItem, handleDeriveThought, handleHomeAct, handleKeepContradiction, handleRejectProposal, handleReplaceWithProposal, handleReviseThought, handleSaveContextObject, handleSeparateContradiction, homeAllOpen, homePlan, homeView, openThinkingSpace, inheritNotices, judgedToday, judging, markInheritSeen, nodes, openContext, reviewNeeds, setActiveTab, setAiRequest, setChangesOpen, setCompare, setContextViewMode, setHomeAllOpen, setIsImportOpen, setIsMemoryOpen, setIsOnboardingOpen, setIsPacksOpen, setPackTarget, setWeeklyOpen, stale,  thinking, vf, waiting, waitingOrdered, weekly, weeklyDue, wid, workspaceContexts }: HomePageProps) {
  const openThoughts = (data?.thoughts ?? []).filter((t) => t.status === 'open');
  const count = spaceTally(workspaceContexts, openThoughts.length);
  // «در این فضا»: each state once, with the word «منبع حقیقت» and «فکر» use for it, and a way to where those things are
  const stateRows = [
    { state: 'truth' as const, count: count.truth, label: 'حقیقت', always: true, onSelect: () => { setActiveTab('context'); setContextViewMode('doc'); } },
    { state: 'stale' as const, count: count.stale, label: 'قدیمی', onSelect: () => openThinkingSpace() },
    { state: 'proposed' as const, count: count.proposed, label: 'پیشنهاد منتظر تأیید', onSelect: () => openThinkingSpace() },
    { state: 'thought' as const, count: count.thoughts, label: 'فکر باز', onSelect: () => openThinkingSpace() },
    { icon: 'Package' as const, count: deliverables.length, label: 'خروجی', onSelect: () => setActiveTab('assets') },
  ];
  const started = homeHasStarted({ knowledge: workspaceContexts.length, actions: homePlan.total, openThoughts: openThoughts.length, notes: data?.notes?.length ?? 0 });
  return (
        <div className="space-y-stack-lg">
          <div className="flex flex-col gap-stack-sm sm:flex-row sm:items-start sm:justify-between sm:gap-inline-md">
            <div>
              <h1 className="text-heading-md font-bold text-text-default">خانه: {currentWorkspace.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-inline-sm">
              {/* «خانه» answers «what needs me now» (patterns.md §۸): no main button of its own. «افزودن» is the top bar's (and the phone bar's) */}
              {/* the one outward step of the core loop (truth → another tool) is visible, as a quiet secondary; the rest are occasional
                  and stay in «بیشتر» (decisions.md §۴): weekly review and stale outputs already come to «منتظر تو» when they are due */}
              {workspaceContexts.length > 0 && <Button variant="secondary" iconStart="PackageOpen" onClick={() => setAiRequest({ scopeNodeId: '' })}>درخواست برای ابزار دیگر</Button>}
              {workspaceContexts.length > 0 && <Menu
                label="بیشتر"
                align="end"
                trigger={<IconButton icon="Ellipsis" label="بیشتر" variant="secondary" />}
                items={[
                  // grouped by job (decisions.md §۲۶): the request's other half and its saved form, then the looks back at the truth.
                  // «شروع سریع» lives once, in the account menu («راهنما و شروع سریع»)
                  { label: 'وارد کردن پاسخ ابزار دیگر', icon: 'Upload', onSelect: () => setIsImportOpen(true) },
                  { label: 'بسته‌های دانش', icon: 'Package', onSelect: () => setIsPacksOpen(true) },
                  { divider: true },
                  { label: 'مقایسهٔ حقیقت در دو لحظه', icon: 'Layers', onSelect: () => setCompare({ mode: 'week', scopeNodeId: focusNodeId ?? undefined }) },
                  { label: 'بازبینی هفتگی', icon: 'ListChecks', onSelect: () => setWeeklyOpen(true) },
                ]}
              />}
            </div>
          </div>
          {!started && (
            <EmptyState
              title="از همین‌جا شروع کن"
              description="یک جمله بنویس یا یک متن بچسبان؛ جا و نوعش را بعد هم می‌شود تعیین کرد. بعد از اولین دانش، می‌توانی بسته‌ای از آن را برای هر ابزاری که می‌خواهی کپی کنی."
              action={(
                <Button variant="primary" iconStart="Compass" onClick={() => setIsOnboardingOpen(true)}>شروع سریع</Button>
              )}
            />
          )}
          {started && (
            <HomeSections
              sections={homeView}
              onAct={handleHomeAct}
              onAnswerGap={(g) => { const at = { ...g, nodeId: resolveNodeId(nodes, g.nodeId) }; openContext(gapDraft(at, wid), at.nodeId); }}
              truthCount={count.truth}
              tally={stateRows}
              thoughts={openThoughts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3).map((t) => ({ id: t.id, text: t.text, at: t.createdAt }))}
              openThoughtCount={openThoughts.length}
              onOpenThinking={() => openThinkingSpace()}
              recent={(data?.changes ?? []).slice().sort((a, b) => b.at.localeCompare(a.at)).filter((c) => workspaceContexts.some((o) => o.id === c.objectId)).slice(0, 3).map((c) => ({ id: c.id, text: `«${workspaceContexts.find((o) => o.id === c.objectId)!.title}» ${CHANGE_KIND_FA[c.kind]}`, at: c.at }))}
              allOpen={homeAllOpen}
              onToggleAll={() => setHomeAllOpen((v) => !v)}
            />
          )}
          {/* calm news, below the to-do and OUTSIDE it: it is not a task, so it is not counted in «همه (N)»; one at a time, the rest wait in the weekly review */}
          {inheritNotices.length > 0 && <InheritNoticeList notices={inheritNotices} max={1} onSeen={markInheritSeen} onOpenSection={(id) => { setActiveTab('context'); setContextViewMode('doc'); goFocus(id); }} onOpenObject={(id) => { const o = workspaceContexts.find((x) => x.id === id); if (o) openContext(o); }} />}
          {homeAllOpen && (workspaceContexts.length > 0 || homePlan.total > 0) && (
            <div id="home-all" className="flex flex-col gap-stack-lg">
          <AttentionPanel
            nodes={nodes}
            specTitle={attentionSpec?.title ?? ''}
            gaps={attentionGaps}
            contradictionCount={contradictions.length}
            staleCount={stale.length}
            reviews={[...reviewNeeds.entries()].map(([id, need]) => ({ id, title: workspaceContexts.find((o) => o.id === id)?.title ?? id, dependencyTitles: need.changedDependencies.map((d) => workspaceContexts.find((o) => o.id === d.id)?.title ?? d.id) }))}
            waiting={waiting}
            structure={waitingOrdered.structure}
            flips={flips}
            titleOf={(id) => workspaceContexts.find((o) => o.id === id)?.title ?? id}
            weeklyDue={weeklyDue}
            showWeekly={vf.weeklyReview}
            showWaiting={vf.waitingDecisions}
            onOpenWeekly={() => setWeeklyOpen(true)}
            onOpenObject={(id) => { const o = workspaceContexts.find((x) => x.id === id); if (o) openContext(o); }}
            onAcceptReview={handleAcceptReview}
            proposedCount={workspaceContexts.filter((o) => o.status === 'Proposed').length}
            onAnswerGap={(gap, answer) => { void handleSaveContextObject(gapAnswer({ ...gap, nodeId: resolveNodeId(nodes, gap.nodeId) }, answer, wid)); }}
            onOpenAssets={() => setActiveTab('assets')}
            onOpenChanges={() => { setChangesOpen(true); setTimeout(() => document.getElementById('changes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}
          />

          {/* «انتظار در برابر نتیجه» is not counted on Home (owner decision, docs/ux/decisions.md §۴۲): a verdict that is due waits in
              «منتظر تو» (the due items below), and each expectation is read on its monitored truth */}

          {(thinking.some((i) => (i.kind === 'question' || i.kind === 'open_decision') && !convertedTo(i, workspaceContexts)) || dueAssumptions.length + dueDecisions.length > 0) && (
            <Card padding="xl" id="open-thinking" className="flex flex-col gap-stack-lg" aria-label="سؤال‌ها و تصمیم‌های باز">
              <h2 className="heading-sm text-text-default">سؤال‌ها و تصمیم‌های باز</h2>
              <p className="body-sm text-text-subtle">از خط‌های یادداشت‌هایت که با [سؤال] یا [تصمیم باز] شروع شده‌اند؛ همهٔ بخش‌ها اینجا جمع می‌شوند. یادداشت‌ها هرگز در خروجی‌ها و بسته‌ها نمی‌آیند.</p>
              <ThinkingList
                items={thinking.filter((i) => (i.kind === 'question' || i.kind === 'open_decision') && !convertedTo(i, workspaceContexts))}
                objects={workspaceContexts}
                nodes={nodes}
                onConvert={handleConvertItem}
                onRevise={handleReviseThought}
                onDerive={handleDeriveThought}
                onGoToNode={(nodeId) => { setActiveTab('context'); setContextViewMode('doc'); setTimeout(() => document.getElementById(`node-${nodeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); }}
              />
              <DueItems {...dueProps} />
            </Card>
          )}

          {changesOpen && <Deferred when={changesOpen}><ChangesPanel onCompare={() => setCompare({ mode: 'week' })} open={changesOpen} onToggle={() => setChangesOpen((v) => !v)} changes={data?.changes ?? []} objects={workspaceContexts} relationships={data?.relationships ?? []} deliverables={deliverables} nodes={nodes} onOpenAssets={() => setActiveTab('assets')} /></Deferred>}

          {vf.contradictions && <ContradictionPanel contradictions={contradictions} nodes={nodes} onKeep={handleKeepContradiction} onSeparate={handleSeparateContradiction} check={canJudge ? { busy: judging, onCheck: handleCheckContradictions, used: judgedToday, cap: LIMITS.decisionJudgmentsPerDay } : undefined} />}

          {vf.proposals && <ProposalInbox
            objects={workspaceContexts}
            nodes={nodes}
            onAccept={handleAcceptProposal}
            onReplace={handleReplaceWithProposal}
            onEdit={(o) => openContext(o)}
            onReject={handleRejectProposal}
            onOpenImport={() => setIsImportOpen(true)}
            onOpenPack={() => setPackTarget({ title: currentWorkspace.name })}
            onOpenMemory={() => setIsMemoryOpen(true)}
          />}

            </div>
          )}
        </div>
  );
}
