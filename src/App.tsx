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
  ThoughtKind,
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
import { DocWorkspace } from './components/DocWorkspace';
import { approvalsOf } from './core/versionHistory';
import { AttentionPanel } from './components/AttentionPanel';
import { NodeReaderDialog } from './components/NodeReaderDialog';
import { NodeEffectDialog } from './components/NodeEffectDialog';
import { DueItems } from './components/DueItems';
import { SavedPacksDialog } from './components/SavedPacksDialog';
import { AiRequestDialog } from './components/AiRequestDialog';
import { CommandPalette } from './components/CommandPalette';
import { UsageDialog } from './components/UsageDialog';
import { track } from './services/usage';
import { buildSearchIndex } from './core/globalSearch';
import type { SearchHit } from './core/globalSearch';
import { StarterDialog } from './components/StarterDialog';
import { ThinkingList } from './components/ThinkingList';
import { assumptionsDue, decisionsDue } from './core/assumptions';
import { thoughtItem, convertedTo } from './core/thinkingMarkers';
import type { NoteThinkingItem } from './core/thinkingMarkers';
import { ContextDetailModal } from './components/ContextDetailModal';
import { NodeDialogs } from './components/NodeDialogs';
import type { NodeDialogState } from './components/NodeDialogs';
import { FilesPanel } from './components/FilesPanel';
import { ProposalInbox } from './components/ProposalInbox';
import { ContextPackDialog } from './components/ContextPackDialog';
import type { PackTarget } from './components/ContextPackDialog';
import { ImportAnswerDialog } from './components/ImportAnswerDialog';
import { ChangesPanel } from './components/ChangesPanel';
import { ThinkingSpace } from './components/ThinkingSpace';
import { ThoughtDialog } from './components/ThoughtDialog';
import { DecisionOptionsDialog } from './components/DecisionOptionsDialog';
import { TruthCompareDialog } from './components/TruthCompareDialog';
import type { CompareMode } from './components/TruthCompareDialog';
import { optionsOf, recordOfChoice } from './core/decisionOptions';
import { sectionNameFromThought } from './core/thoughts';
import type { AboutTarget } from './core/thoughtAbout';
import { thinkingSpace } from './core/thinkingSpace';
import { flipFlops, needsReview, planDecisions, waitingDecisions } from './core/decisionGraph';
import { orderWaitingByStructure } from './core/decisionOrder';
import { buildInheritNotices } from './core/inheritNotice';
import { InheritNoticeList } from './components/InheritNoticeList';
import { WeeklyReviewDialog } from './components/WeeklyReviewDialog';
import { MetricsDialog } from './components/MetricsDialog';
import { expectationRows, expectationsDue, metricsWithoutRecentNumber, verdictTally } from './core/metrics';
import { MX } from './core/metricsText';
import { acceptanceSentence, buildWeeklyReview, outputsUsing, readinessPerWorkstream, reviewDue } from './core/weeklyReview';
import { NodeThreadPanel } from './components/NodeThreadPanel';
import { KnowledgeBatchDialog } from './components/KnowledgeBatchDialog';
import { MemoryImportDialog } from './components/MemoryImportDialog';
import { WorkstreamStudio } from './components/WorkstreamStudio';
import { SmartChat } from './components/SmartChat';
import { AssetLibrary } from './components/AssetLibrary';
import { LedgerPanel } from './components/LedgerPanel';
import { QuickStartDialog } from './components/QuickStartDialog';
import { SpecLibraryDialog } from './components/SpecLibraryDialog';
import { PlanSelectionModal } from './components/PlanSelectionModal';
import { AccountModal, WIPE_WORDS } from './components/AccountModal';
import { ArchiveDialog } from './components/ArchiveDialog';
import { DangerDialog } from './components/Removal';
import { SpecEditorModal } from './components/SpecEditorModal';
import { PLANS, chatCountToday, tehranDay } from './core/creditEngine';
import { enabledBuiltInSpecs, currentSpecIds } from './core/specs';
import { WorkstreamSpec } from './types';
import { Checkbox, Alert, Button, Card, Dialog, EmptyState, Icon, IconButton, Menu, SegmentedControl, Spinner, TextField, formatNumber, useToast } from './ui';
import { HomeTodo } from './components/HomeTodo';
import { effectiveObjects } from './core/effectiveContext';
import { defaultNodeId, resolveNodeId, subtreeIds } from './core/nodeTree';
import { pathTo } from './core/nodeFocus';
import { homeActions } from './core/homeActions';
import type { HomeAction } from './core/homeActions';
import { visibleFeatures } from './core/visibleFeatures';
import { AiStatusBanner } from './components/AiNotices';
import { ledgerEntryFromUsage } from './core/ledger';
import { titleFromMarkdown } from './core/blocks';
import { chatCredits } from './core/creditEngine';
import { contextDraftFromBlock } from './core/blocks';
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
      setCurrentWorkspaceId((cur) => (list.some((w) => w.id === cur && !w.archivedAt) ? cur : list.find((w) => !w.archivedAt)?.id ?? ''));
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

  /** archived workspaces are out of the menu (nothing is deleted); the list the app works with is the live one */
  const liveWorkspaces = workspaces.filter((w) => !w.archivedAt);
  const currentWorkspace = (data?.workspace.id === currentWorkspaceId ? data.workspace : undefined) ?? liveWorkspaces.find((w) => w.id === currentWorkspaceId) ?? liveWorkspaces[0];
  // the workspace she was in was archived or deleted: go to another one (or to the empty start)
  useEffect(() => { if (boot.status === 'ready' && currentWorkspaceId && !liveWorkspaces.some((w) => w.id === currentWorkspaceId)) { setData(null); setCurrentWorkspaceId(liveWorkspaces[0]?.id ?? ''); } }, [workspaces, currentWorkspaceId, boot.status]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // «فکر» is its own destination (not a view of the truth): a list to review and decide, and a canvas to think on
  const [thinkingView, setThinkingView] = useState<'list' | 'canvas'>('list');
  /** a new value makes the truth map show what is on its way (the thinking space asks «اگر همه را تأیید کنم؟») */
  const [previewNonce, setPreviewNonce] = useState(0);
  // map and board are far below the attention panel and the inbox: switching to one brings it into view (not on first render)
  const viewModeSeen = useRef(contextViewMode);
  useEffect(() => {
    if (viewModeSeen.current === contextViewMode) return;
    viewModeSeen.current = contextViewMode;
    if (contextViewMode === 'canvas') setTimeout(() => document.getElementById('context-view')?.scrollIntoView({ block: 'start' }), 30);
  }, [contextViewMode]);
  // a new destination opens at its top (the scroll of the previous page must not carry over)
  const tabSeen = useRef(activeTab);
  useEffect(() => { if (tabSeen.current === activeTab) return; tabSeen.current = activeTab; window.scrollTo({ top: 0 }); }, [activeTab]);
  const [selectedContextObject, setSelectedContextObject] = useState<ContextObject | null>(null);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [modalDefaultNodeId, setModalDefaultNodeId] = useState('');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isSpecLibraryOpen, setIsSpecLibraryOpen] = useState(false);
  const [isPacksOpen, setIsPacksOpen] = useState(false);
  const approvals = useMemo(() => approvalsOf(data?.changes ?? []), [data?.changes]);
  /** «درخواست برای AI»: open + the node it is about ('' = the whole tree) */
  const [aiRequest, setAiRequest] = useState<{ scopeNodeId: string; kind?: import('./core/aiRequest').RequestKind; request?: string; thoughtIds?: string[] } | null>(null);
  const [isStarterOpen, setIsStarterOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{ kind: 'node' | 'workstream'; sourceId: string; name: string } | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCustomSpecModalOpen, setIsCustomSpecModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<WorkstreamSpec | undefined>(undefined);
  const [isNewWorkspaceModalOpen, setIsNewWorkspaceModalOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState>(null);
  const [extractingNoteId, setExtractingNoteId] = useState<string | null>(null);
  const [chatScope, setChatScope] = useState<string | undefined>(undefined);
  const [packTarget, setPackTarget] = useState<PackTarget | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [readNodeId, setReadNodeId] = useState<string | null>(null);
  const [effectNodeId, setEffectNodeId] = useState<string | null>(null);
  const [threadNodeId, setThreadNodeId] = useState<string | null>(null);
  const [pendingRebuild, setPendingRebuild] = useState<GeneratedDeliverable | null>(null);

  const nodes = data?.nodes ?? [];
  const workspaceContexts = data?.objects ?? [];
  // the old «گفتگو» destination: it left the navigation; anything that still points to it lands in «درخواست برای AI»
  useEffect(() => { if (activeTab === 'chat') { setActiveTab('home'); setAiRequest({ scopeNodeId: chatScope ?? '' }); } }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── global search (Ctrl/⌘+K): the index is built once per data change; notes are for DISPLAY here, never for an AI ──
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [homeAllOpen, setHomeAllOpen] = useState(false);
  const [canvasReveal, setCanvasReveal] = useState<{ id: string; n: number } | null>(null);
  const [savedPackCount, setSavedPackCount] = useState(0);
  const [focusNotes, setFocusNotes] = useState<{ nodeId: string; n: number } | null>(null);
  const [focusAsset, setFocusAsset] = useState<{ id: string; n: number } | null>(null);
  const searchIdx = useMemo(() => buildSearchIndex({ nodes, objects: workspaceContexts, deliverables: data?.deliverables ?? [], notes: data?.notes ?? [] }), [nodes, workspaceContexts, data?.deliverables, data?.notes]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); setPaletteOpen((o) => !o); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  /** scroll to an element that appears after a tab / view change (it may take a moment to mount) */
  // «واردِ یک بخش شدن»: the focused section lives in history (#node=…), so the browser / phone back button, a direct link and reload all work
  const nodeFromUrl = () => { try { const m = /#node=([^&]+)/.exec(window.location.hash); return m ? decodeURIComponent(m[1]) : null; } catch { return null; } };
  const [focusNodeId, setFocusNodeId] = useState<string | null>(nodeFromUrl);
  const urlOf = (id: string | null) => (id ? `#node=${encodeURIComponent(id)}` : window.location.pathname + window.location.search);
  /** every state remembers where it came FROM, so «برگشت» (the arrow, the phone's back, the browser's back) climbs one level instead of leaving */
  const pushFocus = (id: string | null, prev: string | null) => { try { window.history.pushState({ node: id, prev }, '', urlOf(id)); } catch { /* optional */ } };
  const goFocus = (id: string | null) => {
    const cur = focusNodeId;
    if (id === cur) return;
    const st = window.history.state as { node?: string | null; prev?: string | null } | null;
    // «برگشت» to the place we just came from IS the browser's back (so the history stays a clean path, no loop)
    if (st && st.node === cur && (st.prev ?? null) === id) { try { window.history.back(); return; } catch { /* fall through */ } }
    setFocusNodeId(id);
    if (!id) pushFocus(null, cur);
    else if ((nodes.find((n) => n.id === id)?.parentId ?? null) === (cur ?? null)) pushFocus(id, cur); // one level in
    else {
      // a jump (search, a link, a far breadcrumb): the levels in between go into the history, so back climbs one level at a time
      const path = pathTo(nodes, id).map((c) => c.id);
      let prev: string | null = cur && path.includes(cur) ? cur : null;
      for (const step of path.slice(prev ? path.indexOf(prev) + 1 : 0)) { pushFocus(step, prev); prev = step; }
    }
    window.scrollTo({ top: 0 });
  };
  // a direct link to a deep section: rebuild the path under it once the tree is known, so «back» climbs instead of leaving the app
  const climbedRef = React.useRef(false);
  useEffect(() => {
    if (climbedRef.current || !nodes.length || !focusNodeId) return;
    const path = pathTo(nodes, focusNodeId).map((c) => c.id);
    if (!path.length) return; // the section is not in this workspace's tree (yet): wait
    climbedRef.current = true;
    if (path.length < 2) return;
    try { window.history.replaceState({ node: null, prev: null }, '', window.location.pathname + window.location.search); } catch { return; }
    let prev: string | null = null;
    for (const step of path) { pushFocus(step, prev); prev = step; }
  }, [nodes, focusNodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const on = () => setFocusNodeId(nodeFromUrl()); window.addEventListener('popstate', on); return () => window.removeEventListener('popstate', on); }, []);
  // while we are INSIDE a section, the thinking space and the canvases show only that section and what is under it (one tap on the chip shows all again)
  const focusSection = focusNodeId ? nodes.find((n) => n.id === focusNodeId) : undefined;
  const focusScope = useMemo(() => (focusSection ? new Set(subtreeIds(nodes, focusSection.id)) : null), [focusSection, nodes]);
  const [spaceNodeSeen, setSpaceNodeSeen] = useState<string | null>(null);
  useEffect(() => { if (focusNodeId !== spaceNodeSeen) { setSpaceNodeSeen(focusNodeId); setSpaceNode(focusNodeId ?? undefined); } }, [focusNodeId, spaceNodeSeen]);
  const revealWhenThere = (id: string) => { let tries = 0; const t = setInterval(() => { const el = document.getElementById(id); if (el || ++tries > 20) { clearInterval(t); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }); } }, 60); };
  const deliverables = (data?.deliverables ?? []).filter((d) => !d.archivedAt); // archived outputs are out of every list and count (the archive shows them)
  const ledgerEntries = data?.ledger ?? [];
  const stale = data?.stale ?? [];
  // derived, never stored: dependents whose dependency changed after they were last written or reviewed
  const reviewNeeds = useMemo(() => needsReview(data?.objects ?? [], data?.relationships ?? [], data?.changes ?? []), [data?.objects, data?.relationships, data?.changes]);
  const reviewIdSet = useMemo(() => new Set(reviewNeeds.keys()), [reviewNeeds]);
  const staleIdSet = useMemo(() => new Set((data?.stale ?? []).map((s) => s.deliverableId)), [data?.stale]);
  // the order of waiting decisions: dependencies first (decisionGraph), then — only among equals — the upper section's item before its sub-sections'
  const waitingOrdered = useMemo(() => {
    const objs = data?.objects ?? [];
    const plan = planDecisions(objs, data?.relationships ?? []);
    const o = orderWaitingByStructure(waitingDecisions(plan), plan, objs, nodes);
    return { waiting: o.waiting, structure: Object.fromEntries([...o.below].map(([id, b]) => [id, b.length])) as Record<string, number> };
  }, [data?.objects, data?.relationships, nodes]);
  const waiting = waitingOrdered.waiting;
  // «دیدم» for the calm inheritance news is remembered on this device only
  const [inheritSeen, setInheritSeen] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('mabda.inherit.seen') ?? '[]') as string[]; } catch { return []; } });
  const markInheritSeen = (key: string) => setInheritSeen((cur) => { const next = [...cur, key].slice(-200); try { localStorage.setItem('mabda.inherit.seen', JSON.stringify(next)); } catch { /* optional */ } return next; });
  const inheritNotices = useMemo(() => buildInheritNotices({ changes: data?.changes ?? [], objects: data?.objects ?? [], nodes, relationships: data?.relationships ?? [], seen: inheritSeen }), [data?.changes, data?.objects, data?.relationships, nodes, inheritSeen]);
  const flips = useMemo(() => flipFlops(data?.objects ?? [], data?.changes ?? []), [data?.objects, data?.changes]);
  const weekly = useMemo(() => buildWeeklyReview({ objects: data?.objects ?? [], relationships: data?.relationships ?? [], changes: data?.changes ?? [], deliverables: data?.deliverables ?? [], nodes }), [data?.objects, data?.relationships, data?.changes, data?.deliverables, nodes]);
  const weeklyDue = reviewDue(data?.weeklyReviewAt, weekly);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [compare, setCompare] = useState<{ mode: CompareMode; scopeNodeId?: string } | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);
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
    switch (hit.id) {
      case 'record': openContext(null); break;
      case 'thought': setThoughtDialog({}); break;
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

  // ── thinking items (derived from note lines; src/core/thinkingMarkers.ts) ──
  const thinking = useMemo(() => (data?.thoughts ?? []).map(thoughtItem).filter((t): t is NoteThinkingItem => !!t), [data?.thoughts]);
  /** «N فکر باز» per node: open thoughts + what waits for approval (one pass, not one per node) */
  const openCounts = useMemo(() => {
    const m = new Map<string, number>();
    const v = thinkingSpace({ objects: workspaceContexts, notes: data?.notes ?? [], thoughts: thinking, nodes });
    for (const w of v.waiting) m.set(w.object.nodeId, (m.get(w.object.nodeId) ?? 0) + 1);
    for (const t of v.thoughts) m.set(t.nodeId, (m.get(t.nodeId) ?? 0) + 1);
    return m;
  }, [workspaceContexts, data?.notes, nodes]);
  const handleConvertItem = async (item: NoteThinkingItem, type: ContextObject['type']) => {
    if (!item.id) return;
    const r = await attempt(() => dataApi.convertThinkingItem(wid, item.id!, type));
    if (!r) return;
    patch((d) => ({ ...d, objects: r.objects, thoughts: r.thoughts }));
    toast.show({ intent: 'success', message: 'به‌صورت پیشنهادی ثبت شد؛ در صندوق پیشنهادها منتظر تأیید توست و فکر به‌تنهایی حقیقت نمی‌شود.' });
  };
  const handleReviseThought = async (item: NoteThinkingItem, text: string, kind: ThoughtKind): Promise<boolean> => {
    if (!item.id) return false;
    if (text !== item.text) {
      const r = await attempt(() => dataApi.reviseThought(wid, item.id!, text));
      if (!r) return false;
      patch((d) => ({ ...d, thoughts: d.thoughts.map((t) => t.id === item.id ? r.thought : t) }));
    }
    if (kind !== item.kind) {
      const r = await attempt(() => dataApi.reclassifyThought(wid, item.id!, kind));
      if (!r) return false;
      patch((d) => ({ ...d, thoughts: d.thoughts.map((t) => t.id === item.id ? r.thought : t) }));
    }
    toast.show({ intent: 'success', message: 'فکر به‌روزرسانی شد؛ شناسه و پیوندهایش حفظ شدند.' });
    return true;
  };
  const handleDeriveThought = async (item: NoteThinkingItem, text: string, kind: ThoughtKind): Promise<boolean> => {
    if (!item.id) return false;
    const r = await attempt(() => dataApi.deriveThought(wid, { parentIds: [item.id!], nodeId: item.nodeId, kind, text }));
    if (!r) return false;
    patch((d) => ({ ...d, thoughts: [...d.thoughts, r.thought] }));
    toast.show({ intent: 'success', message: 'فکر تازه ساخته شد؛ فکر مبدأ دست‌نخورده ماند.' });
    return true;
  };
  const handleSynthesizeThought = async (parentIds: string[], nodeId: string, kind: ThoughtKind, text: string): Promise<boolean> => {
    const r = await attempt(() => dataApi.deriveThought(wid, { parentIds, nodeId, kind, text }));
    if (!r) return false;
    patch((d) => ({ ...d, thoughts: [...d.thoughts, r.thought] }));
    toast.show({ intent: 'success', message: `فکر ترکیبی از ${formatNumber(parentIds.length)} فکر ساخته شد؛ فکرهای مبدأ دست‌نخورده ماندند.` });
    return true;
  };
  const startThoughtAi = (ids: string[]) => {
    const selected = thinking.filter((t) => t.id && ids.includes(t.id));
    if (!selected.length) return;
    setAiRequest({
      scopeNodeId: '',
      kind: 'audit',
      request: selected.some((t) => t.kind === 'assumption')
        ? 'این فکرهای تأییدنشده را با دانش تأییدشدهٔ مرتبط بسنج و فرض‌هایشان را به چالش بکش؛ چه چیزی پشتوانه یا خلافشان است؟'
        : 'این فکرهای تأییدنشده را با دانش تأییدشدهٔ مرتبط بررسی و مقایسه کن؛ چه ابهام یا ناسازگاری‌ای دارند؟',
      thoughtIds: selected.flatMap((t) => t.id ? [t.id] : []),
    });
  };
  const handleSplitNote = async (noteId: string) => {
    const r = await attempt(() => dataApi.splitNote(wid, noteId));
    if (!r) return;
    patch((d) => ({ ...d, nodes: r.nodes, notes: r.notes, thoughts: r.thoughts }));
    toast.show({ intent: 'success', message: `${formatNumber(r.created.length)} گره ساخته شد؛ یادداشت اصلی همان‌جا ماند.` });
  };
  // due: assumptions to look at again, decisions that ask «نتیجه چه شد؟»
  const dueAssumptions = useMemo(() => assumptionsDue(data?.objects ?? [], new Date()), [data?.objects]);
  const dueDecisions = useMemo(() => decisionsDue(data?.objects ?? [], data?.changes ?? [], new Date()), [data?.objects, data?.changes]);

  // ── home: what is worth doing now (three things) and which level-2 features have something in them ──
  const savedPacksWid = currentWorkspace?.id;
  useEffect(() => {
    if (!savedPacksWid) return;
    dataApi.listSavedPacks(savedPacksWid).then((r) => setSavedPackCount(r.packs.length)).catch(() => setSavedPackCount(0));
  }, [savedPacksWid, isPacksOpen, aiRequest]);
  const vf = visibleFeatures({
    now: new Date(), changes: data?.changes ?? [], relationships: data?.relationships ?? [], contradictions: contradictions.length,
    metrics: (data?.metrics ?? []).filter((m) => !m.archived).length, savedPacks: savedPackCount, proposed: workspaceContexts.filter((o) => o.status === 'Proposed').length,
  });
  const homePlan = useMemo(() => homeActions({
    now: new Date(),
    stale: stale.map((x) => ({ deliverableId: x.deliverableId, reasons: x.reasons })),
    deliverables: (data?.deliverables ?? []).map((d) => ({ id: d.id, title: d.title, createdAt: d.createdAt })),
    contradictions: contradictions.map((c) => ({ id: c.id, titleA: c.itemA.title, titleB: c.itemB.title, idA: c.itemA.id })),
    reviews: [...reviewNeeds.entries()].map(([id, need]) => ({ id, title: workspaceContexts.find((o) => o.id === id)?.title ?? id, because: need.changedDependencies.map((d) => workspaceContexts.find((o) => o.id === d.id)?.title ?? d.id) })),
    ready: waiting.ready.map((u) => ({ id: u.ids[0], title: workspaceContexts.find((o) => o.id === u.ids[0])?.title ?? u.ids[0] })),
    proposedCount: workspaceContexts.filter((o) => o.status === 'Proposed').length,
    weekly: { due: weeklyDue, changes: weekly.digest.total },
    dueCount: dueAssumptions.length + dueDecisions.length,
    openThinking: thinking.filter((i) => (i.kind === 'question' || i.kind === 'open_decision') && !convertedTo(i, workspaceContexts)).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stale, data?.deliverables, contradictions.length, reviewNeeds, waiting, weeklyDue, dueAssumptions.length, dueDecisions.length, workspaceContexts, thinking]);
  const handleHomeAct = (a: HomeAction) => {
    track('action.home-todo');
    const reveal = (id: string) => { setHomeAllOpen(true); revealWhenThere(id); };
    const t = a.target;
    if (t.type === 'asset') { setActiveTab('assets'); setFocusAsset({ id: t.id, n: Date.now() }); }
    else if (t.type === 'object') { const o = workspaceContexts.find((x) => x.id === t.id); if (o) openContext(o); }
    else if (t.type === 'weekly') setWeeklyOpen(true);
    else if (t.type === 'contradictions') reveal('contradictions');
    else if (t.type === 'proposals') reveal('proposal-inbox');
    else if (t.type === 'thinking') openThinkingSpace();
    else reveal('open-thinking'); // «due»
  };
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
    patch((d) => ({ ...d, samples: r.samples, ...(r.nodes ? { nodes: r.nodes } : {}) }));
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
      const r = await dataApi.createObject(wid, { type: dr.type, status: dr.status, provenance: dr.provenance, title: dr.title, content: dr.content, nodeId: resolveNodeId(nodes, dr.nodeId) });
      out.push(r.object);
    }
    patch((d) => ({ ...d, objects: [...out.slice().reverse(), ...d.objects] }));
    return out;
  };

  // ── boards: every action returns the pieces of state it touched ──
  const applyBundle = (r: CanvasBundle) => patch((d) => ({ ...d, objects: r.objects, relationships: r.relationships, changes: r.changes, notes: r.notes, thoughts: r.thoughts, stale: r.stale, canvas: r.canvas }));
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
    if (r) applyBundle(r);
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

  /** «تأیید و جایگزین کن» / «رد کن» for the unapproved rewrite of a confirmed knowledge */
  const handleApproveDraft = async (objectId: string) => {
    const r = await attempt(() => dataApi.approveDraft(wid, objectId));
    if (!r) return;
    patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === r.object.id ? r.object : o)), stale: r.stale }));
    showImpact(r.impact);
    void reload(wid);
  };
  const handleRejectDraft = async (objectId: string) => {
    const r = await attempt(() => dataApi.rejectDraft(wid, objectId));
    if (!r) return;
    patch((d) => ({ ...d, objects: d.objects.map((o) => (o.id === r.object.id ? r.object : o)) }));
    toast.show({ intent: 'info', message: 'پیش‌نویس رد شد؛ متن تأییدشده همان بود.' });
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

  /** «بایگانی» is the default way to take knowledge away: history, versions and sources stay; «برگرداندن» puts it back as it was */
  const handleArchiveContext = async (id: string) => {
    const o0 = workspaceContexts.find((x) => x.id === id);
    const impact = await setStatus(id, 'Archived');
    if (impact) showImpact(impact);
    if (o0) toast.show({ intent: 'success', message: `«${o0.title}» بایگانی شد؛ تاریخچه‌اش می‌ماند.`, duration: 10000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.restoreObject(wid, id)).then((r) => { if (r) patch((d) => ({ ...d, objects: d.objects.map((x) => (x.id === id ? r.object : x)), stale: r.stale })); }); } } });
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
  // «فضای فکر» (thoughts that are not truth yet) and «فکر تازه»
  const [thoughtDialog, setThoughtDialog] = useState<{ nodeId?: string; initialKind?: ThoughtKind; initialAbout?: AboutTarget[] } | null>(null);
  const [spaceNode, setSpaceNode] = useState<string | undefined>(undefined);
  const openThinkingSpace = (nodeId?: string) => { setSpaceNode(nodeId); setThinkingView('list'); setActiveTab('thinking'); };
  const previewTruth = () => { setPreviewNonce((n) => n + 1); setActiveTab('context'); setContextViewMode('canvas'); };
  /** a thought becomes a SECTION: she names it and picks the parent (or the top level); the thought's line is then done */
  const startSectionFromThought = (t: NoteThinkingItem) => {
    if (!t.id || !t.noteId) return;
    setNodeDialog({ kind: 'create', parentId: t.nodeId, label: sectionNameFromThought(t.text), chooseParent: true, thought: { id: t.id, noteId: t.noteId, line: t.line, text: t.text } });
  };
  const startSectionFromNote = (noteId: string) => {
    const n = data?.notes.find((x) => x.id === noteId);
    if (!n) return;
    const first = thinking.find((i) => i.noteId === n.id && !convertedTo(i, workspaceContexts));
    const text = first?.text ?? n.content.split('\n')[0];
    setNodeDialog({ kind: 'create', parentId: n.nodeId, label: sectionNameFromThought(text), chooseParent: true,     ...(first?.id ? { thought: { id: first.id, noteId: n.id, line: first.line, text: first.text } } : {}) });
  };
  const handleThoughtSectioned = async (t: { id: string; noteId: string; line: number; text: string }, label: string, nodeId: string) => {
    const r = await attempt(() => dataApi.resolveThought(wid, t.id, { nodeId }));
    if (!r) return;
    patch((d) => ({ ...d, thoughts: d.thoughts.map((x) => x.id === t.id ? r.thought : x) }));
    toast.show({ intent: 'success', message: `بخش «${label}» ساخته شد. فکر حل شد و یادداشت اصلی بدون تغییر ماند.` });
  };
  const handleSaveThought = async (nodeId: string, content: string) => {
    await handleAddNote(nodeId, content);
    toast.show({ intent: 'success', message: 'فکر ثبت شد؛ در «فضای فکر» می‌بینی‌اش و فقط با انتخاب صریح تو به AI می‌رسد.' });
  };
  const handleSaveAiThought = async (parentIds: string[], nodeId: string, text: string): Promise<boolean> => {
    if (!text.trim() || !parentIds.length) return false;
    const r = await attempt(() => dataApi.deriveThought(wid, { parentIds, nodeId, kind: 'idea', text: text.trim() }));
    if (!r) return false;
    patch((d) => ({ ...d, thoughts: [...d.thoughts, r.thought] }));
    toast.show({ intent: 'success', message: 'پاسخ به‌عنوان فکر بازِ مشتق‌شده ذخیره شد؛ فکرهای مبدأ دست‌نخورده ماندند.' });
    return true;
  };
  const handleSaveThoughts = async (notes: Array<{ nodeId: string; content: string }>, count: number) => {
    for (const n of notes) await handleAddNote(n.nodeId, n.content);
    toast.show({ intent: 'success', message: `${formatNumber(count)} فکر ثبت شد؛ در «فضای فکر» می‌بینی‌شان و فقط با انتخاب صریح تو به AI می‌رسند.` });
  };
  // «گزینه‌های تصمیم باز»: the options are lines under the decision in its note; choosing makes a PROPOSED decision, the others stay in its record
  const [optionsItemKey, setOptionsItemKey] = useState<string | null>(null);
  const optionsItem = optionsItemKey ? thinking.find((t) => t.key === optionsItemKey) ?? null : null;
  const optionsNote = optionsItem ? (data?.notes ?? []).find((n) => n.id === optionsItem.noteId) : undefined;
  const handleChooseOption = async (p: { question: string; chosen: { title: string; text: string }; others: Array<{ title: string; reason: string }> }) => {
    if (!optionsItem?.id) return;
    const r = await attempt(() => dataApi.createObject(wid, {
      type: 'Decision', status: 'Proposed', provenance: 'User Input', title: p.chosen.title.slice(0, 80), content: p.chosen.text, nodeId: optionsItem.nodeId,
      record: recordOfChoice(p.question, p.chosen.title, p.others),
      source: { kind: 'note', thoughtId: optionsItem.id, noteId: optionsItem.noteId, lineKey: optionsItem.sourceLineKey ?? optionsItem.hash, quote: optionsItem.text, at: new Date().toISOString() },
    }));
    if (!r) throw new Error('create failed');
    patch((d) => ({ ...d, objects: [r.object, ...d.objects], thoughts: r.thoughts }));
    toast.show({ intent: 'success', message: `تصمیم ثبت شد؛ ${formatNumber(p.others.length)} گزینهٔ دیگر با دلیل ماندند. در «فکر» منتظر تأیید توست.` });
  };
  const handleAddNote = async (nodeId: string, content: string) => {
    const r = await attempt(() => dataApi.createNote(wid, nodeId, content));
    if (r) patch((d) => ({ ...d, notes: [r.note, ...d.notes], thoughts: r.thoughts }));
  };
  const handleUpdateNote = async (id: string, content: string) => {
    const r = await attempt(() => dataApi.updateNote(wid, id, content));
    if (r) patch((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? r.note : n)), thoughts: r.thoughts }));
  };
  /**
   * A small, throwaway removal: it happens at once and offers «برگرداندن» (the note comes back with its text, its section and its place).
   * Only when the note holds OPEN thoughts does a short dialog ask first: they stay by default («یادداشت حذف شد» on each), and the user
   * can send them away with the note — the one choice that cannot be undone by the toast.
   */
  const handleDeleteNote = async (id: string, removeThoughts = false) => {
    const r = await attempt(() => dataApi.deleteNote(wid, id, removeThoughts));
    if (!r) return;
    patch((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id), thoughts: r.thoughts }));
    const note = r.note;
    if (!note) return;
    const msg = r.removedThoughts ? `یادداشت و ${formatNumber(r.removedThoughts)} فکر باز آن حذف شد.` : r.keptThoughts ? `یادداشت حذف شد؛ ${formatNumber(r.keptThoughts)} فکر باز مانده است.` : 'یادداشت حذف شد.';
    toast.show({ intent: 'success', message: msg, duration: 10000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.restoreNote(wid, note, r.position)).then((x) => { if (x) patch((d) => ({ ...d, notes: [x.note, ...d.notes], thoughts: x.thoughts, canvas: r.position ? { ...d.canvas, free: [...d.canvas.free.filter((i) => i.itemRef !== `note:${note.id}`), { itemRef: `note:${note.id}`, ...r.position }] } : d.canvas })); }); } } });
  };
  const [noteDeleteAsk, setNoteDeleteAsk] = useState<{ id: string; open: number } | null>(null);
  const [noteDeleteWithThoughts, setNoteDeleteWithThoughts] = useState(false);
  const askDeleteNote = async (id: string) => {
    const open = (data?.thoughts ?? []).filter((t) => t.sourceNoteId === id && t.status === 'open').length;
    if (open === 0) { await handleDeleteNote(id); return; }
    setNoteDeleteWithThoughts(false); setNoteDeleteAsk({ id, open });
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

  // usage is provider metadata returned by the server; credits are shown and charged only when managed AI is enabled
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

  /** A finished chat turn: ledger row with real provider usage and the credits the turn cost. */
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
    if (!newWsName.trim()) return;

    const currentPlan = PLANS[currentWorkspace?.planId ?? 'pro'] || PLANS.pro;
    if (liveWorkspaces.filter((w) => !w.isDemo).length >= currentPlan.workspaceLimit) {
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
      planId: currentWorkspace?.planId ?? 'pro',
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
      toast.show({ intent: r.created.length ? 'success' : 'info', message: r.created.length ? `${formatNumber(r.created.length)} مورد پیشنهادی از این خروجی ساخته شد؛ در صندوق پیشنهادها منتظر تأیید توست.` : 'در متن این خروجی واقعیت، تصمیم یا خط قرمز مشخصی پیدا نشد.' });
    } finally { setExtractingAssetId(null); }
  };

  const handleExportAllData = () => {
    if (!data || !currentWorkspace) return;
    const backupData = {
      workspace: currentWorkspace,
      allWorkspaces: liveWorkspaces,
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

  // ── removal (docs/removal.md): archive comes back, delete for good does not ──
  const [archiveOpen, setArchiveOpen] = useState(false);
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
    <ContextCanvas
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
  />
    </div>
  );

  /** the one action in the top bar that fits the current page */
  const pageAction: PageAction | undefined =
    activeTab === 'context' || activeTab === 'home' ? { label: 'ثبت دانش', icon: 'Plus', onClick: () => openContext(null) }
    : activeTab === 'workstreams' ? { label: 'جریان سفارشی', icon: 'Plus', onClick: () => openSpecEditor() }
    : undefined;

  const openContext = (obj: ContextObject | null, nodeId = defaultNodeId(nodes)) => {
    setSelectedContextObject(obj);
    setModalDefaultNodeId(nodeId);
    setIsContextModalOpen(true);
  };

  // nothing left (a fresh install after «حذف همهٔ داده‌ها», or every workspace archived / deleted): an honest empty start, not an error
  if (boot.status === 'ready' && liveWorkspaces.length === 0) {
    const archived = workspaces.filter((w) => w.archivedAt);
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page p-inset-lg" data-testid="first-run">
        <div className="flex w-full max-w-overlay-xs flex-col gap-stack-lg text-center">
          <EmptyState icon="House" title="هنوز فضای کاری نداری" description="یک فضای کاری بساز تا دانش کسب‌وکارت جایی بنشیند. هرچه کنار گذاشته بودی هم در بایگانی مانده است." />
          <form onSubmit={handleCreateWorkspace} className="flex flex-col gap-stack-sm text-start">
            <TextField label="نام فضای کاری یا نام برند" value={newWsName} onChange={(e) => setNewWsName(e.target.value)} />
            <Button variant="primary" type="submit" disabled={!newWsName.trim()}>ایجاد فضای کاری</Button>
          </form>
          {archived.length > 0 && (
            <div className="flex flex-col gap-stack-xs text-start" aria-label="فضاهای بایگانی‌شده">
              <span className="label-md text-text-default">بایگانی‌شده‌ها</span>
              {archived.map((w) => <div key={w.id} className="flex items-center justify-between gap-inline-sm"><span className="body-md">{w.name}</span><Button size="sm" variant="secondary" iconStart="Undo2" onClick={() => { void attempt(() => dataApi.archiveWorkspace(w.id, false)).then((r) => { if (r) { setWs(r.workspaces); setCurrentWorkspaceId(w.id); } }); }}>برگردان</Button></div>)}
            </div>
          )}
        </div>
      </div>
    );
  }
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
        allWorkspaces={liveWorkspaces}
        onSelectWorkspace={(ws) => { setChatScope(undefined); setCurrentWorkspaceId(ws.id); }}
        onOpenNewWorkspace={() => setIsNewWorkspaceModalOpen(true)}
        onOpenSearch={() => setPaletteOpen(true)}
        onOpenUsage={() => setUsageOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenArchive={() => setArchiveOpen(true)}
        onDeleteDemo={workspaces.some((w) => w.isDemo && !w.archivedAt) ? () => setDemoDelete(true) : undefined}
        onResetDemo={() => { if (workspaces.some((w) => w.isDemo)) setDemoConfirm(true); else void handleResetDemo(); }}
        onOpenPlanModal={() => setIsPlanModalOpen(true)}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onOpenLedger={() => setActiveTab('ledger')}
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
        thinkingCount={thinkingBadge}
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
          {(activeTab === 'workstreams' || activeTab === 'chat') && <AiStatusBanner />}



        {/* HOME: where to start — what needs you, this week, waiting decisions, the inbox, recent changes */}
        {activeTab === 'home' && (
          <div className="space-y-stack-lg">
            <div className="flex flex-col gap-inline-md sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-heading-md font-bold text-text-default">خانه: {currentWorkspace.name}</h1>
                <p className="text-body-sm text-text-subtle mt-stack-xs">فقط آنچه الان ارزش دارد؛ بقیه یک کلیک پایین‌تر است.</p>
              </div>
              <div className="flex flex-wrap items-center gap-inline-sm">
                {workspaceContexts.length > 0 && <Button variant="primary" iconStart="Sparkles" onClick={() => setAiRequest({ scopeNodeId: '' })}>درخواست برای AI</Button>}
                {/* on phones the page action of the top bar does not exist: recording knowledge must still be one tap away */}
                {workspaceContexts.length > 0 && <Button className="md:hidden" variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت دانش</Button>}
                {workspaceContexts.length > 0 && <Menu
                  label="بیشتر"
                  align="end"
                  trigger={<IconButton icon="Ellipsis" label="بیشتر" variant="secondary" />}
                  items={[
                    { label: 'شاخص‌ها و اعداد', icon: 'TrendingUp', onSelect: () => setMetricsOpen(true) },
                    { label: 'بسته‌های دانش', icon: 'Package', onSelect: () => setIsPacksOpen(true) },
                    { label: 'وارد کردن پاسخ AI', icon: 'Upload', onSelect: () => setIsImportOpen(true) },
                    { label: 'مقایسهٔ منبع', icon: 'Layers', onSelect: () => setCompare({ mode: 'week', scopeNodeId: focusNodeId ?? undefined }) },
                    { label: 'بازبینی هفتگی', icon: 'ListChecks', onSelect: () => setWeeklyOpen(true) },
                    { label: 'شروع سریع', icon: 'Zap', onSelect: () => setIsOnboardingOpen(true) },
                  ]}
                />}
              </div>
            </div>
            {workspaceContexts.length === 0 && (
              <EmptyState
                icon="House"
                title="از همین‌جا شروع کن"
                description="یک جمله دربارهٔ کسب‌وکارت بنویس یا یک متن بچسبان؛ بقیه‌اش را مبدأ مرتب می‌کند. بعد از اولین دانش، می‌توانی از AI خودت کاری بخواهی که کسب‌وکارت را می‌شناسد."
                action={(
                  <div className="flex flex-wrap justify-center gap-inline-md">
                    <Button variant="primary" iconStart="Sparkles" onClick={() => setIsOnboardingOpen(true)}>شروع سریع</Button>
                    <Button variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت اولین دانش</Button>
                    <Button variant="ghost" iconStart="Download" onClick={() => setIsMemoryOpen(true)}>وارد کردن حافظهٔ AI دیگر</Button>
                  </div>
                )}
              />
            )}
            {(workspaceContexts.length > 0 || homePlan.total > 0) && (
              <HomeTodo top={homePlan.top} total={homePlan.total} onAct={handleHomeAct} allOpen={homeAllOpen} onToggleAll={() => setHomeAllOpen((v) => !v)} />
            )}
            {/* calm news, below the to-do and OUTSIDE it: it is not a task, so it is not counted in «همه (N)»; one at a time, the rest wait in the weekly review */}
            {inheritNotices.length > 0 && <InheritNoticeList notices={inheritNotices} max={1} onSeen={markInheritSeen} onOpenSection={(id) => { setActiveTab('context'); setContextViewMode('doc'); goFocus(id); }} onOpenObject={(id) => { const o = workspaceContexts.find((x) => x.id === id); if (o) openContext(o); }} />}
            {homeAllOpen && (workspaceContexts.length > 0 || homePlan.total > 0) && (
              <div id="home-all" className="flex flex-col gap-stack-lg">
            <AttentionPanel
              specTitle={attentionSpec?.title ?? ''}
              gaps={attentionGaps}
              contradictionCount={contradictions.length}
              staleCount={stale.length}
              reviews={[...reviewNeeds.entries()].map(([id, need]) => ({ id, title: workspaceContexts.find((o) => o.id === id)?.title ?? id, dependencyTitles: need.changedDependencies.map((d) => workspaceContexts.find((o) => o.id === d.id)?.title ?? d.id) }))}
              waiting={waiting}
              structure={waitingOrdered.structure}
              flips={flips}
              titleOf={(id) => workspaceContexts.find((o) => o.id === id)?.title ?? id}
              weeklyDue={weeklyDue}
              showWeekly={vf.weeklyReview}
              showWaiting={vf.waitingDecisions}
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

            {vf.metrics && (
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
                  onRevise={handleReviseThought}
                  onDerive={handleDeriveThought}
                  onGoToNode={(nodeId) => { setActiveTab('context'); setContextViewMode('doc'); setTimeout(() => document.getElementById(`node-${nodeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); }}
                />
                <DueItems {...dueProps} />
              </Card>
            )}

            {changesOpen && <ChangesPanel onCompare={() => setCompare({ mode: 'week' })} open={changesOpen} onToggle={() => setChangesOpen((v) => !v)} changes={data?.changes ?? []} objects={workspaceContexts} relationships={data?.relationships ?? []} deliverables={deliverables} nodes={nodes} onOpenAssets={() => setActiveTab('assets')} />}

            {vf.contradictions && <ContradictionPanel contradictions={contradictions} nodes={nodes} onKeep={handleKeepContradiction} onSeparate={handleSeparateContradiction} check={canJudge ? { busy: judging, onCheck: handleCheckContradictions, used: judgedToday, cap: entitlementsOf(data!.workspace.planId).decisionJudgmentsPerDay } : undefined} />}

            {vf.proposals && <ProposalInbox
              objects={workspaceContexts}
              nodes={nodes}
              onAccept={handleAcceptProposal}
              onReplace={handleReplaceWithProposal}
              onEdit={(o) => openContext(o)}
              onReject={handleRejectProposal}
              onOpenImport={() => setIsImportOpen(true)}
              onOpenPack={() => setPackTarget({ title: currentWorkspace.name })}
              onOpenMemory={() => setIsMemoryOpen(true)}
            />}

              </div>
            )}
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

              <div className="flex flex-wrap items-center gap-inline-sm">
                {vf.packs && <Button variant="secondary" iconStart="Package" onClick={() => setIsPacksOpen(true)}>بسته‌های دانش</Button>}
                <Button className="md:hidden" variant="secondary" iconStart="Plus" onClick={() => openContext(null)}>ثبت دانش</Button>
                <SegmentedControl
                  label="نمای منبع حقیقت"
                  value={contextViewMode}
                  onChange={(id) => setContextViewMode((id === 'map' ? 'canvas' : id) as 'doc' | 'read' | 'table' | 'canvas')}
                  items={[
                    { id: 'doc', label: 'ساختار', icon: 'FolderTree' },
                    { id: 'canvas', label: 'نمای کلی', icon: 'Workflow' },
                    ...(contextViewMode === 'read' ? [{ id: 'read', label: 'سند', icon: 'BookOpen' as const }] : []),
                    ...(contextViewMode === 'table' ? [{ id: 'table', label: 'جدول', icon: 'Table2' as const }] : []),
                  ]}
                />
                <Menu
                  label="نماهای بیشتر"
                  align="end"
                  trigger={<IconButton icon="Ellipsis" label="نماهای بیشتر" variant="secondary" />}
                  items={[
                    { label: 'خواندن به‌صورت سند', icon: contextViewMode === 'read' ? 'Check' : 'BookOpen', onSelect: () => setContextViewMode('read') },
                    { label: 'جدول', icon: contextViewMode === 'table' ? 'Check' : 'Table2', onSelect: () => setContextViewMode('table') },
                    { label: 'بایگانی و حذف‌های اخیر', icon: 'Archive', onSelect: () => setArchiveOpen(true) },
                  ]}
                />
              </div>
            </div>

            <div id="context-view" style={{ scrollMarginTop: 80 }} />
            {contextViewMode === 'read' ? (
              <DocWorkspace
                nodes={nodes}
                objects={workspaceContexts}
                relationships={data.relationships}
                approvals={approvals}
                fileName={currentWorkspace.name}
                empty={<EmptyState icon="Inbox" title="هنوز دانشی ثبت نشده است" />}
              />
            ) : contextViewMode === 'doc' ? (
              <ContextTreeDocView
                objects={workspaceContexts}
                relationships={data.relationships ?? []}
                staleIds={reviewIdSet}
                openCounts={openCounts}
                focusId={focusNodeId}
                onFocus={goFocus}
                nodes={nodes}
                notes={data.notes}
                files={data.files}
                extractingNoteId={extractingNoteId}
                onSelectObject={(obj) => openContext(obj)}
                onAddNewToNode={(nodeId) => openContext(null, nodeId)}
                onNodeAction={setNodeDialog}
                onChatWithNode={(nodeId) => setAiRequest({ scopeNodeId: nodeId })}
                onReadNode={setReadNodeId}
                onShowEffect={setEffectNodeId}
                effectCount={(id) => effectiveObjects(id, workspaceContexts, nodes, data.relationships ?? [], new Date()).length}
                openCount={(id) => openCounts.get(id) ?? 0}
                onOpenThinking={(id) => openThinkingSpace(id)}
                onNewThought={(id) => setThoughtDialog({ nodeId: id })}
                onSplitNote={handleSplitNote}
                samples={data.samples ?? []}
                onDeleteSamples={handleDeleteSamples}
                onSaveAsTemplate={(nodeId) => setTemplateDraft({ kind: 'node', sourceId: nodeId, name: nodes.find((n) => n.id === nodeId)?.label ?? '' })}
                onOpenStarters={() => setIsStarterOpen(true)}
                onOpenThread={setThreadNodeId}
                onOpenAiRequest={(nodeId) => setAiRequest({ scopeNodeId: nodeId })}
                openNotesFor={focusNotes}
                onReorderNode={async (nodeId, index) => { await nodeOp(() => dataApi.moveNode(wid, nodeId, nodes.find((n) => n.id === nodeId)?.parentId ?? '', index)); }}
                onUploadFile={async (file, nodeId) => { const r = await handleUploadFile(file, nodeId); if (r) toast.show({ intent: 'success', message: 'فایل اضافه شد؛ برای استخراج دانش، در بخش «فایل‌ها» پردازشش کن.' }); }}
                onAddNote={handleAddNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={askDeleteNote}
                onExtractNote={handleExtractNote}
              />
            ) : contextViewMode === 'canvas' ? (
              renderCanvas('truth')
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
              onUpload={handleUploadFile}
              onProcess={handleProcessFile}
              onDelete={handleDeleteFile}
            />
          </div>
        )}

        {activeTab === 'thinking' && (
          <div className="space-y-stack-lg">
            <div className="flex flex-col gap-inline-md sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-heading-md font-bold text-text-default">فکر: {currentWorkspace.name}</h1>
                <p className="text-body-sm text-text-subtle mt-stack-xs">هرچه هنوز حقیقت نیست اینجاست: فکر ← پیشنهادی ← تأییدشده. منبع حقیقت تمیز می‌ماند.</p>
              </div>
              <div className="flex flex-wrap items-center gap-inline-sm">
                <SegmentedControl
                  label="نمای فکر"
                  value={thinkingView}
                  onChange={(id) => setThinkingView(id as 'list' | 'canvas')}
                  items={[{ id: 'list', label: 'فهرست', icon: 'ListChecks' }, { id: 'canvas', label: 'بوم', icon: 'Workflow' }]}
                />
                <Button variant="primary" iconStart="Plus" onClick={() => setThoughtDialog({ nodeId: spaceNode })}>فکر تازه</Button>
              </div>
            </div>
            <div id="thinking-view" />
            {thinkingView === 'canvas' ? renderCanvas('thinking') : (
              <div className="flex flex-col gap-stack-sm">
              {spaceNode === focusNodeId && scopeChip}
              <ThinkingSpace
          objects={workspaceContexts}
          notes={data.notes}
          nodes={nodes}
          relationships={data.relationships}
          thoughts={thinking}
          nodeId={spaceNode}
          onNodeChange={setSpaceNode}
          onCompareIfApproved={() => setCompare({ mode: 'pending', scopeNodeId: spaceNode })}
          onOptions={(item) => setOptionsItemKey(item.key)}
          optionCount={(item) => optionsOf((data?.notes ?? []).find((n) => n.id === item.noteId)?.content ?? '', item.endLine ?? item.line, workspaceContexts, nodes).length}
          onToKnowledge={handleConvertItem}
          onReviseThought={handleReviseThought}
          onDeriveThought={handleDeriveThought}
          onSynthesizeThought={handleSynthesizeThought}
          onThinkWithAi={startThoughtAi}
          onOpenObject={(o) => openContext(o)}
          onApproveDraft={handleApproveDraft}
          onRejectDraft={handleRejectDraft}
          proposals={{
            onAccept: handleAcceptProposal, onReplace: handleReplaceWithProposal, onEdit: (o) => openContext(o), onReject: handleRejectProposal,
            onOpenImport: () => setIsImportOpen(true), onOpenPack: () => setPackTarget({ title: currentWorkspace.name }), onOpenMemory: () => setIsMemoryOpen(true),
          }}
                onPreviewTruth={previewTruth}
                onToSection={(item) => startSectionFromThought(item)}
              />
              </div>
            )}
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
          <Button variant="ghost" size="sm" iconStart="ArrowRight" onClick={() => setActiveTab('assets')}>همهٔ خروجی‌ها</Button>
        )}
        {activeTab === 'workstreams' && specs.length > 0 && (
          <WorkstreamStudio
            currentWorkspace={currentWorkspace}
            allContextObjects={workspaceContexts}
            allDeliverables={deliverables}
            specs={specs}
            stale={stale}
            changes={data.changes}
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
          />
        )}

        {/* TAB 3: Smart Chat */}

        {/* TAB 4: Asset Library */}
        {activeTab === 'assets' && (
          <div className="space-y-stack-lg">
            <div>
              <h1 className="text-heading-md font-bold text-text-default">خروجی‌ها: {currentWorkspace.name}</h1>
              <p className="text-body-sm text-text-subtle mt-stack-xs">بالا: با چه چیزی می‌سازی. پایین: چه ساخته‌ای و کدام‌ها دیگر به‌روز نیستند.</p>
            </div>
            <section className="flex flex-col gap-stack-md" aria-label="بساز" data-testid="outputs-build">
              <h2 className="heading-sm text-text-default">بساز</h2>
              {specs.length === 0 ? (
                <EmptyState icon="Layers" title="این فضا هنوز جریان کاری ندارد" description="از کتابخانه یک جریان آماده بردار یا خودت یکی بساز." action={<Button variant="secondary" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button>} />
              ) : (
                <ul className="grid gap-stack-md sm:grid-cols-2" aria-label="جریان‌های کار">
                  {specs.map((sp) => (
                    <li key={sp.id}>
                      <Card padding="lg" className="flex h-full flex-col justify-between gap-stack-sm">
                        <div className="flex flex-col gap-stack-xs">
                          <span className="label-md text-text-default">{sp.title}</span>
                          <p className="body-sm text-text-subtle">{sp.description}</p>
                        </div>
                        <div><Button size="sm" variant="secondary" iconStart="Sparkles" data-testid={`build-${sp.id}`} aria-label={`بساز: ${sp.title}`} onClick={() => { setSelectedSpecId(sp.id); setActiveTab('workstreams'); }}>بساز</Button></div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-inline-sm">
                <Button size="sm" variant="ghost" iconStart="Plus" onClick={() => openSpecEditor()}>جریان کار تازه</Button>
                <Button size="sm" variant="ghost" iconStart="Layers" onClick={() => setIsSpecLibraryOpen(true)}>افزودن از کتابخانه</Button>
              </div>
            </section>
          <AssetLibrary
            focus={focusAsset}
            currentWorkspace={currentWorkspace}
            deliverables={deliverables}
            allContextObjects={workspaceContexts}
            stale={stale}
            changes={data.changes}
            onGoToWorkstreams={() => setActiveTab('workstreams')}
            onArchive={handleArchiveDeliverable}
            onDelete={handleDeleteDeliverable}
            onOpenArchive={() => setArchiveOpen(true)}
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
          </div>
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
      <Dialog
        open={!!noteDeleteAsk} onClose={() => setNoteDeleteAsk(null)} size="sm" title="حذف یادداشت"
        description={noteDeleteAsk ? `این یادداشت ${formatNumber(noteDeleteAsk.open)} فکر باز دارد. فکرها مال خودت‌اند؛ اگر چیزی نگویی می‌مانند و روی هر کدام نوشته می‌شود «یادداشت حذف شد».` : undefined}
        footer={<><Button variant="ghost" onClick={() => setNoteDeleteAsk(null)}>انصراف</Button><Button variant="danger" iconStart="Trash2" onClick={() => { const ask = noteDeleteAsk; setNoteDeleteAsk(null); if (ask) void handleDeleteNote(ask.id, noteDeleteWithThoughts); }}>حذف یادداشت</Button></>}
      >
        <div className="flex flex-col gap-stack-xs">
          <Checkbox label={`فکرهای باز هم بروند (${formatNumber(noteDeleteAsk?.open ?? 0)} فکر)`} checked={noteDeleteWithThoughts} onChange={(e) => setNoteDeleteWithThoughts(e.target.checked)} />
          <p className="body-sm text-text-subtle">با «برگرداندن» متن یادداشت برمی‌گردد و فکرها دوباره از روی خط‌هایش ساخته می‌شوند (بی‌تاریخچهٔ قبلی).</p>
        </div>
      </Dialog>
      <ArchiveDialog open={archiveOpen} workspaceId={wid} nodes={nodes} workspaces={workspaces} currentWorkspaceId={wid} onClose={() => setArchiveOpen(false)} onChanged={() => void reload(wid)} onWorkspacesChange={setWs} />
      <DangerDialog open={demoDelete} onClose={() => setDemoDelete(false)} title="پاک کردن فضای نمونه؟" description="همهٔ داده‌های فضای نمونه (دانش، یادداشت، خروجی، تاریخچه) پاک می‌شود. این داده‌ها ساختگی‌اند و فضاهای دیگرت دست نمی‌خورند؛ هر وقت خواستی دوباره ساخته می‌شود." confirmLabel="پاک کن" onConfirm={handleDeleteDemo} />
      <SavedPacksDialog open={isPacksOpen} workspaceId={wid} nodes={nodes} objects={workspaceContexts} onClose={() => setIsPacksOpen(false)} onOpenObject={(o) => openContext(o)} />
      <AiRequestDialog
        open={!!aiRequest} workspaceId={wid} nodes={nodes} scopeNodeId={aiRequest?.scopeNodeId} initialKind={aiRequest?.kind} initialRequest={aiRequest?.request} initialThoughtIds={aiRequest?.thoughtIds} thoughts={thinking} onClose={() => setAiRequest(null)} onOpenImport={() => setIsImportOpen(true)}
        sessions={data?.sessions ?? []}
        onSaveSession={(sess: ChatSession) => { void attempt(() => dataApi.saveSession(wid, sess)).then((r) => { if (r) patch((d) => ({ ...d, sessions: d.sessions.some((x) => x.id === sess.id) ? d.sessions.map((x) => (x.id === sess.id ? sess : x)) : [sess, ...d.sessions] })); }); }}
        onAnswered={(res) => { handleIncrementChatCount(); void handleRecordChatUsage(res, ai.managedEnabled ? chatCredits(false) : 0, false); }}
        onAddKnowledge={(b) => openContext(contextDraftFromBlock(b, wid))}
        onSaveAsThought={handleSaveAiThought}
        onOpenObject={(id) => { const o = workspaceContexts.find((x) => x.id === id); if (o) openContext(o); }}
      />
      <ContextDetailModal
        isOpen={isContextModalOpen}
        object={selectedContextObject}
        onClose={() => setIsContextModalOpen(false)}
        onSave={handleSaveContextObject}
        onApproveDraft={handleApproveDraft}
        onRejectDraft={handleRejectDraft}
        onSupersede={handleSupersedeContext}
        onArchive={handleArchiveContext}
        nodes={nodes}
        workspaceId={currentWorkspace.id}
        defaultNodeId={modalDefaultNodeId}
        allObjects={workspaceContexts}
        onOpenBatch={() => setIsBatchOpen(true)}
        thoughts={thinking.filter((t) => !convertedTo(t, workspaceContexts))}
        onOpenThinking={() => { setIsContextModalOpen(false); openThinkingSpace(); }}
        onThinkAbout={(object) => {
          setIsContextModalOpen(false);
          setThoughtDialog({ nodeId: object.nodeId, initialKind: 'question', initialAbout: [{ kind: 'object', id: object.id, label: object.title }] });
        }}
        metrics={metrics}
        relationships={data?.relationships ?? []}
        onSetDependencies={handleSetDependencies}
        reviewNeed={selectedContextObject ? reviewNeeds.get(selectedContextObject.id) : undefined}
        titleOf={(id) => workspaceContexts.find((o) => o.id === id)?.title ?? id}
        onAcceptReview={handleAcceptReview}
        deliverables={deliverables}
        notes={data?.notes ?? []}
        onOpenNote={(_id, nodeId) => { setIsContextModalOpen(false); openThinkingSpace(nodeId); }}
        onOpenAssets={() => { setIsContextModalOpen(false); setActiveTab('assets'); }}
        onOpenRelated={(o) => openContext(o)}
        onPatchObject={handlePatchObject}
      />

      <TruthCompareDialog
        open={!!compare} onClose={() => setCompare(null)} mode={compare?.mode} scopeNodeId={compare?.scopeNodeId}
        objects={data?.objects ?? []} changes={data?.changes ?? []} nodes={nodes} deliverables={deliverables}
        onOpenObject={(o) => openContext(o)} onOpenAssets={() => setActiveTab('assets')}
      />
      <DecisionOptionsDialog
        open={!!optionsItem} onClose={() => setOptionsItemKey(null)} item={optionsItem} noteContent={optionsNote?.content ?? ''}
        objects={workspaceContexts} nodes={nodes} relationships={data?.relationships ?? []}
        onChangeNote={async (content) => { if (optionsNote) await handleUpdateNote(optionsNote.id, content); }}
        onChoose={handleChooseOption}
        onAskAi={(text) => { setOptionsItemKey(null); setAiRequest({ scopeNodeId: optionsItem?.nodeId ?? '', kind: 'decision', request: text }); }}
      />
      <ThoughtDialog open={!!thoughtDialog} onClose={() => setThoughtDialog(null)} nodes={nodes} objects={workspaceContexts} nodeId={thoughtDialog?.nodeId} initialKind={thoughtDialog?.initialKind} initialAbout={thoughtDialog?.initialAbout} onSave={handleSaveThought} onSaveMany={handleSaveThoughts} />
      <NodeDialogs
        state={nodeDialog}
        nodes={nodes}
        objects={workspaceContexts}
        notes={data.notes}
        thoughts={data.thoughts}
        files={data.files}
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
        onRename={(nodeId, label, description) => nodeOp(() => dataApi.renameNode(wid, nodeId, { label, description }))}
        relationships={data.relationships}
        onMove={(nodeId, parentId, reason) => nodeOp(() => dataApi.moveNode(wid, nodeId, parentId, undefined, reason))}
        onDelete={async (nodeId, transferTo, mode) => {
          const r = await attempt(() => dataApi.deleteNode(wid, nodeId, transferTo, mode));
          if (!r) throw new Error('node delete failed');
          patch((d) => ({ ...d, nodes: r.nodes, objects: r.objects, notes: r.notes, thoughts: r.thoughts, files: r.files, stale: r.stale }));
          void reload(wid);
          toast.show({ intent: 'success', message: `${r.removal.label}.`, duration: 12000, action: { label: 'برگرداندن', onClick: () => { void attempt(() => dataApi.undoRemoval(wid, r.removal.id)).then((u) => { if (u) { patch((d) => ({ ...d, nodes: u.nodes, objects: u.objects, notes: u.notes, thoughts: u.thoughts, files: u.files, samples: u.samples, changes: u.changes, stale: u.stale })); toast.show({ intent: 'success', message: 'برگشت؛ همه‌چیز همان‌طور که بود.' }); } }); } } });
        }}
        onThoughtSectioned={handleThoughtSectioned}
      />

      {currentWorkspace && <SpecLibraryDialog open={isSpecLibraryOpen} workspace={currentWorkspace} onClose={() => setIsSpecLibraryOpen(false)} onChange={handleSetLibrarySpecs} onApplyTemplate={handleApplyTemplate} nodes={nodes.map((n) => ({ id: n.id, label: n.label }))} />}

      <QuickStartDialog
        open={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        workspaceId={wid}
        onImported={(created, ledger) => patch((d) => ({ ...d, objects: [...created.slice().reverse(), ...d.objects], ledger }))}
        onCreateObjects={(items) => { ensureLibrarySpec('main_positioning'); return handleCreateObjects(items); }}
        onConfirmMany={async (ids) => { for (const id of ids) await setStatus(id, 'Confirmed'); }}
        nodes={nodes}
        onGoToNode={(nodeId) => { setActiveTab('context'); setContextViewMode('doc'); revealWhenThere(`node-${nodeId}`); }}
        onOpenThinking={() => openThinkingSpace()}
        onSampleDone={(firstDeliverable) => {
          ensureLibrarySpec('main_positioning');
          void (async () => {
            if (!(await persistDeliverable(firstDeliverable))) return;
            if (firstDeliverable.usage) {
              await persistLedger(ledgerEntryFromUsage({ workspaceId: wid, action: 'خروجی نمونهٔ شروع سریع', mode: 'auto', creditCost: 0, usage: firstDeliverable.usage, plan: firstDeliverable.plan, id: `led_onb_${Date.now()}` }));
            }
          })();
        }}
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
        onOpenArchive={() => setArchiveOpen(true)}
        onArchiveWorkspace={handleArchiveWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onDeleteEverything={handleDeleteEverything}
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
      <NodeReaderDialog nodeId={readNodeId} nodes={nodes} objects={workspaceContexts} relationships={data?.relationships ?? []} onClose={() => setReadNodeId(null)} />
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
      <UsageDialog open={usageOpen} onClose={() => setUsageOpen(false)} />
      <CommandPalette open={paletteOpen} index={searchIdx} onClose={() => setPaletteOpen(false)} onPick={handlePick} />
      <ContextPackDialog workspaceId={wid} target={packTarget} onClose={() => setPackTarget(null)} onOpenImport={() => setIsImportOpen(true)} />
      <ImportAnswerDialog open={isImportOpen} workspaceId={wid} nodes={nodes} objects={workspaceContexts} onClose={() => setIsImportOpen(false)} onProposeContext={handleProposeFromImport} onUpdateDraft={handleDraftFromImport} onSaveAsset={persistDeliverable} />
      <KnowledgeBatchDialog open={isBatchOpen} onClose={() => setIsBatchOpen(false)} nodes={nodes} onPropose={handleProposeBatch} />
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
