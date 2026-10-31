/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ContextObject,
  Contradiction,
  GeneratedDeliverable,
  LedgerEntry,
  PlanId,
  Workspace,
} from './types';
import {
  INITIAL_WORKSPACES,
  INITIAL_CONTEXT_OBJECTS,
  INITIAL_DELIVERABLES,
  INITIAL_LEDGER,
} from './core/seedData';
import { detectContradictions } from './core/contextEngine';
import { AppNavigation } from './components/AppNavigation';
import { TopStatusBar } from './components/TopStatusBar';
import { ContradictionBanner } from './components/ContradictionBanner';
import { ContextTreeDocView } from './components/ContextTreeDocView';
import { ContextTableView } from './components/ContextTableView';
import { ContextDetailModal } from './components/ContextDetailModal';
import { WorkstreamStudio } from './components/WorkstreamStudio';
import { SmartChat } from './components/SmartChat';
import { AssetLibrary } from './components/AssetLibrary';
import { LedgerPanel } from './components/LedgerPanel';
import { OnboardingModal } from './components/OnboardingModal';
import { PlanSelectionModal } from './components/PlanSelectionModal';
import { AccountModal } from './components/AccountModal';
import { CustomSpecModal } from './components/CustomSpecModal';
import { PLANS } from './core/creditEngine';
import { WORKSTREAM_SPECS } from './core/specs';
import { WorkstreamSpec } from './types';
import { Button, Dialog, SegmentedControl, TextField, formatNumber, useToast } from './ui';
import { AiSettingsModal } from './components/AiSettingsModal';
import { AiStatusBanner } from './components/AiNotices';
import { ledgerEntryFromUsage } from './core/ledger';
import { titleFromMarkdown } from './core/blocks';
import { chatCredits } from './core/creditEngine';
import type { AiPlan, ContentBlock, GenerationResult, UsageSummary } from './types';

export default function App() {
  const toast = useToast();
  // 1. Workspaces state with localStorage persistence
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const saved = localStorage.getItem('mabda_workspaces');
    return saved ? JSON.parse(saved) : INITIAL_WORKSPACES;
  });

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>(() => {
    return workspaces[0]?.id || 'ws_studio';
  });

  const currentWorkspace =
    workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0];

  // 2. Context Objects state
  const [contextObjects, setContextObjects] = useState<ContextObject[]>(() => {
    const saved = localStorage.getItem('mabda_context_objects');
    return saved ? JSON.parse(saved) : INITIAL_CONTEXT_OBJECTS;
  });

  // 3. Deliverables state
  const [deliverables, setDeliverables] = useState<GeneratedDeliverable[]>(() => {
    const saved = localStorage.getItem('mabda_deliverables');
    return saved ? JSON.parse(saved) : INITIAL_DELIVERABLES;
  });

  // 4. Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>(() => {
    const saved = localStorage.getItem('mabda_ledger');
    return saved ? JSON.parse(saved) : INITIAL_LEDGER;
  });

  // 5. Workstream Specs state (Built-in + Custom Specs - F8)
  const [specs, setSpecs] = useState<WorkstreamSpec[]>(() => {
    const saved = localStorage.getItem('mabda_workstream_specs');
    return saved ? JSON.parse(saved) : WORKSTREAM_SPECS;
  });

  const [selectedSpecId, setSelectedSpecId] = useState<string>(() => {
    return specs[0]?.id || 'main_positioning';
  });

  // UI state
  const [activeTab, setActiveTab] = useState<string>('context');
  const [contextViewMode, setContextViewMode] = useState<'doc' | 'table'>('doc');
  const [selectedContextObject, setSelectedContextObject] = useState<ContextObject | null>(null);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [modalDefaultNodeId, setModalDefaultNodeId] = useState('business');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCustomSpecModalOpen, setIsCustomSpecModalOpen] = useState(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isNewWorkspaceModalOpen, setIsNewWorkspaceModalOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('mabda_workspaces', JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    localStorage.setItem('mabda_workstream_specs', JSON.stringify(specs));
  }, [specs]);

  useEffect(() => {
    localStorage.setItem('mabda_context_objects', JSON.stringify(contextObjects));
  }, [contextObjects]);

  useEffect(() => {
    localStorage.setItem('mabda_deliverables', JSON.stringify(deliverables));
  }, [deliverables]);

  useEffect(() => {
    localStorage.setItem('mabda_ledger', JSON.stringify(ledgerEntries));
  }, [ledgerEntries]);

  // Contradictions in current workspace
  const workspaceContexts = contextObjects.filter(
    (o) => o.workspaceId === currentWorkspace.id
  );
  const contradictions: Contradiction[] = detectContradictions(workspaceContexts);

  // Handlers for Context Objects
  const handleSaveContextObject = (saved: ContextObject) => {
    setContextObjects((prev) => {
      const idx = prev.findIndex((o) => o.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
  };

  const handleSupersedeContext = (
    oldId: string,
    newObjProps: Omit<ContextObject, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const now = new Date().toISOString();
    const newId = `ctx_sup_${Date.now()}`;

    const newObj: ContextObject = {
      ...newObjProps,
      id: newId,
      createdAt: now,
      updatedAt: now,
    };

    setContextObjects((prev) =>
      prev.map((o) =>
        o.id === oldId
          ? { ...o, status: 'Superseded' as const, supersededById: newId, updatedAt: now }
          : o
      ).concat(newObj)
    );
  };

  const handleArchiveContext = (id: string) => {
    setContextObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'Archived' } : o))
    );
  };

  const handleResolveContradiction = (
    _contraId: string,
    keepId: string,
    archiveId: string
  ) => {
    setContextObjects((prev) =>
      prev.map((o) => {
        if (o.id === keepId) return { ...o, status: 'Confirmed' };
        if (o.id === archiveId) return { ...o, status: 'Archived' };
        return o;
      })
    );
  };

  // Deliverable creation & ledger tracking (usage is the real provider usage returned by the server)
  const handleSaveDeliverable = (del: GeneratedDeliverable, creditCost: number, usage: UsageSummary) => {
    setDeliverables((prev) => [del, ...prev]);

    // deduct credits (creditCost is already 0 for BYOK)
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === currentWorkspace.id
          ? { ...w, creditsRemaining: Math.max(0, w.creditsRemaining - creditCost) }
          : w
      )
    );

    setLedgerEntries((prev) => [
      ledgerEntryFromUsage({
        workspaceId: currentWorkspace.id,
        action: `تولید: ${del.title} (${del.executionMode})`,
        mode: del.executionMode,
        creditCost,
        usage,
        plan: del.plan,
      }),
      ...prev,
    ]);
  };

  /** A finished chat turn: ledger row with real tokens/cost, and the credits the turn cost (0 for Auto / BYOK). */
  const handleRecordChatUsage = (result: GenerationResult, creditCost: number, deep: boolean) => {
    if (creditCost > 0) {
      setWorkspaces((prev) => prev.map((w) => (w.id === currentWorkspace.id ? { ...w, creditsRemaining: Math.max(0, w.creditsRemaining - creditCost) } : w)));
    }
    setLedgerEntries((prev) => [
      ledgerEntryFromUsage({
        workspaceId: currentWorkspace.id,
        action: deep ? 'گفتگوی عمیق' : 'گفتگوی Auto',
        mode: deep ? 'chat_deep' : 'chat_auto',
        creditCost,
        usage: result.usage,
        plan: result.plan,
        id: `led_chat_${Date.now()}`,
      }),
      ...prev,
    ]);
  };

  /** Save one chat block as an asset (Markdown). No credits: the AI cost was already recorded with the chat turn. */
  const handleSaveBlockAsAsset = (block: ContentBlock, source: { title: string; plan?: AiPlan; usage?: UsageSummary }) => {
    const now = new Date().toISOString();
    const asset: GeneratedDeliverable = {
      id: `del_chat_${Date.now()}`,
      workspaceId: currentWorkspace.id,
      workstreamId: 'chat',
      deliverableId: `chat_${block.id}`,
      title: titleFromMarkdown(block.markdown),
      content: block.markdown,
      blocks: [block],
      plan: source.plan,
      executionMode: 'auto',
      creditCost: 0,
      usedContextIds: [],
      rebuildCount: 0,
      createdAt: now,
    };
    setDeliverables((prev) => [asset, ...prev]);
    toast.show({ intent: 'success', message: 'در کتابخانهٔ دارایی‌ها ذخیره شد (Markdown).' });
  };

  const handleIncrementChatCount = () => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === currentWorkspace.id
          ? { ...w, todayChatCount: w.todayChatCount + 1 }
          : w
      )
    );
  };

  const handleChangePlan = (planId: PlanId) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === currentWorkspace.id
          ? {
              ...w,
              planId,
              creditsRemaining: w.creditsRemaining + PLANS[planId].creditsMonthly,
            }
          : w
      )
    );
    toast.show({ intent: 'success', message: `پلن این فضای کاری به ${PLANS[planId].title} تغییر یافت.` });
  };

  const handleAddCredits = (amount: number) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === currentWorkspace.id
          ? { ...w, creditsRemaining: w.creditsRemaining + amount }
          : w
      )
    );
    toast.show({ intent: 'success', message: `${formatNumber(amount)} اعتبار به حساب این فضای کاری اضافه شد.` });
  };

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;

    const currentPlan = PLANS[currentWorkspace.planId] || PLANS.pro;
    if (workspaces.length >= currentPlan.workspaceLimit) {
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
      createdAt: new Date().toISOString(),
    };

    setWorkspaces((prev) => [...prev, newWs]);
    setCurrentWorkspaceId(newWs.id);
    setNewWsName('');
    setIsNewWorkspaceModalOpen(false);
  };

  const handlePromoteToContext = (del: GeneratedDeliverable) => {
    const newContext: ContextObject = {
      id: `ctx_del_${Date.now()}`,
      workspaceId: currentWorkspace.id,
      type: 'Asset',
      status: 'Confirmed',
      provenance: 'Asset Derived',
      title: `دارایی: ${del.title}`,
      content: del.content.slice(0, 300) + '...',
      nodeId: 'brand',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setContextObjects((prev) => [newContext, ...prev]);
    toast.show({ intent: 'success', message: 'این خروجی به‌عنوان یک دارایی در منبع حقیقت ثبت شد و در کارهای بعدی به‌عنوان Context معتبر استفاده می‌شود.' });
  };

  const handleExportAllData = () => {
    const backupData = {
      workspace: currentWorkspace,
      allWorkspaces: workspaces,
      contextObjects: workspaceContexts,
      deliverables: deliverables.filter((d) => d.workspaceId === currentWorkspace.id),
      ledgerEntries: ledgerEntries.filter((l) => l.workspaceId === currentWorkspace.id),
      specs,
      exportedAt: new Date().toISOString(),
      platform: 'Mabda (مبدأ) - Source of Truth',
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
    localStorage.removeItem('mabda_workspaces');
    localStorage.removeItem('mabda_context_objects');
    localStorage.removeItem('mabda_deliverables');
    localStorage.removeItem('mabda_ledger');
    localStorage.removeItem('mabda_workstream_specs');

    setWorkspaces(INITIAL_WORKSPACES);
    setCurrentWorkspaceId(INITIAL_WORKSPACES[0].id);
    setContextObjects(INITIAL_CONTEXT_OBJECTS);
    setDeliverables(INITIAL_DELIVERABLES);
    setLedgerEntries(INITIAL_LEDGER);
    setSpecs(WORKSTREAM_SPECS);
    setIsAccountModalOpen(false);

    toast.show({ intent: 'info', message: 'درخواست حذف حساب ثبت شد. تمام نشست‌ها پایان یافت و اطلاعات طی مهلت ۳۰ روزه از سیستم پاک می‌شود (F1).', duration: 8000 });
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-text-default md:flex-row pb-space-24 md:pb-space-0">
      {/* Sleek Right Sidebar Navigation & Mobile Drawer */}
      <AppNavigation
        currentWorkspace={currentWorkspace}
        allWorkspaces={workspaces}
        onSelectWorkspace={(ws) => setCurrentWorkspaceId(ws.id)}
        onOpenNewWorkspace={() => setIsNewWorkspaceModalOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenPlanModal={() => setIsPlanModalOpen(true)}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        specs={specs}
        selectedSpecId={selectedSpecId}
        onSelectSpecId={setSelectedSpecId}
        onOpenCustomSpecModal={() => setIsCustomSpecModalOpen(true)}
        contextViewMode={contextViewMode}
        onChangeContextViewMode={setContextViewMode}
        contextCount={workspaceContexts.length}
        deliverablesCount={deliverables.filter((d) => d.workspaceId === currentWorkspace.id).length}
        todayChatCount={currentWorkspace.todayChatCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-space-0">
        {/* Desktop Minimal Top Status Bar with Breadcrumbs & Quick Actions */}
        <TopStatusBar
          currentWorkspace={currentWorkspace}
          activeTab={activeTab}
          contradictions={contradictions}
          onOpenContextModal={() => {
            setSelectedContextObject(null);
            setModalDefaultNodeId('business');
            setIsContextModalOpen(true);
          }}
          onOpenCustomSpecModal={() => setIsCustomSpecModalOpen(true)}
          onOpenPlanModal={() => setIsPlanModalOpen(true)}
        />

        {/* Main Canvas */}
        <main className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl flex-1 space-y-stack-lg">
          <AiStatusBanner onOpenSettings={() => setIsAiSettingsOpen(true)} />

          {/* Contradiction Detection Banner */}
          <ContradictionBanner
            contradictions={contradictions}
            onResolve={handleResolveContradiction}
          />

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

              <SegmentedControl
                label="نمای منبع حقیقت"
                value={contextViewMode}
                onChange={(id) => setContextViewMode(id as 'doc' | 'table')}
                items={[
                  { id: 'doc', label: 'نمای سند', icon: 'FileText' },
                  { id: 'table', label: 'نمای جدول', icon: 'Table2' },
                ]}
              />
            </div>

            {contextViewMode === 'doc' ? (
              <ContextTreeDocView
                objects={workspaceContexts}
                onSelectObject={(obj) => {
                  setSelectedContextObject(obj);
                  setIsContextModalOpen(true);
                }}
                onAddNewToNode={(nodeId) => {
                  setSelectedContextObject(null);
                  setModalDefaultNodeId(nodeId);
                  setIsContextModalOpen(true);
                }}
              />
            ) : (
              <ContextTableView
                objects={workspaceContexts}
                onSelectObject={(obj) => {
                  setSelectedContextObject(obj);
                  setIsContextModalOpen(true);
                }}
                onAddNew={() => {
                  setSelectedContextObject(null);
                  setModalDefaultNodeId('business');
                  setIsContextModalOpen(true);
                }}
              />
            )}
          </div>
        )}

        {/* TAB 2: Workstreams & Gap Engine */}
        {activeTab === 'workstreams' && (
          <WorkstreamStudio
            currentWorkspace={currentWorkspace}
            allContextObjects={workspaceContexts}
            allDeliverables={deliverables}
            specs={specs}
            selectedSpecId={selectedSpecId}
            onSelectSpecId={setSelectedSpecId}
            onAddCustomSpec={(newSpec) => setSpecs((prev) => [newSpec, ...prev])}
            onAddContextObject={handleSaveContextObject}
            onSaveDeliverable={handleSaveDeliverable}
            onOpenContextModal={(obj) => {
              setSelectedContextObject(obj);
              setIsContextModalOpen(true);
            }}
            onOpenLedger={() => setActiveTab('ledger')}
            onOpenAiSettings={() => setIsAiSettingsOpen(true)}
          />
        )}

        {/* TAB 3: Smart Chat */}
        {activeTab === 'chat' && (
          <div className="space-y-stack-sm">
            <SmartChat
              currentWorkspace={currentWorkspace}
              allContextObjects={workspaceContexts}
              onAddContextObject={handleSaveContextObject}
              onIncrementChatCount={handleIncrementChatCount}
              onOpenContextModal={(obj) => {
                setSelectedContextObject(obj);
                setIsContextModalOpen(true);
              }}
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
            onOpenContextModal={(obj) => {
              setSelectedContextObject(obj);
              setIsContextModalOpen(true);
            }}
            onPromoteToContext={handlePromoteToContext}
            onRebuild={(_del) => {
              setActiveTab('workstreams');
            }}
          />
        )}

        {/* TAB 5: Ledger & Economics */}
        {activeTab === 'ledger' && (
          <LedgerPanel
            currentWorkspace={currentWorkspace}
            ledgerEntries={ledgerEntries.filter((l) => l.workspaceId === currentWorkspace.id)}
            onChangePlan={handleChangePlan}
            onAddCredits={handleAddCredits}
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
        defaultNodeId={modalDefaultNodeId}
      />

      {/* 10-Minute Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        currentWorkspace={currentWorkspace}
        onCompleteOnboarding={(newContexts, firstDeliverable) => {
          setContextObjects((prev) => [...newContexts, ...prev]);
          setDeliverables((prev) => [firstDeliverable, ...prev]);
          if (firstDeliverable.usage) {
            const usage = firstDeliverable.usage;
            setLedgerEntries((prev) => [
              ledgerEntryFromUsage({ workspaceId: currentWorkspace.id, action: 'اولین دارایی (Onboarding)', mode: 'auto', creditCost: 0, usage, plan: firstDeliverable.plan, id: `led_onb_${Date.now()}` }),
              ...prev,
            ]);
          }
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
      />

      {/* Custom Spec Modal (F8) */}
      <CustomSpecModal
        isOpen={isCustomSpecModalOpen}
        onClose={() => setIsCustomSpecModalOpen(false)}
        onSaveSpec={(newSpec) => {
          setSpecs((prev) => [newSpec, ...prev]);
          setSelectedSpecId(newSpec.id);
          setActiveTab('workstreams');
        }}
      />

      <AiSettingsModal isOpen={isAiSettingsOpen} onClose={() => setIsAiSettingsOpen(false)} />

      {/* New workspace dialog */}
      <Dialog
        open={isNewWorkspaceModalOpen}
        onClose={() => setIsNewWorkspaceModalOpen(false)}
        size="sm"
        title="ایجاد فضای کاری جدید"
        description="هر فضای کاری داده‌های منبع حقیقت، دارایی‌ها و تاریخچهٔ جداگانه‌ای دارد (اصل P6)."
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
