import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { cx } from './cx.ts';
import { Link } from './Button.tsx';

/**
 * Renders model/asset Markdown (GFM tables, lists, emphasis) with Bushido tokens, RTL-aware.
 * Raw HTML in the source is NOT rendered (react-markdown default), so model output cannot inject markup.
 * `dir="auto"` per block keeps Latin-only snippets (codes, URLs) readable inside Persian text.
 */
const components: Components = {
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

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-stack-sm', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>
    </div>
  );
}
