import type { ContextPack } from '../../src/core/contextPack.ts';
import { buildContextPack } from '../../src/core/contextPack.ts';
import type { SavedPack } from '../../src/types/index.ts';
import type { Repo, Scope } from './repo.ts';

/**
 * A saved pack, resolved NOW: the objects come from `repo.listObjects` (samples are not there), scope from the effective
 * context at the chosen nodes (docs/spine.md), assumptions and rejected options in their own sections, the user's short
 * instruction on top. The same function feeds the UI preview, the copy button and the MCP tools — one truth.
 */
export function renderSavedPack(repo: Repo, s: Scope, pack: SavedPack, now: Date): ContextPack {
  const ws = repo.getWorkspace(s.userId, s.workspaceId);
  return buildContextPack({
    packId: pack.id, workspaceName: ws?.name ?? '', nodes: repo.listNodes(s), objects: repo.listObjects(s), relationships: repo.listRelationships(s), now,
    targetNodeIds: pack.selection.nodeIds, facets: pack.selection.facets, statuses: pack.selection.statuses, includeAssumptions: pack.selection.includeAssumptions, instruction: pack.instruction,
    judgments: repo.listJudgments(s),
    metrics: { metrics: repo.listMetrics(s), measurements: repo.listMeasurements(s), changes: repo.listChanges(s) },
  });
}
