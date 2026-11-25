import type { SVGProps } from 'react';
import {
  X, TriangleAlert, OctagonAlert, Info, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  LoaderCircle, Minus, ArrowLeft, ArrowRight, Plus, Flame, Search, Trash2, Bell, CalendarDays, ChartColumn,
  User, Settings, Ellipsis, Copy, Inbox, Pencil, Share2, LogOut,
  // Extra names the Mabda app needs (all from lucide).
  Menu, Building2, MessageSquare, Network, Palette, Tag as TagIcon, Shield,
  CreditCard, TrendingUp, FileText, Target, Send, RefreshCw, Eye, Lock, Layers, Table2,
  History, Wallet, Undo2, Clock, FolderTree, ListChecks, Link2, Archive, CircleDot,
  ZoomIn, ZoomOut, Maximize, Workflow,
  CircleHelp, Globe, StickyNote, Keyboard, Redo2, Minimize2, PanelRight, PanelLeft, Map as MapIcon, Filter, Fullscreen, PictureInPicture2, CornerDownLeft,
  SunMoon, FolderInput, RotateCcw, Compass, Gauge, ChevronsUpDown,
  createLucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from './cx.ts';

/**
 * Icons that move a PART of themselves (motion.md «آیکن و نشان»). Same drawing as lucide (ISC, v0.546), with a class on the one
 * stroke that carries the meaning, so CSS can move or write just that stroke. Nothing here moves unless an ancestor asks for it:
 *  · `mb-ink`  the stroke that is «written in» (pathLength 1): the door of the house, the glass of the bulb, the spine of the book,
 *              the fold of the box when a destination becomes the current one; the tick of a check when something is done.
 *  · `mb-ip`   the arrow of «out / down / up», nudged 1.5px along its own direction while the control is pointed at.
 */
const ink = { className: 'mb-ink', pathLength: '1' } as const;
// «خانه»: the door swings open on its hinge and closes behind you
const InkHouse = createLucideIcon('house', [
  ['path', { d: 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', key: 'r6nss1' }],
  ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', key: '5wwlr5', className: 'mb-door' }],
]);
// «فکر»: the bulb lights: four short rays are drawn out from it and fade (they are not there otherwise)
const ray = { className: 'mb-ray', pathLength: '1' } as const;
const InkLightbulb = createLucideIcon('lightbulb', [
  ['path', { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', key: '1gvzjb' }],
  ['path', { d: 'M9 18h6', key: 'x1upvd' }],
  ['path', { d: 'M10 22h4', key: 'ceow96' }],
  ['path', { d: 'M3.6 8.5H1.6', key: 'mb-ray-1', ...ray }],
  ['path', { d: 'M20.4 8.5h2', key: 'mb-ray-2', ...ray }],
  ['path', { d: 'M5 3.4 3.6 2', key: 'mb-ray-3', ...ray }],
  ['path', { d: 'M19 3.4 20.4 2', key: 'mb-ray-4', ...ray }],
]);
// «حقیقت» is read: when it becomes the current place a page turns, the left leaf lifting over the spine to the right, the way a
// Persian book is read. The leaf (`mb-turn`) is a copy of the left page's outline, invisible except while it turns.
const InkBookOpen = createLucideIcon('book-open', [
  ['path', { d: 'M12 7v14', key: '1akyts' }],
  ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z', key: 'ruj8y' }],
  ['path', { d: 'M12 7a4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3', key: 'mb-leaf', className: 'mb-turn' }],
]);
const InkPackage = createLucideIcon('package', [
  ['path', { d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z', key: '1a0edw' }],
  ['path', { d: 'M12 22V12', key: 'd0xqtd' }],
  ['polyline', { points: '3.29 7 12 12 20.71 7', key: 'ousv84' }],
  // «خروجی‌ها»: the tape is drawn across the lid: packed and ready to go
  ['path', { d: 'm7.5 4.27 9 5.15', key: '1c824w', ...ink }],
]);
const InkCheck = createLucideIcon('check', [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c', ...ink }]]);
const InkCircleCheck = createLucideIcon('circle-check', [
  ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
  ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74', ...ink }],
]);
const OutExternalLink = createLucideIcon('external-link', [
  ['path', { d: 'M15 3h6v6', key: '1q9fwt', className: 'mb-ip mb-ip--out' }],
  ['path', { d: 'M10 14 21 3', key: 'gplh6r', className: 'mb-ip mb-ip--out' }],
  ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', key: 'a6xqqp' }],
]);
// «درخواست برای ابزار دیگر» packs what she knows to take elsewhere: pointed at, the two flaps lift a little, the box opening
const OutPackageOpen = createLucideIcon('package-open', [
  ['path', { d: 'M12 22v-9', key: 'x3hkom' }],
  ['path', { d: 'M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z', key: '2ntwy6', className: 'mb-ip mb-ip--lift-a' }],
  ['path', { d: 'M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13', key: '1pmm1c' }],
  ['path', { d: 'M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z', key: '12ttoo', className: 'mb-ip mb-ip--lift-b' }],
]);
const OutDownload = createLucideIcon('download', [
  ['path', { d: 'M12 15V3', key: 'm9g1x1', className: 'mb-ip mb-ip--down' }],
  ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', key: 'ih7n3h' }],
  ['path', { d: 'm7 10 5 5 5-5', key: 'brsn70', className: 'mb-ip mb-ip--down' }],
]);
const OutUpload = createLucideIcon('upload', [
  ['path', { d: 'M12 3v12', key: '1x0j5s', className: 'mb-ip mb-ip--up' }],
  ['path', { d: 'm17 8-5-5-5 5', key: '7q97r8', className: 'mb-ip mb-ip--up' }],
  ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', key: 'ih7n3h' }],
]);

const ICONS = {
  Check: InkCheck, X, TriangleAlert, OctagonAlert, Info, CircleCheck: InkCircleCheck, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle,
  Minus, ArrowLeft, Plus, Flame, Search, Trash2, Bell, House: InkHouse, CalendarDays, ChartColumn, User, Settings, Ellipsis,
  Copy, Inbox, Pencil, Share2, LogOut, ExternalLink: OutExternalLink,
  ChevronUp, ArrowRight, Menu, Download: OutDownload, Building2, MessageSquare, Lightbulb: InkLightbulb, Network, Palette, TagIcon,
  Shield, BookOpen: InkBookOpen, CreditCard, TrendingUp, FileText, Target, Package: InkPackage, Send, RefreshCw, Eye, Lock,
  Layers, Table2, Upload: OutUpload, History, Wallet, Undo2, Clock, FolderTree, ListChecks, Link2, Archive,
  CircleDot, ZoomIn, ZoomOut, Maximize, Workflow,
  CircleHelp, Globe, StickyNote, Keyboard, Redo2, Minimize2, PanelRight, PanelLeft, Map: MapIcon, Filter, Fullscreen, PictureInPicture2, CornerDownLeft,
  SunMoon, FolderInput, PackageOpen: OutPackageOpen, RotateCcw, Compass, Gauge, ChevronsUpDown,
} as const;

export type IconName = keyof typeof ICONS;
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

/** px values mirror --icon-* tokens (lucide needs a number for the SVG box). */
const SIZE_PX: Record<IconSize, number> = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, '2xl': 32, '3xl': 48 };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> {
  name: IconName;
  size?: IconSize;
  /** write the icon's `mb-ink` stroke in once, as it appears: a check that says «done» (motion.md «آیکن و نشان») */
  draw?: boolean;
}

/**
 * true from the render where `on` turns true until it turns false again, but never on the first render: a thing that is already
 * current when the page opens is still; only a change the person caused gets the one-time movement (motion.md «بار اول بی‌حرکت»).
 */
export function useBecame(on: boolean): boolean {
  const first = useRef(true);
  const [became, setBecame] = useState(false);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setBecame(on);
  }, [on]);
  return became && on;
}

/** iconography.md «راست‌به‌چپ»: icons whose drawing says a direction in time or flow turn around in RTL (undo points back = right).
 *  Arrows and chevrons are chosen by meaning at each use (ChevronLeft = «forward» in Persian), so they are not in this list. */
const MIRRORED: ReadonlySet<string> = new Set(['Undo2', 'Redo2', 'Send', 'LogIn', 'LogOut', 'ListIndentIncrease', 'ListIndentDecrease']);

export function Icon({ name, size = 'md', className, draw, ...rest }: IconProps) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={SIZE_PX[size]} strokeWidth={2} aria-hidden="true" data-draw={draw || undefined} className={cx('mb-icon', MIRRORED.has(name) && 'mb-icon--mirror', className)} {...rest} />;
}

/** Status intent -> icon, mirrors the DS (icon + words, never color alone). */
export const STATUS_ICON = {
  info: 'Info',
  success: 'CircleCheck',
  warning: 'TriangleAlert',
  danger: 'OctagonAlert',
} as const satisfies Record<string, IconName>;
