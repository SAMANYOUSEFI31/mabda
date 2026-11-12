/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ContextChange } from '../../types';
import { ACTOR_FA, CHANGE_KIND_FA } from '../../core/changeLog';
import { Badge, Nuqta, STATUS_META, TYPE_META, formatJalaliDate } from '../../ui';
import type { NuqtaState } from '../../ui';
import { BeforeAfter } from '../shared/BeforeAfter';

const FIELD_FA: Record<string, string> = { type: 'نوع', title: 'عنوان', content: 'متن', nodeId: 'بخش', slotKey: 'جایگاه', provenance: 'منشأ', status: 'وضعیت', dependsOn: 'وابسته به', supersededById: 'جایگزین', supersedes: 'جایگزین‌کنندهٔ' };
const TEXT_FIELDS = new Set(['title', 'content']);

interface Lookups { titleOf?: (id: string) => string; nodeLabel?: (id: string) => string }

/** a short human value for a non-text field */
function shown(field: string, v: unknown, l: Lookups): string {
  if (v === null || v === undefined || v === '') return 'خالی';
  if (field === 'type') return TYPE_META[v as keyof typeof TYPE_META]?.label ?? String(v);
  if (field === 'status') return STATUS_META[v as keyof typeof STATUS_META]?.label ?? String(v);
  if (field === 'nodeId') return l.nodeLabel?.(String(v)) ?? String(v);
  if (field === 'dependsOn') return (v as string[]).length ? (v as string[]).map((id) => `«${l.titleOf?.(id) ?? id}»`).join('، ') : 'هیچ‌چیز';
  if (field === 'supersededById' || field === 'supersedes') return `«${l.titleOf?.(String(v)) ?? v}»`;
  return String(v);
}

/** the knowledge state a change leaves its item in, when the change says it */
function stateAfter(c: ContextChange): NuqtaState | undefined {
  const st = (c.after as Record<string, unknown> | undefined)?.status;
  if (st === 'Confirmed') return 'truth';
  if (st === 'Proposed') return 'proposed';
  if (st === 'Needs Review') return 'stale';
  if (st === 'Superseded' || st === 'Archived') return 'past';
  if (c.kind === 'superseded' || c.kind === 'archived' || c.kind === 'proposal_rejected') return 'past';
  if (c.kind === 'proposal_accepted' || c.kind === 'review_accepted' || c.kind === 'contradiction_resolved') return 'truth';
  return undefined;
}

/** One entry of the timeline: who, what, why, when — and the before/after of what changed. */
export const ChangeEntry: React.FC<{ change: ContextChange; objectTitle?: string; /** only what changed (inside a milestone that already says who, when and why) */ bare?: boolean } & Lookups> = ({ change: c, objectTitle, bare, ...l }) => {
  const fields = Object.keys(c.after ?? {}).filter((f) => f in (c.before ?? {}) || f === 'dependsOn');
  const textFields = fields.filter((f) => TEXT_FIELDS.has(f));
  const other = Object.keys(c.after ?? {}).filter((f) => !TEXT_FIELDS.has(f));
  return (
    <li className={bare ? 'flex flex-col gap-stack-xs' : 'flex flex-col gap-stack-xs border-s border-border-default ps-inset-md py-inset-xs'}>
      {!bare && <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <span className="flex flex-wrap items-center gap-inline-sm">
          {/* the state the change left the item in, as its dot; the change itself in words (plan 2.2: no coloured pill) */}
          <span className="inline-flex items-center gap-inline-xs label-md text-text-default">{stateAfter(c) && <Nuqta state={stateAfter(c)!} size="sm" />}{CHANGE_KIND_FA[c.kind]}</span>
          {objectTitle && <span className="label-md text-text-default">{objectTitle}</span>}
          <span className="body-sm text-text-subtle">{ACTOR_FA[c.actor]}{c.actorLabel ? ` (${c.actorLabel})` : ''}</span>
        </span>
        <span className="body-sm text-text-subtle">{formatJalaliDate(c.at)}</span>
      </div>}
      {!bare && c.reason && <p className="body-sm text-text-default"><span className="label-sm text-text-subtle">دلیل: </span>{c.reason}</p>}
      {textFields.map((f) => (
        <div key={f} className="flex flex-col gap-stack-xs">
          <span className="label-sm text-text-subtle">{FIELD_FA[f]}</span>
          <BeforeAfter before={String(c.before?.[f] ?? '')} after={String(c.after?.[f] ?? '')} />
        </div>
      ))}
      {other.map((f) => (
        <p key={f} className="body-sm text-text-default">
          <span className="label-sm text-text-subtle">{FIELD_FA[f] ?? f}: </span>
          {f in (c.before ?? {}) ? <>{shown(f, c.before?.[f], l)} ← </> : null}{shown(f, c.after?.[f], l)}
        </p>
      ))}
    </li>
  );
};
