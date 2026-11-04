import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMeta, mapAnswer, mapBlock, nodeByPath } from './answerMapping.ts';
import { parseByHeadings } from './answerParser.ts';
import type { ParsedBlock } from './answerParser.ts';
import type { ContextObject, TreeNode } from '../types';

const nodes = [{ id: 'offer', label: 'آفر' }, { id: 'price', label: 'قیمت', parentId: 'offer' }, { id: 'brand', label: 'برند' }, { id: 'price2', label: 'قیمت', parentId: 'brand' }] as unknown as TreeNode[];
const ob = (id: string, p: Partial<ContextObject> = {}) => ({ id, nodeId: 'price', status: 'Confirmed', type: 'Decision', title: id, content: `متن ${id}`, version: 3, ...p }) as unknown as ContextObject;
const blk = (md: string, title = 'عنوان', kind: ParsedBlock['kind'] = 'fact'): ParsedBlock => ({ id: 'b1', kind, title, markdown: md, method: 'headings' });
const objects = [ob('sub', { title: 'قیمت اشتراک ماهانه', content: 'اشتراک ماهانه چهار میلیون تومان است' }), ob('tone', { title: 'لحن برند', content: 'گرم و محترمانه', nodeId: 'brand' }), ob('pend', { title: 'ارسال رایگان', status: 'Proposed', content: 'ارسال بالای دو میلیون رایگان است' })];

test('نشانهٔ صریح: Ref و Section از متن جدا می‌شوند', () => {
  const m = extractMeta('Ref: sub@v3\nبخش: آفر / قیمت\nمتن اصلی\nخط دوم');
  assert.deepEqual([m.ref, m.place, m.body], ['sub@v3', 'آفر / قیمت', 'متن اصلی\nخط دوم']);
  assert.deepEqual(extractMeta('فقط متن'), { body: 'فقط متن' });
});

test('شناسه‌ای که زیرخط دارد و با ** یا ` قاب شده سالم می‌ماند', () => {
  assert.equal(extractMeta('Ref: `dm_day4@v1`\nمتن').ref, 'dm_day4@v1');
  assert.equal(extractMeta('Ref: **ctx_ab_cd@v2**\nمتن').ref, 'ctx_ab_cd@v2');
  const r = mapBlock(blk('Ref: dm_day4@v1\nمتن تازه'), { objects: [ob('dm_day4', { version: 1 })], nodes });
  assert.deepEqual([r.action, r.targetId, r.basis], ['update', 'dm_day4', 'explicit']);
});

test('مسیر بخش: مسیر کامل دقیق است؛ نام تکراری بدون مسیر حدس زده نمی‌شود', () => {
  assert.equal(nodeByPath(nodes, 'آفر/قیمت')?.id, 'price');
  assert.equal(nodeByPath(nodes, 'برند › قیمت')?.id, 'price2');
  assert.equal(nodeByPath(nodes, 'قیمت'), undefined, 'two sections are called «قیمت»');
  assert.equal(nodeByPath(nodes, 'برند')?.id, 'brand');
});

test('شناسهٔ صریح و متن فرق دارد ← به‌روزرسانی؛ متن همان ← تکراری', () => {
  const up = mapBlock(blk('Ref: sub@v3\nاشتراک ماهانه شش میلیون تومان است', 'قیمت اشتراک'), { objects, nodes });
  assert.deepEqual([up.action, up.targetId, up.basis, up.nodeId], ['update', 'sub', 'explicit', 'price']);
  const dup = mapBlock(blk('Ref: sub@v3\nاشتراک ماهانه چهار میلیون تومان است'), { objects, nodes });
  assert.deepEqual([dup.action, dup.targetId], ['duplicate', 'sub']);
});

test('شناسهٔ قدیمی (نسخهٔ قبلی): هنوز به‌روزرسانی است ولی هشدار می‌دهد', () => {
  const r = mapBlock(blk('Ref: sub@v1\nمتن تازه'), { objects, nodes });
  assert.equal(r.action, 'update');
  assert.equal(r.staleRef, true);
  assert.match(r.reason, /نسخهٔ 1|نسخهٔ ۱|نسخهٔ 1/);
});

test('شناسهٔ ناموجود: گفته می‌شود و به شباهت می‌رسد، نه حدس کور', () => {
  const r = mapBlock(blk('Ref: ghost@v1\nلحن ما گرم و دوستانه است', 'لحن برند'), { objects, nodes });
  assert.match(r.reason, /ghost/);
  assert.equal(r.targetId, 'tone');
  assert.equal(r.basis, 'similar');
});

test('شباهت بدون نشانه: عنوان مشابه + متن متفاوت = به‌روزرسانی؛ متن تقریباً یکی = تکراری؛ در انتظار = تکراری با توضیح', () => {
  assert.equal(mapBlock(blk('اشتراک ماهانه هفت میلیون تومان است', 'قیمت اشتراک ماهانه'), { objects, nodes }).action, 'update');
  assert.equal(mapBlock(blk('اشتراک ماهانه چهار میلیون تومان است', 'چیز دیگر'), { objects, nodes }).action, 'duplicate');
  const p = mapBlock(blk('ارسال رایگان برای همه', 'ارسال رایگان'), { objects, nodes });
  assert.deepEqual([p.action, p.targetId], ['duplicate', 'pend']);
});

test('دامنه: با بسته فقط داخل دانش همان بسته می‌گردد', () => {
  const b = blk('گرم و محترمانه بنویس', 'لحن برند');
  assert.equal(mapBlock(b, { objects, nodes, pack: [{ id: 'sub', version: 3 }] }).action, 'new', 'tone is not in the pack');
  assert.equal(mapBlock(b, { objects, nodes, pack: [{ id: 'tone', version: 3 }] }).targetId, 'tone');
});

test('مورد تازه: بخش از Section، وگرنه از موارد مشابه، وگرنه هیچ', () => {
  assert.deepEqual([mapBlock(blk('Section: برند\nچیزی کاملاً نامربوط به همه', 'ایدهٔ نو'), { objects, nodes }).nodeId], ['brand']);
  const sim = mapBlock(blk('گرم بودن لحن در شبکه‌های اجتماعی مهم است', 'لحن در شبکه'), { objects, nodes });
  assert.equal(sim.action, 'new');
  assert.equal(sim.nodeId, 'brand');
  const none = mapBlock(blk('کاملاً بی‌ربط qwerty', 'zzz'), { objects, nodes });
  assert.deepEqual([none.action, none.nodeId, none.basis], ['new', '', 'none']);
});

test('بلوک غیردانش نادیده؛ جایگزین‌شده به سر زنجیره می‌رود؛ پاسخ بدون ساختار = هیچ نگاشتی', () => {
  assert.equal(mapBlock(blk('متن', 'پاسخ', 'asset'), { objects, nodes }).action, 'ignore');
  const chain = [ob('old', { status: 'Superseded', supersededById: 'newer', content: 'قدیمی' }), ob('newer', { content: 'جدید' })];
  const r = mapBlock(blk('Ref: old@v1\nمتن تازه‌تر'), { objects: chain, nodes });
  assert.deepEqual([r.action, r.targetId], ['update', 'newer']);
  assert.equal(parseByHeadings('فقط یک پاراگراف بدون سرتیتر'), null, 'no structure → the caller keeps one raw block, nothing is mapped');
});

test('mapAnswer یک نگاشت برای هر بلوک می‌سازد و Postel: ی/ك/ارقام فرق نمی‌کنند', () => {
  const blocks = parseByHeadings('## Fact: قیمت اشتراک ماهانه\nRef: sub@v3\nاشتراك ماهانه ۴ ميليون تومان است\n\n## Fact: تازه\nچیز تازه')!;
  const m = mapAnswer(blocks, { objects: [ob('sub', { title: 'قیمت اشتراک ماهانه', content: 'اشتراک ماهانه 4 میلیون تومان است' })], nodes });
  assert.equal(m.size, 2);
  assert.equal([...m.values()][0].action, 'duplicate');
});
