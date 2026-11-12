import type { ContextSource } from '../ai/routes.ts';
import { AiError } from '../ai/errors.ts';
import type { ContextObjectLite } from '../ai/context.ts';
import type { ChatRequest } from '../ai/service.ts';
import { subtreeIds, treeOrder } from '../../src/core/nodeTree.ts';
import { effectiveObjects, isExpired, reachOf } from '../../src/core/effectiveContext.ts';
import { examplesOf } from '../../src/core/redlineExamples.ts';
import type { ContextObject } from '../../src/types/index.ts';
import type { FileService } from '../files/service.ts';
import type { Repo, Scope } from './repo.ts';

const rejectedOf = (o: ContextObject) => (o.record?.options ?? []).filter((x) => x.rejectedReason).map((x) => ({ title: x.title, reason: x.rejectedReason! }));
const live = (o: { status: string }) => o.status !== 'Archived' && o.status !== 'Superseded';

/**
 * Builds what the AI gets from the database. Notes are never read here (they are not injected).
 * Chat with a scope node: the node's sub-tree + its ancestors (inheritance) are the context;
 * proposals may only target the sub-tree.
 */
export function createContextSource(repo: Repo, files: FileService, userId: string, clock: () => Date = () => new Date()): ContextSource {
  const scopeOf = (workspaceId: string): Scope => {
    if (!repo.getWorkspace(userId, workspaceId)) throw new AiError('bad_request', { message: 'فضا پیدا نشد.', retryable: false });
    return { userId, workspaceId };
  };
  /** node id → its place in the tree order (depth first); read fresh per call because the tree is the user's to change */
  const rankOf = (s: Scope) => new Map(treeOrder(repo.listNodes(s)).map((id, i) => [id, i]));
  const toLite = (o: ContextObject, rank: Map<string, number>): ContextObjectLite => ({
    id: o.id, ...(rank.has(o.nodeId) ? { nodeRank: rank.get(o.nodeId) } : {}), type: o.type, status: o.status, title: o.title, content: o.content, nodeId: o.nodeId, version: o.version, createdAt: o.createdAt,
    ...(o.assumption ? { assumption: true } : {}),
    ...(examplesOf(o).length ? { examples: examplesOf(o) } : {}),
    ...(rejectedOf(o).length ? { rejected: rejectedOf(o) } : {}),
  });
  /**
   * Whole-workspace view (no node): everything live and not expired. A Constraint that only applies to its own section
   * (reach = position) is NOT a rule for the whole workspace.
   */
  const whole = (s: Scope): ContextObjectLite[] => {
    const rank = rankOf(s);
    return repo.listObjects(s).filter((o) => live(o) && !isExpired(o, clock()) && !(o.type === 'Constraint' && reachOf(o) === 'position')).map((o) => toLite(o, rank));
  };
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
    const rank = rankOf(s);
    return [...list.values()].map((o) => toLite(o, rank));
  };

  return {
    forChat(workspaceId, { scopeNodeId, scopeNodeIds, message, threadOnly, thoughtIds }) {
      const s = scopeOf(workspaceId);
      const nodes = repo.listNodes(s);
      const nodeLabels = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
      const excerpts = files.excerpts(s, message);
      let context: Partial<ChatRequest>;
      if (scopeNodeIds !== undefined) {
        const ids = [...new Set(scopeNodeIds)];
        if (!ids.length || ids.some((id) => !nodes.some((n) => n.id === id))) {
          throw new AiError('bad_request', { message: 'یکی از بخش‌های فکرهای انتخاب‌شده پیدا نشد؛ فهرست را تازه کن.', retryable: false });
        }
        const contextList = new Map<string, ContextObjectLite>();
        for (const id of ids) for (const item of effective(s, id)) contextList.set(item.id, item);
        context = { contextList: [...contextList.values()], nodeLabels, focusNodeIds: ids, excerpts };
      } else if (scopeNodeId && nodes.some((n) => n.id === scopeNodeId)) {
        const sub = threadOnly ? [scopeNodeId] : subtreeIds(nodes, scopeNodeId);
        context = { contextList: effective(s, scopeNodeId, !threadOnly), nodeLabels, scopeNodeId, allowedNodeIds: sub, focusNodeIds: [scopeNodeId], excerpts };
      } else {
        context = { contextList: whole(s), nodeLabels, excerpts };
      }
      if (!thoughtIds?.length) return context;
      const ids = [...new Set(thoughtIds)];
      if (ids.length > 12) throw new AiError('bad_request', { message: 'حداکثر ۱۲ فکر را می‌توان برای یک درخواست انتخاب کرد.', retryable: false });
      const selected = ids.map((id) => repo.getThought(s, id));
      const open = selected.filter((t): t is NonNullable<typeof t> => !!t && t.status === 'open');
      if (open.length !== ids.length) {
        throw new AiError('bad_request', { message: 'یکی از فکرهای انتخاب‌شده دیگر باز نیست یا پیدا نشد؛ فهرست را تازه کن.', retryable: false });
      }
      return {
        ...context,
        contextList: (context.contextList ?? []).filter((o) => o.status === 'Confirmed'),
        excerpts: [],
        thoughts: open.map(({ id, kind, text, nodeId }) => ({ id, kind, text, nodeId })),
      };
    },

    forGenerate(workspaceId, { targetNodeId, title, criteria, dependencyAssetIds }) {
      const s = scopeOf(workspaceId);
      const nodes = repo.listNodes(s);
      // '*' (or no / an unknown node) = the whole workspace; no node of the tree is special to the code. A given node → what is in force there.
      // The list IN FORCE is both what the model reads and where the guardrails come from
      const inForce = targetNodeId && targetNodeId !== '*' && nodes.some((n) => n.id === targetNodeId) ? effective(s, targetNodeId) : whole(s);
      return {
        contextObjects: inForce, contextList: inForce, nodeLabels: Object.fromEntries(nodes.map((n) => [n.id, n.label])),
        excerpts: files.excerpts(s, `${title}\n${criteria.join('\n')}`),
        // finished outputs this deliverable depends on, read from the database (not from the browser)
        dependencyOutputs: (dependencyAssetIds ?? []).map((id) => repo.getDeliverable(s, id)).filter((d): d is NonNullable<typeof d> => !!d).map((d) => ({ title: d.title, markdown: d.content })),
      };
    },
  };
}
