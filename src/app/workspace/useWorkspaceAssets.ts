/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logUi } from '../../services/activity';
import React, { useState } from 'react';
import type { AiPlan, ContentBlock, GenerationResult, UsageSummary, UsedContextRef } from '../../types';
import { GeneratedDeliverable, LedgerEntry, Workspace } from '../../types';
import { LIMITS, chatCountToday, workspaceLimitMessage } from '../../core/limits';
import { tehranDay } from '../../core/tehranDate';
import { currentSpecIds, starterSpecIds } from '../../core/specs';
import { dataApi } from '../../services/dataApi';
import { formatNumber } from '../../ui';
import { ledgerEntryFromUsage } from '../../core/ledger';
import { titleFromMarkdown } from '../../core/blocks';
import type { AppCoreScope } from '../shell/useAppCore';
import type { UsageCountersScope } from '../shell/useUsageCounters';
import { clientId } from '../../core/ids';

export type WorkspaceAssetsScope = ReturnType<typeof useWorkspaceAssets>;

export function useWorkspaceAssets(p: AppCoreScope & UsageCountersScope) {
  const { ai, attempt, currentWorkspace, data, liveWorkspaces, newWsName, patch, reload, setActiveTab, setCurrentWorkspaceId, setData, setIsNewWorkspaceModalOpen, setNewWsName, setWs, specs, toast, updateWorkspace, wid, workspacesRef } = p;
  // ── assets and the usage ledger ──────────────────────────────────────────────────────────────────────
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

  // usage is provider metadata returned by the server (real tokens and cost; no credits exist)
  const handleSaveDeliverable = async (del: GeneratedDeliverable, usage: UsageSummary, kind: 'new' | 'rebuild' = 'new') => {
    if (!(await persistDeliverable(del))) return;
    await persistLedger(ledgerEntryFromUsage({
      workspaceId: wid,
      action: `${kind === 'rebuild' ? 'بازسازی' : 'تولید'}: ${del.title} (${del.executionMode})`,
      mode: del.executionMode,
      usage,
      plan: del.plan,
      id: clientId('led'),
    }));
    if (kind === 'rebuild') toast.show({ intent: 'success', message: 'خروجی با آخرین نسخهٔ دانش بازسازی شد.' });
  };

  /** A finished chat turn: ledger row with real provider usage. */
  const handleRecordChatUsage = async (result: GenerationResult, deep: boolean) => {
    await persistLedger(ledgerEntryFromUsage({
      workspaceId: wid,
      action: deep ? 'گفتگوی عمیق' : 'گفتگوی خودکار',
      mode: deep ? 'chat_deep' : 'chat_auto',
      usage: result.usage,
      plan: result.plan,
      id: clientId('led_chat'),
    }));
  };

  /** Save one chat block as an asset (Markdown). The AI cost was already recorded with the chat turn. */
  const handleSaveBlockAsAsset = async (block: ContentBlock, source: { title: string; plan?: AiPlan; usage?: UsageSummary; usedContext?: UsedContextRef[] }) => {
    const now = new Date().toISOString();
    const asset: GeneratedDeliverable = {
      id: clientId('del_chat'),
      workspaceId: wid,
      workstreamId: 'chat',
      deliverableId: `chat_${block.id}`,
      title: titleFromMarkdown(block.markdown),
      content: block.markdown,
      blocks: [block],
      plan: source.plan,
      executionMode: 'auto',
      usedContext: source.usedContext ?? [],
      rebuildCount: 0,
      createdAt: now,
    };
    if (await persistDeliverable(asset)) toast.show({ intent: 'success', message: 'در خروجی‌ها ذخیره شد (Markdown).' });
  };

  const handleIncrementChatCount = () => {
    const day = tehranDay();
    void updateWorkspace((w) => ({ ...w, todayChatCount: chatCountToday(w.todayChatCount, w.chatCountDay, day) + 1, chatCountDay: day }));
  };

  /** the workspace's library workstreams: the explicit list, saved on the workspace */
  const handleSetLibrarySpecs = async (ids: string[]) => { await updateWorkspace((w) => ({ ...w, enabledSpecIds: ids })); };
  /** «شروع سریع» builds on the positioning workstream: bring it into the workspace (once) */
  const ensureLibrarySpec = (id: string) => {
    const w = workspacesRef.current.find((x) => x.id === wid);
    if (w && !currentSpecIds(w).includes(id)) void handleSetLibrarySpecs([...currentSpecIds(w), id]);
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
      toast.show({ intent: 'success', message: 'فضای نمونه آماده است؛ داده‌هایش ساختگی‌اند و در سقف‌ها و مصرف حساب شمرده نمی‌شوند.' });
    } finally { setDemoBusy(false); }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;

    // the same fair-use limit the server enforces (archived and the showcase do not count): say it before the form is lost
    if (liveWorkspaces.filter((w) => !w.isDemo && !w.archivedAt).length >= LIMITS.workspaces) {
      toast.show({ intent: 'warning', message: workspaceLimitMessage() });
      return;
    }

    // what the space is for travels with the form (PurposeField); it picks the starting tree on the server
    const raw = new FormData(e.currentTarget as HTMLFormElement).get('purpose');
    const purpose = raw === 'work' || raw === 'project' || raw === 'empty' ? raw : 'personal';
    // which purpose people choose is a label from a list, never text she typed (src/core/activity.ts cleanProps)
    logUi('feature', { key: 'action.space-new', purpose });
    const newWs: Workspace = {
      purpose,
      id: clientId('ws'),
      name: newWsName.trim(),
      slug: newWsName.trim().toLowerCase().replace(/\s+/g, '-'),
      description: { personal: 'فضای شخصی در مبدأ', work: 'فضا در مبدأ', project: 'فضای پروژه در مبدأ', empty: 'فضا در مبدأ' }[purpose],
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

  /** BETA-01: the whole workspace — knowledge with every version, thoughts, relations, changes, boards, files, metrics — as one file */
  const handleExportAllData = () => {
    if (!currentWorkspace) return;
    const a = document.createElement('a');
    a.href = dataApi.backupUrl(currentWorkspace.id);
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /** a backup file becomes a new workspace «… (برگردانده‌شده)» and opens; nothing existing is overwritten */
  const handleRestoreBackup = async (file: File) => {
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch {
      toast.show({ intent: 'danger', message: 'این فایل پشتیبان مبدأ نیست (خوانده نشد).' });
      return false;
    }
    const r = await attempt(() => dataApi.restoreBackup(parsed));
    if (!r) return false;
    setWs(r.workspaces);
    setCurrentWorkspaceId(r.workspace.id);
    toast.show({ intent: 'success', message: `«${r.workspace.name}» برگردانده شد.` });
    return true;
  };

  return { persistDeliverable, persistLedger, handleSaveDeliverable, handleRecordChatUsage, handleIncrementChatCount, handleSetLibrarySpecs, ensureLibrarySpec, demoConfirm, setDemoConfirm, demoBusy, handleResetDemo, handleCreateWorkspace, extractingAssetId, handleExtractFromAsset, handleExportAllData, handleRestoreBackup };
}
