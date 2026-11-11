/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Home: where to start — what needs you, this week, waiting decisions, the inbox, recent changes. */

import { AttentionPanel } from '../../components/home/AttentionPanel';
import { DueItems } from '../../components/home/DueItems';
import { HomeTodo } from '../../components/home/HomeTodo';
import { InheritNoticeList } from '../../components/home/InheritNoticeList';
import { ContradictionPanel } from '../../components/knowledge/ContradictionPanel';
import { ProposalInbox } from '../../components/knowledge/ProposalInbox';
import { ThinkingList } from '../../components/thinking/ThinkingList';
import { entitlementsOf } from '../../core/entitlements';
import { MX } from '../../core/metricsText';
import { convertedTo } from '../../core/thinkingMarkers';
import { Button, Card, EmptyState, IconButton, Menu, formatNumber } from '../../ui';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const ChangesPanel = lazyNamed(() => import('../../components/knowledge/ChangesPanel'), 'ChangesPanel');

export type HomePageProps = Pick<ReadyScope, 'attentionGaps' | 'attentionSpec' | 'canJudge' | 'changesOpen' | 'contradictions' | 'currentWorkspace' | 'data' | 'deliverables' | 'dueAssumptions' | 'dueDecisions' | 'dueProps' | 'expRows' | 'expectationsDueCount' | 'flips' | 'focusNodeId' | 'goFocus' | 'handleAcceptProposal' | 'handleAcceptReview' | 'handleCheckContradictions' | 'handleConvertItem' | 'handleDeriveThought' | 'handleHomeAct' | 'handleKeepContradiction' | 'handleRejectProposal' | 'handleReplaceWithProposal' | 'handleReviseThought' | 'handleSaveContextObject' | 'handleSeparateContradiction' | 'homeAllOpen' | 'homePlan' | 'inheritNotices' | 'judgedToday' | 'judging' | 'markInheritSeen' | 'nodes' | 'openContext' | 'quietMetrics' | 'reviewNeeds' | 'setActiveTab' | 'setAiRequest' | 'setChangesOpen' | 'setCompare' | 'setContextViewMode' | 'setHomeAllOpen' | 'setIsImportOpen' | 'setIsMemoryOpen' | 'setIsOnboardingOpen' | 'setIsPacksOpen' | 'setMetricsOpen' | 'setPackTarget' | 'setWeeklyOpen' | 'stale' | 'tally' | 'thinking' | 'vf' | 'waiting' | 'waitingOrdered' | 'weekly' | 'weeklyDue' | 'wid' | 'workspaceContexts'>;

export function HomePage({ attentionGaps, attentionSpec, canJudge, changesOpen, contradictions, currentWorkspace, data, deliverables, dueAssumptions, dueDecisions, dueProps, expRows, expectationsDueCount, flips, focusNodeId, goFocus, handleAcceptProposal, handleAcceptReview, handleCheckContradictions, handleConvertItem, handleDeriveThought, handleHomeAct, handleKeepContradiction, handleRejectProposal, handleReplaceWithProposal, handleReviseThought, handleSaveContextObject, handleSeparateContradiction, homeAllOpen, homePlan, inheritNotices, judgedToday, judging, markInheritSeen, nodes, openContext, quietMetrics, reviewNeeds, setActiveTab, setAiRequest, setChangesOpen, setCompare, setContextViewMode, setHomeAllOpen, setIsImportOpen, setIsMemoryOpen, setIsOnboardingOpen, setIsPacksOpen, setMetricsOpen, setPackTarget, setWeeklyOpen, stale, tally, thinking, vf, waiting, waitingOrdered, weekly, weeklyDue, wid, workspaceContexts }: HomePageProps) {
  return (
        <div className="space-y-stack-lg">
          <div className="flex flex-col gap-inline-md sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-heading-md font-bold text-text-default">خانه: {currentWorkspace.name}</h1>
              <p className="text-body-sm text-text-subtle mt-stack-xs">فقط آنچه الان ارزش دارد؛ بقیه یک کلیک پایین‌تر است.</p>
            </div>
            <div className="flex flex-wrap items-center gap-inline-sm">
              {workspaceContexts.length > 0 && <Button variant="primary" iconStart="PackageOpen" onClick={() => setAiRequest({ scopeNodeId: '' })}>آماده‌سازی درخواست</Button>}
              {/* on phones the page action of the top bar does not exist: recording knowledge must still be one tap away */}
              {workspaceContexts.length > 0 && <Button className="md:hidden" variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت دانش</Button>}
              {workspaceContexts.length > 0 && <Menu
                label="بیشتر"
                align="end"
                trigger={<IconButton icon="Ellipsis" label="بیشتر" variant="secondary" />}
                items={[
                  { label: 'شاخص‌ها و اعداد', icon: 'TrendingUp', onSelect: () => setMetricsOpen(true) },
                  { label: 'بسته‌های دانش', icon: 'Package', onSelect: () => setIsPacksOpen(true) },
                  { label: 'وارد کردن متن آماده', icon: 'Upload', onSelect: () => setIsImportOpen(true) },
                  { label: 'مقایسهٔ منبع', icon: 'Layers', onSelect: () => setCompare({ mode: 'week', scopeNodeId: focusNodeId ?? undefined }) },
                  { label: 'بازبینی هفتگی', icon: 'ListChecks', onSelect: () => setWeeklyOpen(true) },
                  { label: 'شروع سریع', icon: 'Zap', onSelect: () => setIsOnboardingOpen(true) },
                ]}
              />}
            </div>
          </div>
          {workspaceContexts.length === 0 && (
            <EmptyState
              icon="House"
              title="از همین‌جا شروع کن"
              description="یک جمله دربارهٔ کسب‌وکارت بنویس یا یک متن بچسبان؛ بقیه‌اش را مبدأ مرتب می‌کند. بعد از اولین دانش، می‌توانی بسته‌ای از آن را برای هر ابزاری که می‌خواهی کپی کنی."
              action={(
                <div className="flex flex-wrap justify-center gap-inline-md">
                  <Button variant="primary" iconStart="Zap" onClick={() => setIsOnboardingOpen(true)}>شروع سریع</Button>
                  <Button variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت اولین دانش</Button>
                  <Button variant="ghost" iconStart="Download" onClick={() => setIsMemoryOpen(true)}>وارد کردن سند یا حافظه</Button>
                </div>
              )}
            />
          )}
          {(workspaceContexts.length > 0 || homePlan.total > 0) && (
            <HomeTodo top={homePlan.top} total={homePlan.total} onAct={handleHomeAct} allOpen={homeAllOpen} onToggleAll={() => setHomeAllOpen((v) => !v)} />
          )}
          {/* calm news, below the to-do and OUTSIDE it: it is not a task, so it is not counted in «همه (N)»; one at a time, the rest wait in the weekly review */}
          {inheritNotices.length > 0 && <InheritNoticeList notices={inheritNotices} max={1} onSeen={markInheritSeen} onOpenSection={(id) => { setActiveTab('context'); setContextViewMode('doc'); goFocus(id); }} onOpenObject={(id) => { const o = workspaceContexts.find((x) => x.id === id); if (o) openContext(o); }} />}
          {homeAllOpen && (workspaceContexts.length > 0 || homePlan.total > 0) && (
            <div id="home-all" className="flex flex-col gap-stack-lg">
          <AttentionPanel
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
            onAnswerGap={(gap, answer) => { void handleSaveContextObject({
              workspaceId: wid, type: gap.importance === 'required' ? 'Decision' : 'Fact', status: 'Confirmed', provenance: 'User Input',
              title: gap.label, content: answer, nodeId: gap.nodeId, slotKey: gap.key,
            }); }}
            onOpenStudio={() => setActiveTab('workstreams')}
            onOpenAssets={() => setActiveTab('assets')}
            onOpenProposals={() => document.getElementById('proposal-inbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            onOpenContradictions={() => document.getElementById('contradictions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            onOpenChanges={() => { setChangesOpen(true); setTimeout(() => document.getElementById('changes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}
          />

          {vf.metrics && (
            <Card padding="xl" id="expectations" className="flex flex-col gap-stack-md" aria-label={MX.homeTitle}>
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <h2 className="heading-sm text-text-default">{MX.homeTitle}</h2>
                <Button size="sm" variant="secondary" iconStart="TrendingUp" onClick={() => setMetricsOpen(true)}>{MX.navTitle}</Button>
              </div>
              {expRows.length > 0 ? (
                <p className="body-md text-text-default" data-testid="expectation-tally">
                  {formatNumber(tally.met)} به انتظار رسید · {formatNumber(tally.partial)} نیمه · {formatNumber(tally.missed)} نرسید · {formatNumber(tally.open)} باز{expectationsDueCount > 0 ? ` (${formatNumber(expectationsDueCount)} موعدش رسیده)` : ''}
                </p>
              ) : <p className="body-sm text-text-subtle">{MX.expectationsBody}</p>}
              {quietMetrics.length > 0 && <p className="body-sm text-text-subtle">{MX.quiet}: {quietMetrics.map((m) => m.name).join('، ')}.</p>}
            </Card>
          )}

          {(thinking.some((i) => (i.kind === 'question' || i.kind === 'open_decision') && !convertedTo(i, workspaceContexts)) || dueAssumptions.length + dueDecisions.length > 0) && (
            <Card padding="xl" id="open-thinking" className="flex flex-col gap-stack-lg" aria-label="سؤال‌ها و تصمیم‌های باز">
              <h2 className="heading-sm text-text-default">سؤال‌ها و تصمیم‌های باز</h2>
              <p className="body-sm text-text-subtle">از خط‌های یادداشت‌هایت که با [سؤال] یا [تصمیم باز] شروع شده‌اند؛ همهٔ گره‌ها اینجا جمع می‌شوند. یادداشت‌ها هرگز به AI داده نمی‌شوند.</p>
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

          {vf.contradictions && <ContradictionPanel contradictions={contradictions} nodes={nodes} onKeep={handleKeepContradiction} onSeparate={handleSeparateContradiction} check={canJudge ? { busy: judging, onCheck: handleCheckContradictions, used: judgedToday, cap: entitlementsOf(data!.workspace.planId).decisionJudgmentsPerDay } : undefined} />}

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
