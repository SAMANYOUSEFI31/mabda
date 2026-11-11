#!/usr/bin/env node
/**
 * Identity directions, tested on the real product (docs/ux/identity.md §2):
 * each direction is a set of overrides on the same DTCG source, built by the same pipeline (build.mjs) and injected into
 * the running app; then the home page of the sample workspace and the source-of-truth page are captured, light and dark.
 *
 * Usage: node scripts/tokens/directions.mjs [baseUrl]   (default http://localhost:3100; the server must be running)
 * Output: docs/ux/identity-directions/<direction>-<page>-<width>-<mode>.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { loadSources, buildTokensCss } from './build.mjs';

const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = 'docs/ux/identity-directions';
mkdirSync(OUT, { recursive: true });

const ok = (L, C, H) => ({ $value: { colorSpace: 'oklch', components: [L, C, H] } });
const NEUTRAL = [['0', 0.995], ['25', 0.985], ['50', 0.972], ['100', 0.952], ['150', 0.93], ['200', 0.905], ['300', 0.84], ['400', 0.72], ['500', 0.62], ['600', 0.53], ['700', 0.45], ['800', 0.37], ['850', 0.31], ['900', 0.27], ['925', 0.235], ['950', 0.205], ['975', 0.175], ['1000', 0.15]];
const HUE = [['50', 0.972, 0.12], ['100', 0.945, 0.25], ['200', 0.89, 0.42], ['300', 0.81, 0.62], ['400', 0.71, 0.85], ['500', 0.61, 1], ['600', 0.52, 1], ['700', 0.445, 0.9], ['800', 0.37, 0.75], ['900', 0.3, 0.58], ['950', 0.24, 0.45]];
const neutral = (h, c, page = (L) => L) => Object.fromEntries(NEUTRAL.map(([k, L]) => [k, ok(page(L), c, h)]));
const accent = (h, c) => Object.fromEntries(HUE.map(([k, L, f]) => [k, ok(L, +(c * f).toFixed(4), h)]));
const px = (n) => ({ $value: { value: n, unit: 'px' } });
const none = { $value: [{ color: '{color.ink.950}', alpha: 0, offsetX: '0px', offsetY: '0px', blur: '0px', spread: '0px' }] };

/** the chosen direction is the source itself (no overrides) */
const DIRECTIONS = {
  'a-paper': { title: 'الف. کاغذ دقیق (انتخاب‌شده)', primitive: {}, shared: {}, light: {}, dark: {} },
  'b-instrument': {
    title: 'ب. ابزار دقیق',
    // cool grey, a teal-green accent, square corners, no shadow at all: weight from precision and order
    primitive: { color: { ink: neutral(250, 0.008), lapis: accent(190, 0.11) } },
    shared: { radius: { xs: px(2), sm: px(3), md: px(4), lg: px(6), xl: px(8) }, type: { 'body-md': { $value: { fontFamily: '{font.family.sans}', fontSize: { value: 15, unit: 'px' }, fontWeight: 400, lineHeight: 1.7, letterSpacing: { value: 0, unit: 'em' } } } } },
    light: { shadow: { seated: none, raised: none }, border: { default: { $value: '{color.ink.950}', $extensions: { 'mabda.alpha': 0.2 } } } },
    dark: { shadow: { seated: none, raised: none }, border: { default: { $value: '{color.ink.25}', $extensions: { 'mabda.alpha': 0.18 } } } },
  },
  'c-quiet': {
    title: 'ج. سکوت و فضا',
    // pure neutral, white page, borderless sheets lifted by soft shadow, generous corners and space, a terracotta accent
    primitive: { color: { ink: neutral(0, 0, (L) => (L > 0.96 ? Math.min(1, L + 0.02) : L)), lapis: accent(40, 0.12) } },
    shared: { radius: { sm: px(10), md: px(12), lg: px(18), xl: px(24) }, inset: { lg: { $value: '{space.5}' }, xl: { $value: '{space.8}' } }, stack: { lg: { $value: '{space.8}' } }, type: { 'body-md': { $value: { fontFamily: '{font.family.sans}', fontSize: { value: 17, unit: 'px' }, fontWeight: 400, lineHeight: 1.95, letterSpacing: { value: 0, unit: 'em' } } } } },
    light: { surface: { page: { $value: '{color.ink.0}' }, raised: { $value: '{color.ink.0}' } }, border: { default: { $value: '{color.ink.950}', $extensions: { 'mabda.alpha': 0.05 } } }, shadow: { seated: { $value: [{ color: '{color.ink.950}', alpha: 0.06, offsetX: '0px', offsetY: '6px', blur: '24px', spread: '-6px' }] } } },
    dark: { border: { default: { $value: '{color.ink.25}', $extensions: { 'mabda.alpha': 0.05 } } }, shadow: { seated: { $value: [{ color: '{color.ink.1000}', alpha: 0.6, offsetX: '0px', offsetY: '8px', blur: '28px', spread: '-6px' }] } } },
  },
};

const merge = (a, b) => {
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(b) || '$value' in b) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? merge(a[k], v) : v;
  return out;
};

const base = loadSources();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
for (const [id, d] of Object.entries(DIRECTIONS)) {
  const src = { primitive: merge(base.primitive, d.primitive), shared: merge(base.shared, d.shared), light: merge(base.light, d.light), dark: merge(base.dark, d.dark), component: base.component };
  const css = buildTokensCss(src).replace(':root {', ':root:root {').replace(':root.dark {', ':root:root.dark {');
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'fa-IR' });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      // the sample workspace (made with «ساخت یا بازنشانی فضای نمونه» beforehand): a page with real content
      if (w < 768) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name: /\(نمونه\)/ }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name: /\(نمونه\)/ }).first().click(); }
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'بستن' }).first().click({ timeout: 800 }).catch(() => {});
      await page.addStyleTag({ content: css });
      await page.waitForTimeout(700);
      const nav = (label) => page.locator(w < 768 ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${label}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${label}")`).first().click();
      await nav('خانه'); await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${id}-home-${w}-${scheme}.png` });
      await nav(w < 768 ? 'منبع' : 'منبع حقیقت'); await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${id}-source-${w}-${scheme}.png` });
      await page.close();
    }
  }
  console.log(`${id}: ${d.title}`);
}
await browser.close();
