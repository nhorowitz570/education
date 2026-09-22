'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Lesson, Feedback, Attempt } from '@/lib/types';
import { CASH_LESSON } from '@/lib/seed';
import { api } from '@/lib/client/workspace';
import { savedLesson, localSet } from '@/lib/client/storage';
import type { ViewProps } from './app';
import { Button, Pill, Modal } from './ui';
import { Icon } from './icons';
type Draft = {
  lessonId?: string;
  sessionId: string;
  stage: number;
  choice: number;
  reasoning: string;
  transfer: string;
  assisted: boolean;
  correction?: {
    correct: boolean;
    strength: string;
    gap: string;
    next: string;
    suggested: string;
  };
  eventId: string;
};
export function LessonView(
  p: ViewProps & { sessionId: string; reviewOf?: string },
) {
  const initial = p.w.state.records.find(
    (r) => r.id === `draft:${p.sessionId}:${p.reviewOf || ''}`,
  )?.data as Draft | undefined;
  const [draft, setDraft] = useState<Draft>(
      initial || {
        sessionId: p.sessionId,
        stage: 0,
        choice: -1,
        reasoning: '',
        transfer: '',
        assisted: false,
        eventId: crypto.randomUUID(),
      },
    ),
    [lesson, setLesson] = useState<Lesson>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [sources, setSources] = useState(false),
    [tutor, setTutor] = useState(false),
    [cached, setCached] = useState(false),
    [result, setResult] = useState<Attempt>(),
    [retry, setRetry] = useState(0);
  const mounted = useRef(true);
  const key = `draft:${p.sessionId}:${p.reviewOf || ''}`;
  const update = (patch: Partial<Draft>) => {
    const apply = () => {
      flushSync(() => setDraft((d) => ({ ...d, ...patch })));
      if (patch.stage !== undefined)
        window.scrollTo({ top: 0, behavior: 'instant' });
    };
    if (
      patch.stage !== undefined &&
      document.startViewTransition &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      document.startViewTransition(apply);
    else apply();
  };
  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      setError('');
      try {
        const local = await savedLesson(
          p.owner,
          p.sessionId + ':' + (p.reviewOf || ''),
        );
        if (!navigator.onLine) {
          if (local) {
            setLesson(local);
            setCached(true);
            return;
          }
          throw new Error(
            'This lesson has not been saved for offline reading. Connect once to download it.',
          );
        }
        if (p.config.demo) {
          if (p.sessionId !== 'w01-monday' || p.reviewOf)
            throw new Error(
              'The design preview includes the first finance lesson. Use your account to generate the rest.',
            );
          setLesson(CASH_LESSON);
          return;
        }
        const r = await api<{ lesson: Lesson }>('/api/lesson', {
          sessionId: p.sessionId,
          reviewOf: p.reviewOf,
          retry: retry > 0,
        });
        if (mounted.current) {
          setLesson(r.lesson);
          setDraft((d) => ({ ...d, lessonId: r.lesson.id }));
        }
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : 'Lesson unavailable.');
        if ((e as { status?: number }).status === 202)
          timer = setTimeout(load, 3000);
      }
    }
    void load();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [p.sessionId, p.reviewOf, p.owner, p.config.demo, retry]);
  useEffect(() => {
    if (draft.stage === 4) return;
    const timeout = setTimeout(() => void p.w.record('draft', key, draft), 800);
    return () => clearTimeout(timeout);
  }, [draft, key, p.w.record]);
  async function exit() {
    if (draft.stage !== 4) await p.w.record('draft', key, draft);
    p.go('today');
  }
  async function correction() {
    setBusy(true);
    setError('');
    try {
      const value = await api<Draft['correction']>(
        p.config.demo ? '/api/preview' : '/api/feedback',
        {
          sessionId: p.sessionId,
          reviewOf: p.reviewOf,
          choice: draft.choice,
          reasoning: draft.reasoning,
        },
      );
      update({ correction: value, stage: 2 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    if (!lesson) return;
    setBusy(true);
    setError('');
    try {
      if (p.config.demo) {
        const r = await api<{ feedback: Feedback }>('/api/preview', {
          choice: draft.choice,
          reasoning: draft.reasoning,
          transfer: draft.transfer,
          assisted: draft.assisted,
        });
        const a: Attempt = {
          id: draft.eventId,
          session_id: p.sessionId,
          objective_id: lesson.objective_id,
          lesson_id: lesson.id,
          completed_at: new Date().toISOString(),
          date: p.today,
          reduced: false,
          assisted: draft.assisted,
          reasoning: draft.reasoning,
          transfer: draft.transfer,
          feedback: r.feedback,
          points: 25,
        };
        setResult(a);
        await p.w.replace({
          ...p.w.state,
          attempts: p.w.state.attempts.some((a) => a.session_id === p.sessionId)
            ? p.w.state.attempts
            : [...p.w.state.attempts, a],
          records: p.w.state.records.filter((r) => r.id !== key),
        });
      } else {
        const state = await p.w.send({
          type: 'complete',
          eventId: draft.eventId,
          sessionId: lesson.session_id,
          lessonId: lesson.id,
          choice: draft.choice,
          reasoning: draft.reasoning,
          transfer: draft.transfer,
          assisted: draft.assisted,
          reduced: p.w.state.overrides[p.sessionId]?.status === 'reduced',
          date: p.today,
          reviewOf: p.reviewOf,
        });
        setResult(
          state.attempts.find((a) => a.session_id === lesson.session_id),
        );
      }
      update({ stage: 4 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cache() {
    if (lesson) {
      await localSet(
        p.owner,
        'lesson:' + p.sessionId + ':' + (p.reviewOf || ''),
        lesson,
      );
      setCached(true);
    }
  }
  const stages = [
    'Situation',
    'Your reasoning',
    'Feedback',
    'A changed situation',
    'Saved work',
  ];
  return (
    <div className="screen-grid">
      <div className="main-lane lesson-lane">
        <div className="row between meta">
          <span className="subject">
            {lesson?.subject || 'Your lesson'} ·{' '}
            {p.reviewOf ? 'Recall & apply' : '20 minutes'}
          </span>
          <button className="text-button" onClick={() => void exit()}>
            Save & exit
          </button>
        </div>
        {!lesson ? (
          <>
            <h1>
              One useful
              <br />
              situation.
            </h1>
            <section className="callout lavender">
              <p role="status">{error || 'Opening your lesson…'}</p>
              <Button kind="secondary" onClick={() => setRetry(retry + 1)}>
                Try again
              </Button>
            </section>
          </>
        ) : (
          <>
            <h1 className="lesson-title">
              {draft.stage === 0 ? (
                lesson.id === 'reviewed-cash-v1' ||
                lesson.title === 'Profit versus cash' ? (
                  <>
                    A sale today.
                    <br />
                    Cash later.
                  </>
                ) : (
                  lesson.title
                )
              ) : draft.stage === 1 ? (
                'Make your call.'
              ) : draft.stage === 2 ? (
                'A useful distinction.'
              ) : draft.stage === 3 ? (
                'Now, change the situation.'
              ) : result ? (
                'That’s useful work.'
              ) : (
                'Your work is on this device.'
              )}
            </h1>
            <div
              className="step-track"
              aria-label={`Step ${draft.stage + 1} of 5: ${stages[draft.stage]}`}
            >
              {stages.map((s, i) => (
                <span key={s} className={i <= draft.stage ? 'filled' : ''} />
              ))}
            </div>
            {error && (
              <div className="status-banner" role="alert">
                {error}
              </div>
            )}
            {draft.stage === 0 && (
              <>
                <section className="case mint">
                  <div className="row between">
                    <h3>
                      {lesson.title === 'Profit versus cash'
                        ? 'A small creative studio'
                        : lesson.title}
                    </h3>
                    <Pill>Fictional case</Pill>
                  </div>
                  {lesson.facts.length ? (
                    lesson.facts.map((f) => (
                      <div className="fact-row" key={f.label}>
                        <span>{f.label}</span>
                        <strong>{f.value}</strong>
                      </div>
                    ))
                  ) : (
                    <p>{lesson.scenario}</p>
                  )}
                </section>
                {lesson.facts.length > 0 &&
                  lesson.id !== 'reviewed-cash-v1' && <p>{lesson.scenario}</p>}
                <p className="explanation">{lesson.explanation}</p>
                <div className="row wrap">
                  <Button onClick={() => update({ stage: 1 })}>
                    Make your call
                    <Icon name="arrow" size={18} />
                  </Button>
                  <button
                    className="text-button"
                    onClick={() => setSources(true)}
                  >
                    Show sources
                    <Icon name="link" size={16} />
                  </button>
                </div>
              </>
            )}
            {draft.stage === 1 && (
              <>
                <p className="explanation">{lesson.reasoning_prompt}</p>
                <fieldset className="choices">
                  <legend>{lesson.question}</legend>
                  {lesson.choices.map((choice, i) => (
                    <label
                      key={choice}
                      className={
                        'choice ' + (draft.choice === i ? 'selected' : '')
                      }
                    >
                      <input
                        type="radio"
                        name="answer"
                        checked={draft.choice === i}
                        onChange={() => update({ choice: i })}
                      />
                      <span className="choice-letter">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span>{choice}</span>
                      {draft.choice === i && <Icon name="check" size={18} />}
                    </label>
                  ))}
                </fieldset>
                <label className="field-label">
                  Why that one?
                  <textarea
                    value={draft.reasoning}
                    onChange={(e) => update({ reasoning: e.target.value })}
                    placeholder="What do you need to know before making a recommendation?"
                    maxLength={4000}
                    rows={4}
                  />
                </label>
                <div className="row wrap">
                  <Button
                    disabled={
                      draft.choice < 0 ||
                      draft.reasoning.trim().length < 10 ||
                      busy
                    }
                    onClick={() => void correction()}
                  >
                    {busy ? 'Checking…' : 'Check my reasoning'}
                    <Icon name="arrow" size={18} />
                  </Button>
                  <button
                    className="text-button mobile-tutor"
                    onClick={() => {
                      setTutor(true);
                      update({ assisted: true });
                    }}
                  >
                    Ask your tutor
                  </button>
                </div>
              </>
            )}
            {draft.stage === 2 && draft.correction && (
              <>
                <section className="callout mint">
                  <Pill>
                    {draft.correction.correct
                      ? 'A useful starting point'
                      : 'Let’s refine that'}
                  </Pill>
                  <h2>
                    {draft.correction.correct
                      ? 'Your reasoning holds up.'
                      : 'One thing to adjust.'}
                  </h2>
                  <p>
                    {draft.correction.correct
                      ? draft.correction.strength
                      : draft.correction.suggested}
                  </p>
                  {draft.correction.gap && <p>{draft.correction.gap}</p>}
                </section>
                <div className="answer-recap">
                  <span className="eyebrow">YOUR ORIGINAL REASONING</span>
                  <p className="preserve">{draft.reasoning}</p>
                </div>
                <p className="explanation">{draft.correction.next}</p>
                <Button onClick={() => update({ stage: 3 })}>
                  Try another situation
                  <Icon name="arrow" />
                </Button>
              </>
            )}
            {draft.stage === 3 && (
              <>
                <section className="callout peach">
                  <span className="eyebrow">A CHANGED SITUATION</span>
                  <h3>{lesson.transfer.scenario}</h3>
                </section>
                <label className="field-label">
                  {lesson.transfer.question}
                  <textarea
                    rows={5}
                    value={draft.transfer}
                    onChange={(e) => update({ transfer: e.target.value })}
                    placeholder="Explain the distinction in your own words."
                    maxLength={4000}
                  />
                </label>
                <Button
                  disabled={busy || draft.transfer.trim().length < 10}
                  onClick={() => void finish()}
                >
                  {busy ? 'Saving your work…' : 'Save my work'}
                  <Icon name="check" />
                </Button>
                <p className="muted">
                  A later independent situation will test whether this skill
                  transfers.
                </p>
              </>
            )}
            {draft.stage === 4 && (
              <>
                <section className="hero mint completion">
                  <div className="row between">
                    <span className="circle">
                      <Icon name="check" />
                    </span>
                    <Pill>
                      {result ? '+25 practice points' : 'Sync pending'}
                    </Pill>
                  </div>
                  <h2>
                    {result
                      ? 'You practiced a useful distinction.'
                      : 'Your answers are safe here.'}
                  </h2>
                  <p>
                    {result?.feedback.strength ||
                      'Reconnect to finish the assessment and sync your progress.'}
                  </p>
                  {result && <p>{result.feedback.next}</p>}
                </section>
                <p>
                  {result
                    ? p.config.demo
                      ? 'Saved in this design preview.'
                      : 'Saved to your private account.'
                    : 'No points or demonstrated skill have been recorded yet.'}
                </p>
                <div className="row wrap">
                  <Button onClick={() => p.go('today')}>
                    Done for now
                    <Icon name="arrow" />
                  </Button>
                  <Button kind="secondary" onClick={() => p.go('progress')}>
                    View progress
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <aside className="context lesson-context">
        <div className="row between">
          <h3>This lesson</h3>
          <span className="circle small">
            <Icon name="book" />
          </span>
        </div>
        <ol className="lesson-stages">
          {stages.map((s, i) => (
            <li key={s} aria-current={draft.stage === i ? 'step' : undefined}>
              <span
                className={'circle small ' + (draft.stage === i ? 'mint' : '')}
              >
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <Button
          kind="lavender"
          disabled={draft.stage === 4}
          onClick={() => {
            setTutor(true);
            update({ assisted: true });
          }}
        >
          Ask your tutor
        </Button>
        <p>
          {lesson?.generated
            ? 'Source-grounded AI lesson'
            : 'Reviewed stable lesson'}
          <br />
          {lesson?.sources[0]?.title}
          <br />
          {!lesson?.generated && !p.config.ai
            ? 'Feedback uses a guided concept check.'
            : ''}
        </p>
        <button className="text-button" onClick={() => setSources(true)}>
          Show sources
          <Icon name="arrow" size={16} />
        </button>
        <button
          className="text-button"
          onClick={() => void cache()}
          disabled={!lesson || cached}
        >
          {cached ? 'Saved for offline reading' : 'Save for offline reading'}
          <Icon name="book" size={16} />
        </button>
      </aside>
      {sources && lesson && (
        <Modal title="Where this comes from" onClose={() => setSources(false)}>
          {lesson.sources.map((s) => (
            <article key={s.url} className="source">
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title} ↗
              </a>
              <p>{s.supports}</p>
              <small>Checked {s.checked_at.slice(0, 10)}</small>
            </article>
          ))}
          <p className="muted">{lesson.uncertainty}</p>
          <Button kind="secondary" onClick={() => void cache()}>
            {cached ? 'Saved offline' : 'Save for offline reading'}
          </Button>
        </Modal>
      )}
      {tutor && (
        <Tutor {...p} sessionId={p.sessionId} close={() => setTutor(false)} />
      )}
    </div>
  );
}
function Tutor(p: ViewProps & { sessionId: string; close: () => void }) {
  const [messages, setMessages] = useState<
      { role: 'user' | 'assistant'; content: string }[]
    >([]),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message) return;
    setBusy(true);
    setError('');
    try {
      if (p.config.demo || !p.config.ai)
        throw new Error(
          'AI tutoring needs an OpenRouter API key in the connected app. The lesson and its sources are still available.',
        );
      const r = await api<{ reply: string }>('/api/tutor', {
        sessionId: p.sessionId,
        message,
        history: messages.slice(-8),
        eventId: crypto.randomUUID(),
      });
      setMessages((m) => [
        ...m,
        { role: 'user', content: message },
        { role: 'assistant', content: r.reply },
      ]);
      setInput('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="A little help, when you need it." onClose={p.close}>
      <p className="muted">Tutor-supported practice is saved as assisted.</p>
      <div className="conversation">
        {!messages.length && (
          <div className="bubble assistant">
            Which part would you like to unpack?
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={'bubble ' + m.role}>
            {m.content}
          </div>
        ))}
      </div>
      <form onSubmit={send}>
        <label>
          Your question
          <textarea
            rows={3}
            value={input}
            maxLength={2000}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Explain it with a different example…"
          />
        </label>
        <Button type="submit" disabled={busy || !input.trim()}>
          {busy ? 'Thinking…' : 'Ask tutor'}
          <Icon name="arrow" />
        </Button>
      </form>
      {error && (
        <p role="alert" className="form-message">
          {error}
        </p>
      )}
    </Modal>
  );
}
