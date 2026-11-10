/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WorkspaceState } from '../../types/state';
import type { AppCoreScope } from '../shell/useAppCore';

export type NodeActionsScope = ReturnType<typeof useNodeActions>;

export function useNodeActions(p: AppCoreScope) {
  const { attempt, patch } = p;
  // ── tree nodes ──────────────────────────────────────────────────────────────────────────────────
  const nodeOp = async (fn: () => Promise<{ nodes: WorkspaceState['nodes'] } & Partial<WorkspaceState>>) => {
    const r = await attempt(fn);
    if (!r) throw new Error('node op failed');
    patch((d) => ({ ...d, nodes: r.nodes, ...(r.objects ? { objects: r.objects } : {}), ...(r.notes ? { notes: r.notes } : {}), ...(r.files ? { files: r.files } : {}) }));
  };
  return { nodeOp };
}
