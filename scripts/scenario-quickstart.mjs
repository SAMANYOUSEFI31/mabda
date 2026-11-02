#!/usr/bin/env node
/**
 * «شروع سریع» against a REAL server + the local Gemini stand-in: paste text → extraction (Proposed + quote) → confirm →
 * a Context pack ready to paste into any AI → a sample output made from it. Also the 5-questions path (no AI needed).
 * Screenshots → docs/screens/quickstart-*.png (1280, 390).
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-quickstart.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const KEY = 'AIzaSy' + 'A'.repeat(33);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-qs-'));
const children = [];
const start = (cmd, args, env) => { const c = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore', detached: true }); children.push(c); };
const stopAll = () => { for (const c of children) { try { process.kill(-c.pid); } catch { /* gone */ } } };
const PORT = 3108, FAKE = 4018, BASE = `http://127.0.0.1:${PORT}`;
const step = (m) => console.log('•', m);
const api = async (path) => (await fetch(`${BASE}/api${path}`)).json();

let browser;
try {
  start('npx', ['tsx', 'server/ai/testing/fakeGemini.ts'], { FAKE_GEMINI_PORT: String(FAKE) });
  start('npx', ['tsx', 'server.ts'], { PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), MABDA_GEMINI_BASE_URL: `http://127.0.0.1:${FAKE}`, MABDA_SECRET: 's', NODE_ENV: 'development' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'], });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
    };
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText('منبع حقیقت: استودیو').waitFor();
    {
      await account('کلید هوش مصنوعی');
      await page.getByLabel('کلید Gemini API').fill(KEY);
      await page.getByRole('button', { name: 'آزمودن و ذخیرهٔ کلید' }).click();
      await page.getByText('کلید شخصی فعال').waitFor();
      await page.keyboard.press('Escape');
    }
    step(`[${width}] start → paste text → what Mabda understood`);
    await account('شروع سریع');
    await page.screenshot({ path: `docs/screens/quickstart-1-${width}.png` });
    await page.getByRole('button', { name: /متن یا یادداشت‌هایم را می‌چسبانم/ }).click();
    await page.getByLabel('متن').fill('ما یک آژانس طراحی هستیم و بودجهٔ کمپین پاییز پنجاه میلیون تومان است. کانال اصلی اینستاگرام است.');
    await page.getByRole('button', { name: 'استخراج دانش' }).click();
    await page.getByText('مبدأ این‌ها را فهمید').waitFor();
    await page.screenshot({ path: `docs/screens/quickstart-2-${width}.png` });
    const proposed = (await api('/workspaces/ws_studio/state')).objects.filter((o) => o.status === 'Proposed' && o.source?.label === 'متن چسبانده‌شده');
    assert.ok(proposed.length >= 1, 'extraction made Proposed objects labelled «متن چسبانده‌شده»');

    step(`[${width}] confirm → Context pack → copy`);
    await page.getByRole('button', { name: /^تأیید .* مورد و ساخت بسته/ }).click();
    await page.getByText('بستهٔ Context تو آماده است').waitFor();
    await page.getByRole('button', { name: 'کپی بسته' }).click();
    await page.getByRole('button', { name: 'کپی شد' }).waitFor();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /mabda-pack:/);
    const st = await api('/workspaces/ws_studio/state');
    assert.ok(st.objects.filter((o) => o.source?.label === 'متن چسبانده‌شده').every((o) => o.status === 'Confirmed'), 'confirming = accepting (each one is a Change)');
    assert.ok(st.changes.some((c) => c.kind === 'proposal_accepted' && c.actor === 'user'));

    {
      step(`[${width}] a sample output from the same knowledge (real generate path)`);
      await page.getByRole('button', { name: 'ساخت جملهٔ موقعیت‌یابی' }).click();
      await page.getByText(/این خروجی از .* قلم دانش ساخته شد/).waitFor({ timeout: 60000 });
      const dels = (await api('/workspaces/ws_studio/state')).deliverables;
      assert.ok(dels.some((d) => d.usedContext.length > 0), 'the sample is saved with its lineage');
    }
    await page.screenshot({ path: `docs/screens/quickstart-3-${width}.png` });
    await page.getByRole('button', { name: 'تمام شد' }).click();

    step(`[${width}] the 5-question path`);
    await account('شروع سریع');
    await page.getByRole('button', { name: /به چند سؤال کوتاه جواب می‌دهم/ }).click();
    assert.equal(await page.getByRole('button', { name: 'ثبت و ساخت بسته' }).isDisabled(), true, 'two answers needed');
    await page.getByLabel('روی چه کاری کار می‌کنی؟').fill(`طراحی هویت ${width}`);
    await page.getByLabel('مخاطب اصلی تو کیست؟').fill('استارتاپ‌های کوچک');
    await page.getByRole('button', { name: 'ثبت و ساخت بسته' }).click();
    await page.getByText('بستهٔ Context تو آماده است').waitFor();
    assert.ok((await api('/workspaces/ws_studio/state')).objects.some((o) => o.content === `طراحی هویت ${width}` && o.status === 'Confirmed'));
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  }
  console.log('\nOK');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopAll();
  rmSync(dir, { recursive: true, force: true });
}
