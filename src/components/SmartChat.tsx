/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import type { AiPlan, GenerationResult, UsageSummary } from '../types';
import {
  ContextDraft,
  TreeNode,
  UsedContextRef,
  ChatMessage,
  ChatMode,
  ChatSession,
  ContextObject,
  ContextSuggestion,
  Workspace,
} from '../types';
import { checkChatFairUse, chatCountToday, chatCredits, effectiveCredits, tehranDay } from '../core/creditEngine';
import { contextDraftFromBlock } from '../core/blocks';
import { asAiError, streamChat } from '../services/apiClient';
import { useAiStatus } from '../services/aiStatus';
import { AiErrorNotice, PlanLine } from './AiNotices';
import { BlockView } from './BlockView';
import { flatten, subtreeIds, ancestorIds } from '../core/nodeTree';
import {
  Badge, Button, Card, Dialog, Icon, IconButton, Markdown, SegmentedControl, Select, Spinner, Switch, Tag, TextField,
  formatJalaliShort, formatNumber, formatTime, useToast,
} from '../ui';
import type { IconName } from '../ui';

interface SmartChatProps {
  currentWorkspace: Workspace;
  allContextObjects: ContextObject[];
  nodes: TreeNode[];
  /** sessions as stored on the server */
  initialSessions: ChatSession[];
  onSaveSession: (session: ChatSession) => void;
  onDeleteSession: (sessionId: string) => void;
  /** open the chat already scoped to this node (from the tree) */
  initialScopeNodeId?: string;
  onAddContextObject: (obj: ContextDraft) => void;
  onIncrementChatCount: () => void;
  /** opens the Context dialog with a prefilled *Proposed* draft */
  onOpenContextModal: (obj: ContextObject) => void;
  onSaveBlockAsAsset: (block: import('../types').ContentBlock, source: { title: string; plan?: AiPlan; usage?: UsageSummary; usedContext?: UsedContextRef[] }) => void;
  /** ledger + credits for a finished chat turn */
  onRecordChatUsage: (result: GenerationResult, creditCost: number, deep: boolean) => void;
  onOpenAiSettings: () => void;
}

export const SmartChat: React.FC<SmartChatProps> = ({
  currentWorkspace,
  allContextObjects,
  nodes,
  initialSessions,
  onSaveSession,
  onDeleteSession,
  initialScopeNodeId,
  onAddContextObject,
  onIncrementChatCount,
  onOpenContextModal,
  onSaveBlockAsAsset,
  onRecordChatUsage,
  onOpenAiSettings,
}) => {
  const ai = useAiStatus();
  const createInitialSession = (): ChatSession => ({
    id: `session_${Date.now()}`,
    workspaceId: currentWorkspace.id,
    title: 'گفتگوی استراتژیک اولیه',
    chatMode: 'discovery',
    selectedNodeIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: 'msg_welcome',
        role: 'assistant',
        content: `سلام! من موتور هوشمند «مبدأ» هستم.
من مستقیماً به درخت منبع حقیقت (Truth Tree) شما متصلم. هر نکته، تصمیم یا محدودیتی که در جریان گفت‌وگو مطرح کنید، به عنوان «شیء دانش (Context Object)» استخراج می‌شود تا در سندها و خروجی‌های بعدی استفاده شود و هرگز گم نشود.

درباره چه بخشی از کسب‌وکار صحبت کنیم؟`,
        timestamp: new Date().toISOString(),
        executionMode: 'auto',
        creditCost: 0,
        groundedCount: allContextObjects.length,
      },
    ],
  });

  // Sessions come from the server; an interrupted stream is shown as an aborted request (retryable), never as a half answer
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (initialSessions.length > 0) {
      return initialSessions.map((sess) => ({
        ...sess,
        messages: sess.messages.map((m) => (m.streaming ? { ...m, streaming: false, blocks: undefined, content: '', error: { kind: 'aborted' as const, message: 'درخواست ناتمام ماند. دوباره تلاش کن.', retryable: true } } : m)),
      }));
    }
    const first = createInitialSession();
    return [initialScopeNodeId ? { ...first, scopeNodeId: initialScopeNodeId } : first];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return sessions[0]?.id || '';
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toast = useToast();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionEditTitle, setSessionEditTitle] = useState('');

  // Active session helper
  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0] || createInitialSession();

  // Local chat input & state
  const [input, setInput] = useState('');
  const [isDeepMode, setIsDeepMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persist changed sessions to the server (debounced; never while an answer is still streaming)
  const saved = useRef<Map<string, string>>(new Map(initialSessions.map((x) => [x.id, JSON.stringify(x)])));
  useEffect(() => {
    const t = setTimeout(() => {
      for (const sess of sessions) {
        if (sess.messages.some((m) => m.streaming)) continue;
        const json = JSON.stringify(sess);
        if (saved.current.get(sess.id) !== json) { saved.current.set(sess.id, json); onSaveSession(sess); }
      }
    }, 600);
    return () => clearTimeout(t);
  }, [sessions, onSaveSession]);

  // Ensure activeSessionId is valid
  useEffect(() => {
    if (!sessions.some((s) => s.id === activeSessionId) && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isLoading]);

  const fairUse = checkChatFairUse(currentWorkspace.planId, chatCountToday(currentWorkspace.todayChatCount, currentWorkspace.chatCountDay, tehranDay()));

  // Create new session
  const handleCreateNewSession = () => {
    const newSession: ChatSession = {
      id: `session_${Date.now()}`,
      workspaceId: currentWorkspace.id,
      title: `گفتگوی جدید ${sessions.length + 1}`,
      chatMode: 'discovery',
      selectedNodeIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: `msg_welcome_${Date.now()}`,
          role: 'assistant',
          content: 'نشست گفتگوی جدید باز شد. هر تصمیم یا فرضیه‌ای که در این نشست مطرح کنید، آماده استخراج و ثبت در منبع حقیقت است.',
          timestamp: new Date().toISOString(),
          executionMode: 'auto',
          creditCost: 0,
        },
      ],
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setIsSidebarOpen(false);
  };

  // Delete session (asks via an alert dialog)
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      toast.show({ intent: 'info', message: 'حداقل یک جلسهٔ گفتگو باید در سیستم باقی بماند.' });
      return;
    }
    setPendingDeleteId(sessionId);
  };

  const confirmDeleteSession = () => {
    const sessionId = pendingDeleteId;
    if (!sessionId) return;
    const remaining = sessions.filter((s) => s.id !== sessionId);
    setSessions(remaining);
    saved.current.delete(sessionId);
    onDeleteSession(sessionId);
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining[0].id);
    }
    setPendingDeleteId(null);
  };

  // Rename session
  const handleSaveSessionTitle = (sessionId: string) => {
    if (!sessionEditTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, title: sessionEditTitle.trim(), updatedAt: new Date().toISOString() } : s
      )
    );
    setEditingSessionId(null);
  };

  // Toggle grounded node
  const handleToggleNode = (nodeId: string) => {
    const currentNodes = activeSession.selectedNodeIds || [];
    let updatedNodes: string[] = [];

    if (currentNodes.includes(nodeId)) {
      updatedNodes = currentNodes.filter((n) => n !== nodeId);
    } else {
      updatedNodes = [...currentNodes, nodeId];
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id ? { ...s, selectedNodeIds: updatedNodes, updatedAt: new Date().toISOString() } : s
      )
    );
  };

  const handleSelectAllNodes = () => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id ? { ...s, selectedNodeIds: [], updatedAt: new Date().toISOString() } : s
      )
    );
  };

  // Change chat mode
  const handleChangeMode = (mode: ChatMode) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id ? { ...s, chatMode: mode, updatedAt: new Date().toISOString() } : s
      )
    );
  };

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchMessage = (sessionId: string, messageId: string, patch: Partial<ChatMessage>) =>
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, updatedAt: new Date().toISOString(), messages: s.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) } : s
      )
    );

  /**
   * Streams one assistant answer for `userMsg`. The placeholder message fills in block by block;
   * on failure it becomes an error message with a retry button — there is no canned reply.
   */
  const runAssistant = async (sessionId: string, userMsg: ChatMessage, history: ChatMessage[], chatMode: ChatMode, focusNodeIds: string[], scopeNodeId?: string) => {
    const deep = userMsg.executionMode === 'deep';
    const placeholder: ChatMessage = {
      id: `msg_a_${Date.now()}`, role: 'assistant', content: '', timestamp: new Date().toISOString(),
      executionMode: userMsg.executionMode, creditCost: 0, streaming: true, blocks: [],
    };
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, messages: [...s.messages, placeholder] } : s)));
    const ctl = new AbortController();
    abortRef.current = ctl;
    setIsLoading(true);
    let live: ChatMessage['blocks'] = [];
    try {
      const result = await streamChat(
        {
          message: userMsg.content,
          workspaceId: currentWorkspace.id,
          scopeNodeId,
          focusNodeIds,
          chatMode,
          deep: deep && !fairUse.isSoftExceeded,
          fast: fairUse.isSoftExceeded,
          history: history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        },
        {
          onPlan: (plan) => patchMessage(sessionId, placeholder.id, { plan }),
          onBlock: (block) => { live = [...(live ?? []), block]; patchMessage(sessionId, placeholder.id, { blocks: live }); },
        },
        ctl.signal,
      );
      const credits = ai.managedEnabled ? effectiveCredits(chatCredits(deep), result.usage.byok) : 0;
      patchMessage(sessionId, placeholder.id, {
        streaming: false,
        content: result.markdown,
        blocks: result.blocks,
        plan: result.plan,
        usage: result.usage,
        usedContext: result.usedContext,
        creditCost: credits,
        groundedCount: inScope.filter((c) => c.status === 'Confirmed').length,
      });
      onRecordChatUsage(result, credits, deep);
    } catch (err) {
      const info = asAiError(err);
      if (info.kind === 'aborted' && ctl.signal.aborted) {
        // user pressed stop: drop the unfinished answer entirely
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, messages: s.messages.filter((m) => m.id !== placeholder.id) } : s)));
      } else {
        patchMessage(sessionId, placeholder.id, { streaming: false, blocks: undefined, content: '', error: info });
      }
    } finally {
      setIsLoading(false);
      if (abortRef.current === ctl) abortRef.current = null;
    }
  };

  // Send message
  const handleSend = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const messageContent = (customText || input).trim();
    if (!messageContent || isLoading) return;

    if (ai.managedEnabled && isDeepMode && currentWorkspace.creditsRemaining < chatCredits(true) && !ai.byok) {
      toast.show({ intent: 'warning', message: 'اعتبار برای گفتگوی عمیق کافی نیست.' });
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      executionMode: isDeepMode && !fairUse.isSoftExceeded ? 'deep' : 'auto',
      creditCost: 0,
    };

    const updatedMessages = [...activeSession.messages, userMsg];
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, title: s.messages.length <= 1 ? messageContent.slice(0, 30) : s.title, messages: updatedMessages, updatedAt: new Date().toISOString() }
          : s
      )
    );
    setInput('');
    onIncrementChatCount();
    await runAssistant(activeSession.id, userMsg, updatedMessages, activeSession.chatMode, activeSession.selectedNodeIds, activeSession.scopeNodeId);
  };

  /** Retry a failed answer: remove the error message and ask again with the same user message. */
  const handleRetry = async (errorMsgId: string) => {
    if (isLoading) return;
    const idx = activeSession.messages.findIndex((m) => m.id === errorMsgId);
    const userMsg = [...activeSession.messages.slice(0, idx)].reverse().find((m) => m.role === 'user');
    if (idx < 0 || !userMsg) return;
    const before = activeSession.messages.slice(0, idx);
    setSessions((prev) => prev.map((s) => (s.id === activeSession.id ? { ...s, messages: before } : s)));
    await runAssistant(activeSession.id, userMsg, before, activeSession.chatMode, activeSession.selectedNodeIds, activeSession.scopeNodeId);
  };

  const updateBlocks = (messageId: string, fn: (b: import('../types').ContentBlock) => import('../types').ContentBlock) =>
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, messages: s.messages.map((m) => (m.id === messageId && m.blocks ? { ...m, blocks: m.blocks.map(fn) } : m)) }
          : s
      )
    );

  // Proposal actions (explicit user approval is what creates Confirmed context)
  const handleApproveProposal = (block: import('../types').ContentBlock, messageId: string) => {
    if (!block.proposal) return;
    const p = block.proposal;
    onAddContextObject({ workspaceId: currentWorkspace.id, type: p.type, status: 'Confirmed', provenance: 'AI Suggested', title: p.title, content: p.content, nodeId: p.nodeId });
    updateBlocks(messageId, (b) => (b.id === block.id ? { ...b, proposal: undefined } : b));
  };
  const handleDismissProposal = (block: import('../types').ContentBlock, messageId: string) =>
    updateBlocks(messageId, (b) => (b.id === block.id ? { ...b, proposal: undefined } : b));

  // Calculate gaps for prompt starters
  const gapsPrompts: Array<{ label: string; text: string; icon: IconName }> = [
    {
      label: 'تعریف مشتری ایده‌آل (ICP)',
      text: 'می‌خواهم مشتری ایده‌آل، نقطه درد اصلی و دلیل خرید او را در کسب‌وکارمان شفاف و نهایی کنیم.',
      icon: 'Target',
    },
    {
      label: 'قیمت‌گذاری و سطوح آفر',
      text: 'پیشنهادهای قیمت‌گذاری و مرزهای عدم تخفیف آفر ما چطور باید تنظیم شود تا اقتصاد صادقانه حفظ گردد؟',
      icon: 'TagIcon',
    },
    {
      label: 'ممیزی تناقضات در وعده‌ها',
      text: 'لطفاً تمام ادعاها و تصمیماتی که تا الان در منبع حقیقت ثبت کرده‌ایم را بازبینی کن و اگر تناقضی هست نشان بده.',
      icon: 'Search',
    },
    {
      label: 'تدوین لحن و خطوط قرمز برند',
      text: 'خطوط قرمز محتوایی و لحن ارتباطی برندمان در بازار ایران را چطور ساختاریافته کنیم؟',
      icon: 'Palette',
    },
  ];

  // Grounded count in current session: node chat = the node's sub-tree + its ancestors; otherwise the chips or the whole tree
  const selectedNodes = activeSession.selectedNodeIds || [];
  const scope = activeSession.scopeNodeId && nodes.some((n) => n.id === activeSession.scopeNodeId) ? activeSession.scopeNodeId : undefined;
  const live = allContextObjects.filter((c) => c.status !== 'Archived' && c.status !== 'Superseded');
  const scopeIds = scope ? new Set([...subtreeIds(nodes, scope), ...ancestorIds(nodes, scope)]) : null;
  const inScope = scopeIds ? live.filter((c) => scopeIds.has(c.nodeId)) : live;
  const groundedCount = !scope && selectedNodes.length > 0 ? live.filter((c) => selectedNodes.includes(c.nodeId)).length : inScope.length;

  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const handleScope = (nodeId: string) =>
    setSessions((prev) => prev.map((x) => (x.id === activeSession.id ? { ...x, scopeNodeId: nodeId || undefined, selectedNodeIds: [], updatedAt: new Date().toISOString() } : x)));

  return (
    <Card padding="none" className="relative flex h-chat flex-col overflow-hidden">
      {/* 1. Header: sessions, mode, grounding */}
      <div className="flex shrink-0 flex-col gap-stack-md border-b border-border-default bg-surface-sunken p-inset-md sm:p-inset-lg">
        <div className="flex items-center justify-between gap-inline-sm">
          <div className="flex min-w-space-0 items-center gap-inline-sm">
            <Button
              variant="secondary"
              size="sm"
              iconStart="MessageSquare"
              aria-expanded={isSidebarOpen}
              aria-label="نشست‌های گفتگو"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="مشاهدهٔ نشست‌های گفتگو"
            >
              <span className="hidden sm:inline">گفتگوها </span>({formatNumber(sessions.length)})
            </Button>
            <h3 className="title truncate text-text-default">{activeSession.title}</h3>
          </div>

          <div className="flex shrink-0 items-center gap-inline-sm">
            <Button variant="secondary" size="sm" iconStart="Plus" onClick={handleCreateNewSession}>گفتگوی جدید</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-inline-sm border-t border-border-subtle pt-inset-sm">
          <SegmentedControl
            label="حالت گفتگو"
            value={activeSession.chatMode}
            onChange={(id) => handleChangeMode(id as ChatMode)}
            items={[
              { id: 'discovery', label: 'کشف و استخراج تصمیمات', icon: 'Lightbulb' },
              { id: 'audit', label: 'ممیزی تناقضات', icon: 'Shield' },
              { id: 'advisor', label: 'مشاورهٔ آفر و بیزنس', icon: 'TrendingUp' },
            ]}
          />
          <Badge intent="success" icon="Link2">متصل به {formatNumber(groundedCount)} شیء دانش</Badge>
        </div>

        <div className="flex flex-col gap-inline-sm sm:flex-row sm:items-end">
          <div className="sm:w-overlay-xs">
            <Select
              label="محدودهٔ گفتگو"
              value={activeSession.scopeNodeId ?? ''}
              onChange={(e) => handleScope(e.target.value)}
              options={[{ value: '', label: 'کل درخت' }, ...flatten(nodes).map(({ node, depth }) => ({ value: node.id, label: `${'— '.repeat(depth)}${node.label}` }))]}
            />
          </div>
          {scope ? (
            <p className="caption text-text-subtle">
              گفتگو فقط به «{nodeLabel(scope)}»، زیرشاخه‌ها و والدهایش (برای ارث‌بری) وصل است؛ پیشنهاد به‌روزرسانی هم فقط برای همین شاخه و زیرشاخه‌هایش ساخته می‌شود.
            </p>
          ) : (
            <div className="flex items-center gap-inline-sm overflow-x-auto" role="group" aria-label="کانتکست هدف گفتگو">
              <span className="caption shrink-0 text-text-subtle">کانتکست هدف:</span>
              <Tag selected={selectedNodes.length === 0} onToggle={handleSelectAllNodes}>
                همهٔ درخت ({formatNumber(live.length)})
              </Tag>
              {nodes.map((node) => {
                const count = live.filter((c) => c.nodeId === node.id).length;
                return (
                  <Tag key={node.id} selected={selectedNodes.includes(node.id)} onToggle={() => handleToggleNode(node.id)}>
                    {node.label} ({formatNumber(count)})
                  </Tag>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. Body: sessions drawer + messages */}
      <div className="relative flex flex-1 overflow-hidden">
        {isSidebarOpen && (
          <div className="absolute inset-y-space-0 end-space-0 z-raised flex w-full max-w-overlay-xs flex-col gap-stack-sm border-s border-border-default bg-surface-overlay p-inset-md shadow-overlay">
            <div className="flex items-center justify-between border-b border-border-default pb-inset-sm">
              <span className="label-md text-text-default">نشست‌های گفتگوی تو</span>
              <IconButton icon="X" label="بستن فهرست گفتگوها" size="sm" onClick={() => setIsSidebarOpen(false)} />
            </div>

            <Button variant="secondary" fullWidth iconStart="Plus" onClick={handleCreateNewSession}>شروع گفتگوی جدید</Button>

            <ul className="flex flex-1 flex-col gap-stack-xs overflow-y-auto" aria-label="نشست‌های گفتگو">
              {sessions.map((sess) => {
                const isActive = sess.id === activeSession.id;
                const isEditing = editingSessionId === sess.id;
                return (
                  <li key={sess.id} className={`rounded-control border p-inset-sm ${isActive ? 'border-border-selected bg-bg-selected' : 'border-transparent'}`}>
                    {isEditing ? (
                      <div className="flex items-end gap-inline-xs">
                        <TextField
                          label="نام گفتگو"
                          size="sm"
                          value={sessionEditTitle}
                          autoFocus
                          onChange={(e) => setSessionEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveSessionTitle(sess.id);
                          }}
                        />
                        <IconButton icon="Check" label="ذخیرهٔ نام" onClick={() => handleSaveSessionTitle(sess.id)} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-inline-xs">
                        <button
                          type="button"
                          aria-current={isActive ? 'true' : undefined}
                          onClick={() => {
                            setActiveSessionId(sess.id);
                            setIsSidebarOpen(false);
                          }}
                          className="flex min-h-touch min-w-space-0 flex-1 flex-col justify-center text-start"
                        >
                          <span className="label-md truncate text-text-default">{sess.title}</span>
                          <span className="caption flex justify-between gap-inline-sm text-text-subtle">
                            <span>{formatNumber(sess.messages.length)} پیام</span>
                            <span>{formatJalaliShort(sess.updatedAt)}</span>
                          </span>
                        </button>
                        <IconButton
                          icon="Pencil"
                          label="تغییر نام"
                          size="sm"
                          onClick={() => {
                            setEditingSessionId(sess.id);
                            setSessionEditTitle(sess.title);
                          }}
                        />
                        <IconButton icon="Trash2" label="حذف نشست" size="sm" onClick={(e) => handleDeleteSession(sess.id, e)} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-1 flex-col gap-stack-md overflow-y-auto p-inset-md sm:p-inset-lg">
          {activeSession.messages.length <= 2 && (
            <Card padding="md" className="flex flex-col gap-stack-sm">
              <div className="flex items-center justify-between gap-inline-sm">
                <span className="label-md inline-flex items-center gap-inline-sm text-text-default">
                  <Icon name="Zap" size="md" className="text-icon-subtle" />
                  پیشنهادهای شروع بر اساس شکاف‌های دانش فعلی
                </span>
                <span className="caption text-text-subtle">یک انتخاب برای آغاز</span>
              </div>
              <div className="grid grid-cols-1 gap-inline-sm sm:grid-cols-2">
                {gapsPrompts.map((p, idx) => (
                  <Card key={idx} padding="md" onClick={() => handleSend(undefined, p.text)} className="flex flex-col gap-stack-xs">
                    <span className="label-md inline-flex items-center gap-inline-sm text-text-default">
                      <Icon name={p.icon} size="md" className="text-icon-subtle" />
                      {p.label}
                    </span>
                    <p className="body-sm line-clamp-2 text-text-subtle">{p.text}</p>
                  </Card>
                ))}
              </div>
            </Card>
          )}

          {activeSession.messages.map((m) => {
            const isIntro = m.id.startsWith('msg_welcome');
            return (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-start' : 'items-end'}`}>
                {isIntro ? (
                  // fixed product intro, not a model answer
                  <div className="body-sm w-full whitespace-pre-line rounded-control border border-border-default bg-surface-sunken p-inset-lg text-text-subtle sm:max-w-prose">{m.content}</div>
                ) : m.error ? (
                  <div className="w-full sm:max-w-prose">
                    <AiErrorNotice error={m.error} onRetry={() => void handleRetry(m.id)} retrying={isLoading} onOpenSettings={onOpenAiSettings} />
                  </div>
                ) : (
                  <div
                    className={`flex w-fit max-w-full flex-col gap-stack-md rounded-container border p-inset-lg sm:max-w-prose ${
                      m.role === 'user'
                        ? 'rounded-ss-none border-border-bold bg-bg-selected text-text-default'
                        : 'rounded-se-none border-border-default bg-surface-sunken text-text-default'
                    }`}
                  >
                    {m.role === 'assistant' && !m.streaming && m.groundedCount !== undefined && m.groundedCount > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-inline-sm border-b border-border-default pb-inset-sm">
                        <Badge intent="success" icon="Shield">بررسی و تطبیق با {formatNumber(m.groundedCount)} شیء دانش تأییدشده</Badge>
                        {m.executionMode === 'deep' && <Badge intent="info" icon={false}>تحلیل چندوجهی</Badge>}
                      </div>
                    )}

                    {m.role === 'user' ? (
                      <div className="body-md whitespace-pre-line">{m.content}</div>
                    ) : m.blocks && m.blocks.length > 0 ? (
                      m.blocks.map((b) => (
                        <BlockView
                          key={b.id}
                          block={b}
                          onAddToContext={m.streaming ? undefined : (blk) => onOpenContextModal(contextDraftFromBlock(blk, currentWorkspace.id))}
                          onSaveAsAsset={m.streaming ? undefined : (blk) => onSaveBlockAsAsset(blk, { title: activeSession.title, plan: m.plan, usage: m.usage, usedContext: m.usedContext })}
                          onApproveProposal={m.streaming ? undefined : (blk) => handleApproveProposal(blk, m.id)}
                          onDismissProposal={(blk) => handleDismissProposal(blk, m.id)}
                        />
                      ))
                    ) : m.content ? (
                      <Markdown>{m.content}</Markdown>
                    ) : m.streaming ? (
                      <div className="body-sm flex items-center gap-inline-sm text-text-subtle">
                        <Spinner size="sm" label="در حال نوشتن" />
                        {m.plan ? 'در حال نوشتن…' : 'در حال تعیین حالت اجرا…'}
                      </div>
                    ) : null}

                    {m.role === 'assistant' && m.streaming && m.blocks && m.blocks.length > 0 && (
                      <div className="body-sm flex items-center gap-inline-sm text-text-subtle"><Spinner size="sm" label="در حال نوشتن" />در حال نوشتن…</div>
                    )}

                    <div className="caption flex items-center justify-between gap-inline-md border-t border-border-default pt-inset-sm text-text-subtle">
                      <span className="tabular-nums">{formatTime(m.timestamp)}</span>
                      {m.role === 'user' ? (
                        <span>{m.executionMode === 'deep' ? (ai.managedEnabled ? `حالت عمیق (${formatNumber(chatCredits(true))} اعتبار)` : 'حالت عمیق') : (ai.managedEnabled ? 'حالت Auto (۰ اعتبار)' : 'حالت Auto')}</span>
                      ) : null}
                    </div>
                    {m.role === 'assistant' && !m.streaming && m.plan && <PlanLine plan={m.plan} usage={m.usage} credits={m.creditCost} />}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && activeSession.messages.every((m) => !m.streaming) && (
            <div className="body-sm flex w-fit items-center gap-inline-md rounded-control border border-border-default bg-surface-sunken p-inset-md text-text-subtle">
              <Spinner size="md" label="در حال پردازش" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 3. Input */}
      <div className="flex shrink-0 flex-col gap-stack-sm border-t border-border-default bg-surface-sunken p-inset-md pb-safe-inset">
        <div className="flex flex-wrap items-center justify-between gap-inline-sm">
          <Switch checked={isDeepMode && !fairUse.isSoftExceeded} disabled={fairUse.isSoftExceeded} onChange={(e) => setIsDeepMode(e.target.checked)} label={ai.managedEnabled ? 'حالت عمیق (تحلیل چندوجهی · ۵ اعتبار)' : 'حالت عمیق (تحلیل چندوجهی)'} />
          <span className="caption text-text-subtle">{fairUse.isSoftExceeded ? 'امروز زیاد گفتگو کردی؛ تا فردا پاسخ‌ها سریع‌تر و سبک‌تر است و حالت عمیق متوقف است.' : ai.managedEnabled ? (isDeepMode ? 'کسر ۵ اعتبار از حساب' : 'حالت Auto رایگان و بدون کنتور') : (isDeepMode ? 'تحلیل عمیق‌تر؛ کندتر و پرتوکن‌تر' : 'حالت Auto')}</span>
        </div>

        <form onSubmit={handleSend} className="flex items-start gap-inline-sm">
          <div className="flex-1">
            <TextField
              aria-label="پیام شما"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ai.available ? 'دربارهٔ ایده‌ها، مشتری، قیمت‌گذاری یا استراتژی‌ات بنویس…' : 'برای شروع، کلید هوش مصنوعی را تنظیم کن'}
              disabled={isLoading || !ai.available}
              size="lg"
            />
          </div>
          {isLoading ? (
            <Button variant="secondary" size="lg" iconStart="X" onClick={() => abortRef.current?.abort()}>توقف</Button>
          ) : (
            <Button variant="primary" size="lg" type="submit" iconEnd="Send" disabled={!input.trim() || !ai.available}>
              {isDeepMode ? 'ارسال عمیق' : 'ارسال'}
            </Button>
          )}
        </form>
      </div>

      <Dialog
        alert
        size="sm"
        open={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title="حذف این گفتگو؟"
        description="با حذف نشست، پیام‌های آن از این دستگاه پاک می‌شود."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDeleteId(null)}>انصراف</Button>
            <Button variant="danger-bold" onClick={confirmDeleteSession}>حذف گفتگو</Button>
          </>
        }
      />
    </Card>
  );
};
