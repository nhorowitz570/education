'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, stream } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { useApp } from '@/components/app/provider';
import { MODES, VOICES, type Line, type PracticeFeedback, type PracticeNote } from '@/lib/practice/harness';
import type { PracticeView } from '@/lib/server/practice';
import { useLive } from './use-live';

type Phase = 'brief' | 'voice' | 'text' | 'assessing' | 'feedback';

export function Conversation({
  initial,
  embedded = false,
  onDone,
}: {
  initial: PracticeView;
  embedded?: boolean;
  onDone?: (f: PracticeFeedback) => void;
}) {
  const { config } = useApp();
  const router = useRouter();
  const [practice, setPractice] = useState(initial);
  const p = practice.practice;
  const [phase, setPhase] = useState<Phase>(p.feedback ? 'feedback' : 'brief');
  const [error, setError] = useState('');
  const live = useLive(practice.id);

  async function assess(transcript: Line[]) {
    setPhase('assessing');
    setError('');
    try {
      const { feedback } = await api<{ feedback: PracticeFeedback }>(`/api/practice/${practice.id}`, {
        action: 'feedback',
        transcript: transcript.filter((l) => l.text.trim()).map((l) => ({ role: l.role, text: l.text.slice(0, 5000) })),
      });
      setPractice((x) => ({ ...x, status: 'done', practice: { ...x.practice, transcript, feedback } }));
      setPhase('feedback');
      onDone?.(feedback);
    } catch (e) {
      setError((e as Error).message);
      setPhase(transcript.length ? 'feedback' : 'brief');
    }
  }
  // When a voice call ends, go straight to feedback.
  const ended = live.status === 'ended';
  useEffect(() => {
    if (ended && phase === 'voice') {
      const t = live.linesRef.current;
      if (t.some((l) => l.role === 'user' && l.text.trim())) void assess(t);
      else {
        setPhase('brief');
        setError('The call ended before you said anything. Try again when you’re ready.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  return (
    <div className={'conversation' + (embedded ? ' embedded' : '')} data-phase={phase}>
      {phase === 'brief' && (
        <Brief
          practice={practice}
          voice={config.voice}
          onVoice={() => {
            setPhase('voice');
            void live.start();
          }}
          onText={() => setPhase('text')}
        />
      )}
      {phase === 'voice' && <VoiceStage practice={practice} live={live} onFallback={() => setPhase('text')} />}
      {phase === 'text' && <TextStage practice={practice} onEnd={(t) => void assess(t)} />}
      {phase === 'assessing' && (
        <div className="assessing" role="status">
          <i className="pulse" aria-hidden="true" />
          <p className="heading">Listening back</p>
          <p className="muted">Finding your best moment and the one change that matters most.</p>
        </div>
      )}
      {phase === 'feedback' && p.feedback && (
        <FeedbackPanel
          practice={practice}
          onRedo={async (line) => {
            const { practice: next } = await api<{ practice: PracticeView }>('/api/practice', { redo: { from: practice.id, line } });
            if (embedded) {
              setPractice(next);
              setPhase('brief');
            } else router.push('/practice/' + next.id);
          }}
          onAgain={async () => {
            // A fresh practice with the same settings: new brief, clean transcript.
            const { practice: next } = await api<{ practice: PracticeView }>('/api/practice', {
              mode: p.mode,
              topic: p.topic,
              side: p.side,
              difficulty: p.difficulty,
              minutes: p.minutes,
              voice: p.voice,
              parent: p.parent,
            });
            if (embedded) {
              setPractice(next);
              setPhase('brief');
            } else router.push('/practice/' + next.id);
          }}
        />
      )}
      {error && (
        <p className="conversation-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Brief({
  practice,
  voice,
  onVoice,
  onText,
}: {
  practice: PracticeView;
  voice: boolean;
  onVoice: () => void;
  onText: () => void;
}) {
  const p = practice.practice,
    b = p.brief;
  return (
    <div className="brief stagger">
      <div className="partner">
        <span className="avatar" aria-hidden="true">
          {b.partner.name[0]}
        </span>
        <div>
          <p className="heading">{b.partner.name}</p>
          <p className="label">{b.partner.role}</p>
        </div>
        <span className="chip static">{MODES[p.mode].label}</span>
      </div>
      {p.resume?.length ? (
        <div className="brief-resume">
          <p className="eyebrow">Redo from partway through</p>
          <p>
            {b.partner.name} picks up where you left off
            {p.resume.at(-1)?.role === 'assistant' ? ':' : '.'}
          </p>
          {p.resume.at(-1)?.role === 'assistant' && <blockquote className="serif">“{p.resume.at(-1)!.text}”</blockquote>}
        </div>
      ) : null}
      <p className="brief-situation serif">{b.situation}</p>
      <dl className="brief-facts">
        <div>
          <dt>Your goal</dt>
          <dd>{b.learner_goal}</dd>
        </div>
        <div>
          <dt>They’re coming in with</dt>
          <dd>{b.partner.stance}</dd>
        </div>
      </dl>
      {b.prep.length > 0 && (
        <div className="brief-prep">
          <p className="eyebrow">Before you start</p>
          <ul>
            {b.prep.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="brief-actions">
        {voice && (
          <button className="btn primary large" onClick={onVoice}>
            <Icon name="mic" size={19} /> Start talking
          </button>
        )}
        <button className={'btn large ' + (voice ? 'quiet' : 'primary')} onClick={onText}>
          {voice ? 'Type instead' : 'Start in text'}
        </button>
        <p className="label">
          About {p.minutes} min · {VOICES[p.voice].label} · {p.difficulty}
        </p>
      </div>
    </div>
  );
}

function VoiceStage({
  practice,
  live,
  onFallback,
}: {
  practice: PracticeView;
  live: ReturnType<typeof useLive>;
  onFallback: () => void;
}) {
  const b = practice.practice.brief;
  const orb = useRef<HTMLDivElement>(null),
    ring = useRef<HTMLDivElement>(null);
  const [speaker, setSpeaker] = useState<'them' | 'me' | null>(null);
  const sample = live.sample;
  useEffect(() => {
    let frame = 0,
      lastSpeaker: 'them' | 'me' | null = null;
    const loop = () => {
      const { me, them } = sample();
      if (orb.current) orb.current.style.setProperty('--level', String(them));
      if (ring.current) ring.current.style.setProperty('--level', String(me));
      const now = them > 0.08 ? 'them' : me > 0.08 ? 'me' : null;
      if (now !== lastSpeaker) {
        lastSpeaker = now;
        setSpeaker(now);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [sample]);
  const planned = practice.practice.minutes * 60;
  const left = Math.max(0, planned - live.elapsed);
  const captions = live.lines.slice(-3);
  const label =
    live.status === 'connecting'
      ? 'Connecting…'
      : live.status === 'ending'
        ? 'Wrapping up…'
        : live.muted
          ? 'Muted'
          : speaker === 'them'
            ? `${b.partner.name} is speaking`
            : speaker === 'me'
              ? 'You’re speaking'
              : 'Listening';
  return (
    <div className="voice-stage">
      <div className="voice-top">
        <p className="heading">{b.partner.name}</p>
        <p className="voice-clock num" aria-label={`${Math.ceil(left / 60)} minutes left`}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </p>
      </div>
      <div className={'orb-wrap' + (live.status === 'live' ? ' live' : '')}>
        <div className="orb-ring" ref={ring} />
        <div className="orb" ref={orb}>
          <span>{b.partner.name[0]}</span>
        </div>
      </div>
      <p className="voice-status" aria-live="polite">
        {label}
      </p>
      <div className="captions" aria-live="off">
        {captions.map((l, i) => (
          <p key={live.lines.length - captions.length + i} className={l.role} style={{ opacity: 0.45 + (i / Math.max(1, captions.length - 1)) * 0.55 }}>
            {l.text}
          </p>
        ))}
      </div>
      <div className="voice-controls">
        <button
          className={'btn icon large ' + (live.muted ? 'primary' : 'quiet')}
          onClick={live.toggleMute}
          aria-pressed={live.muted}
          aria-label={live.muted ? 'Unmute' : 'Mute'}
          disabled={live.status !== 'live'}
        >
          <Icon name={live.muted ? 'micOff' : 'mic'} size={22} />
        </button>
        <button className="btn large end" onClick={() => void live.end()} disabled={live.status === 'ending'}>
          End conversation
        </button>
      </div>
      {live.status === 'error' && (
        <div className="voice-error">
          <p>{live.error}</p>
          <div className="row-inline">
            <button className="btn small" onClick={() => void live.start()}>
              Try again
            </button>
            <button className="btn small ghost" onClick={onFallback}>
              Practise in text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TextStage({ practice, onEnd }: { practice: PracticeView; onEnd: (t: Line[]) => void }) {
  const b = practice.practice.brief;
  const [lines, setLines] = useState<Line[]>(practice.practice.channel === 'text' ? practice.practice.transcript : []);
  const [draft, setDraft] = useState(''),
    [streaming, setStreaming] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [closed, setClosed] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  async function turn(message: string) {
    setBusy(true);
    setError('');
    if (message) setLines((l) => [...l, { role: 'user', text: message }]);
    try {
      const out = await stream<{ reply: string; end: boolean }>(
        `/api/practice/${practice.id}`,
        { action: 'say', message },
        { onSnap: (d) => setStreaming((d as { text: string }).text) },
      );
      setLines((l) => [...l, { role: 'assistant', text: out.reply }]);
      if (out.end) setClosed(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming('');
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!lines.length) void turn('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [lines.length, streaming]);
  return (
    <div className="text-stage">
      <div className="thread" aria-live="polite">
        {(practice.practice.resume || []).slice(-4).map((l, i) => (
          <div key={'r' + i} className={'turn earlier ' + l.role}>
            <p className="turn-who">{l.role === 'user' ? 'You' : b.partner.name} · earlier</p>
            <p className="turn-text">{l.text}</p>
          </div>
        ))}
        {lines.map((l, i) => (
          <div key={i} className={'turn ' + l.role}>
            <p className="turn-who">{l.role === 'user' ? 'You' : b.partner.name}</p>
            <p className="turn-text">{l.text}</p>
          </div>
        ))}
        {streaming && (
          <div className="turn assistant">
            <p className="turn-who">{b.partner.name}</p>
            <p className="turn-text">{streaming}</p>
          </div>
        )}
        <div ref={end} className="thread-end" />
      </div>
      {error && <p className="conversation-error">{error}</p>}
      <form
        className="text-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && !busy) {
            void turn(draft.trim());
            setDraft('');
          }
        }}
      >
        <textarea
          className="textarea"
          rows={2}
          value={draft}
          placeholder={closed ? 'The conversation reached a close.' : 'Say it the way you would out loud…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          aria-label="Your reply"
        />
        <div className="row-inline" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn quiet" disabled={!lines.some((l) => l.role === 'user') || busy} onClick={() => onEnd(lines)}>
            End & get feedback
          </button>
          <button className="btn primary" disabled={!draft.trim() || busy}>
            Send <Icon name="send" size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

const RATING = { strong: 'Strong', developing: 'Developing', focus: 'Focus here' } as const;
function FeedbackPanel({
  practice,
  onAgain,
  onRedo,
}: {
  practice: PracticeView;
  onAgain: () => Promise<void>;
  onRedo: (line: number) => Promise<void>;
}) {
  const f = practice.practice.feedback!;
  const [busy, setBusy] = useState(false);
  return (
    <div className="practice-feedback stagger">
      <p className="eyebrow">How it went</p>
      <h2 className="feedback-headline">{f.headline}</h2>
      <figure className="best">
        <blockquote className="serif">“{f.best.quote}”</blockquote>
        <figcaption className="muted">{f.best.why}</figcaption>
      </figure>
      <div className="change">
        <p className="eyebrow">One change</p>
        <p>{f.change}</p>
      </div>
      <div className="rewrite">
        <p className="label">You said</p>
        <p className="was">{f.rewrite.original}</p>
        <p className="label">Stronger</p>
        <p className="better serif">{f.rewrite.better}</p>
      </div>
      <div className="rows criteria">
        {f.criteria.map((c) => (
          <div className="row" key={c.name}>
            <i className={'dot r-' + c.rating} />
            <div className="grow">
              <p>{c.name}</p>
              <p className="sub">{c.note}</p>
            </div>
            <span className="label">{RATING[c.rating]}</span>
          </div>
        ))}
      </div>
      {practice.practice.transcript.length > 0 && <Replay practice={practice} notes={f.notes || []} onRedo={onRedo} />}
      <div className="row-inline">
        <button
          className="btn quiet"
          data-busy={busy || undefined}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onAgain().finally(() => setBusy(false));
          }}
        >
          Try it again
        </button>
      </div>
    </div>
  );
}

const NOTE_LABEL: Record<PracticeNote['kind'], string> = { strength: 'Worked', change: 'Change', moment: 'Turning point' };

// The conversation laid out as a timeline, with feedback pinned to the exact
// lines it is about. Any of your lines can be the start of a redo.
function Replay({
  practice,
  notes,
  onRedo,
}: {
  practice: PracticeView;
  notes: PracticeNote[];
  onRedo: (line: number) => Promise<void>;
}) {
  const p = practice.practice;
  const lines = p.transcript;
  const [open, setOpen] = useState(notes.length > 0),
    [busy, setBusy] = useState<number | null>(null),
    [error, setError] = useState(''),
    [lit, setLit] = useState<number | null>(null);
  const byLine = new Map<number, PracticeNote[]>();
  for (const n of notes) byLine.set(n.line, [...(byLine.get(n.line) || []), n]);
  const words = (t: string) => Math.max(1, t.split(/\s+/).length);
  const total = lines.reduce((s, l) => s + words(l.text), 0);
  const jump = (i: number) => {
    setOpen(true);
    setLit(i);
    requestAnimationFrame(() =>
      document.getElementById(`line-${practice.id}-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
    setTimeout(() => setLit((x) => (x === i ? null : x)), 1600);
  };
  return (
    <div className="replay">
      <div className="replay-head">
        <p className="eyebrow">Replay</p>
        <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide transcript' : 'Show transcript'}
        </button>
      </div>
      <div className="timeline" role="list" aria-label="Conversation timeline">
        {lines.map((l, i) => {
          const n = byLine.get(i);
          return (
            <button
              key={i}
              role="listitem"
              className={'tl-seg ' + l.role + (n ? ' noted k-' + n[0].kind : '')}
              style={{ flexGrow: words(l.text) / total, animationDelay: `${Math.min(i * 25, 700)}ms` }}
              onClick={() => jump(i)}
              aria-label={`${l.role === 'user' ? 'You' : p.brief.partner.name}: ${l.text.slice(0, 80)}${n ? ` (note: ${NOTE_LABEL[n[0].kind]})` : ''}`}
            >
              {n && <i className="tl-mark" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="tl-legend" aria-hidden="true">
        <span className="you">You</span>
        <span className="them">{p.brief.partner.name}</span>
        {notes.length > 0 && <span className="noted">Notes</span>}
      </div>
      {error && <p className="conversation-error">{error}</p>}
      {open && (
        <div className="thread replay-thread">
          {(p.resume || []).length > 0 && <p className="label">Picked up partway through an earlier conversation.</p>}
          {lines.map((l, i) => (
            <div key={i} id={`line-${practice.id}-${i}`} className={'turn ' + l.role + (lit === i ? ' lit' : '')}>
              <p className="turn-who">{l.role === 'user' ? 'You' : p.brief.partner.name}</p>
              <p className="turn-text">{l.text}</p>
              {(byLine.get(i) || []).map((n, j) => (
                <div key={j} className={'line-note k-' + n.kind}>
                  <span className="label">{NOTE_LABEL[n.kind]}</span>
                  <p>{n.note}</p>
                </div>
              ))}
              {l.role === 'user' && (
                <button
                  className="btn small ghost redo"
                  data-busy={busy === i || undefined}
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(i);
                    setError('');
                    try {
                      await onRedo(i);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <Icon name="refresh" size={14} /> Redo from here
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
