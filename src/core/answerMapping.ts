/**
 * Where does each item of an outside AI's answer belong? Deterministic, in this order — and nothing is applied by itself:
 *   ۱) an EXPLICIT mark the AI was asked to write («Ref: id@vN» = this updates that knowledge; «Section: مسیر» = put it there).
 *      We sent those ids ourselves, so a match is exact; an older version number or an unknown id is said out loud.
 *   ۲) SIMILARITY by rules (title and text words, the same tokens the contradiction engine uses), only among the knowledge the answer's
 *      pack was built from (or everything, when there is no pack): «به‌روزرسانی X» / «تکراری X»; the section comes from the similar ones.
 *   ۳) otherwise «تازه», with no section guess.
 * An AI is never the basis of a mapping. Every mapping carries a short reason the person reads, and she can change it. Pure.
 */

import type { ContextObject, TreeNode, UsedContextRef } from '../types';
import type { ParsedBlock } from './answerParser';
import { isContextKind } from './answerParser';
import { jaccard, normalizeFa, titleTokens } from './contextEngine';
import { pathTo } from './nodeFocus';
import { isActiveContext } from './contextStatus';

export type MapAction = 'new' | 'update' | 'duplicate' | 'ignore';
export interface BlockMapping {
  blockId: string;
  action: MapAction;
  /** the existing knowledge an update / duplicate is about */
  targetId?: string;
  /** the suggested section for a NEW item ('' = none) */
  nodeId: string;
  basis: 'explicit' | 'similar' | 'none';
  /** a short sentence for the person, in her language */
  reason: string;
  /** the AI named an older version than the current one */
  staleRef?: boolean;
  /** the item's text without the «Ref:» / «Section:» lines */
  body: string;
}

export interface MapContext { objects: ContextObject[]; nodes: TreeNode[]; /** what the answer's pack was built from (absent = the answer has no pack) */ pack?: UsedContextRef[] | null }

const REF_LINE = /^\s*(?:Ref|Updates?|Replaces|مرجع|به‌?روزرسانی|بروزرسانی)\s*[:：]\s*(.+?)\s*$/i;
const PLACE_LINE = /^\s*(?:Section|Node|Path|بخش|مسیر)\s*[:：]\s*(.+?)\s*$/i;
const REF_ID = /([A-Za-z0-9][A-Za-z0-9_-]*)@v(\d+)/;
const norm = (s: string) => normalizeFa(s.replace(/[‌‏]/g, ' ')).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s+/g, ' ').trim();

/** the optional «Ref:» and «Section:» lines at the top of an item, split from the text itself */
export function extractMeta(markdown: string): { ref?: string; place?: string; body: string } {
  const lines = markdown.replace(/\r/g, '').split('\n');
  let ref: string | undefined, place: string | undefined;
  let i = 0;
  while (i < lines.length && i < 4) {
    const l = lines[i];
    const r = REF_LINE.exec(l), p = PLACE_LINE.exec(l);
    // only the markdown wrapping around the value goes (`id`, **id**) — never the underscores INSIDE an id
    if (r && !ref) ref = r[1].replace(/^[`*_\s]+|[`*_\s]+$/g, '');
    else if (p && !place) place = p[1].replace(/^[`*_\s]+|[`*_\s]+$/g, '');
    else if (l.trim()) break;
    i++;
  }
  return { ...(ref ? { ref } : {}), ...(place ? { place } : {}), body: lines.slice(i).join('\n').trim() };
}

/** «کسب‌وکار / آفر / قیمت» → the section with exactly that path (or, failing that, the one section with that last name) */
export function nodeByPath(nodes: TreeNode[], path: string): TreeNode | undefined {
  const segs = path.split(/\s*(?:\/|›|»|«|>|←|\\)\s*/).map(norm).filter(Boolean);
  if (!segs.length) return undefined;
  const full = nodes.filter((n) => { const p = pathTo(nodes, n.id).map((c) => norm(c.label)); return p.length >= segs.length && segs.every((s, i) => p[p.length - segs.length + i] === s); });
  if (full.length === 1) return full[0];
  if (full.length > 1) return undefined;
  const last = nodes.filter((n) => norm(n.label) === segs[segs.length - 1]);
  return last.length === 1 ? last[0] : undefined;
}

const live = (o: ContextObject) => isActiveContext(o) && !o.sample;
const headOf = (o: ContextObject, byId: Map<string, ContextObject>): ContextObject | undefined => { let c: ContextObject | undefined = o; for (let i = 0; c && c.status === 'Superseded' && i < 20; i++) c = c.supersededById ? byId.get(c.supersededById) : undefined; return c && live(c) ? c : undefined; };

const DUP_CONTENT = 0.85;
const SIMILAR_TITLE = 0.6;

export function mapBlock(block: ParsedBlock, ctx: MapContext): BlockMapping {
  const meta = extractMeta(block.markdown);
  const body = meta.body || block.markdown;
  const base = { blockId: block.id, body };
  if (!isContextKind(block.kind)) return { ...base, action: 'ignore', nodeId: '', basis: 'none', reason: 'این دانش نیست؛ با دکمه‌های خودش ذخیره می‌شود.' };
  const byId = new Map(ctx.objects.map((o) => [o.id, o]));
  const placed = meta.place ? nodeByPath(ctx.nodes, meta.place) : undefined;
  const placeNote = meta.place && !placed ? ` بخش «${meta.place}» که AI نوشت پیدا نشد.` : '';
  const sameText = (o: ContextObject) => norm(`${o.title}\n${o.content}`) === norm(`${block.title}\n${body}`) || norm(o.content) === norm(body);
  let unknownRef = '';

  // ۱) the explicit reference
  if (meta.ref) {
    const m = REF_ID.exec(meta.ref);
    const id = m ? m[1] : meta.ref.trim();
    const hit = byId.get(id);
    if (hit) {
      const head = headOf(hit, byId);
      const target = head ?? hit;
      const stale = m ? Number(m[2]) < hit.version : false;
      const note = stale ? ` AI نسخهٔ ${m![2]} را دیده؛ الان نسخهٔ ${hit.version} است.` : '';
      if (head && head.status === 'Confirmed') {
        if (sameText(head)) return { ...base, action: 'duplicate', targetId: head.id, nodeId: head.nodeId, basis: 'explicit', staleRef: stale, reason: `AI نوشته این «${head.title}» است و متنش همان است که الان داریم.` };
        return { ...base, action: 'update', targetId: head.id, nodeId: head.nodeId, basis: 'explicit', staleRef: stale, reason: `AI نوشته این به‌روزرسانی «${head.title}» است${head.id !== hit.id ? ' (که جایگزین شده)' : ''}.${note}` };
      }
      if (head) return { ...base, action: 'duplicate', targetId: head.id, nodeId: head.nodeId, basis: 'explicit', staleRef: stale, reason: `AI نوشته این دربارهٔ «${head.title}» است که هنوز در انتظار تأیید است؛ اول آن را تأیید کن.` };
      unknownRef = `«${target.title}» بایگانی یا جایگزین‌شده و بدون نسخهٔ فعلی است.`;
    } else unknownRef = `شناسهٔ «${meta.ref}» که AI نوشت در منبع نیست.`;
  }

  // ۲) similarity, only among what the pack was built from (or everything when there is no pack)
  const packIds = ctx.pack && ctx.pack.length ? new Set(ctx.pack.map((u) => u.id)) : null;
  const pool = ctx.objects.filter((o) => live(o) && o.content.trim() && (!packIds || packIds.has(o.id)));
  const tt = titleTokens(block.title), ct = titleTokens(body);
  const scored = pool.map((o) => ({ o, t: jaccard(tt, titleTokens(o.title)), c: jaccard(ct, titleTokens(o.content)) }))
    .map((x) => ({ ...x, score: x.t + x.c * 0.5 })).filter((x) => x.t >= 0.3 || x.c >= 0.25).sort((a, b) => b.score - a.score || a.o.title.localeCompare(b.o.title));
  const best = scored[0];
  const scope = packIds ? 'در دانشی که این بسته از آن ساخته شد' : 'در دانش موجود';
  if (best && (sameText(best.o) || best.c >= DUP_CONTENT)) {
    return { ...base, action: 'duplicate', targetId: best.o.id, nodeId: best.o.nodeId, basis: 'similar', reason: `${unknownRef ? `${unknownRef} ` : ''}${scope} «${best.o.title}» تقریباً همین متن را دارد.` };
  }
  if (best && best.t >= SIMILAR_TITLE) {
    if (best.o.status === 'Confirmed') return { ...base, action: 'update', targetId: best.o.id, nodeId: best.o.nodeId, basis: 'similar', reason: `${unknownRef ? `${unknownRef} ` : ''}عنوانش به «${best.o.title}» شبیه است و متنش فرق دارد؛ شاید به‌روزرسانی آن باشد.` };
    return { ...base, action: 'duplicate', targetId: best.o.id, nodeId: best.o.nodeId, basis: 'similar', reason: `«${best.o.title}» با عنوان مشابه از قبل در انتظار تأیید است.` };
  }

  // ۳) new — the section: the one she named, else where the most similar knowledge lives, else none
  if (placed) return { ...base, action: 'new', nodeId: placed.id, basis: 'explicit', reason: `${unknownRef ? `${unknownRef} ` : ''}تازه است؛ بخش را AI نوشته: «${meta.place}».` };
  const votes = new Map<string, number>();
  for (const x of scored.slice(0, 3)) votes.set(x.o.nodeId, (votes.get(x.o.nodeId) ?? 0) + x.score);
  const top = [...votes].sort((a, b) => b[1] - a[1])[0];
  if (top) { const label = ctx.nodes.find((n) => n.id === top[0])?.label ?? ''; return { ...base, action: 'new', nodeId: top[0], basis: 'similar', reason: `${unknownRef ? `${unknownRef} ` : ''}تازه است؛ بخش «${label}» را چون موارد مشابه آنجاست پیشنهاد دادیم.${placeNote}` }; }
  return { ...base, action: 'new', nodeId: '', basis: 'none', reason: `${unknownRef ? `${unknownRef} ` : ''}تازه است و بخشی برایش پیدا نکردیم؛ خودت انتخاب کن.${placeNote}` };
}

export function mapAnswer(blocks: ParsedBlock[], ctx: MapContext): Map<string, BlockMapping> {
  return new Map(blocks.map((b) => [b.id, mapBlock(b, ctx)]));
}

export const ACTION_FA: Record<MapAction, string> = { new: 'تازه', update: 'به‌روزرسانی', duplicate: 'تکراری', ignore: 'نادیده بگیر' };
