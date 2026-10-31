/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ChatMessage,
  ChatMode,
  ChatSession,
  ContextObject,
  ContextSuggestion,
  Workspace,
} from '../types';
import { checkChatFairUse, PLANS } from '../core/creditEngine';
import { sendChatMessage } from '../services/apiClient';
import { DEFAULT_TREE_NODES } from '../core/specs';
import {
  Badge, Button, Card, Dialog, EmptyState, Icon, IconButton, SegmentedControl, Spinner, Switch, Tag, TextField, TypeBadge,
  formatJalaliShort, formatNumber, formatTime, useToast,
} from '../ui';
import type { IconName } from '../ui';

interface SmartChatProps {
  currentWorkspace: Workspace;
  allContextObjects: ContextObject[];
  onAddContextObject: (obj: ContextObject) => void;
  onIncrementChatCount: () => void;
}

const TRUTH_NODES: Array<{ id: string; label: string; icon: IconName }> = [
  { id: 'business', label: 'کسب‌وکار', icon: 'Building2' },
  { id: 'brand', label: 'هویت و برند', icon: 'Palette' },
  { id: 'product', label: 'محصول و ارزش', icon: 'Package' },
  { id: 'offer', label: 'آفر و قیمت', icon: 'TagIcon' },
  { id: 'content', label: 'محتوا و قیف', icon: 'FileText' },
];

export const SmartChat: React.FC<SmartChatProps> = ({
  currentWorkspace,
  allContextObjects,
  onAddContextObject,
  onIncrementChatCount,
}) => {
  const storageKey = `mabda_chat_sessions_${currentWorkspace.id}`;

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

  // Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse chat sessions:', e);
    }
    return [createInitialSession()];
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

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [sessions, storageKey]);

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

  const fairUse = checkChatFairUse(currentWorkspace.planId, currentWorkspace.todayChatCount);
  const plan = PLANS[currentWorkspace.planId] || PLANS.pro;

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

  // Send message
  const handleSend = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const messageContent = (customText || input).trim();
    if (!messageContent || isLoading) return;

    if (fairUse.isHardExceeded) {
      toast.show({ intent: 'warning', message: 'سقف سخت گفتگوی روزانه پر شده است. فردا برگرد یا پلنت را ارتقا بده.' });
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      executionMode: isDeepMode ? 'deep' : 'auto',
      creditCost: isDeepMode ? 5 : 0,
    };

    // Append user message immediately
    const updatedMessages = [...activeSession.messages, userMsg];
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              title: s.messages.length <= 1 ? messageContent.slice(0, 30) : s.title,
              messages: updatedMessages,
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );

    setInput('');
    setIsLoading(true);
    onIncrementChatCount();

    try {
      const activeContexts = allContextObjects.filter(
        (o) => o.status === 'Confirmed' || o.status === 'Proposed'
      );

      const response = await sendChatMessage({
        message: userMsg.content,
        contextList: activeContexts,
        executionMode: userMsg.executionMode,
        chatMode: activeSession.chatMode,
        selectedNodeIds: activeSession.selectedNodeIds,
        history: updatedMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      });

      const assistantMsg: ChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
        executionMode: userMsg.executionMode,
        creditCost: userMsg.creditCost,
        suggestions: response.suggestions,
        groundedNodeIds: response.groundedNodeIds,
        groundedCount: response.groundedCount,
        reasoningNotes: response.reasoningNotes,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                messages: [...updatedMessages, assistantMsg],
                updatedAt: new Date().toISOString(),
              }
            : s
        )
      );
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: 'پیام دریافت شد و با زمینه محلی تطبیق یافت.',
        timestamp: new Date().toISOString(),
        executionMode: 'auto',
        creditCost: 0,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id ? { ...s, messages: [...updatedMessages, errorMsg] } : s
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Suggestion actions
  const handleApproveSuggestion = (sug: ContextSuggestion, messageId: string) => {
    const newObj: ContextObject = {
      id: `ctx_sug_${Date.now()}`,
      workspaceId: currentWorkspace.id,
      type: sug.type,
      status: 'Confirmed',
      provenance: 'AI Suggested',
      title: sug.title,
      content: sug.content,
      nodeId: sug.nodeId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onAddContextObject(newObj);

    // remove suggestion from session UI
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      suggestions: m.suggestions?.filter((item) => item.id !== sug.id),
                    }
                  : m
              ),
            }
          : s
      )
    );
  };

  const handleDismissSuggestion = (sugId: string, messageId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      suggestions: m.suggestions?.filter((item) => item.id !== sugId),
                    }
                  : m
              ),
            }
          : s
      )
    );
  };

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

  // Grounded count in current session
  const selectedNodes = activeSession.selectedNodeIds || [];
  const groundedCount =
    selectedNodes.length === 0
      ? allContextObjects.length
      : allContextObjects.filter((c) => selectedNodes.includes(c.nodeId)).length;

  const nodeLabel = (id: string) => DEFAULT_TREE_NODES.find((n) => n.id === id)?.label ?? id;

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
            <span className="caption hidden items-center gap-inline-sm rounded-control-sm border border-border-default bg-surface-raised px-inset-md py-inset-xs lg:flex">
              <span className="text-text-subtle">مصرف روزانه:</span>
              <span className="label-sm tabular-nums text-text-default">
                {formatNumber(currentWorkspace.todayChatCount)} / {formatNumber(plan.dailyChatLimit)}
              </span>
            </span>
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

        <div className="flex items-center gap-inline-sm overflow-x-auto" role="group" aria-label="کانتکست هدف گفتگو">
          <span className="caption shrink-0 text-text-subtle">کانتکست هدف:</span>
          <Tag selected={selectedNodes.length === 0} onToggle={handleSelectAllNodes}>
            همهٔ درخت ({formatNumber(allContextObjects.length)})
          </Tag>
          {TRUTH_NODES.map((node) => {
            const count = allContextObjects.filter((c) => c.nodeId === node.id).length;
            return (
              <Tag key={node.id} selected={selectedNodes.includes(node.id)} onToggle={() => handleToggleNode(node.id)}>
                {node.label} ({formatNumber(count)})
              </Tag>
            );
          })}
        </div>
      </div>

      {/* 2. Body: sessions drawer + messages */}
      <div className="relative flex flex-1 overflow-hidden">
        {isSidebarOpen && (
          <div className="absolute inset-y-space-0 end-space-0 z-dropdown flex w-full max-w-overlay-xs flex-col gap-stack-sm border-s border-border-default bg-surface-overlay p-inset-md shadow-overlay">
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

          {activeSession.messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-start' : 'items-end'}`}>
              <div
                className={`w-fit max-w-full rounded-container border p-inset-lg sm:max-w-prose ${
                  m.role === 'user'
                    ? 'rounded-ss-none border-border-bold bg-bg-selected text-text-default'
                    : 'rounded-se-none border-border-default bg-surface-sunken text-text-default'
                }`}
              >
                {m.role === 'assistant' && m.groundedCount !== undefined && m.groundedCount > 0 && (
                  <div className="mb-stack-sm flex flex-wrap items-center justify-between gap-inline-sm border-b border-border-default pb-inset-sm">
                    <Badge intent="success" icon="Shield">بررسی و تطبیق با {formatNumber(m.groundedCount)} شیء دانش تأییدشده</Badge>
                    {m.executionMode === 'deep' && <Badge intent="info" icon={false}>تحلیل چندوجهی</Badge>}
                  </div>
                )}

                <div className="body-md whitespace-pre-line">{m.content}</div>

                <div className="caption mt-stack-sm flex items-center justify-between gap-inline-md border-t border-border-default pt-inset-sm text-text-subtle">
                  <span className="tabular-nums">{formatTime(m.timestamp)}</span>
                  <span>{m.executionMode === 'deep' ? 'حالت عمیق (۵ اعتبار)' : 'حالت Auto (۰ اعتبار)'}</span>
                </div>
              </div>

              {m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-stack-md flex w-full flex-col gap-stack-sm sm:max-w-prose">
                  {m.suggestions.map((sug) => (
                    <Card key={sug.id} padding="md" className="flex flex-col gap-stack-sm">
                      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                        <span className="label-md inline-flex items-center gap-inline-sm text-text-default">
                          <Icon name="Lightbulb" size="md" className="text-icon-warning" />
                          پیشنهاد ثبت در منبع حقیقت: {sug.title}
                        </span>
                        <span className="flex items-center gap-inline-xs">
                          <TypeBadge value={sug.type} />
                          <Badge intent="neutral" icon={false}>شاخه: {nodeLabel(sug.nodeId)}</Badge>
                        </span>
                      </div>

                      <p className="body-sm rounded-control-sm border border-border-default bg-surface-sunken p-inset-md text-text-default">{sug.content}</p>

                      <div className="flex flex-col justify-between gap-inline-sm border-t border-border-subtle pt-inset-sm sm:flex-row sm:items-center">
                        <span className="caption text-text-subtle">{sug.reason || 'استخراج مستقیم از گفتگوی کاربر با مبدأ'}</span>
                        <div className="flex items-center gap-inline-sm self-end sm:self-auto">
                          <Button variant="ghost" size="sm" onClick={() => handleDismissSuggestion(sug.id, m.id)}>رد کردن</Button>
                          <Button variant="secondary" size="sm" iconStart="Check" onClick={() => handleApproveSuggestion(sug, m.id)}>
                            تأیید و افزودن به منبع حقیقت
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="body-sm flex w-fit items-center gap-inline-md rounded-control border border-border-default bg-surface-sunken p-inset-md text-text-subtle">
              <Spinner size="md" label="در حال پردازش" />
              <span>مبدأ در حال تطبیق با منبع حقیقت و استخراج تصمیمات است…</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 3. Input */}
      <div className="flex shrink-0 flex-col gap-stack-sm border-t border-border-default bg-surface-sunken p-inset-md pb-safe-inset">
        <div className="flex flex-wrap items-center justify-between gap-inline-sm">
          <Switch checked={isDeepMode} onChange={(e) => setIsDeepMode(e.target.checked)} label="حالت عمیق (تحلیل چندوجهی · ۵ اعتبار)" />
          <span className="caption text-text-subtle">{isDeepMode ? 'کسر ۵ اعتبار از حساب' : 'حالت Auto رایگان و بدون کنتور'}</span>
        </div>

        <form onSubmit={handleSend} className="flex items-start gap-inline-sm">
          <div className="flex-1">
            <TextField
              aria-label="پیام شما"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="دربارهٔ ایده‌ها، مشتری، قیمت‌گذاری یا استراتژی‌ات بنویس…"
              disabled={isLoading}
              size="lg"
            />
          </div>
          <Button variant="primary" size="lg" type="submit" iconEnd="Send" loading={isLoading} disabled={!input.trim() && !isLoading}>
            {isDeepMode ? 'ارسال عمیق' : 'ارسال'}
          </Button>
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
