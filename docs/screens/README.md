# تصویرهای صفحه (اسکرین‌شات‌ها)

تصویرهای این پوشه (حدود ۹۸ مگابایت، ۱۱۹۱ فایل) در مخزن جدای [**`SAMANYOUSEFI31/mabda-assets`**](https://github.com/SAMANYOUSEFI31/mabda-assets/tree/main/docs/screens) نگه داشته می‌شوند، با همان ساختار پوشه‌ها (`docs/screens/<موضوع>/…`). علت: حجم مخزن اصلی برای ابزارهایی مثل Gemini زیاد شده بود.

- اسکریپت‌ها (`bun run screens` و `scripts/scenario-*.mjs`) مثل قبل در `docs/screens/` می‌نویسند؛ این مسیر برای `.png/.jpg` در `.gitignore` است، پس تصویرها در کامیت‌های mabda نمی‌آیند.
- برای دیدن تصویرِ ارجاع‌شده در سندها (مثل `docs/ux/decisions.md`)، همان مسیر را در `mabda-assets` باز کن.
- تصویر تازه که باید ماندگار شود: در clone محلی `mabda-assets` در همان مسیر بگذار و آنجا کامیت کن.
- `gallery-manifest.json` و `states.md` (متن کم‌حجم) همین‌جا می‌مانند.
- تصویرهای `docs/ux/identity-directions` و `docs/ux/rework` (حدود ۴ مگابایت) فعلاً در mabda ماندند چون سندها مستقیم به آن‌ها لینک می‌دهند.
