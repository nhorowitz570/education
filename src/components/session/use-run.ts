'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, stream, ApiError } from '@/lib/client/api';
import type { Ask, AskIntent, Beat, Block, Confidence, Feedback, Gauge, RunView } from '@/lib/learning/run';

type Live = { partial: Block[]; error?: string };
type LiveFeedback = { verdict?: Feedback['verdict']; blocks: Block[] };
type LiveAsk = { prompt: string; intent: AskIntent; quote?: string; partial: Block[]; error?: string };

const TEACH = new Set(['situation', 'orient', 'explain', 'worked', 'recap']);
const IDLE = 12 * 60000;
export const hasContent = (b: Beat | undefined) => !!b && (b.type === 'break' || !!b.blocks);

// Client state for one session run: loads it, generates each step when it is
// reached, prepares the next step in the background, and streams answers and
// questions into place.
// A run the previous screen just created, handed over so the session opens
// on its content (and its title can carry over) instead of a loading state.
const primed = new Map<string, RunView>();
export const primeRun = (run: RunView) => void primed.set(run.id, run);

export function useRun(id: string) {
  const [run, setRun] = useState<RunView | null>(() => primed.get(id) ?? null),
    [index, setIndex] = useState(() => {
      const r = primed.get(id);
      return r ? Math.min(r.cursor, r.beats.length - 1) : 0;
    }),
    [error, setError] = useState(''),
    [live, setLive] = useState<Record<string, Live>>({}),
    [grading, setGrading] = useState<Record<string, LiveFeedback>>({}),
    [asking, setAsking] = useState<Record<string, LiveAsk>>({}),
    [finishing, setFinishing] = useState(false),
    [wrapping, setWrapping] = useState(false),
    // Active minutes, kept in step with the server's clock: each interaction
    // adds the time since the last one, capped so stepping away doesn't count.
    [clock, setClock] = useState({ elapsed: 0, at: 0 });
  const runRef = useRef<RunView | null>(null),
    inflight = useRef(new Map<string, Promise<void>>()),
    aborts = useRef<AbortController[]>([]);
  runRef.current = run;

  const patchBeat = useCallback((beatId: string, patch: Partial<Beat>) => {
    setRun((r) => (r ? { ...r, beats: r.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b)) } : r));
  }, []);
  // The server's plan is authoritative for which steps exist; anything this
  // client already has (content streamed in, an answer in flight) is kept.
  const mergeBeats = useCallback((server: Beat[]) => {
    setRun((r) => {
      if (!r) return r;
      const mine = new Map(r.beats.map((b) => [b.id, b]));
      return {
        ...r,
        beats: server.map((b) => {
          const m = mine.get(b.id);
          if (!m) return b;
          return { ...b, ...m, ...(b.feedback && !m.feedback ? { feedback: b.feedback } : {}), status: rank(m.status) >= rank(b.status) ? m.status : b.status };
        }),
      };
    });
  }, []);
  const touch = useCallback(() => {
    setClock((c) => {
      const now = Date.now();
      return { elapsed: c.elapsed + Math.min(now - c.at, IDLE) / 60000, at: now };
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const { run } = await api<{ run: RunView }>(`/api/runs/${id}`);
      primed.delete(id);
      setRun(run);
      setIndex((i) => (i ? i : Math.min(run.cursor, run.beats.length - 1)));
      setClock({ elapsed: run.elapsed || 0, at: Date.now() });
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
    async (beatId: string, response: { choice?: number; text?: string; confidence?: Confidence; unknown?: boolean }, retry = false) => {
      const before = runRef.current?.beats.find((b) => b.id === beatId);
      touch();
      patchBeat(beatId, {
        response: { ...response, at: new Date().toISOString() },
        status: 'answered',
        // A retry keeps the first try visible above the new one.
        ...(retry && before?.response && before.feedback
          ? { attempts: [...(before.attempts || []), { response: before.response, feedback: before.feedback }], feedback: undefined }
          : {}),
      });
      setGrading((g) => ({ ...g, [beatId]: { blocks: [] } }));
      try {
        const done = await stream<Beat>(
          `/api/runs/${id}`,
          { action: 'answer', beatId, ...response, retry },
          {
            onSnap: (d) => {
              const f = (d as { feedback?: LiveFeedback }).feedback;
              if (f) setGrading((g) => ({ ...g, [beatId]: { verdict: f.verdict, blocks: f.blocks || [] } }));
            },
            onPlan: (beats) => mergeBeats(beats as Beat[]),
          },
        );
        patchBeat(beatId, done);
      } catch (e) {
        patchBeat(
          beatId,
          retry && before
            ? { response: before.response, feedback: before.feedback, attempts: before.attempts, status: before.status }
            : { response: undefined, status: 'ready' },
        );
        setError((e as Error).message);
      } finally {
        setGrading((g) => {
          const next = { ...g };
          delete next[beatId];
          return next;
        });
      }
    },
    [id, patchBeat, mergeBeats, touch],
  );

  const ask = useCallback(
    async (beatId: string, intent: AskIntent, prompt = '', quote?: string) => {
      setAsking((a) => ({ ...a, [beatId]: { prompt, intent, quote, partial: [] } }));
      try {
        const done = await stream<Ask>(
          `/api/runs/${id}`,
          { action: 'ask', beatId, intent, prompt, ...(quote ? { quote } : {}) },
          {
            onSnap: (d) =>
              setAsking((a) => ({
                ...a,
                [beatId]: { prompt, intent, quote, partial: (d as { blocks?: Block[] }).blocks || [] },
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
        setAsking((a) => ({ ...a, [beatId]: { prompt, intent, quote, partial: [], error: (e as Error).message } }));
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
      patchBeat(beat.id, { status: skip ? 'skipped' : 'done' });
      touch();
      // Normally the next step is already planned; if not, the server plans
      // it now and the session moves on when it arrives.
      const known = index + 1 < r.beats.length;
      if (known) setIndex(index + 1);
      try {
        const res = await api<{ cursor: number; beats?: Beat[] }>(`/api/runs/${id}`, { action: 'advance', beatId: beat.id, skip });
        if (res.beats) mergeBeats(res.beats);
        if (!known && res.beats && res.beats.length > index + 1) setIndex(index + 1);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [id, index, patchBeat, mergeBeats, touch],
  );

  // "How familiar is this?" decides how the idea is taught.
  const gauge = useCallback(
    async (beatId: string, value: Gauge) => {
      patchBeat(beatId, { status: 'done', response: { gauge: value, at: new Date().toISOString() } });
      touch();
      try {
        const res = await api<{ cursor: number; beats: Beat[] }>(`/api/runs/${id}`, { action: 'gauge', beatId, value });
        mergeBeats(res.beats);
        const at = res.beats.findIndex((b) => b.id === beatId);
        if (at >= 0 && at + 1 < res.beats.length) setIndex(at + 1);
      } catch (e) {
        patchBeat(beatId, { status: 'ready', response: undefined });
        setError((e as Error).message);
      }
    },
    [id, patchBeat, mergeBeats, touch],
  );

  // Skip what's left and go to the wrap-up.
  const wrap = useCallback(async () => {
    const r = runRef.current;
    const beat = r?.beats[index];
    if (!r || !beat) return;
    setWrapping(true);
    try {
      const res = await api<{ beats: Beat[] }>(`/api/runs/${id}`, { action: 'wrap', beatId: beat.id });
      mergeBeats(res.beats);
      setRun((x) => (x ? { ...x, wrapping: true } : x));
      // Leave an unanswered question behind; the recap is next either way.
      const recap = res.beats.findIndex((b, j) => j > index && b.type === 'recap');
      if (recap > index && (!beat.question || beat.feedback || beat.type === 'recap')) {
        await api(`/api/runs/${id}`, { action: 'advance', beatId: beat.id, skip: !!beat.question && !beat.feedback });
        setIndex(recap);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWrapping(false);
    }
  }, [id, index, mergeBeats]);

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
    wrapping,
    clock,
    retry,
    answer,
    gauge,
    wrap,
    ask,
    dismissAsk,
    next,
    finish,
    reload: load,
  };
}
export type RunState = ReturnType<typeof useRun>;

const ORDER: Beat['status'][] = ['pending', 'generating', 'ready', 'answered', 'done', 'skipped'];
const rank = (s: Beat['status']) => ORDER.indexOf(s);
