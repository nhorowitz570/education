'use client';
import { useEffect, useRef, useState } from 'react';
import { authRedirect, browserClient } from '@/lib/supabase/client';
import { clearLocal } from '@/lib/client/storage';
import { Mark } from './mark';
import '@/app/entry.css';

type Stage = 'email' | 'sent';
const RESEND_SECONDS = 60;
export const PASSKEY_DEVICE = 'fieldwork-passkey-device';
// Unknown addresses get the same response as known ones so the form cannot be
// used to discover who has access.
const NO_ACCOUNT = /signup|not allowed|user not found|otp_disabled/i;

export function Login({ linkError }: { linkError: boolean }) {
  const [stage, setStage] = useState<Stage>('email'),
    [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState<'' | 'link' | 'code' | 'passkey'>(''),
    [message, setMessage] = useState(
      linkError ? 'That link expired or was already used. Request a new one.' : '',
    ),
    [cooldown, setCooldown] = useState(0),
    [passkeys, setPasskeys] = useState(false),
    [knownDevice, setKnownDevice] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPasskeys(typeof window.PublicKeyCredential === 'function');
    try {
      setKnownDevice(localStorage.getItem(PASSKEY_DEVICE) === '1');
    } catch {}
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  useEffect(() => {
    if (stage === 'sent') codeRef.current?.focus();
  }, [stage]);

  async function enter() {
    await clearLocal();
    window.location.replace('/');
  }
  async function sendLink(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || cooldown) return;
    setBusy('link');
    setMessage('');
    const { error } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: authRedirect() },
    });
    setBusy('');
    if (error && !NO_ACCOUNT.test(error.code + ' ' + error.message)) {
      setMessage(
        error.status === 429
          ? 'Too many requests. Wait a minute, then try again.'
          : error.message,
      );
      return;
    }
    setStage('sent');
    setCooldown(RESEND_SECONDS);
  }
  async function verifyCode(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy('code');
    setMessage('');
    const { error } = await browserClient().auth.verifyOtp({
      email: email.trim(),
      token: value,
      type: 'email',
    });
    if (error) {
      setBusy('');
      setCode('');
      setMessage('That code didn’t work. Check the latest email or send a new one.');
      return;
    }
    await enter();
  }
  async function passkey() {
    setBusy('passkey');
    setMessage('');
    const { error } = await browserClient().auth.signInWithPasskey();
    if (error) {
      setBusy('');
      const code = (error as { code?: string }).code || '';
      setMessage(
        code === 'passkey_disabled'
          ? 'Passkeys aren’t switched on yet. Use an email link.'
          : code === 'webauthn_credential_not_found'
            ? 'No passkey on this device yet. Sign in by email, then add one in Settings.'
            : /abort|cancel|NotAllowed/i.test(error.message)
              ? ''
              : 'Passkey sign-in didn’t complete. Try again or use an email link.',
      );
      return;
    }
    try {
      localStorage.setItem(PASSKEY_DEVICE, '1');
    } catch {}
    await enter();
  }
  const passkeyFirst = passkeys && knownDevice;

  return (
    <main className="entry entry-center">
      <div className="login" data-stage={stage}>
        <a className="login-mark" href="/welcome" aria-label="About Fieldwork">
          <Mark />
        </a>
        <p className="login-kicker">
          <span className="dot" aria-hidden="true" />
          Private
        </p>
        {stage === 'email' ? (
          <div className="login-stage" key="email">
            <h1>Sign in to Fieldwork</h1>
            <p className="login-lede">
              A personal learning space. Access is by invitation, so there’s no
              sign-up.
            </p>
            {passkeyFirst && (
              <>
                <button
                  className="entry-button primary wide"
                  onClick={() => void passkey()}
                  disabled={!!busy}
                >
                  <KeyGlyph />
                  {busy === 'passkey' ? 'Waiting for your device…' : 'Sign in with passkey'}
                </button>
                <div className="login-or">
                  <span>or</span>
                </div>
              </>
            )}
            <form onSubmit={sendLink} className="login-form">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username webauthn"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                className={'entry-button wide ' + (passkeyFirst ? 'quiet' : 'primary')}
                disabled={!!busy || !email}
              >
                {busy === 'link' ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
            {passkeys && !passkeyFirst && (
              <button
                className="text-link passkey-link"
                onClick={() => void passkey()}
                disabled={!!busy}
              >
                <KeyGlyph />
                {busy === 'passkey' ? 'Waiting for your device…' : 'Use a passkey'}
              </button>
            )}
          </div>
        ) : (
          <div className="login-stage" key="sent">
            <h1>Check your inbox</h1>
            <p className="login-lede">
              If <strong>{email.trim()}</strong> has access, a sign-in link is on
              its way. On the installed app, enter the 6-digit code instead.
            </p>
            <form
              className="login-form"
              onSubmit={(e) => {
                e.preventDefault();
                void verifyCode(code);
              }}
            >
              <label htmlFor="code">Code</label>
              <input
                id="code"
                ref={codeRef}
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(v);
                  if (v.length === 6) void verifyCode(v);
                }}
              />
            </form>
            <div className="login-row">
              <button
                className="text-link"
                onClick={() => void sendLink()}
                disabled={!!cooldown || !!busy}
              >
                {cooldown ? `Resend in ${cooldown}s` : 'Resend'}
              </button>
              <button
                className="text-link"
                onClick={() => {
                  setStage('email');
                  setCode('');
                  setMessage('');
                }}
              >
                Use a different email
              </button>
            </div>
          </div>
        )}
        <p className="login-message" role="status" aria-live="polite">
          {message}
        </p>
      </div>
    </main>
  );
}

function KeyGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="12" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12.2 12H21m-3 0v3m-3-3v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
