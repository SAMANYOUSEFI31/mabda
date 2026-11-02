/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { CostReportRowInfo } from '../types/state';
import { CATEGORY_LABEL } from '../core/costReport';
import { COST_WARN_RATIO } from '../core/entitlements';
import { dataApi, DataApiError } from '../services/dataApi';
import { Alert, Badge, Button, Card, Table, formatNumber, formatUsd } from '../ui';
import { PLANS } from '../core/creditEngine';

const pct = (r: number) => `${formatNumber(Math.round(r * 1000) / 10)}٪`;

/** Manager view (MABDA_ADMIN): what each workspace REALLY costs us this month vs what its plan earns. Your own-key (BYOK) spend is not ours. */
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
  const warned = rows.filter((r) => r.warn);

  return (
    <div className="flex flex-col gap-stack-lg">
      {warned.length > 0 ? (
        <Alert intent="warning" title={`هشدار: ${formatNumber(warned.length)} فضای کاری هزینهٔ ما را بالاتر از ${pct(COST_WARN_RATIO)} قیمت پلن برده‌اند`}>
          {warned.map((w) => `«${w.name}» (${pct(w.ratio)})`).join('، ')}
        </Alert>
      ) : (
        <Alert intent="success">هزینهٔ واقعی ما برای همهٔ فضاهای کاری زیر {pct(COST_WARN_RATIO)} قیمت پلن است (ماه {month}).</Alert>
      )}
      <Table
        caption={`هزینهٔ واقعی ما در برابر قیمت پلن — ${month}`}
        rows={rows as unknown as Array<Record<string, unknown> & CostReportRowInfo>}
        empty="دادهای نیست."
        columns={[
          { key: 'name', label: 'فضای کاری', render: (r) => <span className="flex flex-col"><span className="label-md text-text-default">{r.name}</span><span className="caption text-text-subtle" dir="ltr">{r.userId}</span></span> },
          { key: 'plan', label: 'پلن', render: (r) => PLANS[r.planId].title.split(' ')[0] },
          { key: 'price', label: 'قیمت پلن', numeric: true, render: (r) => formatUsd(r.priceUsd, 0) },
          { key: 'cost', label: 'هزینهٔ واقعی ما', numeric: true, render: (r) => formatUsd(r.ourCostUsd, 4) },
          { key: 'ratio', label: 'سهم از قیمت', numeric: true, render: (r) => (r.warn ? <Badge intent="danger" icon="TriangleAlert">{pct(r.ratio)}</Badge> : <span className="text-text-success">{pct(r.ratio)}</span>) },
          {
            key: 'lines',
            label: 'بابت',
            render: (r) => (
              <span className="flex flex-col gap-stack-xs caption text-text-subtle">
                {r.lines.length === 0 ? '—' : r.lines.map((l) => <span key={l.category}>{CATEGORY_LABEL[l.category]}: {formatUsd(l.costUsd, 4)} ({formatNumber(l.calls)} بار)</span>)}
              </span>
            ),
          },
          { key: 'byok', label: 'هزینهٔ کاربر روی کلید خودش', numeric: true, render: (r) => <span className="text-text-subtle">{formatUsd(r.byokCostUsd, 4)}</span> },
        ]}
      />
      <Card padding="md"><p className="caption text-text-subtle">فقط مصرفی که کلید پلتفرم پرداخته (قضاوت‌ها، پردازش فایل، مربی دانش و در صورت روشن‌بودن AI مدیریت‌شده، خروجی‌ها) هزینهٔ ما حساب می‌شود. هزینه از متادیتای واقعی توکن و قیمت‌های ثبت‌شدهٔ مدل‌ها می‌آید.</p></Card>
    </div>
  );
};
