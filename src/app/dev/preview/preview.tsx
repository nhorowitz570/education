'use client';
import { useEffect, type ReactNode } from 'react';
import { AppProvider, useApp } from '@/components/app/provider';
import { Shell } from '@/components/app/shell';
import { You } from '@/components/you/you';
import { PracticeHub } from '@/components/practice/hub';
import { Notebook } from '@/components/notebook/notebook';
import { Complete } from '@/components/session/complete';
import { Runner } from '@/components/session/runner';
import { Today } from '@/components/today/today';
import { Learn } from '@/components/learn/learn';
import { Mastery } from '@/components/mastery/mastery';
import { Insights } from '@/components/insights/insights';
import { Life } from '@/components/life/life';
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
    // Streamed endpoints: snapshots arrive in uneven bursts, like a real model.
    if (body && typeof body === 'object' && '__stream' in body) {
      const events = (body as { __stream: unknown[] }).__stream;
      const enc = new TextEncoder();
      return new Response(
        new ReadableStream({
          async start(c) {
            for (const e of events) {
              await new Promise((r) => setTimeout(r, 25 + Math.random() * 90));
              c.enqueue(enc.encode(JSON.stringify(e) + '\n'));
            }
            c.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
      );
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

// Layout audit for development: window.__audit() lists anything that spills
// off the page, is clipped, or overlaps other text.
if (typeof window !== 'undefined')
  (window as unknown as { __audit: () => string[] }).__audit = () => {
  const W = innerWidth, out: string[] = [];
  const vis = (el: Element) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const name = (el: Element) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const fixed = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true; return false; };
  if (document.documentElement.scrollWidth > W + 1) out.push('PAGE-SCROLL-X ' + document.documentElement.scrollWidth + '>' + W);
  const all = [...document.querySelectorAll('main *, nav *, .tutor-panel *')];
  for (const el of all) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > W + 1 && !el.closest('.viz-scroll,.tutor-chips,.dock-chips')) out.push('OFF-RIGHT ' + name(el) + ' ' + Math.round(r.right));
    const s = getComputedStyle(el);
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis') out.push('CLIP-X ' + name(el) + ' ' + el.scrollWidth + '>' + el.clientWidth + ' "' + (el.textContent || '').trim().slice(0, 30) + '"');
    if ((s.overflowY === 'hidden' || s.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 3 && !/-webkit-box/.test(s.display)) out.push('CLIP-Y ' + name(el) + ' ' + el.scrollHeight + '>' + el.clientHeight + ' "' + (el.textContent || '').trim().slice(0, 30) + '"');
  }
  const leaves = all
    .filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()))
    .map((e) => ({ e, r: e.getBoundingClientRect(), f: fixed(e) }))
    .filter((x) => x.r.width && x.r.height && x.r.bottom > 0 && x.r.top < innerHeight * 4);
  for (let i = 0; i < leaves.length; i++)
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j];
      if (a.e.contains(b.e) || b.e.contains(a.e) || a.f !== b.f) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 3 && iy > 3) out.push('OVERLAP ' + name(a.e) + ' "' + (a.e.textContent || '').trim().slice(0, 24) + '" × ' + name(b.e) + ' "' + (b.e.textContent || '').trim().slice(0, 24) + '"');
    }
  return [...new Set(out)].slice(0, 50);
};

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
    case 'today':
      return <Today />;
    case 'learn':
      return <Learn />;
    case 'mastery':
      return <Mastery />;
    case 'insights':
      return <Insights />;
    case 'life':
      return <Life />;
    default:
      return <p className="page">Preview: /dev/preview/you, /notebook, /practice, /complete</p>;
  }
}
