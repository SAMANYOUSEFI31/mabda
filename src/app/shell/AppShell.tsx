/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The frame of every page: the navigation, the top status bar and the main area; the dialogs sit beside it. */

import { AiStatusBanner } from '../../components/shared/AiNotices';
import { AppNavigation } from '../../components/shell/AppNavigation';
import type { ReactNode } from 'react';
import type { ReadyScope } from '../shared';
import { Shortcuts } from '../../components/shell/Shortcuts';
import { WelcomeTour } from '../../components/shell/WelcomeTour';
import { useState } from 'react';
import { Button } from '../../ui';
import { primarySections } from '../../core/nodeTree';

export type AppShellProps = Pick<ReadyScope, 'activeTab' | 'focusNodeId' | 'goFocus' | 'nodes' | 'contextViewMode' | 'currentWorkspace' | 'deliverables' | 'handleResetDemo' | 'liveWorkspaces' | 'openSpecEditor' | 'pageAction' | 'selectedSpecId' | 'setActiveTab' | 'setArchiveOpen' | 'setChatScope' | 'setContextViewMode' | 'setCurrentWorkspaceId' | 'setDemoConfirm' | 'setDemoDelete' | 'setIsAccountModalOpen' | 'setIsMemoryOpen' | 'setIsNewWorkspaceModalOpen' | 'setIsOnboardingOpen' | 'setIsSpecLibraryOpen' | 'setPaletteOpen' | 'setSelectedSpecId' | 'setUsageOpen' | 'specs' | 'thinkingBadge' | 'workspaceContexts' | 'workspaces'> & { children: ReactNode } & { dialogs: ReactNode };

/** the places under «حقیقت»: the main sections (src/core/nodeTree.ts primarySections, one rule for every view; §۵۳ ۷) */
const topSections = (nodes: ReadyScope['nodes']) => primarySections(nodes);

export function AppShell({ activeTab, focusNodeId, goFocus, nodes, contextViewMode, currentWorkspace, deliverables, handleResetDemo, liveWorkspaces, openSpecEditor, pageAction, selectedSpecId, setActiveTab, setArchiveOpen, setChatScope, setContextViewMode, setCurrentWorkspaceId, setDemoConfirm, setDemoDelete, setIsAccountModalOpen, setIsMemoryOpen, setIsNewWorkspaceModalOpen, setIsOnboardingOpen, setIsSpecLibraryOpen, setPaletteOpen, setSelectedSpecId, setUsageOpen, specs, thinkingBadge, workspaceContexts, workspaces, children, dialogs }: AppShellProps) {
  const [tourAgain, setTourAgain] = useState(0);
  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-text-default md:flex-row pb-space-24 md:pb-space-0">
      {/* WCAG 2.4.1: the first Tab offers to skip the bars and lands in the page itself */}
      <a href="#main" className="mb-skip" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); m?.focus(); m?.scrollIntoView({ block: 'start' }); }}>پرش به محتوا</a>
      {/* Sleek Right Sidebar Navigation & Mobile Drawer */}
      <AppNavigation
        currentWorkspace={currentWorkspace}
        allWorkspaces={liveWorkspaces}
        onSelectWorkspace={(ws) => { setChatScope(undefined); setCurrentWorkspaceId(ws.id); }}
        onOpenNewWorkspace={() => setIsNewWorkspaceModalOpen(true)}
        onOpenSearch={() => setPaletteOpen(true)}
        onOpenUsage={() => setUsageOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenTour={() => setTourAgain((n) => n + 1)}
        onOpenArchive={() => setArchiveOpen(true)}
        onDeleteDemo={workspaces.some((w) => w.isDemo && !w.archivedAt) ? () => setDemoDelete(true) : undefined}
        onResetDemo={() => { if (workspaces.some((w) => w.isDemo)) setDemoConfirm(true); else void handleResetDemo(); }}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onOpenLedger={() => setActiveTab('ledger')}
        onOpenMemory={() => { setActiveTab('context'); setIsMemoryOpen(true); }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sections={topSections(nodes)}
        focusNodeId={focusNodeId}
        onOpenSection={(id) => { setActiveTab('context'); goFocus(id); }}
        contextCount={workspaceContexts.length}
        deliverablesCount={deliverables.length}
        thinkingCount={thinkingBadge}
        addAction={pageAction}
      />

      <WelcomeTour request={tourAgain} />
      <Shortcuts onGoTab={setActiveTab} onGoSpace={(i) => { const ws = liveWorkspaces[i]; if (ws) { setChatScope(undefined); setCurrentWorkspaceId(ws.id); } }} />
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-space-0">

        {/* Main Canvas */}
        <main id="main" tabIndex={-1} className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl flex-1 space-y-stack-lg">
          {(activeTab === 'workstreams' || activeTab === 'chat') && <AiStatusBanner />}
          {/* §۳۷: the sample says what it is, once, quietly — a line of text, not a warning box («متن و حاشیه») */}
          {currentWorkspace.isDemo && (
            // in the page frame, like every page's header (§۵۳ ۹): its first word starts where the title under it starts
            <p className="mb-page-frame body-sm flex flex-wrap items-center gap-inline-sm text-text-subtle" data-testid="sample-note">
              <span>این فضای نمونه است و مال یک آدم فرضی است؛ هرچه این‌جا عوض کنی فقط همین‌جا می‌ماند و در فضای خودت نمی‌آید.</span>
              <Button size="sm" variant="ghost" iconStart="RotateCcw" onClick={() => setDemoConfirm(true)}>برگرداندن به حالت اول</Button>
            </p>
          )}
          {/* keyed by the page: a new page fades in place (motion.md «رفتن بین صفحه‌ها») */}
          <div key={activeTab === 'workstreams' ? 'assets' : activeTab} className="mb-page-enter space-y-stack-lg">{children}</div>
        </main>
      </div>

      {dialogs}
    </div>
  );
}
