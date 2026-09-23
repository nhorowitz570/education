'use client';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { api } from '@/lib/client/api';
import type { RunView } from '@/lib/learning/run';
import { useApp } from './provider';

// Props contract used by the Life and settings screens that predate the new
// router. `go` maps the old route names to URLs; `start` opens a session run.
export type Route = 'today' | 'learn' | 'growth' | 'progress' | 'import' | 'lesson' | 'voice' | 'settings';
const PATHS: Record<Route, string> = {
  today: '/',
  learn: '/learn',
  growth: '/life',
  progress: '/mastery',
  import: '/import',
  lesson: '/',
  voice: '/practice',
  settings: '/you',
};
export type ViewProps = ReturnType<typeof useViewProps>;
export function useViewProps(open: (modal: string) => void = () => {}) {
  const app = useApp();
  const router = useRouter();
  return useMemo(
    () => ({
      w: app.w,
      config: app.config,
      owner: app.user.id,
      today: app.today,
      go: (r: Route) => router.push(PATHS[r] || '/'),
      start: async (sessionId: string) => {
        const { run } = await api<{ run: RunView }>('/api/runs', { kind: 'session', sessionId });
        router.push('/session/' + run.id);
      },
      open,
    }),
    [app.w, app.config, app.user.id, app.today, router, open],
  );
}
