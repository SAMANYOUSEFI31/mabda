/**
 * «افزودن» (patterns.md §۳, docs/ux/decisions.md §۲): two kinds of entry, one dialog per kind.
 * - the GLOBAL entry (header button, phone tab, `N`, palette) asks «what?»: the dialog opens on «فکر» with the switch فکر · حقیقت · فایل;
 * - a SCOPED entry (a section's «+ حقیقت», the thinking page's «+ فکر», «افزودن فایل» in a section menu) already knows what and where:
 *   its dialog is locked to that kind (no switch) and opens on that place (still changeable).
 * Pure rules + a window event, so every entry opens the same dialogs.
 */
/** one line under «افزودن» for all three kinds, so the box does not change when she switches */
export const ADD_DESCRIPTION = 'فکر، حقیقت یا فایل؛ جایش را بعد هم می‌شود تعیین کرد.';
export type AddKind = 'thought' | 'truth' | 'file';
export const ADD_KINDS: Array<{ id: AddKind; label: string }> = [{ id: 'thought', label: 'فکر' }, { id: 'truth', label: 'حقیقت' }, { id: 'file', label: 'فایل' }];
/** `scoped`: opened from a place that already says what is added (no kind switch in the dialog) */
export interface AddRequest { kind: AddKind; text?: string; nodeId?: string; scoped?: boolean }
export const ADD_EVENT = 'mabda:add';

/** the global «افزودن» opens on the lightest kind, «فکر», on EVERY page: the same button does the same thing everywhere
 *  (Nielsen 4), and a first visit to «منبع حقیقت» does not start with the longer knowledge form. Scoped entries say their own kind. */
export function defaultAddKind(_page?: string): AddKind {
  return 'thought';
}

export function requestAdd(req: AddRequest): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AddRequest>(ADD_EVENT, { detail: req }));
}

/** text carried into the «حقیقت» dialog when switching from another kind (read once by the dialog as it opens) */
let pendingText = '';
export const setPendingAddText = (t: string) => { pendingText = t; };
/** read by the new truth dialog's first render (a lazy dialog may mount long after the switch, and StrictMode runs an initializer
 *  twice), so reading does not clear it: the dialog clears it when it closes, and every «افزودن» sets it again */
export const takePendingAddText = (): string => pendingText;
export const clearPendingAddText = (): void => { pendingText = ''; };

/** does the next new-knowledge dialog show the kind switch? Only when it was opened from the global entry (or the switch itself);
 *  a section's «+ حقیقت» opens the same dialog through `openContext` directly and so stays locked to «حقیقت». Read once on mount. */
let switchable = false;
export const markAddSwitchable = (on: boolean): void => { switchable = on; };
export const addSwitchable = (): boolean => switchable;

/** is a real dialog open? (the inert copy that plays a dialog's exit does not count) */
export function dialogOpen(): boolean {
  if (typeof document === 'undefined') return false;
  // a full-screen canvas is a dialog that HOSTS «افزودن» (data-add-host): its own add opens above it instead of being refused
  return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some((d) => !d.closest('[inert]') && !d.hasAttribute('data-add-host'));
}

/** the words she was writing, carried across «فکر · حقیقت · فایل»: a file has no text, so they wait here until she comes back
 *  to «فکر» or «حقیقت» (حقیقت ← فایل ← فکر keeps them) */
let carried = '';
export const carryAddText = (from: AddKind, to: AddKind, text: string | undefined): string => {
  if (from !== 'file') carried = text ?? '';
  const out = to === 'file' ? '' : carried;
  if (to !== 'file') carried = '';
  return out;
};

/** «افزودن ← فایل» → «تکه‌تکه به یادداشت‌ها»: the file she already picked waits here for «وارد کردن سند», so she does not pick it twice */
let pendingImport: File | null = null;
export const setPendingImportFile = (f: File | null): void => { pendingImport = f; };
/** read without clearing (a state initializer may run twice); clear with setPendingImportFile(null) once mounted */
export const pendingImportFile = (): File | null => pendingImport;
/** the files «وارد کردن سند» can read (DocumentImportDialog's picker) */
export const importableFile = (name: string): boolean => /\.(txt|md|pdf|docx)$/i.test(name);
