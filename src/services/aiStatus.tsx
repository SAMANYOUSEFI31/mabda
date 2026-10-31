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
  /** requests with the user's own key: credits are not deducted */
  byok: boolean;
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

  const value = useMemo<Ctx>(() => ({ status, error, loading, refresh, available: Boolean(status?.available), byok: status?.source === 'byok' }), [status, error, loading, refresh]);
  return <AiStatusContext.Provider value={value}>{children}</AiStatusContext.Provider>;
}

export function useAiStatus(): Ctx {
  const c = useContext(AiStatusContext);
  if (!c) throw new Error('useAiStatus must be used inside <AiStatusProvider>');
  return c;
}
