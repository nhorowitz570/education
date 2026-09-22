'use client';
import { useEffect, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useWorkspace } from '@/lib/client/workspace';
import { clearLocal } from '@/lib/client/storage';
import { browserClient } from '@/lib/supabase/client';
import type { AppConfig } from '@/lib/types';
import { Icon } from './icons';
import { Button } from './ui';
import { Today, Learn, Progress } from './learning';
import { LessonView } from './lesson';
import { ImportView } from './import';
import { Growth } from './growth';
import { Voice } from './voice';
import { Settings, Checkin, Schedule, Reflection } from './settings';
import { InstallControl } from './pwa';
export type Route =
  | 'today'
  | 'learn'
  | 'growth'
  | 'progress'
  | 'import'
  | 'lesson'
  | 'voice'
  | 'settings';
export type Workspace = ReturnType<typeof useWorkspace>;
export type ViewProps = {
  w: Workspace;
  config: AppConfig;
  owner: string;
  go: (r: Route) => void;
  start: (sessionId: string, reviewOf?: string) => void;
  today: string;
  open: (modal: string) => void;
};
export function App({
  config,
  user,
}: {
  config: AppConfig;
  user: { id: string; email?: string } | null;
}) {
  return !user && !config.demo ? (
    <Auth config={config} />
  ) : (
    <WorkspaceApp config={config} user={user} />
  );
}
function WorkspaceApp({
  config,
  user,
}: {
  config: AppConfig;
  user: { id: string; email?: string } | null;
}) {
  const owner = config.demo ? 'preview' : user!.id,
    w = useWorkspace(owner, config.demo);
  const [route, setRoute] = useState<Route>('today'),
    [selected, setSelected] = useState({
      sessionId: 'w01-monday',
      reviewOf: undefined as string | undefined,
    }),
    [modal, setModal] = useState(''),
    [dark, setDark] = useState(false);
  const go = (r: Route) => {
    const change = () => {
      flushSync(() => setRoute(r));
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    if (
      document.startViewTransition &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      document.startViewTransition(change);
    else change();
  };
  useLayoutEffect(() => {
    const preference = localStorage.getItem('fieldwork-theme');
    setDark(
      preference
        ? preference === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches,
    );
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('fieldwork-theme', dark ? 'dark' : 'light');
  }, [dark]);
  const now = config.demo
    ? '2026-09-28'
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: w.state.plan?.schedule.timezone || 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
  const today = now.match(/^\d{4}-/) ? now : now.split('/').reverse().join('-');
  const props: ViewProps = {
    w,
    config,
    owner,
    go,
    today,
    open: setModal,
    start: (sessionId, reviewOf) => {
      setSelected({ sessionId, reviewOf });
      go('lesson');
    },
  };
  useEffect(() => {
    if (config.demo || !user) return;
    const { data } = browserClient().auth.onAuthStateChange(
      (event, session) => {
        if (
          event === 'SIGNED_OUT' ||
          (session && session.user.id !== user.id)
        ) {
          void clearLocal().then(() => location.assign('/'));
        }
      },
    );
    return () => data.subscription.unsubscribe();
  }, [config.demo, user]);
  const name = w.state.plan?.profile.name || 'Your space',
    active = route === 'lesson' ? 'learn' : route;
  async function logout() {
    await clearLocal();
    if (!config.demo) await browserClient().auth.signOut();
    window.location.href = '/';
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the task
      </a>
      <div className="app-shell">
        <nav className="rail" aria-label="Main navigation">
          <button
            className="brand circle"
            onClick={() => go('today')}
            aria-label="Fieldwork home"
          >
            <Icon name="book" />
          </button>
          <div className="nav-items">
            {(['today', 'learn', 'growth', 'progress'] as const).map((r, i) => (
              <button
                key={r}
                className={'nav-item ' + (active === r ? 'active' : '')}
                aria-current={active === r ? 'page' : undefined}
                onClick={() => go(r)}
              >
                <span className="circle">
                  <Icon name={['home', 'book', 'growth', 'progress'][i]} />
                </span>
                <span>{r[0].toUpperCase() + r.slice(1)}</span>
              </button>
            ))}
          </div>
          <div className="rail-bottom">
            <button
              className="circle"
              aria-label={dark ? 'Use light theme' : 'Use dark theme'}
              onClick={() => setDark(!dark)}
            >
              <Icon name={dark ? 'moon' : 'sun'} />
            </button>
            <button
              className="circle avatar"
              aria-label="Settings and profile"
              onClick={() => go('settings')}
            >
              {name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </button>
          </div>
        </nav>
        <div className="app-content">
          <header className="mobile-header">
            <button className="wordmark" onClick={() => go('today')}>
              <Icon name="book" />
              Fieldwork
            </button>
            <button
              className="icon-button"
              aria-label="Settings"
              onClick={() => go('settings')}
            >
              <Icon name="settings" />
            </button>
          </header>
          {config.demo && (
            <div className="preview-notice">
              <div className="preview-details">
                <span className="preview-label">Design preview</span>
                <span>Example plan · saved on this device</span>
              </div>
              <a href="/">
                Use my account <Icon name="arrow" size={16} />
              </a>
            </div>
          )}
          {(!w.online || w.pending > 0 || w.error) && (
            <div className="status-banner" role="status">
              {w.error ||
                (!w.online
                  ? 'You’re offline. Saved lessons and local logging are available.'
                  : `${w.pending} change${w.pending === 1 ? '' : 's'} waiting to sync.`)}
              {w.online && w.pending > 0 && (
                <button onClick={() => void w.sync()}>Retry sync</button>
              )}
            </div>
          )}
          <main id="main" tabIndex={-1}>
            {!w.ready ? (
              <div className="loading">
                <span className="loader" />
                <h1>Opening your space.</h1>
              </div>
            ) : route === 'lesson' ? (
              <LessonView {...props} {...selected} />
            ) : route === 'import' ? (
              <ImportView {...props} />
            ) : route === 'growth' ? (
              <Growth {...props} />
            ) : route === 'voice' ? (
              <Voice {...props} />
            ) : route === 'settings' ? (
              <Settings
                {...props}
                dark={dark}
                setDark={setDark}
                logout={logout}
              />
            ) : !w.state.plan ? (
              <ImportView {...props} />
            ) : route === 'learn' ? (
              <Learn {...props} />
            ) : route === 'progress' ? (
              <Progress {...props} />
            ) : (
              <Today {...props} />
            )}
          </main>
          <InstallControl pending={w.pending} />
        </div>
      </div>
      {modal === 'checkin' && <Checkin {...props} close={() => setModal('')} />}{' '}
      {(modal === 'schedule' || modal === 'short') && (
        <Schedule {...props} mode={modal} close={() => setModal('')} />
      )}{' '}
      {modal === 'reflection' && (
        <Reflection {...props} close={() => setModal('')} />
      )}
    </>
  );
}
function Auth({ config }: { config: AppConfig }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('auth_error') === 'link')
      setMessage(
        'That sign-in link expired or was already used. Request a new link and try again.',
      );
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!config.supabase) {
      setMessage(
        'Supabase is not configured yet. You can explore the local design preview.',
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const client = browserClient();
      const result =
        mode === 'signup'
          ? await client.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: location.origin + '/auth/callback' },
            })
          : mode === 'reset'
            ? await client.auth.resetPasswordForEmail(email, {
                redirectTo:
                  location.origin + '/auth/callback?next=/reset-password',
              })
            : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (mode === 'signin') {
        await clearLocal();
        location.href = '/';
      } else
        setMessage(
          mode === 'signup'
            ? 'Check your email to confirm your private account.'
            : 'Check your email for a password reset link.',
        );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Sign-in failed. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="wordmark">
          <Icon name="book" />
          Fieldwork
        </div>
        <h1>
          Invest in
          <br />
          your next
          <br />
          <span>chapter.</span>
        </h1>
        <p>
          A little learning.
          <br />
          Useful practice.
          <br />
          Room to grow.
        </p>
        <div className="auth-shapes" aria-hidden="true">
          <div className="mint">
            <Icon name="book" size={42} />
          </div>
          <div className="lavender">
            <Icon name="chat" size={42} />
          </div>
          <div className="peach">
            <Icon name="growth" size={42} />
          </div>
        </div>
      </section>
      <section className="auth-form">
        <div className="eyebrow">EDUCATION & GROWTH</div>
        <h2>
          {mode === 'signup'
            ? 'Make room for growth.'
            : mode === 'reset'
              ? 'Find your way back.'
              : 'Welcome to your space.'}
        </h2>
        <p>
          {mode === 'signup'
            ? 'Your own account. Your own plan.'
            : 'One clear next step, whenever you’re ready.'}
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {mode !== 'reset' && (
            <label>
              Password
              <input
                type="password"
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? 'One moment…'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'reset'
                  ? 'Send reset link'
                  : 'Sign in'}
            <Icon name="arrow" />
          </Button>
          <p className="form-message" role="status">
            {message}
          </p>
        </form>
        <div className="row wrap">
          <button
            className="text-button"
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup');
              setMessage('');
            }}
          >
            {mode === 'signup'
              ? 'Sign in instead'
              : 'Create an account'}
          </button>
          <button
            className="text-button"
            onClick={() => {
              setMode(mode === 'reset' ? 'signin' : 'reset');
              setMessage('');
            }}
          >
            {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
          </button>
        </div>
        <a className="preview-link" href="/?preview=1">
          Explore the design preview <Icon name="arrow" size={18} />
        </a>
      </section>
    </div>
  );
}
