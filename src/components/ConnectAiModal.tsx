/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { PlanId } from '../types';
import type { McpTokenInfo } from '../types/state';
import { cheapestPlanWith } from '../core/entitlements';
import { PLANS } from '../core/creditEngine';
import { dataApi, DataApiError } from '../services/dataApi';
import { Alert, Badge, Button, Card, Dialog, TextField, formatJalaliDate, useToast } from '../ui';

interface Props {
  open: boolean;
  workspaceId: string;
  planId: PlanId;
  onClose: () => void;
  onUpgrade: () => void;
}

const copyText = async (t: string) => {
  try { await navigator.clipboard.writeText(t); } catch {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
};

/** Connect Claude (or any MCP client) to this workspace: URL, a personal token per connection, and the steps. */
export const ConnectAiModal: React.FC<Props> = ({ open, workspaceId, planId, onClose, onUpgrade }) => {
  const toast = useToast();
  const [tokens, setTokens] = useState<McpTokenInfo[]>([]);
  const [allowed, setAllowed] = useState(true);
  const [label, setLabel] = useState('Claude');
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await dataApi.listMcpTokens(workspaceId); setTokens(r.tokens); setAllowed(r.allowed); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); }
  }, [workspaceId]);
  useEffect(() => { if (open) { setFresh(null); setError(null); void load(); } }, [open, load]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/mcp`;
  const notPublic = !origin.startsWith('https://') || /localhost|127\.0\.0\.1|\[::1\]/.test(origin);
  const create = async () => {
    setBusy(true); setError(null);
    try { const t = await dataApi.createMcpToken(workspaceId, label); setFresh(t.token); await load(); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { try { setTokens((await dataApi.revokeMcpToken(workspaceId, id)).tokens); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); } };
  const mcpPlan = cheapestPlanWith('mcp');

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="اتصال به Claude و AIهای دیگر" description="AI خودت از همین منبع حقیقت کار کند: با MCP (Claude و هر کلاینت MCP) یا با کپی/چسباندن (هر AI، حتی رایگان)." footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
      <div className="flex flex-col gap-stack-lg">
        {!allowed ? (
          <Alert intent="info" title="اتصال MCP در این پلن نیست" action={<Button size="sm" variant="secondary" onClick={() => { onClose(); onUpgrade(); }}>مقایسهٔ پلن‌ها</Button>}>
            MCP از پلن {mcpPlan ? PLANS[mcpPlan].title.split(' ')[0] : 'بالاتر'} به بالا فعال است. با «کپی برای هوش مصنوعی» در همهٔ پلن‌ها می‌توانی دانشت را به هر AI بدهی.
          </Alert>
        ) : (
          <>
            <Card padding="lg" className="flex flex-col gap-stack-sm">
              <h3 className="title text-text-default">۱. نشانی سرور MCP</h3>
              <div className="flex items-end gap-inline-sm">
                <div className="flex-1"><TextField label="نشانی (Streamable HTTP)" readOnly dir="ltr" value={url} /></div>
                <Button variant="secondary" iconStart="Copy" onClick={async () => { await copyText(url); toast.show({ intent: 'success', message: 'نشانی کپی شد.' }); }}>کپی</Button>
              </div>
              {notPublic && <Alert intent="warning" title="این نشانی عمومی HTTPS نیست">Claude فقط به نشانی HTTPS که از اینترنت در دسترس باشد وصل می‌شود؛ localhost کار نمی‌کند. اپ را روی یک دامنهٔ HTTPS مستقر کن (یا موقتاً با tunnel در دسترس بگذار) و همین صفحه را از آن نشانی باز کن.</Alert>}
            </Card>

            <Card padding="lg" className="flex flex-col gap-stack-md">
              <h3 className="title text-text-default">۲. توکن شخصی این فضای کاری</h3>
              <p className="body-sm text-text-subtle">هر اتصال توکن خودش را دارد و فقط به همین فضای کاری دسترسی می‌دهد. توکن فقط یک‌بار نمایش داده می‌شود؛ هر وقت لازم شد باطلش کن.</p>
              <div className="flex items-end gap-inline-sm">
                <div className="flex-1"><TextField label="نام اتصال (در صندوق پیشنهادها دیده می‌شود)" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
                <Button variant="secondary" iconStart="Plus" loading={busy} disabled={!label.trim()} onClick={create}>ساخت توکن</Button>
              </div>
              {error && <Alert intent="danger">{error}</Alert>}
              {fresh && (
                <Alert intent="success" title="توکن تازه (فقط همین‌جا دیده می‌شود)">
                  <div className="flex flex-col gap-stack-sm">
                    <code dir="ltr" className="code break-all">{fresh}</code>
                    <div className="flex flex-wrap gap-inline-sm">
                      <Button size="sm" variant="secondary" iconStart="Copy" onClick={async () => { await copyText(fresh); toast.show({ intent: 'success', message: 'توکن کپی شد.' }); }}>کپی توکن</Button>
                      <Button size="sm" variant="secondary" iconStart="Copy" onClick={async () => { await copyText(`${url}?token=${fresh}`); toast.show({ intent: 'success', message: 'نشانی همراه توکن کپی شد.' }); }}>کپی نشانی با توکن</Button>
                    </div>
                  </div>
                </Alert>
              )}
              {tokens.length > 0 && (
                <ul className="flex flex-col gap-stack-xs" aria-label="توکن‌های MCP">
                  {tokens.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-inline-sm rounded-control-sm border border-border-subtle p-inset-sm">
                      <span className="flex flex-wrap items-center gap-inline-sm">
                        <span className="label-md text-text-default">{t.label}</span>
                        <span className="caption text-text-subtle" dir="ltr">mbd_…{t.last4}</span>
                        {t.revokedAt ? <Badge intent="neutral" icon={false}>باطل‌شده</Badge> : <Badge intent="success" icon={false}>فعال</Badge>}
                        <span className="caption text-text-subtle">ساخته‌شده {formatJalaliDate(t.createdAt)}{t.lastUsedAt ? ` · آخرین استفاده ${formatJalaliDate(t.lastUsedAt)}` : ''}</span>
                      </span>
                      {!t.revokedAt && <Button size="sm" variant="ghost" iconStart="Trash2" onClick={() => revoke(t.id)}>باطل کن</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card padding="lg" className="flex flex-col gap-stack-sm">
              <h3 className="title text-text-default">۳. افزودن به Claude</h3>
              <ol className="body-md list-inside list-decimal text-text-default">
                <li>در Claude به Settings ‹ Connectors برو و «Add custom connector» را بزن.</li>
                <li>نام دلخواه (مثلاً «مبدأ») و نشانی سرور بالا را وارد کن. اگر Claude جایی برای هدر Authorization ندارد، «نشانی با توکن» را بگذار؛ توکن داخل نشانی است، پس آن را جایی عمومی نگذار.</li>
                <li>در گفتگو، ابزارهای مبدأ را فعال کن و بگو: «با منبع حقیقت مبدأ شروع کن».</li>
                <li>هر چیزی که Claude پیشنهاد بدهد در «صندوق پیشنهادها» می‌آید و تا تأیید تو واقعیت نیست.</li>
              </ol>
              <p className="body-sm text-text-subtle">کلاینت‌های دیگر MCP: نوع «Streamable HTTP»، همین نشانی، و هدر <span dir="ltr" className="code">Authorization: Bearer mbd_…</span>. گام‌های رابط Claude ممکن است با نسخه‌ها فرق کند. ورود با OAuth برای بعد آماده می‌شود و فعلاً توکن شخصی کافی است.</p>
            </Card>
          </>
        )}

        <Card padding="lg" className="flex flex-col gap-stack-xs">
          <h3 className="title text-text-default">بدون MCP: کپی و چسباندن</h3>
          <p className="body-sm text-text-subtle">در استودیوی جریان‌های کار روی هر خروجی یا جریان کار «کپی برای هوش مصنوعی» را بزن، در هر AI بچسبان و پاسخش را با «وارد کردن پاسخ AI» برگردان.</p>
        </Card>
      </div>
    </Dialog>
  );
};
