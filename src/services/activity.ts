/**
 * The browser's half of the user-test record (docs/test-data.md; the server half is server/activity.ts).
 *
 * Sends only what the page did: which screen, which dialog opened and closed, when a visit began, a heartbeat each minute while
 * someone is actually using the page, and feature keys. Never text: props are cleaned here and again on the server
 * (src/core/activity.ts → cleanProps). Events wait in a small queue and go in one request every 15 seconds, when the page is
 * hidden, or when 20 are waiting. Best effort: a failure is silent, never retried in a loop, and never blocks anything.
 */
import { categoryOf, cleanProps, isUiEvent, routeTemplate } from '../core/activity';
import type { UiEventName } from '../core/activity';
import { clarityEvent, clarityFlag, clarityTag } from './clarity';

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
  toClarity(name, clean);
  queue.push({ name, ...(space ? { space } : {}), ...(clean ? { props: clean } : {}), ...(ms !== undefined ? { ms: Math.round(ms) } : {}), t: Date.now() });
  if (queue.length >= 20) flush();
}

/**
 * The same record, as the session replay sees it (src/services/clarity.ts; docs/test-data.md §Clarity): tags say what kind of
 * session it is (filters), events mark moments on its timeline (and are the steps of funnels). Only the app's Latin labels;
 * clarity.ts drops anything else.
 */
function toClarity(name: UiEventName, p: Record<string, string | number | boolean> | undefined) {
  switch (name) {
    case 'view':
      if (typeof p?.tab === 'string') { clarityTag('view', p.tab); clarityEvent(`view_${p.tab}`); }
      if (p) clarityTag('space', p.sample ? 'sample' : 'own');
      if (p?.tab === 'first-run') clarityTag('first_run', 'yes');
      break;
    case 'feature': if (typeof p?.key === 'string') clarityEvent(p.key); break;
    case 'search': clarityEvent(p?.picked ? 'search_pick' : 'search'); break;
    case 'dialog_open': clarityEvent('dialog_open'); break;
    case 'dialog_close': clarityEvent('dialog_close'); break;
    case 'tour':
      if (typeof p?.action === 'string') clarityEvent(`tour_${p.action}`);
      if (p?.action === 'done' || p?.action === 'skip') clarityTag('tour', `${p.action}_${p.step}_of_${p.steps}`);
      break;
    default: break;
  }
}

/**
 * A request the page made, as the replay sees it (called by src/services/dataApi.ts for every request that changes something):
 * a done action is `did_<category>` (the server record's categories: capture, knowledge, confirm, edit, remove, organize,
 * output, review); a refused or failed one is `api_refused` (4xx) or `api_failed` (5xx, no answer) and flags the session.
 */
export function noteAction(method: string, path: string, status: number, body?: unknown) {
  if (method === 'GET' || typeof window === 'undefined') return;
  try {
    const route = routeTemplate(method, path);
    if (status >= 200 && status < 300) {
      const confirmed = /^(POST|PATCH) \/workspaces\/:wid\/objects(\/:id)?$/.test(route) && (body as { status?: unknown } | undefined)?.status === 'Confirmed';
      const cat = confirmed ? 'confirm' : categoryOf(route);
      if (cat !== 'other') clarityEvent(`did_${cat}`);
    } else if (status === 401 || status === 409) clarityEvent(status === 409 ? 'api_conflict' : 'api_signed_out');
    else clarityFlag(status >= 400 && status < 500 ? 'api_refused' : 'api_failed');
  } catch { /* analytics never breaks the app */ }
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
  const device = deviceProps();
  queue.push({ name: 'session_start', props: device, t: Date.now() });
  visitId();
  // what kind of session this is, for the replay's filters (sent when Clarity starts, if it does)
  clarityTag('device', device.device); clarityTag('touch', device.touch); clarityTag('installed', device.standalone);
  const theme = () => clarityTag('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  theme();
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  try { clarityTag('hints', localStorage.getItem('mabda:hints') === 'off' ? 'off' : 'on'); } catch { /* private mode */ }
  window.addEventListener('mabda:hints', (e) => {
    const on = (e as CustomEvent<{ on: boolean }>).detail?.on;
    clarityTag('hints', on ? 'on' : 'off');
    logUi('feature', { key: on ? 'action.hints-on' : 'action.hints-off' });
  });
  window.addEventListener('mabda:tour', (e) => {
    const d = (e as CustomEvent<{ action: string; step: number; steps: number }>).detail;
    if (d?.action) logUi('tour', { action: d.action, step: d.step, steps: d.steps });
  });
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
