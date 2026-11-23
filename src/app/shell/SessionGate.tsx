/**
 * Before anything else: who is this? (server/auth/http.ts)
 * - local mode: one person, straight in.
 * - invite mode: a personal link in the address bar (`#join=…`) signs this device in once and is removed from the address;
 *   without a sign-in the page says how to get in (there is no password to type: the link is the key).
 * Any later «not signed in» from the server (the link was replaced, the person turned off, the sign-in expired) comes back here.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, PageSkeleton } from '../../ui';
import { SIGNED_OUT_EVENT, SessionError, forgetInviteCode, inviteCodeInAddress, sessionApi } from '../../services/session';
import type { SessionInfo } from '../../services/session';
import { startClarity } from '../../services/clarity';

type GateState = { status: 'checking' } | { status: 'in'; session: SessionInfo } | { status: 'out'; reason?: 'invalid_link' | 'signed_out' } | { status: 'error'; message: string };

const SessionContext = createContext<{ session: SessionInfo | null; signOut: () => Promise<void> }>({ session: null, signOut: async () => {} });
/** the signed-in person and «خروج» (null outside the gate, e.g. in a preview) */
export const useSession = () => useContext(SessionContext);

/**
 * Informed consent (principle): a tester learns, before their first use on a device, that this is a test copy and that the
 * owner can read everything on it (the owner's full download and the server's daily backups). Once per person, kept on the
 * server (`POST /api/consent`): a new device does not ask again, and the owner sees in «افراد آزمون» who has accepted.
 */
import { OWNER_ACCESS_NOTICE } from '../../core/ownerNotice';
export { OWNER_ACCESS_NOTICE };

export function SessionGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'checking' });
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consenting, setConsenting] = useState(false);

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

  const user = state.status === 'in' ? state.session.user : null;
  const clarityId = state.status === 'in' ? state.session.clarityId : undefined;
  // session analytics: only a tester who has accepted the notice (it names Clarity), never the owner or the local person
  useEffect(() => { if (clarityId && user?.role === 'tester' && user.consented) startClarity(clarityId); }, [clarityId, user?.role, user?.consented]);
  const accept = async () => {
    setConsenting(true); setConsentError(null);
    try { setState({ status: 'in', session: await sessionApi.consent() }); }
    catch (e) { setConsentError(e instanceof Error ? e.message : String(e)); }
    finally { setConsenting(false); }
  };
  if (state.status === 'in' && user?.role === 'tester' && !user.consented) {
    return (
      <div className="min-h-screen bg-surface-page text-text-default">
        <main className="max-w-wide mx-auto w-full px-inset-lg sm:px-inset-2xl py-inset-xl flex flex-col gap-stack-md">
          <h1 className="heading-md">پیش از شروع، {user.name}</h1>
          <p className="body-md">{OWNER_ACCESS_NOTICE}</p>
          <p className="body-sm text-text-subtle">دادهٔ تو از دید افراد آزمون دیگر جداست؛ فقط صاحب مبدأ آن را می‌بیند.</p>
          {consentError && <p role="alert" className="body-sm text-text-danger">{consentError}</p>}
          {/* consent can be declined: a wrong link or a shared device must not leave her with only «ادامه بده» */}
          <div className="flex flex-wrap items-center gap-inline-sm">
            <Button variant="primary" loading={consenting} onClick={() => void accept()}>{consentError ? 'دوباره' : 'فهمیدم، ادامه بده'}</Button>
            <Button variant="ghost" iconStart="LogOut" onClick={() => void signOut()}>خروج از این دستگاه</Button>
          </div>
        </main>
      </div>
    );
  }
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
              : 'مبدأ رمز ندارد: هر نفر یک لینک شخصی دارد که فقط داده‌های خودش را باز می‌کند. لینکی را که برایت فرستاده‌اند روی همین دستگاه باز کن؛ اگر لینک نداری، از فرستنده بخواه. ' + OWNER_ACCESS_NOTICE}
          />
        )}
      </main>
    </div>
  );
}
