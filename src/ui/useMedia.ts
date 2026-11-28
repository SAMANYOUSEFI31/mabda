import { useEffect, useState } from 'react';

/** a media query as state (navigation.md breakpoints): one hook, used wherever a part changes its content (not only its look)
 *  with the width, such as a step that folds into «⋯» on a phone */
export function useMedia(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); f(); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}
/** the phone width of every phone-only rule in components.css */
export const PHONE = '(max-width: 767px)';
