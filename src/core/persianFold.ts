/**
 * One Persian character fold shared by every matcher (title/slot matching, mentions, contradictions, retrieval, search).
 * Goal: the same word typed in any common keyboard/encoding variant compares equal. Check: persianFold.test.ts.
 * Folds: Arabic ي/ك → ی/ک, ۀ/ة → ه, harakat + hamza-above + tatweel out, ZWNJ/RLM/LRM → space,
 * Persian/Arabic-Indic digits → Latin, lower-case. Whitespace is NOT collapsed here (callers that need it do it themselves).
 */
export function persianFold(s: string): string {
  return s
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase();
}
