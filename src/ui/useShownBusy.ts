import { useEffect, useRef, useState } from 'react';

/** motion.md «زمان‌بندی در حال کار»: under 300ms nothing shows (the result just comes); once shown, it stays at least 400ms so it
 *  never blinks. Only what is SEEN waits: the control itself is busy (and inert) from the first moment. */
export const BUSY_SHOW_AFTER = 300;
export const BUSY_MIN_SHOWN = 400;

export function useShownBusy(busy: boolean): boolean {
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (busy && !shown) {
      const t = setTimeout(() => { since.current = Date.now(); setShown(true); }, BUSY_SHOW_AFTER);
      return () => clearTimeout(t);
    }
    if (!busy && shown) {
      const t = setTimeout(() => setShown(false), Math.max(0, BUSY_MIN_SHOWN - (Date.now() - since.current)));
      return () => clearTimeout(t);
    }
  }, [busy, shown]);
  return shown;
}
