/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PageAction } from '../../components/shell/TopStatusBar';
import { Button, Icon, formatNumber } from '../../ui';
import { PageSuspense, lazyNamed } from '../lazy';
import { ContextObject, GeneratedDeliverable, LedgerEntry, WorkstreamSpec } from '../../types';
import { WIPE_WORDS } from '../../components/workspace/wipeWords';
import { acceptanceSentence, outputsUsing } from '../../core/weeklyReview';
import { dataApi } from '../../services/dataApi';
import { pathTo } from '../../core/nodeFocus';
import { thinkingSpace } from '../../core/thinkingSpace';
import { track } from '../../services/usage';
import { useMemo, useState } from 'react';
import type { AppCoreScope } from './useAppCore';
import type { NotesScope } from '../thinking/useNotes';
import type { SearchAndFocusScope } from './useSearchAndFocus';
import type { BoardsScope } from '../canvas/useBoards';
import type { UsageCountersScope } from './useUsageCounters';

/** the canvas is a separate chunk: loaded the first time a canvas is opened */
const ContextCanvas = lazyNamed(() => import('../../components/canvas/ContextCanvas'), 'ContextCanvas');

export type RemovalAndDialogsScope = ReturnType<typeof useRemovalAndDialogs>;

export function useRemovalAndDialogs(p: AppCoreScope & NotesScope & SearchAndFocusScope & BoardsScope & UsageCountersScope) {
  const { activeTab, askDeleteNote, attempt, canvasReveal, currentWorkspace, data, deliverables, focusScope, focusSection, goFocus, handleAcceptReview, handleAutoLayout, handleCanvasConnect, handleCanvasMove, handleFreeNoteCreate, handleFreeNoteMove, handleNoteToKnowledge, handlePlaceObject, handleSetDependencies, handleUnplaceObject, handleUpdateNote, nodes, openContext, openThinkingSpace, patch, previewNonce, previewTruth, reviewIdSet, setActiveTab, setCurrentWorkspaceId, setData, setEditingSpec, setIsCustomSpecModalOpen, setStatus, setWs, showImpact, staleIdSet, startSectionFromNote, toast, wid, workspaceContexts, workspaces } = p;
  const [demoDelete, setDemoDelete] = useState(false);
  const handleArchiveWorkspace = async () => {
    const ws0 = currentWorkspace;
    const r = await attempt(() => dataApi.archiveWorkspace(wid, true));
    if (!r || !ws0) return;
    setWs(r.workspaces);
    toast.show({ intent: 'success', message: `فضای «${ws0.name}» بایگانی شد؛ همهٔ داده‌اش مانده است.`, duration: 10000, action: { label: 'برگرداندن', onClick: () => { void dataApi.archiveWorkspace(ws0.id, false).then((x) => { setWs(x.workspaces); setCurrentWorkspaceId(ws0.id); }); } } });
  };
  const handleDeleteWorkspace = async () => {
    const ws0 = currentWorkspace;
    if (!ws0) return;
    const r = await attempt(() => dataApi.deleteWorkspace(ws0.id, ws0.name));
    if (!r) return;
    setWs(r.workspaces);
    toast.show({ intent: 'success', message: `فضای «${ws0.name}» برای همیشه حذف شد.` });
  };
  /** «حذف همهٔ داده‌ها»: the server empties every table of this user; the browser forgets its local preferences too. */
  const handleDeleteEverything = async () => {
    const r = await attempt(() => dataApi.deleteAccountData(WIPE_WORDS));
    if (!r) return;
    try { Object.keys(localStorage).filter((k) => k.startsWith('mabda')).forEach((k) => localStorage.removeItem(k)); } catch { /* optional */ }
    setData(null); setWs(r.workspaces); setCurrentWorkspaceId('');
    toast.show({ intent: 'success', message: 'همهٔ داده‌ها برای همیشه پاک شد. برنامه خالی است.' });
  };
  /** an output: «بایگانی» comes back; «حذف» is for the throwaway — the page keeps a copy and offers «برگرداندن» */
  const handleArchiveDeliverable = async (d: GeneratedDeliverable) => {
    const r = await attempt(() => dataApi.archiveDeliverable(wid, d.id));
    if (!r) return;
    patch((x) => ({ ...x, deliverables: r.deliverables, stale: r.stale }));
    toast.show({ intent: 'success', message: `«${d.title}» بایگانی شد؛ از فهرست و از شمار «قدیمی» بیرون رفت.`, duration: 10000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.restoreDeliverable(wid, d.id)).then((u) => { if (u) patch((x) => ({ ...x, deliverables: u.deliverables, stale: u.stale })); }); } } });
  };
  const handleDeleteDeliverable = async (d: GeneratedDeliverable) => {
    const r = await attempt(() => dataApi.deleteDeliverable(wid, d.id));
    if (!r) return;
    patch((x) => ({ ...x, deliverables: r.deliverables, stale: r.stale }));
    toast.show({ intent: 'success', message: `«${d.title}» حذف شد.`, duration: 10000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.saveDeliverable(wid, d)).then((u) => { if (u) patch((x) => ({ ...x, deliverables: [u.deliverable, ...x.deliverables.filter((y) => y.id !== d.id)], stale: u.stale })); }); } } });
  };
  const handleDeleteDemo = async () => {
    const demo = workspaces.find((w) => w.isDemo);
    if (!demo) return;
    const r = await attempt(() => dataApi.deleteWorkspace(demo.id));
    if (!r) return;
    setWs(r.workspaces); setDemoDelete(false);
    toast.show({ intent: 'success', message: 'فضای نمونه پاک شد. هر وقت خواستی از منوی حساب دوباره ساخته می‌شود.' });
  };

  /** create or replace a custom spec (the server enforces Pro+ and refuses dependency cycles) */
  const addSpec = async (spec: WorkstreamSpec) => {
    const r = await attempt(() => dataApi.saveSpec(wid, spec));
    if (r) patch((d) => ({ ...d, specs: d.specs.some((x) => x.id === spec.id) ? d.specs.map((x) => (x.id === spec.id ? spec : x)) : [spec, ...d.specs] }));
    return !!r;
  };
  const openSpecEditor = (spec?: WorkstreamSpec) => { setEditingSpec(spec); setIsCustomSpecModalOpen(true); };

  const handleJudge = async (objectIds: string[]) => {
    try {
      const r = await dataApi.judgeAmbiguity(wid, objectIds);
      patch((d) => ({ ...d, judgments: r.judgments, ledger: r.ledger }));
    } catch { /* the Gap panel keeps working without AI judgments; the user's own «Needs Review» still counts */ }
  };

  /** Context Coach proposals are saved as PROPOSED objects only */
  const handleSaveProposals = async (ps: Array<{ type: ContextObject['type']; title: string; content: string; nodeId: string }>) => {
    const out: ContextObject[] = [];
    for (const p of ps) {
      const r = await attempt(() => dataApi.createObject(wid, { type: p.type, status: 'Proposed', provenance: 'AI Suggested', title: p.title, content: p.content, nodeId: p.nodeId, source: { kind: 'coach', at: new Date().toISOString() } }));
      if (r) out.push(r.object);
    }
    if (out.length) patch((d) => ({ ...d, objects: [...out.slice().reverse(), ...d.objects] }));
  };
  /** inbox: confirm / reject a suggestion (confirming is the ONLY way an AI suggestion becomes a fact) */
  const handleAcceptProposal = async (o: ContextObject, reason?: string) => {
    track('action.accept-proposal');
    const impact = await setStatus(o.id, 'Confirmed', reason);
    if (impact) { showImpact(impact); toast.show({ intent: 'success', message: `«${o.title}» تأیید شد و حالا واقعیت است. ${acceptanceSentence(o.title, outputsUsing(o.id, deliverables), formatNumber)}`.trim() }); }
  };
  const handleRejectProposal = async (o: ContextObject, reason?: string) => { await setStatus(o.id, 'Archived', reason); };
  /** accept a proposal that takes the place of an existing object (that one becomes Superseded, never deleted) */
  const handleReplaceWithProposal = async (o: ContextObject, replacesId: string, reason?: string) => {
    const r = await attempt(() => dataApi.replaceWith(wid, o.id, { replacesId, ...(reason ? { reason } : {}) }));
    if (!r) return;
    patch((d) => ({ ...d, objects: r.objects, relationships: r.relationships, changes: r.changes, stale: r.stale }));
    showImpact(r.impact);
    toast.show({ intent: 'success', message: `«${o.title}» جای مورد قبلی نشست؛ قبلی در تاریخچه می‌ماند.` });
  };
  /** a block of a pasted answer → a PROPOSED object (never Confirmed) */
  const handleProposeFromImport = async (p: { type: ContextObject['type']; title: string; content: string; nodeId: string; source: NonNullable<ContextObject['source']> }) => {
    const r = await attempt(() => dataApi.createObject(wid, { type: p.type, status: 'Proposed', provenance: 'AI Suggested', title: p.title, content: p.content, nodeId: p.nodeId, source: p.source }));
    if (r) patch((d) => ({ ...d, objects: [r.object, ...d.objects] }));
    return !!r;
  };
  const handleProposeBatch = async (items: Array<{ type: ContextObject['type']; title: string; content: string; nodeId: string }>) => {
    let done = 0;
    for (const it of items) {
      const r = await attempt(() => dataApi.createObject(wid, { type: it.type, status: 'Proposed', provenance: 'User Input', title: it.title, content: it.content, nodeId: it.nodeId, source: { kind: 'paste', at: new Date().toISOString() } }));
      if (r) { patch((d) => ({ ...d, objects: [r.object, ...d.objects] })); done += 1; }
    }
    if (done) toast.show({ intent: 'success', message: `${formatNumber(done)} پیشنهاد در «فکر» منتظر تأیید توست.` });
  };
  /** an AI answer that UPDATES existing knowledge: a draft on it (asDraft) — the text she approved stays until she approves this */
  const handleDraftFromImport = async (objectId: string, p: { title: string; content: string; reason: string }) => {
    const r = await attempt(() => dataApi.updateObject(wid, objectId, { title: p.title, content: p.content, reason: p.reason, asDraft: true }));
    if (!r) return false;
    patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === objectId ? r.object : o)), stale: r.stale }));
    return true;
  };
  const setLedger = (ledger: LedgerEntry[]) => patch((d) => ({ ...d, ledger }));

  /** what is waiting for her in the thinking space: suggestions, drafts, open thoughts (the badge of «فکر») */
  const thinkingBadge = useMemo(() => {
    if (!data) return 0;
    const v = thinkingSpace({ objects: workspaceContexts, notes: data.notes, nodes });
    return v.waiting.length + v.thoughts.length;
  }, [data, workspaceContexts, nodes]);

  const scopedObjects = focusScope ? workspaceContexts.filter((o) => focusScope.has(o.nodeId)) : workspaceContexts;
  const scopedIds = new Set(scopedObjects.map((o) => o.id));
  const scopedNotes = focusScope ? (data?.notes ?? []).filter((n) => focusScope.has(n.nodeId)) : (data?.notes ?? []);
  const scopedDeliverables = focusScope ? deliverables.filter((d) => d.usedContext.some((u) => scopedIds.has(u.id))) : deliverables;
  /** shown by EVERY view that is limited to the section we are inside (thinking list, both canvases): where we are, and a one-tap way out */
  const scopeChip = focusSection && (
    <div role="status" className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control border border-border-selected bg-bg-selected px-inset-md py-inset-xs" data-testid="focus-scope-chip">
      <span className="body-sm flex min-w-space-0 items-center gap-inline-xs text-text-default"><Icon name="FolderTree" size="md" className="shrink-0 text-icon-subtle" /><span>داخل بخش «{pathTo(nodes, focusSection.id).map((c) => c.label).join(' › ')}»؛ فقط همین بخش و زیربخش‌هایش دیده می‌شود.</span></span>
      <Button size="sm" variant="secondary" iconStart="ArrowRight" onClick={() => goFocus(null)}>بیرون بیا</Button>
    </div>
  );
  const renderCanvas = (mode: 'truth' | 'thinking') => (
    <div className="flex flex-col gap-stack-sm">
    {scopeChip}
    <PageSuspense minHeight="75vh"><ContextCanvas
      mode={mode}
      previewNonce={mode === 'truth' ? previewNonce : undefined}
      lineageObjects={workspaceContexts}
      revealObject={mode === 'truth' ? canvasReveal ?? undefined : undefined}
      onPreviewTruth={mode === 'thinking' ? previewTruth : undefined}
      onNoteToSection={mode === 'thinking' ? startSectionFromNote : undefined}
              nodes={nodes}
              objects={scopedObjects}
              relationships={data?.relationships ?? []}
              deliverables={scopedDeliverables}
              notes={scopedNotes}
              canvas={data?.canvas ?? { decisions: [], free: [] }}
              reviewIds={reviewIdSet}
              staleAssetIds={staleIdSet}
              onMove={handleCanvasMove}
              onConnect={handleCanvasConnect}
              onOverride={async (byId, targetId, reason) => {
                const r = await attempt(() => dataApi.setOverride(wid, byId, targetId, reason ?? ''));
                if (r) patch((d) => ({ ...d, relationships: r.relationships, changes: r.changes }));
              }}
              onRemoveOverride={async (byId, targetId) => {
                const r = await attempt(() => dataApi.removeOverride(wid, byId, targetId));
                if (r) patch((d) => ({ ...d, relationships: r.relationships, changes: r.changes }));
              }}
              onOpenNote={(_noteId, nodeId) => openThinkingSpace(nodeId)}
              onMoveNoteNode={async (noteId, nodeId) => {
                const r = await attempt(() => dataApi.noteMoveNode(wid, noteId, nodeId));
                if (r) patch((d) => ({ ...d, notes: d.notes.map((n) => (n.id === noteId ? r.note : n)), thoughts: r.thoughts }));
              }}
              onSetDependencies={handleSetDependencies}
              onCreateNote={handleFreeNoteCreate}
              onMoveNote={handleFreeNoteMove}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={askDeleteNote}
              onNoteToKnowledge={handleNoteToKnowledge}
              onPlaceObject={handlePlaceObject}
              onUnplaceObject={handleUnplaceObject}
              onAutoLayout={handleAutoLayout}
              onAcceptReview={(id) => handleAcceptReview(id, true)}
              onOpenObject={(obj) => openContext(obj)}
              onOpenAssets={() => setActiveTab('assets')}
              onAddKnowledge={() => openContext(null)}
  /></PageSuspense>
    </div>
  );

  /** the one action in the top bar that fits the current page */
  const pageAction: PageAction | undefined =
    activeTab === 'context' || activeTab === 'home' ? { label: 'ثبت دانش', icon: 'Plus', onClick: () => openContext(null) }
    : activeTab === 'workstreams' ? { label: 'جریان سفارشی', icon: 'Plus', onClick: () => openSpecEditor() }
    : undefined;
  return { demoDelete, setDemoDelete, handleArchiveWorkspace, handleDeleteWorkspace, handleDeleteEverything, handleArchiveDeliverable, handleDeleteDeliverable, handleDeleteDemo, addSpec, openSpecEditor, handleJudge, handleSaveProposals, handleAcceptProposal, handleRejectProposal, handleReplaceWithProposal, handleProposeFromImport, handleProposeBatch, handleDraftFromImport, setLedger, thinkingBadge, scopeChip, renderCanvas, pageAction };
}
