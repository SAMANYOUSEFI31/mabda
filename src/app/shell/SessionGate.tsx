/**
 * Before anything else: who is this? (server/auth/http.ts)
 * - local mode: one person, straight in.
 * - invite mode: a personal link in the address bar (`#join=…`) signs this device in once and is removed from the address;
 *   without a sign-in the page says how to get in (there is no password to type: the link is the key).
 * Any later «not signed in» from the server (the link was replaced, the person turned off, the sign-in expired) comes back here.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { EmptyState, ErrorState, PageSkeleton } from '../../ui';
import { SIGNED_OUT_EVENT, SessionError, forgetInviteCode, inviteCodeInAddress, sessionApi } from '../../services/session';
import type { SessionInfo } from '../../services/session';

type GateState = { status: 'checking' } | { status: 'in'; session: SessionInfo } | { status: 'out'; reason?: 'invalid_link' | 'signed_out' } | { status: 'error'; message: string };

const SessionContext = createContext<{ session: SessionInfo | null; signOut: () => Promise<void> }>({ session: null, signOut: async () => {} });
/** the signed-in person and «خروج» (null outside the gate, e.g. in a preview) */
export const useSession = () => useContext(SessionContext);

export function SessionGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'checking' });

  const check = useCallback(async () => {
    setState({ status: 'checking' });
    try {
      const code = inviteCodeInAddress();
      if (code) {
        forgetInviteCode();
        try { setState({ status: 'in', session: await sessionApi.join(code) }); return; } catch (e) {
          if (e instanceof SessionError && e.kind === 'invalid_link') { setState({ status: 'out', reason: 'invalid_link' }); return; }
          throw e;
        }
      }
      const s = await sessionApi.current();
      setState(s.mode === 'local' || s.user ? { status: 'in', session: s } : { status: 'out' });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    const out = () => setState((s) => (s.status === 'in' && s.session.mode === 'invite' ? { status: 'out', reason: 'signed_out' } : s));
    window.addEventListener(SIGNED_OUT_EVENT, out);
    // a link opened while the app is already open (pasted into the same tab)
    const onHash = () => { if (inviteCodeInAddress()) void check(); };
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener(SIGNED_OUT_EVENT, out); window.removeEventListener('hashchange', onHash); };
  }, [check]);

  const signOut = useCallback(async () => {
    try { await sessionApi.signOut(); } finally { setState({ status: 'out', reason: 'signed_out' }); }
  }, []);

  if (state.status === 'in') return <SessionContext.Provider value={{ session: state.session, signOut }}>{children}</SessionContext.Provider>;
  return (
    <div className="min-h-screen bg-surface-page text-text-default">
      <main className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl">
        {state.status === 'checking' && <PageSkeleton label="در حال باز کردن مبدأ" />}
        {state.status === 'error' && <ErrorState title="مبدأ باز نشد" description={state.message} onRetry={() => void check()} />}
        {state.status === 'out' && (
          <EmptyState
            title={state.reason === 'invalid_link' ? 'این لینک دعوت کار نمی‌کند' : 'برای ورود، لینک دعوت شخصی‌ات را باز کن'}
            description={state.reason === 'invalid_link'
              ? 'شاید لینک عوض شده یا خاموش شده است. از کسی که آن را برایت فرستاده، لینک تازه بخواه و همان را باز کن.'
              : 'مبدأ رمز ندارد: هر نفر یک لینک شخصی دارد که فقط داده‌های خودش را باز می‌کند. لینکی را که برایت فرستاده‌اند روی همین دستگاه باز کن؛ اگر لینک نداری، از فرستنده بخواه.'}
          />
        )}
      </main>
    </div>
  );
}
