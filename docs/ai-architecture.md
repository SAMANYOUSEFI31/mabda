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
