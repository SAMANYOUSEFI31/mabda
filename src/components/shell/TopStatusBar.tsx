/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IconName } from '../../ui';

/**
 * The desktop top bar is gone (decisions.md §۲۲): its breadcrumb («مبدأ › فضا › صفحه») repeated the sidebar's space and selected
 * place and the page's own title, so its only real content was «افزودن», which now heads the sidebar. Only the action's shape stays.
 */
export interface PageAction { label: string; icon: IconName; onClick: () => void }
