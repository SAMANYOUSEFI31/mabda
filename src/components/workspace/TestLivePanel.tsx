/**
 * The owner's live panel for the user test (decisions.md §۵۴ ۱۶): what the testers are doing now, the measures with HOW each is
 * computed, and the raw record, filterable and downloadable. Owner only: it lives inside «افراد آزمون», and every call behind it
 * answers 404 to anyone else (server/auth/owner.ts).
 *
 * Two ways were weighed: a separate dashboard page, or a large panel opened from the existing «دادهٔ آزمون» section. Chosen: the
 * panel, because the owner already comes to that section, a page would add a route only she can see, and the short summary stays
 * where it was for a quick look. «زنده» asks only for what is newer every 10 seconds while the tab is visible; it stops when hidden.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Dialog, ErrorState, List, ListItem, PageSkeleton, Select, Switch, Table, Tabs, formatJalaliDate, formatNumber } from '../../ui';
import { ownerApi } from '../../services/dataApi';
import type { ActivityEvent, Kpis, PersonInput, PersonKpis } from '../../core/activity';
import { KPI_DEFINITIONS, categoryOf, uiLabel } from '../../core/activity';

const POLL_MS = 10_000;
const KEEP = 300;
const CATEGORY_FA: Record<string, string> = { capture: 'افزودن', knowledge: 'ساخت دانش', confirm: 'تأیید', edit: 'ویرایش', remove: 'حذف', organize: 'سازمان‌دهی', output: 'خروجی', review: 'بازبینی', other: 'دیگر' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tehran' });
const value = (k: keyof Kpis['summary'], s: Kpis['summary']) => {
  const v = s[k];
  if (v === undefined) return '—';
  if (k === 'people' || k === 'actions' || k === 'clientErrors') return formatNumber(v);
  if (k.startsWith('median')) return formatNumber(v, 1);
  if (k.endsWith('Per100')) return formatNumber(v, 1);
  return `${formatNumber(v)} از ${formatNumber(s.people)}`;
};
const pairsOf = <T,>(o: Record<string, T>): Array<[string, T]> => Object.entries(o);
const shown = (v: unknown) => (typeof v === 'string' ? uiLabel(v) : String(v));
const propsText = (e: ActivityEvent) => pairsOf(e.props ?? {}).map(([k, v]) => `${k}=${shown(v)}`).join(' · ');
const kpiKeys = Object.keys(KPI_DEFINITIONS) as Array<keyof Kpis['summary']>;
const csvOf = (rows: ActivityEvent[], name: (id: string) => string) => {
  const q = (v: unknown) => { const t = v === undefined || v === null ? '' : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return ['at,person,kind,name,category,status,ms,props', ...rows.map((e) => [e.at, name(e.userId), e.kind, e.name, e.kind === 'action' ? categoryOf(e.name) : '', e.status, e.ms, JSON.stringify(e.props ?? {})].map(q).join(','))].join('\r\n');
};

export const TestLivePanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [tab, setTab] = useState('kpis');
  const [k, setK] = useState<Kpis | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [people, setPeople] = useState<PersonInput[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [person, setPerson] = useState('');
  const [kind, setKind] = useState<'' | 'action' | 'ui'>('');
  const [updated, setUpdated] = useState<string | null>(null);
  const newest = useRef<string | undefined>(undefined);

  const refresh = useCallback(async (full: boolean) => {
    try {
      const q = { person: person || undefined, kind: kind || undefined, limit: 200 };
      const [kp, rec] = await Promise.all([ownerApi.activityKpis(), ownerApi.activityRecent(full ? q : { ...q, after: newest.current })]);
      setK(kp); setPeople(rec.people); setTotal(rec.total); setError(null);
      setEvents((prev) => { const next = full ? rec.events : [...rec.events, ...prev].slice(0, KEEP); newest.current = next[0]?.at ?? newest.current; return next; });
      setUpdated(new Date().toISOString());
    } catch (e) { setError((e as Error).message); }
  }, [person, kind]);

  // a filter change asks for the whole list again; while «زنده», only what is newer, every 10 s, and only while the tab is seen
  useEffect(() => { if (!open) return; newest.current = undefined; void refresh(true); }, [open, refresh]);
  useEffect(() => {
    if (!open || !live) return undefined;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(false); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [open, live, refresh]);

  const nameOf = useMemo(() => { const m = new Map(people.map((p) => [p.id, p.name])); return (id: string) => m.get(id) ?? id; }, [people]);
  const testers = k?.people.filter((p) => p.role === 'tester' || p.role === 'local') ?? [];
  const download = (text: string, file: string, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };

  const kpis = k && (
    <div className="flex flex-col gap-stack-lg">
      {/* each measure with its number and, under it, how it is computed: a number she can check is one she can decide by */}
      <List label="شاخص‌ها و محاسبه‌شان">
        {kpiKeys.map((key) => (
          <ListItem key={key} title={KPI_DEFINITIONS[key].label} description={KPI_DEFINITIONS[key].formula} trailing={<span className="tabular-nums">{value(key, k.summary)}</span>} />
        ))}
      </List>
      <List label="مسیر افراد">{k.funnel.map((f) => <ListItem key={f.key} title={f.label} trailing={`${formatNumber(f.people)} از ${formatNumber(k.summary.people)}`} />)}</List>
      <List label="کارها بر اساس نوع (فقط کار خودِ افراد، نه روی نمونه)">
        {pairsOf(k.categories).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([c, n]) => <ListItem key={c} title={CATEGORY_FA[c] ?? c} trailing={formatNumber(n)} />)}
      </List>
      {k.tabs.length > 0 && <List label="صفحه‌ها">{k.tabs.map((t) => <ListItem key={t.tab} title={uiLabel(t.tab)} description={`${formatNumber(t.people)} نفر`} trailing={`${formatNumber(t.views)} بار`} />)}</List>}
      {k.dialogs.length > 0 && (
        <List label="پنجره‌ها: باز شد، به کاری رسید، میانهٔ ماندن">
          {k.dialogs.map((d) => <ListItem key={d.title} title={d.title} description={`${formatNumber(d.opens)} بار باز شد · ${formatNumber(d.completed)} بار به کاری رسید${d.medianSeconds !== undefined ? ` · میانه ${formatNumber(d.medianSeconds)} ثانیه` : ''}`} />)}
        </List>
      )}
      {testers.length > 0 && (
        <Table<PersonKpis & Record<string, unknown>>
          caption="هر نفر"
          rows={testers as Array<PersonKpis & Record<string, unknown>>}
          columns={[
            { key: 'name', label: 'نفر', render: (p) => <span className="whitespace-nowrap">{p.name}</span> },
            { key: 'lastAt', label: 'آخرین بار', render: (p) => (p.lastAt ? <span className="whitespace-nowrap">{formatJalaliDate(p.lastAt)} {time(p.lastAt)}</span> : '—') },
            { key: 'activeDays', label: 'روز', numeric: true, render: (p) => formatNumber(p.activeDays) },
            { key: 'activeMinutes', label: 'دقیقه', numeric: true, render: (p) => formatNumber(p.activeMinutes, 1) },
            { key: 'minutesToFirstConfirm', label: 'تا اولین حقیقت', numeric: true, render: (p) => (p.minutesToFirstConfirm === undefined ? '—' : formatNumber(p.minutesToFirstConfirm, 1)) },
            { key: 'captures', label: 'افزوده', numeric: true, render: (p) => formatNumber(p.captures) },
            { key: 'confirms', label: 'تأیید', numeric: true, render: (p) => formatNumber(p.confirms) },
            { key: 'edits', label: 'ویرایش', numeric: true, render: (p) => formatNumber(p.edits) },
            { key: 'outputs', label: 'خروجی', numeric: true, render: (p) => formatNumber(p.outputs) },
            { key: 'sampleShare', label: 'روی نمونه', numeric: true, render: (p) => (p.sampleShare === undefined ? '—' : `${formatNumber(Math.round(p.sampleShare * 100))}٪`) },
            { key: 'broke', label: 'خطا', numeric: true, render: (p) => formatNumber(p.broke + p.clientErrors) },
          ]}
        />
      )}
    </div>
  );

  const feed = (
    <div className="flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-end gap-inline-sm">
        <div className="w-overlay-xs max-w-full"><Select label="نفر" value={person} onChange={(e) => setPerson(e.target.value)} options={[{ value: '', label: 'همه' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} /></div>
        <div className="w-overlay-xs max-w-full"><Select label="نوع" value={kind} onChange={(e) => setKind(e.target.value as '' | 'action' | 'ui')} options={[{ value: '', label: 'همه' }, { value: 'action', label: 'کار (تغییر داده)' }, { value: 'ui', label: 'صفحه و پنجره' }]} /></div>
        <Button size="sm" variant="ghost" iconStart="Download" disabled={!events.length} onClick={() => download(csvOf(events, nameOf), 'mabda-activity-view.csv', 'text/csv;charset=utf-8')}>همین فهرست (CSV)</Button>
      </div>
      <Table<ActivityEvent & Record<string, unknown>>
        caption="رویدادها، تازه‌ترین بالا"
        rows={events as Array<ActivityEvent & Record<string, unknown>>}
        empty={<p className="body-sm text-text-subtle">هنوز رویدادی نیست.</p>}
        columns={[
          { key: 'at', label: 'زمان', render: (e) => <span className="tabular-nums whitespace-nowrap">{time(e.at)}</span> },
          { key: 'userId', label: 'نفر', render: (e) => <span className="whitespace-nowrap">{nameOf(e.userId)}</span> },
          { key: 'name', label: 'رویداد', render: (e) => <span className="flex flex-wrap items-center gap-inline-xs"><span dir="ltr" className="caption">{e.name}</span>{e.kind === 'action' && <Badge intent="neutral">{CATEGORY_FA[categoryOf(e.name)]}</Badge>}</span> },
          { key: 'status', label: 'پاسخ', numeric: true, render: (e) => (e.status === undefined ? '' : <Badge intent={e.status >= 500 ? 'danger' : e.status >= 400 ? 'warning' : 'neutral'}>{formatNumber(e.status)}</Badge>) },
          { key: 'props', label: 'برچسب‌ها', render: (e) => <span dir="ltr" className="caption text-text-subtle">{propsText(e)}</span> },
        ]}
      />
    </div>
  );

  return (
    <Dialog open={open} onClose={onClose} size="xl" title="دادهٔ آزمون، زنده"
      description="فقط برای تو. کارها و صفحه‌های افراد، بدون متنی که نوشتند. شاخص‌ها هر بار از رویدادهای خام حساب می‌شوند."
      footer={<>
        <Button variant="ghost" iconStart="Download" onClick={() => { window.location.href = ownerApi.activityExportUrl('csv'); }}>همهٔ رویدادها (CSV)</Button>
        <Button variant="secondary" iconStart="Download" onClick={() => { window.location.href = ownerApi.activityExportUrl('json'); }}>همه با شاخص‌ها (JSON)</Button>
      </>}>
      <div className="flex flex-col gap-stack-md" data-testid="test-live-panel">
        <div className="flex flex-wrap items-center justify-between gap-inline-sm">
          <Switch label="زنده (هر ۱۰ ثانیه)" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span className="caption text-text-subtle" aria-live="polite">{updated ? `به‌روز: ${time(updated)} · ${formatNumber(total)} رویداد در کل` : ''}</span>
        </div>
        {error ? <ErrorState title="داده‌ها باز نشد" description={error} onRetry={() => void refresh(true)} />
          : !k ? <PageSkeleton label="در حال حساب کردن" />
          : <Tabs label="بخش‌های پنل" value={tab} onChange={setTab} items={[{ id: 'kpis', label: 'شاخص‌ها' }, { id: 'feed', label: `رویدادها (${formatNumber(events.length)})` }]} renderPanel={(id) => (id === 'kpis' ? kpis : feed)} />}
      </div>
    </Dialog>
  );
};
