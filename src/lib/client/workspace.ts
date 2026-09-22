'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyCommand, commandSchema, type Command } from '@/lib/commands';
import { DEMO_PLAN } from '@/lib/seed';
import { emptyState, type AppState, type UserRecord } from '@/lib/types';
import {
  claimLocal,
  localSet,
  savedState,
  savedQueue,
  updateQueue,
  localOwner,
} from './storage';
export async function api<T = Record<string, unknown>>(
  path: string,
  data?: unknown,
  method?: string,
  expectedOwner?: string,
): Promise<T> {
  const owner = expectedOwner || (await localOwner());
  const res = await fetch(path, {
    method: method || (data ? 'POST' : 'GET'),
    headers: {
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(owner && owner !== 'preview' ? { 'X-Fieldwork-Owner': owner } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok || res.status === 202) {
    const error = new Error(
      json.error || 'This did not save. Try again.',
    ) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return json as T;
}
export function useWorkspace(owner: string, demo: boolean) {
  const initial = demo ? { ...emptyState, plan: DEMO_PLAN } : emptyState;
  const [state, setState] = useState<AppState>(initial),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState(0),
    [error, setError] = useState(''),
    [online, setOnline] = useState(true);
  const current = useRef(state),
    queue = useRef<Command[]>([]),
    syncing = useRef(false),
    channel = useRef<BroadcastChannel | null>(null);
  const publish = useCallback(
    async (next: AppState) => {
      current.current = next;
      setState(next);
      await localSet(owner, 'state', next);
    },
    [owner],
  );
  const sync = useCallback(async () => {
    if (demo || syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      queue.current = (await savedQueue(owner)) || [];
      while (queue.current.length) {
        const c = queue.current[0];
        const result = await api<{ state: AppState; ownerId: string }>(
          '/api/actions',
          c,
          'POST',
          owner,
        );
        if (result.ownerId !== owner)
          throw new Error('Your account changed. Reload before syncing.');
        queue.current = await updateQueue(owner, c.eventId);
        setPending(queue.current.length);
        await publish(
          queue.current.reduce((s, x) => applyCommand(s, x), result.state),
        );
        channel.current?.postMessage('changed');
      }
      const fresh = await api<{ state: AppState; ownerId: string }>(
        '/api/state',
      );
      if (fresh.ownerId !== owner)
        throw new Error('Your account changed. Reload before syncing.');
      await publish(
        queue.current.reduce((s, c) => applyCommand(s, c), fresh.state),
      );
      setError('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Sync failed. Your work is saved on this device.',
      );
    } finally {
      syncing.current = false;
    }
  }, [demo, owner, publish]);
  useEffect(() => {
    let active = true;
    (async () => {
      await claimLocal(owner);
      const cached = await savedState(owner);
      queue.current = (await savedQueue(owner)) || [];
      if (!active) return;
      setPending(queue.current.length);
      if (cached) {
        current.current = cached;
        setState(cached);
      }
      setOnline(navigator.onLine);
      setReady(true);
      await sync();
    })();
    channel.current = new BroadcastChannel('fieldwork-sync');
    channel.current.onmessage = () => void sync();
    const refresh = () => {
      setOnline(navigator.onLine);
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      channel.current?.close();
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [owner, sync]);
  const send = useCallback(
    async (c: Command) => {
      setError('');
      if (demo) {
        await publish(applyCommand(current.current, c));
        return current.current;
      }
      commandSchema.parse(c);
      queue.current = await updateQueue(owner, c);
      setPending(queue.current.length);
      await publish(applyCommand(current.current, c));
      await sync();
      return current.current;
    },
    [demo, owner, publish, sync],
  );
  const record = useCallback(
    (kind: UserRecord['kind'], id: string, data: Record<string, unknown>) =>
      send({
        type: 'record',
        eventId: crypto.randomUUID(),
        record: { id, kind, data, updated_at: new Date().toISOString() },
      }),
    [send],
  );
  return {
    state,
    ready,
    pending,
    error,
    setError,
    online,
    send,
    record,
    replace: publish,
    sync,
  };
}
