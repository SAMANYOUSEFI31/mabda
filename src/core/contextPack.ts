/**
 * Context pack: compact Markdown a user pastes into ANY AI (even a free chat) so it works from the user's Mabda
 * knowledge. Pure: the server builds it (so it can store the lineage), the UI only shows and copies it.
 */

import type { ContextObject, DeliverableSpec, TreeNode, UsedContextRef, WorkstreamSpec } from '../types';
import { calculateReadinessAndGaps } from './contextEngine';
import type { AmbiguityMap } from './contextEngine';
import { ancestorIds } from './nodeTree';
import { estimateTokens } from './tokens';

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
}

export interface ContextPack {
  markdown: string;
  tokens: number;
  chars: number;
  /** exactly the objects (id + version) that appear in the pack: Confirmed and Proposed */
  refs: UsedContextRef[];
  counts: { confirmed: number; proposed: number; gaps: number; guardrails: number };
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
  const live = input.objects.filter((o) => o.status !== 'Archived' && o.status !== 'Superseded');
  // relevant branches: the spec's Context nodes (+ ancestors for inheritance), or the target node, or everything
  const seeds = spec ? [...spec.requiredContext, ...spec.suggestedContext, ...spec.optionalContext].map((c) => c.nodeId) : input.targetNodeId ? [input.targetNodeId] : nodes.map((n) => n.id);
  const relevantNodes = new Set(seeds.flatMap((n) => ancestorIds(nodes, n)));
  if (spec) ancestorIds(nodes, 'content').forEach((n) => relevantNodes.add(n));
  const relevant = live.filter((o) => relevantNodes.has(o.nodeId) || (o.status === 'Confirmed' && o.type === 'Constraint'));

  const confirmed = relevant.filter((o) => o.status === 'Confirmed');
  const proposed = relevant.filter((o) => o.status !== 'Confirmed');
  const path = (id: string) => ancestorIds(nodes, id).reverse().map((n) => nodes.find((x) => x.id === n)?.label ?? n).join(' ‹ ');
  const group = (list: ContextObject[]) => {
    const byNode = new Map<string, ContextObject[]>();
    for (const o of list) byNode.set(o.nodeId, [...(byNode.get(o.nodeId) ?? []), o]);
    return [...byNode.entries()].map(([n, os]) => `### ${path(n)}\n${os.map(line).join('\n')}`).join('\n\n');
  };

  const guardrails = [...(spec?.guardrails ?? []), ...confirmed.filter((o) => o.type === 'Constraint').map((o) => `${o.title}: ${o.content}`)].filter(Boolean);
  const gaps = spec ? calculateReadinessAndGaps(spec, input.objects, [], input.judgments).gaps.filter((g) => g.importance === 'required' || g.status !== 'confirmed') : [];
  const depTitles = (deliverable?.dependsOn ?? []).map((id) => spec?.deliverables.find((d) => d.id === id)?.title).filter(Boolean);

  const parts: string[] = [
    PACK_MARKER(input.packId),
    `# بستهٔ Context مبدأ — ${input.workspaceName}`,
    '> این بسته منبع حقیقت کسب‌وکار من است. فقط «واقعیت‌های تأییدشده» را واقعیت بدان. بخش «پیشنهادی» هنوز تأیید نشده و واقعیت نیست. چیزی را از خودت اختراع نکن؛ اگر اطلاعات کم است، سؤال بپرس.',
  ];

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
  if (gaps.length) {
    parts.push(['## شکاف‌ها (Gap)', 'پیش از ساخت خروجی، این‌ها را از کاربر بپرس یا در خروجی صریح بگو که فرض‌اند:', ...gaps.map((g) => `- ${g.status === 'missing' ? 'ثبت‌نشده' : 'مبهم'}: **${g.label}** — ${g.question}`)].join('\n'));
  }
  parts.push(RESPONSE_FORMAT);

  const markdown = `${parts.join('\n\n')}\n`;
  return {
    markdown, tokens: estimateTokens(markdown), chars: markdown.length,
    refs: relevant.map((o) => ({ id: o.id, version: o.version })),
    counts: { confirmed: confirmed.length, proposed: proposed.length, gaps: gaps.length, guardrails: guardrails.length },
  };
}
