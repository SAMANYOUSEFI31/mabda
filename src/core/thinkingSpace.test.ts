import test from 'node:test';
import assert from 'node:assert/strict';
import { openThoughtCount, thinkingSpace } from './thinkingSpace';
import { composeThought, guessThoughtKind, thoughtToDraft } from './thoughts';
import { parseThinking, thinkingOf } from './thinkingMarkers';
import { DEFAULT_TREE_NODES } from './specs';
import { buildDemo } from './demoData';
import type { ContextObject } from '../types';

const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: `متن ${id}`, nodeId: 'business', version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...p });
const notes = [
  { id: 'n1', nodeId: 'offer', content: '[سؤال] قیمت گروهی چقدر باشد؟\n[ایده] جعبهٔ هدیه\n[فرض] تمدید می‌کنند\nیک خط ساده' },
  { id: 'n2', nodeId: 'brand', content: 'آیا لحن رسمی بهتر است؟' },
];

test('the thinking space: what is not truth yet, from the data that exists — suggestions, reviews, drafts; open thoughts; confirmed assumptions', () => {
  const objects = [
    o('a'), o('b', { status: 'Proposed', nodeId: 'offer' }), o('c', { status: 'Needs Review' }), o('d', { draft: { title: 'x', content: 'نسخهٔ تازه', at: '2026-01-02' }, nodeId: 'offer' }),
    o('e', { assumption: true }), o('f', { status: 'Archived' }), { ...o('g', { status: 'Proposed' }), sample: true },
  ];
  const v = thinkingSpace({ objects, notes, nodes: DEFAULT_TREE_NODES });
  assert.deepEqual(v.waiting.map((w) => [w.type, w.object.id]), [['proposal', 'b'], ['review', 'c'], ['draft', 'd']], 'no archived, no sample');
  assert.deepEqual(v.thoughts.map((t) => t.kind).sort(), ['assumption', 'idea', 'question', 'question']);
  assert.deepEqual(v.assumptions.map((x) => x.id), ['e']);
  assert.deepEqual(v.counts, { waiting: 3, idea: 1, question: 2, assumption: 2, open_decision: 0 });
  // a thought that became knowledge is not open any more
  const t = thinkingOf(notes).find((x) => x.kind === 'idea')!;
  const conv = o('h', { status: 'Proposed', source: { kind: 'note', noteId: t.noteId, lineKey: t.hash, quote: t.text, at: '' } });
  assert.equal(thinkingSpace({ objects: [conv], notes, nodes: DEFAULT_TREE_NODES }).thoughts.filter((x) => x.kind === 'idea').length, 0);
});

test('filters: by kind and by node (a node with its whole sub-tree)', () => {
  const objects = [o('b', { status: 'Proposed', nodeId: 'offer' }), o('c', { status: 'Proposed', nodeId: 'brand' })];
  const base = { objects, notes, nodes: DEFAULT_TREE_NODES };
  assert.deepEqual(thinkingSpace(base, { kind: 'waiting' }).waiting.length, 2);
  assert.deepEqual(thinkingSpace(base, { kind: 'waiting' }).thoughts, []);
  assert.deepEqual(thinkingSpace(base, { kind: 'question' }).thoughts.map((x) => x.nodeId).sort(), ['brand', 'offer']);
  assert.deepEqual(thinkingSpace(base, { nodeId: 'product' }).waiting.map((w) => w.object.id), ['b'], 'offer is under product');
  assert.deepEqual(thinkingSpace(base, { nodeId: 'brand' }).thoughts.map((x) => x.nodeId), ['brand']);
  assert.equal(openThoughtCount({ objects, notes }, 'offer'), 4, 'one waiting + three open thoughts in that node');
  assert.equal(openThoughtCount({ objects, notes }, 'content'), 0);
});

test('guessThoughtKind / composeThought: the marker is written for the user; a question mark makes a question; brackets typed by hand are not doubled', () => {
  assert.equal(guessThoughtKind('قیمت را چقدر بگذاریم؟'), 'question');
  assert.equal(guessThoughtKind('Should we?'), 'question');
  assert.equal(guessThoughtKind('یک جعبهٔ هدیه'), 'idea');
  assert.equal(composeThought('  جعبهٔ هدیه ', 'idea'), '[ایده] جعبهٔ هدیه');
  assert.equal(composeThought('[ایده] قیمت؟', 'question'), '[سؤال] قیمت؟');
  // a thought of several lines keeps its lines together with a trailing hard break (the old output left line 2 as a separate, unmarked line)
  assert.equal(composeThought('خط اول\nخط دوم', 'open_decision'), '[تصمیم باز] خط اول\\\nخط دوم');
  assert.deepEqual(parseThinking(composeThought('خط اول\nخط دوم', 'open_decision')).map((b) => b.text), ['خط اول\nخط دوم']);
  assert.equal(composeThought('   ', 'idea'), '');
  // the composed note is read back as exactly that thought
  const back = parseThinking(composeThought('قیمت اشتراک سه‌ماهه؟', 'open_decision'));
  assert.deepEqual(back.map((b) => [b.kind, b.text]), [['open_decision', 'قیمت اشتراک سه‌ماهه؟']]);
});

test('thoughtToDraft: promotion is explicit and proposed, with stable Thought provenance', () => {
  const items = thinkingOf(notes);
  const q = { ...items.find((i) => i.kind === 'question')!, id: 'thought-q' };
  const a = { ...items.find((i) => i.kind === 'assumption')!, id: 'thought-a' };
  const dq = thoughtToDraft(q, 'w', '2026-01-01', 'Decision');
  assert.deepEqual([dq.type, dq.status, dq.nodeId, dq.assumption], ['Decision', 'Proposed', 'offer', undefined]);
  assert.deepEqual([dq.source?.kind, dq.source?.thoughtId, dq.source?.noteId, dq.source?.lineKey, dq.source?.quote], ['note', 'thought-q', 'n1', q.hash, q.text]);
  const da = thoughtToDraft(a, 'w', '2026-01-01', 'Fact');
  assert.deepEqual([da.type, da.assumption, da.status], ['Fact', true, 'Proposed']);
});

test('the showcase in the thinking space: open questions, an assumption and the waiting suggestions are there — built from the same data a user makes', () => {
  const d = buildDemo(new Date('2026-03-10T08:00:00Z'));
  const v = thinkingSpace({ objects: d.objects, notes: d.notes, nodes: [...DEFAULT_TREE_NODES, ...d.nodes] });
  assert.ok(v.waiting.length >= 3 && v.thoughts.some((t) => t.kind === 'question') && v.thoughts.some((t) => t.kind === 'open_decision') && v.thoughts.some((t) => t.kind === 'idea'));
  assert.ok(v.assumptions.length >= 1);
});
