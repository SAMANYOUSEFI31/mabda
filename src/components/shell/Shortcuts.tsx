/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { dialogOpen } from '../../core/addRequest';
import { registerPaletteCommand } from '../../core/globalSearch';
import { SHORTCUTS, goTarget, letterKeysOn, setLetterKeys, typingIn } from '../../core/shortcuts';
import { Button, Dialog, Switch } from '../../ui';

interface Props {
  onGoTab: (tab: 'home' | 'thinking' | 'context' | 'assets') => void;
  onGoSpace: (index: number) => void;
}

/** `G` then a key (within 1.5s), and `?` for the list; the list also holds the switch that turns single keys off (WCAG 2.1.4) */
export const Shortcuts: React.FC<Props> = ({ onGoTab, onGoSpace }) => {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(letterKeysOn);
  const pendingG = useRef(0);
  const act = useRef({ onGoTab, onGoSpace }); act.current = { onGoTab, onGoSpace };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target) || !letterKeysOn()) return;
      // «?» is Shift + the «/» key on both layouts
      if (e.code === 'Slash' && e.shiftKey) { if (dialogOpen()) return; e.preventDefault(); setOpen(true); return; }
      if (e.shiftKey || dialogOpen()) return;
      if (pendingG.current && Date.now() - pendingG.current < 1500) {
        pendingG.current = 0;
        const t = goTarget(e.code);
        if (!t) return;
        e.preventDefault();
        if ('tab' in t) act.current.onGoTab(t.tab); else act.current.onGoSpace(t.space);
        return;
      }
      if (e.code === 'KeyG') { pendingG.current = Date.now(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    // also reachable without a keyboard shortcut: from search (after the palette has closed)
    const off = registerPaletteCommand({ id: 'shortcuts', title: 'میان‌برهای صفحه‌کلید', keywords: ['کلید', 'میان‌بر', 'صفحه‌کلید', 'shortcut'], run: () => setTimeout(() => setOpen(true), 120) });
    return () => { window.removeEventListener('keydown', onKey); off(); };
  }, []);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} size="sm" title="میان‌برهای صفحه‌کلید"
      footer={<Button variant="secondary" onClick={() => setOpen(false)}>بستن</Button>}>
      <div className="flex flex-col gap-stack-md">
        <Switch label="میان‌برهای تک‌کلیدی (N، /، ?، G)" checked={on} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setOn(e.target.checked); setLetterKeys(e.target.checked); }} />
        <dl className="flex flex-col divide-y divide-border-subtle">
          {SHORTCUTS.map((s) => (
            <div key={s.label + s.keys.join()} className={`flex items-center justify-between gap-inline-md py-stack-xs ${s.letter && !on ? 'text-text-subtle' : ''}`}>
              <dt className="body-md">{s.label}</dt>
              <dd className="m-space-0 flex shrink-0 items-center gap-inline-xs" dir="ltr">
                {s.keys.map((k, i) => <React.Fragment key={k}>{i > 0 && <span className="caption text-text-subtle">{s.keys[0] === 'G' ? 'سپس' : '+'}</span>}<kbd className="mb-kbd">{k}</kbd></React.Fragment>)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="body-sm text-text-subtle">در مک به‌جای Ctrl کلید ⌘ است. میان‌برها با چیدمان فارسی صفحه‌کلید هم کار می‌کنند.</p>
      </div>
    </Dialog>
  );
};
