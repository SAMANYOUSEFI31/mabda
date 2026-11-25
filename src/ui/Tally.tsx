import type { ReactNode } from 'react';
import { cx } from './cx.ts';
import { formatNumber } from './format.ts';
import { Icon, type IconName } from './Icon.tsx';
import { Nuqta, type NuqtaState } from './Nuqta.tsx';

/**
 * «در این فضا» (content.md واژه‌نامه): the space counted in the words of the knowledge states, each with its نقطه. One look,
 * the same on «خانه» and «منبع حقیقت»: a number is never a badge in one place and a sentence in another. A row with
 * `onSelect` takes you to where those things are; rows with 0 are left out (nothing to see there), truth is always shown.
 */
export interface TallyRow {
  /** a knowledge state (its نقطه) — or an icon for what is not knowledge (an output) */
  state?: NuqtaState;
  icon?: IconName;
  count: number;
  /** the words after the number: «حقیقت», «فکر باز», … */
  label: string;
  /** where these are; without it the row is plain text */
  onSelect?: () => void;
  /** kept even at 0 */
  always?: boolean;
}

function Lead({ row }: { row: TallyRow }) {
  return row.state ? <Nuqta state={row.state} size="sm" label={false} /> : row.icon ? <Icon name={row.icon} size="sm" className="text-icon-subtle" /> : null;
}

/** `list`: one row under the other (the margin of «خانه»); `inline`: one line, «·» between (the head of «منبع حقیقت») */
export function StateTally({ rows, layout = 'list', label = 'در این فضا', title }: { rows: TallyRow[]; layout?: 'list' | 'inline'; label?: string; title?: ReactNode }) {
  const shown = rows.filter((r) => r.always || r.count > 0);
  if (!shown.length) return null;
  const text = (r: TallyRow) => `${formatNumber(r.count)} ${r.label}`;
  if (layout === 'inline') {
    return (
      <p className="body-sm flex flex-wrap items-center gap-x-inline-md gap-y-stack-xs text-text-subtle" aria-label={label} data-testid="state-tally">
        {shown.map((r) => <span key={r.label} className="inline-flex items-center gap-inline-xs"><Lead row={r} />{text(r)}</span>)}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-stack-xs" role="group" aria-label={label} data-testid="state-tally">
      {title ?? <p className="caption text-text-subtle">{label}</p>}
      <ul className="flex flex-col">
        {shown.map((r) => (
          <li key={r.label}>
            {r.onSelect ? (
              <button type="button" onClick={r.onSelect} className={cx('body-sm inline-flex min-h-touch items-center gap-inline-sm rounded-control-sm px-inset-xs text-start text-text-default hover:bg-interaction-hover')}>
                {/* the arrow follows the words (not the far edge of the column): it reads as part of the line it opens */}
                <Lead row={r} /><span>{text(r)}</span><Icon name="ChevronLeft" size="sm" className="mb-fwd text-icon-subtle" />
              </button>
            ) : (
              <span className="body-sm flex min-h-touch items-center gap-inline-sm px-inset-xs text-text-default"><Lead row={r} />{text(r)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
