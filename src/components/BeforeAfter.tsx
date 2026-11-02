/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { diffWords, isSame, sidesOf } from '../core/textDiff';
import type { DiffSegment } from '../core/textDiff';

const Side: React.FC<{ title: string; segments: DiffSegment[]; mark: 'del' | 'add'; empty: string }> = ({ title, segments, mark, empty }) => (
  <div className="flex min-w-space-0 flex-1 flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
    <span className="label-sm text-text-subtle">{title}</span>
    {segments.length === 0 ? <p className="body-sm text-text-subtlest">{empty}</p> : (
      <p dir="auto" className="body-md whitespace-pre-wrap break-words text-text-default">
        {segments.map((s, i) => s.kind === mark
          ? <mark key={i} className={mark === 'del' ? 'rounded-indicator bg-bg-danger-subtle text-text-danger line-through' : 'rounded-indicator bg-bg-success-subtle text-text-success'}>{s.text}</mark>
          : <span key={i}>{s.text}</span>)}
      </p>
    )}
  </div>
);

/** «قبل / بعد»: the two texts side by side (stacked on phones); only the words that changed are marked, never by colour alone (removed = struck through). */
export const BeforeAfter: React.FC<{ before?: string; after?: string; className?: string }> = ({ before = '', after = '', className }) => {
  const segs = useMemo(() => diffWords(before, after), [before, after]);
  const { before: b, after: a } = sidesOf(segs);
  return (
    <div className={`flex flex-col gap-inline-sm sm:flex-row ${className ?? ''}`} role="group" aria-label="قبل و بعد">
      <Side title="قبل" segments={before ? b : []} mark="del" empty="چیزی نبود" />
      <Side title="بعد" segments={after ? a : []} mark="add" empty="خالی شد" />
      {isSame(segs) && before && <span className="sr-only">متن تغییری نکرده است</span>}
    </div>
  );
};
