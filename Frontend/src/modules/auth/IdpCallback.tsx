/**
 * Microsoft/Google send the browser back here (/login/idp-callback?state&code, or ?error).
 * The server swaps the code for a verified ID token and answers with the email-code step;
 * the login page then continues from there (StaffEmailLogin reads the hand-off once).
 */
import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/authService';
import { LoadingBlock } from '../../components/common/States';

export const IDP_HANDOFF_KEY = 'fs:idp:handoff';

function handOff(value: unknown) {
  try {
    window.sessionStorage.setItem(IDP_HANDOFF_KEY, JSON.stringify(value));
  } catch {
    /* storage blocked: the login page shows the email step again */
  }
}

export const IdpCallback: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // run once (React strict mode mounts twice in development)
    ran.current = true;
    const state = params.get('state');
    const code = params.get('code');
    const providerError = params.get('error');
    const done = () => navigate('/login?idp=1', { replace: true });
    if (providerError || !state || !code) {
      handOff({ error: providerError === 'access_denied' ? 'Sign-in was cancelled.' : 'Microsoft/Google sign-in did not complete. Please try again, or use your password.' });
      done();
      return;
    }
    authService.completeIdpSignIn(state, code).then(r => {
      handOff(r.ok ? { ticket: r.data.ticket, secondFactor: r.data.secondFactor } : { error: r.error });
      done();
    });
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LoadingBlock />
    </div>
  );
};
