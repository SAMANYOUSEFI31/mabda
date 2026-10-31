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

interface SmartChatProps {
  currentWorkspace: Workspace;
  allContextObjects: ContextObject[];
  onAddContextObject: (obj: ContextObject) => void;
  onIncrementChatCount: () => void;
}

const TRUTH_NODES: Array<{ id: string; label: string; icon: string }> = [
  { id: 'business', label: 'کسب‌وکار', icon: '🏢' },
  { id: 'brand', label: 'هویت و برند', icon: '🎨' },
  { id: 'product', label: 'محصول و ارزش', icon: '📦' },
  { id: 'offer', label: 'آفر و قیمت', icon: '🏷️' },
  { id: 'content', label: 'محتوا و قیف', icon: '📝' },
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

  // Delete session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      alert('حداقل یک جلسه گفتگو باید در سیستم باقی بماند.');
      return;
    }
    if (confirm('آیا از حذف این گفتگو اطمینان دارید؟')) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining[0].id);
      }
    }
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
      alert('سقف سخت گفتگوی روزانه پر شده است. لطفاً فردا مراجعه فرمایید یا پلن خود را ارتقا دهید.');
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
  const gapsPrompts: Array<{ label: string; text: string; icon: string }> = [
    {
      label: 'تعریف مشتری ایده‌آل (ICP)',
      text: 'می‌خواهم مشتری ایده‌آل، نقطه درد اصلی و دلیل خرید او را در کسب‌وکارمان شفاف و نهایی کنیم.',
      icon: '🎯',
    },
    {
      label: 'قیمت‌گذاری و سطوح آفر',
      text: 'پیشنهادهای قیمت‌گذاری و مرزهای عدم تخفیف آفر ما چطور باید تنظیم شود تا اقتصاد صادقانه حفظ گردد؟',
      icon: '🏷️',
    },
    {
      label: 'ممیزی تناقضات در وعده‌ها',
      text: 'لطفاً تمام ادعاها و تصمیماتی که تا الان در منبع حقیقت ثبت کرده‌ایم را بازبینی کن و اگر تناقضی هست نشان بده.',
      icon: '🔍',
    },
    {
      label: 'تدوین لحن و خطوط قرمز برند',
      text: 'خطوط قرمز محتوایی و لحن ارتباطی برندمان در بازار ایران را چطور ساختاریافته کنیم؟',
      icon: '🎨',
    },
  ];

  // Grounded count in current session
  const selectedNodes = activeSession.selectedNodeIds || [];
  const groundedCount =
    selectedNodes.length === 0
      ? allContextObjects.length
      : allContextObjects.filter((c) => selectedNodes.includes(c.nodeId)).length;

  return (
    <div className="bg-surface-raised border border-border-default rounded-container flex flex-col h-[calc(100dvh-130px)] md:h-[720px] text-end shadow-overlay overflow-hidden relative font-sans">
      {/* 1. Header with Sessions Bar, Grounding Indicator & Mode Switcher */}
      <div className="p-inset-md sm:p-inset-lg border-b border-border-default bg-surface-sunken shrink-0 space-y-stack-md">
        {/* Top bar row: Title, Session Switcher, New Chat Button */}
        <div className="flex items-center justify-between gap-inline-sm">
          <div className="flex items-center gap-inline-sm min-w-space-0">
            {/* Sidebar toggle for sessions on mobile & desktop */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="px-inset-md py-inset-sm rounded-control-sm bg-surface-raised hover:bg-interaction-hover border border-border-default text-body-sm text-text-default flex items-center gap-inline-sm transition-colors shrink-0"
              title="مشاهده نشست‌های گفتگو"
            >
              <span>💬</span>
              <span className="font-semibold hidden sm:inline">گفتگوها</span>
              <span className="text-caption text-text-subtlest font-mono">({sessions.length})</span>
            </button>

            {/* Current Active Session Title */}
            <div className="truncate">
              <h3 className="text-body-sm sm:text-body-md font-bold text-text-default truncate flex items-center gap-inline-sm">
                <span>{activeSession.title}</span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-inline-sm shrink-0">
            {/* New Chat Button */}
            <button
              onClick={handleCreateNewSession}
              className="px-inset-md py-inset-sm text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors flex items-center gap-inline-xs shadow-raised"
            >
              <span>+</span>
              <span>گفتگوی جدید</span>
            </button>

            {/* Daily Fair Use Badge */}
            <div className="hidden lg:flex items-center gap-inline-sm text-caption bg-surface-raised border border-border-default px-inset-md py-inset-xs rounded-control-sm">
              <span className="text-text-subtle">مصرف روزانه:</span>
              <span className="font-bold text-text-default tabular-nums">
                {currentWorkspace.todayChatCount}/{plan.dailyChatLimit}
              </span>
            </div>
          </div>
        </div>

        {/* Second Row: Chat Modes (Discovery / Contradiction Audit / Strategic Advisor) */}
        <div className="flex flex-wrap items-center justify-between gap-inline-sm pt-inset-xs border-t border-border-subtle">
          <div className="flex items-center gap-inline-xs bg-surface-raised border border-border-default p-inset-xs rounded-control-sm text-body-sm overflow-x-auto max-w-full">
            <button
              onClick={() => handleChangeMode('discovery')}
              className={`px-inset-md py-inset-xs rounded-control-sm text-caption font-semibold transition-colors whitespace-nowrap flex items-center gap-inline-xs ${
                activeSession.chatMode === 'discovery'
                  ? 'bg-bg-brand-bold text-text-default shadow-raised'
                  : 'text-text-subtle hover:text-text-default'
              }`}
            >
              <span>💡</span>
              <span>کشف و استخراج تصمیمات</span>
            </button>

            <button
              onClick={() => handleChangeMode('audit')}
              className={`px-inset-md py-inset-xs rounded-control-sm text-caption font-semibold transition-colors whitespace-nowrap flex items-center gap-inline-xs ${
                activeSession.chatMode === 'audit'
                  ? 'bg-bg-brand-bold text-text-default shadow-raised'
                  : 'text-text-subtle hover:text-text-default'
              }`}
            >
              <span>🛡️</span>
              <span>ممیزی تناقضات</span>
            </button>

            <button
              onClick={() => handleChangeMode('advisor')}
              className={`px-inset-md py-inset-xs rounded-control-sm text-caption font-semibold transition-colors whitespace-nowrap flex items-center gap-inline-xs ${
                activeSession.chatMode === 'advisor'
                  ? 'bg-bg-brand-bold text-text-default shadow-raised'
                  : 'text-text-subtle hover:text-text-default'
              }`}
            >
              <span>📈</span>
              <span>مشاوره آفر و بیزنس</span>
            </button>
          </div>

          {/* Grounding Status badge */}
          <div className="text-caption text-text-subtle flex items-center gap-inline-sm shrink-0">
            <span className="w-space-2 h-space-2 rounded-pill bg-bg-success-bold" />
            <span>متصل به {groundedCount} شیء دانش</span>
          </div>
        </div>

        {/* Third Row: Truth Tree Grounding Selector (انتخاب کانتکست هدف گفتگو) */}
        <div className="flex items-center gap-inline-sm overflow-x-auto no-scrollbar pt-inset-xs text-caption">
          <span className="text-text-subtlest shrink-0 text-caption ps-inset-xs">کانتکست هدف:</span>

          <button
            onClick={handleSelectAllNodes}
            className={`px-inset-sm py-inset-xs rounded-control-sm text-caption border transition-colors shrink-0 ${
              selectedNodes.length === 0
                ? 'bg-bg-neutral-subtle text-text-default border-border-bold'
                : 'text-text-subtle border-transparent hover:text-text-default hover:bg-surface-raised'
            }`}
          >
            همه درخت ({allContextObjects.length})
          </button>

          {TRUTH_NODES.map((node) => {
            const isSelected = selectedNodes.includes(node.id);
            const count = allContextObjects.filter((c) => c.nodeId === node.id).length;
            return (
              <button
                key={node.id}
                onClick={() => handleToggleNode(node.id)}
                className={`px-inset-sm py-inset-xs rounded-control-sm text-caption border flex items-center gap-inline-xs transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-bg-brand-subtle text-text-brand border-border-brand-subtle font-semibold'
                    : 'text-text-subtle border-transparent hover:text-text-default hover:bg-surface-raised'
                }`}
              >
                <span>{node.icon}</span>
                <span>{node.label}</span>
                <span className="text-caption opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Body Area: Sessions Drawer Overlay + Messages */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sessions Sidebar / Drawer */}
        {isSidebarOpen && (
          <div className="absolute inset-y-space-0 end-space-0 z-dropdown w-container-overlay-xs max-w-[85%] bg-surface-raised border-s border-border-default shadow-overlay flex flex-col p-inset-md slide-in-from-right-4">
            <div className="flex items-center justify-between pb-inset-md border-b border-border-default">
              <span className="text-body-sm font-bold text-text-default">نشست‌های گفتگوی شما</span>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-text-subtle hover:text-text-default p-inset-xs text-body-sm"
              >
                ✕
              </button>
            </div>

            <div className="my-stack-sm">
              <button
                onClick={handleCreateNewSession}
                className="w-full py-inset-sm px-inset-md text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover rounded-control-sm transition-colors flex items-center justify-center gap-inline-xs shadow-raised"
              >
                <span>+</span>
                <span>شروع گفتگوی جدید</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-stack-sm pe-inset-xs">
              {sessions.map((sess) => {
                const isActive = sess.id === activeSession.id;
                const isEditing = editingSessionId === sess.id;

                return (
                  <div
                    key={sess.id}
                    onClick={() => {
                      setActiveSessionId(sess.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`group p-inset-md rounded-control border text-body-sm cursor-pointer transition-all flex flex-col gap-inline-xs ${
                      isActive
                        ? 'bg-surface-raised border-border-brand-subtle text-text-default shadow-raised'
                        : 'bg-transparent border-transparent hover:bg-surface-raised text-text-subtle hover:text-text-default'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-inline-xs">
                      {isEditing ? (
                        <div
                          className="flex items-center gap-inline-xs w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={sessionEditTitle}
                            onChange={(e) => setSessionEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveSessionTitle(sess.id);
                            }}
                            className="bg-surface-sunken border border-border-default rounded-indicator px-inset-sm py-inset-xs text-body-sm text-text-default w-full"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveSessionTitle(sess.id)}
                            className="text-text-success hover:text-text-default px-inset-xs"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <span className="font-semibold truncate flex-1 text-end">
                          {sess.title}
                        </span>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-inline-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSessionId(sess.id);
                              setSessionEditTitle(sess.title);
                            }}
                            className="text-text-subtle hover:text-text-default p-inset-xs text-caption"
                            title="تغییر نام"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => handleDeleteSession(sess.id, e)}
                            className="text-text-brand hover:text-text-brand p-inset-xs text-caption"
                            title="حذف نشست"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-caption text-text-subtlest">
                      <span>{sess.messages.length} پیام</span>
                      <span>
                        {new Date(sess.updatedAt).toLocaleDateString('fa-IR', {
                          month: 'numeric',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-inset-md sm:p-inset-lg space-y-stack-md">
          {/* Prompt Starters when chat is young */}
          {activeSession.messages.length <= 2 && (
            <div className="bg-surface-raised border border-border-default rounded-control p-inset-md sm:p-inset-lg space-y-stack-sm">
              <div className="flex items-center justify-between">
                <span className="text-body-sm font-bold text-text-default flex items-center gap-inline-sm">
                  <span>⚡</span>
                  <span>پیشنهادهای شروع بر اساس شکاف‌های دانش فعلی:</span>
                </span>
                <span className="text-caption text-text-subtlest">یک کلیک برای آغاز</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-inline-sm pt-inset-xs">
                {gapsPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(undefined, p.text)}
                    className="text-end p-inset-md rounded-control-sm bg-surface-raised hover:bg-interaction-hover border border-border-default hover:border-border-bold text-body-sm transition-all group"
                  >
                    <div className="flex items-center gap-inline-sm">
                      <span>{p.icon}</span>
                      <span className="font-semibold text-text-default group-hover:text-text-brand transition-colors">
                        {p.label}
                      </span>
                    </div>
                    <p className="text-caption text-text-subtle mt-stack-xs line-clamp-2 leading-relaxed">
                      {p.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeSession.messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${
                m.role === 'user' ? 'items-start' : 'items-end'
              }`}
            >
              <div
                className={`max-w-[92%] sm:max-w-[85%] rounded-container p-inset-lg sm:p-inset-lg text-body-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-bg-brand-bold text-text-default rounded-ee-none shadow-overflow'
                    : 'bg-surface-sunken text-text-default border border-border-default rounded-es-none shadow-raised'
                }`}
              >
                {/* Assistant Grounding Badge */}
                {m.role === 'assistant' && m.groundedCount !== undefined && m.groundedCount > 0 && (
                  <div className="mb-stack-sm pb-inset-sm border-b border-border-default flex items-center justify-between text-caption text-text-success">
                    <span className="flex items-center gap-inline-xs">
                      <span>🛡️</span>
                      <span>بررسی و تطبیق با {m.groundedCount} شیء دانش تأییدشده</span>
                    </span>
                    {m.executionMode === 'deep' && (
                      <span className="text-text-warning bg-bg-warning-subtle px-inset-xs rounded-indicator">
                        تحلیل چندوجهی
                      </span>
                    )}
                  </div>
                )}

                <div className="whitespace-pre-line selection:bg-bg-neutral-subtle-pressed">{m.content}</div>

                <div
                  className={`mt-stack-sm pt-inset-sm border-t text-caption flex items-center justify-between gap-inline-md ${
                    m.role === 'user'
                      ? 'border-border-bold text-text-default'
                      : 'border-border-default text-text-subtlest'
                  }`}
                >
                  <span>
                    {new Date(m.timestamp).toLocaleTimeString('fa-IR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>
                    {m.executionMode === 'deep' ? 'حالت عمیق (۵ اعتبار)' : 'حالت Auto (۰ اعتبار)'}
                  </span>
                </div>
              </div>

              {/* Context Suggestions Cards (F13 & P6 - Structure is the Asset) */}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="w-[92%] sm:w-[85%] mt-stack-md space-y-stack-sm">
                  {m.suggestions.map((sug) => (
                    <div
                      key={sug.id}
                      className="bg-surface-sunken border border-border-warning-subtle rounded-control p-inset-md sm:p-inset-lg space-y-stack-sm text-body-sm shadow-overflow"
                    >
                      <div className="flex items-center justify-between gap-inline-sm">
                        <div className="flex items-center gap-inline-sm">
                          <span className="text-body-md">💡</span>
                          <span className="font-bold text-text-warning">
                            پیشنهاد ثبت در منبع حقیقت: {sug.title}
                          </span>
                          <span className="text-caption bg-bg-warning-subtle text-text-warning px-inset-sm py-inset-xs rounded-indicator font-mono">
                            {sug.type}
                          </span>
                        </div>
                        <span className="text-caption text-text-subtle bg-surface-raised px-inset-sm py-inset-xs rounded-indicator border border-border-default">
                          شاخه: {sug.nodeId}
                        </span>
                      </div>

                      <p className="text-text-default bg-surface-raised p-inset-md rounded-control-sm border border-border-default leading-relaxed">
                        {sug.content}
                      </p>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-inline-sm pt-inset-xs border-t border-border-subtle">
                        <span className="text-caption text-text-subtlest">
                          {sug.reason || 'استخراج مستقیم از گفتگوی کاربر با مبدأ'}
                        </span>

                        <div className="flex items-center gap-inline-sm self-end sm:self-auto">
                          <button
                            onClick={() => handleDismissSuggestion(sug.id, m.id)}
                            className="px-inset-md py-inset-xs text-body-sm text-text-subtle hover:text-text-default rounded-indicator hover:bg-interaction-hover transition-colors"
                          >
                            رد کردن
                          </button>
                          <button
                            onClick={() => handleApproveSuggestion(sug, m.id)}
                            className="px-inset-lg py-inset-xs text-body-sm font-semibold text-text-default bg-bg-success-bold hover:bg-bg-success-bold-hover rounded-control-sm transition-colors shadow-raised"
                          >
                            تأیید و افزودن به منبع حقیقت ✓
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-inline-md text-body-sm text-text-subtle bg-surface-sunken p-inset-md rounded-control border border-border-default w-fit">
              <span className="animate-spin text-body-md">⚙️</span>
              <span>مبدأ در حال تطبیق با منبع حقیقت و استخراج تصمیمات است...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 3. Sticky Input Area with Mobile Ergonomics */}
      <div className="p-inset-md bg-surface-sunken border-t border-border-default space-y-stack-sm shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between text-body-sm text-text-subtle">
          {/* Toggle for Deep Mode */}
          <label className="flex items-center gap-inline-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDeepMode}
              onChange={(e) => setIsDeepMode(e.target.checked)}
              className="accent-bg-brand-bold"
            />
            <span className={isDeepMode ? 'text-text-default font-bold text-body-sm' : 'text-text-subtle text-body-sm'}>
              حالت عمیق (تحلیل چندوجهی · ۵ اعتبار)
            </span>
          </label>

          <span className="text-caption sm:text-caption text-text-subtlest">
            {isDeepMode ? 'کسر ۵ اعتبار از حساب' : 'حالت Auto رایگان بدون کنتور'}
          </span>
        </div>

        <form onSubmit={handleSend} className="flex items-center gap-inline-sm">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="درباره ایده‌ها، مشتری، قیمت‌گذاری یا استراتژی خود بنویسید..."
            disabled={isLoading}
            className="flex-1 bg-surface-raised border border-border-default focus:border-border-brand rounded-control px-inset-lg py-inset-md text-body-sm text-text-default focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-inset-lg sm:px-inset-xl py-inset-md text-body-sm font-bold text-text-default bg-bg-brand-bold hover:bg-bg-brand-bold-hover disabled:opacity-40 rounded-control transition-all whitespace-nowrap shadow-raised shrink-0"
          >
            {isLoading ? 'در حال ارسال...' : isDeepMode ? 'ارسال عمیق' : 'ارسال'}
          </button>
        </form>
      </div>
    </div>
  );
};
