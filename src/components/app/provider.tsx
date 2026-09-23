'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWorkspace } from '@/lib/client/workspace';
import { clearLocal } from '@/lib/client/storage';
import { browserClient } from '@/lib/supabase/client';
import type { AppConfig } from '@/lib/types';
import { PREFS_RECORD, patchPrefs, prefsOf, type Prefs } from '@/lib/prefs';
import { setSound } from '@/lib/client/sound';
import { DEVICE_RECORD, deviceZone, zoneOf } from '@/lib/zone';

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
  prefs: Prefs;
  setPrefs: <G extends keyof Prefs>(group: G, value: Prefs[G] extends object ? Partial<Prefs[G]> : Prefs[G]) => void;
  signOut: () => Promise<void>;
};
const AppContext = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
};

export const THEME_KEY = 'fieldwork-theme';
// Reading preferences are mirrored here so the first paint already uses them;
// the layout's inline script reads this before hydration.
export const READING_KEY = 'fieldwork-reading';
export function applyReading(r: Prefs['reading']) {
  const d = document.documentElement.dataset;
  const set = (k: string, v: string, fallback: string) => (v === fallback ? delete d[k] : (d[k] = v));
  set('appFont', r.appFont, 'sans');
  set('lessonFont', r.lessonFont, 'serif');
  set('textSize', r.size, 'm');
  set('line', r.width, 'normal');
  set('motion', r.motion, 'system');
}
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
  // Demo keeps everything on this device (the dev preview uses it).
  const w = useWorkspace(user.id, config.demo);
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
  // The device's own timezone decides "today", and is kept as a synced
  // setting so the server's greetings, reminders and streaks agree.
  const zone = deviceZone() || zoneOf(w.state);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
  const savedZone = w.state.records.find((r) => r.id === DEVICE_RECORD)?.data.timezone;
  useEffect(() => {
    if (w.ready && zone !== savedZone) void w.record('settings', DEVICE_RECORD, { timezone: zone });
  }, [w, zone, savedZone]);
  const prefs = useMemo(() => prefsOf(w.state), [w.state]);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const record = w.record;
  const setPrefs = useCallback<Ctx['setPrefs']>(
    (group, value) => void record('settings', PREFS_RECORD, patchPrefs(prefsRef.current, group, value)),
    [record],
  );
  useEffect(() => setSound(prefs.sound), [prefs.sound]);
  const reading = JSON.stringify(prefs.reading);
  useEffect(() => {
    if (!w.ready) return;
    applyReading(JSON.parse(reading));
    try {
      localStorage.setItem(READING_KEY, reading);
    } catch {}
  }, [reading, w.ready]);
  const value = useMemo(
    () => ({ user, config, w, today, toast, theme, setTheme, prefs, setPrefs, signOut }),
    [user, config, w, today, toast, theme, setTheme, prefs, setPrefs, signOut],
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
