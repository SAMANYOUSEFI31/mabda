import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.tsx';
import { formatNumber } from './format.ts';
import { UI_WORDS } from './privacy.tsx';

/**
 * A short guided walk over the real interface (decisions.md §۴۸): a spotlight on one control, one or two sentences beside it,
 * «بعدی» / «قبلی» / «بستن». Never more than a handful of steps, always skippable (Esc, «بستن»), shown once per device and again
 * on request from the account menu. The interface must stand without it: every step names something that is already labelled
 * on screen, the walk only says what it is FOR.
 * Accessibility: a labelled dialog that takes focus and gives it back; the page underneath is inert while it is open; the
 * spotlight follows scroll and resize; reduced motion: no glide.
 */
export interface TourStep {
  /** the first visible element this returns is lit; none → the step shows centred */
  find: () => Element | null;
  title: string;
  body: string;
}

const visible = (el: Element | null) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight ? r : null;
};

export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const back = useRef<Element | null>(null);
  const step = steps[i];

  const measure = useCallback(() => { if (open && step) setRect(visible(step.find())); }, [open, step]);
  useLayoutEffect(() => { measure(); }, [measure, i]);
  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); };
  }, [open, measure]);
  // focus in, page inert, focus back on close
  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement;
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    const t = window.setTimeout(() => card.current?.querySelector<HTMLElement>('[data-tour-next]')?.focus(), 30);
    return () => {
      window.clearTimeout(t); app?.removeAttribute('inert');
      // focus goes back where it was; if that control is gone (the first-run form that opened the app), to the page itself
      const to = back.current?.isConnected && back.current !== document.body ? back.current as HTMLElement : document.getElementById('main');
      to?.focus?.();
    };
  }, [open]);
  useEffect(() => { if (open) setI(0); }, [open]);
  // the user-test record listens (src/services/activity.ts), like «mabda:dialog»: which step, of how many, and how it ended
  const say = (action: 'start' | 'next' | 'back' | 'done' | 'skip', at: number) => { try { window.dispatchEvent(new CustomEvent('mabda:tour', { detail: { action, step: at + 1, steps: steps.length } })); } catch { /* optional */ } };
  useEffect(() => { if (open) say('start', 0); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !step) return null;

  const last = i === steps.length - 1;
  const pad = 6;
  // the card sits beside the lit control, on the side with more room; on a phone above or below it
  const W = Math.min(320, window.innerWidth - 32);
  let pos: React.CSSProperties;
  if (!rect) pos = { left: (window.innerWidth - W) / 2, top: '50%', width: W, transform: 'translateY(-50%)' }; // check:design-ignore (viewport geometry)
  else if (window.innerWidth < 768) {
    const below = rect.bottom + 12 + 180 < window.innerHeight;
    pos = { left: 16, width: window.innerWidth - 32, ...(below ? { top: rect.bottom + 12 } : { bottom: window.innerHeight - rect.top + 12 }) }; // check:design-ignore (viewport geometry)
  } else {
    const roomLeft = rect.left, roomRight = window.innerWidth - rect.right;
    const top = Math.max(16, Math.min(rect.top, window.innerHeight - 220));
    pos = roomLeft > roomRight ? { left: Math.max(16, rect.left - 16 - W), top, width: W } : { left: Math.min(window.innerWidth - W - 16, rect.right + 16), top, width: W }; // check:design-ignore (viewport geometry)
  }

  return createPortal(
    <div className="mb-tour" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); say('skip', i); onClose(); } }}>
      {rect ? <div className="mb-tour__spot" aria-hidden="true" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> /* check:design-ignore (viewport geometry) */
        : <div className="mb-tour__scrim" aria-hidden="true" />}
      {/* a step is the app's own words (TourStep is written in code), so a session replay may read it (privacy.tsx) */}
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby="mb-tour-title" aria-describedby="mb-tour-body" dir="rtl" {...UI_WORDS}
        className="mb-tour__card flex flex-col gap-stack-sm rounded-container border border-border-default bg-surface-overlay p-inset-lg shadow-raised" style={pos}>
        <p className="caption text-text-subtle">{formatNumber(i + 1)} از {formatNumber(steps.length)}</p>
        <h2 id="mb-tour-title" className="heading-sm text-text-default">{step.title}</h2>
        <p id="mb-tour-body" className="body-md text-text-default">{step.body}</p>
        <div className="flex flex-wrap items-center justify-between gap-inline-sm pt-stack-xs">
          <Button size="sm" variant="ghost" onClick={() => { say(last ? 'done' : 'skip', i); onClose(); }}>{last ? 'بستن' : 'بعداً'}</Button>
          <span className="flex gap-inline-xs">
            {i > 0 && <Button size="sm" variant="ghost" onClick={() => { say('back', i - 1); setI(i - 1); }}>قبلی</Button>}
            <Button size="sm" variant="secondary" data-tour-next="" onClick={() => { if (last) { say('done', i); onClose(); } else { say('next', i + 1); setI(i + 1); } }}>{last ? 'شروع کنم' : 'بعدی'}</Button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const KEY = 'mabda:tour';
/** shown once on this device; automation (screenshots, audits) never gets it uninvited */
export function tourDue(): boolean {
  try { return !navigator.webdriver && localStorage.getItem(KEY) !== 'done'; } catch { return false; }
}
export function markTourDone() { try { localStorage.setItem(KEY, 'done'); } catch { /* private mode */ } }
