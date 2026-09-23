'use client';
import { useEffect, useRef, useState } from 'react';
import { Blocks } from './blocks';
import { Icon } from '@/components/icons';
import type { Beat, Block, Feedback } from '@/lib/learning/run';
import type { RunState } from './use-run';

export const BEAT_LABEL: Record<string, string> = {
  recall: 'Warm-up',
  situation: 'Situation',
  explain: 'The idea',
  check: 'Your call',
  attempt: 'In your words',
  transfer: 'New situation',
  produce: 'This week’s work',
  roleplay: 'Say it out loud',
  break: 'Break',
  recap: 'Wrap-up',
};
const BUILDING: Record<string, string> = {
  recall: 'Picking something worth revisiting',
  situation: 'Setting the scene',
  explain: 'Finding the clearest way in',
  check: 'Framing your decision',
  attempt: 'Preparing your turn',
  transfer: 'Changing the situation',
  produce: 'Framing this week’s work',
  recap: 'Looking back over the session',
  roleplay: 'Casting your counterpart',
};
const VERDICT: Record<Feedback['verdict'], string> = {
  solid: 'Solid',
  partial: 'Partly there',
  missed: 'Not yet',
};

export function BeatView({
  beat,
  state,
  current,
  track,
  children,
}: {
  beat: Beat;
  state: RunState;
  current: boolean;
  track: string;
  children?: React.ReactNode;
}) {
  const live = state.live[beat.id],
    grading = state.grading[beat.id],
    asking = state.asking[beat.id];
  const blocks = beat.blocks || live?.partial || [];
  const streaming = !beat.blocks && !!live && !live.error;
  return (
    <section
      className={'beat' + (current ? ' current' : ' past') + (beat.status === 'skipped' ? ' skipped' : '')}
      data-beat={beat.type}
      id={'beat-' + beat.id}
      aria-busy={streaming || undefined}
    >
      <header className={'beat-label t-' + (beat.type === 'recall' ? 'review' : track)}>
        <i className="dot" />
        {BEAT_LABEL[beat.type] || beat.type}
        {beat.optional && <span className="faint">· optional</span>}
      </header>
      {live?.error ? (
        <div className="beat-error">
          <p>{live.error}</p>
          <button className="btn small" onClick={() => state.retry(beat.id)}>
            <Icon name="refresh" size={16} /> Try again
          </button>
        </div>
      ) : streaming && !blocks.length ? (
        <Building label={BUILDING[beat.type] || 'Preparing'} />
      ) : (
        <Blocks blocks={blocks} streaming={streaming} />
      )}
      {beat.question && beat.blocks && <Question beat={beat} state={state} current={current} />}
      {(grading || beat.feedback) && (
        <FeedbackView
          verdict={grading ? grading.verdict : beat.feedback!.verdict}
          blocks={grading ? grading.blocks : beat.feedback!.blocks}
          streaming={!!grading}
        />
      )}
      {children}
      {(beat.asks || []).map((a) => (
        <div className="ask" key={a.id}>
          <p className="ask-q">
            <Icon name={a.intent === 'free' ? 'spark' : a.intent} size={15} />
            {a.prompt}
          </p>
          <Blocks blocks={a.blocks} />
        </div>
      ))}
      {asking && (
        <div className="ask">
          <p className="ask-q">
            <Icon name={asking.intent === 'free' ? 'spark' : asking.intent} size={15} />
            {asking.prompt || INTENT_TEXT[asking.intent]}
          </p>
          {asking.error ? (
            <div className="beat-error">
              <p>{asking.error}</p>
              <button className="btn small" onClick={() => state.dismissAsk(beat.id)}>
                Dismiss
              </button>
            </div>
          ) : asking.partial.length ? (
            <Blocks blocks={asking.partial} streaming />
          ) : (
            <Building label="Thinking" compact />
          )}
        </div>
      )}
    </section>
  );
}
export const INTENT_TEXT: Record<string, string> = {
  why: 'Why?',
  example: 'Example',
  deeper: 'Go deeper',
  simpler: 'Simpler',
  visual: 'Show me',
  free: '',
};

export function Building({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={'building' + (compact ? ' compact' : '')} role="status">
      <p>
        <i className="pulse" aria-hidden="true" />
        {label}
      </p>
      {!compact && (
        <div aria-hidden="true">
          <div className="skeleton line" style={{ width: '92%' }} />
          <div className="skeleton line" style={{ width: '84%' }} />
          <div className="skeleton line" style={{ width: '58%' }} />
        </div>
      )}
    </div>
  );
}

function FeedbackView({ verdict, blocks, streaming }: { verdict?: Feedback['verdict']; blocks: Block[]; streaming: boolean }) {
  return (
    <div className={'feedback' + (verdict ? ' v-' + verdict : '')} aria-live="polite">
      <p className="feedback-verdict">
        <i className="dot" />
        {verdict ? VERDICT[verdict] : 'Reading your answer'}
      </p>
      {blocks.length ? <Blocks blocks={blocks} streaming={streaming} /> : streaming && <Building label="" compact />}
    </div>
  );
}

function Question({ beat, state, current }: { beat: Beat; state: RunState; current: boolean }) {
  const q = beat.question!;
  const answered = !!beat.response;
  const [choice, setChoice] = useState<number | null>(beat.response?.choice ?? null);
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const correct = (beat as Beat & { correct_index?: number }).correct_index;
  useEffect(() => {
    if (current && !answered && q.kind === 'text') area.current?.focus({ preventScroll: true });
  }, [current, answered, q.kind]);
  if (q.kind === 'choice')
    return (
      <div className="choices" role="radiogroup" aria-label="Options">
        {(q.options || []).map((o, i) => {
          const picked = (answered ? beat.response?.choice : choice) === i;
          const state_ =
            correct !== undefined ? (i === correct ? 'right' : picked ? 'wrong' : 'rest') : picked ? 'picked' : '';
          return (
            <button
              key={i}
              role="radio"
              aria-checked={picked}
              className={'choice ' + state_}
              disabled={answered}
              onClick={() => setChoice(i)}
            >
              <span className="choice-key">{String.fromCharCode(65 + i)}</span>
              <span className="choice-text">{o}</span>
              {state_ === 'right' && <Icon name="check" size={18} />}
            </button>
          );
        })}
        {!answered && (
          <div className="answer-row">
            <button className="btn primary" disabled={choice === null} onClick={() => state.answer(beat.id, { choice: choice! })}>
              Check
            </button>
          </div>
        )}
      </div>
    );
  if (answered)
    return (
      <blockquote className="your-answer">
        <span className="label">You wrote</span>
        <p>{beat.response?.text}</p>
      </blockquote>
    );
  const submit = () => {
    if (text.trim().length >= 2) void state.answer(beat.id, { text: text.trim() });
  };
  return (
    <div className="answer">
      <textarea
        ref={area}
        className={'textarea' + (q.long ? ' long' : '')}
        placeholder={q.placeholder || 'Write your answer…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label="Your answer"
        rows={q.long ? 7 : 3}
      />
      <div className="answer-row">
        <span className="label">{text.trim() ? `${text.trim().split(/\s+/).length} words` : 'Dictation works well here.'}</span>
        <button className="btn primary" disabled={text.trim().length < 2} onClick={submit}>
          Submit <span className="kbd">⌘↵</span>
        </button>
      </div>
    </div>
  );
}
