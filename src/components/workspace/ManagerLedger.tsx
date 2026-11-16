/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { CostReportRowInfo } from '../../types/state';
import { CATEGORY_LABEL } from '../../core/costReport';
import { dataApi, DataApiError } from '../../services/dataApi';
import { Alert, Button, Card, Table, formatNumber, formatUsd } from '../../ui';

/** Manager view (MABDA_ADMIN): what the platform paid for AI per workspace this month (no plan price to compare with). */
export const ManagerLedger: React.FC = () => {
  const [rows, setRows] = useState<CostReportRowInfo[] | null>(null);
  const [month, setMonth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { const r = await dataApi.costReport(); setRows(r.rows); setMonth(r.month); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Alert intent="danger" action={<Button size="sm" variant="secondary" onClick={load}>دوباره</Button>}>{error}</Alert>;
  if (!rows) return <p className="body-sm text-text-subtle">در حال خواندن…</p>;
  const total = rows.reduce((t, r) => t + r.ourCostUsd, 0);

  return (
    <div className="flex flex-col gap-stack-lg">
      <Alert intent="info">هزینهٔ واقعی ما در ماه {month} برای همهٔ فضاها: {formatUsd(total, 4)}.</Alert>
      <Table
        caption={`هزینهٔ واقعی ما — ${month}`}
        rows={rows as unknown as Array<Record<string, unknown> & CostReportRowInfo>}
        empty="دادهای نیست."
        columns={[
          { key: 'name', label: 'فضا', render: (r) => <span className="flex flex-col"><span className="label-md text-text-default">{r.name}</span><span className="caption text-text-subtle" dir="ltr">{r.userId}</span></span> },
          { key: 'cost', label: 'هزینهٔ واقعی ما', numeric: true, render: (r) => formatUsd(r.ourCostUsd, 4) },
          {
            key: 'lines',
            label: 'بابت',
            render: (r) => (
              <span className="flex flex-col gap-stack-xs caption text-text-subtle">
                {r.lines.length === 0 ? '—' : r.lines.map((l) => <span key={l.category}>{CATEGORY_LABEL[l.category]}: {formatUsd(l.costUsd, 4)} ({formatNumber(l.calls)} بار)</span>)}
              </span>
            ),
          },
        ]}
      />
      <Card padding="md"><p className="caption text-text-subtle">هزینه از متادیتای واقعی توکن و قیمت‌های ثبت‌شدهٔ مدل‌ها به دست می‌آید.</p></Card>
    </div>
  );
};
