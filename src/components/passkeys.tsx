'use client';
import { useCallback, useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import { Button } from './ui';

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};
const supported = () =>
  typeof window !== 'undefined' &&
  typeof window.PublicKeyCredential === 'function';
const errorCode = (e: unknown) =>
  (e as { code?: string } | null)?.code || '';
const cancelled = (e: unknown) =>
  /abort|cancel|NotAllowed/i.test((e as Error | null)?.message || '');

export function usePasskeys(enabled = true) {
  const [list, setList] = useState<Passkey[] | null>(null),
    [available, setAvailable] = useState(false),
    [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    if (!enabled || !supported()) return;
    const { data, error } = await browserClient().auth.passkey.list();
    if (error) {
      // Not enabled in the Supabase project yet: hide the feature quietly.
      setAvailable(false);
      if (errorCode(error) !== 'passkey_disabled') setMessage(error.message);
      return;
    }
    setAvailable(true);
    setList((data as Passkey[]) || []);
  }, [enabled]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const add = useCallback(async () => {
    setMessage('');
    const { error } = await browserClient().auth.registerPasskey();
    if (error) {
      if (!cancelled(error))
        setMessage(
          errorCode(error) === 'webauthn_credential_exists'
            ? 'This device already has a passkey for your account.'
            : 'The passkey wasn’t added. Try again.',
        );
      return false;
    }
    try {
      localStorage.setItem('fieldwork-passkey-device', '1');
    } catch {}
    await refresh();
    return true;
  }, [refresh]);
  const remove = useCallback(
    async (id: string) => {
      const { error } = await browserClient().auth.passkey.delete({
        passkeyId: id,
      });
      if (error) setMessage(error.message);
      await refresh();
    },
    [refresh],
  );
  return { list, available, message, add, remove };
}

export function PasskeySettings({ demo }: { demo: boolean }) {
  const p = usePasskeys(!demo);
  if (demo || !p.available) return null;
  return (
    <div className="setting-row passkeys">
      <div>
        <strong>Passkeys</strong>
        <p>
          {p.list?.length
            ? 'Sign in with Face ID, Touch ID or your password manager.'
            : 'Skip the email link next time.'}
        </p>
        {!!p.list?.length && (
          <ul className="passkey-list">
            {p.list.map((k) => (
              <li key={k.id}>
                <span>{k.friendly_name || 'Passkey'}</span>
                <span className="muted">
                  {k.last_used_at
                    ? 'Used ' + new Date(k.last_used_at).toLocaleDateString()
                    : 'Added ' + new Date(k.created_at).toLocaleDateString()}
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    if (confirm('Remove this passkey?')) void p.remove(k.id);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {p.message && <p role="status">{p.message}</p>}
      </div>
      <Button kind="secondary" onClick={() => void p.add()}>
        Add a passkey
      </Button>
    </div>
  );
}
