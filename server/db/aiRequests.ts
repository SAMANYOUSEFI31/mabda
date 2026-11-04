import { buildAiRequest, gapsInScope } from '../../src/core/aiRequest.ts';
import type { AiRequestResult, RequestKind } from '../../src/core/aiRequest.ts';
import { enabledBuiltInSpecs } from '../../src/core/specs.ts';
import type { Repo, Scope } from './repo.ts';

export interface AiRequestOptions {
  kind: RequestKind;
  request: string;
  scopeNodeId?: string;
  /** several sections (a saved request); `scopeNodeId` is the same for one */
  scopeNodeIds?: string[];
  /** the sub-sections of the picked sections are read too (default: yes — the same rule as the node chat and the audit's gaps) */
  withChildren?: boolean;
  tokenBudget?: number;
  extraIds?: string[];
  focusObjectId?: string;
  packId?: string;
}

/**
 * «درخواست برای AI», resolved NOW from the repo: objects come from `repo.listObjects` (samples are not there), so the UI
 * preview, the copy button, a saved request and the MCP prompts all show the same text (src/core/aiRequest.ts).
 */
export function renderAiRequest(repo: Repo, s: Scope, o: AiRequestOptions, now: Date): AiRequestResult {
  const ws = repo.getWorkspace(s.userId, s.workspaceId);
  const nodes = repo.listNodes(s);
  const objects = repo.listObjects(s);
  const scopeNodeIds = [...new Set([...(o.scopeNodeIds ?? []), ...(o.scopeNodeId ? [o.scopeNodeId] : [])])].filter((id) => nodes.some((n) => n.id === id));
  const specs = [...repo.listSpecs(s), ...enabledBuiltInSpecs(ws)];
  return buildAiRequest({
    kind: o.kind, request: o.request, scopeNodeIds, withChildren: o.withChildren ?? true, tokenBudget: o.tokenBudget, workspaceName: ws?.name ?? '', nodes, objects,
    relationships: repo.listRelationships(s), now, extraIds: o.extraIds, focusObjectId: o.focusObjectId, packId: o.packId,
    changes: o.kind === 'change_review' ? repo.listChanges(s) : undefined,
    metrics: { metrics: repo.listMetrics(s), measurements: repo.listMeasurements(s), changes: repo.listChanges(s) },
    gaps: o.kind === 'audit' ? gapsInScope(specs, objects, nodes, scopeNodeIds, repo.listJudgments(s)) : undefined,
  });
}
