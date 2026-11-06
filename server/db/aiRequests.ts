import { buildAiRequest, gapsInScope } from '../../src/core/aiRequest.ts';
import type { AiRequestResult, RequestKind } from '../../src/core/aiRequest.ts';
import { enabledBuiltInSpecs } from '../../src/core/specs.ts';
import { RepoError } from './repo.ts';
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
  thoughtIds?: string[];
  packId?: string;
}

/**
 * «درخواست برای AI», resolved NOW from the repo: objects come from `repo.listObjects` (samples are not there), so the UI
 * preview, the copy button and a saved request all show the same text (src/core/aiRequest.ts).
 */
export function renderAiRequest(repo: Repo, s: Scope, o: AiRequestOptions, now: Date): AiRequestResult {
  const ws = repo.getWorkspace(s.userId, s.workspaceId);
  const nodes = repo.listNodes(s);
  const objects = repo.listObjects(s);
  const thoughtIds = [...new Set(o.thoughtIds ?? [])];
  if (thoughtIds.length > 12) throw new RepoError('invalid', 'حداکثر ۱۲ فکر را می‌توان برای یک درخواست انتخاب کرد.');
  const availableThoughts = repo.listThoughts(s).filter((t) => thoughtIds.includes(t.id));
  if (availableThoughts.length !== thoughtIds.length) throw new RepoError('invalid', 'یکی از فکرهای انتخاب‌شده دیگر باز نیست یا پیدا نشد؛ فهرست را تازه کن.');
  const scopeNodeIds = [...new Set([...(o.scopeNodeIds ?? []), ...(o.scopeNodeId ? [o.scopeNodeId] : [])])].filter((id) => nodes.some((n) => n.id === id));
  const specs = [...repo.listSpecs(s), ...enabledBuiltInSpecs(ws)];
  return buildAiRequest({
    kind: o.kind, request: o.request, scopeNodeIds, withChildren: o.withChildren ?? true, tokenBudget: o.tokenBudget, workspaceName: ws?.name ?? '', nodes, objects,
    relationships: repo.listRelationships(s), now, extraIds: o.extraIds, focusObjectId: o.focusObjectId, packId: o.packId,
    thoughts: availableThoughts.map(({ id, kind, text, nodeId }) => ({ id, kind, text, nodeId })),
    changes: o.kind === 'change_review' ? repo.listChanges(s) : undefined,
    metrics: { metrics: repo.listMetrics(s), measurements: repo.listMeasurements(s), changes: repo.listChanges(s) },
    gaps: o.kind === 'audit' ? gapsInScope(specs, objects, nodes, scopeNodeIds, repo.listJudgments(s)) : undefined,
  });
}
