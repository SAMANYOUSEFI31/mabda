# Mabda (مبدأ)

## خلاصهٔ محصول
- Mabda منبع حقیقت کسب‌وکار کاربر است: دانش پراکنده را به Context ساختاریافته (Objectهای نوع‌دار در درخت) تبدیل می‌کند.
- موتورهای قطعی (Gap، Readiness، تناقض) می‌گویند چه چیزی کم است؛ خروجی‌ها (Asset) از همین Context ساخته می‌شوند.
- هر Asset نسخهٔ Contextهای استفاده‌شده را نگه می‌دارد؛ با تغییر Context «قدیمی» علامت می‌خورد (Context Replay).
- Auto مدل، effort و الگو را انتخاب می‌کند؛ کاربر فقط «چه» را مشخص می‌کند.
- بازار اول: ایران، فارسی، راست‌به‌چپ. اقتصاد فعلاً تصمیم باز است: اشتراک، و AI مولد و گفتگویی فعلاً در محصول نیست؛ مدل‌های غیرمولد (embedding، rerank، قضاوت نوع‌دار، گفتار به متن) برای کمک «پیشنهادی» در دست بررسی‌اند. `creditEngine` و AI مدیریت‌شده **فریز** است (حذف نشده، گسترش هم نمی‌یابد) تا تصمیم بعدی.

## مراجع
- `docs/later.md` — ایده‌های «بعداً»، تصمیم‌های باز و ردشده‌ها؛ **پیش از ساختن هر قابلیت تازه بخوان**
- `docs/architecture.md` — نقشهٔ معماری مفهومی: هر چیز چه جنسی است و در کد کجاست؛ **آزمون جنس** برای هر مفهوم تازه؛ §۱۱ ساختار واقعی پوشه‌ها (`server/db/repo`، `server/db/routes`، `src/app/<حوزه>`، `src/components/<حوزه>`)
- `docs/PRD.md` — PRD (نسخهٔ قدیمی‌تر)
- `docs/decisions-v3.1.md` — تصمیم‌های v3.1؛ در تناقض، **این سند مقدم است**

## قوانین ثابت
1. UI فارسی و RTL.
2. فقط توکن‌های معنایی سیستم طراحی Mabda (`src/ui/tokens`)؛ هیچ hex. فایل‌های `src/ui/tokens/build/` ساختهٔ اسکریپت‌اند و دستی ویرایش نمی‌شوند (`bun run tokens`).
3. هیچ پاسخ ساختگی/از پیش‌نوشتهٔ AI نمایش داده نشود؛ در خطا پیام روشن + تلاش دوباره.
4. شناسهٔ مدل فقط در `server/ai/config/models.json`؛ هرگز در بقیهٔ کد (تست `cost.test.ts` این را اجبار می‌کند).
5. منطق اعتبار فقط در `src/core/creditEngine.ts`. هر عدد «چه چیزی در کدام پلن هست» (Workspace، سقف Object، سهمیهٔ فایل، موتورها، سقف روزانهٔ قضاوت/Coach، قیمت) فقط در `src/core/entitlements.config.ts`؛ کد و UI از `entitlements.ts` می‌خوانند.
5b. هر UI و هر عدد «اعتبار» فقط وقتی `MABDA_MANAGED_AI` روشن است نمایش/کسر شود (`useAiStatus().managedEnabled`). بدون flag، مصرف با سهمیه و هزینهٔ توکن نشان داده می‌شود. قیمت تومانی هرگز در کد نیست.
6. موتورهای `src/core` تست دارند.
6b. **پیش از افزودن هر مفهوم یا ماژول، «آزمون جنس» در `docs/architecture.md` را بگذران** (بنیادی؟ معنا؟ سازوکار؟ قابلیت؟ خروجی؟ کاربرد؟ زیرساخت؟ هوش؟).
7. کامیت‌های کوچک با پیام توصیفی.

## AI
- معماری و فایل‌ها: `docs/ai-architecture.md`. هر خروجی AI بلوک‌های JSON `{id,kind,markdown,proposal?}` است و Markdown ذخیره می‌شود.
- هیچ fallback متنی نیست: خطا = `AiError` ساختاریافته + «دوباره». شمارش توکن/هزینهٔ ledger فقط از metadata واقعی provider.
- `Proposed` هرگز به‌عنوان واقعیت به مدل داده نمی‌شود؛ «به Context اضافه کن» فقط پیش‌نویس Proposed می‌سازد.
- اجرای AI فقط با کلید پلتفرم انجام می‌شود؛ `MABDA_MANAGED_AI` پشت feature flag و پیش‌فرض خاموش است. کاربر کلید/provider/model اضافه نمی‌کند.

## سیستم طراحی (Mabda، `docs/design-system/`)
- UI فقط از `src/ui` ساخته می‌شود (Button، Card، Dialog، Table، …)؛ کامپوننت جدید لازم شد، از توکن‌های معنایی همان‌جا بساز.
- رنگ، فاصله، شعاع، سایه و تایپ فقط utilityهای معنایی ساخته‌شده از توکن‌ها (`src/ui/tokens/build/theme.css`) (مثل `bg-surface-raised`، `text-text-subtle`، `p-inset-lg`، `gap-stack-md`، `text-body-md`). پالت خام، hex، مقدار دلخواه Tailwind و `left/right` ممنوع است؛ از `ms/me/ps/pe/start/end` استفاده کن.
- منبع توکن‌ها DTCG در سه سطح است: `primitive.json` (پالت OKLCH)، `semantic.json` + `semantic.light.json` / `semantic.dark.json` (نقش‌ها)، `component.json`. جزءها و نقش‌های مشترک هرگز مستقیم به پالت ارجاع نمی‌دهند؛ `tokens.test.ts` drift و کف کنتراست WCAG/APCA را در هر دو حالت اجبار می‌کند.
- رنگ‌های دامنه (نوع Object، وضعیت، یال‌ها، …) فقط aliasهای `mabda.*` در `semantic.json`؛ نشان‌دهنده‌های دامنه در `src/ui/mabda.tsx`. حالت دانش (فکر/پیشنهاد/حقیقت/قدیمی/گذشته) با `Card knowledge=…` و `knowledgeState()`.
- روشن و تیره هر دو پشتیبانی می‌شوند (`useTheme` در `src/ui/theme.ts`)؛ هر تغییر رابط باید در هر دو حالت دیده شود.
- **هر تغییر رابط باید «استاندارد UX و طراحی» در `docs/design-principles.md` را رعایت کند** (دست‌کم دو راه بسنج و انتخاب را در `docs/ui-audit.md` بنویس؛ قانون‌های UX، Nielsen، حالت‌ها، ریسپانسیو، WCAG، RTL، متن رابط).
- در هر نما فقط یک `Button variant="primary"`. رنگ برند برای خطا/هشدار/انتخاب/لینک نیست (`check:design` خارج از `src/ui` اجازه نمی‌دهد).
- کلاس‌های جزء (`.mb-*`) در `src/ui/components.css` داخل `@layer components`اند تا utilityها روی آن‌ها override کنند. رنگ برند فقط برای دکمهٔ primary و نشان Mabda است.
- نوع Constraint در رابط فقط «خط قرمز» است (نه «قید»، «گاردریل»، «محدودیت»)؛ `src/ui/bannedWords.json` اجبارش می‌کند.
- اعداد/تاریخ: `formatNumber`، `formatJalaliDate`، `toLatinDigits` از `src/ui/format.ts`.

## دستورها
- `bun run typecheck` · `bun run test` · `bun run build` — هر سه باید سبز باشند (build اول `check:design` را اجرا می‌کند).
- `bun run tokens` — CSS و تم Tailwind را از توکن‌های DTCG می‌سازد (build با `--check` stale بودن را رد می‌کند).
- `bun run check:design` — هر hex/rgb/رنگ arbitrary/پالت خام/left-right فیزیکی در `src` را رد می‌کند.
- `bun run screens` — اسکرین‌شات ۳۹۰ و ۱۲۸۰، روشن و تیره، در `docs/screens/` + ممیزی خودکار (سرریز، اندازهٔ متن، touch target، کنتراست، تعداد primary).
- تست‌ها با `node:test` نوشته شده و با `tsx` اجرا می‌شوند.
