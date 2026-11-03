import test from 'node:test';
import assert from 'node:assert/strict';
import { activeMention, applyMention, extractMentions, mentionCandidates, mentionText, suggestLinks } from './mentions';
import type { ContextObject, ContextRelationship } from '../types';

const o = (id: string, title: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title, content: `متن ${title}`, nodeId: 'business', version: 1, createdAt: '', updatedAt: `2026-01-0${id.length}`, ...p,
});
const objs = [o('a', 'قیمت اشتراک ماهانه'), o('b', 'لحن برند'), o('c', 'مخاطب اصلی'), o('p', 'پیشنهاد کانال', { status: 'Proposed' }), o('x', 'قدیمی', { status: 'Superseded' }), o('d1', 'تکراری'), o('d2', 'تکراری')];
const dep = (s: string, t: string): ContextRelationship => ({ id: `${s}-${t}`, sourceId: s, targetId: t, type: 'depends_on', createdAt: '' });

test('extractMentions: finds @«title», resolves on the normalised title, never guesses between two objects of one title', () => {
  const text = 'این به @«قیمت اشتراک ماهانه» و @«لحن  برند» و @«تکراری» و @«ناموجود» اشاره دارد';
  const m = extractMentions(text, objs);
  assert.deepEqual(m.map((x) => x.objectId ?? (x.ambiguous ? 'amb' : null)), ['a', 'b', 'amb', null]);
  assert.equal(text.slice(m[0].start, m[0].end), '@«قیمت اشتراک ماهانه»');
  assert.equal(extractMentions('@«قيمت اشتراك ماهانه»', objs)[0].objectId, 'a', 'Arabic ي / ك match');
  assert.deepEqual(extractMentions('بدون ارجاع، فقط @ تنها و ایمیل a@b.com', objs), []);
  assert.equal(extractMentions('@«قدیمی»', objs)[0].objectId, undefined, 'a superseded object is not a target');
});

test('suggestLinks only SUGGESTS: not self, not linked, not proposed, not dismissed, each once', () => {
  const text = '@«قیمت اشتراک ماهانه» @«قیمت اشتراک ماهانه» @«لحن برند» @«مخاطب اصلی» @«پیشنهاد کانال» @«تکراری»';
  const base = { text, selfId: 'c', objects: objs, relationships: [] as ContextRelationship[] };
  assert.deepEqual(suggestLinks(base).map((s) => s.targetId), ['a', 'b'], 'self (c), proposed (p) and the ambiguous title are left out; a is listed once');
  assert.deepEqual(suggestLinks({ ...base, relationships: [dep('c', 'a')] }).map((s) => s.targetId), ['b'], 'already linked');
  assert.deepEqual(suggestLinks({ ...base, dismissed: ['b'] }).map((s) => s.targetId), ['a'], 'turned down before');
  assert.deepEqual(suggestLinks({ ...base, text: 'هیچ ارجاعی نیست' }), []);
  // a new object (no id yet) can be suggested everything it names
  assert.equal(suggestLinks({ ...base, selfId: undefined }).length, 3);
});

test('suggestLinks is a pure function: it neither mutates nor returns relationships', () => {
  const rels = [dep('c', 'a')];
  const copy = JSON.stringify(rels);
  suggestLinks({ text: '@«لحن برند»', selfId: 'c', objects: objs, relationships: rels });
  assert.equal(JSON.stringify(rels), copy);
});

test('activeMention: the @word at the caret; it must start the text or follow a space; it ends at » or a new line', () => {
  const t1 = 'این به @قیم';
  assert.deepEqual(activeMention(t1, t1.length), { start: t1.indexOf('@'), query: 'قیم' });
  assert.deepEqual(activeMention('@', 1), { start: 0, query: '' });
  const t2 = 'این به @«قیمت';
  assert.deepEqual(activeMention(t2, t2.length), { start: t2.indexOf('@'), query: 'قیمت' });
  assert.equal(activeMention('ایمیل a@b', 9), null, 'inside a word');
  const t3 = 'این @«قیمت» بعدی';
  assert.equal(activeMention(t3, t3.length), null, 'closed reference');
  assert.equal(activeMention('بدون', 4), null);
  const t4 = '@x\nخط بعد';
  assert.equal(activeMention(t4, t4.length), null);
});

test('mentionCandidates: title matches first, the object itself and history are never offered', () => {
  assert.deepEqual(mentionCandidates('قیم', objs, 'c').map((x) => x.id), ['a']);
  assert.ok(!mentionCandidates('', objs, 'c').some((x) => x.id === 'c' || x.id === 'x'));
  assert.equal(mentionCandidates('لح', objs)[0].id, 'b');
  assert.equal(mentionCandidates('کانال', objs)[0].id, 'p', 'a proposed object can be NAMED (the link is another matter)');
  assert.deepEqual(mentionCandidates('zzzz', objs), []);
});

test('applyMention writes @«title» and moves the caret after it; a » inside a title cannot end the reference early', () => {
  const text = 'این به @قیم و بعد';
  const start = text.indexOf('@');
  const caret = start + '@قیم'.length;
  const r = applyMention(text, { start }, caret, objs[0]);
  assert.equal(r.text, 'این به @«قیمت اشتراک ماهانه» و بعد', 'one space, not two');
  assert.equal(r.text.slice(0, r.caret), 'این به @«قیمت اشتراک ماهانه»');
  assert.equal(applyMention('@قی', { start: 0 }, 3, objs[0]).text, '@«قیمت اشتراک ماهانه» ', 'at the end a space is added so typing goes on');
  assert.equal(mentionText({ title: 'الف» ب' }), '@«الف ب»');
  const weird = o('w', 'الف» ب');
  assert.equal(extractMentions(mentionText(weird), [weird])[0].objectId, 'w', 'what is written can be read back');
});
