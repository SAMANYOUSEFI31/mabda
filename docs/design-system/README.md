# سیستم طراحی Mabda

جایگزین بوشیدو (`public/ds`) از آبان ۱۴۰۵. هویت: «کاغذ دقیق» (`docs/ux/identity.md`).

| بخش | سند | کد |
| --- | --- | --- |
| توکن‌ها | [tokens.md](tokens.md) | `src/ui/tokens/*.json` → `bun run tokens` → `src/ui/tokens/build/` |
| تایپ | [typography.md](typography.md) | `src/ui/fonts.css`، `public/fonts/`، `type.*` در `semantic.json` |
| جزءها | [components.md](components.md) | `src/ui/*.tsx`، `src/ui/components.css` |
| معنا | `docs/ux/meaning-map.md` | `knowledge.*`، `mabda.*` |
| تعامل | `docs/ux/interaction-grammar.md` | — |

## قاعده‌های اجباری
- فقط utilityهای معنایی (`bg-surface-raised`، `text-text-subtle`، `p-inset-lg`، …). `check:design` پالت خام، hex، رنگ arbitrary و `left/right` فیزیکی را رد می‌کند.
- `src/ui/tokens.test.ts`: فایل‌های ساخته‌شده با منبع یکی‌اند؛ روشن و تیره نقش‌های یکسان دارند؛ جزءها به پالت ارجاع نمی‌دهند؛ هر جفت متن/سطح کف WCAG 2.2 AA و APCA را در هر دو حالت دارد.
- `bun run screens`: هر نما در ۳۹۰ و ۱۲۸۰، روشن و تیره، با ممیزی سرریز، اندازهٔ متن، touch target، کنتراست (WCAG + APCA) و تعداد primary.

## حالت تیره
`.dark` روی `html`، از `localStorage['mabda:theme']` یا ترجیح سیستم (اسکریپت درون‌خطی در `index.html` تا چشمک نزند). کاربر در منوی حساب «ظاهر» را بین مثل دستگاه / روشن / تیره عوض می‌کند (`useTheme`).
