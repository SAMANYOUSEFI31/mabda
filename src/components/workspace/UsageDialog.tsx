/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { summarizeUsage } from '../../core/usage';
import type { UsageRow } from '../../core/usage';
import { dataApi, DataApiError } from '../../services/dataApi';
import { Alert, Badge, Dialog, Spinner, formatJalaliDate, formatNumber } from '../../ui';

interface Props { open: boolean; onClose: () => void }

/** «استفاده از امکانات» (admin only): how often each feature was opened or used on this install. Only counters — no text, no user data. */
export const UsageDialog: React.FC<Props> = (props) => (props.open ? <Usage {...props} /> : null);

const Usage: React.FC<Props> = ({ onClose }) => {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { dataApi.featureUsage().then((r) => setRows(r.rows)).catch((e) => setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.')); }, []);
  const s = rows ? summarizeUsage(rows) : null;
  return (
    <Dialog open onClose={onClose} size="lg" title="استفاده از امکانات" description="فقط شمارنده‌های همین نصب؛ هیچ متن یا دانشی ذخیره نمی‌شود. امکانی که سطح ۱ است و کسی بازش نمی‌کند، مهم‌ترین یافته است.">
      {error && <Alert intent="danger">{error}</Alert>}
      {!rows && !error && <div className="flex justify-center p-inset-xl"><Spinner /></div>}
      {s && (
        <div className="flex flex-col gap-stack-lg">
          <section aria-label="استفاده‌شده‌ها" className="flex flex-col gap-stack-xs">
            <h3 className="label-md text-text-default">استفاده‌شده‌ها ({formatNumber(s.used.length)})</h3>
            {s.used.length === 0 ? <p className="body-sm text-text-subtle">هنوز چیزی شمرده نشده.</p> : (
              <ul className="flex flex-col gap-stack-xs">
                {s.used.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-default p-inset-sm">
                    <span className="body-md text-text-default">{r.label} <Badge intent="neutral" icon={false}>سطح {formatNumber(r.level)}</Badge></span>
                    <span className="body-sm text-text-subtle">{formatNumber(r.count)} بار · آخرین: {r.lastAt ? formatJalaliDate(r.lastAt) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="بدون استفاده" className="flex flex-col gap-stack-xs">
            <h3 className="label-md text-text-default">هنوز استفاده نشده ({formatNumber(s.unused.length)})</h3>
            <ul className="flex flex-wrap gap-inline-xs">
              {s.unused.map((r) => <li key={r.key}><Badge intent={r.level === 1 ? 'warning' : 'neutral'} icon={false}>{r.label} · سطح {formatNumber(r.level)}</Badge></li>)}
            </ul>
          </section>
        </div>
      )}
    </Dialog>
  );
};
