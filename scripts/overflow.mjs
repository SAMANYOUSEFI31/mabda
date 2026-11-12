#!/usr/bin/env node
/**
 * The scroll walk (part of `bun run screens`): at 390, 768, 1024, 1280 and 1440 it visits every page and every view, opens every
 * dialog it can reach (each «بیشتر» menu of a page, and every command of the palette), switches every tab inside it, and fails when
 *   - anything scrolls sideways that was not made to (a wide table, the canvas and code are), or the page itself is wider than the window;
 *   - a tab bar (tabs or segmented control) scrolls up and down;
 *   - a number is written in Latin digits inside Persian text (or alone), outside code, keys and dir=ltr;
 *   - the page moves sideways: the body and the main column must sit at the same x on every page, view and with any dialog open
 *     (a scrollbar appearing on a long page, or the page locking under a dialog, must not push anything; layout.md «اسکرول»);
 *   - a dialog's top edge moves when one of its tabs is switched;
 *   - a tab, segment or button label is cut short with «…».
 * It runs with real scrollbars (Playwright hides them by default), so a bar that takes room is measured.
 * Usage: node scripts/overflow.mjs [baseUrl]   (default http://localhost:3100)
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3100';
// sizes: width x height, «t» = a touch device (layout.md «چرخش و قد کوتاه»): the five widths standing, then a phone on its side,
// a tablet on its side and a short laptop window. WIDTHS=… still picks plain widths at the usual height.
const SIZES = (process.env.WIDTHS ? process.env.WIDTHS.split(',').map((w) => `${w}x${Number(w) < 768 ? 844 : 900}${Number(w) < 768 ? 't' : ''}`)
  : (process.env.SIZES || '390x844t,768x900,1024x900,1280x900,1440x900,844x390t,1024x768t,1280x600').split(','))
  .map((s) => { const m = /^(\d+)x(\d+)(t?)$/.exec(s); return { width: Number(m[1]), height: Number(m[2]), touch: !!m[3] }; });

const measure = (userText = '') => {
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
  // a label cut short with «…» in a tab, a segment or a button loses its meaning (the full name in a tooltip is not enough on touch)
  for (const el of document.querySelectorAll('.mb-tab__label, .mb-tab, .mb-btn, .mb-bottomnav__item, [role=tab], [role=menuitem]')) {
    if (el.closest('[inert]')) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().width > 0) out.push(`label cut short: «${(el.textContent || '').trim().slice(0, 30)}» in ${name(el)}`);
  }
  // at most two layers over the page (overlays.md): a dialog and one thing on it (a menu, a calendar, a confirmation)
  const layers = [...document.querySelectorAll('.mb-dialog-layer:not(.is-inline):not([data-state=closed]), [role=menu]')].filter((l) => !l.closest('[inert]') && l.getBoundingClientRect().height > 0);
  if (layers.length > 2) out.push(`${layers.length} layers open at once: ${layers.map(name).join(' › ')}`);
  // Latin digits in Persian text: every number a person reads goes through formatNumber (a key or a code is marked dir=ltr)
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const v = t.textContent ?? '';
    if (!/[0-9]/.test(v) || !/[\u0600-\u06FF]|^\s*\(?[0-9]+\)?\s*$/.test(v)) continue;
    const el = t.parentElement;
    if (!el || el.closest('[dir=ltr], code, pre, kbd, svg, script, style, [inert], [aria-hidden=true], [data-testid=canvas-stage]')) continue;
    // her own words keep the digits she typed: only the app's own text is held to Persian digits
    if (userText && /[^\s0-9.,٫/()]{2}/.test(v) && userText.includes(v.trim())) continue;
    // …also when her words sit inside an app sentence («"Plan 2" با هم نمی‌خوانند»): every word that has a Latin digit is hers
    const words = (v.match(/[^\s«»"'،؛:()]*[0-9][^\s«»"'،؛:()]*/g) || []).map((x) => x.replace(/[.,!?؟]+$/, ''));
    // a bare number is the app's own (a count, a date), never excused: only words with letters in them can be hers
    if (userText && words.length && words.every((x) => /[^0-9.,٫/]/.test(x) && userText.includes(x))) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    out.push(`Latin digits: «${v.trim().slice(0, 40)}» in ${name(el)}`);
  }
  return out;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'], ignoreDefaultArgs: ['--hide-scrollbars'] });
const found = new Map(); // problem → where
const note = (where, list) => { for (const p of list) if (!found.has(p)) found.set(p, where); };

for (const { width: w0, height, touch } of SIZES) {
  // a size is named by its width, and by width×height when it is not the usual standing one
  const width = w0;
  const label = (height === (w0 < 768 ? 844 : 900)) ? `${w0}` : `${w0}×${height}`;
  // a phone is a phone: touch, and the system's overlay scrollbars that take no room (a desktop window keeps its classic bar)
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'fa-IR', ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((wide) => { localStorage.clear(); if (wide) localStorage.setItem('mabda.sidebar', 'docked'); }, width >= 1024);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const settle = () => page.waitForTimeout(450);
  // everything she wrote (titles, texts, notes, thoughts, names) in every space, to tell her words from the app's
  const userText = await page.evaluate(async () => {
    const boot = await (await fetch('/api/workspaces')).json().catch(() => ({}));
    const ids = (boot.workspaces ?? []).map((w) => w.id);
    const all = await Promise.all(ids.map((id) => fetch(`/api/workspaces/${id}/state`).then((r) => r.text()).catch(() => '')));
    return all.map((t) => { try { return JSON.stringify(JSON.parse(t)); } catch { return ''; } }).join('\n');
  });
  let base = null; // where the body and the main column sit on the first page; every later check must match it
  const place = () => page.evaluate(() => { const b = document.body.getBoundingClientRect(), m = document.querySelector('main')?.getBoundingClientRect(); return { b: [b.left, b.right], m: m ? [m.left, m.right] : null }; });
  const check = async (where) => {
    note(`${label} ${where}`, await page.evaluate(measure, userText));
    const at = await place();
    if (!base) { base = at; return; }
    const moved = [['body', at.b, base.b], ['main', at.m, base.m]].filter(([, a, z]) => a && z && (Math.abs(a[0] - z[0]) > 0.5 || Math.abs(a[1] - z[1]) > 0.5));
    note(`${label} ${where}`, moved.map(([n, a, z]) => `layout moved sideways: ${n} ${Math.round(z[0])}–${Math.round(z[1])} → ${Math.round(a[0])}–${Math.round(a[1])}`));
  };
  // after scrolling: nothing that stays pinned (the app's bar, a page's own bar, the phone's bottom bar) covers another pinned thing,
  // and every control inside a pinned bar can still be reached where it is drawn (layout.md «چه چیزی بالا می‌ماند»)
  const pinCheck = async (where) => {
    const tall = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 200);
    if (!tall) return;
    await page.evaluate(() => window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - innerHeight) * 0.6)));
    await page.waitForTimeout(400);
    note(`${label} ${where} (scrolled)`, await page.evaluate(() => {
      const out = [];
      const name = (e) => `${e.tagName.toLowerCase()}${e.dataset.testid ? `[${e.dataset.testid}]` : ''}${e.dataset.pin ? `[pin=${e.dataset.pin}]` : ''}"${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20)}"`;
      const pinned = [...document.querySelectorAll('body *')].filter((e) => {
        if (e.closest('[inert], [role=dialog], .mb-toast-stack, .mb-dialog-layer')) return false;
        const cs = getComputedStyle(e); if (cs.position !== 'sticky' && cs.position !== 'fixed') return false;
        const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== 'hidden';
      });
      // the bars themselves: two pinned bars that are not one inside the other must not share any pixel
      for (let i = 0; i < pinned.length; i++) for (let j = i + 1; j < pinned.length; j++) {
        const a = pinned[i], b = pinned[j]; if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 1 && h > 1) out.push(`pinned ${name(a)} and ${name(b)} overlap by ${Math.round(h)}px`);
      }
      // every control in a pinned bar answers a tap at its own center
      for (const bar of pinned) for (const c of bar.querySelectorAll('button, a[href], input, [role=button], [role=tab]')) {
        const r = c.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && !c.contains(hit) && !hit.contains(c)) out.push(`${name(c)} is covered by ${name(hit.closest('[data-pin], .mb-bottomnav, aside, header') || hit)}`);
      }
      return out;
    }));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  };
  const escAll = async () => { for (let i = 0; i < 4 && await page.locator('[role=dialog]:not([inert] *), [role=alertdialog], [role=menu]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); } };
  // inside an open dialog: every tab and every segment, one after another
  const walkDialog = async (where) => {
    await check(where);
    const dlg = page.locator('[role=dialog]').last();
    // switching a tab must not move the dialog's title (it hangs from a fixed top edge and grows downward)
    const top = async () => (await dlg.boundingBox().catch(() => null))?.y ?? null;
    // measured once the dialog has finished arriving (its slide or pop, and a lazy body)
    const still = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 3000 }).catch(() => {});
    await still(); await page.waitForTimeout(300);
    const top0 = await top();
    for (const sel of ['[role=tab]', '.mb-seg [role=radio]']) {
      const n = Math.min(await dlg.locator(sel).count(), 8);
      for (let i = 0; i < n; i++) {
        const t = dlg.locator(sel).nth(i);
        if (!(await t.isVisible() && await t.isEnabled())) continue;
        const label = (await t.textContent())?.trim();
        await t.click().catch(() => {}); await settle(); await still(); await check(`${where} › ${label}`);
        const y = await top();
        if (top0 !== null && y !== null && Math.abs(y - top0) > 0.5) note(`${label} ${where} › ${label}`, [`dialog moved up/down on a tab switch: top ${Math.round(top0)} → ${Math.round(y)}`]);
      }
    }
  };
  const PAGES = [['home', 'خانه'], ['thinking', 'فکر'], ['context', width < 768 ? 'منبع' : 'منبع حقیقت'], ['assets', 'خروجی‌ها']];
  for (const [id, label] of PAGES) {
    const nav = width < 768 ? page.getByRole('navigation', { name: 'منوی پایینی موبایل' }) : page.getByRole('navigation', { name: 'بخش‌های اصلی نرم‌افزار' });
    await nav.getByRole('button', { name: label, exact: true }).first().click().catch(() => {});
    await settle(); await check(id); await pinCheck(id);
    // every view of the page
    const segs = page.locator('main .mb-seg [role=radio]');
    for (let i = 0; i < await segs.count(); i++) { await segs.nth(i).click().catch(() => {}); await settle(); const v = `${id} › ${(await segs.nth(i).textContent())?.trim()}`; await check(v); await pinCheck(v); }
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
  // inside a section of the structure view: its path bar pins under the app's bar
  {
    const nav = width < 768 ? page.getByRole('navigation', { name: 'منوی پایینی موبایل' }) : page.getByRole('navigation', { name: 'بخش‌های اصلی نرم‌افزار' });
    await nav.getByRole('button', { name: width < 768 ? 'منبع' : 'منبع حقیقت', exact: true }).first().click().catch(() => {}); await settle();
    await page.locator('main .mb-seg [role=radio]').filter({ hasText: 'ساختار' }).first().click().catch(() => {}); await settle();
    await page.locator('main').getByRole('button', { name: /^رفتن به بخش / }).first().click({ timeout: 3000 }).catch(() => {}); await settle();
    if (await page.getByTestId('focus-bar').count()) await pinCheck('context › section'); else note(`${label} context › section`, ['walk could not enter a section']);
    await page.getByTestId('focus-bar').getByRole('button', { name: /^برگشت/ }).first().click().catch(() => {}); await settle();
  }
  // the knowledge edit dialog (it has tabs: «ویرایش · نسخه‌ها · اطراف این مورد»), opened from the first row of the table view
  {
    const nav = width < 768 ? page.getByRole('navigation', { name: 'منوی پایینی موبایل' }) : page.getByRole('navigation', { name: 'بخش‌های اصلی نرم‌افزار' });
    await nav.getByRole('button', { name: width < 768 ? 'منبع' : 'منبع حقیقت', exact: true }).first().click().catch(() => {}); await settle();
    const views = page.locator('main [aria-haspopup=menu]').first();
    await views.click().catch(() => {}); await settle();
    await page.getByRole('menuitem', { name: 'جدول', exact: true }).first().click().catch(() => page.keyboard.press('Escape')); await settle();
    // wide: the row's «ویرایش»; phone: the rows are cards, each one opens its knowledge
    const edit = width < 768 ? page.locator('main .md\\:hidden [role=button][data-knowledge]') : page.locator('main').getByRole('button', { name: 'ویرایش', exact: true });
    await edit.first().click({ timeout: 3000 }).catch(() => {}); await settle();
    if (await page.locator('[role=dialog]').count()) await walkDialog('knowledge edit'); else note(`${label} knowledge edit`, ['walk could not open the knowledge edit dialog']);
    await escAll();
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
