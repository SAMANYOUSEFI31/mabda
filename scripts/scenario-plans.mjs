#!/usr/bin/env node
/**
 * Revenue-model UI check on a real server + temp SQLite and the LOCAL Gemini stand-in (scripted output, not a model).
 *  run A  (MABDA_MANAGED_AI off): no credit number anywhere; usage meters; plan page in outcome language, no local-currency price;
 *                                  manager ledger shows OUR real cost per workspace vs plan price
 *  run B  (MABDA_MANAGED_AI on):  credits appear again (nav, plan page)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-plans.mjs   → docs/screens/plans-*.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const KEY = 'AIzaSy' + 'A'.repeat(33);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
const start = (args, env) => { const c = spawn('npx', args, { env: { ...process.env, ...env }, stdio: 'ignore', detached: true }); children.push(c); };
const stopAll = () => { for (const c of children.splice(0)) { try { process.kill(-c.pid); } catch { /* gone */ } } };
async function up(url) { for (let i = 0; i < 80; i++) { try { const r = await fetch(url); if (r.status < 500) return; } catch { /* retry */ } await wait(250); } throw new Error(`not reachable ${url}`); }
const CREDIT_TEXT = /موجودی اعتبار|اعتبار باقی‌مانده|[۰-۹]+ اعتبار|اعتبار ماهانه/;

async function run(managed, port, fakePort) {
  const dir = mkdtempSync(join(tmpdir(), 'mabda-plans-'));
  start(['tsx', 'server/ai/testing/fakeGemini.ts'], { FAKE_GEMINI_PORT: String(fakePort) });
  start(['tsx', 'server.ts'], { PORT: String(port), MABDA_DB_PATH: join(dir, 'm.sqlite'), MABDA_GEMINI_BASE_URL: `http://127.0.0.1:${fakePort}`, MABDA_SECRET: 's', GEMINI_API_KEY: KEY, MABDA_ADMIN: '1', ...(managed ? { MABDA_MANAGED_AI: '1' } : {}) });
  const BASE = `http://127.0.0.1:${port}`;
  await up(`${BASE}/api/health`);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const tag = managed ? 'on' : 'off';
    const shot = (n, full = false) => page.screenshot({ path: `docs/screens/plans-${tag}-${n}.png`, fullPage: full });
    const nav = (label) => page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${label}")`).click();
    const account = async (name) => { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); };
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText('منبع حقیقت: استودیو').waitFor();

    if (!managed) {
      console.log('• run A: managed AI OFF');
      assert.equal(await page.getByText(CREDIT_TEXT).count(), 0, 'no credit number on the first screen');
      // a subscription-included judgement on OUR key: Context Coach (no user key at all)
      await page.getByRole('button', { name: 'عملیات گرهٔ برند و پیام' }).click();
      await page.getByRole('menuitem', { name: 'مربی دانش' }).click();
      await page.getByRole('button', { name: 'از مربی دانش بپرس' }).click();
      await page.getByText('سؤال‌های روشن‌کننده').waitFor({ timeout: 20000 });
      await page.keyboard.press('Escape');

      await account('مصرف و دفتر کل');
      await page.getByText('پردازش فایل این ماه').first().waitFor();
      await page.getByText('مربی دانش امروز').first().waitFor();
      assert.equal(await page.getByText(CREDIT_TEXT).count(), 0, 'no credit number on the usage page');
      await shot('1-usage');

      await page.getByRole('tab', { name: 'نمای مدیر' }).click();
      await page.getByText(/هزینهٔ واقعی ما در برابر قیمت پلن/).waitFor();
      await shot('2-manager-ledger');

      await page.keyboard.press('Escape').catch(() => {});
      await account('پلن و ارتقا');
      await page.getByText('منبع حقیقت کسب‌وکار، وصل به AI خودت').waitFor();
      assert.equal(await page.getByText(/تومان/).count() > 0 ? (await page.getByText(/تومان/).allInnerTexts()).filter((t) => /[۰-۹0-9]+\s*تومان/.test(t)).length : 0, 0, 'no hardcoded local-currency amount');
      assert.equal(await page.getByText(/اعتبار ماهانه/).count(), 0, 'plan page has no credit section while managed AI is off');
      await shot('3-plan-page', true);
    } else {
      console.log('• run B: managed AI ON');
      await account('مصرف و دفتر کل');
      await page.getByText('اعتبار باقی‌مانده').first().waitFor();
      await page.keyboard.press('Escape').catch(() => {});
      await account('پلن و ارتقا');
      await page.getByText('اعتبار ماهانه برای خروجی‌ها').first().waitFor();
      await shot('1-plan-page-with-credits', true);
    }
    assert.deepEqual(errors, [], 'no page errors');
  } finally { await browser.close(); stopAll(); rmSync(dir, { recursive: true, force: true }); await wait(500); }
}

try { await run(false, 3103, 4013); await run(true, 3104, 4014); console.log('\nOK'); } catch (e) { console.error(e); process.exitCode = 1; } finally { stopAll(); }
