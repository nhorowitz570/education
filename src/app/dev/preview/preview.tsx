'use client';
import { useEffect, type ReactNode } from 'react';
import { AppProvider, useApp } from '@/components/app/provider';
import { Shell } from '@/components/app/shell';
import { You } from '@/components/you/you';
import { PracticeHub } from '@/components/practice/hub';
import { Notebook } from '@/components/notebook/notebook';
import { Complete } from '@/components/session/complete';
import { Runner } from '@/components/session/runner';
import { toRolling } from '@/lib/rolling';
import type { AppConfig } from '@/lib/types';
import { FIXTURES, RUN } from './fixtures';

// Dev only. The API is answered from fixtures so screens render with
// realistic content and no account; writes are accepted and echoed.
if (typeof window !== 'undefined' && !(window as { __previewFetch?: boolean }).__previewFetch) {
  (window as { __previewFetch?: boolean }).__previewFetch = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return real(input, init);
    const method = (init?.method || 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    const hit = FIXTURES[key] ?? FIXTURES[url.pathname];
    const body = typeof hit === 'function' ? hit(url, init?.body ? JSON.parse(String(init.body)) : undefined) : hit;
    if (body === undefined) return new Response(JSON.stringify({ error: 'Not available in the preview.' }), { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

const CONFIG: AppConfig = { supabase: false, backend: false, ai: true, voice: true, voiceProvider: 'live', push: true, demo: true };

export function Preview({ children }: { children: ReactNode }) {
  return (
    <AppProvider user={{ id: 'preview', email: 'learner@example.com' }} config={CONFIG}>
      <RollingPlan />
      <Shell>{children}</Shell>
    </AppProvider>
  );
}

// The demo plan predates week-at-a-time plans; convert it so Rhythm works.
function RollingPlan() {
  const { w, today } = useApp();
  const plan = w.state.plan;
  useEffect(() => {
    if (plan && !plan.horizon) void w.replace({ ...w.state, plan: toRolling(plan, { today }) });
  }, [plan, today, w]);
  return null;
}

export function Screen({ path }: { path: string[] }) {
  switch (path[0]) {
    case 'you':
      return <You />;
    case 'practice':
      return <PracticeHub />;
    case 'notebook':
      return <Notebook />;
    case 'complete':
      return <Complete run={RUN} fresh />;
    case 'session':
      return <Runner id="r2" />;
    default:
      return <p className="page">Preview: /dev/preview/you, /notebook, /practice, /complete</p>;
  }
}
