/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAppCore } from './app/shell/useAppCore';
import { useSearchAndFocus } from './app/shell/useSearchAndFocus';
import { useUsageCounters } from './app/shell/useUsageCounters';
import { useKnowledge } from './app/knowledge/useKnowledge';
import { useThinkingItems } from './app/thinking/useThinkingItems';
import { useHome } from './app/home/useHome';
import { useMetrics } from './app/metrics/useMetrics';
import { useStarters } from './app/structure/useStarters';
import { useBoards } from './app/canvas/useBoards';
import { useNodeActions } from './app/structure/useNodeActions';
import { useNotes } from './app/thinking/useNotes';
import { useFiles } from './app/files/useFiles';
import { useWorkspaceAssets } from './app/workspace/useWorkspaceAssets';
import { useRemovalAndDialogs } from './app/shell/useRemovalAndDialogs';
import { AppView } from './app/AppView';

/**
 * Mabda: the shell. All state and handlers live in the hooks of src/app/* (one per concern, called in a fixed order: a hook only
 * receives what the hooks before it produced); the screen is drawn by AppView. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
export default function App() {
  const appCore = useAppCore();
  const searchAndFocus = useSearchAndFocus({ ...appCore });
  const usageCounters = useUsageCounters({ ...appCore, ...searchAndFocus });
  const knowledge = useKnowledge({ ...appCore, ...searchAndFocus, ...usageCounters });
  const thinkingItems = useThinkingItems({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge });
  const home = useHome({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems });
  const metrics = useMetrics({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems, ...home });
  const starters = useStarters({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems, ...home, ...metrics });
  const boards = useBoards({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems, ...home, ...metrics, ...starters });
  const nodeActions = useNodeActions({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems, ...home, ...metrics, ...starters, ...boards });
  const notes = useNotes({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems, ...home, ...metrics, ...starters, ...boards, ...nodeActions });
  const files = useFiles({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems, ...home, ...metrics, ...starters, ...boards, ...nodeActions, ...notes });
  const workspaceAssets = useWorkspaceAssets({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems, ...home, ...metrics, ...starters, ...boards, ...nodeActions, ...notes, ...files });
  const removalAndDialogs = useRemovalAndDialogs({ ...appCore, ...searchAndFocus, ...usageCounters, ...knowledge, ...thinkingItems, ...home, ...metrics, ...starters, ...boards, ...nodeActions, ...notes, ...files, ...workspaceAssets });
  return <AppView {...appCore} {...searchAndFocus} {...usageCounters} {...knowledge} {...thinkingItems} {...home} {...metrics} {...starters} {...boards} {...nodeActions} {...notes} {...files} {...workspaceAssets} {...removalAndDialogs} />;
}
