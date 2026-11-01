import test from 'node:test';
import assert from 'node:assert/strict';
import { contextToMarkdown } from './contextMarkdown';
import { DEFAULT_TREE_NODES } from './specs';
import type { ContextObject } from '../types';

const o = (over: Partial<ContextObject>): ContextObject => ({
  id: 'o1', workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'مخاطب اصلی', content: 'فریلنسرها',
  nodeId: 'business', version: 2, createdAt: 't', updatedAt: 't', ...over,
});

test('whole tree: title is H1, nodes H2, objects H3; labels are Persian', () => {
  const md = contextToMarkdown({ nodes: DEFAULT_TREE_NODES, objects: [o({})], title: 'کارگاه' });
  assert.match(md, /^# کارگاه\n/);
  assert.match(md, /\n## کسب‌وکار و بنیان\n/);
  assert.match(md, /\n### مخاطب اصلی\n\n_تصمیم · تأییدشده · نسخهٔ ۲_\n\nفریلنسرها/);
  assert.match(md, /#### برند و پیام|### برند و پیام/);
});

test('a node export contains only its subtree; archived and superseded are left out; Proposed is labelled', () => {
  const md = contextToMarkdown({
    nodes: DEFAULT_TREE_NODES,
    nodeId: 'product',
    objects: [
      o({ id: 'a', nodeId: 'offer', title: 'قیمت', content: 'x', status: 'Proposed' }),
      o({ id: 'b', nodeId: 'business', title: 'بیرون از زیرشاخه', content: 'y' }),
      o({ id: 'c', nodeId: 'product', title: 'قدیمی', content: 'z', status: 'Superseded' }),
    ],
  });
  assert.match(md, /^# محصول و خدمت/);
  assert.match(md, /پیشنهادی \(تأییدنشده\)/);
  assert.doesNotMatch(md, /بیرون از زیرشاخه|قدیمی/);
});

test('empty leaf says so instead of leaving a bare heading', () => {
  assert.match(contextToMarkdown({ nodes: DEFAULT_TREE_NODES, objects: [], nodeId: 'content' }), /هنوز چیزی در این بخش ثبت نشده/);
});
