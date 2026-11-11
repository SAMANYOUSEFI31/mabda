# جزءها

API همهٔ جزءهای `src/ui` بدون تغییر ماند (تنها افزوده: `Card knowledge`)؛ پوسته در `src/ui/components.css` با کلاس‌های `.mb-*` داخل `@layer components` است. فقط ویژگی‌های منطقی (start/end، inline/block) به کار رفته؛ چرخش جهت‌دار با `:dir(rtl)`.

| جزء | نکتهٔ هویتی |
| --- | --- |
| Button | primary لاجورد؛ secondary جوهر روی سطح؛ danger ته‌رنگ آجری؛ فشار `scale 0.98` |
| IconButton | ناحیهٔ لمس ≥ ۴۴px با `::after`؛ در flex کوچک نمی‌شود |
| Card | `knowledge` حالت دانش را می‌گیرد (`docs/ux/meaning-map.md`) |
| Checkbox / Radio / Switch | حالت روشن با جوهر خنثی، نه برند |
| Tabs / Segmented | track فرورفته، کلید انتخاب‌شده روی سطح بالا |
| Dialog | در موبایل sheet از پایین، از ۶۴۰px کارت وسط؛ `is-side` برای پنل کناری |
| Toast | معکوس (جوهر پر)، با «برگرداندن» برای کار برگشت‌پذیر |
| Badge | intentها با ته‌رنگ؛ bold فقط برای وضعیت فعال |
| Link | جوهر با خط زیر؛ رنگ برند ندارد |
| Empty | لبهٔ خط‌چین (جای چیزی که هنوز نیست) با یک کار پیشنهادی |

دسترس‌پذیری: `prefers-reduced-motion`، `prefers-contrast: more` (مرزها پررنگ‌تر)، `forced-colors` (مرز و فوکوس با رنگ‌های سیستم).
