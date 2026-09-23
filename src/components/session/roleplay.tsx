'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Conversation } from '@/components/practice/conversation';
import { Building } from './beat';
import type { Beat, RunView } from '@/lib/learning/run';
import type { PracticeView } from '@/lib/server/practice';

// The spoken part of a session: a practice conversation built from the
// session's own scenario, embedded in place.
export function Roleplay({ run, beat, onDone }: { run: RunView; beat: Beat; onDone: () => void }) {
  const [practice, setPractice] = useState<PracticeView | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const existing = beat.practice?.id;
        const r = existing
          ? await api<{ practice: PracticeView }>(`/api/practice/${existing}`)
          : await api<{ practice: PracticeView }>('/api/practice', {
              mode: /negotiat/i.test(run.title) ? 'negotiation' : /delegat/i.test(run.title) ? 'delegation' : 'conversation',
              topic: `${run.title}. ${run.session?.objective || ''}`.slice(0, 600),
              difficulty: 'realistic',
              minutes: 8,
              voice: 'cedar',
              parent: { runId: run.id, beatId: beat.id },
            });
        if (alive) setPractice(r.practice);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [beat.id, beat.practice?.id, run.id, run.title, run.session?.objective]);
  if (error) return <p className="conversation-error">{error}</p>;
  if (!practice) return <Building label="Casting your counterpart" />;
  return <Conversation initial={practice} embedded onDone={() => onDone()} />;
}
