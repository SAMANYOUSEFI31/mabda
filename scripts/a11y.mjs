/**
 * Accessibility audit (accessibility.md, implementation-plan 5.2): axe-core on every main path, light and dark, phone and desk,
 * plus the page's own structure (one h1, no skipped heading level, a skip link that lands on main). Zero findings is the bar.
 *   node scripts/a11y.mjs [base]       (CHROMIUM_PATH, SIZES=390,1280, SCHEMES=light,dark)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.argv[2] || 'http://localhost:3100';
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const SIZES = (process.env.SIZES || '390,1280').split(',').map(Number);
const SCHEMES = (process.env.SCHEMES || 'light,dark').split(',');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const found = new Map();
const note = (where, list) => { for (const l of list) { const k = l.replace(/\s+\(\d+\)$/, ''); if (!found.has(k)) found.set(k, []); found.get(k).push(where); } };

for (const width of SIZES) for (const scheme of SCHEMES) {
  const phone = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'fa-IR', colorScheme: scheme, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const tag = `${width} ${scheme}`;
  const audit = async (where) => {
    await page.waitForTimeout(500);
    const res = await page.evaluate(async (src) => {
      if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s); }
      const r = await window.axe.run(document, { resultTypes: ['violations'], rules: { region: { enabled: true } } });
      return r.violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} ${n.html.slice(0, 90)}`).join(' | ')} (${v.nodes.length})`);
    }, AXE);
    // the page's own structure: one h1 in the open view, no level skipped going down
    const own = await page.evaluate(() => {
      const scope = document.querySelector('.mb-dialog-layer:not([data-state=closed]) [role=dialog]') || document;
      const hs = [...scope.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => h.getClientRects().length && !h.closest('[aria-hidden=true],[inert]'));
      const out = []; const h1 = hs.filter((h) => h.tagName === 'H1').length;
      if (scope === document && h1 !== 1) out.push(`structure: ${h1} h1`);
      let prev = scope === document ? 0 : 1;
      for (const h of hs) { const l = +h.tagName[1]; if (prev && l > prev + 1) out.push(`structure: h${prev} → h${l} «${h.textContent.trim().slice(0, 24)}»`); prev = l; }
      return out;
    });
    note(`${tag} ${where}`, [...res, ...own]);
  };
  const tab = async (name) => { const t = page.locator(phone ? 'nav[aria-label] >> visible=true' : 'aside nav').getByRole('button', { name, exact: false }).first(); await t.click().catch(() => {}); await page.waitForTimeout(900); };
  await audit('home');
  // skip link: the first Tab shows it and Enter lands focus in main
  await page.keyboard.press('Tab');
  const skip = await page.evaluate(() => { const a = document.activeElement; return a?.matches('a[href="#main"], .mb-skip') ? a.textContent.trim() : null; });
  if (!skip) note(`${tag} home`, ['skip link: first Tab is not «پرش به محتوا»']);
  else { await page.keyboard.press('Enter'); await page.waitForTimeout(200); const ok = await page.evaluate(() => !!document.activeElement?.closest('main')); if (!ok) note(`${tag} home`, ['skip link: focus did not land in main']); }
  // keyboard path: the next 40 Tab stops each show a focus ring (WCAG 2.4.7) and sit on screen, not under a pinned bar (2.4.11)
  if (!phone) {
    const bad = new Set();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab'); await page.waitForTimeout(60);
      const r = await page.evaluate(() => {
        const a = document.activeElement; if (!a || a === document.body) return null;
        const cs = getComputedStyle(a), b = a.getBoundingClientRect();
        const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || a.matches(':has(:focus-visible)')
          || ['::after', '::before'].some((p) => { const c = getComputedStyle(a, p); return c.content !== 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor); });
        const name = `${a.tagName.toLowerCase()}«${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20)}»`;
        const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pin-top')) || 0;
        const fixed = cs.position === 'fixed' || a.closest('[data-pin], nav, aside, header');
        if (!ring) return `focus ring missing: ${name}`;
        if (!fixed && (b.bottom < top + 1 || b.top > innerHeight)) return `focus hidden off screen or under the bar: ${name}`;
        return null;
      });
      if (r) bad.add(r);
    }
    note(`${tag} home keyboard`, [...bad]);
  }
  for (const [name, where] of [['فکر', 'thinking'], ['منبع', 'context'], ['خروجی', 'assets']]) { await tab(name); await audit(where); }
  await tab('منبع');
  const table = page.getByRole('radio', { name: 'جدول' }).or(page.getByRole('tab', { name: 'جدول' })).first();
  if (await table.isVisible().catch(() => false)) { await table.click(); await audit('context table'); }
  await tab('خانه');
  await page.keyboard.press('Control+k'); await audit('search'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'افزودن' }).first().click().catch(() => {}); await audit('add');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await ctx.close();
}
await browser.close();
if (!found.size) { console.log('a11y: no findings'); process.exit(0); }
for (const [k, w] of found) console.log(`${k}\n    at ${w.slice(0, 4).join(', ')}${w.length > 4 ? ` +${w.length - 4}` : ''}`);
console.log(`a11y: ${found.size} findings`); process.exit(1);
