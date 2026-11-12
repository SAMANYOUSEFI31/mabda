#!/usr/bin/env python3
"""
The page gallery (`bun run gallery`): one self-contained HTML of every screen `bun run screens` and `node scripts/states.mjs` shot,
at 390 (phone), 768 (tablet) and 1280 (laptop), day and night, grouped by page, with a jump list, plain Persian titles, sizes side
by side, the commit and build time on top, and a «تغییر کرده» mark on what differs from the previous gallery (by image hash,
kept in docs/screens/gallery-manifest.json). Images are WebP, scaled down, so the page stays small.
Usage: python3 scripts/gallery.py [out.html]   (default docs/screens/gallery.html)
"""
import base64, hashlib, html, io, json, os, re, subprocess, sys, datetime
from PIL import Image

DIR = 'docs/screens'
OUT = sys.argv[1] if len(sys.argv) > 1 else f'{DIR}/gallery.html'
MANIFEST = f'{DIR}/gallery-manifest.json'
SIZES = [('390', 'گوشی ۳۹۰'), ('768', 'تبلت ۷۶۸'), ('1024', 'تبلت افقی ۱۰۲۴×۷۶۸'), ('1280', 'لپ‌تاپ ۱۲۸۰'), ('844l', 'گوشی افقی ۸۴۴×۳۹۰')]
THEMES = [('', 'روز'), ('-dark', 'شب')]
SCALE = {'390': 1.0, '768': 0.6, '1024': 0.55, '1280': 0.55, '844l': 0.6}

TITLE = {
  'home': 'خانه', 'home-all': 'خانه: همهٔ کارها', 'home-demo': 'خانه در فضای نمونه', 'weekly-1': 'بازبینی هفتگی، بخش ۱', 'weekly-2': 'بازبینی هفتگی، بخش ۲',
  'weekly-3': 'بازبینی هفتگی، بخش ۳', 'weekly-4': 'بازبینی هفتگی: جمع‌بندی',
  'context-doc': 'منبع: ساختار', 'context-table': 'منبع: جدول', 'context-read': 'منبع: خواندن سند', 'context-markdown': 'منبع: متن خام',
  'context-focus': 'منبع: تمرکز روی یک بخش', 'context-focus-deep': 'منبع: تمرکز روی زیربخش', 'canvas-relations': 'نمای کلی: رابطه‌ها',
  'canvas-relations-selected': 'نمای کلی: یک کارت انتخاب‌شده', 'canvas-inspector-open': 'نمای کلی: جزئیات کارت', 'canvas-lineage': 'نمای کلی: ردپا',
  'canvas-free': 'بوم آزاد فکر', 'canvas-fullscreen': 'بوم تمام‌صفحه', 'life-truth': '«زندگی من»: منبع', 'life-thinking': '«زندگی من»: فکر',
  'thinking-list': 'فکر: فهرست', 'assets': 'خروجی‌ها', 'assets-demo': 'خروجی‌ها در فضای نمونه', 'workstreams-create': 'ساختن خروجی',
  'workstreams-demo': 'جریان کار در فضای نمونه', 'workstreams-gap': 'جریان کار: جای خالی', 'workstreams-history': 'جریان کار: تاریخچه',
  'dialog-context': 'افزودن / ویرایش دانش', 'dialog-search': 'جستجو', 'dialog-archive': 'بایگانی', 'dialog-node-delete': 'حذف بخش',
  'dialog-onboarding': 'راهنما و شروع سریع', 'dialog-pack-edit': 'ویرایش بسته', 'dialog-plans': 'پلن و ارتقا', 'dialog-request': 'درخواست برای ابزار دیگر',
  'dialog-account': 'حساب و داده‌ها', 'menu-account': 'منوی حساب', 'menu-account-narrow': 'منوی حساب در نوار باریک', 'menu-space': 'انتخاب فضا',
  'sidebar-narrow': 'نوار کناری باریک', 'drawer-account': 'کشوی حساب (گوشی)', 'drawer-menu': 'کشوی منو (گوشی)', 'ledger': 'مصرف', 'ledger-usage': 'مصرف و سهمیه',
  'ledger-plans': 'پلن‌ها و اعتبار', 'ledger-economics': 'اقتصاد',
  'add-thought': 'افزودن: فکر', 'add-file': 'افزودن: فایل', 'add-truth': 'افزودن: حقیقت (متن از «فکر» آمده)', 'add-date': 'افزودن: تقویم خورشیدی',
  'add-discard': 'افزودن: پرسش پیش از دور ریختن متن', 'add-toast': 'افزودن: پیام خطا با برگهٔ باز (نوشته می‌ماند)', 'clear-home': 'خانه: همه‌چیز به‌روز است', 'canvas-options': 'نمای کلی: «گزینه‌ها» باز (بالای همه‌چیز)', 'menu-low': 'منوی «…» بخش، باز از پایین صفحه', 'section-back': 'بازگشت به «منبع» پس از رفتن به بخش و «فکر»', 'keyboard': 'افزودن با صفحه‌کلید باز (فیلد دیده می‌ماند)',
}
STATE = {'empty': 'خالی', 'loading': 'در حال آمدن', 'full': 'کامل', 'partial': 'ناقص', 'error': 'خطا (در جای صفحه)', 'error-boot': 'خطا (پیش از آمدن فضا)'}
VIEW = {'home': 'خانه', 'context': 'منبع', 'thinking': 'فکر', 'assets': 'خروجی‌ها'}
GROUPS = [
  ('home', 'خانه', r'^(home|weekly)'), ('context', 'منبع حقیقت', r'^(context|canvas-(relations|inspector|lineage)|life-truth)'),
  ('thinking', 'فکر', r'^(thinking|canvas-free|canvas-fullscreen|life-thinking)'), ('assets', 'خروجی‌ها', r'^(assets|workstreams)'),
  ('add', 'افزودن', r'^add-'), ('dialogs', 'پنجره‌ها', r'^dialog-'), ('nav', 'منوها و نوار کناری', r'^(menu|sidebar|drawer)'), ('ledger', 'مصرف', r'^ledger'),
  ('states', 'پنج حالت هر نما', r'^state-'),
]

def title(name):
    m = re.match(r'^state-(empty|full|partial)-(\w+)$', name)
    if m: return f'{VIEW.get(m[2], m[2])}: {STATE[m[1]]}'
    m = re.match(r'^state-(.+)$', name)
    if m: return STATE.get(m[1], TITLE.get(m[1], m[1]))
    return TITLE.get(name, name)

files = set(os.listdir(DIR))
names = sorted({re.sub(r'-(390|768|1024|1280|844l)(-dark)?\.png$', '', f) for f in files if re.search(r'-(768|1024)\.png$', f) or f.startswith(('state-', 'add-'))})
names = [n for n in names if not n.endswith('.png')]
old = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
new, changed = {}, set()

def img(path, key):
    raw = open(path, 'rb').read()
    h = hashlib.sha1(raw).hexdigest()[:16]
    new[key] = h
    if old and old.get(key) != h: changed.add(key.split('|')[0])
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    s = SCALE[key.split('|')[1]]
    if s != 1: im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=62, method=4)
    return f'data:image/webp;base64,{base64.b64encode(b.getvalue()).decode()}'

def card(name):
    shots = []
    for t, tl in THEMES:
        for s, sl in SIZES:
            f = f'{name}-{s}{t}.png'
            if f in files: shots.append(f'<figure class="shot s{s}"><img loading="lazy" alt="{html.escape(title(name))}، {sl}، {tl}" src="{img(f"{DIR}/{f}", f"{name}|{s}|{t}")}"><figcaption>{sl} · {tl}</figcaption></figure>')
    if not shots: return ''
    mark = '<span class="new">تغییر کرده</span>' if name in changed else ''
    return f'<article id="s-{name}"><h3>{html.escape(title(name))}{mark}</h3><div class="row">{"".join(shots)}</div></article>'

sections, toc = [], []
used = set()
for gid, glabel, rx in GROUPS:
    items = [n for n in names if re.search(rx, n) and n not in used]
    used.update(items)
    if gid == 'states': items.sort(key=lambda n: (list(VIEW).index(n.split('-')[-1]) if n.split('-')[-1] in VIEW else 9, n))
    cards = ''.join(card(n) for n in items)
    if not cards: continue
    n_changed = sum(1 for n in items if n in changed)
    toc.append(f'<a href="#g-{gid}">{glabel}{f" <span class=new>{n_changed}</span>" if n_changed else ""}</a>')
    sections.append(f'<section id="g-{gid}"><h2>{glabel}</h2>{cards}</section>')

commit = subprocess.run(['git', 'log', '-1', '--format=%h · %s'], capture_output=True, text=True).stdout.strip()
built = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
# written for the artifact viewer, which wraps the page in its own doctype/head/body
doc = f'''<title>گالری صفحه‌های Mabda</title><meta name="claude:viewport-fit-sides" content="cover"><style>
:root{{--bg:#f7f5f0;--fg:#1d1b17;--sub:#6b665c;--line:#e2ddd2;--card:#fffdf8;--mark:#a8541a}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#171613;--fg:#ece8df;--sub:#a49e92;--line:#34312b;--card:#201e1a;--mark:#e3a06a;color-scheme:dark}}}}
:root[data-theme=dark]{{--bg:#171613;--fg:#ece8df;--sub:#a49e92;--line:#34312b;--card:#201e1a;--mark:#e3a06a;color-scheme:dark}}
*{{box-sizing:border-box}}body{{direction:rtl;margin:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));background:var(--bg);color:var(--fg);font:15px/1.7 Vazirmatn,Tahoma,system-ui,sans-serif}}
header{{position:sticky;top:env(safe-area-inset-top,0px);z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding-block:12px}}body::before{{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}}
h1{{font-size:20px;margin:0}}.meta{{color:var(--sub);font-size:13px;margin:2px 0 8px}}.meta code{{direction:ltr;unicode-bidi:isolate}}
nav{{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px}}nav a{{color:var(--fg)}}
.filters{{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:13px;color:var(--sub)}}.filters label{{display:flex;align-items:center;gap:4px;min-height:32px}}
main{{padding-block:16px;max-width:1800px;margin:0 auto}}h2{{font-size:18px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}}
article{{margin:0 0 28px}}h3{{font-size:15px;margin:0 0 8px;display:flex;gap:8px;align-items:center}}
.row{{display:flex;gap:12px;overflow-x:auto;align-items:flex-start;padding-bottom:6px}}
figure{{margin:0;flex:none;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px}}
figure img{{display:block;height:auto;border-radius:4px}}.s390 img{{width:260px}}.s768 img{{width:340px}}.s1280 img{{width:560px}}.s844l img{{width:420px}}.s1024 img{{width:460px}}
figcaption{{font-size:12px;color:var(--sub);margin-top:4px}}
.new{{font-size:11px;font-weight:600;color:var(--mark);border:1px solid var(--mark);border-radius:999px;padding:0 8px}}
body.no-dark figure:has(img[alt$="شب"]),body.no-light figure:has(img[alt$="روز"]){{display:none}}
body.no-390 .s390,body.no-768 .s768,body.no-1280 .s1280,body.no-844l .s844l,body.no-1024 .s1024{{display:none}}
body.only-changed article:not(:has(.new)){{display:none}}
@media (max-width:600px){{.s1280 img{{width:300px}}.s768 img{{width:240px}}.s390 img{{width:200px}}}}
</style></head><body>
<div lang="fa" dir="rtl"><header><h1>گالری صفحه‌های Mabda</h1>
<p class="meta">کامیت <code>{html.escape(commit)}</code> · ساخته‌شده {built} · {len(names)} صفحه و حالت{f" · {len(changed)} مورد تغییر کرده از نسخهٔ قبل" if changed else ""}</p>
<nav aria-label="پرش به بخش">{"".join(toc)}</nav>
<div class="filters" role="group" aria-label="نمایش">
<label><input type="checkbox" data-f="390" checked>گوشی</label><label><input type="checkbox" data-f="768" checked>تبلت</label><label><input type="checkbox" data-f="1024" checked>تبلت افقی</label><label><input type="checkbox" data-f="1280" checked>لپ‌تاپ</label><label><input type="checkbox" data-f="844l" checked>گوشی افقی</label>
<label><input type="checkbox" data-f="light" checked>روز</label><label><input type="checkbox" data-f="dark" checked>شب</label>
<label><input type="checkbox" data-f="changed">فقط تغییرکرده‌ها</label></div></header>
<main>{"".join(sections)}</main></div>
<script>document.querySelectorAll('[data-f]').forEach(function(c){{c.addEventListener('change',function(){{var f=c.dataset.f;if(f==='changed')document.body.classList.toggle('only-changed',c.checked);else document.body.classList.toggle('no-'+f,!c.checked)}})}})</script>'''
open(OUT, 'w').write(doc)
json.dump(new, open(MANIFEST, 'w'), indent=0, sort_keys=True)
print(f'gallery: {OUT} ({os.path.getsize(OUT) // 1024} KB, {len(names)} screens, {len(changed)} changed)')
