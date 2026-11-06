import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AiErrorInfo, AiStatus } from '../types';
import { asAiError, getAiStatus } from './apiClient';

interface Ctx {
  status: AiStatus | null;
  /** set when the status request itself failed (server down) */
  error: AiErrorInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** convenience: generation is possible */
  available: boolean;
  /** managed AI + credits feature flag (MABDA_MANAGED_AI). Every credit number in the UI is shown only when this is on. */
  managedEnabled: boolean;
  /** server AI is configured for Gap / Coach / file judgements included in the subscription */
  platformJudgments: boolean;
  /** Gap / Coach / file extraction can run */
  judgmentsAvailable: boolean;
  /** manager ledger enabled on this server */
  admin: boolean;
}

const AiStatusContext = createContext<Ctx | null>(null);

export function AiStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<AiErrorInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getAiStatus());
      setError(null);
    } catch (e) {
      setStatus(null);
      setError(asAiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<Ctx>(() => ({ status, error, loading, refresh, available: Boolean(status?.available), managedEnabled: Boolean(status?.managedEnabled), platformJudgments: Boolean(status?.platformJudgments), judgmentsAvailable: Boolean(status?.available || status?.platformJudgments), admin: Boolean(status?.admin) }), [status, error, loading, refresh]);
  return <AiStatusContext.Provider value={value}>{children}</AiStatusContext.Provider>;
}

export function useAiStatus(): Ctx {
  const c = useContext(AiStatusContext);
  if (!c) throw new Error('useAiStatus must be used inside <AiStatusProvider>');
  return c;
}
