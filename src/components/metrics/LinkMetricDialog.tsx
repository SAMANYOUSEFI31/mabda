/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * «وصل کردن» from «منتظر تو»: a number made before monitoring moved onto truths goes onto a truth the person already has (the
 * ones whose title is like the number's name first), or onto a new truth with its name. Mabda never picks for her (audit, PR #91:
 * opening only a new truth duplicated «موجودی صندوق اضطراری» in the life sample).
 */

import React, { useMemo, useState } from 'react';
import type { ContextObject, Metric } from '../../types';
import { linkCandidates } from '../../core/metrics';
import { Button, Dialog, Select } from '../../ui';

interface Props {
  metric: Metric | null;
  metrics: Metric[];
  objects: ContextObject[];
  onClose: () => void;
  /** onto an existing truth (with every number) */
  onLink: (metricId: string, objectId: string) => Promise<void>;
  /** a new truth with the number's name, carrying its history; she writes and saves it */
  onNew: (metricId: string) => void;
}

export const LinkMetricDialog: React.FC<Props> = ({ metric, metrics, objects, onClose, onLink, onNew }) => {
  const candidates = useMemo(() => (metric ? linkCandidates(metric, metrics, objects) : []), [metric, metrics, objects]);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const value = picked || candidates.find((c) => c.like)?.object.id || '';
  if (!metric) return null;
  const like = candidates.filter((c) => c.like);
  return (
    <Dialog
      open={!!metric}
      onClose={onClose}
      size="sm"
      title={`وصل کردن «${metric.name}»`}
      description="عددهایش با همهٔ تاریخچه روی حقیقتی می‌روند که انتخاب کنی."
      footer={(
        <>
          {candidates.length > 0 && <Button variant="primary" disabled={!value} loading={busy} onClick={() => { setBusy(true); void onLink(metric.id, value).finally(() => setBusy(false)); }} data-testid="link-metric-existing">وصل کن</Button>}
          {/* with nothing to pick, the new truth is the one step of this view */}
          <Button variant={candidates.length > 0 ? 'ghost' : 'primary'} onClick={() => onNew(metric.id)} data-testid="link-metric-new">حقیقت تازه با همین نام</Button>
        </>
      )}
    >
      {candidates.length > 0 ? (
        <Select
          label="کدام حقیقت؟"
          value={value}
          onChange={(e) => setPicked(e.target.value)}
          hint={like.length ? 'آن‌هایی که نامشان شبیه این عدد است اول آمده‌اند.' : undefined}
          options={[{ value: '', label: 'انتخاب کن' }, ...candidates.map((c) => ({ value: c.object.id, label: c.object.title }))]}
        />
      ) : <p className="body-md text-text-subtle">هنوز واقعیتی بدون پایش نداری؛ حقیقت تازه‌ای با همین نام بساز.</p>}
    </Dialog>
  );
};
