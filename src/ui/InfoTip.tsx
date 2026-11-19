import type { ReactNode } from 'react';
import { Popover } from './Overlay.tsx';
import { IconButton } from './Button.tsx';
import { useHints } from './hints.ts';

/**
 * ⓘ beside a term: one tap or click opens one or two exact sentences (what it is, and what it does for you). Not a tooltip:
 * it works with touch and keyboard and stays open while read (WCAG 1.4.13). Hidden when «راهنمای کوچک» is off. Use it only
 * where the term is the product's own (حقیقت، فکر، خط قرمز، قدیمی، دامنه…), never to explain a plain button.
 */
export function InfoTip({ term, children }: { term: string; children: ReactNode }) {
  const [on] = useHints();
  if (!on) return null;
  return (
    <Popover label={`دربارهٔ «${term}»`} trigger={<IconButton icon="Info" size="sm" variant="ghost" label={`«${term}» یعنی چه؟`} />}>
      <div className="flex max-w-overlay-xs flex-col gap-stack-xs p-inset-md">
        <p className="label-md text-text-default">{term}</p>
        <div className="body-sm text-text-subtle">{children}</div>
      </div>
    </Popover>
  );
}
