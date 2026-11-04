import test from 'node:test';
import assert from 'node:assert/strict';
import { contextDoc, contextToMarkdown, docTabs, nodeAnchor, objectAnchor, tabOfAnchor } from './contextMarkdown';
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

const REL = (id: string, type: 'depends_on' | 'derived_from', sourceId: string, targetId: string) => ({ id, type, sourceId, targetId, createdAt: '' });

test('outline: one item per heading, in order, with ids that come from the node / object (never from the text)', () => {
  const objs = [o({ id: 'a', nodeId: 'brand', title: 'لحن' }), o({ id: 'b', nodeId: 'brand', title: 'لحن' })];
  const { markdown, outline } = contextDoc({ nodes: DEFAULT_TREE_NODES, objects: objs, nodeId: 'brand', ownOnly: true });
  assert.deepEqual(outline.map((i) => [i.id, i.level, i.text]), [[nodeAnchor('brand'), 1, 'برند و پیام'], [objectAnchor('a'), 2, 'لحن'], [objectAnchor('b'), 2, 'لحن']]);
  assert.equal(new Set(outline.map((i) => i.id)).size, outline.length, 'two objects with the same title still get different anchors');
  assert.equal((markdown.match(/^#{1,6} /gm) ?? []).length, outline.length);
  // renaming does not change the anchor
  const renamed = contextDoc({ nodes: DEFAULT_TREE_NODES, objects: [o({ id: 'a', nodeId: 'brand', title: 'لحن تازه' })], nodeId: 'brand', ownOnly: true }).outline;
  assert.equal(renamed[1].id, objectAnchor('a'));
});

test('the linear Markdown has no references unless asked; «با ارجاع‌ها» adds flat lines «وابسته به» and «برگرفته از» only', () => {
  const objs = [
    o({ id: 'a', nodeId: 'brand', title: 'لحن', source: { kind: 'asset', label: 'متن تبلیغ', at: 't' } }),
    o({ id: 'b', nodeId: 'brand', title: 'قیمت' }),
    o({ id: 'c', nodeId: 'brand', title: 'قدیمی', status: 'Archived' }),
  ];
  const relationships = [REL('r1', 'depends_on', 'a', 'b'), REL('r2', 'depends_on', 'a', 'c'), REL('r3', 'derived_from', 'b', 'a')];
  const plain = contextToMarkdown({ nodes: DEFAULT_TREE_NODES, objects: objs, nodeId: 'brand', relationships });
  assert.ok(!plain.includes('وابسته به') && !plain.includes('برگرفته از'), 'off by default');
  const withRefs = contextToMarkdown({ nodes: DEFAULT_TREE_NODES, objects: objs, nodeId: 'brand', relationships, refs: true });
  assert.match(withRefs, /\nوابسته به: «قیمت»\n/);
  assert.ok(!withRefs.includes('«قدیمی»'), 'an archived object is not referenced');
  assert.match(withRefs, /\nبرگرفته از: «دارایی متن تبلیغ»\n/, 'an object that came from an asset says so');
  assert.match(withRefs, /\nبرگرفته از: «لحن»\n/, 'a derived_from edge shows on the derived object (its source side) only');
  assert.equal((withRefs.match(/برگرفته از/g) ?? []).length, 2);
  // nothing nested: no list markers, no tables, no extra heading levels were added
  const added = withRefs.split('\n').filter((l) => !plain.split('\n').includes(l));
  assert.ok(added.every((l) => /^(وابسته به|برگرفته از): /.test(l) || l === ''), added.join('|'));
  assert.equal((withRefs.match(/^#{1,6} /gm) ?? []).length, (plain.match(/^#{1,6} /gm) ?? []).length);
});

test('«آخرین تأیید» is added to the meta line only when it is not the current version', () => {
  const objs = [o({ id: 'a', nodeId: 'brand', version: 5, status: 'Needs Review' }), o({ id: 'b', nodeId: 'brand', version: 2 })];
  const md = contextToMarkdown({ nodes: DEFAULT_TREE_NODES, objects: objs, nodeId: 'brand', approvals: { a: { version: 3 }, b: { version: 2 } } });
  assert.match(md, /نسخهٔ ۵ · آخرین تأیید: نسخهٔ ۳_/);
  assert.equal((md.match(/آخرین تأیید/g) ?? []).length, 1);
});

test('tabs: the first-level sections of a one-root tree; a «کلیات» tab only if the root has its own objects', () => {
  const tabs = docTabs(DEFAULT_TREE_NODES, []);
  const root = DEFAULT_TREE_NODES.find((n) => !n.parentId)!;
  assert.deepEqual(tabs.map((t) => t.id), DEFAULT_TREE_NODES.filter((n) => n.parentId === root.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((n) => n.id));
  const withOwn = docTabs(DEFAULT_TREE_NODES, [o({ nodeId: root.id })]);
  assert.equal(withOwn[0].label, 'کلیات');
  assert.equal(withOwn[0].own, true);
  assert.equal(withOwn.length, tabs.length + 1);
  // the general tab holds only the root's own objects, not the whole tree
  const gen = contextDoc({ nodes: DEFAULT_TREE_NODES, objects: [o({ nodeId: root.id, title: 'مأموریت' }), o({ id: 'z', nodeId: 'brand', title: 'لحن' })], nodeId: root.id, ownOnly: true });
  assert.ok(gen.markdown.includes('مأموریت') && !gen.markdown.includes('لحن'));
  // several roots: each root is a tab
  const two = [{ id: 'r1', label: 'الف', description: '', order: 0 }, { id: 'r2', label: 'ب', description: '', order: 1 }];
  assert.deepEqual(docTabs(two, []).map((t) => t.id), ['r1', 'r2']);
});

test('permalinks: an anchor finds its tab (objects through their node, nested nodes through their first-level ancestor)', () => {
  const nodes = [...DEFAULT_TREE_NODES, { id: 'deep', label: 'ژرف', parentId: 'offer', description: '', order: 0 }];
  const objs = [o({ id: 'x', nodeId: 'deep' }), o({ id: 'g', nodeId: 'business' })];
  const tabs = docTabs(nodes, objs);
  const productTab = tabs.find((t) => t.nodeId === 'product');
  assert.equal(tabOfAnchor(objectAnchor('x'), tabs, nodes, objs)?.id, productTab?.id, 'a deep object belongs to its first-level section');
  assert.ok(tabOfAnchor(nodeAnchor('deep'), tabs, nodes, objs));
  assert.equal(tabOfAnchor(objectAnchor('g'), tabs, nodes, objs)?.own, true);
  assert.equal(tabOfAnchor('o-nope', tabs, nodes, objs), undefined);
  assert.equal(tabOfAnchor('weird', tabs, nodes, objs), undefined);
});

test('a relation to a suggestion is not written into the export (a suggestion is not truth); approved, it is', () => {
  const objs = [o({ id: 'a', nodeId: 'brand', title: 'لحن' }), o({ id: 'b', nodeId: 'brand', title: 'پیشنهاد قیمت', status: 'Proposed' })];
  const relationships = [REL('r1', 'depends_on', 'a', 'b')];
  assert.ok(!contextToMarkdown({ nodes: DEFAULT_TREE_NODES, objects: objs, nodeId: 'brand', relationships, refs: true }).includes('وابسته به'));
  const okObjs = [objs[0], { ...objs[1], status: 'Confirmed' as const }];
  assert.match(contextToMarkdown({ nodes: DEFAULT_TREE_NODES, objects: okObjs, nodeId: 'brand', relationships, refs: true }), /وابسته به: «پیشنهاد قیمت»/);
});
