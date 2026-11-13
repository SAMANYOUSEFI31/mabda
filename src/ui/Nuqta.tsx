import { cx } from './cx.ts';

/**
 * نقطه: the reed-pen diamond that says what state a piece of knowledge is in (docs/design-system/iconography.md «نقطه»).
 * Shape carries the meaning; colour (nuqta-* tokens) only reinforces it, so all seven read apart in black and white.
 * It is only ever about knowledge: never a bullet, «new» or decoration.
 */
export type NuqtaState = 'thought' | 'proposed' | 'truth' | 'stale' | 'conflict' | 'past' | 'gap' | 'brand';
export type NuqtaSize = 'sm' | 'md' | 'lg' | 'xl';

export const NUQTA_LABEL: Record<NuqtaState, string> = {
  thought: 'فکر', proposed: 'پیشنهاد', truth: 'حقیقت', stale: 'قدیمی', conflict: 'تناقض', past: 'گذشته', gap: 'جای خالی', brand: 'مبدأ',
};

const COLOR: Record<NuqtaState, string> = {
  thought: 'is-pending', proposed: 'is-pending', past: 'is-pending', gap: 'is-pending', truth: 'is-truth', stale: 'is-stale', conflict: 'is-conflict', brand: 'is-brand',
};

const OUTLINE = 'M6 1.4 10.6 6 6 10.6 1.4 6z';
const SOLID = 'M6 .6 11.4 6 6 11.4.6 6z';
const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' as const };

function Shape({ state }: { state: NuqtaState }) {
  switch (state) {
    case 'truth': case 'brand': return <path d={SOLID} fill="currentColor" />;
    case 'thought': return <path d={OUTLINE} {...line} />;
    case 'proposed': return <><path d={OUTLINE} {...line} /><path d="M1.4 6h9.2L6 10.6z" fill="currentColor" /></>;
    case 'stale': return <><path d="M6 .6 10.5 5.1h-9z" fill="currentColor" /><path d="M1.5 6.9h9L6 11.4z" fill="currentColor" /></>;
    case 'conflict': return <><path d="M4.2 2.2 8 6 4.2 9.8.4 6z" fill="currentColor" /><path d="M7.8 2.9 10.9 6 7.8 9.1 4.7 6z" {...line} /></>;
    case 'past': return <><path d={OUTLINE} {...line} /><path d="M3.9 6h4.2" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" /></>;
    case 'gap': return <path d={OUTLINE} {...line} strokeDasharray="2.2 1.6" />;
  }
}

export interface NuqtaProps {
  state: NuqtaState;
  size?: NuqtaSize;
  /** the readable name; false when the same word is already printed beside it */
  label?: string | false;
  className?: string;
}

export function Nuqta({ state, size = 'md', label, className }: NuqtaProps) {
  const name = label === false ? undefined : label ?? NUQTA_LABEL[state];
  return (
    <svg viewBox="0 0 12 12" className={cx('mb-nuqta', `mb-nuqta--${size}`, COLOR[state], className)} data-nuqta={state}
      role={name ? 'img' : undefined} aria-label={name} aria-hidden={name ? undefined : true} focusable="false">
      <Shape state={state} />
    </svg>
  );
}
