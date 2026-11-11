/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * «ثبت سریع» from every page: a shortcut (Ctrl/⌘+J), an always-reachable button on phones, and an event
 * (`requestQuickCapture()` in src/core/quickCapture.ts) for anything else that wants to open it (e.g. the command palette).
 * The dialog is a separate chunk, loaded the first time it opens. Saving goes through the existing thought path (useNotes).
 */

import { useEffect, useState } from 'react';
import { IconButton } from '../../ui';
import { QUICK_CAPTURE_EVENT, defaultSectionFor, requestQuickCapture } from '../../core/quickCapture';
import { registerPaletteCommand } from '../../core/globalSearch';
import { Deferred, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

const QuickCaptureDialog = lazyNamed(() => import('../../components/thinking/QuickCaptureDialog'), 'QuickCaptureDialog');

export type QuickCaptureProps = Pick<ReadyScope, 'data' | 'focusNodeId' | 'handleSaveThought' | 'handleSaveThoughts' | 'nodes' | 'workspaceContexts'>;

const PREF = 'mabda.quickCapture.continuous';
const readContinuous = () => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } };

export function QuickCapture({ data, focusNodeId, handleSaveThought, handleSaveThoughts, nodes, workspaceContexts }: QuickCaptureProps) {
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
  // «ثبت سریع» در پالت فرمان هم پیدا شود (Ctrl+K)
  useEffect(() => registerPaletteCommand({ id: 'quick-capture', title: 'ثبت سریع', keywords: ['فکر', 'یادداشت', 'فوری', 'Ctrl+J'], run: () => requestQuickCapture() }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.code !== 'KeyJ') return;
      e.preventDefault();
      // another dialog is open (the page is inert): do not stack on top of it, but our own toggles closed
      if (!open && document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      if (open) setOpen(false); else show();
    };
    const onEvent = (e: Event) => { if (!document.querySelector('[role="dialog"],[role="alertdialog"]')) show((e as CustomEvent<{ text?: string }>).detail?.text); };
    window.addEventListener('keydown', onKey);
    window.addEventListener(QUICK_CAPTURE_EVENT, onEvent);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(QUICK_CAPTURE_EVENT, onEvent); };
  });

  return (
    <>
      {/* phones have no shortcut and no top-bar action: one reachable button, above the bottom navigation */}
      <IconButton
        className="fixed bottom-space-24 end-space-4 z-sticky md:hidden shadow-overlay"
        icon="Plus" label="ثبت سریع" variant="secondary" size="lg" data-testid="quick-capture-fab"
        onClick={() => show()}
      />
      <Deferred when={open}>
        <QuickCaptureDialog
          open={open} onClose={() => setOpen(false)} nodes={nodes} objects={workspaceContexts} thoughts={data.thoughts}
          text={text} onTextChange={setText} node={node} onNodeChange={setNode}
          continuous={continuous} onContinuousChange={(on) => { setContinuous(on); try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* a per-viewer convenience only */ } }}
          onSave={handleSaveThought} onSaveMany={handleSaveThoughts}
        />
      </Deferred>
    </>
  );
}
