# نقشهٔ معماری مفهومی مبدأ

> این سند **هر چیز در مبدأ را جنس‌بندی می‌کند** و می‌گوید در کد کجاست. مبنای دو کار بعدی است: تقسیم فایل‌های بزرگ (`server/db/repo.ts`، `src/App.tsx`) و لایهٔ هوش (اسکلت ساخته شد: §۸ب). **پیش از افزودن هر مفهوم یا ماژول، «آزمون جنس» (پایین همین سند) را بگذران.**
>
> هرجا کد چیز دیگری از پیشنهاد اولیه می‌گوید، **کد و `docs/spine.md` مقدم‌اند** و تفاوت در بخش «تفاوت‌ها با پیشنهاد اولیه» ثبت شده است. این سند رفتار تازه‌ای نمی‌سازد؛ فقط نام می‌دهد و نشانی می‌دهد.

## ۱. چهار پرسش برای هر چیز

برای هر چیز در مبدأ بپرس: **هویت مستقل دارد؟** (می‌شود به آن اشاره کرد و بدون چیز دیگری وجود دارد) · **معنایی است که روی هویتی می‌نشیند؟** · **سازوکاری است که کاری می‌کند؟** · **چیزی است که کاربر می‌بیند یا می‌سازد؟**

| جنس | یعنی | نمونه |
| --- | --- | --- |
| **بنیادی** | هویت مستقل (ردیف و شناسهٔ خودش) | بخش، فکر، دانش |
| **معنا** | ویژگی یا رابطه‌ای که روی بنیادی‌ها می‌نشیند و خودش موجودیت نیست | وضعیت، نوع، رابطهٔ «تکیه دارد» |
| **سازوکار** | قاعدهٔ قطعی که معنا را می‌خواند یا عوض می‌کند | حل دانش مؤثر، پخش اثر، تأیید |
| **قابلیت** | کاری که کاربر می‌کند؛ از چند سازوکار ساخته می‌شود | ثبت، اتصال، «اگر تأیید کنم» |
| **خروجی** | چیزی که از لایه‌های بالا ساخته می‌شود و حقیقت نیست | بسته، خروجی ساخته‌شده |
| **کاربرد** | ترکیب آماده برای یک نیاز؛ چیز بنیادی تازه نمی‌سازد | شروع آماده، قالب، spec |
| **زیرساخت** | فنی و سازگاری؛ کاربر نمی‌بیند | `lineHash`، migration |

## ۲. چیزهای بنیادی (هویت مستقل)

| چیز | چیست | کد | جدول |
| --- | --- | --- | --- |
| **Workspace** | مرز حقیقت؛ هیچ داده‌ای از آن بیرون نمی‌رود | `server/db/repo.ts` (بخش workspaces)، `src/core/limits.ts` | `workspaces` |
| **بخش (Node)** | جایگاه در درخت؛ دامنه و ارث‌بری. ترتیب فقط نمایش است | `src/core/nodeTree.ts`، `nodeMove.ts`، `nodeFocus.ts`؛ repo: tree nodes | `tree_nodes` |
| **ماده (Material)** | ورودی خام: یادداشت، فایل. **پاسخ AI واردشده و متن چسبانده‌شده هویت جدا ندارند** (تفاوت ۲) | `notes`: repo «notes & thoughts»؛ فایل: `server/files/*`، repo «files» | `notes`، `files`، `file_chunks` |
| **فکر (Thought)** | واحد فکرِ حل‌نشده با هویت پایدار؛ ممکن است هرگز دانش نشود | `src/core/thinkingMarkers.ts`، `thoughts.ts`، `thinkingSpace.ts`؛ repo: `syncNoteThoughts`، `reviseThought`، … | `thoughts` |
| **دانش (Context Object)** | Fact / Decision / Constraint («خط قرمز» در رابط) با وضعیت و نسخه | `src/core/contextEngine.ts`، `contextStatus.ts`؛ repo «context objects» | `context_objects`، `context_object_versions` |
| **خروجی (Deliverable)** | چیزی که از Context ساخته شده؛ نسخهٔ Contextهای مصرف‌شده را نگه می‌دارد | `src/core/impactEngine.ts`؛ repo «JSON collections» | `deliverables` |

**Truth موجودیت نیست:** دانش با وضعیت `Confirmed` است (و فرض، با برچسب فرض). **Proposed نوع تازه‌ای نیست:** دانش تأییدنشده است. (`docs/spine.md → قرارداد Thinking`)

## ۳. معناها (روی بنیادی‌ها می‌نشینند)

| معنا | چیست | کد و جا |
| --- | --- | --- |
| **هویت** | شناسهٔ پایدار؛ ویرایش نمایشی همان هویت را نگه می‌دارد، بازنگری معنایی همان شناسه با یک ردّ، بازنگری یادداشت همان فکر را بازنگری می‌کند | `thoughts.id`، `reviseThought`، `syncNoteThoughts` |
| **دسته‌بندی** | نوع فکر (ایده، سؤال، فرض، تصمیم باز)؛ نوع دانش (واقعیت، تصمیم، خط قرمز) | `ThinkingKind`، `ContextType`؛ `thinkingMarkers.ts` |
| **وضعیت و اقتدار** | `Proposed / Confirmed / Needs Review / Superseded / Archived`؛ فقط کاربر تأیید می‌کند؛ فکر: `open / resolved` | `src/core/contextStatus.ts`؛ `thoughts.status`، `context_objects.status` |
| **ساختار و دامنهٔ اثر** | عضویت در بخش (`nodeId`)، ارث‌بری رو به پایین، `reach` (همه‌جا / همین بخش)، `overrides` (کنار گذاشتن) | `src/core/effectiveContext.ts` (`effectiveFor`)؛ `context_relationships.type='overrides'` |
| **رابطه** | «دربارهٔ» (فکر ← دانش یا بخش)؛ «تکیه دارد» (`depends_on`)؛ «جایگزین» (`supersedes`)؛ «اعمال نشود» (`overrides`)؛ «گزینهٔ» یک تصمیم باز | `thought_about`؛ `context_relationships`؛ گزینه‌ها = خطوط `- ` زیر خط تصمیم باز در یادداشت (`src/core/decisionOptions.ts`) |
| **تبار** | «مشتق از» (فکر از فکر)، «تبدیل‌شده به» (فکر ← دانش پیشنهادی)، «ساخته‌شده از» (خروجی ← دانش) | `thought_derivations`؛ `thoughts.resolved_object_id` + `source.thoughtId`؛ `deliverables.usedContext` |
| **منشأ (source)** | شاهد: از کدام یادداشت/فایل/پاسخ/گفتگو، با نقل | ستون JSON `context_objects.source`؛ `src/core/provenance.ts` |
| **تاریخچه** | رکوردهای فقط‌افزودنی: تغییر دانش، رخداد و بازنگری فکر | `context_changes`، `thought_events`، `thought_revisions`؛ `src/core/changeLog.ts` |

## ۴. سازوکارهای قطعی (بدون AI)

| سازوکار | کار | کد |
| --- | --- | --- |
| تاریخچه و تغییر | هر تغییر یک رکورد با قبل/بعد و دلیل (دلیل فقط برای آدم‌ها) | `repo.recordChange`، `changeLog.ts`، `versionHistory.ts` |
| بازنگری | متن/نوع فکر عوض می‌شود، همان شناسه | `repo.reviseThought`، `reclassifyThought` |
| ارتقا (فکر ← پیشنهاد) | فقط `Proposed` می‌سازد، هرگز Truth | `repo.createObject` با `source.thoughtId`، `resolveThought` |
| تأیید | تغییر صریح وضعیت توسط کاربر | `repo.updateObject`، `src/core/contextStatus.ts` |
| حل دانش مؤثر | چه چیزی اینجا حاکم است (ارث‌بری، reach، overrides، انقضا) | `effectiveContext.ts` — **یک پاسخ برای همهٔ مصرف‌کننده‌ها** |
| پخش اثر | تغییر یک دانش ← چه چیزی نیاز به بازبینی می‌گیرد (`needsReview` مشتق، قدیمی‌شدن خروجی) | `decisionGraph.ts`، `impactEngine.ts`، `influence.ts`، `dependencyReduction.ts` |
| ترتیب و گروه تصمیم‌ها | لایه‌ها و «با هم تصمیم بگیرید» (چرخه) | `decisionGraph.ts`، `decisionOrder.ts` |
| بایگانی و حذف | بایگانی (برمی‌گردد)، حذف کوچک (+ «برگرداندن»)، حذف دائمی (فقط از بایگانی؛ از **همهٔ** جدول‌ها از جمله فکرها) | `server/db/removal.ts`، `src/core/removal.ts`، `docs/removal.md` |
| ساخت Context | بسته و درخواست برای AI: دامنه + «چه آمد / چه نیامد» | `contextPack.ts`، `packScope.ts`، `scopeExplain.ts`، `server/db/packs.ts`، `aiContext.ts` |
| نگاشت ورودی | پاسخ بیرونی ← مقصد درست، فقط با نشانهٔ صریح و قاعده | `answerParser.ts`، `answerMapping.ts`، `knowledgeBatch.ts`، `thoughtBatch.ts`، `batchLines.ts` |
| گسترهٔ تضاد و کمبود | Gap، Readiness، تناقض | `contextEngine.ts`، `contradictionCandidates.ts`، `pairBlocking.ts`، `judgePolicy.ts` |
| مقایسه و بازبینی | حقیقت در دو لحظه، «اگر تأیید کنم»، بازبینی هفتگی | `truthCompare.ts`، `weeklyReview.ts`، `changeDigest.ts` |

## ۵. قابلیت‌ها (به اسم کار)

شش خانواده؛ پنج‌تای اول نام کارند، ششمی نگهداری:

| قابلیت | کاربر چه می‌کند | موتورها و صفحه‌ها |
| --- | --- | --- |
| **ثبت** | فکر، یادداشت، دانش، فایل، وارد کردن پاسخ AI و حافظهٔ AI | `ThoughtDialog`، `KnowledgeBatchDialog`، `ImportAnswerDialog`، `MemoryImportDialog`، `FilesPanel`؛ `batchLines.ts`، `answerMapping.ts` |
| **سازمان‌دهی** | بخش‌ها، جابه‌جایی، ورود به بخش، نمای کلی ردیفی | `ContextTreeDocView`، `NodeDialogs`، `nodeTree.ts`، `nodeMove.ts`، `swimlane.ts` |
| **اتصال** | تکیه دارد، دربارهٔ، جایگزین، اعمال نشود؛ «وصل کن» | `ConnectDialog`، `RelationPicker`، `AboutPicker`، `connectRules.ts`، `upstreamLinks.ts` |
| **Context** | بسته و درخواست برای AI، «چه آمد / چه نیامد» | `ContextPackDialog`، `AiRequestDialog`، `ScopeExplain`؛ `contextPack.ts` |
| **فهم و تصمیم** | ببین چه به چه تکیه دارد، اگر عوض کنم چه می‌شود، حقیقت در دو لحظه | `ContextCanvas`، `TruthCompareDialog`، `DecisionOptionsDialog`؛ `lineage.ts`، `truthCompare.ts`، `decisionGraph.ts` |
| **نگهداری و بازبینی** | بایگانی، حذف، بازبینی هفتگی، خبر ارث‌بری | `ArchiveDialog`، `Removal.tsx`، `WeeklyReviewDialog`، `AttentionPanel`؛ `removal.ts`، `weeklyReview.ts`، `inheritNotice.ts` |

> `docs/product-inspiration.md` **پنج محصول** (Loop، Heptabase، Obsidian Canvas، Tana، Notion) را بررسی می‌کند، نه «پنج خانواده». نام‌های بالا از همین نقشه‌اند (تفاوت ۶).

## ۶. خروجی‌ها (Artifact)

| خروجی | ساخته‌شده از | کد |
| --- | --- | --- |
| **بسته (Context Pack)** | دانش مؤثر در دامنه؛ هر بستهٔ ثبت‌شده فقط «کدام چیزها در آن بود» را نگه می‌دارد | `context_packs`، `saved_packs`؛ `contextPack.ts` |
| **خروجی ساخته‌شده** | Context + spec؛ با `usedContext` (نسخه‌ها) برای «قدیمی» شدن | `deliverables`؛ `WorkstreamStudio`، `AssetLibrary`؛ `impactEngine.ts` |

حقیقت نیستند و به‌صورت دانش برنمی‌گردند مگر با «پیشنهاد ← تأیید».

## ۷. جعبه‌ابزار کاربرد

شروع‌های آماده (`starters.ts`، `startTemplate.ts`)، قالب بخش‌ها (`templates.ts`؛ جدول `templates`)، سؤال‌های راهنما (`QuickStartDialog`)، دستورپخت بسته (spec و کتابخانهٔ آن: `specs.ts`، `specLibrary.ts`؛ جدول `specs`)، نمونهٔ قهوه (`seedData.ts`، `demoData.ts`).

**قاعده: یک کاربرد (پروژه، پژوهش، بررسی محصول، …) رابط جدا نمی‌گیرد.** فقط «داده» است: بخش‌ها و دانش‌هایی را که پیش‌تر وجود دارند می‌چیند، سؤال راهنما و دستورپخت بسته می‌دهد، و روی **همان رابط همیشگی** می‌نشیند: خانه، فکر، منبع، خروجی‌ها. بدون حالت و بدون زبانهٔ مخصوص «حالت پروژه».

**چرا:** تصمیم قبلی محصول «کف پایین» است؛ کاربر نباید پیش از شروع بپرسد «در کدام حالت هستم؟». هر حالتِ جدا یعنی یک رابط دیگر برای آموختن و یک مسیر دیگر برای نگه‌داشتن. چیز بنیادی تازه هم نمی‌سازد (آزمون جنس).

**لایهٔ «تجربهٔ ویژه» نداریم:** آنچه پیش‌تر با این نام فکر می‌شد همان کاربرد است و با آن ادغام شد؛ اگر روزی چیزی از آن کم آمد، با «آزمون جنس» در `docs/later.md` می‌آید.

## ۸. محورهای کناری

### الف) زیرساخت فنی و سازگاری
`lineHash` و تجزیه‌گر خطوط قدیمی (`thinkingMarkers.ts`)، migrationها (`server/db/migrations.ts`، فقط رو به جلو)، درگاه ذخیره‌سازی (`server/db/sql/`، پایین‌تر)، تطبیق نرم خط ویرایش‌شده با فکر (`syncNoteThoughts`: شباهت واژه‌ها + لنگر خط)، منبع قدیمی `mcp`/`byok` فقط برای خواندن رکوردهای قدیمی (`docs/spine.md → پس از P5`)، `check:design`، `bannedWords.json`.

### ب) لایهٔ هوش (اسکلت ساخته شده؛ بدون هیچ قابلیت در رابط)
کد: `server/intelligence/`. قراردادش:
- **فقط می‌خواند، و فقط از راه «پیشنهاد ← تأیید» می‌نویسد.** هیچ پیشنهادی حقیقت، رابطه یا ساختار نمی‌سازد؛ بی‌لمس کاربر اعمال نمی‌شود. تنها جاهایی که این لایه می‌نویسد جدول‌های خودش است: `intelligence_embeddings`، `intelligence_suggestions`، `intelligence_reactions` (migration 25).
- **موتورهای قطعی از آن خبر ندارند** (Gap، Readiness، تناقض، اثر، `effectiveFor`، `decisionGraph`)؛ جهت وابستگی فقط از لایهٔ هوش به `src/core` است (مثلاً BM25). بدون کلید (`LIARA_BASE_URL` و `LIARA_API_KEY`) خاموش است و محصول دقیقاً مثل قبل کار می‌کند؛ هیچ مسیر یا رابطی هنوز آن را صدا نمی‌زند.
- AI مولد و گفتگویی فعلاً در محصول نیست (`docs/later.md`)؛ این لایه فقط مدل‌های **غیرمولد** دارد. AI مدیریت‌شده **فریز** است و این لایه به آن وصل نیست (مدل اشتراک و اعتبار حذف شد).

**ترکیب** (هر چهار تنظیم‌محورند: داده، نه کد):

| مفهوم | چیست | کجا |
| --- | --- | --- |
| **متخصص** | مدل یا قاعده‌ای که یک کار می‌کند، پشت یک رابط قابل‌تعویض: `EmbeddingProvider`، `RerankProvider`، `JudgmentProvider`، `TranscriptionProvider` (لیارا: `providers/liara.ts`)؛ «قاعده‌ها» هم متخصص‌اند و مدل ندارند: جست‌وجوی واژه‌ای (`lexical.ts`، BM25 از `src/core/retrieval.ts`) و تکه‌کردن بر اساس ساختار صریح (`chunker.ts`) | `server/intelligence/types.ts`، مدل‌ها در `server/ai/config/models.json → intelligence` با «کلید مستعار» |
| **نقش** | جایی که یک متخصص می‌نشیند: **یابنده** (واژه‌ای و/یا embedding، ترکیب رتبه‌ای)، **مرتب‌کننده** (rerank)، **داور** (قضاوت نوع‌دار با گزینه‌های بسته). یک نقش را می‌شود با متخصص‌های مختلف یا ترکیبشان پر کرد؛ داور می‌تواند «پرونده» (نمونه‌های مرتبط) از متخصص‌های دیگر بگیرد. **داور نهایی همیشه کاربر است.** | بخش‌های هر دستورپخت |
| **دستورپخت** | ترکیب پرتکرار نقش‌ها: «مرتبط‌ها را پیدا کن»، «این چیست؟»، «کجا برود؟»، «صدا را به متن تبدیل کن» | `server/intelligence/config/recipes.json` + اجرا در `recipes.ts` |
| **قابلیت** | آنچه کاربر می‌بیند (پیشنهاد نوع، پیشنهاد جا، «مرتبط‌ها»، …) | **هنوز نیست**؛ از دستورپخت‌ها ساخته می‌شود و از «آزمون جنس» می‌گذرد |

**اصل‌های کار:**
- **عوض کردن مدل یا حذف یک مرحله فقط تغییر تنظیم است** (مثلاً بدون embedding: `finders` فقط `lexical`؛ بدون مرتب‌کننده: `ranker.enabled=false`).
- **کیفیت و درستی اول، ارزانی دوم.** انتخاب مدل و مسیر بر اساس عدد است، نه حدس: `bun run eval:intelligence` روی متن فارسی می‌سنجد و گزارش در `docs/eval/` می‌نویسد (`scripts/eval-intelligence/`).
- **شاخهٔ «اگر این بود، آن کار» فقط روی چیز قابل‌اندازه‌گیری** (طول به توکن در برابر سقف مدل، تیتر و بولت صریح، امتیاز در برابر آستانه). روی شرطی که سنجهٔ قابل‌اعتماد ندارد («وسط متن موضوع عوض شده») شاخه نمی‌سازیم؛ مسیر ثابت می‌گذاریم. متن کوتاه‌تر از سقف همیشه یک تکه است، حتی چندموضوعی؛ فرض نمی‌کنیم کارت‌ها کوتاه یا مرتب‌اند.
- **آستانه بر اساس امتیاز است نه شمار ثابت:** موارد کمتر مرتبط جدا (`tier: weak`) علامت می‌خورند تا رابط بعداً به‌تدریج نشانشان دهد. تا ارزیابی آستانه را نسنجیده، `tiers` در `recipes.json` `null` است و همه «بی‌درجه»اند (به‌جای عدد حدسی).
- **خطا = `IntelligenceError` ساختاریافته** (`disabled`، `input_too_long`، `auth`، `rate_limit`، `timeout`، `provider`، `bad_output`، …). هیچ fallback متنی یا نتیجهٔ ساختگی نیست؛ متن بلندتر از سقف مدل بی‌صدا بریده نمی‌شود.
- **هر فراخوانی لاگ می‌شود** (مدت، توکن یا ثانیه از metadata واقعی، هزینهٔ تخمینی، خطا؛ متن کاربر هرگز).
- **embedding بر اساس شناسه و نسخهٔ متن نگه داشته می‌شود** (کلید: فضا، چیز، تکه، هشِ متن+نسخهٔ تکه‌کننده+مدل). با حذف دائمی ریشه (دانش، فکر، یادداشت، فایل) یا حذف فضا، بردارها و پیشنهادهای آن با trigger پاک می‌شوند.
- **«پیشنهاد» و «واکنش»** (پذیرفت، رد کرد، عوض کرد + آنچه جایش برگزید) در مدل داده جا دارند (`server/intelligence/store.ts`)؛ فقط شناسه، برچسب و امتیاز، نه متن کاربر. برای ارزیابی و بهبود پس از عرضه لازم‌اند.
- جاهای فعلی که به این لایه نزدیک‌اند: `server/ai/*` (فریز)، `server/db/aiContext.ts`، `src/core/judgePolicy.ts`.
- **قابلیت:** دستورپخت فقط یک کلید `capability` دارد (`suggestRelated`، `suggestKind`، `suggestPlace`، `voiceNote`، فهرست در `server/intelligence/config.ts`). پلنی نیست که آن را ببندد: همه همهٔ قابلیت‌ها را دارند.
- ارائه‌دهنده و شکل دقیق درخواست/پاسخ: `docs/intelligence-providers.md`. **پاسخ rerank و decisions در مستندات لیارا نیامده**؛ تجزیه‌گر تحمل‌پذیر است و با کلید واقعی از راه ارزیابی تأیید می‌شود.

## ۹. تفاوت‌ها با پیشنهاد اولیه (کد و spine مقدم)

1. **فکر دو لایه دارد:** `thinkingMarkers.ts` خط‌ها را می‌خواند، ولی هویت فکر در **جدول `thoughts`** است و رابط از آن می‌خواند (`data.thoughts`). خط یادداشت «لنگر» است نه خود فکر. تا پیش از این کار، **فهرست فکر** هنوز از خط‌های یادداشت می‌خواند (به `ThinkingSpace` پروپ `thoughts` داده نمی‌شد، پس شناسهٔ فکر در آن فهرست نبود و فکرِ یادداشتِ حذف‌شده ناپدید می‌شد)؛ حالا از `thoughts` می‌خواند. **هنوز از خط‌ها می‌خوانند:** سینی «تازه‌ها» در بوم فکر (`canvasScene.ts`) و شمارندهٔ هر بخش؛ باید به همین جدول وصل شوند (`docs/later.md`).
2. **«پاسخ واردشده» ماده‌ای با هویت نیست:** فقط یک `source` روی دانش پیشنهادی و (برای بستهٔ خروجی) `context_packs` است. اگر روزی باید دوباره بازبینی شود، باید به‌عنوان Material بنیادی تصمیم‌گیری شود.
3. **«گزینه» جدول ندارد:** خطوط زیر یک تصمیم باز در یادداشت‌اند.
4. **Truth و Proposed جدول یا نوع ندارند:** وضعیت‌اند.
5. **«ارتقا» یک سازوکار است نه موجودیت:** `createObject` + `resolveThought`.
6. **«پنج خانوادهٔ product-inspiration» در آن سند نیست:** آن‌جا پنج محصول‌اند (بالا).
7. **پایش** (جدول‌های `metrics`، `measurements`) سازوکاری روی حقیقت است، نه مفهوم جدا: یک شاخص می‌تواند به «واقعیتی» که پایش می‌کند اشاره کند (`metrics.object_id`، مهاجرت ۳۲) و آهنگ تازه شدن داشته باشد (`cadence`). عدد نسخهٔ حقیقت نیست و خروجی را قدیمی نمی‌کند؛ عدد پیشنهادی تا تأیید واقعیت نیست (`docs/product-scope.md`، `docs/ux/decisions.md` §۴۲).
8. **نمودارِ «لایه‌ها و ستون‌ها» (بوم)** نمایش است، نه جنس: `swimlane.ts`، `lineage.ts` فقط صحنه می‌سازند.

## ۱۰. آزمون جنس (برای ایدهٔ تازه)

به ترتیب بپرس؛ اولین «بله» جنس را می‌دهد.

1. **بدون چیز دیگری وجود دارد و ردیف/شناسهٔ خودش را می‌خواهد؟** ← **بنیادی**. (پیش از ساختن، ثابت کن «معنا» روی یکی از شش بنیادی بالا کافی نیست.)
2. **ویژگی یا رابطه‌ای روی یک بنیادی است؟** ← **معنا** (ستون، یا ردیف رابطه؛ نه جدول موجودیت).
3. **قاعده‌ای قطعی است که معنا را می‌خواند یا عوض می‌کند و برای همهٔ مصرف‌کننده‌ها یکی است؟** ← **سازوکار** (یک تابع خالص در `src/core` با تست).
4. **کاری است که کاربر می‌کند و از چند سازوکار ساخته می‌شود؟** ← **قابلیت**.
5. **چیزی است که از لایه‌های بالا ساخته می‌شود و حقیقت نیست؟** ← **خروجی**.
6. **ترکیب آماده‌ای برای یک نیاز است؟** ← **کاربرد** (داده در `starters/templates/specs`، بدون چیز بنیادی تازه).
7. **فنی و نامرئی برای کاربر است؟** ← **زیرساخت**.
8. **با مدل کار می‌کند؟** ← **لایهٔ هوش**: فقط پیشنهاد، هرگز نوشتن مستقیم.

نمونه‌ها: **پروژه** = کاربرد (یک بخش + دانش‌های آماده). **«پشتیبانی می‌کند»** = رابطه (معنا؛ یک ردیف رابطه یا `depends_on`، نه جدول). **بسته** = خروجی. **`lineHash`** = زیرساخت. **«فکر دربارهٔ قیمت»** = بنیادی (فکر) + معنا («دربارهٔ»). **«اگر تأیید کنم»** = قابلیت از سازوکار مقایسه. **دستیار پیشنهاد نوع** = لایهٔ هوش.

## ۱۱. نقشهٔ پوشه‌ها (اجراشده — «۰ب»: تقسیم بدون تغییر رفتار)

هیچ رفتار، ظاهر، API یا دادهٔ ذخیره‌شده‌ای عوض نشد؛ فقط جای کد. هر فایل یک «جنس» را حمل می‌کند؛ منطق قطعی در `src/core`، دسترسی به داده در `server/db`، رابط در `src/components`، و هیچ وابستگی از `src/core` به `server` یا `src/components` نیست.

### `server/db/repo/` (قبلاً یک فایل ۱٬۷۰۰ خطی)
`server/db/repo.ts` فقط `export * from './repo/index.ts'` است؛ هیچ import بیرونی عوض نشد.

**روش: ترکیب متدها (mixin)، نه چند کلاس جدا.** کلاس `Repo` (در `index.ts`) فقط `db` و `transaction` دارد؛ هر حوزه یک شیء از متدها با `this: Repo` می‌دهد و `Object.assign(Repo.prototype, …)` آن‌ها را به `Repo` می‌چسباند (`interface Repo extends …` نوع‌ها را کامل می‌کند). **چرا:** (۱) نام و امضای همهٔ ۱۵۷ متد همان ماند؛ ۶۲۸ تست و همهٔ مسیرها بی‌تغییر؛ (۲) متدها بدنهٔ کلمه‌به‌کلمه‌ی خودشان را نگه داشتند (بررسی خودکار تفاوت خط‌ها)؛ (۳) تراکنش‌های چنددامنه‌ای همچنان `this.db.transaction` یک پایگاه‌داده‌اند و نیازی به تزریق وابستگی بین کلاس‌ها نیست؛ کلاس‌های جدا مجبور می‌کردند هر حوزه نمونهٔ حوزهٔ دیگر را بگیرد.

| فایل | محتوا |
| --- | --- |
| `index.ts` | کلاس `Repo` (db، transaction) و ترکیب حوزه‌ها |
| `shared.ts` | Scope، RepoError، newId، now، ChangeMeta، تبدیل ردیف→نوع و کمکی‌های مشترک |
| `workspaces.ts` | Workspace، سقف‌های منصفانه، پرچم نمونه |
| `nodes.ts` | درخت بخش‌ها: ساخت، نام، جابه‌جایی، حذف با انتقال |
| `objects.ts` | دانش: نسخه‌ها، پیش‌نویس، نمونه، جایگزینی، پیامد هر نوشتن |
| `changes.ts` | Change log فقط‌افزودنی |
| `relations.ts` | depends_on، overrides و رابطه‌های دیگر |
| `notes.ts` | یادداشت (ماده) و همگام‌سازی با فکر |
| `thoughts.ts` | فکر: هویت پایدار، بازنگری، دربارهٔ، مشتق‌سازی، ارتقا |
| `canvas.ts` | جای اعلام‌شدهٔ آیتم‌های بوم و رتبهٔ تخته |
| `deliverables.ts` / `ledger.ts` / `sessions.ts` / `specs.ts` | خروجی‌ها، دفتر مصرف، گفتگوهای ذخیره‌شده، specها |
| `files.ts` | فایل‌ها، تکه‌ها، سهمیهٔ ماهانه |
| `judgments.ts` | قضاوت لایهٔ تصمیم و تناقض معنایی |
| `packs.ts` | بستهٔ Context ثبت‌شده و بستهٔ ذخیره‌شده |
| `templates.ts` | قالب‌های خود کاربر |
| `metrics.ts` | پایش: شاخص (با `object_id`، `cadence`) و عددها |
| `usage.ts` / `state.ts` | شمارنده‌ها؛ وضعیت کل فضا، نشان بازبینی هفتگی و واردسازی قدیمی |

**تراکنش‌های چنددامنه‌ای** (هنوز یک تراکنش؛ ببین هر کدام به چه چیزی دست می‌زند):

| متد (فایل) | حوزه‌هایی که با هم می‌نویسد |
| --- | --- |
| `deleteNode` (nodes) | بخش + دانش + یادداشت + فکر + فایل + Change |
| `nodesFromNote` (nodes) | بخش + یادداشت + Change |
| `importNote`، `createNote`، `updateNote` (notes) | یادداشت + فکرهای همگام‌شده |
| `restoreNote` (notes) | یادداشت + فکر + بوم |
| `deleteNote` (notes) | یادداشت + پاک‌کردن اختیاری فکرها |
| `createObject` (objects) | دانش + فکرِ ارتقاداده‌شده (حل‌شدن) + Change |
| `updateObject`، `supersedeObject`، `supersedeBy` (objects) | دانش + رابطه‌های منتقل‌شده + Change |
| `setDependencies`، `setOverride`، `removeOverride` (relations) | رابطه + Change |
| `setRank` (canvas) | بوم + Change |
| `createMetric` … `removeMeasurement` (metrics) | پایش + Change (یک پایش زنده برای هر حقیقت) |
| `saveWorkspace`، `resetWorkspaceData` (workspaces) | Workspace + بخش‌های شروع |

### `server/db/routes/` (قبلاً یک فایل ۸۹۰ خطی)
`routes.ts` (۷۲ خط) فقط `makeRouteContext(deps)` را می‌سازد و `registerXRoutes(ctx)` هر حوزه را **به همان ترتیب قبلی** روی **یک** Router ثبت می‌کند (Express به ترتیب تطبیق می‌دهد، پس ترتیب بخشی از قرارداد است). `routes.manifest.test.ts` فهرست (متد، مسیر، middleware، ترتیب) ۱۱۰ مسیر + middleware خطا را با `routes.manifest.json` مقایسه می‌کند؛ پیش از تقسیم از کد اصلی ثبت شد و پس از آن عوض نشد.

`context.ts` (کمکی‌های مشترک: `stale`، `today`، …) · `bootstrap.ts` · `demo.ts` · `nodes.ts` · `archive.ts` · `account.ts` · `objects.ts` · `canvas.ts` (بوم و رابطه‌ها) · `notes-thoughts.ts` · `metrics.ts` · `outputs.ts` (Asset، دفتر، گفتگو، spec) · `judgments.ts` · `memory.ts` · `threads.ts` · `contradictions.ts` · `starters.ts` · `saved-packs.ts` · `packs.ts` · `usage.ts` · `files.ts`.

### `server/auth/`، پشتیبان و گزارش خطا (آزمون ۱۰ نفره، آذر ۱۴۰۵)
- `server/auth/http.ts`: حالت «local» (یک نفر، بدون ورود) یا «invite» (`MABDA_OWNER_CODE`)؛ ورود با لینک شخصی (`/#join=<کد>` ← کوکی HttpOnly)، سرآیندهای امنیتی، بررسی Origin، محدودیت تلاش. `userIdOf(req)` **تنها منبع** شناسهٔ کاربر در همهٔ لایه‌ها (داده، فایل، AI؛ Context هوش مصنوعی هم با `sourceFor(userId)` برای همان نفر خوانده می‌شود، نه یک کاربر ثابت). رضایت آگاهانهٔ هر نفر روی خود حساب (`accounts.consented_at`، `POST /api/consent`). `MABDA_PROXY_HOPS`: شمار proxyهای جلوی سرور، تا محدودیت تلاش برای هر نفر جدا بماند. `accounts.ts`: حساب‌ها و نشست‌ها (فقط SHA-256). `owner.ts`: «افراد آزمون» (`/api/owner`).
- هر دستور SQL روی دادهٔ کاربر شرط `user_id` دارد (`server/db/userScope.test.ts` به‌طور ایستا اجبار می‌کند). `claimId` (`repo/shared.ts`) نمی‌گذارد upsert ردیف کس دیگری را بگیرد. `server/db/userIds.ts`: شناسه‌های نمونه و بذر برای هر نفر یکتا.
- `server/backup.ts`: پشتیبان روزانهٔ کل پایگاه (۱۴ روز) و برگرداندن با `MABDA_RESTORE_FROM`. `server/db/workspaceBackup.ts`: پشتیبان یک فضا، **از روی schema** (هر جدول با `workspace_id` و `user_id`)، برگرداندن همیشه به فضای تازه با شناسه‌های تازه.
- **درگاه ذخیره‌سازی (`server/db/sql/`، الگوی Adapter، ۱۴۰۵/۰۸/۲۶).** جنس: زیرساخت. هدف: میزبانی (Render، میزبان ایرانی، سرور شخصی) یک تنظیم باشد نه تغییر کد. `types.ts` رابط `SqlDatabase` است (prepare/exec/transaction به‌علاوهٔ آنچه بین موتورها فرق دارد: `tables`، `columns`، `parents`، `flushErased`، `backupTo`)؛ `sqlite.ts` و `postgres.ts` دو پیاده‌سازی‌اند و هیچ کد دیگری `if (sqlite)` ندارد. انتخاب فقط در `server/db/database.ts` (`DATABASE_URL`). Postgres هم‌زمان می‌ماند چون همهٔ لایهٔ داده هم‌زمان نوشته شده: یک worker اتصال `pg` را دارد و رشتهٔ اصلی منتظر پاسخ می‌ماند (`Atomics.wait`)؛ پس **پایگاه باید در همان مرکز داده باشد**. schema در Postgres دستی نوشته نمی‌شود: از SQLite تازه در همان نسخه ترجمه می‌شود (`pgSchema.ts`)، پس دو موتور از هم جدا نمی‌افتند. `translate.ts` این‌ها را ترجمه می‌کند: `?`، `INSERT OR IGNORE`، `INSERT OR REPLACE`، و ORDER BY به رفتار SQLite (NULL اول در صعودی، ردیف‌های هم‌زمان به ترتیب نوشتن)؛ متن در Postgres بایت‌به‌بایت مقایسه می‌شود (`COLLATE "C"`، مثل BINARY در SQLite)؛ پاسخ هر درخواست شناسه دارد و پس از timeout اتصال دور ریخته می‌شود تا پاسخ دیررس هرگز به درخواست بعدی نرسد؛ بقیهٔ SQL باید قابل‌حمل باشد (upsert با ستون جدول‌دار: `file_usage.tokens`، نه `tokens`). `dump.ts` نسخهٔ قابل‌حمل همهٔ جدول‌هاست: انتقال SQLite → Postgres، پشتیبان روزانهٔ Postgres و برگرداندن. سنجه: کل تست‌ها روی هر دو موتور (`MABDA_TEST_DATABASE_URL=postgres://… bun run test`)، و `server/db/sql/engines.test.ts` (هم‌شکلی schema، رفت‌وبرگشت داده، تراکنش، انتقال یک‌باره).
- `server/activity.ts` + `src/core/activity.ts` + `src/services/activity.ts`: **ثبت آزمون کاربران** (جنس: زیرساخت؛ کاربر نمی‌بیند، فقط صاحب). رویدادهای خام append-only در `activity_events` (کار و صفحه، بدون متن)؛ شاخص‌ها هر بار از رویدادهای خام حساب می‌شوند؛ خروجی CSV/JSON در `/api/owner/activity/*`. سند: `docs/test-data.md`.
- `server/diagnostics.ts`: خطاهای مرورگر (`src/services/errorReport.ts`) و سرور، بدون متن کاربر. `src/app/shell/RootBoundary.tsx` (هیچ خطایی صفحهٔ سفید نمی‌گذارد) و `SessionGate.tsx` (صفحهٔ ورود). `src/services/deadline.ts`: مهلت و لغو هر درخواست.

### منبع یکتای قاعده‌های هسته (آزمون ۱۰ نفره، بخش «ب»)
| فایل | تنها منبعِ |
| --- | --- |
| `src/core/tehranDate.ts` | روز تهران (UTC+03:30، بی‌ساعت تابستانی)، آغاز و پایان روز، فاصلهٔ روزها، تقویم جلالی؛ `src/ui/jalali.ts` فقط آن را دوباره صادر می‌کند. هیچ کد دیگری `toISOString().slice(0,10)` برای «امروز» نمی‌سازد. تاریخی که فقط روز دارد تا پایان همان روز در تهران معتبر است. |
| `src/core/validity.ts` | «دانش معتبر» (`isValidKnowledge`: فعال و منقضی‌نشده) و `isExpired`؛ Gap، Readiness، تناقض، بسته و «در این لحظه» همه از همین می‌خوانند. |
| `src/core/coGoverning.ts` | «این دو دانش جای مشترکی را می‌گردانند؟» (`governanceOf`): بخش خود و زیربخش‌ها، دامنهٔ سراسری و خط قرمز همه‌جا، استثنا (`overrides`) از زیربخش، بخش‌های هم‌سطح هرگز. تناقض قاعده‌ای و معنایی هر دو از همین می‌گذرند. |
| `src/core/contradictionRules.ts` | قاعده‌های دامنه (مثل «تخفیف نداریم») به‌صورت بستهٔ قابل‌جایگزینی؛ موتور تناقض هیچ واژهٔ دامنه‌ای در خودش ندارد. |

### `src/App.tsx` و `src/app/` (قبلاً `App.tsx` ۲٬۰۰۰ خط، سپس `AppView.tsx` ۸۵۰ خط)
`App.tsx` (۴۳ خط) فقط هوک‌ها را به ترتیب صدا می‌زند (هر هوک خروجی هوک‌های قبلی را می‌گیرد) و `AppView` را می‌دهد. `AppView.tsx` (۳۸ خط) فقط انتخاب می‌کند: پیش از بار شدن فضای کاری «شروع تازه» یا «بوت»؛ پس از آن پوسته و صفحهٔ زبانهٔ فعال. **هر صفحه و هر گروه دیالوگ کنار هوک حوزهٔ خودش است** و فقط props خودش را می‌خواهد (`Pick<ReadyScope, …>`؛ وضعیت سراسری پنهان نیست: `ReadyScope` فقط نوع خروجی هوک‌هاست).

| پوشه | فایل‌ها (هوک = منطق؛ صفحه و دیالوگ = رابط) |
| --- | --- |
| `src/app/` | `AppView.tsx` انتخاب صفحه · `shared.ts` (`AppScope`، `ReadyScope`، `errText`) · `lazy.tsx` بار شدن تکه‌تکه |
| `shell/` | `useAppCore` بوت و state اصلی · `useSearchAndFocus` جست‌وجو و فوکوس · `useUsageCounters` شمارنده‌ها · `useRemovalAndDialogs` حذف، باز/بسته شدن دیالوگ‌ها و `renderCanvas` · `AppShell` قاب (ناوبری، نوار بالا، main) · `AppDialogs` همهٔ دیالوگ‌ها · `ShellDialogs` پالت فرمان · `FirstRunScreen`، `BootScreen` |
| `home/` | `useHome` · `HomePage` · `HomeDialogs` (بازبینی هفتگی) |
| `knowledge/` | `useKnowledge` · `KnowledgePage` (منبع) · `KnowledgeDialogs` |
| `thinking/` | `useNotes`، `useThinkingItems` · `ThinkingPage` · `ThinkingDialogs` |
| `structure/` | `useNodeActions`، `useStarters` · `StructureDialogs` |
| `canvas/` | `useBoards` |
| `files/`، `metrics/` | `useFiles` · `useMetrics` (ذخیره، قطع و ثبت عدد پایش) |
| `workspace/` | `useWorkspaceAssets` · `LedgerPage` · `WorkspaceDialogs` |
| `outputs/` | `WorkstreamsPage`، `AssetsPage` · `OutputsDialogs` |
| `context/` | `ContextDialogs` (بسته، درخواست برای AI، وارد کردن پاسخ، گفتگوی بخش) |

### `src/components/` (قبلاً ۷۵ فایل در یک پوشه)
**انتخاب: `src/components/<حوزه>/`، نه `src/app/<حوزه>/components`.** دلیل: `src/app` «سیم‌کشی» است (هوک، صفحه، دیالوگ‌ها) و `src/components` «رابط» است؛ جزءها از هوک خبر ندارند و فقط props می‌گیرند. با پوشهٔ جدا این مرز دیده می‌شود، و `language.test` و `noFixedNodes.test` هر دو را می‌گردند. حوزه‌ها همان‌های `src/app` هستند. **نام و export هیچ جزئی عوض نشد؛ فقط مسیر.**

| پوشه | جزءها |
| --- | --- |
| `shared/` | `AiNotices`، `BeforeAfter`، `BlockView`، `ClosedSection`، `MentionTextarea`، `Removal` (بیش از یک حوزه استفاده می‌کند) |
| `shell/` | `AppNavigation`، `CommandPalette`، `TopStatusBar` |
| `home/` | `HomeTodo`، `DueItems`، `AttentionPanel`، `WeeklyReviewDialog`، `InheritNoticeList` |
| `knowledge/` | جزئیات، جدول، سند، تاریخچهٔ نسخه، تغییرات، ورود گروهی و حافظه، بایگانی، مقایسهٔ منبع، گزینه‌های تصمیم، خواننده و اثر بخش، صندوق پیشنهاد، تناقض، Coach، موتور Gap، منشأ، تأثیر، انتخابگر رابطه |
| `thinking/` | `ThinkingSpace`، `ThinkingList`، `ThoughtDialog`، `NodeNotes`، `NoteLines`، `AboutPicker` |
| `structure/` | `NodeDialogs`، `QuickStartDialog`، `StarterDialog` |
| `context/` | `ContextPackDialog`، `AiRequestDialog`، `ImportAnswerDialog`، `SavedPacksDialog`، `ScopeExplain`، `NodeThreadPanel`، `SmartChat` |
| `outputs/` | `AssetLibrary`، `WorkstreamStudio`، `SpecEditorModal`، `SpecLibraryDialog`، `ContextReplayCard` |
| `canvas/` | `ContextCanvas` و اجزایش (لبه، بازرس، کارت، نقشهٔ کوچک، لایهٔ نمای کلی، اتصال)، `usePanZoom` |
| `metrics/`، `files/`، `workspace/` | `Monitor` (فیلدها و پنل پایش)، `MetricChart`، `MetricQuickEntry`؛ `FilesPanel`؛ حساب، مصرف و دفتر |

هشدار «import دوگانه»ی `AccountModal` (هم lazy هم static) با جدا کردن ثابت `WIPE_WORDS` در `workspace/wipeWords.ts` رفع شد.

قاعدهٔ تقسیم: هر فایل جدید فقط یک «جنس» را حمل کند؛ منطق قطعی در `src/core`، دسترسی به داده در `server/db`، رابط در `src/components`؛ هیچ وابستگی از `src/core` به `server` یا `src/components` نیست.

### `src/core/` صاف می‌ماند: هر موتور به کجا تعلق دارد
پوشه‌بندی نمی‌شود چون موتورها از هم می‌خوانند و جابه‌جایی‌شان فقط مسیر import را عوض می‌کند، بی‌آن‌که چیزی روشن شود؛ جدول زیر نقشهٔ آن‌هاست.

| حوزه | موتورها | سازوکار |
| --- | --- | --- |
| دانش و حقیقت | `effectiveContext`، `contextStatus`، `contextEngine`، `knowledgeGuess`، `assumptions`، `redlineExamples`، `provenance`، `versionHistory`، `truthCompare`، `textDiff` | حل دانش مؤثر، Gap و Readiness، منشأ، مقایسهٔ منبع |
| رابطه و تصمیم | `decisionGraph`، `decisionOrder`، `decisionOptions`، `impactEngine`، `influence`، `dependencyReduction`، `graphAlgo`، `specGraph`، `upstreamLinks`، `relationPlan`، `connectRules`، `pairBlocking`، `contradictionCandidates` | پخش اثر، ترتیب و گروه تصمیم‌ها، تناقض |
| فکر و یادداشت | `thinkingMarkers`، `thinkingSpace`، `thoughts`، `thoughtAbout`، `thoughtBatch`، `mentions`، `batchLines`، `homeActions` | تجزیهٔ خط، «فکر باز» (`openThoughts`)، ارتقا، نگاشت ورودی |
| بوم | `canvasScene`، `canvasModel`، `canvasFrames`، `canvasHistory`، `canvasLod`، `swimlane`، `lineage`، `mapModel`، `sceneParts`، `edgeRouting`، `jsonCanvas`، `nodeFocus`، `scopeMove`، `nodeMove` | ساخت صحنه (نمایش، نه ذخیره) |
| ساخت Context و ورودی | `contextPack`، `packScope`، `scopeExplain`، `proposalContext`، `retrieval`، `aiRequest`، `answerParser`، `answerMapping`، `knowledgeBatch`، `blocks`، `contextMarkdown`، `tokens` | بسته و درخواست برای AI، نگاشت پاسخ بیرونی |
| ساختار و کاربرد | `nodeTree`، `specs`، `specLibrary`، `starters`، `startTemplate`، `templates`، `quickStartSummary`، `seedData`، `demoData`، `removal`، `globalSearch` | درخت، شروع‌های آماده، حذف و برگرداندن |
| تاریخچه و بازبینی | `changeLog`، `changeDigest`، `weeklyReview`، `inheritNotice` | Change log، بازبینی هفتگی |
| پایش (معنا روی حقیقت) | `metrics`، `metricsText` | عدد یک واقعیت، با تاریخچه و یادآوری آرام |
| سقف منصفانه، سهمیه، هزینه | `limits`، `usage`، `ledger`، `costReport`، `judgePolicy`، `visibleFeatures` | سقف‌ها برای همه یکسان؛ فقط `limits.ts` عددها را دارد؛ پلن و اعتبار نیست |

## بدهی آگاهانه

**همهٔ متدهای دسترسی به داده (۱۵۷ متد) هنوز در یک کلاس `Repo` ترکیب می‌شوند** (فایل‌های `server/db/repo/*.ts` با `Object.assign(Repo.prototype, …)`). مرز حوزه‌ها در کد **اجبار نمی‌شود**: هر حوزه می‌تواند متد حوزهٔ دیگر را صدا بزند (مثلاً `deleteNode` هم به یادداشت و فکر و فایل دست می‌زند؛ فهرست تراکنش‌های چنددامنه‌ای بالاتر آمده).

**چرا الان پذیرفته شد:** (۱) هیچ فراخوانی عوض نشد و تست‌ها (از جمله مقایسهٔ فهرست مسیرها) بدون تغییر ماندند؛ (۲) تراکنش‌ها سالم ماندند: همه روی یک `db`‌اند و به تزریق وابستگی بین حوزه‌ها نیازی نیست؛ (۳) مرز واقعی را هنوز نمی‌دانیم (مثلاً «بوم»، «یادداشت» و «فکر» در عمل به هم گره‌اند) و مرزی که زود اجبار شود زود هم غلط درمی‌آید.

**کی بازبینی شود:** وقتی (الف) **لایهٔ هوش** اضافه شود و بخواهد فقط بخشی از داده را بخواند یا نوشتن را فقط از راه «پیشنهاد ← تأیید» بگذراند، یا (ب) **تیم** اضافه شود و دو نفر هم‌زمان روی دو حوزه کار کنند؛ آن‌وقت هر حوزه یک رابط صریح (نوع) می‌گیرد و فراخوانی بین‌حوزه‌ای از مرز آن می‌گذرد.

### `src/ui/tokens/` (سیستم طراحی Mabda، آبان ۱۴۰۵)
جای بوشیدو و `public/ds` را گرفت. **جنس:** زیرساخت رابط؛ هیچ منطق دامنه‌ای ندارد جز aliasهای `mabda.*` که معنای دامنه را به نقش معنایی وصل می‌کنند.

| فایل | محتوا |
| --- | --- |
| `primitive.json` | پالت خام OKLCH (ink، lapis، verdigris، ochre، brick، petrol)؛ فقط نقش‌های حالت‌دار به آن ارجاع می‌دهند |
| `semantic.json` | نقش‌های مستقل از حالت: فاصله، اندازه، شعاع، تایپ، حرکت، لایه، `knowledge.*`، `mabda.*` |
| `semantic.light.json` / `semantic.dark.json` | نقش‌های رنگ و سایه برای هر حالت؛ کلیدها باید یکی باشند |
| `component.json` | توکن‌های جزء؛ فقط به نقش معنایی ارجاع می‌دهند |
| `build/` | ساختهٔ `scripts/tokens/build.mjs` (`bun run tokens`): `tokens.css`، تم Tailwind `theme.css`، `resolved.json`؛ دستی ویرایش نمی‌شود |

قرارداد با `src/ui/tokens.test.ts` اجبار می‌شود (drift، یکسانی حالت‌ها، ارجاع لایه‌ها، کف کنتراست WCAG 2.2 و APCA). کلاس‌های جزء در `src/ui/components.css`، فونت‌ها در `src/ui/fonts.css` و `public/fonts/`. سند مرجع: `docs/design-system/`.

### بدهی آگاهانهٔ آزمون ۱۰ نفره
- **یک فرایند، SQLite روی یک دیسک.** برای ۱۰ نفر کافی و اندازه‌گیری شده: بزرگ‌ترین سند مجاز (۲٬۰۰۰ بند، حدود ۴۵۶KB) ۲۲۷ms پردازش می‌شود و درخواست نفر دیگر حداکثر ۱۴ms منتظر می‌ماند؛ پنج سند هم‌زمان: ۵۳۱ms، انتظار دیگران حداکثر ۱۳۵ms؛ PDF سیصدصفحه‌ای ۱٫۶s (`scripts/measure-docload.ts`). پس worker و صف (RES-03) لازم نشد. **کی بازبینی:** انتظار دیگران از ۵۰۰ms بگذرد یا افراد از ده‌ها بیشتر شوند.
- **قاعدهٔ SQL قابل‌حمل:** کد تازه همیشه `user_id` دارد و فقط SQL می‌نویسد که روی هر دو موتور درست است (جز سه شکلی که `server/db/sql/translate.ts` ترجمه می‌کند). خواندن schema فقط با `db.tables()` / `db.columns()`، نه `sqlite_master` یا `PRAGMA`. migration تازه باید روی هر دو اجرا شود؛ تست‌ها روی Postgres این را می‌گیرند.
- **سقف فضا در برگرداندن پشتیبان** (`RESTORE_WORKSPACE_CAP` = `LIMITS.workspaces`): نگهبان دیسک است، همان سقف ساختن فضا؛ هیچ چیز داخل فایل به‌عنوان سهمیه خوانده نمی‌شود.
- **CSRF ورود:** کسی می‌تواند مرورگر دیگری را با لینک خودش وارد کند؛ پذیرفته شد چون فقط دادهٔ مهاجم دیده می‌شود و «خروج از این دستگاه» و نام نفر در منو آن را آشکار می‌کند.
