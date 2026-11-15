/**
 * Sends what broke on this device to the server (server/diagnostics.ts), so a tester never has to describe it (BETA-05).
 * Never what the person wrote: only the error's name, its message with quoted or non-Latin runs removed, the code locations of
 * the stack, and the page path without query or hash. The server cleans it again. A report never throws and never loops.
 */
const scrub = (s: unknown, max: number) => (typeof s === 'string' ? s : '')
  .replace(/"[^"]*"|'[^']*'|«[^»]*»|`[^`]*`|“[^”]*”/g, '…').replace(/[^\x20-\x7E]+/g, '…').replace(/\s+/g, ' ').trim().slice(0, max);

let sent = 0;
let last = '';
export function reportError(err: unknown, extra: { componentStack?: string } = {}) {
  try {
    const e = (err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'non-error thrown')) as Error;
    const key = `${e.name}:${e.message}`;
    // the same error over and over (a render loop) is one report; at most 20 per page load
    if (key === last || sent >= 20) return;
    last = key; sent++;
    const stack = [e.stack ?? '', extra.componentStack ?? ''].join('\n').split('\n').filter((l) => /^\s*at\s|@/.test(l)).slice(0, 14).map((l) => scrub(l.replace(/[?#][^\s):]*/g, ''), 200)).join('\n');
    void fetch('/api/client-errors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ name: scrub(e.name, 60), message: scrub(e.message, 240), stack, path: window.location.pathname, agent: navigator.userAgent }),
    }).catch(() => { /* reporting is best effort */ });
  } catch { /* never let reporting break anything */ }
}

/** every uncaught error and rejected promise of the page */
export function installErrorReporting() {
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
}
