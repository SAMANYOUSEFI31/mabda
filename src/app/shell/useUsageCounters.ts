/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImpactInfo } from '../../types/state';
import { Contradiction, WorkstreamSpec } from '../../types';
import { calculateReadinessAndGaps } from '../../core/contextEngine';
import { dataApi } from '../../services/dataApi';
import { enabledBuiltInSpecs } from '../../core/specs';
import { impactMessage } from '../../core/impactEngine';
import { track } from '../../services/usage';
import { unresolvedContradictions } from '../../core/contradictionCandidates';
import { useEffect } from 'react';
import type { AppCoreScope } from './useAppCore';
import type { SearchAndFocusScope } from './useSearchAndFocus';

export type UsageCountersScope = ReturnType<typeof useUsageCounters>;

export function useUsageCounters(p: AppCoreScope & SearchAndFocusScope) {
  const { activeTab, aiRequest, contextViewMode, data, isContextModalOpen, isImportOpen, isMemoryOpen, isOnboardingOpen, isPacksOpen, metricsOpen, paletteOpen, patch, selectedSpecId, setSelectedSpecId, toast, weeklyOpen, workspaceContexts } = p;
  // ── local usage counters (a feature KEY only, never data; src/core/usage.ts) ──
  useEffect(() => { track(`view.${activeTab}`); }, [activeTab]);
  useEffect(() => { if (activeTab === 'context') track(`context.${contextViewMode}`); }, [activeTab, contextViewMode]);
  useEffect(() => { if (paletteOpen) track('dialog.search'); }, [paletteOpen]);
  useEffect(() => { if (aiRequest) track('dialog.ai-request'); }, [aiRequest]);
  useEffect(() => { if (isPacksOpen) track('dialog.packs'); }, [isPacksOpen]);
  useEffect(() => { if (isImportOpen) track('dialog.import'); }, [isImportOpen]);
  useEffect(() => { if (metricsOpen) track('dialog.metrics'); }, [metricsOpen]);
  useEffect(() => { if (weeklyOpen) track('dialog.weekly'); }, [weeklyOpen]);
  useEffect(() => { if (isOnboardingOpen) track('dialog.quickstart'); }, [isOnboardingOpen]);
  useEffect(() => { if (isMemoryOpen) track('dialog.memory'); }, [isMemoryOpen]);
  useEffect(() => { if (isContextModalOpen) track('dialog.record'); }, [isContextModalOpen]);
  // the change log grows on every mutation; the server is its single writer, so re-read it when objects/relations move
  useEffect(() => {
    if (!data) return;
    let live = true;
    dataApi.changeLog(data.workspace.id).then((r) => { if (live) patch((d) => ({ ...d, changes: r.changes })); }).catch(() => { /* review hints are optional */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.workspace.id, data?.objects, data?.relationships]);
  const enabledLibrary = enabledBuiltInSpecs(data?.workspace);
  const specs: WorkstreamSpec[] = [...(data?.specs ?? []), ...enabledLibrary];
  // the workstream shown by default belongs to THIS workspace (its own first one), not to the built-in freelance sample
  const firstOwnSpec = data?.specs[0]?.id;
  useEffect(() => { if (data?.workspace.id) setSelectedSpecId(firstOwnSpec ?? enabledLibrary[0]?.id ?? ''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.workspace.id, firstOwnSpec]);
  const contradictions: Contradiction[] = unresolvedContradictions(workspaceContexts, data?.pairJudgments ?? []);
  const attentionSpec = specs.find((s) => s.id === selectedSpecId) ?? specs[0];
  const attentionGaps = attentionSpec
    ? calculateReadinessAndGaps(attentionSpec, workspaceContexts, data?.relationships ?? []).gaps.filter((g) => g.importance === 'required')
    : [];

  const showImpact = (impact: ImpactInfo) => {
    if (impact.count > 0) toast.show({ intent: 'warning', message: impactMessage(impact.count), duration: 7000 });
  };
  return { enabledLibrary, specs, contradictions, attentionSpec, attentionGaps, showImpact };
}
