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
import { Alert, Badge, Button, Card, Dialog, TextField, formatJalaliDate, formatNumber as formatNumberFa, useToast } from '../ui';

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
    try { const t = await dataApi.createMcpToken(workspaceId, label); setFresh(t.token); await load(); return true; } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); return false; } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { try { setTokens((await dataApi.revokeMcpToken(workspaceId, id)).tokens); } catch (e) { setError(e instanceof DataApiError ? e.message : 'خطای ناشناخته.'); } };
  const mcpPlan = cheapestPlanWith('mcp');

  // a three-step flow, ONE sentence per step; the old connections and the longer help sit in a closed section
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { if (open) { setStep(1); setMoreOpen(false); } }, [open]);
  const make = async () => { if (await create()) setStep(2); };
  const withToken = fresh ? `${url}?token=${fresh}` : url;
  const STEPS = ['یک اتصال بساز', 'در Claude بچسبان', 'امتحان کن'];

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="اتصال به Claude و AIهای دیگر" description="AI خودت از همین منبع حقیقت کار کند؛ سه گام کوتاه.">
      <div className="flex flex-col gap-stack-lg">
        {!allowed ? (
          <Alert intent="info" title="اتصال MCP در این پلن نیست" action={<Button size="sm" variant="secondary" onClick={() => { onClose(); onUpgrade(); }}>مقایسهٔ پلن‌ها</Button>}>
            MCP از پلن {mcpPlan ? PLANS[mcpPlan].title.split(' ')[0] : 'بالاتر'} به بالا فعال است. با «کپی برای هوش مصنوعی» در همهٔ پلن‌ها می‌توانی دانشت را به هر AI بدهی.
          </Alert>
        ) : (
          <>
            <ol className="flex flex-wrap gap-inline-sm" aria-label="گام‌ها">
              {STEPS.map((t, i) => (
                <li key={t}><Badge intent={step === i + 1 ? 'info' : 'neutral'} icon={step > i + 1 ? 'Check' : false}>{formatNumberFa(i + 1)}. {t}</Badge></li>
              ))}
            </ol>

            {step === 1 && (
              <Card padding="lg" className="flex flex-col gap-stack-md" data-testid="mcp-step-1">
                <p className="body-md text-text-default">برای هر برنامه یک کلید جدا می‌سازیم؛ هر وقت خواستی همان را قطع می‌کنی.</p>
                <TextField label="اسم این اتصال" value={label} onChange={(e) => setLabel(e.target.value)} hint="در صندوق پیشنهادها می‌بینی هر پیشنهاد از کدام اتصال آمده." />
                {error && <Alert intent="danger">{error}</Alert>}
                <div><Button variant="primary" iconStart="Plus" loading={busy} disabled={!label.trim()} onClick={make}>ساخت کلید</Button></div>
              </Card>
            )}

            {step === 2 && (
              <Card padding="lg" className="flex flex-col gap-stack-md" data-testid="mcp-step-2">
                <p className="body-md text-text-default">در Claude به Settings ‹ Connectors برو، «Add custom connector» را بزن و این نشانی را بچسبان.</p>
                {fresh ? (
                  <div className="flex flex-col gap-stack-sm">
                    <code dir="ltr" className="code break-all">{withToken}</code>
                    <div><Button variant="secondary" iconStart="Copy" onClick={async () => { await copyText(withToken); toast.show({ intent: 'success', message: 'نشانی همراه کلید کپی شد.' }); }}>کپی نشانی</Button></div>
                    <p className="body-sm text-text-subtle">کلید فقط همین‌جا یک‌بار دیده می‌شود.</p>
                  </div>
                ) : (
                  <p className="body-sm text-text-subtle">کلید این اتصال قبلاً نشان داده شده؛ برای کلید تازه به گام ۱ برگرد.</p>
                )}
                {notPublic && <Alert intent="warning" title="این نشانی عمومی HTTPS نیست">Claude فقط به نشانی HTTPS که از اینترنت در دسترس باشد وصل می‌شود؛ localhost کار نمی‌کند. روی سرور عمومی منتشرش کن.</Alert>}
                <div className="flex flex-wrap gap-inline-sm">
                  <Button variant="primary" iconEnd="ArrowLeft" onClick={() => setStep(3)}>وصل شد</Button>
                  <Button variant="ghost" onClick={() => setStep(1)}>گام قبل</Button>
                </div>
              </Card>
            )}

            {step === 3 && (
              <Card padding="lg" className="flex flex-col gap-stack-md" data-testid="mcp-step-3">
                <p className="body-md text-text-default">در گفتگو ابزارهای مبدأ را فعال کن و بگو: «با منبع حقیقت مبدأ شروع کن». هرچه Claude پیشنهاد بدهد اول در صندوق پیشنهادها می‌ماند و تا تأیید تو واقعیت نیست.</p>
                <div className="flex flex-wrap gap-inline-sm">
                  <Button variant="primary" onClick={onClose}>تمام شد</Button>
                  <Button variant="ghost" onClick={() => setStep(2)}>گام قبل</Button>
                </div>
              </Card>
            )}

            <div className="flex flex-col gap-stack-sm">
              <div><Button variant="ghost" size="sm" iconStart={moreOpen ? 'ChevronUp' : 'ChevronDown'} aria-expanded={moreOpen} aria-controls="mcp-more" onClick={() => setMoreOpen((v) => !v)}>اتصال‌های من و راهنمای بیشتر</Button></div>
              {moreOpen && (
                <div id="mcp-more" className="flex flex-col gap-stack-md rounded-control border border-border-default p-inset-lg">
                  <TextField label="نشانی سرور (Streamable HTTP)" readOnly dir="ltr" value={url} />
                  {tokens.length > 0 && (
                    <ul className="flex flex-col gap-stack-xs" aria-label="اتصال‌های MCP">
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
                  <p className="body-sm text-text-subtle">برنامه‌های دیگر: نوع «Streamable HTTP»، همین نشانی و هدر <span dir="ltr" className="code">Authorization: Bearer mbd_…</span>. گام‌های رابط Claude گاهی عوض می‌شود.</p>
                  <p className="body-sm text-text-subtle">بدون MCP: روی هر خروجی «کپی برای هوش مصنوعی» را بزن، در هر AI بچسبان و پاسخش را با «وارد کردن پاسخ AI» برگردان.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
