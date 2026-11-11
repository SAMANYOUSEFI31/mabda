import type { SVGProps } from 'react';
import {
  Check, X, TriangleAlert, OctagonAlert, Info, CircleCheck, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  LoaderCircle, Minus, ArrowLeft, ArrowRight, Plus, Flame, Search, Trash2, Bell, House, CalendarDays, ChartColumn,
  User, Settings, Ellipsis, Copy, Inbox, Pencil, Share2, LogOut, ExternalLink,
  // Extra names the Mabda app needs (all from lucide).
  Menu, Download, Building2, MessageSquare, Lightbulb, Zap, Network, Palette, Tag as TagIcon, Shield, BookOpen,
  CreditCard, TrendingUp, FileText, Target, Package, Send, RefreshCw, Sparkles, Eye, Lock, Layers, Table2,
  Upload, History, Wallet, Undo2, Clock, FolderTree, ListChecks, Wand2, Link2, Brain, Archive, CircleDot,
  ZoomIn, ZoomOut, Maximize, Workflow,
  CircleHelp, Globe, StickyNote, Keyboard, Redo2, Minimize2, PanelRight, Map as MapIcon, Filter, Fullscreen, PictureInPicture2, CornerDownLeft,
  SunMoon, FolderInput, PackageOpen, RotateCcw,
} from 'lucide-react';
import { cx } from './cx.ts';

const ICONS = {
  Check, X, TriangleAlert, OctagonAlert, Info, CircleCheck, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle,
  Minus, ArrowLeft, Plus, Flame, Search, Trash2, Bell, House, CalendarDays, ChartColumn, User, Settings, Ellipsis,
  Copy, Inbox, Pencil, Share2, LogOut, ExternalLink,
  ChevronUp, ArrowRight, Menu, Download, Building2, MessageSquare, Lightbulb, Zap, Network, Palette, TagIcon,
  Shield, BookOpen, CreditCard, TrendingUp, FileText, Target, Package, Send, RefreshCw, Sparkles, Eye, Lock,
  Layers, Table2, Upload, History, Wallet, Undo2, Clock, FolderTree, ListChecks, Wand2, Link2, Brain, Archive,
  CircleDot, ZoomIn, ZoomOut, Maximize, Workflow,
  CircleHelp, Globe, StickyNote, Keyboard, Redo2, Minimize2, PanelRight, Map: MapIcon, Filter, Fullscreen, PictureInPicture2, CornerDownLeft,
  SunMoon, FolderInput, PackageOpen, RotateCcw,
} as const;

export type IconName = keyof typeof ICONS;
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

/** px values mirror --icon-* tokens (lucide needs a number for the SVG box). */
const SIZE_PX: Record<IconSize, number> = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, '2xl': 32, '3xl': 48 };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> {
  name: IconName;
  size?: IconSize;
}

export function Icon({ name, size = 'md', className, ...rest }: IconProps) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={SIZE_PX[size]} strokeWidth={2} aria-hidden="true" className={cx('mb-icon', className)} {...rest} />;
}

/** Status intent -> icon, mirrors the DS (icon + words, never color alone). */
export const STATUS_ICON = {
  info: 'Info',
  success: 'CircleCheck',
  warning: 'TriangleAlert',
  danger: 'OctagonAlert',
} as const satisfies Record<string, IconName>;
