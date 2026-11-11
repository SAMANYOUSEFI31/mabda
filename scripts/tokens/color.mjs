/**
 * Colour maths for the token build (no dependencies): OKLCH -> sRGB (gamut-mapped by lowering chroma),
 * WCAG 2.x contrast ratio, and APCA (W3 0.1.9 / 0.0.98G-4g constants) lightness contrast Lc.
 * Used by scripts/tokens/build.mjs and by src/ui/tokens.test.ts.
 */

const lin2srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH (L 0..1, C, H degrees) -> sRGB 0..1, lowering chroma until the colour is inside the sRGB gamut. */
export function oklchToSrgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  let c = C;
  for (let i = 0; i < 60; i++) {
    const lin = oklabToLinearSrgb(L, c * Math.cos(h), c * Math.sin(h));
    if (lin.every((v) => v >= -0.0001 && v <= 1.0001)) return lin.map((v) => Math.min(1, Math.max(0, lin2srgb(Math.min(1, Math.max(0, v))))));
    c *= 0.95;
  }
  const lin = oklabToLinearSrgb(L, 0, 0);
  return lin.map((v) => lin2srgb(Math.min(1, Math.max(0, v))));
}

export const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** alpha-composite `top` (rgb 0..1 with alpha) over an opaque `bottom` */
export const over = (top, alpha, bottom) => top.map((v, i) => v * alpha + bottom[i] * (1 - alpha));

const srgb2lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const luminance = ([r, g, b]) => 0.2126 * srgb2lin(r) + 0.7152 * srgb2lin(g) + 0.0722 * srgb2lin(b);

export function wcagRatio(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** APCA Lc (absolute value): text `fg` on `bg`, both opaque sRGB 0..1. */
export function apcaLc(fg, bg) {
  const y = ([r, g, b]) => 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
  const clamp = (v) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
  const Yt = clamp(y(fg)), Yb = clamp(y(bg));
  if (Math.abs(Yb - Yt) < 0.0005) return 0;
  let s;
  if (Yb > Yt) { s = (Yb ** 0.56 - Yt ** 0.57) * 1.14; s = s < 0.1 ? 0 : s - 0.027; }
  else { s = (Yb ** 0.65 - Yt ** 0.62) * 1.14; s = s > -0.1 ? 0 : s + 0.027; }
  return Math.abs(s * 100);
}
