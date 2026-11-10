/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccountModal } from '../components/AccountModal';
import { AiRequestDialog } from '../components/AiRequestDialog';
import { AiStatusBanner } from '../components/AiNotices';
import { AppNavigation } from '../components/AppNavigation';
import { ArchiveDialog } from '../components/ArchiveDialog';
import { AssetLibrary } from '../components/AssetLibrary';
import { AttentionPanel } from '../components/AttentionPanel';
import { Button, Card, Checkbox, Dialog, EmptyState, IconButton, Menu, SegmentedControl, Spinner, TextField, formatNumber } from '../ui';
import { ChangesPanel } from '../components/ChangesPanel';
import { ChatSession } from '../types';
import { CommandPalette } from '../components/CommandPalette';
import { ContextDetailModal } from '../components/ContextDetailModal';
import { ContextPackDialog } from '../components/ContextPackDialog';
import { ContextTableView } from '../components/ContextTableView';
import { ContextTreeDocView } from '../components/ContextTreeDocView';
import { ContradictionPanel } from '../components/ContradictionPanel';
import { DangerDialog } from '../components/Removal';
import { DecisionOptionsDialog } from '../components/DecisionOptionsDialog';
import { DocWorkspace } from '../components/DocWorkspace';
import { DueItems } from '../components/DueItems';
import { FilesPanel } from '../components/FilesPanel';
import { HomeTodo } from '../components/HomeTodo';
import { ImportAnswerDialog } from '../components/ImportAnswerDialog';
import { InheritNoticeList } from '../components/InheritNoticeList';
import { KnowledgeBatchDialog } from '../components/KnowledgeBatchDialog';
import { LedgerPanel } from '../components/LedgerPanel';
import { MX } from '../core/metricsText';
import { MemoryImportDialog } from '../components/MemoryImportDialog';
import { MetricsDialog } from '../components/MetricsDialog';
import { NodeDialogs } from '../components/NodeDialogs';
import { NodeEffectDialog } from '../components/NodeEffectDialog';
import { NodeReaderDialog } from '../components/NodeReaderDialog';
import { NodeThreadPanel } from '../components/NodeThreadPanel';
import { PlanSelectionModal } from '../components/PlanSelectionModal';
import { ProposalInbox } from '../components/ProposalInbox';
import { QuickStartDialog } from '../components/QuickStartDialog';
import { SavedPacksDialog } from '../components/SavedPacksDialog';
import { SpecEditorModal } from '../components/SpecEditorModal';
import { SpecLibraryDialog } from '../components/SpecLibraryDialog';
import { StarterDialog } from '../components/StarterDialog';
import { ThinkingList } from '../components/ThinkingList';
import { ThinkingSpace } from '../components/ThinkingSpace';
import { ThoughtDialog } from '../components/ThoughtDialog';
import { TopStatusBar } from '../components/TopStatusBar';
import { TruthCompareDialog } from '../components/TruthCompareDialog';
import { UsageDialog } from '../components/UsageDialog';
import { WeeklyReviewDialog } from '../components/WeeklyReviewDialog';
import { WorkstreamStudio } from '../components/WorkstreamStudio';
import { chatCredits } from '../core/creditEngine';
import { contextDraftFromBlock } from '../core/blocks';
import { convertedTo } from '../core/thinkingMarkers';
import { dataApi } from '../services/dataApi';
import { defaultNodeId } from '../core/nodeTree';
import { effectiveObjects } from '../core/effectiveContext';
import { entitlementsOf } from '../core/entitlements';
import { ledgerEntryFromUsage } from '../core/ledger';
import { optionsOf } from '../core/decisionOptions';
import { readinessPerWorkstream } from '../core/weeklyReview';
import type { AppCoreScope } from './shell/useAppCore';
import type { SearchAndFocusScope } from './shell/useSearchAndFocus';
import type { UsageCountersScope } from './shell/useUsageCounters';
import type { KnowledgeScope } from './knowledge/useKnowledge';
import type { ThinkingItemsScope } from './thinking/useThinkingItems';
import type { HomeScope } from './home/useHome';
import type { MetricsScope } from './metrics/useMetrics';
import type { StartersScope } from './structure/useStarters';
import type { BoardsScope } from './canvas/useBoards';
import type { NodeActionsScope } from './structure/useNodeActions';
import type { NotesScope } from './thinking/useNotes';
import type { FilesScope } from './files/useFiles';
import type { WorkspaceAssetsScope } from './workspace/useWorkspaceAssets';
import type { RemovalAndDialogsScope } from './shell/useRemovalAndDialogs';

/** everything the hooks of src/app/* produce */
export type AppScope = AppCoreScope & SearchAndFocusScope & UsageCountersScope & KnowledgeScope & ThinkingItemsScope & HomeScope & MetricsScope & StartersScope & BoardsScope & NodeActionsScope & NotesScope & FilesScope & WorkspaceAssetsScope & RemovalAndDialogsScope;

/** The whole screen: the pages and all dialogs. It only draws; every piece of state and every handler comes from the hooks. */
export function AppView(p: AppScope) {
  const { activeTab, addSpec, ai, aiRequest, approvals, archiveOpen, askDeleteNote, attempt, attentionGaps, attentionSpec, boot, canJudge, changesOpen, compare, contextViewMode, contradictions, currentWorkspace, currentWorkspaceId, data, deliverables, demoBusy, demoConfirm, demoDelete, dueAssumptions, dueDecisions, dueProps, editingSpec, effectNodeId, enabledLibrary, ensureLibrarySpec, expRows, expectationsDueCount, extractingAssetId, extractingNoteId, flips, focusAsset, focusNodeId, focusNotes, goFocus, handleAcceptProposal, handleAcceptReview, handleAddCredits, handleAddNote, handleApplyStarter, handleApplyTemplate, handleApproveDraft, handleArchiveContext, handleArchiveDeliverable, handleArchiveWorkspace, handleChangePlan, handleCheckContradictions, handleChooseOption, handleConvertItem, handleCreateObjects, handleCreateWorkspace, handleDeleteDeliverable, handleDeleteDemo, handleDeleteEverything, handleDeleteFile, handleDeleteNote, handleDeleteSamples, handleDeleteWorkspace, handleDeriveThought, handleDraftFromImport, handleExportAllData, handleExtractFromAsset, handleExtractNote, handleHomeAct, handleIncrementChatCount, handleJudge, handleKeepContradiction, handlePatchObject, handlePick, handleProcessFile, handleProposeBatch, handleProposeFromImport, handleRecordChatUsage, handleRejectDraft, handleRejectProposal, handleReplaceWithProposal, handleResetDemo, handleReviseThought, handleSaveAiThought, handleSaveContextObject, handleSaveDeliverable, handleSaveProposals, handleSaveTemplate, handleSaveThought, handleSaveThoughts, handleSeparateContradiction, handleSetDependencies, handleSetLibrarySpecs, handleSplitNote, handleSupersedeContext, handleSynthesizeThought, handleThoughtSectioned, handleUpdateNote, handleUploadFile, homeAllOpen, homePlan, inheritNotices, isAccountModalOpen, isBatchOpen, isContextModalOpen, isCustomSpecModalOpen, isImportOpen, isMemoryOpen, isNewWorkspaceModalOpen, isOnboardingOpen, isPacksOpen, isPlanModalOpen, isSpecLibraryOpen, isStarterOpen, judgedToday, judging, ledgerEntries, liveWorkspaces, loadError, markInheritSeen, measurements, metricHandlers, metrics, metricsOpen, modalDefaultNodeId, newWsName, nodeDialog, nodeOp, nodes, noteDeleteAsk, noteDeleteWithThoughts, openContext, openCounts, openSpecEditor, openThinkingSpace, optionsItem, optionsNote, packTarget, pageAction, paletteOpen, patch, pendingRebuild, persistDeliverable, persistLedger, previewTruth, quietMetrics, quota, readNodeId, reload, renderCanvas, revealWhenThere, reviewIdSet, reviewNeeds, scopeChip, searchIdx, selectedContextObject, selectedSpecId, setActiveTab, setAiRequest, setArchiveOpen, setChangesOpen, setChatScope, setCompare, setContextViewMode, setCurrentWorkspaceId, setDemoConfirm, setDemoDelete, setEffectNodeId, setHomeAllOpen, setIsAccountModalOpen, setIsBatchOpen, setIsContextModalOpen, setIsCustomSpecModalOpen, setIsImportOpen, setIsMemoryOpen, setIsNewWorkspaceModalOpen, setIsOnboardingOpen, setIsPacksOpen, setIsPlanModalOpen, setIsSpecLibraryOpen, setIsStarterOpen, setLedger, setMetricsOpen, setNewWsName, setNodeDialog, setNoteDeleteAsk, setNoteDeleteWithThoughts, setOptionsItemKey, setPackTarget, setPaletteOpen, setPendingRebuild, setReadNodeId, setSelectedSpecId, setSpaceNode, setStatus, setTemplateDraft, setThinkingView, setThoughtDialog, setThreadNodeId, setUsageOpen, setWeeklyOpen, setWs, spaceNode, specs, stale, startSectionFromThought, startThoughtAi, startup, tally, templateDraft, thinking, thinkingBadge, thinkingView, thoughtDialog, threadNodeId, toast, usageOpen, vf, waiting, waitingOrdered, weekly, weeklyDue, weeklyOpen, wid, workspaceContexts, workspaces } = p;

  // nothing left (a fresh install after «حذف همهٔ داده‌ها», or every workspace archived / deleted): an honest empty start, not an error
  if (boot.status === 'ready' && liveWorkspaces.length === 0) {
    const archived = workspaces.filter((w) => w.archivedAt);
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page p-inset-lg" data-testid="first-run">
        <div className="flex w-full max-w-overlay-xs flex-col gap-stack-lg text-center">
          <EmptyState icon="House" title="هنوز فضای کاری نداری" description="یک فضای کاری بساز تا دانش کسب‌وکارت جایی بنشیند. هرچه کنار گذاشته بودی هم در بایگانی مانده است." />
          <form onSubmit={handleCreateWorkspace} className="flex flex-col gap-stack-sm text-start">
            <TextField label="نام فضای کاری یا نام برند" value={newWsName} onChange={(e) => setNewWsName(e.target.value)} />
            <Button variant="primary" type="submit" disabled={!newWsName.trim()}>ایجاد فضای کاری</Button>
          </form>
          {archived.length > 0 && (
            <div className="flex flex-col gap-stack-xs text-start" aria-label="فضاهای بایگانی‌شده">
              <span className="label-md text-text-default">بایگانی‌شده‌ها</span>
              {archived.map((w) => <div key={w.id} className="flex items-center justify-between gap-inline-sm"><span className="body-md">{w.name}</span><Button size="sm" variant="secondary" iconStart="Undo2" onClick={() => { void attempt(() => dataApi.archiveWorkspace(w.id, false)).then((r) => { if (r) { setWs(r.workspaces); setCurrentWorkspaceId(w.id); } }); }}>برگردان</Button></div>)}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (boot.status !== 'ready' || !currentWorkspace || !data) {
    const failed = boot.status === 'error' || loadError;
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page p-inset-lg">
        {failed ? (
          <EmptyState
            icon="Lock"
            title="اتصال به سرور برقرار نشد"
            description={boot.message ?? loadError ?? undefined}
            action={<Button variant="primary" onClick={() => (boot.status === 'error' ? void startup() : void reload(currentWorkspaceId))}>دوباره</Button>}
          />
        ) : (
          <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال بارگذاری" /><span className="body-md">در حال بارگذاری فضای کاری…</span></div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-text-default md:flex-row pb-space-24 md:pb-space-0">
      {/* Sleek Right Sidebar Navigation & Mobile Drawer */}
      <AppNavigation
        currentWorkspace={currentWorkspace}
        allWorkspaces={liveWorkspaces}
        onSelectWorkspace={(ws) => { setChatScope(undefined); setCurrentWorkspaceId(ws.id); }}
        onOpenNewWorkspace={() => setIsNewWorkspaceModalOpen(true)}
        onOpenSearch={() => setPaletteOpen(true)}
        onOpenUsage={() => setUsageOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenArchive={() => setArchiveOpen(true)}
        onDeleteDemo={workspaces.some((w) => w.isDemo && !w.archivedAt) ? () => setDemoDelete(true) : undefined}
        onResetDemo={() => { if (workspaces.some((w) => w.isDemo)) setDemoConfirm(true); else void handleResetDemo(); }}
        onOpenPlanModal={() => setIsPlanModalOpen(true)}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onOpenLedger={() => setActiveTab('ledger')}
        onOpenMemory={() => { setActiveTab('context'); setIsMemoryOpen(true); }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        specs={specs}
        selectedSpecId={selectedSpecId}
        onSelectSpecId={setSelectedSpecId}
        onOpenCustomSpecModal={() => openSpecEditor()}
        onOpenSpecLibrary={() => setIsSpecLibraryOpen(true)}
        contextViewMode={contextViewMode}
        onChangeContextViewMode={setContextViewMode}
        contextCount={workspaceContexts.length}
        deliverablesCount={deliverables.length}
        thinkingCount={thinkingBadge}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-space-0">
        {/* Desktop Minimal Top Status Bar with Breadcrumbs & Quick Actions */}
        <TopStatusBar
          currentWorkspace={currentWorkspace}
          activeTab={activeTab}
          action={pageAction}
        />

        {/* Main Canvas */}
        <main className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl flex-1 space-y-stack-lg">
          {(activeTab === 'workstreams' || activeTab === 'chat') && <AiStatusBanner />}



        {/* HOME: where to start — what needs you, this week, waiting decisions, the inbox, recent changes */}
        {activeTab === 'home' && (
          <div className="space-y-stack-lg">
            <div className="flex flex-col gap-inline-md sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-heading-md font-bold text-text-default">خانه: {currentWorkspace.name}</h1>
                <p className="text-body-sm text-text-subtle mt-stack-xs">فقط آنچه الان ارزش دارد؛ بقیه یک کلیک پایین‌تر است.</p>
              </div>
              <div className="flex flex-wrap items-center gap-inline-sm">
                {workspaceContexts.length > 0 && <Button variant="primary" iconStart="Sparkles" onClick={() => setAiRequest({ scopeNodeId: '' })}>درخواست برای AI</Button>}
                {/* on phones the page action of the top bar does not exist: recording knowledge must still be one tap away */}
                {workspaceContexts.length > 0 && <Button className="md:hidden" variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت دانش</Button>}
                {workspaceContexts.length > 0 && <Menu
                  label="بیشتر"
                  align="end"
                  trigger={<IconButton icon="Ellipsis" label="بیشتر" variant="secondary" />}
                  items={[
                    { label: 'شاخص‌ها و اعداد', icon: 'TrendingUp', onSelect: () => setMetricsOpen(true) },
                    { label: 'بسته‌های دانش', icon: 'Package', onSelect: () => setIsPacksOpen(true) },
                    { label: 'وارد کردن پاسخ AI', icon: 'Upload', onSelect: () => setIsImportOpen(true) },
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
                description="یک جمله دربارهٔ کسب‌وکارت بنویس یا یک متن بچسبان؛ بقیه‌اش را مبدأ مرتب می‌کند. بعد از اولین دانش، می‌توانی از AI خودت کاری بخواهی که کسب‌وکارت را می‌شناسد."
                action={(
                  <div className="flex flex-wrap justify-center gap-inline-md">
                    <Button variant="primary" iconStart="Sparkles" onClick={() => setIsOnboardingOpen(true)}>شروع سریع</Button>
                    <Button variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت اولین دانش</Button>
                    <Button variant="ghost" iconStart="Download" onClick={() => setIsMemoryOpen(true)}>وارد کردن حافظهٔ AI دیگر</Button>
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

            {changesOpen && <ChangesPanel onCompare={() => setCompare({ mode: 'week' })} open={changesOpen} onToggle={() => setChangesOpen((v) => !v)} changes={data?.changes ?? []} objects={workspaceContexts} relationships={data?.relationships ?? []} deliverables={deliverables} nodes={nodes} onOpenAssets={() => setActiveTab('assets')} />}

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
        )}

        {/* TAB 1: Context & Source of Truth */}
        {activeTab === 'context' && (
          <div className="space-y-stack-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-inline-lg">
              <div>
                <h1 className="text-heading-md font-bold text-text-default">
                  منبع حقیقت: {currentWorkspace.name}
                </h1>
                <p className="text-body-sm text-text-subtle mt-stack-xs">
                  «مبدأ منبع حقیقت کسب‌وکار توست. هر کار از اون شروع می‌شه و هر خروجی به اون برمی‌گرده.»
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-inline-sm">
                {vf.packs && <Button variant="secondary" iconStart="Package" onClick={() => setIsPacksOpen(true)}>بسته‌های دانش</Button>}
                <Button className="md:hidden" variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت دانش</Button>
                <SegmentedControl
                  label="نمای منبع حقیقت"
                  value={contextViewMode}
                  onChange={(id) => setContextViewMode((id === 'map' ? 'canvas' : id) as 'doc' | 'read' | 'table' | 'canvas')}
                  items={[
                    { id: 'doc', label: 'ساختار', icon: 'FolderTree' },
                    { id: 'canvas', label: 'نمای کلی', icon: 'Workflow' },
                    ...(contextViewMode === 'read' ? [{ id: 'read', label: 'سند', icon: 'BookOpen' as const }] : []),
                    ...(contextViewMode === 'table' ? [{ id: 'table', label: 'جدول', icon: 'Table2' as const }] : []),
                  ]}
                />
                <Menu
                  label="نماهای بیشتر"
                  align="end"
                  trigger={<IconButton icon="Ellipsis" label="نماهای بیشتر" variant="secondary" />}
                  items={[
                    { label: 'خواندن به‌صورت سند', icon: contextViewMode === 'read' ? 'Check' : 'BookOpen', onSelect: () => setContextViewMode('read') },
                    { label: 'جدول', icon: contextViewMode === 'table' ? 'Check' : 'Table2', onSelect: () => setContextViewMode('table') },
                    { label: 'بایگانی و حذف‌های اخیر', icon: 'Archive', onSelect: () => setArchiveOpen(true) },
                  ]}
                />
              </div>
            </div>

            <div id="context-view" style={{ scrollMarginTop: 80 }} />
            {contextViewMode === 'read' ? (
              <DocWorkspace
                nodes={nodes}
                objects={workspaceContexts}
                relationships={data.relationships}
                approvals={approvals}
                fileName={currentWorkspace.name}
                empty={<EmptyState icon="Inbox" title="هنوز دانشی ثبت نشده است" />}
              />
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
              <ContextTableView
                objects={workspaceContexts}
                nodes={nodes}
                onSelectObject={(obj) => openContext(obj)}
                onAddNew={() => openContext(null)}
                samples={data.samples ?? []}
              />
            )}

            <FilesPanel
              files={data.files}
              nodes={nodes}
              quota={quota}
              credits={currentWorkspace.creditsRemaining}
              onUpload={handleUploadFile}
              onProcess={handleProcessFile}
              onDelete={handleDeleteFile}
            />
          </div>
        )}

        {activeTab === 'thinking' && (
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
                <Button variant="primary" iconStart="Plus" onClick={() => setThoughtDialog({ nodeId: spaceNode })}>فکر تازه</Button>
              </div>
            </div>
            <div id="thinking-view" />
            {thinkingView === 'canvas' ? renderCanvas('thinking') : (
              <div className="flex flex-col gap-stack-sm">
              {spaceNode === focusNodeId && scopeChip}
              <ThinkingSpace
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
              />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Workstreams & Gap Engine */}
        {activeTab === 'workstreams' && specs.length === 0 && (
          <EmptyState
            icon="Layers"
            title="این فضا هنوز جریان کاری ندارد"
            description="از کتابخانه یک جریان آماده بردار یا خودت یکی بساز."
            action={<div className="flex flex-wrap justify-center gap-inline-md"><Button variant="secondary" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button><Button variant="secondary" iconStart="Plus" onClick={() => openSpecEditor()}>جریان کار تازه</Button></div>}
          />
        )}
        {activeTab === 'workstreams' && specs.length > 0 && (
          <Button variant="ghost" size="sm" iconStart="ArrowRight" onClick={() => setActiveTab('assets')}>همهٔ خروجی‌ها</Button>
        )}
        {activeTab === 'workstreams' && specs.length > 0 && (
          <WorkstreamStudio
            currentWorkspace={currentWorkspace}
            allContextObjects={workspaceContexts}
            allDeliverables={deliverables}
            specs={specs}
            stale={stale}
            changes={data.changes}
            nodes={nodes}
            selectedSpecId={selectedSpecId}
            onSelectSpecId={setSelectedSpecId}
            onOpenSpecEditor={openSpecEditor}
            judgments={data.judgments}
            onJudge={handleJudge}
            onSaveTemplate={(spec) => setTemplateDraft({ kind: 'workstream', sourceId: spec.id, name: spec.title })}
            onAddContextObject={handleSaveContextObject}
            onSaveDeliverable={handleSaveDeliverable}
            pendingRebuild={pendingRebuild}
            onPendingRebuildHandled={() => setPendingRebuild(null)}
            onOpenContextModal={(obj) => openContext(obj)}
            onOpenLedger={() => setActiveTab('ledger')}
            onOpenPack={setPackTarget}
            onOpenImport={() => setIsImportOpen(true)}
          />
        )}

        {/* TAB 3: Smart Chat */}

        {/* TAB 4: Asset Library */}
        {activeTab === 'assets' && (
          <div className="space-y-stack-lg">
            <div>
              <h1 className="text-heading-md font-bold text-text-default">خروجی‌ها: {currentWorkspace.name}</h1>
              <p className="text-body-sm text-text-subtle mt-stack-xs">بالا: با چه چیزی می‌سازی. پایین: چه ساخته‌ای و کدام‌ها دیگر به‌روز نیستند.</p>
            </div>
            <section className="flex flex-col gap-stack-md" aria-label="بساز" data-testid="outputs-build">
              <h2 className="heading-sm text-text-default">بساز</h2>
              {specs.length === 0 ? (
                <EmptyState icon="Layers" title="این فضا هنوز جریان کاری ندارد" description="از کتابخانه یک جریان آماده بردار یا خودت یکی بساز." action={<Button variant="secondary" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button>} />
              ) : (
                <ul className="grid gap-stack-md sm:grid-cols-2" aria-label="جریان‌های کار">
                  {specs.map((sp) => (
                    <li key={sp.id}>
                      <Card padding="lg" className="flex h-full flex-col justify-between gap-stack-sm">
                        <div className="flex flex-col gap-stack-xs">
                          <span className="label-md text-text-default">{sp.title}</span>
                          <p className="body-sm text-text-subtle">{sp.description}</p>
                        </div>
                        <div><Button size="sm" variant="secondary" iconStart="Sparkles" data-testid={`build-${sp.id}`} aria-label={`بساز: ${sp.title}`} onClick={() => { setSelectedSpecId(sp.id); setActiveTab('workstreams'); }}>بساز</Button></div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-inline-sm">
                <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => openSpecEditor()}>جریان کار تازه</Button>
                <Button size="sm" variant="ghost" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button>
              </div>
            </section>
          <AssetLibrary
            focus={focusAsset}
            currentWorkspace={currentWorkspace}
            deliverables={deliverables}
            allContextObjects={workspaceContexts}
            stale={stale}
            changes={data.changes}
            onGoToWorkstreams={() => setActiveTab('workstreams')}
            onArchive={handleArchiveDeliverable}
            onDelete={handleDeleteDeliverable}
            onOpenArchive={() => setArchiveOpen(true)}
            workstreams={specs}
            onOpenContextModal={(obj) => openContext(obj)}
            onExtractKnowledge={handleExtractFromAsset}
            extractingId={extractingAssetId}
            onRebuild={(del) => {
              setSelectedSpecId(del.workstreamId);
              setPendingRebuild(del);
              setActiveTab('workstreams');
            }}
          />
          </div>
        )}

        {/* TAB 5: Ledger & Economics */}
        {activeTab === 'ledger' && (
          <LedgerPanel
            currentWorkspace={currentWorkspace}
            ledgerEntries={ledgerEntries}
            onChangePlan={handleChangePlan}
            onAddCredits={handleAddCredits}
            onOpenPlans={() => setIsPlanModalOpen(true)}
          />
        )}
      </main>
      </div>

      {/* Context Object Add/Edit Modal */}
      <Dialog
        open={!!noteDeleteAsk} onClose={() => setNoteDeleteAsk(null)} size="sm" title="حذف یادداشت"
        description={noteDeleteAsk ? `این یادداشت ${formatNumber(noteDeleteAsk.open)} فکر باز دارد. فکرها مال خودت‌اند؛ اگر چیزی نگویی می‌مانند و روی هر کدام نوشته می‌شود «یادداشت حذف شد».` : undefined}
        footer={<><Button variant="ghost" onClick={() => setNoteDeleteAsk(null)}>انصراف</Button><Button variant="danger" iconStart="Trash2" onClick={() => { const ask = noteDeleteAsk; setNoteDeleteAsk(null); if (ask) void handleDeleteNote(ask.id, noteDeleteWithThoughts); }}>حذف یادداشت</Button></>}
      >
        <div className="flex flex-col gap-stack-xs">
          <Checkbox label={`فکرهای باز هم بروند (${formatNumber(noteDeleteAsk?.open ?? 0)} فکر)`} checked={noteDeleteWithThoughts} onChange={(e) => setNoteDeleteWithThoughts(e.target.checked)} />
          <p className="body-sm text-text-subtle">با «برگرداندن» متن یادداشت برمی‌گردد و فکرها دوباره از روی خط‌هایش ساخته می‌شوند (بی‌تاریخچهٔ قبلی).</p>
        </div>
      </Dialog>
      <ArchiveDialog open={archiveOpen} workspaceId={wid} nodes={nodes} workspaces={workspaces} currentWorkspaceId={wid} onClose={() => setArchiveOpen(false)} onChanged={() => void reload(wid)} onWorkspacesChange={setWs} />
      <DangerDialog open={demoDelete} onClose={() => setDemoDelete(false)} title="پاک کردن فضای نمونه؟" description="همهٔ داده‌های فضای نمونه (دانش، یادداشت، خروجی، تاریخچه) پاک می‌شود. این داده‌ها ساختگی‌اند و فضاهای دیگرت دست نمی‌خورند؛ هر وقت خواستی دوباره ساخته می‌شود." confirmLabel="پاک کن" onConfirm={handleDeleteDemo} />
      <SavedPacksDialog open={isPacksOpen} workspaceId={wid} nodes={nodes} objects={workspaceContexts} onClose={() => setIsPacksOpen(false)} onOpenObject={(o) => openContext(o)} />
      <AiRequestDialog
        open={!!aiRequest} workspaceId={wid} nodes={nodes} scopeNodeId={aiRequest?.scopeNodeId} initialKind={aiRequest?.kind} initialRequest={aiRequest?.request} initialThoughtIds={aiRequest?.thoughtIds} thoughts={thinking} onClose={() => setAiRequest(null)} onOpenImport={() => setIsImportOpen(true)}
        sessions={data?.sessions ?? []}
        onSaveSession={(sess: ChatSession) => { void attempt(() => dataApi.saveSession(wid, sess)).then((r) => { if (r) patch((d) => ({ ...d, sessions: d.sessions.some((x) => x.id === sess.id) ? d.sessions.map((x) => (x.id === sess.id ? sess : x)) : [sess, ...d.sessions] })); }); }}
        onAnswered={(res) => { handleIncrementChatCount(); void handleRecordChatUsage(res, ai.managedEnabled ? chatCredits(false) : 0, false); }}
        onAddKnowledge={(b) => openContext(contextDraftFromBlock(b, wid))}
        onSaveAsThought={handleSaveAiThought}
        onOpenObject={(id) => { const o = workspaceContexts.find((x) => x.id === id); if (o) openContext(o); }}
      />
      <ContextDetailModal
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
      />

      <TruthCompareDialog
        open={!!compare} onClose={() => setCompare(null)} mode={compare?.mode} scopeNodeId={compare?.scopeNodeId}
        objects={data?.objects ?? []} changes={data?.changes ?? []} nodes={nodes} deliverables={deliverables}
        onOpenObject={(o) => openContext(o)} onOpenAssets={() => setActiveTab('assets')}
      />
      <DecisionOptionsDialog
        open={!!optionsItem} onClose={() => setOptionsItemKey(null)} item={optionsItem} noteContent={optionsNote?.content ?? ''}
        objects={workspaceContexts} nodes={nodes} relationships={data?.relationships ?? []}
        onChangeNote={async (content) => { if (optionsNote) await handleUpdateNote(optionsNote.id, content); }}
        onChoose={handleChooseOption}
        onAskAi={(text) => { setOptionsItemKey(null); setAiRequest({ scopeNodeId: optionsItem?.nodeId ?? '', kind: 'decision', request: text }); }}
      />
      <ThoughtDialog open={!!thoughtDialog} onClose={() => setThoughtDialog(null)} nodes={nodes} objects={workspaceContexts} nodeId={thoughtDialog?.nodeId} initialKind={thoughtDialog?.initialKind} initialAbout={thoughtDialog?.initialAbout} onSave={handleSaveThought} onSaveMany={handleSaveThoughts} />
      <NodeDialogs
        state={nodeDialog}
        nodes={nodes}
        objects={workspaceContexts}
        notes={data.notes}
        thoughts={data.thoughts}
        files={data.files}
        onClose={() => setNodeDialog(null)}
        workspaceId={wid}
        onCreate={async (parentId, label, description) => {
          const r = await attempt(() => dataApi.createNode(wid, { parentId, label, description }));
          if (!r) throw new Error('create failed');
          patch((d) => ({ ...d, nodes: r.nodes }));
          return r.node.id;
        }}
        onOpenCoach={(nodeId) => setNodeDialog({ kind: 'coach', nodeId })}
        onSaveProposals={handleSaveProposals}
        onLedger={setLedger}
        onRename={(nodeId, label, description) => nodeOp(() => dataApi.renameNode(wid, nodeId, { label, description }))}
        relationships={data.relationships}
        onMove={(nodeId, parentId, reason) => nodeOp(() => dataApi.moveNode(wid, nodeId, parentId, undefined, reason))}
        onDelete={async (nodeId, transferTo, mode) => {
          const r = await attempt(() => dataApi.deleteNode(wid, nodeId, transferTo, mode));
          if (!r) throw new Error('node delete failed');
          patch((d) => ({ ...d, nodes: r.nodes, objects: r.objects, notes: r.notes, thoughts: r.thoughts, files: r.files, stale: r.stale }));
          void reload(wid);
          toast.show({ intent: 'success', message: `${r.removal.label}.`, duration: 12000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.undoRemoval(wid, r.removal.id)).then((u) => { if (u) { patch((d) => ({ ...d, nodes: u.nodes, objects: u.objects, notes: u.notes, thoughts: u.thoughts, files: u.files, samples: u.samples, changes: u.changes, stale: u.stale })); toast.show({ intent: 'success', message: 'برگشت؛ همه‌چیز همان‌طور که بود.' }); } }); } } });
        }}
        onThoughtSectioned={handleThoughtSectioned}
      />

      {currentWorkspace && <SpecLibraryDialog open={isSpecLibraryOpen} workspace={currentWorkspace} onClose={() => setIsSpecLibraryOpen(false)} onChange={handleSetLibrarySpecs} onApplyTemplate={handleApplyTemplate} nodes={nodes.map((n) => ({ id: n.id, label: n.label }))} />}

      <QuickStartDialog
        open={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        workspaceId={wid}
        onImported={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))}
        onCreateObjects={(items) => { ensureLibrarySpec('main_positioning'); return handleCreateObjects(items); }}
        onConfirmMany={async (ids) => { for (const id of ids) await setStatus(id, 'Confirmed'); }}
        nodes={nodes}
        onGoToNode={(nodeId) => { setActiveTab('context'); setContextViewMode('doc'); revealWhenThere(`node-${nodeId}`); }}
        onOpenThinking={() => openThinkingSpace()}
        onSampleDone={(firstDeliverable) => {
          ensureLibrarySpec('main_positioning');
          void (async () => {
            if (!(await persistDeliverable(firstDeliverable))) return;
            if (firstDeliverable.usage) {
              await persistLedger(ledgerEntryFromUsage({ workspaceId: wid, action: 'خروجی نمونهٔ شروع سریع', mode: 'auto', creditCost: 0, usage: firstDeliverable.usage, plan: firstDeliverable.plan, id: `led_onb_${Date.now()}` }));
            }
          })();
        }}
      />

      {/* Plan Selection Modal (Starter / Pro / Max - F6) */}
      <PlanSelectionModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        currentWorkspace={currentWorkspace}
        onSelectPlan={(pid) => {
          handleChangePlan(pid);
          setIsPlanModalOpen(false);
        }}
      />

      {/* Account Modal (F1 - Mobile OTP, JSON Data Export, 30-day Deletion) */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        currentWorkspace={currentWorkspace}
        onExportAllData={handleExportAllData}
        onOpenArchive={() => setArchiveOpen(true)}
        onArchiveWorkspace={handleArchiveWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onDeleteEverything={handleDeleteEverything}
      />

      {/* Custom Spec Modal (F8) */}
      <SpecEditorModal
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
      />

      <NodeEffectDialog
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
      />
      <NodeReaderDialog nodeId={readNodeId} nodes={nodes} objects={workspaceContexts} relationships={data?.relationships ?? []} onClose={() => setReadNodeId(null)} />
      <StarterDialog open={isStarterOpen} samplesCount={data?.samples?.length ?? 0} onClose={() => setIsStarterOpen(false)} onApply={handleApplyStarter} onRemoveAll={() => handleDeleteSamples()} />
      <Dialog
        open={!!templateDraft}
        onClose={() => setTemplateDraft(null)}
        size="sm"
        title="ذخیره به‌عنوان قالب"
        footer={<><Button variant="ghost" onClick={() => setTemplateDraft(null)}>انصراف</Button><Button variant="primary" disabled={!templateDraft?.name.trim()} onClick={handleSaveTemplate}>ذخیرهٔ قالب</Button></>}
      >
        <div className="flex flex-col gap-stack-sm">
          <TextField label="نام قالب" value={templateDraft?.name ?? ''} onChange={(e) => setTemplateDraft((d) => (d ? { ...d, name: e.target.value } : d))} />
          <p className="body-sm text-text-subtle">{templateDraft?.kind === 'node' ? 'گره، زیرگره‌ها و دانش تأییدشدهٔ داخلش ذخیره می‌شود؛ هر جا بیاوری، دانش‌ها «نمونهٔ خاکستری» می‌شوند.' : 'خودِ جریان کار (هدف، موارد لازم و خروجی‌ها) ذخیره می‌شود.'}</p>
        </div>
      </Dialog>
      <UsageDialog open={usageOpen} onClose={() => setUsageOpen(false)} />
      <CommandPalette open={paletteOpen} index={searchIdx} onClose={() => setPaletteOpen(false)} onPick={handlePick} />
      <ContextPackDialog workspaceId={wid} target={packTarget} onClose={() => setPackTarget(null)} onOpenImport={() => setIsImportOpen(true)} />
      <ImportAnswerDialog open={isImportOpen} workspaceId={wid} nodes={nodes} objects={workspaceContexts} onClose={() => setIsImportOpen(false)} onProposeContext={handleProposeFromImport} onUpdateDraft={handleDraftFromImport} onSaveAsset={persistDeliverable} />
      <KnowledgeBatchDialog open={isBatchOpen} onClose={() => setIsBatchOpen(false)} nodes={nodes} onPropose={handleProposeBatch} />
      <MemoryImportDialog open={isMemoryOpen} workspaceId={wid} onClose={() => setIsMemoryOpen(false)} onImported={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))} />
      <Dialog
        open={demoConfirm}
        onClose={() => setDemoConfirm(false)}
        size="sm"
        title="بازنشانی فضای نمونه؟"
        footer={<><Button variant="ghost" onClick={() => setDemoConfirm(false)}>انصراف</Button><Button variant="primary" loading={demoBusy} onClick={handleResetDemo}>بازنشانی</Button></>}
      >
        <p className="body-md text-text-default">همهٔ داده‌های «فضای نمونه» (دانش، یادداشت، دارایی، تاریخچه) پاک و از نو ساخته می‌شود. فضاهای دیگرت دست نمی‌خورند.</p>
      </Dialog>

      <MetricsDialog
        open={metricsOpen}
        onClose={() => setMetricsOpen(false)}
        metrics={metrics}
        measurements={measurements}
        objects={workspaceContexts}
        changes={data?.changes ?? []}
        {...metricHandlers}
        onOpenObject={(o) => { setMetricsOpen(false); openContext(o); }}
      />
      <WeeklyReviewDialog
        open={weeklyOpen}
        onClose={() => setWeeklyOpen(false)}
        data={weekly}
        inheritNotices={inheritNotices}
        onSeenInherit={markInheritSeen}
        onOpenSection={(id) => { setWeeklyOpen(false); setActiveTab('context'); setContextViewMode('doc'); goFocus(id); }}
        readiness={readinessPerWorkstream([...(data?.specs ?? []), ...enabledLibrary.filter((s) => !(data?.specs ?? []).some((x) => x.id === s.id))], workspaceContexts, data?.relationships ?? [])}
        objects={workspaceContexts}
        deliverables={deliverables}
        onAcceptReview={async (id) => { await handleAcceptReview(id, true); }}
        onConfirm={async (id) => { await setStatus(id, 'Confirmed'); }}
        onOpenObject={(o) => { setWeeklyOpen(false); openContext(o); }}
        dueProps={dueProps}
        metricsEntry={{ metrics, measurements, onSubmit: metricHandlers.onRecord, onCsv: metricHandlers.onCsv }}
        onDone={async () => { const r = await attempt(() => dataApi.weeklyReviewDone(wid)); if (r) patch((d) => ({ ...d, weeklyReviewAt: r.weeklyReviewAt })); }}
      />
      <NodeThreadPanel
        open={!!threadNodeId}
        workspaceId={wid}
        node={nodes.find((n) => n.id === threadNodeId) ?? null}
        onClose={() => setThreadNodeId(null)}
        onProposed={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))}
        onSummary={(note, ledger) => patch((d) => ({ ...d, notes: [note, ...d.notes], ledger }))}
      />
      {/* New workspace dialog */}
      <Dialog
        open={isNewWorkspaceModalOpen}
        onClose={() => setIsNewWorkspaceModalOpen(false)}
        size="sm"
        title="ایجاد فضای کاری جدید"
        description="هر فضای کاری داده‌های منبع حقیقت، دارایی‌ها و تاریخچهٔ جداگانه‌ای دارد."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsNewWorkspaceModalOpen(false)}>انصراف</Button>
            <Button variant="primary" type="submit" form="new-workspace-form">ایجاد فضای کاری</Button>
          </>
        }
      >
        <form id="new-workspace-form" onSubmit={handleCreateWorkspace}>
          <TextField
            label="نام فضای کاری یا نام برند"
            required
            placeholder="مثلاً: استودیو دیزاین نوین"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
          />
        </form>
      </Dialog>

    </div>
  );
}
