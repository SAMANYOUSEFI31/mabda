/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before the first space has arrived (patterns.md §5): nothing for 300ms, then a skeleton shaped like a page, never a full-screen spinner.
 * When the server cannot be reached: what happened, what is safe, and «تلاش دوباره»; the technical text only under «جزئیات».
 */

import { useState } from 'react';
import { ErrorState, PageSkeleton } from '../../ui';
import type { AppScope } from '../shared';

export type BootScreenProps = Pick<AppScope, 'boot' | 'currentWorkspaceId' | 'loadError' | 'reload' | 'startup'>;

export function BootScreen({ boot, currentWorkspaceId, loadError, reload, startup }: BootScreenProps) {
  const [retrying, setRetrying] = useState(false);
  const failed = boot.status === 'error' || loadError;
  const retry = async () => { setRetrying(true); try { await (boot.status === 'error' ? startup() : reload(currentWorkspaceId)); } finally { setRetrying(false); } };
  return (
    <div className="min-h-screen bg-surface-page">
      <div className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl">
        {failed ? (
          <ErrorState
            title="منبع باز نشد"
            description="به سرور نرسیدیم. چیزی از نوشته‌هایت پاک نشده است؛ اتصال را بررسی کن و دوباره امتحان کن."
            onRetry={() => void retry()}
            retrying={retrying}
            details={boot.message ?? loadError ?? undefined}
          />
        ) : (
          <PageSkeleton label="در حال آوردن منبع" />
        )}
      </div>
    </div>
  );
}
