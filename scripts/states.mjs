#!/usr/bin/env node
/**
 * The five states of each main view (patterns.md §5, implementation-plan 4.4): empty, coming (skeleton), full, partial, error.
 * At 390, 768 and 1280 it shoots home, «منبع», «فکر» and «خروجی‌ها» in a full space (the sample), in a new empty space, and in the same
 * space with one truth (partial); then the coming and failed states, which the app draws once for every view (before the first
 * space arrives, and in place when another space does not arrive). Pictures: docs/screens/state-*.png; list: docs/screens/states.md.
 * It starts its own server on an empty database (a new space would hit the plan's space cap on a used one).
 * Usage: node scripts/states.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// one fresh server (empty database) for each width: a new space would hit the plan's space cap on a used one
let server = null;
const stop = () => { try { if (server) process.kill(-server.pid); } catch { /* gone */ } server = null; };
process.on('exit', stop);
const start = async () => {
  const port = 3300 + Math.floor(Math.random() * 400);
  server = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(mkdtempSync(join(tmpdir(), 'mabda-states-')), 'db.sqlite'), NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
  return base;
};
const OUT = process.env.SCREENS_OUT || 'docs/screens';
const VIEWS = [['home', 'خانه', 'خانه'], ['context', 'منبع', 'منبع حقیقت'], ['thinking', 'فکر', 'فکر'], ['assets', 'خروجی‌ها', 'خروجی‌ها']];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const STATE = /\/api\/workspaces\/[^/]+\/state/;

for (const scheme of (process.env.SCHEMES || 'light,dark').split(',')) for (const width of (process.env.WIDTHS || '390,768,1280').split(',').map(Number)) {
  const mobile = width < 768;
  const BASE = await start();
  const sfx = scheme === 'dark' ? '-dark' : '';
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', colorScheme: scheme });
  const page = await ctx.newPage();
  // a toast left from the step before is not part of the state being shown: wait it out (or close it)
  const quiet = async () => { for (let i = 0; i < 3 && await page.locator('.mb-toast').count(); i++) { await page.locator('.mb-toast').getByRole('button', { name: 'بستن' }).first().click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(400); } };
  const shot = async (name, keepToast = false) => { if (!keepToast) await quiet(); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name.startsWith('add-') ? '' : 'state-'}${name}-${width}${sfx}.png` }); };
  const go = async (m, d) => {
    const nav = page.getByRole('navigation', { name: mobile ? 'منوی پایینی موبایل' : 'بخش‌های اصلی نرم‌افزار' });
    await nav.getByRole('button', { name: mobile ? m : d, exact: true }).first().click({ timeout: 8000 }).catch(async (e) => { await page.screenshot({ path: `${OUT}/fail.png` }); throw e; });
  };
  const space = async (label) => { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name: label }).first().click(); };
  const views = async (state) => { for (const [id, m, d] of VIEWS) { await go(m, d); await shot(`${state}-${id}`); } await go('خانه', 'خانه'); };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((wide) => { localStorage.clear(); if (wide) localStorage.setItem('mabda.sidebar', 'docked'); }, width >= 1024);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(/^خانه: /).waitFor();
  const sample = (await page.getByText(/^خانه: /).first().textContent()).replace(/^خانه: /, '').trim();

  // full: the sample space
  await views('full');

  // empty: a new space
  const name = 'فضای تازه';
  await space('فضای تازه…');
  await page.getByRole('radio', { name: 'خالی' }).click();
  await page.getByLabel('نام فضا', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'افزودن فضا' }).click();
  await page.getByText(`خانه: ${name}`).waitFor({ timeout: 8000 }).catch(async (e) => { await page.screenshot({ path: `${OUT}/fail.png` }); throw e; });
  await views('empty');

  // partial: the same space with one truth
  await page.keyboard.press('Control+KeyK'); await page.getByRole('combobox').fill('افزودن حقیقت'); await page.waitForTimeout(250);
  await page.getByRole('option').first().click(); await page.waitForTimeout(600);
  await page.getByRole('dialog').getByLabel('چه چیزی درست است؟').fill('جلسهٔ هفتگی تیم دوشنبه‌ها ساعت ده است.');
  await page.getByRole('dialog').getByRole('button', { name: 'افزودن', exact: true }).evaluate((b) => b.click());
  await page.waitForTimeout(800);
  await views('partial');


  // «افزودن»: its three kinds, the date picker inside «حقیقت», and the question before her words are thrown away
  const palette = async (q) => { await page.keyboard.press('Control+KeyK'); await page.getByRole('combobox').fill(q); await page.waitForTimeout(250); await page.getByRole('option').first().click(); await page.waitForTimeout(700); };
  const kind = async (k) => { await page.locator('[role=dialog]:not([inert] *)').getByRole('radio', { name: k, exact: true }).click(); await page.waitForTimeout(800); };
  await palette('افزودن فکر');
  await page.getByLabel('چه چیزی به ذهنت رسید؟').fill('شاید جلسه را به سه‌شنبه ببریم؟', { timeout: 6000 }).catch(async (e) => { await page.screenshot({ path: `${OUT}/fail.png` }); throw e; });
  await shot('add-thought');
  await kind('فایل'); await shot('add-file');
  await kind('حقیقت'); await shot('add-truth');
  await page.getByRole('dialog').getByRole('button', { name: /جزئیات بیشتر/ }).first().click().catch(() => {}); await page.waitForTimeout(300);
  await page.getByRole('dialog').getByRole('button', { name: 'تقویم' }).first().click(); await page.waitForTimeout(500);
  await page.locator('.mb-cal').scrollIntoViewIfNeeded().catch(() => {});
  await shot('add-date');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await kind('فکر');
  await page.getByRole('dialog').getByRole('button', { name: 'بستن' }).first().click(); await page.waitForTimeout(500);
  await shot('add-discard');
  await page.getByRole('button', { name: /دور بریز/ }).first().click().catch(() => {}); await page.waitForTimeout(400);
  // a toast while the sheet stays open: the save does not reach the server, so the message comes and her words stay; on a phone
  // it sits above the sheet's footer, never on the title or the main button
  await palette('افزودن فکر');
  await page.getByLabel('چه چیزی به ذهنت رسید؟').fill('یک فکر برای دیدن جای پیام');
  await page.route(/\/api\//, (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  await page.keyboard.press('Control+Enter'); await page.locator('.mb-toast').first().waitFor({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(400);
  await shot('add-toast', true);
  await page.unroute(/\/api\//);
  // close it for good: Esc asks before throwing her words away, so answer that too, until nothing is open
  for (let i = 0; i < 4 && await page.locator('[role=dialog]:not([inert] *), [role=alertdialog]:not([inert] *)').count(); i++) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /دور بریز/ }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(300);
  }

  // error in place: the next space does not arrive; the shell stays and says so where the page was
  await page.route(STATE, (r) => r.abort());
  await space(sample);
  await page.getByRole('alert').filter({ hasText: 'این فضا باز نشد' }).waitFor({ timeout: 8000 }).catch(async (e) => { await page.screenshot({ path: `${OUT}/fail.png` }); throw e; });
  await shot('error');
  await page.unroute(STATE);

  // coming and failed before the first space: a skeleton after 300ms; then what failed, what is safe, «تلاش دوباره»
  await page.route(STATE, () => {});
  await page.reload();
  await page.waitForTimeout(900);
  await shot('loading');
  await page.unroute(STATE);
  await page.route(/\/api\/bootstrap/, (r) => r.abort());
  await page.reload();
  await page.getByText('منبع باز نشد').waitFor({ timeout: 8000 });
  await page.getByText('جزئیات').click();
  await shot('error-boot');
  await page.unroute(/\/api\/bootstrap/);
  // all clear: the same space after its weekly review, nothing waits, nothing is missing → «همه‌چیز به‌روز است.» and the latest changes
  await page.evaluate(async (n) => {
    const { workspaces } = await (await fetch('/api/workspaces')).json();
    const w = workspaces.find((x) => x.name === n);
    if (w) await fetch(`/api/workspaces/${w.id}/weekly-review/done`, { method: 'POST' });
  }, name);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  await space(name).catch(() => {}); await page.waitForTimeout(1200);
  await page.getByText('همه‌چیز به‌روز است.').first().waitFor({ timeout: 6000 }).catch(() => {});
  await shot('clear-home');
  await ctx.close();
  stop();
}
await browser.close();
stop();
console.log('states done');
