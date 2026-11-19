/**
 * «زندگی من»: eight weeks of one made-up person using Mabda, told step by step through the product's own routes.
 *
 * Who: a 34-year-old freelance product designer in Tehran. One steady client, a thyroid prescription, a rented flat whose
 * lease ends in Esfand, a mother she visits on Fridays, an IELTS date, a Nowruz trip she has not decided on yet.
 *
 * Nothing here writes a row, a version or a state by hand. Each step is a request the browser could make (create a note,
 * edit a fact with a reason, replace a decision, save a pack, paste an answer …) at the moment the story is at. So the
 * versions, the history, «نیاز به بازبینی», «قدیمی», the due assumptions and the comparison presets are what the product's own
 * engines make of that use. The story only decides WHAT she did and WHEN.
 *
 * Goal of the data (docs/life-sample.md): one workspace where every state a person can meet shows at least once, so a tester
 * can ask «do I understand this screen?» of each of them.
 */
import type { Driver } from './driver.ts';
import { tehranAt } from '../../../src/core/demoData.ts';
import { tehranDayPlus } from '../../../src/core/tehranDate.ts';
import { starterSpecIds } from '../../../src/core/specs.ts';

type Dict = Record<string, string>;
type AnyJson = any;

export async function tellLife(api: Driver, now: Date, wid: string): Promise<void> {
  const b = `/workspaces/${wid}`;
  const at = (ago: number, h = 10, m = 0) => api.at(new Date(tehranAt(now, ago, h, m)));
  /** an ISO day: positive = ahead, negative = behind (today, in Tehran) */
  const day = (plus: number) => tehranDayPlus(plus, now);
  const N: Dict = { me: 'me', health: 'health', money: 'money', home: 'home', learning: 'learning', plans: 'plans' };
  const O: Dict = {}; // story key → object id
  const NT: Dict = {}; // story key → note id
  const M: Dict = {}; // story key → metric id
  const P: Dict = {}; // story key → saved pack id

  // ── small hands: every one is a single call of the product's API ──────────────────────────────
  const section = async (key: string, parent: string, label: string, description = '') => {
    const r = await api.post<AnyJson>(`${b}/nodes`, { parentId: N[parent], label, description });
    N[key] = r.node.id;
  };
  const know = async (key: string, node: string, type: 'Fact' | 'Decision' | 'Constraint', title: string, content: string, extra: AnyJson = {}) => {
    const r = await api.post<AnyJson>(`${b}/objects`, { type, provenance: 'User Input', title, content, nodeId: N[node], ...extra });
    O[key] = r.object.id;
    return r.object;
  };
  const edit = (key: string, patch: AnyJson, reason?: string) => api.patch<AnyJson>(`${b}/objects/${O[key]}`, { ...patch, ...(reason ? { reason } : {}) });
  const draft = (key: string, patch: AnyJson, reason: string) => edit(key, { ...patch, asDraft: true }, reason);
  const confirm = (key: string, reason?: string) => edit(key, { status: 'Confirmed' }, reason);
  const dependsOn = (key: string, ...on: string[]) => api.put(`${b}/objects/${O[key]}/dependencies`, { dependsOn: on.map((k) => O[k]) });
  const note = async (key: string, node: string, content: string) => { NT[key] = (await api.post<AnyJson>(`${b}/notes`, { nodeId: N[node], content })).note.id; };
  const rewrite = (key: string, content: string) => api.patch(`${b}/notes/${NT[key]}`, { content });
  const thoughts = async () => (await api.get<AnyJson>(`${b}/state`)).thoughts as AnyJson[];
  const thought = async (snippet: string, status = 'open') => {
    const t = (await thoughts()).find((x) => x.text.includes(snippet) && x.status === status);
    if (!t) throw new Error(`life sample: no ${status} thought containing «${snippet}»`);
    return t;
  };
  const promote = async (key: string, snippet: string, type: 'Fact' | 'Decision' | 'Constraint') => {
    const t = await thought(snippet);
    const r = await api.post<AnyJson>(`${b}/thoughts/${t.id}/promote`, { type });
    O[key] = r.object.id;
  };
  // «پایش» is an option on a truth (docs/product-scope.md): every number here lives on one of her facts
  const metric = async (key: string, on: string, unit: string, direction: 'up' | 'down', target: number, cadence: 'week' | 'month') => { M[key] = (await api.post<AnyJson>(`${b}/metrics`, { objectId: O[on], unit, direction, target, cadence })).metric.id; };
  const measure = (key: string, ago: number, value: number, text?: string) => api.post(`${b}/measurements`, { metricId: M[key], value, at: day(-ago), note: text });
  /** an output that came back from another tool: the pack goes out (recorded), the pasted answer comes in with the pack's own sources */
  const output = async (o: { ago: number; node?: string; specId?: string; deliverableId?: string; title: string; markdown: string; request?: string }) => {
    let packId: string; let packTitle: string;
    if (o.specId) {
      const p = await api.post<AnyJson>(`${b}/packs`, { specId: o.specId, deliverableId: o.deliverableId, nodeId: o.node ? N[o.node] : undefined });
      packId = p.id; packTitle = p.title;
    } else {
      const p = await api.post<AnyJson>(`${b}/ai-requests`, { kind: 'draft', request: o.request, scopeNodeId: o.node ? N[o.node] : undefined, withChildren: true, record: true });
      packId = p.packId; packTitle = `${o.request}`;
    }
    at(o.ago, 21, 40);
    const parsed = await api.post<AnyJson>(`${b}/imports/parse`, { text: `## دارایی: ${o.title}\n${o.markdown}`, packId });
    const id = `del_life_${o.ago}_${o.title.length}${wid.slice(-10)}`;
    const asset = {
      id, workspaceId: wid, workstreamId: o.specId ?? 'external', deliverableId: o.deliverableId ?? `external_${id}`, title: o.title, content: o.markdown,
      executionMode: 'auto', usedContext: parsed.usedContext, rebuildCount: 0, createdAt: new Date(tehranAt(now, o.ago, 21, 45)).toISOString(),
      source: { kind: 'paste', label: packTitle, at: new Date(tehranAt(now, o.ago, 21, 44)).toISOString() }, sourcePackId: packId,
    };
    await api.put(`${b}/deliverables/${id}`, asset);
    return id;
  };

  // ═══ هفتهٔ ۸ — روز اول: فضا، شاخه‌ها، اصول ═══════════════════════════════════════════════
  at(56, 9, 0);
  await api.put(b, { id: wid, name: 'زندگی من (نمونهٔ کامل)', slug: 'life-sample', description: 'سلامت، کار، پول، خانه و برنامه‌هایم؛ یک‌جا و درست.', purpose: 'personal', enabledSpecIds: starterSpecIds('personal'), todayChatCount: 0, createdAt: new Date(tehranAt(now, 56, 9, 0)).toISOString() });

  at(56, 9, 20);
  await section('values', 'me', 'ارزش‌ها و اصول', 'اصولی که با آن‌ها «بله» و «نه» می‌گویم');
  await section('work', 'me', 'کار و درآمد', 'مشتری‌ها، نرخ‌ها و پروژه‌های شخصی');
  await section('clients', 'work', 'مشتری‌ها');
  await section('arian', 'clients', 'شرکت آرین', 'مشتری ثابت؛ سه روز در هفته');
  await section('habit', 'learning', 'اپ ردیابی عادت'); // اول اشتباهی زیر «یادگیری» ساخته شد؛ هفتهٔ بعد جابه‌جا می‌شود

  at(56, 9, 50);
  await know('priority', 'me', 'Decision', 'اولویت امسال', 'سلامت و خواب منظم از کار اضافه مهم‌تر است؛ بعد از ساعت ۲۲ جلسهٔ کاری نمی‌گذارم.', { reach: 'global', facets: ['زندگی'] });
  await know('saturday', 'me', 'Constraint', 'شنبه‌ها برای خانواده', 'شنبه‌ها هیچ کار و قرار کاری قبول نمی‌کنم.', {
    reach: 'global', facets: ['زندگی', 'خانواده'],
    examples: [{ kind: 'good', text: 'شنبه صبح با مادر صبحانه می‌خوریم و بعدازظهر پیاده‌روی.' }, { kind: 'bad', text: 'قبول کردن جلسهٔ آنلاین شنبه‌شب با مشتری.' }],
  });

  at(56, 10, 30);
  await note('values', 'values', [
    '## چرا این اصول؟',
    'امسال می‌خواهم کمتر «بله» بگویم. دو سال پیش بی‌خواب کار می‌کردم و آخرش دو ماه افت کردم.',
    '- [ایده] هر یک‌شنبه ده دقیقه بنشینم و هفتهٔ بعد را ببینم',
    '- [سؤال] «نه» گفتن به مشتری ثابت واقعاً به درآمدم ضربه می‌زند',
    'اگر درآمد ثابت بماند، حاضرم پروژهٔ کم‌اهمیت‌تری را رد کنم؟',
    '- [فرض] اگر ساعت کاری‌ام کمتر شود، مشتری‌ها افت کیفیت را حس نمی‌کنند',
  ].join('\n'));

  // ═══ روز ۵۵ — کار و درآمد ═══════════════════════════════════════════════════════════════
  at(55, 11, 0);
  await know('income', 'work', 'Fact', 'درآمد ماهانهٔ میانگین', 'میانگین شش ماه گذشته حدود ۷۰ میلیون تومان در ماه بوده است.', { facets: ['مالی'] });
  await know('arianFact', 'clients', 'Fact', 'مشتری ثابت', 'شرکت آرین سه روز در هفته با من قرارداد دارد؛ حدود نیمی از درآمدم از همان‌جاست.', { facets: ['مالی'] });
  await know('arianContract', 'arian', 'Fact', 'قرارداد فعلی آرین', 'قرارداد فعلی تا پایان بهمن است و ماهی ۴۰ میلیون تومان می‌دهند. تمدیدش هنوز صحبت نشده.', { validUntil: day(93), facets: ['مالی'] });
  await know('noFree', 'work', 'Constraint', 'پروژهٔ مجانی نمی‌گیرم', 'پروژهٔ بدون قرارداد و بدون پیش‌پرداخت نمی‌گیرم، حتی برای آشنا.', { facets: ['کار'] });
  await dependsOn('arianContract', 'arianFact');

  at(55, 15, 0);
  await note('work', 'work', [
    'سه‌شنبه با مدیر آرین حرف زدم. گفت امسال بودجه‌شان سفت‌تر است.',
    '- [ایده] نرخ ساعتی را از سال بعد ده درصد ببرم بالا و با یک پروژهٔ کوچک آزمایشش کنم',
    '- [فرض] آرین قرارداد را همین شرایط تمدید می‌کند',
    '- [سؤال] اگر تمدید نکردند، سه ماه اول را با چه مشتری‌ای پر کنم',
    '- [تصمیم باز] وقت آزاد شنبه‌ها را به اپ شخصی بدهم یا به پروژهٔ تازه',
  ].join('\n'));

  // ═══ روز ۵۴ — سلامت ══════════════════════════════════════════════════════════════════════
  at(54, 8, 15);
  await section('meds', 'health', 'دارو و آزمایش‌ها');
  await section('fit', 'health', 'خواب و ورزش');
  await section('run', 'fit', 'دویدن صبحگاهی');
  await section('dent', 'health', 'دندان و چشم');
  await know('allergy', 'meds', 'Fact', 'حساسیت دارویی', 'به پنی‌سیلین حساسیت دارم؛ هر نسخهٔ تازه را با این چک کن.', { reach: 'global', facets: ['سلامت'], slotKey: 'allergies' });
  await know('levo', 'meds', 'Fact', 'داروی روزانه', 'لووتیروکسین ۵۰ میکروگرم، صبح ناشتا، نیم ساعت پیش از صبحانه.', { facets: ['سلامت'], slotKey: 'medications' });
  await know('history', 'meds', 'Fact', 'سابقهٔ تیروئید', 'کم‌کاری تیروئید از سال ۱۴۰۲؛ جراحی یا بستری ندارم.', { facets: ['سلامت'], slotKey: 'conditions' });
  await know('sleepTime', 'fit', 'Decision', 'ساعت خواب', 'هر شب ساعت ۲۳ در تخت هستم و گوشی از ۲۲:۳۰ کنار می‌رود.', {
    facets: ['سلامت'],
    record: {
      question: 'ساعت خواب ثابت بشود یا آزاد بماند؟',
      options: [{ title: 'ساعت ۲۳ ثابت' }, { title: 'نیمه‌شب، مثل قبل', rejectedReason: 'صبح‌ها زود بیدار می‌شوم و جبران نمی‌شود' }],
      expectation: 'میانگین خوابم بالای ۷ ساعت برسد',
      reviewOn: day(-6),
    },
  });
  await know('run3', 'run', 'Decision', 'دویدن سه صبح در هفته', 'سه صبح در هفته، شنبه و دوشنبه و چهارشنبه، ۴۰ دقیقه می‌دوم.', { facets: ['سلامت'] });
  await know('gym', 'fit', 'Fact', 'اشتراک باشگاه', 'اشتراک ساختمان روبه‌رو، ماهی ۲ میلیون و ۴۰۰ هزار تومان، فقط برای ماشین‌های هوازی.', { facets: ['مالی', 'سلامت'] });

  at(54, 20, 30);
  await note('labs', 'meds', [
    'آزمایش مهر آمد. TSH کمی بالاتر از حد است و دکتر گفت دوز را بعد از دو ماه دوباره بسنجیم.',
    '- [سؤال] اگر دوز بالا برود، آیا باید قرص آهن را جدا کنم',
    '- [فرض] خستگی این چند ماه از همین دوز کم است',
    '- [تصمیم باز] آزمایش بعدی را همین‌جا بدهم یا در بیمارستان',
    '  - همین‌جا: ارزان‌تر و نزدیک',
    '  - بیمارستان: دقیق‌تر اما نوبتش دیر می‌رسد',
  ].join('\n'));

  // ═══ هفتهٔ ۷ — پول و خانه ═══════════════════════════════════════════════════════════════
  at(50, 9, 30);
  await section('save', 'money', 'پس‌انداز');
  await section('emerg', 'save', 'صندوق اضطراری');
  await section('down', 'save', 'پیش‌پرداخت خانه');
  await section('fixed', 'money', 'هزینه‌های ثابت');
  await section('tax', 'money', 'مالیات و بیمه');
  await section('house', 'home', 'خانهٔ فعلی');
  await section('lease', 'house', 'قرارداد اجاره');
  await section('fam', 'home', 'خانواده');
  await section('mom', 'fam', 'مادر');
  await section('car', 'home', 'خودرو');

  await know('rent', 'house', 'Fact', 'اجارهٔ ماهانه', 'اجارهٔ ماهانه ۱۸ میلیون تومان است، اول هر ماه به مالک می‌دهم.', { facets: ['مالی'] });
  await know('leaseEnd', 'lease', 'Fact', 'پایان قرارداد اجاره', 'قرارداد اجاره پایان اسفند تمام می‌شود؛ ودیعه ۴۰۰ میلیون تومان است.', { validUntil: day(122), facets: ['مالی'] });
  await know('fixedCost', 'fixed', 'Fact', 'هزینهٔ ثابت ماهانه', 'هزینهٔ ثابت ماهانه حدود ۳۲ میلیون تومان است: اجاره، قبض‌ها، اینترنت، بیمه و خرید خانه.', { facets: ['مالی'] });
  await know('emergRule', 'emerg', 'Decision', 'اندازهٔ صندوق اضطراری', 'معادل شش ماه هزینهٔ ثابت را پول نقد نگه می‌دارم؛ تا آن‌جا هیچ سرمایه‌گذاری دیگری نمی‌کنم.', { facets: ['مالی'] });
  await know('emergNow', 'emerg', 'Fact', 'موجودی صندوق اضطراری', 'الان ۴۵ میلیون تومان در حساب جدا دارم.', { facets: ['مالی'] });
  await know('noLoan', 'money', 'Constraint', 'بدون وام مصرفی', 'برای خرج روزمره یا سفر وام نمی‌گیرم و قسط خرید ماهانه نمی‌خرم.', { reach: 'global', facets: ['مالی'] });
  await dependsOn('emergRule', 'fixedCost');
  await dependsOn('emergNow', 'emergRule');

  await know('sleepAvg', 'fit', 'Fact', 'ساعت خواب شبانه', 'میانگین ساعت‌هایی که هر شب واقعاً می‌خوابم، هفته به هفته.', { facets: ['سلامت'] });
  await know('runWeek', 'run', 'Fact', 'دویدن در هفته', 'کیلومترهایی که هر هفته می‌دوم، از همهٔ صبح‌ها با هم.', { facets: ['سلامت'] });
  await metric('sleep', 'sleepAvg', 'ساعت', 'up', 7.5, 'week');
  await metric('fund', 'emergNow', 'میلیون تومان', 'up', 192, 'month');
  await metric('run', 'runWeek', 'کیلومتر', 'up', 15, 'week');

  at(50, 21, 0);
  await know('mom1', 'mom', 'Fact', 'قرص‌های مادر', 'مادر هر صبح یک قرص فشار می‌خورد؛ دکترش دکتر رحیمی است و نوبتش هر سه ماه.', { facets: ['خانواده', 'سلامت'] });
  await know('friday', 'mom', 'Decision', 'جمعه‌ها ناهار پیش مادر', 'جمعه‌ها ظهر پیش مادر ناهار می‌خوریم، مگر مسافرت باشم.', { facets: ['خانواده'] });
  await know('insuranceCar', 'car', 'Fact', 'بیمهٔ بدنه', 'بیمهٔ بدنهٔ ماشین تا ۱۵ دی معتبر است.', { validUntil: day(27), facets: ['مالی'] });
  await know('oil', 'car', 'Decision', 'تعویض روغن', 'هر ۵ هزار کیلومتر روغن را عوض می‌کنم، نه بیشتر.', {});
  await measure('sleep', 50, 6.2);
  await measure('fund', 50, 45);

  await note('home', 'house', [
    'مالک پیام داد که برای سال بعد صحبت کنیم. هنوز عدد نگفته.',
    '- [تصمیم باز] اسفند اجاره را تمدید کنم یا بروم دنبال خانهٔ دیگر',
    '  - تمدید با همین خانه، اگر افزایش معقول باشد',
    '  - خانهٔ دیگر، نزدیک‌تر به محل کار آرین',
    '- [سؤال] واقعاً می‌ارزد پیش‌پرداخت خانه را از الان کنار بگذارم؟',
    '- [فرض] قیمت مسکن تا سال بعد از درآمد من سریع‌تر بالا می‌رود',
  ].join('\n'));

  // ═══ هفتهٔ ۶ — اولین ماه استفادهٔ جدی ═══════════════════════════════════════════════════
  at(46, 9, 0);
  await api.post(`${b}/nodes/${N.habit}/move`, { parentId: N.work, index: 1 });
  await measure('sleep', 46, 6.4);
  await measure('run', 46, 8);

  at(46, 9, 30);
  await know('habitHours', 'habit', 'Decision', 'ساعت اپ شخصی', 'هفته‌ای ۶ ساعت، شنبه‌ها و شب‌های جمعه، روی اپ ردیابی عادت کار می‌کنم؛ نه بیشتر.', { facets: ['کار'] });
  await know('habitStack', 'habit', 'Fact', 'ابزارها', 'اپ را با ری‌اکت و یک پایگاه‌داده‌ی ساده می‌سازم؛ طراحی‌اش را خودم می‌کنم.', {});
  await note('habit', 'habit', [
    'ایدهٔ اصلی اپ: هر عادت فقط یک خط و یک دکمه.',
    '- [ایده] نسخهٔ اول فقط سه عادت داشته باشد',
    '- [ایده] به‌جای یادآور، آخر هفته خلاصه بفرستد',
    '- [سؤال] کاربر اول چه کسی است؟',
  ].join('\n'));

  at(45, 21, 15);
  await know('rejectedLoan', 'money', 'Fact', 'سقف کارت اعتباری', 'کارت اعتباری فقط برای خرج‌های هفتگی است و آخر ماه صفر می‌شود.', {});
  await know('tuitionIdea', 'learning', 'Fact', 'هدف آیلتس', 'برای مهاجرت‌کاری احتمالی سال بعد، هدفم نمرهٔ کلی ۷ است.', { facets: ['یادگیری'] });
  await section('english', 'learning', 'انگلیسی');
  await section('ielts', 'english', 'آیلتس');
  await section('books', 'learning', 'کتاب‌ها');
  await note('books', 'books', [
    'کتاب‌هایی که شروع کرده‌ام:',
    '- «ساعت‌های خوب» — نیمه‌ام، مفید است',
    '- «کار عمیق» — کنار گذاشته‌ام',
    '- [ایده] هر ماه یک کتاب غیرکاری',
  ].join('\n'));
  await know('assumeIelts', 'ielts', 'Fact', 'نمرهٔ آیلتس', 'تا اسفند با همین برنامهٔ مطالعه به نمرهٔ ۷ می‌رسم.', { assumption: true, reviewBy: day(30), facets: ['یادگیری'] });
  await know('ielts1', 'ielts', 'Decision', 'برنامهٔ مطالعه', 'هر روز ۴۰ دقیقه، پنج روز در هفته؛ آزمون شبیه‌سازی هر دو هفته یک بار.', { facets: ['یادگیری'] });
  await dependsOn('ielts1', 'tuitionIdea');

  // ═══ روز ۴۴ — خط قرمز تازه و بازنگری دانش ═══════════════════════════════════════════════
  at(44, 22, 5);
  await know('noDinner', 'meds', 'Constraint', 'شام دیرهنگام نه', 'شام را بعد از ساعت ۲۰:۳۰ نمی‌خورم؛ دکتر معده گفته.', { facets: ['سلامت'] });
  await measure('fund', 44, 52);
  await edit('priority', { content: 'سلامت و خواب منظم از کار اضافه مهم‌تر است؛ بعد از ساعت ۲۱:۳۰ جلسهٔ کاری نمی‌گذارم، حتی آنلاین.' }, 'ساعت ۲۲ هنوز زیاد بود؛ دو هفته امتحان کردم و ۲۱:۳۰ بهتر است');

  // ═══ هفتهٔ ۵ — چند فکر، چند پیشنهاد ═════════════════════════════════════════════════════
  at(40, 10, 0);
  await know('stayThisYear', 'house', 'Decision', 'ماندن در خانهٔ فعلی', 'تا پایان سال همین‌جا می‌مانم؛ خانه‌گردی را بعد از نوروز شروع می‌کنم.', { facets: ['خانه'] });
  await measure('sleep', 40, 6.6);
  await measure('run', 40, 11);

  at(39, 22, 10);
  await promote('hourlyRate', 'نرخ ساعتی را از سال بعد', 'Decision');
  await promote('arianRenew', 'آرین قرارداد را همین شرایط تمدید می‌کند', 'Fact');
  await confirm('arianRenew');
  await edit('arianRenew', { reviewBy: day(9) });
  await dependsOn('arianRenew', 'arianContract');
  const sat = await thought('وقت آزاد شنبه‌ها را به اپ شخصی');
  await api.post(`${b}/thoughts/${sat.id}/about`, { targets: [{ kind: 'object', id: O.saturday }, { kind: 'object', id: O.habitHours }] });

  at(38, 8, 40);
  await know('tripBudget', 'plans', 'Fact', 'بودجهٔ سفر نوروز', 'برای سفر نوروز حدود ۱۵ میلیون تومان کنار گذاشته‌ام.', { facets: ['مالی', 'سفر'], slotKey: 'trip_budget' });
  await know('internetDeal', 'fixed', 'Fact', 'تخفیف اینترنت', 'تخفیف سه‌ماههٔ اینترنت تا آخر آبان ادامه دارد؛ بعدش قیمت عادی می‌شود.', { validUntil: day(-4), facets: ['مالی'] });
  await section('trip', 'plans', 'سفر نوروز ۱۴۰۶');
  await section('tripStay', 'trip', 'بلیت و اقامت');
  await section('tripRoute', 'trip', 'مسیر و برنامه');
  await section('winter', 'plans', 'کارهای زمستان');
  await note('trip', 'trip', [
    'کاشان و اصفهان، شش شب. دوست‌هام هم ممکن است بیایند.',
    '- [تصمیم باز] با ماشین بروم یا اتوبوس',
    '  - ماشین: آزادی بیشتر، بنزین و پارکینگ گران',
    '  - اتوبوس: ارزان، اما ساعت‌ها ثابت',
    '- [سؤال] هتل یا اتاق در خانهٔ بومی',
    '- [ایده] یک روز را فقط برای نقاشی بگذارم',
  ].join('\n'));

  // ═══ هفتهٔ ۴ — فکرها شکل می‌گیرند ═════════════════════════════════════════════════════════
  at(34, 9, 10);
  await measure('sleep', 34, 6.8);
  await measure('fund', 34, 58);
  await edit('emergNow', { content: 'الان ۵۸ میلیون تومان در حساب جدا دارم.' }, 'حقوق مهر پس‌انداز شد');

  at(33, 21, 20);
  await note('money', 'save', [
    'یک ماه است که هزینه‌ها را می‌نویسم و عدد غافلگیرم کرد.',
    '- [فرض] هزینه‌هایم هنوز بیشتر از ۳۲ میلیون است و فقط ثبت نکرده‌ام',
    '- [ایده] یک روز آخر ماه هزینه‌ها را دسته‌بندی کنم',
    '- [سؤال] چه کار بیمه‌ای کنم که هم تکمیلی بماند هم ارزان‌تر شود',
    '- [تصمیم باز] بخشی از صندوق اضطراری را در حساب سود روزشمار بگذارم',
    '  - بله، سود بیشتر',
    '  - نه، دسترسی فوری مهم‌تر است',
  ].join('\n'));
  await note('driving', 'car', '- [ایده] ثبت‌نام در کلاس رانندگی دفاعی آخر هفته');
  await know('inflation', 'money', 'Fact', 'تورم ماهانه', 'فرض می‌کنم تورم ماهانه حدود ۳ درصد می‌ماند و برنامهٔ پس‌اندازم بر همین پایه است.', { assumption: true, reviewBy: day(-6), facets: ['مالی'] });
  await know('insurance', 'tax', 'Fact', 'بیمهٔ تکمیلی', 'بیمهٔ تکمیلی تا ۲۵ آذر معتبر است؛ بعدش باید تمدید شود.', { validUntil: day(7), facets: ['مالی', 'سلامت'] });
  await dependsOn('insurance', 'fixedCost');

  at(32, 8, 0);
  // یک فکر تازه از «سؤال» به «تصمیم باز» بدل می‌شود و دو تکه می‌شود
  const q = await thought('اگر دوز بالا برود');
  await api.post(`${b}/thoughts/${q.id}/revise`, { text: 'اگر دوز بالا برود، قرص آهن و کلسیم را چطور از آن جدا کنم و ساعتش چه باشد' });
  await api.post(`${b}/thoughts/${q.id}/reclassify`, { kind: 'open_decision' });
  const q2 = await thought('قرص آهن و کلسیم');
  await api.post(`${b}/thoughts/${q2.id}/split`, { children: [
    { text: 'ساعت قرص آهن را چه موقع بگذارم', kind: 'question' },
    { text: 'از دکتر بپرسم آهن را ادامه بدهم یا نه', kind: 'idea' },
  ] });

  at(31, 21, 40);
  await api.post(`${b}/objects`, {
    type: 'Decision', status: 'Proposed', provenance: 'Imported', title: 'ساعت ثابت برای مرور مالی', nodeId: N.money,
    content: 'هر یک‌شنبه شب ده دقیقه برای مرور هزینه‌های هفته کنار می‌گذارم.', source: { kind: 'paste', label: 'پاسخ ابزار دیگر', at: new Date(tehranAt(now, 31, 21, 40)).toISOString() },
  });

  // ═══ هفتهٔ ۳ — دارو عوض می‌شود، زنجیره‌ها شکل می‌گیرند ═════════════════════════════════════
  at(30, 10, 0);
  await edit('levo', { content: 'لووتیروکسین ۷۵ میکروگرم، صبح ناشتا، نیم ساعت پیش از صبحانه.' }, 'دکتر بعد از آزمایش مهر دوز را بالا برد');
  await know('visit', 'meds', 'Decision', 'ویزیت بعدی غدد', 'دو ماه بعد از تغییر دوز، آزمایش TSH و ویزیت دوباره.', {
    facets: ['سلامت'],
    record: { question: 'کی دوباره بسنجیم؟', options: [{ title: 'دو ماه بعد' }, { title: 'شش هفته بعد', rejectedReason: 'برای دیدن اثر دوز زود است' }], expectation: 'TSH به محدودهٔ عادی برگردد', reviewOn: day(-3) },
  });
  await know('medReminder', 'meds', 'Fact', 'یادآور دارو', 'یادآور تقویم گوشی ساعت ۶:۴۵ هر روز روی داروی صبح است.', {});
  await dependsOn('visit', 'levo');
  await dependsOn('medReminder', 'levo');

  at(30, 18, 20);
  await edit('gym', { status: 'Archived' }, 'دیگر نمی‌روم؛ دویدن جای آن را گرفت');
  await know('physio', 'fit', 'Fact', 'جلسه‌های فیزیوتراپی', 'ده جلسه برای زانو؛ تا پایان آبان تمام می‌شود.', { facets: ['سلامت'] });
  await edit('physio', { status: 'Archived' });

  at(29, 9, 0);
  await measure('sleep', 29, 6.9);
  await measure('run', 29, 12);
  await edit('income', { content: 'میانگین شش ماه گذشته حدود ۸۵ میلیون تومان در ماه است؛ دو پروژهٔ کوتاه امسال اضافه شد.' }, 'پروژهٔ برند و پروژهٔ سایت هر دو پرداخت شد');

  at(28, 22, 0);
  await draft('income', { content: 'میانگین شش ماه گذشته حدود ۹۰ میلیون تومان در ماه است، البته با پروژهٔ برند آخر؛ هنوز قطعی نیست.' }, 'منتظر پرداخت پروژهٔ برند؛ تا نیامده نمی‌پذیرم');

  // ═══ هفتهٔ ۳ — بوم آزاد و یادداشت‌های بی‌جا ═════════════════════════════════════════════
  at(27, 20, 0);
  const fn1 = await api.post<AnyJson>(`${b}/canvas/free/notes`, { nodeId: N.money, content: '- [ایده] سقف خرید ماهانه را به سه میلیون برسانم', x: 120, y: 80 });
  const fn2 = await api.post<AnyJson>(`${b}/canvas/free/notes`, { nodeId: N.home, content: '- [سؤال] آیا همین محله برای ماندن بلندمدت مناسب است؟', x: 460, y: 80 });
  await api.post<AnyJson>(`${b}/canvas/free/notes`, { nodeId: N.plans, content: 'یک روز در هفته بدون صفحه نمایش؛ اول با پنج‌شنبه‌ها شروع کنم', x: 120, y: 260 });
  await api.post<AnyJson>(`${b}/canvas/free/notes`, { nodeId: N.me, content: '- [تصمیم باز] امسال یک ماه کامل مرخصی بگیرم یا چند هفتهٔ کوتاه', x: 460, y: 260 });
  for (const k of ['priority', 'saturday', 'emergRule', 'rent']) await api.put(`${b}/canvas/free/objects/${O[k]}`, { x: 120 + (['priority', 'saturday', 'emergRule', 'rent'].indexOf(k) % 2) * 340, y: 440 + Math.floor(['priority', 'saturday', 'emergRule', 'rent'].indexOf(k) / 2) * 150 });
  await api.post(`${b}/canvas/free/notes/${fn1.note.id}/to-knowledge`, { type: 'Decision' });
  void fn2;

  at(26, 20, 40);
  await note('year', 'plans', [
    '## ۱۴۰۶: اگر همه‌چیز خوب بگذرد',
    'آیلتس را بدهم، اپ را عرضه کنم و یک سفر خوب بروم.',
    '## نکتهٔ مالی',
    'ودیعهٔ خانه باید همین‌طور بماند تا تصمیم تازه.',
    '- [ایده] اگر پیش‌پرداخت خانه جمع شد، دو سال بعد دوباره بسنجم',
  ].join('\n'));
  await api.post(`${b}/notes/${NT.year}/split`, {});

  at(25, 22, 0);
  await know('stocks', 'save', 'Decision', 'خرید سهام', 'بخشی از پس‌انداز را در بورس سهام بگذارم تا عقب نمانم.', {
    status: 'Proposed', provenance: 'Imported', source: { kind: 'paste', label: 'پاسخ ابزار دیگر', at: new Date(tehranAt(now, 25, 22, 0)).toISOString() },
  });
  at(24, 9, 0);
  await edit('stocks', { status: 'Archived' });
  const t1 = await thought('نسخهٔ اول فقط سه عادت');
  const t2 = await thought('به‌جای یادآور');
  await api.post(`${b}/thoughts/derive`, { parentIds: [t1.id, t2.id], nodeId: N.habit, kind: 'idea', text: 'نسخهٔ اول: سه عادت و فقط یک خلاصهٔ شب یک‌شنبه، بدون یادآور' });
  at(24, 19, 0);
  // ═══ هفتهٔ ۳ تا ۲ — بسته‌ها، دو دسته، یک درخواست ═══════════════════════════════════════════
  at(24, 19, 0);
  P.doctor = (await api.post<AnyJson>(`${b}/saved-packs`, { name: 'برای دکتر', selection: { nodeIds: [N.health], withChildren: true, statuses: [], includeAssumptions: false }, instruction: 'این سوابق من است؛ فقط بر پایهٔ همین‌ها پاسخ بده و دارو را حدس نزن.' })).pack.id;
  P.money = (await api.post<AnyJson>(`${b}/saved-packs`, { name: 'حساب و کتاب خانه', selection: { nodeIds: [N.money, N.home], withChildren: true, statuses: ['Proposed'], includeAssumptions: true }, instruction: 'عددها را از همین‌جا بردار؛ فرض‌ها را قطعی نگیر.' })).pack.id;
  P.work = (await api.post<AnyJson>(`${b}/saved-packs`, { name: 'کار این هفته', selection: { nodeIds: [N.work], withChildren: true, statuses: [], includeAssumptions: true, facets: ['کار'] } })).pack.id;
  P.trip = (await api.post<AnyJson>(`${b}/saved-packs`, { name: 'سفر نوروز: اتوبوس یا ماشین؟', selection: { nodeIds: [N.trip, N.money], withChildren: true, statuses: ['Proposed'], includeAssumptions: true }, kind: 'decision', template: 'با توجه به بودجه و خط قرمزهایم، کدام راه سفر منطقی‌تر است؟' })).pack.id;

  at(23, 22, 15);
  await know('tripCheck', 'tripStay', 'Fact', 'ظرفیت اقامتگاه', 'اتاق در خانهٔ بومی کاشان شبی یک میلیون و ۲۰۰ هزار تومان است؛ برای چهار شب می‌شود ۴ میلیون و ۸۰۰ هزار.', { facets: ['سفر'], slotKey: 'trip_stay' });
  await know('tripRoute1', 'tripRoute', 'Decision', 'مسیر سفر', 'کاشان دو شب، اصفهان چهار شب؛ برگشت از مسیر نطنز.', { facets: ['سفر'], slotKey: 'trip_when_where' });
  await know('tripWho', 'trip', 'Fact', 'همراهان', 'شش نفر می‌رویم: من، خواهرم و شوهرش، مادر و دو دوست؛ مادر پله زیاد نمی‌تواند.', { facets: ['سفر', 'خانواده'], slotKey: 'trip_who' });
  await measure('sleep', 23, 7.1);
  await measure('run', 23, 14);

  // ═══ هفتهٔ ۲ — جایگزینی، خط قرمز استثنا دارد، بایگانی ═════════════════════════════════════
  at(20, 9, 0);
  await api.post(`${b}/objects/${O.run3}/supersede`, {
    type: 'Decision', provenance: 'User Input', title: 'دویدن دو صبح و شنا', nodeId: N.run, facets: ['سلامت'],
    content: 'دو صبح در هفته، دوشنبه و چهارشنبه، ۴۰ دقیقه می‌دوم و جمعه‌ها یک ساعت شنا می‌کنم؛ زانو با سه صبح خوب نیست.',
    record: { question: 'زانو را چطور حفظ کنم و ورزش را ادامه بدهم؟', options: [{ title: 'دو دویدن و یک شنا' }, { title: 'همان سه دویدن', rejectedReason: 'زانو درد گرفت' }], expectation: 'دو هفته بدون درد زانو', metricExpectation: { metricId: M.run, direction: 'up', targetValue: 12, by: day(14) } },
  } as AnyJson);
  await api.post(`${b}/weekly-review/done`, {});
  await measure('sleep', 20, 6.9);

  at(18, 20, 30);
  // یک شاخهٔ تمام‌شده: خرید لپ‌تاپ؛ کامل بایگانی می‌شود (برگشت‌پذیر)
  await section('laptop', 'work', 'خرید لپ‌تاپ جدید');
  await know('laptop1', 'laptop', 'Decision', 'مدل لپ‌تاپ', 'لپ‌تاپ ۱۶ اینچی با حافظهٔ ۳۲ گیگ می‌خرم؛ اولویت صفحه‌نمایش است.', {});
  await note('laptop', 'laptop', 'مقایسهٔ سه مدل و قیمتشان؛ در آخر همان مدل اول را خریدم.');
  at(17, 21, 0);
  await api.del(`${b}/nodes/${N.laptop}?mode=archive&transferTo=${N.work}`);

  // ═══ هفتهٔ ۲ — دو خروجی، یک خروجی بایگانی ═══════════════════════════════════════════════
  await output({ ago: 15, specId: 'lib_health_brief', deliverableId: 'del_health_card', title: 'کارت سلامت من', markdown: '**حساسیت دارویی:** پنی‌سیلین؛ هر نسخهٔ تازه را با این چک کنید.\n\n**داروی روزانه:** لووتیروکسین ۷۵ میکروگرم، صبح ناشتا، نیم ساعت پیش از صبحانه.\n\n**شام:** بعد از ۲۰:۳۰ نمی‌خورم.\n\n**ویزیت بعدی:** دو ماه بعد از تغییر دوز.' });
  const oldPlan = await output({ ago: 14, node: 'ielts', request: 'برنامهٔ مطالعهٔ آیلتس را از روی هدف و زمانم بنویس', title: 'برنامهٔ مطالعهٔ آیلتس (نسخهٔ اول)', markdown: 'هر روز ۴۰ دقیقه: دو روز لیسنینگ، دو روز ریدینگ، یک روز رایتینگ؛ آخر هر دو هفته یک آزمون کامل.' });

  at(13, 9, 30);
  // خط یک فکر حذف می‌شود؛ فکر می‌ماند و می‌گوید «خط حذف شد»
  await rewrite('work', [
    'سه‌شنبه با مدیر آرین حرف زدم. گفت امسال بودجه‌شان سفت‌تر است.',
    '- [ایده] نرخ ساعتی را از سال بعد ده درصد ببرم بالا و با یک پروژهٔ کوچک آزمایشش کنم',
    '- [فرض] آرین قرارداد را همین شرایط تمدید می‌کند',
    '- [تصمیم باز] وقت آزاد شنبه‌ها را به اپ شخصی بدهم یا به پروژهٔ تازه',
  ].join('\n'));
  await api.post(`${b}/deliverables/${oldPlan}/archive`, {});
  await api.post(`${b}/weekly-review/done`, {});

  at(12, 22, 0);
  await edit('fixedCost', { content: 'هزینهٔ ثابت ماهانه حدود ۳۶ میلیون تومان است: اجاره، قبض‌ها، اینترنت، بیمه، خرید خانه و قسط فیزیوتراپی.' }, 'بعد از سه ماه ثبت، عدد واقعی این است');
  await measure('sleep', 12, 7.0);
  await api.post(`${b}/templates`, { kind: 'node', sourceId: N.trip, name: 'قالب سفر' });

  at(11, 21, 0);
  await output({ ago: 11, node: 'trip', specId: 'lib_trip_plan', deliverableId: 'del_trip_plan', title: 'برنامهٔ روزبه‌روز سفر نوروز', markdown: '**روز اول:** رسیدن به کاشان و خانهٔ بومی.\n\n**روز سوم:** اصفهان، میدان نقش جهان.\n\n**روز ششم:** برگشت از نطنز.' });

  at(10, 9, 15);
  await know('landlord', 'lease', 'Fact', 'پیشنهاد مالک', 'مالک از فروردین ۲۳ میلیون تومان پیشنهاد داده؛ ۲۸ درصد بیشتر از الان.', { facets: ['مالی'] });
  await dependsOn('landlord', 'rent');
  at(9, 8, 30);
  const proposalThought = await thought('اسفند اجاره را تمدید کنم');
  const pr = await api.post<AnyJson>(`${b}/thoughts/${proposalThought.id}/promote`, { type: 'Decision' });
  O.renew = pr.object.id;
  await edit('renew', { title: 'تمدید اجاره با سقف افزایش', content: 'اگر افزایش اجاره از ۲۰ درصد بیشتر نشد، همین خانه را یک سال دیگر تمدید می‌کنم؛ بیشتر از آن، خانه‌گردی را از بهمن شروع می‌کنم.' });
  await dependsOn('renew', 'landlord', 'fixedCost');
  await api.post(`${b}/objects/${O.renew}/replace`, { replacesId: O.stayThisYear });
  await api.post(`${b}/objects/${O.physio}/restore`, {});
  await edit('physio', { content: 'ده جلسهٔ دوم برای زانو تا پایان آذر؛ هفته‌ای دو جلسه.' }, 'درد برگشت و باید جلسه‌ها دوباره شروع شود');
  await output({ ago: 9, node: 'lease', request: 'پیامی مؤدبانه به مالک بنویس که افزایش اجاره را مذاکره کند', title: 'پیش‌نویس پیام به مالک', markdown: 'سلام آقای مهدوی. از اعتمادتان به‌عنوان مستأجر چندساله ممنونم. افزایش ۲۸ درصدی برای من سنگین است؛ آیا می‌شود سقف را حدود ۲۰ درصد بگذاریم؟' });

  at(8, 14, 0);
  await know('arianException', 'arian', 'Fact', 'تحویل نهایی در یک شنبه', 'تحویل نهایی پروژهٔ آرین فقط یک بار در یک شنبهٔ اسفند است؛ شنبه همراه خانواده را به شنبهٔ بعد منتقل می‌کنم.', { facets: ['کار'] });
  await api.post(`${b}/objects/${O.arianException}/overrides`, { targetId: O.saturday, reason: 'یک استثنای تک‌باره برای تحویل پروژه' });
  await measure('fund', 8, 71);
  await edit('emergNow', { content: 'الان ۷۱ میلیون تومان در حساب جدا دارم.' }, 'حقوق آبان پس‌انداز شد');
  await measure('sleep', 8, 6.8);
  await measure('run', 8, 14);

  at(7, 20, 30);
  await know('tripBudget2', 'plans', 'Fact', 'بودجهٔ سفر نوروز', 'برای سفر نوروز حدود ۴۰ میلیون تومان کنار گذاشته‌ام؛ شش نفر می‌رویم.', { facets: ['مالی', 'سفر'] });
  await note('winter', 'winter', [
    'برای زمستان: سه تا کار کوچک.',
    '- [ایده] لباس‌های اضافی را به کمک مادر جدا کنم',
    '- [سؤال] آیا باید لاستیک زمستانی ماشین را عوض کنم',
    '- [فرض] برف امسال زود می‌آید',
  ].join('\n'));
  await edit('rent', { content: 'اجارهٔ ماهانه ۱۸ میلیون تومان است؛ اول هر ماه به مالک می‌دهم. اگر تمدید شود از فروردین بیشتر می‌شود.' }, 'پیشنهاد مالک را دیدم؛ عدد فعلی همان است');

  at(6, 21, 10);
  await know('proposal2', 'plans', 'Decision', 'مرخصی', 'یک ماه کامل مرخصی نمی‌گیرم؛ سه هفتهٔ پراکنده، هر کدام ده روز.', {
    status: 'Proposed', provenance: 'Imported', source: { kind: 'paste', label: 'پاسخ ابزار دیگر', at: new Date(tehranAt(now, 6, 21, 10)).toISOString() },
  });
  await note('scratch', 'plans', [
    'فهرست گیج: چیزهایی که هنوز نمی‌دانم کجا بگذارم.',
    '- [ایده] کارت‌های تبریک دست‌ساز برای مادر',
    '- [سؤال] آیا دوباره پیانو را شروع کنم',
    '- [ایده] کلاس سفالگری ماه‌های بهمن',
  ].join('\n'));

  at(5, 22, 10);
  await edit('renew', { content: 'اگر افزایش اجاره از ۱۸ درصد بیشتر نشد، همین خانه را یک سال دیگر تمدید می‌کنم؛ بیشتر از آن، خانه‌گردی را از بهمن شروع می‌کنم.' }, 'با خواهر حرف زدم و آستانه را پایین‌تر آوردم');
  await measure('run', 5, 15);
  // یادداشتی که دیگر لازم نیست پاک می‌شود؛ فکری که از آن آمده می‌ماند و می‌گوید «یادداشت حذف شد»
  await api.del(`${b}/notes/${NT.driving}`);
  await api.upload(`${b}/files`, { name: 'نتیجهٔ آزمایش مهر.txt', mime: 'text/plain', text: 'آزمایش مهر ۱۴۰۵\nTSH: 5.8 (بالاتر از حد)\nT4 آزاد: 0.9 (پایین مرزی)\nنظر دکتر: دوز را بالا ببریم و بعد از دو ماه دوباره بسنجیم.\n' }, { nodeId: N.meds });

  at(4, 9, 0);
  await output({ ago: 4, node: 'trip', specId: 'lib_trip_plan', deliverableId: 'del_trip_checklist', title: 'فهرست پیش از سفر', markdown: '- بیمهٔ مسافرتی\n- رزرو اقامتگاه اصفهان\n- سرویس ماشین\n- پول نقد برای بازار' });
  await rewrite('scratch', [
    'فهرست گیج: چیزهایی که هنوز نمی‌دانم کجا بگذارم.',
    '- [ایده] کارت‌های تبریک دست‌ساز برای مادر',
    '- [ایده] کلاس سفالگری ماه‌های بهمن',
  ].join('\n'));
  const loose = await thought('کلاس سفالگری');
  await api.post(`${b}/thoughts/${loose.id}/resolve`, { nodeId: N.winter });

  // ═══ آخرین روزها — دارو دوباره عوض می‌شود و همه‌چیز دنبالش می‌آید ═══════════════════════════
  at(3, 10, 0);
  await edit('levo', { content: 'لووتیروکسین ۷۵ میکروگرم، صبح ناشتا، نیم ساعت پیش از صبحانه و دو ساعت دور از قرص آهن.' }, 'دکتر گفت آهن را بعد از ظهر بخورم؛ ساعت‌ها جداست');
  await api.post(`${b}/objects/${O.medReminder}/review-accept`, {});
  await api.post(`${b}/objects/${O.sleepTime}/outcome`, { text: 'میانگین خواب به ۶٫۹ ساعت رسید؛ هنوز به هدف نرسیده‌ام اما از قبل بهتر شده.' });
  await confirm('hourlyRate');

  at(2, 21, 30);
  await promote('readMonthly', 'هر ماه یک کتاب غیرکاری', 'Decision');
  await promote('costsAssume', 'هزینه‌هایم هنوز بیشتر از ۳۲ میلیون', 'Fact');
  await draft('emergRule', { content: 'معادل هشت ماه هزینهٔ ثابت را پول نقد نگه می‌دارم، نه شش ماه؛ با اجارهٔ بالاتر شش ماه کم است.' }, 'عدد جدید را بعد از توافق با مالک می‌پذیرم');
  await output({ ago: 1, node: 'meds', specId: 'lib_health_brief', deliverableId: 'del_health_questions', title: 'سؤال‌های ویزیت بعدی', markdown: '۱. با دوز ۷۵، نتیجهٔ TSH چطور بود؟\n\n۲. ساعت قرص آهن را چه موقع بگذارم؟\n\n۳. خستگی عصرها با دوز ربطی دارد؟' });

  at(0, 8, 20);
  await note('today', 'me', '- [سؤال] این هفته به کدام «بله» باید «نه» بگویم\n- [ایده] دوشنبه صبح پیش از کار، ده دقیقه مرور هفته');
}
