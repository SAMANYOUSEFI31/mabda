/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { Measurement, Metric } from '../types';
import type { DecisionMoment } from '../core/metrics';
import { MX } from '../core/metricsText';
import { formatJalaliDate, formatNumber } from '../ui';

const W = 600;
const H = 180;
const PAD = 12;
const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

interface Props {
  metric: Metric;
  /** confirmed numbers, oldest first */
  series: Measurement[];
  /** decisions from the Change table; only those inside the drawn time range are marked */
  decisions: DecisionMoment[];
  today: string;
}

/**
 * One line, one vertical dashed line per decision (the day it was recorded), a dashed target line. Time runs from the
 * start side (the right, RTL) to the end side. The chart only shows ORDER IN TIME — the caption says so.
 */
export const MetricChart: React.FC<Props> = ({ metric, series, decisions, today }) => {
  if (series.length === 0) return <p className="body-sm text-text-subtle">{MX.noNumbers}</p>;
  const t0 = t(series[0].at);
  const t1 = Math.max(t(series[series.length - 1].at), t(today), t0 + DAY);
  const inRange = decisions.filter((d) => t(d.at) >= t0 && t(d.at) <= t1);
  const values = [...series.map((s) => s.value), ...(metric.target !== undefined ? [metric.target] : [])];
  const lo = Math.min(...values); const hi = Math.max(...values);
  const span = hi - lo || 1;
  const frac = (ms: number) => (ms - t0) / (t1 - t0);
  const x = (ms: number) => W - PAD - frac(ms) * (W - 2 * PAD); // RTL: oldest on the start (right) side
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const pts = series.map((s) => `${x(t(s.at)).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];
  const unit = metric.unit ? ` ${metric.unit}` : '';
  return (
    <figure className="flex flex-col gap-stack-xs">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${metric.name}: ${formatNumber(series.length)} عدد؛ آخرین ${formatNumber(last.value)}${unit} در ${formatJalaliDate(last.at)}`}>
          {metric.target !== undefined && <line x1={PAD} x2={W - PAD} y1={y(metric.target)} y2={y(metric.target)} className="stroke-border-success" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
          {inRange.map((d) => <line key={d.id} x1={x(t(d.at))} x2={x(t(d.at))} y1={PAD} y2={H - PAD} className="stroke-border-info" strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />)}
          <polyline points={pts} fill="none" className="stroke-border-bold" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {series.map((s) => <circle key={s.id} cx={x(t(s.at))} cy={y(s.value)} r={3.5} className="fill-border-bold" />)}
        </svg>
      </div>
      <figcaption className="body-sm text-text-subtle">
        {MX.chartNote}
        {metric.target !== undefined && <> · {MX.targetLine}: {formatNumber(metric.target)}{unit}</>}
        {inRange.length > 0 && <> · {formatNumber(inRange.length)} تصمیم روی خط زمان</>}
      </figcaption>
      {inRange.length > 0 && (
        <ol className="flex flex-col gap-stack-xs">
          {inRange.map((d) => <li key={d.id} className="body-sm text-text-default">{formatJalaliDate(d.at)} · «{d.title}»</li>)}
        </ol>
      )}
    </figure>
  );
};
