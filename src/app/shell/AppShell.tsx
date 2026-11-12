/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The frame of every page: the navigation, the top status bar and the main area; the dialogs sit beside it. */

import { AiStatusBanner } from '../../components/shared/AiNotices';
import { AppNavigation } from '../../components/shell/AppNavigation';
import { TopStatusBar } from '../../components/shell/TopStatusBar';
import type { ReactNode } from 'react';
import type { ReadyScope } from '../shared';

export type AppShellProps = Pick<ReadyScope, 'activeTab' | 'focusNodeId' | 'goFocus' | 'nodes' | 'contextViewMode' | 'currentWorkspace' | 'deliverables' | 'handleResetDemo' | 'liveWorkspaces' | 'openSpecEditor' | 'pageAction' | 'selectedSpecId' | 'setActiveTab' | 'setArchiveOpen' | 'setChatScope' | 'setContextViewMode' | 'setCurrentWorkspaceId' | 'setDemoConfirm' | 'setDemoDelete' | 'setIsAccountModalOpen' | 'setIsMemoryOpen' | 'setIsNewWorkspaceModalOpen' | 'setIsOnboardingOpen' | 'setIsPlanModalOpen' | 'setIsSpecLibraryOpen' | 'setPaletteOpen' | 'setSelectedSpecId' | 'setUsageOpen' | 'specs' | 'thinkingBadge' | 'workspaceContexts' | 'workspaces'> & { children: ReactNode } & { dialogs: ReactNode };

/** the places under «منبع»: the top level; when the tree has one root (as the work tree «بنیان» does), the level under it */
const topSections = (nodes: ReadyScope['nodes']) => {
  const kids = (pid: string | undefined) => nodes.filter((n) => (n.parentId ?? undefined) === pid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const roots = kids(undefined);
  return roots.length === 1 && kids(roots[0].id).length ? kids(roots[0].id) : roots;
};

export function AppShell({ activeTab, focusNodeId, goFocus, nodes, contextViewMode, currentWorkspace, deliverables, handleResetDemo, liveWorkspaces, openSpecEditor, pageAction, selectedSpecId, setActiveTab, setArchiveOpen, setChatScope, setContextViewMode, setCurrentWorkspaceId, setDemoConfirm, setDemoDelete, setIsAccountModalOpen, setIsMemoryOpen, setIsNewWorkspaceModalOpen, setIsOnboardingOpen, setIsPlanModalOpen, setIsSpecLibraryOpen, setPaletteOpen, setSelectedSpecId, setUsageOpen, specs, thinkingBadge, workspaceContexts, workspaces, children, dialogs }: AppShellProps) {
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
        sections={topSections(nodes)}
        focusNodeId={focusNodeId}
        onOpenSection={(id) => { setActiveTab('context'); goFocus(id); }}
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
          {children}
        </main>
      </div>

      {dialogs}
    </div>
  );
}
