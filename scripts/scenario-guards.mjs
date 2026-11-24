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
  await page.waitForLoadState('networkidle'); await page.locator('main h1').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('main')?.innerText.includes('در حال بار شدن')); await settled(page);
};
const radio = async (page, name) => {
  const r = page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first();
  await r.evaluate((n) => n.click());
  await page.waitForFunction((el) => el.getAttribute('aria-checked') === 'true', await r.elementHandle());
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
          const pinned = (parseFloat(s.getPropertyValue('--pin-top')) || 0) + (parseFloat(s.getPropertyValue('--pin-sub')) || 0);
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
    await page.getByRole('button', { name: /^رفتن به بخش / }).first().click();
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
      const t = page.getByRole('tab', { name: /^به‌روز نیست/ });
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
