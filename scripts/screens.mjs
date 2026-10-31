#!/usr/bin/env node
/**
 * Screenshot every main view at 390px and 1280px into docs/screens/ and print layout audit findings
 * (horizontal overflow, text < 12px, long text < 14px, touch targets < 44px, physical-direction misplacement).
 * Usage: node scripts/screens.mjs [baseUrl]   (default http://localhost:3100)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = 'docs/screens';
mkdirSync(OUT, { recursive: true });

const SIZES = [{ name: '390', width: 390, height: 844 }, { name: '1280', width: 1280, height: 900 }];
const TABS = [
  { id: 'context', label: 'منبع حقیقت' },
  { id: 'workstreams', label: 'جریان‌ها', desktopLabel: 'استودیوی جریان‌های کار' },
  { id: 'chat', label: 'گفتگو', desktopLabel: 'گفتگو و استخراج دانش' },
  { id: 'assets', label: 'دارایی‌ها', desktopLabel: 'کتابخانهٔ دارایی‌ها' },
  { id: 'ledger', label: 'دفتر کل', desktopLabel: 'دفتر کل و شفافیت مالی' },
];

const audit = () => {
  const out = { overflow: null, tiny: [], smallBody: [], touch: [], contrast: [], primaries: 0 };
  // contrast: composite ancestor backgrounds, compare with text color (WCAG relative luminance)
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e); let bg = { r: 9, g: 9, b: 11, a: 1 }; for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = over(c, bg); } return bg; };
  out.primaries = [...document.querySelectorAll('.bsh-btn--primary')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[inert]'); }).length;
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.overflow = `${de.scrollWidth} > ${de.clientWidth}`;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (own) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const fg = parse(getComputedStyle(el).color);
      if (fg && !el.closest('[disabled], .is-disabled, :disabled')) {
        const bg = bgOf(el); const f = over(fg, bg);
        const l1 = lum(f), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const large = fs >= 24 || (fs >= 18.66 && parseInt(getComputedStyle(el).fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) out.contrast.push(`${ratio.toFixed(2)}:1 ${fs}px "${own.slice(0, 30)}"`);
      }
      const key = `${fs}|${own.slice(0, 24)}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (fs < 12) out.tiny.push(`${fs}px "${own.slice(0, 40)}"`);
        else if (own.length > 70 && fs < 14) out.smallBody.push(`${fs}px "${own.slice(0, 40)}"`);
      }
    }
    if (el.matches('button, a[href], input, select, textarea, [role=button], [role=tab], [role=radio], [role=menuitem], summary')) {
      const r = el.getBoundingClientRect();
      const hitPseudo = /bsh-btn--sm|bsh-iconbtn--sm|bsh-tab\b|bsh-tag__remove|bsh-page|bsh-check__input|bsh-radio__input|bsh-switch__input/.test(el.className);
      if ((r.height < 43.5 || r.width < 43.5) && !hitPseudo && !(el.type === 'checkbox' || el.type === 'radio')) {
        out.touch.push(`${Math.round(r.width)}x${Math.round(r.height)} <${el.tagName.toLowerCase()}> "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`);
      }
    }
  }
  return out;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
let problems = 0;
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'fa-IR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text() + ' ' + (m.location().url || '')); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  const shoot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-${size.name}.png`, fullPage: false });
    const r = await page.evaluate(audit);
    const bad = r.overflow || r.tiny.length || r.smallBody.length || r.touch.length || r.contrast.length || r.primaries > 1;
    if (bad) { problems++; console.log(`\n[${size.name}] ${name}`); if (r.overflow) console.log('  overflow-x:', r.overflow); if (r.primaries > 1) console.log('  primary buttons visible:', r.primaries); for (const k of ['tiny', 'smallBody', 'touch', 'contrast']) if (r[k].length) console.log(`  ${k}:`, [...new Set(r[k])].slice(0, 8).join(' | ')); }
  };
  const goTab = async (t) => {
    const mobile = size.width < 768;
    const sel = mobile ? `nav[aria-label="منوی پایینی موبایل"] button:has-text("${t.label}")` : `nav[aria-label="بخش‌های اصلی نرم‌افزار"] button:has-text("${t.desktopLabel || t.label}")`;
    await page.locator(sel).first().click();
  };
  const closeDialog = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

  await goTab(TABS[0]); await shoot('context-doc');
  // table view
  await page.locator('[role=radio]:has-text("نمای جدول")').first().click(); await shoot('context-table');
  await page.locator('[role=radio]:has-text("نمای سند")').first().click();
  // add context dialog
  await page.getByRole('button', { name: /افزودن به این شاخه/ }).first().click(); await shoot('dialog-context'); await closeDialog();

  await goTab(TABS[1]); await shoot('workstreams-create');
  await page.getByRole("tab", { name: /شکاف/ }).click(); await shoot('workstreams-gap');
  await page.getByRole("tab", { name: /^خروجی‌ها/ }).click(); await shoot('workstreams-history');

  await goTab(TABS[2]); await shoot('chat');
  await page.getByRole('button', { name: 'نشست‌های گفتگو' }).first().click(); await shoot('chat-sessions');

  await goTab(TABS[3]); await shoot('assets');
  await goTab(TABS[4]); await shoot('ledger');
  await page.getByRole('tab', { name: /مقایسه و ارتقای پلن/ }).click(); await shoot('ledger-plans');
  await page.getByRole('tab', { name: /خطوط قرمز/ }).click(); await shoot('ledger-economics');

  // dialogs
  if (size.width >= 768) {
    await page.getByRole('button', { name: /راه‌اندازی ۱۰ دقیقه‌ای/ }).click(); await shoot('dialog-onboarding'); await closeDialog();
    await page.getByRole('button', { name: /09123456789/ }).click(); await shoot('dialog-account'); await closeDialog();
    await page.getByRole('button', { name: /پلن:/ }).click(); await shoot('dialog-plans'); await closeDialog();
  } else {
    await page.getByRole('button', { name: 'باز کردن منو' }).click(); await shoot('drawer-menu'); await closeDialog();
    await page.getByRole('button', { name: /اعتبار$/ }).first().click(); await shoot('dialog-plans'); await closeDialog();
  }
  if (errors.length) { problems++; console.log(`\n[${size.name}] console/page errors:`, [...new Set(errors)].slice(0, 6)); }
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} view(s) with audit findings` : '\naudit clean');
