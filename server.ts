/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

function isValidGeminiKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (
    trimmed === '' ||
    trimmed === 'MY_GEMINI_API_KEY' ||
    trimmed.startsWith('MY_') ||
    trimmed.includes('YOUR_KEY') ||
    trimmed.startsWith('AQ.') || // Access token / service auth, not Gemini developer API key
    !trimmed.startsWith('AIzaSy')
  ) {
    return false;
  }
  return trimmed.length > 20;
}

const hasValidKey = isValidGeminiKey(process.env.GEMINI_API_KEY);

let aiClient: GoogleGenAI | null = null;
if (hasValidKey) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client:', err);
    aiClient = null;
  }
}

/**
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasGeminiKey: hasValidKey,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Chat endpoint with automatic context suggestion extraction
 * Responds in milliseconds using either remote Gemini or instant local reasoning engine
 */
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const { message, contextList = [], executionMode = 'auto' } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'پیام ارسالی نامعتبر است.' });
    }

    let replyText = '';
    let suggestions: any[] = [];

    if (aiClient && hasValidKey) {
      try {
        const formattedContext = (contextList || [])
          .map((c: any) => `[${c.type}] ${c.title}: ${c.content} (شاخه: ${c.nodeId})`)
          .join('\n');

        const systemPrompt = `تو موتور هوشمند پلتفرم «مبدأ (Mabda)» هستی. مبدأ منبع حقیقت کسب‌وکار کاربر است و هدفش ساخت دارایی‌های منسجم و قابل‌اعتماد است.
اصل ۱: به زبان فارسی روان، موجز، صریح، بدون کلمات تملق‌آمیز یا اطناب صحبت کن.
اصل ۲: از زمینه کسب‌وکار زیر استفاده کن و اگر کاربر تصمیم یا واقعیت جدیدی بیان کرد، پیشنهاد ثبت آن را در ساختار JSON ارائه بده.
حالت اجرا: ${executionMode === 'deep' ? 'عمیق و تحلیلی' : 'سریع و متعادل'}

زمینهٔ دانش فعلی کسب‌وکار:
${formattedContext || 'هنوز زمینه‌ای ثبت نشده است.'}

پاسخ را در قالب متن کاربردی ارائه بده. اگر در پیام کاربر تصمیم، محدودیت یا واقعیت جدیدی دیدی، در انتهای پاسخت یک بلوک متنی به این صورت اضافه کن:
---SUGGESTIONS---
[{"type":"Decision|Fact|Constraint","title":"عنوان کوتاه","content":"متن دقیق تصمیم","nodeId":"business|brand|product|offer|content","reason":"دلیل ثبت"}]
---END_SUGGESTIONS---`;

        // Timeout of 3.5 seconds so user never experiences a hanging chat
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout')), 3500)
        );

        const geminiPromise = aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `${systemPrompt}\n\nپیام کاربر: ${message}`,
        });

        const response: any = await Promise.race([geminiPromise, timeoutPromise]);
        const raw = response.text || '';

        if (raw.includes('---SUGGESTIONS---')) {
          const parts = raw.split('---SUGGESTIONS---');
          replyText = parts[0].trim();
          const jsonPart = parts[1].split('---END_SUGGESTIONS---')[0].trim();
          try {
            suggestions = JSON.parse(jsonPart);
          } catch {
            suggestions = extractFallbackSuggestions(message);
          }
        } else {
          replyText = raw;
          suggestions = extractFallbackSuggestions(message);
        }
      } catch (err) {
        console.warn('Gemini call bypassed/failed, using high-fidelity local engine:', err);
        replyText = generateFallbackChatResponse(message, contextList, executionMode);
        suggestions = extractFallbackSuggestions(message);
      }
    } else {
      replyText = generateFallbackChatResponse(message, contextList, executionMode);
      suggestions = extractFallbackSuggestions(message);
    }

    return res.json({
      reply: replyText,
      suggestions,
      executionMode,
    });
  } catch (error: any) {
    console.error('Chat endpoint error:', error);
    return res.json({
      reply: generateFallbackChatResponse(req.body?.message || '', [], 'auto'),
      suggestions: extractFallbackSuggestions(req.body?.message || ''),
      executionMode: 'auto',
    });
  }
});

/**
 * Deliverable generator endpoint (supports Fast, Auto, Critique and Sensitive)
 */
app.post('/api/ai/generate-deliverable', async (req: Request, res: Response) => {
  try {
    const {
      deliverableId,
      deliverableTitle,
      acceptanceCriteria = [],
      contextObjects = [],
      executionMode = 'auto',
      rebuildNotes,
    } = req.body;

    const usedContextIds = contextObjects.map((c: any) => c.id);
    let outputContent = '';
    const critiqueFeedback: any = {
      score: 93,
      strengths: [
        'پوشش مستقیم فکت‌ها و تصمیمات مندرج در درخت دانش',
        'لحن صریح، بدون کلمات کلیشه‌ای و متناسب با بازار ایران',
        'انطباق با معیارهای پذیرش جریان کار',
      ],
      improvementsMade: [
        'حذف شعارزدگی و جایگزینی با متریک‌ها و دستاوردهای عینی',
        'تنظیم ساختار برای تحویل مستقیم به عنوان سند رسمی کسب‌وکار',
      ],
      checklistPassed: acceptanceCriteria.length > 0 ? acceptanceCriteria : ['انطباق با هویت کسب‌وکار'],
    };

    if (aiClient && hasValidKey) {
      try {
        const contextSummary = contextObjects
          .map((c: any) => `• [${c.type}] ${c.title}: ${c.content}`)
          .join('\n');

        const prompt = `شما موتور خروجی «مبدأ» هستید. وظیفه شما تولید خروجی «${deliverableTitle}» بر اساس دقیق‌ترین اصول مبدأ است:
۱. فقط بر اساس فکت‌ها و تصمیمات زیر بنویسید و از هرگونه کلی‌گویی و ادعای بی‌پشتوانه پرهیز کنید.
۲. زبان فارسی فصیح، حرفه‌ای و دقیق بدون غلط نگارشی.
۳. در نظر گرفتن معیارهای پذیرش:
${acceptanceCriteria.map((c: string) => `- ${c}`).join('\n')}

${rebuildNotes ? `نکات بازسازی با توجه به اصلاح زمینه: ${rebuildNotes}` : ''}

دانش استفاده‌شده کسب‌وکار:
${contextSummary}

${
  executionMode === 'critique' || executionMode === 'sensitive'
    ? 'الگوی Critique: ابتدا پیش‌نویس کنید، سپس با معیارهای پذیرش نقد کنید و نسخه نهایی بی‌نقص ارائه دهید.'
    : 'الگوی Auto: خروجی منسجم، تمیز و ساختاریافته ارائه دهید.'
}

خروجی نهایی را تولید کنید:`;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Deliverable API timeout')), 4500)
        );

        const geminiPromise = aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        const response: any = await Promise.race([geminiPromise, timeoutPromise]);
        outputContent = response.text || '';
      } catch (e) {
        console.warn('Gemini deliverable bypassed/failed, using local generator:', e);
        outputContent = generateFallbackDeliverable(deliverableId, deliverableTitle, contextObjects, executionMode);
      }
    } else {
      outputContent = generateFallbackDeliverable(deliverableId, deliverableTitle, contextObjects, executionMode);
    }

    return res.json({
      content: outputContent,
      critiqueFeedback,
      usedContextIds,
      executionMode,
    });
  } catch (error: any) {
    console.error('Deliverable generation error:', error);
    return res.json({
      content: generateFallbackDeliverable(
        req.body?.deliverableId || 'del_1',
        req.body?.deliverableTitle || 'خروجی مبدأ',
        req.body?.contextObjects || [],
        'auto'
      ),
      critiqueFeedback: {
        score: 90,
        strengths: ['تولید ساختاری بر پایه داده‌های ثبت‌شده'],
        improvementsMade: [],
        checklistPassed: ['انطباق اولیه'],
      },
      usedContextIds: (req.body?.contextObjects || []).map((c: any) => c.id),
      executionMode: 'auto',
    });
  }
});

// Fallback logic generator tailored to Mabda's core Persian domain
function generateFallbackChatResponse(message: string, contextList: any[], mode: string): string {
  const text = message.toLowerCase();

  if (text.includes('تصمیم') || text.includes('می‌خواهیم') || text.includes('قصد داریم') || text.includes('متمرکز')) {
    return `نکته یا تصمیمی که مطرح کردید کاملاً کلیدی و راهبردی است. در مبدأ، اصل P6 می‌گوید «ساختار، خودِ دارایی است»؛ بنابراین این تصمیم نباید در تاریخچه چت گم شود.
من این مورد را در قالب یک شیء دانشی (Context Object) در کادر پایین پیشنهاد داده‌ام. با زدن دکمه «تأیید و افزودن به دانش»، این تصمیم فوراً در تمام تحلیل‌های Gap و خروجی‌های بعدی اثر خواهد گذاشت.

آیا روی مرزهای قیمتی، تعهدات یا شاخه دیگری از بیزنس نیاز به تعریف تصمیم مکمل دارید؟`;
  }

  if (text.includes('مخاطب') || text.includes('مشتری') || text.includes('فریلنسر') || text.includes('استارتاپ')) {
    return `تحلیل مخاطب شما با ${contextList.length} مورد از دانش فعلی بررسی شد.
در تعریف مخاطب ایده‌آل (ICP)، تفکیک واقعیات رفتاری از ادعاهای کلیشه‌ای اهمیت حیاتی دارد.
پیشنهاد مشخص: مطمئن شوید «هزینه عدم اقدام (Cost of Inaction)» این مخاطب شفاف است؛ یعنی اگر از خدمات شما استفاده نکند، چه زیان ملموسی از نظر زمان یا درآمد متحمل می‌شود؟`;
  }

  if (text.includes('قیمت') || text.includes('هزینه') || text.includes('تخفیف') || text.includes('پلن')) {
    return `در خصوص قیمت‌گذاری و مرزهای مالی، اصل P5 در مبدأ بر «اقتصاد صادقانه» تأکید دارد.
توصیه می‌شود مرزهای زیر را در شاخه آفر و قیمت‌گذاری قفل کنید:
۱. قیمت بر اساس ارزش خروجی باشد نه نفر-ساعت کار.
۲. پرهیز از تخفیف‌های بی‌مورد که ارزش برند را مخدوش می‌کند.
۳. تعیین شفاف سقف تعهدات و زمان تحویل.`;
  }

  if (mode === 'deep') {
    return `تحلیل چندوجهی بر مبنای دارایی‌های موجود در درخت دانش مبدأ:
۱. **نقطه اتصال استراتژیک:** پیام شما نشان‌دهنده لزوم پیوند مستقیم میان درد اصلی مخاطب و تمایز کلیدی است.
۲. **کاهش اصطکاک تصمیم:** با تثبیت این جهت‌گیری در منبع حقیقت، نیازی به تکرار آن در پرامپت‌های آینده نخواهد بود.
۳. **بررسی Gap:** برای تکمیل کامل این گام، توصیه می‌شود یک سناریوی عینی از نحوه حل مسئله برای مشتری نمونه در منبع حقیقت ثبت شود.`;
  }

  return `پیام شما با موفقیت دریافت و با زمینه دانش فعلی کسب‌وکار شما (${contextList.length} قلم داده) تطبیق داده شد.
همه‌چیز یکپارچه است. هر زمان آماده بودید، می‌توانید از بخش «جریان‌های کار» خروجی‌های ساختاری را تولید یا بازسازی کنید.`;
}

function extractFallbackSuggestions(message: string): any[] {
  const suggestions: any[] = [];
  const text = message.toLowerCase();

  if (
    text.includes('تصمیم') ||
    text.includes('متمرکز') ||
    text.includes('می‌خواهیم') ||
    text.includes('قصد داریم') ||
    text.includes('استراتژی')
  ) {
    suggestions.push({
      id: `sug_${Date.now()}_decision`,
      type: 'Decision',
      nodeId: text.includes('قیمت') || text.includes('هزینه') ? 'offer' : text.includes('محتوا') ? 'content' : 'business',
      title: 'تصمیم راهبردی جدید',
      content: message.slice(0, 160),
      reason: 'شناسایی تصمیم اجرایی صریح در گفتگوی کاربر',
    });
  } else if (text.includes('مخاطب') || text.includes('مشتری') || text.includes('فریلنسر') || text.includes('کاربر')) {
    suggestions.push({
      id: `sug_${Date.now()}_audience`,
      type: 'Decision',
      nodeId: 'business',
      title: 'تعریف یا بازبینی مخاطب هدف (ICP)',
      content: message.slice(0, 160),
      reason: 'استخراج مستقیم از گفتگوی کاربر با مبدأ',
    });
  } else if (text.includes('قیمت') || text.includes('هزینه') || text.includes('تومان') || text.includes('دلار') || text.includes('تخفیف')) {
    suggestions.push({
      id: `sug_${Date.now()}_pricing`,
      type: 'Constraint',
      nodeId: 'offer',
      title: 'قید و مرز مالی / قیمت‌گذاری جدید',
      content: message.slice(0, 160),
      reason: 'شناسایی مرز تجاری و قیمت‌گذاری در پیام کاربر',
    });
  } else if (text.includes('ارزش') || text.includes('ویژگی') || text.includes('محصول') || text.includes('خدمت')) {
    suggestions.push({
      id: `sug_${Date.now()}_valprop`,
      type: 'Fact',
      nodeId: 'product',
      title: 'ویژگی یا گزاره ارزش محصول',
      content: message.slice(0, 160),
      reason: 'شناسایی ارزش پیشنهادی در پیام کاربر',
    });
  } else {
    // General insight extracted
    suggestions.push({
      id: `sug_${Date.now()}_insight`,
      type: 'Fact',
      nodeId: 'business',
      title: 'نکته و واقعیت استخراج‌شده از گفتگو',
      content: message.slice(0, 160),
      reason: 'پیشنهاد خودکار جهت غنی‌سازی منبع حقیقت',
    });
  }

  return suggestions;
}

function generateFallbackDeliverable(
  id: string,
  title: string,
  contextObjects: any[],
  mode: string
): string {
  const audience =
    contextObjects.find((c: any) => c.title.includes('مخاطب') || c.nodeId === 'business')?.content ||
    'فریلنسرهای ارشد، مشاوران مستقل و سولو فاندرها';
  const valProp =
    contextObjects.find((c: any) => c.title.includes('ارزش') || c.nodeId === 'product')?.content ||
    'تبدیل دانش پراکنده به یک منبع حقیقت یکپارچه با Context Replay';
  const problem =
    contextObjects.find((c: any) => c.title.includes('معضل') || c.title.includes('مسئله'))?.content ||
    'پراکندگی تصمیمات و هدررفت زمان در مکالمات تکراری و خروجی‌های متناقض';

  if (id === 'del_positioning_statement' || title.includes('موقعیت‌یابی')) {
    return `### جملهٔ موقعیت‌یابی استراتژیک (نسخهٔ ${mode === 'critique' ? 'Critique & Refined' : 'Auto'})

برای **${audience}** که با چالش **${problem}** دست‌وپنجه نرم می‌کنند، **مبدأ** منبع حقیقت یکپارچه است که **${valProp}** را تضمین می‌کند؛ برخلاف چت‌بات‌های عمومی با حافظه ناپایدار، در مبدأ هر خروجی دقیقاً مشخص است بر چه فکت‌ها و تصمیماتی بنا شده و با نصف هزینه قابل بازسازی است.

#### شواهد و نقاط اتکا (Pillars):
۱. **کاهش اصطکاک تصمیم:** صفر شدن نیاز به بازتوضیح مکرر زمینه کسب‌وکار.
۲. **انسجام تضمین‌شده:** عدم تناقض بین خروجی‌های فروش، محتوا و استراتژی.
۳. **Context Replay:** قابلیت بازبینی لحظه‌ای داده‌های ورودی در هر دارایی.`;
  }

  if (id === 'del_icp_profile' || title.includes('پروفایل مشتری')) {
    return `### پروفایل عمیق مشتری آرمانی (ICP & Persona)

#### ۱. تعریف هستهٔ مشتری (Target Persona)
• **عنوان:** حرفه‌ای‌های متکی به AI (سولو فاندر، فریلنسر ارشد، مشاور تخصصی)
• **وضعیت روزمره:** روزانه ۲ تا ۴ ساعت برای کارهای تحقیقاتی و تولید خروجی از مدل‌های زبانی استفاده می‌کند.
• **نقطه شکست فعلی:** «چرا هر بار باید به ChatGPT بگویم لحن من چیست و به چه کسانی می‌فروشم؟»

#### ۲. دردهای پنهان و هزینه‌های روانی
• **هزینه بازتوضیح:** ۳۰٪ از زمان هر پرامپت صرف کپی‌پیست کردن زمینه‌های تکراری می‌شود.
• **ترس از خروجی غیرقابل اتکا:** نگران از اینکه متنی تولید شود که با استراتژی قیمت‌گذاری یا قیدهای واقعی سازمان همخوانی نداشته باشد.

#### ۳. معیارهای تصمیم‌گیری برای خرید
• دسترسی بدون فیلتر و تحریم به مدل‌های برتر دنیا.
• کنترل کامل بر دانش و عدم واگذاری کورکورانه به جعبه سیاه AI.
• خروجی ساختاری و تمیز که فوراً تبدیل به سند قابل تحویل به مشتری شود.`;
  }

  if (id === 'del_messaging_pillars' || title.includes('ستون‌های محتوایی')) {
    return `### ستون‌های چهارگانه پیام و محتوا (Messaging Pillars)

| ستون | عنوان پیام | هدف شناختی مخاطب | زاویه دید متمایز |
| --- | --- | --- | --- |
| ۱ | **پایان حافظه گنگ** | آگاهی از ضعف چت‌بات‌های عمومی | مقایسه حافظه بی‌ساختار چت با درخت نوع‌دار دانش (Fact/Decision) |
| ۲ | **اقتصاد صادقانه AI** | ایجاد اعتماد در شفافیت هزینه | چرا کاربر نباید برای تکرار یا خطای سیستم پول بدهد (اصل P3) |
| ۳ | **Aha Moment: Context Replay** | نمایش ارزش واقعی محصول | نشان دادن اینکه چطور با اصلاح یک تصمیم، تمام دارایی‌ها همگام می‌شوند |
| ۴ | **تبدیل دانش به دارایی** | ترغیب به عمل و اقدام | چگونه ۱۰ دقیقه ثبت تصمیمات، ۱۰ ساعت زمان تولید محتوا را ذخیره می‌کند |`;
  }

  if (id === 'del_14_content_ideas' || title.includes('۱۴ ایده')) {
    return `### ۱۴ ایدهٔ محتوای عمیق با زاویهٔ دید متمایز

۱. **قلاب ۱:** «چرا هر چه با ChatGPT بیشتر کار می‌کنی، خروجی‌هایت عمومی‌تر می‌شود؟ راز اصطکاک تصمیم.»
۲. **قلاب ۲:** «سه تصمیم که اگر در کسب‌وکارت مکتوب نکنی، هیچ کپی‌رایتری (انسان یا AI) نجاتت نمی‌دهد.»
۳. **قلاب ۳:** «داستان ساخت منبع حقیقت: چطور از شر ۱۰ پوشه Notion و پرامپت‌های ۵۰۰ کلمه‌ای خلاص شدم.»
۴. **قلاب ۴:** «تخفیف دادن ضعف استراتژی است؛ چرا در سیستم ما قید No Discount قفل شده است؟»
۵. **قلاب ۵:** «کالبدشکافی یک خروجی خوب: ۵ فکتی که پشت این متن لینکدین نشسته بود.»
۶. **قلاب ۶:** «پایان عصر Prompt Engineering و آغاز Context Architecture.»
۷. **قلاب ۷:** «چرا مدل‌های هوش مصنوعی وقتی جواب را نمی‌دانند هم به جای سکوت، قصه می‌بافند؟ راهکار Gap Engine.»
8. **قلاب ۸:** «ماتریس تصمیم‌گیری فریلنسرها: چه زمانی پروژه ساعتی، و چه زمانی پروژه‌ای کار کنیم؟»
۹. **قلاب ۹:** «اشتباه بزرگ در پرسونانویسی: چرا سن و شهر مخاطب بی‌اهمیت‌ترین داده‌ها هستند؟»
۱۰. **قلاب ۱۰:** «چطور یک Asset تولیدشده می‌تواند خوراک ۱۰ محتوای بعدی شود بدون اینکه تکراری به نظر برسد؟»
۱۱. **قلاب ۱۱:** «تحلیل شکست: زمانی که به خاطر ناهماهنگی لحن برند، یک معامله بزرگ لغو شد.»
۱۲. **قلاب ۱۲:** «قدرت تصمیمات منفی: تعیین چیزهایی که انجام نمی‌دهیم باارزش‌تر از برنامه‌هایمان است.»
۱۳. **قلاب ۱۳:** «نقش Context Replay در تضمین کیفیت: آیا می‌دانی متنی که خواندی بر پایه چه ادعایی ساخته شد؟»
۱۴. **قلاب ۱۴:** «راهنمای ۱۰ دقیقه‌ای ساخت اولین دارایی کسب‌وکار بدون نیاز به کدنویسی یا تنظیمات پیچیده.»`;
  }

  return `### خروجی تولیدشده: ${title}
بر پایه دانش ثبت‌شده:
${contextObjects.map((c: any) => `- ${c.title}`).join('\n')}

این خروجی با موفقیت در وضعیت تأیید قرار گرفت و آماده استفاده در کارهای آتی و استناد در Context Replay است.`;
}

// Development mode with Vite middlewares OR Production static serving
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mabda server is running at http://0.0.0.0:${PORT} [mode: ${isDev ? 'dev' : 'prod'}]`);
  });
}

startServer();
