/**
 * «شروع سریع چه ساخت»: what the quick start left in the workspace, node by node — approved vs waiting — so the user is not left
 * with «done» and no map. Pure; the dialog adds the «ببین» links.
 */

import type { ContextObject, TreeNode } from '../types';

export interface QuickStartRow { nodeId: string; label: string; confirmed: number; proposed: number }
export interface QuickStartSummary { rows: QuickStartRow[]; confirmed: number; proposed: number }

export function quickStartSummary(objects: Array<Pick<ContextObject, 'nodeId' | 'status'>>, nodes: Array<Pick<TreeNode, 'id' | 'label'>>): QuickStartSummary {
  const by = new Map<string, QuickStartRow>();
  for (const o of objects) {
    const row = by.get(o.nodeId) ?? { nodeId: o.nodeId, label: nodes.find((n) => n.id === o.nodeId)?.label ?? '', confirmed: 0, proposed: 0 };
    if (o.status === 'Confirmed') row.confirmed++; else row.proposed++;
    by.set(o.nodeId, row);
  }
  const rows = [...by.values()].sort((a, b) => nodes.findIndex((n) => n.id === a.nodeId) - nodes.findIndex((n) => n.id === b.nodeId));
  return { rows, confirmed: rows.reduce((s, r) => s + r.confirmed, 0), proposed: rows.reduce((s, r) => s + r.proposed, 0) };
}

/** one question of «شروع سریع»: its answer becomes approved knowledge of this kind, under this title, in this branch (a hint) */
export interface QuickStartQuestion { key: string; label: string; type: ContextObject['type']; title: string; nodeId: string; multiline?: boolean }

const WORK: QuickStartQuestion[] = [
  { key: 'domain', label: 'روی چه کاری کار می‌کنی؟', type: 'Fact', title: 'حوزهٔ کسب‌وکار و تخصص', nodeId: 'business' },
  { key: 'audience', label: 'مخاطب اصلی تو کیست؟', type: 'Decision', title: 'مخاطب اصلی', nodeId: 'business' },
  { key: 'problem', label: 'بزرگ‌ترین دردِ مشتری‌ات چیست؟', type: 'Fact', title: 'معضل اصلی مخاطب', nodeId: 'business', multiline: true },
  { key: 'value', label: 'چطور آن درد را حل می‌کنی؟', type: 'Decision', title: 'پیشنهاد ارزش و راه‌حل', nodeId: 'product', multiline: true },
  { key: 'difference', label: 'چه چیزی تو را از بقیه جدا می‌کند؟', type: 'Fact', title: 'تمایز کلیدی', nodeId: 'brand' },
];
const PERSONAL: QuickStartQuestion[] = [
  { key: 'values', label: 'چه چیزی در زندگی‌ات از بقیه مهم‌تر است؟', type: 'Fact', title: 'ارزش‌ها و اولویت‌ها', nodeId: 'me', multiline: true },
  { key: 'redline', label: 'چه کاری را هرگز نمی‌کنی، هر چه بشود؟', type: 'Constraint', title: 'خط قرمز شخصی', nodeId: 'me' },
  { key: 'health', label: 'چه چیزی دربارهٔ سلامتت باید همیشه یادت بماند؟', type: 'Fact', title: 'نکتهٔ مهم سلامت', nodeId: 'health', multiline: true },
  { key: 'plan', label: 'مهم‌ترین برنامهٔ چند ماه آینده‌ات چیست؟', type: 'Decision', title: 'برنامهٔ پیش رو', nodeId: 'plans' },
  { key: 'learning', label: 'این روزها دنبال یاد گرفتن چه چیزی هستی؟', type: 'Fact', title: 'یادگیری این روزها', nodeId: 'learning' },
];
const PROJECT: QuickStartQuestion[] = [
  { key: 'goal', label: 'این پروژه برای چیست؟', type: 'Fact', title: 'هدف پروژه', nodeId: 'goal', multiline: true },
  { key: 'done', label: 'کی و با چه نشانه‌ای تمام است؟', type: 'Decision', title: 'معیار پایان', nodeId: 'goal' },
  { key: 'out', label: 'چه چیزی در این پروژه نیست یا نباید انجام شود؟', type: 'Constraint', title: 'بیرون از دامنه', nodeId: 'scope' },
  { key: 'people', label: 'چه کسانی درگیرند و هر کدام چه می‌خواهند؟', type: 'Fact', title: 'آدم‌های پروژه', nodeId: 'people', multiline: true },
  { key: 'decision', label: 'مهم‌ترین تصمیمی که تا الان گرفته شده چیست؟', type: 'Decision', title: 'تصمیم اصلی تا امروز', nodeId: 'decisions' },
];
const EMPTY: QuickStartQuestion[] = [
  { key: 'what', label: 'این فضا برای چیست؟', type: 'Fact', title: 'این فضا برای چیست', nodeId: 'notes' },
  { key: 'truth', label: 'مهم‌ترین چیزی که درست است و نباید فراموش شود؟', type: 'Fact', title: 'مهم‌ترین حقیقت', nodeId: 'notes', multiline: true },
  { key: 'decided', label: 'چه تصمیمی گرفته‌ای که باید یادت بماند؟', type: 'Decision', title: 'تصمیم مهم', nodeId: 'notes' },
  { key: 'never', label: 'چه کاری را نباید کرد؟', type: 'Constraint', title: 'خط قرمز', nodeId: 'notes' },
];

/** the questions match what the space is for (audience.md): a personal or project space is never asked about customers */
export const quickStartQuestions = (purpose: 'personal' | 'work' | 'project' | 'empty' | undefined): QuickStartQuestion[] =>
  purpose === 'personal' ? PERSONAL : purpose === 'project' ? PROJECT : purpose === 'empty' ? EMPTY : WORK;
