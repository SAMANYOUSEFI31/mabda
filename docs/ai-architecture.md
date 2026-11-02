# معماری AI (پیاده‌سازی فعلی)

مرجع تصمیم‌ها: `docs/decisions-v3.1.md`. این سند فقط می‌گوید کد کجاست و چطور کار می‌کند.

## جریان یک درخواست
```
UI ── previewPlan ──► /api/ai/plan ─► router(decision layer) ─► plan {pattern,tier,effort,band,maxTokens,confidence,reason}
UI: اعتبار = creditEngine.previewCredits(plan)           ← قبل از اجرا نمایش داده می‌شود
UI ── generate(plan) ► /api/ai/generate (NDJSON) ─► pipeline: single | cascade | critique ─► {blocks, markdown, usage, plan}
UI ── chat ─────────► /api/ai/chat     (NDJSON) ─► stream بلوک‌به‌بلوک ─► {blocks, markdown, usage, plan}
```
- هیچ پاسخ ساختگی وجود ندارد. خطا = `{kind, message فارسی, retryable}`؛ UI پیام + «دوباره» نشان می‌دهد.
- نبود کلید = بنر راهنمای تنظیم (`AiStatusBanner`) و غیرفعال شدن دکمه‌ها.

## فایل‌ها (`server/ai/`)
| فایل | نقش |
| --- | --- |
| `config/models.json` | **تنها** جای شناسهٔ مدل، نگاشت effort→پارامتر provider، قیمت. کامنت انتخاب مدل‌ها آنجاست. |
| `providers/provider.ts`, `providers/gemini.ts` | رابط provider (generate / generateStructured / stream) و adapter با `@google/genai` |
| `session.ts` | کلید کاربر (BYOK) یا کلید مدیریت‌شده (پشت `MABDA_MANAGED_AI`)؛ `verifyModels` شناسه‌های config را با فهرست مدل‌های کلید می‌سنجد (حدس نمی‌زند) |
| `decision.ts` | لایهٔ تصمیم: `decide(state, questions[]) → {choice, probability}[]`؛ پیاده‌سازی با سطح cheap؛ جایگزینی با پیاده‌کردن `DecisionLayer` |
| `router.ts` | جدول قطعی + لایهٔ تصمیم. اطمینان < ۰٫۷ یا اهمیت زیاد = یک سطح بالاتر. sensitive و tierهای `requiresExplicitSelection` فقط با انتخاب صریح |
| `pipeline.ts` | single / cascade (ارتقا یک‌بار) / critique؛ validator با معیارهای پذیرش + گاردریل (Constraintهای Confirmed) |
| `context.ts` | پیشوند ثابت: system → Core → Confirmed (ترتیب ثابت)؛ بخش متغیر: Proposed با برچسب «تأییدنشده» |
| `runner.ts` | اجرای مرحله‌ها، timeout با AbortController، ثبت usage واقعی و هزینه |
| `blocks.ts`, `schemas.ts` | JSON schema بلوک‌ها `{id,kind,markdown,proposal?}` و parser افزایشی برای streaming |
| `byok.ts` | ذخیرهٔ کلید با AES-256-GCM (`MABDA_SECRET` یا `server/data/secret.key`) |
| `routes.ts` | `/api/ai/{status,plan,chat,generate,byok}` |
| `testing/` | **فقط تست**: `MockProvider` و `fakeGemini` (stand-in محلی برای e2e؛ خروجی‌اش خروجی مدل نیست) |

## Timeout
گفتگو ۳۰ ثانیه، خروجی ۱۲۰ ثانیه (`models.json → timeoutsMs`)، با `AbortController`؛ کلاینت ۵ ثانیه حاشیه می‌دهد تا خطای ساختاریافتهٔ سرور برنده شود.

## Ledger
هر مرحله (decision / draft / critique / revise / validate / upgrade / chat) جدا ثبت می‌شود: توکن ورودی/cache/خروجی/thinking از metadata پاسخ، هزینه از قیمت‌های config، و `plan` (سطح، effort، الگو، دلیل). BYOK: `creditCost = 0` ولی توکن و هزینه ثبت می‌شود.

## متغیرهای محیطی
`MABDA_MANAGED_AI` (پیش‌فرض خاموش) · `GEMINI_API_KEY` (فقط برای حالت مدیریت‌شده) · `MABDA_SECRET` · `MABDA_GEMINI_BASE_URL` (فقط آزمون محلی)

## آزمون
`bun run test` (router، cascade با provider ماک، هزینه، BYOK، parser، creditEngine، ledger).
e2e محلی با stand-in: دستورها بالای `scripts/e2e-ai.mjs`.

## هنوز نیست
جایگزین (fallback) بین دو شرکت برای هر سطح (فقط Gemini)، ضریب ۱٫۵/۲ طول خروجی در UI، حساب کاربری سمت سرور (BYOK فعلاً با شناسهٔ مرورگر)، اندازه‌گیری واقعی ضریب effort (Alpha).


## ذخیره‌سازی، نسخه و اصالت (v3.1)

- **SQLite** در `server/data/mabda.sqlite` (`MABDA_DB_PATH`)، مهاجرت‌های نسخه‌دار در `server/db/migrations.ts`؛ همهٔ جدول‌ها `user_id` و `workspace_id` دارند (بعداً Postgres). فرانت فقط از `/api` می‌خواند (`src/services/dataApi.ts`)؛ دادهٔ localStorage قدیمی یک‌بار با `POST /api/bootstrap` وارد می‌شود.
- **نسخه:** `ContextObject.version` با ویرایش عنوان/متن/نوع زیاد می‌شود (تغییر وضعیت یا جابه‌جایی گره نه). `supersede` شمارهٔ نسخه را ادامه می‌دهد و رابطهٔ `supersedes` می‌سازد.
- **اصالت:** `GeneratedDeliverable.usedContext = [{id, version}]` دقیقاً همان چیزی است که در prompt تزریق شد (`injectedRefs` در `server/ai/context.ts`). برای خروجی‌ها = Contextهای مرتبط با گره هدف (زنجیرهٔ والدها) + همهٔ Constraintهای تأییدشده؛ برای گفتگو = همهٔ Contextهای محدودهٔ گفتگو.
- **اثر تغییر:** `src/core/impactEngine.ts` (`computeStaleAssets`, `newlyStale`, `halfPriceRebuildAvailable`). بازسازی نصف‌قیمت یک‌بار برای هر مجموعه‌تغییر (`halfPriceUsedFor`).
- **گره‌ها:** قوانین در `src/core/nodeTree.ts`؛ سیستمی = فقط تغییر نام. **یادداشت** هرگز تزریق نمی‌شود؛ «استخراج» فقط Proposed می‌سازد.
- **فایل:** `server/files/*` — txt/md/pdf/docx ≤ ۲۵MB، پردازش یک‌بارِ cheap (`AiService.extract`)، قطعه‌های ~۸۰۰ توکنی، بازیابی BM25 (`src/core/retrieval.ts`) فقط از فایل‌های `ready` و در بودجهٔ ۳۰۰۰ توکن؛ سهمیهٔ ماهانهٔ توکن (Starter 150k / Pro 500k / Max 1.5M) و بیش از آن ۲ اعتبار به ازای هر ۲۰ هزار توکن (`fileProcessingCharge`).
- **سناریوی کامل:** `node scripts/scenario-impact.mjs` (سرور واقعی + stand-in Gemini) → `docs/screens/impact-*.png`.


## اتصال AI بیرونی: MCP و بستهٔ Context

- **MCP** (`server/mcp/`): Streamable HTTP روی `/mcp`، stateless؛ هر درخواست یک `McpServer` به‌اندازهٔ scope توکن می‌سازد (توکن شخصی هر Workspace، فقط hash در `mcp_tokens`). نه ابزار (هشت ابزار اصلی + `get_changes` فقط‌خواندنی) در `tools.ts`؛ `propose_context_updates` وضعیت را در کد روی `Proposed` ثابت می‌کند (آنچه کلاینت بفرستد نادیده است) و `source` (کدام AI، چه وقت، چرا) را ثبت می‌کند.
- **صندوق پیشنهادها** = همهٔ Objectهای `Proposed` با `source`؛ تأیید = تغییر وضعیت به Confirmed (تنها راه تبدیل پیشنهاد AI به واقعیت)، رد = Archived.
- **بستهٔ Context** (`src/core/contextPack.ts`): Markdown فشرده؛ سرور می‌سازد و `context_packs` را با refs (id+version) ذخیره می‌کند تا پاسخ چسبانده‌شده اصالت داشته باشد. نشانگر `<!-- mabda-pack:ID -->` بالای بسته است.
- **وارد کردن پاسخ** (`src/core/answerParser.ts`): اول سرتیترهای سطح دو (رایگان)، بعد `AiService.parseExternal` (cheap)، بعد یک بلوک خام؛ هرگز ساختار ساختگی.
- سناریوها: `scripts/scenario-mcp.ts`، `scripts/scenario-paste.mjs`.


## Change، گراف تصمیم و Asset (spine)

- **`context_changes`** (migration v9): هر مسیر تغییر Object در `server/db/repo.ts` در همان تراکنش یک Change می‌نویسد؛ actor از `source` استنباط می‌شود (MCP/گفتگو/مربی/ورود)، وگرنه کاربر. `reason` فقط در Change است و به هیچ prompt یا بستهٔ Context نمی‌رود؛ `get_changes` (MCP) فقط `hasReason` برمی‌گرداند. رکوردهای قدیمی از `context_object_versions` بازسازی و «[دلیل جایگزینی: …]» از متن‌ها جدا شد (migration مستقل از `src/core`).
- **`ContextType`** فقط Fact/Decision/Constraint است (migration v8: Asset قدیمی → Fact). «پیشنهاد دانش از این خروجی» از `AiService.extract` Proposed با `provenance: Asset Derived` و نقل تأییدشده می‌سازد.
- **`src/core/decisionGraph.ts`**: لایه‌ها/دستهٔ همزمان (SCC)/وابسته‌های تراگذری/`needsReview` (مشتق از Changeها؛ مبنا = آخرین نوشتن یا بازبینی خود مورد). `impactEngine` با دلیل `dependency_changed` فقط تغییرهایی را می‌شمرد که **بعد از ساخت دارایی** رخ داده‌اند (بازسازی آن را تسویه می‌کند).
- مسیر/اعتبارسنج/اعتبار AI در این تغییر دست نخورده است.

## «تفاوت»، ترتیب تصمیم‌ها و نقشه

- **تفاوت (قبل/بعد):** `src/core/textDiff.ts` (کلمه‌به‌کلمه، سازگار با نیم‌فاصله و متن دوجهته) → `BeforeAfter`. زبانهٔ «تاریخچه» در جزئیات Object، صندوق پیشنهادها (هر پیشنهاد یک «تغییر پیشنهادی»: `proposalContext` مورد قابل‌جایگزینی یا موارد مرتبط را پیدا می‌کند؛ پذیرش/ردّ/جایگزینی هرکدام یک Change با «دلیل» اختیاری می‌نویسد) و «چه چیزی عوض شد» (`changeDigest`، از جدول Change، گروه‌بندی عامل).
- **ترتیب:** `decisionGraph.waitingDecisions` (آمادهٔ تصمیم / بلاک‌شده / همزمان) و `flipFlops` (تصمیمی که ≥۳ بار جایگزین شده؛ هشدار نرم).
- **نقشه** (`mapModel.ts` خالص + `ContextMapView.tsx`): کتابخانهٔ آماده استفاده نشد. `@xyflow/react` (MIT، حدود ۱٫۲MB بسته) جهت RTL ندارد، CSS پیش‌فرضش رنگ و left/right فیزیکی دارد و بدون مجازی‌سازی سنگین است؛ `dagre` (MIT) برای ۸۰۰۰ گره در مرورگر کند است و `elkjs` مجوز EPL/GPL دارد. به‌جای آن: چیدمان لایه‌ایِ خودمان (SCC + طولانی‌ترین مسیر، ترتیب سطرها بر اساس درخت و میانگین همسایه‌ها، لایهٔ اول سمت راست)، **جمع‌شدن بر اساس گره** (یال‌های بین گروه‌ها با شمار ادغام می‌شوند) و **برش دید** (فقط کارت‌های داخل دید کشیده می‌شوند). جابه‌جایی با `transform` و `will-change`. ۸۰۰۰ مورد: چیدمان ≈۲۵ms (جمع‌شده) و ≈۱۴۰ms (همه باز)، حرکت ≈۲۰ms. `node scripts/scenario-map.mjs`.
- **N² حذف شد:** `unresolvedContradictions` و `candidatePairs` روی ۸۰۰۰ مورد چند دقیقه طول می‌کشید (همهٔ جفت‌ها)؛ حالا با `pairBlocking.ts` فقط جفت‌های هم‌واژه مقایسه می‌شوند (۸۰ms).
