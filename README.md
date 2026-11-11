# Mabda (مبدأ)

منبع حقیقت تو، برای کار، پروژه و زندگی شخصی: دانش را به Context ساختاریافته تبدیل می‌کند، خروجی‌ها از آن ساخته می‌شوند و با تغییر Context «قدیمی» می‌خورند.

```bash
bun install
bun run dev            # سرور + UI روی http://localhost:3000
bun run typecheck && bun run test && bun run build
```

محیط: `.env.example` (`GEMINI_API_KEY` برای اجرای AI پلتفرم، `MABDA_MANAGED_AI`، `MABDA_ADMIN`). دادهٔ سرور در SQLite (`server/data/mabda.sqlite`، مسیر با `MABDA_DB_PATH`).

## AI و محتوای بیرونی

AI داخلی Mabda فقط با پیکربندی پلتفرم اجرا می‌شود: اپراتور `GEMINI_API_KEY` را تنظیم می‌کند و `MABDA_MANAGED_AI=on` قابلیت‌های مدیریت‌شده را فعال می‌کند. کاربر کلید، provider یا مدل اضافه نمی‌کند.

برای هر AI بیرونی، کاربر می‌تواند بستهٔ Context را کپی و پاسخ را با «وارد کردن پاسخ AI» وارد کند. محتوای واردشده پیشنهاد می‌ماند تا کاربر آن را تأیید کند؛ بستهٔ ذخیره‌شده برای حفظ منشأ و نسخه‌های استفاده‌شده باقی است. اتصال مستقیم، MCP، کلید شخصی و افزودن provider/model در MVP ارائه نمی‌شوند.

## ساختار

`CLAUDE.md` قوانین ثابت، `docs/ux/identity.md` هویت، `docs/ux/audience.md` مخاطب، `docs/design-system/` سیستم طراحی، `docs/ai-architecture.md` معماری AI و ذخیره‌سازی، `docs/decisions-v3.1.md` تصمیم‌ها، `docs/pricing-entitlements.md` پلن‌ها.
