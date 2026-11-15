/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * (Moved to src/core/tehranDate.ts, the one pure source of days and the Jalali calendar; re-exported here for the UI.)
 * The solar (Jalali) calendar for the date field (components.md «تقویم»): conversion, month grid and reading what she types.
 * Pure and deterministic; the conversion is the standard arithmetic of jalaali-js (Borkowski's leap rule), no Intl needed.
 * A date travels as ISO `YYYY-MM-DD` (the value the browser's date input used to give), so callers and the server do not change.
 */

export * from '../core/tehranDate.ts';
