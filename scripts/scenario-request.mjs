#!/usr/bin/env node
/**
 * «آماده‌سازی درخواست» on a REAL server + temp SQLite: the user opens the dialog from Home (default: سؤال, whole tree),
 * writes ONE line, copies — and the clipboard holds a prompt with the knowledge first, the rules of the kind, the
 * request at the end and the answer template; Proposed and samples are not in it; the answer comes back through import.
 * Screenshots → docs/screens/request-*.png (1280) and request-m-*.png (390)
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/scenario-request.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-request-'));
const PORT = 3114;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(PORT), MABDA_DB_PATH: join(dir, 'm.sqlite'), NODE_ENV: 'development' }, stdio: 'ignore', detached: true });
const api = async (path, method = 'GET', body) => (await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
const step = (m) => console.log('•', m);

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* retry */ } await wait(250); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  { const boot = await browser.newPage(); await boot.goto(BASE, { waitUntil: 'networkidle' }); await boot.getByText(/^خانه: /).waitFor(); await boot.close(); } // the first visit makes the workspace
  const wid = (await api('/workspaces')).workspaces[0].id;
  await api(`/workspaces/${wid}/starters/services/apply`, 'POST', {}); // grey samples exist and must stay out
  const mk = (b) => api(`/workspaces/${wid}/objects`, 'POST', { provenance: 'User Input', nodeId: 'business', ...b });
  await mk({ type: 'Fact', status: 'Confirmed', title: 'مخاطب اصلی', content: 'فریلنسرهای طراح مخاطب اصلی‌اند' });
  await mk({ type: 'Constraint', status: 'Confirmed', title: 'بدون تخفیف', content: 'هیچ تخفیفی نمی‌دهیم' });
  await mk({ type: 'Fact', status: 'Proposed', title: 'ادعای معلق', content: 'ادعای-معلق-نباید-بیاید' });

  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'request-m' : 'request';
    const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}.png` });
    const preview = () => page.getByRole('dialog').locator('textarea[readonly]').inputValue();

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();

    step(`[${width}] one click opens it with «سؤال» chosen; one line later the preview is ready`);
    await page.getByRole('button', { name: 'آماده‌سازی درخواست' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    assert.equal(await dlg.locator('[role=radio][aria-checked=true]').innerText(), 'سؤال');
    await dlg.locator('#ai-request-line').fill('مخاطب اصلی ما کیست؟');
    await page.waitForFunction(() => { const t = document.querySelector('dialog textarea[readonly], [role=dialog] textarea[readonly]'); return t && t.value.includes('## درخواست من') && t.value.includes('مخاطب اصلی ما کیست؟'); });
    const q = await preview();
    const at = (s) => q.indexOf(s);
    assert.ok(at('<documents') < at('## قواعد این کار') && at('## قواعد این کار') < at('## درخواست من') && at('## درخواست من') < at('## قالب پاسخ'), 'data → rules → request → template');
    assert.ok(q.includes('فریلنسرهای طراح') && q.includes('هیچ تخفیفی نمی‌دهیم'));
    assert.ok(!q.includes('ادعای-معلق-نباید-بیاید'), 'Proposed is not fact');
    assert.ok(!q.includes('نمونه') || !(await api(`/workspaces/${wid}/state`)).samples.some((s) => q.includes(s.content)), 'no sample text');
    await shot('1-question');

    step(`[${width}] switch to «ممیزی»: the rules change; the left-out list tells why`);
    await dlg.getByRole('radio', { name: 'ممیزی' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] textarea[readonly]')].some((t) => t.value.includes('قواعد این کار (ممیزی)')));
    await dlg.getByRole('button', { name: /مورد از دانشت/ }).click(); // what goes in is one click away, not in the way
    await dlg.getByRole('button', { name: /^خارج شد/ }).click();
    await dlg.getByText(/تأییدنشده \(واقعیت نیست\)/).first().waitFor();
    assert.ok((await dlg.innerText()).includes('ادعای معلق'));
    await shot('2-audit');

    step(`[${width}] copy: the clipboard holds exactly the preview, and the answer comes back through import`);
    await dlg.getByRole('button', { name: 'کپی برای استفاده در هر ابزار' }).click();
    await page.getByText(/کپی شد/).first().waitFor();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(clip.replace(/\s+$/, ''), (await preview()).replace(/\s+$/, ''));
    const marker = clip.match(/<!-- mabda-pack:([A-Za-z0-9_-]+) -->/)?.[1];
    assert.ok(marker, 'the pack marker links the answer');
    assert.ok((await api(`/workspaces/${wid}/packs`)).packs.some((p) => p.id === marker), 'the request is recorded');

    await dlg.getByRole('button', { name: 'بیشتر' }).click(); await page.getByRole('menuitem', { name: 'وارد کردن متن آماده' }).click();
    const imp = page.getByRole('dialog').filter({ hasText: 'وارد کردن متن آماده' });
    await imp.waitFor();
    await imp.getByLabel('پاسخ AI').fill(`نقل‌قول‌ها: «فریلنسرهای طراح»\n\n## Asset: گزارش ممیزی\nطرح با خط قرمز «بدون تخفیف» جور است.\n\n## Question: بودجه چقدر است؟\nلازم دارم.`);
    await imp.getByRole('button', { name: 'تبدیل به بلوک' }).click();
    await imp.getByText('گزارش ممیزی').first().waitFor();
    assert.ok((await imp.innerText()).includes('اصالت'), 'the lineage of the pack is attached');
    await shot('3-import');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  console.log('== request: OK');
} finally {
  await browser?.close();
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
