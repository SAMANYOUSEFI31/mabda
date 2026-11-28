/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { diffSummary, diffWords, isSame, mergeable, sidesOf } from '../../core/textDiff';
import { formatNumber } from '../../ui';
import type { DiffSegment } from '../../core/textDiff';

const DEL = 'rounded-indicator bg-bg-danger-subtle text-text-danger line-through';
const ADD = 'rounded-indicator bg-bg-success-subtle text-text-success underline decoration-dotted underline-offset-4';

const Side: React.FC<{ title: string; segments: DiffSegment[]; mark: 'del' | 'add'; empty: string }> = ({ title, segments, mark, empty }) => (
  <div className="flex min-w-space-0 flex-1 flex-col gap-stack-xs border-s border-border-default ps-inset-md">
    <span className="label-sm text-text-subtle">{title}</span>
    {segments.length === 0 ? <p className="body-sm text-text-subtlest">{empty}</p> : (
      <p dir="auto" className="body-md whitespace-pre-wrap break-words text-text-default">
        {segments.map((s, i) => s.kind === mark
          ? <mark key={i} className={mark === 'del' ? DEL : ADD}>{s.text}</mark>
          : <span key={i}>{s.text}</span>)}
      </p>
    )}
  </div>
);

/** one text with the edits in place (a phone): what went is struck, what came is underlined, like a tracked change; a screen reader
 *  hears «حذف:» / «افزوده:» before each, since <del>/<ins> alone are not announced everywhere */
const Merged: React.FC<{ segments: DiffSegment[] }> = ({ segments }) => (
  <p dir="auto" className="body-md whitespace-pre-wrap break-words text-text-default" data-testid="diff-merged">
    {segments.map((s, i) => s.kind === 'same' ? <span key={i}>{s.text}</span>
      : s.kind === 'del' ? <React.Fragment key={i}><del className={DEL}><span className="sr-only">حذف: </span>{s.text}</del>{segments[i + 1]?.kind === 'add' && !/\s$/.test(s.text) ? ' ' : null}</React.Fragment>
      : <ins key={i} className={ADD}><span className="sr-only">افزوده: </span>{s.text}</ins>)}
  </p>
);

/** «قبل / بعد»: the two texts side by side, each under a thin start rule (no box inside the proposal block) (stacked on phones); only the words that changed are marked, never by colour alone (removed = struck through). */
export const BeforeAfter: React.FC<{ before?: string; after?: string; className?: string }> = ({ before = '', after = '', className }) => {
  const segs = useMemo(() => diffWords(before, after), [before, after]);
  const { before: b, after: a } = sidesOf(segs);
  const merge = !!before && !!after && mergeable(segs);
  return (
    <div className={`flex flex-col gap-stack-xs ${className ?? ''}`}>
      {/* the one line above the two texts: how much changed */}
      {before && after && <p className="caption text-text-subtle" data-testid="diff-summary">{diffSummary(segs, formatNumber)}</p>}
      {merge && <div className="sm:hidden" role="group" aria-label="تغییر در متن"><Merged segments={segs} /></div>}
      <div className={`${merge ? 'hidden sm:flex' : 'flex'} flex-col gap-inline-sm sm:flex-row`} role="group" aria-label="قبل و بعد">
        <Side title="قبل" segments={before ? b : []} mark="del" empty="چیزی نبود" />
        <Side title="بعد" segments={after ? a : []} mark="add" empty="خالی شد" />
        {isSame(segs) && before && <span className="sr-only">متن تغییری نکرده است</span>}
      </div>
    </div>
  );
};
