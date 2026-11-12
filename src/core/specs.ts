/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeNode, Workspace, WorkstreamSpec } from '../types';
import { LIBRARY_SPECS } from './specLibrary';
import { TEMPLATE_SCHEMA, templateTree } from './startTemplate';
import type { StartTemplate } from './startTemplate';

/**
 * The ordinary starting point of a new workspace (data, not law): five nodes any user may rename, move or delete. The keys are
 * also the node ids of a brand-new workspace, which keeps the workflow hints (`nodeId`) below meaningful; a hint that points to a
 * node that is gone just falls back to the default place (`resolveNodeId`).
 */
export const DEFAULT_START: StartTemplate = {
  schema: TEMPLATE_SCHEMA, id: 'default', version: 1, title: 'کسب‌وکار و محصول', description: 'ساختار پیش‌فرض برای کسب‌وکار محصولی؛ هر گره‌اش را می‌شود عوض کرد.',
  nodes: [{
    key: 'business', label: 'کسب‌وکار و بنیان', description: 'هویت، مأموریت، چشم‌انداز و مدل کلی درآمدی',
    children: [
      { key: 'brand', label: 'برند و پیام', description: 'لحن، موقعیت‌یابی، تمایزها و ارزش‌های اساسی', children: [
        { key: 'content', label: 'محتوا و بازاریابی', description: 'ستون‌های محتوایی، کانال‌های توزیع و تقویم ایده‌ها' },
      ] },
      { key: 'product', label: 'محصول و خدمت', description: 'ویژگی‌ها، کارکردها و ارزش پیشنهادی کلیدی', children: [
        { key: 'offer', label: 'آفر و قیمت‌گذاری', description: 'بسته‌های قیمتی، شرایط تحویل و محدودیت‌های فروش' },
      ] },
    ],
  }],
  samples: [],
};

/**
 * The starting point of a personal space (a person's own life, projects and learning — Mabda is not only for businesses).
 * Same rules as the default: data, every node renamable; a workflow hint that names a business node falls back to the default place.
 */
const leaf = (key: string, label: string, description: string) => ({ key, label, description });
export const PERSONAL_START: StartTemplate = {
  schema: TEMPLATE_SCHEMA, id: 'personal', version: 1, title: 'شخصی', description: 'برای زندگی خودت؛ هر شاخه‌اش را می‌شود حذف یا عوض کرد.',
  nodes: [
    leaf('me', 'دربارهٔ من', 'ارزش‌ها، اولویت‌ها و اصولی که با آن تصمیم می‌گیری'),
    leaf('health', 'سلامت', 'حساسیت‌ها، داروها، عادت‌ها و توصیه‌هایی که باید یادت بماند'),
    leaf('money', 'مالی شخصی', 'درآمد، هزینه‌ها، قراردادها و تصمیم‌های مالی'),
    leaf('home', 'خانه و خانواده', 'اجاره، قرارها و آنچه به خانه و خانواده مربوط است'),
    leaf('learning', 'یادگیری', 'آنچه خوانده‌ای و یاد گرفته‌ای، و آنچه می‌خواهی یاد بگیری'),
    leaf('plans', 'سفر و برنامه‌ها', 'برنامه‌های پیش رو و تصمیم‌هایشان'),
  ],
  samples: [],
};

export const PROJECT_START: StartTemplate = {
  schema: TEMPLATE_SCHEMA, id: 'project', version: 1, title: 'پروژه', description: 'برای یک پروژه؛ هر شاخه‌اش را می‌شود حذف یا عوض کرد.',
  nodes: [
    leaf('goal', 'هدف', 'این پروژه برای چیست و کی تمام است'),
    leaf('scope', 'دامنه و خط قرمزها', 'چه چیزی در آن هست، چه چیزی نیست، و چه کاری نباید کرد'),
    leaf('people', 'آدم‌ها', 'چه کسانی درگیرند و هر کدام چه می‌خواهند'),
    leaf('decisions', 'تصمیم‌ها', 'آنچه تصمیم گرفته شد و چرا'),
    leaf('plan', 'برنامه', 'قدم‌ها و تاریخ‌ها'),
  ],
  samples: [],
};

/** «خالی»: no starting branches; one plain place so the first thing written has somewhere to sit */
export const EMPTY_START: StartTemplate = {
  schema: TEMPLATE_SCHEMA, id: 'empty', version: 1, title: 'خالی', description: 'بدون شاخهٔ آماده.',
  nodes: [leaf('notes', 'نوشته‌ها', 'هر چه درست است؛ شاخه‌ها را بعد خودت می‌سازی')],
  samples: [],
};

/** what a space is for (audience.md): picks the starting tree, the guide texts and the examples. Absent = work, as before. */
export type WorkspacePurpose = 'personal' | 'work' | 'project' | 'empty';
export const WORKSPACE_PURPOSES: WorkspacePurpose[] = ['personal', 'work', 'project', 'empty'];
export const startTemplateFor = (purpose: WorkspacePurpose | undefined): StartTemplate =>
  purpose === 'personal' ? PERSONAL_START : purpose === 'project' ? PROJECT_START : purpose === 'empty' ? EMPTY_START : DEFAULT_START;

/** the starting tree as rows (some engines and tests want a concrete tree; real workspaces read their own from the database) */
export const DEFAULT_TREE_NODES: TreeNode[] = templateTree(DEFAULT_START);

export const WORKSTREAM_SPECS: WorkstreamSpec[] = [
  {
    id: 'main_positioning',
    title: 'پایهٔ موقعیت‌یابی و استراتژی محتوا',
    target: 'تدوین شفاف گزاره ارزش، پرسونای مخاطب، پایه‌های پیام و تقویم اولیه محتوا',
    description: 'جریان کاری اصلی برای تبدیل تصمیمات کلان کسب‌وکار به دارایی‌های منسجم بازاریابی.',
    requiredContext: [
      {
        key: 'domain_field',
        label: 'حوزهٔ کسب‌وکار و تخصص',
        description: 'فعالیت اصلی شرکت یا فرد و صنعت هدف',
        nodeId: 'business',
      },
      {
        key: 'target_audience',
        label: 'مخاطب اصلی',
        description: 'چه کسی خریدار اصلی یا کاربر هدف است',
        nodeId: 'business',
        dependsOn: ['domain_field'],
      },
      {
        key: 'core_problem',
        label: 'مسئله و درد اصلی مشتری',
        description: 'مخاطب در حال حاضر با چه مانع بزرگی مواجه است',
        nodeId: 'business',
        dependsOn: ['target_audience'],
      },
      {
        key: 'value_proposition',
        label: 'پیشنهاد ارزش و راه‌حل',
        description: 'چگونه این مسئله با تمایز حل می‌شود',
        nodeId: 'product',
        dependsOn: ['core_problem'],
      },
    ],
    suggestedContext: [
      {
        key: 'differentiation',
        label: 'تمایز کلیدی رقابتی',
        description: 'چرا مشتری باید شما را به جای رقبا یا روش‌های فعلی انتخاب کند',
        nodeId: 'brand',
      },
      {
        key: 'tone_of_voice',
        label: 'لحن و سبک گفتار',
        description: 'شخصیت ارتباطی (مثلاً صریح، حرفه‌ای، بدون حاشیه)',
        nodeId: 'brand',
      },
      {
        key: 'pricing_boundary',
        label: 'مرزها و محدودیت‌های قیمت‌گذاری',
        description: 'خط قرمزها (مانند عدم تخفیف، عدم ارائه خدمات رایگان)',
        nodeId: 'offer',
      },
    ],
    optionalContext: [
      {
        key: 'future_roadmap',
        label: 'نقشه راه آینده',
        description: 'اهداف رشد و توسعه محصول در ۶ ماه آتی',
        nodeId: 'business',
      },
    ],
    deliverables: [
      {
        id: 'del_positioning_statement',
        title: 'جملهٔ موقعیت‌یابی',
        type: 'Asset',
        description: 'گزاره یکپارچه و دقیق از اینکه برای چه کسی، چه ارزشی با چه تمایزی خلق می‌کنید.',
        order: 1,
        baseCreditCost: { fast: 1, auto: 2, critique: 10, sensitive: 20 },
        acceptanceCriteria: [
          'عدم وجود ادعاهای عمومی یا مبالغه‌آمیز',
          'اشاره صریح به مخاطب هدف و مسئله اصلی',
          'بیان تمایز مشخص و قابل سنجش',
          'انطباق با لحن اعلام‌شده کسب‌وکار',
        ],
      },
      {
        id: 'del_icp_profile',
        title: 'پروفایل مشتری آرمانی',
        type: 'Deliverable',
        description: 'تحلیل عمیق انگیزه‌ها، ترس‌ها، جایگزین‌های فعلی و معیارهای تصمیم‌گیری مشتری.',
        order: 2,
        baseCreditCost: { fast: 2, auto: 5, critique: 20, sensitive: 40 },
        acceptanceCriteria: [
          'جداسازی واقعیات رفتاری از فرضیات سطحی دموگرافیک',
          'تعیین هزینهٔ عدم اقدام برای مشتری',
          'فهرست موانع ذهنی خرید و پاسخ‌های معتبر به آنها',
        ],
      },
      {
        id: 'del_messaging_pillars',
        title: 'پایهٔ پیام و ستون‌های محتوایی',
        type: 'Deliverable',
        description: '۴ ستون موضوعی پیوسته که اعتماد مخاطب را به راه‌حل شما به صورت طبیعی می‌سازد.',
        order: 3,
        baseCreditCost: { fast: 18, auto: 26, critique: 50, sensitive: 80 },
        acceptanceCriteria: [
          'هر ستون باید به یکی از موانع یا تمایزات کلیدی متصل باشد',
          'پرهیز از کلی‌گویی و ارائه زوایای دید غیرمنتظره',
          'شفافیت در مرزهای موضوعی و پرهیز از تکرار مطالب رقبا',
        ],
      },
      {
        id: 'del_14_content_ideas',
        title: '۱۴ ایدهٔ محتوای عمیق با زاویهٔ دید اختصاصی',
        type: 'Deliverable',
        description: 'ایده‌های آماده تولید برای لینکدین، اینستاگرام یا خبرنامه بر پایهٔ فکت‌ها و تصمیمات واقعی.',
        order: 4,
        baseCreditCost: { fast: 18, auto: 26, critique: 50, sensitive: 80 },
        acceptanceCriteria: [
          'دارای قلاب (جملهٔ جذب) قوی مبتنی بر درد مشتری',
          'متصل به تجربیات و تصمیمات مندرج در درخت دانش',
          'شامل دعوت به اقدام بدون حالت التماسی یا فروش تهاجمی',
        ],
      },
      {
        id: 'del_action_plan',
        title: 'اقدام‌های بعدی و اولویت‌های اجرایی',
        type: 'Deliverable',
        description: 'گام‌های ۳۰ روزه برای تست موقعیت‌یابی و دریافت بازخورد واقعی از بازار.',
        order: 5,
        baseCreditCost: { fast: 2, auto: 5, critique: 20, sensitive: 40 },
        acceptanceCriteria: [
          'معیارهای سنجش پذیرش شفاف (شاخص‌های کلیدی)',
          'ترتیب منطقی بدون وابستگی به سرمایه سنگین',
        ],
      },
    ],
  },
  {
    id: 'instagram_foundation',
    title: 'پایهٔ اینستاگرام',
    target: 'طراحی بایو، ۳ ستون محتوایی، قلاب‌های ریلز و ساختار استوری‌لاین',
    description: 'قالب فشرده برای کسب‌وکارهای متکی به رشد در اینستاگرام با تکیه بر اصالت دانش.',
    requiredContext: [
      {
        key: 'domain_field',
        label: 'حوزهٔ فعالیت',
        description: 'موضوع تخصصی صفحه',
        nodeId: 'business',
      },
      {
        key: 'target_audience',
        label: 'مخاطب پیج',
        description: 'چه کسانی باید شما را فالو کنند',
        nodeId: 'business',
      },
      {
        key: 'value_proposition',
        label: 'دلیل فالو کردن',
        description: 'مخاطب بعد از دیدن پیج چه آورده‌ای خواهد داشت',
        nodeId: 'product',
      },
    ],
    suggestedContext: [
      {
        key: 'tone_of_voice',
        label: 'لحن تولید محتوا',
        description: 'صمیمانه، آموزشی، تند و تیز یا روایی',
        nodeId: 'brand',
      },
    ],
    optionalContext: [],
    deliverables: [
      {
        id: 'del_ig_bio',
        title: 'بایو و هایلایت‌های حیاتی اینستاگرام',
        type: 'Asset',
        description: 'فرمول ۳ خطی بایو: کیستی + چه دردی حل می‌کنی + آفر اصلی و لینک.',
        order: 1,
        baseCreditCost: { fast: 1, auto: 2, critique: 10, sensitive: 20 },
        acceptanceCriteria: ['زیر ۱۵۰ کاراکتر', 'قلاب فوری بدون ایموجی‌های زائد'],
      },
      {
        id: 'del_ig_reels_calendar',
        title: '۱۰ قلاب و سناریوی ریلز بر اساس تصمیمات بیزنس',
        type: 'Deliverable',
        description: 'سناریوهای ریلز ۳۰ ثانیه‌ای با ساختار: هوک، چالش، راه‌حل اختصاصی.',
        order: 2,
        baseCreditCost: { fast: 18, auto: 26, critique: 50, sensitive: 80 },
        acceptanceCriteria: ['هوک ۳ ثانیه اول', 'انطباق با محدودیت‌ها و تعاریف ثبت‌شده'],
      },
    ],
  },
  {
    id: 'freelance_profile',
    title: 'پروفایل و خدمات فریلنسری و مشاوره',
    target: 'معرفی حرفه‌ای، بسته‌های خدماتی و قرارداد پایه برای سولو فاوندرها و مشاوران',
    description: 'ابزار ویژه فریلنسرها برای تبدیل دانش شخصی به قیمت‌گذاری ارزشی و پروپوزال معتبر.',
    requiredContext: [
      {
        key: 'domain_field',
        label: 'حوزهٔ مشاوره یا فریلنسری',
        description: 'تخصص ارشد شما',
        nodeId: 'business',
      },
      {
        key: 'core_problem',
        label: 'معضل مشتری در این تخصص',
        description: 'مشتری معمولاً به خاطر چه ضعفی به شما مراجعه می‌کند',
        nodeId: 'business',
      },
      {
        key: 'pricing_boundary',
        label: 'شیوه قیمت‌گذاری و مرزها',
        description: 'ساعتی نیست، پروژه‌ای یا ارزش‌محور است',
        nodeId: 'offer',
      },
    ],
    suggestedContext: [
      {
        key: 'differentiation',
        label: 'پیشینه و امضای کاری',
        description: 'چه چیزی تجربه کاری شما را منحصربه‌فرد می‌کند',
        nodeId: 'brand',
      },
    ],
    optionalContext: [],
    deliverables: [
      {
        id: 'del_freelance_hero',
        title: 'پروفایل لینکدین و بیانیه حرفه‌ای',
        type: 'Asset',
        description: 'تایتل لینکدین و بخش «دربارهٔ من» بدون کلمات کلیشه‌ای مانند «باانگیزه و خلاق».',
        order: 1,
        baseCreditCost: { fast: 1, auto: 2, critique: 10, sensitive: 20 },
        acceptanceCriteria: ['تمرکز بر نتیجه تجاری برای کارفرما'],
      },
      {
        id: 'del_service_tiers',
        title: '۳ بسته خدماتی ارزش‌محور (پایه / بهتر / بهترین)',
        type: 'Deliverable',
        description: 'شرح خدمات، دستاوردها، زمان‌بندی و شرایط همکاری.',
        order: 2,
        baseCreditCost: { fast: 18, auto: 26, critique: 50, sensitive: 80 },
        acceptanceCriteria: ['سکوهای قیمتی شفاف', 'تعهدات مشخص بدون اضافه‌کاری بدون فاکتور'],
      },
    ],
  },
];

/** the first three workstreams: what every workspace that existed before the library saw (absent `enabledSpecIds` = these, so nothing changes for them) */
export const LEGACY_SPEC_IDS = ['main_positioning', 'instagram_foundation', 'freelance_profile'];

/** the whole library: the three originals + the general-purpose frameworks (`specLibrary.ts`) */
export const LIBRARY: WorkstreamSpec[] = [...WORKSTREAM_SPECS, ...LIBRARY_SPECS];

/** does this library workstream fit a space of this kind? (no `purposes` = written for work) */
export const specFits = (s: Pick<WorkstreamSpec, 'purposes'>, purpose: WorkspacePurpose | undefined): boolean =>
  (s.purposes ?? ['work']).includes(purpose ?? 'work');

/** what a space that never chose starts with: a work space keeps the three originals (old workspaces unchanged);
 * a personal or project space starts with the ones written for it, never with selling (audience.md); an empty space with none */
const defaultSpecs = (purpose: WorkspacePurpose | undefined): WorkstreamSpec[] =>
  purpose === undefined || purpose === 'work' ? WORKSTREAM_SPECS.filter((s) => LEGACY_SPEC_IDS.includes(s.id))
    : purpose === 'empty' ? [] : LIBRARY.filter((s) => s.purposes?.includes(purpose));

/** what a NEW space is created with: the workstreams written for its kind (a work or empty space starts with none and picks) */
export const starterSpecIds = (purpose: WorkspacePurpose): string[] =>
  purpose === 'personal' || purpose === 'project' ? LIBRARY.filter((s) => s.purposes?.includes(purpose)).map((s) => s.id) : [];

/** the library workstreams the workspace has taken (absent `enabledSpecIds` = the defaults for its kind) */
export const enabledBuiltInSpecs = (ws: Pick<Workspace, 'enabledSpecIds' | 'purpose'> | undefined): WorkstreamSpec[] =>
  !ws || ws.enabledSpecIds === undefined ? defaultSpecs(ws?.purpose) : LIBRARY.filter((s) => ws.enabledSpecIds!.includes(s.id));

/** `enabledSpecIds` as an explicit list (what «absent» means for a workspace that never chose) */
export const currentSpecIds = (ws: Pick<Workspace, 'enabledSpecIds' | 'purpose'>): string[] => enabledBuiltInSpecs(ws).map((s) => s.id);
