/**
 * A form's save, in the order a person can trust: the dialog closes only once the server said yes. A failure (a 409 conflict
 * because the same item was changed in another tab or device, a dropped network) keeps the dialog open with everything she wrote,
 * so the error is followed by «try again», never by retyping (Nielsen 9; CLAUDE.md rule 3). docs/ux/decisions.md §۵۳ ۲.
 */
export type SaveOutcome<T> = { ok: true; value: T } | { ok: false };

/**
 * Runs `save`; `close` is called only when it returned a value. `after` (the follow-up writes that need the saved id) runs before
 * the close, so a dialog never disappears while something it started is still on its way.
 */
export async function saveThenClose<T>(save: () => Promise<T | undefined | void>, close: () => void, after?: (value: T) => Promise<void>): Promise<SaveOutcome<T>> {
  let value: T | undefined | void;
  try { value = await save(); } catch { return { ok: false }; }
  if (value === undefined || value === null) return { ok: false };
  if (after) await after(value as T);
  close();
  return { ok: true, value: value as T };
}
