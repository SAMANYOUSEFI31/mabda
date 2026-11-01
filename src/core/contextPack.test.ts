import test from 'node:test';
import assert from 'node:assert/strict';
import { contextTypeOf, isContextKind, parseByHeadings, unwrapFence } from './answerParser';
import { buildContextPack, PACK_MARKER_RE } from './contextPack';
import { DEFAULT_TREE_NODES, WORKSTREAM_SPECS } from './specs';
import type { ContextObject } from '../types';

const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: `متن ${id}`, nodeId: 'business', version: 2, createdAt: '', updatedAt: '', ...p,
});

test('answer parser: recognises the pack headings, keeps sub-headings inside the block, builds titles', () => {
  const text = [
    'سلام، این پاسخ من است.',
    '## Decision: تمرکز روی فریلنسرها',
    'مخاطب اصلی فریلنسرهای طراح هستند.',
    '## Fact',
    '**بودجه** پنجاه میلیون است.',
    '## Constraint — بدون تخفیف',
    'هیچ تخفیفی نمی‌دهیم.',
    '## Asset: جملهٔ موقعیت‌یابی',
    '### بخش اول',
    'متن کامل',
    '## یک سرتیتر ناشناخته',
    'این هم داخل Asset می‌ماند.',
    '## Question: بودجهٔ تبلیغات چقدر است؟',
    'لازم است بدانم.',
  ].join('\n');
  const b = parseByHeadings(text)!;
  assert.deepEqual(b.map((x) => x.kind), ['paragraph', 'decision', 'fact', 'constraint', 'asset', 'question']);
  assert.equal(b[1].title, 'تمرکز روی فریلنسرها');
  assert.equal(b[2].title, 'بودجه پنجاه میلیون است.', 'no heading text → title from the first line');
  assert.equal(b[3].title, 'بدون تخفیف');
  assert.match(b[4].markdown, /### بخش اول[\s\S]*یک سرتیتر ناشناخته[\s\S]*داخل Asset/, 'unknown ## headings stay inside the block');
  assert.ok(b.every((x) => x.method === 'headings'));
  assert.equal(b[0].markdown, 'سلام، این پاسخ من است.');
});

test('answer parser: the pack marker is dropped from the preamble (and a marker-only preamble makes no block)', () => {
  const b = parseByHeadings('<!-- mabda-pack:pack_abc123 -->\n## Fact: الف\nمتن')!;
  assert.deepEqual(b.map((x) => x.kind), ['fact']);
  const c = parseByHeadings('<!-- mabda-pack:pack_abc123 -->\nسلام\n## Fact: الف\nمتن')!;
  assert.equal(c[0].markdown, 'سلام');
});

test('answer parser: Persian headings, fenced answers, headings inside code fences are ignored, no heading → null', () => {
  const fa = parseByHeadings('## تصمیم: الف\nمتن\n## سؤال: ب\nچرا؟')!;
  assert.deepEqual(fa.map((x) => x.kind), ['decision', 'question']);
  const fenced = '```markdown\n## Fact: الف\nمتن\n```';
  assert.equal(unwrapFence(fenced), '## Fact: الف\nمتن');
  assert.equal(parseByHeadings(fenced)![0].kind, 'fact');
  const inCode = parseByHeadings('## Asset: x\n```\n## Decision: not a block\n```\nپایان')!;
  assert.equal(inCode.length, 1);
  assert.match(inCode[0].markdown, /not a block/);
  assert.equal(parseByHeadings('فقط متن ساده بدون سرتیتر'), null);
  assert.equal(parseByHeadings('# Decision: یک‌هشتگی\nمتن'), null, 'only level-2 headings count');
  assert.equal(isContextKind('asset'), false);
  assert.equal(contextTypeOf('constraint'), 'Constraint');
});

test('context pack: Confirmed as fact, Proposed labelled unconfirmed, Archived/Superseded absent, lineage refs match the text', () => {
  const spec = WORKSTREAM_SPECS[0];
  const objs = [
    o('a', { title: 'مخاطب اصلی' }),
    o('p', { status: 'Proposed', title: 'پیشنهاد ستون', nodeId: 'content' }),
    o('x', { status: 'Archived', title: 'بایگانی' }),
    o('s', { status: 'Superseded', title: 'جایگزین‌شده' }),
    o('k', { type: 'Constraint', title: 'بدون تخفیف', content: 'تخفیف نداریم', nodeId: 'offer' }),
  ];
  const pack = buildContextPack({ packId: 'pack_1', workspaceName: 'استودیو', nodes: DEFAULT_TREE_NODES, objects: objs, spec, deliverable: spec.deliverables[0] });
  const md = pack.markdown;
  assert.match(md, PACK_MARKER_RE);
  assert.match(md, /## واقعیت‌های تأییدشده \(Confirmed\)[\s\S]*مخاطب اصلی/);
  assert.match(md, /## پیشنهادی — تأییدنشده \(واقعیت نیست\)[\s\S]*پیشنهاد ستون/);
  assert.ok(!md.includes('بایگانی') && !md.includes('جایگزین‌شده'));
  assert.match(md, /گاردریل‌ها[\s\S]*بدون تخفیف: تخفیف نداریم/, 'Confirmed Constraints become guardrails automatically');
  assert.match(md, /معیارهای پذیرش[\s\S]*عدم وجود ادعاهای عمومی/);
  assert.match(md, /## شکاف‌ها \(Gap\)/);
  assert.match(md, /## Asset: عنوان خروجی/);
  assert.deepEqual(pack.refs.map((r) => r.id).sort(), ['a', 'k', 'p']);
  assert.deepEqual(pack.refs.find((r) => r.id === 'a'), { id: 'a', version: 2 });
  assert.ok(md.includes('a@v2'));
  assert.equal(pack.counts.confirmed, 2);
  assert.equal(pack.counts.proposed, 1);
  assert.equal(pack.chars, md.length);
  assert.ok(pack.tokens > 100 && pack.tokens < pack.chars);
});

test('context pack without a spec: the whole tree (or one branch chain) and no task section', () => {
  const objs = [o('a'), o('b', { nodeId: 'offer', title: 'آفر' })];
  const all = buildContextPack({ packId: 'p', workspaceName: 'x', nodes: DEFAULT_TREE_NODES, objects: objs });
  assert.deepEqual(all.refs.map((r) => r.id).sort(), ['a', 'b']);
  assert.ok(!all.markdown.includes('## کار'));
  const branch = buildContextPack({ packId: 'p', workspaceName: 'x', nodes: DEFAULT_TREE_NODES, objects: objs, targetNodeId: 'brand' });
  assert.deepEqual(branch.refs.map((r) => r.id), ['a'], 'brand ‹ business chain only');
});
