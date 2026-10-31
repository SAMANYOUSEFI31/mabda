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
    <div className="bg-[#18181b] border border-[#27272a] rounded-2xl flex flex-col h-[calc(100dvh-130px)] md:h-[720px] text-right shadow-xl overflow-hidden relative font-sans">
      {/* 1. Header with Sessions Bar, Grounding Indicator & Mode Switcher */}
      <div className="p-3 sm:p-4 border-b border-[#27272a] bg-[#0c0c0e] shrink-0 space-y-3">
        {/* Top bar row: Title, Session Switcher, New Chat Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Sidebar toggle for sessions on mobile & desktop */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="px-2.5 py-1.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-xs text-[#fafafa] flex items-center gap-1.5 transition-colors shrink-0"
              title="مشاهده نشست‌های گفتگو"
            >
              <span>💬</span>
              <span className="font-semibold hidden sm:inline">گفتگوها</span>
              <span className="text-[10px] text-[#71717a] font-mono">({sessions.length})</span>
            </button>

            {/* Current Active Session Title */}
            <div className="truncate">
              <h3 className="text-xs sm:text-sm font-bold text-white truncate flex items-center gap-2">
                <span>{activeSession.title}</span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* New Chat Button */}
            <button
              onClick={handleCreateNewSession}
              className="px-3 py-1.5 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors flex items-center gap-1 shadow-xs"
            >
              <span>+</span>
              <span>گفتگوی جدید</span>
            </button>

            {/* Daily Fair Use Badge */}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] bg-[#18181b] border border-[#27272a] px-2.5 py-1 rounded-lg">
              <span className="text-[#a1a1aa]">مصرف روزانه:</span>
              <span className="font-bold text-white tabular-nums">
                {currentWorkspace.todayChatCount}/{plan.dailyChatLimit}
              </span>
            </div>
          </div>
        </div>

        {/* Second Row: Chat Modes (Discovery / Contradiction Audit / Strategic Advisor) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#1f1f23]">
          <div className="flex items-center gap-1 bg-[#121215] border border-[#27272a] p-1 rounded-lg text-xs overflow-x-auto max-w-full">
            <button
              onClick={() => handleChangeMode('discovery')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeSession.chatMode === 'discovery'
                  ? 'bg-[#e11d48] text-white shadow-xs'
                  : 'text-[#a1a1aa] hover:text-white'
              }`}
            >
              <span>💡</span>
              <span>کشف و استخراج تصمیمات</span>
            </button>

            <button
              onClick={() => handleChangeMode('audit')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeSession.chatMode === 'audit'
                  ? 'bg-[#e11d48] text-white shadow-xs'
                  : 'text-[#a1a1aa] hover:text-white'
              }`}
            >
              <span>🛡️</span>
              <span>ممیزی تناقضات</span>
            </button>

            <button
              onClick={() => handleChangeMode('advisor')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeSession.chatMode === 'advisor'
                  ? 'bg-[#e11d48] text-white shadow-xs'
                  : 'text-[#a1a1aa] hover:text-white'
              }`}
            >
              <span>📈</span>
              <span>مشاوره آفر و بیزنس</span>
            </button>
          </div>

          {/* Grounding Status badge */}
          <div className="text-[11px] text-[#a1a1aa] flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
            <span>متصل به {groundedCount} شیء دانش</span>
          </div>
        </div>

        {/* Third Row: Truth Tree Grounding Selector (انتخاب کانتکست هدف گفتگو) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 text-[11px]">
          <span className="text-[#71717a] shrink-0 text-[10px] pl-1">کانتکست هدف:</span>

          <button
            onClick={handleSelectAllNodes}
            className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors shrink-0 ${
              selectedNodes.length === 0
                ? 'bg-[#27272a] text-white border-[#3f3f46]'
                : 'text-[#a1a1aa] border-transparent hover:text-white hover:bg-[#18181b]'
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
                className={`px-2 py-0.5 rounded-md text-[11px] border flex items-center gap-1 transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-[#e11d48]/20 text-[#fb7185] border-[#e11d48]/50 font-medium'
                    : 'text-[#a1a1aa] border-transparent hover:text-white hover:bg-[#18181b]'
                }`}
              >
                <span>{node.icon}</span>
                <span>{node.label}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Body Area: Sessions Drawer Overlay + Messages */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sessions Sidebar / Drawer */}
        {isSidebarOpen && (
          <div className="absolute inset-y-0 right-0 z-30 w-72 max-w-[85%] bg-[#121215] border-l border-[#27272a] shadow-2xl flex flex-col p-3 animate-in slide-in-from-right-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
              <span className="text-xs font-bold text-white">نشست‌های گفتگوی شما</span>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-[#a1a1aa] hover:text-white p-1 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="my-2">
              <button
                onClick={handleCreateNewSession}
                className="w-full py-2 px-3 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs"
              >
                <span>+</span>
                <span>شروع گفتگوی جدید</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
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
                    className={`group p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex flex-col gap-1 ${
                      isActive
                        ? 'bg-[#18181b] border-[#e11d48]/50 text-white shadow-xs'
                        : 'bg-transparent border-transparent hover:bg-[#18181b]/60 text-[#a1a1aa] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      {isEditing ? (
                        <div
                          className="flex items-center gap-1 w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={sessionEditTitle}
                            onChange={(e) => setSessionEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveSessionTitle(sess.id);
                            }}
                            className="bg-[#09090b] border border-[#27272a] rounded px-1.5 py-0.5 text-xs text-white w-full"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveSessionTitle(sess.id)}
                            className="text-[#10b981] hover:text-white px-1"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <span className="font-semibold truncate flex-1 text-right">
                          {sess.title}
                        </span>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSessionId(sess.id);
                              setSessionEditTitle(sess.title);
                            }}
                            className="text-[#a1a1aa] hover:text-white p-0.5 text-[11px]"
                            title="تغییر نام"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => handleDeleteSession(sess.id, e)}
                            className="text-[#f43f5e] hover:text-[#fb7185] p-0.5 text-[11px]"
                            title="حذف نشست"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#71717a]">
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
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {/* Prompt Starters when chat is young */}
          {activeSession.messages.length <= 2 && (
            <div className="bg-[#121215] border border-[#27272a] rounded-xl p-3 sm:p-4 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>⚡</span>
                  <span>پیشنهادهای شروع بر اساس شکاف‌های دانش فعلی:</span>
                </span>
                <span className="text-[10px] text-[#71717a]">یک کلیک برای آغاز</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {gapsPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(undefined, p.text)}
                    className="text-right p-2.5 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] hover:border-[#3f3f46] text-xs transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <span>{p.icon}</span>
                      <span className="font-semibold text-white group-hover:text-[#fb7185] transition-colors">
                        {p.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#a1a1aa] mt-1 line-clamp-2 leading-relaxed">
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
                className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-3.5 sm:p-4 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#e11d48] text-white rounded-br-none shadow-md'
                    : 'bg-[#0c0c0e] text-[#fafafa] border border-[#27272a] rounded-bl-none shadow-sm'
                }`}
              >
                {/* Assistant Grounding Badge */}
                {m.role === 'assistant' && m.groundedCount !== undefined && m.groundedCount > 0 && (
                  <div className="mb-2 pb-2 border-b border-[#27272a] flex items-center justify-between text-[10px] text-[#10b981]">
                    <span className="flex items-center gap-1">
                      <span>🛡️</span>
                      <span>بررسی و تطبیق با {m.groundedCount} شیء دانش تأییدشده</span>
                    </span>
                    {m.executionMode === 'deep' && (
                      <span className="text-[#fbbf24] bg-[#f59e0b]/10 px-1 rounded">
                        تحلیل چندوجهی
                      </span>
                    )}
                  </div>
                )}

                <div className="whitespace-pre-line selection:bg-white/20">{m.content}</div>

                <div
                  className={`mt-2.5 pt-1.5 border-t text-[10px] flex items-center justify-between gap-3 ${
                    m.role === 'user'
                      ? 'border-white/20 text-white/80'
                      : 'border-[#27272a] text-[#71717a]'
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
                <div className="w-[92%] sm:w-[85%] mt-3 space-y-2">
                  {m.suggestions.map((sug) => (
                    <div
                      key={sug.id}
                      className="bg-[#0e0e11] border border-[#f59e0b]/40 rounded-xl p-3 sm:p-4 space-y-2.5 text-xs animate-in fade-in shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">💡</span>
                          <span className="font-bold text-[#fde68a]">
                            پیشنهاد ثبت در منبع حقیقت: {sug.title}
                          </span>
                          <span className="text-[10px] bg-[#f59e0b]/20 text-[#fbbf24] px-1.5 py-0.5 rounded font-mono">
                            {sug.type}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#a1a1aa] bg-[#18181b] px-2 py-0.5 rounded border border-[#27272a]">
                          شاخه: {sug.nodeId}
                        </span>
                      </div>

                      <p className="text-[#fafafa] bg-[#18181b] p-2.5 rounded-lg border border-[#27272a] leading-relaxed">
                        {sug.content}
                      </p>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-[#1f1f23]">
                        <span className="text-[11px] text-[#71717a]">
                          {sug.reason || 'استخراج مستقیم از گفتگوی کاربر با مبدأ'}
                        </span>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => handleDismissSuggestion(sug.id, m.id)}
                            className="px-2.5 py-1 text-xs text-[#a1a1aa] hover:text-white rounded hover:bg-[#27272a] transition-colors"
                          >
                            رد کردن
                          </button>
                          <button
                            onClick={() => handleApproveSuggestion(sug, m.id)}
                            className="px-3.5 py-1 text-xs font-semibold text-white bg-[#10b981] hover:bg-[#059669] rounded-lg transition-colors shadow-xs"
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
            <div className="flex items-center gap-2.5 text-xs text-[#a1a1aa] bg-[#0c0c0e] p-3 rounded-xl border border-[#27272a] w-fit animate-pulse">
              <span className="animate-spin text-sm">⚙️</span>
              <span>مبدأ در حال تطبیق با منبع حقیقت و استخراج تصمیمات است...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 3. Sticky Input Area with Mobile Ergonomics */}
      <div className="p-3 bg-[#0c0c0e] border-t border-[#27272a] space-y-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between text-xs text-[#a1a1aa]">
          {/* Toggle for Deep Mode */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDeepMode}
              onChange={(e) => setIsDeepMode(e.target.checked)}
              className="accent-[#e11d48]"
            />
            <span className={isDeepMode ? 'text-white font-bold text-xs' : 'text-[#a1a1aa] text-xs'}>
              حالت عمیق (تحلیل چندوجهی · ۵ اعتبار)
            </span>
          </label>

          <span className="text-[10px] sm:text-[11px] text-[#71717a]">
            {isDeepMode ? 'کسر ۵ اعتبار از حساب' : 'حالت Auto رایگان بدون کنتور'}
          </span>
        </div>

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="درباره ایده‌ها، مشتری، قیمت‌گذاری یا استراتژی خود بنویسید..."
            disabled={isLoading}
            className="flex-1 bg-[#18181b] border border-[#27272a] focus:border-[#e11d48] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 sm:px-6 py-2.5 text-xs font-bold text-white bg-[#e11d48] hover:bg-[#be123c] disabled:opacity-40 rounded-xl transition-all whitespace-nowrap shadow-sm shrink-0"
          >
            {isLoading ? 'در حال ارسال...' : isDeepMode ? 'ارسال عمیق' : 'ارسال'}
          </button>
        </form>
      </div>
    </div>
  );
};
