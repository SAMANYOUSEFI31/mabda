import { expectationRows, expectationsDue, suggestVerdict, verdictTally } from './metrics.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo, tehranAt } from './demoData';
import { calculateReadinessAndGaps, detectContradictions } from './contextEngine';
import { candidatePairs, unresolvedContradictions } from './contradictionCandidates';
import { flipFlops, needsReview, planDecisions, waitingDecisions } from './decisionGraph';
import { computeStaleAssets } from './impactEngine';
import { buildWeeklyReview } from './weeklyReview';
import { buildChangeDigest } from './changeDigest';
import { buildMapModel } from './mapModel';
import { buildCanvasModel } from './canvasModel';
import { DEFAULT_TREE_NODES } from './specs';
import { assumptionsDue, decisionsDue, isEstablished, rejectedOptions } from './assumptions';
import { canSplit, convertedTo, thinkingOf } from './thinkingMarkers';
import { effectiveFor, effectiveObjects, guardrailsFor } from './effectiveContext';

const NOW = new Date('2026-03-10T08:00:00Z'); // 11:30 in Tehran
const d = buildDemo(NOW);
const byId = new Map(d.objects.map((o) => [o.id, o]));
const gaps = (specId: string) => calculateReadinessAndGaps(d.specs.find((s) => s.id === specId)!, d.objects, d.relationships);

test('tehranAt: relative to «today in Tehran», fixed Tehran wall-clock hour (UTC+3:30)', () => {
  assert.equal(tehranAt(NOW, 0, 10, 0), '2026-03-10T06:30:00.000Z');
  assert.equal(tehranAt(NOW, 3, 9, 30), '2026-03-07T06:00:00.000Z');
  // 23:00 UTC is already the next day in Tehran
  assert.equal(tehranAt(new Date('2026-03-10T23:00:00Z'), 0, 10, 0), '2026-03-11T06:30:00.000Z');
});

test('every date is relative to now: nothing is in the future, and shifting `now` shifts everything by the same amount', () => {
  const all = [...d.objects.flatMap((o) => [o.createdAt, o.updatedAt]), ...d.changes.map((c) => c.at), ...d.deliverables.map((x) => x.createdAt), ...d.notes.map((n) => n.createdAt)];
  assert.ok(all.every((t) => t <= NOW.toISOString()), 'no future dates');
  const later = buildDemo(new Date(NOW.getTime() + 5 * 86_400_000));
  assert.equal(new Date(later.objects[0].createdAt).getTime() - new Date(d.objects[0].createdAt).getTime(), 5 * 86_400_000);
});

test('tree: four levels deep, user nodes under product and offer (subscription, workshop, support, content)', () => {
  const nodes = [...DEFAULT_TREE_NODES, ...d.nodes];
  const depth = (id: string): number => { const n = nodes.find((x) => x.id === id)!; return n.parentId ? 1 + depth(n.parentId) : 1; };
  assert.ok(Math.max(...d.nodes.map((n) => depth(n.id))) >= 4);
  assert.equal(d.nodes.find((n) => n.id === 'dn_sub')!.parentId, 'product');
  assert.equal(d.nodes.find((n) => n.id === 'dn_ws')!.parentId, 'offer');
  assert.ok(d.objects.every((o) => nodes.some((n) => n.id === o.nodeId)), 'every object lives in a real node');
});

test('objects: all three types in every status; Proposed come from import (file) and paste only — never from Mabda own AI (chat or coach), each with a reason', () => {
  const types = new Set(d.objects.map((o) => o.type));
  assert.deepEqual([...types].sort(), ['Constraint', 'Decision', 'Fact']);
  for (const st of ['Confirmed', 'Proposed', 'Needs Review', 'Superseded', 'Archived'] as const) assert.ok(d.objects.some((o) => o.status === st), st);
  for (const t of ['Fact', 'Decision', 'Constraint'] as const) for (const st of ['Confirmed', 'Proposed'] as const) assert.ok(d.objects.some((o) => o.type === t && o.status === st) || t === 'Constraint', `${t}/${st}`);
  const proposed = d.objects.filter((o) => o.status === 'Proposed' && !o.source?.noteId); // (what the user converted from a note line is hers: see the thinking test)
  assert.deepEqual([...new Set(proposed.map((o) => o.source!.kind))].sort(), ['file', 'paste']);
  assert.ok(proposed.every((o) => o.source!.reason), 'every suggestion says why');
  assert.ok(proposed.filter((o) => o.source!.kind === 'file' || o.source!.kind === 'paste').every((o) => o.source!.quote), 'imported ones keep their quote');
  assert.ok(d.objects.every((o) => o.status !== 'Proposed' || o.provenance === 'AI Suggested' || o.provenance === 'Imported' || !!o.source?.noteId), 'no Proposed object pretends to be user input (except a converted note line, which says so)');
  assert.ok(d.objects.every((o) => o.version >= 1 && d.versions.some((v) => v.objectId === o.id && v.version === o.version && v.content === o.content)), 'every current version has its snapshot');
});

test('workstreams: one ready, one with a missing slot, one ambiguous — all from slotKeys and statuses, no AI judgement', () => {
  const intro = gaps('demo_spec_intro'), campaign = gaps('demo_spec_campaign'), cal = gaps('demo_spec_calendar');
  assert.equal(intro.status, 'ready');
  assert.equal(intro.gaps.filter((g) => g.importance === 'required').length, 0);
  assert.deepEqual(campaign.gaps.filter((g) => g.importance === 'required').map((g) => [g.key, g.status]), [['launch_date', 'missing']]);
  assert.deepEqual(cal.gaps.filter((g) => g.importance === 'required').map((g) => [g.key, g.status]), [['content_calendar', 'ambiguous']]);
  assert.ok(d.objects.filter((o) => o.slotKey).every((o) => o.status !== 'Archived'));
});

test('depends_on: a chain, a blocked decision, and the price ↔ package ↔ shipping loop (decided together); one decision replaced 3 times', () => {
  const plan = planDecisions(d.objects, d.relationships);
  assert.deepEqual(plan.groups, [['dm_pack', 'dm_price', 'dm_ship_policy']]);
  const w = waitingDecisions(plan);
  assert.deepEqual(w.concurrent.map((u) => u.ids), [['dm_pack', 'dm_price', 'dm_ship_policy']]);
  assert.deepEqual(w.blocked.map((u) => [u.ids, u.blockedBy]), [[['dm_tg_campaign'], ['dm_tg_budget']]]);
  assert.ok(w.ready.some((u) => u.ids[0] === 'dm_tg_budget'));
  const chain = plan.layers.flat().find((u) => u.ids[0] === 'dm_budget');
  assert.ok(chain && plan.layers.findIndex((l) => l.includes(chain)) > 0, 'budget rests on channel rests on audience');
  assert.deepEqual(flipFlops(d.objects, d.changes), [{ id: 'dm_day4', times: 3 }]);
});

test('contradictions: a numeric price clash (rule) and a «no discount» constraint vs a discount; free vs paid shipping is only a CANDIDATE (no AI verdict is stored)', () => {
  const rule = detectContradictions(d.objects).map((c) => [c.itemA.id, c.itemB.id].sort().join('|'));
  assert.ok(rule.includes('dm_price|dm_price2'));
  assert.ok(rule.includes('dm_discount|dm_nodiscount'));
  const ship = candidatePairs(d.objects, 50, d.relationships).find((p) => p.key === 'dm_ship_cost|dm_ship_policy');
  assert.ok(ship, 'رایگان vs هزینه، با عنوان‌های طبیعی «سیاست ارسال» / «هزینهٔ ارسال»');
  assert.ok(ship.reasons.includes('same_node_same_type'));
  assert.equal(d.objects.find((o) => o.id === 'dm_ship_policy')!.title, 'سیاست ارسال');
  assert.equal(unresolvedContradictions(d.objects, []).filter((c) => c.source === 'semantic').length, 0, 'no semantic verdict is invented');
});

test('review states: the audience edit makes the channel / budget (and the value proposition behind the problem edit) «needs review»; assets: direct effect, dependency, fresh', () => {
  const review = needsReview(d.objects, d.relationships, d.changes);
  assert.deepEqual([...review.keys()].sort(), ['dm_budget', 'dm_channel', 'dm_valueprop']);
  assert.ok(!review.has('dm_pack'), 'dm_pack was reviewed after the price changed');
  const stale = computeStaleAssets(d.deliverables, d.objects, { relationships: d.relationships, changes: d.changes });
  const kinds = Object.fromEntries(stale.map((s) => [s.deliverableId, s.reasons.map((r) => r.kind)]));
  assert.deepEqual(kinds, { dd_campaign: ['dependency_changed'], dd_calendar: ['version_changed'] });
  assert.equal(d.deliverables.length, 3);
  assert.equal(new Set(d.deliverables.map((x) => x.workstreamId)).size, 3, 'one per workstream');
  assert.ok(d.deliverables.every((x) => x.source?.label === 'نمونهٔ دستی' && x.content.includes('هوش مصنوعی نساخته') && !x.plan && !x.usage), 'hand-made, never presented as AI output');
  assert.ok(d.deliverables.every((x) => x.usedContext.every((u) => byId.has(u.id))));
});

test('last week: Changes by user and external import — with reasons — feed the weekly review and the digest', () => {
  const digest = buildChangeDigest({ changes: d.changes, objects: d.objects, relationships: d.relationships, deliverables: d.deliverables, now: NOW });
  const actors = new Set(digest.groups.map((g) => g.actor));
  for (const a of ['user', 'import']) assert.ok(actors.has(a as never), a);
  for (const a of ['chat', 'coach']) assert.ok(!actors.has(a as never), `${a}: the showcase must not present Mabda's own AI as an author`);
  assert.ok(digest.groups.flatMap((g) => g.entries).filter((e) => e.change.actor === 'user' && e.change.reason).length >= 3);
  assert.ok(digest.assetsToReview >= 1);
  const week = buildWeeklyReview({ objects: d.objects, relationships: d.relationships, changes: d.changes, deliverables: d.deliverables, now: NOW });
  assert.ok(week.digest.total > 10 && week.reviews.length === 3 && week.waiting.ready.length === 3 && week.waiting.blocked.length === 1 && week.waiting.concurrent.length === 1);
  // proposals are recorded as created by whoever proposed them; accepted/rejected ones by the user
  assert.ok(d.changes.some((c) => c.kind === 'proposal_rejected' && c.actor === 'user' && c.reason));
  assert.ok(d.changes.every((c) => byId.has(c.objectId)));
});

test('notes, file, boards: free notes with coordinates, a ready text file with a summary, decision-board ranks that point at real objects', () => {
  assert.ok(d.notes.length >= 5 && new Set(d.notes.map((n) => n.nodeId)).size >= 4);
  assert.ok(d.canvas.free.every((i) => (d.notes.some((n) => `note:${n.id}` === i.itemRef) || d.objects.some((o) => `obj:${o.id}` === i.itemRef)) && i.x !== undefined && i.y !== undefined));
  assert.equal(d.canvas.free.filter((i) => i.itemRef.startsWith('obj:')).length, 3, 'three real cards sit in the free space beside the notes');
  assert.ok(d.canvas.decisions.every((i) => byId.has(i.itemRef.slice(4)) && i.rank !== undefined));
  assert.ok(d.file.summary.length > 20 && d.file.chunks.length >= 1 && d.nodes.some((n) => n.id === d.file.nodeId));
});

test('the map and the board lay the showcase out without surprises', () => {
  const m = buildMapModel({ nodes: [...DEFAULT_TREE_NODES, ...d.nodes], objects: d.objects, relationships: d.relationships, deliverables: d.deliverables });
  assert.ok(m.edges.some((e) => e.kind === 'dependency') && m.edges.some((e) => e.kind === 'lineage') && m.groups.length > 0);
  const board = buildCanvasModel({ nodes: [...DEFAULT_TREE_NODES, ...d.nodes], objects: d.objects, reviewIds: new Set(needsReview(d.objects, d.relationships, d.changes).keys()), ranks: new Map(d.canvas.decisions.map((i) => [i.itemRef.slice(4), i.rank!])) });
  for (const lane of ['thinking', 'confirmed'] as const) assert.ok(board.cards.some((c) => c.lane === lane), lane);
  assert.ok(board.cards.some((c) => c.review), 'the review badge is on some cards');
});

// ── effective context in the showcase ──────────────────────────────────────────────────────────
const NODES = [...DEFAULT_TREE_NODES, ...d.nodes];
const eff = (node: string) => Object.fromEntries(effectiveFor(node, d.objects, NODES, d.relationships, NOW).map((i) => [i.object.id, i.origin]));

test('effective context: a global rule, a section-only rule, an exception and an expired rule each show where they apply', () => {
  // global: «no discount» holds in the subscription, the support node, everywhere
  for (const n of ['dn_sub', 'dn_support', 'dn_social', 'business']) assert.equal(eff(n).dm_nodiscount, 'global', n);
  // section-only: the workshop refund rule reaches the workshop branch and nowhere else
  assert.equal(eff('dn_ws').dm_ws_refund, 'own');
  assert.equal(eff('dn_ws_prog').dm_ws_refund, 'inherited');
  for (const n of ['offer', 'dn_sub', 'dn_ship', 'dn_support', 'business', 'dn_social']) assert.equal(eff(n).dm_ws_refund, undefined, `not in ${n}`);
  assert.equal(eff('dn_sub').dm_sup_sla, undefined, 'the support SLA stays in its own section');
  assert.equal(eff('dn_support').dm_sup_sla, 'own');
  // exception: the group-workshop decision sets «no discount» aside for the workshop branch only (with a reason in the Change log)
  assert.equal(eff('dn_ws').dm_nodiscount, 'overridden');
  assert.equal(eff('dn_ws_prog').dm_nodiscount, 'overridden');
  assert.equal(eff('dn_sub').dm_nodiscount, 'global');
  const rel = d.relationships.find((r) => r.type === 'overrides')!;
  assert.deepEqual([rel.sourceId, rel.targetId], ['dm_ws_group', 'dm_nodiscount']);
  assert.ok(d.changes.some((c) => c.objectId === 'dm_ws_group' && c.after && 'overrides' in c.after && c.reason));
  // expired: listed where it would have applied, in force nowhere
  assert.equal(eff('dn_social').dm_old_promo, 'expired');
  assert.ok(!effectiveObjects('dn_social', d.objects, NODES, d.relationships, NOW).some((o) => o.id === 'dm_old_promo'));
  // guardrails at the workshop branch: its own refund rule + the SLA is not there; «no discount» is set aside
  assert.deepEqual(guardrailsFor('dn_ws_prog', d.objects, NODES, d.relationships, NOW).map((o) => o.id).sort(), ['dm_ws_refund']);
  assert.ok(guardrailsFor('dn_sub', d.objects, NODES, d.relationships, NOW).some((o) => o.id === 'dm_nodiscount'));
});

test('a parent/child contradiction is found by the level-by-level check; the objects are real and nothing is judged', () => {
  const pair = candidatePairs(d.objects, 50, d.relationships, NODES).find((p) => p.key === 'dm_day4|dm_ship_time');
  assert.ok(pair, 'first of the month (parent) vs every Saturday (child)');
  assert.ok(pair.reasons.includes('inherits_conflict'));
  assert.equal(unresolvedContradictions(d.objects, []).filter((c) => c.source === 'semantic').length, 0);
});

// ── the thinking structure in the showcase ───────────────────────────────────────────────────────────────────
test('thinking: marked note lines give open questions / decisions / ideas / assumptions; a mid-line marker is nothing; a converted line carries ✓; notes are plain text', () => {
  const items = thinkingOf(d.notes);
  const by = (k: string) => items.filter((i) => i.kind === k);
  assert.deepEqual(items.filter((i) => i.noteId === 'dnote_7').map((i) => i.kind), ['question', 'open_decision', 'idea', 'assumption'], 'the line with [فرض] in the middle is not a marker');
  assert.ok(by('question').length >= 2 && by('open_decision').length >= 1 && by('idea').length >= 1);
  const converted = items.filter((i) => convertedTo(i, d.objects));
  assert.deepEqual(converted.map((i) => i.text), ['بیشتر مشتری‌ها بعد از سه ماه تمدید می‌کنند'], 'only the assumption was converted ✓');
  const obj = d.objects.find((o) => o.id === convertedTo(converted[0], d.objects))!;
  assert.deepEqual([obj.type, obj.status, obj.assumption, obj.provenance], ['Fact', 'Proposed', true, 'User Input']);
  assert.ok(d.notes.some((n) => canSplit(n.content)), 'a note with several ## headings suggests «تبدیل به گره»');
});

test('assumptions and a decision record: one assumption is due, one is later; a Confirmed assumption is still not knowledge; the rejected option is listed; a due decision asks «نتیجه چه شد؟»', () => {
  const ass = d.objects.filter((o) => o.assumption);
  assert.deepEqual(ass.map((o) => [o.id, o.type]).sort(), [['dm_assume_msg', 'Fact'], ['dm_assume_renew', 'Fact']]);
  assert.deepEqual(assumptionsDue(d.objects, NOW).map((o) => o.id), ['dm_assume_msg']);
  assert.ok(ass.find((o) => o.id === 'dm_assume_renew')!.reviewBy! > '2026-03-10', 'the other one is due later');
  const msg = d.objects.find((o) => o.id === 'dm_assume_msg')!;
  assert.equal(msg.status, 'Confirmed');
  assert.equal(isEstablished(msg), false, 'Confirmed, yet not knowledge');
  assert.deepEqual(rejectedOptions(d.objects).map((r) => [r.objectId, r.title]), [['dm_ws_group', 'تخفیف ۱۵ درصد روی قیمت کارگاه']]);
  assert.deepEqual(decisionsDue(d.objects, d.changes, NOW).map((o) => o.id).sort(), ['dm_price2', 'dm_ws_group'], 'the decision whose metric expectation date is today is due too');
  const wk = buildWeeklyReview({ objects: d.objects, relationships: d.relationships, changes: d.changes, deliverables: d.deliverables, now: NOW });
  assert.deepEqual([wk.due.assumptions.length, wk.due.decisions.length], [1, 2], 'they show up in «این هفته» too');
});

// ── packs, facets, samples, a template in the showcase ───────────────────────────────────────────
import { buildAiRequest } from './aiRequest';
import { approvalsOf, versionHistory } from './versionHistory';
import { extractMentions, suggestLinks } from './mentions';
import { buildSearchIndex, searchIndex } from './globalSearch';
import { buildContextPack } from './contextPack';

test('showcase packs: three different selections, resolved through the effective context; assumptions and rejected options apart; no sample anywhere', () => {
  const packOf = (id: string) => { const p = d.packs.find((x) => x.id === id)!; return buildContextPack({ packId: p.id, workspaceName: 'x', nodes: [...DEFAULT_TREE_NODES, ...d.nodes], objects: d.objects, relationships: d.relationships, now: NOW, targetNodeIds: p.selection.nodeIds, facets: p.selection.facets, statuses: p.selection.statuses, includeAssumptions: p.selection.includeAssumptions, instruction: p.instruction }); };
  assert.equal(d.packs.filter((p) => !p.kind).length, 3);
  const ads = packOf('pk_demo_ads');
  assert.ok(ads.markdown.includes('## دستور') && ads.markdown.includes('dm_pack@') && ads.markdown.includes('dm_assume_renew'), 'subscription pack: its decisions and its assumption (apart)');
  assert.ok(!ads.markdown.includes('dm_ws_refund'), 'a workshop rule (position) never enters the subscription pack');
  assert.ok(ads.markdown.includes('dm_nodiscount'), 'a global rule is in every pack');
  const support = packOf('pk_demo_support');
  assert.equal(support.counts.assumptions, 0, 'assumptions off');
  assert.ok(support.markdown.includes('dm_sup_sla@') && !support.markdown.includes('dm_ws_refund'));
  const ws = packOf('pk_demo_ws');
  assert.ok(ws.markdown.includes('تخفیف ۱۵ درصد روی قیمت کارگاه') && ws.markdown.includes('گزینه‌های بررسی‌شده و ردشده'), 'the rejected option reaches the AI so it is not proposed again');
  assert.ok(ws.markdown.includes('dm_ws_plan@') && ws.counts.proposed >= 1, 'proposed items are labelled unconfirmed');
  for (const p of d.packs.filter((x) => !x.kind)) assert.ok(!packOf(p.id).markdown.includes('مثال:'), 'no sample text in any pack');
});

test('showcase facets, samples and template: three facets on a real axis; three grey samples; the template holds the workshop branch', () => {
  const facets = new Set(d.objects.flatMap((o) => o.facets ?? []));
  assert.deepEqual([...facets].sort(), ['پاییز', 'کارگاه', 'مشتری ماهانه'].sort());
  assert.ok(d.objects.every((o) => !o.sample), 'samples are not in the knowledge list');
  assert.equal(d.samples.length, 3);
  assert.ok(d.samples.every((x) => x.content.startsWith('مثال:')));
  assert.deepEqual(d.templates.map((t) => [t.kind, t.payload.root.label, t.payload.root.children.map((c) => c.label)]), [['node', 'کارگاه برشته‌کاری', ['برنامهٔ جلسه‌ها']]]);
  assert.ok(d.templates[0].payload.objects.every((o) => o.title !== 'برنامهٔ جلسه‌ها' || o.path.length === 1), 'paths are child indexes');
});

test('metrics in the showcase: three metrics, twelve numbers, four decisions with an expectation — one reached, one fell short, one due today, one still open', () => {
  assert.equal(d.metrics.length, 3);
  assert.ok(d.measurements.length >= 8 && d.measurements.length <= 12, `${d.measurements.length} numbers`);
  assert.ok(d.measurements.every((m) => d.metrics.some((x) => x.id === m.metricId)));
  const ms = d.metrics.map((m) => ({ ...m, workspaceId: 'ws_demo', createdAt: m.at, updatedAt: m.at }));
  const all = d.measurements.map((m) => ({ id: m.id, workspaceId: 'ws_demo', metricId: m.metricId, value: m.value, at: m.day, source: 'demo' as const, status: 'Confirmed' as const, createdAt: `${m.day}T09:00:00Z`, ...(m.note ? { note: m.note } : {}) }));
  const rows = expectationRows(d.objects, ms, all, d.changes, NOW);
  assert.equal(rows.length, 4);
  const by = new Map(rows.map((r) => [r.decision.id, r]));
  assert.equal(by.get('dm_channel')!.verdict, 'met');
  assert.equal(suggestVerdict(by.get('dm_channel')!.reading), 'met', 'what the numbers say agrees with what the user judged');
  assert.equal(by.get('dm_budget')!.verdict, 'missed');
  assert.equal(suggestVerdict(by.get('dm_budget')!.reading), 'missed');
  assert.deepEqual(expectationsDue(rows, NOW).map((r) => r.decision.id), ['dm_price2'], 'one is due today and not judged');
  assert.equal(suggestVerdict(by.get('dm_price2')!.reading), 'partial');
  assert.equal(by.get('dm_pack')!.reading.state, 'open');
  assert.deepEqual(verdictTally(rows), { met: 1, partial: 0, missed: 1, open: 2 });
  // each decision has a moment on the time line, taken from the Change table
  assert.ok(rows.every((r) => !!r.moment), 'every expectation decision has a decision day');
});

test('showcase saved requests: an audit and a decision, each assembled from confirmed knowledge only — no sample, no Proposed as fact', () => {
  const reqs = d.packs.filter((p) => p.kind);
  assert.deepEqual(reqs.map((p) => p.kind).sort(), ['audit', 'decision']);
  for (const p of reqs) {
    const r = buildAiRequest({ kind: p.kind!, request: p.template!, scopeNodeId: p.selection.nodeIds[0], workspaceName: 'x', nodes: [...DEFAULT_TREE_NODES, ...d.nodes], objects: d.objects, relationships: d.relationships, now: NOW });
    assert.ok(r.included.length > 0 && r.markdown.includes(p.template!));
    assert.ok(!r.markdown.includes('مثال:'), 'no sample text');
    assert.ok(r.included.every((i) => d.objects.find((o) => o.id === i.id)!.status === 'Confirmed'), 'only Confirmed is sent');
    assert.ok(r.excluded.some((e) => e.reason === 'unconfirmed') || p.kind === 'decision', 'what is not confirmed is left out with a reason');
  }
});

test('showcase version path: one object with three rewrites and one approval reads as «۴ پیش‌نویس» → «تأیید شد در نسخهٔ ۴»; the version counter is unchanged', () => {
  const tone = d.objects.find((x) => x.id === 'dm_tone')!;
  assert.equal(tone.version, 4);
  assert.equal(tone.status, 'Confirmed');
  const h = versionHistory(d.changes.filter((c) => c.objectId === 'dm_tone'));
  assert.deepEqual(h.entries.map((e) => e.type), ['drafts', 'milestone']);
  assert.equal((h.entries[0] as { count: number }).count, 4);
  assert.deepEqual([h.lastApproval?.version, h.lastApproval?.how, h.draftsSinceApproval], [4, 'accepted', 0]);
  assert.equal(approvalsOf(d.changes).dm_tone.version, 4);
  // an object nobody ever drafted is a single milestone at its first version
  const plain = versionHistory(d.changes.filter((c) => c.objectId === 'dm_voice'));
  assert.equal(plain.entries.filter((e) => e.type === 'milestone').length >= 1, true);
});

test('showcase: an «@» reference suggests a link (and creates none); a note can name knowledge; everything is found with a few letters', () => {
  const tone = d.objects.find((x) => x.id === 'dm_tone')!;
  assert.match(tone.content, /@«ساعت پاسخگویی»/);
  const before = JSON.stringify(d.relationships);
  const sg = suggestLinks({ text: tone.content, selfId: tone.id, objects: d.objects, relationships: d.relationships });
  assert.deepEqual(sg.map((x) => x.targetId), ['dm_sup_hours']);
  assert.equal(JSON.stringify(d.relationships), before, 'suggesting changes nothing');
  assert.ok(!d.relationships.some((r) => r.sourceId === 'dm_tone' && r.targetId === 'dm_sup_hours'), 'and the demo has no such link yet');
  const note = d.notes.find((n) => /@«/.test(n.content))!;
  assert.equal(extractMentions(note.content, d.objects)[0].objectId, 'dm_channel');
  const ix = buildSearchIndex({ nodes: [...DEFAULT_TREE_NODES, ...d.nodes], objects: d.objects, deliverables: [], notes: d.notes.map((n) => ({ id: n.id, nodeId: n.nodeId, content: n.content })) });
  assert.ok(searchIndex(ix, 'قیم').object.some((h) => h.id === 'dm_price2'));
  assert.ok(searchIndex(ix, 'هدیه').note.length >= 1, 'a note is found');
  assert.ok(!JSON.stringify(searchIndex(ix, 'مثال')).includes('smp_demo'), 'examples are not searched');
});

import { diffWords, diffStats } from './textDiff';
import { versionTexts } from './versionHistory';

test('showcase history: every edit has a real before and after that differ and diff to something; the rebuilt versions end in the object\'s current text (the same path the product writes)', () => {
  const d = buildDemo(NOW);
  const edits = d.changes.filter((c) => c.kind === 'edited' && c.toVersion > c.fromVersion);
  assert.ok(edits.length >= 6, 'the showcase has real edits');
  for (const c of edits) {
    const b = c.before as { content?: string }, a = c.after as { content?: string };
    assert.ok(typeof b?.content === 'string' && typeof a?.content === 'string' && b.content !== a.content, `edit ${c.id}: before and after are different texts`);
    const s = diffStats(diffWords(b.content!, a.content!));
    assert.ok(s.added + s.removed > 0, `edit ${c.id}: the diff has something to show`);
  }
  for (const o of d.objects.filter((x) => x.status !== 'Proposed')) {
    const mine = d.changes.filter((c) => c.objectId === o.id);
    const texts = versionTexts(mine);
    if (!mine.some((c) => c.kind === 'edited' && c.toVersion > c.fromVersion)) continue;
    assert.equal(texts[texts.length - 1].content, o.content, `${o.title}: the last version in the log is the object's text`);
    assert.equal(texts[texts.length - 1].version, o.version, `${o.title}: …at the object's version`);
    assert.ok(texts.length >= 2, `${o.title}: two versions can be compared`);
  }
});

import { thinkingSpace } from './thinkingSpace';

test('showcase thinking: one confirmed knowledge has an unapproved rewrite — it waits in the thinking space and no request or pack reads it', () => {
  const d = buildDemo(NOW);
  const withDraft = d.objects.filter((o) => o.draft);
  assert.equal(withDraft.length, 1);
  const o = withDraft[0];
  assert.equal(o.status, 'Confirmed');
  assert.ok(thinkingSpace({ objects: d.objects, notes: d.notes, nodes: [...DEFAULT_TREE_NODES, ...d.nodes] }).waiting.some((w) => w.type === 'draft' && w.object.id === o.id));
  const r = buildAiRequest({ kind: 'question', request: 'قیمت کارگاه گروهی چقدر است؟', workspaceName: 'x', nodes: [...DEFAULT_TREE_NODES, ...d.nodes], objects: d.objects, relationships: d.relationships, now: NOW });
  assert.ok(r.markdown.includes(o.content) || !r.included.some((i) => i.id === o.id), 'the approved text is what a request carries');
  assert.ok(!r.markdown.includes(o.draft!.content), 'the draft text is nowhere in a request');
});
