#!/usr/bin/env node
/**
 * Mabda token build: one source of truth (W3C Design Tokens / DTCG JSON in src/ui/tokens/) ->
 *   src/ui/tokens/build/tokens.css    CSS custom properties (light on :root, dark on :root.dark) + type-style classes
 *   src/ui/tokens/build/theme.css     the Tailwind v4 theme (semantic utilities only; every default scale removed)
 *   src/ui/tokens/build/resolved.json every token, fully resolved for both modes (for docs and a visual specimen)
 *
 * Levels: primitive.json (raw OKLCH palette, never used by app code) -> semantic.json + semantic.{light,dark}.json
 * (roles) -> component.json (per component). An alias to a primitive is resolved per mode; an alias to a semantic or
 * component token stays `var(--name)`, so it follows the mode by itself.
 *
 * Usage: node scripts/tokens/build.mjs           write the files
 *        node scripts/tokens/build.mjs --check   exit 1 when the files on disk differ from the source (src/ui/tokens.test.ts does the same)
 * Extension used: `$extensions["mabda.alpha"]` on a colour alias = the same colour at that opacity (DTCG has no alias+alpha).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { oklchToSrgb, toHex } from './color.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TOKEN_DIR = join(ROOT, 'src/ui/tokens');
export const OUT_DIR = join(TOKEN_DIR, 'build');
const read = (f) => JSON.parse(readFileSync(join(TOKEN_DIR, f), 'utf8'));

export function loadSources() {
  return {
    primitive: read('primitive.json'),
    shared: read('semantic.json'),
    light: read('semantic.light.json'),
    dark: read('semantic.dark.json'),
    component: read('component.json'),
  };
}

/** flatten a DTCG tree into Map(path -> {path, type, value, ext, description, level}) with inherited $type */
export function flatten(tree, level, out = new Map(), prefix = [], inheritedType) {
  const type = tree.$type ?? inheritedType;
  if ('$value' in tree) {
    out.set(prefix.join('.'), { path: prefix, type, value: tree.$value, ext: tree.$extensions ?? {}, description: tree.$description, level });
    return out;
  }
  for (const [k, v] of Object.entries(tree)) {
    if (k.startsWith('$') || typeof v !== 'object' || v === null) continue;
    flatten(v, level, out, [...prefix, k], type);
  }
  return out;
}

/** CSS custom property name for a token path */
export function cssName(path) {
  const p = [...path];
  if (p[0] === 'font' && p[1] === 'family') p.splice(1, 1);
  return '--' + p.join('-').replace(/\./g, '\\.');
}

const isRef = (v) => typeof v === 'string' && /^\{[^}]+\}$/.test(v);
const refPath = (v) => v.slice(1, -1);

const fmtNum = (n) => String(Math.round(n * 10000) / 10000);
const dim = (v) => (typeof v === 'object' && v && 'value' in v ? `${fmtNum(v.value)}${v.unit}` : String(v));
/** type sizes are authored in px (the design grid) but emitted in rem, so they follow the reader's own font-size setting */
const fontDim = (v) => (typeof v === 'object' && v && v.unit === 'px' ? `${fmtNum(+(v.value / 16).toFixed(4))}rem` : dim(v));
const rgbCss = (rgb, a = 1) => {
  const [r, g, b] = rgb.map((x) => Math.round(x * 255));
  return a >= 1 ? toHex(rgb) : `rgb(${r} ${g} ${b} / ${fmtNum(a)})`;
};

/** a mode's whole token map: primitive + shared + mode colours + components */
export function modeMap(src, mode) {
  const m = new Map();
  flatten(src.primitive, 'primitive', m);
  flatten(src.shared, 'semantic', m);
  flatten(src[mode], 'semantic', m);
  flatten(src.component, 'component', m);
  return m;
}

/** fully resolve a token to a concrete value: colours -> {rgb, alpha}; others -> css string / composite */
export function resolveFull(map, key, seen = new Set()) {
  const t = map.get(key);
  if (!t) throw new Error(`unknown token {${key}}`);
  if (seen.has(key)) throw new Error(`alias cycle at {${key}}`);
  seen.add(key);
  const v = t.value;
  if (isRef(v)) {
    const r = resolveFull(map, refPath(v), seen);
    if (t.ext['mabda.alpha'] != null && r.rgb) return { rgb: r.rgb, alpha: t.ext['mabda.alpha'] * r.alpha };
    return r;
  }
  if (t.type === 'color') {
    if (typeof v === 'object' && v.colorSpace === 'oklch') return { rgb: oklchToSrgb(...v.components), alpha: v.alpha ?? 1 };
    throw new Error(`colour ${key}: only oklch primitives or aliases are allowed`);
  }
  if (t.type === 'shadow') {
    const layers = (Array.isArray(v) ? v : [v]).map((l) => {
      const c = resolveFull(map, refPath(l.color), new Set());
      return { ...l, rgb: c.rgb, alpha: (l.alpha ?? 1) * c.alpha };
    });
    return { shadow: layers };
  }
  return { raw: v, type: t.type };
}

/** css text of a value, for the custom property; `semanticRefsAsVar` keeps aliases to semantic/component tokens live */
function cssValue(map, t) {
  const v = t.value;
  if (isRef(v)) {
    const target = map.get(refPath(v));
    if (!target) throw new Error(`unknown token ${v} in ${t.path.join('.')}`);
    if (target.level !== 'primitive' && t.ext['mabda.alpha'] == null) return `var(${cssName(target.path)})`;
  }
  const r = resolveFull(map, t.path.join('.'));
  if (r.rgb) return rgbCss(r.rgb, r.alpha);
  if (r.shadow) return r.shadow.map((l) => `${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${rgbCss(l.rgb, l.alpha)}`).join(', ');
  const { raw, type } = r;
  switch (type) {
    case 'dimension': case 'duration': return t.path[0] === 'font' && t.path[1] === 'size' ? fontDim(raw) : dim(raw);
    case 'cubicBezier': return `cubic-bezier(${raw.join(', ')})`;
    case 'fontFamily': return raw.map((f) => (/\s/.test(f) && !f.startsWith('ui-') ? `'${f}'` : f)).join(', ');
    default: return String(raw);
  }
}

/** which tokens differ between modes (only those are re-declared under :root.dark) */
function modeKeys(src) {
  return new Set([...flatten(src.light, 'semantic').keys()]);
}

const HEADER = '/* GENERATED by scripts/tokens/build.mjs from src/ui/tokens/*.json — do not edit by hand. */\n';

export function buildTokensCss(src) {
  const light = modeMap(src, 'light');
  const dark = modeMap(src, 'dark');
  const perMode = modeKeys(src);
  const decl = (map, filter) => [...map.values()]
    .filter((t) => t.level !== 'primitive' && t.type !== 'typography' && filter(t))
    .map((t) => `  ${cssName(t.path)}: ${cssValue(map, t)};`).join('\n');
  const typeClasses = [...light.values()].filter((t) => t.type === 'typography').map((t) => {
    const v = t.value;
    const fam = cssValue(light, { ...light.get(refPath(v.fontFamily)), value: light.get(refPath(v.fontFamily)).value });
    return `.${t.path.at(-1)} { font-family: ${fam}; font-size: ${fontDim(v.fontSize)}; line-height: ${v.lineHeight}; font-weight: ${v.fontWeight}; letter-spacing: ${dim(v.letterSpacing)}; }`;
  }).join('\n');
  return `${HEADER}:root {\n  color-scheme: light;\n${decl(light, () => true)}\n}\n:root.dark {\n  color-scheme: dark;\n${decl(dark, (t) => perMode.has(t.path.join('.')))}\n}\n\n/* type styles (class = token name) */\n${typeClasses}\n`;
}

export function buildThemeCss(src) {
  const map = modeMap(src, 'light');
  const toks = [...map.values()].filter((t) => t.level !== 'primitive');
  const line = (name, t) => `  ${name}: var(${cssName(t.path)});`;
  const colors = toks.filter((t) => t.type === 'color').map((t) => line(`--color-${t.path.join('-')}`, t));
  const spaceGroups = ['space', 'inset', 'stack', 'inline', 'control', 'icon', 'avatar'];
  const spacing = toks.filter((t) => spaceGroups.includes(t.path[0]) && t.path.length === 2).map((t) => line(`--spacing-${t.path.join('-').replace(/\./g, '\\.')}`, t));
  spacing.push(`  --spacing-touch: var(--touch-target-min);`, `  --spacing-touch-comfortable: var(--touch-target-comfortable);`);
  const radius = toks.filter((t) => t.path[0] === 'radius').map((t) => line(`--radius-${t.path[1]}`, t));
  const shadow = toks.filter((t) => t.path[0] === 'shadow').map((t) => line(`--shadow-${t.path[1]}`, t));
  const type = toks.filter((t) => t.type === 'typography').map((t) => {
    const v = t.value; const n = t.path.at(-1);
    return `  --text-${n}: ${fontDim(v.fontSize)}; --text-${n}--line-height: ${v.lineHeight}; --text-${n}--font-weight: ${v.fontWeight}; --text-${n}--letter-spacing: ${dim(v.letterSpacing)};`;
  });
  const ease = toks.filter((t) => t.path[0] === 'ease').map((t) => line(`--ease-${t.path[1]}`, t));
  const layers = toks.filter((t) => t.path[0] === 'layer').map((t) => `@utility z-${t.path[1]} { z-index: var(${cssName(t.path)}); }`);
  return `${HEADER}/*
 * Tailwind v4 theme: Tailwind's default palette and scales are removed, so the only colours, spacing, radii,
 * shadows and type sizes that exist are the semantic tokens (utility name = token name: bg-surface-raised,
 * text-text-subtle, p-inset-lg, gap-stack-md, rounded-control, shadow-raised, text-body-md).
 */
@theme {
  --color-*: initial; --spacing-*: initial; --radius-*: initial; --shadow-*: initial; --inset-shadow-*: initial;
  --drop-shadow-*: initial; --text-*: initial; --font-*: initial; --font-weight-*: initial; --leading-*: initial;
  --tracking-*: initial; --container-*: initial; --blur-*: initial; --ease-*: initial; --animate-*: initial;
}
@theme inline {
${colors.join('\n')}
${spacing.join('\n')}
${radius.join('\n')}
${shadow.join('\n')}
  --container-form: var(--container-sm);
  --container-content: var(--container-lg);
  --container-wide: var(--container-xl);
  --container-reading: var(--container-prose);
  --container-overlay-xs: var(--overlay-width-xs);
  --container-overlay-sm: var(--overlay-width-sm);
  --container-overlay-md: var(--overlay-width-md);
  --container-overlay-lg: var(--overlay-width-lg);
  --font-sans: var(--font-sans);
  --font-latin: var(--font-latin);
  --font-mono: var(--font-mono);
  --font-weight-regular: var(--font-weight-regular);
  --font-weight-semibold: var(--font-weight-semibold);
  --font-weight-bold: var(--font-weight-bold);
  --leading-tight: var(--line-height-tight);
  --leading-snug: var(--line-height-snug);
  --leading-normal: var(--line-height-normal);
  --leading-relaxed: var(--line-height-relaxed);
  --tracking-none: var(--letter-spacing-none);
  --tracking-code: var(--letter-spacing-code);
${type.join('\n')}
${ease.join('\n')}
}
${layers.join('\n')}
@utility duration-fast { transition-duration: var(--duration-fast); }
@utility duration-base { transition-duration: var(--duration-base); }
@utility focus-ring { outline: var(--focus-width) solid var(--border-focus); outline-offset: var(--focus-offset); }
@utility min-h-screen-dvh { min-block-size: 100dvh; }
`;
}

export function buildResolved(src) {
  const light = modeMap(src, 'light');
  const dark = modeMap(src, 'dark');
  const out = [];
  for (const t of light.values()) {
    const d = dark.get(t.path.join('.'));
    const val = (map, tok) => (tok.type === 'typography' ? tok.value : concrete(map, tok));
    out.push({ token: t.path.join('.'), css: t.level === 'primitive' ? null : cssName(t.path), level: t.level, type: t.type, description: t.description ?? null, alias: isRef(t.value) ? t.value : null, light: val(light, t), dark: val(dark, d ?? t) });
  }
  return JSON.stringify({ $description: 'GENERATED — every Mabda token resolved for both modes (scripts/tokens/build.mjs).', tokens: out }, null, 1) + '\n';
}

function concrete(map, t) {
  const r = resolveFull(map, t.path.join('.'));
  if (r.rgb) return rgbCss(r.rgb, r.alpha);
  if (r.shadow) return r.shadow.map((l) => `${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${rgbCss(l.rgb, l.alpha)}`).join(', ');
  if (t.type === 'dimension' || t.type === 'duration') return dim(r.raw);
  return r.raw;
}

/** the numbers the design-system docs quote, generated so prose and tokens can never disagree */
export function buildReference(src) {
  const light = modeMap(src, 'light');
  const dark = modeMap(src, 'dark');
  const rows = [];
  const pick = (pre) => [...light.values()].filter((t) => t.level !== 'primitive' && t.path.join('.').startsWith(pre));
  const show = (map, t) => { const v = t.type === 'typography' ? t.value : concrete(map, t); return typeof v === 'string' ? v : JSON.stringify(v); };
  const table = (title, pre, modes = true) => {
    const list = pick(pre);
    if (!list.length) return;
    rows.push(`## ${title}`, '', modes ? '| token | css | light | dark |' : '| token | css | value |', modes ? '| --- | --- | --- | --- |' : '| --- | --- | --- |');
    for (const t of list) {
      const d = dark.get(t.path.join('.')) ?? t;
      rows.push(modes ? `| \`${t.path.join('.')}\` | \`${cssName(t.path)}\` | ${show(light, t)} | ${show(dark, d)} |` : `| \`${t.path.join('.')}\` | \`${cssName(t.path)}\` | ${show(light, t)} |`);
    }
    rows.push('');
  };
  rows.push('# Token reference (GENERATED by `bun run tokens` — do not edit)', '', 'Every number the design-system docs rely on, resolved from the DTCG source for both modes.', '');
  table('Surfaces', 'surface.');
  table('Text', 'text.');
  table('Borders', 'border.');
  table('Nuqta (knowledge state)', 'nuqta.');
  table('Radius', 'radius.', false);
  table('Shadows', 'shadow.');
  const type = [...light.values()].filter((t) => t.type === 'typography');
  rows.push('## Type scale', '', '| style | size | weight | line-height |', '| --- | --- | --- | --- |');
  for (const t of type) { const v = t.value; rows.push(`| \`${t.path.at(-1)}\` | ${fontDim(v.fontSize)} (${dim(v.fontSize)}) | ${v.fontWeight} | ${v.lineHeight} |`); }
  rows.push('');
  return rows.join('\n');
}

export function buildAll(src = loadSources()) {
  return {
    'tokens.css': buildTokensCss(src),
    'theme.css': buildThemeCss(src),
    'resolved.json': buildResolved(src),
    'reference.md': buildReference(src),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = buildAll();
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([f, text]) => { try { return readFileSync(join(OUT_DIR, f), 'utf8') !== text; } catch { return true; } });
    if (stale.length) { console.error(`tokens: out of date: ${stale.map(([f]) => f).join(', ')} — run \`bun run tokens\``); process.exit(1); }
    console.log('tokens: build files match the source');
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [f, text] of Object.entries(files)) writeFileSync(join(OUT_DIR, f), text);
    console.log(`tokens: wrote ${Object.keys(files).join(', ')} to src/ui/tokens/build/`);
  }
}
