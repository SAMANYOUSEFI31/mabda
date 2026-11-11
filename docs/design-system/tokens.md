# توکن‌ها

قالب: [W3C DTCG](https://www.designtokens.org/). ۴۸۳ توکن: ۷۳ پالت، ۳۶۰ معنایی، ۵۰ جزء.

## سه سطح
1. **پالت** `primitive.json`: رمپ‌های OKLCH. `ink` (خنثی گرم، ۰…۱۰۰۰)، `lapis` (برند)، `verdigris` (موفق/حقیقت)، `ochre` (هشدار/قدیمی)، `brick` (خطر)، `petrol` (اطلاع/پیشنهاد)، هر کدام ۵۰…۹۵۰. تبدیل به sRGB با نگاشت gamut (`scripts/tokens/color.mjs`).
2. **معنایی**
   - `semantic.json`: مستقل از حالت (space، inset، stack، inline، control، radius، type، duration، layer، `knowledge.*`، `mabda.*`).
   - `semantic.light.json` / `semantic.dark.json`: رنگ و سایه برای هر حالت. فقط این دو فایل حق ارجاع به پالت دارند.
3. **جزء** `component.json`: فقط به نقش معنایی ارجاع می‌دهد.

## افزونه
`$extensions["mabda.alpha"]`: alias با آلفا (مثلاً `border.default` = `ink.950` با ۰٫۱۳).

## خروجی
- `tokens.css`: `:root` (مشترک + روشن) و `:root.dark` (فقط کلیدهای حالت‌دار). alias به نقش معنایی/جزء به صورت `var()` می‌ماند تا خودش حالت را دنبال کند.
- `theme.css`: تم Tailwind v4؛ همهٔ پیش‌فرض‌های Tailwind پاک می‌شوند تا فقط نام‌های معنایی وجود داشته باشند.
- `resolved.json`: مقدار نهایی هر توکن در هر حالت، برای ابزار و طراح.

## مقدارهای کلیدی

| نقش | روشن | تیره |
| --- | --- | --- |
| surface.page | `#faf5f0` | `#1a1713` |
| surface.raised | `#fffdfb` | `#211d19` |
| surface.sunken | `#f4eee8` | `#13100d` |
| text.default | `#1a1713` | `#f4eee8` |
| text.subtle | `#59544f` | `#cfc9c3` |
| text.subtlest | `#706b65` | `#a9a39d` |
| bg.brand-bold | `#334e99` | `#4263b9` |
| text.success / warning / danger / info | `#0b6347` / `#563905` / `#962317` / `#035d74` | `#9acfb7` / `#e1ba84` / `#fdcec5` / `#97cadc` |

## کف کنتراست (اجباری در تست)
متن پیش‌فرض ≥ ۷:۱ و Lc ۷۵؛ subtle ≥ ۴٫۵ و Lc ۶۰؛ subtlest ≥ ۴٫۵ و Lc ۴۵ (فقط راهنما و placeholder)؛ متن intent ≥ ۴٫۵ و Lc ۵۵؛ برچسب روی پر رنگ ≥ ۴٫۵ و Lc ۶۰؛ مرز ورودی، فوکوس، آیکن، نمودار و یال بوم ≥ ۳:۱.

## تغییر دادن
JSON را ویرایش کن، `bun run tokens`، سپس `bun run test` و `bun run screens`. `bun run build` با فایل کهنه شکست می‌خورد.
