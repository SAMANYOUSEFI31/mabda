#!/usr/bin/env node
/**
 * Code splitting on a REAL server (docs/architecture.md → «بار شدن تکه‌تکه»):
 *   1. the first screen does not wait for the heavy pages; pages and views load ahead once it is up (idle), dialogs only when opened;
 *   2. a page that cannot load (the network is cut for that one file) shows a clear message with «دوباره», never a blank page;
 *      after the network is back, «دوباره» brings the page;
 *   3. a dialog is loaded the first time it is opened.
 *   CHROMIUM_PATH=... WIDTHS=1280,390 node scripts/scenario-lazy.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-lazy-'));
let BASE = '';
const children = [];
const stopAll = () => { for (const c of children.splice(0)) { if (process.platform === 'win32') { try { spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } } else { try { process.kill(-c.pid); } catch { /* gone */ } } } };
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true, shell: process.platform === 'win32' }));
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const step = (m) => console.log('•', m);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of (process.env.WIDTHS ?? '1280,390').split(',').map(Number)) {
    const mobile = width < 768;
    await startServer(3200 + Math.floor(Math.random() * 600) * 2 + (mobile ? 1 : 0), `lazy-${width}`);
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const requested = [];
    page.on('request', (r) => { const m = /\/(?:components|app)\/(?:[a-z]+\/)?([A-Za-z]+)\.tsx/.exec(r.url()); if (m) requested.push(m[1]); });
    const click = (loc) => loc.evaluate((n) => n.click());
    const nav = (m, d) => click(page.locator(mobile ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`));

    // the thinking space cannot load in this run (step 2): blocked from the start, so loading it ahead (warmChunks) fails as well
    await page.route('**/components/thinking/ThinkingSpace.tsx*', (route) => route.abort('failed'));

    step(`[${width}] 1: the first screen does not wait for the heavy pages; they load only after it (idle), dialogs only when opened`);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByText(/^خانه: /).waitFor({ timeout: 20000 });
    const atFirstScreen = [...requested];
    for (const heavy of ['ContextCanvas', 'WeeklyReviewDialog', 'TruthCompareDialog', 'ContextDetailModal', 'WorkstreamStudio']) assert.ok(!atFirstScreen.includes(heavy), `${heavy} was requested before the first screen`);
    assert.ok(requested.includes('AppView') && requested.includes('HomePage'), 'the shell and the home are there');
    await page.waitForLoadState('networkidle');
    // pages and views load ahead while idle (src/app/lazy.tsx warmChunks: a view opens with no «loading» placeholder); dialogs never do
    for (const dialog of ['WeeklyReviewDialog', 'TruthCompareDialog', 'ContextDetailModal', 'ThoughtDialog']) assert.ok(!requested.includes(dialog), `${dialog} was loaded ahead`);
    assert.ok(!requested.includes('WorkstreamStudio'), 'the frozen studio is never loaded ahead');

    step(`[${width}] 2: a page that cannot load says so and offers «دوباره»`);
    await nav('فکر', 'فکر');
    const alert = page.getByRole('alert').filter({ hasText: 'این بخش بار نشد' });
    await alert.waitFor({ timeout: 10000 });
    assert.ok(await alert.getByRole('button', { name: 'دوباره' }).isVisible());
    assert.ok((await page.locator('body').innerText()).length > 50, 'not a blank page');
    await page.screenshot({ path: `docs/screens/lazy-${width}-1-failed.png` });
    await page.unroute('**/components/thinking/ThinkingSpace.tsx*');
    await alert.getByRole('button', { name: 'دوباره' }).click();
    await page.getByRole('radio', { name: /^منتظر تو/ }).waitFor({ timeout: 10000 }); // the thinking space itself
    assert.equal(await page.getByRole('alert').filter({ hasText: 'این بخش بار نشد' }).count(), 0, 'the message is gone after the retry');
    assert.ok(requested.includes('ThinkingSpace'));

    step(`[${width}] 3: a dialog loads the first time it is opened`);
    assert.ok(!requested.includes('ThoughtDialog'));
    await page.keyboard.press('Control+KeyK'); await page.getByRole('combobox', { name: 'جستجو' }).fill('فکر تازه'); await click(page.locator('[role=dialog] [role=option]').filter({ hasText: 'فکر تازه' }).first());
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    assert.ok(requested.includes('ThoughtDialog'), 'ThoughtDialog was requested when opened');
    assert.deepEqual(errors, [], 'no page errors');
    step(`[${width}] ok`);
    await ctx.close();
    stopAll();
  }
  console.log('✓ lazy loading scenario passed');
} finally {
  await browser?.close();
  stopAll();
}
