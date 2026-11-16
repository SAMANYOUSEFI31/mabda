/**
 * «افراد آزمون» (only the owner, only online with sign-in): make a personal link for each tester, replace a lost link, turn a
 * person off, see what broke on testers' devices, and take a copy of the whole database. Built only from src/ui.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Dialog, EmptyState, ErrorState, List, ListItem, PageSkeleton, TextField, formatJalaliDateTime } from '../../ui';
import { ownerApi } from '../../services/dataApi';
import type { ErrorReportInfo, PersonInfo } from '../../services/dataApi';

interface Props { open: boolean; onClose: () => void }

export const PeopleDialog: React.FC<Props> = ({ open, onClose }) => {
  const [people, setPeople] = useState<PersonInfo[] | null>(null);
  const [errors, setErrors] = useState<ErrorReportInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ name: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const [p, e] = await Promise.all([ownerApi.people(), ownerApi.errors()]);
      setPeople(p.people); setErrors(e.errors);
    } catch (err) { setLoadError((err as Error).message); }
  };
  useEffect(() => { if (open) { setFresh(null); setCopied(false); setActionError(null); void load(); } }, [open]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setActionError(null);
    try { await fn(); } catch (err) { setActionError((err as Error).message); } finally { setBusy(false); }
  };
  const invite = () => act(async () => {
    const r = await ownerApi.invite(name);
    setFresh({ name: r.person.name, link: r.link }); setCopied(false); setName('');
    await load();
  });
  const replace = (p: PersonInfo) => act(async () => { const r = await ownerApi.newLink(p.id); setFresh({ name: p.name, link: r.link }); setCopied(false); await load(); });
  const toggle = (p: PersonInfo) => act(async () => { await ownerApi.setDisabled(p.id, !p.disabledAt); await load(); });
  const copy = async () => { try { await navigator.clipboard.writeText(fresh!.link); setCopied(true); } catch { setCopied(false); } };

  return (
    <Dialog open={open} onClose={onClose} title="افراد آزمون" description="برای هر نفر یک لینک شخصی بساز؛ هر کس با لینک خودش فقط دادهٔ خودش را می‌بیند." size="lg">
      <div className="flex flex-col gap-stack-lg">
        <form className="flex flex-col gap-stack-sm" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !busy) void invite(); }}>
          <TextField label="نام نفر تازه" hint="فقط برای اینکه خودت بدانی لینک مال کیست." value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <div><Button type="submit" variant="primary" iconStart="Link2" disabled={!name.trim() || busy}>ساختن لینک</Button></div>
        </form>

        {fresh && (
          <Alert intent="success" title={`لینک «${fresh.name}» آماده است`}>
            <div className="flex flex-col gap-stack-sm">
              <TextField label="لینک شخصی" value={fresh.link} readOnly dir="ltr" onFocus={(e) => e.currentTarget.select()} />
              <p>این لینک فقط همین حالا نشان داده می‌شود. آن را فقط برای همین نفر بفرست؛ هر کس آن را داشته باشد، دادهٔ او را می‌بیند. اگر گم شد، «لینک تازه» بزن.</p>
              <div><Button variant="secondary" iconStart={copied ? 'Check' : 'Copy'} onClick={() => void copy()}>{copied ? 'کپی شد' : 'کپی لینک'}</Button></div>
            </div>
          </Alert>
        )}
        {actionError && <Alert intent="danger" title="انجام نشد">{actionError}</Alert>}

        <section className="flex flex-col gap-stack-sm" aria-labelledby="people-h">
          <h3 id="people-h" className="label-md text-text-default">افراد</h3>
          {loadError ? <ErrorState title="فهرست باز نشد" description={loadError} onRetry={() => void load()} />
            : !people ? <PageSkeleton label="در حال آوردن فهرست" />
            : !people.length ? <EmptyState title="هنوز کسی دعوت نشده" description="نام اولین نفر را بنویس و «ساختن لینک» را بزن." />
            : (
              <List label="افراد آزمون">
                {people.map((p) => (
                  <ListItem
                    key={p.id}
                    title={p.name}
                    description={p.disabledAt ? 'خاموش: لینکش کار نمی‌کند (داده‌اش می‌ماند)' : p.lastSeenAt ? `آخرین بار: ${formatJalaliDateTime(p.lastSeenAt)} · ${p.consentedAt ? 'آگاهی از دسترسی تو را پذیرفته' : 'هنوز آگاهی را نپذیرفته'}` : 'هنوز وارد نشده'}
                    trailing={(
                      <span className="flex flex-wrap gap-inline-xs">
                        <Button size="sm" variant="ghost" iconStart="RefreshCw" disabled={busy} onClick={() => void replace(p)}>لینک تازه</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void toggle(p)}>{p.disabledAt ? 'روشن کردن' : 'خاموش کردن'}</Button>
                      </span>
                    )}
                  />
                ))}
              </List>
            )}
        </section>

        <section className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg" aria-labelledby="errors-h">
          <h3 id="errors-h" className="label-md text-text-default">خطاهای گزارش‌شده</h3>
          <p className="body-sm text-text-subtle">آنچه روی دستگاه افراد یا سرور خراب شد؛ بدون هیچ متنی که نوشته‌اند.</p>
          {!errors.length ? <p className="body-sm text-text-subtle">خطایی گزارش نشده است.</p> : (
            <List label="خطاهای گزارش‌شده">
              {errors.slice(0, 30).map((e) => (
                <ListItem key={e.id} title={<span dir="ltr">{e.name}: {e.message || '—'}</span>} description={`${formatJalaliDateTime(e.createdAt)} · ${e.source === 'server' ? 'سرور' : 'دستگاه'} · ${people?.find((p) => p.id === e.userId)?.name ?? (e.userId === 'owner' ? 'خودت' : 'نامعلوم')}${e.path ? ` · ${e.path}` : ''}`} />
              ))}
            </List>
          )}
        </section>

        <section className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg" aria-labelledby="backup-h">
          <h3 id="backup-h" className="label-md text-text-default">پشتیبان کل داده‌ها</h3>
          <p className="body-sm text-text-subtle">سرور هر روز خودش یک نسخه نگه می‌دارد (۱۴ روز آخر). این دکمه همین حالا یک نسخهٔ کامل از دادهٔ همهٔ افراد می‌دهد تا جای دیگری هم نگهش داری.</p>
          <div><Button variant="secondary" iconStart="Download" onClick={() => { window.location.href = ownerApi.backupUrl; }}>دانلود نسخهٔ کامل</Button></div>
        </section>
      </div>
    </Dialog>
  );
};
