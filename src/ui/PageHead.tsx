import type { ReactNode } from 'react';
import { Menu } from './Overlay.tsx';
import type { MenuItem } from './Overlay.tsx';
import { Button, IconButton } from './Button.tsx';
import { InfoTip } from './InfoTip.tsx';
import type { IconName } from './Icon.tsx';

export interface PageAction { label: string; icon: IconName; onSelect: () => void }

/**
 * A page's head, one grammar for every page (docs/ux/research/headers-trees-persian-type.md §۸ «جای کارها»):
 * - The title is one line where it fits. Its explanation is ⓘ right after the last word, in the flow of the text, never a
 *   standing sentence under it.
 * - A view switch (`views`) is navigation, so it is always visible.
 * - The page's own secondary steps (`actions`) are buttons where the head has room for them beside the title. Where it does
 *   not (a phone, a narrow window), they go into the «⋯» in the title's row, at the end edge, as on a phone's navigation bar
 *   (HIG: no more than two items there; M3 top app bar: overflow past three). That keeps the head to one row, plus the switch.
 * - Occasional steps (`more`) are always under «⋯», which is always last.
 * Where the head is narrow or wide is decided by the page frame's width (container query `mb-frame`, components.css), not by
 * the screen, so a narrow window on a computer gets the same compact head as a phone.
 */
export function PageHead({ title, info, views, actions = [], more = [], moreLabel = 'بیشتر' }: {
  title: string; info?: { term: string; text: ReactNode }; views?: ReactNode; actions?: PageAction[]; more?: MenuItem[]; moreLabel?: string;
}) {
  const cut = title.lastIndexOf(' ');
  const narrowItems: MenuItem[] = [...actions.map((a) => ({ label: a.label, icon: a.icon, onSelect: a.onSelect })), ...(actions.length && more.length ? [{ divider: true }] : []), ...more];
  return (
    <div className="mb-page-head">
      <div className="mb-page-head__title flex items-start gap-inline-sm">
        <div className="min-w-space-0 flex-1">
          {/* ⓘ is glued to the title's last word (one no-wrap run), so it never wraps to a line of its own. It sits in the heading
              for that, and the heading's name stays the title alone (aria-label) */}
          <h1 className="text-heading-md font-bold text-pretty text-text-default" aria-label={info ? title : undefined}>
            {info ? <>{title.slice(0, cut + 1)}<span className="whitespace-nowrap">{title.slice(cut + 1)}<span className="mb-page-head__info"><InfoTip term={info.term}>{info.text}</InfoTip></span></span></> : title}
          </h1>
        </div>
        {narrowItems.length > 0 && <span className="mb-page-head__top-more"><Menu label={moreLabel} align="end" trigger={<IconButton icon="Ellipsis" label={moreLabel} variant="ghost" />} items={narrowItems} /></span>}
      </div>
      {(views || actions.length > 0 || more.length > 0) && (
        <div className={views ? 'mb-page-head__actions' : 'mb-page-head__actions mb-page-head__wide'}>
          {views}
          {(actions.length > 0 || more.length > 0) && (
            <span className="mb-page-head__wide flex-nowrap items-center gap-inline-sm">
              {actions.map((a) => <Button key={a.label} variant="secondary" iconStart={a.icon} onClick={a.onSelect}>{a.label}</Button>)}
              {more.length > 0 && <Menu label={moreLabel} align="end" trigger={<IconButton icon="Ellipsis" label={moreLabel} variant="secondary" />} items={more} />}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
