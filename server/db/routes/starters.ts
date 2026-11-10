/**
 * Starters and templates: grey samples, invisible to every AI path and engine.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { NodeTemplate } from '../../../src/core/templates.ts';
import type { RouteContext } from './context.ts';
import type { WorkstreamSpec } from '../../../src/types/index.ts';
import { PLANS } from '../../../src/core/creditEngine.ts';
import { RepoError, newId } from '../repo.ts';
import { STARTERS } from '../../../src/core/starters.ts';
import { defaultNodeId, resolveNodeId } from '../../../src/core/nodeTree.ts';
import { nodeTemplateOf, nodeTemplateToStart, workstreamTemplateOf } from '../../../src/core/templates.ts';
import { planNodes, sampleNode } from '../../../src/core/startTemplate.ts';

export function registerStartersRoutes(ctx: RouteContext): void {
  const { repo, router, scopeOf, body, wrap, LOCAL_USER } = ctx;
  router.post('/workspaces/:wid/starters/:id/apply', wrap((req, res) => {
    const s = scopeOf(req);
    const st = STARTERS.find((x) => x.id === req.params.id);
    if (!st) throw new RepoError('not_found', 'اسکلت شروع پیدا نشد.');
    // a start template may bring nodes (put under the first root; a node of the same name anywhere is reused, so applying twice adds nothing)
    const under = defaultNodeId(repo.listNodes(s)) || undefined;
    const created = new Map<string, string>();
    for (const n of planNodes(st, repo.listNodes(s), under, (k) => k)) {
      const parent = (n.parentId && created.get(n.parentId)) || under;
      const same = repo.listNodes(s).find((x) => x.label === n.label); // a node of the same name ANYWHERE in the tree is the one meant (she may have built it herself, elsewhere)
      created.set(n.key, same?.id ?? repo.createNode(s, { parentId: parent as string, label: n.label, description: n.description }).id);
    }
    // the examples: `node` is a node of this template, else a hint for a node of THIS workspace; a node that is not there → the default place
    const nodes = repo.listNodes(s);
    const made = st.samples.map((x) => repo.createSample(s, { type: x.type, title: x.title, content: x.content, nodeId: sampleNode(x, created, nodes), ...(x.slotKey ? { slotKey: x.slotKey } : {}), ...(x.facets ? { facets: x.facets } : {}) })).filter(Boolean);
    res.json({ added: made.length, samples: repo.listSampleObjects(s), nodes });
  }));
  /** remove the examples (all, or only those of some nodes) */
  router.post('/workspaces/:wid/samples/delete', wrap((req, res) => {
    const s = scopeOf(req);
    const ids = Array.isArray(body(req).nodeIds) ? (body(req).nodeIds as unknown[]).map(String) : undefined;
    res.json({ removed: repo.deleteSamples(s, ids), samples: repo.listSampleObjects(s) });
  }));
  router.get('/templates', wrap((_req, res) => { res.json({ templates: repo.listTemplates(LOCAL_USER) }); }));
  router.delete('/templates/:id', wrap((req, res) => { const template = repo.listTemplates(LOCAL_USER).find((t) => t.id === req.params.id); repo.deleteTemplate(LOCAL_USER, req.params.id); res.json({ ok: true, template }); }));
  router.post('/workspaces/:wid/templates/restore', wrap((req, res) => { const s = scopeOf(req); const t = body(req).template as { id: string; kind: 'node' | 'workstream'; name: string; payload: unknown; createdAt: string }; if (!t?.id) throw new RepoError('invalid', 'قالب نامعتبر است.'); repo.saveTemplate(s, t.kind, t.name, t.payload, t.createdAt, t.id); res.json({ templates: repo.listTemplates(LOCAL_USER) }); }));
  /** save a node (with its sub-tree and knowledge) or a custom workstream as the user's own template */
  router.post('/workspaces/:wid/templates', wrap((req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    if (b.kind === 'node') {
      const t = nodeTemplateOf(String(b.sourceId ?? ''), repo.listNodes(s), repo.listObjects(s));
      if (!t) throw new RepoError('not_found', 'گره پیدا نشد.');
      res.json({ id: repo.saveTemplate(s, 'node', String(b.name ?? t.root.label), t) });
    } else if (b.kind === 'workstream') {
      const spec = repo.listSpecs(s).find((x) => x.id === b.sourceId);
      if (!spec) throw new RepoError('not_found', 'فقط جریان کار خودت را می‌شود قالب کرد.');
      res.json({ id: repo.saveTemplate(s, 'workstream', String(b.name ?? spec.title), workstreamTemplateOf(spec)) });
    } else throw new RepoError('invalid', 'نوع قالب نامعتبر است.');
  }));
  /** bring a template in: a node template → child nodes + grey examples under `parentId`; a workstream template → a custom workstream (Pro and above) */
  router.post('/workspaces/:wid/templates/:id/apply', wrap((req, res) => {
    const s = scopeOf(req);
    const t = repo.listTemplates(LOCAL_USER).find((x) => x.id === req.params.id);
    if (!t) throw new RepoError('not_found', 'قالب پیدا نشد.');
    if (t.kind === 'workstream') {
      const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
      if (!PLANS[ws.planId]?.customSpecs) throw new RepoError('forbidden', 'ساخت و ویرایش جریان کار سفارشی از پلن Pro به بالا فعال است.');
      const spec = { ...(t.payload as Omit<WorkstreamSpec, 'id'>), id: newId('spec') } as WorkstreamSpec;
      res.json({ spec: repo.saveSpec(s, spec) });
      return;
    }
    const parentId = resolveNodeId(repo.listNodes(s), typeof body(req).parentId === 'string' ? String(body(req).parentId) : undefined);
    // the saved node is read as a start template (one data format): its nodes are planned, then created under `parentId`
    const tpl = nodeTemplateToStart(t.payload as NodeTemplate, t.id);
    const plan = planNodes(tpl, repo.listNodes(s), parentId, (k) => k);
    const made = new Map<string, string>(); // template key → the node id that was really created
    for (const n of plan) {
      const node = repo.createNode(s, { parentId: (n.parentId && made.get(n.parentId)) || parentId, label: n.label, description: n.description });
      made.set(n.key, node.id);
    }
    let added = 0;
    for (const o of tpl.samples) { const nid = made.get(o.node); if (nid && repo.createSample(s, { type: o.type, title: o.title, content: o.content, nodeId: nid, facets: o.facets, slotKey: o.slotKey })) added++; }
    res.json({ nodes: repo.listNodes(s), samples: repo.listSampleObjects(s), added, rootId: made.get(tpl.nodes[0].key) });
  }));
}
