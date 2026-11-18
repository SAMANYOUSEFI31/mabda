#!/usr/bin/env node
/**
 * The design package of the second external review, on a REAL server + temp SQLite, at 1280 and 390, light and dark:
 * «نمایش گذشته‌ها» and «مقایسه» (NEW-06), a file with no section (NEW-05), «برگردان به» for knowledge whose section is gone (NEW-09),
 * «در بخش» beside a gap answer (NEW-01), «ساخت بخش از این موارد» on the thinking canvas (UX-STR-01).
 * Screenshots → docs/screens/review2-<name>-<width>[-dark].png. Prints the steps that could not be reached.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-review2-'));
const children = [];
let BASE = '';
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), NODE_ENV: 'development' }, stdio: 'ignore', detached: true }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
  throw new Error('server did not start');
};
const call = async (method, path, body) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return r.json(); };
const missed = [];

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  let port = 3171;
  for (const scheme of ['light', 'dark']) for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = `r2-${scheme}-${width}`;
    await startServer(port++, tag);
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', colorScheme: scheme })).newPage();
    const suffix = `${width}${scheme === 'dark' ? '-dark' : ''}`;
    const shot = async (n) => { await wait(700); await page.screenshot({ path: `docs/screens/review2-${n}-${suffix}.png` }); };
    const tryStep = async (name, fn) => { try { await fn(); } catch (e) { missed.push(`[${suffix}] ${name}: ${String(e.message).split('\n')[0]}`); await page.keyboard.press('Escape').catch(() => {}); } };
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).first().evaluate((n) => n.click()); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).first().evaluate((n) => n.click()); await wait(400); };
    const radio = (name) => page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click());
    const account = async (name) => {
      const inSpace = !/حساب و داده|بایگانی|راهنما|شروع سریع|ظاهر/.test(String(name));
      if (inSpace) { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name }).first().click(); return; }
    };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    // the showcase space has a workflow with open questions: «در بخش» beside each answer (NEW-01), inline and in «چه چیزی کم است»
    await tryStep('gap-place', async () => {
      await nav('خروجی‌ها', 'خروجی‌ها');
      await page.getByTestId('outputs-build').getByRole('button', { name: /^(بساز|آماده‌سازی)/ }).first().click();
      const line = page.getByTestId('readiness-line');
      // on a phone the place is one line «در: … · تغییر» until tapped
      await (mobile ? line.getByRole('button', { name: /؛ تغییر$/ }) : line.getByLabel('در بخش', { exact: true })).first().scrollIntoViewIfNeeded();
      await shot('gap-place');
      await page.getByRole('tab', { name: /چه چیزی کم است/ }).click();
      if (mobile) await page.getByRole('button', { name: /^پاسخ در این بخش ثبت می‌شود.*؛ تغییر$/ }).first().click();
      await page.getByLabel('پاسخ در این بخش ثبت می‌شود', { exact: true }).first().scrollIntoViewIfNeeded();
      await shot('gap-panel');
    });
    await page.reload({ waitUntil: 'networkidle' }); await page.getByText(/^خانه: /).waitFor();
    const wsName = `بررسی ${width}`;
    await account('فضای تازه…');
    await page.getByRole('radio', { name: 'کسب‌وکار' }).click();
    await page.getByLabel('نام فضا', { exact: true }).fill(wsName);
    await page.getByRole('button', { name: 'افزودن فضا' }).click();
    await page.getByText(`خانه: ${wsName}`).waitFor({ timeout: 8000 });
    const wid = (await call('GET', '/workspaces')).workspaces.find((w) => w.name === wsName).id;
    const nodes = (await call('GET', `/workspaces/${wid}/state`)).nodes;
    const top = nodes.filter((n) => !n.parentId);
    const product = nodes.find((n) => n.label === 'محصول و خدمت') ?? top[0];

    // seed: a replaced price (NEW-06), a file with no section (NEW-05), knowledge archived with a section that is then gone (NEW-09), two notes on the free canvas (UX-STR-01)
    const old = (await call('POST', `/workspaces/${wid}/objects`, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'قیمت دورهٔ پایه', content: 'دورهٔ پایه ۲ میلیون تومان است.', nodeId: product.id })).object;
    const prop = (await call('POST', `/workspaces/${wid}/objects`, { type: 'Fact', status: 'Proposed', provenance: 'User Input', title: 'قیمت دورهٔ پایه', content: 'دورهٔ پایه ۲٫۵ میلیون تومان است، با یک جلسهٔ رفع اشکال.', nodeId: product.id })).object;
    await call('POST', `/workspaces/${wid}/objects/${prop.id}/replace`, { replacesId: old.id, reason: 'قیمت تازهٔ پاییز' });
    const form = new FormData(); form.append('file', new Blob(['یادداشت جلسهٔ مشتری: ساعت کلاس‌ها عصر باشد.'], { type: 'text/plain' }), 'jalase.txt');
    await fetch(`${BASE}/api/workspaces/${wid}/files`, { method: 'POST', body: form });
    const temp = (await call('POST', `/workspaces/${wid}/nodes`, { parentId: product.id, label: 'کارگاه آزمایشی' })).node;
    await call('POST', `/workspaces/${wid}/objects`, { type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'کارگاه در تهران', content: 'کارگاه آزمایشی فقط در تهران برگزار می‌شود.', nodeId: temp.id });
    await fetch(`${BASE}/api/workspaces/${wid}/nodes/${temp.id}?mode=archive&transferTo=${encodeURIComponent(product.id)}`, { method: 'DELETE' });
    await call('POST', `/workspaces/${wid}/canvas/free/notes`, { content: 'سفر تیمی بهار: شمال یا اصفهان؟', x: 60, y: 60 });
    await call('POST', `/workspaces/${wid}/canvas/free/notes`, { content: 'بودجهٔ سفر را تا آخر ماه ببندیم', x: 340, y: 60 });
    await page.reload({ waitUntil: 'networkidle' });
    await account(wsName); await page.getByText(`خانه: ${wsName}`).waitFor();

    await tryStep('past', async () => {
      await nav('منبع حقیقت', 'منبع'); await radio('ساختار');
      await page.getByRole('switch', { name: /^نمایش گذشته‌ها/ }).or(page.getByRole('checkbox', { name: /^نمایش گذشته‌ها/ })).first().click();
      await page.getByText('دورهٔ پایه ۲ میلیون تومان است.').first().scrollIntoViewIfNeeded();
      await shot('past');
    });
    await tryStep('compare', async () => {
      await page.getByRole('button', { name: 'مقایسه', exact: true }).first().click();
      await page.getByRole('dialog', { name: 'پیش‌تر و اکنون' }).waitFor();
      await shot('compare');
      await page.keyboard.press('Escape');
    });
    await tryStep('file-orphan', async () => {
      await page.getByText('در هیچ بخشی نیست', { exact: false }).first().scrollIntoViewIfNeeded();
      await shot('file-orphan');
    });
    await tryStep('archive-dest', async () => {
      await page.getByRole('button', { name: 'کارهای دیگر منبع حقیقت' }).click(); await page.getByRole('menuitem', { name: 'بایگانی و حذف‌های اخیر' }).click();
      await page.getByTestId('archive-knowledge').waitFor();
      await page.getByLabel('برگردان به').first().waitFor();
      await shot('archive-dest');
      await page.keyboard.press('Escape');
    });
    await tryStep('canvas-select', async () => {
      await nav('فکر', 'فکر');
      await page.getByRole('radiogroup', { name: 'نمای فکر' }).getByRole('radio', { name: 'بوم' }).click();
      await page.getByTestId('canvas-stage').waitFor();
      await wait(600);
      // at the far level of detail (a phone) a card has no text, only its accessible name
      const card = (t) => page.locator(`[data-item-id]:is(:has-text("${t}"), [aria-label*="${t}"])`).first();
      // the cards may sit outside the visible part of the stage: a click event as a hand would send it (the second with Shift)
      // only the cards in view are drawn: fit the canvas so both notes are on screen (a phone starts zoomed in)
      await page.getByTestId('canvas-stage').focus(); await page.keyboard.press('Digit0'); await wait(500);
      await card('سفر تیمی بهار').evaluate((n) => n.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await card('بودجهٔ سفر').evaluate((n) => n.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })));
      await page.getByRole('button', { name: 'ساخت بخش از این موارد' }).first().waitFor({ timeout: 4000 });
      await shot('canvas-select');
      await page.getByRole('button', { name: 'ساخت بخش از این موارد' }).first().click();
      await page.getByLabel('نام بخش').fill('سفر تیمی');
      await shot('section-dialog');
      await page.getByRole('dialog').getByRole('button', { name: 'ساخت بخش', exact: true }).click();
      await wait(500);
      const after = (await call('GET', `/workspaces/${wid}/state`));
      const made = after.nodes.find((n) => n.label === 'سفر تیمی');
      if (!made || after.notes.filter((n) => n.nodeId === made.id).length !== 2) throw new Error('the section was not made with both notes');
    });
  }
} finally {
  await browser?.close();
  for (const c of children) { try { process.kill(-c.pid); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
if (missed.length) { console.log('NOT REACHED:'); for (const m of missed) console.log('  ', m); process.exitCode = 1; } else console.log('review2: all steps reached');
