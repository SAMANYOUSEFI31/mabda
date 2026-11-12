import test from 'node:test';
import assert from 'node:assert/strict';
import { exportTemplate, parseTemplate, planNodes, sampleNode, templateTree, TEMPLATE_SCHEMA } from './startTemplate';
import type { StartTemplate } from './startTemplate';
import { DEFAULT_START, DEFAULT_TREE_NODES } from './specs';
import { STARTERS } from './starters';
import { nodeTemplateOf, nodeTemplateToStart } from './templates';
import { treeOrder } from './nodeTree';
import type { ContextObject, TreeNode } from '../types';

const T: StartTemplate = {
  schema: TEMPLATE_SCHEMA, id: 'svc', version: 2, title: 'خدماتی', description: 'برای کار پروژه‌ای',
  nodes: [{ key: 'a', label: 'بسته‌های خدمت', description: 'د', children: [{ key: 'b', label: 'قیمت', description: '' }] }],
  samples: [{ node: 'b', type: 'Decision', title: 'ماهانه', content: 'مثال: ماهانه' }],
  suggested: [{ key: 'price_point', label: 'قیمت', description: 'چقدر؟', node: 'b' }],
};

test('the default start is DATA: the five nodes, as an ordinary template; the tree rows are made from it', () => {
  assert.equal(DEFAULT_START.schema, TEMPLATE_SCHEMA);
  assert.deepEqual(treeOrder(DEFAULT_TREE_NODES), ['business', 'brand', 'content', 'product', 'offer']);
  assert.deepEqual(DEFAULT_TREE_NODES.find((n) => n.id === 'offer')?.parentId, 'product');
  assert.ok(DEFAULT_TREE_NODES.every((n) => !('isSystem' in n)), 'no node carries a lock');
  assert.deepEqual(templateTree(DEFAULT_START).map((n) => n.id), DEFAULT_TREE_NODES.map((n) => n.id));
});

test('parseTemplate: a file comes in through one door — valid ones are cleaned, invalid ones give a plain reason, nothing is trusted', () => {
  const ok = parseTemplate(exportTemplate(T));
  assert.ok(ok.ok && ok.template.id === 'svc' && ok.template.version === 2 && ok.template.nodes[0].children?.[0].key === 'b' && ok.template.suggested?.[0].key === 'price_point');
  for (const bad of [undefined, 'not json', '{"schema":2,"id":"x","title":"t","nodes":[{"key":"k","label":"l"}]}', { schema: 1, title: 't' }, { schema: 1, id: 'x', title: 't', nodes: [], samples: [] }]) {
    const r = parseTemplate(bad);
    assert.ok(!r.ok && r.reason.length > 5, JSON.stringify(bad));
  }
  const dirty = parseTemplate({ schema: 1, id: 'x', title: 't', nodes: [{ key: 'a', label: 'الف', children: [{ key: 'a', label: 'تکراری' }, { label: 'بی‌کلید' }] }], samples: [{ node: 'a', type: 'Fact', title: 'ok', content: 'c' }, { node: 'a', type: 'Evil', title: 'x', content: 'y' }, { type: 'Fact', title: 'بی‌بخش', content: 'y' }, 5], suggested: [{ key: 'k' }] });
  assert.ok(dirty.ok);
  if (dirty.ok) {
    assert.deepEqual(dirty.template.nodes[0].children, undefined, 'duplicate key and keyless node dropped');
    assert.equal(dirty.template.samples.length, 1, 'bad type, no node, not an object: dropped');
    assert.equal(dirty.template.suggested, undefined);
  }
  assert.equal(parseTemplate({ schema: 1, id: 'x', title: 't', nodes: Array.from({ length: 500 }, (_, i) => ({ key: `k${i}`, label: 'n' })) }).ok && (parseTemplate({ schema: 1, id: 'x', title: 't', nodes: Array.from({ length: 500 }, (_, i) => ({ key: `k${i}`, label: 'n' })) }) as { template: StartTemplate }).template.nodes.length, 200, 'a hostile file is capped');
});

test('planNodes: nodes of a template under any node, orders after the siblings, ids from the caller; no code knows a node id', () => {
  const tree: TreeNode[] = [{ id: 'r', label: 'ریشه', description: '', order: 0 }, { id: 'x', label: 'x', description: '', parentId: 'r', order: 4 }];
  const p = planNodes(T, tree, 'r', (k) => `n_${k}`);
  assert.deepEqual(p.map((n) => [n.id, n.parentId, n.order]), [['n_a', 'r', 5], ['n_b', 'n_a', 0]]);
  assert.deepEqual(planNodes(T, tree, undefined, (k) => k).map((n) => [n.id, n.parentId, n.order]), [['a', undefined, 1], ['b', 'a', 0]], 'a new root goes after the existing roots');
});

test('sampleNode: its own node, else a node of the workspace by that hint, else the default place', () => {
  const nodes: TreeNode[] = [{ id: 'r', label: 'ریشه', description: '', order: 0 }, { id: 'q', label: 'q', description: '', parentId: 'r', order: 0 }];
  const s = (node: string) => ({ node, type: 'Fact' as const, title: 't', content: 'c' });
  assert.equal(sampleNode(s('k'), new Map([['k', 'made']]), nodes), 'made');
  assert.equal(sampleNode(s('q'), new Map(), nodes), 'q');
  assert.equal(sampleNode(s('offer'), new Map(), nodes), 'r', 'the hinted node is gone → the first root');
});

test('starters and a saved node are the SAME format; a saved node round-trips through the file format', () => {
  for (const st of STARTERS) { const r = parseTemplate(exportTemplate(st)); assert.ok(r.ok, st.id); }
  const node: TreeNode[] = [{ id: 'w', label: 'کارگاه', description: 'د', order: 0 }, { id: 'w1', label: 'جلسه‌ها', description: '', parentId: 'w', order: 0 }];
  const obj = { id: 'o', nodeId: 'w1', type: 'Decision', status: 'Confirmed', title: 'قیمت', content: 'نود', slotKey: 'price_point' } as ContextObject;
  const st = nodeTemplateToStart(nodeTemplateOf('w', node, [obj])!, 'tpl_1');
  assert.deepEqual(st.nodes[0].key, 'n');
  assert.deepEqual(st.nodes[0].children?.[0].key, 'n.0');
  assert.deepEqual(st.samples.map((x) => [x.node, x.slotKey]), [['n.0', 'price_point']]);
  const back = parseTemplate(exportTemplate(st));
  assert.ok(back.ok && back.template.nodes[0].label === 'کارگاه');
});
