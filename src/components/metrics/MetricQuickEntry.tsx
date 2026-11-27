/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { ContextObject, Measurement, Metric } from '../../types';
import { latestOf, metricLabel, parseNumber } from '../../core/metrics';
import { MX } from '../../core/metricsText';
import { Alert, Button, TextField, Textarea, formatJalaliDate, formatNumber } from '../../ui';

interface Props {
  metrics: Metric[];
  measurements: Measurement[];
  /** a monitor is called by its truth's title */
  objects?: Pick<ContextObject, 'id' | 'title'>[];
  onSubmit: (entries: Array<{ metricId: string; value: number }>) => Promise<void | boolean>;
  onCsv: (text: string) => Promise<{ added: number; errors: Array<{ line: number; text: string }> } | undefined>;
  /** the typed numbers, when a parent must keep them (a step-by-step dialog that unmounts this section between steps) */
  values?: Record<string, string>;
  onValuesChange?: (v: Record<string, string>) => void;
}

const REASON_FA: Record<string, string> = { unknown_metric: 'عددی با این نام پایش نمی‌شود', bad_value: 'عدد خوانده نشد', bad_date: 'تاریخ خوانده نشد', too_few: 'دست‌کم نام و عدد لازم است' };

/** One number field per monitored truth (and per number not linked to one yet) (empty = nothing to say this week) and an optional CSV paste. Recording is never required. */
export const MetricQuickEntry: React.FC<Props> = ({ metrics, measurements, objects = [], onSubmit, onCsv, values, onValuesChange }) => {
  const active = metrics.filter((m) => !m.archived);
  const [own, setOwn] = useState<Record<string, string>>({});
  const vals = values ?? own;
  const setVals = (f: (v: Record<string, string>) => Record<string, string>) => { const next = f(vals); if (onValuesChange) onValuesChange(next); else setOwn(next); };
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [csvErrors, setCsvErrors] = useState<Array<{ line: number; text: string; reason?: string }>>([]);
  const parsed = active.map((m) => ({ m, raw: (vals[m.id] ?? '').trim(), n: parseNumber(vals[m.id] ?? '') })).filter((x) => x.raw);
  const bad = parsed.filter((x) => x.n === null);
  const ready = parsed.filter((x) => x.n !== null);
  if (active.length === 0) return null;
  const submit = async () => {
    setBusy(true);
    try { await onSubmit(ready.map((x) => ({ metricId: x.m.id, value: x.n! }))); setVals(() => ({})); } finally { setBusy(false); }
  };
  const applyCsv = async () => {
    setBusy(true);
    try {
      const r = await onCsv(csv);
      if (r) { setCsvErrors(r.errors as never); if (r.errors.length === 0) { setCsv(''); setCsvOpen(false); } else setCsv(r.errors.map((e) => e.text).join('\n')); }
    } finally { setBusy(false); }
  };
  return (
    <section className="flex flex-col gap-stack-sm" aria-label={MX.thisWeek}>
      <div className="flex flex-col gap-stack-xs">
        <h3 className="title text-text-default">{MX.thisWeek}</h3>
        <p className="body-sm text-text-subtle">{MX.thisWeekHint}</p>
      </div>
      <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2">
        {active.map((m) => {
          const last = latestOf(m.id, measurements);
          return (
            <TextField personal
              key={m.id}
              label={`${metricLabel(m, objects)}${m.unit ? ` (${m.unit})` : ''}`}
              inputMode="decimal"
              value={vals[m.id] ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, [m.id]: e.target.value }))}
              hint={last ? `آخرین: ${formatNumber(last.value, 2)} · ${formatJalaliDate(last.at)}` : undefined}
              error={bad.some((b) => b.m.id === m.id) ? 'عدد معتبر بنویس.' : undefined}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-inline-sm">
        <Button size="sm" variant="secondary" loading={busy} disabled={ready.length === 0 || bad.length > 0} onClick={submit}>{MX.recordAll}{ready.length ? ` (${formatNumber(ready.length)})` : ''}</Button>
        <Button size="sm" variant="ghost" iconStart={csvOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={csvOpen} onClick={() => setCsvOpen((v) => !v)}>{MX.pasteCsv}</Button>
      </div>
      {csvOpen && (
        <div className="flex flex-col gap-stack-xs">
          <Textarea label={MX.pasteCsv} rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} hint={MX.csvHint} />
          {csvErrors.length > 0 && (
            <Alert intent="warning" title="این خطوط ثبت نشدند">
              <ul>{csvErrors.map((e) => <li key={e.line}>خط {formatNumber(e.line)}: {REASON_FA[e.reason ?? ''] ?? 'خوانده نشد'}</li>)}</ul>
            </Alert>
          )}
          <div><Button size="sm" variant="secondary" loading={busy} disabled={!csv.trim()} onClick={applyCsv}>{MX.csvApply}</Button></div>
        </div>
      )}
    </section>
  );
};
