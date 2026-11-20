#!/usr/bin/env node
/**
 * Regression guards (docs/ux/decisions.md §۵۳): each UX point that was decided by principle gets an executable check, so a later
 * change cannot quietly undo it (Home's «جزئیات بیشتر» did, between #92 and #95). REAL server + temp SQLite, the sample space.
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-guards.mjs
 * A guard that fails names the decision it protects.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-guards-'));
const PORT = 3121;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const step = (m) => console.log('•', m);
const failures = [];
const guard = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { failures.push(name); console.log('  ✗', name, '\n   ', e.message.split('\n')[0]); } };

let browser;
const open = async (width, height) => {
  const mobile = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height: height ?? (mobile ? 844 : 900) }, locale: 'fa-IR', hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText(/^خانه: /).waitFor();
  return { ctx, page };
};
const sample = async (page) => {
  if (!(await page.getByText('خانه: قهوهٔ تخصصی آنلاین').count())) {
    await page.getByRole('button', { name: /^فضا: / }).first().click();
    await page.getByRole('menuitem', { name: 'بازسازی فضای نمونه' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click({ timeout: 1500 }).catch(() => {});
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
  }
  await page.locator('.mb-toast button').first().click({ timeout: 500 }).catch(() => {});
};
const nav = (page, name) => page.evaluate((n) => { const bs = [...document.querySelectorAll('nav button')].filter((b) => b.textContent.includes(n)); (bs.find((b) => b.offsetParent) ?? bs[0])?.click(); }, name).then(() => wait(500));
const radio = (page, name) => page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click()).then(() => wait(600));
const box = (page, sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right }; });

try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

  step('§۵۳ ۳ · Home: «جزئیات بیشتر» is the last thing; what it opens starts under it; nothing above it moves');
  for (const width of [390, 768, 1280]) {
    const { ctx, page } = await open(width);
    await sample(page);
    await guard(`[${width}] toggle after the margin; details under the toggle; «آخرین فکرها» stays put`, async () => {
      const margin = await page.getByText('آخرین فکرها').first().evaluate((e) => e.getBoundingClientRect().top + scrollY);
      const t = await box(page, '[data-testid=home-details-toggle]');
      const beside = await page.evaluate(() => !document.querySelector('.mb-home-margin'));
      if (!beside) assert.ok(margin < t.top, `the margin (${margin}) must come before the toggle (${t.top}) on a narrow page`);
      await page.locator('[data-testid=home-details-toggle] button').click();
      await page.locator('#home-all').waitFor();
      const d = await box(page, '#home-all');
      assert.ok(d.top >= t.bottom - 1, `details (${d.top}) start under the toggle (${t.bottom})`);
      if (!beside) assert.ok(d.top - t.bottom < 48, `details start right under the toggle (gap ${d.top - t.bottom})`);
      const margin2 = await page.getByText('آخرین فکرها').first().evaluate((e) => e.getBoundingClientRect().top + scrollY);
      assert.ok(Math.abs(margin2 - margin) < 2, `«آخرین فکرها» moved ${margin2 - margin}px when the details opened`);
    });
    await ctx.close();
  }

  step('§۵۳ ۹ · one page frame: every page header has the same two edges, centred in the main area');
  for (const width of [1280, 1920]) {
    const { ctx, page } = await open(width);
    await sample(page);
    const edges = {};
    for (const [tab, view] of [['خانه'], ['فکر'], ['حقیقت', 'سند'], ['حقیقت', 'ساختار'], ['خروجی‌ها']]) {
      await nav(page, tab); if (view) await radio(page, view);
      edges[tab + (view ?? '')] = await page.evaluate(() => { const f = document.querySelector('main h1').closest('.mb-page-frame').getBoundingClientRect(); const m = document.querySelector('main'); const cs = getComputedStyle(m); const mr = m.getBoundingClientRect(); return { l: Math.round(f.left), r: Math.round(f.right), gapL: Math.round(f.left - mr.left - parseFloat(cs.paddingLeft)), gapR: Math.round(mr.right - parseFloat(cs.paddingRight) - f.right) }; });
    }
    await guard(`[${width}] the same frame on Home, Thinking, Truth (document, structure) and Outputs, centred`, async () => {
      const all = Object.values(edges);
      for (const [k, e] of Object.entries(edges)) {
        assert.ok(Math.abs(e.l - all[0].l) <= 1 && Math.abs(e.r - all[0].r) <= 1, `${k}: ${e.l}..${e.r} vs ${all[0].l}..${all[0].r}`);
        assert.ok(Math.abs(e.gapL - e.gapR) <= 2, `${k} is not centred (${e.gapL} / ${e.gapR})`);
      }
    });
    await ctx.close();
  }

  step('§۵۳ ۶–۷ · Structure, whole tree: the outline bar shows in a one-root space, at every width, and names the path');
  for (const width of [390, 1280]) {
    const { ctx, page } = await open(width);
    await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'ساختار');
    await guard(`[${width}] «فهرست / اکنون» is pinned over the whole structure`, async () => {
      await page.locator('[data-testid=structure-outline]').waitFor({ timeout: 3000 });
      await page.evaluate(() => window.scrollTo(0, 2400)); await wait(500);
      const t = await page.locator('[data-testid=structure-outline]').evaluate((e) => ({ top: e.getBoundingClientRect().top, text: e.textContent }));
      assert.ok(t.top < 140, `pinned near the top (top ${t.top})`);
      assert.match(t.text, /اکنون: .+›/, `«اکنون» names a path: ${t.text}`);
    });
    await guard(`[${width}] «فهرست» lists every depth`, async () => {
      await page.locator('[data-testid=structure-outline] button', { hasText: 'فهرست' }).click();
      const n = await page.getByRole('menuitem').count();
      const sections = await page.locator('section h3[id^=node-]').count();
      assert.equal(n, sections, `menu ${n} vs sections ${sections}`);
      await page.keyboard.press('Escape');
    });
    await ctx.close();
  }

  step('§۵۳ ۵ · Document outline: «اکنون» is the section a quarter down the readable window, and stays in the outline\'s view');
  {
    const { ctx, page } = await open(1280, 900);
    await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'سند');
    await page.locator('[role=tablist][aria-label="بخش‌های سند"] [role=tab]', { hasText: 'کل سند' }).click(); await wait(500);
    for (const y of [1200, 2600, 4000]) {
      await page.evaluate((v) => window.scrollTo(0, v), y); await wait(400);
      await guard(`[1280 @${y}] the lit outline item is the last heading above the reading line`, async () => {
        const r = await page.evaluate(() => {
          const s = getComputedStyle(document.documentElement);
          const pinned = (parseFloat(s.getPropertyValue('--pin-top')) || 0) + (parseFloat(s.getPropertyValue('--pin-sub')) || 0);
          const el = document.scrollingElement; const H = innerHeight - pinned; const max = el.scrollHeight - innerHeight;
          const base = pinned + Math.max(12, H * 0.25); const start = Math.max(0, max - H); const t = max > start ? Math.min(1, Math.max(0, (el.scrollTop - start) / (max - start))) : 0;
          const line = base + (innerHeight - base) * t;
          const nav = document.querySelector('nav.doc-outline'); const cur = nav.querySelector('[aria-current=location]');
          const ids = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href').slice(1));
          let want = ids[0]; for (const id of ids) { const h = document.getElementById(id); if (h && h.getBoundingClientRect().top <= line) want = id; }
          const n = nav.getBoundingClientRect(), c = cur.getBoundingClientRect();
          return { want, got: cur.getAttribute('href').slice(1), inView: c.top >= n.top - 1 && c.bottom <= n.bottom + 1 };
        });
        assert.equal(r.got, r.want);
        assert.ok(r.inView, 'the lit item is visible inside the outline');
      });
    }
    await ctx.close();
  }

  step('§۵۳ ۸ · Canvas full screen on a phone: one row at the top with a named way out');
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const { ctx, page } = await open(w, h);
    await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'نمای کلی'); await wait(800);
    await page.locator('#canvas-fs').evaluate((b) => b.click()); await wait(700);
    await guard(`[${w}×${h}] the bar is one row at the top, the board fits the window, and «بستن» leaves`, async () => {
      const r = await page.locator('[data-testid=canvas-toolbar]').evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, h: b.height }; });
      assert.ok(r.top < 24 && r.h <= 56, `bar at ${r.top}, ${r.h}px tall`);
      assert.equal((await page.locator('#canvas-fs').innerText()).trim(), 'بستن');
      const st = await page.locator('[data-testid=canvas-stage]').evaluate((e) => e.getBoundingClientRect().bottom);
      assert.ok(st <= h + 1, `the board ends at ${Math.round(st)}px, below the ${h}px window: part of it is unreachable`);
      await page.locator('#canvas-fs').click(); await wait(500);
      assert.equal(await page.locator('[data-testid=canvas-root]').getAttribute('data-fullscreen'), 'false');
    });
    await ctx.close();
  }

  step('§۵۳ ۲ · an edit that loses to another tab keeps her text (409)');
  {
    const a = await open(1280); await sample(a.page);
    // a second tab of the same browser: the same person, the same space
    const bp = await a.ctx.newPage(); await bp.goto(BASE, { waitUntil: 'networkidle' }); await bp.getByText(/^خانه: /).waitFor();
    if (!(await bp.getByText('خانه: قهوهٔ تخصصی آنلاین').count())) { await bp.getByRole('button', { name: /^فضا: / }).first().click(); await bp.getByRole('menuitem', { name: /قهوهٔ تخصصی آنلاین/ }).first().click(); await bp.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor(); }
    for (const p of [a.page, bp]) { await nav(p, 'حقیقت'); await radio(p, 'ساختار'); await p.getByRole('button', { name: /لحن پاسخ به مشتری/ }).first().click(); await p.locator('#context-content').waitFor(); }
    await a.page.locator('#context-content').fill('متن تب اول');
    await a.page.locator('button[form=context-detail-form]').click();
    await a.page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
    await bp.locator('#context-content').fill('متن تب دوم که نباید گم شود');
    await bp.locator('button[form=context-detail-form]').click(); await wait(1200);
    await guard('the second tab\'s dialog stays open with its text and says so', async () => {
      assert.equal(await bp.locator('#context-content').inputValue(), 'متن تب دوم که نباید گم شود');
      await bp.getByText('ذخیره نشد؛ متن تو همین‌جا مانده است').waitFor({ timeout: 2000 });
    });
    await a.ctx.close();
  }

  step('§۵۳ ۱۱ · a saved template has a way back');
  {
    const { ctx, page } = await open(1280); await sample(page);
    await nav(page, 'حقیقت');
    await guard('Truth ⋯ opens «اسکلت شروع و قالب‌ها»', async () => {
      await page.getByRole('button', { name: 'کارهای دیگر حقیقت' }).click();
      await page.getByRole('menuitem', { name: 'اسکلت شروع و قالب‌ها' }).click();
      await page.getByRole('dialog', { name: 'اسکلت شروع' }).waitFor({ timeout: 3000 });
    });
    await ctx.close();
  }

  step('§۵۳ PWA · installable');
  await guard('manifest and icons are served', async () => {
    const m = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
    assert.equal(m.dir, 'rtl'); assert.equal(m.display, 'standalone');
    for (const i of m.icons) assert.equal((await fetch(BASE + i.src)).status, 200, i.src);
    assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
    assert.equal((await fetch(`${BASE}/sw.js`)).status, 200);
  });

  if (failures.length) { console.log(`== guards: ${failures.length} FAILED`); process.exitCode = 1; } else console.log('== guards: OK');
} finally {
  await browser?.close();
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
