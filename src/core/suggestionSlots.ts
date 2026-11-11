/**
 * نقطهٔ اتصال لایهٔ هوش در رابط (فعلاً خاموش).
 *
 * قرارداد مشترک «ثبت سریع»، «وارد کردن سند» و «جست‌وجو»: هر جا که روزی «پیشنهاد جا»، «پیشنهاد نوع»،
 * «شاید تکراری باشد» یا «مرتبط‌های معنایی» لازم شود، از همین‌جا می‌پرسد. تا وقتی هیچ فراهم‌کننده‌ای ثبت
 * نشده (و لایهٔ هوش خاموش است) پاسخ همیشه `null` است و رابط هیچ اثری نشان نمی‌دهد.
 * بعداً دستورپخت‌های whereTo / whatIsThis / findRelated در server/intelligence از راه یک API به اینجا ثبت می‌شوند.
 * پیشنهاد هرگز خودکار اعمال نمی‌شود؛ فقط برچسبی است که کاربر می‌پذیرد یا رد می‌کند.
 */
export type SuggestionSlot = 'place' | 'kind' | 'duplicate' | 'related';

export interface SlotInput {
  /** متن آزاد کاربر؛ هر طولی (فرض نکن کوتاه یا مرتب است) */
  text: string;
  /** بخشی که کاربر همین الان در آن است (اگر باشد) */
  nodeId?: string;
}

export interface SlotSuggestion {
  slot: SuggestionSlot;
  /** شناسهٔ چیز پیشنهادی (بخش، مورد تکراری، مورد مرتبط) */
  targetId?: string;
  /** برچسب فارسی برای نمایش */
  label: string;
  /** امتیاز؛ رابط بر اساس آستانه تصمیم می‌گیرد نه شمار ثابت */
  score?: number;
}

export type SlotProvider = (input: SlotInput) => Promise<SlotSuggestion[]>;

const providers = new Map<SuggestionSlot, SlotProvider>();

/** فقط لایهٔ هوش (وقتی روشن شد) این را صدا می‌زند. */
export function registerSlotProvider(slot: SuggestionSlot, provider: SlotProvider): () => void {
  providers.set(slot, provider);
  return () => { if (providers.get(slot) === provider) providers.delete(slot); };
}

/** null یعنی «هیچ فراهم‌کننده‌ای نیست»: رابط باید چیزی نشان ندهد، نه حالت خالی یا بارگذاری. */
export function getSlotProvider(slot: SuggestionSlot): SlotProvider | null {
  return providers.get(slot) ?? null;
}

export function slotsActive(): boolean {
  return providers.size > 0;
}
