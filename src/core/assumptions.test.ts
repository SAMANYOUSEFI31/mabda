import test from 'node:test';
import assert from 'node:assert/strict';
import { assumptionsDue, decisionsDue, isAssumption, isEstablished, rejectedOptions } from './assumptions';
import { buildPrompt } from '../../server/ai/context';
import { calculateReadinessAndGaps } from './contextEngine';
import type { ContextObject, WorkstreamSpec } from '../types';

const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: id, content: `${id} متن`, nodeId: 'business', version: 1, createdAt: '2026-01-01', updatedAt: '', ...p });

test('an assumption is not «established» even when Confirmed; archived / superseded ones are not even live', () => {
  assert.equal(isEstablished(o('f')), true);
  assert.equal(isEstablished(o('a', { assumption: true })), false);
  assert.equal(isAssumption(o('a', { assumption: true })), true);
  assert.equal(isAssumption(o('a', { assumption: true, status: 'Archived' })), false);
});

test('the prompt never shows an assumption as confirmed knowledge: it is in its own labelled section with the rule; rejected options of a confirmed decision are listed', () => {
  const p = buildPrompt({ task: 'بنویس', contexts: [
    { id: 'f', type: 'Fact', status: 'Confirmed', title: 'قطعی', content: 'سی مشتری', nodeId: 'business', version: 1 },
    { id: 'a', type: 'Fact', status: 'Confirmed', title: 'فرضِ من', content: 'پیام‌رسان بهتر است', nodeId: 'business', version: 1, assumption: true },
    { id: 'd', type: 'Decision', status: 'Confirmed', title: 'قیمت', content: 'ماهانه', nodeId: 'business', version: 1, rejected: [{ title: 'سالانه', reason: 'نقدینگی' }] },
  ] });
  assert.ok((p.prefix ?? '').includes('قطعی') && !(p.prefix ?? '').includes('فرضِ من'), 'the stable prefix holds only established knowledge');
  assert.match(p.user, /## فرض‌های فعال، تأییدنشده \(واقعیت نیست\)\n.*فرض‌اند، نه واقعیت.*\n.*فرضِ من/);
  assert.match(p.user, /## گزینه‌های بررسی‌شده و ردشده\n.*\n- «سالانه» \(در تصمیم «قیمت»\): نقدینگی/);
});

test('readiness: an assumption does not fill a required item as established knowledge (it counts like a suggestion)', () => {
  const spec = { id: 's', title: 's', target: 't', requiredContext: [{ key: 'k', label: 'مخاطب', description: 'd', nodeId: 'business', question: '؟', suggestedAnswers: [] }], suggestedContext: [], optionalContext: [], deliverables: [] } as unknown as WorkstreamSpec;
  const fact = calculateReadinessAndGaps(spec, [o('x', { slotKey: 'k' })], []);
  const assumed = calculateReadinessAndGaps(spec, [o('x', { slotKey: 'k', assumption: true })], []);
  assert.ok(assumed.score < fact.score, `assumption ${assumed.score} < fact ${fact.score}`);
});

test('rejected options come only from live, non-proposed Decisions and only those with a reason', () => {
  const rec = { options: [{ title: 'الف', rejectedReason: 'گران' }, { title: 'ب' }] };
  const list = [o('d1', { type: 'Decision', record: rec }), o('d2', { type: 'Decision', status: 'Superseded', record: rec }), o('d3', { type: 'Decision', status: 'Proposed', record: rec }), o('f', { record: rec })];
  assert.deepEqual(rejectedOptions(list).map((r) => [r.objectId, r.title, r.reason]), [['d1', 'الف', 'گران']]);
});

test('due dates are derived: an assumption is due on and after reviewBy; a decision asks «نتیجه چه شد؟» once its date comes and until an outcome_noted Change exists', () => {
  const now = new Date('2026-06-10T10:00:00Z');
  const list = [o('a1', { assumption: true, reviewBy: '2026-06-10' }), o('a2', { assumption: true, reviewBy: '2026-06-11' }), o('a3', { assumption: true }), o('a4', { assumption: true, reviewBy: '2026-01-01', status: 'Archived' })];
  assert.deepEqual(assumptionsDue(list, now).map((x) => x.id), ['a1']);
  const decs = [o('d1', { type: 'Decision', record: { reviewOn: '2026-06-01' } }), o('d2', { type: 'Decision', record: { reviewOn: '2026-07-01' } }), o('d3', { type: 'Decision', record: { reviewOn: '2026-05-01' } }), o('d4', { type: 'Decision', status: 'Proposed', record: { reviewOn: '2026-05-01' } })];
  const changes = [{ objectId: 'd3', kind: 'outcome_noted' as const, at: '2026-06-02' }];
  assert.deepEqual(decisionsDue(decs, changes, now).map((x) => x.id), ['d1']);
  assert.deepEqual(decisionsDue(decs, [], now).map((x) => x.id), ['d3', 'd1']);
});
