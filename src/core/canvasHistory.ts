/**
 * Undo / redo for the canvas. Pure: a history is a value; every entry holds the plain-data actions that undo and redo it,
 * the app executes them against the same API the user's own gestures use (so an undo is a normal, recorded change).
 * Only reversible gestures are recorded: a move, a line between two decisions («وابسته به»), a free-note / card position.
 * «جایگزین کردن» is NOT undoable here (it needs an explicit confirmation of its own) and is never recorded.
 */

export type CanvasAction =
  | { type: 'move'; objectId: string; lane: 'thinking' | 'confirmed'; nodeId?: string; beforeId?: string; afterId?: string }
  | { type: 'setDependencies'; objectId: string; targetIds: string[] }
  | { type: 'moveNote'; noteId: string; x: number; y: number }
  | { type: 'placeObject'; objectId: string; x: number; y: number }
  | { type: 'unplaceObject'; objectId: string };

export interface HistoryEntry { label: string; undo: CanvasAction[]; redo: CanvasAction[] }
export interface History { past: HistoryEntry[]; future: HistoryEntry[]; limit: number }

export const createHistory = (limit = 50): History => ({ past: [], future: [], limit });
export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;

/** a new gesture: the future (what could have been redone) is gone */
export function record(h: History, e: HistoryEntry): History {
  return { ...h, past: [...h.past, e].slice(-h.limit), future: [] };
}
export function undo(h: History): { history: History; entry?: HistoryEntry } {
  const entry = h.past[h.past.length - 1];
  return entry ? { history: { ...h, past: h.past.slice(0, -1), future: [entry, ...h.future] }, entry } : { history: h };
}
export function redo(h: History): { history: History; entry?: HistoryEntry } {
  const entry = h.future[0];
  return entry ? { history: { ...h, past: [...h.past, entry], future: h.future.slice(1) }, entry } : { history: h };
}
