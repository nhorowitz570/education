'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { BeatView, INTENT_TEXT } from './beat';
import { hasContent, useRun, type RunState } from './use-run';
import { Complete } from './complete';
import { Roleplay } from './roleplay';
import type { AskIntent, Beat } from '@/lib/learning/run';

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

  // Enter continues when nothing is being typed.
  const canContinue = !!current && ready(current, state);
  const last = index === beats.length - 1;
  const advance = useCallback(() => {
    if (!canContinue) return;
    if (last) void state.finish();
    else void state.next();
  }, [canContinue, last, state]);
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
  if (run.status === 'done') return <Complete run={run} />;

  const next = beats[index + 1];
  const atCommitment = !!next?.optional && !current?.optional;
  const remaining = beats.slice(index).filter((b) => !b.optional || current?.optional).reduce((s, b) => s + b.minutes, 0);

  return (
    <div className="session" data-track={track}>
      <TopBar
        title={run.title}
        beats={beats}
        index={index}
        track={track}
        remaining={remaining}
        onClose={() => router.push('/')}
      />
      <div className="session-col">
        {beats.slice(0, index + 1).map((b, i) => (
          <BeatView key={b.id} beat={b} state={state} current={i === index} track={track}>
            {b.type === 'break' && i === index && <BreakTimer minutes={b.minutes} onDone={advance} />}
            {b.type === 'roleplay' && b.blocks && <Roleplay run={run} beat={b} onDone={() => void state.next()} />}
          </BeatView>
        ))}
        <div ref={follow.end} className="session-end" />
      </div>
      <Dock
        state={state}
        beat={current}
        canContinue={canContinue}
        last={last}
        atCommitment={atCommitment}
        onContinue={advance}
        onFinishHere={() => void state.finish()}
      />
    </div>
  );
}

function ready(b: Beat, s: RunState) {
  if (b.type === 'break') return true;
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
        <p className="session-title">{title}</p>
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

function Dock({
  state,
  beat,
  canContinue,
  last,
  atCommitment,
  onContinue,
  onFinishHere,
}: {
  state: RunState;
  beat?: Beat;
  canContinue: boolean;
  last: boolean;
  atCommitment: boolean;
  onContinue: () => void;
  onFinishHere: () => void;
}) {
  const [text, setText] = useState('');
  if (!beat) return null;
  const busy = !!state.asking[beat.id] && !state.asking[beat.id].error;
  const openQuestion = !!beat.question && !beat.feedback;
  const generating = !beat.blocks && beat.type !== 'break';
  const follow = (beat.asks?.at(-1)?.follow_ups || beat.follow_ups || []).slice(0, 2);
  const send = (intent: AskIntent, prompt = '') => {
    if (busy) return;
    void state.ask(beat.id, intent, prompt);
    setText('');
  };
  return (
    <div className="dock">
      <div className="dock-inner">
        {!generating && beat.type !== 'break' && beat.type !== 'roleplay' && (
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
        <div className="dock-row">
          {beat.type !== 'break' && beat.type !== 'roleplay' && (
            <form
              className="dock-ask"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) send('free', text.trim());
              }}
            >
              <input
                className="input"
                placeholder={openQuestion ? 'Ask for help…' : 'Ask anything about this…'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={generating}
                aria-label="Ask the tutor"
                enterKeyHint="send"
              />
              <button className="btn icon small primary" type="submit" disabled={!text.trim() || busy} aria-label="Send">
                <Icon name="send" size={17} />
              </button>
            </form>
          )}
          {atCommitment && canContinue && (
            <button className="btn quiet" onClick={onFinishHere} disabled={state.finishing}>
              Finish here
            </button>
          )}
          {!openQuestion && (
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

function BreakTimer({ minutes, onDone }: { minutes: number; onDone: () => void }) {
  const [left, setLeft] = useState(minutes * 60);
  const started = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, minutes * 60 - Math.floor((Date.now() - started.current) / 1000));
      setLeft(l);
      if (l === 0) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  }, [minutes]);
  const r = 54,
    c = 2 * Math.PI * r,
    progress = 1 - left / (minutes * 60);
  return (
    <div className="break">
      <svg viewBox="0 0 128 128" className="break-ring" aria-hidden="true">
        <circle cx="64" cy="64" r={r} className="ring-bg" />
        <circle cx="64" cy="64" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
      </svg>
      <p className="break-time num" role="timer" aria-live="off">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </p>
      <p className="muted">{left ? 'Step away from the screen. Stretch, get water.' : 'Ready when you are.'}</p>
      {!left && (
        <button className="btn primary" onClick={onDone}>
          Continue
        </button>
      )}
    </div>
  );
}
