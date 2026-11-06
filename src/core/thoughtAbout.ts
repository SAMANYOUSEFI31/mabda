/**
 * «دربارهٔ»: مشخص می‌کند یک Thought دربارهٔ کدام Knowledge یا Node است.
 * یک فکر در یک بخش (خانهٔ اصلی خود) قرار دارد و ممکن است اهداف دیگری را نیز مشخص کند.
 * ارتباط پایدار در جدول thought_about (مهاجرت ۲۳) ذخیره می‌شود.
 * نشانهٔ متنی `@«عنوان»` برای مسیر ورودی متنی، Backfill قطعی و سازگاری داده‌های قبلی باقی می‌ماند.
 * عنوان‌های مبهم (دارای چند تطابق هم‌نام) هرگز حدس زده نمی‌شوند.
 * ارجاع About هیچ رابطهٔ Context یا depends_on ایجاد نمی‌کند؛ هنگام ارتقا/تبدیل (Promotion) فکر به دانش،
 * این ارتباط‌ها فقط می‌توانند مبنای پیشنهاد رابطه باشند و شیء خروجی همواره با وضعیت پیشنهادی (Proposed) ساخته می‌شود.
 */

import type { ContextObject, TreeNode } from '../types';
import { normalizeFa } from './contextEngine';
import { mentionTitle } from './mentions';
import { subtreeIds } from './nodeTree';

export interface About { objectIds: string[]; nodeIds: string[] }
export type AboutTarget = { kind: 'object' | 'node'; id: string; label: string };

const TOKEN = /@«([^»\n]+)»/g;
const key = (s: string) => normalizeFa(s.replace(/\s+/g, ' ').trim());

/** the written form of a target (what goes into the line) */
export const aboutToken = (label: string): string => `@«${label.replace(/[»\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}»`;

/** knowledge wins over a section of the same name; a name that matches several of one kind is not guessed */
export function aboutOf(text: string, objects: Pick<ContextObject, 'id' | 'title' | 'status'>[], nodes: Pick<TreeNode, 'id' | 'label'>[]): About {
  const out: About = { objectIds: [], nodeIds: [] };
  const live = objects.filter((o) => o.status !== 'Archived' && o.status !== 'Superseded');
  for (const m of text.matchAll(TOKEN)) {
    const k = key(m[1]);
    const o = live.filter((x) => key(mentionTitle(x)) === k);
    if (o.length === 1) { if (!out.objectIds.includes(o[0].id)) out.objectIds.push(o[0].id); continue; }
    if (o.length > 1) continue;
    const n = nodes.filter((x) => key(x.label) === k);
    if (n.length === 1 && !out.nodeIds.includes(n[0].id)) out.nodeIds.push(n[0].id);
  }
  return out;
}

/** the same line without its trailing `@«…»` tokens (for showing the sentence and the targets apart) */
export const stripAbout = (text: string): string => text.replace(TOKEN, '').replace(/\s{2,}/g, ' ').trim();

/** does a thought belong in the view of this section? its home, a section it names, or the section of a piece of knowledge it names */
export function thoughtInScope(item: { nodeId: string; text: string; aboutNodeIds?: string[]; aboutObjectIds?: string[] }, scope: Set<string>, objects: ContextObject[], nodes: TreeNode[]): boolean {
  if (scope.has(item.nodeId)) return true;
  if (item.aboutNodeIds?.some((id) => scope.has(id))) return true;
  const at = new Map(objects.map((o) => [o.id, o.nodeId]));
  if (item.aboutObjectIds?.some((id) => { const n = at.get(id); return !!n && scope.has(n); })) return true;
  const a = aboutOf(item.text, objects, nodes);
  if (a.nodeIds.some((id) => scope.has(id))) return true;
  return a.objectIds.some((id) => { const n = at.get(id); return !!n && scope.has(n); });
}

/** the open thoughts that name this piece of knowledge */
export function thoughtsAbout<T extends { text: string; aboutObjectIds?: string[] }>(thoughts: T[], objectId: string, objects: ContextObject[], nodes: TreeNode[]): T[] {
  return thoughts.filter((t) => {
    if (t.aboutObjectIds?.includes(objectId)) return true;
    return aboutOf(t.text, objects, nodes).objectIds.includes(objectId);
  });
}

/** the targets of a thought as picker chips (for editing) */
export function aboutTargets(text: string, objects: ContextObject[], nodes: TreeNode[], durable?: { aboutObjectIds?: string[]; aboutNodeIds?: string[] }): AboutTarget[] {
  const a = aboutOf(text, objects, nodes);
  const objectIds = [...new Set([...(durable?.aboutObjectIds ?? []), ...a.objectIds])];
  const nodeIds = [...new Set([...(durable?.aboutNodeIds ?? []), ...a.nodeIds])];
  return [
    ...nodeIds.map((id) => ({ kind: 'node' as const, id, label: nodes.find((n) => n.id === id)?.label ?? id })),
    ...objectIds.map((id) => ({ kind: 'object' as const, id, label: objects.find((o) => o.id === id)?.title ?? id })),
  ];
}

/** every section id under (and including) a section — re-exported so views need one import */
export const scopeOf = (nodes: TreeNode[], id: string) => new Set(subtreeIds(nodes, id));
