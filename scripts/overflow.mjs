#!/usr/bin/env node
/**
 * The scroll walk (part of `bun run screens`): at 390, 768, 1024, 1280 and 1440 it visits every page and every view, opens every
 * dialog it can reach (each «بیشتر» menu of a page, and every command of the palette), switches every tab inside it, and fails when
 *   - anything scrolls sideways that was not made to (a wide table, the canvas and code are), or the page itself is wider than the window;
 *   - a tab bar (tabs or segmented control) scrolls up and down;
 *   - a number is written in Latin digits inside Persian text (or alone), outside code, keys and dir=ltr.
 * Usage: node scripts/overflow.mjs [baseUrl]   (default http://localhost:3100)
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3100';
const WIDTHS = (process.env.WIDTHS || '390,768,1024,1280,1440').split(',').map(Number);

const measure = () => {
  const MEANT = '.mb-table-wrap, [data-testid=canvas-stage], pre, code, [data-scroll-x]';
  const name = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}${e.getAttribute('role') ? `[${e.getAttribute('role')}]` : ''}"${(e.getAttribute('aria-label') || '').slice(0, 24)}"`;
  const widest = (box) => [...box.querySelectorAll('*')].filter((c) => c.getBoundingClientRect().width > 0 && (c.getBoundingClientRect().left < box.getBoundingClientRect().left - 1 || c.getBoundingClientRect().right > box.getBoundingClientRect().right + 1)).slice(-1).map(name)[0] ?? '';
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.push(`page is ${de.scrollWidth - de.clientWidth}px wider than the window ← ${widest(document.body)}`);
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[inert]') || el.closest(MEANT)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.clientWidth === 0) continue;
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) out.push(`sideways: ${name(el)} by ${el.scrollWidth - el.clientWidth}px ← ${widest(el)}`);
    if (el.matches('[role=tablist], .mb-tabs') && /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) out.push(`tab bar scrolls up/down: ${name(el)}`);
  }
  // Latin digits in Persian text: every number a person reads goes through formatNumber (a key or a code is marked dir=ltr)
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const v = t.textContent ?? '';
    if (!/[0-9]/.test(v) || !/[\u0600-\u06FF]|^\s*\(?[0-9]+\)?\s*$/.test(v)) continue;
    const el = t.parentElement;
    if (!el || el.closest('[dir=ltr], code, pre, kbd, svg, script, style, [inert], [aria-hidden=true], [data-testid=canvas-stage]')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    out.push(`Latin digits: «${v.trim().slice(0, 40)}» in ${name(el)}`);
  }
  return out;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const found = new Map(); // problem → where
const note = (where, list) => { for (const p of list) if (!found.has(p)) found.set(p, where); };

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, locale: 'fa-IR' });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((wide) => { localStorage.clear(); if (wide) localStorage.setItem('mabda.sidebar', 'docked'); }, width >= 1024);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const settle = () => page.waitForTimeout(450);
  const check = async (where) => note(`${width} ${where}`, await page.evaluate(measure));
  const escAll = async () => { for (let i = 0; i < 4 && await page.locator('[role=dialog]:not([inert] *), [role=alertdialog], [role=menu]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } };
  // inside an open dialog: every tab and every segment, one after another
  const walkDialog = async (where) => {
    await check(where);
    const dlg = page.locator('[role=dialog]').last();
    for (const sel of ['[role=tab]', '.mb-seg [role=radio]']) {
      const n = Math.min(await dlg.locator(sel).count(), 8);
      for (let i = 0; i < n; i++) { const t = dlg.locator(sel).nth(i); if (await t.isVisible() && await t.isEnabled()) { await t.click().catch(() => {}); await settle(); await check(`${where} › ${(await t.textContent())?.trim()}`); } }
    }
  };
  const PAGES = [['home', 'خانه'], ['thinking', 'فکر'], ['context', width < 768 ? 'منبع' : 'منبع حقیقت'], ['assets', 'خروجی‌ها']];
  for (const [id, label] of PAGES) {
    const nav = width < 768 ? page.getByRole('navigation', { name: 'منوی پایینی موبایل' }) : page.getByRole('navigation', { name: 'بخش‌های اصلی نرم‌افزار' });
    await nav.getByRole('button', { name: label, exact: true }).first().click().catch(() => {});
    await settle(); await check(id);
    // every view of the page
    const segs = page.locator('main .mb-seg [role=radio]');
    for (let i = 0; i < await segs.count(); i++) { await segs.nth(i).click().catch(() => {}); await settle(); await check(`${id} › ${(await segs.nth(i).textContent())?.trim()}`); }
    if (await segs.count()) { await segs.first().click().catch(() => {}); await settle(); }
    // every item of the page's menus that opens a dialog
    const menus = page.locator('main [aria-haspopup=menu]');
    for (let m = 0; m < Math.min(await menus.count(), 4); m++) {
      await menus.nth(m).click().catch(() => {}); await settle();
      const items = await page.locator('[role=menu] [role=menuitem]').allTextContents();
      await page.keyboard.press('Escape');
      for (const it of items.map((t) => t.trim()).filter(Boolean)) {
        if (/حذف|بایگانی|خروج|بازسازی|پاک/.test(it)) continue; // nothing destructive in a walk
        await menus.nth(m).click().catch(() => {}); await settle();
        await page.getByRole('menuitem', { name: it, exact: true }).first().click().catch(() => {}); await settle();
        if (await page.locator('[role=dialog]').count()) await walkDialog(`${id} › ${it}`); else await check(`${id} › ${it}`);
        await escAll();
      }
    }
  }
  // every command of the palette
  await page.keyboard.press('Control+KeyK'); await settle();
  const cmds = (await page.locator('[role=dialog] [role=option]').allTextContents()).map((t) => t.trim()).filter(Boolean).slice(0, 30);
  await escAll();
  for (const c of cmds) {
    await page.keyboard.press('Control+KeyK'); await settle();
    await page.locator('[role=dialog] [role=option]').filter({ hasText: c }).first().click().catch(() => {}); await settle();
    if (await page.locator('[role=dialog]').count()) await walkDialog(`palette › ${c.slice(0, 30)}`); else await check(`palette › ${c.slice(0, 30)}`);
    await escAll();
  }
  await ctx.close();
}
await browser.close();
if (found.size) {
  console.log(`\nscroll walk: ${found.size} problem(s)`);
  for (const [p, where] of found) console.log(`  [${where}] ${p}`);
  process.exit(1);
}
console.log('scroll walk clean');
