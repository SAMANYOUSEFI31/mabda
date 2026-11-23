/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Metric, MetricDirection } from '../../types';
import type { MonitorDraft } from '../../components/metrics/Monitor';
import { parseNumber } from '../../core/metrics';
import type { MetricsBundle } from '../../services/dataApi';
import { dataApi } from '../../services/dataApi';
import { formatNumber } from '../../ui';
import type { AppCoreScope } from '../shell/useAppCore';

export type MetricsScope = ReturnType<typeof useMetrics>;

export function useMetrics(p: AppCoreScope) {
  const { attempt, patch, toast, wid } = p;
  // ── metrics («شاخص‌ها»): recorded results next to decisions; never a claim about cause ──
  const applyMetrics = (r: MetricsBundle) => patch((d) => ({ ...d, metrics: r.metrics, measurements: r.measurements, ...(r.stale ? { stale: r.stale } : {}) }));
  const metricHandlers = {
    onCreate: async (m: { name: string; unit: string; direction: MetricDirection; target?: number }) => { const r = await attempt(() => dataApi.createMetric(wid, m)); if (r) applyMetrics(r); },
    onArchive: async (id: string) => { const r = await attempt(() => dataApi.archiveMetric(wid, id)); if (r) applyMetrics(r); },
    onRecord: async (entries: Array<{ metricId: string; value: number }>) => {
      const r = await attempt(() => dataApi.addMeasurements(wid, entries));
      if (r) { applyMetrics(r); toast.show({ intent: 'success', message: `${formatNumber(entries.length)} عدد ثبت شد.` }); }
      return !!r;
    },
    onCsv: async (text: string) => {
      const r = await attempt(() => dataApi.addMeasurementsCsv(wid, text));
      if (!r) return undefined;
      applyMetrics(r);
      toast.show({ intent: r.errors.length ? 'warning' : 'success', message: r.errors.length ? `${formatNumber(r.added)} عدد ثبت شد؛ ${formatNumber(r.errors.length)} خط خوانده نشد.` : `${formatNumber(r.added)} عدد ثبت شد.` });
      return { added: r.added, errors: r.errors };
    },
    // «پایش» on a truth: create it, change it, or bring a number made earlier onto this truth (its history comes with it)
    onSaveMonitor: async (objectId: string, d: MonitorDraft, current?: Metric) => {
      const target = d.target.trim() ? parseNumber(d.target) ?? undefined : undefined;
      const fields = { unit: d.unit.trim(), direction: d.direction, cadence: d.cadence || undefined };
      if (current) {
        if (current.unit === fields.unit && current.direction === fields.direction && (current.cadence ?? undefined) === fields.cadence && current.target === target) return;
        const r = await attempt(() => dataApi.updateMetric(wid, current.id, { ...fields, cadence: fields.cadence ?? null, target: target ?? null }));
        if (r) applyMetrics(r);
        return;
      }
      if (!d.on) return;
      const r = d.linkId
        ? await attempt(() => dataApi.updateMetric(wid, d.linkId, { ...fields, cadence: fields.cadence ?? null, target: target ?? null, objectId }))
        : await attempt(() => dataApi.createMetric(wid, { ...fields, ...(target !== undefined ? { target } : {}), objectId }));
      if (!r) return;
      applyMetrics(r);
      const first = d.first.trim() ? parseNumber(d.first) : null;
      if (first !== null && !d.linkId) { const m = await attempt(() => dataApi.addMeasurements(wid, [{ metricId: r.metric.id, value: first }])); if (m) applyMetrics(m); }
      toast.show({ intent: 'success', message: d.linkId ? 'عددهای قبلی به این حقیقت وصل شد.' : 'پایش این حقیقت روشن شد.' });
    },
    onStopMonitor: async (id: string) => { const r = await attempt(() => dataApi.archiveMetric(wid, id)); if (r) { applyMetrics(r); toast.show({ intent: 'success', message: 'پایش قطع شد؛ عددهای ثبت‌شده می‌مانند.' }); } },
    onRecordOne: async (metricId: string, value: number) => { const r = await attempt(() => dataApi.addMeasurements(wid, [{ metricId, value }])); if (r) { applyMetrics(r); toast.show({ intent: 'success', message: 'عدد ثبت شد.' }); } },
    onConfirm: async (id: string) => { const r = await attempt(() => dataApi.confirmMeasurement(wid, id)); if (r) applyMetrics(r); },
    onRemove: async (id: string) => { const r = await attempt(() => dataApi.removeMeasurement(wid, id)); if (r) applyMetrics(r); },
  };
  return { metricHandlers };
}
