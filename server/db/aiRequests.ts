import { buildAiRequest, gapsInScope } from '../../src/core/aiRequest.ts';
import type { AiRequestResult, RequestKind } from '../../src/core/aiRequest.ts';
import { enabledBuiltInSpecs } from '../../src/core/specs.ts';
import type { Repo, Scope } from './repo.ts';

export interface AiRequestOptions {
  kind: RequestKind;
  request: string;
  scopeNodeId?: string;
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
  const scopeNodeId = o.scopeNodeId && nodes.some((n) => n.id === o.scopeNodeId) ? o.scopeNodeId : undefined;
  const specs = [...repo.listSpecs(s), ...enabledBuiltInSpecs(ws)];
  return buildAiRequest({
    kind: o.kind, request: o.request, scopeNodeId, tokenBudget: o.tokenBudget, workspaceName: ws?.name ?? '', nodes, objects,
    relationships: repo.listRelationships(s), now, extraIds: o.extraIds, focusObjectId: o.focusObjectId, packId: o.packId,
    changes: o.kind === 'change_review' ? repo.listChanges(s) : undefined,
    metrics: { metrics: repo.listMetrics(s), measurements: repo.listMeasurements(s), changes: repo.listChanges(s) },
    gaps: o.kind === 'audit' ? gapsInScope(specs, objects, nodes, scopeNodeId, repo.listJudgments(s)) : undefined,
  });
}
