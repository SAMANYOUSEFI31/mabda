import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { cx } from './cx.ts';
import { Link } from './Button.tsx';

import type { HeadingAnchor } from './Markdown.tsx';
interface HNode { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HNode[] }
const textOf = (n: HNode): string => (n.type === 'text' ? n.value ?? '' : (n.children ?? []).map(textOf).join(''));

/**
 * rehype plugin: gives the i-th expected heading its id. A heading that is not next in the list (a «##» written inside an object's
 * own text) gets none and does not shift the list, so ids never land on the wrong heading.
 */
function rehypeAnchors(anchors: HeadingAnchor[]) {
  return () => (tree: HNode) => {
    let i = 0;
    const walk = (n: HNode) => {
      if (n.type === 'element' && /^h[1-6]$/.test(n.tagName ?? '') && anchors[i] && textOf(n).trim() === anchors[i].text.trim()) {
        n.properties = { ...(n.properties ?? {}), id: anchors[i].id };
        i++;
      }
      n.children?.forEach(walk);
    };
    walk(tree);
  };
}

/**
 * Renders model/asset Markdown (GFM tables, lists, emphasis) with Bushido tokens, RTL-aware.
 * Raw HTML in the source is NOT rendered (react-markdown default), so model output cannot inject markup.
 * `dir="auto"` per block keeps Latin-only snippets (codes, URLs) readable inside Persian text.
 */
const compact: Components = {
  h1: ({ children }) => <h3 dir="auto" className="heading-sm text-text-default">{children}</h3>,
  h2: ({ children }) => <h3 dir="auto" className="heading-xs text-text-default">{children}</h3>,
  h3: ({ children }) => <h4 dir="auto" className="title text-text-default">{children}</h4>,
  h4: ({ children }) => <h4 dir="auto" className="title text-text-default">{children}</h4>,
  p: ({ children }) => <p dir="auto" className="body-md text-text-default">{children}</p>,
  ul: ({ children }) => <ul dir="auto" className="body-md list-outside list-disc ps-inset-xl text-text-default">{children}</ul>,
  ol: ({ children }) => <ol dir="auto" className="body-md list-outside list-decimal ps-inset-xl text-text-default">{children}</ol>,
  li: ({ children }) => <li className="ps-inset-xs">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-text-default">{children}</strong>,
  em: ({ children }) => <span className="font-semibold">{children}</span>, // no italics in Persian typography
  blockquote: ({ children }) => <blockquote dir="auto" className="border-s-2 border-border-bold ps-inset-lg text-text-subtle">{children}</blockquote>,
  hr: () => <hr className="bsh-divider" />,
  a: ({ href, children }) => <Link href={href} external>{children}</Link>,
  code: ({ children }) => <code dir="ltr" className="code rounded-indicator bg-bg-neutral-subtle px-inset-xs">{children}</code>,
  pre: ({ children }) => <pre dir="ltr" className="code overflow-x-auto rounded-control-sm bg-surface-sunken p-inset-md">{children}</pre>,
  table: ({ children }) => (
    <div className="bsh-table-wrap" role="region" tabIndex={0} aria-label="جدول">
      <table className="bsh-table">{children}</table>
    </div>
  ),
  th: ({ children }) => <th scope="col" className="label-sm">{children}</th>,
  td: ({ children }) => <td className="body-sm">{children}</td>,
};

/** Reading-document typography: real heading hierarchy, roomy rhythm, headings separated like a printed document. */
const document: Components = {
  ...compact,
  h1: ({ children, id }) => <h2 id={id} tabIndex={id ? -1 : undefined} dir="auto" className="doc-anchor heading-lg border-b border-border-default pb-inset-md text-text-default">{children}</h2>,
  h2: ({ children, id }) => <h3 id={id} tabIndex={id ? -1 : undefined} dir="auto" className="doc-anchor heading-md mt-stack-xl border-b border-border-subtle pb-inset-sm text-text-default">{children}</h3>,
  h3: ({ children, id }) => <h4 id={id} tabIndex={id ? -1 : undefined} dir="auto" className="doc-anchor heading-sm mt-stack-lg text-text-default">{children}</h4>,
  h4: ({ children, id }) => <h5 id={id} tabIndex={id ? -1 : undefined} dir="auto" className="doc-anchor heading-xs mt-stack-md text-text-default">{children}</h5>,
  h5: ({ children, id }) => <h5 id={id} tabIndex={id ? -1 : undefined} dir="auto" className="doc-anchor title mt-stack-sm text-text-default">{children}</h5>,
  h6: ({ children, id }) => <h6 id={id} tabIndex={id ? -1 : undefined} dir="auto" className="doc-anchor label-md text-text-subtle">{children}</h6>,
  p: ({ children }) => <p dir="auto" className="body-md text-text-default">{children}</p>,
  // a line written _like this_ is document metadata (type · status · version): quiet, not body text
  em: ({ children }) => <span className="label-sm text-text-subtle">{children}</span>,
  blockquote: ({ children }) => <blockquote dir="auto" className="border-s-2 border-border-bold ps-inset-lg text-text-subtle">{children}</blockquote>,
};

export function MarkdownImpl({ children, className, variant = 'compact', anchors }: { children: string; className?: string; variant?: 'compact' | 'document'; anchors?: HeadingAnchor[] }) {
  return (
    <div className={cx('flex flex-col', variant === 'document' ? 'gap-stack-md' : 'gap-stack-sm', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={anchors?.length ? [rehypeAnchors(anchors)] : []} components={variant === 'document' ? document : compact}>{children}</ReactMarkdown>
    </div>
  );
}
