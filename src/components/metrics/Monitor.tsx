/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * «پایش»: a number as an option on a truth (docs/product-scope.md, docs/ux/decisions.md §۴۲).
 *  • `MonitorFields`: the optional fields under «جزئیات بیشتر» of the truth form — the same form adds a truth and edits it, so
 *    adding a monitor follows the logic of adding (one task, one place, one shape)
 *  • `MonitorPanel`: on a monitored truth, the last number, its history (the chart IS the number's history) and one field to record
 *    the next one. A legacy proposed number waits here until she confirms it; it is never drawn or packed before that.
 */

import React, { useMemo, useState } from 'react';
import type { ContextChange, ContextObject, Measurement, Metric, MetricCadence, MetricDirection } from '../../types';
import { decisionMoments, expectationRows, parseNumber, proposedMeasurements, seriesOf, textNumberMismatch } from '../../core/metrics';
import { CADENCE_FA, DIRECTION_FA, MX, afterSentence, expectationSentence } from '../../core/metricsText';
import { tehranDay } from '../../core/tehranDate';
import { Button, Select, SegmentedControl, TextField, formatJalaliDate, formatNumber } from '../../ui';
import { MetricChart } from './MetricChart';

/** «وصل کردن» from Home: the number made earlier that the next NEW truth dialog should carry. Read on mount (StrictMode reads an
 *  initializer twice, so reading does not clear it); the dialog clears it when it closes (the same rule as addRequest's text) */
let pendingLink = '';
export const setPendingMonitorLink = (id: string): void => { pendingLink = id; };
export const takePendingMonitorLink = (): string => pendingLink;
export const clearPendingMonitorLink = (): void => { pendingLink = ''; };

export interface MonitorDraft {
  on: boolean;
  /** an earlier number (not linked to any truth yet) she chose to bring onto this truth, with its history */
  linkId: string;
  unit: string;
  cadence: MetricCadence | '';
  direction: MetricDirection;
  target: string;
  first: string;
}

export const monitorDraftOf = (m: Metric | undefined, linkId = ''): MonitorDraft => ({
  on: !!m || !!linkId, linkId, unit: m?.unit ?? '', cadence: m ? m.cadence ?? '' : 'week', direction: m?.direction ?? 'up',
  target: m?.target !== undefined ? formatNumber(m.target, 2) : '', first: '',
});

/** the draft is valid when it is off, or its numbers parse */
export const monitorDraftOk = (d: MonitorDraft): boolean => !d.on || ((!d.target.trim() || parseNumber(d.target) !== null) && (!d.first.trim() || parseNumber(d.first) !== null));

interface FieldsProps {
  value: MonitorDraft;
  onChange: (d: MonitorDraft) => void;
  /** the truth already carries a monitor: the toggle is gone (stopping it is «قطع پایش» in «بیشتر») */
  existing?: boolean;
  /** numbers made before monitoring moved onto truths, not linked yet */
  unlinked?: Metric[];
}

export const MonitorFields: React.FC<FieldsProps> = ({ value: d, onChange, existing, unlinked = [] }) => {
  const set = (p: Partial<MonitorDraft>) => onChange({ ...d, ...p });
  const targetBad = !!d.target.trim() && parseNumber(d.target) === null;
  const firstBad = !!d.first.trim() && parseNumber(d.first) === null;
  return (
    <div className="flex flex-col gap-stack-sm">
      {!existing && <div><Button type="button" size="sm" variant="ghost" iconStart={d.on ? 'ChevronUp' : 'ChevronDown'} aria-expanded={d.on} aria-controls="monitor-fields" onClick={() => set({ on: !d.on })}>{MX.monitorToggle}</Button></div>}
      {(d.on || existing) && (
        <div id="monitor-fields" className="flex flex-col gap-stack-sm rounded-control border border-border-default p-inset-lg" role="group" aria-label={MX.monitorTitle} data-testid="monitor-fields">
          {!existing && unlinked.length > 0 && (
            <Select
              label={MX.linkFrom}
              value={d.linkId}
              onChange={(e) => { const m = unlinked.find((x) => x.id === e.target.value); onChange(m ? { ...monitorDraftOf(m, m.id), on: true } : { ...d, linkId: '' }); }}
              options={[{ value: '', label: MX.linkNone }, ...unlinked.map((m) => ({ value: m.id, label: `${m.name}${m.unit ? ` (${m.unit})` : ''}` }))]}
            />
          )}
          <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2">
            <TextField label={MX.unit} value={d.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} hint={MX.unitHint} />
            <Select label={MX.directionLabel} value={d.direction} onChange={(e) => set({ direction: e.target.value as MetricDirection })} options={[{ value: 'up', label: DIRECTION_FA.up }, { value: 'down', label: DIRECTION_FA.down }]} />
            <TextField label={MX.target} inputMode="decimal" value={d.target} onChange={(e) => set({ target: e.target.value })} error={targetBad ? 'عدد معتبر بنویس.' : undefined} />
            {!existing && !d.linkId && <TextField label={MX.firstValue} inputMode="decimal" value={d.first} onChange={(e) => set({ first: e.target.value })} error={firstBad ? 'عدد معتبر بنویس.' : undefined} />}
          </div>
          <SegmentedControl label={MX.cadence} value={d.cadence || 'none'} onChange={(v) => set({ cadence: v === 'none' ? '' : v as MetricCadence })} items={[{ id: 'week', label: CADENCE_FA.week }, { id: 'month', label: CADENCE_FA.month }, { id: 'none', label: MX.cadenceNone }]} />
          <p className="body-sm text-text-subtle">{d.cadence ? `اگر ${d.cadence === 'week' ? 'یک هفته' : 'یک ماه'} عددی ثبت نشود، در «منتظر تو» آرام یادآوری می‌شود. ` : ''}{MX.monitorHint}</p>
        </div>
      )}
    </div>
  );
};

interface PanelProps {
  metric: Metric;
  measurements: Measurement[];
  /** every object (decisions that expect something of this number are named) and the change log (when each decision was made) */
  objects: ContextObject[];
  changes: Pick<ContextChange, 'objectId' | 'kind' | 'at' | 'after'>[];
  onRecord: (metricId: string, value: number) => Promise<void>;
  onConfirm: (measurementId: string) => Promise<void>;
  onRemove: (measurementId: string) => Promise<void>;
  /** the truth's text as it stands in the editor: when it writes an amount that differs from the last number, a calm line says so */
  content?: string;
  /** «به‌روز کردن متن»: put the replaced text in the editor; saving it is still hers (a draft or «جایگزین کن»), never automatic */
  onUseText?: (text: string) => void;
}

export const MonitorPanel: React.FC<PanelProps> = ({ metric, measurements, objects, changes, onRecord, onConfirm, onRemove, content, onUseText }) => {
  const [raw, setRaw] = useState('');
  const [textSet, setTextSet] = useState(false);
  const [busy, setBusy] = useState('');
  const n = raw.trim() ? parseNumber(raw) : null;
  const series = useMemo(() => seriesOf(metric.id, measurements), [metric.id, measurements]);
  const last = series.at(-1);
  const proposed = proposedMeasurements(measurements).filter((m) => m.metricId === metric.id);
  const moments = useMemo(() => decisionMoments(objects, changes), [objects, changes]);
  const rows = useMemo(() => expectationRows(objects, [metric], measurements, changes, new Date()).filter((r) => r.expectation.metricId === metric.id), [objects, metric, measurements, changes]);
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const mismatch = content !== undefined ? textNumberMismatch(content, metric, last) : null;
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(''); } };
  const record = () => { if (n !== null) void run('rec', async () => { await onRecord(metric.id, n); setRaw(''); }); };
  return (
    <section className="flex flex-col gap-stack-md border-b border-border-subtle pb-inset-lg" aria-label={MX.monitorTitle} data-testid="monitor-panel">
      <div className="flex flex-col gap-stack-xs">
        <h3 className="title text-text-default">{MX.monitorTitle}{metric.cadence ? ` · ${CADENCE_FA[metric.cadence]}` : ''}</h3>
        <p className="body-md text-text-default" data-testid="monitor-last">
          {last ? `${MX.last}: ${formatNumber(last.value, 2)}${unit} · ${formatJalaliDate(last.at)}` : MX.noNumbers}
          {metric.target !== undefined ? ` · ${MX.targetLine}: ${formatNumber(metric.target, 2)}${unit}` : ''}
        </p>
      </div>
      {/* the text and the number say two things: one calm line, no warning colour, nothing on Home (owner decision, §۴۲) */}
      {mismatch && (
        <div className="flex flex-wrap items-center gap-inline-sm" data-testid="monitor-text-mismatch">
          <p className="body-sm text-text-subtle">{MX.textDiffers} («{mismatch.written}»، {MX.last}: {formatNumber(last!.value, 2)}{unit})</p>
          {onUseText && <Button type="button" size="sm" variant="ghost" iconStart="Pencil" onClick={() => { onUseText(mismatch.replaced); setTextSet(true); }}>{MX.updateText}</Button>}
        </div>
      )}
      {!mismatch && textSet && <p className="body-sm text-text-subtle" role="status">{MX.textUpdated}</p>}
      {series.length > 0 && <MetricChart metric={metric} series={series} decisions={moments} focusIds={rows.map((r) => r.decision.id)} today={tehranDay()} />}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-stack-xs" aria-label={MX.expectationsTitle}>
          {rows.map((r) => (
            <li key={r.decision.id} className="body-sm text-text-default">
              {expectationSentence({ metric: metric.name, direction: r.expectation.direction, ...(r.expectation.targetValue !== undefined ? { target: formatNumber(r.expectation.targetValue, 2) } : {}), unit: metric.unit, by: formatJalaliDate(r.expectation.by) })}{' '}
              {afterSentence({ decision: r.decision.title, ...(r.reading.before ? { before: formatNumber(r.reading.before.value, 2) } : {}), ...(r.reading.after ? { after: formatNumber(r.reading.after.value, 2) } : {}), unit: metric.unit })}
            </li>
          ))}
        </ul>
      )}
      {proposed.length > 0 && (
        <ul className="flex flex-col gap-stack-xs" aria-label="عددهای پیشنهادی">
          {proposed.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-inline-sm">
              <span className="body-sm text-text-default">پیشنهاد: {formatNumber(p.value, 2)}{unit} · {formatJalaliDate(p.at)} (تا تأیید نکنی در نمودار و بسته نمی‌آید)</span>
              <span className="flex gap-inline-xs">
                <Button type="button" size="sm" variant="secondary" loading={busy === `c${p.id}`} onClick={() => void run(`c${p.id}`, () => onConfirm(p.id))}>تأیید عدد</Button>
                <Button type="button" size="sm" variant="ghost" loading={busy === `r${p.id}`} onClick={() => void run(`r${p.id}`, () => onRemove(p.id))}>حذف</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-inline-sm">
        <div className="min-w-space-0 flex-1">
          <TextField
            label={`${MX.newValue}${metric.unit ? ` (${metric.unit})` : ''}`}
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            // Enter records the number; it must not submit the truth form around it
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); record(); } }}
            error={raw.trim() && n === null ? 'عدد معتبر بنویس.' : undefined}
          />
        </div>
        <Button type="button" variant="secondary" iconStart="Plus" loading={busy === 'rec'} disabled={n === null} onClick={record} data-testid="monitor-record">{MX.record}</Button>
      </div>
    </section>
  );
};
