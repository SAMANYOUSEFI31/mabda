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
import { ADD_DESCRIPTION, ADD_EVENT, defaultAddKind, dialogOpen, requestAdd, setPendingAddText } from '../../core/addRequest';
import type { AddRequest } from '../../core/addRequest';
import { AddKindSwitch } from '../../components/shared/AddKindSwitch';
import { Button, Dialog, Select } from '../../ui';
import { registerPaletteCommand } from '../../core/globalSearch';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

const QuickCaptureDialog = lazyNamed(() => import('../../components/thinking/QuickCaptureDialog'), 'QuickCaptureDialog');

export type QuickCaptureProps = Pick<ReadyScope, 'activeTab' | 'data' | 'focusNodeId' | 'handleSaveThought' | 'handleSaveThoughts' | 'handleUploadFile' | 'nodes' | 'openContext' | 'workspaceContexts'>;

const PREF = 'mabda.quickCapture.continuous';
const readContinuous = () => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } };

export function QuickCapture({ activeTab, data, focusNodeId, handleSaveThought, handleSaveThoughts, handleUploadFile, nodes, openContext, workspaceContexts }: QuickCaptureProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [node, setNode] = useState('');
  const [continuous, setContinuous] = useState(readContinuous);
  const here = defaultSectionFor(focusNodeId, nodes);

  /** opening picks the place from where she is NOW; an unsent draft is kept (Esc never loses it) */
  const show = (prefill?: string) => {
    setNode(here);
    if (prefill?.trim()) setText((t) => (t.trim() ? `${t}\n${prefill}` : prefill));
    setOpen(true);
  };
  // «افزودن» (patterns.md §۳): one event for every entry; `N` opens it with the kind that fits this page
  const [fileOpen, setFileOpen] = useState<{ nodeId: string } | null>(null);
  const tab = useRef(activeTab); tab.current = activeTab;
  useEffect(() => {
    const onAdd = (e: Event) => {
      if (dialogOpen()) return;
      const r = (e as CustomEvent<AddRequest>).detail;
      if (r.kind === 'thought') { show(r.text); if (r.nodeId) setNode(r.nodeId); }
      else if (r.kind === 'truth') { setPendingAddText(r.text ?? ''); openContext(null, r.nodeId || undefined); }
      else setFileOpen({ nodeId: r.nodeId || here || nodes[0]?.id || '' });
    };
    const onN = (e: KeyboardEvent) => {
      if (e.code !== 'KeyN' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (dialogOpen()) return;
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
          switcher={<AddKindSwitch value="thought" text={text} nodeId={node} onLeave={() => { setOpen(false); setText(''); /* the words travel with the switch (carryAddText), also across «فایل» */ }} />}
        />
      </Deferred>
      {fileOpen && <FileAdd nodeId={fileOpen.nodeId} nodes={nodes} onClose={() => setFileOpen(null)} onUpload={handleUploadFile} />}
    </>
  );
}

/** «فایل» side of «افزودن»: pick a file and where it belongs; extracting knowledge from it stays in «فایل‌ها» */
function FileAdd({ nodeId, nodes, onClose, onUpload }: { nodeId: string; nodes: QuickCaptureProps['nodes']; onClose: () => void; onUpload: QuickCaptureProps['handleUploadFile'] }) {
  const [file, setFile] = useState<File | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [node, setNode] = useState(nodeId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const add = async () => { if (!file) { setErr('هنوز فایلی انتخاب نکرده‌ای.'); return; } setBusy(true); try { await onUpload(file, node); onClose(); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} size="md" title="افزودن" description={ADD_DESCRIPTION} dirty={!!file} steady
      footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button variant="primary" loading={busy} disabled={!file} onClick={add}>افزودن</Button></>}>
      <div className="flex flex-col gap-stack-md">
        <AddKindSwitch value="file" nodeId={node} onLeave={onClose} />
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
        <Select label="کجا برود؟" value={node} onChange={(e) => setNode(e.target.value)} options={nodes.map((n) => ({ value: n.id, label: n.label }))} />
      </div>
    </Dialog>
  );
}
