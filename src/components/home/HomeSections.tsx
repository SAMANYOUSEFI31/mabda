/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { HomeAction, HomeSections as Sections } from '../../core/homeActions';
import { Button, Icon, InfoTip, MarginItem, MarginList, MarginNote, Nuqta, StateTally, cx, formatJalaliDate, formatNumber } from '../../ui';
import type { IconName, NuqtaState, TallyRow } from '../../ui';

const ICON: Record<HomeAction['kind'], IconName> = { stale: 'Clock', contradiction: 'TriangleAlert', review: 'Clock', ready: 'CircleCheck', proposals: 'Inbox', weekly: 'ListChecks', due: 'CalendarDays', thinking: 'MessageCircleQuestion', monitor: 'TrendingUp', unlinked: 'Link2', drafts: 'Pencil' };
/** each section opens with a few, so the first thing she reads is short; the rest are one tap away, in place */
const FIRST = 3;

type Gap = Sections['missing'][number];

interface Props {
  sections: Sections;
  onAct: (a: HomeAction) => void;
  onAnswerGap: (gap: Gap) => void;
  /** confirmed truths in this space (UX-05: none yet → «settle one thought») */
  truthCount: number;
  /** «در این فضا»: the space counted by state (src/core/spaceTally.ts), each row a way to where they are */
  tally: TallyRow[];
  thoughts: Array<{ id: string; text: string; at: string }>;
  /** all open thoughts (the margin lists only the latest few) */
  openThoughtCount?: number;
  onOpenThinking: () => void;
  /** for «همه‌چیز به‌روز است.»: the latest changes, one line each */
  recent: Array<{ id: string; text: string; at: string }>;
  allOpen: boolean;
  onToggleAll: () => void;
  /** what «جزئیات بیشتر» opens: drawn directly under it, in the same column (proximity: what opens sits where it was asked for) */
  more?: React.ReactNode;
  /** calm news (not a task, so not in the to-do): between the to-do and «جزئیات بیشتر» */
  notice?: React.ReactNode;
}

function Row({ lead, text, button, icon, onClick }: { lead: React.ReactNode; text: string; button: string; icon?: IconName; onClick: () => void }) {
  return (
    // the action sits at the row's end edge at every width, top-aligned on a phone: one column of actions to scan, and no row of its own
    // under each item (it doubled every item's height at 390; research «محصولات پردکمه»: Divar, Digikala, GitHub keep a row one row)
    <li className="flex items-start justify-between gap-inline-md py-stack-sm sm:items-center">
      <span className="flex min-w-space-0 flex-1 items-start gap-inline-sm">
        <span className="mt-stack-xs flex shrink-0 text-icon-subtle">{lead}</span>
        <span className="body-md text-text-default">{text}</span>
      </span>
      {/* a text button (M3 «text button» at a list row's end): the step repeats on every row, so it is quiet; the verb stays visible
          so it still reads as what happens (research §۴ «کار تکراری هر ردیف آرام»). The row's own text is the thing, not the frame */}
      <Button size="sm" variant="ghost" iconStart={icon} className="shrink-0" onClick={onClick}>{button}</Button>
    </li>
  );
}

function Section<T>({ id, title, items, render, info }: { id: string; title: string; items: T[]; render: (t: T) => React.ReactNode; /** ⓘ: what this list is, for a first-time user (§۴۸) */ info?: React.ReactNode }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <div className="flex items-center gap-inline-xs"><h2 id={id} className="heading-sm text-text-default">{title}</h2>{info && <InfoTip term={title}>{info}</InfoTip>}</div>
      {/* motion.md «هماهنگی» 5: the stagger is for the list's first entry only. «N مورد دیگر» opens the rest at once: staggered, the
          eighth row came 210ms after the press (rule 2 allows 100) */}
      <ul className={cx(!all && 'mb-stagger', 'flex flex-col divide-y divide-border-subtle')}>{shown.map(render)}</ul>
      {items.length > FIRST && (
        <div className="pt-stack-xs">
          <Button size="sm" variant="ghost" className="-ms-inset-md" iconEnd={all ? 'ChevronUp' : 'ChevronDown'} aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'کمتر' : `${formatNumber(items.length - FIRST)} مورد دیگر`}
          </Button>
        </div>
      )}
    </section>
  );
}

/** the margin sits beside the text from this width of host (the same 54rem as `.mb-margin__row` in components.css) */
const BESIDE_REM = 54;
/** whether the host is wide enough for the margin beside the text; it decides the ORDER of the page, which CSS cannot move */
function useBeside(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [beside, setBeside] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const check = () => setBeside(el.getBoundingClientRect().width >= BESIDE_REM * rem - 0.5);
    check();
    const ro = new ResizeObserver(check); ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return beside;
}

const dot = (state: NuqtaState) => <Nuqta state={state} size="sm" label={false} />;

/** «خانه» (patterns.md §۸): what waits for her, what is missing, what is out of date; in the margin, the latest thoughts and one number. */
export const HomeSections: React.FC<Props> = ({ sections, onAct, onAnswerGap, truthCount, tally, thoughts, openThoughtCount = thoughts.length, onOpenThinking, recent, allOpen, onToggleAll, more, notice }) => {
  // the margin (identity.md «متن و حاشیه»): what the space holds, in the words of its states, and what moved last. Beside the
  // to-do on a wide page, under it on a narrow one; the page is complete without it
  const host = useRef<HTMLDivElement>(null);
  const beside = useBeside(host);
  // each block of the margin under a hairline rule (a sidebar's rule in print): the eye finds where one ends and the next begins
  // without a heading louder than the text it sits beside; the rows inside keep no lines of their own (decisions.md §۴۹)
  const margin = (
    <div className="mb-home-margin__blocks">
      <div className="mb-home-margin__block"><StateTally rows={tally} /></div>
      {thoughts.length > 0 && (
        <div className="mb-home-margin__block flex flex-col gap-stack-xs">
          <p className="caption text-text-subtle">آخرین فکرها</p>
          {thoughts.map((t) => <MarginNote key={t.id} lead={dot('thought')}><span className="line-clamp-2">{t.text}</span></MarginNote>)}
          {/* a text button in the flow lines its words up with the text above it, not with its own padding (§۴۰) */}
          <div><Button size="sm" variant="ghost" className="-ms-inset-md" onClick={onOpenThinking}>همهٔ فکرها</Button></div>
        </div>
      )}
      {!sections.empty && recent.length > 0 && (
        <div className="mb-home-margin__block flex flex-col gap-stack-xs">
          <p className="caption text-text-subtle">آخرین تغییرها</p>
          {recent.map((c) => <MarginNote key={c.id} icon="History"><span className="flex flex-col"><span className="line-clamp-2">{c.text}</span><span className="caption text-text-subtle">{formatJalaliDate(c.at)}</span></span></MarginNote>)}
        </div>
      )}
    </div>
  );
  // one rule at every width (decisions.md §۴۴، §۵۳ ۳): «جزئیات بیشتر» is the last control of the page's own content and what it
  // opens starts directly under it (proximity). Wide: the margin is beside the list, the toggle closes the reading column and the
  // details take the page width after both. Narrow: list, margin, toggle, details, in that order
  const toggle = <div data-testid="home-details-toggle"><Button size="sm" variant="ghost" className="-ms-inset-md" iconEnd={allOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={allOpen} aria-controls="home-all" onClick={onToggleAll}>جزئیات بیشتر</Button></div>;
  return (
    <div ref={host} className="flex flex-col gap-stack-lg">
    <MarginList label="آنچه الان به تو نیاز دارد">
      <MarginItem margin={beside ? margin : undefined}>
        <div className="flex flex-col gap-stack-lg">
          {sections.empty && truthCount === 0 ? (
            // UX-05: she has written thoughts or notes but nothing is truth yet. «همه‌چیز به‌روز است» would be false comfort;
            // the next step is to settle one thought into the source
            <section aria-labelledby="home-first" className="flex flex-col gap-stack-sm">
              <h2 id="home-first" className="heading-sm text-text-default">{openThoughtCount > 0 ? `${formatNumber(openThoughtCount)} فکر باز داری؛ هنوز هیچ‌کدام حقیقت نشده است.` : 'یادداشت‌هایت اینجاست؛ هنوز چیزی حقیقت نشده است.'}</h2>
              <p className="body-md text-text-subtle">وقتی یکی روشن شد، در «فکر» تأییدش کن تا حقیقت شود و هر خروجی از آن ساخته شود.</p>
              <div><Button size="sm" variant="secondary" iconEnd="ChevronLeft" onClick={onOpenThinking}>رفتن به فکرها</Button></div>
            </section>
          ) : sections.empty ? (
            <section aria-labelledby="home-clear" className="flex flex-col gap-stack-sm">
              <h2 id="home-clear" className="heading-sm text-text-default">همه‌چیز به‌روز است.</h2>
              {recent.length > 0 && (
                <>
                  <p className="body-sm text-text-subtle">آخرین تغییرها:</p>
                  <ul className="flex flex-col divide-y divide-border-subtle">
                    {recent.map((c) => (
                      <li key={c.id} className="flex items-baseline justify-between gap-inline-md py-stack-xs">
                        <span className="body-md min-w-space-0 text-text-default">{c.text}</span>
                        <span className="caption shrink-0 text-text-subtle">{formatJalaliDate(c.at)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : (
            <>
              <Section id="home-waiting" title="منتظر تو" info="کارهایی که فقط تو می‌توانی تمامشان کنی: دو حقیقت که با هم نمی‌خوانند، پیشنهادی که تأیید می‌خواهد، یا چیزی که به تغییری وابسته است. با هر کدام، آن مورد باز می‌شود." items={sections.waiting} render={(a) => (
                <Row key={a.id} lead={<Icon name={ICON[a.kind]} size="md" />} text={a.text} button={a.button} onClick={() => onAct(a)} />
              )} />
              <Section id="home-missing" title="چه چیزی کم است" info="جاهایی از درخت که هنوز حقیقتی ندارند ولی خروجی‌ها به آن‌ها نیاز دارند. یک جملهٔ کوتاه کافی است؛ همان‌جا ثبت می‌شود." items={sections.missing} render={(g) => (
                <Row key={g.key} lead={dot('gap')} text={g.question || g.label} button="افزودن" icon="Plus" onClick={() => onAnswerGap(g)} />
              )} />
              <Section id="home-stale" title="قدیمی‌شده‌ها" info="خروجی‌هایی که از نسخه‌ای ساخته شده‌اند که بعد عوض شده است. خودِ خروجی دست نمی‌خورد؛ بازش کن و ببین چه عوض شده، بعد دوباره بساز یا همان را نگه دار." items={sections.stale} render={(a) => (
                <Row key={a.id} lead={dot('stale')} text={a.text} button={a.button} onClick={() => onAct(a)} />
              )} />
            </>
          )}
          {/* wide: the notice and the toggle follow the last item in the reading column, next to the list they belong to, not under
              the (often taller) margin: at 1440 with a short list the toggle sat ~200px below the last item (§۴۴) */}
          {notice}
          {beside && toggle}
        </div>
      </MarginItem>
    </MarginList>
    {/* narrow: the margin comes BEFORE the toggle, so «جزئیات بیشتر» is the last thing on the page and what it opens starts right
        under it and runs to the end. #95 had put the margin after the details: opening them pushed «آخرین فکرها» a screen down,
        under content she had not asked for (decisions.md §۵۳ ۳; guarded by scripts/scenario-guards.mjs) */}
    {!beside && <div className="mb-home-margin" aria-label="در این فضا">{margin}</div>}
    {!beside && toggle}
    {more}
    </div>
  );
};
