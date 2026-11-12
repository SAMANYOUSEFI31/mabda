/**
 * «افزودن» (patterns.md §۳): one entry, one word, three kinds in one control (فکر · حقیقت · فایل).
 * Pure rules + a window event, so a button anywhere, `N`, the bottom bar and the switch inside each dialog all open the same thing.
 */
/** one line under «افزودن» for all three kinds, so the box does not change when she switches */
export const ADD_DESCRIPTION = 'فکر، حقیقت یا فایل؛ جایش را بعد هم می‌شود تعیین کرد.';
export type AddKind = 'thought' | 'truth' | 'file';
export const ADD_KINDS: Array<{ id: AddKind; label: string }> = [{ id: 'thought', label: 'فکر' }, { id: 'truth', label: 'حقیقت' }, { id: 'file', label: 'فایل' }];
export interface AddRequest { kind: AddKind; text?: string; nodeId?: string }
export const ADD_EVENT = 'mabda:add';

/** the default kind depends on the page it was opened from: the source opens «حقیقت», files «فایل», everywhere else the lightest, «فکر» */
export function defaultAddKind(page: string): AddKind {
  return page === 'context' ? 'truth' : page === 'files' ? 'file' : 'thought';
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

/** is a real dialog open? (the inert copy that plays a dialog's exit does not count) */
export function dialogOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some((d) => !d.closest('[inert]'));
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
