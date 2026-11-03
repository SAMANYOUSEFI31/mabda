#!/usr/bin/env node
/**
 * The thinking structure on a REAL server + temp SQLite: the user writes several marker lines in one note, «خانه» shows the
 * open questions and decisions, an assumption is converted (Proposed), then confirmed — and still never reaches an AI as a
 * fact (checked on the Context pack the server builds).
 * Screenshots → docs/screens/thinking-*.png
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-thinking.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-think-'));
const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const api = async (path, method = 'GET', body) => (await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
const step = (m) => console.log('•', m);

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'thinking-m' : 'thinking';
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).click(); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).click(); };
    const unique = `${width}-${Date.now()}`;
    const Q = `آیا برای مشتری‌های سازمانی فاکتور رسمی بدهیم؟ ${unique}`;
    const D = `نحوهٔ محاسبهٔ مالیات ارسال ${unique}`;
    const A = `مشتری‌ها از پیام‌رسان بیشتر از ایمیل جواب می‌دهند ${unique}`;
    const I = `کارت پستالی توی هر بسته ${unique}`;

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();

    step(`[${width}] write one note with several marker lines`);
    // the note (several marker lines) is written the way the old box did — through the API; the NEW ways to write a thought are in scenario-thinking-space
    await api('/workspaces/ws_studio/notes', 'POST', { nodeId: 'business', content: `فکرهای امروز\n[سؤال] ${Q}\n[تصمیم باز] ${D}\n[فرض] ${A}\n[ایده] ${I}\nاین [فرض] وسط خط است ${unique}` });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await nav('منبع حقیقت', 'منبع');
    await page.locator('[role=radio]').filter({ hasText: /^ساختار$/ }).first().evaluate((n) => n.click());
    await page.getByTestId('open-thoughts').first().waitFor();
    await shot('1-node');

    step(`[${width}] «خانه»: the open question and the open decision are collected; an idea and an assumption are not «open»`);
    await nav('خانه', 'خانه');
    // the home says it in ONE line («N سؤال یا تصمیم باز…» + «ببین»); the full list is under «همه»
    await page.getByText(/سؤال یا تصمیم باز در یادداشت/).waitFor();
    await page.getByRole('button', { name: 'ببین' }).first().click();
    const space = page.getByTestId('thinking-space');
    await space.waitFor();
    await space.getByText(Q).first().waitFor();
    await space.getByText(D).first().waitFor();
    await space.getByText(I).first().waitFor(); // the space shows ideas too (they are thoughts); the HOME line counts only questions and open decisions
    assert.equal(await space.getByText(`وسط خط ${unique}`).count(), 0, 'a marker in the middle of a line is nothing');
    await shot('2-home');

    step(`[${width}] convert the assumption: the form is PREFILLED, saved as PROPOSED, flagged, with the note line as its quote`);
    const row = space.locator('li').filter({ hasText: A });
    await row.getByRole('button', { name: 'به دانش ببر' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ذخیره' }).first().click();
    await page.waitForTimeout(800);
    const st1 = await api('/workspaces/ws_studio/state');
    const made = st1.objects.find((o) => o.content === A);
    assert.ok(made, 'the object exists');
    assert.deepEqual([made.type, made.status, made.assumption, made.source?.kind, made.source?.quote], ['Fact', 'Proposed', true, 'note', A]);
    assert.equal(st1.objects.filter((o) => o.content === Q || o.content === I).length, 0, 'a question and an idea are not converted on their own');
    assert.ok(st1.notes.some((n) => n.content.includes(`[فرض] ${A}`)), 'the note text is untouched');
    await shot('3-converted');

    step(`[${width}] confirmed, it is STILL not a fact for an AI: the pack puts it in its own section with the rule; note lines are absent`);
    await api(`/workspaces/ws_studio/objects/${made.id}`, 'PATCH', { status: 'Confirmed' });
    const pack = await api('/workspaces/ws_studio/packs', 'POST', {});
    const md = pack.markdown;
    const confirmedBlock = md.slice(md.indexOf('## واقعیت‌های تأییدشده'), md.indexOf('## پیشنهادی') > 0 ? md.indexOf('## پیشنهادی') : md.indexOf('## فرض‌های فعال'));
    assert.ok(!confirmedBlock.includes(A), 'not in the confirmed block');
    assert.match(md, new RegExp(`## فرض‌های فعال، تأییدنشده[\\s\\S]*${A}`));
    assert.ok(md.includes('فرض‌اند، نه واقعیت'), 'the explicit instruction is there');
    for (const t of [Q, D, I]) assert.ok(!md.includes(t), 'a note line never reaches the pack');
    assert.deepEqual(errors, [], 'no page errors');
    await page.context().close();
  }
  console.log('\nOK');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  try { process.kill(-child.pid); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
