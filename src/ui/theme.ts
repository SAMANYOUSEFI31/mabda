import { useEffect, useState } from 'react';

/**
 * Appearance: the viewer's own choice on this device (light, dark, or follow the system). Not shared, not synced:
 * it is a display preference, not data. index.html applies it before first paint; this keeps it live afterwards.
 */
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'mabda:theme';
export const THEME_LABEL: Record<ThemePref, string> = { system: 'خودکار', light: 'روشن', dark: 'تیره' };
/** order of the options in the «ظاهر» control */
export const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark'];

export function readThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

export function resolveDark(pref: ThemePref, systemDark: boolean): boolean {
  return pref === 'dark' || (pref === 'system' && systemDark);
}

function apply(pref: ThemePref) {
  const systemDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  const dark = resolveDark(pref, systemDark);
  // motion.md «تعویض تم»: no motion. Transitions are off for one frame so hundreds of things do not recolour together.
  if (root.classList.contains('dark') !== dark) {
    root.setAttribute('data-theme-switching', '');
    requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute('data-theme-switching')));
  }
  root.classList.toggle('dark', dark);
  // the browser chrome follows the chosen mode, not only the system one
  const page = getComputedStyle(document.documentElement).getPropertyValue('--surface-page').trim();
  if (page) document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => { m.content = page; });
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
