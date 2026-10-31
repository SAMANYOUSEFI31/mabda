import test from 'node:test';
import assert from 'node:assert/strict';
import { contextDraftFromBlock, titleFromMarkdown, proposalsOf } from './blocks.ts';

test('draft from a plain block is Proposed/AI Suggested with a derived title', () => {
  const d = contextDraftFromBlock({ id: 'b1', kind: 'fact', markdown: '## مخاطب اصلی\nفریلنسرها' }, 'ws1', '2026-01-01T00:00:00Z');
  assert.deepEqual([d.status, d.provenance, d.type, d.id, d.workspaceId], ['Proposed', 'AI Suggested', 'Fact', '', 'ws1']);
  assert.equal(d.title, 'مخاطب اصلی');
});

test('proposal fields win over the block text, status is still Proposed', () => {
  const d = contextDraftFromBlock({ id: 'b2', kind: 'paragraph', markdown: 'متن', proposal: { type: 'Constraint', title: 'بدون تخفیف', content: 'تخفیف نداریم', nodeId: 'offer' } }, 'ws1');
  assert.deepEqual([d.type, d.title, d.content, d.nodeId, d.status], ['Constraint', 'بدون تخفیف', 'تخفیف نداریم', 'offer', 'Proposed']);
});

test('titles are trimmed and markup-free', () => {
  assert.equal(titleFromMarkdown('- **مهم**: این یک جملهٔ خیلی خیلی خیلی خیلی خیلی خیلی خیلی خیلی طولانی برای عنوان است', 30).endsWith('…'), true);
  assert.equal(titleFromMarkdown('   '), 'بدون عنوان');
  assert.equal(proposalsOf(undefined).length, 0);
});
