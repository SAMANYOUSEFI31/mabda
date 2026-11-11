# مستند ارائه‌دهندهٔ لیارا برای لایهٔ هوش (Embedding، Rerank، قضاوت، گفتار به متن)

تاریخ بازدید مستندات: ۲۰۲۶-۱۱-۱۱ (میلادی).

## روش و محدودیت خواندن (مهم)

- منبع: صفحه‌های `docs.liara.ir/ai/*` و `liara.ir/products/ai/` و مخزن عمومی `liara-cloud/ai-stt-examples` (شاخهٔ `nodejs`).
- ابزار خواندن (WebFetch) متن صفحه را **خلاصه** می‌کند و کد را حرف‌به‌حرف برنمی‌گرداند. پس نمونه‌های JSON پایین «بازسازی از ساختار صفحه» هستند، نه کپی بایت‌به‌بایت. آنچه در متن خلاصه مستقیم ذکر شده با «(صفحه)» و آنچه استنباط است با «(استنباط)» علامت خورده.
- **صفحه‌هایی که خوانده شد**: about، jev، cohere، voyageai، hugging-face، nvidia، microsoft، google-gemini، qwen (در تلاش دوم)، `ai-sdk-core/embeddings`، `references/about`، `connect-to-service/about`، `faq`، `liara.ir/products/ai/` (فقط زیرمجموعهٔ نماینده از حدود ۱۷۵ مدل)، `.env.example` مخزن STT.
- **خوانده نشد / ناقص**: متن کامل `index.js` مخزن STT (فقط خلاصه)؛ صفحهٔ ارجاع OpenAPI وجود ندارد/پیدا نشد؛ هیچ صفحه‌ای قالب پاسخ rerank و decisions و خطاها و rate limit را مستند نکرده.
- نتیجه: **قالب پاسخ rerank، decisions، embeddings خام HTTP و خطاها با کلید واقعی باید تأیید شود** (بخش آخر).

## BASE_URL و احراز هویت (مشترک)

- شکل BASE_URL از `.env.example` مخزن رسمی STT (صفحه): `BASE_URL=https://ai.liara.ir/api/<id>/v1` — یعنی **شناسهٔ سرویس در مسیر هست و به `/v1` ختم می‌شود**. `<id>` پس از ساخت «سرویس AI» در کنسول به‌دست می‌آید. صفحه‌های مستندات فقط جای‌نگهدار `<baseUrl>` می‌گذارند.
- هدر: `Authorization: Bearer ${LIARA_API_KEY}` (صفحهٔ cohere/voyageai/qwen) و `Content-Type: application/json` (برای JSON).
- همهٔ مدل‌ها «سازگار با OpenAI SDK» هستند (صفحهٔ hugging-face). با SDK رسمی OpenAI و `baseURL: BASE_URL` کار می‌کند.
- مسیرها نسبت به BASE_URL هستند: `/embeddings`، `/rerank`، `/decisions`، `/audio/transcriptions`.
- Rate limit، کد وضعیت و قالب خطا در هیچ‌یک از صفحه‌ها ذکر نشده است.

## ۱. Embedding

- مسیر: `POST {BASE_URL}/embeddings` (استنباط از سازگاری OpenAI؛ صفحهٔ AI SDK فقط `embed`/`embedMany` را نشان می‌دهد و مسیر HTTP را نمی‌گوید).
- مدل‌های فهرست‌شده: `intfloat/multilingual-e5-large` (صفحهٔ hugging-face)، `google/gemini-embedding-001` و `google/gemini-embedding-2` (صفحهٔ google-gemini)، `openai/text-embedding-3-small` (مثال صفحهٔ embeddings)، و از صفحهٔ محصول `openai/text-embedding-3-large`.
- درخواست (قالب استاندارد OpenAI، استنباط):

```json
{ "model": "intfloat/multilingual-e5-large", "input": ["query: متن", "passage: متن"] }
```

- پاسخ (طبق SDK مستند): `embed` → `{ embedding: number[], usage }`؛ `embedMany` → `{ embeddings: number[][], usage }` و «به همان ترتیب ورودی». شکل خام HTTP (استنباط OpenAI): `{ "object":"list", "data":[{"object":"embedding","index":0,"embedding":[...]}], "model":"...", "usage":{"prompt_tokens":N,"total_tokens":N} }`.
- صورت‌حساب: به‌ازای توکن (USD برای هر ۱ میلیون توکن ورودی، صفحهٔ محصول):

| مدل | قیمت |
|---|---|
| `intfloat/multilingual-e5-large` | $0.01 |
| `openai/text-embedding-3-small` | $0.02 |
| `openai/text-embedding-3-large` | $0.13 |
| `google/gemini-embedding-2` | $0.2 |

- حقایق مدل: بُعد بردار، حداکثر توکن ورودی، بیشینهٔ اندازهٔ batch، پیشوند `query: `/`passage: ` برای E5 و task type برای Gemini در **هیچ صفحه‌ای نیامده**. (دانش عمومی خارج از مستند لیارا: E5-large بُعد ۱۰۲۴ و سقف ۵۱۲ توکن، پیشوندها لازم‌اند — تأییدنشده در لیارا.)

## ۲. Rerank

- مسیر: `POST {BASE_URL}/rerank` (صفحه). هدرها: `Authorization: Bearer <key>`، `Content-Type: application/json`.
- بدنه (صفحه، فیلدها: model، query، documents آرایهٔ رشته، top_n):

```json
{
  "model": "cohere/rerank-v3.5",
  "query": "And who is God?",
  "documents": [
    "God means love, purity, intimacy, friendship",
    "God is kind",
    "God loves us and we should love him too",
    "AI means Artificial Intelligence"
  ],
  "top_n": 3
}
```

- پاسخ: **مستند نشده** (مثال‌ها فقط پاسخ خام را چاپ می‌کنند). قالب Cohere/Voyage معمولاً `results:[{index, relevance_score}]` است — تأییدنشده.
- مدل‌ها: Cohere: `cohere/rerank-v3.5`، `cohere/rerank-4-fast`، `cohere/rerank-4-pro`. Voyage: `voyageai/rerank-2.5`، `voyageai/rerank-2.5-lite`.
- قیمت (صفحهٔ محصول، USD): `cohere/rerank-v3.5` = $0.001 به‌ازای هر «search request»؛ `voyageai/rerank-2.5` = $0.05 به‌ازای هر request (واحد دقیق Voyage مشکوک است؛ ببینید «نامعلوم»).
- سقف تعداد سند، اندازهٔ سند، فیلد usage: مستند نشده.

## ۳. قضاوت (Decisions / JEV)

- مسیر: `POST {BASE_URL}/decisions` (صفحه: `openai.post('/decisions', ...)`). مدل‌ها: `typesafe/jev-1.13`، `typesafe/jev-1.14`.
- فیلدهای سطح بالا (صفحه): `model`، `state` (متن/وضعیتی که دربارهٔ آن تصمیم گرفته می‌شود)، `questions` (**شیء** که کلید هر سؤال، نام آن در پاسخ است: «کلید هر سوال، نام آن در پاسخ خواهد بود»).
- هر سؤال: `type` (صفحه فقط `choice` را «انتخاب یک گزینه از چند گزینه» معرفی می‌کند؛ `noul` در مثال هست ولی تعریف نشده؛ `score` در صفحه دیده نشد)، `instructions`، `criteria` (شیء: کلید = پاسخ ممکن، مقدار = توضیح اینکه چه موقع صادق است).
- مثال (بازسازی از صفحه؛ مقادیر دقیق ممکن است اندکی فرق داشته باشد):

```json
{
  "model": "typesafe/jev-1.13",
  "state": "Charged twice this month; I want the extra payment returned.",
  "questions": {
    "refund_requested": {
      "type": "noul",
      "instructions": "Is the customer asking for a refund?",
      "criteria": {
        "true": "The customer is asking for a refund.",
        "false": "The customer is not asking for a refund."
      }
    },
    "category": {
      "type": "choice",
      "instructions": "Which category does this customer request belong to?",
      "criteria": {
        "billing": "Payments, charges, invoices, or refunds.",
        "technical": "Bugs, errors, outages, or technical issues.",
        "sales": "Purchasing, pricing, or product questions."
      }
    }
  }
}
```

- پاسخ: **مستند نشده**. مثال فقط `console.log(result)` می‌کند. معنای `noul`، وجود احتمال/امتیاز/اطمینان، سقف تعداد سؤال، قیمت و usage: نامعلوم.
- نکتهٔ کلاینت: مثال با `client.post('/decisions', { body: {...} })` از OpenAI SDK صدا می‌زند؛ در HTTP خام یعنی `POST {BASE_URL}/decisions` با JSON.

## ۴. گفتار به متن (Transcription)

- مسیر: `POST {BASE_URL}/audio/transcriptions` (مثال .NET صفحه). با SDK: `client.audio.transcriptions.create({ model, file })`.
- بدنه `multipart/form-data` با فیلدهای `model` و `file` (صفحه). فیلد `language` و `response_format` در هیچ مثالی نیست؛ بقیهٔ فیلدهای OpenAI (language، prompt، response_format، temperature) پشتیبانی‌شان تأییدنشده.
- قالب‌های صوتی (صفحه): mp3، wav، flac، m4a، ogg، webm، aac. سقف اندازه/مدت: ذکر نشده.
- پاسخ: JSON با فیلد `text` (صفحه). در خطا مثال .NET کد وضعیت HTTP و بدنهٔ پاسخ را چاپ می‌کند؛ شکل بدنهٔ خطا نامعلوم.
- مدل‌ها: `nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b`، `qwen/qwen3-asr-0.6b` (به‌عنوان تنها مدل گفتار در فهرست صفحهٔ qwen؛ استنباط خود صفحه)، `microsoft/mai-transcribe-1.5`، `microsoft/mai-transcribe-2`، `google/chirp-3` (در فهرست مدل‌های صفحهٔ gemini، بدون برچسب STT)، `openai/whisper-large-v3`، `openai/gpt-transcribe` (صفحهٔ محصول).
- قیمت (صفحهٔ محصول، USD): `openai/whisper-large-v3` = $0.000008 در ثانیه؛ `openai/gpt-transcribe` = $0.000075 در ثانیه؛ `microsoft/mai-transcribe-2` = $0.10 در ساعت. صورت‌حساب بر پایهٔ **ثانیه/ساعت صوت** است نه توکن. قیمت nvidia/qwen/chirp/mai-transcribe-1.5 دیده نشد.

## جدول شناسهٔ مدل‌ها (دقیقاً مطابق لیارا)

| حوزه | شناسه | منبع |
|---|---|---|
| embedding | `intfloat/multilingual-e5-large` | hugging-face + محصول |
| embedding | `google/gemini-embedding-001` | google-gemini |
| embedding | `google/gemini-embedding-2` | google-gemini + محصول |
| embedding | `openai/text-embedding-3-small` | embeddings + محصول |
| embedding | `openai/text-embedding-3-large` | محصول |
| rerank | `cohere/rerank-v3.5` | cohere + محصول |
| rerank | `cohere/rerank-4-fast` | cohere |
| rerank | `cohere/rerank-4-pro` | cohere |
| rerank | `voyageai/rerank-2.5` | voyageai + محصول |
| rerank | `voyageai/rerank-2.5-lite` | voyageai |
| judgment | `typesafe/jev-1.13` | jev |
| judgment | `typesafe/jev-1.14` | jev |
| transcription | `nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b` | nvidia |
| transcription | `qwen/qwen3-asr-0.6b` | qwen |
| transcription | `microsoft/mai-transcribe-1.5` | microsoft |
| transcription | `microsoft/mai-transcribe-2` | microsoft + محصول |
| transcription | `google/chirp-3` | google-gemini (برچسب STT تأییدنشده) |
| transcription | `openai/whisper-large-v3` | محصول |
| transcription | `openai/gpt-transcribe` | محصول |

(مدل‌های TTS مایکروسافت `microsoft/mai-voice-2`، `microsoft/mai-voice-2-flash` خارج از حوزه‌اند.)

## تفاوت با خلاصهٔ پیشین

- BASE_URL شامل شناسهٔ سرویس و `/v1` است: `https://ai.liara.ir/api/<id>/v1` (از مخزن رسمی)؛ صفحه‌ها فقط جای‌نگهدار دارند.
- `/decisions`: `questions` **شیء با کلید نام سؤال** است، نه آرایه. مقدار `criteria` شیء «پاسخ ← توضیح» است. `score` در صفحه نیامده؛ فقط `choice` تعریف و `noul` در مثال آمده است.
- مدل‌های rerank بیشتر از خلاصه‌اند: `cohere/rerank-4-fast`، `cohere/rerank-4-pro`، `voyageai/rerank-2.5-lite`.
- مدل‌های STT بیشتر: `microsoft/mai-transcribe-1.5`، `openai/gpt-transcribe`. `google/chirp-3` در صفحهٔ Gemini به‌صراحت STT معرفی نشده.
- قیمت rerank به‌ازای هر «درخواست» است (نه توکن)؛ STT به‌ازای ثانیه/ساعت؛ embedding به‌ازای توکن.
- قالب پاسخ rerank و decisions اصلاً مستند نیست (خلاصه آن را فرض می‌کرد).

## نامعلوم / تأییدنشده (با کلید واقعی بررسی شود)

1. قالب پاسخ `/rerank` (نام فیلدها، `relevance_score`، usage/billed_units).
2. قالب پاسخ `/decisions`: ساختار هر سؤال، احتمال/اطمینان/امتیاز، معنای `noul`، وجود `score`، سقف تعداد سؤال، usage، قیمت.
3. مسیر دقیق `/embeddings` و پاسخ خام و فیلد usage؛ بُعد برداری، سقف توکن (E5 = ۵۱۲؟)، سقف batch، نیاز به پیشوند `query: `/`passage: `، پارامتر task type در Gemini و `dimensions`.
4. سقف تعداد سند و اندازه در rerank؛ واحد دقیق قیمت Voyage (`$0.05` به‌ازای request یا به‌ازای توکن).
5. STT: `language`، `response_format` (verbose_json/segments/timestamps)، سقف اندازهٔ فایل/مدت، رفتار مدل‌های «streaming»، قیمت nvidia/qwen/chirp/mai-transcribe-1.5.
6. قالب خطا، کدهای وضعیت و rate limit برای همهٔ سرویس‌ها.
7. فهرست کامل مدل‌های صفحهٔ محصول (حدود ۱۷۵) دیده نشد، فقط زیرمجموعهٔ خلاصه‌شده؛ ممکن است مدل مرتبط دیگری باشد. قیمت‌ها USD و تاریخ مشاهده ۲۰۲۶-۱۱-۱۱.
8. نمونه‌ها بازسازی از خلاصهٔ ابزار هستند؛ عین متن صفحه‌ها با مرورگر بازبینی نشد.
