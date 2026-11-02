import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChangeDigest } from './changeDigest';
import type { ContextChange, ContextObject, GeneratedDeliverable } from '../types';

const NOW = new Date('2026-03-10T12:00:00Z');
const obj = (id: string, o: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: 'x', nodeId: 'business', version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...o });
const chg = (id: string, objectId: string, kind: ContextChange['kind'], at: string, o: Partial<ContextChange> = {}): ContextChange => ({ id, workspaceId: 'w', objectId, fromVersion: 1, toVersion: 2, kind, actor: 'user', at, ...o });
const del = (id: string, used: Array<[string, number]>): GeneratedDeliverable => ({ id, title: `خروجی ${id}`, usedContext: used.map(([i, v]) => ({ id: i, version: v })), createdAt: '2026-01-02T00:00:00Z' } as unknown as GeneratedDeliverable);

test('only the window, grouped by who did it (people first), newest first', () => {
  const d = buildChangeDigest({
    now: NOW, objects: [obj('a'), obj('b')], relationships: [], deliverables: [],
    changes: [
      chg('1', 'a', 'edited', '2026-03-09T10:00:00Z', { after: { content: 'x' }, before: { content: 'y' } }),
      chg('2', 'b', 'created', '2026-03-08T10:00:00Z', { actor: 'mcp', actorLabel: 'Claude' }),
      chg('3', 'b', 'edited', '2026-03-09T11:00:00Z', { actor: 'mcp', actorLabel: 'Claude', after: { content: 'z' } }),
      chg('4', 'a', 'edited', '2026-02-01T10:00:00Z', { after: { content: 'old' } }),
    ],
  });
  assert.equal(d.total, 3, 'the Feb change is outside 7 days');
  assert.deepEqual(d.groups.map((g) => [g.actor, g.label, g.entries.map((e) => e.change.id)]), [['user', undefined, ['1']], ['mcp', 'Claude', ['3', '2']]]);
});

test('each content change lists the outputs that now need a review; a move or a status change lists none', () => {
  const objects = [obj('a', { version: 2 }), obj('b')];
  const d = buildChangeDigest({
    now: NOW, objects, relationships: [], deliverables: [del('x1', [['a', 1]]), del('x2', [['b', 1]])],
    changes: [chg('1', 'a', 'edited', '2026-03-09T10:00:00Z', { after: { content: 'x' } }), chg('2', 'b', 'edited', '2026-03-09T10:00:00Z', { after: { nodeId: 'offer' }, before: { nodeId: 'business' } })],
  });
  const [g] = d.groups;
  const byId = (id: string) => g.entries.find((e) => e.change.id === id)!;
  assert.deepEqual(byId('1').reviewAssets.map((a) => a.id), ['x1']);
  assert.deepEqual(byId('2').reviewAssets, []);
  assert.equal(d.assetsToReview, 1);
});

test('dependency-driven review: the change of A lists the output made from B that rests on A', () => {
  const rel = [{ id: 'r', sourceId: 'B', targetId: 'A', type: 'depends_on' as const, createdAt: '' }];
  const changes = [chg('1', 'A', 'edited', '2026-03-09T10:00:00Z', { after: { content: 'x' } })];
  const d = buildChangeDigest({ now: NOW, objects: [obj('A', { version: 2 }), obj('B')], relationships: rel, deliverables: [del('x', [['B', 1]])].map((x) => ({ ...x, usedContext: [{ id: 'B', version: 1 }] })), changes });
  assert.deepEqual(d.groups[0].entries[0].reviewAssets.map((a) => a.id), ['x']);
});
