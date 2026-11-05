/**
 * «وصل کن»: what the person may say about TWO cards, in plain words, and what each choice would do. One place for the canvas
 * (drag, tap-tap, keyboard) and its tests; the repo enforces the same rules again.
 *
 *   «بر آن تکیه دارد»   A depends_on B                (source A, target B)
 *   «روی آن اثر دارد»   B depends_on A                (the same relation, the other direction)
 *   «جایگزینِ آن است»   A supersedes B
 *   «اینجا اعمال نشود»  A overrides B   (the UI never says «استثنا»: forbidden-words list)                  (only when A sits in a sub-section of B's section)
 * «ساخته‌شده از» and «تبدیل‌شده به» are written by the system (a thought converted, an output built) — never by hand: a hand-drawn
 * one could claim an origin that never happened.
 *
 * Rules (docs/spine.md): a link to oneself is refused; an existing one says «لازم نیست»; a link another path already implies is
 * allowed but says so; a CYCLE is NOT refused — two things resting on each other are simply decided together — the choice says so.
 * A link to something replaced or archived is refused; a link with an unapproved end stays a suggestion. Pure.
 */

import type { ContextObject, ContextRelationship, TreeNode } from '../types';
import { redundantLinks } from './dependencyReduction';
import { overrideProblem } from './effectiveContext';

export type ConnectChoice = 'relies' | 'affects' | 'replaces' | 'exception';
export interface ConnectOption {
  choice: ConnectChoice;
  /** the sentence on the button, with both titles */
  label: string;
  type: 'depends_on' | 'supersedes' | 'overrides';
  /** the relation's source and target */
  fromId: string;
  toId: string;
  /** why it cannot be chosen (the button is disabled and says this) */
  blocked?: string;
  /** a heads-up that does not stop it */
  note?: string;
}

const dead = (o: ContextObject) => o.status === 'Superseded' || o.status === 'Archived';
const pending = (o: ContextObject) => o.status === 'Proposed' || o.status === 'Needs Review';
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

/** every way to connect `a` to `b` (a = where the person started, b = where she ended) */
export function connectOptions(a: ContextObject, b: ContextObject, nodes: TreeNode[], relationships: ContextRelationship[], objects: ContextObject[] = [a, b]): ConnectOption[] {
  const dep = (from: string, to: string) => relationships.some((r) => r.type === 'depends_on' && r.sourceId === from && r.targetId === to);
  const A = `«${short(a.title)}»`, B = `«${short(b.title)}»`;
  const same = a.id === b.id;
  const base = (): string | undefined => (same ? 'یک مورد را نمی‌شود به خودش وصل کرد.' : dead(a) || dead(b) ? 'یکی از این دو جایگزین یا بایگانی شده است.' : undefined);
  const viaNote = (from: string, to: string) => {
    const via = redundantLinks(objects.map((o) => o), [...relationships, { id: 'x', sourceId: from, targetId: to, type: 'depends_on', createdAt: '' }]).find((l) => l.from === from && l.to === to)?.via;
    return via?.length ? `لازم نیست؛ از راه «${short(objects.find((o) => o.id === via[0])?.title ?? '')}» به آن می‌رسد.` : undefined;
  };
  const dependsOn = (choice: 'relies' | 'affects'): ConnectOption => {
    const [from, to] = choice === 'relies' ? [a, b] : [b, a]; // the relation's source rests on its target
    const label = choice === 'relies' ? `${A} بر ${B} تکیه دارد` : `${A} روی ${B} اثر دارد`;
    const notes: string[] = [];
    let blocked = base();
    if (!blocked && dep(from.id, to.id)) blocked = 'لازم نیست؛ این وابستگی از قبل هست.';
    if (!blocked && dep(to.id, from.id)) notes.push('این دو حالا روی هم سوارند؛ با هم تصمیم گرفته می‌شوند.');
    if (!blocked) { const v = viaNote(from.id, to.id); if (v) notes.push(v); }
    if (!blocked && (pending(from) || pending(to))) notes.push('یک سرش هنوز تأیید نشده؛ تا آن موقع پیشنهادی می‌ماند.');
    return { choice, label, type: 'depends_on', fromId: from.id, toId: to.id, ...(blocked ? { blocked } : {}), ...(notes.length ? { note: notes.join(' ') } : {}) };
  };
  const replaces: ConnectOption = (() => {
    let blocked = base();
    if (!blocked && b.status !== 'Confirmed') blocked = 'فقط دانش تأییدشده را می‌شود جایگزین کرد.';
    if (!blocked && a.type !== b.type) blocked = 'جایگزین باید از همان نوع باشد.';
    if (!blocked && relationships.some((r) => r.type === 'supersedes' && r.sourceId === a.id && r.targetId === b.id)) blocked = 'لازم نیست؛ این جایگزینی از قبل هست.';
    return { choice: 'replaces', label: `${A} جایگزین ${B} است`, type: 'supersedes', fromId: a.id, toId: b.id, ...(blocked ? { blocked } : { note: `«${short(b.title)}» در تاریخچه می‌ماند ولی دیگر حاکم نیست.` }) };
  })();
  const options: ConnectOption[] = [dependsOn('relies'), dependsOn('affects'), replaces];
  // «استثنای آن است» only means something when A lives BELOW B: otherwise it is not offered at all (no dead button)
  if (!same && !overrideProblem(a, b, nodes)) {
    const blocked = base() ?? (relationships.some((r) => r.type === 'overrides' && r.sourceId === a.id && r.targetId === b.id) ? 'لازم نیست؛ این استثنا از قبل هست.' : undefined);
    options.push({ choice: 'exception', label: `${B} در بخش «${nodes.find((n) => n.id === a.nodeId)?.label ?? ''}» اعمال نشود (به‌خاطر ${A})`, type: 'overrides', fromId: a.id, toId: b.id, ...(blocked ? { blocked } : { note: `در بخش «${nodes.find((n) => n.id === a.nodeId)?.label ?? ''}» و زیربخش‌هایش «${short(b.title)}» کنار گذاشته می‌شود.` }) });
  }
  return options;
}

/** the undo of a connection: the dependency list before (depends_on), or the relation to remove */
export function connectionUndo(opt: Pick<ConnectOption, 'type' | 'fromId' | 'toId'>, relationships: ContextRelationship[]): { type: 'setDependencies'; objectId: string; targetIds: string[] } | { type: 'removeRelation'; relType: ConnectOption['type']; fromId: string; toId: string } {
  if (opt.type === 'depends_on') return { type: 'setDependencies', objectId: opt.fromId, targetIds: relationships.filter((r) => r.type === 'depends_on' && r.sourceId === opt.fromId).map((r) => r.targetId) };
  return { type: 'removeRelation', relType: opt.type, fromId: opt.fromId, toId: opt.toId };
}
