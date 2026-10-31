import type { ContextSource } from '../ai/routes.ts';
import { AiError } from '../ai/errors.ts';
import type { ContextObjectLite } from '../ai/context.ts';
import { ancestorIds, subtreeIds } from '../../src/core/nodeTree.ts';
import type { FileService } from '../files/service.ts';
import type { Repo, Scope } from './repo.ts';

const live = (o: { status: string }) => o.status !== 'Archived' && o.status !== 'Superseded';

/**
 * Builds what the AI gets from the database. Notes are never read here (they are not injected).
 * Chat with a scope node: the node's sub-tree + its ancestors (inheritance) are the context;
 * proposals may only target the sub-tree.
 */
export function createContextSource(repo: Repo, files: FileService, userId: string): ContextSource {
  const scopeOf = (workspaceId: string): Scope => {
    if (!repo.getWorkspace(userId, workspaceId)) throw new AiError('bad_request', { message: 'فضای کاری پیدا نشد.', retryable: false });
    return { userId, workspaceId };
  };
  const lite = (s: Scope, nodeIds?: Set<string>): ContextObjectLite[] =>
    repo.listObjects(s).filter((o) => live(o) && (!nodeIds || nodeIds.has(o.nodeId))).map((o) => ({
      id: o.id, type: o.type, status: o.status, title: o.title, content: o.content, nodeId: o.nodeId, version: o.version, createdAt: o.createdAt,
    }));

  return {
    forChat(workspaceId, { scopeNodeId, message }) {
      const s = scopeOf(workspaceId);
      const nodes = repo.listNodes(s);
      const nodeLabels = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
      const excerpts = files.excerpts(s, message);
      if (scopeNodeId && nodes.some((n) => n.id === scopeNodeId)) {
        const sub = subtreeIds(nodes, scopeNodeId);
        const visible = new Set([...sub, ...ancestorIds(nodes, scopeNodeId)]);
        return { contextList: lite(s, visible), nodeLabels, scopeNodeId, allowedNodeIds: sub, focusNodeIds: [scopeNodeId], excerpts };
      }
      return { contextList: lite(s), nodeLabels, excerpts };
    },

    forGenerate(workspaceId, { targetNodeId, title, criteria, dependencyAssetIds }) {
      const s = scopeOf(workspaceId);
      const nodes = repo.listNodes(s);
      // '*' = the whole workspace (onboarding's first asset uses every fact the user just confirmed)
      const target = targetNodeId && nodes.some((n) => n.id === targetNodeId) ? targetNodeId : 'content';
      const chain = targetNodeId === '*' ? new Set(nodes.map((n) => n.id)) : new Set(ancestorIds(nodes, target));
      return {
        contextObjects: lite(s, chain), contextList: lite(s), nodeLabels: Object.fromEntries(nodes.map((n) => [n.id, n.label])),
        excerpts: files.excerpts(s, `${title}\n${criteria.join('\n')}`),
        // finished outputs this deliverable depends on, read from the database (not from the browser)
        dependencyOutputs: (dependencyAssetIds ?? []).map((id) => repo.getDeliverable(s, id)).filter((d): d is NonNullable<typeof d> => !!d).map((d) => ({ title: d.title, markdown: d.content })),
      };
    },
  };
}
