'use client';
import { useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
export default function ResetPassword() {
  const [password, setPassword] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="offline-layout">
      <h1>A fresh start.</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await browserClient().auth.updateUser({ password });
          setBusy(false);
          if (error) setMessage(error.message);
          else location.href = '/';
        }}
      >
        <label>
          New password
          <input
            type="password"
            minLength={10}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy}>
          Save password
        </Button>
        <p role="status">{message}</p>
      </form>
    </main>
  );
}
