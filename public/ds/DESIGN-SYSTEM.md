# Bushido Design System — brief for the coding agent

You are building a product on the **Bushido** design system (dark-only, Persian/RTL, minimal, disciplined).
Do NOT invent colors, sizes, fonts or components. Use only what is in this folder.

## Files
- `tokens.css` — all design tokens as CSS variables on `:root` (+ `@font-face` for Vazirmatn + type-style classes like `.body-md`, `.label-md`, `.heading-lg`).
- `bundle.css` + `bundle.js` — 37 ready React 18 components, exposed as `window.Bushido`.
- `lib/react.production.min.js`, `lib/react-dom.production.min.js` — React 18.3.1 UMD (globals `React`, `ReactDOM`).
- `fonts/` — Vazirmatn woff2 (referenced by tokens.css as `fonts/...`).
- `components.d.ts` — props of every component (documentation; read it before using a component).
- `example.html` — a minimal working page. Copy its structure.

## How to load (no build step; this is the required approach)
```html
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#09090b">
  <link rel="stylesheet" href="ds/tokens.css"><link rel="stylesheet" href="ds/bundle.css">
</head>
<body><div id="root"></div>
  <script src="ds/lib/react.production.min.js"></script>
  <script src="ds/lib/react-dom.production.min.js"></script>
  <script src="ds/bundle.js"></script>
  <script src="app.js"></script>   <!-- plain JS using React.createElement; no JSX, no bundler -->
</body></html>
```
Keep the folder as `ds/` and never edit its files. App code goes in separate files. Use `const h = React.createElement; const B = window.Bushido;`.
Do not install a second copy of React; the components use the global one.

## Seven permanent rules
1. Semantic tokens only (`surface-*`, `bg-*`, `text-*`, `border-*`, `inset-*`, `space-*`...). Never raw hex, never raw palette steps (`crimson-600`), never ad-hoc pixel numbers when a token exists.
2. Color = intent: `neutral`, `brand` (crimson), `danger`, `warning`, `success`, `info`. 90% neutral, 8% structure, 2% colored intent.
3. Only ONE `primary` button per view. Other fill buttons are `secondary` or `inverse`.
4. Brand red never means error, warning, selection or link. Errors use `danger` and ALWAYS an icon + words. Never convey meaning with color alone.
5. Text ≥ 4.5:1, controls/icons ≥ 3:1. Body text ≥ 16px (helper 14, metadata 12). Touch targets ≥ 44px.
6. One focus ring for all controls (already built in). Do not restyle focus.
7. Correct Persian: logical properties (`margin-inline-start`, `inset-inline-end`, not left/right), letter-spacing 0, no italics, no justify, ZWNJ (نیم‌فاصله) where needed, Persian «» quotes and ، ؛ ؟.

## Layout
Mobile-first from 360px. Breakpoints 640 / 768 / 1024 / 1280. Containers: forms `640px`, content `1024px`. Page background `surface-page`; cards `surface-raised`; dialogs/menus `surface-overlay`. Spacing from `space-*` / `inset-*` / `stack-*` / `inline-*`.

## Type styles (classes from tokens.css)
`display-*`, `heading-xl|lg|md|sm|xs`, `title`, `body-lg|md|sm`, `caption`, `label-lg|md|sm` (buttons, fields, tabs), `numeric-xl|lg|md`, `code` (LTR codes only). Weights 400/600/700 only. Hierarchy by size and weight, not color. Max 3 levels in one block.

## Components to prefer
Button (primary/secondary/ghost/inverse/danger/danger-bold), IconButton, TextField, Textarea, Select, Checkbox, RadioGroup, Switch, SegmentedControl, Tabs, Table, Card, Badge, Tag, Stat, Progress, Dialog (use `alert` for destructive confirm; the confirm button is `danger-bold` only there), Alert, Toast (`ToastProvider` + `useToast`), EmptyState, Menu, Popover, Tooltip, Skeleton, Spinner, Pagination, Accordion, List/ListItem, Divider, Icon (only the names listed in components.d.ts).
If a needed component does not exist, build it from semantic tokens and the same state rules (hover, pressed, focus, disabled, loading, error). Do not import another UI library.

## Content & numbers
- Voice: direct, short, verb-first buttons («ذخیره»، «افزودن»، «پاک کن»); never «کلیک کنید».
- Error = what happened + what to do («نام تکراری است. نام دیگری بنویس.»). Empty state = one sentence + one action. Success = short and factual («ثبت شد»).
- Display digits: Persian (۰-۹), thousands separator «٬». Stored/imported data: Latin digits (normalize Persian/Arabic digits to Latin on input). Codes/IDs/phones: Latin, `dir="ltr"`, `.code` style.
- Dates: Jalali (Shamsi) display via `Intl` with `fa-IR-u-ca-persian`, week starts on Saturday. Store ISO dates internally.

## States every interactive element must have
default, hover, pressed, focus-visible, disabled, loading (size must not jump), error (message string, not just red).
