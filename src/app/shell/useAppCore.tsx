/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AboutTarget } from '../../core/thoughtAbout';
import type { FileQuotaInfo, WorkspaceState } from '../../types/state';
import type { NodeDialogState } from '../../components/NodeDialogs';
import type { PackTarget } from '../../components/ContextPackDialog';
import { ContextObject, GeneratedDeliverable, ThoughtKind, Workspace, WorkstreamSpec } from '../../types';
import { approvalsOf } from '../../core/versionHistory';
import { dataApi } from '../../services/dataApi';
import { defaultNodeId } from '../../core/nodeTree';
import { useAiStatus } from '../../services/aiStatus';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../ui';
import { errText } from '../shared';

export type AppCoreScope = ReturnType<typeof useAppCore>;

export function useAppCore() {
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
  const [aiRequest, setAiRequest] = useState<{ scopeNodeId: string; kind?: import('../../core/aiRequest').RequestKind; request?: string; thoughtIds?: string[] } | null>(null);
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

  // ── notes ──────────────────────────────────────────────────────────────────────────────────────
  // «فضای فکر» (thoughts that are not truth yet) and «فکر تازه»
  const [thoughtDialog, setThoughtDialog] = useState<{ nodeId?: string; initialKind?: ThoughtKind; initialAbout?: AboutTarget[] } | null>(null);
  const [spaceNode, setSpaceNode] = useState<string | undefined>(undefined);
  const openThinkingSpace = (nodeId?: string) => { setSpaceNode(nodeId); setThinkingView('list'); setActiveTab('thinking'); };

  // ── removal (docs/removal.md): archive comes back, delete for good does not ──
  const [archiveOpen, setArchiveOpen] = useState(false);

  const openContext = (obj: ContextObject | null, nodeId = defaultNodeId(nodes)) => {
    setSelectedContextObject(obj);
    setModalDefaultNodeId(nodeId);
    setIsContextModalOpen(true);
  };
  return { toast, ai, boot, workspaces, workspacesRef, currentWorkspaceId, setCurrentWorkspaceId, data, setData, loadError, quota, setQuota, setWs, startup, reload, liveWorkspaces, currentWorkspace, patch, wid, attempt, updateWorkspace, selectedSpecId, setSelectedSpecId, activeTab, setActiveTab, contextViewMode, setContextViewMode, thinkingView, setThinkingView, previewNonce, setPreviewNonce, selectedContextObject, isContextModalOpen, setIsContextModalOpen, modalDefaultNodeId, isOnboardingOpen, setIsOnboardingOpen, isSpecLibraryOpen, setIsSpecLibraryOpen, isPacksOpen, setIsPacksOpen, approvals, aiRequest, setAiRequest, isStarterOpen, setIsStarterOpen, templateDraft, setTemplateDraft, isPlanModalOpen, setIsPlanModalOpen, isAccountModalOpen, setIsAccountModalOpen, isCustomSpecModalOpen, setIsCustomSpecModalOpen, editingSpec, setEditingSpec, isNewWorkspaceModalOpen, setIsNewWorkspaceModalOpen, newWsName, setNewWsName, nodeDialog, setNodeDialog, extractingNoteId, setExtractingNoteId, setChatScope, packTarget, setPackTarget, isImportOpen, setIsImportOpen, isMemoryOpen, setIsMemoryOpen, isBatchOpen, setIsBatchOpen, changesOpen, setChangesOpen, readNodeId, setReadNodeId, effectNodeId, setEffectNodeId, threadNodeId, setThreadNodeId, pendingRebuild, setPendingRebuild, nodes, workspaceContexts, thoughtDialog, setThoughtDialog, spaceNode, setSpaceNode, openThinkingSpace, archiveOpen, setArchiveOpen, openContext };
}
