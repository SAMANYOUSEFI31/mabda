import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextPack } from './contextPack';
import { buildAiRequest, explainOfRequest } from './aiRequest';
import { fromText, leftWhy, reachSentence, relationOf, scopeSeeds, standingOver } from './packScope';
import { groupItems, groupLeft } from './scopeExplain';
import type { ContextObject, ContextRelationship, TreeNode } from '../types';

const NOW = new Date('2026-06-01T00:00:00Z');
// root «بنیان» → «محصول» → «آفر»;  root → «برند»;  «محصول» has two children, «برند» one
const nodes: TreeNode[] = [
  { id: 'r', label: 'بنیان', description: '', order: 0 },
  { id: 'prod', label: 'محصول', description: '', parentId: 'r', order: 0 },
  { id: 'offer', label: 'آفر و قیمت‌گذاری', description: '', parentId: 'prod', order: 0 },
  { id: 'work', label: 'کارگاه', description: '', parentId: 'prod', order: 1 },
  { id: 'brand', label: 'برند', description: '', parentId: 'r', order: 1 },
  { id: 'voice', label: 'لحن', description: '', parentId: 'brand', order: 0 },
];
const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: `عنوان-${id}`, content: `متن-${id}`, nodeId: 'prod', version: 1, createdAt: '2026-01-01', updatedAt: '', ...p,
});
const objects: ContextObject[] = [
  o('f_prod', { nodeId: 'prod' }),
  o('f_offer', { nodeId: 'offer' }),
  o('f_work', { nodeId: 'work' }),
  o('f_brand', { nodeId: 'brand' }),
  o('f_voice', { nodeId: 'voice' }),
  o('f_root', { nodeId: 'r' }),
  o('c_global', { type: 'Constraint', nodeId: 'brand', title: 'خط قرمز برند' }),                       // reach default for a Constraint: global
  o('c_here', { type: 'Constraint', nodeId: 'offer', reach: 'position', title: 'خط قرمز آفر' }),
  o('c_prod', { type: 'Constraint', nodeId: 'prod', reach: 'position', title: 'خط قرمز محصول' }),
  o('a_one', { nodeId: 'prod', assumption: true, title: 'فرض محصول' }),
  o('p_one', { nodeId: 'prod', status: 'Proposed', title: 'پیشنهاد محصول' }),
  o('x_old', { nodeId: 'prod', validUntil: '2026-01-01', title: 'منقضی' }),
];
const ids = (m: string) => objects.filter((x) => m.includes(`${x.id}@v`)).map((x) => x.id);
const pack = (p: Partial<Parameters<typeof buildContextPack>[0]> = {}) => buildContextPack({ packId: 'p', workspaceName: 'w', nodes, objects, now: NOW, ...p });

test('scopeSeeds: nothing picked = the whole tree; a ghost is ignored; «با زیربخش‌ها» expands to the sub-trees', () => {
  assert.equal(scopeSeeds(nodes, [], false).whole, true);
  assert.equal(scopeSeeds(nodes, ['ghost'], false).whole, true, 'only ghosts picked = nothing picked');
  assert.deepEqual(scopeSeeds(nodes, ['prod', 'ghost'], false).seeds, ['prod']);
  assert.deepEqual(scopeSeeds(nodes, ['prod'], true).seeds.sort(), ['offer', 'prod', 'work']);
  assert.deepEqual(scopeSeeds(nodes, ['prod', 'offer'], true).seeds.sort(), ['offer', 'prod', 'work'], 'no duplicates when a child is picked too');
});

test('the rule, in one table: own + inherited from above + global; never a sibling, a child (unless asked) or an expired one', () => {
  const at = (nodeIds: string[], withChildren: boolean) => ids(pack({ targetNodeIds: nodeIds, withChildren, statuses: [], includeAssumptions: false }).markdown);
  const one = at(['prod'], false);
  for (const id of ['f_prod', 'f_root', 'c_global', 'c_prod']) assert.ok(one.includes(id), `${id} reaches «محصول»`);
  for (const id of ['f_offer', 'f_work', 'c_here']) assert.ok(!one.includes(id), `${id} (a sub-section) is NOT in without «با زیربخش‌ها»`);
  for (const id of ['f_brand', 'f_voice']) assert.ok(!one.includes(id), `${id} (a sibling) never`);
  assert.ok(!one.includes('x_old'), 'expired never');
  assert.ok(!one.includes('p_one'), 'a suggestion only when ticked');
  const kids = at(['prod'], true);
  for (const id of ['f_prod', 'f_offer', 'f_work', 'c_here', 'c_global', 'f_root']) assert.ok(kids.includes(id), `${id} with sub-sections`);
  assert.ok(!kids.includes('f_brand') && !kids.includes('f_voice'), 'a sibling is still not there');
  const two = at(['offer', 'voice'], false);
  assert.ok(two.includes('f_offer') && two.includes('f_voice'), 'several sections: each is read');
  assert.ok(!two.includes('f_work'), 'a section nobody picked (a sibling of «آفر») is not');
  assert.ok(two.includes('f_prod') && two.includes('f_brand'), 'what both inherit from above (their parents) comes');
});

test('an exception (overrides) switches the rule off for the picked section only; expired is never; both are said in «چه نیامد»', () => {
  const rels: ContextRelationship[] = [{ id: 'r1', sourceId: 'c_here', targetId: 'c_prod', type: 'overrides', createdAt: '' }];
  const at = pack({ targetNodeIds: ['offer'], relationships: rels });
  assert.ok(!at.markdown.includes('c_prod@v'), 'the exception at «آفر» turns «خط قرمز محصول» off there');
  const left = at.explain.skipped.find((l) => l.id === 'c_prod')!;
  assert.equal(left.reason, 'overridden');
  assert.match(left.why, /کنار گذاشته/);
  const parent = pack({ targetNodeIds: ['prod'], relationships: rels });
  assert.ok(parent.markdown.includes('c_prod@v'), 'at the parent the rule still holds');
  assert.equal(parent.explain.skipped.find((l) => l.id === 'x_old')?.reason, 'expired');
});

test('explain: every included thing says where it came from; guardrails are their own group; skipped things say why', () => {
  const p = pack({ targetNodeIds: ['offer'], includeAssumptions: true, statuses: [] });
  const byId = new Map(p.explain.items.filter((i) => i.id).map((i) => [i.id!, i]));
  assert.equal(byId.get('c_global')!.group, 'guardrail');
  assert.equal(byId.get('c_global')!.from, 'از «برند»، همه‌جا');
  assert.equal(byId.get('c_here')!.from, 'مال «آفر و قیمت‌گذاری»');
  assert.equal(byId.get('c_prod')!.from, 'از بخش بالاتر («محصول»)');
  assert.equal(byId.get('f_offer')!.group, 'fact');
  assert.equal(byId.get('a_one')!.group, 'assumption');
  assert.ok(![...byId.values()].some((i) => i.group === 'unconfirmed'), 'statuses off: no suggestion');
  const left = new Map(p.explain.skipped.map((l) => [l.id, l]));
  assert.equal(left.get('f_work')!.reason, 'scope');
  assert.equal(left.get('p_one')!.reason, 'status', 'a suggestion in force at the scope but not ticked says «تأییدنشده؛ تیکش نخورده»');
});

test('explain: skipped reasons are specific (sub-section, status, assumption, facet, expired)', () => {
  const p = pack({ targetNodeIds: ['prod'], statuses: [], includeAssumptions: false, facets: ['x'] });
  const why = (id: string) => p.explain.skipped.find((l) => l.id === id)?.reason;
  assert.equal(why('f_offer'), 'child', 'a sub-section that was not picked says so');
  assert.equal(why('f_brand'), 'scope');
  assert.equal(why('f_prod'), 'facet');
  assert.equal(why('p_one'), 'facet');
  const q = pack({ targetNodeIds: ['prod'], statuses: [], includeAssumptions: false });
  assert.equal(q.explain.skipped.find((l) => l.id === 'p_one')?.reason, 'status');
  assert.equal(q.explain.skipped.find((l) => l.id === 'a_one')?.reason, 'assumption');
  const withKids = pack({ targetNodeIds: ['prod'], withChildren: true });
  assert.ok(!withKids.explain.skipped.some((l) => l.reason === 'child'), 'with sub-sections there is no «child» left');
  assert.deepEqual(groupItems(withKids.explain.items).map(([g]) => g).slice(0, 2), ['guardrail', 'fact']);
  assert.ok(groupLeft(p.explain.skipped).length >= 3);
});

test('a suggestion / an assumption comes only when ticked, under their own label, and never as a fact (the same data feeds the explanation)', () => {
  const p = pack({ targetNodeIds: ['prod'], statuses: ['Proposed'], includeAssumptions: true });
  assert.ok(p.markdown.includes('p_one@v') && p.markdown.includes('a_one@v'));
  const facts = p.markdown.slice(p.markdown.indexOf('## واقعیت‌های تأییدشده'), p.markdown.indexOf('## پیشنهادی'));
  assert.ok(!facts.includes('p_one@v') && !facts.includes('a_one@v'));
  const g = new Map(p.explain.items.map((i) => [i.id, i.group]));
  assert.equal(g.get('p_one'), 'unconfirmed');
  assert.equal(g.get('a_one'), 'assumption');
  assert.deepEqual([...new Set(p.explain.items.map((i) => i.id).filter(Boolean))].sort(), [...new Set(ids(p.markdown))].sort(), 'the explanation lists exactly the objects in the text');
});

test('the request reads the SAME scope: several sections, «با زیربخش‌ها», the same standing, a «زیربخش انتخاب‌نشده» reason, and a «from» for every included thing', () => {
  const run = (scopeNodeIds: string[], withChildren: boolean) => buildAiRequest({ kind: 'question', request: 'متن', workspaceName: 'w', nodes, objects, now: NOW, scopeNodeIds, withChildren, tokenBudget: 20000 });
  const one = run(['prod'], false);
  const inc = (r: ReturnType<typeof run>) => r.included.map((i) => i.id);
  assert.ok(inc(one).includes('f_prod') && !inc(one).includes('f_offer'));
  assert.equal(one.excluded.find((e) => e.id === 'f_offer')?.reason, 'child');
  assert.match(one.excluded.find((e) => e.id === 'f_offer')!.why, /زیربخش/);
  const kids = run(['prod'], true);
  assert.ok(inc(kids).includes('f_offer') && inc(kids).includes('f_work'));
  assert.ok(!inc(kids).includes('f_brand'));
  const two = run(['offer', 'voice'], false);
  assert.ok(inc(two).includes('f_offer') && inc(two).includes('f_voice'), 'both picked sections are read — not only the first');
  assert.equal(two.scope.pickedLabels.length, 2);
  assert.ok(two.markdown.includes('scope="بنیان ‹ محصول ‹ آفر و قیمت‌گذاری + بنیان ‹ برند ‹ لحن"'), 'the prompt names every section');
  for (const i of two.included) assert.ok(i.from.length > 3, `${i.id} has a «from»`);
  const ex = explainOfRequest(two);
  assert.equal(ex.items.find((i) => i.id === 'c_global')?.group, 'guardrail');
  assert.equal(ex.items.find((i) => i.id === 'c_global')?.from, 'از «برند»، همه‌جا');
  // the pack and the request agree on what is in force at the same scope
  const pk = pack({ targetNodeIds: ['offer', 'voice'], withChildren: false, statuses: [], includeAssumptions: false });
  const fromPack = new Set(ids(pk.markdown).filter((id) => objects.find((x) => x.id === id)!.status === 'Confirmed' && !objects.find((x) => x.id === id)!.assumption));
  for (const id of inc(two)) assert.ok(fromPack.has(id) || objects.find((x) => x.id === id)!.assumption, `${id}: in the request ⇒ in the pack`);
});

test('relationOf / fromText / reachSentence: the words the user reads', () => {
  const sc = scopeSeeds(nodes, ['prod'], true);
  const c = objects.find((x) => x.id === 'c_here')!;
  assert.equal(relationOf(c, sc, nodes), 'below');
  assert.equal(fromText(c, sc, nodes), 'از زیربخش «آفر و قیمت‌گذاری»');
  assert.equal(relationOf(objects.find((x) => x.id === 'c_global')!, sc, nodes), 'global');
  assert.equal(relationOf(objects.find((x) => x.id === 'f_brand')!, scopeSeeds(nodes, [], false), nodes), 'whole');
  assert.match(reachSentence(objects.find((x) => x.id === 'c_global')!, nodes), /همهٔ بسته‌ها و درخواست‌های AI/);
  assert.match(reachSentence(c, nodes), /«آفر و قیمت‌گذاری»/);
  assert.match(reachSentence(objects.find((x) => x.id === 'c_prod')!, nodes), /زیربخش/);
  assert.match(leftWhy('scope', c, nodes), /فقط این بخش/);
  assert.equal(standingOver(sc, objects, nodes, [], NOW).get('c_global')!.origin, 'global');
});
