/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * «ثبت سریع» from every page: a shortcut (Ctrl/⌘+J), an always-reachable button on phones, and an event
 * (`requestQuickCapture()` in src/core/quickCapture.ts) for anything else that wants to open it (e.g. the command palette).
 * The dialog is a separate chunk, loaded the first time it opens. Saving goes through the existing thought path (useNotes).
 */

import { useEffect, useRef, useState } from 'react';
import { QUICK_CAPTURE_EVENT, defaultSectionFor } from '../../core/quickCapture';
import { ADD_DESCRIPTION, ADD_EVENT, defaultAddKind, dialogOpen, importableFile, markAddSwitchable, requestAdd, setPendingAddText, setPendingImportFile } from '../../core/addRequest';
import type { AddRequest } from '../../core/addRequest';
import { AddKindSwitch } from '../../components/shared/AddKindSwitch';
import { Button, Dialog, Select } from '../../ui';
import { registerPaletteCommand } from '../../core/globalSearch';
import { Deferred, lazyNamed } from '../lazy';
import { flatten } from '../../core/nodeTree';
import type { ReadyScope } from '../shared';
import { letterKeysOn } from '../../core/shortcuts';

const QuickCaptureDialog = lazyNamed(() => import('../../components/thinking/QuickCaptureDialog'), 'QuickCaptureDialog');

const DRAFT_KEY = 'mabda.quickDraft';
const readDraft = (): string => { try { return sessionStorage.getItem(DRAFT_KEY) ?? ''; } catch { return ''; } };

export type QuickCaptureProps = Pick<ReadyScope, 'activeTab' | 'data' | 'focusNodeId' | 'handleSaveThought' | 'handleSaveThoughts' | 'handleUploadFile' | 'nodes' | 'openContext' | 'setActiveTab' | 'setIsMemoryOpen' | 'workspaceContexts'>;

const PREF = 'mabda.quickCapture.continuous';
const readContinuous = () => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } };

export function QuickCapture({ activeTab, data, focusNodeId, handleSaveThought, handleSaveThoughts, handleUploadFile, nodes, openContext, setActiveTab, setIsMemoryOpen, workspaceContexts }: QuickCaptureProps) {
  const [open, setOpen] = useState(false);
  // the unsent text survives a refresh (sessionStorage: it goes with the tab, so it never lingers on a shared device)
  const [text, setText] = useState(readDraft);
  useEffect(() => { try { if (text) sessionStorage.setItem(DRAFT_KEY, text); else sessionStorage.removeItem(DRAFT_KEY); } catch { /* optional */ } }, [text]);
  const [node, setNode] = useState('');
  const [continuous, setContinuous] = useState(readContinuous);
  /** opened from a scoped «+ فکر» (the thinking page): locked to «فکر», no switch */
  const [scoped, setScoped] = useState(false);
  const here = defaultSectionFor(focusNodeId, nodes);

  /** opening picks the place from where she is NOW; an unsent draft is kept (Esc never loses it) */
  const show = (prefill?: string, isScoped = false) => {
    setNode(here);
    setScoped(isScoped);
    if (prefill?.trim()) setText((t) => (t.trim() ? `${t}\n${prefill}` : prefill));
    setOpen(true);
  };
  // «افزودن» (patterns.md §۳): one event for every entry; `N` opens it with the kind that fits this page
  const [fileOpen, setFileOpen] = useState<{ nodeId: string; scoped: boolean } | null>(null);
  const tab = useRef(activeTab); tab.current = activeTab;
  useEffect(() => {
    const onAdd = (e: Event) => {
      if (dialogOpen()) return;
      const r = (e as CustomEvent<AddRequest>).detail;
      if (r.kind === 'thought') { show(r.text, !!r.scoped); if (r.nodeId) setNode(r.nodeId); }
      else if (r.kind === 'truth') { setPendingAddText(r.text ?? ''); markAddSwitchable(!r.scoped); openContext(null, r.nodeId || undefined); }
      else setFileOpen({ nodeId: r.nodeId || here || nodes[0]?.id || '', scoped: !!r.scoped });
    };
    const onN = (e: KeyboardEvent) => {
      if (e.code !== 'KeyN' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (dialogOpen() || !letterKeysOn()) return;
      e.preventDefault(); requestAdd({ kind: defaultAddKind(tab.current) });
    };
    window.addEventListener(ADD_EVENT, onAdd);
    window.addEventListener('keydown', onN);
    return () => { window.removeEventListener(ADD_EVENT, onAdd); window.removeEventListener('keydown', onN); };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.code !== 'KeyJ') return;
      e.preventDefault();
      // another dialog is open (the page is inert): do not stack on top of it, but our own toggles closed
      if (!open && dialogOpen()) return;
      if (open) setOpen(false); else show();
    };
    const onEvent = (e: Event) => { if (!dialogOpen()) show((e as CustomEvent<{ text?: string }>).detail?.text); };
    window.addEventListener('keydown', onKey);
    window.addEventListener(QUICK_CAPTURE_EVENT, onEvent);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(QUICK_CAPTURE_EVENT, onEvent); };
  });

  return (
    <>
      <Deferred when={open}>
        <QuickCaptureDialog
          open={open} onClose={() => setOpen(false)} nodes={nodes} objects={workspaceContexts} thoughts={data.thoughts}
          text={text} onTextChange={setText} node={node} onNodeChange={setNode}
          continuous={continuous} onContinuousChange={(on) => { setContinuous(on); try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* a per-viewer convenience only */ } }}
          onSave={handleSaveThought} onSaveMany={handleSaveThoughts}
          switcher={scoped ? undefined : <AddKindSwitch value="thought" text={text} nodeId={node} onLeave={() => { setOpen(false); setText(''); /* the words travel with the switch (carryAddText), also across «فایل» */ }} />}
        />
      </Deferred>
      {fileOpen && <FileAdd nodeId={fileOpen.nodeId} scoped={fileOpen.scoped} nodes={nodes} onClose={() => setFileOpen(null)} onUpload={handleUploadFile} onImportInstead={(f) => { setFileOpen(null); setPendingImportFile(f); setActiveTab('context'); setIsMemoryOpen(true); }} />}
    </>
  );
}

/** «فایل» side of «افزودن»: pick a file and where it belongs; extracting knowledge from it stays in «فایل‌ها» */
function FileAdd({ nodeId, scoped, nodes, onClose, onUpload, onImportInstead }: { nodeId: string; scoped: boolean; nodes: QuickCaptureProps['nodes']; onClose: () => void; onUpload: QuickCaptureProps['handleUploadFile']; onImportInstead: (f: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [node, setNode] = useState(nodeId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const add = async () => { if (!file) { setErr('هنوز فایلی انتخاب نکرده‌ای.'); return; } setBusy(true); try { await onUpload(file, node); onClose(); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} size="md" title={scoped ? 'افزودن فایل' : 'افزودن'} description={scoped ? 'فایل کنار دانش این بخش نگه داشته می‌شود؛ استخراج دانش از آن در «فایل‌ها» است.' : ADD_DESCRIPTION} dirty={!!file} steady={!scoped}
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={busy} disabled={!file} onClick={add}>افزودن فایل</Button></>}>
      <div className="flex flex-col gap-stack-md">
        {!scoped && <AddKindSwitch value="file" nodeId={node} onLeave={onClose} />}
        {/* the browser's own picker says «No file chosen» in English: a Persian row instead, the real input stays for the keyboard */}
        <div className="flex flex-col gap-stack-xs">
          <span id="file-add-label" className="label-md text-text-default">کدام فایل؟</span>
          <div className="flex flex-wrap items-center gap-inline-md">
            <Button type="button" variant="secondary" iconStart="Upload" aria-describedby="file-add-name" onClick={() => pick.current?.click()}>{file ? 'فایل دیگر' : 'انتخاب فایل'}</Button>
            <span id="file-add-name" className={file ? 'body-md text-text-default min-w-space-0 break-all' : 'body-md text-text-subtle'}>{file ? file.name : 'هنوز فایلی انتخاب نشده.'}</span>
          </div>
          <input ref={pick} type="file" className="sr-only" tabIndex={-1} aria-labelledby="file-add-label" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(''); }} />
          {err && <span className="body-sm text-text-danger" role="alert">{err}</span>}
        </div>
        {/* the other door for the same file (decisions.md §۶): keeping it as a source here, or breaking its text into notes there.
            Said only once a readable file is picked, so the plain «keep this file» path stays one step */}
        {file && importableFile(file.name) && (
          <div className="flex flex-wrap items-center gap-inline-xs">
            <span className="body-sm text-text-subtle">این فایل کنار بخش نگه داشته می‌شود. می‌خواهی متنش به یادداشت‌های جدا تکه شود؟</span>
            <Button size="sm" variant="ghost" iconStart="FolderInput" onClick={() => onImportInstead(file)}>وارد کردن سند به‌جایش</Button>
          </div>
        )}
        <Select label="کجا برود؟" value={node} onChange={(e) => setNode(e.target.value)} options={flatten(nodes).map(({ node: n, depth }) => ({ value: n.id, label: `${'— '.repeat(depth)}${n.label}` }))} />
      </div>
    </Dialog>
  );
}
