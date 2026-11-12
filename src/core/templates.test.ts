import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeTemplateOf, workstreamTemplateOf } from './templates';
import { STARTERS } from './starters';
import { DEFAULT_TREE_NODES } from './specs';
import { LIBRARY_SPECS } from './specLibrary';
import type { ContextObject, TreeNode } from '../types';

const node = (id: string, parentId?: string, order = 0): TreeNode => ({ id, label: `بخش ${id}`, description: `شرح ${id}`, ...(parentId ? { parentId } : {}), order });
const obj = (id: string, nodeId: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: id, content: `متن ${id}`, nodeId, version: 1, createdAt: '', updatedAt: '', ...p });

test('a node template keeps the sub-tree and ONLY Confirmed, non-assumption, non-sample knowledge as examples (path = child indexes)', () => {
  const nodes = [node('r'), node('a', 'r', 1), node('b', 'a', 1), node('c', 'a', 2), node('x', 'r', 2)];
  const objects = [obj('r1', 'a'), obj('r2', 'a', { status: 'Proposed' }), obj('r3', 'a', { assumption: true }), obj('r4', 'a', { sample: true }), obj('r5', 'a', { status: 'Archived' }), obj('deep', 'c', { facets: ['فصل'], slotKey: 'k' }), obj('out', 'x')];
  const t = nodeTemplateOf('a', nodes, objects)!;
  assert.deepEqual([t.root.label, t.root.children.map((c) => c.label)], ['بخش a', ['بخش b', 'بخش c']]);
  assert.deepEqual(t.objects.map((o) => [o.title, o.path]), [['r1', []], ['deep', [1]]]);
  assert.deepEqual(t.objects[1].facets, ['فصل']);
  assert.equal(nodeTemplateOf('nope', nodes, objects), undefined);
});

test('a workstream template is the spec without its id', () => {
  const t = workstreamTemplateOf({ ...LIBRARY_SPECS[0], id: 'mine' });
  assert.ok(!('id' in t) && t.title === LIBRARY_SPECS[0].title);
});

test('the four starters: every sample is an example (text says «مثال»), hints at nodes of the default start, and a slotKey only where a library workstream asks for it', () => {
  assert.deepEqual(STARTERS.map((s) => s.id), ['cohort_course', 'services', 'product', 'insta_shop']);
  const nodeIds = new Set(DEFAULT_TREE_NODES.map((n) => n.id));
  for (const st of STARTERS) {
    assert.ok(st.samples.length >= 6, st.id);
    assert.ok(st.samples.every((x) => x.content.startsWith('مثال:') && (nodeIds.has(x.node) || st.nodes.some((n) => n.key === x.node))), st.id);
    assert.equal(new Set(st.samples.map((x) => `${x.node}|${x.title}`)).size, st.samples.length, `${st.id}: no duplicate (node, title)`);
  }
});
