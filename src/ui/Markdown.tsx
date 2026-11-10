import { Component, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx.ts';

/** an expected heading and the id it gets (the reading document passes stable ids: a node's or object's, never made from the text) */
export interface HeadingAnchor { id: string; text: string }

interface MarkdownProps { children: string; className?: string; variant?: 'compact' | 'document'; anchors?: HeadingAnchor[] }

/** the Markdown engine (react-markdown + GFM, ~100 kB) is a separate chunk: pages that never show Markdown never download it */
const Impl = lazy(() => import('./MarkdownImpl.tsx').then((m) => ({ default: m.MarkdownImpl })));

/** the text itself, unformatted: what shows while the engine loads (and if it cannot load): never blank, never lost */
function Plain({ children, className, variant = 'compact' }: MarkdownProps) {
  return (
    <div className={cx('flex flex-col', variant === 'document' ? 'gap-stack-md' : 'gap-stack-sm', className)}>
      <p dir="auto" className="body-md whitespace-pre-wrap text-text-default">{children}</p>
    </div>
  );
}

class PlainOnError extends Component<{ props: MarkdownProps; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Plain {...this.props.props} /> : this.props.children; }
}

/**
 * Renders model/asset Markdown (GFM tables, lists, emphasis) with Bushido tokens, RTL-aware (see MarkdownImpl.tsx).
 * Raw HTML in the source is NOT rendered, so model output cannot inject markup.
 */
export function Markdown(props: MarkdownProps) {
  return (
    <PlainOnError props={props}>
      <Suspense fallback={<Plain {...props} />}><Impl {...props} /></Suspense>
    </PlainOnError>
  );
}
