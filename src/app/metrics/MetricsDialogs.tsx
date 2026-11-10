/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of metrics: the metrics dialog. Each lazy dialog loads the first time it is opened. */

import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const MetricsDialog = lazyNamed(() => import('../../components/metrics/MetricsDialog'), 'MetricsDialog');

export type MetricsDialogsProps = Pick<ReadyScope, 'data' | 'measurements' | 'metricHandlers' | 'metrics' | 'metricsOpen' | 'openContext' | 'setMetricsOpen' | 'workspaceContexts'>;

export function MetricsDialogs({ data, measurements, metricHandlers, metrics, metricsOpen, openContext, setMetricsOpen, workspaceContexts }: MetricsDialogsProps) {
  return (
    <>
    <Deferred when={metricsOpen}><MetricsDialog
      open={metricsOpen}
      onClose={() => setMetricsOpen(false)}
      metrics={metrics}
      measurements={measurements}
      objects={workspaceContexts}
      changes={data?.changes ?? []}
      {...metricHandlers}
      onOpenObject={(o) => { setMetricsOpen(false); openContext(o); }}
    /></Deferred>
    </>
  );
}
