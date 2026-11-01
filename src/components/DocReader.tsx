/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Markdown, SegmentedControl, useToast } from '../ui';

interface DocReaderProps {
  markdown: string;
  /** file name (without extension) used by «دانلود» */
  fileName: string;
  /** shown when there is nothing to read */
  empty?: React.ReactNode;
}

/** A Markdown document the way people want to read it: typeset by default, raw source one click away, copy and download. */
export const DocReader: React.FC<DocReaderProps> = ({ markdown, fileName, empty }) => {
  const toast = useToast();
  const [view, setView] = useState<'read' | 'source'>('read');

  const copy = async () => {
    try { await navigator.clipboard.writeText(markdown); toast.show({ intent: 'success', message: 'متن Markdown کپی شد.' }); }
    catch { toast.show({ intent: 'danger', message: 'کپی انجام نشد؛ مرورگر اجازه نداد.' }); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${fileName}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex w-full max-w-prose flex-col gap-stack-md">
      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <SegmentedControl
          label="شیوهٔ نمایش سند"
          value={view}
          onChange={(id) => setView(id as 'read' | 'source')}
          items={[{ id: 'read', label: 'خوانا', icon: 'BookOpen' }, { id: 'source', label: 'Markdown', icon: 'FileText' }]}
        />
        <div className="flex items-center gap-inline-xs">
          <Button size="sm" variant="ghost" iconStart="Copy" onClick={copy}>کپی</Button>
          <Button size="sm" variant="ghost" iconStart="Download" onClick={download}>دانلود .md</Button>
        </div>
      </div>
      {markdown.trim().length === 0 ? (
        empty ?? null
      ) : view === 'read' ? (
        <article className="w-full rounded-control border border-border-default bg-surface-raised p-inset-xl">
          <Markdown variant="document">{markdown}</Markdown>
        </article>
      ) : (
        <pre dir="ltr" className="code overflow-auto whitespace-pre-wrap rounded-control border border-border-default bg-surface-sunken p-inset-lg text-start">{markdown}</pre>
      )}
    </div>
  );
};
