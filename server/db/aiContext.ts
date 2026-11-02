import type { ContextSource } from '../ai/routes.ts';
import { AiError } from '../ai/errors.ts';
import type { ContextObjectLite } from '../ai/context.ts';
import { subtreeIds } from '../../src/core/nodeTree.ts';
import { effectiveObjects, isExpired, reachOf } from '../../src/core/effectiveContext.ts';
import type { ContextObject } from '../../src/types/index.ts';
import type { FileService } from '../files/service.ts';
import type { Repo, Scope } from './repo.ts';

const live = (o: { status: string }) => o.status !== 'Archived' && o.status !== 'Superseded';

/**
 * Builds what the AI gets from the database. Notes are never read here (they are not injected).
 * Chat with a scope node: the node's sub-tree + its ancestors (inheritance) are the context;
 * proposals may only target the sub-tree.
 */
export function createContextSource(repo: Repo, files: FileService, userId: string, clock: () => Date = () => new Date()): ContextSource {
  const scopeOf = (workspaceId: string): Scope => {
    if (!repo.getWorkspace(userId, workspaceId)) throw new AiError('bad_request', { message: 'فضای کاری پیدا نشد.', retryable: false });
    return { userId, workspaceId };
  };
  const toLite = (o: ContextObject): ContextObjectLite => ({
    id: o.id, type: o.type, status: o.status, title: o.title, content: o.content, nodeId: o.nodeId, version: o.version, createdAt: o.createdAt,
  });
  /**
   * Whole-workspace view (no node): everything live and not expired. A Constraint that only applies to its own section
   * (reach = position) is NOT a rule for the whole workspace.
   */
  const whole = (s: Scope): ContextObjectLite[] =>
    repo.listObjects(s).filter((o) => live(o) && !isExpired(o, clock()) && !(o.type === 'Constraint' && reachOf(o) === 'position')).map(toLite);
  /**
   * What is IN FORCE at a node (src/core/effectiveContext.ts): its own and inherited objects, global Constraints, minus
   * exceptions and expired ones. Node chat also sees the node's sub-tree (that is where it may propose).
   */
  const effective = (s: Scope, nodeId: string, withSubtree = false): ContextObjectLite[] => {
    const nodes = repo.listNodes(s);
    const all = repo.listObjects(s);
    const list = new Map(effectiveObjects(nodeId, all, nodes, repo.listRelationships(s), clock()).map((o) => [o.id, o]));
    if (withSubtree) {
      const sub = new Set(subtreeIds(nodes, nodeId));
      for (const o of all) if (sub.has(o.nodeId) && live(o) && !isExpired(o, clock())) list.set(o.id, o);
    }
    return [...list.values()].map(toLite);
  };

  return {
    forChat(workspaceId, { scopeNodeId, message, threadOnly }) {
      const s = scopeOf(workspaceId);
      const nodes = repo.listNodes(s);
      const nodeLabels = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
      const excerpts = files.excerpts(s, message);
      if (scopeNodeId && nodes.some((n) => n.id === scopeNodeId)) {
        const sub = threadOnly ? [scopeNodeId] : subtreeIds(nodes, scopeNodeId);
        return { contextList: effective(s, scopeNodeId, !threadOnly), nodeLabels, scopeNodeId, allowedNodeIds: sub, focusNodeIds: [scopeNodeId], excerpts };
      }
      return { contextList: whole(s), nodeLabels, excerpts };
    },

    forGenerate(workspaceId, { targetNodeId, title, criteria, dependencyAssetIds }) {
      const s = scopeOf(workspaceId);
      const nodes = repo.listNodes(s);
      // '*' = the whole workspace (onboarding's first asset uses every fact the user just confirmed)
      const target = targetNodeId && nodes.some((n) => n.id === targetNodeId) ? targetNodeId : 'content';
      // the list IN FORCE at the target node is both what the model reads and where the guardrails come from
      const inForce = targetNodeId === '*' ? whole(s) : effective(s, target);
      return {
        contextObjects: inForce, contextList: inForce, nodeLabels: Object.fromEntries(nodes.map((n) => [n.id, n.label])),
        excerpts: files.excerpts(s, `${title}\n${criteria.join('\n')}`),
        // finished outputs this deliverable depends on, read from the database (not from the browser)
        dependencyOutputs: (dependencyAssetIds ?? []).map((id) => repo.getDeliverable(s, id)).filter((d): d is NonNullable<typeof d> => !!d).map((d) => ({ title: d.title, markdown: d.content })),
      };
    },
  };
}
