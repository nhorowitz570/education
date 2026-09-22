'use client';
import { useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import { Mark } from './mark';
import '@/app/entry.css';

// A deliberate click, rather than verifying on page load, keeps inbox link
// scanners from consuming the single-use token before the person arrives.
export function Confirm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>(
    tokenHash ? 'idle' : 'error',
  );
  async function go() {
    setState('busy');
    const { error } = await browserClient().auth.verifyOtp({
      token_hash: tokenHash,
      type: type === 'magiclink' ? 'magiclink' : 'email',
    });
    if (error) setState('error');
    else window.location.replace('/?signed-in=1');
  }
  return (
    <main className="entry entry-center">
      <div className="confirm">
        <Mark />
        {state === 'error' ? (
          <>
            <h1>This link has expired.</h1>
            <p>
              Sign-in links work once and expire after an hour. Request a new
              one and it will arrive in a few seconds.
            </p>
            <a className="entry-button primary" href="/login">
              Request a new link
            </a>
          </>
        ) : (
          <>
            <h1>Welcome back.</h1>
            <p>Continue to open your learning space on this device.</p>
            <button
              className="entry-button primary"
              onClick={() => void go()}
              disabled={state === 'busy'}
              autoFocus
            >
              {state === 'busy' ? 'Signing in…' : 'Continue'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
