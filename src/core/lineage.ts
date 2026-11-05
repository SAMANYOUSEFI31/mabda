/**
 * «دور یک مورد» (lineage): one card in the middle, what it RESTS ON on the start side, what it AFFECTS on the other side (RTL:
 * start = right). A few steps only (depth 1–3); the rest is counted, not drawn. Direct links that another path already implies
 * are marked quiet. When the center is not approved yet (a suggestion, or confirmed knowledge with a draft) the same view says
 * what WOULD need a review if it were approved — a what-if, never a state. Pure.
 */

import type { ContextObject, ContextRelationship } from '../types';
import type { Scene, SceneBox, SceneEdge, SceneItem } from './canvasScene';
import { dependencyEdges } from './decisionGraph';
import { redundantLinks } from './dependencyReduction';
import { EDGE_LABEL } from './mapModel';
import { CARD_H, CARD_W, GAP_X, PAD } from './swimlane';
import { badges, extract } from './sceneParts';

export const LINEAGE_DEPTHS = [1, 2, 3] as const;
const GAP_Y = 16;

const isLive = (o: ContextObject) => o.status !== 'Superseded' && o.status !== 'Archived';
const isPending = (o: ContextObject) => o.status === 'Proposed' || o.status === 'Needs Review';
/** a suggestion, or confirmed knowledge with an unapproved rewrite */
export const isUnapproved = (o: ContextObject) => isPending(o) || !!o.draft;

export interface LineageLink { /** the influencer (the depended-on) */ from: string; /** the influenced */ to: string; /** another path already implies it */ redundant: boolean }
export interface Lineage {
  centerId: string;
  /** what it rests on, nearest first: level 1 = directly */
  upstream: string[][];
  /** what rests on it, nearest first */
  downstream: string[][];
  links: LineageLink[];
  /** beyond the chosen depth: counted, not drawn */
  hidden: { upstream: number; downstream: number };
  /** the center is not approved: everything downstream (at any depth) would need a review if it were */
  ifApproved: string[];
}

export function lineageOf(input: { centerId: string; objects: ContextObject[]; relationships: ContextRelationship[]; depth?: number; showPending?: boolean }): Lineage | undefined {
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const center = byId.get(input.centerId);
  if (!center) return undefined;
  const depth = Math.min(3, Math.max(1, input.depth ?? 2));
  const okEnd = (o: ContextObject) => isLive(o) && !o.sample && (input.showPending || !isPending(o) || o.id === center.id);
  const objects = input.objects.filter(okEnd);
  const edges = dependencyEdges(objects, input.relationships).filter((e) => e.from !== e.to);
  const rests = new Map<string, string[]>(); // X → what X rests on
  const feeds = new Map<string, string[]>(); // X → what rests on X
  for (const e of edges) { rests.set(e.from, [...(rests.get(e.from) ?? []), e.to]); feeds.set(e.to, [...(feeds.get(e.to) ?? []), e.from]); }
  const walk = (next: Map<string, string[]>, max: number) => {
    const seen = new Set<string>([center.id]);
    const levels: string[][] = [];
    let frontier = [center.id];
    let all = 0;
    for (let d = 1; frontier.length; d++) {
      const nxt: string[] = [];
      for (const f of frontier) for (const t of (next.get(f) ?? []).slice().sort((x, y) => (byId.get(x)?.createdAt ?? '').localeCompare(byId.get(y)?.createdAt ?? '') || x.localeCompare(y))) if (!seen.has(t)) { seen.add(t); nxt.push(t); }
      if (!nxt.length) break;
      all += nxt.length;
      if (d <= max) levels.push(nxt);
      frontier = nxt;
    }
    return { levels, hidden: all - levels.flat().length, everyone: [...seen].filter((x) => x !== center.id) };
  };
  const up = walk(rests, depth);
  const down = walk(feeds, depth);
  const drawn = new Set([center.id, ...up.levels.flat(), ...down.levels.flat()]);
  const redundant = new Set(redundantLinks(objects, input.relationships).map((l) => `${l.to}>${l.from}`));
  const links = edges.filter((e) => drawn.has(e.from) && drawn.has(e.to)).map((e) => ({ from: e.to, to: e.from, redundant: redundant.has(`${e.to}>${e.from}`) })).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return {
    centerId: center.id, upstream: up.levels, downstream: down.levels, links, hidden: { upstream: up.hidden, downstream: down.hidden },
    ifApproved: isUnapproved(center) ? down.everyone.filter((id) => byId.get(id)?.status === 'Confirmed' || byId.get(id)?.status === 'Needs Review') : [],
  };
}

/** the text equivalent for a screen reader and for phones: «بر این‌ها تکیه دارد / روی این‌ها اثر دارد» */
export function lineageText(l: Lineage, titleOf: (id: string) => string): { rests: string[]; affects: string[]; ifApproved: string[] } {
  const direct = (levels: string[][]) => (levels[0] ?? []).map(titleOf);
  const later = (levels: string[][]) => levels.slice(1).flat().map((id) => `${titleOf(id)} (غیرمستقیم)`);
  return { rests: [...direct(l.upstream), ...later(l.upstream)], affects: [...direct(l.downstream), ...later(l.downstream)], ifApproved: l.ifApproved.map(titleOf) };
}

export function buildLineageScene(input: { objects: ContextObject[]; relationships: ContextRelationship[]; reviewIds: Set<string>; now?: Date }, opts: { centerId: string; depth?: number; showPending?: boolean }): Scene {
  const now = input.now ?? new Date();
  const l = lineageOf({ centerId: opts.centerId, objects: input.objects, relationships: input.relationships, depth: opts.depth, showPending: opts.showPending });
  const empty: Scene = { layout: 'lineage', items: [], boxes: [], edges: [], width: 960, height: 520, summary: { objects: 0, assets: 0, notes: 0 } };
  if (!l) return empty;
  const byId = new Map(input.objects.map((o) => [o.id, o]));
  const colW = CARD_W + GAP_X;
  const columns: Array<{ ids: string[]; d: number }> = [
    ...l.downstream.map((ids, i) => ({ ids, d: i + 1 })).reverse(), // the end side (left) holds what is affected, farthest first
    { ids: [l.centerId], d: 0 },
    ...l.upstream.map((ids, i) => ({ ids, d: -(i + 1) })), // the start side (right) holds what it rests on
  ];
  const tallest = Math.max(1, ...columns.map((c) => c.ids.length));
  const height = Math.max(520, PAD * 2 + 64 + tallest * (CARD_H + GAP_Y));
  const items: SceneItem[] = [];
  const boxes: SceneBox[] = [];
  const unapproved = l.ifApproved.length > 0;
  columns.forEach((c, ci) => {
    const x = PAD + ci * colW;
    const total = c.ids.length * (CARD_H + GAP_Y) - GAP_Y;
    let y = 64 + (height - 64 - total) / 2;
    for (const id of c.ids) {
      const o = byId.get(id)!;
      items.push({
        id: `o:${o.id}`, kind: 'object', label: o.title, summary: extract(o.content), x, y, w: CARD_W, h: CARD_H, objectId: o.id, nodeId: o.nodeId, type: o.type, status: o.status,
        ...badges(o, input.reviewIds.has(o.id), now), ...(isPending(o) ? { pending: true } : {}), depthFrom: c.d, ...(unapproved && l.ifApproved.includes(id) ? { ifApproved: true } : {}),
      });
      y += CARD_H + GAP_Y;
    }
    boxes.push({ id: `col:${c.d}`, kind: 'column', label: c.d === 0 ? 'این مورد' : c.d < 0 ? (c.d === -1 ? 'بر این‌ها تکیه دارد' : 'پشت آن‌ها') : (c.d === 1 ? 'روی این‌ها اثر دارد' : 'و بعد از آن‌ها'), depth: 0, x: x - 8, y: 8, w: CARD_W + 16, h: 40, hint: c.d === 0 ? 'موردی که انتخاب کردی.' : c.d < 0 ? 'این مورد روی آن‌ها سوار است؛ اگر آن‌ها عوض شوند این مورد نیاز به بازبینی می‌گیرد.' : 'آن‌ها روی این مورد سوارند؛ اگر این عوض شود آن‌ها نیاز به بازبینی می‌گیرند.' });
  });
  const edges: SceneEdge[] = l.links.map((k) => ({
    id: `dependency|o:${k.to}|o:${k.from}`, kind: 'dependency', label: EDGE_LABEL.dependency, influencer: `o:${k.from}`, influenced: `o:${k.to}`, count: 1,
    ...(k.redundant ? { redundant: true } : {}), ...((isPending(byId.get(k.from)!) || isPending(byId.get(k.to)!)) ? { pending: true } : {}),
  }));
  return { layout: 'lineage', items, boxes, edges, width: Math.max(960, PAD * 2 + columns.length * colW - GAP_X), height, summary: { objects: items.length, assets: 0, notes: 0 }, lineage: l };
}
