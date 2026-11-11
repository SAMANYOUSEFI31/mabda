import { useEffect, useState } from 'react';

/**
 * Appearance: the viewer's own choice on this device (light, dark, or follow the system). Not shared, not synced:
 * it is a display preference, not data. index.html applies it before first paint; this keeps it live afterwards.
 */
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'mabda:theme';
export const THEME_LABEL: Record<ThemePref, string> = { system: 'مثل دستگاه', light: 'روشن', dark: 'تیره' };
/** order of the «ظاهر» control: one press moves to the next */
export const nextTheme = (p: ThemePref): ThemePref => (p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system');

export function readThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

export function resolveDark(pref: ThemePref, systemDark: boolean): boolean {
  return pref === 'dark' || (pref === 'system' && systemDark);
}

function apply(pref: ThemePref) {
  const systemDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', resolveDark(pref, systemDark));
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  useEffect(() => {
    apply(pref);
    if (pref !== 'system' || typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => apply('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref]);
  const set = (p: ThemePref) => { try { if (p === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* private mode: this session only */ } setPref(p); };
  return [pref, set];
}
