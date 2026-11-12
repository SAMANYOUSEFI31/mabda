import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo } from './demoData';
import { calculateReadinessAndGaps, detectContradictions } from './contextEngine';
import { effectiveFor, effectiveObjects } from './effectiveContext';
import { computeStaleAssets } from './impactEngine';
import { buildAiRequest, REQUEST_KINDS } from './aiRequest';
import { buildContextPack } from './contextPack';
import { contextDoc } from './contextMarkdown';
import { buildMapModel } from './mapModel';
import { buildScene } from './canvasScene';
import { buildChangeDigest } from './changeDigest';
import { defaultNodeId, flatten, treeOrder } from './nodeTree';
import { DEFAULT_TREE_NODES } from './specs';
import type { ContextObject, TreeNode } from '../types';

const NOW = new Date('2026-03-10T08:00:00Z');

/** the showcase workspace with the tree CHANGED by the user: «بنیان» (the old root) is deleted — its knowledge and children moved to a new root «خدمات» — and «آفر و قیمت‌گذاری» is renamed */
function changed() {
  const d = buildDemo(NOW);
  const base: TreeNode[] = [
    { id: 'brand', label: 'برند و پیام', description: '', order: 1 }, { id: 'product', label: 'محصول و خدمت', description: '', order: 2 },
    { id: 'offer', label: 'بسته‌های خدمت', description: '', parentId: 'product', order: 3 }, { id: 'content', label: 'محتوا و بازاریابی', description: '', parentId: 'brand', order: 4 },
    ...d.nodes,
  ];
  const tree: TreeNode[] = [{ id: 'svc', label: 'خدمات', description: '', order: 0 }, ...base.map((n) => (n.parentId === 'business' || (!n.parentId && n.id !== 'svc') ? { ...n, parentId: 'svc' } : n))];
  const objects: ContextObject[] = d.objects.map((o) => (o.nodeId === 'business' ? { ...o, nodeId: 'svc' } : o));
  return { d, tree, objects };
}

test('the old root is gone and a node is renamed: no engine, request or view needs any node id — everything is computed from the tree', () => {
  const { d, tree, objects } = changed();
  assert.ok(!tree.some((n) => n.id === 'business'));
  assert.equal(defaultNodeId(tree), 'svc');

  // Gap / Readiness: matching is semantic (slotKey / title), so the same slots are filled as before
  for (const spec of d.specs) {
    const before = calculateReadinessAndGaps(spec, d.objects, d.relationships);
    const after = calculateReadinessAndGaps(spec, objects, d.relationships);
    assert.equal(after.score, before.score, `${spec.id}: the score does not depend on where things are filed`);
    assert.deepEqual(after.gaps.map((g) => [g.key, g.status]), before.gaps.map((g) => [g.key, g.status]));
  }
  // contradictions, effective context at EVERY node, impact
  assert.equal(detectContradictions(objects).length, detectContradictions(d.objects).length);
  for (const n of tree) { effectiveFor(n.id, objects, tree, d.relationships, NOW); effectiveObjects(n.id, objects, tree, d.relationships, NOW); }
  assert.ok(effectiveObjects('svc', objects, tree, d.relationships, NOW).length > 0, 'the new root holds what the old one held');
  computeStaleAssets(d.deliverables, objects, { relationships: d.relationships, changes: d.changes });

  // «درخواست برای AI»: every kind, whole tree and one node
  for (const k of REQUEST_KINDS) {
    for (const scope of [undefined, 'offer', 'svc']) {
      const r = buildAiRequest({ kind: k.kind, request: 'یک خط', workspaceName: 'نمونه', nodes: tree, objects, relationships: d.relationships, scopeNodeId: scope, now: NOW });
      assert.ok(r.markdown.includes('<documents'), `${k.kind}/${scope}`);
    }
  }
  // Context pack, document, map, board, canvas, digest, search
  const pack = buildContextPack({ packId: 'p', workspaceName: 'x', nodes: tree, objects, relationships: d.relationships, spec: d.specs[0], now: NOW });
  assert.ok(pack.markdown.includes('بستهٔ Context'));
  assert.ok(contextDoc({ nodes: tree, objects }).markdown.length > 0);
  buildMapModel({ nodes: tree, objects, relationships: d.relationships, deliverables: d.deliverables, reviewIds: new Set(), staleAssetIds: new Set(), now: NOW } as never);
  for (const layout of ['overview', 'free'] as const) {
    const sc = buildScene(layout, { nodes: tree, objects, relationships: d.relationships, deliverables: d.deliverables, notes: d.notes, canvas: d.canvas, reviewIds: new Set(), staleAssetIds: new Set(), now: NOW }, {});
    assert.ok(sc.items.length > 0, layout);
  }
  buildChangeDigest({ changes: d.changes, objects, relationships: d.relationships, deliverables: d.deliverables });
  assert.deepEqual(treeOrder(tree)[0], 'svc');
  assert.ok(flatten(tree).length === tree.length);
});

test('the order of the knowledge in a request follows the tree: the node that is first in the tree leads', () => {
  const { d, tree, objects } = changed();
  const r = buildAiRequest({ kind: 'question', request: 'x', workspaceName: 'x', nodes: tree, objects, relationships: d.relationships, now: NOW });
  assert.ok(r.markdown.includes('خدمات'), 'the new root is named by the workspace\'s own tree, not by a table in the code');
  assert.ok(!r.markdown.includes('بنیان'), 'the deleted root is nowhere');
});

test('no source file reads a node by a fixed id: «business / brand / product / offer / content» appear only in data (the starting tree, hints, the demo), never in logic', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const DATA = /(^|\/)(seedData|demoData|specs|specLibrary|starters?|templates?|legacy|demo|QuickStartDialog|migrations)\./;
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === 'node_modules' || f === 'testing' ? [] : walk(p)) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !DATA.test(p) ? [p] : []; });
  const ID = "['\"](?:business|brand|product|offer|content|audience)['\"]";
  // a node id used as a node id: pushed into a seed list, passed to a tree / effective-context function, compared with a nodeId, or an object's node
  const BAD = [
    new RegExp(`(?:seeds|nodeIds|ids)\\.push\\(${ID}\\)`),
    new RegExp(`(?:ancestorIds|subtreeIds|effectiveFor|effectiveObjects|guardrailsFor|resolveNodeId|childrenOf)\\([^)]*${ID}`),
    new RegExp(`nodeId\\s*(?:===|!==|==)\\s*${ID}`),
    new RegExp(`${ID}\\s*(?:===|!==)\\s*[A-Za-z_.]*nodeId`),
    new RegExp(`parentId\\s*(?:===|!==)\\s*${ID}`),
  ];
  const hits: string[] = [];
  for (const dir of ['src/core', 'src/components', 'src/services', 'server/db', 'server/ai']) {
    for (const f of walk(dir)) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (!/check:design-ignore/.test(line) && BAD.some((re) => re.test(line))) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`); });
    }
  }
  assert.deepEqual(hits, [], `a fixed node id in logic:\n${hits.join('\n')}`);
});

test('a workstream\'s pack is computed from THIS tree: every node id is different and the hints of the workstream still land on real sections', () => {
  const d = buildDemo(NOW);
  const spec = d.specs[0];
  const all: TreeNode[] = [...DEFAULT_TREE_NODES, ...d.nodes.filter((n) => !DEFAULT_TREE_NODES.some((m) => m.id === n.id))];
  const rename = new Map(all.map((n, i) => [n.id, `n${i}`]));
  const nodes2 = all.map((n) => ({ ...n, id: rename.get(n.id)!, ...(n.parentId ? { parentId: rename.get(n.parentId) ?? n.parentId } : {}) }));
  const objs2 = d.objects.map((o) => ({ ...o, nodeId: rename.get(o.nodeId) ?? nodes2[0].id }));
  const before = buildContextPack({ packId: 'p', workspaceName: 'x', nodes: all, objects: d.objects, relationships: d.relationships, spec, now: NOW });
  const after = buildContextPack({ packId: 'p', workspaceName: 'x', nodes: nodes2, objects: objs2, relationships: d.relationships, spec, now: NOW });
  assert.ok(after.explain.scope.sections > 0, 'the hints resolved to real sections');
  assert.ok(after.refs.length > 0 && after.markdown.includes('بستهٔ Context'));
  // nothing is read through a fixed id: the same knowledge is in the pack whatever the node ids are
  assert.deepEqual(after.refs.map((r) => r.id).sort(), before.refs.map((r) => r.id).sort());
  assert.equal(after.counts.guardrails, before.counts.guardrails);
});
