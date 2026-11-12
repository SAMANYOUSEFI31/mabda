#!/usr/bin/env node
/**
 * The document view and the version path on the showcase workspace (REAL server + temp SQLite):
 * first-level sections are tabs; the outline shows where you are while you scroll and links every section by a stable address;
 * «با ارجاع‌ها» adds flat reference lines; an object's history reads «۴ پیش‌نویس» → «تأیید شد در نسخهٔ ۴».
 * Screenshots → docs/screens/doc-*.png (1280) and doc-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-doc.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-doc-'));
const PORT = 3115;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const step = (m) => console.log('•', m);

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'doc-m' : 'doc';
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const account = async (name) => {
      // spaces (and what acts on one) live in the space picker at the head of the bar; the rest in the account menu
      const inSpace = !/حساب و داده|پلن و ارتقا|مصرف|امکانات|بایگانی|راهنما|شروع سریع|ظاهر/.test(String(name));
      const label = name === 'فضا تازه' ? 'فضای تازه…' : name;
      if (inSpace) { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name: label }).first().click(); return; }
      if (page.viewportSize().width < 768) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name: label }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name: label }).first().click(); }
    };
    const radio = (name) => page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click());
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).evaluate((n) => n.click()); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).click(); };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('بازسازی فضای نمونه');
    await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click({ timeout: 1500 }).catch(() => {});
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();

    step(`[${width}] the document: first-level sections are tabs`);
    await nav('منبع حقیقت', 'منبع');
    await radio('سند');
    const tabs = page.locator('[role=tablist][aria-label="بخش‌های سند"] [role=tab]');
    await tabs.first().waitFor();
    const labels = await tabs.allInnerTexts();
    assert.ok(labels.length >= 3, `tabs: ${labels}`);
    await page.locator('[role=tablist][aria-label="بخش‌های سند"] [role=tab]', { hasText: 'محصول و خدمت' }).click();
    await page.locator('article h2').first().waitFor();
    await shot('1-tabs');

    step(`[${width}] the outline shows where you are while you scroll (scroll-spy)`);
    const outlineIds = await page.evaluate(() => [...document.querySelectorAll('article [id^="n-"], article [id^="o-"]')].map((e) => e.id));
    assert.ok(outlineIds.length >= 8, `a long tab has many headings (${outlineIds.length})`);
    const last = outlineIds[outlineIds.length - 1];
    await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'start' }), last);
    await page.waitForTimeout(500);
    const lastText = await page.evaluate((id) => document.getElementById(id).innerText.trim(), last);
    if (mobile) {
      await page.getByText(/^اکنون: /).waitFor();
      assert.ok((await page.getByText(/^اکنون: /).innerText()).includes(lastText), 'the phone shows the current section');
    } else {
      const cur = page.locator('nav[aria-label="فهرست سند"] a[aria-current=location]');
      assert.equal((await cur.innerText()).trim(), lastText, 'the outline marks the current section');
    }
    await shot('2-outline');

    step(`[${width}] every section has a stable address; an address opens its tab`);
    const target = 'o-dm_price2';
    if (mobile) { await page.getByRole('button', { name: 'فهرست' }).click(); await page.getByRole('menuitem', { name: /قیمت اشتراک ماهانه/ }).first().click(); }
    else await page.locator(`nav[aria-label="فهرست سند"] a[href="#${target}"]`).click();
    await page.waitForFunction((h) => window.location.hash === h, `#${target}`, { timeout: 5000 });
    await page.waitForFunction((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight * 0.5; }, target, { timeout: 5000 });
    // another tab, then the address of an object that lives elsewhere
    await page.locator('[role=tablist][aria-label="بخش‌های سند"] [role=tab]', { hasText: 'برند و پیام' }).click();
    await page.evaluate(() => { window.location.hash = '#o-dm_price2'; });
    await page.waitForFunction(() => !!document.getElementById('o-dm_price2'));
    assert.equal(await page.locator('[role=tablist][aria-label="بخش‌های سند"] [role=tab][aria-selected=true]').innerText(), 'محصول و خدمت');

    step(`[${width}] «با ارجاع‌ها»: flat reference lines, only when asked`);
    const refsOff = await page.locator('article').innerText();
    assert.ok(!/^وابسته به: /m.test(refsOff));
    await page.getByLabel('با ارجاع‌ها').evaluate((n) => n.click());
    await page.waitForFunction(() => /^وابسته به: /m.test(document.querySelector('article')?.innerText ?? ''));
    await radio('Markdown');
    const src = await page.locator('pre').innerText();
    assert.ok(/^وابسته به: «/m.test(src) && !/^\s*[-*] وابسته/m.test(src), 'a flat line, no list nesting');
    await radio('خوانا');
    await shot('3-refs');

    step(`[${width}] history: drafts are one closed row, the approval is a milestone`);
    await radio('ساختار');
    await page.getByRole('button', { name: /لحن پاسخ به مشتری/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('tab', { name: /^نسخه‌ها/ }).click();
    await dlg.getByText('۴ پیش‌نویس').waitFor();
    await dlg.getByText('تأیید شد در نسخهٔ ۴').waitFor();
    await dlg.getByText(/آخرین تأیید: نسخهٔ ۴/).first().waitFor();
    await shot('4-history');
    // the newest group of drafts is OPEN by default: the last change is seen without a hunt
    assert.ok((await dlg.locator('details li').count()) >= 4, 'the drafts open to their edits');
    // a reason field exists for confirmed knowledge only
    await dlg.getByRole('tab', { name: 'ویرایش' }).click();
    await dlg.getByRole('button', { name: 'بیشتر', exact: true }).click();
    assert.equal(await dlg.getByLabel('دلیل این ویرایش (اختیاری)').count(), 1);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
  }
  console.log('== doc: OK');
} finally {
  await browser?.close();
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
