/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeNode, WorkstreamSpec } from '../types';

export const DEFAULT_TREE_NODES: TreeNode[] = [
  {
    id: 'business',
    isSystem: true,
    order: 0,
    label: 'کسب‌وکار و بنیان',
    description: 'هویت، مأموریت، چشم‌انداز و مدل کلی درآمدی',
  },
  {
    id: 'brand',
    isSystem: true,
    order: 1,
    label: 'برند و پیام',
    parentId: 'business',
    description: 'لحن، موقعیت‌یابی، تمایزها و ارزش‌های اساسی',
  },
  {
    id: 'product',
    isSystem: true,
    order: 2,
    label: 'محصول و خدمت',
    parentId: 'business',
    description: 'ویژگی‌ها، کارکردها و ارزش پیشنهادی کلیدی',
  },
  {
    id: 'offer',
    isSystem: true,
    order: 3,
    label: 'آفر و قیمت‌گذاری',
    parentId: 'product',
    description: 'بسته‌های قیمتی، شرایط تحویل و محدودیت‌های فروش',
  },
  {
    id: 'content',
    isSystem: true,
    order: 4,
    label: 'محتوا و بازاریابی',
    parentId: 'brand',
    description: 'ستون‌های محتوایی، کانال‌های توزیع و تقویم ایده‌ها',
  },
];

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
        label: 'مخاطب اصلی (ICP)',
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
        title: 'جملهٔ موقعیت‌یابی (Positioning Statement)',
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
        title: 'پروفایل مشتری آرمانی (ICP & Persona)',
        type: 'Deliverable',
        description: 'تحلیل عمیق انگیزه‌ها، ترس‌ها، جایگزین‌های فعلی و معیارهای تصمیم‌گیری مشتری.',
        order: 2,
        baseCreditCost: { fast: 2, auto: 5, critique: 20, sensitive: 40 },
        acceptanceCriteria: [
          'جداسازی واقعیات رفتاری از فرضیات سطحی دموگرافیک',
          'تعیین هزینه عدم اقدام (Cost of Inaction) برای مشتری',
          'فهرست موانع ذهنی خرید و پاسخ‌های معتبر به آنها',
        ],
      },
      {
        id: 'del_messaging_pillars',
        title: 'پایهٔ پیام و ستون‌های محتوایی (Messaging Pillars)',
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
          'دارای قلاب (Hook) قوی مبتنی بر درد مشتری',
          'متصل به تجربیات و تصمیمات مندرج در درخت دانش',
          'شامل دعوت به اقدام (CTA) بدون حالت التماسی یا فروش تهاجمی',
        ],
      },
      {
        id: 'del_action_plan',
        title: 'اقدام‌های بعدی و اولویت‌های اجرایی (Next Actions)',
        type: 'Deliverable',
        description: 'گام‌های ۳۰ روزه برای تست موقعیت‌یابی و دریافت بازخورد واقعی از بازار.',
        order: 5,
        baseCreditCost: { fast: 2, auto: 5, critique: 20, sensitive: 40 },
        acceptanceCriteria: [
          'معیارهای سنجش پذیرش شفاف (KPIs)',
          'ترتیب منطقی بدون وابستگی به سرمایه سنگین',
        ],
      },
    ],
  },
  {
    id: 'instagram_foundation',
    title: 'پایهٔ اینستاگرام (Instagram Foundation)',
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
        description: 'تایتل لینکدین و بخش About بدون کلمات کلیشه‌ای مانند «باانگیزه و خلاق».',
        order: 1,
        baseCreditCost: { fast: 1, auto: 2, critique: 10, sensitive: 20 },
        acceptanceCriteria: ['تمرکز بر نتیجه تجاری برای کارفرما'],
      },
      {
        id: 'del_service_tiers',
        title: '۳ بسته خدماتی ارزش‌محور (Good / Better / Best)',
        type: 'Deliverable',
        description: 'شرح خدمات، دستاوردها، زمان‌بندی و شرایط همکاری.',
        order: 2,
        baseCreditCost: { fast: 18, auto: 26, critique: 50, sensitive: 80 },
        acceptanceCriteria: ['سکوهای قیمتی شفاف', 'تعهدات مشخص بدون اضافه‌کاری بدون فاکتور'],
      },
    ],
  },
];
