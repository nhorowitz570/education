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
  const owner = expectedOwner || (await localOwner().catch(() => null));
  let res: Response;
  try {
    res = await fetch(path, {
      method: method || (data ? 'POST' : 'GET'),
      headers: {
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        ...(owner && owner !== 'preview' ? { 'X-Fieldwork-Owner': owner } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw Object.assign(new Error('You’re offline. Changes are saved on this device.'), { status: 0 });
  }
  // Platform errors (413/502/504) are not JSON; never surface a parser error.
  const json = await res.json().catch(() => ({}) as { error?: string });
  if (!res.ok || res.status === 202) {
    const error = new Error(
      (json as { error?: string }).error ||
        (res.status >= 500 ? 'The server had a problem. Your change is kept on this device.' : 'This did not save. Try again.'),
    ) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return json as T;
}
// A change the server permanently rejects must not block every later change.
const retryable = (e: unknown) => {
  const status = (e as { status?: number }).status ?? 0;
  return status === 0 || status === 409 || status === 429 || status >= 500;
};
// Replaying a queued change that no longer applies must not break the view.
function safeApply(state: AppState, c: Command) {
  try {
    return applyCommand(state, c);
  } catch {
    return state;
  }
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
      await localSet(owner, 'state', next).catch(() => {});
    },
    [owner],
  );
  const sync = useCallback(async () => {
    if (demo || syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      queue.current = (await savedQueue(owner).catch(() => queue.current)) || [];
      let setAside = false;
      while (queue.current.length) {
        const c = queue.current[0];
        let result: { state: AppState; ownerId: string };
        try {
          result = await api<{ state: AppState; ownerId: string }>('/api/actions', c, 'POST', owner);
        } catch (e) {
          if (retryable(e)) throw e;
          queue.current = await updateQueue(owner, c.eventId);
          setPending(queue.current.length);
          setError(`One change couldn’t be saved and was set aside: ${(e as Error).message}`);
          setAside = true;
          continue;
        }
        if (result.ownerId !== owner)
          throw new Error('Your account changed. Reload before syncing.');
        queue.current = await updateQueue(owner, c.eventId);
        setPending(queue.current.length);
        await publish(
          queue.current.reduce((s, x) => safeApply(s, x), result.state),
        );
        channel.current?.postMessage('changed');
      }
      const fresh = await api<{ state: AppState; ownerId: string }>(
        '/api/state',
      );
      if (fresh.ownerId !== owner)
        throw new Error('Your account changed. Reload before syncing.');
      await publish(
        queue.current.reduce((s, c) => safeApply(s, c), fresh.state),
      );
      if (!setAside) setError('');
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
      // Local storage can be unavailable (private mode, blocked site data).
      // The app still opens from the server in that case.
      try {
        await claimLocal(owner);
        const cached = await savedState(owner);
        queue.current = (await savedQueue(owner)) || [];
        if (!active) return;
        setPending(queue.current.length);
        if (cached) {
          current.current = cached;
          setState(cached);
        }
      } catch {
        queue.current = [];
      }
      if (!active) return;
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
      const next = applyCommand(current.current, c); // throws before queueing an invalid change
      queue.current = await updateQueue(owner, c);
      setPending(queue.current.length);
      await publish(next);
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
