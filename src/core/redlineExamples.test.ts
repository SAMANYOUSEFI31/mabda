import test from 'node:test';
import assert from 'node:assert/strict';
import { canHaveExamples, cleanExamples, EXAMPLE_LIMIT, EXAMPLE_MAX_CHARS, exampleLines, examplesOf, exampleSuffix, guardrailText } from './redlineExamples';
import { buildAiRequest } from './aiRequest';
import { buildContextPack } from './contextPack';
import { DEFAULT_TREE_NODES } from './specs';
import type { ContextObject } from '../types';

const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Constraint', status: 'Confirmed', provenance: 'User Input', title: `خط قرمز ${id}`, content: `متن ${id}`, nodeId: 'business', version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...p,
});
const EX = [{ kind: 'good' as const, text: 'خرید سه‌ماههٔ شما ۱۰٪ تخفیف دارد' }, { kind: 'bad' as const, text: 'فقط امروز نصف قیمت!' }];

test('cleanExamples: valid kinds only, one line, clipped, empty dropped, at most three, order kept', () => {
  const r = cleanExamples([{ kind: 'bad', text: '  اول \n  خط  ' }, { kind: 'x', text: 'بد' }, { kind: 'good', text: '   ' }, { kind: 'good', text: 'دوم' }, null, { kind: 'good', text: 'سوم' }, { kind: 'bad', text: 'چهارم' }, { kind: 'bad', text: 'پنجم' }]);
  assert.deepEqual(r, [{ kind: 'bad', text: 'اول خط' }, { kind: 'good', text: 'دوم' }, { kind: 'good', text: 'سوم' }]);
  assert.equal(r!.length, EXAMPLE_LIMIT);
  assert.equal(cleanExamples([{ kind: 'good', text: 'x'.repeat(1000) }])![0].text.length, EXAMPLE_MAX_CHARS);
  for (const bad of [undefined, null, 'x', 5, {}, [], [{}], [{ kind: 'good' }]]) assert.equal(cleanExamples(bad), undefined);
});

test('who can carry examples: a Constraint, a Decision that reaches everywhere — never a Fact or a section-only Decision', () => {
  assert.equal(canHaveExamples({ type: 'Constraint' }), true);
  assert.equal(canHaveExamples({ type: 'Constraint', reach: 'position' }), true);
  assert.equal(canHaveExamples({ type: 'Decision', reach: 'global' }), true);
  assert.equal(canHaveExamples({ type: 'Decision' }), false);
  assert.equal(canHaveExamples({ type: 'Fact', reach: 'global' }), false);
  assert.deepEqual(examplesOf(o('a', { type: 'Fact', examples: EX })), []);
  assert.deepEqual(examplesOf(o('a', { type: 'Decision', examples: EX })), []);
  assert.deepEqual(examplesOf(o('a', { type: 'Decision', reach: 'global', examples: EX })), EX);
});

test('a sample never carries examples; the text is labelled right / wrong', () => {
  assert.deepEqual(examplesOf({ ...o('s', { examples: EX }), sample: true }), []);
  assert.deepEqual(exampleLines(o('a', { examples: EX })), ['مثال درست: خرید سه‌ماههٔ شما ۱۰٪ تخفیف دارد', 'مثال نادرست: فقط امروز نصف قیمت!']);
  assert.equal(guardrailText(o('a', { examples: EX })), 'خط قرمز a: متن a (مثال درست: خرید سه‌ماههٔ شما ۱۰٪ تخفیف دارد؛ مثال نادرست: فقط امروز نصف قیمت!)');
  assert.equal(guardrailText(o('a')), 'خط قرمز a: متن a');
  assert.equal(exampleSuffix(undefined), '');
});

test('AI request: the examples sit inside the red line, in the user order, capped at three; none for a Fact or a sample', () => {
  const many = [{ kind: 'bad' as const, text: 'الف' }, { kind: 'good' as const, text: 'ب' }, { kind: 'good' as const, text: 'ج' }, { kind: 'bad' as const, text: 'د-نباید' }];
  const objects = [
    o('c1', { examples: many }),
    o('f1', { type: 'Fact', title: 'واقعیت', content: 'x', examples: EX }),
    { ...o('s1', { title: 'خط قرمز نمونه', examples: [{ kind: 'bad', text: 'راز-نمونه' }] }), sample: true },
    o('d1', { type: 'Decision', reach: 'global', title: 'تصمیم همه‌جا', examples: [{ kind: 'good', text: 'مثال-تصمیم' }] }),
  ];
  const md = buildAiRequest({ kind: 'question', request: 'سؤال', workspaceName: 'x', nodes: DEFAULT_TREE_NODES, objects, now: new Date('2026-06-01') }).markdown;
  const doc = md.slice(md.indexOf('id="c1'), md.indexOf('</document>', md.indexOf('id="c1')));
  assert.ok(doc.indexOf('مثال نادرست: الف') < doc.indexOf('مثال درست: ب') && doc.indexOf('مثال درست: ب') < doc.indexOf('مثال درست: ج'), 'order kept');
  assert.ok(!md.includes('د-نباید'), 'the 4th example never goes in');
  assert.ok(!md.includes('خرید سه‌ماههٔ شما'), 'a Fact carries no examples');
  assert.ok(!md.includes('راز-نمونه'), 'a sample never');
  assert.ok(md.includes('مثال درست: مثال-تصمیم'), 'a global Decision carries them');
});

test('Context pack: the guardrail line has the examples next to the rule', () => {
  const pack = buildContextPack({ packId: 'p', workspaceName: 'x', nodes: DEFAULT_TREE_NODES, objects: [o('c1', { examples: EX }), { ...o('s1', { title: 'نمونه', examples: [{ kind: 'bad', text: 'راز-نمونه' }] }), sample: true }] });
  assert.match(pack.markdown, /- خط قرمز c1: متن c1 \(مثال درست: .*؛ مثال نادرست: فقط امروز نصف قیمت!\)/);
  assert.ok(!pack.markdown.includes('راز-نمونه'));
});
