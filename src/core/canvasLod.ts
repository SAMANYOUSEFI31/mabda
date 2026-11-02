/**
 * Level of detail for the canvas: how much of a card is drawn depends on the zoom, so 8000 objects stay readable and fast.
 *   far  — a dot (and, with many in view, a cluster with a count); no text
 *   mid  — the title (and the chips)
 *   near — title + a short summary
 * Edges follow the same rule: far draws only the emphasized ones. Pure.
 */

export type Lod = 'far' | 'mid' | 'near';
export const LOD_FAR_BELOW = 0.38;
export const LOD_NEAR_FROM = 0.9;

export function lodOf(k: number): Lod {
  return k < LOD_FAR_BELOW ? 'far' : k >= LOD_NEAR_FROM ? 'near' : 'mid';
}
export const LOD_FA: Record<Lod, string> = { far: 'دور', mid: 'متوسط', near: 'نزدیک' };

export interface Placed { id: string; x: number; y: number; w: number; h: number }
export interface Cluster { id: string; x: number; y: number; count: number; ids: string[] }

/**
 * Far view of a dense area: items whose centres fall into the same screen cell (`cellPx` at zoom `k`) become one cluster
 * with a count; a lone item stays an item (count 1). Cluster positions are the mean of their members, in stage coordinates.
 */
export function clusterItems(items: Placed[], k: number, cellPx = 36): Cluster[] {
  const cell = cellPx / Math.max(k, 0.01);
  const buckets = new Map<string, Placed[]>();
  for (const it of items) {
    const key = `${Math.floor((it.x + it.w / 2) / cell)}:${Math.floor((it.y + it.h / 2) / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(it); else buckets.set(key, [it]);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({
    id: list.length === 1 ? list[0].id : `cluster:${key}`,
    x: list.reduce((s, i) => s + i.x + i.w / 2, 0) / list.length,
    y: list.reduce((s, i) => s + i.y + i.h / 2, 0) / list.length,
    count: list.length,
    ids: list.map((i) => i.id).sort(),
  }));
}

/** how many edges are drawn at a level of detail (the emphasized ones always are) */
export const edgeBudget = (lod: Lod): number => (lod === 'far' ? 0 : lod === 'mid' ? 600 : 1200);
