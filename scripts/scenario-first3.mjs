#!/usr/bin/env node
/**
 * «سه دقیقهٔ اول» on a REAL server + temp SQLite: an EMPTY workspace → quick start (the 5 questions, no AI needed) → the first
 * request for an AI → the first knowledge written in one box. At every step the words a person can read (text, labels, placeholders)
 * are checked against the banned words of docs/design-principles.md (src/ui/bannedWords.json): none may be seen.
 * Screenshots → docs/screens/first3-*.png (1280) and first3-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-first3.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const BANNED = JSON.parse(readFileSync('src/ui/bannedWords.json', 'utf8')).map((b) => ({ ...b, re: new RegExp(b.pattern, b.flags) }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-first3-'));
let PORT = 3117;
let BASE = '';
const children = [];
/** a fresh server and database per width: the plan caps how many workspaces one install may hold */
const startServer = async (port, tag) => {
  PORT = port; BASE = `http://127.0.0.1:${PORT}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), NODE_ENV: 'development' }, stdio: 'ignore', detached: true }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const api = async (path) => (await fetch(`${BASE}/api${path}`)).json();
const step = (m) => console.log('•', m);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'first3-m' : 'first3';
    await startServer(mobile ? 3118 : 3117, tag);
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    /** everything a person can read right now: visible text, labels, placeholders, titles */
    const readable = () => page.evaluate(() => {
      const out = [document.body.innerText];
      for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]')) out.push(el.getAttribute('aria-label') ?? '', el.getAttribute('placeholder') ?? '', el.getAttribute('title') ?? '');
      return out.join('\n');
    });
    const noMachineWords = async (where) => {
      const text = await readable();
      const found = BANNED.filter((b) => b.re.test(text)).map((b) => b.word);
      assert.deepEqual(found, [], `${where}: a banned word is visible: ${found.join('، ')}`);
    };
    const account = async (name) => {
      // spaces (and what acts on one) live in the space picker at the head of the bar; the rest in the account menu
      const inSpace = !/حساب و داده|پلن و ارتقا|مصرف|امکانات|بایگانی|راهنما|شروع سریع|ظاهر/.test(String(name));
      const label = name === 'فضای کاری تازه' ? 'فضای تازه…' : name;
      if (inSpace) { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.getByRole('menuitem', { name: label }).first().click(); return; }
      if (page.viewportSize().width < 768) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name: label }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name: label }).first().click(); }
    };
    const primaries = () => page.locator('main button[class*="primary"], main .mb-btn--primary').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length);

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();

    step(`[${width}] an EMPTY workspace: a warm start, one main action`);
    await account('فضای کاری تازه');
    await page.getByRole('radio', { name: 'کار یا کسب‌وکار' }).click(); await page.getByLabel('نام فضا', { exact: true }).fill(`کافهٔ من ${width}`);
    await page.getByRole('button', { name: 'ساختن فضا' }).click();
    await page.getByText(`خانه: کافهٔ من ${width}`).waitFor({ timeout: 8000 }).catch(async (e) => { await page.screenshot({ path: '/tmp/first3-fail.png' }); throw e; });
    await page.getByText('از همین‌جا شروع کن').waitFor();
    assert.equal(await page.getByRole('button', { name: 'شروع سریع' }).count() >= 1, true);
    assert.equal(await page.getByRole('button', { name: 'الان چه کاری ارزش دارد؟' }).count(), 0);
    await noMachineWords('empty home');
    await shot('1-empty-home');

    step(`[${width}] quick start, the 5 questions (no AI needed): two answers are enough`);
    await page.getByRole('button', { name: 'شروع سریع' }).first().click();
    await page.getByRole('button', { name: /به چند سؤال کوتاه جواب می‌دهم/ }).click();
    await page.getByLabel('روی چه کاری کار می‌کنی؟').fill('یک کافهٔ کوچک با قهوهٔ تخصصی');
    await page.getByLabel('مخاطب اصلی تو کیست؟').fill('کارمندان نزدیک محل');
    await noMachineWords('quick start');
    await shot('2-quickstart');
    await page.getByRole('button', { name: 'ثبت و ساخت بسته' }).click();
    await page.getByText('بستهٔ دانش تو آماده است').waitFor();
    await page.getByRole('button', { name: 'تمام شد' }).click();

    step(`[${width}] the first request for an AI: one line, one click, a text ready to paste`);
    await page.getByRole('button', { name: 'آماده‌سازی درخواست' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('درخواستت را در یک خط بنویس').fill('مخاطب اصلی ما کیست؟');
    await dlg.getByRole('button', { name: 'کپی برای استفاده در هر ابزار' }).click();
    await page.getByText(/کپی شد/).first().waitFor();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /mabda-pack:/);
    await noMachineWords('AI request');
    await shot('3-ai-request');
    await page.keyboard.press('Escape');

    step(`[${width}] the first knowledge in ONE box: kind and title are guessed, Ctrl+Enter saves`);
    await page.getByRole('button', { name: 'ثبت دانش' }).first().click();
    const box = page.getByRole('dialog').getByLabel('چه چیزی دربارهٔ کسب‌وکارت درست است؟');
    await box.fill('تخفیف نداریم.');
    assert.equal(await page.getByRole('dialog').getByRole('radio', { name: 'خط قرمز' }).getAttribute('aria-checked'), 'true', 'a red line was guessed');
    assert.equal(await page.getByRole('dialog').getByLabel('عنوان').inputValue(), 'تخفیف نداریم');
    // at most two fields in the first view: the text and the title (everything else sits behind «بیشتر»)
    const fields = await page.getByRole('dialog').locator('input:not([type=hidden]):not([type=search]), textarea, select').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length);
    assert.ok(fields <= 2, `at most two fields are seen first (${fields})`);
    await noMachineWords('record knowledge');
    await shot('4-record');
    await box.press('Control+Enter');
    await page.getByRole('button', { name: 'یکی دیگر' }).waitFor();
    const objs = (await api(`/workspaces/${(await api('/workspaces')).workspaces.find((w) => w.name === `کافهٔ من ${width}`).id}/state`)).objects;
    const mine = objs.find((o) => o.title === 'تخفیف نداریم');
    assert.ok(mine && mine.type === 'Constraint' && mine.status === 'Confirmed' && mine.provenance === 'User Input', 'the kind was the guess; status and source were not asked');
    await shot('5-saved');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  console.log('== first3: OK');
} finally {
  await browser?.close();
  for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
