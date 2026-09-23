'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWorkspace } from '@/lib/client/workspace';
import { clearLocal } from '@/lib/client/storage';
import { browserClient } from '@/lib/supabase/client';
import type { AppConfig } from '@/lib/types';

export type Theme = 'system' | 'dark' | 'light';
type Toast = { id: number; message: string; action?: { label: string; run: () => void } };
type Ctx = {
  user: { id: string; email?: string };
  config: AppConfig;
  w: ReturnType<typeof useWorkspace>;
  today: string;
  toast: (message: string, action?: Toast['action']) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  signOut: () => Promise<void>;
};
const AppContext = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
};

export const THEME_KEY = 'fieldwork-theme';
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', t === 'system' ? (m.getAttribute('media')?.includes('dark') ? '#09090a' : '#f5f4f0') : dark ? '#09090a' : '#f5f4f0'));
}

export function AppProvider({
  user,
  config,
  children,
}: {
  user: { id: string; email?: string };
  config: AppConfig;
  children: ReactNode;
}) {
  const w = useWorkspace(user.id, false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<Theme>('system');
  const seq = useRef(0);
  useEffect(() => {
    try {
      setThemeState((localStorage.getItem(THEME_KEY) as Theme) || 'system');
    } catch {}
  }, []);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {}
    applyTheme(t);
  }, []);
  const toast = useCallback((message: string, action?: Toast['action']) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-1), { id, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3200);
  }, []);
  const signOut = useCallback(async () => {
    await clearLocal().catch(() => {});
    await browserClient().auth.signOut();
    window.location.href = '/welcome';
  }, []);
  // Another tab signing out (or a different account) must not leave this one
  // showing someone else's data.
  useEffect(() => {
    const { data } = browserClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session && session.user.id !== user.id))
        void clearLocal()
          .catch(() => {})
          .then(() => location.assign('/welcome'));
    });
    return () => data.subscription.unsubscribe();
  }, [user.id]);
  const zone = w.state.plan?.schedule.timezone || 'America/Los_Angeles';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
  const value = useMemo(
    () => ({ user, config, w, today, toast, theme, setTheme, signOut }),
    [user, config, w, today, toast, theme, setTheme, signOut],
  );
  return (
    <AppContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="sr-only" />
      {toasts.map((t) => (
        <div className="toast" role="status" key={t.id}>
          <span>{t.message}</span>
          {t.action && (
            <button
              className="btn small"
              onClick={() => {
                t.action!.run();
                setToasts((x) => x.filter((y) => y.id !== t.id));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </AppContext.Provider>
  );
}
