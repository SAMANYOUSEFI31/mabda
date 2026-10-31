/* Bushido core components — props (documentation). All components render RTL-ready markup styled by bundle.css with semantic tokens. */
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
type Intent = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';
type StatusIntent = 'info' | 'success' | 'warning' | 'danger';
type IconName = 'Check' | 'X' | 'TriangleAlert' | 'OctagonAlert' | 'Info' | 'CircleCheck' | 'ChevronDown' | 'ChevronLeft' | 'ChevronRight' | 'LoaderCircle' | 'Minus' | 'ArrowLeft' | 'Plus' | 'Flame' | 'Search' | 'Trash2' | 'Bell' | 'House' | 'CalendarDays' | 'ChartColumn' | 'User' | 'Settings' | 'Ellipsis' | 'Copy' | 'Inbox' | 'Pencil' | 'Share2' | 'LogOut' | 'ExternalLink';
/** Docs-only: renders a state statically. */
type ForceState = 'hover' | 'active' | 'focus';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger' | 'danger-bold'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; iconStart?: IconName; iconEnd?: IconName; fullWidth?: boolean; glow?: boolean; /** renders an <a> when set and the button is neither disabled nor loading */ href?: string; forceState?: ForceState; }
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { icon: IconName; label: string; variant?: 'ghost' | 'secondary' | 'primary' | 'danger'; size?: 'sm' | 'md' | 'lg'; /** toggle button: aria-pressed + selected surface */ selected?: boolean; /** mirror the icon in LTR (direction-aware icons) */ flip?: boolean; forceState?: ForceState; }
export interface LinkProps { href?: string; external?: boolean; children: ReactNode; forceState?: ForceState; }
export interface IconProps { name: IconName; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'; }
export interface BadgeProps { intent?: Intent; emphasis?: 'subtle' | 'bold'; icon?: IconName | false; dot?: boolean; children: ReactNode; }
export interface AvatarProps { name: string; src?: string; size?: 'xs' | 'sm' | 'md' | 'lg'; }
export interface CardProps { padding?: 'md' | 'lg' | 'xl'; /** set automatically by href or onClick */ interactive?: boolean; href?: string; onClick?: (e: any) => void; selected?: boolean; forceState?: ForceState; children: ReactNode; }
export interface StatProps { label: ReactNode; value: ReactNode; delta?: ReactNode; trend?: 'up' | 'down'; }
export interface ProgressProps { value?: number; max?: number; label?: string; intent?: 'brand' | 'success' | 'warning' | 'neutral'; showValue?: boolean; indeterminate?: boolean; }
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> { label?: ReactNode; hint?: ReactNode; error?: ReactNode; size?: 'sm' | 'md' | 'lg'; iconStart?: IconName; iconEnd?: IconName; forceState?: ForceState; }
export interface CheckboxProps { label?: ReactNode; checked?: boolean; defaultChecked?: boolean; indeterminate?: boolean; disabled?: boolean; hint?: ReactNode; /** message text; sets aria-invalid and aria-describedby */ error?: ReactNode; onChange?: (e: any) => void; forceState?: ForceState; }
export interface RadioGroupProps { legend?: ReactNode; name?: string; options: Array<{ value: string; label: ReactNode; disabled?: boolean }>; value?: string; defaultValue?: string; onChange?: (value: string) => void; orientation?: 'vertical' | 'horizontal'; required?: boolean; disabled?: boolean; hint?: ReactNode; error?: ReactNode; }
export interface SwitchProps { label?: ReactNode; checked?: boolean; defaultChecked?: boolean; disabled?: boolean; onChange?: (e: any) => void; forceState?: ForceState; }
export interface TabsProps { items: Array<{ id: string; label: ReactNode; disabled?: boolean }>; value?: string; defaultValue?: string; onChange?: (id: string) => void; label?: string; fullWidth?: boolean; renderPanel?: (id: string) => ReactNode; }
export interface AccordionProps { items: Array<{ id: string; title: ReactNode; content: ReactNode; disabled?: boolean }>; defaultOpen?: string; multiple?: boolean; }
export interface AlertProps { intent?: StatusIntent; title?: ReactNode; children?: ReactNode; action?: ReactNode; onClose?: () => void; }
export interface ToastProps { intent?: StatusIntent; children: ReactNode; action?: { label: string; onClick?: () => void }; onClose?: () => void; }
export interface SpinnerProps { size?: 'sm' | 'md' | 'lg' | 'xl'; label?: string; }
export interface SkeletonProps { variant?: 'text' | 'circle' | 'rect'; width?: string; height?: string; lines?: number; }
export interface TooltipProps { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom'; forceOpen?: boolean; }
export interface DialogProps { open: boolean; onClose?: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; inline?: boolean; /** destructive confirmation: role=alertdialog, scrim click does not close */ alert?: boolean; }
export interface TagProps { children: ReactNode; selected?: boolean; onToggle?: (selected: boolean) => void; onRemove?: () => void; removeLabel?: string; disabled?: boolean; }
export interface DividerProps { orientation?: 'horizontal' | 'vertical'; label?: ReactNode; }
export interface EmptyStateProps { icon?: IconName; title: ReactNode; description?: ReactNode; action?: ReactNode; }
export interface TableProps { caption?: string; columns: Array<{ key: string; label: ReactNode; numeric?: boolean; render?: (row: any) => ReactNode }>; rows: Array<Record<string, any>>; /** makes rows hoverable, focusable and activatable */ onRowClick?: (row: any) => void; empty?: ReactNode; }
export interface TextareaProps { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; disabled?: boolean; rows?: number; maxLength?: number; value?: string; defaultValue?: string; onChange?: (e: any) => void; }
export interface SelectProps { label: ReactNode; size?: 'sm' | 'md' | 'lg'; options: Array<{ value: string; label: ReactNode; disabled?: boolean }>; placeholder?: string; value?: string; defaultValue?: string; onChange?: (e: any) => void; hint?: ReactNode; error?: ReactNode; required?: boolean; disabled?: boolean; forceState?: ForceState; }
export interface OTPInputProps { length?: number; label?: ReactNode; hint?: ReactNode; error?: ReactNode; onChange?: (code: string) => void; onComplete?: (code: string) => void; disabled?: boolean; }
export interface DatePickerProps { label?: ReactNode; value?: Date | null; defaultValue?: Date; onChange?: (date: Date) => void; min?: Date; max?: Date; hint?: ReactNode; error?: ReactNode; placeholder?: string; disabled?: boolean; }
export interface CalendarProps { value?: Date | null; onChange?: (date: Date) => void; min?: Date; max?: Date; }
export interface BottomNavProps { items: Array<{ id: string; label: ReactNode; icon: IconName; badge?: number; badgeLabel?: string }>; value?: string; defaultValue?: string; onChange?: (id: string) => void; label?: string; fixed?: boolean; }
export interface PopoverProps { trigger: ReactNode; children: ReactNode; label?: string; align?: 'start' | 'end'; side?: 'bottom' | 'top'; }
export interface MenuProps { trigger: ReactNode; items: Array<{ label?: ReactNode; icon?: IconName; onSelect?: () => void; disabled?: boolean; intent?: 'danger'; divider?: boolean }>; label?: string; align?: 'start' | 'end'; side?: 'bottom' | 'top'; }
export interface ToastProviderProps { children: ReactNode; max?: number; }
/** useToast(): { show({ intent, message, action?, duration }): id; dismiss(id) } — must be inside ToastProvider. */
export interface ListProps { label?: string; children: ReactNode; }
export interface ListItemProps { title: ReactNode; description?: ReactNode; leading?: ReactNode; trailing?: ReactNode; chevron?: boolean; href?: string; onClick?: () => void; selected?: boolean; disabled?: boolean; forceState?: ForceState; }
export interface SegmentedControlProps { items: Array<{ id: string; label: ReactNode; icon?: IconName; disabled?: boolean }>; value?: string; defaultValue?: string; onChange?: (id: string) => void; label: string; fullWidth?: boolean; }
export interface SliderProps { label?: ReactNode; min?: number; max?: number; step?: number; value?: number; defaultValue?: number; onChange?: (e: any) => void; hint?: ReactNode; error?: ReactNode; disabled?: boolean; showValue?: boolean; formatValue?: (v: number) => ReactNode; forceState?: ForceState; }
export interface BreadcrumbProps { items: Array<{ label: ReactNode; href?: string }>; label?: string; }
export interface PaginationProps { page: number; pageCount: number; onChange?: (page: number) => void; siblings?: number; label?: string; }
