/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { OutlineItem } from '../core/contextMarkdown';
import { Button, IconButton, Menu, Markdown, SegmentedControl, Switch, useToast } from '../ui';

interface DocReaderProps {
  markdown: string;
  /** file name (without extension) used by «دانلود» */
  fileName: string;
  /** shown when there is nothing to read */
  empty?: React.ReactNode;
  /** the headings of `markdown` with stable ids: gives the outline rail (desktop) / menu (phone), scroll-spy and permalinks */
  outline?: OutlineItem[];
  /** above the document: the tabs */
  header?: React.ReactNode;
  /** «با ارجاع‌ها»: the parent rebuilds `markdown` with the reference lines */
  refs?: { checked: boolean; onChange: (on: boolean) => void };
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const indent = (level: number) => (level <= 1 ? '' : level === 2 ? 'ps-inset-md' : level === 3 ? 'ps-inset-xl' : 'ps-inset-2xl');

/** A Markdown document the way people want to read it: typeset by default, raw source one click away, copy and download. With an outline: where you are, and a stable link to every section. */
export const DocReader: React.FC<DocReaderProps> = ({ markdown, fileName, empty, outline, header, refs }) => {
  const toast = useToast();
  const [view, setView] = useState<'read' | 'source'>('read');
  const [active, setActive] = useState<string | undefined>(outline?.[0]?.id);
  const items = useMemo(() => outline ?? [], [outline]);

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

  const goTo = useCallback((id: string, setHash = true) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
    if (setHash) window.history.replaceState(null, '', `#${id}`);
    setActive(id);
    return true;
  }, []);
  const copyLink = async () => {
    if (!active) return;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${active}`;
    try { await navigator.clipboard.writeText(url); toast.show({ intent: 'success', message: 'پیوند این بخش کپی شد.' }); }
    catch { toast.show({ intent: 'danger', message: 'کپی انجام نشد.' }); }
  };

  // a new document (another tab): go where the address says, else to the top
  useEffect(() => {
    setActive(items[0]?.id);
    const want = window.location.hash.slice(1);
    if (want && items.some((i) => i.id === want)) { const t = setTimeout(() => goTo(want, false), 30); return () => clearTimeout(t); }
    return undefined;
  }, [items, goTo]);

  // scroll-spy: «where you are» = the last heading that has passed the reading line (a third of the way down the screen);
  // at the very end of the page it is the last heading, even if that one never reaches the line
  useEffect(() => {
    if (view !== 'read' || items.length === 0) return undefined;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * 0.33;
      let cur = items[0].id;
      for (const i of items) {
        const el = document.getElementById(i.id);
        if (el && el.getBoundingClientRect().top <= line) cur = i.id;
      }
      const el = document.scrollingElement ?? document.documentElement;
      if (el.scrollTop + window.innerHeight >= el.scrollHeight - 2 && el.scrollTop > 0) cur = items[items.length - 1].id;
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    measure();
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [items, view, markdown]);

  const activeItem = items.find((i) => i.id === active);
  const withOutline = items.length > 0 && view === 'read';

  const doc = markdown.trim().length === 0 ? (empty ?? null) : view === 'read' ? (
    <article className="w-full min-w-space-0 rounded-container border border-border-default bg-surface-raised p-inset-lg lg:p-inset-xl" aria-label="سند">
      <Markdown variant="document" anchors={items.map(({ id, text }) => ({ id, text }))}>{markdown}</Markdown>
    </article>
  ) : (
    <pre dir="ltr" className="code overflow-auto whitespace-pre-wrap rounded-control border border-border-default bg-surface-sunken p-inset-lg text-start">{markdown}</pre>
  );

  return (
    <div className={`mx-auto flex w-full flex-col gap-stack-md ${items.length ? 'max-w-wide' : 'max-w-prose'}`}>
      {header}
      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <SegmentedControl
          label="شیوهٔ نمایش سند"
          value={view}
          onChange={(id) => setView(id as 'read' | 'source')}
          items={[{ id: 'read', label: 'خوانا', icon: 'BookOpen' }, { id: 'source', label: 'Markdown', icon: 'FileText' }]}
        />
        <div className="flex flex-wrap items-center gap-inline-xs">
          {refs && <Switch label="با ارجاع‌ها" checked={refs.checked} onChange={(e) => refs.onChange(e.target.checked)} />}
          <Menu
            label="بیشتر دربارهٔ سند"
            align="end"
            trigger={<IconButton icon="Ellipsis" label="بیشتر دربارهٔ سند" size="sm" />}
            items={[
              { label: 'کپی متن (Markdown)', icon: 'Copy', onSelect: () => { void copy(); } },
              { label: 'دانلود .md', icon: 'Download', onSelect: download },
              ...(withOutline ? [{ label: 'پیوند این بخش', icon: 'Link2' as const, disabled: !active, onSelect: () => { void copyLink(); } }] : []),
            ]}
          />
        </div>
      </div>
      {withOutline && (
        <div className="doc-bar flex items-center gap-inline-sm lg:hidden">
          <Menu
            label="فهرست سند"
            align="start"
            trigger={<Button size="sm" variant="secondary" iconStart="ListChecks">فهرست</Button>}
            items={items.map((i) => ({ label: `${i.level > 1 ? '— '.repeat(i.level - 1) : ''}${i.text}`, onSelect: () => { setTimeout(() => goTo(i.id), 60); } }))}
          />
          {activeItem && <p className="body-sm min-w-space-0 flex-1 truncate text-text-subtle" aria-live="polite">اکنون: {activeItem.text}</p>}
        </div>
      )}
      {withOutline && markdown.trim().length > 0 ? (
        <div className="flex flex-col gap-stack-md lg:flex-row lg:items-start lg:gap-inline-xl">
          <nav className="doc-outline hidden shrink-0 lg:block lg:w-overlay-xs" aria-label="فهرست سند">
            <ul className="flex flex-col gap-stack-xs">
              {items.map((i) => (
                <li key={i.id} className={indent(i.level)}>
                  <a
                    href={`#${i.id}`}
                    aria-current={i.id === active ? 'location' : undefined}
                    onClick={(e) => { e.preventDefault(); goTo(i.id); }}
                    className={`flex min-h-touch items-center rounded-control-sm border-s-2 px-inset-sm ${i.level <= 1 ? 'label-md' : 'body-sm'} ${i.id === active ? 'border-border-bold bg-bg-neutral-subtle font-bold text-text-default' : 'border-transparent text-text-subtle'}`}
                  >{i.text}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-space-0 flex-1">{doc}</div>
        </div>
      ) : doc}
    </div>
  );
};
