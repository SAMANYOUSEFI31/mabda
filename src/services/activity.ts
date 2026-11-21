/**
 * The browser's half of the user-test record (docs/test-data.md; the server half is server/activity.ts).
 *
 * Sends only what the page did: which screen, which dialog opened and closed, when a visit began, a heartbeat each minute while
 * someone is actually using the page, and feature keys. Never text: props are cleaned here and again on the server
 * (src/core/activity.ts → cleanProps). Events wait in a small queue and go in one request every 15 seconds, when the page is
 * hidden, or when 20 are waiting. Best effort: a failure is silent, never retried in a loop, and never blocks anything.
 */
import { cleanProps, isUiEvent } from '../core/activity';
import type { UiEventName } from '../core/activity';
import { clarityTag } from './clarity';

const SESSION_KEY = 'mabda_visit';
/** a visit ends after 30 minutes without anything happening (the common web-analytics definition) */
const VISIT_IDLE_MS = 30 * 60_000;

interface Queued { name: UiEventName; space?: string; props?: Record<string, string | number | boolean>; ms?: number; t: number }
const queue: Queued[] = [];
let lastInput = 0;
let space: string | undefined;
let installed = false;

/** this tab's visit id: kept in sessionStorage, renewed after 30 idle minutes */
export function visitId(now = Date.now()): string {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const cur = raw ? (JSON.parse(raw) as { id: string; at: number }) : undefined;
    if (cur && /^[A-Za-z0-9_-]{8,64}$/.test(cur.id) && now - cur.at < VISIT_IDLE_MS) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: cur.id, at: now }));
      return cur.id;
    }
    const id = `v_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
    if (installed) queue.push({ name: 'session_start', props: deviceProps(), t: now });
    return id;
  } catch { return 'v_unavailable'; }
}

/** the header every data request carries, so a server action joins the visit it happened in */
export const visitHeader = (): Record<string, string> => ({ 'x-mabda-session': visitId() });

/** the space the person is in now (the screens and dialogs that follow belong to it) */
export function setActivitySpace(id: string | undefined) { space = id; }

export function logUi(name: UiEventName, props?: Record<string, unknown>, ms?: number) {
  if (!isUiEvent(name) || typeof window === 'undefined') return;
  const clean = cleanProps(props);
  if (name === 'view' && clean) { if (typeof clean.tab === 'string') clarityTag('view', clean.tab); clarityTag('space', clean.sample ? 'sample' : 'own'); }
  queue.push({ name, ...(space ? { space } : {}), ...(clean ? { props: clean } : {}), ...(ms !== undefined ? { ms: Math.round(ms) } : {}), t: Date.now() });
  if (queue.length >= 20) flush();
}

function deviceProps() {
  const w = window.innerWidth;
  return {
    device: w < 640 ? 'phone' : w < 1024 ? 'tablet' : 'desktop', w, h: window.innerHeight,
    touch: matchMedia('(pointer: coarse)').matches, standalone: matchMedia('(display-mode: standalone)').matches,
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
  };
}

export function flush() {
  if (!queue.length) return;
  const now = Date.now();
  const events = queue.splice(0, 50).map((q) => ({ name: q.name, space: q.space, props: q.props, ms: q.ms, ago: now - q.t }));
  try {
    void fetch('/api/activity', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'x-mabda-session': visitId(now) },
      body: JSON.stringify({ events }),
    }).catch(() => { /* best effort */ });
  } catch { /* never let recording break anything */ }
}

/** Starts the record once per page load: a visit start, the heartbeat, the queue's timer, and dialogs (src/ui → mabda:dialog). */
export function installActivity() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  queue.push({ name: 'session_start', props: deviceProps(), t: Date.now() });
  visitId();
  const input = () => { lastInput = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) window.addEventListener(ev, input, { passive: true, capture: true });
  // a heartbeat only while the page is seen and someone touched it in the last minute: reading counts, an open tab does not
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - lastInput < 60_000) logUi('heartbeat'); }, 60_000);
  setInterval(flush, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { logUi('hidden'); flush(); } else logUi('visible');
  });
  window.addEventListener('pagehide', flush);
  // the design system's Dialog announces itself (src/ui/Overlay.tsx); only its title (the app's own words) is kept
  window.addEventListener('mabda:dialog', (e) => {
    const d = (e as CustomEvent<{ open: boolean; title?: string; ms?: number }>).detail;
    if (d?.title) logUi(d.open ? 'dialog_open' : 'dialog_close', { title: d.title }, d.open ? undefined : d.ms);
  });
}
