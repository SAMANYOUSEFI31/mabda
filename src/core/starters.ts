/**
 * Starter skeletons for four kinds of business. Every object is a SAMPLE: grey «نمونه» in the UI, invisible to every AI path
 * and engine (repo.listObjects), until the user writes her own over it. Texts are examples of the SHAPE of a good answer.
 */

import type { ContextType } from '../types';
import { TEMPLATE_SCHEMA } from './startTemplate';
import type { StartTemplate, TemplateSample } from './startTemplate';

/** the kinds of business below are ordinary start templates (the same data format as any other): they bring no nodes, only examples; `node` is a hint for a node of the workspace */
export type Starter = StartTemplate;

const s = (type: ContextType, nodeId: string, title: string, content: string, slotKey?: string, facets?: string[]): TemplateSample => ({ type, node: nodeId, title, content: `مثال: ${content}`, ...(slotKey ? { slotKey } : {}), ...(facets ? { facets } : {}) });

export const STARTERS: Starter[] = [
  {
    id: 'cohort_course', title: 'دوره / کوهورت', description: 'آموزش گروهی با شروع و پایان مشخص و ظرفیت محدود.', schema: TEMPLATE_SCHEMA, version: 1, nodes: [],
    samples: [
      s('Fact', 'business', 'حوزهٔ آموزش', 'آموزش طراحی محصول به طراحان تازه‌کار.', 'domain_field'),
      s('Decision', 'business', 'مخاطب اصلی', 'طراحان با ۱ تا ۳ سال سابقه که می‌خواهند مسیر ارشد شوند.', 'target_audience', ['مخاطب اصلی']),
      s('Fact', 'business', 'مسئلهٔ مخاطب', 'نمونه‌کار دارند ولی نمی‌دانند چطور تصمیم طراحی را برای مدیر محصول توجیه کنند.', 'core_problem'),
      s('Decision', 'offer', 'ساختار دوره', 'هشت هفته، هفته‌ای یک جلسهٔ زنده و یک تمرین با بازخورد.', 'core_promise'),
      s('Constraint', 'offer', 'ظرفیت', 'هر دوره حداکثر ۲۰ نفر؛ بیشتر از آن بازخورد فردی ممکن نیست.'),
      s('Decision', 'offer', 'قیمت', 'یک قیمت ثابت برای کل دوره و پرداخت دو قسطی.', 'price_point'),
      s('Decision', 'content', 'کانال جذب', 'پست‌های آموزشی کوتاه در لینکدین و یک وبینار رایگان.', 'launch_channel'),
      s('Constraint', 'brand', 'لحن', 'صمیمی و عملی؛ بدون وعدهٔ «ارشد شدن در هشت هفته».'),
    ],
  },
  {
    id: 'services', title: 'خدمات', description: 'کار پروژه‌ای یا مشاوره‌ای برای مشتری‌های مشخص؛ یک بخش «بسته‌های خدمت» هم می‌سازد.', schema: TEMPLATE_SCHEMA, version: 1,
    nodes: [{ key: 'packages', label: 'بسته‌های خدمت', description: 'بسته‌ها، حد تغییرات و قیمت خدمت' }],
    samples: [
      s('Fact', 'business', 'حوزهٔ خدمت', 'طراحی و اجرای کمپین محتوا برای کسب‌وکارهای کوچک.', 'domain_field'),
      s('Decision', 'business', 'مشتری ایدئال', 'صاحب کسب‌وکار ۵ تا ۲۰ نفره که تیم بازاریابی ندارد.', 'target_audience', ['مخاطب اصلی']),
      s('Fact', 'business', 'جرقهٔ خرید', 'وقتی فروش ماه‌به‌ماه بالا و پایین می‌شود و کسی مسئول بازاریابی نیست.', 'buying_trigger'),
      s('Decision', 'packages', 'بسته‌های خدمت', 'سه بسته: پایه، رشد، شریک؛ هرکدام با خروجی ماهانهٔ مشخص.', 'core_promise'),
      s('Constraint', 'packages', 'حد تغییرات', 'دو دور بازبینی در هر خروجی؛ بیشتر از آن جداگانه حساب می‌شود.'),
      s('Decision', 'packages', 'قیمت', 'ماهانه و بدون قرارداد بلندمدت.', 'price_point'),
      s('Fact', 'brand', 'مدرک اعتماد', 'سه مشتری فعال با نتیجهٔ قابل‌ذکر.', 'social_proof'),
      s('Constraint', 'product', 'زمان پاسخ', 'پاسخ به پیام مشتری حداکثر ظرف یک روز کاری.', 'response_time'),
    ],
  },
  {
    id: 'product', title: 'محصول', description: 'محصول نرم‌افزاری یا فیزیکی با قیمت و نسخه‌های مشخص.', schema: TEMPLATE_SCHEMA, version: 1, nodes: [],
    samples: [
      s('Fact', 'business', 'حوزهٔ محصول', 'اپلیکیشن مدیریت وظیفه برای تیم‌های دورکار.', 'domain_field'),
      s('Decision', 'business', 'مخاطب اصلی', 'مدیر تیم‌های ۵ تا ۱۵ نفره در شرکت‌های نرم‌افزاری.', 'target_audience', ['مخاطب اصلی']),
      s('Fact', 'business', 'مسئلهٔ مخاطب', 'پیگیری کارها در چند ابزار پراکنده است و جلسهٔ هماهنگی زیاد.', 'core_problem'),
      s('Decision', 'product', 'وعدهٔ اصلی', 'یک جا ببین کی چه کاری را تا کجا برده، بدون جلسه.', 'core_promise'),
      s('Decision', 'offer', 'مدل قیمت', 'رایگان تا ۵ نفر، بعد از آن ماهانه برای هر عضو.', 'price_point'),
      s('Constraint', 'product', 'حریم خصوصی', 'داده‌ها فقط روی سرور داخل کشور نگه‌داری می‌شود.'),
      s('Decision', 'content', 'کانال اصلی', 'وبلاگ آموزشی و جامعهٔ مدیران محصول.', 'launch_channel'),
      s('Fact', 'brand', 'لحن', 'ساده، بدون اصطلاح فنی غیرضروری.', 'voice_dimensions'),
    ],
  },
  {
    id: 'insta_shop', title: 'فروشگاه اینستاگرامی', description: 'فروش مستقیم از صفحه با ارسال پستی و پیام خصوصی.', schema: TEMPLATE_SCHEMA, version: 1, nodes: [],
    samples: [
      s('Fact', 'business', 'حوزهٔ فروشگاه', 'لوازم دست‌ساز چوبی برای آشپزخانه.', 'domain_field'),
      s('Decision', 'business', 'مخاطب اصلی', 'خانم‌های ۲۵ تا ۴۰ ساله که برای خانهٔ جدید یا هدیه می‌خرند.', 'target_audience', ['مخاطب اصلی']),
      s('Decision', 'content', 'ستون‌های محتوا', 'پشت‌صحنهٔ ساخت، ایدهٔ استفاده، و نظر مشتری‌ها.', 'content_pillars'),
      s('Decision', 'offer', 'ارسال', 'ارسال با پست پیشتاز؛ هزینه با مشتری و بسته‌بندی رایگان.'),
      s('Constraint', 'offer', 'سفارش سفارشی', 'سفارش سفارشی فقط تا ۱۰ روز قبل از مناسبت.'),
      s('Constraint', 'product', 'پاسخ به پیام', 'پیام خصوصی حداکثر ظرف ۴ ساعت در ساعات کاری جواب داده می‌شود.', 'response_time'),
      s('Fact', 'brand', 'مدرک اعتماد', 'صد عکس از بسته‌های رسیده در هایلایت «مشتری‌ها».', 'social_proof'),
      s('Constraint', 'brand', 'لحن', 'گرم و خودمانی؛ بدون «تخفیف باورنکردنی».'),
    ],
  },
];
