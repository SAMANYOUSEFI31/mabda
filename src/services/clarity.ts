/**
 * Microsoft Clarity for the user test (docs/test-data.md §Clarity). A third party sees the page, so every guard is on:
 * - loads only when the deploy sets CLARITY_PROJECT_ID (the server passes it in the session), never in development or tests;
 * - loads only for a tester who accepted the notice that says so (never the owner or the local person);
 * - the whole app is masked (`data-clarity-mask`): replays show layout, clicks, scrolls, rage and dead clicks, never the
 *   person's words; the Clarity project should also be set to the «Strict» masking mode in its settings;
 * - tags carry only the app's own words (role, screen, sample or own space), never a name, id or text.
 */
type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };
declare global { interface Window { clarity?: ClarityFn } }

let started = false;

export function startClarity(projectId: string | undefined) {
  if (started || !projectId || typeof document === 'undefined' || !/^[a-z0-9]{6,16}$/i.test(projectId)) return;
  started = true;
  document.getElementById('root')?.setAttribute('data-clarity-mask', 'True');
  const w = window;
  w.clarity = w.clarity || function (...args: unknown[]) { (w.clarity!.q = w.clarity!.q || []).push(args); };
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${projectId}`;
  document.head.appendChild(s);
  w.clarity('set', 'role', 'tester');
}

/** a segment tag for the replay list (values are the app's own short labels) */
export function clarityTag(key: string, value: string | boolean) {
  if (!started || typeof window === 'undefined' || !window.clarity) return;
  try { window.clarity('set', key, String(value)); } catch { /* analytics never breaks the app */ }
}
