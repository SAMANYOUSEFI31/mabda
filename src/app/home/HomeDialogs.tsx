/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The dialogs of home: the weekly review. Each lazy dialog loads the first time it is opened. */

import { readinessPerWorkstream } from '../../core/weeklyReview';
import { dataApi } from '../../services/dataApi';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const WeeklyReviewDialog = lazyNamed(() => import('../../components/home/WeeklyReviewDialog'), 'WeeklyReviewDialog');
const LinkMetricDialog = lazyNamed(() => import('../../components/metrics/LinkMetricDialog'), 'LinkMetricDialog');

export type HomeDialogsProps = Pick<ReadyScope, 'attempt' | 'data' | 'deliverables' | 'dueProps' | 'enabledLibrary' | 'goFocus' | 'handleAcceptReview' | 'inheritNotices' | 'linkToTruth' | 'linkingMetricId' | 'markInheritSeen' | 'newLinkedTruth' | 'measurements' | 'metricHandlers' | 'metrics' | 'openContext' | 'patch' | 'setActiveTab' | 'setContextViewMode' | 'setLinkingMetricId' | 'setStatus' | 'setWeeklyOpen' | 'weekly' | 'weeklyOpen' | 'wid' | 'workspaceContexts'>;

export function HomeDialogs({ attempt, data, deliverables, dueProps, enabledLibrary, goFocus, handleAcceptReview, inheritNotices, linkToTruth, linkingMetricId, markInheritSeen, newLinkedTruth, measurements, metricHandlers, metrics, openContext, patch, setActiveTab, setContextViewMode, setLinkingMetricId, setStatus, setWeeklyOpen, weekly, weeklyOpen, wid, workspaceContexts }: HomeDialogsProps) {
  return (
    <>
    <Deferred when={weeklyOpen}><WeeklyReviewDialog
      open={weeklyOpen}
      onClose={() => setWeeklyOpen(false)}
      data={weekly}
      inheritNotices={inheritNotices}
      onSeenInherit={markInheritSeen}
      onOpenSection={(id) => { setWeeklyOpen(false); setActiveTab('context'); setContextViewMode('doc'); goFocus(id); }}
      readiness={readinessPerWorkstream([...(data?.specs ?? []), ...enabledLibrary.filter((s) => !(data?.specs ?? []).some((x) => x.id === s.id))], workspaceContexts, data?.relationships ?? [])}
      objects={workspaceContexts}
      deliverables={deliverables}
      onAcceptReview={async (id) => { await handleAcceptReview(id, true); }}
      onConfirm={async (id) => { await setStatus(id, 'Confirmed'); }}
      onOpenObject={(o) => { setWeeklyOpen(false); openContext(o); }}
      dueProps={dueProps}
      metricsEntry={{ metrics, measurements, objects: workspaceContexts, onSubmit: metricHandlers.onRecord, onCsv: metricHandlers.onCsv }}
      onDone={async () => { const r = await attempt(() => dataApi.weeklyReviewDone(wid)); if (r) patch((d) => ({ ...d, weeklyReviewAt: r.weeklyReviewAt })); }}
    /></Deferred>
    <Deferred when={!!linkingMetricId}><LinkMetricDialog
      metric={metrics.find((m) => m.id === linkingMetricId) ?? null}
      metrics={metrics}
      objects={workspaceContexts}
      onClose={() => setLinkingMetricId('')}
      onLink={linkToTruth}
      onNew={newLinkedTruth}
    /></Deferred>
    </>
  );
}
