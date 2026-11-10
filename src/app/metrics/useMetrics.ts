/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MetricDirection } from '../../types';
import type { MetricsBundle } from '../../services/dataApi';
import { dataApi } from '../../services/dataApi';
import { formatNumber } from '../../ui';
import type { AppCoreScope } from '../shell/useAppCore';

export type MetricsScope = ReturnType<typeof useMetrics>;

export function useMetrics(p: AppCoreScope) {
  const { attempt, patch, toast, wid } = p;
  // ── metrics («شاخص‌ها»): recorded results next to decisions; never a claim about cause ──
  const applyMetrics = (r: MetricsBundle) => patch((d) => ({ ...d, metrics: r.metrics, measurements: r.measurements }));
  const metricHandlers = {
    onCreate: async (m: { name: string; unit: string; direction: MetricDirection; target?: number }) => { const r = await attempt(() => dataApi.createMetric(wid, m)); if (r) applyMetrics(r); },
    onArchive: async (id: string) => { const r = await attempt(() => dataApi.archiveMetric(wid, id)); if (r) applyMetrics(r); },
    onRecord: async (entries: Array<{ metricId: string; value: number }>) => {
      const r = await attempt(() => dataApi.addMeasurements(wid, entries));
      if (r) { applyMetrics(r); toast.show({ intent: 'success', message: `${formatNumber(entries.length)} عدد ثبت شد.` }); }
    },
    onCsv: async (text: string) => {
      const r = await attempt(() => dataApi.addMeasurementsCsv(wid, text));
      if (!r) return undefined;
      applyMetrics(r);
      toast.show({ intent: r.errors.length ? 'warning' : 'success', message: r.errors.length ? `${formatNumber(r.added)} عدد ثبت شد؛ ${formatNumber(r.errors.length)} خط خوانده نشد.` : `${formatNumber(r.added)} عدد ثبت شد.` });
      return { added: r.added, errors: r.errors };
    },
    onConfirm: async (id: string) => { const r = await attempt(() => dataApi.confirmMeasurement(wid, id)); if (r) applyMetrics(r); },
    onRemove: async (id: string) => { const r = await attempt(() => dataApi.removeMeasurement(wid, id)); if (r) applyMetrics(r); },
  };
  return { metricHandlers };
}
