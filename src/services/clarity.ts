/**
 * Microsoft Clarity for the user test (docs/test-data.md §Clarity). A third party sees the page, so every guard is on:
 * - loads only when the deploy sets CLARITY_PROJECT_ID (the server passes it in the session), never in development or tests;
 * - loads only for a tester who accepted the notice that says so (never the owner or the local person);
 * - the WHOLE document is masked (`data-clarity-mask` on <html>, so dialogs, menus, the tour and the full-screen canvas, which
 *   are drawn outside #root, are masked too); only the app's own words are let through, element by element (src/ui/privacy.tsx,
 *   enforced by src/ui/clarityPrivacy.test.ts and the replay-privacy guard in scripts/scenario-guards.mjs). Inputs are always
 *   masked by Clarity itself. This holds whatever masking mode the Clarity project is set to;
 * - what goes to Clarity besides the replay is only the app's own short Latin labels: tags (segments to filter by), events
 *   (moments on the replay's timeline and steps of a funnel), and a pseudonymous tester code (src/core/testerCode.ts), never a
 *   name, an account id, an item id or anything a person wrote.
 */
type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };
declare global { interface Window { clarity?: ClarityFn } }

/** a value Clarity may receive: a short Latin label (the same shape as the activity record's labels) */
const LABEL = /^[a-z][a-z0-9_.:-]{0,47}$/i;

let started = false;

export interface ClarityContext {
  /** the tester's pseudonymous code (testerCode): the same on every device, shown to the owner in «افراد آزمون» */
  tester: string;
  /** this visit's id (src/services/activity.ts → visitId): joins a replay to the server's record of the same visit */
  visit: string;
  /** the app's build, so sessions before and after a change can be told apart */
  build?: string;
}

export function startClarity(projectId: string | undefined, ctx: ClarityContext) {
  if (started || !projectId || typeof document === 'undefined' || !/^[a-z0-9]{6,16}$/i.test(projectId)) return;
  started = true;
  // before the script reads the page: a node's privacy is decided once, when Clarity first sees it (privacy.tsx)
  document.documentElement.setAttribute('data-clarity-mask', 'True');
  const w = window;
  w.clarity = w.clarity || function (...args: unknown[]) { (w.clarity!.q = w.clarity!.q || []).push(args); };
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${projectId}`;
  document.head.appendChild(s);
  try {
    // the tester accepted the notice that names Clarity: analytics storage is granted (it links the pages of one visit), ads never
    w.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    // a pseudonym, never the account: Clarity hashes the first value itself; the last one is the name shown in its list
    if (LABEL.test(ctx.tester)) w.clarity('identify', ctx.tester, LABEL.test(ctx.visit) ? ctx.visit : undefined, undefined, ctx.tester);
    // every tester session is kept in full, even if the project ever samples («upgrade»)
    w.clarity('upgrade', 'tester');
  } catch { /* analytics never breaks the app */ }
  clarityTag('role', 'tester');
  if (ctx.build) clarityTag('build', ctx.build);
  for (const [k, v] of Object.entries(pending)) clarityTag(k, v);
}

/** tags set before Clarity started (the device, the theme) are sent when it starts */
const pending: Record<string, string> = {};

/** a segment tag for the replay list (values are the app's own short labels) */
export function clarityTag(key: string, value: string | boolean | number) {
  const v = String(value);
  if (!LABEL.test(key) || !LABEL.test(v)) return;
  if (!started || typeof window === 'undefined' || !window.clarity) { pending[key] = v; return; }
  try { window.clarity('set', key, v); } catch { /* analytics never breaks the app */ }
}

/** a moment on the replay's timeline, usable as a filter and as a funnel step (a short Latin label, never text) */
export function clarityEvent(name: string) {
  if (!started || typeof window === 'undefined' || !window.clarity || !LABEL.test(name)) return;
  try { window.clarity('event', name); } catch { /* analytics never breaks the app */ }
}

/** marks this session as one to watch (an error, a crash): a tag to filter by and a moment on its timeline */
export function clarityFlag(reason: string) {
  clarityTag('flag', reason);
  clarityEvent(reason);
}

export const clarityStarted = () => started;
