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
  // …nor spills past its own control (a one-word label wider than its column at 200% text, WCAG 1.4.4): every label of a phone bar
  // item, a tab, a segment, a button or a sidebar place stays inside the control that owns it
  for (const lab of document.querySelectorAll('.mb-bottomnav__label, .mb-tab__label, .mb-btn__label, nav button span')) {
    if (lab.closest('[inert], [aria-hidden=true], .mb-sr')) continue;
    const own = lab.closest('.mb-bottomnav__item, .mb-tab, .mb-btn, button'); if (!own) continue;
    const r = lab.getBoundingClientRect(), o = own.getBoundingClientRect(); if (!r.width || !o.width) continue;
    const range = document.createRange(); range.selectNodeContents(lab); const t = range.getBoundingClientRect();
    const L = Math.min(r.left, t.width ? t.left : r.left), R = Math.max(r.right, t.width ? t.right : r.right);
    if (L < o.left - 1 || R > o.right + 1) out.push(`label spills out of its control: «${(lab.textContent || '').trim().slice(0, 30)}» ${Math.round(R - L)}px in ${Math.round(o.width)}px (${name(own)})`);
  }
  // at most two layers over the page (overlays.md): a dialog and one thing on it (a menu, a calendar, a confirmation)
  const layers = [...document.querySelectorAll('.mb-dialog-layer:not(.is-inline):not([data-state=closed]), [role=menu]')].filter((l) => !l.closest('[inert]') && l.getBoundingClientRect().height > 0);
  if (layers.length > 2) out.push(`${layers.length} layers open at once: ${layers.map(name).join(' › ')}`);
  // a floating layer (menu, popover) sits below the pinned top bars, above the phone's bottom bar and inside the content's side
  // margins of what opened it (overlays.md «جای لایه‌های شناور»)
  for (const f of document.querySelectorAll('[role=menu].is-portal, .mb-popover__panel.is-portal')) {
    if (f.dataset.state === 'closed') continue;
    const r = f.getBoundingClientRect(); if (!r.width) continue;
    const opener = document.querySelector(`[aria-controls="${f.id}"]`);
    // it is seen: what is drawn at its middle is the layer itself, not something over it
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + Math.min(r.bottom, innerHeight)) / 2);
    if (hit && !f.contains(hit)) out.push(`floating layer is covered: ${name(f)} under ${name(hit)}`);
    for (const bar of document.querySelectorAll('[data-pin], .mb-bottomnav.is-fixed')) {
      if (opener && bar.contains(opener)) continue;
      const pos = getComputedStyle(bar).position; if (pos !== 'fixed' && pos !== 'sticky') continue;
      const q = bar.getBoundingClientRect(); if (!q.height || q.bottom <= 0 || q.top >= innerHeight) continue;
      const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top), w = Math.min(r.right, q.right) - Math.max(r.left, q.left);
      if (h > 1 && w > 1) out.push(`floating layer covers a pinned bar: ${name(f)} over ${name(bar)} by ${Math.round(h)}px`);
    }
    const main = opener?.closest('main');
    if (main && !opener.closest('[role=dialog]')) {
      const m = main.getBoundingClientRect(), cs = getComputedStyle(main);
      const l = m.left + parseFloat(cs.paddingLeft), rr = m.right - parseFloat(cs.paddingRight);
      if (r.left < l - 1 || r.right > rr + 1) out.push(`floating layer past the content margin: ${name(f)} ${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(l)}–${Math.round(rr)}`);
    }
  }
  // what a dialog says it will do is seen before she decides (layout.md «چرخش و قد کوتاه»): a description is never hidden or cut off
  for (const d of document.querySelectorAll('.mb-dialog-layer:not([data-state=closed]) .mb-dialog__desc')) {
    if (d.closest('[inert]')) continue;
    const r = d.getBoundingClientRect(), frame = d.closest('.mb-dialog')?.getBoundingClientRect();
    const seen = getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden' && r.height > 0 && (!frame || (r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1)) && r.top >= 0 && r.bottom <= innerHeight;
    if (!seen) out.push(`dialog description not visible: «${(d.textContent || '').trim().slice(0, 30)}»`);
  }
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
  // TEXT=200: the browser's own text size at 200% (WCAG 1.4.4); the page zoom at 200% is the 640×450 size (a 1280×900 window)
  if (process.env.TEXT) await page.addInitScript((p) => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = `${p}%`; }); }, Number(process.env.TEXT));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((wide) => { localStorage.clear(); if (wide) localStorage.setItem('mabda.sidebar', 'docked'); }, width >= 1024);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const settle = () => page.waitForTimeout(450);
  // between checks, every frame: did the page get wider than the window even for a moment (an entering slide)? On a phone the
  // browser then zooms out and the whole page slips (layout.md «بی‌جابه‌جایی»)
  await page.evaluate(() => { window.__wide = ''; const tick = () => { const d = document.documentElement; if (!window.__wide && d.scrollWidth > d.clientWidth + 1) { const e = [...document.querySelectorAll('main *')].find((x) => { const r = x.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > d.clientWidth + 1); }); window.__wide = `${d.scrollWidth - d.clientWidth}px ← ${e ? e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] : '?'}`; } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
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
    const wide = await page.evaluate(() => { const w = window.__wide; window.__wide = ''; return w; }).catch(() => '');
    if (wide) note(`${label} ${where}`, [`page got wider than the window for a moment on the way here: ${wide}`]);
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
        const tab = (await t.textContent())?.trim();
        await t.click().catch(() => {}); await settle(); await still(); await check(`${where} › ${tab}`);
        const y = await top();
        if (top0 !== null && y !== null && Math.abs(y - top0) > 0.5) note(`${label} ${where} › ${tab}`, [`dialog moved up/down on a tab switch: top ${Math.round(top0)} → ${Math.round(y)}`]);
      }
    }
  };
  // the docked sidebar at its narrowest and widest (navigation.md «تغییر اندازه»), and the rail: every control and its hover
  // background stays inside the bar; only the resize grip straddles the edge on purpose
  if (width >= 1024) {
    const inside = () => page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('aside')) {
        if (!a.offsetWidth || a.closest('[role=dialog]')) continue;
        const ar = a.getBoundingClientRect();
        for (const c of a.querySelectorAll('button, a[href], [role=button]')) {
          const r = c.getBoundingClientRect(); if (!r.width) continue;
          if (r.left < ar.left - 0.5 || r.right > ar.right + 0.5) out.push(`sidebar control "${(c.getAttribute('aria-label') || c.textContent || '').trim().slice(0, 20)}" sticks out of the bar: ${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(ar.left)}–${Math.round(ar.right)}`);
        }
      }
      return out;
    });
    const grip = page.getByRole('separator', { name: 'پهنای نوار کناری' });
    for (const key of ['Home', 'End']) {
      if (!(await grip.isVisible().catch(() => false))) break;
      await grip.focus(); await page.keyboard.press(key); await settle();
      note(`${label} sidebar ${key === 'Home' ? 'narrowest' : 'widest'}`, await inside());
    }
    await grip.dblclick().catch(() => {}); await settle();
    base = null; // the sidebar's own width moves main by design; measure sideways moves from here
  }
  const PAGES = [['home', 'خانه'], ['thinking', 'فکر'], ['context', width < 768 ? 'منبع' : 'منبع حقیقت'], ['assets', 'خروجی‌ها']];
  for (const [id, label] of PAGES) {
    const nav = width < 768 ? page.getByRole('navigation', { name: 'منوی پایینی موبایل' }) : page.getByRole('navigation', { name: 'بخش‌های اصلی نرم‌افزار' });
    await nav.getByRole('button', { name: label, exact: true }).first().click().catch(() => {});
    await settle(); await check(id); await pinCheck(id);
    // every view of the page
    const segs = page.locator('main .mb-seg [role=radio]');
    for (let i = 0; i < await segs.count(); i++) {
      await segs.nth(i).click().catch(() => {}); await settle(); const v = `${id} › ${(await segs.nth(i).textContent())?.trim()}`; await check(v); await pinCheck(v);
      // a canvas view's «گزینه‌ها» popover
      const opts = page.locator('main').getByRole('button', { name: /^گزینه‌ها/ }).first();
      if (await opts.isVisible().catch(() => false)) { await opts.click().catch(() => {}); await settle(); await check(`${v} › گزینه‌ها`); await page.keyboard.press('Escape'); await settle(); }
    }
    if (await segs.count()) { await segs.first().click().catch(() => {}); await settle(); }
    // every item of the page's menus that opens a dialog
    const menus = page.locator('main [aria-haspopup=menu]');
    for (let m = 0; m < Math.min(await menus.count(), 4); m++) {
      await menus.nth(m).click().catch(() => {}); await settle();
      const items = await page.locator('[role=menu] [role=menuitem]').allTextContents();
      await check(`${id} › menu ${m + 1}`);
      await page.keyboard.press('Escape'); await settle();
      // the same menu opened from the bottom of the window (the case where it meets the phone's bottom bar)
      await menus.nth(m).evaluate((e) => e.scrollIntoView({ block: 'end' })).catch(() => {}); await settle();
      await menus.nth(m).click().catch(() => {}); await settle();
      await check(`${id} › menu ${m + 1} (at the bottom)`);
      await page.keyboard.press('Escape'); await settle();
      await page.evaluate(() => window.scrollTo(0, 0)); await settle();
      for (const it of items.map((t) => t.trim()).filter(Boolean)) {
        // a destructive item is opened only to read its confirmation (what it will do must be visible), never confirmed; every write
        // to the server is refused meanwhile, so even an item that acts at once changes nothing
        const harm = /حذف|بایگانی|خروج|بازسازی|پاک/.test(it);
        if (harm) await page.route((u) => u.pathname.startsWith('/api/'), (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
        await menus.nth(m).click().catch(() => {}); await settle();
        await page.getByRole('menuitem', { name: it, exact: true }).first().click().catch(() => {}); await settle();
        if (harm) { if (await page.locator('[role=dialog], [role=alertdialog]').count()) await check(`${id} › ${it} (confirm)`); }
        else if (await page.locator('[role=dialog]').count()) await walkDialog(`${id} › ${it}`); else await check(`${id} › ${it}`);
        await escAll();
        // the refused writes leave «could not reach the server» notes; they are the walk's own doing, so they are cleared
        if (harm) { await page.unrouteAll({ behavior: 'ignoreErrors' }); for (const x of await page.locator('.mb-toast button').all()) await x.click().catch(() => {}); await settle(); }
      }
    }
  }
  // inside a section of the structure view: its path bar pins under the app's bar
  {
    const nav = width < 768 ? page.getByRole('navigation', { name: 'منوی پایینی موبایل' }) : page.getByRole('navigation', { name: 'بخش‌های اصلی نرم‌افزار' });
    await nav.getByRole('button', { name: width < 768 ? 'منبع' : 'منبع حقیقت', exact: true }).first().click().catch(() => {}); await settle();
    await page.locator('main .mb-seg [role=radio]').filter({ hasText: 'ساختار' }).first().click().catch(() => {}); await settle();
    await page.locator('main').getByRole('button', { name: /^رفتن به بخش / }).first().click({ timeout: 3000 }).catch(() => {}); await settle();
    if (await page.getByTestId('focus-bar').count()) { await check('context › section'); await pinCheck('context › section'); } else note(`${label} context › section`, ['walk could not enter a section']);
    // away and back: the section comes back as it was, without the page slipping
    await nav.getByRole('button', { name: 'فکر', exact: true }).first().click().catch(() => {}); await settle(); await check('thinking (from a section)');
    await nav.getByRole('button', { name: width < 768 ? 'منبع' : 'منبع حقیقت', exact: true }).first().click().catch(() => {}); await settle(); await check('context › section (back)');
    await page.getByTestId('focus-bar').getByRole('button', { name: /^برگشت/ }).first().click().catch(() => {}); await settle();
  }
  // the knowledge edit dialog (it has tabs: «ویرایش · نسخه‌ها · اطراف این مورد»), opened from the first row of the table view
  {
    const nav = width < 768 ? page.getByRole('navigation', { name: 'منوی پایینی موبایل' }) : page.getByRole('navigation', { name: 'بخش‌های اصلی نرم‌افزار' });
    await nav.getByRole('button', { name: width < 768 ? 'منبع' : 'منبع حقیقت', exact: true }).first().click().catch(() => {}); await settle();
    await page.locator('main .mb-seg [role=radio]').filter({ hasText: 'جدول' }).first().click().catch(() => {}); await settle();
    // wide: the row's «ویرایش»; phone: the rows are cards, each one opens its knowledge
    const edit = width < 768 ? page.locator('main .md\\:hidden [role=button][data-knowledge]') : page.locator('main').getByRole('button', { name: 'ویرایش', exact: true });
    await edit.first().click({ timeout: 3000 }).catch(() => {}); await settle();
    if (await page.locator('[role=dialog]').count()) await walkDialog('knowledge edit'); else { note(`${label} knowledge edit`, ['walk could not open the knowledge edit dialog']); }
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
// the on-screen keyboard (layout.md «صفحه‌کلید»): a headless browser has none, so a stand-in shrinks the visual viewport to 450px
// while a field has focus, as iOS reports it. Every field she types in stays inside what is still visible, and the phone bar steps aside
if (SIZES.some((s) => s.touch && s.width < 768)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    const t = new EventTarget(); let kb = false;
    const fake = { get height() { return kb ? 450 : innerHeight; }, get offsetTop() { return 0; }, get width() { return innerWidth; }, get offsetLeft() { return 0; }, get pageTop() { return scrollY; }, get scale() { return 1; }, addEventListener: (...a) => t.addEventListener(...a), removeEventListener: (...a) => t.removeEventListener(...a) };
    Object.defineProperty(window, 'visualViewport', { get: () => fake });
    const set = (on) => { kb = on; t.dispatchEvent(new Event('resize')); };
    document.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable) setTimeout(() => set(true), 30); });
    document.addEventListener('focusout', () => setTimeout(() => set(false), 30));
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const seen = (where) => page.evaluate((where) => {
    const a = document.activeElement, r = a?.getBoundingClientRect(), nav = document.querySelector('.mb-bottomnav.is-fixed');
    const out = [];
    if (!a || !/INPUT|TEXTAREA/.test(a.tagName)) return [`${where}: no field took focus`];
    if (r.top < 0 || r.bottom > 450) out.push(`${where}: the field being typed in is hidden by the keyboard (${Math.round(r.top)}–${Math.round(r.bottom)}, visible 0–450)`);
    if (nav && getComputedStyle(nav).display !== 'none') out.push(`${where}: the phone bar stays up over the keyboard`);
    return out;
  }, where);
  const k = (where, list) => note(`390 keyboard ${where}`, list);
  await page.getByRole('button', { name: 'جستجو' }).first().click(); await page.waitForTimeout(700); k('search', await seen('search'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  for (const kind of ['فکر', 'حقیقت']) {
    await page.locator('.mb-bottomnav__item.is-action').click(); await page.waitForTimeout(700);
    await page.locator('[role=dialog] [role=radio], [role=dialog] [role=tab]').filter({ hasText: new RegExp(`^${kind}$`) }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    for (const f of ['textarea', 'input:not([type=checkbox]):not([type=radio]):not([type=file])']) {
      const el = page.locator(`[role=dialog] ${f}:visible`).last(); if (!(await el.count())) continue;
      await el.focus(); await page.waitForTimeout(500); k(`add › ${kind} › ${f.split(':')[0]}`, await seen(`add › ${kind}`));
      await page.locator('[role=dialog] .mb-dialog__title, [role=dialog] h2').first().click().catch(() => {}); await page.waitForTimeout(200);
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
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
