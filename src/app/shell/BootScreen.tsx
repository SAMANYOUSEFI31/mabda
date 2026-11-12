/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before the first space has arrived (patterns.md §5): nothing for 300ms, then a skeleton shaped like a page, never a full-screen spinner.
 * When the server cannot be reached: what happened, what is safe, and «تلاش دوباره»; the technical text only under «جزئیات».
 */

import { useState } from 'react';
import { ErrorState, PageSkeleton, Skeleton } from '../../ui';
import type { AppScope } from '../shared';

export type BootScreenProps = Pick<AppScope, 'boot' | 'currentWorkspaceId' | 'loadError' | 'reload' | 'startup'>;

export function BootScreen({ boot, currentWorkspaceId, loadError, reload, startup }: BootScreenProps) {
  const [retrying, setRetrying] = useState(false);
  const failed = boot.status === 'error' || loadError;
  const retry = async () => { setRetrying(true); try { await (boot.status === 'error' ? startup() : reload(currentWorkspaceId)); } finally { setRetrying(false); } };
  if (failed) {
    return (
      <div className="min-h-screen bg-surface-page">
        <div className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl">
          <ErrorState
            title="منبع باز نشد"
            description="به سرور نرسیدیم. چیزی از نوشته‌هایت پاک نشده است؛ اتصال را بررسی کن و دوباره امتحان کن."
            onRetry={() => void retry()}
            retrying={retrying}
            details={boot.message ?? loadError ?? undefined}
          />
        </div>
      </div>
    );
  }
  return <ShellSkeleton />;
}

/**
 * The app's own frame while the first space comes, at the same sizes and places as AppShell (sidebar or rail, top bar; on a phone
 * the top bar and the bottom bar), so nothing moves when the space arrives: only the page area fills in.
 */
function ShellSkeleton() {
  const docked = (() => {
    const wide = window.matchMedia('(min-width: 1280px)').matches, roomy = window.matchMedia('(min-width: 1024px)').matches;
    let pref: string | null = null;
    try { pref = localStorage.getItem('mabda.sidebar'); } catch { /* optional */ }
    return roomy && (pref === 'docked' || pref === 'hidden' ? pref === 'docked' : wide);
  })();
  let width: number | null = null;
  try { const v = Number(localStorage.getItem('mabda.sidebar.width')); width = v > 0 ? v : null; } catch { /* optional */ }
  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-text-default md:flex-row pb-space-24 md:pb-space-0" aria-busy="true">
      {docked ? (
        <aside aria-hidden="true" className="sticky top-space-0 hidden h-screen w-sidebar shrink-0 flex-col gap-stack-lg border-e border-border-default bg-surface-sunken p-inset-lg md:flex" style={width ? { inlineSize: `${width}px` } : undefined}>
          <Skeleton width="70%" /><Skeleton variant="rect" width="100%" height="var(--space-10)" /><Skeleton lines={4} />
        </aside>
      ) : (
        <aside aria-hidden="true" className="mb-rail sticky top-space-0 hidden h-screen shrink-0 flex-col items-center gap-stack-md border-e border-border-default bg-surface-sunken py-inset-lg md:flex">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="circle" width="var(--space-8)" height="var(--space-8)" />)}
        </aside>
      )}
      <div className="flex-1 flex flex-col min-w-space-0">
        <div aria-hidden="true" className="sticky top-space-0 flex items-center justify-between gap-inline-lg border-b border-border-default bg-surface-sunken px-inset-lg py-inset-sm md:px-inset-2xl md:py-inset-md">
          <Skeleton width="var(--space-40)" /><Skeleton variant="rect" width="var(--space-24)" height="var(--space-10)" />
        </div>
        <main className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl flex-1">
          <PageSkeleton label="در حال آوردن منبع" />
        </main>
      </div>
      <div aria-hidden="true" className="mb-bottomnav fixed bottom-space-0 start-space-0 end-space-0 h-space-20 md:hidden" />
    </div>
  );
}
