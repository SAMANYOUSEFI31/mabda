/**
 * Context pack: compact Markdown a user pastes into ANY AI (even a free chat) so it works from the user's Mabda
 * knowledge. Pure: the server builds it (so it can store the lineage), the UI only shows and copies it.
 */

import type { ContextChange, ContextObject, Measurement, Metric, ContextRelationship, DeliverableSpec, TreeNode, UsedContextRef, WorkstreamSpec } from '../types';
import { calculateReadinessAndGaps } from './contextEngine';
import type { AmbiguityMap } from './contextEngine';
import { ancestorIds } from './nodeTree';
import { estimateTokens } from './tokens';
import { effectiveObjects, guardrailsFor } from './effectiveContext';
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
}

export const PACK_MARKER = (id: string) => `<!-- mabda-pack:${id} -->`;
export const PACK_MARKER_RE = /<!--\s*mabda-pack:([A-Za-z0-9_-]+)\s*-->/;

export const RESPONSE_FORMAT = [
  '## قالب پاسخ (الزامی)',
  'پاسخ را فقط با این سرتیترهای سطح دو بده و بیرون از آن‌ها چیزی ننویس:',
  '',
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
  // relevant = what is IN FORCE at the seed nodes (src/core/effectiveContext.ts): the spec's Context nodes, or the target node, or the whole tree
  const seeds = spec ? [...spec.requiredContext, ...spec.suggestedContext, ...spec.optionalContext].map((c) => c.nodeId) : input.targetNodeIds?.length ? input.targetNodeIds : input.targetNodeId ? [input.targetNodeId] : nodes.map((n) => n.id);
  if (spec) seeds.push('content');
  const inForceIds = new Set<string>();
  for (const n of [...new Set(seeds)]) for (const o of effectiveObjects(n, input.objects, nodes, rels, now)) inForceIds.add(o.id);
  const facetSet = new Set(input.facets ?? []);
  const extra = new Set<string>(input.statuses ?? ['Proposed', 'Needs Review']);
  const relevant = input.objects.filter((o) => inForceIds.has(o.id)
    && (!facetSet.size || (o.facets ?? []).some((f) => facetSet.has(f)))
    && (o.status === 'Confirmed' || extra.has(o.status) || (!!o.assumption && input.includeAssumptions !== false)) // active assumptions come with their own switch, whatever their status
    && (input.includeAssumptions !== false || !o.assumption));
  // guardrails: Constraints in force at the target (spec / node); for the whole-tree pack only the ones that hold from the top
  const guardSeeds = spec || input.targetNodeId || input.targetNodeIds?.length ? [...new Set(seeds)] : nodes.filter((n) => !n.parentId).map((n) => n.id);
  const guardIds = new Set<string>();
  for (const n of guardSeeds) for (const o of guardrailsFor(n, input.objects, nodes, rels, now)) guardIds.add(o.id);

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

  const guardrails = [...(spec?.guardrails ?? []), ...input.objects.filter((o) => guardIds.has(o.id)).map((o) => `${o.title}: ${o.content}`)].filter(Boolean);
  const gaps = spec ? calculateReadinessAndGaps(spec, input.objects, [], input.judgments).gaps.filter((g) => g.importance === 'required' || g.status !== 'confirmed') : [];
  const depTitles = (deliverable?.dependsOn ?? []).map((id) => spec?.deliverables.find((d) => d.id === id)?.title).filter(Boolean);

  const parts: string[] = [
    PACK_MARKER(input.packId),
    `# بستهٔ Context مبدأ — ${input.workspaceName}`,
    '> این بسته منبع حقیقت کسب‌وکار من است. فقط «واقعیت‌های تأییدشده» را واقعیت بدان. بخش «پیشنهادی» هنوز تأیید نشده و واقعیت نیست. چیزی را از خودت اختراع نکن؛ اگر اطلاعات کم است، سؤال بپرس.',
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
  if (guardrails.length) parts.push(['## گاردریل‌ها (نباید نقض شوند)', ...guardrails.map((g) => `- ${g}`)].join('\n'));
  parts.push(`## واقعیت‌های تأییدشده (Confirmed)\n${confirmed.length ? group(confirmed) : 'هنوز دانش تأییدشده‌ای ثبت نشده است.'}`);
  if (proposed.length) parts.push(`## پیشنهادی — تأییدنشده (واقعیت نیست)\n${group(proposed)}`);
  if (assumptions.length) parts.push([`## فرض‌های فعال، تأییدنشده (واقعیت نیست)`, ASSUMPTION_RULE, '', group(assumptions)].join('\n'));
  if (rejected.length) parts.push([`## گزینه‌های بررسی‌شده و ردشده`, REJECTED_RULE, '', ...rejected.map((r) => `- «${r.title}» (در تصمیم «${r.objectTitle}»): ${r.reason}`)].join('\n'));
  const metricsSection = input.metrics ? metricsPackSection(input.metrics.metrics, input.metrics.measurements, relevant.filter((o) => o.status === 'Confirmed'), input.metrics.changes, now) : null;
  if (metricsSection) parts.push(metricsSection);
  if (gaps.length) {
    parts.push(['## شکاف‌ها (Gap)', 'پیش از ساخت خروجی، این‌ها را از کاربر بپرس یا در خروجی صریح بگو که فرض‌اند:', ...gaps.map((g) => `- ${g.status === 'missing' ? 'ثبت‌نشده' : 'مبهم'}: **${g.label}** — ${g.question}`)].join('\n'));
  }
  parts.push(RESPONSE_FORMAT);

  const markdown = `${parts.join('\n\n')}\n`;
  return {
    markdown, tokens: estimateTokens(markdown), chars: markdown.length,
    refs: relevant.map((o) => ({ id: o.id, version: o.version })),
    counts: { confirmed: confirmed.length, proposed: proposed.length, assumptions: assumptions.length, rejected: rejected.length, gaps: gaps.length, guardrails: guardrails.length, metrics: metricsSection ? input.metrics!.metrics.filter((m) => !m.archived).length : 0 },
  };
}
