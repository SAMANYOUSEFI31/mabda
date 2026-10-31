# Mabda (مبدأ)

## خلاصهٔ محصول
- Mabda منبع حقیقت کسب‌وکار کاربر است: دانش پراکنده را به Context ساختاریافته (Objectهای نوع‌دار در درخت) تبدیل می‌کند.
- موتورهای قطعی (Gap، Readiness، تناقض) می‌گویند چه چیزی کم است؛ خروجی‌ها (Asset) از همین Context ساخته می‌شوند.
- هر Asset نسخهٔ Contextهای استفاده‌شده را نگه می‌دارد؛ با تغییر Context «قدیمی» علامت می‌خورد (Context Replay).
- Auto مدل، effort و الگو را انتخاب می‌کند؛ کاربر فقط «چه» را مشخص می‌کند.
- بازار اول: ایران، فارسی، راست‌به‌چپ. اقتصاد: اشتراک + اعتبار برای خروجی‌ها.

## مراجع
- `docs/PRD.md` — PRD (نسخهٔ قدیمی‌تر)
- `docs/decisions-v3.1.md` — تصمیم‌های v3.1؛ در تناقض، **این سند مقدم است**

## قوانین ثابت
1. UI فارسی و RTL.
2. فقط توکن‌های معنایی `public/ds`؛ هیچ hex. فایل‌های `public/ds` هرگز ویرایش نشوند.
3. هیچ پاسخ ساختگی/از پیش‌نوشتهٔ AI نمایش داده نشود؛ در خطا پیام روشن + تلاش دوباره.
4. شناسهٔ مدل فقط در فایل تنظیمات؛ هرگز در بقیهٔ کد.
5. منطق اعتبار فقط در `src/core/creditEngine.ts`.
6. موتورهای `src/core` تست دارند.
7. کامیت‌های کوچک با پیام توصیفی.

## سیستم طراحی (Bushido)
- UI فقط از `src/ui` ساخته می‌شود (Button، Card، Dialog، Table، …)؛ کامپوننت جدید لازم شد، از توکن‌های معنایی همان‌جا بساز.
- رنگ، فاصله، شعاع، سایه و تایپ فقط utilityهای معنایی تعریف‌شده در `src/ui/bushido-theme.css` (مثل `bg-surface-raised`، `text-text-subtle`، `p-inset-lg`، `gap-stack-md`، `text-body-md`). پالت خام، hex، مقدار دلخواه Tailwind و `left/right` ممنوع است؛ از `ms/me/ps/pe/start/end` استفاده کن.
- رنگ‌های دامنه (نوع Object، وضعیت، …) فقط aliasهای `src/ui/mabda-tokens.css` که به intentهای بوشیدو ارجاع می‌دهند؛ نشان‌دهنده‌های دامنه در `src/ui/mabda.tsx`.
- در هر نما فقط یک `Button variant="primary"`. رنگ برند برای خطا/هشدار/انتخاب/لینک نیست (`check:design` خارج از `src/ui` اجازه نمی‌دهد).
- `public/ds/bundle.js` لود نمی‌شود (React 18 سراسری)؛ `bundle.css` از طریق `src/index.css` داخل لایهٔ `ds` می‌آید تا utilityها بتوانند روی آن override کنند.
- اعداد/تاریخ: `formatNumber`، `formatJalaliDate`، `toLatinDigits` از `src/ui/format.ts`.

## دستورها
- `bun run typecheck` · `bun run test` · `bun run build` — هر سه باید سبز باشند (build اول `check:design` را اجرا می‌کند).
- `bun run check:design` — هر hex/rgb/رنگ arbitrary/پالت خام/left-right فیزیکی در `src` را رد می‌کند.
- `bun run screens` — اسکرین‌شات ۳۹۰ و ۱۲۸۰ در `docs/screens/` + ممیزی خودکار (سرریز، اندازهٔ متن، touch target، کنتراست، تعداد primary).
- تست‌ها با `node:test` نوشته شده و با `tsx` اجرا می‌شوند.
