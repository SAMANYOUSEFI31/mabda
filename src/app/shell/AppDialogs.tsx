/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextDialogs } from '../context/ContextDialogs';
import { HomeDialogs } from '../home/HomeDialogs';
import { KnowledgeDialogs } from '../knowledge/KnowledgeDialogs';
import { MetricsDialogs } from '../metrics/MetricsDialogs';
import { OutputsDialogs } from '../outputs/OutputsDialogs';
import { StructureDialogs } from '../structure/StructureDialogs';
import { ThinkingDialogs } from '../thinking/ThinkingDialogs';
import { WorkspaceDialogs } from '../workspace/WorkspaceDialogs';
import { QuickCapture } from './QuickCapture';
import { ShellDialogs } from './ShellDialogs';
import type { ReadyScope } from '../shared';

/**
 * Every dialog of the app, one group per domain (each group lives next to the domain's page and hook). Dialogs are portals to
 * <body>, so their order here does not change how they stack: the one opened last is on top.
 */
export function AppDialogs(p: ReadyScope) {
  return (
    <>
      <ThinkingDialogs {...p} />
      <KnowledgeDialogs {...p} />
      <WorkspaceDialogs {...p} />
      <ContextDialogs {...p} />
      <StructureDialogs {...p} />
      <OutputsDialogs {...p} />
      <MetricsDialogs {...p} />
      <HomeDialogs {...p} />
      <ShellDialogs {...p} />
      <QuickCapture {...p} />
    </>
  );
}
