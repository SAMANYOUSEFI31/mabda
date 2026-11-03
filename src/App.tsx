/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatSession,
  ContextDraft,
  ContextObject,
  Contradiction,
  GeneratedDeliverable,
  LedgerEntry,
  PlanId,
  Workspace,
} from './types';
import type { WorkspaceState, ImpactInfo } from './types/state';
import { calculateReadinessAndGaps } from './core/contextEngine';
import { impactMessage } from './core/impactEngine';
import { AppNavigation } from './components/AppNavigation';
import { TopStatusBar } from './components/TopStatusBar';
import type { PageAction } from './components/TopStatusBar';
import { ContradictionPanel } from './components/ContradictionPanel';
import { unresolvedContradictions } from './core/contradictionCandidates';
import { JUDGE_SETTLE_MS, baselineOf, changedSince, pairsAfterChange, type VersionBaseline } from './core/judgePolicy';
import { can, entitlementsOf } from './core/entitlements';
import { ContextTreeDocView } from './components/ContextTreeDocView';
import { ContextCanvas } from './components/ContextCanvas';
import { ContextTableView } from './components/ContextTableView';
import { DocReader } from './components/DocReader';
import { AttentionPanel } from './components/AttentionPanel';
import { NodeReaderDialog } from './components/NodeReaderDialog';
import { NodeEffectDialog } from './components/NodeEffectDialog';
import { DueItems } from './components/DueItems';
import { SavedPacksDialog } from './components/SavedPacksDialog';
import { StarterDialog } from './components/StarterDialog';
import { ThinkingList } from './components/ThinkingList';
import { assumptionsDue, decisionsDue } from './core/assumptions';
import { thinkingOf, convertedTo } from './core/thinkingMarkers';
import type { NoteThinkingItem } from './core/thinkingMarkers';
import { contextToMarkdown } from './core/contextMarkdown';
import { ContextDetailModal } from './components/ContextDetailModal';
import { NodeDialogs } from './components/NodeDialogs';
import type { NodeDialogState } from './components/NodeDialogs';
import { FilesPanel } from './components/FilesPanel';
import { ProposalInbox } from './components/ProposalInbox';
import { ContextPackDialog } from './components/ContextPackDialog';
import type { PackTarget } from './components/ContextPackDialog';
import { ImportAnswerDialog } from './components/ImportAnswerDialog';
import { ConnectAiModal } from './components/ConnectAiModal';
import { ChangesPanel } from './components/ChangesPanel';
import { flipFlops, needsReview, planDecisions, waitingDecisions } from './core/decisionGraph';
import { WeeklyReviewDialog } from './components/WeeklyReviewDialog';
import { MetricsDialog } from './components/MetricsDialog';
import { expectationRows, expectationsDue, metricsWithoutRecentNumber, verdictTally } from './core/metrics';
import { MX } from './core/metricsText';
import { acceptanceSentence, buildWeeklyReview, outputsUsing, readinessPerWorkstream, reviewDue } from './core/weeklyReview';
import { NodeThreadPanel } from './components/NodeThreadPanel';
import { MemoryImportDialog } from './components/MemoryImportDialog';
import { WorkstreamStudio } from './components/WorkstreamStudio';
import { SmartChat } from './components/SmartChat';
import { AssetLibrary } from './components/AssetLibrary';
import { LedgerPanel } from './components/LedgerPanel';
import { QuickStartDialog } from './components/QuickStartDialog';
import { SpecLibraryDialog } from './components/SpecLibraryDialog';
import { PlanSelectionModal } from './components/PlanSelectionModal';
import { AccountModal } from './components/AccountModal';
import { SpecEditorModal } from './components/SpecEditorModal';
import { PLANS, chatCountToday, tehranDay } from './core/creditEngine';
import { enabledBuiltInSpecs, currentSpecIds } from './core/specs';
import { WorkstreamSpec } from './types';
import { Alert, Button, Card, Dialog, EmptyState, SegmentedControl, Spinner, TextField, formatNumber, useToast } from './ui';
import { AiSettingsModal } from './components/AiSettingsModal';
import { AiStatusBanner } from './components/AiNotices';
import { ledgerEntryFromUsage } from './core/ledger';
import { titleFromMarkdown } from './core/blocks';
import { chatCredits } from './core/creditEngine';
import { DataApiError, dataApi } from './services/dataApi';
import type { MetricsBundle } from './services/dataApi';
import type { CanvasBundle } from './services/dataApi';
import type { MovePayload } from './components/ContextCanvas';
import { useAiStatus } from './services/aiStatus';
import type { ExpectationVerdict, MetricDirection } from './types';
import type { AiPlan, ContentBlock, GenerationResult, UsageSummary, UsedContextRef } from './types';
import type { FileQuotaInfo } from './types/state';

const errText = (e: unknown) => (e instanceof DataApiError ? e.message : 'خطای ناشناخته. دوباره تلاش کن.');

export default function App() {
  const toast = useToast();
  const ai = useAiStatus();

  // ── data: the server (SQLite) is the source of truth; nothing is kept in localStorage ──────────────
  const [boot, setBoot] = useState<{ status: 'loading' | 'ready' | 'error'; message?: string }>({ status: 'loading' });
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const workspacesRef = useRef<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>('');
  const [data, setData] = useState<WorkspaceState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quota, setQuota] = useState<FileQuotaInfo | null>(null);

  const setWs = useCallback((list: Workspace[]) => { workspacesRef.current = list; setWorkspaces(list); }, []);

  const startup = useCallback(async () => {
    setBoot({ status: 'loading' });
    try {
      const list = await dataApi.bootstrap();
      setWs(list);
      setCurrentWorkspaceId((cur) => (list.some((w) => w.id === cur) ? cur : list[0]?.id ?? ''));
      setBoot({ status: 'ready' });
    } catch (e) {
      setBoot({ status: 'error', message: errText(e) });
    }
  }, [setWs]);
  useEffect(() => { void startup(); }, [startup]);

  const reload = useCallback(async (id: string) => {
    setLoadError(null);
    try {
      const st = await dataApi.state(id);
      setData(st);
      setWs(workspacesRef.current.map((w) => (w.id === id ? st.workspace : w)));
      dataApi.fileQuota(id).then(setQuota).catch(() => setQuota(null));
    } catch (e) {
      setLoadError(errText(e));
    }
  }, [setWs]);
  useEffect(() => { if (currentWorkspaceId) { setData(null); void reload(currentWorkspaceId); } }, [currentWorkspaceId, reload]);

  const currentWorkspace = (data?.workspace.id === currentWorkspaceId ? data.workspace : undefined) ?? workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0];
  const patch = (fn: (d: WorkspaceState) => WorkspaceState) => setData((d) => (d ? fn(d) : d));
  const wid = currentWorkspaceId;

  /** run an API call; failures are shown (never swallowed, never replaced by fake data) */
  const attempt = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try { return await fn(); } catch (e) { toast.show({ intent: 'danger', message: errText(e) }); return undefined; }
  };

  const updateWorkspace = async (fn: (w: Workspace) => Workspace, id = wid) => {
    const cur = workspacesRef.current.find((w) => w.id === id);
    if (!cur) return;
    const next = fn(cur);
    setWs(workspacesRef.current.map((w) => (w.id === id ? next : w)));
    patch((d) => (d.workspace.id === id ? { ...d, workspace: next } : d));
    await attempt(() => dataApi.saveWorkspace(next));
  };

  // UI state
  const [selectedSpecId, setSelectedSpecId] = useState<string>('main_positioning');
  const [activeTab, setActiveTab] = useState<string>('home');
  const [contextViewMode, setContextViewMode] = useState<'doc' | 'read' | 'table' | 'canvas'>('doc');
  // map and board are far below the attention panel and the inbox: switching to one brings it into view (not on first render)
  const viewModeSeen = useRef(contextViewMode);
  useEffect(() => {
    if (viewModeSeen.current === contextViewMode) return;
    viewModeSeen.current = contextViewMode;
    if (contextViewMode === 'canvas') setTimeout(() => document.getElementById('context-view')?.scrollIntoView({ block: 'start' }), 30);
  }, [contextViewMode]);
  const [selectedContextObject, setSelectedContextObject] = useState<ContextObject | null>(null);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [modalDefaultNodeId, setModalDefaultNodeId] = useState('business');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isSpecLibraryOpen, setIsSpecLibraryOpen] = useState(false);
  const [isPacksOpen, setIsPacksOpen] = useState(false);
  const [isStarterOpen, setIsStarterOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{ kind: 'node' | 'workstream'; sourceId: string; name: string } | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCustomSpecModalOpen, setIsCustomSpecModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<WorkstreamSpec | undefined>(undefined);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isNewWorkspaceModalOpen, setIsNewWorkspaceModalOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState>(null);
  const [extractingNoteId, setExtractingNoteId] = useState<string | null>(null);
  const [chatScope, setChatScope] = useState<string | undefined>(undefined);
  const [packTarget, setPackTarget] = useState<PackTarget | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [readNodeId, setReadNodeId] = useState<string | null>(null);
  const [effectNodeId, setEffectNodeId] = useState<string | null>(null);
  const [threadNodeId, setThreadNodeId] = useState<string | null>(null);
  const [pendingRebuild, setPendingRebuild] = useState<GeneratedDeliverable | null>(null);

  const nodes = data?.nodes ?? [];
  const workspaceContexts = data?.objects ?? [];
  const deliverables = data?.deliverables ?? [];
  const ledgerEntries = data?.ledger ?? [];
  const stale = data?.stale ?? [];
  // derived, never stored: dependents whose dependency changed after they were last written or reviewed
  const reviewNeeds = useMemo(() => needsReview(data?.objects ?? [], data?.relationships ?? [], data?.changes ?? []), [data?.objects, data?.relationships, data?.changes]);
  const reviewIdSet = useMemo(() => new Set(reviewNeeds.keys()), [reviewNeeds]);
  const staleIdSet = useMemo(() => new Set((data?.stale ?? []).map((s) => s.deliverableId)), [data?.stale]);
  const waiting = useMemo(() => waitingDecisions(planDecisions(data?.objects ?? [], data?.relationships ?? [])), [data?.objects, data?.relationships]);
  const flips = useMemo(() => flipFlops(data?.objects ?? [], data?.changes ?? []), [data?.objects, data?.changes]);
  const weekly = useMemo(() => buildWeeklyReview({ objects: data?.objects ?? [], relationships: data?.relationships ?? [], changes: data?.changes ?? [], deliverables: data?.deliverables ?? [] }), [data?.objects, data?.relationships, data?.changes, data?.deliverables]);
  const weeklyDue = reviewDue(data?.weeklyReviewAt, weekly);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
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

  // ── Context objects ────────────────────────────────────────────────────────────────────────────
  /** create (no id / unknown id) or edit in place (known id: title/content/type edits bump the version) */
  const handleSaveContextObject = async (draft: ContextDraft): Promise<ContextObject | undefined> => {
    const existing = draft.id ? workspaceContexts.find((o) => o.id === draft.id) : undefined;
    if (existing) {
      const r = await attempt(() => dataApi.updateObject(wid, existing.id, { type: draft.type, title: draft.title, content: draft.content, nodeId: draft.nodeId, status: draft.status, provenance: draft.provenance, slotKey: draft.slotKey, reach: draft.reach ?? null, validUntil: draft.validUntil ?? null, assumption: draft.assumption === true, reviewBy: draft.reviewBy ?? null, record: draft.record ?? null, facets: draft.facets ?? null }));
      if (!r) return undefined;
      patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === r.object.id ? r.object : o)), stale: r.stale }));
      showImpact(r.impact);
      return r.object;
    }
    const r = await attempt(() => dataApi.createObject(wid, { type: draft.type, status: draft.status, provenance: draft.provenance, title: draft.title, content: draft.content, nodeId: draft.nodeId, source: draft.source, slotKey: draft.slotKey, reach: draft.reach, validUntil: draft.validUntil, assumption: draft.assumption, reviewBy: draft.reviewBy, record: draft.record, facets: draft.facets }));
    if (!r) return undefined;
    patch((d) => ({ ...d, objects: [r.object, ...d.objects] }));
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

  // ── thinking items (derived from note lines; src/core/thinkingMarkers.ts) ──
  const thinking = useMemo(() => thinkingOf(data?.notes ?? []), [data?.notes]);
  const handleConvertItem = async (item: NoteThinkingItem, opts?: { as?: 'fact' | 'decision' }) => {
    const r = await attempt(() => dataApi.convertThinkingItem(wid, item.noteId, { kind: item.kind, hash: item.hash, text: item.text }, opts));
    if (!r) return;
    patch((d) => ({ ...d, objects: r.objects }));
    toast.show({ intent: 'success', message: 'به‌صورت پیشنهادی ثبت شد؛ در صندوق پیشنهادها منتظر تأیید توست و متن یادداشت دست‌نخورده ماند.' });
  };
  const handleSplitNote = async (noteId: string) => {
    const r = await attempt(() => dataApi.splitNote(wid, noteId));
    if (!r) return;
    patch((d) => ({ ...d, nodes: r.nodes, notes: r.notes }));
    toast.show({ intent: 'success', message: `${formatNumber(r.created.length)} گره ساخته شد؛ یادداشت اصلی همان‌جا ماند.` });
  };
  // due: assumptions to look at again, decisions that ask «نتیجه چه شد؟»
  const dueAssumptions = useMemo(() => assumptionsDue(data?.objects ?? [], new Date()), [data?.objects]);
  const dueDecisions = useMemo(() => decisionsDue(data?.objects ?? [], data?.changes ?? [], new Date()), [data?.objects, data?.changes]);
  const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const metrics = data?.metrics ?? [];
  const measurements = data?.measurements ?? [];
  const expRows = useMemo(() => expectationRows(data?.objects ?? [], metrics, measurements, data?.changes ?? [], new Date()), [data?.objects, data?.metrics, data?.measurements, data?.changes]);
  const tally = useMemo(() => verdictTally(expRows), [expRows]);
  const quietMetrics = useMemo(() => metricsWithoutRecentNumber(metrics, measurements, new Date()), [data?.metrics, data?.measurements]);
  const expectationsDueCount = useMemo(() => expectationsDue(expRows, new Date()).length, [expRows]);
  const dueProps = {
    assumptions: dueAssumptions, decisions: dueDecisions, titleOfNode: (id: string) => nodes.find((n) => n.id === id)?.label ?? id,
    onStillAssumed: async (id: string) => { await handlePatchObject(id, { reviewBy: plusDays(30), reason: 'بازبینی: هنوز فرض است' }); },
    onConfirmed: async (id: string) => { await handlePatchObject(id, { assumption: false, status: 'Confirmed', reason: 'بازبینی: فرض به واقعیت تبدیل شد' }); },
    onDropped: async (id: string) => { await handlePatchObject(id, { status: 'Archived', reason: 'بازبینی: فرض رد شد' }); },
    onOutcome: async (id: string, text: string, verdict?: ExpectationVerdict) => {
      const r = await attempt(() => dataApi.noteOutcome(wid, id, text, verdict));
      if (r) { patch((d) => ({ ...d, changes: r.changes })); toast.show({ intent: 'success', message: 'نتیجه ثبت شد.' }); }
    },
    expectations: expRows,
  };

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

  // ── examples (starters / templates) ──
  const handleApplyStarter = async (starterId: string) => {
    const r = await attempt(() => dataApi.applyStarter(wid, starterId));
    if (!r) return;
    patch((d) => ({ ...d, samples: r.samples }));
    toast.show({ intent: 'success', message: r.added ? `${formatNumber(r.added)} نمونهٔ خاکستری اضافه شد؛ به AI نمی‌رسند.` : 'این نمونه‌ها قبلاً اضافه شده‌اند.' });
  };
  const handleDeleteSamples = async (nodeIds?: string[]) => {
    const r = await attempt(() => dataApi.deleteSamples(wid, nodeIds));
    if (r) patch((d) => ({ ...d, samples: r.samples }));
  };
  const handleSaveTemplate = async () => {
    if (!templateDraft?.name.trim()) return;
    const r = await attempt(() => dataApi.saveTemplate(wid, { ...templateDraft, name: templateDraft.name.trim() }));
    if (r) { toast.show({ intent: 'success', message: 'قالب ذخیره شد؛ در «کتابخانهٔ جریان‌ها › قالب‌های من» می‌توانی در هر فضایی بیاوری.' }); setTemplateDraft(null); }
  };
  const handleApplyTemplate = async (templateId: string, parentId?: string) => {
    const r = await attempt(() => dataApi.applyTemplate(wid, templateId, parentId));
    if (!r) return;
    if (r.nodes) patch((d) => ({ ...d, nodes: r.nodes!, samples: r.samples ?? d.samples }));
    if (r.spec) { patch((d) => ({ ...d, specs: [r.spec!, ...d.specs] })); }
    toast.show({ intent: 'success', message: r.spec ? 'جریان کار به این فضا آمد.' : `گره‌ها آمدند و ${formatNumber(r.added ?? 0)} نمونهٔ خاکستری اضافه شد.` });
  };

  const handleCreateObjects = async (drafts: ContextDraft[]): Promise<ContextObject[]> => {
    const out: ContextObject[] = [];
    for (const dr of drafts) {
      const r = await dataApi.createObject(wid, { type: dr.type, status: dr.status, provenance: dr.provenance, title: dr.title, content: dr.content, nodeId: dr.nodeId });
      out.push(r.object);
    }
    patch((d) => ({ ...d, objects: [...out.slice().reverse(), ...d.objects] }));
    return out;
  };

  // ── boards: every action returns the pieces of state it touched ──
  const applyBundle = (r: CanvasBundle) => patch((d) => ({ ...d, objects: r.objects, relationships: r.relationships, changes: r.changes, notes: r.notes, stale: r.stale, canvas: r.canvas }));
  const handleCanvasMove = async (m: MovePayload) => {
    const before = data?.objects.find((o) => o.id === m.objectId);
    const r = await attempt(() => dataApi.canvasMove(wid, m));
    if (!r) return;
    applyBundle(r);
    const after = r.objects.find((o) => o.id === m.objectId);
    if (before?.status === 'Proposed' && after?.status === 'Confirmed') {
      const used = deliverables.filter((d) => d.usedContext?.some((u) => u.id === m.objectId)).length;
      toast.show({ intent: 'success', message: used ? `«${after.title}» تأیید شد؛ ${formatNumber(used)} خروجی تو از آن استفاده می‌کنند.` : `«${after.title}» تأیید شد و حالا واقعیت است.` });
    }
  };
  const handleCanvasConnect = async (c: Parameters<typeof dataApi.canvasConnect>[1]) => {
    const r = await attempt(() => dataApi.canvasConnect(wid, c));
    if (r) { applyBundle(r); toast.show({ intent: 'success', message: c.type === 'depends_on' ? 'اتصال «وابسته به» ساخته شد.' : 'مورد قبلی جایگزین شد و در تاریخچه می‌ماند.' }); }
  };
  const handleFreeNoteCreate = async (n: { content: string; x: number; y: number; nodeId?: string }) => {
    const r = await attempt(() => dataApi.freeNoteCreate(wid, n));
    if (r) applyBundle(r);
  };
  const handleFreeNoteMove = (id: string, x: number, y: number) => {
    patch((d) => ({ ...d, canvas: { ...d.canvas, free: d.canvas.free.map((i) => (i.itemRef === `note:${id}` ? { ...i, x, y } : i)) } }));
    void attempt(() => dataApi.freeNoteMove(wid, id, x, y));
  };
  const handlePlaceObject = async (id: string, x: number, y: number) => {
    patch((d) => ({ ...d, canvas: { ...d.canvas, free: d.canvas.free.some((i) => i.itemRef === `obj:${id}`) ? d.canvas.free.map((i) => (i.itemRef === `obj:${id}` ? { ...i, x, y } : i)) : [...d.canvas.free, { itemRef: `obj:${id}`, x, y }] } }));
    const r = await attempt(() => dataApi.freeObjectPlace(wid, id, x, y));
    if (r) patch((d) => ({ ...d, canvas: r.canvas }));
  };
  const handleUnplaceObject = async (id: string) => {
    const r = await attempt(() => dataApi.freeObjectRemove(wid, id));
    if (r) patch((d) => ({ ...d, canvas: r.canvas }));
  };
  const handleNoteToKnowledge = async (id: string, type: 'Fact' | 'Decision' | 'Constraint') => {
    const r = await attempt(() => dataApi.freeNoteToKnowledge(wid, id, type));
    if (r) { applyBundle(r); toast.show({ intent: 'success', message: 'یک قلم پیشنهادی ساخته شد؛ در ستون «در فکر» منتظر تأیید توست.' }); }
  };
  const handleAutoLayout = async () => {
    const a = await attempt(() => dataApi.canvasReset(wid));
    const b = a && await attempt(() => dataApi.freeReset(wid));
    if (b) applyBundle(b);
  };

  const handleSetDependencies = async (objectId: string, dependsOn: string[]) => {
    const r = await attempt(() => dataApi.setDependencies(wid, objectId, dependsOn));
    if (r) patch((d) => ({ ...d, relationships: r.relationships, changes: r.changes, stale: r.stale }));
  };
  /** «بدون تغییر بپذیر» — writes a review_accepted Change; the derived «needs review» state disappears */
  const handleAcceptReview = async (objectId: string, quiet = false) => {
    const r = await attempt(() => dataApi.acceptReview(wid, objectId));
    if (!r) return;
    patch((d) => ({ ...d, changes: r.changes, stale: r.stale }));
    if (!quiet) toast.show({ intent: 'success', message: 'بدون تغییر پذیرفته شد؛ در تاریخچه ثبت شد.' });
  };

  const handleSupersedeContext = async (oldId: string, input: ContextDraft, reason?: string) => {
    const r = await attempt(() => dataApi.supersedeObject(wid, oldId, { type: input.type, status: input.status, provenance: input.provenance, title: input.title, content: input.content, nodeId: input.nodeId, ...(reason ? { reason } : {}) }));
    if (!r) return;
    patch((d) => ({ ...d, objects: [r.object, ...d.objects.map((o) => (o.id === oldId ? r.previous : o))], relationships: r.relationships, stale: r.stale }));
    showImpact(r.impact);
  };

  const setStatus = async (id: string, status: ContextObject['status'], reason?: string) => {
    const r = await attempt(() => dataApi.updateObject(wid, id, { status, ...(reason ? { reason } : {}) }));
    if (!r) return undefined;
    patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? r.object : o)), stale: r.stale }));
    return r.impact;
  };

  const handleArchiveContext = async (id: string) => {
    const impact = await setStatus(id, 'Archived');
    if (impact) showImpact(impact);
  };

  /** conflict: keep one (the other becomes Superseded) */
  const handleKeepContradiction = async (c: Contradiction, keepId: string) => {
    const r = await attempt(() => dataApi.resolveContradiction(wid, { aId: c.itemA.id, bId: c.itemB.id, action: 'keep', keepId }));
    if (!r) return;
    patch((d) => ({ ...d, objects: r.objects, relationships: r.relationships, pairJudgments: r.pairJudgments, stale: r.stale }));
    showImpact(r.impact);
    toast.show({ intent: 'success', message: 'تناقض حل شد؛ مورد دیگر «جایگزین‌شده» است و در تاریخچه می‌ماند.' });
  };
  /** both claims hold: move one claim to another node */
  const handleSeparateContradiction = async (c: Contradiction, moveId: string, nodeId: string) => {
    const r = await attempt(() => dataApi.resolveContradiction(wid, { aId: c.itemA.id, bId: c.itemB.id, action: 'separate', moveId, nodeId }));
    if (!r) return;
    patch((d) => ({ ...d, objects: r.objects, pairJudgments: r.pairJudgments, stale: r.stale }));
    showImpact(r.impact);
    toast.show({ intent: 'success', message: 'گره‌ها جدا شدند و دیگر با هم رقابت نمی‌کنند.' });
  };

  // semantic contradictions (Pro and above, needs an AI key). The judge NEVER runs because a workspace was opened, built or
  // reset: only (a) after an object of a candidate pair changed in this session and has no fresh judgement (settle first),
  // or (b) from the «بررسی تناقض» button. Policy and the pure rules: src/core/judgePolicy.ts
  const baselineRef = useRef<{ wid: string; versions: VersionBaseline } | null>(null);
  const [judging, setJudging] = useState(false);
  const [judgedToday, setJudgedToday] = useState<number | null>(null);
  const canJudge = !!data && can(data.workspace.planId, 'semanticContradiction') && ai.judgmentsAvailable;
  const refreshJudged = () => { dataApi.usage(wid).then((u) => setJudgedToday(u.judgmentsToday)).catch(() => { /* the meter is optional */ }); };
  const runJudge = async (objectIds?: string[]) => {
    setJudging(true);
    try {
      const r = await dataApi.judgeContradictions(wid, objectIds);
      patch((d) => ({ ...d, pairJudgments: r.pairJudgments, ledger: r.ledger }));
      refreshJudged();
      return r;
    } finally { setJudging(false); }
  };
  const handleCheckContradictions = async () => {
    try {
      const r = await runJudge();
      toast.show({ intent: 'success', message: r.judged ? `${formatNumber(r.judged)} جفت بررسی شد.${r.limited ? ' به سقف امروز رسیدی؛ بقیه فردا.' : ''}` : 'جفت تازه‌ای برای بررسی نبود.' });
    } catch (e) { toast.show({ intent: 'danger', message: e instanceof Error ? e.message : 'بررسی تناقض انجام نشد؛ دوباره.' }); }
  };
  const changedSig = (() => {
    if (!data || !canJudge) return '';
    if (!baselineRef.current || baselineRef.current.wid !== data.workspace.id) return '';
    return pairsAfterChange(data.objects, data.pairJudgments, baselineRef.current.versions, data.relationships, data.nodes).map((p) => `${p.key}@${p.a.version}.${p.b.version}`).join(',');
  })();
  useEffect(() => {
    if (!data) { baselineRef.current = null; return; }
    if (!baselineRef.current || baselineRef.current.wid !== data.workspace.id) baselineRef.current = { wid: data.workspace.id, versions: baselineOf(data.objects) };
  }, [data]);
  useEffect(() => {
    if (!changedSig || !baselineRef.current) return;
    const ids = [...changedSince(data!.objects, baselineRef.current.versions)];
    const timer = setTimeout(() => { void runJudge(ids).catch(() => { /* optional: the rule-based checks still run */ }); }, JUDGE_SETTLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedSig]);
  useEffect(() => { if (canJudge) refreshJudged(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canJudge, wid]);

  // ── tree nodes ──────────────────────────────────────────────────────────────────────────────────
  const nodeOp = async (fn: () => Promise<{ nodes: WorkspaceState['nodes'] } & Partial<WorkspaceState>>) => {
    const r = await attempt(fn);
    if (!r) throw new Error('node op failed');
    patch((d) => ({ ...d, nodes: r.nodes, ...(r.objects ? { objects: r.objects } : {}), ...(r.notes ? { notes: r.notes } : {}), ...(r.files ? { files: r.files } : {}) }));
  };

  // ── notes ──────────────────────────────────────────────────────────────────────────────────────
  const handleAddNote = async (nodeId: string, content: string) => {
    const r = await attempt(() => dataApi.createNote(wid, nodeId, content));
    if (r) patch((d) => ({ ...d, notes: [r.note, ...d.notes] }));
  };
  const handleUpdateNote = async (id: string, content: string) => {
    const r = await attempt(() => dataApi.updateNote(wid, id, content));
    if (r) patch((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? r.note : n)) }));
  };
  const handleDeleteNote = async (id: string) => {
    const r = await attempt(() => dataApi.deleteNote(wid, id));
    if (r) patch((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }));
  };
  const handleExtractNote = async (id: string) => {
    setExtractingNoteId(id);
    try {
      const r = await attempt(() => dataApi.extractNote(wid, id));
      if (!r) return;
      patch((d) => ({ ...d, objects: [...r.created, ...d.objects], ledger: [r.ledger, ...d.ledger] }));
      toast.show({ intent: r.created.length ? 'success' : 'info', message: r.created.length ? `${formatNumber(r.created.length)} مورد پیشنهادی ساخته شد؛ در وضعیت «پیشنهادی» منتظر تأیید توست.` : 'چیزی برای استخراج در این یادداشت پیدا نشد.' });
    } finally { setExtractingNoteId(null); }
  };

  // ── files ──────────────────────────────────────────────────────────────────────────────────────
  const handleUploadFile = async (file: File, nodeId: string) => {
    const r = await attempt(() => dataApi.uploadFile(wid, file, nodeId));
    if (r) patch((d) => ({ ...d, files: [r.file, ...d.files] }));
    return r ? { file: r.file, charge: r.charge, policy: r.policy } : undefined;
  };
  const handleProcessFile = async (fileId: string) => {
    patch((d) => ({ ...d, files: d.files.map((f) => (f.id === fileId ? { ...f, status: 'processing' as const } : f)) }));
    const r = await attempt(() => dataApi.processFile(wid, fileId));
    if (!r) { await reload(wid); return; }
    patch((d) => ({ ...d, files: d.files.map((f) => (f.id === fileId ? r.file : f)), objects: [...r.created, ...d.objects], workspace: r.workspace }));
    setWs(workspacesRef.current.map((w) => (w.id === wid ? r.workspace : w)));
    setQuota(r.quota);
    const ledger = await dataApi.state(wid).then((s) => s.ledger).catch(() => null);
    if (ledger) patch((d) => ({ ...d, ledger }));
    toast.show({ intent: 'success', message: `فایل پردازش شد: ${formatNumber(r.created.length)} مورد پیشنهادی و ${formatNumber(r.file.chunkCount)} قطعه.${ai.managedEnabled && r.creditCost ? ` ${formatNumber(r.creditCost)} اعتبار کسر شد.` : ''}` });
  };
  const handleDeleteFile = async (fileId: string) => {
    const r = await attempt(() => dataApi.deleteFile(wid, fileId));
    if (r) patch((d) => ({ ...d, files: d.files.filter((f) => f.id !== fileId) }));
  };

  // ── assets, ledger, credits ──────────────────────────────────────────────────────────────────────
  const persistDeliverable = async (del: GeneratedDeliverable) => {
    const r = await attempt(() => dataApi.saveDeliverable(wid, del));
    if (!r) return false;
    patch((d) => ({ ...d, deliverables: d.deliverables.some((x) => x.id === del.id) ? d.deliverables.map((x) => (x.id === del.id ? del : x)) : [del, ...d.deliverables], stale: r.stale }));
    return true;
  };
  const persistLedger = async (entry: LedgerEntry) => {
    const r = await attempt(() => dataApi.addLedger(wid, entry));
    if (r) patch((d) => ({ ...d, ledger: [entry, ...d.ledger.filter((x) => x.id !== entry.id)] }));
  };

  // usage is the real provider usage returned by the server; creditCost is already 0 for BYOK
  const handleSaveDeliverable = async (del: GeneratedDeliverable, creditCostIn: number, usage: UsageSummary, kind: 'new' | 'rebuild' = 'new') => {
    let creditCost = creditCostIn;
    if (!(await persistDeliverable(del))) return;
    creditCost = ai.managedEnabled ? creditCost : 0;
    if (creditCost > 0) await updateWorkspace((w) => ({ ...w, creditsRemaining: Math.max(0, w.creditsRemaining - creditCost) }));
    await persistLedger(ledgerEntryFromUsage({
      workspaceId: wid,
      action: `${kind === 'rebuild' ? 'بازسازی' : 'تولید'}: ${del.title} (${del.executionMode})`,
      mode: del.executionMode,
      creditCost,
      usage,
      plan: del.plan,
      id: `led_${Date.now()}`,
    }));
    if (kind === 'rebuild') toast.show({ intent: 'success', message: 'دارایی با آخرین نسخهٔ دانش بازسازی شد.' });
  };

  /** A finished chat turn: ledger row with real tokens/cost, and the credits the turn cost (0 for Auto / BYOK). */
  const handleRecordChatUsage = async (result: GenerationResult, creditCostIn: number, deep: boolean) => {
    let creditCost = creditCostIn;
    creditCost = ai.managedEnabled ? creditCost : 0;
    if (creditCost > 0) await updateWorkspace((w) => ({ ...w, creditsRemaining: Math.max(0, w.creditsRemaining - creditCost) }));
    await persistLedger(ledgerEntryFromUsage({
      workspaceId: wid,
      action: deep ? 'گفتگوی عمیق' : 'گفتگوی خودکار',
      mode: deep ? 'chat_deep' : 'chat_auto',
      creditCost,
      usage: result.usage,
      plan: result.plan,
      id: `led_chat_${Date.now()}`,
    }));
  };

  /** Save one chat block as an asset (Markdown). No credits: the AI cost was already recorded with the chat turn. */
  const handleSaveBlockAsAsset = async (block: ContentBlock, source: { title: string; plan?: AiPlan; usage?: UsageSummary; usedContext?: UsedContextRef[] }) => {
    const now = new Date().toISOString();
    const asset: GeneratedDeliverable = {
      id: `del_chat_${Date.now()}`,
      workspaceId: wid,
      workstreamId: 'chat',
      deliverableId: `chat_${block.id}`,
      title: titleFromMarkdown(block.markdown),
      content: block.markdown,
      blocks: [block],
      plan: source.plan,
      executionMode: 'auto',
      creditCost: 0,
      usedContext: source.usedContext ?? [],
      rebuildCount: 0,
      createdAt: now,
    };
    if (await persistDeliverable(asset)) toast.show({ intent: 'success', message: 'در کتابخانهٔ دارایی‌ها ذخیره شد (Markdown).' });
  };

  const handleIncrementChatCount = () => {
    const day = tehranDay();
    void updateWorkspace((w) => ({ ...w, todayChatCount: chatCountToday(w.todayChatCount, w.chatCountDay, day) + 1, chatCountDay: day }));
  };

  const handleChangePlan = (planId: PlanId) => {
    void updateWorkspace((w) => ({ ...w, planId, creditsRemaining: w.creditsRemaining + PLANS[planId].creditsMonthly }));
    toast.show({ intent: 'success', message: `پلن این فضای کاری به ${PLANS[planId].title} تغییر یافت.` });
  };

  /** the workspace's library workstreams: the explicit list, saved on the workspace */
  const handleSetLibrarySpecs = async (ids: string[]) => { await updateWorkspace((w) => ({ ...w, enabledSpecIds: ids })); };
  /** «شروع سریع» builds on the positioning workstream: bring it into the workspace (once) */
  const ensureLibrarySpec = (id: string) => {
    const w = workspacesRef.current.find((x) => x.id === wid);
    if (w && !currentSpecIds(w).includes(id)) void handleSetLibrarySpecs([...currentSpecIds(w), id]);
  };

  const handleAddCredits = (amount: number) => {
    void updateWorkspace((w) => ({ ...w, creditsRemaining: w.creditsRemaining + amount }));
    toast.show({ intent: 'success', message: `${formatNumber(amount)} اعتبار به حساب این فضای کاری اضافه شد.` });
  };

  // the showcase workspace: the same action builds it and resets it (all of ITS data is rebuilt; other workspaces are untouched)
  const [demoConfirm, setDemoConfirm] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const handleResetDemo = async () => {
    setDemoBusy(true);
    try {
      const r = await attempt(() => dataApi.resetDemo());
      if (!r) return;
      setWs(r.workspaces);
      setCurrentWorkspaceId(r.workspaceId);
      setData(null);
      setActiveTab('home');
      await reload(r.workspaceId);
      setDemoConfirm(false);
      toast.show({ intent: 'success', message: 'فضای نمونه آماده است؛ داده‌هایش ساختگی‌اند و در پلن و مصرف حساب شمرده نمی‌شوند.' });
    } finally { setDemoBusy(false); }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || !currentWorkspace) return;

    const currentPlan = PLANS[currentWorkspace.planId] || PLANS.pro;
    if (workspaces.filter((w) => !w.isDemo).length >= currentPlan.workspaceLimit) {
      toast.show({
        intent: 'warning',
        message: `سقف فضای کاری در پلن ${currentPlan.title} (${formatNumber(currentPlan.workspaceLimit)} عدد) پر شده است. برای افزودن، پلنت را ارتقا بده.`,
      });
      return;
    }

    const newWs: Workspace = {
      id: `ws_${Date.now()}`,
      name: newWsName.trim(),
      slug: newWsName.trim().toLowerCase().replace(/\s+/g, '-'),
      description: 'فضای کاری جدید در مبدأ',
      planId: currentWorkspace.planId,
      creditsRemaining: 150,
      todayChatCount: 0,
      enabledSpecIds: [], // a new workspace starts with no library workstreams: «شروع سریع» or «افزودن از کتابخانه» brings them in
      createdAt: new Date().toISOString(),
    };
    const saved = await attempt(() => dataApi.saveWorkspace(newWs));
    if (!saved) return;
    setWs([...workspacesRef.current, newWs]);
    setCurrentWorkspaceId(newWs.id);
    setNewWsName('');
    setIsNewWorkspaceModalOpen(false);
  };

  const [extractingAssetId, setExtractingAssetId] = useState<string | null>(null);
  /** an output is not Context: its text is read by the extraction path and yields PROPOSED objects with a quote; the user confirms */
  const handleExtractFromAsset = async (del: GeneratedDeliverable) => {
    setExtractingAssetId(del.id);
    try {
      const r = await attempt(() => dataApi.extractDeliverable(wid, del.id));
      if (!r) return;
      patch((d) => ({ ...d, objects: [...r.created.slice().reverse(), ...d.objects], ledger: r.ledger }));
      toast.show({ intent: r.created.length ? 'success' : 'info', message: r.created.length ? `${formatNumber(r.created.length)} مورد پیشنهادی از این خروجی ساخته شد؛ در صندوق پیشنهادها منتظر تأیید توست.` : 'در متن این خروجی واقعیت، تصمیم یا قید مشخصی پیدا نشد.' });
    } finally { setExtractingAssetId(null); }
  };

  const handleExportAllData = () => {
    if (!data || !currentWorkspace) return;
    const backupData = {
      workspace: currentWorkspace,
      allWorkspaces: workspaces,
      nodes: data.nodes,
      contextObjects: data.objects,
      notes: data.notes,
      deliverables: data.deliverables,
      ledgerEntries: data.ledger,
      files: data.files.map(({ id, name, mime, sizeBytes, tokens, summary }) => ({ id, name, mime, sizeBytes, tokens, summary })),
      specs,
      exportedAt: new Date().toISOString(),
      platform: 'مبدأ — منبع حقیقت کسب‌وکار',
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mabda_backup_${currentWorkspace.slug}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleDeleteAccount = () => {
    setIsAccountModalOpen(false);
    toast.show({ intent: 'info', message: 'درخواست حذف حساب ثبت شد. تمام نشست‌ها پایان یافت و اطلاعات طی مهلت ۳۰ روزه از سیستم پاک می‌شود (F1).', duration: 8000 });
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
  const setLedger = (ledger: LedgerEntry[]) => patch((d) => ({ ...d, ledger }));

  /** the one action in the top bar that fits the current page */
  const pageAction: PageAction | undefined =
    activeTab === 'context' || activeTab === 'home' ? { label: 'ثبت دانش', icon: 'Plus', onClick: () => openContext(null) }
    : activeTab === 'workstreams' ? { label: 'جریان سفارشی', icon: 'Plus', onClick: () => openSpecEditor() }
    : activeTab === 'assets' ? { label: 'ساخت خروجی تازه', icon: 'Sparkles', onClick: () => setActiveTab('workstreams') }
    : undefined;

  const openContext = (obj: ContextObject | null, nodeId = 'business') => {
    setSelectedContextObject(obj);
    setModalDefaultNodeId(nodeId);
    setIsContextModalOpen(true);
  };

  if (boot.status !== 'ready' || !currentWorkspace || !data) {
    const failed = boot.status === 'error' || loadError;
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page p-inset-lg">
        {failed ? (
          <EmptyState
            icon="Lock"
            title="اتصال به سرور برقرار نشد"
            description={boot.message ?? loadError ?? undefined}
            action={<Button variant="primary" onClick={() => (boot.status === 'error' ? void startup() : void reload(currentWorkspaceId))}>دوباره</Button>}
          />
        ) : (
          <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال بارگذاری" /><span className="body-md">در حال بارگذاری فضای کاری…</span></div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-text-default md:flex-row pb-space-24 md:pb-space-0">
      {/* Sleek Right Sidebar Navigation & Mobile Drawer */}
      <AppNavigation
        currentWorkspace={currentWorkspace}
        allWorkspaces={workspaces}
        onSelectWorkspace={(ws) => { setChatScope(undefined); setCurrentWorkspaceId(ws.id); }}
        onOpenNewWorkspace={() => setIsNewWorkspaceModalOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onResetDemo={() => { if (workspaces.some((w) => w.isDemo)) setDemoConfirm(true); else void handleResetDemo(); }}
        onOpenPlanModal={() => setIsPlanModalOpen(true)}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onOpenLedger={() => setActiveTab('ledger')}
        onOpenAiSettings={() => setIsAiSettingsOpen(true)}
        onOpenConnect={() => setIsConnectOpen(true)}
        onOpenMemory={() => { setActiveTab('context'); setIsMemoryOpen(true); }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        specs={specs}
        selectedSpecId={selectedSpecId}
        onSelectSpecId={setSelectedSpecId}
        onOpenCustomSpecModal={() => openSpecEditor()}
        onOpenSpecLibrary={() => setIsSpecLibraryOpen(true)}
        contextViewMode={contextViewMode}
        onChangeContextViewMode={setContextViewMode}
        contextCount={workspaceContexts.length}
        deliverablesCount={deliverables.length}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-space-0">
        {/* Desktop Minimal Top Status Bar with Breadcrumbs & Quick Actions */}
        <TopStatusBar
          currentWorkspace={currentWorkspace}
          activeTab={activeTab}
          action={pageAction}
        />

        {/* Main Canvas */}
        <main className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl flex-1 space-y-stack-lg">
          {(activeTab === 'workstreams' || activeTab === 'chat') && <AiStatusBanner onOpenSettings={() => setIsAiSettingsOpen(true)} />}



        {/* HOME: where to start — what needs you, this week, waiting decisions, the inbox, recent changes */}
        {activeTab === 'home' && (
          <div className="space-y-stack-lg">
            <div className="flex flex-col gap-inline-md sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-heading-md font-bold text-text-default">خانه: {currentWorkspace.name}</h1>
                <p className="text-body-sm text-text-subtle mt-stack-xs">اینجا از همین‌جا شروع کن: چه چیزی به تو نیاز دارد، این هفته چه شد و چه چیزی منتظر تصمیم توست.</p>
              </div>
              <div className="flex flex-wrap gap-inline-sm">
                <Button variant="secondary" iconStart="TrendingUp" onClick={() => setMetricsOpen(true)}>{MX.navTitle}</Button>
                <Button variant="secondary" iconStart="Package" onClick={() => setIsPacksOpen(true)}>بسته‌های Context</Button>
              </div>
            </div>
            {workspaceContexts.length === 0 && (
              <EmptyState
                icon="House"
                title="از اینجا شروع کن"
                description="مبدأ با دانشی که خودت می‌دهی کار می‌کند. هر کدام از این‌ها یک شروع است؛ بعد از اولین دانش، همین صفحه می‌گوید چه چیزی کم است."
                action={(
                  <div className="flex flex-wrap justify-center gap-inline-md">
                    <Button variant="primary" iconStart="Sparkles" onClick={() => setIsOnboardingOpen(true)}>شروع سریع</Button>
                    <Button variant="secondary" iconStart="Download" onClick={() => setIsMemoryOpen(true)}>وارد کردن حافظهٔ AI دیگر</Button>
                    <Button variant="secondary" iconStart="Layers" onClick={() => setIsStarterOpen(true)}>اسکلت شروع</Button>
                    <Button variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت اولین دانش</Button>
                  </div>
                )}
              />
            )}
            <AttentionPanel
              specTitle={attentionSpec?.title ?? ''}
              gaps={attentionGaps}
              contradictionCount={contradictions.length}
              staleCount={stale.length}
              reviews={[...reviewNeeds.entries()].map(([id, need]) => ({ id, title: workspaceContexts.find((o) => o.id === id)?.title ?? id, dependencyTitles: need.changedDependencies.map((d) => workspaceContexts.find((o) => o.id === d.id)?.title ?? d.id) }))}
              waiting={waiting}
              flips={flips}
              titleOf={(id) => workspaceContexts.find((o) => o.id === id)?.title ?? id}
              weeklyDue={weeklyDue}
              onOpenWeekly={() => setWeeklyOpen(true)}
              onOpenObject={(id) => { const o = workspaceContexts.find((x) => x.id === id); if (o) openContext(o); }}
              onAcceptReview={handleAcceptReview}
              proposedCount={workspaceContexts.filter((o) => o.status === 'Proposed').length}
              onAnswerGap={(gap, answer) => { void handleSaveContextObject({
                workspaceId: wid, type: gap.importance === 'required' ? 'Decision' : 'Fact', status: 'Confirmed', provenance: 'User Input',
                title: gap.label, content: answer, nodeId: gap.nodeId, slotKey: gap.key,
              }); }}
              onOpenStudio={() => setActiveTab('workstreams')}
              onOpenAssets={() => setActiveTab('assets')}
              onOpenProposals={() => document.getElementById('proposal-inbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              onOpenContradictions={() => document.getElementById('contradictions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              onOpenChanges={() => { setChangesOpen(true); setTimeout(() => document.getElementById('changes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}
            />

            {(metrics.some((m) => !m.archived) || expRows.length > 0) && (
              <Card padding="xl" id="expectations" className="flex flex-col gap-stack-md" aria-label={MX.homeTitle}>
                <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                  <h2 className="heading-sm text-text-default">{MX.homeTitle}</h2>
                  <Button size="sm" variant="secondary" iconStart="TrendingUp" onClick={() => setMetricsOpen(true)}>{MX.navTitle}</Button>
                </div>
                {expRows.length > 0 ? (
                  <p className="body-md text-text-default" data-testid="expectation-tally">
                    {formatNumber(tally.met)} به انتظار رسید · {formatNumber(tally.partial)} نیمه · {formatNumber(tally.missed)} نرسید · {formatNumber(tally.open)} باز{expectationsDueCount > 0 ? ` (${formatNumber(expectationsDueCount)} موعدش رسیده)` : ''}
                  </p>
                ) : <p className="body-sm text-text-subtle">{MX.expectationsBody}</p>}
                {quietMetrics.length > 0 && <p className="body-sm text-text-subtle">{MX.quiet}: {quietMetrics.map((m) => m.name).join('، ')}.</p>}
              </Card>
            )}

            {(thinking.some((i) => (i.kind === 'question' || i.kind === 'open_decision') && !convertedTo(i, workspaceContexts)) || dueAssumptions.length + dueDecisions.length > 0) && (
              <Card padding="xl" id="open-thinking" className="flex flex-col gap-stack-lg" aria-label="سؤال‌ها و تصمیم‌های باز">
                <h2 className="heading-sm text-text-default">سؤال‌ها و تصمیم‌های باز</h2>
                <p className="body-sm text-text-subtle">از خط‌های یادداشت‌هایت که با [سؤال] یا [تصمیم باز] شروع شده‌اند؛ همهٔ گره‌ها اینجا جمع می‌شوند. یادداشت‌ها هرگز به AI داده نمی‌شوند.</p>
                <ThinkingList
                  items={thinking.filter((i) => (i.kind === 'question' || i.kind === 'open_decision') && !convertedTo(i, workspaceContexts))}
                  objects={workspaceContexts}
                  nodes={nodes}
                  onConvert={handleConvertItem}
                  onGoToNode={(nodeId) => { setActiveTab('context'); setContextViewMode('doc'); setTimeout(() => document.getElementById(`node-${nodeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); }}
                />
                <DueItems {...dueProps} />
              </Card>
            )}

            {changesOpen && <ChangesPanel open={changesOpen} onToggle={() => setChangesOpen((v) => !v)} changes={data?.changes ?? []} objects={workspaceContexts} relationships={data?.relationships ?? []} deliverables={deliverables} nodes={nodes} onOpenAssets={() => setActiveTab('assets')} />}

            <ContradictionPanel contradictions={contradictions} nodes={nodes} onKeep={handleKeepContradiction} onSeparate={handleSeparateContradiction} check={canJudge ? { busy: judging, onCheck: handleCheckContradictions, used: judgedToday, cap: entitlementsOf(data!.workspace.planId).decisionJudgmentsPerDay, unlimited: ai.byok } : undefined} />

            <ProposalInbox
              objects={workspaceContexts}
              nodes={nodes}
              onAccept={handleAcceptProposal}
              onReplace={handleReplaceWithProposal}
              onEdit={(o) => openContext(o)}
              onReject={handleRejectProposal}
              onOpenImport={() => setIsImportOpen(true)}
              onOpenPack={() => setPackTarget({ title: currentWorkspace.name })}
              onOpenConnect={() => setIsConnectOpen(true)}
              onOpenMemory={() => setIsMemoryOpen(true)}
            />

          </div>
        )}

        {/* TAB 1: Context & Source of Truth */}
        {activeTab === 'context' && (
          <div className="space-y-stack-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-inline-lg">
              <div>
                <h1 className="text-heading-md font-bold text-text-default">
                  منبع حقیقت: {currentWorkspace.name}
                </h1>
                <p className="text-body-sm text-text-subtle mt-stack-xs">
                  «مبدأ منبع حقیقت کسب‌وکار توست. هر کار از اون شروع می‌شه و هر خروجی به اون برمی‌گرده.»
                </p>
              </div>

              <Button variant="secondary" iconStart="Package" onClick={() => setIsPacksOpen(true)}>بسته‌های Context</Button>
              <SegmentedControl
                label="نمای منبع حقیقت"
                value={contextViewMode}
                onChange={(id) => setContextViewMode((id === 'map' ? 'canvas' : id) as 'doc' | 'read' | 'table' | 'canvas')}
                items={[
                  { id: 'doc', label: 'ساختار', icon: 'FolderTree' },
                  { id: 'read', label: 'سند', icon: 'BookOpen' },
                  { id: 'table', label: 'جدول', icon: 'Table2' },
                  { id: 'canvas', label: 'بوم', icon: 'Workflow' },
                ]}
              />
            </div>

            <div id="context-view" style={{ scrollMarginTop: 80 }} />
            {contextViewMode === 'read' ? (
              <DocReader
                markdown={contextToMarkdown({ nodes, objects: workspaceContexts, title: currentWorkspace.name })}
                fileName={currentWorkspace.name}
                empty={<EmptyState icon="Inbox" title="هنوز دانشی ثبت نشده است" />}
              />
            ) : contextViewMode === 'doc' ? (
              <ContextTreeDocView
                objects={workspaceContexts}
                nodes={nodes}
                notes={data.notes}
                files={data.files}
                extractingNoteId={extractingNoteId}
                onSelectObject={(obj) => openContext(obj)}
                onAddNewToNode={(nodeId) => openContext(null, nodeId)}
                onNodeAction={setNodeDialog}
                onChatWithNode={(nodeId) => { setChatScope(nodeId); setActiveTab('chat'); }}
                onReadNode={setReadNodeId}
                onShowEffect={setEffectNodeId}
                thinking={thinking}
                onConvertItem={handleConvertItem}
                onSplitNote={handleSplitNote}
                samples={data.samples ?? []}
                onDeleteSamples={handleDeleteSamples}
                onSaveAsTemplate={(nodeId) => setTemplateDraft({ kind: 'node', sourceId: nodeId, name: nodes.find((n) => n.id === nodeId)?.label ?? '' })}
                onOpenStarters={() => setIsStarterOpen(true)}
                onOpenThread={setThreadNodeId}
                onAddNote={handleAddNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                onExtractNote={handleExtractNote}
              />
            ) : contextViewMode === 'canvas' ? (
              <ContextCanvas
                nodes={nodes}
                objects={workspaceContexts}
                relationships={data?.relationships ?? []}
                deliverables={deliverables}
                notes={data?.notes ?? []}
                canvas={data?.canvas ?? { decisions: [], free: [] }}
                reviewIds={reviewIdSet}
                staleAssetIds={staleIdSet}
                onMove={handleCanvasMove}
                onConnect={handleCanvasConnect}
                onSetDependencies={handleSetDependencies}
                onCreateNote={handleFreeNoteCreate}
                onMoveNote={handleFreeNoteMove}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                onNoteToKnowledge={handleNoteToKnowledge}
                onPlaceObject={handlePlaceObject}
                onUnplaceObject={handleUnplaceObject}
                onAutoLayout={handleAutoLayout}
                onAcceptReview={(id) => handleAcceptReview(id, true)}
                onOpenObject={(obj) => openContext(obj)}
                onOpenAssets={() => setActiveTab('assets')}
                onAddKnowledge={() => openContext(null)}
              />
            ) : (
              <ContextTableView
                objects={workspaceContexts}
                nodes={nodes}
                onSelectObject={(obj) => openContext(obj)}
                onAddNew={() => openContext(null)}
                samples={data.samples ?? []}
              />
            )}

            <FilesPanel
              files={data.files}
              nodes={nodes}
              quota={quota}
              credits={currentWorkspace.creditsRemaining}
              byok={ai.byok}
              onUpload={handleUploadFile}
              onProcess={handleProcessFile}
              onDelete={handleDeleteFile}
            />
          </div>
        )}

        {/* TAB 2: Workstreams & Gap Engine */}
        {activeTab === 'workstreams' && specs.length === 0 && (
          <EmptyState
            icon="Layers"
            title="این فضا هنوز جریان کاری ندارد"
            description="از کتابخانه یک جریان آماده بردار یا خودت یکی بساز."
            action={<div className="flex flex-wrap justify-center gap-inline-md"><Button variant="secondary" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button><Button variant="secondary" iconStart="Plus" onClick={() => openSpecEditor()}>جریان کار تازه</Button></div>}
          />
        )}
        {activeTab === 'workstreams' && specs.length > 0 && (
          <WorkstreamStudio
            currentWorkspace={currentWorkspace}
            allContextObjects={workspaceContexts}
            allDeliverables={deliverables}
            specs={specs}
            stale={stale}
            nodes={nodes}
            selectedSpecId={selectedSpecId}
            onSelectSpecId={setSelectedSpecId}
            onOpenSpecEditor={openSpecEditor}
            judgments={data.judgments}
            onJudge={handleJudge}
            onSaveTemplate={(spec) => setTemplateDraft({ kind: 'workstream', sourceId: spec.id, name: spec.title })}
            onAddContextObject={handleSaveContextObject}
            onSaveDeliverable={handleSaveDeliverable}
            pendingRebuild={pendingRebuild}
            onPendingRebuildHandled={() => setPendingRebuild(null)}
            onOpenContextModal={(obj) => openContext(obj)}
            onOpenLedger={() => setActiveTab('ledger')}
            onOpenPack={setPackTarget}
            onOpenImport={() => setIsImportOpen(true)}
            onOpenAiSettings={() => setIsAiSettingsOpen(true)}
          />
        )}

        {/* TAB 3: Smart Chat */}
        {activeTab === 'chat' && (
          <div className="space-y-stack-sm">
            <SmartChat
              key={`${currentWorkspace.id}:${chatScope ?? ''}`}
              currentWorkspace={currentWorkspace}
              allContextObjects={workspaceContexts}
              nodes={nodes}
              initialSessions={data.sessions}
              initialScopeNodeId={chatScope}
              onSaveSession={(sess: ChatSession) => { void attempt(() => dataApi.saveSession(wid, sess)).then((r) => { if (r) patch((d) => ({ ...d, sessions: d.sessions.some((x) => x.id === sess.id) ? d.sessions.map((x) => (x.id === sess.id ? sess : x)) : [sess, ...d.sessions] })); }); }}
              onDeleteSession={(id) => { void attempt(() => dataApi.deleteSession(wid, id)).then(() => patch((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== id) }))); }}
              onAddContextObject={handleSaveContextObject}
              onIncrementChatCount={handleIncrementChatCount}
              onOpenContextModal={(obj) => openContext(obj)}
              onSaveBlockAsAsset={handleSaveBlockAsAsset}
              onRecordChatUsage={handleRecordChatUsage}
              onOpenAiSettings={() => setIsAiSettingsOpen(true)}
            />
          </div>
        )}

        {/* TAB 4: Asset Library */}
        {activeTab === 'assets' && (
          <AssetLibrary
            currentWorkspace={currentWorkspace}
            deliverables={deliverables}
            allContextObjects={workspaceContexts}
            stale={stale}
            onGoToWorkstreams={() => setActiveTab('workstreams')}
            workstreams={specs}
            onOpenContextModal={(obj) => openContext(obj)}
            onExtractKnowledge={handleExtractFromAsset}
            extractingId={extractingAssetId}
            onRebuild={(del) => {
              setSelectedSpecId(del.workstreamId);
              setPendingRebuild(del);
              setActiveTab('workstreams');
            }}
          />
        )}

        {/* TAB 5: Ledger & Economics */}
        {activeTab === 'ledger' && (
          <LedgerPanel
            currentWorkspace={currentWorkspace}
            ledgerEntries={ledgerEntries}
            onChangePlan={handleChangePlan}
            onAddCredits={handleAddCredits}
            onOpenPlans={() => setIsPlanModalOpen(true)}
          />
        )}
      </main>
      </div>

      {/* Context Object Add/Edit Modal */}
      <ContextDetailModal
        isOpen={isContextModalOpen}
        object={selectedContextObject}
        onClose={() => setIsContextModalOpen(false)}
        onSave={handleSaveContextObject}
        onSupersede={handleSupersedeContext}
        onArchive={handleArchiveContext}
        nodes={nodes}
        workspaceId={currentWorkspace.id}
        defaultNodeId={modalDefaultNodeId}
        allObjects={workspaceContexts}
        metrics={metrics}
        relationships={data?.relationships ?? []}
        onSetDependencies={handleSetDependencies}
        reviewNeed={selectedContextObject ? reviewNeeds.get(selectedContextObject.id) : undefined}
        titleOf={(id) => workspaceContexts.find((o) => o.id === id)?.title ?? id}
        onAcceptReview={handleAcceptReview}
        deliverables={deliverables}
        onOpenRelated={(o) => openContext(o)}
        onPatchObject={handlePatchObject}
      />

      <NodeDialogs
        state={nodeDialog}
        nodes={nodes}
        objects={workspaceContexts}
        notes={data.notes}
        onClose={() => setNodeDialog(null)}
        workspaceId={wid}
        onCreate={async (parentId, label, description) => {
          const r = await attempt(() => dataApi.createNode(wid, { parentId, label, description }));
          if (!r) throw new Error('create failed');
          patch((d) => ({ ...d, nodes: r.nodes }));
          return r.node.id;
        }}
        onOpenCoach={(nodeId) => setNodeDialog({ kind: 'coach', nodeId })}
        onSaveProposals={handleSaveProposals}
        onLedger={setLedger}
        onOpenAiSettings={() => setIsAiSettingsOpen(true)}
        onRename={(nodeId, label, description) => nodeOp(() => dataApi.renameNode(wid, nodeId, { label, description }))}
        onMove={(nodeId, parentId) => nodeOp(() => dataApi.moveNode(wid, nodeId, parentId))}
        onDelete={(nodeId, transferTo) => nodeOp(() => dataApi.deleteNode(wid, nodeId, transferTo))}
      />

      {currentWorkspace && <SpecLibraryDialog open={isSpecLibraryOpen} workspace={currentWorkspace} onClose={() => setIsSpecLibraryOpen(false)} onChange={handleSetLibrarySpecs} onApplyTemplate={handleApplyTemplate} nodes={nodes.map((n) => ({ id: n.id, label: n.label }))} />}

      <QuickStartDialog
        open={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        workspaceId={wid}
        onImported={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))}
        onCreateObjects={(items) => { ensureLibrarySpec('main_positioning'); return handleCreateObjects(items); }}
        onConfirmMany={async (ids) => { for (const id of ids) await setStatus(id, 'Confirmed'); }}
        onSampleDone={(firstDeliverable) => {
          ensureLibrarySpec('main_positioning');
          void (async () => {
            if (!(await persistDeliverable(firstDeliverable))) return;
            if (firstDeliverable.usage) {
              await persistLedger(ledgerEntryFromUsage({ workspaceId: wid, action: 'خروجی نمونهٔ شروع سریع', mode: 'auto', creditCost: 0, usage: firstDeliverable.usage, plan: firstDeliverable.plan, id: `led_onb_${Date.now()}` }));
            }
          })();
        }}
        onOpenAiSettings={() => setIsAiSettingsOpen(true)}
      />

      {/* Plan Selection Modal (Starter / Pro / Max - F6) */}
      <PlanSelectionModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        currentWorkspace={currentWorkspace}
        onSelectPlan={(pid) => {
          handleChangePlan(pid);
          setIsPlanModalOpen(false);
        }}
      />

      {/* Account Modal (F1 - Mobile OTP, JSON Data Export, 30-day Deletion) */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        currentWorkspace={currentWorkspace}
        onExportAllData={handleExportAllData}
        onDeleteAccount={handleDeleteAccount}
        onOpenAiSettings={() => {
          setIsAccountModalOpen(false);
          setIsAiSettingsOpen(true);
        }}
        onOpenConnect={() => setIsConnectOpen(true)}
      />

      {/* Custom Spec Modal (F8) */}
      <SpecEditorModal
        key={editingSpec?.id ?? 'new'}
        isOpen={isCustomSpecModalOpen}
        onClose={() => setIsCustomSpecModalOpen(false)}
        planId={currentWorkspace.planId}
        nodes={nodes}
        specs={specs}
        initial={editingSpec}
        onUpgrade={() => setIsPlanModalOpen(true)}
        onSaveSpec={async (newSpec) => {
          const ok = await addSpec(newSpec);
          if (ok) { setSelectedSpecId(newSpec.id); setActiveTab('workstreams'); }
          return ok;
        }}
      />

      <NodeEffectDialog
        nodeId={effectNodeId}
        nodes={nodes}
        objects={workspaceContexts}
        relationships={data?.relationships ?? []}
        onClose={() => setEffectNodeId(null)}
        onOverride={async (byId, targetId, reason) => {
          const r = await dataApi.setOverride(wid, byId, targetId, reason);
          patch((d) => ({ ...d, relationships: r.relationships, changes: r.changes }));
          toast.show({ intent: 'success', message: 'کنار گذاشته شد؛ برای این گره و زیرشاخه‌هایش دیگر اثر ندارد.' });
        }}
        onRemoveOverride={async (byId, targetId) => {
          const r = await attempt(() => dataApi.removeOverride(wid, byId, targetId));
          if (r) patch((d) => ({ ...d, relationships: r.relationships, changes: r.changes }));
        }}
        onAddToNode={(nodeId) => { setEffectNodeId(null); openContext(null, nodeId); }}
        onOpenObject={(o) => { setEffectNodeId(null); openContext(o); }}
      />
      <NodeReaderDialog nodeId={readNodeId} nodes={nodes} objects={workspaceContexts} onClose={() => setReadNodeId(null)} />
      <StarterDialog open={isStarterOpen} samplesCount={data?.samples?.length ?? 0} onClose={() => setIsStarterOpen(false)} onApply={handleApplyStarter} onRemoveAll={() => handleDeleteSamples()} />
      <Dialog
        open={!!templateDraft}
        onClose={() => setTemplateDraft(null)}
        size="sm"
        title="ذخیره به‌عنوان قالب"
        footer={<><Button variant="ghost" onClick={() => setTemplateDraft(null)}>انصراف</Button><Button variant="primary" disabled={!templateDraft?.name.trim()} onClick={handleSaveTemplate}>ذخیرهٔ قالب</Button></>}
      >
        <div className="flex flex-col gap-stack-sm">
          <TextField label="نام قالب" value={templateDraft?.name ?? ''} onChange={(e) => setTemplateDraft((d) => (d ? { ...d, name: e.target.value } : d))} />
          <p className="body-sm text-text-subtle">{templateDraft?.kind === 'node' ? 'گره، زیرگره‌ها و دانش تأییدشدهٔ داخلش ذخیره می‌شود؛ هر جا بیاوری، دانش‌ها «نمونهٔ خاکستری» می‌شوند.' : 'خودِ جریان کار (هدف، موارد لازم و خروجی‌ها) ذخیره می‌شود.'}</p>
        </div>
      </Dialog>
      <SavedPacksDialog open={isPacksOpen} workspaceId={wid} nodes={nodes} objects={workspaceContexts} onClose={() => setIsPacksOpen(false)} />
      <ContextPackDialog workspaceId={wid} target={packTarget} onClose={() => setPackTarget(null)} onOpenImport={() => setIsImportOpen(true)} />
      <ImportAnswerDialog open={isImportOpen} workspaceId={wid} onClose={() => setIsImportOpen(false)} onProposeContext={handleProposeFromImport} onSaveAsset={persistDeliverable} />
      <MemoryImportDialog open={isMemoryOpen} workspaceId={wid} onClose={() => setIsMemoryOpen(false)} onImported={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))} />
      <Dialog
        open={demoConfirm}
        onClose={() => setDemoConfirm(false)}
        size="sm"
        title="بازنشانی فضای نمونه؟"
        footer={<><Button variant="ghost" onClick={() => setDemoConfirm(false)}>انصراف</Button><Button variant="primary" loading={demoBusy} onClick={handleResetDemo}>بازنشانی</Button></>}
      >
        <p className="body-md text-text-default">همهٔ داده‌های «فضای نمونه» (دانش، یادداشت، دارایی، تاریخچه) پاک و از نو ساخته می‌شود. فضاهای دیگرت دست نمی‌خورند.</p>
      </Dialog>

      <MetricsDialog
        open={metricsOpen}
        onClose={() => setMetricsOpen(false)}
        metrics={metrics}
        measurements={measurements}
        objects={workspaceContexts}
        changes={data?.changes ?? []}
        {...metricHandlers}
        onOpenObject={(o) => { setMetricsOpen(false); openContext(o); }}
      />
      <WeeklyReviewDialog
        open={weeklyOpen}
        onClose={() => setWeeklyOpen(false)}
        data={weekly}
        readiness={readinessPerWorkstream([...(data?.specs ?? []), ...enabledLibrary.filter((s) => !(data?.specs ?? []).some((x) => x.id === s.id))], workspaceContexts, data?.relationships ?? [])}
        objects={workspaceContexts}
        deliverables={deliverables}
        onAcceptReview={async (id) => { await handleAcceptReview(id, true); }}
        onConfirm={async (id) => { await setStatus(id, 'Confirmed'); }}
        onOpenObject={(o) => { setWeeklyOpen(false); openContext(o); }}
        dueProps={dueProps}
        metricsEntry={{ metrics, measurements, onSubmit: metricHandlers.onRecord, onCsv: metricHandlers.onCsv }}
        onDone={async () => { const r = await attempt(() => dataApi.weeklyReviewDone(wid)); if (r) patch((d) => ({ ...d, weeklyReviewAt: r.weeklyReviewAt })); }}
      />
      <NodeThreadPanel
        open={!!threadNodeId}
        workspaceId={wid}
        node={nodes.find((n) => n.id === threadNodeId) ?? null}
        onClose={() => setThreadNodeId(null)}
        onProposed={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))}
        onSummary={(note, ledger) => patch((d) => ({ ...d, notes: [note, ...d.notes], ledger }))}
      />
      <ConnectAiModal open={isConnectOpen} workspaceId={wid} planId={currentWorkspace.planId} onClose={() => setIsConnectOpen(false)} onUpgrade={() => setIsPlanModalOpen(true)} />

      <AiSettingsModal isOpen={isAiSettingsOpen} onClose={() => setIsAiSettingsOpen(false)} />

      {/* New workspace dialog */}
      <Dialog
        open={isNewWorkspaceModalOpen}
        onClose={() => setIsNewWorkspaceModalOpen(false)}
        size="sm"
        title="ایجاد فضای کاری جدید"
        description="هر فضای کاری داده‌های منبع حقیقت، دارایی‌ها و تاریخچهٔ جداگانه‌ای دارد."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsNewWorkspaceModalOpen(false)}>انصراف</Button>
            <Button variant="primary" type="submit" form="new-workspace-form">ایجاد فضای کاری</Button>
          </>
        }
      >
        <form id="new-workspace-form" onSubmit={handleCreateWorkspace}>
          <TextField
            label="نام فضای کاری یا نام برند"
            required
            placeholder="مثلاً: استودیو دیزاین نوین"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
          />
        </form>
      </Dialog>

    </div>
  );
}
