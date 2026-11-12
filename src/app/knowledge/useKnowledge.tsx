/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { requestAdd } from '../../core/addRequest';
import type { SearchHit } from '../../core/globalSearch';
import { ContextDraft, ContextObject } from '../../types';
import { dataApi } from '../../services/dataApi';
import { track } from '../../services/usage';
import type { AppCoreScope } from '../shell/useAppCore';
import type { SearchAndFocusScope } from '../shell/useSearchAndFocus';
import type { UsageCountersScope } from '../shell/useUsageCounters';

export type KnowledgeScope = ReturnType<typeof useKnowledge>;

export function useKnowledge(p: AppCoreScope & SearchAndFocusScope & UsageCountersScope) {
  const { activeTab, attempt, contextViewMode, data, focusNodeId, goFocus, openContext, openThinkingSpace, patch, revealWhenThere, setActiveTab, setAiRequest, setArchiveOpen, setCanvasReveal, setCompare, setContextViewMode, setFocusAsset, setFocusNotes, setIsBatchOpen, setIsImportOpen, setIsPacksOpen, setMetricsOpen, setThinkingView, setThoughtDialog, showImpact, toast, wid, workspaceContexts } = p;
  // ── Context objects ────────────────────────────────────────────────────────────────────────────
  /** create (no id / unknown id) or edit in place (known id: title/content/type edits bump the version) */
  /** what Enter does on a palette row */
  const handlePick = (hit: SearchHit) => {
    const n = Date.now();
    // looking at the truth canvas: Ctrl/⌘K to an item SHOWS it there (the inspector has «باز کردن»); anywhere else it opens
    if (hit.kind === 'object' && activeTab === 'context' && contextViewMode === 'canvas') { setCanvasReveal({ id: hit.id, n }); return; }
    if (hit.kind === 'object') { const o = workspaceContexts.find((x) => x.id === hit.id); if (o) openContext(o); return; }
    if (hit.kind === 'node') { setActiveTab('context'); setContextViewMode('doc'); goFocus(hit.id); return; }
    if (hit.kind === 'note') {
      const nodeId = (data?.notes ?? []).find((x) => x.id === hit.id)?.nodeId;
      if (!nodeId) return;
      setActiveTab('context'); setContextViewMode('doc'); setFocusNotes({ nodeId, n }); revealWhenThere(`node-${nodeId}`);
      return;
    }
    if (hit.kind === 'asset') { setActiveTab('assets'); setFocusAsset({ id: hit.id, n }); return; }
    if (hit.kind === 'thought') { openThinkingSpace((data?.thoughts ?? []).find((x) => x.id === hit.id)?.nodeId); return; }
    if (hit.kind === 'file') { const nodeId = (data?.files ?? []).find((x) => x.id === hit.id)?.nodeId; setActiveTab('context'); setContextViewMode('doc'); if (nodeId) { goFocus(nodeId); revealWhenThere(`node-${nodeId}`); } return; }
    switch (hit.id) {
      case 'record': openContext(null); break;
      // the same «افزودن» as the top bar (فکر · حقیقت · فایل), after the palette has closed
      case 'thought': setTimeout(() => requestAdd({ kind: 'thought' }), 120); break;
      case 'compare': setCompare({ mode: 'week', scopeNodeId: focusNodeId ?? undefined }); break;
      case 'batch-knowledge': setIsBatchOpen(true); break;
      case 'go-thinking': openThinkingSpace(); break;
      case 'go-archive': setArchiveOpen(true); break;
      case 'go-thinking-canvas': setThinkingView('canvas'); setActiveTab('thinking'); break;
      case 'ai-request': setAiRequest({ scopeNodeId: '' }); break;
      case 'go-home': setActiveTab('home'); break;
      case 'go-context': setActiveTab('context'); setContextViewMode('doc'); break;
      case 'go-doc': setActiveTab('context'); setContextViewMode('read'); break;
      case 'go-canvas': setActiveTab('context'); setContextViewMode('canvas'); break;
      case 'go-assets': setActiveTab('assets'); break;
      case 'go-workstreams': setActiveTab('workstreams'); break;
      case 'metrics': setMetricsOpen(true); break;
      case 'packs': setIsPacksOpen(true); break;
      case 'import': setIsImportOpen(true); break;
      default: break;
    }
  };

  const handleSaveContextObject = async (draft: ContextDraft, opts?: { reason?: string; asDraft?: boolean }): Promise<ContextObject | undefined> => {
    const existing = draft.id ? workspaceContexts.find((o) => o.id === draft.id) : undefined;
    if (existing) {
      const r = await attempt(() => dataApi.updateObject(wid, existing.id, { type: draft.type, title: draft.title, content: draft.content, nodeId: draft.nodeId, status: draft.status, provenance: draft.provenance, slotKey: draft.slotKey, reach: draft.reach ?? null, validUntil: draft.validUntil ?? null, assumption: draft.assumption === true, reviewBy: draft.reviewBy ?? null, record: draft.record ?? null, facets: draft.facets ?? null, examples: draft.examples ?? null, ...(opts?.reason ? { reason: opts.reason } : {}), ...(opts?.asDraft ? { asDraft: true } : {}) }));
      if (!r) return undefined;
      patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === r.object.id ? r.object : o)), stale: r.stale }));
      if (opts?.asDraft) toast.show({ intent: 'success', message: r.object.draft ? 'پیش‌نویس ذخیره شد؛ AI و خروجی‌ها هنوز متن تأییدشده را می‌بینند. در «فضای فکر» تأییدش کن.' : 'پیش‌نویس برداشته شد؛ متن تأییدشده همان است.' });
      else showImpact(r.impact);
      return r.object;
    }
    const r = await attempt(() => dataApi.createObject(wid, { type: draft.type, status: draft.status, provenance: draft.provenance, title: draft.title, content: draft.content, nodeId: draft.nodeId, source: draft.source, slotKey: draft.slotKey, reach: draft.reach, validUntil: draft.validUntil, assumption: draft.assumption, reviewBy: draft.reviewBy, record: draft.record, facets: draft.facets, examples: draft.examples }));
    if (!r) return undefined;
    patch((d) => ({ ...d, objects: [r.object, ...d.objects] }));
    track('action.record');
    toast.show({ intent: 'success', message: 'ذخیره شد.', duration: 7000, action: { label: 'یکی دیگر', onClick: () => openContext(null, draft.nodeId) } });
    return r.object;
  };

  /** one targeted edit with an optional reason (a Change): promote, assumption review, … */
  const handlePatchObject = async (id: string, p: Parameters<typeof dataApi.updateObject>[2]) => {
    const r = await attempt(() => dataApi.updateObject(wid, id, p));
    if (!r) return undefined;
    patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? r.object : o)), stale: r.stale }));
    showImpact(r.impact);
    return r.object;
  };
  return { handlePick, handleSaveContextObject, handlePatchObject };
}
