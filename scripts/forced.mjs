/**
 * Forced colours (Windows contrast themes, accessibility.md): wherever the app opts out of the system's colours
 * (forced-color-adjust:none — the current place, checked boxes, switches), its own text must still read against its own fill.
 * Light and dark system themes, phone bar, rail and sidebar. Zero findings is the bar.
 *   node scripts/forced.mjs [base]       (CHROMIUM_PATH, SIZES=390,1024,1280, SCHEMES=light,dark)
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3100';
const SIZES = (process.env.SIZES || '390,1024,1280').split(',').map(Number);
const SCHEMES = (process.env.SCHEMES || 'light,dark').split(',');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const out = [];

const measure = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true });
  const rgb = (c) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return d[3] === 0 ? null : [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, gg, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // what is drawn behind the text: each see-through fill laid over its parent's, down to the page's own canvas
  const base = rgb(getComputedStyle(document.documentElement).backgroundColor) || rgb('Canvas') || [255, 255, 255, 1];
  const fill = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c) { layers.push(c); if (c[3] >= 0.99) break; } }
    let acc = layers.length && layers.at(-1)[3] >= 0.99 ? layers.pop() : base;
    for (const c of layers.reverse()) acc = [0, 1, 2].map((i) => c[i] * c[3] + acc[i] * (1 - c[3]));
    return acc; };
  const found = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.forcedColorAdjust !== 'none' || el.closest('[inert], .mb-sr') || cs.visibility === 'hidden') continue;
    if (!el.getClientRects().length) continue;
    // an icon (the rail shows icons only) needs 3:1 against its fill (WCAG 1.4.11)
    if (el.tagName === 'svg') { const fg = rgb(cs.color); const r = fg && ratio(fg, fill(el)); if (r && r < 3) found.push(`icon ${r.toFixed(2)}:1 in ${el.closest('button, a')?.getAttribute('aria-label') || el.closest('button, a')?.textContent.trim().slice(0, 24) || 'svg'}`); continue; }
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data.trim()).join('');
    if (!text) continue;
    const fg = rgb(cs.color); if (!fg) continue;
    const r = ratio(fg, fill(el));
    if (r < 4.5) found.push(`«${text.slice(0, 24)}» ${r.toFixed(2)}:1 in ${el.closest('button, a, [role]')?.tagName.toLowerCase() || el.tagName.toLowerCase()}`);
  }
  return found;
};

for (const width of SIZES) for (const scheme of SCHEMES) {
  const phone = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'fa-IR', colorScheme: scheme, forcedColors: 'active', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  for (const f of await page.evaluate(measure)) out.push(`${width} ${scheme} forced: ${f}`);
  // the current place in a nested section too (the sidebar expands «منبع»)
  const src = page.locator('nav button:visible, .mb-bottomnav__item:visible').filter({ hasText: 'حقیقت' }).or(page.locator('nav button[aria-label^="حقیقت"]:visible')).first();
  if (await src.count()) { await src.click(); await page.waitForTimeout(900); for (const f of await page.evaluate(measure)) out.push(`${width} ${scheme} forced, «منبع»: ${f}`); }
  // the gallery shows it (gallery.py «state-forced»)
  await page.screenshot({ path: `docs/screens/state-forced-${width}${scheme === 'dark' ? '-dark' : ''}.png` });
  await ctx.close();
}
await browser.close();
for (const l of [...new Set(out)]) console.log(l);
console.log(out.length ? `forced colours: ${new Set(out).size} problem(s)` : 'forced colours: clean');
process.exit(out.length ? 1 : 0);
