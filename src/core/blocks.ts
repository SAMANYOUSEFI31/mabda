/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentBlock, ContextObject, ContextType } from '../types';

const KIND_TO_TYPE: Partial<Record<ContentBlock['kind'], ContextType>> = {
  fact: 'Fact',
  decision: 'Decision',
  constraint: 'Constraint',
};

/** First meaningful line of a Markdown block, stripped of markup, as a short title. */
export function titleFromMarkdown(markdown: string, max = 60): string {
  const line = markdown.split('\n').map((l) => l.replace(/^[#>*\-\s\d.|]+/, '').replace(/[*_`]/g, '').trim()).find(Boolean) ?? 'بدون عنوان';
  return line.length > max ? `${line.slice(0, max - 1).trim()}…` : line;
}

/**
 * A block → a *Proposed* Context draft (never Confirmed, never an established fact).
 * The user reviews it in the Context dialog and saves it explicitly (F13: nothing enters active context without approval).
 */
export function contextDraftFromBlock(block: ContentBlock, workspaceId: string, now = new Date().toISOString()): ContextObject {
  const p = block.proposal;
  return {
    id: '',
    workspaceId,
    type: p?.type ?? KIND_TO_TYPE[block.kind] ?? 'Fact',
    status: 'Proposed',
    provenance: 'AI Suggested',
    title: p?.title ?? titleFromMarkdown(block.markdown),
    content: p?.content ?? block.markdown,
    nodeId: p?.nodeId ?? '', // '' = the default place of the workspace's tree (the dialog and the server decide)
    version: 1,
    source: { kind: 'chat', at: now },
    createdAt: now,
    updatedAt: now,
  };
}

/** Proposals carried by blocks, as chat suggestions (id is stable per block). */
export function proposalsOf(blocks: ContentBlock[] | undefined): Array<{ blockId: string; proposal: NonNullable<ContentBlock['proposal']> }> {
  return (blocks ?? []).flatMap((b) => (b.proposal ? [{ blockId: b.id, proposal: b.proposal }] : []));
}
