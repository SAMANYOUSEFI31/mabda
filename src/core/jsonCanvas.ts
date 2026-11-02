/**
 * JSON Canvas (https://jsoncanvas.org) as a plain file format — an adapter only: export what the board shows, import the
 * text cards and links of a file. No dependency on any app. Imported cards become free notes (Notes, never Context);
 * links are returned for the caller to show — importing never creates a Relation by itself.
 */

export interface CanvasFileNode { id: string; type: 'text'; text: string; x: number; y: number; width: number; height: number }
export interface CanvasFileEdge { id: string; fromNode: string; toNode: string; label?: string }
export interface CanvasFile { nodes: CanvasFileNode[]; edges: CanvasFileEdge[] }

export interface ExportCard { id: string; text: string; x: number; y: number; w: number; h: number }
export interface ExportLink { id: string; from: string; to: string; label?: string }

export function toJsonCanvas(cards: ExportCard[], links: ExportLink[] = []): CanvasFile {
  const ids = new Set(cards.map((c) => c.id));
  return {
    nodes: cards.map((c) => ({ id: c.id, type: 'text', text: c.text, x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.w), height: Math.round(c.h) })),
    edges: links.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => ({ id: l.id, fromNode: l.from, toNode: l.to, ...(l.label ? { label: l.label } : {}) })),
  };
}

export interface ImportedCanvas {
  cards: ExportCard[];
  links: ExportLink[];
  /** nodes of other types (file, link, group) that were left out */
  skipped: number;
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** parses a JSON Canvas string; throws a Persian Error on anything that is not a canvas file */
export function fromJsonCanvas(text: string): ImportedCanvas {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('این فایل JSON معتبر نیست.'); }
  const d = data as { nodes?: unknown; edges?: unknown };
  if (!d || typeof d !== 'object' || !Array.isArray(d.nodes)) throw new Error('این فایل یک بوم JSON Canvas نیست.');
  const cards: ExportCard[] = [];
  let skipped = 0;
  for (const n of d.nodes as Array<Record<string, unknown>>) {
    if (!n || n.type !== 'text' || typeof n.id !== 'string' || typeof n.text !== 'string') { skipped++; continue; }
    cards.push({ id: n.id, text: n.text.slice(0, 5000), x: num(n.x, 0), y: num(n.y, 0), w: num(n.width, 232), h: num(n.height, 76) });
  }
  const ids = new Set(cards.map((c) => c.id));
  const links: ExportLink[] = [];
  for (const e of (Array.isArray(d.edges) ? d.edges : []) as Array<Record<string, unknown>>) {
    if (e && typeof e.id === 'string' && typeof e.fromNode === 'string' && typeof e.toNode === 'string' && ids.has(e.fromNode) && ids.has(e.toNode)) {
      links.push({ id: e.id, from: e.fromNode, to: e.toNode, ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}) });
    }
  }
  return { cards, links, skipped };
}
