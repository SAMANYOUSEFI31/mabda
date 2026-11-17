import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate, LATEST_VERSION } from './migrations.ts';
import { Repo } from './repo.ts';
import type { Workspace } from '../../src/types/index.ts';
import { openDatabase } from './database.ts';

const U = 'local';
const ws = (id: string): Workspace => ({ id, name: id, slug: id, description: '', todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' } as Workspace);
const fresh = () => { const db = openDatabase(':memory:'); const repo = new Repo(db); repo.saveWorkspace(U, ws('w1')); return { db, repo, s: { userId: U, workspaceId: 'w1' } }; };
const EX = [{ kind: 'good', text: 'درست ۱' }, { kind: 'bad', text: 'نادرست ۱' }];
const mk = (repo: Repo, s: { userId: string; workspaceId: string }, p: Record<string, unknown> = {}) =>
  repo.createObject(s, { type: 'Constraint', provenance: 'User Input', title: 'خط قرمز', content: 'متن', nodeId: 'business', ...p } as never);

test('migration 17 adds examples (NULL for old rows)', () => {
  assert.ok(LATEST_VERSION >= 17);
  const { db } = fresh();
  assert.ok(db.columns('context_objects').some((c) => c.name === 'examples'));
});

test('a Constraint keeps up to three cleaned examples across create / read / update (clear with null)', () => {
  const { repo, s } = fresh();
  const o = mk(repo, s, { examples: [...EX, { kind: 'good', text: ' سه ' }, { kind: 'bad', text: 'چهار' }, { kind: 'zzz', text: 'x' }] });
  assert.deepEqual(o.examples, [...EX, { kind: 'good', text: 'سه' }]);
  assert.deepEqual(repo.listObjects(s).find((x) => x.id === o.id)!.examples, o.examples);
  const v1 = o.version;
  const upd = repo.updateObject(s, o.id, { examples: [{ kind: 'bad', text: 'فقط این' }] }).object;
  assert.deepEqual(upd.examples, [{ kind: 'bad', text: 'فقط این' }]);
  assert.equal(upd.version, v1 + 1, 'examples change what outputs see → a new version (outputs go stale)');
  const same = repo.updateObject(s, o.id, { title: 'خط قرمز' }).object;
  assert.deepEqual(same.examples, upd.examples, 'a patch that does not mention them keeps them');
  assert.equal(repo.updateObject(s, o.id, { examples: null }).object.examples, undefined);
});

test('only red lines keep examples: a Fact drops them; a Decision needs reach «global»', () => {
  const { repo, s } = fresh();
  assert.equal(mk(repo, s, { type: 'Fact', examples: EX }).examples, undefined);
  assert.equal(mk(repo, s, { type: 'Decision', examples: EX }).examples, undefined);
  assert.deepEqual(mk(repo, s, { type: 'Decision', reach: 'global', examples: EX }).examples, EX);
  const d = mk(repo, s, { type: 'Decision', reach: 'global', examples: EX });
  assert.equal(repo.updateObject(s, d.id, { reach: 'position' }).object.examples, undefined, 'no longer a red line → no examples');
});

test('replacing a Constraint carries the examples to the new version unless new ones are given', () => {
  const { repo, s } = fresh();
  const o = mk(repo, s, { examples: EX });
  const r = repo.supersedeObject(s, o.id, { type: 'Constraint', provenance: 'User Input', title: 'جدید', content: 'متن جدید', nodeId: 'business' });
  assert.deepEqual(r.object.examples, EX);
});

test('a waiting draft ends when the examples are written directly or the item is archived (LOGIC-06)', () => {
  const db = openDatabase(':memory:'); const repo = new Repo(db);
  repo.saveWorkspace('local', { id: 'wd', name: 'wd', slug: 'wd', description: '', todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' } as never);
  const s = { userId: 'local', workspaceId: 'wd' };
  const node = repo.listNodes(s)[0].id;
  const make = () => repo.createObject(s, { type: 'Constraint', status: 'Confirmed', provenance: 'User Input', title: 'تخفیف نداریم', content: 'هیچ تخفیفی نمی‌دهیم', nodeId: node, examples: [{ text: 'نمونهٔ اول', fits: true }] } as never);
  const a = make();
  repo.updateObject(s, a.id, { content: 'متن پیش‌نویس', asDraft: true });
  assert.ok(repo.getObject(s, a.id)?.draft);
  repo.updateObject(s, a.id, { examples: [{ text: 'نمونهٔ تازه', fits: false }] });
  assert.equal(repo.getObject(s, a.id)?.draft, undefined, 'a direct write of the examples replaces what the draft held');
  const b = make();
  repo.updateObject(s, b.id, { content: 'متن پیش‌نویس', asDraft: true });
  repo.updateObject(s, b.id, { status: 'Archived' });
  assert.equal(repo.getObjectAny(s, b.id)?.draft, undefined, 'archiving ends the edit');
});
