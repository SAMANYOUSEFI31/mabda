import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * دروازهٔ دسترسی برای نسخهٔ آنلاین.
 * Mabda هنوز ورود و حساب کاربری ندارد (همهٔ داده زیر یک کاربر ثابت است)، پس هر نسخهٔ قابل‌رسیدن از اینترنت
 * باید پشت رمز باشد. این دروازه Basic Auth است: مرورگر گوشی خودش یک بار رمز را می‌پرسد و یادش می‌ماند.
 */
const sha = (s: string) => crypto.createHash('sha256').update(s).digest();

export function createAccessGate(password: string): RequestHandler {
  const expected = sha(password);
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // فقط برای بررسی سلامت میزبان؛ هیچ دادهٔ کاربر برنمی‌گرداند
    if (req.path === '/healthz') { res.type('text/plain').send('ok'); return; }
    const header = req.headers.authorization ?? '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const given = decoded.slice(decoded.indexOf(':') + 1); // نام کاربری مهم نیست
      if (crypto.timingSafeEqual(sha(given), expected)) { next(); return; }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Mabda", charset="UTF-8"');
    res.status(401).type('text/plain').send('Authentication required');
  };
}

/** رمز از محیط می‌آید. در حالت production بدون رمز، سرور بالا نمی‌آید مگر اینکه صراحتاً باز گذاشته شود. */
export function resolveAccessGate(env: NodeJS.ProcessEnv): { gate?: RequestHandler; fatal?: string } {
  const password = env.MABDA_ACCESS_PASSWORD ?? '';
  if (password) {
    if (password.length < 12) return { fatal: 'MABDA_ACCESS_PASSWORD must be at least 12 characters.' };
    return { gate: createAccessGate(password) };
  }
  if (env.NODE_ENV === 'production' && env.MABDA_ALLOW_OPEN !== '1') {
    return { fatal: 'Refusing to start in production without MABDA_ACCESS_PASSWORD: the app has no login, so an open server would expose all data. (Set MABDA_ALLOW_OPEN=1 only behind another access control.)' };
  }
  return {};
}
