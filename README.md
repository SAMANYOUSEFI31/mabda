# Mabda (مبدأ)

منبع حقیقت کسب‌وکار برای AI خودت: دانش را به Context ساختاریافته تبدیل می‌کند، خروجی‌ها از آن ساخته می‌شوند و با تغییر Context «قدیمی» می‌خورند.

```bash
bun install
bun run dev            # سرور + UI روی http://localhost:3000
bun run typecheck && bun run test && bun run build
```

محیط: `.env.example` (کلید Gemini، `MABDA_MANAGED_AI`، `MABDA_ADMIN`، …). دادهٔ سرور در SQLite (`server/data/mabda.sqlite`، مسیر با `MABDA_DB_PATH`).

## وصل کردن AI خودت به Mabda

دو راه، هر دو از «تنظیمات ‹ اتصال به Claude و AIهای دیگر» یا صندوق پیشنهادها:

### ۱. MCP (Claude و هر کلاینت MCP)

- **نشانی:** `https://<دامنهٔ شما>/mcp` (Streamable HTTP، بدون session). برای Claude باید **HTTPS عمومی** باشد؛ `localhost` کار نمی‌کند.
- **احراز هویت (MVP):** توکن شخصی برای هر Workspace (`mbd_…`)، ساخت/باطل‌کردن در تنظیمات؛ فقط hash ذخیره می‌شود و توکن یک‌بار نمایش داده می‌شود. هدر `Authorization: Bearer <token>`؛ برای کلاینت‌هایی که هدر ندارند `…/mcp?token=<token>` (توکن در URL است، پس لو نده).
- **پلن:** MCP از Pro به بالا (`src/core/entitlements.config.ts`).
- **ابزارها:** `get_workspace_overview`، `get_context`، `get_gaps`، `get_readiness`، `propose_context_updates` (فقط **Proposed**، منتظر تأیید در صندوق پیشنهادها)، `save_asset` (با `usedContext` برای اصالت)، `check_impact`، `list_assets`، `get_asset`. دستورالعمل سرور به AI می‌گوید: اول Gap، Context را از Mabda بخوان، تغییرات را فقط پیشنهاد بده.
- **افزودن به Claude:** Settings ‹ Connectors ‹ Add custom connector ‹ نشانی بالا.
- نمونهٔ اجرا: `npx tsx scripts/scenario-mcp.ts` (خروجی در `docs/mcp-scenario.md`).

#### OAuth (بعداً)

توکن شخصی فقط MVP است. برنامه: OAuth 2.1 با PKCE و Dynamic Client Registration طبق مشخصات احراز هویت MCP، تا اتصال Claude بدون چسباندن توکن در URL انجام شود. نقطهٔ اتصال آماده است: `server/mcp/router.ts` (تابع `tokenOf` و بررسی `resolveMcpToken`) باید با یک `OAuthServerProvider` جایگزین شود و scope هر توکن همین `{userId, workspaceId}` بماند. سرور بدون session است، پس چیز دیگری تغییر نمی‌کند.

### ۲. کپی/چسباندن (هر AI، حتی رایگان)

«کپی برای هوش مصنوعی» روی هر خروجی یا spec یک بستهٔ Markdown فشرده می‌سازد (دانش تأییدشده، پیشنهادی با برچسب، Gap، معیارها، گاردریل‌ها و قالب پاسخ) و اندازه‌اش را نشان می‌دهد. پاسخ AI را با «وارد کردن پاسخ AI» برگردان؛ سرتیترهای `## Decision / Fact / Constraint / Question / Asset` به بلوک تبدیل می‌شوند (اگر نبودند، لایهٔ تصمیم ارزان تقسیم می‌کند). هر بلوک را خودت به Context (پیشنهادی) یا دارایی می‌بری و اصالت به همان بسته وصل می‌ماند.

## ساختار

`CLAUDE.md` قوانین ثابت، `docs/ai-architecture.md` معماری AI و ذخیره‌سازی، `docs/decisions-v3.1.md` تصمیم‌ها، `docs/pricing-entitlements.md` پلن‌ها.
