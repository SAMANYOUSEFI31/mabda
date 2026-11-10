/**
 * One source for «a thought»: the canvas tray («تازه‌ها»), the overview rows and the nav badge read the stored Thoughts, exactly like
 * the thinking space does (docs/later.md → سینی «تازه‌ها»). Measured on the real Repo, where a thought can outlive its line or its note.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';
import { Repo } from './repo.ts';
import { buildScene } from '../../src/core/canvasScene.ts';
import { thinkingSpace } from '../../src/core/thinkingSpace.ts';
import { thoughtItem } from '../../src/core/thinkingMarkers.ts';
import type { NoteThinkingItem } from '../../src/core/thinkingMarkers.ts';
import type { Workspace } from '../../src/types/index.ts';

const U = 'local';
const ws = (id: string): Workspace => ({ id, name: id, slug: id, description: '', planId: 'pro', creditsRemaining: 100, todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' } as Workspace);
const fresh = () => { const db = new Database(':memory:'); migrate(db); const repo = new Repo(db); repo.saveWorkspace(U, ws('w1')); return { repo, s: { userId: U, workspaceId: 'w1' } }; };

/** the thinking space's open thoughts, and the tray, for the same data */
function views(repo: Repo, s: { userId: string; workspaceId: string }) {
  const notes = repo.listNotes(s);
  const nodes = repo.listNodes(s);
  const thoughts = repo.listThoughts(s, { includeResolved: true }).map(thoughtItem).filter((t): t is NoteThinkingItem => !!t);
  const space = thinkingSpace({ objects: [], notes, thoughts, nodes });
  const scene = buildScene('free', { nodes, objects: [], relationships: [], deliverables: [], notes, thoughts, canvas: { decisions: [], free: [] }, reviewIds: new Set(), staleAssetIds: new Set() }, { tray: true });
  const tray = scene.items.filter((i) => i.unplaced);
  return { notes, thoughts, space, tray };
}
/** every open thought of the space is on a tray card (its note's card, or its own when its note is gone) and every card holds one */
function assertSame({ space, tray }: ReturnType<typeof views>) {
  const cards = new Set(tray.map((c) => c.noteId ?? c.thoughtId));
  for (const t of space.thoughts) assert.ok(cards.has(t.noteId && tray.some((c) => c.noteId === t.noteId) ? t.noteId : t.id), `the thought «${t.text}» is in the space but not in the tray`);
  for (const c of tray) assert.ok(space.thoughts.some((t) => (c.noteId ? t.noteId === c.noteId : t.id === c.thoughtId)), `a tray card holds no open thought: ${c.id}`);
}

test('a revised thought is the same in the tray and the thinking space (the card does not need the note line to match)', () => {
  const { repo, s } = fresh();
  repo.createNote(s, 'offer', '[ایده] قیمت اشتراک');
  const t = repo.listThoughts(s)[0];
  repo.reviseThought(s, t.id, 'قیمت اشتراک ماهانه، نه سالانه');
  const v = views(repo, s);
  assert.equal(v.space.thoughts.length, 1);
  assert.equal(v.space.thoughts[0].text, 'قیمت اشتراک ماهانه، نه سالانه');
  assert.equal(v.tray.length, 1);
  assertSame(v);
});

test('a thought whose line was removed from its note stays in the tray: the note holds an open thought, as the space says', () => {
  const { repo, s } = fresh();
  const note = repo.createNote(s, 'offer', '[ایده] قیمت اشتراک\nیک خط ساده');
  repo.updateNote(s, note.id, 'فقط یک خط ساده'); // the thought's line is gone; the thought stays (line_deleted)
  const v = views(repo, s);
  assert.equal(v.space.thoughts.length, 1, 'the space still lists it');
  assert.equal(v.thoughts[0].sourceState, 'line_deleted');
  assert.equal(v.tray.length, 1, 'the tray holds it too (before: the note had no marked line, so the tray lost it)');
  assert.equal(v.tray[0].noteId, note.id);
  assertSame(v);
});

test('a thought whose note was deleted is on the tray as its own card (display only: no note to place); resolved thoughts are on neither', () => {
  const { repo, s } = fresh();
  const gone = repo.createNote(s, 'offer', '[سؤال] مشتری کیست؟');
  const kept = repo.createNote(s, 'offer', '[ایده] بستهٔ هدیه\n[فرض] مشتری می‌پردازد');
  repo.deleteNote(s, gone.id); // its open thought stays
  const done = repo.listThoughts(s).find((t) => t.kind === 'assumption')!;
  repo.resolveThought(s, done.id, { nodeId: 'offer' });
  const v = views(repo, s);
  assert.equal(v.space.thoughts.length, 2, 'the question and the idea');
  const orphan = v.tray.find((c) => c.thoughtId);
  assert.ok(orphan, 'a card of its own');
  assert.equal(orphan!.noteId, undefined, 'no note to move');
  assert.equal(orphan!.label, 'مشتری کیست؟');
  assert.equal(v.tray.find((c) => c.noteId === kept.id)?.kind, 'note');
  assertSame(v);
});

test('the same ids: the card of a tray thought is the stored thought (id), and a placed note leaves the tray but not the space', () => {
  const { repo, s } = fresh();
  const gone = repo.createNote(s, 'offer', '[ایده] یک');
  repo.deleteNote(s, gone.id);
  const t = repo.listThoughts(s)[0];
  const v = views(repo, s);
  assert.equal(v.tray[0].thoughtId, t.id);
  assert.equal(v.space.thoughts[0].id, t.id);
  const other = repo.createNote(s, 'offer', '[ایده] دو');
  const nodes = repo.listNodes(s);
  const thoughts = repo.listThoughts(s, { includeResolved: true }).map(thoughtItem).filter((x): x is NoteThinkingItem => !!x);
  const placed = buildScene('free', { nodes, objects: [], relationships: [], deliverables: [], notes: repo.listNotes(s), thoughts, canvas: { decisions: [], free: [{ itemRef: `note:${other.id}`, x: 10, y: 10 }] }, reviewIds: new Set(), staleAssetIds: new Set() }, { tray: true });
  assert.ok(!placed.items.some((i) => i.unplaced && i.noteId === other.id), 'a placed note is not in the tray');
  assert.equal(thinkingSpace({ objects: [], notes: repo.listNotes(s), thoughts, nodes }).thoughts.length, 2, 'the space still lists both');
});
