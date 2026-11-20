/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { track } from '../../services/usage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OutlineItem } from '../../core/contextMarkdown';
import { Button, IconButton, Menu, Markdown, SegmentedControl, Switch, useToast } from '../../ui';
import { SectionScrubber, useReadingPosition } from './readingPosition';

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
  /** the whole document when this one is a part of it (a tab): copy and download it from the same menu (DATA-03) */
  whole?: { markdown: () => string; fileName: string };
  /** one quiet line above the document (e.g. how many suggestions wait outside it) */
  notice?: React.ReactNode;
}

const sameId = (id: string) => id;
const indent = (level: number) => (level <= 1 ? '' : level === 2 ? 'ps-inset-md' : level === 3 ? 'ps-inset-xl' : 'ps-inset-2xl');

/** A Markdown document the way people want to read it: typeset by default, raw source one click away, copy and download. With an outline: where you are, and a stable link to every section. */
export const DocReader: React.FC<DocReaderProps> = ({ markdown, fileName, empty, outline, header, refs, whole, notice }) => {
  const toast = useToast();
  const [view, setView] = useState<'read' | 'source'>('read');
  const items = useMemo(() => outline ?? [], [outline]);
  const reading = useMemo(() => items.map((i) => ({ id: i.id, label: i.text, level: i.level })), [items]);
  const { active, goTo: reach } = useReadingPosition(reading, sameId, view === 'read');
  // the scrubber's parts are the document's main headings only (§۵۴ ۱۳, the same rule as the structure); «اکنون» still names the
  // exact heading being read
  const top = useMemo(() => Math.min(...reading.map((r) => r.level)), [reading]);
  const parts = useMemo(() => reading.filter((r) => r.level === top), [reading, top]);
  const partOf = (id?: string) => { const at = Math.max(0, reading.findIndex((r) => r.id === id)); return [...reading.slice(0, at + 1)].reverse().find((r) => r.level === top)?.id ?? parts[0]?.id; };
  // a long outline follows the reading: the «اکنون» line is kept inside the outline's own box (scrolling the outline, never the page)
  const outlineRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = outlineRef.current; const a = nav?.querySelector<HTMLElement>('[aria-current=location]');
    if (!nav || !a || nav.scrollHeight <= nav.clientHeight) return;
    const n = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
    if (r.top < n.top) nav.scrollTop -= n.top - r.top + 8; else if (r.bottom > n.bottom) nav.scrollTop += r.bottom - n.bottom + 8;
  }, [active]);

  const copy = async (text = markdown, what = 'متن Markdown') => {
    try { await navigator.clipboard.writeText(text); toast.show({ intent: 'success', message: `${what} کپی شد.` }); }
    catch { toast.show({ intent: 'danger', message: 'کپی انجام نشد؛ مرورگر اجازه نداد.' }); }
  };
  const download = (text = markdown, name = fileName) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.md`; a.click();
    track('action.doc-download');
    URL.revokeObjectURL(url);
  };

  /** the reading position, plus a permalink in the address (DATA-03) */
  const goTo = useCallback((id: string, setHash = true) => {
    if (!reach(id)) return false;
    if (setHash) window.history.replaceState(null, '', `#${id}`);
    return true;
  }, [reach]);
  const copyLink = async () => {
    if (!active) return;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${active}`;
    try { await navigator.clipboard.writeText(url); toast.show({ intent: 'success', message: 'پیوند این بخش کپی شد.' }); }
    catch { toast.show({ intent: 'danger', message: 'کپی انجام نشد.' }); }
  };

  // a new document (another tab): go where the address says, else to the top
  useEffect(() => {
    const want = window.location.hash.slice(1);
    if (want && items.some((i) => i.id === want)) { const t = setTimeout(() => goTo(want, false), 30); return () => clearTimeout(t); }
    return undefined;
  }, [items, goTo]);

  const activeItem = items.find((i) => i.id === active);
  const withOutline = items.length > 0 && view === 'read';

  const doc = markdown.trim().length === 0 ? (empty ?? null) : view === 'read' ? (
    <article id="doc-body" className="w-full min-w-space-0 max-w-reading" aria-label="سند">
      <Markdown variant="document" anchors={items.map(({ id, text }) => ({ id, text }))}>{markdown}</Markdown>
    </article>
  ) : (
    <pre dir="ltr" className="code overflow-auto whitespace-pre-wrap rounded-control border border-border-default bg-surface-sunken p-inset-lg text-start">{markdown}</pre>
  );

  return (
    <div className={`mx-auto flex w-full flex-col gap-stack-md ${items.length ? 'max-w-wide' : 'max-w-reading'}`}>
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
              { label: whole ? 'کپی این بخش (Markdown)' : 'کپی متن (Markdown)', icon: 'Copy', onSelect: () => { void copy(); } },
              { label: whole ? 'دانلود این بخش (.md)' : 'دانلود .md', icon: 'Download', onSelect: () => download() },
              ...(whole ? [
                { label: 'کپی کل سند (Markdown)', icon: 'Copy' as const, onSelect: () => { void copy(whole.markdown(), 'کل سند'); } },
                { label: 'دانلود کل سند (.md)', icon: 'Download' as const, onSelect: () => download(whole.markdown(), whole.fileName) },
              ] : []),
              ...(withOutline ? [{ label: 'پیوند این بخش', icon: 'Link2' as const, disabled: !active, onSelect: () => { void copyLink(); } }] : []),
            ]}
          />
        </div>
      </div>
      {notice}
      {withOutline && (
        <div data-pin="sub" className="doc-bar flex items-center gap-inline-sm lg:hidden">
          <Menu
            label="فهرست سند"
            align="start"
            trigger={<Button size="sm" variant="secondary" iconStart="ListChecks">فهرست</Button>}
            items={items.map((i) => ({ label: `${i.level > 1 ? '— '.repeat(i.level - 1) : ''}${i.text}`, onSelect: () => { setTimeout(() => goTo(i.id), 60); } }))}
          />
          {activeItem && <SectionScrubber items={parts} active={partOf(active)} now={activeItem.text} anchorOf={sameId} endId="doc-body" onGo={(id, o) => { reach(id, o); if (o.focus !== false) window.history.replaceState(null, '', `#${id}`); }} label="جای خواندن در سند" />}
        </div>
      )}
      {withOutline && markdown.trim().length > 0 ? (
        <div className="flex flex-col gap-stack-md lg:flex-row lg:items-start lg:gap-inline-xl">
          <nav ref={outlineRef} className="doc-outline hidden shrink-0 lg:block lg:w-overlay-xs" aria-label="فهرست سند">
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
