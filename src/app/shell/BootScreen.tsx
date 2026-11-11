/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** While the workspace loads, or when the server cannot be reached: a clear message and «دوباره». */

import { Button, EmptyState, Spinner } from '../../ui';
import type { AppScope } from '../shared';

export type BootScreenProps = Pick<AppScope, 'boot' | 'currentWorkspaceId' | 'loadError' | 'reload' | 'startup'>;

export function BootScreen({ boot, currentWorkspaceId, loadError, reload, startup }: BootScreenProps) {
  const failed = boot.status === 'error' || loadError;
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page p-inset-lg">
      {failed ? (
        <EmptyState
          icon="Lock"
          title="اتصال به سرور برقرار نشد"
          description={boot.message ?? loadError ?? undefined}
          action={<Button variant="primary" onClick={() => (boot.status === 'error' ? void startup() : void reload(currentWorkspaceId))}>دوباره</Button>}
        />
      ) : (
        <div className="flex items-center gap-inline-sm text-text-subtle"><Spinner label="در حال بارگذاری" /><span className="body-md">در حال بارگذاری فضای کاری…</span></div>
      )}
    </div>
  );
}
