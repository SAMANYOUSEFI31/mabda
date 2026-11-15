/**
 * The one source of «which day is it» for Mabda: the calendar day in Tehran (UTC+3:30, no daylight saving since 1401).
 * Pure code, no UI: every engine, the server and the UI read the day from here, never from `toISOString().slice(0, 10)`
 * (that is the UTC day, which is still «yesterday» in Tehran until 03:30).
 */
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD of `now` in Tehran */
export function tehranDay(now: Date | number | string = new Date()): string {
  return DAY_FMT.format(new Date(now));
}
