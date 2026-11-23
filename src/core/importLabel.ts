/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The name of «وارد کردن سند» in the menus. Reading another tool's memory needs Mabda's own AI (frozen behind MABDA_MANAGED_AI,
 * DocumentImportDialog hides that way in while it is off), so a menu promises «یا حافظه» only when it is really there.
 */
export const importLabel = (managedEnabled: boolean): string => (managedEnabled ? 'وارد کردن سند یا حافظه' : 'وارد کردن سند');
