/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { AiPlan, ContentBlock, GenerationResult, UsageSummary, UsedContextRef } from '../../types';
import { GeneratedDeliverable, LedgerEntry, PlanId, Workspace } from '../../types';
import { PLANS, chatCountToday, tehranDay } from '../../core/creditEngine';
import { currentSpecIds, starterSpecIds } from '../../core/specs';
import { dataApi } from '../../services/dataApi';
import { formatNumber } from '../../ui';
import { ledgerEntryFromUsage } from '../../core/ledger';
import { titleFromMarkdown } from '../../core/blocks';
import type { AppCoreScope } from '../shell/useAppCore';
import type { UsageCountersScope } from '../shell/useUsageCounters';

export type WorkspaceAssetsScope = ReturnType<typeof useWorkspaceAssets>;

export function useWorkspaceAssets(p: AppCoreScope & UsageCountersScope) {
  const { ai, attempt, currentWorkspace, data, liveWorkspaces, newWsName, patch, reload, setActiveTab, setCurrentWorkspaceId, setData, setIsNewWorkspaceModalOpen, setNewWsName, setWs, specs, toast, updateWorkspace, wid, workspacesRef } = p;
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
    toast.show({ intent: 'success', message: `پلن این فضا به ${PLANS[planId].title} تغییر یافت.` });
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
    toast.show({ intent: 'success', message: `${formatNumber(amount)} اعتبار به حساب این فضا اضافه شد.` });
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
        message: `سقف فضا در پلن ${currentPlan.title} (${formatNumber(currentPlan.workspaceLimit)} عدد) پر شده است. برای افزودن، پلنت را ارتقا بده.`,
      });
      return;
    }

    // what the space is for travels with the form (PurposeField); it picks the starting tree on the server
    const raw = new FormData(e.currentTarget as HTMLFormElement).get('purpose');
    const purpose = raw === 'work' || raw === 'project' || raw === 'empty' ? raw : 'personal';
    const newWs: Workspace = {
      purpose,
      id: `ws_${Date.now()}`,
      name: newWsName.trim(),
      slug: newWsName.trim().toLowerCase().replace(/\s+/g, '-'),
      description: { personal: 'فضای شخصی در مبدأ', work: 'فضا در مبدأ', project: 'فضای پروژه در مبدأ', empty: 'فضا در مبدأ' }[purpose],
      planId: currentWorkspace?.planId ?? 'pro',
      creditsRemaining: 150,
      todayChatCount: 0,
      enabledSpecIds: starterSpecIds(purpose), // personal / project: the ones written for it; work / empty: none, «شروع سریع» or the library brings them in
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
      platform: 'مبدأ · منبع حقیقت تو',
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mabda_backup_${currentWorkspace.slug}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };
  return { persistDeliverable, persistLedger, handleSaveDeliverable, handleRecordChatUsage, handleIncrementChatCount, handleChangePlan, handleSetLibrarySpecs, ensureLibrarySpec, handleAddCredits, demoConfirm, setDemoConfirm, demoBusy, handleResetDemo, handleCreateWorkspace, extractingAssetId, handleExtractFromAsset, handleExportAllData };
}
