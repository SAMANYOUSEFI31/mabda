/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState } from 'react';
import { Icon, formatNumber } from '../../ui';

interface Props {
  title: React.ReactNode;
  /** a number after the title, only when > 0 */
  count?: number;
  defaultOpen?: boolean;
  /** keep the content in the page while closed (hidden): for content that other code reads, like the exact text a button will copy */
  keepMounted?: boolean;
  children: React.ReactNode;
}

/**
 * THE shared «closed section» (docs/design-principles.md → الگوهای مشترک): a full-width row, title at the start, a chevron at the end,
 * ≥ 44px tall; the content only when asked for. Everywhere the app hides a detail behind «بیشتر / جزئیات» it uses this.
 */
export const ClosedSection: React.FC<Props> = ({ title, count, defaultOpen = false, keepMounted = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="flex flex-col gap-stack-xs">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} className="label-md flex min-h-touch w-full items-center justify-between gap-inline-sm rounded-control-sm px-inset-sm text-start text-text-default hover:bg-bg-neutral-subtle">
        <span>{title}{count ? ` (${formatNumber(count)})` : ''}</span>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size="sm" className="shrink-0 text-icon-subtle" />
      </button>
      {(open || keepMounted) && <div id={id} hidden={!open} className="flex flex-col gap-stack-xs ps-inset-md">{children}</div>}
    </div>
  );
};
