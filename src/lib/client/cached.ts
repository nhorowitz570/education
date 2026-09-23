'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';

// Stale-while-revalidate for read endpoints: paint the last response at once,
// refresh in the background, and again when the app returns to the foreground.
export function useCached<T>(path: string | null, owner: string) {
  const key = path ? `fw:${owner}:${path}` : null;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Read the cache after hydration (before paint) so server and client agree.
  useLayoutEffect(() => {
    if (!key) return;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        setData(JSON.parse(raw) as T);
        setLoading(false);
      }
    } catch {}
  }, [key]);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    if (!path || !key) return;
    try {
      const fresh = await api<T>(path);
      if (!alive.current) return;
      setData(fresh);
      setError('');
      try {
        sessionStorage.setItem(key, JSON.stringify(fresh));
      } catch {}
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path, key]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  return { data, error, loading, refresh };
}
