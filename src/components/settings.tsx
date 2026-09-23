'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from './app/provider';
import { Sheet, download } from './ui';
import { Icon } from './icons';
import { api } from '@/lib/client/api';
import { clearLocal } from '@/lib/client/storage';
// The You page's settings, each in its own sheet.

export function PlanSheet({ onClose }: { onClose: () => void }) {
  const { w } = useApp();
  const router = useRouter();
  const plan = w.state.plan;
  return (
    <Sheet title="Your plan" subtitle={plan ? plan.title : 'No plan imported yet.'} onClose={onClose}>
      <div className="sheet-actions">
        <button className="btn primary" onClick={() => router.push('/import')}>
          <Icon name="import" size={17} /> {plan ? 'Import a new plan' : 'Import a plan'}
        </button>
        <button className="btn" disabled={!plan} onClick={() => download('fieldwork-plan.json', plan)}>
          <Icon name="download" size={17} /> Export this plan
        </button>
        <button
          className="btn"
          onClick={() => download('fieldwork-progress.json', { attempts: w.state.attempts, records: w.state.records })}
        >
          <Icon name="download" size={17} /> Export progress
        </button>
      </div>
    </Sheet>
  );
}

export function DataSheet({ onClose }: { onClose: () => void }) {
  const { config, toast } = useApp();
  const [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function exportAll() {
    setBusy(true);
    try {
      download('fieldwork-account.json', await api('/api/export'));
      toast('Account export downloaded.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteAccount() {
    setError('');
    try {
      await api('/api/account', { confirm }, 'DELETE');
      await clearLocal();
      location.href = '/welcome';
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Sheet title="Data & privacy" subtitle="Everything is yours to take or remove." onClose={onClose}>
      <div className="sheet-actions">
        <button className="btn" disabled={config.demo || busy} data-busy={busy || undefined} onClick={() => void exportAll()}>
          <Icon name="download" size={17} /> Export all account data
        </button>
        <button className="btn danger" onClick={() => setDeleting(true)}>
          <Icon name="trash" size={17} /> Delete my account
        </button>
      </div>
      {deleting && (
        <Sheet title="Delete your account?" onClose={() => setDeleting(false)}>
          <p className="muted">
            This removes your plans, progress, memories and private files. Export anything you want to keep first.
          </p>
          <label>
            Type DELETE MY ACCOUNT
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <button className="btn danger" disabled={confirm !== 'DELETE MY ACCOUNT' || config.demo} onClick={() => void deleteAccount()}>
            Permanently delete account
          </button>
          {error && (
            <p className="form-message" role="alert">
              {error}
            </p>
          )}
        </Sheet>
      )}
    </Sheet>
  );
}
