/** CORE-09 and CORE-10: replacing knowledge keeps its exceptions, and history cannot be replaced again. */
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';
import { Repo } from './repo.ts';
import type { Workspace } from '../../src/types/index.ts';

const U = 'person_x';
function fresh() {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace(U, { id: 'w1', name: 'w1', slug: 'w1', description: '', todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' } as Workspace);
  const s = { userId: U, workspaceId: 'w1' };
  const top = repo.createNode(s, { label: 'فروشگاه' });
  const sub = repo.createNode(s, { parentId: top.id, label: 'مشتری ویژه' });
  return { repo, s, top, sub };
}

test('CORE-09: replacing a red line keeps the exception of the sub-section (before: the red line came back there)', () => {
  const { repo, s, top, sub } = fresh();
  const red = repo.createObject(s, { type: 'Constraint', provenance: 'User Input', title: 'بدون تخفیف', content: 'تخفیف نداریم', nodeId: top.id, reach: 'position' });
  const vip = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'ویژه', content: 'برای مشتری ویژه تخفیف داریم', nodeId: sub.id });
  repo.setOverride(s, vip.id, red.id, { actor: 'user', reason: 'مشتری ویژه قاعدهٔ خودش را دارد' });
  const { object: red2 } = repo.supersedeObject(s, red.id, { type: 'Constraint', provenance: 'User Input', title: 'بدون تخفیف', content: 'هیچ تخفیفی نداریم', nodeId: top.id, reach: 'position' });
  assert.deepEqual(repo.overridesOf(s, vip.id).sort(), [red.id, red2.id].sort());
  // the excepting item replaced: its exception follows it too
  const { object: vip2 } = repo.supersedeObject(s, vip.id, { type: 'Decision', provenance: 'User Input', title: 'ویژه', content: 'برای مشتری ویژه ۱۰٪', nodeId: sub.id });
  assert.ok(repo.overridesOf(s, vip2.id).includes(red2.id));
  // moved to the top section, the exception would no longer make sense: it is not invented
  const { object: vip3 } = repo.supersedeObject(s, vip2.id, { type: 'Decision', provenance: 'User Input', title: 'ویژه', content: 'x', nodeId: top.id });
  assert.deepEqual(repo.overridesOf(s, vip3.id), []);
});

test('CORE-10: an archived or already replaced item cannot be replaced (before: an archived item could be)', () => {
  const { repo, s, top } = fresh();
  const a = repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'الف', content: 'الف', nodeId: top.id });
  const b = repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'ب', content: 'ب', nodeId: top.id });
  const c = repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'ج', content: 'ج', nodeId: top.id });
  repo.updateObject(s, a.id, { status: 'Archived' });
  assert.throws(() => repo.supersedeObject(s, a.id, { type: 'Fact', provenance: 'User Input', title: 'x', content: 'x', nodeId: top.id }), /بایگانی/);
  assert.throws(() => repo.supersedeBy(s, a.id, b.id), /بایگانی/);
  assert.throws(() => repo.supersedeBy(s, b.id, a.id), /بایگانی/, 'an archived item cannot win either');
  repo.supersedeBy(s, b.id, c.id);
  assert.throws(() => repo.supersedeBy(s, b.id, c.id), /جایگزین/, 'a second replacement would rewrite who replaced it');
  assert.equal(repo.getObject(s, b.id)!.supersededById, c.id);
});
