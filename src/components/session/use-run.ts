'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, stream, ApiError } from '@/lib/client/api';
import type { Ask, AskIntent, Beat, Block, Feedback, RunView } from '@/lib/learning/run';

type Live = { partial: Block[]; error?: string };
type LiveFeedback = { verdict?: Feedback['verdict']; blocks: Block[] };
type LiveAsk = { prompt: string; intent: AskIntent; partial: Block[]; error?: string };

const TEACH = new Set(['situation', 'explain', 'recap']);
export const hasContent = (b: Beat | undefined) => !!b && (b.type === 'break' || !!b.blocks);

// Client state for one session run: loads it, generates each step when it is
// reached, prepares the next step in the background, and streams answers and
// questions into place.
export function useRun(id: string) {
  const [run, setRun] = useState<RunView | null>(null),
    [index, setIndex] = useState(0),
    [error, setError] = useState(''),
    [live, setLive] = useState<Record<string, Live>>({}),
    [grading, setGrading] = useState<Record<string, LiveFeedback>>({}),
    [asking, setAsking] = useState<Record<string, LiveAsk>>({}),
    [finishing, setFinishing] = useState(false);
  const runRef = useRef<RunView | null>(null),
    inflight = useRef(new Map<string, Promise<void>>()),
    aborts = useRef<AbortController[]>([]);
  runRef.current = run;

  const patchBeat = useCallback((beatId: string, patch: Partial<Beat>) => {
    setRun((r) => (r ? { ...r, beats: r.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b)) } : r));
  }, []);

  const load = useCallback(async () => {
    try {
      const { run } = await api<{ run: RunView }>(`/api/runs/${id}`);
      setRun(run);
      setIndex((i) => (i ? i : Math.min(run.cursor, run.beats.length - 1)));
      return run;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);
  useEffect(() => {
    void load();
    const current = aborts.current;
    return () => current.forEach((a) => a.abort());
  }, [load]);

  const ensure = useCallback(
    (beatId: string): Promise<void> => {
      const beat = runRef.current?.beats.find((b) => b.id === beatId);
      if (!beat || hasContent(beat)) return Promise.resolve();
      const existing = inflight.current.get(beatId);
      if (existing) return existing;
      const controller = new AbortController();
      aborts.current.push(controller);
      setLive((l) => ({ ...l, [beatId]: { partial: [] } }));
      const job = (async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            const done = await stream<Beat>(
              `/api/runs/${id}`,
              { action: 'beat', beatId },
              {
                onSnap: (d) =>
                  setLive((l) => ({ ...l, [beatId]: { partial: ((d as { blocks?: Block[] }).blocks || []) } })),
              },
              controller.signal,
            );
            patchBeat(beatId, done);
            setLive((l) => {
              const next = { ...l };
              delete next[beatId];
              return next;
            });
            return;
          } catch (e) {
            if ((e as Error).name === 'AbortError') return;
            // Another request is already preparing this step: wait for it.
            if (e instanceof ApiError && e.status === 425 && attempt < 20) {
              await new Promise((r) => setTimeout(r, 1500));
              const fresh = await load();
              if (hasContent(fresh?.beats.find((b) => b.id === beatId))) {
                setLive((l) => {
                  const next = { ...l };
                  delete next[beatId];
                  return next;
                });
                return;
              }
              continue;
            }
            setLive((l) => ({ ...l, [beatId]: { partial: l[beatId]?.partial || [], error: (e as Error).message } }));
            return;
          }
        }
      })().finally(() => inflight.current.delete(beatId));
      inflight.current.set(beatId, job);
      return job;
    },
    [id, load, patchBeat],
  );

  const retry = useCallback(
    (beatId: string) => {
      setLive((l) => {
        const next = { ...l };
        delete next[beatId];
        return next;
      });
      void ensure(beatId);
    },
    [ensure],
  );

  // Generate the focused step; once it has content, prepare the next one so
  // it is ready before the learner is.
  const current = run?.beats[index];
  const currentReady = hasContent(current);
  useEffect(() => {
    if (!run || !current) return;
    void ensure(current.id);
    if (!currentReady) return;
    const upcoming = run.beats.slice(index + 1).find((b) => b.type !== 'break');
    if (upcoming && !hasContent(upcoming) && !upcoming.optional) {
      const t = setTimeout(() => void ensure(upcoming.id), TEACH.has(current.type) ? 300 : 900);
      return () => clearTimeout(t);
    }
  }, [run, current, currentReady, index, ensure]);

  const answer = useCallback(
    async (beatId: string, response: { choice?: number; text?: string }) => {
      patchBeat(beatId, { response: { ...response, at: new Date().toISOString() }, status: 'answered' });
      setGrading((g) => ({ ...g, [beatId]: { blocks: [] } }));
      try {
        const done = await stream<Beat>(
          `/api/runs/${id}`,
          { action: 'answer', beatId, ...response },
          {
            onSnap: (d) => {
              const f = (d as { feedback?: LiveFeedback }).feedback;
              if (f) setGrading((g) => ({ ...g, [beatId]: { verdict: f.verdict, blocks: f.blocks || [] } }));
            },
          },
        );
        patchBeat(beatId, done);
      } catch (e) {
        patchBeat(beatId, { response: undefined, status: 'ready' });
        setError((e as Error).message);
      } finally {
        setGrading((g) => {
          const next = { ...g };
          delete next[beatId];
          return next;
        });
      }
    },
    [id, patchBeat],
  );

  const ask = useCallback(
    async (beatId: string, intent: AskIntent, prompt = '') => {
      setAsking((a) => ({ ...a, [beatId]: { prompt, intent, partial: [] } }));
      try {
        const done = await stream<Ask>(
          `/api/runs/${id}`,
          { action: 'ask', beatId, intent, prompt },
          {
            onSnap: (d) =>
              setAsking((a) => ({
                ...a,
                [beatId]: { prompt, intent, partial: (d as { blocks?: Block[] }).blocks || [] },
              })),
          },
        );
        setRun((r) =>
          r
            ? {
                ...r,
                beats: r.beats.map((b) => (b.id === beatId ? { ...b, asks: [...(b.asks || []), done] } : b)),
              }
            : r,
        );
        setAsking((a) => {
          const next = { ...a };
          delete next[beatId];
          return next;
        });
      } catch (e) {
        setAsking((a) => ({ ...a, [beatId]: { prompt, intent, partial: [], error: (e as Error).message } }));
      }
    },
    [id],
  );
  const dismissAsk = useCallback((beatId: string) => {
    setAsking((a) => {
      const next = { ...a };
      delete next[beatId];
      return next;
    });
  }, []);

  const next = useCallback(
    async (skip = false) => {
      const r = runRef.current;
      if (!r) return;
      const beat = r.beats[index];
      if (!beat) return;
      patchBeat(beat.id, { status: skip ? 'skipped' : beat.status === 'done' ? 'done' : 'done' });
      setIndex((i) => Math.min(i + 1, r.beats.length - 1));
      try {
        await api(`/api/runs/${id}`, { action: 'advance', beatId: beat.id, skip });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [id, index, patchBeat],
  );

  const finish = useCallback(async () => {
    const r = runRef.current;
    if (!r) return;
    setFinishing(true);
    try {
      const last = r.beats[index];
      if (last && last.status !== 'done') await api(`/api/runs/${id}`, { action: 'advance', beatId: last.id });
      await api(`/api/runs/${id}`, { action: 'finish' });
      setRun((x) => (x ? { ...x, status: 'done' } : x));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFinishing(false);
    }
  }, [id, index]);

  return {
    run,
    index,
    setIndex,
    error,
    setError,
    live,
    grading,
    asking,
    finishing,
    retry,
    answer,
    ask,
    dismissAsk,
    next,
    finish,
    reload: load,
  };
}
export type RunState = ReturnType<typeof useRun>;
