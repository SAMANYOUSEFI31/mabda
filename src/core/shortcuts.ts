/**
 * Single-key shortcuts (navigation.md «میان‌برها»): `N`, `/`, `?` and `G` then a letter or a digit. WCAG 2.1.4 (character key
 * shortcuts) asks that they can be turned off; the choice is per device. Keys are physical (`event.code`) so a Persian layout
 * works the same. They never act while she is typing in a field or while a dialog is open.
 */
const KEY = 'mabda.letterKeys';

export function letterKeysOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setLetterKeys(on: boolean): void {
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, 'off'); } catch { /* the choice just does not persist */ }
}

/** is she typing? (a field, a text area, a select, an editable region) */
export function typingIn(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export type GoTarget = { tab: 'home' | 'thinking' | 'context' | 'assets' } | { space: number };
/** the second key after `G`: H T S O for the four places (the Latin initials of Home, Thinking, Source, Outputs), 1–9 for a space */
export function goTarget(code: string): GoTarget | null {
  const tab = ({ KeyH: 'home', KeyT: 'thinking', KeyS: 'context', KeyO: 'assets' } as const)[code as 'KeyH'];
  if (tab) return { tab };
  const m = /^Digit([1-9])$/.exec(code);
  return m ? { space: Number(m[1]) - 1 } : null;
}

/** the list shown by `?` (one place, so the dialog and the docs read the same) */
export const SHORTCUTS: Array<{ keys: string[]; label: string; letter?: boolean }> = [
  { keys: ['Ctrl', 'K'], label: 'جست‌وجو' },
  { keys: ['/'], label: 'جست‌وجو با یک کلید', letter: true },
  { keys: ['N'], label: 'افزودن', letter: true },
  { keys: ['Ctrl', 'J'], label: 'افزودن فکر' },
  { keys: ['G', 'H'], label: 'خانه', letter: true },
  { keys: ['G', 'T'], label: 'فکر', letter: true },
  { keys: ['G', 'S'], label: 'منبع', letter: true },
  { keys: ['G', 'O'], label: 'خروجی‌ها', letter: true },
  { keys: ['G', '1…9'], label: 'رفتن به فضای اول تا نهم', letter: true },
  { keys: ['Ctrl', '\\'], label: 'باز و باریک کردن نوار کناری' },
  { keys: ['Ctrl', 'Enter'], label: 'ذخیره در فرم' },
  { keys: ['?'], label: 'همین فهرست', letter: true },
];
