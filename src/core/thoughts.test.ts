import test from 'node:test';
import assert from 'node:assert/strict';


test('a thought that became a section stops being an open thought; the other lines are untouched', async () => {
  const { resolveThoughtLine, sectionNameFromThought } = await import('./thoughts.ts');
  const { thinkingOf } = await import('./thinkingMarkers.ts');
  const content = 'یادداشت ساده\n[ایده] یک بخش برای کارگاه‌ها بسازیم\nآیا قیمتش را بالا ببریم؟';
  const notes = [{ id: 'n', nodeId: 'content', content }];
  const items = thinkingOf(notes);
  assert.equal(items.length, 2);
  const idea = items.find((i) => i.kind === 'idea')!;
  const next = resolveThoughtLine(content, idea, 'کارگاه‌ها');
  assert.equal(next.split('\n')[0], 'یادداشت ساده');
  assert.equal(next.split('\n')[2], 'آیا قیمتش را بالا ببریم؟');
  const after = thinkingOf([{ id: 'n', nodeId: 'content', content: next }]);
  assert.deepEqual(after.map((i) => i.kind), ['question'], 'only the other thought is still open');
  const q = items.find((i) => i.kind === 'question')!;
  assert.equal(thinkingOf([{ id: 'n', nodeId: 'content', content: resolveThoughtLine(content, q, 'قیمت') }]).filter((i) => i.kind === 'question').length, 0, 'a question mark inside the record does not keep it open');
  assert.equal(sectionNameFromThought('یک بخش برای کارگاه‌ها بسازیم، شاید ماهانه'), 'یک بخش برای کارگاه‌ها بسازیم');
});

test('a mention in a thought comes back as a suggested relation when it becomes knowledge (a raw thought draws no typed relation)', async () => {
  const { thoughtToDraft } = await import('./thoughts.ts');
  const { suggestLinks } = await import('./mentions.ts');
  const target = { id: 'k1', title: 'تخفیف نداریم', status: 'Confirmed', type: 'Constraint', content: 'x', nodeId: 'offer' } as never;
  const item = { kind: 'idea' as const, text: 'برای @«تخفیف نداریم» یک جایگزین پیدا کنیم', line: 0, hash: 'h', noteId: 'n', nodeId: 'offer', key: 'n:h' };
  const draft = thoughtToDraft(item, 'w', '2026-03-01T00:00:00Z');
  assert.deepEqual(suggestLinks({ text: draft.content ?? '', objects: [target], relationships: [] }).map((s) => s.targetId), ['k1']);
});
