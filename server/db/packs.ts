import type { ContextPack } from '../../src/core/contextPack.ts';
import { buildContextPack } from '../../src/core/contextPack.ts';
import { explainOfRequest } from '../../src/core/aiRequest.ts';
import type { SavedPack } from '../../src/types/index.ts';
import type { Repo, Scope } from './repo.ts';
import { renderAiRequest } from './aiRequests.ts';

/**
 * A saved pack, resolved NOW: the objects come from `repo.listObjects` (samples are not there), scope from the effective
 * context at the chosen nodes (docs/spine.md), assumptions and rejected options in their own sections, the user's short
 * instruction on top. The same function feeds the UI preview, the copy button and the MCP tools — one truth.
 */
export function renderSavedPack(repo: Repo, s: Scope, pack: SavedPack, now: Date): ContextPack {
  // a saved «درخواست برای AI»: the kind and the one line are resolved afresh, on the first selected node
  if (pack.kind) {
    // EVERY picked section is read (a saved request is the same selection as a pack), with or without its sub-sections
    const r = renderAiRequest(repo, s, { kind: pack.kind, request: pack.template ?? '', scopeNodeIds: pack.selection.nodeIds, withChildren: pack.selection.withChildren === true, packId: pack.id }, now);
    return { explain: explainOfRequest(r), markdown: r.markdown, tokens: r.tokens, chars: r.chars, refs: r.refs, counts: { confirmed: r.counts.facts + r.counts.constraints + r.counts.decisions, proposed: 0, assumptions: r.counts.assumptions, rejected: r.counts.rejected, gaps: r.counts.gaps, guardrails: r.counts.constraints, metrics: r.counts.metrics } };
  }
  const ws = repo.getWorkspace(s.userId, s.workspaceId);
  return buildContextPack({
    packId: pack.id, workspaceName: ws?.name ?? '', nodes: repo.listNodes(s), objects: repo.listObjects(s), relationships: repo.listRelationships(s), now,
    targetNodeIds: pack.selection.nodeIds, withChildren: pack.selection.withChildren === true, facets: pack.selection.facets, statuses: pack.selection.statuses, includeAssumptions: pack.selection.includeAssumptions, instruction: pack.instruction,
    judgments: repo.listJudgments(s),
    metrics: { metrics: repo.listMetrics(s), measurements: repo.listMeasurements(s), changes: repo.listChanges(s) },
  });
}
