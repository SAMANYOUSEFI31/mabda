#!/usr/bin/env node
/**
 * Regression guards (docs/ux/decisions.md §۵۳): each UX point that was decided by principle gets an executable check, so a later
 * change cannot quietly undo it (Home's «جزئیات بیشتر» did, between #92 and #95). REAL server + temp SQLite, the sample space.
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-guards.mjs
 * A guard that fails names the decision it protects.
 *
 * What a guard is NOT (user, 2026-11-20; decisions.md «قاعدهٔ این دفتر»): a lock. Each guard checks the GOAL or invariant of a
 * decision (what comes last, what opens where, that pages share one frame), never incidental pixels or today's implementation; the
 * numbers below are tolerances of that goal. A red guard means «this decision is being changed»: update its § row in the ledger with
 * the reason, then update the guard. It never means «revert». Audits judge a decision on principle; that it has a guard is no
 * argument for keeping it.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// no fixed sleeps between steps: each step waits for the state it needs (a selected tab, a scroll that landed, an attribute), so a
// slow machine is slower, never red. `settled` = two frames, for layout that follows a state change (scroll spies run in a frame).
const settled = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
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
const nav = async (page, name) => {
  await page.evaluate((n) => { const bs = [...document.querySelectorAll('nav button')].filter((b) => b.textContent.includes(n)); (bs.find((b) => b.offsetParent) ?? bs[0])?.click(); }, name);
  await page.waitForFunction((n) => [...document.querySelectorAll('nav button[aria-current=page]')].some((b) => b.textContent.includes(n)), name);
  // the bar answers on the press; the page itself arrives when it is built (a transition, src/ui/pageTransition.ts): wait for its title
  await page.waitForFunction((n) => (document.querySelector('main h1')?.textContent ?? '').startsWith(`${n}:`), name);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('main')?.innerText.includes('در حال بار شدن')); await settled(page);
};
const radio = async (page, name) => {
  const r = page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first();
  await r.evaluate((n) => n.click());
  await page.waitForFunction((el) => el.getAttribute('aria-checked') === 'true', await r.elementHandle());
  // the key answers on the press; the view arrives when it is built (a transition): wait until no transition is still pending
  await page.waitForFunction(() => !document.querySelector('main .mb-seg[data-pending]'));
  await page.waitForLoadState('networkidle'); await settled(page);
};
/** scroll and wait until the page is really there (a pinned header or a lazy section can move it) */
const scrollTo = async (page, y) => { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForFunction((v) => Math.abs(scrollY - Math.min(v, document.scrollingElement.scrollHeight - innerHeight)) < 2, y); await settled(page); };
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
  for (const width of [768, 1280, 1920]) {
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
  for (const width of [390, 768, 1280]) {
    const { ctx, page } = await open(width);
    await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'ساختار');
    await guard(`[${width}] «فهرست / اکنون» is pinned over the whole structure`, async () => {
      await page.locator('[data-testid=structure-outline]').waitFor({ timeout: 3000 });
      await scrollTo(page, 2400);
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

  step('§۵۳ ۵ · Document outline: «اکنون» is the section being read (the upper part of the readable window), and stays in the outline\'s view');
  {
    // the goal, not today's formula: the lit section is one the reader is in — it covers a point in the upper half of the window
    // under the pinned bars (at the very end of the page, any section whose heading is on screen, so the last one can be reached)
    const { ctx, page } = await open(1280, 900);
    await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'سند');
    const all = page.locator('[role=tablist][aria-label="بخش‌های سند"] [role=tab]', { hasText: 'کل سند' });
    await all.click(); await page.waitForFunction((el) => el.getAttribute('aria-selected') === 'true', await all.elementHandle()); await settled(page);
    for (const y of [1200, 2600, 4000]) {
      await scrollTo(page, y);
      await guard(`[1280 @${y}] the lit outline item is the section being read`, async () => {
        const read = () => page.evaluate(() => {
          const s = getComputedStyle(document.documentElement);
          const pinned = (parseFloat(s.getPropertyValue('--sticky-top')) || 0) + (parseFloat(s.getPropertyValue('--sticky-secondary')) || 0);
          const el = document.scrollingElement; const atEnd = el.scrollTop >= el.scrollHeight - innerHeight - 2;
          const nav = document.querySelector('nav.doc-outline'); const cur = nav.querySelector('[aria-current=location]');
          const ids = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href').slice(1));
          const i = ids.indexOf(cur.getAttribute('href').slice(1));
          const top = document.getElementById(ids[i])?.getBoundingClientRect().top ?? 0;
          const next = i + 1 < ids.length ? document.getElementById(ids[i + 1])?.getBoundingClientRect().top ?? Infinity : Infinity;
          const upper = pinned + (innerHeight - pinned) / 2;
          const reading = (top <= upper && next > pinned) || (atEnd && top < innerHeight);
          const n = nav.getBoundingClientRect(), c = cur.getBoundingClientRect();
          return { reading, at: `${ids[i]} ${Math.round(top)}..${Math.round(next)} (window ${Math.round(pinned)}..${Math.round(upper)})`, inView: c.top >= n.top - 1 && c.bottom <= n.bottom + 1 };
        });
        // the spy may take a frame or two after the scroll: wait for it, but never for a fixed time
        let r = await read();
        for (let k = 0; k < 10 && !r.reading; k++) { await settled(page); r = await read(); }
        assert.ok(r.reading, `the lit section is not the one being read: ${r.at}`);
        assert.ok(r.inView, 'the lit item is visible inside the outline');
      });
    }
    await ctx.close();
  }

  step('§۵۳ ۸ · Canvas full screen on a phone: one row at the top with a named way out');
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const { ctx, page } = await open(w, h);
    await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'نمای کلی');
    const root = page.locator('[data-testid=canvas-root]');
    await root.waitFor();
    await page.locator('#canvas-fs').evaluate((b) => b.click());
    await page.waitForFunction((el) => el.getAttribute('data-fullscreen') === 'true', await root.elementHandle()); await settled(page);
    await guard(`[${w}×${h}] the bar is one row at the top, the board fits the window, and «بستن» leaves`, async () => {
      const r = await page.locator('[data-testid=canvas-toolbar]').evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, h: b.height }; });
      assert.ok(r.top < 24 && r.h <= 56, `bar at ${r.top}, ${r.h}px tall`);
      assert.equal((await page.locator('#canvas-fs').innerText()).trim(), 'بستن');
      const st = await page.locator('[data-testid=canvas-stage]').evaluate((e) => e.getBoundingClientRect().bottom);
      assert.ok(st <= h + 1, `the board ends at ${Math.round(st)}px, below the ${h}px window: part of it is unreachable`);
      await page.locator('#canvas-fs').click();
      await page.waitForFunction((el) => el.getAttribute('data-fullscreen') === 'false', await root.elementHandle(), { timeout: 3000 });
    });
    await ctx.close();
  }

  step('1B-2.3 · the phone\'s back leaves the canvas full screen first, not the page');
  {
    const { ctx, page } = await open(390, 844);
    await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'نمای کلی');
    const root = page.locator('[data-testid=canvas-root]');
    await root.waitFor();
    await guard('[390] back closes the full screen and stays on the canvas; «بستن» leaves no extra step', async () => {
      const before = await page.evaluate(() => history.length);
      await page.locator('#canvas-fs').evaluate((b) => b.click());
      await page.waitForFunction((el) => el.getAttribute('data-fullscreen') === 'true', await root.elementHandle());
      await page.goBack();
      await page.waitForFunction((el) => el.getAttribute('data-fullscreen') === 'false', await root.elementHandle(), { timeout: 3000 });
      assert.ok(await root.isVisible(), 'back left the canvas view');
      await page.locator('#canvas-fs').evaluate((b) => b.click());
      await page.waitForFunction((el) => el.getAttribute('data-fullscreen') === 'true', await root.elementHandle());
      await page.locator('#canvas-fs').click();
      await page.waitForFunction((el) => el.getAttribute('data-fullscreen') === 'false', await root.elementHandle(), { timeout: 3000 });
      await page.waitForFunction(() => !history.state?.canvasFs, null, { timeout: 3000 });
      assert.ok((await page.evaluate(() => history.length)) <= before + 1, 'each visit to the full screen must not pile up a step');
    });
    await ctx.close();
  }

  step('2C-6.6 · the phone\'s back closes the open dialog first, not the page (platform standard)');
  {
    const { ctx, page } = await open(390, 844);
    await sample(page);
    await nav(page, 'حقیقت');
    const dlg = page.getByRole('dialog', { name: 'اسکلت شروع' });
    const openIt = async () => { await page.getByRole('button', { name: 'کارهای دیگر حقیقت' }).click(); await page.getByRole('menuitem', { name: 'اسکلت شروع و قالب‌ها' }).click(); await dlg.waitFor({ timeout: 3000 }); };
    await guard('[390] back closes the dialog and stays on the page; × leaves no extra step', async () => {
      const url = page.url();
      const before = await page.evaluate(() => history.length);
      await openIt();
      await page.goBack();
      await dlg.waitFor({ state: 'detached', timeout: 3000 });
      assert.equal(page.url(), url, 'back left the page');
      assert.ok(await page.getByRole('button', { name: 'کارهای دیگر حقیقت' }).isVisible(), 'back left «حقیقت»');
      await openIt();
      await dlg.getByRole('button', { name: 'بستن' }).first().click();
      await dlg.waitFor({ state: 'detached', timeout: 3000 });
      await page.waitForFunction(() => !history.state?.mbOverlay, null, { timeout: 3000 });
      assert.ok((await page.evaluate(() => history.length)) <= before + 1, 'each dialog must not pile up a step');
    });
    await ctx.close();
  }

  step('1B-1.1 · inside a section, a tab of «سند» keeps the section in the address and the history');
  {
    const { ctx, page } = await open(1280);
    await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'ساختار');
    const id = await page.locator('h3[id^=node-]').first().evaluate((h) => h.id.slice('node-'.length));
    await (async (pg) => { const b = pg.locator('main').getByRole('button', { name: /^رفتن به بخش/ }).locator('visible=true').first(); if (await b.count()) return b.click(); await pg.locator('main').getByRole('button', { name: /^عملیات بخش / }).locator('visible=true').first().click(); return pg.getByRole('menuitem', { name: 'رفتن به بخش' }).first().click(); })(page); // a phone folds it into the section's «⋯»
    await page.locator('[data-testid=focused-section]').waitFor();
    await radio(page, 'سند');
    await guard('[1280] changing the document tab keeps #node= and the entry\'s state', async () => {
      const tabs = page.locator('[role=tab]');
      await tabs.first().waitFor(); // the document view loads on first use
      const n = await tabs.count();
      assert.ok(n > 1, 'the document has tabs');
      assert.equal(await page.evaluate(() => location.hash), `#node=${encodeURIComponent(id)}`, 'setup: in the section before the tab change');
      const other = (await tabs.nth(0).getAttribute('aria-selected')) === 'true' ? tabs.nth(1) : tabs.nth(0);
      await other.click(); await settled(page);
      const at = await page.evaluate(() => ({ hash: location.hash, node: history.state?.node }));
      assert.equal(at.hash, `#node=${encodeURIComponent(id)}`, `the address lost the section: ${at.hash}`);
      assert.equal(at.node, id, 'the history entry lost the section (back would not climb)');
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
    await bp.locator('button[form=context-detail-form]').click();
    await guard('the second tab\'s dialog stays open with its text and says so', async () => {
      await bp.getByText('ذخیره نشد؛ متن تو همین‌جا مانده است').waitFor({ timeout: 5000 });
      assert.equal(await bp.locator('#context-content').inputValue(), 'متن تب دوم که نباید گم شود');
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

  step('§۵۴ ۱۳ · the scrubber: one part per MAIN section (goal: a calm line that says «section k of n»), nothing after the content');
  {
    const { ctx, page } = await open(390); await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'ساختار');
    await guard('[390] structure: parts = main sections', async () => {
      await page.locator('[data-testid=section-scrubber]').waitFor({ timeout: 3000 });
      const parts = await page.locator('[data-testid=section-scrubber] [data-part]').count();
      const main = await page.locator('[data-testid=section-scrubber]').getAttribute('aria-valuemax');
      const menuMain = await page.evaluate(() => document.querySelectorAll('#structure-tree > section, #structure-tree > * > section').length);
      assert.equal(String(parts), main);
      assert.ok(parts > 0 && parts <= Math.max(menuMain, 12), `${parts} parts`);
    });
    await ctx.close();
  }

  step('§۵۴ ۱۴ · the files list is an occasional task: opened from «⋯ › فایل‌ها», never a tail under the page');
  {
    const { ctx, page } = await open(1280); await sample(page);
    await nav(page, 'حقیقت');
    await guard('no files list on the page; ⋯ › فایل‌ها opens it beside the page', async () => {
      assert.equal(await page.locator('main #source-files').count(), 0);
      await page.getByRole('button', { name: 'کارهای دیگر حقیقت' }).click();
      const item = page.getByRole('menuitem', { name: /^فایل‌ها/ });
      if (await item.count()) { await item.click(); await page.getByRole('dialog', { name: /فایل‌ها/ }).waitFor({ timeout: 3000 }); }
      else await page.keyboard.press('Escape');
    });
    await ctx.close();
  }

  step('§۵۴ ۱۵ · selecting thoughts is not a mode: one tick shows what can be done with them');
  for (const width of [390, 1280]) {
    const { ctx, page } = await open(width); await sample(page);
    await nav(page, 'فکر');
    await guard(`[${width}] a tick on an open thought shows the actions, and «لغو انتخاب» clears`, async () => {
      const box = page.getByRole('checkbox', { name: /^انتخاب فکر/ }).first();
      const hit = await box.evaluate((b) => { const r = b.closest('label').getBoundingClientRect(); return Math.min(r.width, r.height); });
      assert.ok(hit >= 44, `the box's hit area is ${hit}px, under the 44px touch floor`);
      await box.evaluate((b) => b.click());
      await page.getByLabel('عملیات فکرهای انتخاب‌شده').waitFor({ timeout: 2000 });
      await page.getByRole('button', { name: 'لغو انتخاب' }).click();
      assert.equal(await page.getByLabel('عملیات فکرهای انتخاب‌شده').count(), 0);
    });
    await ctx.close();
  }

  step('Context Replay (the product\'s core loop) · an output whose truth changes says «به‌روز نیست»');
  {
    // the goal only: after a truth an output was built from changes, the outputs page counts that output as not up to date. How it
    // is shown (a tab, a badge) is free; which output and truth are picked comes from the data, not from fixed ids.
    const { ctx, page } = await open(1280); await sample(page);
    const staleCount = async () => {
      await nav(page, 'خروجی‌ها');
      const t = page.getByRole('heading', { name: /^به‌روز نیست/ });
      if (!(await t.count())) return 0;
      return Number((await t.first().innerText()).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, ''));
    };
    await guard('editing a truth an up-to-date output used makes one more output «به‌روز نیست»', async () => {
      const before = await staleCount();
      const edited = await page.evaluate(async () => {
        const headers = { 'Content-Type': 'application/json', 'x-mabda-user': localStorage.getItem('mabda_user_id') };
        const get = async (u) => (await fetch(`/api${u}`, { headers })).json();
        const ws = (await get('/workspaces')).workspaces.find((w) => w.name === 'قهوهٔ تخصصی آنلاین');
        const st = await get(`/workspaces/${ws.id}/state`);
        const stale = new Set(st.stale.map((x) => x.deliverableId));
        for (const d of st.deliverables) {
          if (d.archivedAt || stale.has(d.id)) continue;
          const u = (d.usedContext ?? []).find((r) => st.objects.some((o) => o.id === r.id && o.version === r.version && o.status === 'Confirmed'));
          if (!u) continue;
          const o = st.objects.find((x) => x.id === u.id);
          const r = await fetch(`/api/workspaces/${ws.id}/objects/${o.id}`, { method: 'PATCH', headers, body: JSON.stringify({ content: `${o.content}\n(بازبینی نگهبان)` }) });
          return r.ok ? o.title : `PATCH ${r.status}`;
        }
        return 'no up-to-date output with a confirmed truth in the sample';
      });
      assert.ok(!/^(PATCH|no )/.test(edited), edited);
      // a fresh load reads the server again (and may open another space first: go back to the sample without rebuilding it)
      await page.reload({ waitUntil: 'networkidle' }); await page.getByText(/^خانه: /).waitFor();
      if (!(await page.getByText('خانه: قهوهٔ تخصصی آنلاین').count())) { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name: /قهوهٔ تخصصی آنلاین/ }).first().click(); await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor(); }
      const after = await staleCount();
      assert.ok(after > before, `«${edited}» changed, but the outputs page still counts ${after} (was ${before})`);
    });
    await ctx.close();
  }

  step('§۵۵ ۶ · an unsent quick-capture draft belongs to its space: it never shows up in another, and waits in its own');
  {
    const { ctx, page } = await open(1280); await sample(page);
    const goTo = async (name) => {
      await page.getByRole('button', { name: /^فضا: / }).first().click();
      await page.getByRole('menuitem', { name: new RegExp(name) }).first().click();
      await page.getByText(`خانه: ${name}`).waitFor(); await page.waitForLoadState('networkidle'); await settled(page);
    };
    const capture = async () => { await page.keyboard.press('Control+KeyJ'); const t = page.getByRole('dialog').locator('textarea').first(); await t.waitFor(); return t; };
    // Ctrl+J again closes it (the draft stays: closing never loses it)
    const close = async () => { await page.keyboard.press('Control+KeyJ'); await page.getByRole('dialog').waitFor({ state: 'detached' }); };
    await guard('a draft typed in the sample is not in another space, and is back in the sample', async () => {
      const other = await page.evaluate(async () => {
        const headers = { 'x-mabda-user': localStorage.getItem('mabda_user_id') };
        return (await (await fetch('/api/workspaces', { headers })).json()).workspaces.map((w) => w.name).find((n) => n !== 'قهوهٔ تخصصی آنلاین');
      });
      assert.ok(other, 'needs a second space');
      const draft = 'فکر نیمه‌کارهٔ فضای نمونه';
      await (await capture()).fill(draft); await close();
      await goTo(other);
      assert.equal(await (await capture()).inputValue(), '', `the sample's draft showed up in «${other}»`);
      await close();
      await goTo('قهوهٔ تخصصی آنلاین');
      assert.equal(await (await capture()).inputValue(), draft, 'the draft did not wait in its own space');
      await close();
    });
    await ctx.close();
  }

  step('Session replay privacy (docs/test-data.md §Clarity) · with the replay mask on, nothing a person wrote is readable');
  {
    // The rule Clarity applies (clarity-js 0.8, layout/dom.ts + core/scrub.ts), emulated over the real screens of the sample:
    // a text node is sent as it is only under the nearest `data-clarity-unmask` (a nearer `data-clarity-mask` wins); an
    // attribute is sent as it is unless it is dropped (title, alt, aria-label, …) or scrubbed (data-*, value, placeholder,
    // href, src under a mask); inputs are never sent. «A person's words» = every Persian string the API sent this page.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
    await ctx.addInitScript(() => {
      const mask = () => document.documentElement?.setAttribute('data-clarity-mask', 'True');
      if (document.documentElement) mask(); else new MutationObserver((_, o) => { if (document.documentElement) { mask(); o.disconnect(); } }).observe(document, { childList: true });
      const seen = new Set();
      window.__personWords = seen;
      const walk = (v) => { if (typeof v === 'string') { const t = v.trim(); if (t.length >= 4 && /[؀-ۿ]/.test(t)) seen.add(t); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
      const f = window.fetch.bind(window);
      window.fetch = async (...a) => { const r = await f(...a); try { if (String(a[0]).includes('/api/') && (r.headers.get('content-type') ?? '').includes('json')) r.clone().json().then(walk, () => {}); } catch { /* not json */ } return r; };
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await sample(page);
    const audit = () => page.evaluate(() => {
      const DROPPED = new Set(['title', 'alt', 'onload', 'onfocus', 'onerror', 'aria-label', 'integrity', 'crossorigin']);
      const SCRUBBED_UNDER_MASK = /^(data-.*|value|placeholder|href|src|srcset|class|style)$/;
      const open = (el) => { for (let n = el; n; n = n.parentElement) { if (n.hasAttribute('data-clarity-mask')) return false; if (n.hasAttribute('data-clarity-unmask')) return true; } return false; };
      const sent = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        const p = t.parentElement;
        if (!p || p.closest('input,textarea,select,script,style') || !t.data.trim()) continue;
        if (open(p)) sent.push(t.data.replace(/\s+/g, ' ').trim());
      }
      for (const el of document.body.querySelectorAll('*')) {
        const un = open(el);
        for (const a of el.attributes) {
          if (DROPPED.has(a.name) || (!un && SCRUBBED_UNDER_MASK.test(a.name)) || a.name.startsWith('data-clarity')) continue;
          if (/[؀-ۿ]/.test(a.value)) sent.push(`${a.name}=${a.value}`);
        }
      }
      const words = [...window.__personWords];
      const leaks = [];
      // a whole-word match: «یادداشت» (a label the server sends) inside the app's «یادداشت‌ها» is not a leak
      const letter = /[\p{L}\p{N}\u200c]/u;
      const within = (s, w) => { for (let i = s.indexOf(w); i >= 0; i = s.indexOf(w, i + 1)) if (!letter.test(s[i - 1] ?? ' ') && !letter.test(s[i + w.length] ?? ' ')) return true; return false; };
      for (const s of sent) for (const w of words) if (within(s, w) || (s.length >= 12 && within(w, s))) leaks.push(`«${w.slice(0, 40)}» in «${s.slice(0, 60)}»`);
      return { leaks: [...new Set(leaks)], readable: sent.length, words: words.length };
    });
    const check = async (where) => {
      await settled(page);
      const r = await audit();
      assert.ok(r.words > 20, `${where}: the sample's words were not seen (${r.words})`);
      assert.deepEqual(r.leaks, [], `${where}: a person's words would be readable in a replay: ${r.leaks.slice(0, 6).join(' | ')}`);
      return r;
    };
    await guard('[1280] Home, Thinking, Truth (document, structure, canvas), Outputs: only the app\'s words are readable', async () => {
      let readable = 0;
      for (const tab of ['خانه', 'فکر', 'حقیقت', 'خروجی‌ها']) {
        await nav(page, tab);
        readable += (await check(tab)).readable;
        if (tab === 'حقیقت') for (const view of ['سند', 'ساختار', 'بوم']) { if (await page.locator('[role=radio]').filter({ hasText: new RegExp(`^${view}$`) }).count()) { await radio(page, view); await check(`${tab} › ${view}`); } }
      }
      // the point of it: the app's own words ARE readable (buttons, navigation, titles)
      assert.ok(readable > 40, `too little is readable (${readable}): the app's own words should be`);
    });
    await guard('[1280] the add dialog, the space menu and the account menu: only the app\'s words', async () => {
      await nav(page, 'حقیقت');
      await page.getByRole('button', { name: 'افزودن' }).first().click();
      await page.getByRole('dialog').first().waitFor();
      await check('add dialog');
      await page.keyboard.press('Escape'); await settled(page);
      await page.getByRole('button', { name: /^فضا: / }).first().click();
      await page.getByRole('menu').first().waitFor();
      await check('space menu');
      await page.keyboard.press('Escape'); await settled(page);
      await page.getByRole('button', { name: /^حساب کاربری/ }).first().click();
      await page.getByRole('menu').first().waitFor();
      await check('account menu');
      await page.keyboard.press('Escape');
    });
    await ctx.close();
  }

  step('layout.md «چه چیزی بالا می‌ماند» · the app\'s bars stay on top of everything a page pins (goal: «خانه / حقیقت / …» and the top bar are always readable and tappable; a page bar sticks UNDER them)');
  for (const [w, h, rail] of [[390, 667, false], [390, 844, false], [1280, 900, true]]) {
    const { ctx, page } = await open(w, h);
    if (rail) { await page.evaluate(() => localStorage.setItem('mabda.sidebar', 'hidden')); await page.reload({ waitUntil: 'networkidle' }); await page.getByText(/^خانه: /).waitFor(); }
    await sample(page);
    const covered = () => page.evaluate(() => {
      const out = [];
      // by role and by name, so a bar that lost its pin mark is still checked
      const bars = [...new Set(document.querySelectorAll('[data-sticky=app], [data-sticky=app-bottom], .mb-bottomnav.is-fixed, [data-testid=rail-title]'))].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; });
      for (const bar of bars) {
        const r = bar.getBoundingClientRect();
        for (let x = r.left + 4; x < r.right - 4; x += 12) {
          const hit = document.elementFromPoint(x, r.top + r.height / 2);
          if (hit && !bar.contains(hit)) { out.push(`«${(hit.closest('[data-sticky]')?.dataset.testid || hit.className || hit.tagName).toString().slice(0, 40)}» over ${bar.dataset.sticky}`); break; }
        }
      }
      // a page's own bar, once stuck, sits under the top app bars, never on them
      const top = Math.max(0, ...bars.filter((b) => getComputedStyle(b).insetBlockStart === '0px' && b.getBoundingClientRect().top < 1).map((b) => b.getBoundingClientRect().bottom));
      for (const sub of document.querySelectorAll('[data-sticky=secondary]')) {
        const r = sub.getBoundingClientRect();
        if (r.height && getComputedStyle(sub).position === 'sticky' && r.top < top - 1 && r.bottom > 0) out.push(`${sub.dataset.testid} sticks at ${Math.round(r.top)}, under the app bar's ${Math.round(top)}`);
      }
      return out;
    });
    await guard(`[${w}×${h}${rail ? ' rail' : ''}] Home, Thinking, Truth (structure, document), Outputs: nothing covers the app's bars, at the top and scrolled`, async () => {
      const found = [];
      // the first two screens in quarter-window steps (a page bar that has not stuck yet passes behind the bottom bar somewhere in
      // there, whatever the window's height), then deep in the page where the page bars are stuck
      const at = async (where) => {
        const { max, under } = await page.evaluate(() => ({
          max: document.documentElement.scrollHeight - innerHeight,
          // where each of the page's sticky things, still in the flow, would sit right behind the bottom bar
          under: [...document.querySelectorAll('main *')].filter((e) => getComputedStyle(e).position === 'sticky' && e.getBoundingClientRect().height > 0)
            .map((e) => Math.round(e.getBoundingClientRect().top + scrollY - innerHeight + 30)),
        }));
        const ys = [...new Set([0, 0.5, 1, 1.5, 2].map((k) => Math.round(k * h)).concat(under, Math.round(max * 0.6)).map((y) => Math.max(0, Math.min(max, y))))];
        for (const y of ys) {
          await page.evaluate((v) => window.scrollTo(0, v), y);
          // a page bar moving to its new place (a bar above came or went) is judged where it lands, not on the way
          const landed = () => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => {}))));
          await settled(page); await settled(page); await landed(); await settled(page); await landed();
          for (const p of await covered()) found.push(`${where} @${y}: ${p}`);
        }
      };
      for (const tab of ['خانه', 'فکر', 'حقیقت', 'خروجی‌ها']) {
        await nav(page, tab);
        if (tab === 'حقیقت') for (const view of ['ساختار', 'سند']) { await radio(page, view); await at(`${tab} › ${view}`); }
        else await at(tab);
      }
      const uniq = [...new Set(found.map((f) => f.replace(/ @\d+:/, ':')))];
      assert.deepEqual(uniq, [], uniq.join(' | '));
    });
    await ctx.close();
  }

  step('layout.md «چه چیزی بالا می‌ماند» · the phone\'s top bar steps aside while reading down and is back on the first move up (goal: reading height; the space and search one small scroll away)');
  {
    const { ctx, page } = await open(390, 740); await sample(page);
    await nav(page, 'حقیقت'); await radio(page, 'ساختار');
    const read = () => page.evaluate(() => ({ away: document.querySelector('header[data-sticky=app]').hasAttribute('data-away'), bar: Math.round(document.querySelector('header[data-sticky=app]').getBoundingClientRect().bottom), outline: Math.round(document.querySelector('[data-testid=structure-outline]').getBoundingClientRect().top) }));
    await guard('[390×740] down: the top bar is away and «فهرست» takes its place; up: the bar is back and «فهرست» is under it', async () => {
      await page.mouse.wheel(0, 1400);
      await page.waitForFunction(() => document.querySelector('header[data-sticky=app]')?.hasAttribute('data-away'));
      await page.waitForTimeout(400); // the bars travel together for duration-base
      let r = await read();
      assert.ok(r.bar <= 0 && r.outline === 0, `down: bar ends at ${r.bar}, «فهرست» at ${r.outline}`);
      await page.mouse.wheel(0, -120);
      await page.waitForFunction(() => !document.querySelector('header[data-sticky=app]')?.hasAttribute('data-away'));
      await page.waitForTimeout(400);
      r = await read();
      assert.ok(r.bar > 40 && Math.abs(r.outline - r.bar) <= 1, `up: bar ends at ${r.bar}, «فهرست» at ${r.outline}`);
    });
    await ctx.close();
  }

  step('motion.md «رفتن بین صفحه‌ها»، «قطع و ادامه»، «علت پیش از نتیجه» · audit round 4 (goal: a press answers within 100ms, a view never blanks behind «loading», a page she comes back to is where she left it, a press on «تأیید» shows at once and a refusal puts it back)');
  {
    const { ctx, page } = await open(390); await sample(page);
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500); // pages and views load ahead while idle (warmChunks)
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // a mid-range phone
    await guard('[390, CPU ×4] the bottom bar marks «حقیقت» on the press (≤150ms in the dev build), before the page is built', async () => {
      const r = await page.evaluate(() => new Promise((done) => {
        const b = [...document.querySelectorAll('nav[aria-label="منوی پایینی موبایل"] button')].find((x) => x.textContent.includes('حقیقت'));
        const t0 = performance.now(); let marked = null; let page = null;
        b.click();
        const tick = () => {
          const t = performance.now() - t0;
          if (marked === null && b.getAttribute('aria-current') === 'page') marked = t;
          if (page === null && (document.querySelector('main h1')?.textContent ?? '').startsWith('حقیقت:')) page = t;
          if ((marked === null || page === null) && t < 4000) requestAnimationFrame(tick); else done({ marked, page });
        };
        requestAnimationFrame(tick);
      }));
      // the goal is 100ms (motion.md «پاسخ به لمس زیر ۱۰۰»; the production build measured 24ms at ×4). This server runs React's development
      // build, about twice as slow, on a machine that may be busy: the tolerance is 150, the order below is the real invariant
      assert.ok(r.marked !== null && r.marked <= 150, `marked after ${Math.round(r.marked)}ms`);
      assert.ok(r.page !== null && r.marked <= r.page, `the page (${Math.round(r.page)}ms) came before the mark (${Math.round(r.marked)}ms)`);
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.waitForFunction(() => (document.querySelector('main h1')?.textContent ?? '').startsWith('حقیقت:'));
    await guard('[390] the views of «حقیقت» and «فکر», each opened for the first time: no frame with «در حال بار شدن» and never an empty page', async () => {
      const watch = (label) => page.evaluate((label) => new Promise((done) => {
        const btn = [...document.querySelectorAll('main .mb-seg [role=radio]')].find((x) => x.textContent.trim() === label);
        const t0 = performance.now(); let blank = 0;
        btn.click();
        const tick = () => {
          const m = document.querySelector('main');
          if (/در حال بار شدن/.test(m.innerText) || m.innerText.trim().length < 80) blank++;
          if (performance.now() - t0 < 900) requestAnimationFrame(tick); else done(blank);
        };
        requestAnimationFrame(tick);
      }), label);
      for (const v of ['سند', 'جدول', 'نمای کلی', 'ساختار']) assert.equal(await watch(v), 0, `«${v}»: frames with a placeholder or a blank page`);
      await nav(page, 'فکر');
      for (const v of ['بوم', 'فهرست']) assert.equal(await watch(v), 0, `«${v}»: frames with a placeholder or a blank page`);
    });
    await guard('[390] a page she comes back to from the bar opens where she left it; pressing the page she is on takes her to its top', async () => {
      await scrollTo(page, 900);
      await nav(page, 'حقیقت'); await nav(page, 'فکر');
      await page.waitForFunction(() => Math.abs(scrollY - 900) < 3, null, { timeout: 2000 }).catch(() => {});
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - 900) < 3, `back on «فکر» at ${await page.evaluate(() => scrollY)}, left at 900`);
      await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="منوی پایینی موبایل"] button')].find((x) => x.textContent.includes('فکر')).click());
      await page.waitForFunction(() => scrollY < 2, null, { timeout: 3000 });
    });
    await ctx.close();
  }
  {
    const { ctx, page } = await open(1280); await sample(page);
    await nav(page, 'فکر');
    await guard('[1280] «تأیید» shows on the press; when the server refuses, the item is back and the reason is shown', async () => {
      const approve = page.locator('main button', { hasText: /^تأیید$/ });
      const before = await approve.count();
      assert.ok(before > 0, 'no proposal to approve in the sample');
      await page.route(/\/objects\/[^/]+$/, (r) => (['PATCH', 'PUT'].includes(r.request().method()) ? wait(500).then(() => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'guard', message: 'سرور این بار نپذیرفت (آزمون)' } }) })) : r.continue()));
      await approve.first().evaluate((b) => b.click());
      // shown = the row is decided on the press: its dot settles and the row goes inert while it leaves (motion.md «تأیید»)
      await page.waitForFunction((n) => [...document.querySelectorAll('main button')].filter((b) => b.textContent.trim() === 'تأیید' && !b.closest('[inert]')).length === n - 1, before, { timeout: 300 });
      await page.getByText('سرور این بار نپذیرفت (آزمون)').first().waitFor({ timeout: 3000 });
      await page.waitForFunction((n) => [...document.querySelectorAll('main button')].filter((b) => b.textContent.trim() === 'تأیید' && !b.closest('[inert]')).length === n, before, { timeout: 2000 });
      await page.unroute(/\/objects\/[^/]+$/);
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
