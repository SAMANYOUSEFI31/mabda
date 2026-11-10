/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import type { ContextChange, ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode } from '../../types';
import { buildChangeDigest, DEFAULT_DAYS } from '../../core/changeDigest';
import { ACTOR_FA } from '../../core/changeLog';
import { Badge, Button, Card, formatNumber } from '../../ui';
import { ChangeEntry } from './ChangeEntry';

interface Props {
  open: boolean;
  onToggle: () => void;
  changes: ContextChange[];
  objects: ContextObject[];
  relationships: ContextRelationship[];
  deliverables: GeneratedDeliverable[];
  nodes: TreeNode[];
  onOpenAssets: () => void;
  /** «مقایسهٔ دو لحظه»: opens the truth comparison (the same place, not a new menu) */
  onCompare?: () => void;
}

/** «چه چیزی عوض شد» — the Change log of the last 7 days, grouped by who did it, with the outputs that now need a review. */
export const ChangesPanel: React.FC<Props> = ({ open, onToggle, changes, objects, relationships, deliverables, nodes, onOpenAssets, onCompare }) => {
  const digest = useMemo(() => (open ? buildChangeDigest({ changes, objects, relationships, deliverables }) : null), [open, changes, objects, relationships, deliverables]);
  const titleOf = (id: string) => objects.find((o) => o.id === id)?.title ?? id;
  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <Card padding="xl" id="changes" className="flex flex-col gap-stack-lg" aria-label="چه چیزی عوض شد">
      <div className="flex flex-wrap items-center justify-between gap-inline-md">
        <div className="flex flex-col gap-stack-xs">
          <h2 className="heading-sm text-text-default">چه چیزی عوض شد؟</h2>
          <p className="body-sm text-text-subtle">تغییرهای دانش در {formatNumber(DEFAULT_DAYS)} روز اخیر به تفکیک عامل، و خروجی‌هایی که با هر تغییر نیاز به بازبینی پیدا کرده‌اند.</p>
        </div>
        {onCompare && <Button variant="secondary" size="sm" iconStart="Layers" onClick={onCompare}>مقایسهٔ دو لحظه</Button>}
        <Button variant="secondary" size="sm" aria-expanded={open} iconEnd={open ? 'ChevronUp' : 'ChevronDown'} onClick={onToggle}>{open ? 'بستن' : 'نمایش'}</Button>
      </div>

      {digest && (digest.total === 0 ? <p className="body-md text-text-subtle">در این هفته چیزی عوض نشده است.</p> : (
        <div className="flex flex-col gap-stack-lg">
          <div className="flex flex-wrap items-center gap-inline-sm">
            <Badge intent="neutral" icon={false}>{formatNumber(digest.total)} تغییر</Badge>
            <Badge intent={digest.assetsToReview ? 'warning' : 'success'} icon={false}>{digest.assetsToReview ? `${formatNumber(digest.assetsToReview)} خروجی نیاز به بازبینی` : 'خروجی‌ای نیاز به بازبینی ندارد'}</Badge>
          </div>
          {digest.groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-stack-sm" aria-label={`تغییرهای ${ACTOR_FA[g.actor]}${g.label ? ` (${g.label})` : ''}`}>
              <h3 className="title text-text-default">{ACTOR_FA[g.actor]}{g.label ? ` (${g.label})` : ''} · {formatNumber(g.entries.length)} تغییر</h3>
              <ul className="flex flex-col gap-stack-sm">
                {g.entries.map((e) => (
                  <React.Fragment key={e.change.id}>
                    <ChangeEntry change={e.change} objectTitle={e.title} titleOf={titleOf} nodeLabel={nodeLabel} />
                    {e.reviewAssets.length > 0 && (
                      <li className="flex flex-wrap items-center gap-inline-sm ps-inset-lg">
                        <span className="body-sm text-text-default">نیاز به بازبینی: {e.reviewAssets.map((a) => `«${a.title}»`).join('، ')}</span>
                        <Button size="sm" variant="ghost" onClick={onOpenAssets}>مشاهده و بازسازی</Button>
                      </li>
                    )}
                  </React.Fragment>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ))}
    </Card>
  );
};
