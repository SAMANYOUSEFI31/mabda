/**
 * ONE versioned data format for everything that gives a workspace its shape: the «شروع آماده» of a new workspace, the
 * grey examples of a kind of business, and a saved node (with its sub-tree). It is DATA — nothing in the code knows a node
 * id; a template names its nodes by a `key` that only means something inside the template.
 *
 *  • nodes      : a forest (children inside children) with label and description
 *  • samples    : grey examples; `node` is a node key of this template, or — for a template that brings no nodes — a hint for a node
 *                 of the workspace (when it is not there the example goes to the default place)
 *  • suggested  : knowledge the workflows will ask for («دانش لازم پیشنهادی»), by the same semantic `key` the Gap engine matches
 *
 * `parseTemplate` is the one door a template comes in by (a file, later a catalogue): it validates and cleans, it never trusts.
 * There is no market, no sharing and no payment here; this is only the shape such a thing would have. Pure.
 */

import type { ContextType, TreeNode } from '../types';
import { defaultNodeId } from './nodeTree';

export const TEMPLATE_SCHEMA = 1;

export interface TemplateNode { key: string; label: string; description: string; children?: TemplateNode[] }
export interface TemplateSample { node: string; type: ContextType; title: string; content: string; slotKey?: string; facets?: string[] }
export interface TemplateKnowledge { key: string; label: string; description: string; node?: string }
export interface StartTemplate {
  schema: typeof TEMPLATE_SCHEMA;
  id: string;
  /** the template's own version (a catalogue can offer a newer one) */
  version: number;
  title: string;
  description: string;
  nodes: TemplateNode[];
  samples: TemplateSample[];
  suggested?: TemplateKnowledge[];
}

const TYPES: ContextType[] = ['Fact', 'Decision', 'Constraint'];
const MAX_NODES = 200, MAX_SAMPLES = 400, MAX_DEPTH = 8, MAX_TEXT = 4000;
const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** a template from untrusted JSON: a valid one, or the plain reason it is not */
export function parseTemplate(input: unknown): { ok: true; template: StartTemplate } | { ok: false; reason: string } {
  let raw: unknown = input;
  if (typeof input === 'string') { try { raw = JSON.parse(input); } catch { return { ok: false, reason: 'فایل قالب درست خوانده نشد.' }; } }
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'فایل قالب درست خوانده نشد.' };
  const r = raw as Record<string, unknown>;
  if (r.schema !== TEMPLATE_SCHEMA) return { ok: false, reason: 'این قالب برای نسخهٔ دیگری از مبدأ ساخته شده است.' };
  const id = str(r.id, 80), title = str(r.title, 120);
  if (!id || !title) return { ok: false, reason: 'قالب باید شناسه و عنوان داشته باشد.' };
  let nodeCount = 0;
  const keys = new Set<string>();
  const readNode = (x: unknown, depth: number): TemplateNode | undefined => {
    if (!x || typeof x !== 'object' || depth > MAX_DEPTH || ++nodeCount > MAX_NODES) return undefined;
    const n = x as Record<string, unknown>;
    const key = str(n.key, 80), label = str(n.label, 120);
    if (!key || !label || keys.has(key)) return undefined;
    keys.add(key);
    const kids = Array.isArray(n.children) ? n.children.map((c) => readNode(c, depth + 1)).filter((c): c is TemplateNode => !!c) : [];
    return { key, label, description: str(n.description, 400) ?? '', ...(kids.length ? { children: kids } : {}) };
  };
  const nodes = (Array.isArray(r.nodes) ? r.nodes : []).map((n) => readNode(n, 0)).filter((n): n is TemplateNode => !!n);
  const samples: TemplateSample[] = [];
  for (const x of Array.isArray(r.samples) ? r.samples.slice(0, MAX_SAMPLES) : []) {
    const s = x as Record<string, unknown> | null;
    const title2 = str(s?.title, 200), content = str(s?.content, MAX_TEXT), node = str(s?.node, 80);
    if (!s || !title2 || !content || !node || !TYPES.includes(s.type as ContextType)) continue;
    const facets = Array.isArray(s.facets) ? s.facets.map((f) => str(f, 40)).filter((f): f is string => !!f).slice(0, 8) : undefined;
    samples.push({ node, type: s.type as ContextType, title: title2, content, ...(str(s.slotKey, 80) ? { slotKey: str(s.slotKey, 80) } : {}), ...(facets?.length ? { facets } : {}) });
  }
  const suggested: TemplateKnowledge[] = [];
  for (const x of Array.isArray(r.suggested) ? r.suggested : []) {
    const k = x as Record<string, unknown> | null;
    const key = str(k?.key, 80), label = str(k?.label, 160);
    if (key && label) suggested.push({ key, label, description: str(k?.description, 400) ?? '', ...(str(k?.node, 80) ? { node: str(k?.node, 80) } : {}) });
  }
  if (!nodes.length && !samples.length) return { ok: false, reason: 'این قالب نه بخش دارد نه نمونه.' };
  return { ok: true, template: { schema: TEMPLATE_SCHEMA, id, version: Math.max(1, Math.floor(Number(r.version) || 1)), title, description: str(r.description, 400) ?? '', nodes, samples, ...(suggested.length ? { suggested } : {}) } };
}

export interface PlannedNode { key: string; /** the node id to create (given by `idFor`) */ id: string; parentId?: string; label: string; description: string; order: number }

/**
 * The nodes a template brings, as rows to insert: a template node under `underId` (a root when absent), ids from `idFor`
 * (a stable key → id for a brand-new workspace, fresh ids when a template is added to an existing tree), orders after the
 * existing siblings. Pure: nothing is created here.
 */
export function planNodes(t: StartTemplate, existing: TreeNode[], underId: string | undefined, idFor: (key: string) => string): PlannedNode[] {
  const out: PlannedNode[] = [];
  const siblings = existing.filter((n) => (n.parentId ?? undefined) === underId);
  let base = siblings.reduce((m, n) => Math.max(m, (n.order ?? 0) + 1), 0);
  const walk = (list: TemplateNode[], parentId: string | undefined, first: number) => {
    list.forEach((n, i) => {
      const id = idFor(n.key);
      out.push({ key: n.key, id, ...(parentId ? { parentId } : {}), label: n.label, description: n.description, order: first + i });
      if (n.children?.length) walk(n.children, id, 0);
    });
  };
  walk(t.nodes, underId, base);
  return out;
}

/** where a sample goes: its template node when that was just created, else a node of the workspace by that id, else the default place */
export function sampleNode(sample: TemplateSample, created: Map<string, string>, nodes: TreeNode[]): string {
  return created.get(sample.node) ?? (nodes.some((n) => n.id === sample.node) ? sample.node : defaultNodeId(nodes));
}

/** a template as a plain JSON file (the inverse of `parseTemplate`) */
export const exportTemplate = (t: StartTemplate): string => JSON.stringify(t, null, 2);

/** the tree of a template as TreeNode rows with the keys as ids (for engines and tests that want the starting shape) */
export function templateTree(t: StartTemplate): TreeNode[] {
  return planNodes(t, [], undefined, (k) => k).map((n) => ({ id: n.id, label: n.label, description: n.description, order: n.order, ...(n.parentId ? { parentId: n.parentId } : {}) }));
}
