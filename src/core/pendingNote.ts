/**
 * A note shown before the server has it (optimistic add, src/app/thinking/useNotes.ts): it lives under a local id until the stored
 * note replaces it. Nothing may act on it by that id (edit, delete, extract would reach the server with an id it never gave), so the
 * screen offers no actions on it until it is stored.
 */
export const PENDING_NOTE = 'pending-note:';

/** is this note still on its way to the server? */
export const isPendingNote = (id: string): boolean => id.startsWith(PENDING_NOTE);
