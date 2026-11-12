/**
 * The design-token contract (docs/design-system/tokens.md):
 *  1. the generated CSS / Tailwind theme / resolved JSON match the DTCG source exactly (no hand edits, no drift);
 *  2. light and dark define the same roles;
 *  3. components alias only semantic tokens (never the raw palette);
 *  4. every text / control role meets WCAG 2.2 AA and an APCA floor, in both modes, on every surface it sits on;
 *  5. the generated reference.md (the numbers the docs quote) matches the source too (test 1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAll, loadSources, flatten, modeMap, resolveFull, OUT_DIR } from '../../scripts/tokens/build.mjs';
import { over, wcagRatio, apcaLc } from '../../scripts/tokens/color.mjs';

type RGB = [number, number, number];
const src = loadSources();

test('generated token files match the DTCG source (run `bun run tokens`)', () => {
  const files = buildAll(src) as Record<string, string>;
  for (const [name, text] of Object.entries(files)) {
    assert.equal(readFileSync(join(OUT_DIR, name), 'utf8'), text, `src/ui/tokens/build/${name} is stale — run \`bun run tokens\``);
  }
});

test('light and dark define exactly the same roles', () => {
  const l = [...flatten(src.light, 'semantic').keys()].sort();
  const d = [...flatten(src.dark, 'semantic').keys()].sort();
  assert.deepEqual(l, d);
});

test('component and shared tokens never alias the raw palette', () => {
  for (const [level, tree] of [['component', src.component], ['semantic', src.shared]] as const) {
    for (const t of flatten(tree, level).values() as Iterable<{ path: string[]; value: unknown }>) {
      if (typeof t.value === 'string') assert.ok(!t.value.startsWith('{color.'), `${t.path.join('.')} aliases a primitive (${t.value})`);
    }
  }
});

test('every token resolves in both modes', () => {
  for (const mode of ['light', 'dark']) {
    const map = modeMap(src, mode);
    for (const key of map.keys()) assert.doesNotThrow(() => resolveFull(map, key), `${mode}: ${key}`);
  }
});

/** resolve a stack of colour roles (top first) to one opaque colour */
function solid(map: Map<string, unknown>, ...roles: string[]): RGB {
  let base: RGB = [1, 1, 1];
  for (const role of [...roles].reverse()) {
    const r = resolveFull(map, role) as { rgb: RGB; alpha: number };
    base = over(r.rgb, r.alpha, base) as RGB;
  }
  return base;
}

const SURFACES = ['surface.page', 'surface.raised', 'surface.sunken', 'surface.overlay'];
const INTENTS = ['brand', 'danger', 'warning', 'success', 'info'];
interface Pair { fg: string[]; bg: string[]; wcag: number; apca: number; why: string }
const pairs: Pair[] = [];
for (const s of SURFACES) {
  pairs.push({ fg: ['text.default'], bg: [s], wcag: 7, apca: 75, why: 'body text' });
  pairs.push({ fg: ['text.subtle'], bg: [s], wcag: 4.5, apca: 60, why: 'secondary text' });
  pairs.push({ fg: ['text.subtlest'], bg: [s], wcag: 4.5, apca: 45, why: 'hints, placeholders (14px+)' });
  pairs.push({ fg: ['text.default'], bg: ['bg.selected', s], wcag: 4.5, apca: 70, why: 'selected row' });
  pairs.push({ fg: ['border.input'], bg: [s], wcag: 3, apca: 0, why: 'field boundary (WCAG 1.4.11)' });
  pairs.push({ fg: ['border.focus'], bg: [s], wcag: 3, apca: 0, why: 'focus indicator (WCAG 2.4.13)' });
  pairs.push({ fg: ['icon.subtle'], bg: [s], wcag: 3, apca: 0, why: 'meaningful icon' });
}
for (const i of INTENTS) {
  for (const s of ['surface.page', 'surface.raised']) {
    pairs.push({ fg: [`text.${i}`], bg: [s], wcag: 4.5, apca: 55, why: `${i} text` });
    pairs.push({ fg: [`text.${i}`], bg: [`bg.${i}-subtle`, s], wcag: 4.5, apca: 55, why: `${i} badge / alert` });
    pairs.push({ fg: ['text.default'], bg: [`bg.${i}-subtle`, s], wcag: 7, apca: 70, why: `text inside a ${i} alert` });
    pairs.push({ fg: [`icon.${i}`], bg: [s], wcag: 3, apca: 0, why: `${i} icon` });
  }
  for (const state of ['', '-hover', '-pressed']) pairs.push({ fg: [`text.on-${i}`], bg: [`bg.${i}-bold${state}`], wcag: 4.5, apca: 60, why: `label on a bold ${i} fill` });
}
for (const state of ['', '-hover', '-pressed']) pairs.push({ fg: ['text.on-neutral'], bg: [`bg.neutral-bold${state}`], wcag: 4.5, apca: 60, why: 'label on a bold neutral fill (toast, checked box)' });
for (const n of [1, 2, 3, 4, 5]) pairs.push({ fg: [`chart.categorical-${n}`], bg: ['surface.raised'], wcag: 3, apca: 0, why: 'chart series' });
// the nuqta is the one cue of a knowledge state (shape first, colour reinforces): every one must be seen on every surface
for (const n of ['truth', 'pending', 'stale', 'conflict', 'brand']) pairs.push({ fg: [`nuqta.${n}`], bg: ['surface.page', 'surface.raised', 'surface.sunken'], wcag: 3, apca: 0, why: `nuqta ${n}` });
pairs.push({ fg: ['text.default'], bg: ['bg.neutral-subtle', 'surface.page'], wcag: 7, apca: 70, why: 'text inside a proposal (neutral block)' });
for (const e of ['edge-dependency', 'edge-lineage', 'edge-supersedes']) pairs.push({ fg: [`mabda.${e}`], bg: ['surface.sunken'], wcag: 3, apca: 0, why: 'canvas line' });

for (const mode of ['light', 'dark']) {
  test(`contrast floors hold in ${mode} mode (WCAG 2.2 AA + APCA)`, () => {
    const map = modeMap(src, mode);
    const fails: string[] = [];
    for (const p of pairs) {
      const bg = solid(map, ...p.bg);
      const fg = solid(map, ...p.fg, ...p.bg);
      const w = wcagRatio(fg, bg) as number;
      const a = apcaLc(fg, bg) as number;
      if (w < p.wcag || a < p.apca) fails.push(`${p.fg.join('+')} on ${p.bg.join(' over ')}: ${w.toFixed(2)}:1 (min ${p.wcag}), Lc ${a.toFixed(0)} (min ${p.apca}) — ${p.why}`);
    }
    assert.deepEqual(fails, []);
  });
}
