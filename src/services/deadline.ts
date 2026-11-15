/** a signal that aborts after `ms` or when `external` aborts (by hand: AbortSignal.any / .timeout are missing on older phones) */
export function deadline(ms: number, external?: AbortSignal): { signal: AbortSignal; timedOut: () => boolean; done: () => void } {
  const ctl = new AbortController();
  let timedOut = false;
  const t = setTimeout(() => { timedOut = true; ctl.abort(); }, ms);
  const onExt = () => ctl.abort();
  if (external?.aborted) ctl.abort(); else external?.addEventListener('abort', onExt, { once: true });
  return { signal: ctl.signal, timedOut: () => timedOut, done: () => { clearTimeout(t); external?.removeEventListener('abort', onExt); } };
}
