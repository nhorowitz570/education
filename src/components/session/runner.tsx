'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, ViewTransition } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { BeatView, INTENT_TEXT } from './beat';
import { hasContent, useRun, type RunState } from './use-run';
import { Complete } from './complete';
import { Roleplay } from './roleplay';
import { SessionExtras, useExtras } from './extras';
import { sessionXp } from '@/lib/gamify';
import { minutesLeft } from '@/lib/learning/duration';
import { useApp } from '@/components/app/provider';
import type { AskIntent, Beat, RunView } from '@/lib/learning/run';

const INTENTS: { intent: AskIntent; icon: string }[] = [
  { intent: 'why', icon: 'why' },
  { intent: 'example', icon: 'example' },
  { intent: 'deeper', icon: 'deeper' },
  { intent: 'simpler', icon: 'simpler' },
  { intent: 'visual', icon: 'visual' },
];

export function Runner({ id }: { id: string }) {
  const state = useRun(id);
  const { run, index } = state;
  const router = useRouter();
  const track = run?.session?.subject || (run?.kind === 'review' ? 'review' : 'general');
  const beats = run?.beats || [];
  const current = beats[index];
  const follow = useFollow(current?.id);
  // The end screen celebrates a session finished just now, not one reopened later.
  const wasActive = useRef(false);
  if (run?.status === 'active') wasActive.current = true;
  // Finished steps fold into a one-line trail; the learner can open any.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = useCallback((beatId: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(beatId)) next.delete(beatId);
      else next.add(beatId);
      return next;
    });
  }, []);
  // A question about a highlighted passage, waiting for the learner to type it.
  const [quote, setQuote] = useState<{ beatId: string; text: string } | null>(null);
  const askAbout = useCallback(
    (beatId: string, text: string, intent: AskIntent | null) => {
      if (!intent) return setQuote({ beatId, text });
      void state.ask(beatId, intent, '', text);
      // An answer about an earlier step appears under it, so open it and look.
      if (beatId !== current?.id) {
        setExpanded((s) => new Set(s).add(beatId));
        setTimeout(() => document.getElementById('asking-' + beatId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
      }
    },
    [state, current?.id],
  );

  // Enter continues when nothing is being typed.
  const canContinue = !!current && ready(current, state);
  // Adaptive sessions end at their recap; more steps are planned as they go.
  const last = current?.type === 'recap' || (!run?.adaptive && index === beats.length - 1);
  const advance = useCallback(() => {
    if (!canContinue) return;
    if (last) void state.finish();
    else void state.next();
  }, [canContinue, last, state]);
  // Leaving an exploration once its question has been answered finishes it,
  // so it doesn't linger and what it showed about the learner is remembered.
  const leave = useCallback(() => {
    if (run?.kind === 'explore' && run.status === 'active' && run.beats.some((b) => ['ready', 'answered', 'done'].includes(b.status)))
      void api(`/api/runs/${run.id}`, { action: 'finish' }).catch(() => {});
    router.push('/');
  }, [run, router]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input,textarea,[contenteditable]');
      if (e.key === 'Enter' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  if (state.error && !run)
    return (
      <div className="session-empty">
        <p className="heading">This session couldn’t open.</p>
        <p className="muted">{state.error}</p>
        <Link className="btn" href="/">
          Back to Today
        </Link>
      </div>
    );
  if (!run)
    return (
      <div className="session">
        <TopBar title="" beats={[]} index={0} onClose={() => router.push('/')} />
        <div className="session-col">
          <div className="skeleton line" style={{ width: '30%', marginTop: 48 }} />
        </div>
      </div>
    );
  if (run.status === 'done') return <Complete run={run} fresh={wasActive.current} />;

  const next = beats[index + 1];
  const atCommitment = !run.adaptive && !!next?.optional && !current?.optional;
  const remaining = beats.slice(index).filter((b) => !b.optional || current?.optional).reduce((s, b) => s + b.minutes, 0);

  return (
    <SessionExtras runId={run.id}>
      <div className="session" data-track={track}>
        {run.adaptive ? (
          <ClockBar run={run} state={state} track={track} onClose={leave} />
        ) : (
          <TopBar
            title={run.title}
            beats={beats}
            index={index}
            track={track}
            remaining={remaining}
            onClose={leave}
          />
        )}
        <div className="session-col">
          <div className="trail">
            {beats.slice(0, index + 1).map((b, i) => (
              <BeatView
                key={b.id}
                beat={b}
                state={state}
                current={i === index}
                track={track}
                collapsed={i < index && !expanded.has(b.id)}
                onToggle={() => toggle(b.id)}
              >
                {b.type === 'break' && i === index && (
                  <BreakTimer runId={run.id} beatId={b.id} minutes={b.minutes} until={run.break_until} onDone={advance} />
                )}
                {b.type === 'roleplay' && b.blocks && <Roleplay run={run} beat={b} onDone={() => void state.next()} />}
              </BeatView>
            ))}
          </div>
          <div ref={follow.end} className="session-end" />
        </div>
        <SelectionAsk busy={(id) => !!state.asking[id] && !state.asking[id].error} onAsk={askAbout} />
        <Dock
          quote={quote}
          onClearQuote={() => setQuote(null)}
          state={state}
          beat={current}
          canContinue={canContinue}
          last={last}
          atCommitment={atCommitment}
          canWrap={!!run.adaptive && !run.wrapping && current?.type !== 'recap'}
          onContinue={advance}
          onFinishHere={() => void state.finish()}
        />
      </div>
    </SessionExtras>
  );
}

function ready(b: Beat, s: RunState) {
  if (b.type === 'break') return true;
  if (b.type === 'gauge') return !!b.response?.gauge;
  if (!hasContent(b) || s.grading[b.id] || s.asking[b.id]) return false;
  if (b.question) return !!b.feedback;
  if (b.type === 'roleplay') return true;
  return true;
}

// Scroll follows a newly written step until its top would leave the screen,
// and stops following as soon as the learner scrolls themselves.
function useFollow(beatId?: string) {
  const end = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    if (!beatId) return;
    following.current = true;
    const el = document.getElementById('beat-' + beatId);
    if (el && window.scrollY > 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const stop = () => (following.current = false);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchmove', stop, { passive: true });
    const observer = new ResizeObserver(() => {
      if (!following.current || !el) return;
      const rect = el.getBoundingClientRect(),
        dock = document.querySelector('.dock')?.getBoundingClientRect().height || 0,
        overflow = rect.bottom - (window.innerHeight - dock - 24),
        room = rect.top - 96;
      if (overflow > 0 && room > 0) window.scrollBy({ top: Math.min(overflow, room), behavior: 'smooth' });
    });
    if (el) observer.observe(el);
    return () => {
      observer.disconnect();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
    };
  }, [beatId]);
  return { end };
}

function TopBar({
  title,
  beats,
  index,
  track = 'general',
  remaining,
  onClose,
}: {
  title: string;
  beats: Beat[];
  index: number;
  track?: string;
  remaining?: number;
  onClose: () => void;
}) {
  const total = beats.reduce((s, b) => s + b.minutes, 0) || 1;
  return (
    <header className="session-top">
      <button className="btn icon ghost" onClick={onClose} aria-label="Save and leave">
        <Icon name="close" size={20} />
      </button>
      <div className="session-meta">
        <ViewTransition name="session-title" share="session-title">
          <p className="session-title">{title}</p>
        </ViewTransition>
        <div className={'track-bar t-' + track} role="progressbar" aria-valuemin={0} aria-valuemax={beats.length} aria-valuenow={index} aria-label="Session progress">
          {beats.map((b, i) => (
            <i
              key={b.id}
              style={{ flexGrow: b.minutes / total }}
              className={
                (i < index ? 'done' : i === index ? 'now' : 'todo') +
                (b.type === 'break' ? ' rest' : '') +
                (b.optional ? ' optional' : '') +
                (b.type === 'recall' ? ' recall' : '')
              }
            />
          ))}
        </div>
      </div>
      <p className="session-time num" aria-label={remaining !== undefined ? `About ${remaining} minutes left` : undefined}>
        {remaining !== undefined ? `${remaining}m` : ''}
      </p>
    </header>
  );
}

// Adaptive sessions measure time, not steps: the bar fills with the minutes
// actually spent, and the session plans itself to fill the budget.
function ClockBar({ run, state, track, onClose }: { run: RunView; state: RunState; track: string; onClose: () => void }) {
  const { prefs } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);
  const budget = run.minutes_planned || 60;
  const elapsed = state.clock.at ? state.clock.elapsed + Math.min(now - state.clock.at, 12 * 60000) / 60000 : run.elapsed || 0;
  const left = Math.max(0, Math.round(minutesLeft(run.beats, state.index, elapsed, budget, !!run.wrapping)));
  const xp = sessionXp(run.beats);
  const graded = run.beats.filter((b) => b.feedback);
  return (
    <header className="session-top">
      <button className="btn icon ghost" onClick={onClose} aria-label="Save and leave">
        <Icon name="close" size={20} />
      </button>
      <div className="session-meta">
        <ViewTransition name="session-title" share="session-title">
          <p className="session-title">{run.title}</p>
        </ViewTransition>
        <div
          className={'clock-bar t-' + track}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.round(elapsed + left)}
          aria-valuenow={Math.round(elapsed)}
          aria-label={`${Math.round(elapsed)} minutes in, about ${left} to go`}
          style={{ '--p': Math.min(1, elapsed / Math.max(1, elapsed + left)) } as React.CSSProperties}
        >
          <i className="clock-fill" />
          <span className="clock-marks" aria-hidden="true">
            {graded.map((b) => (
              <i key={b.id} className={'v-' + b.feedback!.verdict} />
            ))}
          </span>
        </div>
      </div>
      <div className="session-right">
        {prefs.game.xp && (
          <span className="xp-chip num" aria-label={`${xp} XP this session`}>
            <Icon name="spark" size={13} />
            {xp}
          </span>
        )}
        <p className="session-time num" aria-label={`About ${left} minutes left`}>
          {left}m
        </p>
      </div>
    </header>
  );
}

function Dock({
  state,
  beat,
  canContinue,
  last,
  atCommitment,
  canWrap,
  onContinue,
  onFinishHere,
  quote,
  onClearQuote,
}: {
  quote: { beatId: string; text: string } | null;
  onClearQuote: () => void;
  state: RunState;
  beat?: Beat;
  canContinue: boolean;
  last: boolean;
  atCommitment: boolean;
  canWrap: boolean;
  onContinue: () => void;
  onFinishHere: () => void;
}) {
  const [text, setText] = useState('');
  const [confirmWrap, setConfirmWrap] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setConfirmWrap(false), [beat?.id]);
  useEffect(() => {
    if (quote) input.current?.focus();
  }, [quote]);
  if (!beat) return null;
  const target = quote?.beatId || beat.id;
  const busy = !!state.asking[target] && !state.asking[target].error;
  const openQuestion = !!beat.question && !beat.feedback;
  const generating = !beat.blocks && beat.type !== 'break';
  const gauge = beat.type === 'gauge';
  const follow = (beat.asks?.at(-1)?.follow_ups || beat.follow_ups || []).slice(0, 2);
  const send = (intent: AskIntent, prompt = '') => {
    if (busy) return;
    if (quote) {
      void state.ask(quote.beatId, intent, prompt, quote.text);
      onClearQuote();
    } else void state.ask(beat.id, intent, prompt);
    setText('');
  };
  return (
    <div className="dock">
      <div className="dock-inner">
        {confirmWrap && (
          <div className="dock-wrap rise" role="group" aria-label="Wrap up the session">
            <p>
              <b>Wrap up now?</b> You’ll skip what’s left and get a short recap of what you did.
            </p>
            <div className="row-inline">
              <button className="btn small ghost" onClick={() => setConfirmWrap(false)}>
                Keep going
              </button>
              <button
                className="btn small primary"
                data-busy={state.wrapping || undefined}
                disabled={state.wrapping}
                onClick={async () => {
                  await state.wrap();
                  setConfirmWrap(false);
                }}
              >
                Wrap up
              </button>
            </div>
          </div>
        )}
        {!generating && !gauge && beat.type !== 'break' && beat.type !== 'roleplay' && (
          <div className="dock-chips" role="toolbar" aria-label="Ask the tutor">
            {openQuestion ? (
              <button className="chip" disabled={busy} onClick={() => send('free', 'Give me a hint without giving the answer away.')}>
                <Icon name="spark" size={15} /> Hint
              </button>
            ) : (
              <>
                {follow.map((f) => (
                  <button key={f} className="chip suggested" disabled={busy} onClick={() => send('free', f)}>
                    <Icon name="spark" size={15} />
                    {f}
                  </button>
                ))}
                {INTENTS.map((i) => (
                  <button key={i.intent} className="chip" disabled={busy} onClick={() => send(i.intent)}>
                    <Icon name={i.icon} size={15} />
                    {INTENT_TEXT[i.intent]}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {quote && (
          <div className="dock-quote">
            <Icon name="spark" size={14} />
            <span>
              About “{quote.text.length > 90 ? quote.text.slice(0, 89) + '…' : quote.text}”
            </span>
            <button className="btn icon small ghost" onClick={onClearQuote} aria-label="Stop asking about this passage">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        <div className="dock-row">
          {(quote || (beat.type !== 'break' && beat.type !== 'roleplay' && !gauge)) && (
            <form
              className="dock-ask"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) send('free', text.trim());
              }}
            >
              <input
                ref={input}
                className="input"
                placeholder={quote ? 'What about this part?' : openQuestion ? 'Ask for help…' : 'Ask anything about this…'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && quote && onClearQuote()}
                disabled={generating && !quote}
                aria-label="Ask the tutor"
                enterKeyHint="send"
              />
              <button className="btn icon small primary" type="submit" disabled={!text.trim() || busy} aria-label="Send">
                <Icon name="send" size={17} />
              </button>
            </form>
          )}
          {canWrap && !confirmWrap && (
            <button className="btn quiet wrap-btn" onClick={() => setConfirmWrap(true)} aria-label="Wrap up the session">
              Wrap up
            </button>
          )}
          {atCommitment && canContinue && (
            <button className="btn quiet" onClick={onFinishHere} disabled={state.finishing}>
              Finish here
            </button>
          )}
          {!openQuestion && !(gauge && !beat.response?.gauge) && (
            <button
              className={'btn primary continue' + (beat.type === 'break' ? ' wide' : '')}
              onClick={onContinue}
              disabled={!canContinue || state.finishing}
              data-busy={state.finishing || undefined}
            >
              {last ? 'Finish session' : beat.type === 'break' ? 'I’m back' : atCommitment ? 'Keep going' : 'Continue'}
              {!state.finishing && <Icon name="arrow" size={18} />}
            </button>
          )}
          {openQuestion && (
            <button className="btn ghost" onClick={() => void state.next(true)} aria-label="Skip this question">
              Skip
            </button>
          )}
        </div>
        {state.error && (
          <p className="dock-error" role="alert">
            {state.error}{' '}
            <button className="link" onClick={() => state.setError('')}>
              Dismiss
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function BreakTimer({
  runId,
  beatId,
  minutes,
  until,
  onDone,
}: {
  runId: string;
  beatId: string;
  minutes: number;
  until?: string | null;
  onDone: () => void;
}) {
  const total = minutes * 60;
  // The server holds the end time, so a reload keeps the same break and a
  // notification can arrive when it ends, even with the app closed.
  const [end, setEnd] = useState(() => (until && Date.parse(until) > Date.now() ? Date.parse(until) : Date.now() + total * 1000));
  const [left, setLeft] = useState(() => Math.max(0, Math.round((end - Date.now()) / 1000)));
  const [notify, setNotify] = useState(false);
  useEffect(() => {
    setNotify(typeof Notification !== 'undefined' && Notification.permission === 'granted');
    api<{ until: string }>(`/api/runs/${runId}/break`, { beatId })
      .then((r) => setEnd(Date.parse(r.until)))
      .catch(() => {});
  }, [runId, beatId]);
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  }, [end]);
  const r = 54,
    c = 2 * Math.PI * r,
    progress = 1 - Math.min(1, left / total);
  return (
    <div className="break">
      <svg viewBox="0 0 128 128" className="break-ring" aria-hidden="true">
        <circle cx="64" cy="64" r={r} className="ring-bg" />
        <circle cx="64" cy="64" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
      </svg>
      <p className="break-time num" role="timer" aria-live="off">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </p>
      <p className="muted">
        {left
          ? notify
            ? 'Step away from the screen. We’ll send a notification when it’s time.'
            : 'Step away from the screen. Stretch, get water.'
          : 'Ready when you are.'}
      </p>
      {!left && (
        <button className="btn primary" onClick={onDone}>
          Continue
        </button>
      )}
    </div>
  );
}

// Select any sentence the tutor wrote and ask about exactly that part.
function SelectionAsk({
  busy,
  onAsk,
}: {
  busy: (beatId: string) => boolean;
  onAsk: (beatId: string, text: string, intent: AskIntent | null) => void;
}) {
  const [sel, setSel] = useState<{ beatId: string; text: string; x: number; y: number; above: boolean } | null>(null);
  const extras = useExtras();
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let t = 0;
    const read = () => {
      const s = document.getSelection();
      const text = s?.toString().replace(/\s+/g, ' ').trim() || '';
      if (!s || s.isCollapsed || text.length < 3 || !s.rangeCount) return setSel(null);
      const range = s.getRangeAt(0);
      const host = (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest(
        '.beat .blocks, .beat .ask, .beat .feedback',
      );
      const beat = host?.closest<HTMLElement>('.beat');
      if (!host || !beat?.dataset.beatId || host.closest('textarea,input')) return setSel(null);
      const rect = range.getBoundingClientRect();
      // Below the selection, clear of the phone's own copy menu; above it
      // when that would run under the dock.
      const below = rect.bottom + 12,
        above = window.innerHeight - below < 170;
      setSel({
        beatId: beat.dataset.beatId,
        text: text.slice(0, 600),
        x: Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2)),
        y: above ? rect.top - 12 : below,
        above,
      });
    };
    const onChange = () => {
      clearTimeout(t);
      t = window.setTimeout(read, 180);
    };
    const onScroll = () => sel && read();
    document.addEventListener('selectionchange', onChange);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      document.removeEventListener('selectionchange', onChange);
      window.removeEventListener('scroll', onScroll);
    };
  }, [sel]);
  if (!sel) return null;
  const go = (intent: AskIntent | null) => {
    onAsk(sel.beatId, sel.text, intent);
    document.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const disabled = busy(sel.beatId);
  const note = () => {
    extras?.startNote(sel.beatId, sel.text.slice(0, 600));
    document.getSelection()?.removeAllRanges();
    setSel(null);
  };
  return (
    <div
      ref={pop}
      className={'select-ask' + (sel.above ? ' above' : '')}
      style={{ left: sel.x, top: sel.y }}
      role="toolbar"
      aria-label="Ask about the selected text"
      onMouseDown={(e) => e.preventDefault()}
    >
      {SELECT_INTENTS.map((i) => (
        <button key={i.intent} className="chip" disabled={disabled} onClick={() => go(i.intent)}>
          <Icon name={i.icon} size={14} />
          {i.label}
        </button>
      ))}
      <button className="chip" disabled={disabled} onClick={() => go(null)}>
        <Icon name="spark" size={14} />
        Ask…
      </button>
      {extras && (
        <button className="chip" onClick={note}>
          <Icon name="note" size={14} />
          Note
        </button>
      )}
    </div>
  );
}
const SELECT_INTENTS: { intent: AskIntent; icon: string; label: string }[] = [
  { intent: 'why', icon: 'why', label: 'Why?' },
  { intent: 'example', icon: 'example', label: 'Example' },
  { intent: 'simpler', icon: 'simpler', label: 'Simpler' },
  { intent: 'visual', icon: 'visual', label: 'Show me' },
];
