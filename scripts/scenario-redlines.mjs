#!/usr/bin/env node
/**
 * «بوم آرام، فکر بدون نحو، مثال برای خط قرمز» on a REAL server + temp SQLite:
 *   1. a red line with two examples (right / wrong) written under «بیشتر»; they are saved with the rule
 *   2. «درخواست برای AI»: the exact text to copy has the examples next to the rule, labelled
 *   3. a note: a line that ends with «؟» is a «سؤال» with no bracket; the line menu «علامت بزن» writes the marker
 *   4. the home says it in one line
 * Screenshots → docs/screens/redlines-*.png (1280) and redlines-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-redlines.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-redlines-'));
let BASE = '';
const children = [];
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const api = async (path) => (await fetch(`${BASE}/api${path}`)).json();
const step = (m) => console.log('•', m);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'redlines-m' : 'redlines';
    await startServer(mobile ? 3122 : 3121, tag);
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).click(); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).click(); };
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
    };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('فضای کاری تازه');
    await page.getByLabel('نام فضای کاری یا نام برند').fill(`باشگاه ${width}`);
    await page.getByRole('button', { name: 'ایجاد فضای کاری' }).click();
    await page.getByText(`خانه: باشگاه ${width}`).waitFor({ timeout: 8000 });
    const wid = (await api('/workspaces')).workspaces.find((w) => w.name === `باشگاه ${width}`).id;

    step(`[${width}] a red line: «افزودن مثال» is behind «بیشتر»; two examples are written and saved with the rule`);
    await page.getByRole('button', { name: /^(ثبت دانش|ثبت اولین دانش)$/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('چه چیزی دربارهٔ کسب‌وکارت درست است؟').fill('هرگز وعدهٔ سود قطعی نده.');
    assert.equal(await dlg.getByRole('radio', { name: 'خط قرمز' }).getAttribute('aria-checked'), 'true');
    assert.equal(await dlg.getByRole('button', { name: 'افزودن مثال' }).count(), 0, 'no example field in the first view');
    await dlg.getByRole('button', { name: 'بیشتر' }).click();
    await dlg.getByRole('button', { name: 'افزودن مثال' }).click();
    await dlg.getByRole('button', { name: 'افزودن مثال' }).click();
    const texts = dlg.getByLabel('متن کوتاه مثال');
    await texts.nth(0).fill('ممکن است سود کنید');
    await texts.nth(1).fill('سود تضمینی ۳۰٪');
    assert.equal(await dlg.getByRole('radio', { name: 'نادرست' }).nth(1).getAttribute('aria-checked'), 'true', 'the second example starts as «نادرست»');
    await shot('1-examples');
    await dlg.getByRole('button', { name: 'ذخیره' }).first().click();
    await page.getByText(/ذخیره شد/).first().waitFor();
    const rule = (await api(`/workspaces/${wid}/state`)).objects.find((o) => o.type === 'Constraint');
    assert.deepEqual(rule.examples, [{ kind: 'good', text: 'ممکن است سود کنید' }, { kind: 'bad', text: 'سود تضمینی ۳۰٪' }]);
    await page.keyboard.press('Escape');

    step(`[${width}] «درخواست برای AI»: the text to copy has the examples next to the rule`);
    await page.getByRole('button', { name: 'درخواست برای AI' }).first().click();
    await page.getByRole('dialog').getByLabel('درخواستت را در یک خط بنویس').fill('یک متن تبلیغ برای باشگاه بنویس');
    await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] textarea[readonly]')].some((t) => t.value.includes('مثال درست: ممکن است سود کنید') && t.value.includes('مثال نادرست: سود تضمینی ۳۰٪')), null, { timeout: 15000 });
    await shot('2-request');
    await page.keyboard.press('Escape');

    step(`[${width}] a note: a line that ends with «؟» is a question by itself; «علامت بزن» writes the marker for me`);
    await nav('منبع حقیقت', 'منبع');
    await page.getByRole('button', { name: /^یادداشت‌ها/ }).first().click();
    await page.getByLabel('یادداشت تازه').first().fill('آیا کلاس صبح بگذاریم؟\nاعضا بیشتر شب می‌آیند');
    await page.getByRole('button', { name: 'افزودن یادداشت' }).first().click();
    const lines = page.getByTestId('note-lines').first();
    await lines.waitFor();
    assert.match(await lines.locator('[data-line="0"]').innerText(), /سؤال/, 'the question was recognised without a bracket');
    assert.doesNotMatch(await lines.locator('[data-line="1"]').innerText(), /سؤال|فرض/);
    await lines.locator('[data-line="1"]').hover();
    await lines.locator('[data-line="1"] .note-mark').click();
    await page.waitForTimeout(400); await shot('3-line-menu');
    await page.getByRole('menuitem', { name: 'فرض' }).click();
    await page.waitForTimeout(500);
    const note = (await api(`/workspaces/${wid}/state`)).notes.find((n) => n.content.includes('اعضا'));
    assert.equal(note.content, 'آیا کلاس صبح بگذاریم؟\n[فرض] اعضا بیشتر شب می‌آیند', 'only the chosen line got a marker; the question line is untouched');
    assert.match(await lines.locator('[data-line="1"]').innerText(), /فرض/);
    await lines.locator('[data-line="1"]').hover();
    await lines.locator('[data-line="1"] .note-mark').click();
    await page.getByRole('menuitem', { name: 'بدون علامت' }).click();
    await page.waitForTimeout(500);
    assert.equal((await api(`/workspaces/${wid}/state`)).notes.find((n) => n.content.includes('اعضا')).content, 'آیا کلاس صبح بگذاریم؟\nاعضا بیشتر شب می‌آیند', 'the marker comes off exactly');

    step(`[${width}] home: one calm line about the open question`);
    await nav('خانه', 'خانه');
    await page.getByText(/[1۱] سؤال یا تصمیم باز در یادداشت/).waitFor();
    await shot('4-home');
    assert.deepEqual(errors, []);
  }
  console.log('== redlines: OK');
} finally {
  await browser?.close();
  for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
