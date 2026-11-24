import { useSyncExternalStore } from 'react';

/**
 * «راهنمای کوچک» (owner, 2026-11-19; decisions.md §۴۸): the ⓘ beside a term that is new to a first-time user. The viewer's own
 * choice on this device, like the theme: on by default, turned off from the account menu once she knows the product. Every
 * ⓘ follows it at once (one small store, no reload). Not data: never synced, never read by the server.
 */
const KEY = 'mabda:hints';
const listeners = new Set<() => void>();
function read(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
let on = typeof window === 'undefined' ? true : read();

export function setHintsOn(next: boolean) {
  on = next;
  try { localStorage.setItem(KEY, next ? 'on' : 'off'); } catch { /* private mode: the choice lasts this visit */ }
  listeners.forEach((l) => l());
  // the user-test record listens (src/services/activity.ts), like «mabda:dialog»; the design system never imports a service
  try { window.dispatchEvent(new CustomEvent('mabda:hints', { detail: { on: next } })); } catch { /* optional */ }
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useHints(): [boolean, (v: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => on, () => true), setHintsOn];
}
