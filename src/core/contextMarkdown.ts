/**
 * One Markdown representation of the Context tree. The reading view, the "Markdown" tab, copy and download
 * all come from here (the Context pack uses its own compact format on top of the same objects).
 * Pure: no UI, no I/O.
 */

import type { ContextObject, ContextRelationship, ContextStatus, ContextType, TreeNode } from '../types';
import { byOrder, childrenOf, primaryDepth, primarySections, subtreeIds } from './nodeTree';
import { isActiveContext } from './contextStatus';
import { isExpired } from './validity';

const TYPE_FA: Record<ContextType, string> = { Fact: 'واقعیت', Decision: 'تصمیم', Constraint: 'خط قرمز' };
const STATUS_FA: Record<ContextStatus, string> = {
  Confirmed: 'تأییدشده', Proposed: 'پیشنهادی (تأییدنشده)', 'Needs Review': 'نیازمند بازبینی', Superseded: 'جایگزین‌شده', Archived: 'بایگانی',
};
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number) => String(n).replace(/\d/g, (d) => FA[Number(d)]);
const heading = (level: number, text: string) => `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${text}`;

/** one heading of the document, with an id that survives edits (the node or object id, never the text) */
export interface OutlineItem { id: string; level: number; text: string; kind: 'node' | 'object'; refId: string }
export const nodeAnchor = (nodeId: string) => `n-${nodeId}`;
export const objectAnchor = (objectId: string) => `o-${objectId}`;

export interface DocOptions {
  /** «با ارجاع‌ها»: one flat line «وابسته به: …» and one «برگرفته از: …» under an object's meta line. Nothing nested. */
  refs?: boolean;
  relationships?: ContextRelationship[];
  /** the last approval of each object (see versionHistory): «آخرین تأیید: نسخهٔ N» is added when it is not the current version */
  approvals?: Record<string, { version: number }>;
  /** when validity is judged (default: now) */
  now?: Date | string | number;
}

/** the document is the truth: approved knowledge and approved knowledge that needs a look, still valid. A suggestion or an
 * expired item is not truth, so it is not written into a document someone copies or downloads (the tree view reads the same). */
const inDocument = (o: ContextObject, now: Date | string | number | undefined): boolean =>
  (o.status === 'Confirmed' || o.status === 'Needs Review') && !isExpired(o, now ?? Date.now());

interface Ctx extends DocOptions { outline: OutlineItem[]; all: ContextObject[]; withChildren: boolean }

const quoted = (titles: string[]) => titles.map((t) => `«${t}»`).join('، ');

function refLines(o: ContextObject, ctx: Ctx): string[] {
  if (!ctx.refs) return [];
  const byId = new Map(ctx.all.map((x) => [x.id, x]));
  // a relation to a suggestion (Proposed) is not truth yet: it only appears after that end is approved
  const live = (id: string) => { const x = byId.get(id); return x && isActiveContext(x) && x.status !== 'Proposed' ? x.title : undefined; };
  const rels = ctx.relationships ?? [];
  const deps = [...new Set(rels.filter((r) => r.type === 'depends_on' && r.sourceId === o.id).map((r) => live(r.targetId)).filter((t): t is string => !!t))];
  const from = [
    ...rels.filter((r) => r.type === 'derived_from' && r.sourceId === o.id).map((r) => live(r.targetId)).filter((t): t is string => !!t),
    ...(o.source?.kind === 'asset' && o.source.label ? [`خروجی ${o.source.label}`] : []),
  ];
  const out: string[] = [];
  if (deps.length) out.push(`وابسته به: ${quoted(deps)}`, '');
  if (from.length) out.push(`برگرفته از: ${quoted([...new Set(from)])}`, '');
  return out;
}

function nodeSection(node: TreeNode, nodes: TreeNode[], objects: ContextObject[], level: number, out: string[], ctx: Ctx): void {
  out.push(heading(level, node.label), '');
  ctx.outline.push({ id: nodeAnchor(node.id), level: Math.min(6, level), text: node.label, kind: 'node', refId: node.id });
  if (node.description) out.push(`> ${node.description}`, '');
  const own = objects.filter((o) => o.nodeId === node.id && inDocument(o, ctx.now));
  if (own.length === 0 && (!ctx.withChildren || childrenOf(nodes, node.id).length === 0)) out.push('_هنوز چیزی در این بخش ثبت نشده است._', '');
  for (const o of own) {
    out.push(heading(level + 1, o.title), '');
    ctx.outline.push({ id: objectAnchor(o.id), level: Math.min(6, level + 1), text: o.title, kind: 'object', refId: o.id });
    const ap = ctx.approvals?.[o.id];
    out.push(`_${TYPE_FA[o.type]} · ${STATUS_FA[o.status]} · نسخهٔ ${fa(o.version)}${ap && ap.version !== o.version ? ` · آخرین تأیید: نسخهٔ ${fa(ap.version)}` : ''}_`, '');
    out.push(...refLines(o, ctx));
    out.push(o.content.trim(), '');
  }
  if (ctx.withChildren) for (const child of childrenOf(nodes, node.id).sort(byOrder)) nodeSection(child, nodes, objects, level + 1, out, ctx);
}

export interface ContextDoc { markdown: string; outline: OutlineItem[] }

/** the Markdown AND its outline (headings with stable ids), from one pass. `ownOnly`: just the node's own objects, not its sub-tree. */
export function contextDoc(input: { nodes: TreeNode[]; objects: ContextObject[]; nodeId?: string; title?: string; ownOnly?: boolean } & DocOptions): ContextDoc {
  const { nodes, objects, nodeId, title } = input;
  const out: string[] = [];
  const ctx: Ctx = { outline: [], all: objects, withChildren: !input.ownOnly, refs: input.refs, relationships: input.relationships, approvals: input.approvals, now: input.now };
  if (nodeId) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { markdown: '', outline: [] };
    const inScope = new Set(input.ownOnly ? [nodeId] : subtreeIds(nodes, nodeId));
    nodeSection(node, nodes, objects.filter((o) => inScope.has(o.nodeId)), 1, out, ctx);
  } else {
    if (title) out.push(heading(1, title), '');
    for (const root of childrenOf(nodes, undefined).sort(byOrder)) nodeSection(root, nodes, objects, title ? 2 : 1, out, ctx);
  }
  return { markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n', outline: ctx.outline };
}

/** Markdown of a node and everything under it (`nodeId` omitted = the whole tree under `title`). */
export function contextToMarkdown(input: { nodes: TreeNode[]; objects: ContextObject[]; nodeId?: string; title?: string } & DocOptions): string {
  return contextDoc(input).markdown;
}

/** a section of the document that is its own tab: the first-level sections of the tree */
export interface DocTab { id: string; nodeId: string; label: string; /** the root's own objects (not its children) */ own?: boolean; /** the whole document in one (NEW-07): read, copy or download all sections at once */ whole?: boolean }

export const WHOLE_TAB_ID = 'whole';
/** «کل سند» as the last tab, only when there is more than one tab (with one, that tab already is the whole document) */
export const withWholeTab = (tabs: DocTab[]): DocTab[] => (tabs.length > 1 ? [...tabs, { id: WHOLE_TAB_ID, nodeId: '', label: 'کل سند', whole: true }] : tabs);

/**
 * Suggestions that wait in a tab's scope. The document is only approved truth (LOGIC-02), so a new person whose knowledge is all
 * still «پیشنهاد» would read empty sections and think it was lost; the reader says how many wait and where, without writing them in.
 */
export function pendingInTab(tab: DocTab, nodes: TreeNode[], objects: ContextObject[]): number {
  const scope = tab.whole ? null : new Set(tab.own ? [tab.nodeId] : subtreeIds(nodes, tab.nodeId));
  return objects.filter((o) => o.status === 'Proposed' && !o.sample && (!scope || scope.has(o.nodeId))).length;
}

/**
 * Tabs = the first-level sections. With one root (the usual tree) they are the root's children; the root's own objects get a
 * leading «کلیات» tab only if it has any. With several roots, each root is a tab.
 */
export function docTabs(nodes: TreeNode[], objects: ContextObject[], now?: Date | string | number): DocTab[] {
  // the main sections are the tabs (primarySections: the same rule as the sidebar, the outline and the overview, §۵۳ ۷)
  const tabs = primarySections(nodes).map((k) => ({ id: k.id, nodeId: k.id, label: k.label }));
  if (primaryDepth(nodes) === 0) return tabs;
  const root = childrenOf(nodes, undefined)[0];
  const hasOwn = objects.some((o) => o.nodeId === root.id && inDocument(o, now));
  return hasOwn ? [{ id: root.id, nodeId: root.id, label: 'کلیات', own: true }, ...tabs] : tabs;
}

/** which tab holds an anchor (`n-…` / `o-…`), for permalinks */
export function tabOfAnchor(anchor: string, tabs: DocTab[], nodes: TreeNode[], objects: ContextObject[]): DocTab | undefined {
  const nodeIdOf = anchor.startsWith('n-') ? anchor.slice(2) : anchor.startsWith('o-') ? objects.find((o) => o.id === anchor.slice(2))?.nodeId : undefined;
  if (!nodeIdOf) return undefined;
  const up = new Set<string>(); let cur = nodes.find((n) => n.id === nodeIdOf);
  while (cur && !up.has(cur.id)) { up.add(cur.id); cur = cur.parentId ? nodes.find((n) => n.id === cur!.parentId) : undefined; }
  // the nearest tab on the way up; the root's own tab only holds objects of the root itself
  const own = tabs.find((t) => t.own);
  if (own && nodeIdOf === own.nodeId) return own;
  return tabs.find((t) => !t.own && !t.whole && up.has(t.nodeId));
}
