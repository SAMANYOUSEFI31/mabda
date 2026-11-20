/**
 * The user-test record (docs/test-data.md): what an event may carry, and the measures (KPIs) computed from the raw events.
 *
 * Goal (principle): learn how people really use Mabda from what they DO, without ever receiving what they WRITE. Method: every
 * event is a name, a time, a person, a visit (session) and a space, plus a few enum-like values and numbers. Raw events are
 * kept as they are; every measure below is computed from them on demand, so a new question can be asked of the same record
 * later and a changed definition never needs new data.
 *
 * Pure: the server (server/activity.ts) and the browser (src/services/activity.ts) both clean with these functions.
 */
import { tehranDay, daysBetween } from './tehranDate.ts';

export type ActivityKind = 'action' | 'ui';
export type PropValue = string | number | boolean;
export type Props = Record<string, PropValue>;

export interface ActivityEvent {
  id: string; userId: string; sessionId?: string; spaceId?: string;
  kind: ActivityKind; name: string; status?: number; ms?: number; props?: Props; at: string;
}

/** the names a browser may send (everything else is refused: the browser is not trusted to invent kinds of events) */
export const UI_EVENTS = ['session_start', 'view', 'dialog_open', 'dialog_close', 'heartbeat', 'hidden', 'visible', 'feature', 'search'] as const;
export type UiEventName = typeof UI_EVENTS[number];
export const isUiEvent = (v: unknown): v is UiEventName => typeof v === 'string' && (UI_EVENTS as readonly string[]).includes(v);

/** a value that is a label, not writing: Latin letters, digits and a few joiners, short */
const LABEL = /^[A-Za-z][A-Za-z0-9_.:\- ]{0,39}$/;
/** request-body fields whose values are labels chosen from a list (type, status, …), never something the person typed */
export const ACTION_FIELDS = ['type', 'status', 'provenance', 'kind', 'assumption', 'archive', 'reach', 'disabled'] as const;

/**
 * Keeps at most 12 props whose key is a label and whose value is a label, a finite number or a boolean. A UI string (Persian)
 * is allowed only under `title` / `tab`, the two keys that carry the app's own words (a dialog's title, a page name), with any
 * quoted part (and anything after «:», «—», «·») removed: a title like «حذف «نام بخش»» names a person's item inside the quotes.
 */
export function cleanProps(raw: unknown): Props | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Props = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= 12) break;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k)) continue;
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'string' && (k === 'title' || k === 'tab')) { const t = uiLabel(v); if (t) out[k] = t; }
    else if (typeof v === 'string' && LABEL.test(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** the app's own words with every quoted part (a person's item name) cut out */
export function uiLabel(v: string): string {
  // and everything after a «: », «—» or «·»: titles like «انتقال و اتصال: <item title>» name the item after it
  return v.split(/[:—·]/)[0].replace(/«[^»]*»|"[^"]*"|'[^']*'|“[^”]*”/g, '…').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * What a request said, as props: the label fields of its body, `source.kind`, and how long its text was (a number of
 * characters, never the characters). Used by the server for every action.
 */
export function actionProps(body: unknown): Props | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const b = body as Record<string, unknown>;
  const raw: Record<string, unknown> = {};
  for (const f of ACTION_FIELDS) if (b[f] !== undefined) raw[f] = b[f];
  const src = b.source as { kind?: unknown } | undefined;
  if (src && typeof src === 'object' && typeof src.kind === 'string') raw.sourceKind = src.kind;
  const chars = ['title', 'content', 'text'].reduce((n, f) => n + (typeof b[f] === 'string' ? (b[f] as string).length : 0), 0);
  if (chars) raw.chars = chars;
  if (Array.isArray(b.items)) raw.items = b.items.length;
  // «پایش»: a number batch says how many numbers (never which), and a monitor request whether it puts a number on a truth (a
  // new monitor, or linking a number made earlier) — the measures below tell whether monitoring was really needed (§۴۲)
  if (Array.isArray(b.entries)) raw.items = b.entries.length;
  if (typeof b.objectId === 'string' && b.objectId) raw.onTruth = true;
  return cleanProps(raw);
}

// ── what an action means (analysis, not recording: the raw name stays the route, so this map can change later) ──

export type ActionCategory = 'capture' | 'knowledge' | 'confirm' | 'edit' | 'remove' | 'organize' | 'output' | 'review' | 'other';

/** route templates → category; checked in order, first match wins */
const CATEGORY_RULES: Array<[RegExp, ActionCategory]> = [
  [/^POST \/workspaces\/:wid\/objects\/:id\/draft\/approve$/, 'confirm'],
  [/^POST \/workspaces\/:wid\/objects\/:id\/review-accept$/, 'confirm'],
  [/^POST \/workspaces\/:wid\/weekly-review\/done$/, 'review'],
  [/^POST \/workspaces\/:wid\/(objects|thoughts\/:id\/promote|notes\/:id\/items\/convert|canvas\/free\/notes\/:id\/to-knowledge)$/, 'knowledge'],
  [/^POST \/workspaces\/:wid\/(notes|files|memory\/document|canvas\/free\/notes|imports\/parse|measurements(\/batch|\/csv)?)$/, 'capture'],
  [/^(POST \/workspaces\/:wid\/(packs|saved-packs|ai-requests)|PUT \/workspaces\/:wid\/deliverables\/:id)$/, 'output'],
  [/^DELETE |\/archive$|\/permanent$|\/samples\/delete$/, 'remove'],
  [/^(PATCH |PUT \/workspaces\/:wid\/objects|POST \/workspaces\/:wid\/(objects\/:id\/(replace|supersede|outcome)|thoughts\/:id\/(revise|reclassify|resolve|split|about)|notes\/:id\/split))/, 'edit'],
  [/^POST \/workspaces\/:wid\/(nodes|nodes\/from-items|nodes\/:id\/move|starters\/:id\/apply|templates\/:id\/apply|notes\/:id\/move-node|files\/:id\/move)|^PUT \/workspaces\/:wid\/canvas|^POST \/workspaces\/:wid\/canvas/, 'organize'],
];
export function categoryOf(name: string): ActionCategory {
  for (const [re, c] of CATEGORY_RULES) if (re.test(name)) return c;
  return 'other';
}

/** a knowledge item became the person's truth: approved, accepted on review, or created / patched as Confirmed */
export function isConfirm(e: ActivityEvent): boolean {
  if (!isOwnAction(e)) return false;
  if (categoryOf(e.name) === 'confirm') return true;
  return /^(POST|PATCH) \/workspaces\/:wid\/objects(\/:id)?$/.test(e.name) && e.props?.status === 'Confirmed';
}
const ok = (e: ActivityEvent) => e.status === undefined || (e.status >= 200 && e.status < 300);
const isAction = (e: ActivityEvent) => e.kind === 'action' && ok(e);
/**
 * An action on something Mabda wrote as an example (the showcase or long-use sample space, or a pre-written item anywhere,
 * server/db/sampleIds.ts) is real use and stays in the record, but it is not the person's OWN work: confirming a ready-made
 * suggestion is not activation. Every «own» measure below counts only these.
 */
export const isOwnAction = (e: ActivityEvent) => isAction(e) && e.props?.sample !== true && e.props?.sampleItem !== true;
const isNumber = (e: ActivityEvent) => /^POST \/workspaces\/:wid\/measurements(\/batch|\/csv)?$/.test(e.name);
const isCapture = (e: ActivityEvent) => isOwnAction(e) && (categoryOf(e.name) === 'capture' || categoryOf(e.name) === 'knowledge');
const isKnowledge = (e: ActivityEvent) => isOwnAction(e) && categoryOf(e.name) === 'knowledge';

// ── the measures ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** a gap longer than this between two events is not «using Mabda» (the person left the tab open) */
export const IDLE_MS = 5 * 60_000;
/** activation window: the first confirmed truth within this long after the person's first event */
export const ACTIVATION_MIN = 30;

export interface PersonInput { id: string; name: string; role: string }

export interface PersonKpis {
  id: string; name: string; role: string;
  firstAt?: string; lastAt?: string;
  activeDays: number; sessions: number; activeMinutes: number;
  actions: number; captures: number; knowledge: number; confirms: number; edits: number; removes: number; outputs: number;
  /** «پایش» (owner decision §۴۲, to decide after the test whether it stays or goes to «later»): monitors made on a truth, numbers
   *  made earlier linked to a truth, and numbers recorded (a batch counts each number) */
  monitors: number; monitorLinks: number; numbers: number;
  /** recorded a number on a later day than the first monitor: monitoring was used, not only tried */
  monitorKept: boolean;
  /** minutes from the first event to the first capture / first confirmed truth (undefined = never) */
  minutesToFirstCapture?: number; minutesToFirstConfirm?: number;
  activated: boolean; coreLoop: boolean; returnedD1: boolean; returnedD3plus: boolean;
  refused: number; broke: number; clientErrors: number;
  sampleShare?: number;
  tabs: Record<string, number>;
}

export interface FunnelStep { key: string; label: string; people: number }
export interface DialogStat { title: string; opens: number; completed: number; medianSeconds?: number }

export interface Kpis {
  computedAt: string;
  people: PersonKpis[];
  /** over the testers (role tester; in the local mode, everyone) */
  summary: {
    people: number; activated: number; coreLoop: number; returnedD1: number; returnedD3plus: number;
    medianMinutesToFirstConfirm?: number; medianActiveMinutes?: number; medianActiveDays?: number;
    actions: number; refusedPer100: number; brokePer100: number; clientErrors: number;
    /** «پایش»: people who made or linked a monitor, and people who recorded a number on a later day than the monitor was made */
    monitoring: number; monitoringKept: number;
  };
  funnel: FunnelStep[];
  dialogs: DialogStat[];
  categories: Record<ActionCategory, number>;
  tabs: Array<{ tab: string; people: number; views: number }>;
}

/**
 * How each measure is computed, in words the owner reads beside the number (decisions.md §۵۴ ۱۶): a measure she cannot check is a
 * number she cannot decide by. One entry per summary field; activity.test.ts fails when a measure has no definition.
 */
const fa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
export const KPI_DEFINITIONS: Record<keyof Kpis['summary'], { label: string; formula: string }> = {
  people: { label: 'افراد آزمون', formula: 'همهٔ حساب‌های آزمون‌گر (در حالت محلی: این دستگاه). صاحب شمرده نمی‌شود.' },
  activated: { label: 'به ارزش رسیدند', formula: `کسانی که اولین حقیقتِ خودشان را تا ${fa(ACTIVATION_MIN)} دقیقه پس از اولین رویدادشان تأیید کردند. تأیید یعنی تأیید پیش‌نویس، «هنوز درست است»، یا ساخت/ویرایش با وضعیت «حقیقت». کار روی نمونه‌ها شمرده نمی‌شود.` },
  coreLoop: { label: 'چرخهٔ اصلی', formula: 'پیش از اولین تأیید چیزی افزودند (یادداشت، فایل، دانش، عدد…)، تأیید کردند، و در روزی جز روز اول (به وقت تهران) هم رویدادی دارند.' },
  returnedD1: { label: 'برگشت فردا', formula: 'رویدادی در روز دقیقاً بعد از روز اول (به وقت تهران) دارند.' },
  returnedD3plus: { label: 'برگشت از روز سوم', formula: 'رویدادی در روز سوم پس از روز اول یا بعدتر دارند.' },
  medianMinutesToFirstConfirm: { label: 'زمان تا اولین حقیقت', formula: 'میانهٔ دقیقه‌ها از اولین رویداد هر نفر تا اولین تأییدش؛ فقط کسانی که تأییدی دارند.' },
  medianActiveMinutes: { label: 'زمان استفاده', formula: `میانهٔ دقیقه‌های فعال هر نفر: جمع فاصلهٔ رویدادهای پشت‌سرهم که کمتر از ${fa(IDLE_MS / 60_000)} دقیقه‌اند (ضربان صفحهٔ باز خواندن آرام را پر می‌کند).` },
  medianActiveDays: { label: 'روزهای فعال', formula: 'میانهٔ تعداد روزهای جدا (به وقت تهران) که هر نفر رویدادی دارد.' },
  actions: { label: 'کارها', formula: 'همهٔ درخواست‌های تغییر (POST/PUT/PATCH/DELETE) آزمون‌گرها، موفق و ناموفق.' },
  refusedPer100: { label: 'رد شده در هر ۱۰۰ کار', formula: 'پاسخ‌های ۴xx (مثلاً تداخل ۴۰۹ یا ورودی نادرست) تقسیم بر همهٔ کارها، ضرب در ۱۰۰.' },
  brokePer100: { label: 'خرابی سرور در هر ۱۰۰ کار', formula: 'پاسخ‌های ۵xx تقسیم بر همهٔ کارها، ضرب در ۱۰۰.' },
  clientErrors: { label: 'خطای دستگاه', formula: 'گزارش‌های خطایی که مرورگر آزمون‌گرها فرستاد.' },
  monitoring: { label: 'پایش ساختند', formula: 'روی یک حقیقت پایش ساختند یا عددی قدیمی را به حقیقتی وصل کردند.' },
  monitoringKept: { label: 'پایش را نگه داشتند', formula: 'در روزی بعد از ساخت اولین پایش، عددی ثبت کردند.' },
};

export const median = (xs: number[]): number | undefined => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};
const minutes = (a: string, b: string) => Math.round(((Date.parse(b) - Date.parse(a)) / 60_000) * 10) / 10;

/** sessions: the browser's visit id when present, otherwise a new visit after 30 minutes of nothing */
function sessionsOf(evs: ActivityEvent[]): number {
  const ids = new Set<string>(); let last = 0; let anon = 0;
  for (const e of evs) {
    const t = Date.parse(e.at);
    if (e.sessionId) ids.add(e.sessionId);
    else if (!last || t - last > 30 * 60_000) anon++;
    last = t;
  }
  return ids.size + (ids.size ? 0 : anon);
}

/** active time: the sum of gaps between consecutive events that are shorter than IDLE_MS (the heartbeat fills quiet reading) */
function activeMinutesOf(evs: ActivityEvent[]): number {
  let ms = 0;
  for (let i = 1; i < evs.length; i++) {
    if (evs[i - 1].name === 'hidden') continue;
    const d = Date.parse(evs[i].at) - Date.parse(evs[i - 1].at);
    if (d > 0 && d <= IDLE_MS) ms += d;
  }
  return Math.round(ms / 6_000) / 10;
}

/** Every measure, from raw events. `clientErrors` per person come from the error reports (server/diagnostics.ts). */
export function computeKpis(events: ActivityEvent[], persons: PersonInput[], opts: { now?: Date; clientErrors?: Record<string, number> } = {}): Kpis {
  const now = opts.now ?? new Date();
  const byUser = new Map<string, ActivityEvent[]>();
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
    if (!byUser.has(e.userId)) byUser.set(e.userId, []);
    byUser.get(e.userId)!.push(e);
  }
  const known = new Map(persons.map((p) => [p.id, p]));
  for (const id of byUser.keys()) if (!known.has(id)) known.set(id, { id, name: id, role: 'unknown' });

  const people: PersonKpis[] = [...known.values()].map((p) => {
    const evs = byUser.get(p.id) ?? [];
    const actions = evs.filter(isAction);
    const own = actions.filter(isOwnAction);
    const first = evs[0]?.at; const last = evs[evs.length - 1]?.at;
    const days = new Set(evs.map((e) => tehranDay(e.at)));
    const firstDay = first ? tehranDay(first) : undefined;
    const offsets = firstDay ? [...days].map((d) => daysBetween(firstDay, d)) : [];
    const firstCapture = evs.find(isCapture)?.at; const firstConfirm = evs.find(isConfirm)?.at;
    const tabs: Record<string, number> = {};
    for (const e of evs) if (e.kind === 'ui' && e.name === 'view' && typeof e.props?.tab === 'string') tabs[e.props.tab] = (tabs[e.props.tab] ?? 0) + 1;
    const inSample = actions.filter((e) => !isOwnAction(e)).length;
    const ttfc = first && firstConfirm ? minutes(first, firstConfirm) : undefined;
    const hasCaptureBeforeConfirm = !!firstConfirm && evs.some((e) => isCapture(e) && e.at <= firstConfirm);
    return {
      id: p.id, name: p.name, role: p.role, firstAt: first, lastAt: last,
      activeDays: days.size, sessions: sessionsOf(evs), activeMinutes: activeMinutesOf(evs),
      actions: actions.length,
      captures: evs.filter(isCapture).length, knowledge: evs.filter(isKnowledge).length, confirms: evs.filter(isConfirm).length,
      edits: own.filter((e) => categoryOf(e.name) === 'edit').length, removes: own.filter((e) => categoryOf(e.name) === 'remove').length,
      outputs: own.filter((e) => categoryOf(e.name) === 'output').length,
      ...(() => {
        const isMonitor = (e: ActivityEvent) => (e.name === 'POST /workspaces/:wid/metrics' || e.name === 'PUT /workspaces/:wid/metrics/:id') && e.props?.onTruth === true;
        const firstMonitor = own.find(isMonitor)?.at;
        return { monitorKept: !!firstMonitor && own.some((e) => isNumber(e) && tehranDay(e.at) > tehranDay(firstMonitor)) };
      })(),
      monitors: own.filter((e) => e.name === 'POST /workspaces/:wid/metrics' && e.props?.onTruth === true).length,
      monitorLinks: own.filter((e) => e.name === 'PUT /workspaces/:wid/metrics/:id' && e.props?.onTruth === true).length,
      numbers: own.filter(isNumber).reduce((n, e) => n + (typeof e.props?.items === 'number' ? e.props.items : 1), 0),
      ...(first && firstCapture ? { minutesToFirstCapture: minutes(first, firstCapture) } : {}),
      ...(ttfc !== undefined ? { minutesToFirstConfirm: ttfc } : {}),
      activated: ttfc !== undefined && ttfc <= ACTIVATION_MIN,
      coreLoop: hasCaptureBeforeConfirm && offsets.some((o) => o >= 1),
      returnedD1: offsets.includes(1), returnedD3plus: offsets.some((o) => o >= 3),
      refused: evs.filter((e) => e.kind === 'action' && e.status !== undefined && e.status >= 400 && e.status < 500).length,
      broke: evs.filter((e) => e.kind === 'action' && e.status !== undefined && e.status >= 500).length,
      clientErrors: opts.clientErrors?.[p.id] ?? 0,
      ...(actions.length ? { sampleShare: Math.round((inSample / actions.length) * 100) / 100 } : {}),
      tabs,
    };
  });

  const testers = people.filter((p) => p.role === 'tester' || p.role === 'local');
  const allActions = testers.reduce((n, p) => n + p.actions + p.refused + p.broke, 0);
  const per100 = (n: number) => (allActions ? Math.round((n / allActions) * 1000) / 10 : 0);
  const count = (f: (p: PersonKpis) => boolean) => testers.filter(f).length;

  const funnel: FunnelStep[] = [
    { key: 'invited', label: 'دعوت شد', people: testers.length },
    { key: 'arrived', label: 'وارد شد', people: count((p) => !!p.firstAt) },
    { key: 'captured', label: 'اولین چیز را افزود', people: count((p) => p.captures > 0) },
    { key: 'knowledge', label: 'اولین دانش را ساخت', people: count((p) => p.knowledge > 0 || p.confirms > 0) },
    { key: 'confirmed', label: 'اولین حقیقت را تأیید کرد', people: count((p) => p.confirms > 0) },
    { key: 'returned', label: 'روز دیگری برگشت', people: count((p) => p.activeDays > 1) },
  ];

  // dialogs: opened, and «completed» when a successful action happened while it was open
  const dialogs = new Map<string, { opens: number; completed: number; secs: number[] }>();
  for (const [uid, evs] of byUser) {
    if (!testers.some((t) => t.id === uid)) continue;
    const open = new Map<string, { at: string; done: boolean }>();
    for (const e of evs) {
      const title = typeof e.props?.title === 'string' ? e.props.title : undefined;
      if (e.kind === 'ui' && e.name === 'dialog_open' && title) {
        const d = dialogs.get(title) ?? { opens: 0, completed: 0, secs: [] }; d.opens++; dialogs.set(title, d);
        open.set(title, { at: e.at, done: false });
      } else if (e.kind === 'ui' && e.name === 'dialog_close' && title && open.has(title)) {
        const o = open.get(title)!; const d = dialogs.get(title)!;
        if (o.done) d.completed++;
        d.secs.push(typeof e.ms === 'number' ? Math.round(e.ms / 1000) : Math.round((Date.parse(e.at) - Date.parse(o.at)) / 1000));
        open.delete(title);
      } else if (isAction(e)) {
        for (const o of open.values()) o.done = true;
      }
    }
  }

  const categories = { capture: 0, knowledge: 0, confirm: 0, edit: 0, remove: 0, organize: 0, output: 0, review: 0, other: 0 } as Record<ActionCategory, number>;
  const tabs = new Map<string, { people: Set<string>; views: number }>();
  for (const [uid, evs] of byUser) {
    if (!testers.some((t) => t.id === uid)) continue;
    for (const e of evs) {
      if (isOwnAction(e)) categories[categoryOf(e.name)]++;
      if (e.kind === 'ui' && e.name === 'view' && typeof e.props?.tab === 'string') {
        const t = tabs.get(e.props.tab) ?? { people: new Set(), views: 0 }; t.people.add(uid); t.views++; tabs.set(e.props.tab, t);
      }
    }
  }

  return {
    computedAt: now.toISOString(),
    people,
    summary: {
      people: testers.length, activated: count((p) => p.activated), coreLoop: count((p) => p.coreLoop),
      returnedD1: count((p) => p.returnedD1), returnedD3plus: count((p) => p.returnedD3plus),
      medianMinutesToFirstConfirm: median(testers.flatMap((p) => (p.minutesToFirstConfirm !== undefined ? [p.minutesToFirstConfirm] : []))),
      medianActiveMinutes: median(testers.filter((p) => p.firstAt).map((p) => p.activeMinutes)),
      medianActiveDays: median(testers.filter((p) => p.firstAt).map((p) => p.activeDays)),
      actions: allActions,
      refusedPer100: per100(testers.reduce((n, p) => n + p.refused, 0)), brokePer100: per100(testers.reduce((n, p) => n + p.broke, 0)),
      clientErrors: testers.reduce((n, p) => n + p.clientErrors, 0),
      monitoring: count((p) => p.monitors + p.monitorLinks > 0), monitoringKept: count((p) => p.monitorKept),
    },
    funnel,
    dialogs: [...dialogs.entries()].map(([title, d]) => ({ title, opens: d.opens, completed: d.completed, ...(d.secs.length ? { medianSeconds: median(d.secs) } : {}) })).sort((a, b) => b.opens - a.opens),
    categories,
    tabs: [...tabs.entries()].map(([tab, t]) => ({ tab, people: t.people.size, views: t.views })).sort((a, b) => b.views - a.views),
  };
}

/** one CSV line per event (RFC 4180 quoting), the columns an analyst opens in a spreadsheet */
export const CSV_COLUMNS = ['at', 'tehran_day', 'user_id', 'person', 'role', 'session_id', 'space_id', 'kind', 'name', 'category', 'status', 'ms', 'props'] as const;
export function eventsCsv(events: ActivityEvent[], persons: PersonInput[]): string {
  const who = new Map(persons.map((p) => [p.id, p]));
  const q = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [CSV_COLUMNS.join(',')];
  for (const e of events) {
    const p = who.get(e.userId);
    lines.push([e.at, tehranDay(e.at), e.userId, p?.name ?? '', p?.role ?? '', e.sessionId ?? '', e.spaceId ?? '', e.kind, e.name, e.kind === 'action' ? categoryOf(e.name) : '', e.status ?? '', e.ms ?? '', e.props ? JSON.stringify(e.props) : ''].map(q).join(','));
  }
  // a BOM so Excel opens the Persian names as UTF-8
  return '﻿' + lines.join('\r\n') + '\r\n';
}
