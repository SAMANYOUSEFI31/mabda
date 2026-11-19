import type { ReactNode } from 'react';
import { cx } from './cx.ts';
import { Icon, type IconName } from './Icon.tsx';

/**
 * «متن و حاشیه» (patterns.md §۲, layout.md «ستون حاشیه»). The margin is switched on by the width of the content container,
 * not of the screen: from 936px of host (600 text + 48 gap + 288 margin; the page padding brings it to the spec's 1000) it sits
 * beside each item, level with it; narrower, it comes under the item, indented like the text. The page is complete without it.
 */
export function MarginList({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={cx('mb-margin', className)} aria-label={label}>{children}</div>;
}

/** one item and its margin. Without margin content it is just the item, in the reading column. */
export function MarginItem({ children, margin, onRowClick }: { children: ReactNode; margin?: ReactNode; /** notes under the item (`.mb-margin--inline`) open it too: one item, one hover, one target (pointer only; the item itself is the keyboard target) */ onRowClick?: () => void }) {
  return (
    <div className={onRowClick ? 'mb-margin__row mb-margin__row--target' : 'mb-margin__row'} onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role=button]') && !(e.target as HTMLElement).closest('.mb-card--interactive')) onRowClick(); } : undefined}>
      <div className="mb-margin__text">{children}</div>
      {margin ? <div className="mb-margin__note">{margin}</div> : null}
    </div>
  );
}

/** an engine note: an icon (or a Nuqta as `lead`), one sentence, at most one link (patterns.md §۲). */
export function MarginNote({ icon, lead, children, action }: { icon?: IconName; lead?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <p className="mb-margin__line body-sm text-text-subtle">
      {lead ? <span className="mb-margin__icon">{lead}</span> : icon ? <Icon name={icon} size="sm" className="mb-margin__icon" /> : null}
      <span>{children}{action ? <> {action}</> : null}</span>
    </p>
  );
}
