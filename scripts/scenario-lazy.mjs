#!/usr/bin/env node
/**
 * Code splitting on a REAL server (docs/architecture.md → «بار شدن تکه‌تکه»):
 *   1. the home loads without the heavy pages: the thinking space / canvas / dialogs are NOT requested until they are needed;
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
    page.on('request', (r) => { const m = /\/(?:components|app)\/([A-Za-z]+)\.tsx/.exec(r.url()); if (m) requested.push(m[1]); });
    const click = (loc) => loc.evaluate((n) => n.click());
    const nav = (m, d) => click(page.locator(mobile ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`));

    step(`[${width}] 1: the home does not request the heavy pages`);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor({ timeout: 20000 });
    for (const heavy of ['ContextCanvas', 'ThinkingSpace', 'WeeklyReviewDialog', 'TruthCompareDialog', 'ContextDetailModal', 'WorkstreamStudio']) assert.ok(!requested.includes(heavy), `${heavy} was requested at the start`);
    assert.ok(requested.includes('AppView') && requested.includes('HomeTodo'), 'the shell and the home are there');

    step(`[${width}] 2: a page that cannot load says so and offers «دوباره»`);
    await page.route('**/components/ThinkingSpace.tsx*', (route) => route.abort('failed'));
    await nav('فکر', 'فکر');
    const alert = page.getByRole('alert').filter({ hasText: 'این بخش بار نشد' });
    await alert.waitFor({ timeout: 10000 });
    assert.ok(await alert.getByRole('button', { name: 'دوباره' }).isVisible());
    assert.ok((await page.locator('body').innerText()).length > 50, 'not a blank page');
    await page.screenshot({ path: `docs/screens/lazy-${width}-1-failed.png` });
    await page.unroute('**/components/ThinkingSpace.tsx*');
    await alert.getByRole('button', { name: 'دوباره' }).click();
    await page.getByRole('radio', { name: /^منتظر تو/ }).waitFor({ timeout: 10000 }); // the thinking space itself
    assert.equal(await page.getByRole('alert').filter({ hasText: 'این بخش بار نشد' }).count(), 0, 'the message is gone after the retry');
    assert.ok(requested.includes('ThinkingSpace'));

    step(`[${width}] 3: a dialog loads the first time it is opened`);
    assert.ok(!requested.includes('ThoughtDialog'));
    await click(page.getByRole('button', { name: 'فکر تازه' }).first());
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
