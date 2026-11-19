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
import { useAiStatus } from '../services/aiStatus';
import { flashScrollbar } from '../ui/scrollbars';
import { logUi, setActivitySpace } from '../services/activity';
import type { AppScope, ReadyScope } from './shared';

/**
 * The whole screen: it only picks what to draw. Before the workspace is loaded: the first-run or boot screen; after it: the shell
 * around the page of the active tab. Every page (and every group of dialogs) lives in the folder of its domain (src/app/<domain>/)
 * and asks for exactly the props it uses; every piece of state and every handler comes from the hooks.
 */
export function AppView(p: AppScope) {
  // the production workshop (workstreams, specs, generation) is not a place any more (docs/product-scope.md): only Mabda's own
  // rebuild, frozen behind MABDA_MANAGED_AI, still opens it; any other way there (an old link, a stored tab) lands on «خروجی‌ها»
  const { managedEnabled } = useAiStatus();
  // a page opened: its bar shows for a moment, so a long page says so (layout.md «اسکرول و نوار اسکرول», goal 2)
  const shown = p.data ? `${p.activeTab}:${p.currentWorkspace?.id}` : '';
  useEffect(() => { if (shown) flashScrollbar(); }, [shown]);
  // the user-test record: which screen, in which space, with a section in focus or not (src/services/activity.ts)
  const firstRun = p.boot.status === 'ready' && p.liveWorkspaces.length === 0;
  const screen = firstRun ? 'first-run' : p.data ? `${p.activeTab}|${p.currentWorkspace?.id ?? ''}|${p.focusNodeId ? 1 : 0}` : '';
  useEffect(() => {
    if (!screen) return;
    setActivitySpace(firstRun ? undefined : p.currentWorkspace?.id);
    logUi('view', { tab: firstRun ? 'first-run' : p.activeTab, section: !!p.focusNodeId, sample: !!p.currentWorkspace?.isDemo });
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p.boot.status === 'ready' && p.liveWorkspaces.length === 0) return <FirstRunScreen {...p} />;
  if (p.boot.status !== 'ready' || !p.currentWorkspace || !p.data) return <BootScreen {...p} />;
  const ready: ReadyScope = { ...p, data: p.data, currentWorkspace: p.currentWorkspace };

  const page = (
    <>
      {ready.activeTab === 'home' && <HomePage {...ready} />}
      {ready.activeTab === 'context' && <KnowledgePage {...ready} />}
      {ready.activeTab === 'thinking' && <ThinkingPage {...ready} />}
      {ready.activeTab === 'workstreams' && managedEnabled && <WorkstreamsPage {...ready} />}
      {(ready.activeTab === 'assets' || (ready.activeTab === 'workstreams' && !managedEnabled)) && <AssetsPage {...ready} />}
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
