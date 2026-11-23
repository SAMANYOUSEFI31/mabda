/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Copies text and says whether it really happened: the Clipboard API first, then the old selection-copy where the API is missing
 * or refused (an http address, an embedded view). «کپی شد» is shown only on `true`; on `false` the caller says it did not copy.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* refused: try the selection copy below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
