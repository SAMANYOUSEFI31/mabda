/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { HomeAction, HomeSections as Sections } from '../../core/homeActions';
import { Button, Icon, MarginItem, MarginList, MarginNote, Nuqta, StateTally, formatJalaliDate, formatNumber } from '../../ui';
import type { IconName, NuqtaState, TallyRow } from '../../ui';

const ICON: Record<HomeAction['kind'], IconName> = { stale: 'RefreshCw', contradiction: 'TriangleAlert', review: 'Network', ready: 'Target', proposals: 'Inbox', weekly: 'ListChecks', due: 'Clock', thinking: 'CircleHelp', monitor: 'TrendingUp', unlinked: 'Link2' };
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
}

function Row({ lead, text, button, icon, onClick }: { lead: React.ReactNode; text: string; button: string; icon?: IconName; onClick: () => void }) {
  return (
    <li className="flex flex-col gap-stack-xs py-stack-sm sm:flex-row sm:items-center sm:justify-between sm:gap-inline-md">
      <span className="flex min-w-space-0 items-start gap-inline-sm">
        <span className="mt-stack-xs flex shrink-0 text-icon-subtle">{lead}</span>
        <span className="body-md text-text-default">{text}</span>
      </span>
      <Button size="sm" variant="secondary" iconStart={icon} className="self-start sm:self-auto shrink-0" onClick={onClick}>{button}</Button>
    </li>
  );
}

function Section<T>({ id, title, items, render }: { id: string; title: string; items: T[]; render: (t: T) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="heading-sm text-text-default">{title}</h2>
      <ul className="mb-stagger flex flex-col divide-y divide-border-subtle">{shown.map(render)}</ul>
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

const dot = (state: NuqtaState) => <Nuqta state={state} size="sm" label={false} />;

/** «خانه» (patterns.md §۸): what waits for her, what is missing, what is out of date; in the margin, the latest thoughts and one number. */
export const HomeSections: React.FC<Props> = ({ sections, onAct, onAnswerGap, truthCount, tally, thoughts, openThoughtCount = thoughts.length, onOpenThinking, recent, allOpen, onToggleAll }) => {
  // the margin (identity.md «متن و حاشیه»): what the space holds, in the words of its states, and what moved last. Beside the
  // to-do on a wide page, under it on a narrow one; the page is complete without it
  const margin = (
    <div className="flex flex-col gap-stack-lg">
      <StateTally rows={tally} />
      {thoughts.length > 0 && (
        <div className="flex flex-col gap-stack-xs">
          <p className="caption text-text-subtle">آخرین فکرها</p>
          {thoughts.map((t) => <MarginNote key={t.id} lead={dot('thought')}><span className="line-clamp-2">{t.text}</span></MarginNote>)}
          {/* a text button in the flow lines its words up with the text above it, not with its own padding (§۴۰) */}
          <div><Button size="sm" variant="ghost" className="-ms-inset-md" onClick={onOpenThinking}>همهٔ فکرها</Button></div>
        </div>
      )}
      {!sections.empty && recent.length > 0 && (
        <div className="flex flex-col gap-stack-xs">
          <p className="caption text-text-subtle">آخرین تغییرها</p>
          {recent.map((c) => <MarginNote key={c.id} icon="History"><span className="flex flex-col"><span className="line-clamp-2">{c.text}</span><span className="caption text-text-subtle">{formatJalaliDate(c.at)}</span></span></MarginNote>)}
        </div>
      )}
    </div>
  );
  return (
    <MarginList label="آنچه الان به تو نیاز دارد">
      <MarginItem margin={margin}>
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
              <Section id="home-waiting" title="منتظر تو" items={sections.waiting} render={(a) => (
                <Row key={a.id} lead={<Icon name={ICON[a.kind]} size="md" />} text={a.text} button={a.button} onClick={() => onAct(a)} />
              )} />
              <Section id="home-missing" title="چه چیزی کم است" items={sections.missing} render={(g) => (
                <Row key={g.key} lead={dot('gap')} text={g.question || g.label} button="افزودن" icon="Plus" onClick={() => onAnswerGap(g)} />
              )} />
              <Section id="home-stale" title="قدیمی‌شده‌ها" items={sections.stale} render={(a) => (
                <Row key={a.id} lead={dot('stale')} text={a.text} button={a.button} onClick={() => onAct(a)} />
              )} />
            </>
          )}
          {/* the end of the to-do, in the text column: it follows what it opens more of, never the (taller) margin beside it */}
          <div>
            <Button size="sm" variant="ghost" className="-ms-inset-md" iconEnd={allOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={allOpen} aria-controls="home-all" onClick={onToggleAll}>جزئیات بیشتر</Button>
          </div>
        </div>
      </MarginItem>
    </MarginList>
  );
};
