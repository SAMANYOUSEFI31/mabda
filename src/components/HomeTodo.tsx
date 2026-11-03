/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { HomeAction } from '../core/homeActions';
import { Button, Card, Icon, formatNumber } from '../ui';
import type { IconName } from '../ui';

const ICON: Record<HomeAction['kind'], IconName> = { stale: 'RefreshCw', contradiction: 'TriangleAlert', review: 'Network', ready: 'Target', proposals: 'Inbox', weekly: 'ListChecks', due: 'Clock', thinking: 'CircleHelp' };

interface Props {
  top: HomeAction[];
  total: number;
  onAct: (a: HomeAction) => void;
  allOpen: boolean;
  onToggleAll: () => void;
}

/** «الان چه کاری ارزش دارد؟»: at most three things — one sentence and one button each; everything else waits under «همه». */
export const HomeTodo: React.FC<Props> = ({ top, total, onAct, allOpen, onToggleAll }) => (
  <section className="flex flex-col gap-stack-md" aria-label="الان چه کاری ارزش دارد؟">
    <h2 className="heading-sm text-text-default">الان چه کاری ارزش دارد؟</h2>
    {top.length === 0 ? (
      <Card padding="lg"><p className="body-md text-text-default">همه‌چیز سر جایش است. هر وقت چیزی عوض شود یا به تو نیاز باشد، همین‌جا می‌آید.</p></Card>
    ) : (
      <ul className="flex flex-col gap-stack-sm" aria-label="کارهای مهم">
        {top.map((a) => (
          <li key={a.id}>
            <Card padding="lg" className="flex flex-col gap-stack-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-space-0 items-start gap-inline-sm">
                <Icon name={ICON[a.kind]} size="md" className="mt-stack-xs shrink-0 text-icon-subtle" />
                <span className="body-md text-text-default">{a.text}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => onAct(a)}>{a.button}</Button>
            </Card>
          </li>
        ))}
      </ul>
    )}
    <div>
      <Button size="sm" variant="ghost" iconEnd={allOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={allOpen} aria-controls="home-all" onClick={onToggleAll}>{total > 0 ? `همه (${formatNumber(total)})` : 'بیشتر'}</Button>
    </div>
  </section>
);
