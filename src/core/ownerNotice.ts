/**
 * The owner-access notice a tester accepts before first use (informed consent, a principle) and its version. The server stores
 * the version a person accepted (`accounts.consent_version`); a new version asks everyone again, so a changed promise is never
 * covered by an old «فهمیدم». `ownerNotice.test.ts` fails when the text changes and the version does not.
 */
export const OWNER_ACCESS_NOTICE = 'این نسخهٔ آزمون است. صاحب مبدأ برای نگه‌داشتن پشتیبان به همهٔ داده‌های این نسخه دسترسی دارد، از جمله یادداشت‌های شخصی تو؛ چیزی را بنویس که از دیده شدنش به دست او نگران نیستی. برای بهتر کردن مبدأ، کارهایت در برنامه هم ثبت می‌شود (کدام صفحه را باز کردی، چه چیزی افزودی یا تأیید کردی و چه وقت)، بدون متنی که می‌نویسی. برای دیدن جاهایی که گیر می‌کنی، شکل صفحه، کلیک‌هایت و نوشته‌های خودِ برنامه (مثل نام دکمه‌ها) با سرویس Microsoft Clarity هم ثبت می‌شود؛ هرچه خودت می‌نویسی پنهان می‌ماند و به‌جای نامت فقط یک کد بی‌نام فرستاده می‌شود.';
export const OWNER_NOTICE_VERSION = 4;
