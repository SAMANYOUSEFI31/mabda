/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import type { ContextChange, ContextObject, Measurement, Metric, MetricDirection } from '../../types';
import { decisionMoments, expectationRows, proposedMeasurements, seriesOf, metricsWithoutRecentNumber, parseNumber } from '../../core/metrics';
import { afterSentence, DIRECTION_FA, expectationSentence, MX, VERDICT_FA } from '../../core/metricsText';
import { MetricChart } from './MetricChart';
import { MetricQuickEntry } from './MetricQuickEntry';
import { Badge, Button, Card, Dialog, EmptyState, Select, TextField, formatJalaliDate, formatNumber } from '../../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  metrics: Metric[];
  measurements: Measurement[];
  objects: ContextObject[];
  changes: ContextChange[];
  onCreate: (input: { name: string; unit: string; direction: MetricDirection; target?: number }) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onRecord: (entries: Array<{ metricId: string; value: number }>) => Promise<void>;
  onCsv: (text: string) => Promise<{ added: number; errors: Array<{ line: number; text: string }> } | undefined>;
  onConfirm: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onOpenObject: (o: ContextObject) => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => formatNumber(n);

/** «شاخص‌ها»: every metric as a line with the decisions' days on it, the quick entry, AI-suggested numbers, expectation versus result. */
export const MetricsDialog: React.FC<Props> = (props) => (props.open ? <Body {...props} /> : null);

const Body: React.FC<Props> = ({ onClose, metrics, measurements, objects, changes, onCreate, onArchive, onRecord, onCsv, onConfirm, onRemove, onOpenObject }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(''); const [unit, setUnit] = useState(''); const [dir, setDir] = useState<MetricDirection>('up'); const [target, setTarget] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const active = metrics.filter((m) => !m.archived);
  const moments = useMemo(() => decisionMoments(objects, changes), [objects, changes]);
  const rows = useMemo(() => expectationRows(objects, metrics, measurements, changes, new Date()), [objects, metrics, measurements, changes]);
  const proposed = proposedMeasurements(measurements);
  const quiet = new Set(metricsWithoutRecentNumber(metrics, measurements, new Date()).map((m) => m.id));
  const targetNum = target.trim() ? parseNumber(target) : undefined;
  const nameOf = (id: string) => metrics.find((m) => m.id === id)?.name ?? id;
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={MX.pageTitle}
      description={MX.pageIntro}
      footer={<Button variant="secondary" onClick={onClose}>بستن</Button>}
    >
      <div className="flex flex-col gap-stack-lg">
        {active.length === 0 && !adding && (
          <EmptyState icon="TrendingUp" title={MX.emptyTitle} description={MX.emptyBody} action={<Button variant="secondary" iconStart="Plus" onClick={() => setAdding(true)}>{MX.newMetric}</Button>} />
        )}

        {active.length > 0 && <MetricQuickEntry metrics={metrics} measurements={measurements} onSubmit={onRecord} onCsv={onCsv} />}

        {proposed.length > 0 && (
          <section className="flex flex-col gap-stack-sm" aria-label={MX.proposedTitle}>
            <h3 className="title text-text-default">{MX.proposedTitle}</h3>
            <p className="body-sm text-text-subtle">{MX.proposedHint}</p>
            <ul className="flex flex-col gap-stack-xs">
              {proposed.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-md">
                  <span className="body-md text-text-default">{nameOf(p.metricId)}: {fmt(p.value)} · {formatJalaliDate(p.at)}{p.note ? ` — ${p.note}` : ''}</span>
                  <span className="flex gap-inline-xs">
                    <Button size="sm" variant="secondary" loading={busy === `c${p.id}`} onClick={() => run(`c${p.id}`, () => onConfirm(p.id))}>{MX.confirm}</Button>
                    <Button size="sm" variant="ghost" loading={busy === `r${p.id}`} onClick={() => run(`r${p.id}`, () => onRemove(p.id))}>{MX.reject}</Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {active.map((m) => {
          const series = seriesOf(m.id, measurements);
          return (
            <Card key={m.id} padding="lg" className="flex flex-col gap-stack-sm" aria-label={m.name}>
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <h3 className="title text-text-default">{m.name}{m.unit ? ` (${m.unit})` : ''}</h3>
                <span className="flex flex-wrap items-center gap-inline-xs">
                  <Badge intent="neutral" icon={false}>{DIRECTION_FA[m.direction]}</Badge>
                  {quiet.has(m.id) && <Badge intent="neutral" icon={false}>{MX.quiet}</Badge>}
                  <Button size="sm" variant="ghost" loading={busy === `a${m.id}`} onClick={() => run(`a${m.id}`, () => onArchive(m.id))}>{MX.archive}</Button>
                </span>
              </div>
              <h4 className="label-md text-text-subtle">{MX.chartTitle}</h4>
              <MetricChart metric={m} series={series} decisions={moments} focusIds={rows.filter((r) => r.expectation.metricId === m.id).map((r) => r.decision.id)} today={today()} />
            </Card>
          );
        })}

        {rows.length > 0 && (
          <section className="flex flex-col gap-stack-sm" aria-label={MX.expectationsTitle}>
            <h3 className="title text-text-default">{MX.expectationsTitle}</h3>
            <p className="body-sm text-text-subtle">{MX.expectationsBody}</p>
            <ul className="flex flex-col gap-stack-sm">
              {rows.map((r) => {
                const m = r.metric;
                return (
                  <li key={r.decision.id} className="flex flex-col gap-stack-xs rounded-control border border-border-default p-inset-lg">
                    <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                      <span className="label-md text-text-default">{r.decision.title}</span>
                      <span className="flex items-center gap-inline-xs">
                        {r.verdict ? <Badge icon={false}>{VERDICT_FA[r.verdict]}</Badge> : <Badge intent="neutral" icon={false}>{r.reading.state === 'due' ? 'موعدش رسیده' : 'باز'}</Badge>}
                        <Button size="sm" variant="ghost" onClick={() => onOpenObject(r.decision)}>باز کن</Button>
                      </span>
                    </div>
                    {m && <p className="body-sm text-text-default">{expectationSentence({ metric: m.name, direction: r.expectation.direction, target: r.expectation.targetValue !== undefined ? fmt(r.expectation.targetValue) : undefined, unit: m.unit, by: formatJalaliDate(r.expectation.by) })}</p>}
                    {m && <p className="body-sm text-text-subtle">{afterSentence({ decision: r.decision.title, before: r.reading.before ? fmt(r.reading.before.value) : undefined, after: r.reading.after ? fmt(r.reading.after.value) : undefined, unit: m.unit })}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {adding ? (
          <section className="flex flex-col gap-stack-sm rounded-control border border-border-default p-inset-lg" aria-label={MX.newMetric}>
            <h3 className="title text-text-default">{MX.newMetric}</h3>
            <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-2">
              <TextField label={MX.name} value={name} onChange={(e) => setName(e.target.value)} />
              <TextField label={MX.unit} value={unit} onChange={(e) => setUnit(e.target.value)} hint="مثلاً تعداد، تومان، درصد" />
              <Select label={MX.directionLabel} value={dir} onChange={(e) => setDir(e.target.value as MetricDirection)} options={[{ value: 'up', label: DIRECTION_FA.up }, { value: 'down', label: DIRECTION_FA.down }]} />
              <TextField label={MX.target} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} error={target.trim() && targetNum === null ? 'عدد معتبر بنویس.' : undefined} />
            </div>
            <div className="flex gap-inline-sm">
              <Button size="sm" variant="secondary" loading={busy === 'new'} disabled={!name.trim() || (!!target.trim() && targetNum === null)} onClick={() => run('new', async () => { await onCreate({ name: name.trim(), unit: unit.trim(), direction: dir, ...(targetNum !== undefined && targetNum !== null ? { target: targetNum } : {}) }); setAdding(false); setName(''); setUnit(''); setTarget(''); })}>{MX.save}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>انصراف</Button>
            </div>
          </section>
        ) : active.length > 0 && <div><Button size="sm" variant="secondary" iconStart="Plus" onClick={() => setAdding(true)}>{MX.newMetric}</Button></div>}
      </div>
    </Dialog>
  );
};
