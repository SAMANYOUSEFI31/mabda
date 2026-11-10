/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Usage ledger and plan. */

import { PageSuspense, lazyNamed } from '../lazy';
import type { ReadyScope } from '../shared';

/** separate chunks: loaded the first time they are needed (src/app/lazy.tsx) */
const LedgerPanel = lazyNamed(() => import('../../components/workspace/LedgerPanel'), 'LedgerPanel');

export type LedgerPageProps = Pick<ReadyScope, 'currentWorkspace' | 'handleAddCredits' | 'handleChangePlan' | 'ledgerEntries' | 'setIsPlanModalOpen'>;

export function LedgerPage({ currentWorkspace, handleAddCredits, handleChangePlan, ledgerEntries, setIsPlanModalOpen }: LedgerPageProps) {
  return (
        <PageSuspense><LedgerPanel
          currentWorkspace={currentWorkspace}
          ledgerEntries={ledgerEntries}
          onChangePlan={handleChangePlan}
          onAddCredits={handleAddCredits}
          onOpenPlans={() => setIsPlanModalOpen(true)}
        /></PageSuspense>
  );
}
