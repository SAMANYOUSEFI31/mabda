/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContextObject, GeneratedDeliverable } from '../types';
import { buildChangeFeed, DEFAULT_DAYS, KIND_FA, summarize } from '../core/changeFeed';
import type { VersionRow } from '../core/changeFeed';
import { dataApi, DataApiError } from '../services/dataApi';
import { Alert, Badge, Button, Card, formatJalaliDate, formatNumber } from '../ui';

interface Props {
  open: boolean;
  onToggle: () => void;
  workspaceId: string;
  objects: ContextObject[];
  deliverables: GeneratedDeliverable[];
  onOpenAssets: () => void;
}

/** «چه چیزی عوض شد» — Context changes of the last 7 days (from the version history) and, per change, the assets it made stale. */
export const ChangesPanel: React.FC<Props> = ({ open, onToggle, workspaceId, objects, deliverables, onOpenAssets }) => {
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setVersions((await dataApi.changes(workspaceId, DEFAULT_DAYS)).versions); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); }
  }, [workspaceId]);
  // refresh whenever the panel opens or the knowledge changes while it is open
  const objectsSig = objects.map((o) => `${o.id}@${o.version}:${o.status}`).join(',');
  useEffect(() => { if (open) void load(); }, [open, load, objectsSig]);

  const feed = useMemo(() => (versions ? buildChangeFeed({ objects, versions, deliverables }) : []), [versions, objects, deliverables]);
  const sum = summarize(feed);
  const title = (id: string) => objects.find((o) => o.id === id)?.title;

  return (
    <Card padding="xl" id="changes" className="flex flex-col gap-stack-lg" aria-label="چه چیزی عوض شد">
      <div className="flex flex-wrap items-center justify-between gap-inline-md">
        <div className="flex flex-col gap-stack-xs">
          <h2 className="heading-sm text-text-default">چه چیزی عوض شد؟</h2>
          <p className="body-sm text-text-subtle">تغییرهای دانش در {formatNumber(DEFAULT_DAYS)} روز اخیر و خروجی‌هایی که با هر تغییر قدیمی شده‌اند.</p>
        </div>
        <Button variant="secondary" size="sm" aria-expanded={open} iconEnd={open ? 'ChevronUp' : 'ChevronDown'} onClick={onToggle}>{open ? 'بستن' : 'نمایش'}</Button>
      </div>

      {open && (
        error ? <Alert intent="danger" action={<Button size="sm" variant="secondary" onClick={load}>دوباره</Button>}>{error}</Alert>
        : !versions ? <p className="body-sm text-text-subtle">در حال خواندن…</p>
        : feed.length === 0 ? <p className="body-md text-text-subtle">در این هفته چیزی عوض نشده است.</p>
        : (
          <div className="flex flex-col gap-stack-md">
            <div className="flex flex-wrap items-center gap-inline-sm">
              <Badge intent="neutral" icon={false}>{formatNumber(sum.total)} تغییر</Badge>
              <Badge intent={sum.staleAssets ? 'warning' : 'success'} icon={false}>{sum.staleAssets ? `${formatNumber(sum.staleAssets)} خروجی قدیمی‌شده` : 'خروجی قدیمی‌ای نیست'}</Badge>
            </div>
            <ul className="flex flex-col gap-stack-sm">
              {feed.map((e) => (
                <li key={e.id} className="flex flex-col gap-stack-xs rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                  <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                    <span className="flex flex-wrap items-center gap-inline-sm">
                      <Badge intent={e.kind === 'created' ? 'success' : e.kind === 'edited' ? 'info' : 'neutral'} icon={false}>{KIND_FA[e.kind]}</Badge>
                      <span className="label-md text-text-default">{title(e.objectId) ?? e.title}</span>
                      {e.kind === 'edited' && <span className="body-sm text-text-subtle">نسخهٔ {formatNumber(e.version)}</span>}
                    </span>
                    <span className="body-sm text-text-subtle">{formatJalaliDate(e.at)}</span>
                  </div>
                  {e.kind === 'edited' && e.before !== undefined && (
                    <p className="body-sm text-text-subtle"><span className="label-sm text-text-default">قبل:</span> {e.before}<br /><span className="label-sm text-text-default">بعد:</span> {e.after}</p>
                  )}
                  {e.staleAssets.length > 0 && (
                    <div className="flex flex-wrap items-center gap-inline-sm border-t border-border-subtle pt-inset-xs">
                      <span className="body-sm text-text-default">خروجی قدیمی‌شده: {e.staleAssets.map((a) => `«${a.title}»`).join('، ')}</span>
                      <Button size="sm" variant="ghost" onClick={onOpenAssets}>مشاهده و بازسازی</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </Card>
  );
};
