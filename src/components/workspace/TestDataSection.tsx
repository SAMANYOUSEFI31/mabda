/**
 * «دادهٔ آزمون» inside «افراد آزمون» (only the owner): the stage's measures, computed from the raw record each time it opens,
 * and the raw record as a file for analysis elsewhere (docs/test-data.md). Built only from src/ui.
 * Two ways were weighed (docs/ui-audit.md «دادهٔ آزمون برای صاحب»): a separate dashboard page, or one section here. Chosen: one section, because
 * the owner already comes here for the people and their errors, and ten people need a short list, not a dashboard.
 */
import React, { useEffect, useState } from 'react';
import { Button, Dialog, ErrorState, List, ListItem, PageSkeleton, Table, formatNumber, useToast } from '../../ui';
import { ownerApi } from '../../services/dataApi';
import type { Kpis, PersonKpis } from '../../core/activity';
import { ACTIVATION_MIN } from '../../core/activity';
import { TestLivePanel } from './TestLivePanel';

const of = (n: number, total: number) => `${formatNumber(n)} از ${formatNumber(total)}`;
const mins = (v?: number) => (v === undefined ? '—' : `${formatNumber(v, 1)} دقیقه`);

export const TestDataSection: React.FC<{ open: boolean }> = ({ open }) => {
  const [k, setK] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purging, setPurging] = useState<'ask' | 'busy' | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const toast = useToast();
  // the end of a round (§۵۳ ۱۲): ask once, say what goes and what stays, offer the download in the same place
  const purge = async () => {
    setPurging('busy');
    try { const r = await ownerApi.activityPurge(); toast.show({ intent: 'success', message: `${formatNumber(r.events)} رویداد و ${formatNumber(r.errors)} گزارش خطا پاک شد.` }); setPurging(null); void load(); }
    catch (e) { toast.show({ intent: 'danger', message: `پاک نشد: ${(e as Error).message}. دوباره امتحان کن.` }); setPurging('ask'); }
  };
  const load = async () => { setError(null); try { setK(await ownerApi.activityKpis()); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { if (open) void load(); }, [open]);

  const s = k?.summary;
  const testers = k?.people.filter((p) => p.role === 'tester' || p.role === 'local') ?? [];
  return (
    <section className="flex flex-col gap-stack-sm border-t border-border-default pt-inset-lg" aria-labelledby="testdata-h">
      <div className="flex flex-col gap-stack-xs">
        <h3 id="testdata-h" className="label-md text-text-default">دادهٔ آزمون</h3>
        <p className="body-sm text-text-subtle">کارهایی که افراد کردند، بدون متنی که نوشتند. هر بار از رویدادهای خام دوباره حساب می‌شود؛ فایل خام برای تحلیل‌های دیگر است.</p>
      </div>
      {error ? <ErrorState title="داده‌ها باز نشد" description={error} onRetry={() => void load()} />
        : !k || !s ? <PageSkeleton label="در حال حساب کردن" />
        : (
          <>
            <List label="شاخص‌های این مرحله">
              <ListItem title="به ارزش رسیدند" description={`اولین حقیقت را تا ${formatNumber(ACTIVATION_MIN)} دقیقه پس از ورود تأیید کردند`} trailing={of(s.activated, s.people)} />
              <ListItem title="زمان تا اولین حقیقت" description="میانه، از اولین ورود" trailing={mins(s.medianMinutesToFirstConfirm)} />
              <ListItem title="چرخهٔ اصلی" description="چیزی افزودند، حقیقتی تأیید کردند و روز دیگری برگشتند" trailing={of(s.coreLoop, s.people)} />
              <ListItem title="برگشت فردا" description="روز بعد از اولین روز دوباره آمدند" trailing={of(s.returnedD1, s.people)} />
              <ListItem title="برگشت از روز سوم" description="روز سوم یا بعدتر هنوز می‌آمدند" trailing={of(s.returnedD3plus, s.people)} />
              <ListItem title="زمان استفاده" description="میانهٔ دقیقه‌های فعال هر نفر (بی‌کاری بیش از ۵ دقیقه حساب نمی‌شود)" trailing={mins(s.medianActiveMinutes)} />
              <ListItem title="پایش" description="روی یک حقیقت پایش ساختند یا عددی قدیمی را وصل کردند؛ و چند نفر روز دیگری هم عدد ثبت کردند (برای تصمیم ماندن یا «بعداً»)" trailing={`${of(s.monitoring, s.people)} · ${of(s.monitoringKept, s.people)}`} />
              <ListItem title="خطا" description={`در هر ۱۰۰ کار: ${formatNumber(s.brokePer100, 1)} خرابی سرور، ${formatNumber(s.refusedPer100, 1)} درخواست ردشده · ${formatNumber(s.clientErrors)} خطای دستگاه`} />
            </List>

            <List label="مسیر افراد">
              {k.funnel.map((f) => <ListItem key={f.key} title={f.label} trailing={of(f.people, s.people)} />)}
            </List>

            {testers.length > 0 && (
              <Table<PersonKpis & Record<string, unknown>>
                caption="هر نفر"
                rows={testers as Array<PersonKpis & Record<string, unknown>>}
                columns={[
                  { key: 'name', label: 'نفر', render: (p) => <span className="whitespace-nowrap">{p.name}</span> },
                  { key: 'activeDays', label: 'روز', numeric: true, render: (p) => formatNumber(p.activeDays) },
                  { key: 'activeMinutes', label: 'دقیقه', numeric: true, render: (p) => formatNumber(p.activeMinutes, 1) },
                  { key: 'captures', label: 'افزوده', numeric: true, render: (p) => formatNumber(p.captures) },
                  { key: 'confirms', label: 'تأییدشده', numeric: true, render: (p) => formatNumber(p.confirms) },
                  { key: 'numbers', label: 'عدد پایش', numeric: true, render: (p) => formatNumber(p.numbers) },
                  { key: 'broke', label: 'خطا', numeric: true, render: (p) => formatNumber(p.broke + p.clientErrors) },
                ]}
              />
            )}

            {k.dialogs.length > 0 && (
              <List label="پنجره‌ها">
                {k.dialogs.slice(0, 8).map((d) => (
                  <ListItem key={d.title} title={d.title} description={`${formatNumber(d.opens)} بار باز شد · ${formatNumber(d.completed)} بار به کاری رسید`} />
                ))}
              </List>
            )}

            <div className="flex flex-wrap gap-inline-sm">
              {/* §۵۴ ۱۶: the live panel (what is happening now, each measure's calculation, the raw record filtered) */}
              <Button variant="secondary" iconStart="ChartColumn" onClick={() => setLiveOpen(true)}>پنل زنده و محاسبه‌ها</Button>
              <Button variant="ghost" iconStart="Download" onClick={() => { window.location.href = ownerApi.activityExportUrl('csv'); }}>رویدادهای خام (CSV)</Button>
              <Button variant="ghost" iconStart="Download" onClick={() => { window.location.href = ownerApi.activityExportUrl('json'); }}>همه با شاخص‌ها (JSON)</Button>
              <Button variant="ghost" iconStart="Trash2" onClick={() => setPurging('ask')}>پاک کردن دادهٔ آزمون…</Button>
            </div>
            {liveOpen && <TestLivePanel open onClose={() => { setLiveOpen(false); void load(); }} />}
            <Dialog open={purging !== null} onClose={() => { if (purging !== 'busy') setPurging(null); }} size="sm" title="پاک کردن دادهٔ آزمون"
              description="همهٔ رویدادها و گزارش‌های خطای دستگاه برای همیشه پاک می‌شوند. فضاها و دانش افراد دست نمی‌خورند."
              footer={<>
                <Button variant="ghost" disabled={purging === 'busy'} onClick={() => setPurging(null)}>انصراف</Button>
                <Button variant="danger" loading={purging === 'busy'} onClick={() => void purge()}>برای همیشه پاک کن</Button>
              </>}>
              <div className="flex flex-col gap-stack-sm">
                <p className="body-sm text-text-default">پیش از پاک کردن، فایل کامل را نگه دار؛ بعد از این راه برگشتی نیست.</p>
                <div><Button size="sm" variant="secondary" iconStart="Download" onClick={() => { window.location.href = ownerApi.activityExportUrl('json'); }}>دانلود همه (JSON)</Button></div>
              </div>
            </Dialog>
          </>
        )}
    </section>
  );
};
