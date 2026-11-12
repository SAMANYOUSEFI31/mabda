#!/usr/bin/env node
/**
 * Screenshot every main view at 390px and 1280px, light and dark, into docs/screens/ and print layout audit findings
 * (horizontal overflow, overlap, clipping, text < 12px, long text < 14px, touch targets < 44px, WCAG + APCA contrast, more than one primary).
 * Light files are <view>-<width>.png, dark files <view>-<width>-dark.png. SCHEMES=light (or dark) runs one mode only.
 * Usage: node scripts/screens.mjs [baseUrl]   (default http://localhost:3100)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = process.env.SCREENS_OUT || 'docs/screens';
mkdirSync(OUT, { recursive: true });

const SIZES = process.env.ALL_WIDTHS
  ? [[320, 640], [360, 740], [390, 844], [430, 932], [844, 390], [768, 1024], [1024, 768], [1280, 900], [1440, 900], [1920, 1080]].map(([width, height]) => ({ name: String(width) + (width > height ? 'l' : ''), width, height }))
  // plus a short laptop and a short phone: menus and dialogs that fit 900/844 can still break at 768/667 (implementation-plan 0.7)
  : [{ name: '390', width: 390, height: 844 }, { name: '1280', width: 1280, height: 900 }, { name: '1024', width: 1024, height: 768 }, { name: '390s', width: 390, height: 667 }];
const TABS = [
  { id: 'home', label: 'خانه' },
  { id: 'context', label: 'منبع', desktopLabel: 'منبع حقیقت' },
  { id: 'workstreams', label: 'خروجی‌ها', then: 'build' },
  { id: 'assets', label: 'خروجی‌ها' },
  { id: 'thinking', label: 'فکر' },
];

const audit = () => {
  const out = { overflow: null, tiny: [], smallBody: [], touch: [], contrast: [], edges: [], canvas: [], overlap: [], clipped: [], primaries: 0, dimmedChecked: 0 };
  // contrast: composite ancestor backgrounds, compare with text color (WCAG relative luminance)
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e); let bg = { r: 255, g: 255, b: 255, a: 1 }; for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = over(c, bg); } return bg; };
  // lapis actions actually painted: primary buttons that still wear the brand fill, plus «افزودن» in the bottom bar
  const lapis = getComputedStyle(document.documentElement).getPropertyValue('--button-primary-bg').trim();
  const probe = document.createElement('i'); probe.style.background = lapis; document.body.append(probe);
  const lapisRgb = getComputedStyle(probe).backgroundColor; probe.remove();
  out.primaries = [...document.querySelectorAll('.mb-btn--primary, .mb-bottomnav .is-action .mb-bottomnav__icon')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[inert]') && getComputedStyle(e).backgroundColor === lapisRgb; }).length;
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((e) => (e.getBoundingClientRect().right > de.clientWidth + 1 || e.getBoundingClientRect().left < -1) && e.getBoundingClientRect().width > 0 && !e.closest('[data-testid=canvas-stage]')).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}[${(e.getAttribute('data-testid') || e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20)}]`);
    out.overflow = `${de.scrollWidth} > ${de.clientWidth} ← ${wide.join(' | ')}`;
  }
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const fg = parse(getComputedStyle(el).color);
      // transparency of any ancestor (opacity-*) lowers the real contrast too — it is part of the measurement
      if (fg) { let op = 1; for (let a = el; a; a = a.parentElement) op *= parseFloat(getComputedStyle(a).opacity); fg.a *= op; }
      if (fg && !el.closest('[disabled], .is-disabled, :disabled')) {
        const bg = bgOf(el); const f = over(fg, bg);
        const l1 = lum(f), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const large = fs >= 24 || (fs >= 18.66 && parseInt(getComputedStyle(el).fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) out.contrast.push(`${ratio.toFixed(2)}:1 ${fs}px "${own.slice(0, 30)}"`);
        // APCA (perceptual, polarity-aware) floor next to WCAG: Lc 45 is the least for any readable text, 60 for running text ≥ 14px
        const ay = (c) => 0.2126729 * (c.r / 255) ** 2.4 + 0.7151522 * (c.g / 255) ** 2.4 + 0.072175 * (c.b / 255) ** 2.4;
        const cl = (v) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
        const yt = cl(ay(f)), yb = cl(ay(bg));
        const lc = Math.abs((yb > yt ? (yb ** 0.56 - yt ** 0.57) * 1.14 - 0.027 : (yb ** 0.65 - yt ** 0.62) * 1.14 + 0.027) * 100);
        if (lc < (own.length > 30 && fs < 18 ? 60 : 45) && ratio >= (large ? 3 : 4.5)) out.contrast.push(`APCA Lc ${lc.toFixed(0)} ${fs}px "${own.slice(0, 30)}"`);
      }
      const key = `${fs}|${own.slice(0, 24)}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (fs < 12) out.tiny.push(`${fs}px "${own.slice(0, 40)}"`);
        else if (own.length > 45 && fs < 14 && !el.closest('pre, code')) out.smallBody.push(`${fs}px "${own.slice(0, 40)}"`);
      }
    }
    if (el.matches('button, a[href], input, select, textarea, [role=button], [role=tab], [role=radio], [role=menuitem], summary') && !el.matches('input[type=file]')) {
      const r = el.getBoundingClientRect();
      const hitPseudo = /mb-btn--sm|mb-iconbtn--sm|mb-tab\b|mb-tag__remove|mb-page|mb-check__input|mb-radio__input|mb-switch__input/.test(el.className);
      // controls INSIDE the canvas stage scale with the zoom by design (docs/canvas-design.md); every one has a ≥ 44px equivalent in the inspector / menu
      if (el.closest('[data-testid=canvas-stage]')) continue;
      if ((r.height < 43.5 || r.width < 43.5) && !hitPseudo && !(el.type === 'checkbox' || el.type === 'radio')) {
        out.touch.push(`${Math.round(r.width)}x${Math.round(r.height)} <${el.tagName.toLowerCase()}> "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`);
      }
    }
  }
  // overlap: two visible, unrelated pieces (controls, icons, own-text elements) drawn on top of each other —
  // a badge over its icon, a floating button over a card, two-line rows spilling into each other
  const label = (e) => `<${e.tagName.toLowerCase()}> "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}"`;
  const live = (e) => vis(e) && !e.closest('[inert], [aria-hidden=true]:not(svg), [data-testid=canvas-stage], .mb-sr, .sr-only') && parseFloat(getComputedStyle(e).opacity) > 0.05;
  const topLayer = document.querySelector('[role=dialog], [role=alertdialog], [role=menu]');
  const pieces = [...document.querySelectorAll('button, a[href], input, select, textarea, svg, body *')].filter((e, i, a) => a.indexOf(e) === i).filter((e) => {
    if (!live(e)) return false;
    if (topLayer && !topLayer.contains(e) && !e.closest('[role=dialog], [role=alertdialog], [role=menu]')) return false; // behind a modal or open menu
    if (e.matches('button, a[href], input, select, textarea, svg')) return true;
    return [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  });
  // a decorative glyph laid inside a field (search icon, select chevron) does not take clicks: it is part of the field
  const deco = (e) => e.matches('svg') && getComputedStyle(e).pointerEvents === 'none';
  // a fixed / sticky bar over flowing content is fine while the page can scroll that content clear (checked below)
  const pinned = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'fixed' || p === 'sticky') return a; } return null; };
  // what is actually drawn: the box cut by every scrolling / clipping ancestor (a row scrolled out of a list is not on screen)
  const shown = (e) => {
    let r = e.getBoundingClientRect(); let { left, top, right, bottom } = r;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (!/auto|scroll|hidden|clip/.test(cs.overflowX + cs.overflowY)) continue;
      const ar = a.getBoundingClientRect();
      left = Math.max(left, ar.left); top = Math.max(top, ar.top); right = Math.min(right, ar.right); bottom = Math.min(bottom, ar.bottom);
    }
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  // a run of inline text that wraps onto several lines has one box over all of them: it is laid out, not overlapping
  const boxes = pieces.filter((e) => !deco(e) && !(getComputedStyle(e).display === 'inline' && e.getClientRects().length > 1)).map((e) => ({ e, r: shown(e), pin: pinned(e) })).filter((b) => b.r.width > 0 && b.r.height > 0);
  for (let i = 0; i < boxes.length && out.overlap.length < 12; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    if (A.pin !== B.pin && (!A.pin || !B.pin)) continue;
    const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
    if (w <= 1 || h <= 1) continue;
    const small = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
    if (w * h > 0.2 * small) out.overlap.push(`${label(A.e)} × ${label(B.e)} (${Math.round(w)}x${Math.round(h)})`);
  }
  // clipped: a control or text cut by a non-scrolling ancestor, or a menu / dialog that runs past the viewport or needs scrolling
  for (const { e } of boxes) {
    const r = e.getBoundingClientRect();
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      // inside a scrolling box the user can reach it: what clips that box above it does not cut this element
      if (/auto|scroll/.test(cs.overflowX + cs.overflowY)) break;
      if (!/hidden|clip/.test(cs.overflowX + cs.overflowY)) continue;
      const ar = a.getBoundingClientRect();
      if (r.top < ar.top - 2 || r.bottom > ar.bottom + 2 || r.left < ar.left - 2 || r.right > ar.right + 2) { out.clipped.push(`${label(e)} cut by <${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]}>`); }
      break;
    }
    if (out.clipped.length > 8) break;
  }
  // the last content must be able to scroll clear of a bar pinned to the bottom (no floating control may cover it for good)
  const bottomBar = [...document.querySelectorAll('nav, [data-testid]')].find((e) => vis(e) && getComputedStyle(e).position === 'fixed' && Math.abs(e.getBoundingClientRect().bottom - innerHeight) < 2 && e.getBoundingClientRect().width > innerWidth / 2);
  if (bottomBar && de.scrollHeight > innerHeight) {
    const room = parseFloat(getComputedStyle(document.querySelector('#root > div') || document.body).paddingBottom) || 0;
    if (room + 1 < bottomBar.getBoundingClientRect().height) out.clipped.push(`page end has ${room}px under a ${Math.round(bottomBar.getBoundingClientRect().height)}px bottom bar`);
  }
  for (const m of document.querySelectorAll('[role=menu], .mb-popover__panel, .mb-dialog')) {
    if (!vis(m)) continue;
    const r = m.getBoundingClientRect();
    if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1) out.clipped.push(`${m.getAttribute('role') || 'panel'} "${(m.getAttribute('aria-label') || '').slice(0, 20)}" runs past the viewport`);
    if (m.matches('[role=menu]') && m.scrollHeight > m.clientHeight + 2) out.clipped.push(`menu "${(m.getAttribute('aria-label') || '').slice(0, 20)}" hides ${m.scrollHeight - m.clientHeight}px below its edge`);
  }
  // canvas toolbar: controls are GROUPED (view · history · camera · note · details · «⋯»); more than 9 loose children means it grew back into a bar
  const tb = document.querySelector('[data-testid=canvas-toolbar]');
  if (tb && vis(tb)) {
    const controls = [...tb.children].filter((c) => vis(c) && !c.hasAttribute('data-toolbar-overflow'));
    if (controls.length > 9) out.canvas.push(`toolbar shows ${controls.length} groups/controls (max 9)`);
  }
  // focus mode: a card outside the selection is quieter by background and border — its title must stay readable (≥ 3:1, opacity counted)
  for (const t of document.querySelectorAll('[data-dimmed=true] [data-card-title]')) {
    if (!vis(t)) continue;
    out.dimmedChecked++;
    const fg = parse(getComputedStyle(t).color); let op = 1;
    for (let a = t; a; a = a.parentElement) op *= parseFloat(getComputedStyle(a).opacity);
    if (!fg) continue;
    fg.a *= op; const bg = bgOf(t); const f = over(fg, bg);
    const ratio = (Math.max(lum(f), lum(bg)) + 0.05) / (Math.min(lum(f), lum(bg)) + 0.05);
    if (ratio < 3) out.canvas.push(`dimmed card title ${ratio.toFixed(2)}:1 "${t.textContent.trim().slice(0, 24)}"`);
  }
  // inspector first view: one plain sentence, at most two actions
  const ins = document.querySelector('[data-testid=inspector-object]');
  if (ins && vis(ins)) {
    if (!ins.querySelector('[data-testid=inspector-about]')) out.canvas.push('inspector: no plain sentence');
    const acts = [...(ins.querySelector('[data-testid=inspector-actions]')?.querySelectorAll('button') ?? [])].filter(vis);
    if (acts.length > 2) out.canvas.push(`inspector shows ${acts.length} actions (max 2)`);
  }
  // canvas lines: contrast ≥ 3:1 against the canvas background, stroke ≥ 1.5px, arrow head ≥ 10px
  const stage = document.querySelector('[data-testid=canvas-stage]');
  if (stage) {
    const sbg = bgOf(stage);
    const kinds = new Set();
    for (const line of document.querySelectorAll('[data-testid=canvas-edges] path[data-line]')) {
      const cs = getComputedStyle(line);
      const kind = line.closest('[data-kind]')?.getAttribute('data-kind') ?? '?';
      if (kinds.has(kind)) continue;
      kinds.add(kind);
      const fg = parse(cs.stroke);
      const dim = line.closest('g')?.classList.contains('opacity-35');
      if (!fg) { out.edges.push(`${kind}: no stroke colour`); continue; }
      const f = over(fg, sbg);
      const ratio = (Math.max(lum(f), lum(sbg)) + 0.05) / (Math.min(lum(f), lum(sbg)) + 0.05);
      if (ratio < 3 && !dim) out.edges.push(`${kind}: ${ratio.toFixed(2)}:1`);
      if (parseFloat(cs.strokeWidth) < 1.5) out.edges.push(`${kind}: stroke ${cs.strokeWidth}`);
      const marker = document.querySelector(`#canvas-arrow-${kind}`);
      if (!marker || parseFloat(marker.getAttribute('markerWidth')) < 10) out.edges.push(`${kind}: arrow head too small`);
    }
  }
  return out;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
let problems = 0;
const SCHEMES = (process.env.SCHEMES || 'light,dark').split(',');
for (const scheme of SCHEMES) for (const baseSize of SIZES) {
  const size = { ...baseSize, name: baseSize.name + (scheme === 'dark' ? '-dark' : '') };
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'fa-IR', colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!/WebSocket closed without opened/.test(e.message)) errors.push(e.message); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text() + ' ' + (m.location().url || '')); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // the same open sidebar at 1024 as at 1280 for the regular shots (1024 defaults to the rail; the rail has its own shots)
  await page.evaluate((wide) => { localStorage.clear(); if (wide) localStorage.setItem('mabda.sidebar', 'docked'); }, size.width >= 1024);
  await page.reload({ waitUntil: 'networkidle' });

  const shoot = async (name) => {
    // pages and dialogs are separate chunks (src/app/lazy.tsx): wait until none is still loading, then let animations settle
    await page.waitForFunction(() => ![...document.querySelectorAll('[role=status]')].some((e) => /در حال (بار|باز) شدن/.test(e.textContent ?? '')), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}-${size.name}.png`, fullPage: false });
    const r = await page.evaluate(audit);
    if (r.dimmedChecked) console.log(`  [${size.name}] ${name}: ${r.dimmedChecked} dimmed card titles measured`);
    const bad = r.overflow || r.tiny.length || r.smallBody.length || r.touch.length || r.contrast.length || r.edges.length || r.canvas.length || r.overlap.length || r.clipped.length || r.primaries > 1;
    if (bad) { problems++; console.log(`\n[${size.name}] ${name}`); if (r.overflow) console.log('  overflow-x:', r.overflow); if (r.primaries > 1) console.log('  primary buttons visible:', r.primaries); for (const k of ['tiny', 'smallBody', 'touch', 'contrast', 'edges', 'canvas', 'overlap', 'clipped']) if (r[k].length) console.log(`  ${k}:`, [...new Set(r[k])].slice(0, 8).join(' | ')); }
  };
  const goTab = async (t) => {
    const mobile = size.width < 768;
    const sel = mobile ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${t.label}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${t.desktopLabel || t.label}")`;
    await page.locator(sel).first().click();
    if (t.then === 'build') await page.getByTestId('outputs-build').getByRole('button', { name: /^(بساز|آماده‌سازی)/ }).first().click();
  };
  const closeDialog = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(350); };

  await goTab(TABS[0]); await shoot('home');
  // weekly review: three sections one after another, then the summary
  await page.getByRole('button', { name: 'بیشتر', exact: true }).first().click(); await page.getByRole('menuitem', { name: 'بازبینی هفتگی' }).click(); await page.waitForTimeout(200); await shoot('weekly-1');
  for (const n of [2, 3, 4]) { await page.getByRole('dialog').getByRole('button', { name: /دیدم؛ بعدی|جمع‌بندی/ }).click(); await page.waitForTimeout(150); await shoot(`weekly-${n}`); }
  await closeDialog();
  await goTab(TABS[1]); await shoot('context-doc');
  // table view
  await page.getByRole('button', { name: 'نماهای بیشتر' }).first().click(); await page.getByRole('menuitem', { name: 'جدول' }).click(); await shoot('context-table');
  await page.getByRole('button', { name: 'نماهای بیشتر' }).first().click(); await page.getByRole('menuitem', { name: 'خواندن به‌صورت سند' }).click(); await shoot('context-read');
  await page.locator('[role=radio]').filter({ hasText: /^Markdown$/ }).first().click(); await shoot('context-markdown');
  await page.locator('[role=radio]').filter({ hasText: /^ساختار$/ }).first().click();
  // add context dialog
  await page.getByRole('button', { name: /افزودن دانش/ }).first().click(); await shoot('dialog-context'); await closeDialog();

  await goTab(TABS[2]); await shoot('workstreams-create');
  await page.getByRole("tab", { name: /چه چیزی کم است/ }).click(); await shoot('workstreams-gap');
  await page.getByRole("tab", { name: /^خروجی‌ها/ }).click(); await shoot('workstreams-history');

  await goTab(TABS[3]); await shoot('assets');

  // everything that is not daily work lives in the account menu (desktop) / account drawer (mobile)
  const mobile = size.width < 768;
  const openAccount = async () => {
    if (mobile) await page.getByRole('button', { name: 'حساب کاربری' }).first().click();
    else await page.getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click();
    await page.waitForTimeout(150);
  };
  const accountItem = async (name) => {
    await openAccount();
    await (mobile ? page.getByRole('dialog').getByRole('button', { name }) : page.getByRole('menuitem', { name })).first().click();
    await page.waitForTimeout(250);
  };
  await openAccount(); await shoot(mobile ? 'drawer-account' : 'menu-account'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // the space picker (head of the bar / top bar on phones)
  const spaceItem = async (name) => { await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.waitForTimeout(150); await page.getByRole('menuitem', { name }).first().click(); await page.waitForTimeout(250); };
  await page.getByRole('button', { name: /^فضا: / }).first().click(); await page.waitForTimeout(150); await shoot('menu-space'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // the personal sample («زندگی من», docs/ux/audience.md): its truth and its thoughts
  await spaceItem(/زندگی من/); await goTab(TABS[1]); await page.waitForTimeout(300); await shoot('life-truth'); await goTab(TABS[4]); await page.waitForTimeout(300); await shoot('life-thinking'); await goTab(TABS[0]);
  if (!mobile) {
    // the narrow rail (icons only): its account menu must sit fully inside the window; then open the bar again
    await page.getByRole('button', { name: 'باریک کردن نوار کناری' }).click(); await page.waitForTimeout(200); await shoot('sidebar-narrow');
    await page.getByTestId('sidebar-rail').getByRole('button', { name: /پلن (Starter|Pro|Max)/ }).click(); await page.waitForTimeout(150); await shoot('menu-account-narrow');
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'باز کردن نوار کناری' }).click(); await page.waitForTimeout(300);
  }
  await accountItem('مصرف'); await shoot('ledger');
  // plan / economics tabs exist only when MABDA_MANAGED_AI is on
  const maybe = async (loc, fn) => { if (await loc.count()) await fn(loc.first()); };
  await maybe(page.getByRole('tab', { name: /پلن‌ها و اعتبار/ }), async (l) => { await l.click(); await shoot('ledger-plans'); });
  await maybe(page.getByRole('tab', { name: /خطوط قرمز/ }), async (l) => { await l.click(); await shoot('ledger-economics'); });
  await maybe(page.getByRole('tab', { name: /مصرف و سهمیه/ }), async (l) => { await l.click(); await shoot('ledger-usage'); });

  await accountItem('پلن و ارتقا'); await shoot('dialog-plans'); await closeDialog();
  await accountItem('راهنما و شروع سریع'); await shoot('dialog-onboarding'); await closeDialog();
  await accountItem('حساب و داده‌ها'); await shoot('dialog-account'); await closeDialog();
  // the truth overview, its focused lineage view, and the free thinking canvas
  await spaceItem('بازسازی فضای نمونه');
  await page.getByRole('dialog').getByRole('button', { name: 'بازنشانی' }).click({ timeout: 2500 }).catch(() => {});
  await page.getByText('خانه: قهوهٔ تخصصی آنلاین').waitFor();
  await page.getByRole('button', { name: 'بستن' }).first().click({ timeout: 800 }).catch(() => {});
  await page.getByRole('region', { name: 'اعلان‌ها' }).getByRole('button', { name: 'بستن' }).first().click({ timeout: 800 }).catch(() => {});
  await goTab(TABS[1]);
  // «واردِ یک بخش شدن»: a section alone, a sub-section deeper, then back out with the on-screen button
  await page.getByRole('button', { name: /^رفتن به بخش/ }).first().click(); await shoot('context-focus');
  await page.getByTestId('sub-section').first().click(); await shoot('context-focus-deep');
  await page.getByRole('button', { name: /^برگشت به/ }).first().click(); await page.getByRole('button', { name: /^برگشت به/ }).first().click({ timeout: 1500 }).catch(() => {});
  await page.getByRole('radiogroup', { name: 'نمای منبع حقیقت' }).getByRole('radio', { name: 'نمای کلی' }).click();
  const layoutTab = async (name) => { await page.locator('[role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first().evaluate((n) => n.click()); await page.waitForTimeout(500); };
  await page.getByTestId('canvas-stage').waitFor();
  await page.waitForTimeout(500); await shoot('canvas-relations');
  await page.locator('[data-item-id^="o:"]').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(350); await shoot('canvas-relations-selected');
  await page.getByTestId('canvas-inspector').getByRole('button', { name: /^به چه چیزی وابسته است/ }).click({ timeout: 2000 }).catch(() => {}); await page.getByTestId('canvas-inspector').getByRole('button', { name: /^چه چیزی روی آن سوار است/ }).click({ timeout: 2000 }).catch(() => {}); await shoot('canvas-inspector-open');
  // «دور یک مورد» and back
  await page.getByTestId('canvas-inspector').getByRole('button', { name: 'دور این مورد' }).click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(900); await shoot('canvas-lineage');
  await page.getByRole('button', { name: 'برگشت به نمای کلی' }).click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(300);
  // the thinking canvas: one free canvas (with the tray and section frames)
  await goTab(TABS[4]); await shoot('thinking-list');
  await page.getByRole('radiogroup', { name: 'نمای فکر' }).getByRole('radio', { name: 'بوم' }).click();
  await page.getByTestId('canvas-stage').waitFor();
  await shoot('canvas-free');
  await goTab(TABS[1]);
  await page.getByTestId('canvas-stage').focus(); await page.keyboard.press('KeyF'); await page.waitForTimeout(400); await shoot('canvas-fullscreen');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // the showcase's outputs (two are «به‌روز نیست») and the workflow page with its questions
  await goTab(TABS[3]); await shoot('assets-demo');
  await goTab(TABS[2]); await shoot('workstreams-demo');
  // the removal model: the node delete dialog (plan, tree after, what stops reaching whom) and the archive
  await goTab(TABS[1]);
  await page.locator('[role=radio]').filter({ hasText: /^ساختار$/ }).first().click();
  await page.getByRole('button', { name: 'عملیات بخش کارگاه برشته‌کاری' }).first().click();
  await page.getByRole('menuitem', { name: 'حذف' }).click();
  await page.getByTestId('node-delete').waitFor(); await page.waitForTimeout(300);
  await shoot('dialog-node-delete'); await closeDialog();
  await accountItem('بایگانی و حذف‌های اخیر'); await page.waitForTimeout(500); await shoot('dialog-archive'); await closeDialog();
  // «درخواست برای ابزار دیگر» on the showcase: «ممیزی» + one line, scoped to the whole tree (the preview is the exact text that is copied)
  await goTab(TABS[0]);
  await shoot('home-demo');
  await page.locator('button[aria-controls="home-all"]').click(); await page.waitForTimeout(250); await shoot('home-all');
  await page.locator('button[aria-controls="home-all"]').click();
  await page.getByRole('main').getByRole('button', { name: 'بیشتر', exact: true }).first().click(); await page.getByRole('menuitem', { name: 'درخواست برای ابزار دیگر' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'ممیزی' }).click();
  await page.locator('#ai-request-line').fill('طرح تخفیف پاییز با خط قرمزهای ما جور است؟');
  await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog] textarea[readonly]')].some((t) => t.value.includes('تخفیف پاییز')));
  await shoot('dialog-request'); await closeDialog();
  // «بسته‌های دانش»: a pack being built, with the live preview (what comes, from where, what did not and why)
  await goTab(TABS[0]);
  await page.getByRole('button', { name: 'بیشتر', exact: true }).first().click(); await page.getByRole('menuitem', { name: 'بسته‌های دانش' }).click();
  await page.getByRole('button', { name: 'بستهٔ تازه' }).click();
  await page.getByRole('dialog').getByLabel('نام بسته').fill('پاسخ به مشتری');
  await page.getByRole('dialog').getByRole('checkbox', { name: /^(— )*پشتیبانی و پس از فروش$/ }).evaluate((n) => n.click());
  await page.getByTestId('explain-group-guardrail').waitFor(); await page.waitForTimeout(500);
  await shoot('dialog-pack-edit'); await closeDialog();
  // the global search: a few letters, grouped results (the keyboard shortcut on desktop, the header button on phones)
  if (mobile) await page.getByRole('button', { name: 'جستجو' }).first().click(); else await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'جستجو' }).fill('قیم');
  await page.locator('[role=dialog] [role=option]').first().waitFor();
  await shoot('dialog-search'); await closeDialog();
  if (errors.length) { problems++; console.log(`\n[${size.name}] console/page errors:`, [...new Set(errors)].slice(0, 6)); }
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} view(s) with audit findings` : '\naudit clean');
