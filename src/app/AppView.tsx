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
import type { AppScope, ReadyScope } from './shared';

/**
 * The whole screen: it only picks what to draw. Before the workspace is loaded: the first-run or boot screen; after it: the shell
 * around the page of the active tab. Every page (and every group of dialogs) lives in the folder of its domain (src/app/<domain>/)
 * and asks for exactly the props it uses; every piece of state and every handler comes from the hooks.
 */
export function AppView(p: AppScope) {
  if (p.boot.status === 'ready' && p.liveWorkspaces.length === 0) return <FirstRunScreen {...p} />;
  if (p.boot.status !== 'ready' || !p.currentWorkspace || !p.data) return <BootScreen {...p} />;
  const ready: ReadyScope = { ...p, data: p.data, currentWorkspace: p.currentWorkspace };

  return (
    <AppShell {...ready} dialogs={<AppDialogs {...ready} />}>
      {ready.activeTab === 'home' && <HomePage {...ready} />}
      {ready.activeTab === 'context' && <KnowledgePage {...ready} />}
      {ready.activeTab === 'thinking' && <ThinkingPage {...ready} />}
      {ready.activeTab === 'workstreams' && <WorkstreamsPage {...ready} />}
      {ready.activeTab === 'assets' && <AssetsPage {...ready} />}
      {ready.activeTab === 'ledger' && <LedgerPage {...ready} />}
    </AppShell>
  );
}
