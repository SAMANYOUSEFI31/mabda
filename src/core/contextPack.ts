/**
 * Context pack: compact Markdown a user pastes into ANY AI (even a free chat) so it works from the user's Mabda
 * knowledge. Pure: the server builds it (so it can store the lineage), the UI only shows and copies it.
 */

import type { ContextChange, ContextObject, Measurement, Metric, ContextRelationship, DeliverableSpec, TreeNode, UsedContextRef, WorkstreamSpec } from '../types';
import { calculateReadinessAndGaps } from './contextEngine';
import type { AmbiguityMap } from './contextEngine';
import { ancestorIds, resolveNodeId, subtreeIds } from './nodeTree';
import { estimateTokens } from './tokens';
import { IN_FORCE } from './effectiveContext';
import { fromText, leftWhy, scopeSeeds, standingOver } from './packScope';
import type { Explain, ExplainItem, ExplainSkipped } from './scopeExplain';
import { guardrailText } from './redlineExamples';
import { metricsPackSection } from './metrics';
import { ASSUMPTION_RULE, REJECTED_RULE, isAssumption, rejectedOptions } from './assumptions';

export interface PackInput {
  packId: string;
  workspaceName: string;
  nodes: TreeNode[];
  objects: ContextObject[];
  spec?: WorkstreamSpec;
  deliverable?: DeliverableSpec;
  judgments?: AmbiguityMap;
  /** node whose ancestor chain is the relevant context when there is no spec (default: the whole tree) */
  targetNodeId?: string;
  /** `overrides` edges (what switches an inherited rule off for a sub-tree); none = no exceptions */
  relationships?: ContextRelationship[];
  /** what «expired» is measured against (default: now) */
  now?: Date;
  /** a saved pack: the nodes it is for (several), a facet filter, the extra statuses, assumptions yes / no, and a short instruction */
  targetNodeIds?: string[];
  facets?: string[];
  statuses?: Array<'Proposed' | 'Needs Review'>;
  includeAssumptions?: boolean;
  /** a saved pack: the sub-sections of the picked sections are read too (src/core/packScope.ts) */
  withChildren?: boolean;
  instruction?: string;
  /** recorded results: a SEPARATE section (confirmed numbers only, never knowledge). Absent = no section */
  metrics?: { metrics: Metric[]; measurements: Measurement[]; changes: Pick<ContextChange, 'objectId' | 'kind' | 'at' | 'after'>[] };
}

export interface ContextPack {
  markdown: string;
  tokens: number;
  chars: number;
  /** exactly the objects (id + version) that appear in the pack: Confirmed and Proposed */
  refs: UsedContextRef[];
  counts: { confirmed: number; proposed: number; assumptions: number; rejected: number; gaps: number; guardrails: number; metrics: number };
  /** what came and why, what did not and why — from the same data as the text (docs/spine.md → «دامنهٔ بسته») */
  explain: Explain;
}

export const PACK_MARKER = (id: string) => `<!-- mabda-pack:${id} -->`;
export const PACK_MARKER_RE = /<!--\s*mabda-pack:([A-Za-z0-9_-]+)\s*-->/;

export const RESPONSE_FORMAT = [
  '## قالب پاسخ (الزامی)',
  'پاسخ را فقط با این سرتیترهای سطح دو بده و بیرون از آن‌ها چیزی ننویس:',
  '',
  'اگر یک مورد به‌روزرسانی یکی از دانش‌های بالاست، اولین خطِ متنش را «Ref: شناسه@نسخه» بنویس؛ شناسه را عیناً از اسناد بردار و هرگز نساز. اگر می‌دانی کجای ساختار می‌نشیند، خط بعدی را «Section: مسیر بخش» بنویس. اگر مطمئن نیستی، هیچ‌کدام را ننویس.',
  '```',
  '## Decision: عنوان کوتاه',
  'تصمیمی که کاربر گرفته یا پیشنهاد می‌کنی (یک تا سه جمله)',
  '',
  '## Fact: عنوان کوتاه',
  'واقعیتی که در این گفتگو از کاربر شنیدی',
  '',
  '## Constraint: عنوان کوتاه',
  'مرز یا خط قرمز',
  '',
  '## Question: سؤال',
  'هر چیزی که برای ادامه لازم داری و در بسته نیست',
  '',
  '## Asset: عنوان خروجی',
  'متن کامل خروجی به Markdown',
  '```',
].join('\n');

const line = (o: ContextObject) => `- **[${o.type}] ${o.title}** (\`${o.id}@v${o.version}\`): ${o.content.replace(/\n+/g, ' ')}`;

export function buildContextPack(input: PackInput): ContextPack {
  const { nodes, spec, deliverable } = input;
  const rels = input.relationships ?? [];
  const now = input.now ?? new Date();
  // the scope: a workstream's own sections (hints, resolved against THIS tree — never a fixed id), or the picked sections of a
  // saved pack (+ their sub-sections when asked), or the whole tree. One rule for packs and requests: src/core/packScope.ts
  const wanted = spec
    ? [...new Set([...spec.requiredContext, ...spec.suggestedContext, ...spec.optionalContext].map((c) => resolveNodeId(nodes, c.nodeId)))]
    : input.targetNodeIds?.length ? input.targetNodeIds : input.targetNodeId ? [input.targetNodeId] : [];
  const scope = scopeSeeds(nodes, wanted, spec ? true : !!input.withChildren); // a workstream reads its sections WITH their sub-sections (what generation reads: the sections it names and everything beneath)
  const standing = standingOver(scope, input.objects, nodes, rels, now);
  const inForce = (o: ContextObject) => { const st = standing.get(o.id); return !!st && IN_FORCE.has(st.origin); };
  const facetSet = new Set(input.facets ?? []);
  const extra = new Set<string>(input.statuses ?? ['Proposed', 'Needs Review']);
  const facetOk = (o: ContextObject) => !facetSet.size || (o.facets ?? []).some((f) => facetSet.has(f));
  const statusOk = (o: ContextObject) => o.status === 'Confirmed' || extra.has(o.status) || (!!o.assumption && input.includeAssumptions !== false); // active assumptions come with their own switch, whatever their status
  const assumptionOk = (o: ContextObject) => input.includeAssumptions !== false || !o.assumption;
  const relevant = input.objects.filter((o) => inForce(o) && facetOk(o) && statusOk(o) && assumptionOk(o));
  // guardrails: Constraints in force at the target (spec / picked sections); for the whole-tree pack only the ones that hold from the top
  const guardScope = scope.whole ? scopeSeeds(nodes, nodes.filter((n) => !n.parentId).map((n) => n.id), false) : scope;
  const guardStanding = scope.whole ? standingOver(guardScope, input.objects, nodes, rels, now) : standing;
  const guardObjects = input.objects.filter((o) => { const st = guardStanding.get(o.id); return !!st && IN_FORCE.has(st.origin) && o.type === 'Constraint' && o.status === 'Confirmed'; });
  const guardIds = new Set(guardObjects.map((o) => o.id));

  // an assumption is neither knowledge nor merely «proposed»: it has its own section and rule
  const assumptions = relevant.filter((o) => isAssumption(o));
  const confirmed = relevant.filter((o) => o.status === 'Confirmed' && !o.assumption);
  const proposed = relevant.filter((o) => o.status !== 'Confirmed' && !o.assumption);
  const rejected = rejectedOptions(relevant);
  const path = (id: string) => ancestorIds(nodes, id).reverse().map((n) => nodes.find((x) => x.id === n)?.label ?? n).join(' ‹ ');
  const group = (list: ContextObject[]) => {
    const byNode = new Map<string, ContextObject[]>();
    for (const o of list) byNode.set(o.nodeId, [...(byNode.get(o.nodeId) ?? []), o]);
    return [...byNode.entries()].map(([n, os]) => `### ${path(n)}\n${os.map(line).join('\n')}`).join('\n\n');
  };

  const guardrails = [...(spec?.guardrails ?? []), ...input.objects.filter((o) => guardIds.has(o.id)).map(guardrailText)].filter(Boolean);
  const gaps = spec ? calculateReadinessAndGaps(spec, input.objects, [], input.judgments).gaps.filter((g) => g.importance === 'required' || g.status !== 'confirmed') : [];
  const depTitles = (deliverable?.dependsOn ?? []).map((id) => spec?.deliverables.find((d) => d.id === id)?.title).filter(Boolean);

  const parts: string[] = [
    PACK_MARKER(input.packId),
    `# بستهٔ Context مبدأ — ${input.workspaceName}`,
    '> این بسته منبع حقیقت من است. فقط «واقعیت‌های تأییدشده» را واقعیت بدان. بخش «پیشنهادی» هنوز تأیید نشده و واقعیت نیست. چیزی را از خودت اختراع نکن؛ اگر اطلاعات کم است، سؤال بپرس.',
  ];

  if (input.instruction?.trim()) parts.push(`## دستور\n${input.instruction.trim()}`);
  if (spec) {
    const task = [`## کار`, `- جریان کار: ${spec.title}`, `- هدف: ${spec.target}`];
    if (deliverable) {
      task.push(`- خروجی درخواستی: ${deliverable.title}${deliverable.description ? ` — ${deliverable.description}` : ''}`);
      if (deliverable.outputBand) task.push(`- طول: ${{ short: 'کوتاه', medium: 'متوسط', long: 'بلند' }[deliverable.outputBand]}`);
      if (depTitles.length) task.push(`- ورودی‌ها (خروجی‌های قبلی همین جریان): ${depTitles.join('، ')}`);
      task.push('', '### معیارهای پذیرش', ...deliverable.acceptanceCriteria.map((c) => `- ${c}`));
    } else {
      task.push('', '### خروجی‌های این جریان کار', ...spec.deliverables.map((d) => `- ${d.title}: ${d.acceptanceCriteria.join('؛ ')}`));
    }
    parts.push(task.join('\n'));
  }
  if (guardrails.length) parts.push(['## خط قرمزها (نباید نقض شوند)', ...guardrails.map((g) => `- ${g}`)].join('\n'));
  parts.push(`## واقعیت‌های تأییدشده (Confirmed)\n${confirmed.length ? group(confirmed) : 'هنوز دانش تأییدشده‌ای ثبت نشده است.'}`);
  if (proposed.length) parts.push(`## پیشنهادی — تأییدنشده (واقعیت نیست)\n${group(proposed)}`);
  if (assumptions.length) parts.push([`## فرض‌های فعال، تأییدنشده (واقعیت نیست)`, ASSUMPTION_RULE, '', group(assumptions)].join('\n'));
  if (rejected.length) parts.push([`## گزینه‌های بررسی‌شده و ردشده`, REJECTED_RULE, '', ...rejected.map((r) => `- «${r.title}» (در تصمیم «${r.objectTitle}»): ${r.reason}`)].join('\n'));
  const metricsSection = input.metrics ? metricsPackSection(input.metrics.metrics, input.metrics.measurements, relevant.filter((o) => o.status === 'Confirmed'), input.metrics.changes, now) : null;
  if (metricsSection) parts.push(metricsSection);
  if (gaps.length) {
    parts.push(['## جاهای خالی (Gap)', 'پیش از ساخت خروجی، این‌ها را از کاربر بپرس یا در خروجی صریح بگو که فرض‌اند:', ...gaps.map((g) => `- ${g.status === 'missing' ? 'ثبت‌نشده' : 'مبهم'}: **${g.label}** — ${g.question}`)].join('\n'));
  }
  parts.push(RESPONSE_FORMAT);

  // — what came and why, what did not and why: the same data as the text above —
  const nodeLabel = (id: string) => path(id);
  const items: ExplainItem[] = [
    ...(spec?.guardrails ?? []).filter(Boolean).map((g): ExplainItem => ({ title: g, nodeLabel: spec!.title, group: 'guardrail', from: `از جریان کار «${spec!.title}»` })),
    ...guardObjects.map((o): ExplainItem => ({ id: o.id, title: o.title, type: o.type, nodeLabel: nodeLabel(o.nodeId), group: 'guardrail', from: fromText(o, scope, nodes), editable: true, ...(o.validUntil ? { note: `معتبر تا ${o.validUntil}` } : {}) })),
    ...relevant.filter((o) => !guardIds.has(o.id)).map((o): ExplainItem => ({
      id: o.id, title: o.title, type: o.type, nodeLabel: nodeLabel(o.nodeId),
      group: isAssumption(o) ? 'assumption' : o.status !== 'Confirmed' ? 'unconfirmed' : o.type === 'Decision' ? 'decision' : 'fact',
      from: fromText(o, scope, nodes), ...(o.status !== 'Confirmed' && !isAssumption(o) ? { note: o.status === 'Proposed' ? 'پیشنهادی' : 'نیازمند بررسی' } : {}),
    })),
  ];
  const included = new Set([...relevant.map((o) => o.id), ...guardObjects.map((o) => o.id)]);
  const inPickedSub = (o: ContextObject) => scope.picked.some((p) => p !== o.nodeId && subtreeIds(nodes, p).includes(o.nodeId));
  const skipped: ExplainSkipped[] = [];
  for (const o of input.objects) {
    if (included.has(o.id) || o.sample || o.status === 'Archived' || o.status === 'Superseded') continue;
    const st = standing.get(o.id);
    const reason: ExplainSkipped['reason'] = !st ? (!scope.withChildren && inPickedSub(o) ? 'child' : 'scope')
      : st.origin === 'expired' ? 'expired' : st.origin === 'overridden' ? 'overridden'
      : !facetOk(o) ? 'facet' : !assumptionOk(o) ? 'assumption' : 'status';
    skipped.push({ id: o.id, title: o.title, type: o.type, nodeLabel: nodeLabel(o.nodeId), reason, why: leftWhy(reason, o, nodes, { overriddenByTitle: st?.overriddenBy ? input.objects.find((x) => x.id === st.overriddenBy)?.title : undefined }) });
  }
  skipped.sort((a, b) => a.reason.localeCompare(b.reason) || a.nodeLabel.localeCompare(b.nodeLabel) || a.id.localeCompare(b.id));
  const explain: Explain = { scope: { whole: scope.whole, pickedLabels: scope.picked.map((id) => nodes.find((n) => n.id === id)?.label ?? id), withChildren: scope.withChildren, sections: scope.seeds.length }, items, skipped };

  const markdown = `${parts.join('\n\n')}\n`;
  return {
    explain,
    markdown, tokens: estimateTokens(markdown), chars: markdown.length,
    refs: relevant.map((o) => ({ id: o.id, version: o.version })),
    counts: { confirmed: confirmed.length, proposed: proposed.length, assumptions: assumptions.length, rejected: rejected.length, gaps: gaps.length, guardrails: guardrails.length, metrics: metricsSection ? input.metrics!.metrics.filter((m) => !m.archived).length : 0 },
  };
}
