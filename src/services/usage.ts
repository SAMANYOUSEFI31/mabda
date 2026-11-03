import type { FeatureInfo } from '../core/usage';
import { isFeatureKey } from '../core/usage';

/**
 * Counts that a feature was opened or used (only its catalog KEY goes to this install's server — never text or data).
 * Best effort: a failure is silent and never blocks anything.
 */
export function track(feature: string): void {
  if (!isFeatureKey(feature) || typeof fetch === 'undefined') return;
  void fetch('/api/usage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ feature }) }).catch(() => { /* optional */ });
}
export type { FeatureInfo };
