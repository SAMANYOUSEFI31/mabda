#!/usr/bin/env node
/**
 * «بسته و درخواست برای AI: دقیقاً چه چیزی می‌آورد و چرا» on the showcase (قهوه), a REAL server + temp SQLite:
 * build a pack «پاسخ به مشتری» and, BEFORE copying, see which rule came and why; «با زیربخش‌ها»; «چه نیامد و چرا»; the rule opens
 * where its reach is decided; the preview text is the saved text; the request dialog has the same switch.
 * Screenshots → docs/screens/packscope-*.png
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'mabda-packscope-'));
let BASE = '';
const children = [];
const startServer = async (port, tag) => {
  BASE = `http://127.0.0.1:${port}`;
  children.push(spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(port), MABDA_DB_PATH: join(dir, `${tag}.sqlite`), MABDA_SECRET: 's', NODE_ENV: 'development' }, stdio: 'ignore', detached: true }));
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* retry */ } await wait(250); }
};
const call = async (method, path, body) => { const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return r.json(); };
const step = (m) => console.log('•', m);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const width of [1280, 390]) {
    const mobile = width < 768;
    const tag = mobile ? 'packscope-m' : 'packscope';
    await startServer(mobile ? 3152 : 3151, tag);
    const page = await (await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, locale: 'fa-IR', permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
    const errors = [];
    page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
    const shot = (n) => page.screenshot({ path: `docs/screens/${tag}-${n}-${width}.png` });
    const account = async (name) => {
      if (mobile) { await page.getByRole('button', { name: 'حساب کاربری' }).first().click(); await page.getByRole('dialog').getByRole('button', { name }).first().click(); }
      else { await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.getByRole('menuitem', { name }).first().click(); }
    };
    const nav = async (d, m) => { if (mobile) await page.locator(`nav[aria-label="منوی پایینی موبایل"] button:has-text("${m}")`).evaluate((n) => n.click()); else await page.locator(`nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${d}")`).evaluate((n) => n.click()); };
    const radio = (name) => page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click());
    /** the command palette: Ctrl/⌘+K on desktop, the header button on phones */
    const palette = async (q, hit) => {
      if (mobile) await page.getByRole('button', { name: 'جستجو' }).first().click(); else await page.keyboard.press('Control+KeyK');
      await page.getByRole('combobox', { name: 'جستجو' }).fill(q);
      await page.locator('[role=dialog] [role=option]').filter({ hasText: hit }).first().click();
    };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText(/^خانه: /).waitFor();
    await account('ساخت یا بازنشانی فضای نمونه');
    await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor({ timeout: 15000 });
    const wid = 'ws_demo';
    const api = (p) => call('GET', `/workspaces/${wid}${p}`);

    step(`[${width}] open «بسته‌های دانش» and start a pack for «پاسخ به مشتری»: the sections of «پشتیبانی» and «اشتراک ماهانه»`);
    await page.getByRole('button', { name: 'بیشتر' }).first().click();
    await page.getByRole('menuitem', { name: 'بسته‌های دانش' }).click();
    await page.getByRole('button', { name: 'بستهٔ تازه' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('نام بسته').fill('پاسخ به مشتری');
    for (const label of ['پشتیبانی و پس از فروش', 'اشتراک ماهانه']) await dlg.getByRole('checkbox', { name: new RegExp(`^(— )*${label}$`) }).evaluate((n) => n.click());
    const prev = dlg.getByTestId('pack-preview');
    await prev.getByTestId('scope-explain').waitFor();
    await page.waitForTimeout(600);
    await shot('1-preview');

    step(`[${width}] the rule is said in a sentence and the sub-sections come by default («با زیربخش‌ها»)`);
    assert.equal(await dlg.getByRole('checkbox', { name: 'زیربخش‌های بخش‌های انتخاب‌شده هم بیایند' }).isChecked(), true, 'a new pack reads the sub-sections');
    assert.match(await prev.getByTestId('scope-line').innerText(), /و زیربخش‌هایش/);
    assert.match(await prev.getByTestId('scope-line').innerText(), /«پشتیبانی و پس از فروش»/);
    assert.equal(await prev.getByTestId('explain-skipped').getByRole('heading', { name: /زیربخشی که انتخاب نشده/ }).count(), 0, 'nothing is left out for being a sub-section');

    step(`[${width}] every rule says where it comes from; «بدون تخفیف» comes from another section and reaches everywhere`);
    const guard = prev.getByTestId('explain-group-guardrail');
    await guard.waitFor();
    const noDiscount = guard.locator('li', { hasText: 'بدون تخفیف' });
    assert.ok((await noDiscount.count()) >= 1, 'the global rule is a guardrail of this pack');
    assert.match(await noDiscount.first().getByTestId('explain-from').innerText(), /همه‌جا/);
    assert.match(await guard.innerText(), /قید را نمی‌شود از بسته برداشت/, 'a rule cannot be removed from a pack — and the page says why');
    assert.equal(await guard.getByRole('button', { name: /^حذف|برداشتن/ }).count(), 0, 'no remove button for a rule');
    await shot('2-guardrails');

    step(`[${width}] «چه نیامد و چرا»: untick the sub-sections → the sub-section knowledge is left out WITH its reason; tick again → back`);
    const kids = dlg.getByRole('checkbox', { name: 'زیربخش‌های بخش‌های انتخاب‌شده هم بیایند' });
    await kids.evaluate((n) => n.click());
    await page.waitForTimeout(900);
    const left = prev.getByTestId('explain-skipped');
    await left.getByRole('button', { name: /چه نیامد و چرا/ }).click();
    await left.getByRole('heading', { name: /زیربخشی که انتخاب نشده/ }).waitFor();
    assert.match(await left.innerText(), /«ارسال و بسته‌بندی»|زیربخش «ارسال/, 'it names the sub-section that was left out');
    await shot('3-skipped');
    await kids.evaluate((n) => n.click());
    await page.waitForTimeout(900);
    assert.equal(await prev.getByTestId('explain-skipped').getByRole('heading', { name: /زیربخشی که انتخاب نشده/ }).count(), 0);

    step(`[${width}] «ببین و ویرایش»: the rule opens where its reach («محدودهٔ اثر») is decided, with a sentence of where it will come`);
    await noDiscount.first().getByRole('button', { name: /ببین یا ویرایش قید/ }).click();
    const detail = page.getByRole('dialog').last();
    await detail.getByRole('button', { name: 'بیشتر' }).click(); // the reach of a rule is a detail: under «بیشتر»
    await detail.getByTestId('reach-sentence').waitFor();
    assert.match(await detail.getByTestId('reach-sentence').innerText(), /همهٔ بسته‌ها و درخواست‌های AI/);
    await shot('4-rule-reach');
    await detail.getByRole('button', { name: 'انصراف' }).click();
    await prev.waitFor();

    step(`[${width}] the preview is exactly what is saved and copied`);
    await prev.getByRole('button', { name: 'متن دقیقی که کپی می‌شود' }).click();
    const shown = await prev.getByLabel('متن بسته (فقط‌خواندنی)').inputValue();
    await dlg.getByRole('button', { name: 'ذخیرهٔ بسته' }).click();
    await page.waitForTimeout(800);
    const saved = (await api('/saved-packs')).packs.find((p) => p.name === 'پاسخ به مشتری');
    assert.ok(saved && saved.selection.withChildren === true && saved.selection.nodeIds.length === 2, 'saved with both sections and the switch');
    const rendered = (await api(`/saved-packs/${saved.id}/render`)).markdown;
    const norm = (t) => t.replace(/<!-- mabda-pack:[^>]+ -->\n?/, '').trim();
    assert.equal(norm(rendered), norm(shown), 'the text she saw is the text that is copied');
    assert.ok(rendered.includes('تخفیف نداریم'), 'the rule that was named is in the text');
    await page.keyboard.press('Escape');

    step(`[${width}] «درخواست برای AI» has the same switch and says where each thing came from`);
    await page.getByRole('button', { name: 'درخواست برای AI' }).first().click();
    const rq = page.getByRole('dialog');
    await rq.getByLabel('درباره کجا؟').selectOption({ label: '— اشتراک ماهانه' }).catch(async () => { await rq.getByLabel('درباره کجا؟').selectOption({ index: 1 }); });
    await rq.getByLabel('درخواستت را در یک خط بنویس').fill('به مشتری ناراضی از ارسال چه بگویم؟');
    await rq.getByRole('checkbox', { name: 'زیربخش‌هایش هم بیایند' }).waitFor();
    await rq.getByRole('button', { name: /جزئیات/ }).click();
    await rq.getByRole('button', { name: /^شامل شد/ }).click();
    await rq.getByTestId('included-from').first().waitFor();
    assert.ok((await rq.getByTestId('included-from').count()) >= 1);
    await shot('5-request');

    assert.deepEqual(errors, []);
    await page.context().close();
  }
  console.log('== packscope: OK');
} finally {
  await browser?.close();
  for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
