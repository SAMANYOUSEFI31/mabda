/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Usage: fair-use meters and the ledger of real AI usage (reachable only with managed AI on). */

import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const LedgerPanel = lazyNamed(() => import('../../components/workspace/LedgerPanel'), 'LedgerPanel');

export type LedgerPageProps = Pick<ReadyScope, 'currentWorkspace' | 'ledgerEntries'>;

export function LedgerPage({ currentWorkspace, ledgerEntries }: LedgerPageProps) {
  return (
        <PageSuspense><LedgerPanel
          currentWorkspace={currentWorkspace}
          ledgerEntries={ledgerEntries}
        /></PageSuspense>
  );
}
