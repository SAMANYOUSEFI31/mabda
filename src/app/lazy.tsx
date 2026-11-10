/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Alert, Button, Spinner } from '../ui';

/**
 * Code splitting (docs/architecture.md → «بار شدن تکه‌تکه»). The home and the source of truth load at once; heavy or rarely used pages
 * and dialogs are separate chunks that load the first time they are needed:
 *  · `lazyNamed`   — React.lazy for a named export, typed as the component itself, with a retry that works after a failed load
 *  · `Deferred`    — a dialog is not even loaded until it is opened for the first time (then it stays mounted, so closing animates as before)
 *  · `PageSuspense`— a page: a calm placeholder of a fixed height (no layout jump) with text for a screen reader
 *  · `ChunkBoundary` — if a chunk cannot load (no network): a clear message and «دوباره», never a blank screen
 */

const failed: Array<() => void> = [];

/** `React.lazy` for `module[name]`; the result is typed exactly like the component. After a failed load `retryChunks()` makes it try again. */
export function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, name: K): M[K] {
  const make = () => lazy(() => load().then((m) => ({ default: m[name] as ComponentType<any> })).catch((e) => { failed.push(() => { current = make(); }); throw e; }));
  let current = make();
  const Lazy = (props: Record<string, unknown>) => { const C = current as ComponentType<Record<string, unknown>>; return <C {...props} />; };
  return Lazy as unknown as M[K];
}

/** forget the failed loads: the next render loads them again */
export function retryChunks(): void { failed.splice(0).forEach((f) => f()); }

class ChunkBoundary extends Component<{ children: ReactNode; compact?: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={this.props.compact ? 'fixed bottom-space-2 start-space-2 end-space-2 z-dialog mx-auto flex max-w-overlay-xs' : 'flex p-inset-lg'}>
        <Alert intent="danger" title="این بخش بار نشد" action={<Button size="sm" variant="secondary" onClick={() => { retryChunks(); this.setState({ failed: false }); }}>دوباره</Button>}>
          اینترنت را بررسی کن و «دوباره» را بزن؛ کار و داده‌هایت سر جایشان هستند.
        </Alert>
      </div>
    );
  }
}

/** shows its children only after `ms` (a chunk that arrives at once never flashes a placeholder) */
const After: React.FC<{ ms: number; children: ReactNode }> = ({ ms, children }) => {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setOn(true), ms); return () => window.clearTimeout(t); }, [ms]);
  return on ? <>{children}</> : null;
};

const Loading: React.FC<{ label: string; minHeight?: number | string }> = ({ label, minHeight }) => (
  <div role="status" aria-live="polite" className="flex items-center justify-center gap-inline-sm p-inset-xl text-text-subtle" style={minHeight ? { minBlockSize: minHeight } : undefined}>
    <Spinner label={label} /><span className="body-sm">{label}</span>
  </div>
);

/** a page that is a separate chunk: the same height from the first frame (no jump), the words «در حال بار شدن…» for everyone */
export const PageSuspense: React.FC<{ children: ReactNode; /** the height the loaded page will take (a number of px or a CSS length): the layout does not jump when it arrives */ minHeight?: number | string }> = ({ children, minHeight = 280 }) => (
  <ChunkBoundary><Suspense fallback={<Loading label="در حال بار شدن…" minHeight={minHeight} />}>{children}</Suspense></ChunkBoundary>
);

/** a dialog that is a separate chunk: not loaded until `when` is true once; after that it stays mounted (its own open / close animation is untouched) */
export const Deferred: React.FC<{ when: boolean; children: ReactNode }> = ({ when, children }) => {
  const [seen, setSeen] = useState(when);
  if (when && !seen) setSeen(true);
  if (!seen) return null;
  return (
    <ChunkBoundary compact>
      <Suspense fallback={<After ms={160}><div className="fixed top-space-0 bottom-space-0 start-space-0 end-space-0 z-dialog flex items-center justify-center"><div className="rounded-container border border-border-default bg-surface-overlay shadow-raised"><Loading label="در حال باز شدن…" /></div></div></After>}>
        {children}
      </Suspense>
    </ChunkBoundary>
  );
};
