import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';
import { Repo } from './repo.ts';
import { createContextSource } from './aiContext.ts';
import type { FileService } from '../files/service.ts';
import type { Workspace } from '../../src/types/index.ts';

const U = 'local';
const ws: Workspace = { id: 'w1', name: 'w', slug: 'w', description: '', planId: 'max', creditsRemaining: 1, todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' };
const NOW = new Date('2026-06-01T10:00:00Z');

/** nodes: 1 · 2 (2.1 · 2.2 (2.2.1)) · 3  — all user nodes under «business» */
function setup() {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace(U, ws);
  const s = { userId: U, workspaceId: 'w1' };
  const mk = (parentId: string, label: string) => repo.createNode(s, { parentId, label }).id;
  const n1 = mk('business', 'n1'), n2 = mk('business', 'n2'), n3 = mk('business', 'n3');
  const n21 = mk(n2, 'n21'), n22 = mk(n2, 'n22'), n221 = mk(n22, 'n221');
  const files = { excerpts: () => [] } as unknown as FileService;
  const source = createContextSource(repo, files, U, () => NOW);
  const add = (nodeId: string, title: string, o: Record<string, unknown> = {}) => repo.createObject(s, { type: 'Constraint', provenance: 'User Input', title, content: `${title} متن`, nodeId, ...o } as never);
  const rulesAt = (nodeId: string) => (source.forGenerate('w1', { targetNodeId: nodeId, title: 't', criteria: [] }).contextList ?? []).filter((c) => c.type === 'Constraint').map((c) => c.title).sort();
  return { repo, s, source, add, rulesAt, n1, n2, n3, n21, n22, n221 };
}

test('generation guardrails come from what is IN FORCE at the target node: a position-only Constraint in 2.2 reaches 2.2 and below — not node 1, 3, the parent 2 or the sibling 2.1', () => {
  const t = setup();
  t.add(t.n22, 'فقط۲٫۲', { reach: 'position' });
  for (const n of [t.n1, t.n3, t.n2, t.n21]) assert.deepEqual(t.rulesAt(n), [], 'not in force there');
  assert.deepEqual(t.rulesAt(t.n22), ['فقط۲٫۲']);
  assert.deepEqual(t.rulesAt(t.n221), ['فقط۲٫۲']);
});

test('a global Constraint is a guardrail everywhere; an expired one nowhere; old data (no reach stored) behaves as before — global', () => {
  const t = setup();
  t.add(t.n22, 'سراسری', { reach: 'global' });
  t.add(t.n1, 'قدیمی'); // no reach: the Constraint default
  t.add(t.n3, 'منقضی', { validUntil: '2026-05-01' });
  for (const n of [t.n1, t.n2, t.n3, t.n21, t.n221]) assert.deepEqual(t.rulesAt(n), ['سراسری', 'قدیمی'], n);
  assert.equal(t.repo.listObjects(t.s).find((o) => o.title === 'قدیمی')!.reach, undefined);
});

test('an exception (overrides) removes an inherited rule for its sub-tree only; node chat and the whole-workspace view follow the same list', () => {
  const t = setup();
  const rule = t.add(t.n2, 'قاعدهٔ والد', { reach: 'position' });
  const exc = t.add(t.n22, 'استثنا', { type: 'Decision' });
  t.repo.setOverride(t.s, exc.id, rule.id, { reason: 'این بخش جدا کار می‌کند' });
  assert.deepEqual(t.rulesAt(t.n21), ['قاعدهٔ والد']);
  assert.deepEqual(t.rulesAt(t.n22), []);
  assert.deepEqual(t.rulesAt(t.n221), []);
  const chat = (n: string) => (t.source.forChat('w1', { scopeNodeId: n, message: 'سلام' }).contextList ?? []).map((c) => c.title).sort();
  assert.deepEqual(chat(t.n21), ['قاعدهٔ والد']);
  assert.ok(!chat(t.n22).includes('قاعدهٔ والد') && chat(t.n22).includes('استثنا'));
  // whole-workspace chat: a position-only rule is not a workspace-wide rule
  const all = (t.source.forChat('w1', { message: 'سلام' }).contextList ?? []).map((c) => c.title);
  assert.ok(!all.includes('قاعدهٔ والد') && all.includes('استثنا'));
});
