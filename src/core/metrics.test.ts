import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { decisionMoments, expectationRows, expectationsDue, isIsoDate, latestOf, metricsPackSection, metricsWithoutRecentNumber, parseMeasurementCsv, parseNumber, proposedMeasurements, readExpectation, seriesOf, suggestVerdict, verdictOf, verdictTally } from './metrics.ts';
import { allMetricTexts, afterSentence, expectationSentence, MX } from './metricsText.ts';
import { buildContextPack } from './contextPack.ts';
import type { ContextChange, ContextObject, Measurement, Metric, MetricExpectation } from '../types/index.ts';

const NOW = new Date('2026-03-10T08:00:00Z');
const metric = (o: Partial<Metric> & { id: string }): Metric => ({ workspaceId: 'w', name: o.id, unit: '', direction: 'up', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...o });
const msr = (id: string, metricId: string, value: number, at: string, status: Measurement['status'] = 'Confirmed'): Measurement => ({ id, workspaceId: 'w', metricId, value, at, source: status === 'Proposed' ? 'mcp' : 'manual', status, createdAt: `${at}T09:00:00Z` });
const decision = (id: string, exp?: MetricExpectation, over: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: `تصمیم ${id}`, content: 'x', nodeId: 'business', version: 1, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', ...(exp ? { record: { metricExpectation: exp } } : {}), ...over });
const chg = (objectId: string, kind: ContextChange['kind'], at: string, after?: Record<string, unknown>): ContextChange => ({ id: `c_${objectId}_${kind}_${at}`, workspaceId: 'w', objectId, fromVersion: 1, toVersion: 1, kind, actor: 'user', at, ...(after ? { after } : {}) });

test('numbers: Persian digits and separators parse; junk does not; ISO dates are strict', () => {
  assert.equal(parseNumber('۱٬۲۰۰'), 1200);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber('۳۵٪'), 35);
  assert.equal(parseNumber('-4'), -4);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-03-10'), true);
});

test('series: only Confirmed numbers are drawn, counted, or the «latest»; proposed ones are listed apart', () => {
  const all = [msr('a', 'm', 10, '2026-03-01'), msr('b', 'm', 99, '2026-03-05', 'Proposed'), msr('c', 'm', 12, '2026-03-03'), msr('d', 'other', 1, '2026-03-04')];
  assert.deepEqual(seriesOf('m', all).map((x) => x.id), ['a', 'c']);
  assert.equal(latestOf('m', all)?.value, 12, 'the proposed 99 never becomes the latest number');
  assert.deepEqual(proposedMeasurements(all).map((x) => x.id), ['b']);
});

test('quiet marker: a metric with no confirmed number in a week is named, nothing else happens', () => {
  const ms = [metric({ id: 'a' }), metric({ id: 'b' }), metric({ id: 'c', archived: true })];
  const all = [msr('1', 'a', 1, '2026-03-08'), msr('2', 'b', 1, '2026-02-01'), msr('3', 'b', 1, '2026-03-09', 'Proposed')];
  assert.deepEqual(metricsWithoutRecentNumber(ms, all, NOW).map((m) => m.id), ['b']);
});

test('CSV: «name, number[, date[, note]]»; header skipped; unknown metric / bad number / bad date are reported, never guessed', () => {
  const ms = [metric({ id: 'orders', name: 'سفارش هفتگی' }), metric({ id: 'old', name: 'قدیمی', archived: true })];
  const r = parseMeasurementCsv('شاخص،عدد،تاریخ\nسفارش هفتگی, ۱۲۰, 2026/03/09, هفتهٔ خوب\nسفارش هفتگی;130\nنامعلوم, 5\nسفارش هفتگی, x\nسفارش هفتگی, 5, 2026-13-40\nتنها\nقدیمی, 4', ms, '2026-03-10');
  assert.deepEqual(r.rows, [{ metricId: 'orders', value: 120, at: '2026-03-09', note: 'هفتهٔ خوب' }, { metricId: 'orders', value: 130, at: '2026-03-10' }]);
  assert.deepEqual(r.errors.map((e) => [e.line, e.reason]), [[4, 'unknown_metric'], [5, 'bad_value'], [6, 'bad_date'], [7, 'too_few'], [8, 'unknown_metric']]);
});

test('decision moments come from the Change table: first time it was Confirmed; a never-confirmed or sample decision has none', () => {
  const objs = [decision('d1'), decision('d2'), decision('d3'), decision('d4', undefined, { sample: true }), decision('d5')];
  const changes = [
    chg('d1', 'created', '2026-02-10T08:00:00Z', { status: 'Confirmed' }),
    chg('d2', 'created', '2026-02-01T08:00:00Z', { status: 'Proposed' }), chg('d2', 'proposal_accepted', '2026-02-15T08:00:00Z'),
    chg('d3', 'created', '2026-02-01T08:00:00Z', { status: 'Proposed' }),
    chg('d4', 'created', '2026-02-01T08:00:00Z', { status: 'Confirmed' }),
    chg('d5', 'created', '2026-02-02T08:00:00Z', { status: 'Proposed' }), chg('d5', 'status_changed', '2026-02-20T08:00:00Z', { status: 'Confirmed' }),
  ];
  assert.deepEqual(decisionMoments(objs, changes).map((m) => [m.id, m.at]), [['d1', '2026-02-10'], ['d2', '2026-02-15'], ['d5', '2026-02-20']]);
});

const orders = [msr('1', 'o', 88, '2026-02-01'), msr('2', 'o', 95, '2026-02-12'), msr('3', 'o', 112, '2026-02-28'), msr('4', 'o', 130, '2026-03-20')];
test('expectation versus result: the number before, the number by the date, the target — arithmetic only', () => {
  const exp: MetricExpectation = { metricId: 'o', direction: 'up', targetValue: 110, by: '2026-03-01' };
  const r = readExpectation(exp, '2026-02-10T08:00:00Z', orders, NOW);
  assert.equal(r.state, 'due');
  assert.deepEqual([r.before?.value, r.after?.value, r.delta], [88, 112, 24]);
  assert.deepEqual([r.movedAsExpected, r.reachedTarget], [true, true]);
  assert.equal(suggestVerdict(r), 'met');
  // the 130 recorded AFTER the «by» date does not count for this expectation
  assert.equal(r.after?.at, '2026-02-28');
});

test('partial / missed / down direction / no target / still open / no data', () => {
  // up, moved the right way but short of the target → partial
  assert.equal(suggestVerdict(readExpectation({ metricId: 'o', direction: 'up', targetValue: 200, by: '2026-03-01' }, '2026-02-10T00:00:00Z', orders, NOW)), 'partial');
  // up, went down → missed
  const falling = [msr('1', 'f', 90, '2026-02-01'), msr('2', 'f', 70, '2026-02-25')];
  assert.equal(suggestVerdict(readExpectation({ metricId: 'f', direction: 'up', targetValue: 100, by: '2026-03-01' }, '2026-02-10T00:00:00Z', falling, NOW)), 'missed');
  // down is better: the same falling series reaches a target of 75
  const down = readExpectation({ metricId: 'f', direction: 'down', targetValue: 75, by: '2026-03-01' }, '2026-02-10T00:00:00Z', falling, NOW);
  assert.deepEqual([down.movedAsExpected, down.reachedTarget], [true, true]);
  assert.equal(suggestVerdict(down), 'met');
  // no target: the direction decides
  assert.equal(suggestVerdict(readExpectation({ metricId: 'o', direction: 'up', by: '2026-03-01' }, '2026-02-10T00:00:00Z', orders, NOW)), 'met');
  // a date in the future: still open, and the reading uses what exists so far
  const open = readExpectation({ metricId: 'o', direction: 'up', targetValue: 500, by: '2026-06-01' }, '2026-02-10T00:00:00Z', orders, NOW);
  assert.equal(open.state, 'open');
  assert.equal(open.after?.value, 112, 'the 2026-03-20 number is in the future of NOW: not read yet');
  // nothing recorded at all
  const none = readExpectation({ metricId: 'zzz', direction: 'up', by: '2026-03-01' }, '2026-02-10T00:00:00Z', orders, NOW);
  assert.equal(none.state, 'no_data');
  assert.equal(suggestVerdict(none), null);
});

test('rows, due list and the plain tally; a verdict the user wrote is read back from the Change', () => {
  const ms = [metric({ id: 'o', name: 'سفارش' })];
  const objs = [
    decision('met1', { metricId: 'o', direction: 'up', targetValue: 100, by: '2026-03-01' }),
    decision('today', { metricId: 'o', direction: 'up', targetValue: 100, by: '2026-03-10' }),
    decision('later', { metricId: 'o', direction: 'up', by: '2026-04-01' }),
    decision('none'), // no expectation
    decision('prop', { metricId: 'o', direction: 'up', by: '2026-03-01' }, { status: 'Proposed' }),
    decision('smp', { metricId: 'o', direction: 'up', by: '2026-03-01' }, { sample: true }),
  ];
  const changes = [...objs.map((o) => chg(o.id, 'created', '2026-02-10T08:00:00Z', { status: 'Confirmed' })), chg('met1', 'outcome_noted', '2026-03-02T08:00:00Z', { verdict: 'met' })];
  const rows = expectationRows(objs, ms, orders, changes, NOW);
  assert.deepEqual(rows.map((r) => r.decision.id), ['met1', 'today', 'later'], 'proposed, sample and expectation-less decisions are not rows');
  assert.equal(verdictOf('met1', changes)?.verdict, 'met');
  assert.deepEqual(expectationsDue(rows, NOW).map((r) => r.decision.id), ['today'], 'judged ones and future ones are not due');
  assert.deepEqual(verdictTally(rows), { met: 1, partial: 0, missed: 0, open: 2 });
  // an outcome without a verdict (a free-text note) is not a verdict
  assert.equal(verdictOf('today', [chg('today', 'outcome_noted', '2026-03-10T08:00:00Z')]), undefined);
});

test('pack section: separate, confirmed numbers only, with the rule that no cause is to be inferred', () => {
  const ms = [metric({ id: 'o', name: 'سفارش هفتگی', unit: 'سفارش', target: 120 }), metric({ id: 'z', name: 'بایگانی', archived: true })];
  const all = [...orders.slice(0, 3), msr('p', 'o', 999, '2026-03-05', 'Proposed')];
  const d = decision('d1', { metricId: 'o', direction: 'up', targetValue: 110, by: '2026-03-01' });
  const text = metricsPackSection(ms, all, [d], [chg('d1', 'created', '2026-02-10T08:00:00Z', { status: 'Confirmed' })], NOW)!;
  assert.match(text, /^## اندازه‌گیری‌ها/);
  assert.match(text, /سفارش هفتگی/);
  assert.match(text, /هدف: 120/);
  assert.doesNotMatch(text, /999/, 'a proposed number is not in the pack');
  assert.doesNotMatch(text, /بایگانی/);
  assert.match(text, /علت‌ومعلولی نتیجه نگیر/);
  assert.match(text, /انتظارها در برابر اعداد/);
  assert.equal(metricsPackSection([], [], []), null);
  assert.equal(metricsPackSection([metric({ id: 'a', archived: true })], [], []), null);
});

test('the pack keeps metrics out of the facts: they are their own section, after the knowledge', () => {
  const ms = [metric({ id: 'o', name: 'سفارش هفتگی' })];
  const fact: ContextObject = { ...decision('f1'), id: 'f1', type: 'Fact', title: 'یک واقعیت' };
  const pack = buildContextPack({ packId: 'p1', workspaceName: 'W', nodes: [{ id: 'business', label: 'کسب‌وکار', order: 0 } as never], objects: [fact], now: NOW, metrics: { metrics: ms, measurements: orders, changes: [] } });
  const md = pack.markdown;
  assert.ok(md.indexOf('## اندازه‌گیری‌ها') > md.indexOf('## واقعیت‌های تأییدشده'), 'after the facts');
  const facts = md.slice(md.indexOf('## واقعیت‌های تأییدشده'), md.indexOf('## اندازه‌گیری‌ها'));
  assert.doesNotMatch(facts, /سفارش هفتگی/, 'the metric is not inside the facts section');
  assert.equal(pack.counts.metrics, 1);
  // no metrics given → no section
  assert.doesNotMatch(buildContextPack({ packId: 'p2', workspaceName: 'W', nodes: [{ id: 'business', label: 'ک', order: 0 } as never], objects: [fact], now: NOW }).markdown, /اندازه‌گیری‌ها/);
});

// ── the vocabulary: «پس از» and «انتظار در برابر نتیجه», never a cause ─────────────────────────────────────────
const CAUSAL = /(?<![؀-ۿ])(اثر|تاثیر|تأثیر|علت|باعث|موجب|ناشی|به‌دلیل|به دلیل|بخاطر|به‌خاطر|سبب|نتیجهٔ این تصمیم|به لطف|مدیون)/;

test('no UI sentence claims a cause: the words «اثر», «علت», «تأثیر», «باعث» … appear in none of the fixed or generated texts', () => {
  for (const s of allMetricTexts()) assert.doesNotMatch(s, CAUSAL, `causal wording in: ${s}`);
  assert.match(afterSentence({ decision: 'کانال', before: '88', after: '112' }), /^پس از «کانال»/, 'the position word is «پس از»');
  assert.match(MX.expectationsTitle, /انتظار در برابر نتیجه/);
  assert.match(expectationSentence({ metric: 'سفارش', direction: 'up', by: 'x' }), /^انتظار:/);
});

test('the metric components and the screen text in App/DueItems are free of causal wording too', () => {
  const files = [...readdirSync('src/components').filter((f) => /^Metric.*\.tsx$/.test(f)).map((f) => `src/components/${f}`), 'src/components/DueItems.tsx'];
  assert.ok(files.length >= 4, 'chart, dialog, quick entry, due items');
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const literals = [...src.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*[؀-ۿ](?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((m) => m[2]);
    const jsxText = [...src.matchAll(/>([^<>{}\n]*[؀-ۿ][^<>{}\n]*)</g)].map((m) => m[1]);
    for (const s of [...literals, ...jsxText]) assert.doesNotMatch(s, CAUSAL, `${f}: «${s}»`);
  }
  // the one place the chart words appear in App: the Home card
  const app = readFileSync('src/App.tsx', 'utf8');
  const card = app.slice(app.indexOf('id="expectations"'), app.indexOf('id="expectations"') + 1500);
  assert.doesNotMatch(card, CAUSAL);
});
