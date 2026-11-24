import type { ReactNode } from 'react';

/**
 * Session replay privacy (docs/test-data.md §Clarity). When the user test turns on Microsoft Clarity, the whole page is masked
 * (`data-clarity-mask` on <html>): a replay shows shapes and clicks, never words. That also hides the app's OWN words (a
 * button's «ذخیره», a dialog's title), so a replay cannot say which control someone pressed. These helpers let the app's own
 * words through and nothing else.
 *
 * The rule (what Clarity really does, read from clarity-js 0.8 `layout/dom.ts`): a node's privacy is decided ONCE, when the node
 * is first seen, from the nearest `data-clarity-mask` / `data-clarity-unmask` above it, and never re-checked. So:
 * - an element marked «app's words» must hold only the app's words for its whole life (a text node that later changes to a
 *   person's words would be sent as it is): only text that is the app's own BY CONSTRUCTION is passed through `UiText`;
 * - a quoted part «…» and everything after «:», «—», «·» is a person's item by the app's own writing convention (the same rule
 *   as the activity record, src/core/activity.ts → uiLabel), so it gets its own masked span, keyed by its role: a part that
 *   changes role is a NEW node, never a reused one (see uiParts for the exact, greedy rule);
 * - the primitives that use `UiText` (Button, Dialog title, NavItem, BottomNav, Tabs, SegmentedControl, field labels,
 *   EmptyState, ErrorState) take `personal` when what they show can be a person's words; `clarityPrivacy.test.ts` reads every
 *   call site and fails when a label is not provably the app's words and is not marked `personal`.
 * Without Clarity these attributes do nothing.
 */
export const UI_WORDS = { 'data-clarity-unmask': 'True' } as const;
export const PERSON_WORDS = { 'data-clarity-mask': 'True' } as const;

/**
 * true while a session replay records this page. Clarity sends most attribute values as they are (only a few, such as title,
 * alt and aria-label, are dropped or masked), so an attribute that would carry a person's words (an aria-valuetext naming a
 * section) says only the app's words while this is on; the visible text it mirrors is masked as usual.
 */
export const replayOn = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-clarity-mask');

export interface UiPart { text: string; person: boolean }

const QUOTES = /[«»"“”]/g;

/**
 * Splits the app's words from a person's item inside them. Masked: everything from the first quote mark («, », ", “, ”) to the
 * last one (to the end when there is only one), and everything after the first «:», «—», «·». Greedy on purpose: a name that
 * itself holds a quote mark or a colon is still masked whole (the app's words between two quoted items are lost instead).
 */
export function uiParts(s: string): UiPart[] {
  const marks = [...s.matchAll(QUOTES)].map((m) => m.index!);
  const sep = s.search(/[:—·]/);
  let from = marks.length ? marks[0] : -1;
  let to = marks.length > 1 ? marks[marks.length - 1] + 1 : s.length;
  if (sep >= 0 && (from < 0 || sep < from)) { from = sep + 1; to = s.length; }
  else if (sep >= 0 && sep > from) to = s.length; // a separator after the quote: the rest is a person's too
  if (from < 0) return s ? [{ text: s, person: false }] : [];
  return [{ text: s.slice(0, from), person: false }, { text: s.slice(from, to), person: true }, { text: s.slice(to), person: false }].filter((p) => p.text);
}

/** true when the node is plain text (a string, a number, or a list of them) that `UiText` can show */
export const isPlainText = (n: ReactNode): n is string | number | Array<string | number> =>
  typeof n === 'string' || typeof n === 'number' || (Array.isArray(n) && n.length > 0 && n.every((x) => typeof x === 'string' || typeof x === 'number'));

/**
 * Shows the app's own words readable in a session replay, and a person's quoted item masked. Anything that is not plain text
 * (an element, a mixed node), or anything marked `personal`, stays as it is: masked.
 */
export function UiText({ children, personal = false }: { children: ReactNode; personal?: boolean }) {
  if (personal || !isPlainText(children)) return <>{children}</>;
  const s = Array.isArray(children) ? children.join('') : String(children);
  return (
    <>
      {uiParts(s).map((p, i) => (p.person
        ? <span key={`p${i}`} {...PERSON_WORDS}>{p.text}</span>
        : <span key={`u${i}`} {...UI_WORDS}>{p.text}</span>))}
    </>
  );
}
