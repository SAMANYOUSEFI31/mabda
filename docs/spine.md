# ستون فقرات مدل مبدأ

قاعدهٔ حاکم: **هر نوع Relation فقط وقتی مجاز است که یک موتور آن را بخواند.** مفهومی که هیچ موتوری نخواند، ذخیره نمی‌شود.

| مفهوم | تعریف یک‌خطی | چه چیزی نیست | کدام موتور می‌خواند |
| --- | --- | --- | --- |
| **Workspace** | مرز حقیقت: هر کسب‌وکار/مشتری یک Workspace؛ هیچ داده‌ای از مرز رد نمی‌شود. | پوشه یا پروژهٔ نمایشی نیست؛ پلن و سقف‌ها به آن بسته‌اند. | همهٔ موتورها (scope = userId + workspaceId) |
| **Node** | دامنهٔ معنا در درخت (کسب‌وکار، مخاطب، پیشنهاد…)؛ زیرگره‌ها حقیقت را به ارث می‌برند. | دسته‌بندی سلیقه‌ای نیست؛ گرهٔ سیستمی فقط تغییر نام می‌گیرد. | `nodeTree`، `contextEngine` (ارث‌بری)، `aiContext` |
| **Context Object** | واحد حقیقت؛ فقط `Fact` / `Decision` / `Constraint`. | خروجی، یادداشت یا پاسخ مدل نیست. | Gap، Readiness، تناقض، `contextPack`، `impactEngine` |
| **Status** | وضعیت اعتبار: Confirmed، Proposed، Needs Review (علامت دستی کاربر)، Superseded، Archived. فقط Confirmed «واقعیت» است. | منشأ را نمی‌گوید. «نیاز به بازبینی» به‌خاطر وابستگی، وضعیت نیست؛ مشتق است (Staleness). | `contextEngine`، `context.ts` (Proposed هرگز واقعیت به مدل داده نمی‌شود) |
| **Provenance** | منشأ ثبت: Onboarding، User Input، AI Suggested، Imported، Asset Derived. | اعتبار نمی‌دهد؛ AI Suggested بدون تأیید واقعیت نیست. | صندوق پیشنهادها، `changeFeed` |
| **Relation** | یال بین Objectها در سه خانواده (زیر). | برچسب تزئینی نیست. | زیر هر خانواده |
| ↳ ساختاری `belongs_to` | Object به Node تعلق دارد (`nodeId`، نه ردیف جدا). | — | `contextEngine`، `aiContext` |
| ↳ وابستگی `depends_on` | این تصمیم روی آن تصمیم سوار است. | وابستگی داده‌ای/زمانی بین خروجی‌ها نیست (آن در Spec است). | `decisionGraph` (ترتیب، همزمانی، نیاز به بازبینی)، `impactEngine` |
| ↳ تبار `derived_from` / `supersedes` | `supersedes`: نسخهٔ تازه جای قدیمی. `derived_from`: Asset از Objectهای با نسخهٔ دقیق (`usedContext`). | `derived_from` ردیف جدول نیست؛ همان `usedContext` است. | `impactEngine`، `contradictionCandidates` |
| **Source** | شاهد: آنچه Object از آن آمد (کدام AI/فایل/یادداشت، چه وقت، نقل دقیق). | دلیل تغییر نیست. | صندوق پیشنهادها، `memory import` |
| **Note** | فکر خام روی یک Node؛ هرگز به مدل نمی‌رود. | Context نیست؛ فقط با «استخراج» Proposed می‌سازد. | هیچ موتور حقیقتی؛ فقط استخراج |
| **Slot** | جایگاه نام‌دار که Spec می‌خواهد (`slotKey`)؛ Object آن را پر می‌کند. | عنوان نیست؛ عنوان فقط برای دادهٔ قدیمی. | `contextEngine.fillsItem` |
| **Gap / Readiness / تناقض** | مشتق از Objectها و Spec؛ هر بار محاسبه می‌شوند. | ذخیره نمی‌شوند (جز حکم مدل برای جفت تناقض به‌عنوان کش). | `contextEngine`، `contradictionCandidates` |
| **Workstream** | جریان کار: هدف + خروجی‌های وابسته. **Spec فقط تعریف داخلی** آن است. | داده یا حقیقت نیست. | `specGraph`، pipeline |
| **Asset** | خروجی ساخته‌شده (Markdown) با Lineage. | از نوع Context نیست (`ContextType` فقط Fact/Decision/Constraint)؛ «پیشنهاد دانش از این خروجی» از مسیر استخراج Proposed با نقل منبع می‌سازد و کاربر تأیید می‌کند. | `impactEngine` |
| **Lineage** | فهرست دقیق `{id, version}` Objectهای تزریق‌شده هنگام ساخت Asset. | — | `impactEngine` |
| **Impact** | اثر یک تغییر: کدام Assetها (و وابسته‌ها) از Objectِ عوض‌شده ساخته شده‌اند. | — | `impactEngine` |
| **Staleness** | «قدیمی» (دارایی) و «نیاز به بازبینی» (تصمیم وابسته): **مشتق**، نه ذخیره‌شده. «بدون تغییر بپذیر» فقط یک Change از نوع `review_accepted` می‌نویسد. | — | `impactEngine` (دلیل `dependency_changed`)، `decisionGraph.needsReview` |
| **Change** | رکورد افزوده‌شونده در همان تراکنش هر تغییر: object، نسخه از/به، kind، actor (+برچسب)، reason، فقط فیلدهای تغییرکرده (`context_changes`). | متن Object نیست؛ `reason` هرگز به مدل تزریق نمی‌شود (MCP هم فقط `hasReason` می‌دهد). | `decisionGraph.needsReview`، `impactEngine`، MCP `get_changes` |
| **AI** | اجرا، نه اعتبار: پیشنهاد می‌دهد، قضاوت بسته می‌کند؛ تأیید همیشه با کاربر. | منبع حقیقت نیست. | router، pipeline، decision layer |
