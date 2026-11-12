/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppDialogs } from './shell/AppDialogs';
import { AppShell } from './shell/AppShell';
import { AssetsPage } from './outputs/AssetsPage';
import { BootScreen } from './shell/BootScreen';
import { FirstRunScreen } from './shell/FirstRunScreen';
import { HomePage } from './home/HomePage';
import { KnowledgePage } from './knowledge/KnowledgePage';
import { LedgerPage } from './workspace/LedgerPage';
import { ThinkingPage } from './thinking/ThinkingPage';
import { WorkstreamsPage } from './outputs/WorkstreamsPage';
import { useEffect } from 'react';
import { ErrorState } from '../ui';
import { flashScrollbar } from '../ui/scrollbars';
import type { AppScope, ReadyScope } from './shared';

/**
 * The whole screen: it only picks what to draw. Before the workspace is loaded: the first-run or boot screen; after it: the shell
 * around the page of the active tab. Every page (and every group of dialogs) lives in the folder of its domain (src/app/<domain>/)
 * and asks for exactly the props it uses; every piece of state and every handler comes from the hooks.
 */
export function AppView(p: AppScope) {
  // a page opened: its bar shows for a moment, so a long page says so (layout.md «اسکرول و نوار اسکرول», goal 2)
  const shown = p.data ? `${p.activeTab}:${p.currentWorkspace?.id}` : '';
  useEffect(() => { if (shown) flashScrollbar(); }, [shown]);
  if (p.boot.status === 'ready' && p.liveWorkspaces.length === 0) return <FirstRunScreen {...p} />;
  if (p.boot.status !== 'ready' || !p.currentWorkspace || !p.data) return <BootScreen {...p} />;
  const ready: ReadyScope = { ...p, data: p.data, currentWorkspace: p.currentWorkspace };

  const page = (
    <>
      {ready.activeTab === 'home' && <HomePage {...ready} />}
      {ready.activeTab === 'context' && <KnowledgePage {...ready} />}
      {ready.activeTab === 'thinking' && <ThinkingPage {...ready} />}
      {ready.activeTab === 'workstreams' && <WorkstreamsPage {...ready} />}
      {ready.activeTab === 'assets' && <AssetsPage {...ready} />}
      {ready.activeTab === 'ledger' && <LedgerPage {...ready} />}
    </>
  );
  // patterns.md §5: while another space is coming, the page she was on stays (still, not dimmed, not clickable); a failure shows in its place
  const switching = ready.data.workspace.id !== ready.currentWorkspaceId;
  return (
    <AppShell {...ready} dialogs={<AppDialogs {...ready} />}>
      {p.loadError ? (
        <ErrorState
          title="این فضا باز نشد"
          description="به سرور نرسیدیم. چیزی از نوشته‌هایت پاک نشده است."
          onRetry={() => void p.reload(p.currentWorkspaceId)}
          details={p.loadError}
        />
      ) : switching ? (
        <div className="contents" inert aria-busy="true">
          <span role="status" className="sr-only">در حال آوردن {ready.currentWorkspace.name}</span>
          {page}
        </div>
      ) : page}
    </AppShell>
  );
}
