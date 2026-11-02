/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ContextChange } from '../types';
import { ACTOR_FA, CHANGE_KIND_FA } from '../core/changeLog';
import { Badge, STATUS_META, TYPE_META, formatJalaliDate } from '../ui';
import { BeforeAfter } from './BeforeAfter';

const FIELD_FA: Record<string, string> = { type: 'نوع', title: 'عنوان', content: 'متن', nodeId: 'گره', slotKey: 'جایگاه', provenance: 'منشأ', status: 'وضعیت', dependsOn: 'وابسته به', supersededById: 'جایگزین', supersedes: 'جایگزین‌کنندهٔ' };
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

/** One entry of the timeline: who, what, why, when — and the before/after of what changed. */
export const ChangeEntry: React.FC<{ change: ContextChange; objectTitle?: string } & Lookups> = ({ change: c, objectTitle, ...l }) => {
  const fields = Object.keys(c.after ?? {}).filter((f) => f in (c.before ?? {}) || f === 'dependsOn');
  const textFields = fields.filter((f) => TEXT_FIELDS.has(f));
  const other = Object.keys(c.after ?? {}).filter((f) => !TEXT_FIELDS.has(f));
  return (
    <li className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <span className="flex flex-wrap items-center gap-inline-sm">
          <Badge intent={c.kind === 'proposal_rejected' || c.kind === 'archived' ? 'neutral' : c.kind === 'superseded' || c.kind === 'contradiction_resolved' ? 'warning' : c.kind === 'edited' ? 'info' : 'success'} icon={false}>{CHANGE_KIND_FA[c.kind]}</Badge>
          {objectTitle && <span className="label-md text-text-default">{objectTitle}</span>}
          <span className="body-sm text-text-subtle">{ACTOR_FA[c.actor]}{c.actorLabel ? ` (${c.actorLabel})` : ''}</span>
        </span>
        <span className="body-sm text-text-subtle">{formatJalaliDate(c.at)}</span>
      </div>
      {c.reason && <p className="body-sm text-text-default"><span className="label-sm text-text-subtle">دلیل: </span>{c.reason}</p>}
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
