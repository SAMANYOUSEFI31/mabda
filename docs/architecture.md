# نقشهٔ معماری مفهومی مبدأ

> این سند **هر چیز در مبدأ را جنس‌بندی می‌کند** و می‌گوید در کد کجاست. مبنای دو کار بعدی است: تقسیم فایل‌های بزرگ (`server/db/repo.ts`، `src/App.tsx`) و لایهٔ هوش (مرحله‌های بعد). **پیش از افزودن هر مفهوم یا ماژول، «آزمون جنس» (پایین همین سند) را بگذران.**
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
| **Workspace** | مرز حقیقت؛ هیچ داده‌ای از آن بیرون نمی‌رود | `server/db/repo.ts` (بخش workspaces)، `src/core/entitlements*.ts` | `workspaces` |
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

## ۷. جعبه‌ابزار کاربرد و تجربه‌ها

شروع‌های آماده (`starters.ts`، `startTemplate.ts`)، قالب‌ها (`templates.ts`؛ جدول `templates`)، specها و کتابخانهٔ آن‌ها (`specs.ts`، `specLibrary.ts`؛ جدول `specs`)، نمونهٔ قهوه (`seedData.ts`، `demoData.ts`). **هیچ‌کدام چیز بنیادی تازه نمی‌سازند**؛ فقط بخش، دانش یا spec می‌چینند که پیش‌تر وجود دارند. «پروژه» هم کاربرد است، نه مفهوم (آزمون جنس).

## ۸. محورهای کناری

### الف) زیرساخت فنی و سازگاری
`lineHash` و تجزیه‌گر خطوط قدیمی (`thinkingMarkers.ts`)، migrationها (`server/db/migrations.ts`، فقط رو به جلو)، تطبیق نرم خط ویرایش‌شده با فکر (`syncNoteThoughts`: شباهت واژه‌ها + لنگر خط)، منبع قدیمی `mcp`/`byok` فقط برای خواندن رکوردهای قدیمی (`docs/spine.md → پس از P5`)، `check:design`، `bannedWords.json`.

### ب) لایهٔ هوش (آینده؛ هنوز ساخته نشده)
قراردادش:
- **فقط می‌خواند، و فقط از راه «پیشنهاد ← تأیید» می‌نویسد.** هیچ پیشنهادی حقیقت، رابطه یا ساختار نمی‌سازد؛ بی‌لمس کاربر اعمال نمی‌شود.
- **موتورهای قطعی از آن خبر ندارند** (Gap، Readiness، تناقض، اثر، `effectiveFor`، `decisionGraph`). بدون آن محصول کامل کار می‌کند.
- ترکیب: **متخصص‌ها** (مدل‌ها و قاعده‌ها) × **نقش‌ها** (یابنده، مرتب‌کننده، داور) × **دستورپخت‌ها** × **قابلیت‌ها**؛ همه تنظیم‌محور (داده، نه کد).
- مدل‌های غیرمولد (embedding، rerank، قضاوت نوع‌دار، گفتار به متن) برای کمک پیشنهادی در دست بررسی‌اند؛ AI مولد و گفتگویی فعلاً در محصول نیست (`docs/later.md`). کد `creditEngine` و AI مدیریت‌شده **فریز** است: حذف نشده، گسترش هم نمی‌یابد، تا تصمیم بعدی.
- جاهای فعلی که به این لایه نزدیک‌اند و باید پشت همین قرارداد بروند: `server/ai/*`، `server/db/aiContext.ts`، `src/core/judgePolicy.ts`.

## ۹. تفاوت‌ها با پیشنهاد اولیه (کد و spine مقدم)

1. **فکر دو لایه دارد:** `thinkingMarkers.ts` خط‌ها را می‌خواند، ولی هویت فکر در **جدول `thoughts`** است و رابط از آن می‌خواند (`data.thoughts`). خط یادداشت «لنگر» است نه خود فکر. تا پیش از این کار، **فهرست فکر** هنوز از خط‌های یادداشت می‌خواند (به `ThinkingSpace` پروپ `thoughts` داده نمی‌شد، پس شناسهٔ فکر در آن فهرست نبود و فکرِ یادداشتِ حذف‌شده ناپدید می‌شد)؛ حالا از `thoughts` می‌خواند. **هنوز از خط‌ها می‌خوانند:** سینی «تازه‌ها» در بوم فکر (`canvasScene.ts`) و شمارندهٔ هر بخش؛ باید به همین جدول وصل شوند (`docs/later.md`).
2. **«پاسخ واردشده» ماده‌ای با هویت نیست:** فقط یک `source` روی دانش پیشنهادی و (برای بستهٔ خروجی) `context_packs` است. اگر روزی باید دوباره بازبینی شود، باید به‌عنوان Material بنیادی تصمیم‌گیری شود.
3. **«گزینه» جدول ندارد:** خطوط زیر یک تصمیم باز در یادداشت‌اند.
4. **Truth و Proposed جدول یا نوع ندارند:** وضعیت‌اند.
5. **«ارتقا» یک سازوکار است نه موجودیت:** `createObject` + `resolveThought`.
6. **«پنج خانوادهٔ product-inspiration» در آن سند نیست:** آن‌جا پنج محصول‌اند (بالا).
7. **شاخص‌ها و KPI** (جدول‌های `metrics`، `measurements`) خارج از این نقشه‌اند؛ دانش نیستند و حقیقت نمی‌شوند (`docs/later.md`).
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

## ۱۱. نقشهٔ پوشه‌ها (پیشنهاد برای پرامپت بعد — اجرا نشده)

### `server/db/repo.ts` (۱٬۷۰۰ خط، یک کلاس) ← یک پوشهٔ `server/db/repo/` با یک فایل برای هر حوزه، و `Repo` فقط آن‌ها را ترکیب کند

| بخش فعلی (مارکر) | حوزه | فایل پیشنهادی |
| --- | --- | --- |
| workspaces | Workspace | `workspaces.ts` |
| tree nodes، moveNode | بخش | `nodes.ts` |
| context objects، versions، raw inserts | دانش | `objects.ts` |
| Change log | تاریخچه | `changes.ts` |
| depends_on، overrides، carryDependencies | رابطه | `relations.ts` |
| notes & thoughts | ماده + فکر | `notes.ts`، `thoughts.ts` (جدا: `syncNoteThoughts` بین این دو پل می‌زند) |
| boards (canvas_view_items) | چیدمان | `canvas.ts` |
| JSON collections (deliverables، ledger، sessions، specs) | خروجی و گفتگو | `deliverables.ts`، `ledger.ts`، `sessions.ts`، `specs.ts` |
| files | ماده | `files.ts` |
| judgments، contradictions | قضاوت | `judgments.ts` |
| packs، saved packs | بسته | `packs.ts` (کنار `server/db/packs.ts` فعلی) |
| templates | کاربرد | `templates.ts` |
| metrics | شاخص (خارج دامنه) | `metrics.ts` |
| usage counters، whole-workspace state، legacy import | زیرساخت | `usage.ts`، `state.ts` |

همین‌طور `server/db/routes.ts` (۸۹۰ خط) ← یک router برای هر حوزه.

### `src/App.tsx` (۲٬۰۰۰ خط) ← حوزه‌ها

| بخش فعلی | حوزه | مقصد پیشنهادی |
| --- | --- | --- |
| بوت، فضاهای کاری، پلن، حساب | Workspace | `src/app/workspace/` |
| handleهای دانش (ذخیره، جایگزین، بایگانی، تأیید) | دانش | `src/app/knowledge/` |
| یادداشت و فکر (ساخت، حذف، تبدیل، بازنگری، فضای فکر) | ماده و فکر | `src/app/thinking/` |
| بوم (حرکت، اتصال، کادر) | فهم و تصمیم | `src/app/canvas/` |
| بسته، درخواست AI، وارد کردن پاسخ | Context | `src/app/context/` |
| بخش‌ها (ساخت، جابه‌جایی، حذف) | سازمان‌دهی | `src/app/structure/` |
| خانه، بازبینی هفتگی، خبرها | نگهداری و بازبینی | `src/app/home/` |
| فایل‌ها | ماده | `src/app/files/` |
| ناوبری، فوکوس بخش، history | پوسته | `src/app/shell/` |

قاعدهٔ تقسیم: هر فایل جدید فقط یک «جنس» را حمل کند؛ منطق قطعی در `src/core`، دسترسی به داده در `server/db`، رابط در `src/components`؛ هیچ وابستگی از `src/core` به `server` یا `src/components` نیست.
