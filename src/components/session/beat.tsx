'use client';
import { useEffect, useRef, useState } from 'react';
import { Blocks } from './blocks';
import { Icon } from '@/components/icons';
import { CONFIDENCE_LABEL, canRetry, type Beat, type Block, type Confidence, type Feedback, type Gauge } from '@/lib/learning/run';
import { answerXp } from '@/lib/gamify';
import type { RunState } from './use-run';

export const BEAT_LABEL: Record<string, string> = {
  gauge: 'Where you’re starting',
  recall: 'Warm-up',
  situation: 'Situation',
  orient: 'The big picture',
  explain: 'The idea',
  worked: 'Worked example',
  check: 'Your call',
  attempt: 'In your words',
  transfer: 'New situation',
  produce: 'This week’s work',
  roleplay: 'Say it out loud',
  break: 'Break',
  recap: 'Wrap-up',
};
const BUILDING: Record<string, string> = {
  gauge: 'Looking ahead',
  recall: 'Picking something worth revisiting',
  situation: 'Setting the scene',
  orient: 'Mapping the territory',
  explain: 'Finding the clearest way in',
  worked: 'Working through an example',
  check: 'Framing your decision',
  attempt: 'Preparing your turn',
  transfer: 'Changing the situation',
  produce: 'Framing this week’s work',
  recap: 'Looking back over the session',
  roleplay: 'Casting your counterpart',
};
export const VERDICT: Record<Feedback['verdict'], string> = {
  solid: 'Solid',
  partial: 'Partly there',
  missed: 'Not yet',
};
const GAUGES: { value: Gauge; label: string; detail: string }[] = [
  { value: 'new', label: 'New to me', detail: 'Start from the beginning' },
  { value: 'heard', label: 'Heard of it', detail: 'A quick explanation, then practice' },
  { value: 'used', label: 'I’ve used it', detail: 'Skip ahead to something harder' },
];
const CONFIDENCES: Confidence[] = ['low', 'medium', 'high'];

// Plain first sentence of some blocks, for one-line summaries.
export function firstSentence(blocks: Block[] | undefined, max = 110) {
  const text = (blocks || [])
    .filter((b) => b.type !== 'visual')
    // List markers aren't sentences: "1. Look at…" should read "Look at…".
    .map((b) => (b as { md: string }).md.replace(/^\s*(?:\d+[.)]|[-*])\s+/gm, ''))
    .join(' ')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const first = text.split(/(?<=[.!?])\s/)[0] || text;
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first;
}

// What a finished step comes down to, for the trail.
function summary(beat: Beat) {
  if (beat.status === 'skipped') return 'Skipped';
  if (beat.type === 'gauge') return GAUGES.find((g) => g.value === beat.response?.gauge)?.label || 'Skipped';
  if (beat.type === 'break') return `${beat.minutes}-minute break`;
  if (beat.type === 'roleplay') return beat.practice?.status === 'done' ? firstSentence(beat.feedback?.blocks) || 'Practised out loud' : 'Practice conversation';
  if (beat.feedback) return firstSentence(beat.feedback.blocks);
  return firstSentence(beat.blocks);
}

export function BeatView({
  beat,
  state,
  current,
  track,
  collapsed = false,
  onToggle,
  children,
}: {
  beat: Beat;
  state: RunState;
  current: boolean;
  track: string;
  collapsed?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const live = state.live[beat.id],
    grading = state.grading[beat.id],
    asking = state.asking[beat.id];
  const blocks = beat.blocks || live?.partial || [];
  const streaming = !beat.blocks && !!live && !live.error;
  const past = !current;
  // Feedback that arrives while watching animates once; reloaded feedback
  // is simply there.
  const [fresh, setFresh] = useState(false);
  const wasGrading = useRef(false);
  useEffect(() => {
    if (grading) wasGrading.current = true;
    else if (wasGrading.current && beat.feedback) {
      wasGrading.current = false;
      setFresh(true);
    }
  }, [grading, beat.feedback]);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (beat.attempts?.length) setRetrying(false);
  }, [beat.attempts?.length]);
  const verdict = beat.feedback?.verdict;
  const label = BEAT_LABEL[beat.type] || beat.type;
  const unknown = !!beat.response?.unknown;
  const xp = beat.feedback ? answerXp(beat.feedback.verdict, beat.response?.confidence, unknown, beat.feedback.score) : 0;
  return (
    <section
      className={
        'beat' +
        (current ? ' current' : ' past') +
        (collapsed ? ' collapsed' : '') +
        (beat.status === 'skipped' ? ' skipped' : '') +
        (fresh ? ' fresh-feedback' : '')
      }
      data-beat={beat.type}
      data-beat-id={beat.id}
      id={'beat-' + beat.id}
      aria-busy={streaming || undefined}
    >
      {past ? (
        <button
          className={'trail-row t-' + (beat.type === 'recall' ? 'review' : track)}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={'beat-body-' + beat.id}
        >
          <i className={'dot' + (verdict ? ' v-' + verdict : ' lit')} aria-hidden="true" />
          <span className="trail-label">{label}</span>
          <span className="trail-sum">{verdict ? `${unknown ? 'Learnt it' : VERDICT[verdict]} · ` : ''}{summary(beat)}</span>
          <Icon name="chevron" size={16} />
        </button>
      ) : (
        <header className={'beat-label t-' + (beat.type === 'recall' ? 'review' : track)}>
          <i className="dot" />
          {label}
          {beat.optional && <span className="faint">· optional</span>}
        </header>
      )}
      <div className="beat-body" id={'beat-body-' + beat.id} inert={collapsed || undefined}>
        <div className="beat-inner">
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
          {(beat.attempts || []).map((a, i) => (
            <div className="attempt" key={i}>
              <p className="label">
                <i className={'dot v-' + a.feedback.verdict} /> {i === 0 ? 'First try' : `Try ${i + 1}`} · {VERDICT[a.feedback.verdict]}
              </p>
              <p className="attempt-text">{a.response.text}</p>
              <Blocks blocks={a.feedback.blocks} />
            </div>
          ))}
          {/* While retrying, the feedback stays in view above the answer being edited. */}
          {retrying && beat.feedback && (
            <FeedbackView verdict={beat.feedback.verdict} blocks={beat.feedback.blocks} streaming={false} />
          )}
          {beat.type === 'gauge' && beat.blocks && <GaugeChoice beat={beat} state={state} current={current} />}
          {beat.question && beat.blocks && (
            <Question beat={beat} state={state} current={current} retrying={retrying} onCancelRetry={() => setRetrying(false)} />
          )}
          {(grading || beat.feedback) && !retrying && (
            <FeedbackView
              verdict={grading ? grading.verdict : beat.feedback!.verdict}
              blocks={grading ? grading.blocks : beat.feedback!.blocks}
              streaming={!!grading}
              retried={!!beat.attempts?.length && !grading}
              unknown={unknown}
              xp={!grading && fresh ? xp : 0}
              combo={!grading && fresh ? combo(state, beat.id) : 0}
            >
              {current && !grading && canRetry(beat) && (
                <button className="btn small quiet retry" onClick={() => setRetrying(true)}>
                  <Icon name="refresh" size={15} /> Try again with this in mind
                </button>
              )}
            </FeedbackView>
          )}
          {children}
          {(beat.asks || []).map((a) => (
            <div className="ask" key={a.id}>
              {a.quote && <blockquote className="ask-quote">“{a.quote}”</blockquote>}
              <p className="ask-q">
                <Icon name={a.intent === 'free' ? 'spark' : a.intent} size={15} />
                {a.prompt || (a.quote ? 'Explain this part' : '')}
              </p>
              <Blocks blocks={a.blocks} />
            </div>
          ))}
          {asking && (
            <div className="ask" id={'asking-' + beat.id}>
              {asking.quote && <blockquote className="ask-quote">“{asking.quote}”</blockquote>}
              <p className="ask-q">
                <Icon name={asking.intent === 'free' ? 'spark' : asking.intent} size={15} />
                {asking.prompt || INTENT_TEXT[asking.intent] || 'Explain this part'}
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
        </div>
      </div>
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

// Solid answers in a row, ending at this one.
function combo(state: RunState, beatId: string) {
  const graded = (state.run?.beats || []).filter((b) => b.feedback);
  const at = graded.findIndex((b) => b.id === beatId);
  let n = 0;
  for (let j = at; j >= 0 && graded[j].feedback!.verdict === 'solid'; j--) n++;
  return n;
}

// "How familiar is this?": one tap decides how the idea is taught.
function GaugeChoice({ beat, state, current }: { beat: Beat; state: RunState; current: boolean }) {
  const picked = beat.response?.gauge;
  return (
    <div className="gauge" role="group" aria-label="How familiar is this?">
      <p className="label">How familiar is this?</p>
      <div className="gauge-options">
        {GAUGES.map((g) => (
          <button
            key={g.value}
            className={'gauge-option' + (picked === g.value ? ' picked' : '')}
            disabled={!current || !!picked}
            onClick={() => void state.gauge(beat.id, g.value)}
          >
            <span className="gauge-meter" aria-hidden="true">
              {GAUGES.map((x, i) => (
                <i key={x.value} className={i <= GAUGES.indexOf(g) ? 'on' : ''} />
              ))}
            </span>
            <b>{g.label}</b>
            <span>{g.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedbackView({
  verdict,
  blocks,
  streaming,
  retried,
  unknown,
  xp = 0,
  combo = 0,
  children,
}: {
  verdict?: Feedback['verdict'];
  blocks: Block[];
  streaming: boolean;
  retried?: boolean;
  unknown?: boolean;
  xp?: number;
  combo?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className={'feedback' + (verdict ? ' v-' + (unknown ? 'learn' : verdict) : '')} aria-live="polite">
      <p className="feedback-verdict">
        <i className="dot" />
        {unknown ? (streaming ? 'Teaching it' : 'Here’s how it works') : verdict ? VERDICT[verdict] : 'Reading your answer'}
        {retried && <span className="faint">· second try</span>}
        {xp > 0 && (
          <span className="xp-pop num" aria-label={`${xp} XP`}>
            +{xp} XP
          </span>
        )}
        {combo >= 3 && (
          <span className="combo-pop" aria-label={`${combo} solid answers in a row`}>
            <Icon name="flame" size={13} /> {combo} in a row
          </span>
        )}
      </p>
      {blocks.length ? <Blocks blocks={blocks} streaming={streaming} /> : streaming && <Building label="" compact />}
      {children}
    </div>
  );
}

// "How sure are you?" doubles as the submit button: one tap commits the
// answer and the confidence together, so rating costs nothing extra.
function ConfidenceSubmit({
  disabled,
  onSubmit,
  groupRef,
}: {
  disabled: boolean;
  onSubmit: (c: Confidence) => void;
  groupRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="confidence" role="group" aria-label="Check your answer: how sure are you?" ref={groupRef}>
      <span className="label">How sure?</span>
      <div className="confidence-options">
        {CONFIDENCES.map((c) => (
          <button key={c} className={'btn confidence-btn c-' + c} disabled={disabled} onClick={() => onSubmit(c)}>
            <span className="confidence-meter" aria-hidden="true">
              {CONFIDENCES.map((x, i) => (
                <i key={x} className={i <= CONFIDENCES.indexOf(c) ? 'on' : ''} />
              ))}
            </span>
            {CONFIDENCE_LABEL[c]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Question({
  beat,
  state,
  current,
  retrying,
  onCancelRetry,
}: {
  beat: Beat;
  state: RunState;
  current: boolean;
  retrying: boolean;
  onCancelRetry: () => void;
}) {
  const q = beat.question!;
  const answered = !!beat.response && !retrying;
  const [choice, setChoice] = useState<number | null>(beat.response?.choice ?? null);
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null),
    group = useRef<HTMLDivElement>(null);
  const correct = (beat as Beat & { correct_index?: number }).correct_index;
  useEffect(() => {
    if (current && !answered && q.kind === 'text') area.current?.focus({ preventScroll: true });
  }, [current, answered, q.kind]);
  // A retry starts from the first answer, so it can be edited rather than retyped.
  useEffect(() => {
    if (retrying) {
      const first = beat.response?.text || '';
      setText(first);
      requestAnimationFrame(() => {
        area.current?.focus();
        area.current?.setSelectionRange(first.length, first.length);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrying]);
  const confidence = beat.response?.confidence;
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
        {answered ? (
          beat.response?.unknown ? (
            <p className="label said">You said you don’t know yet.</p>
          ) : (
            confidence && <p className="label said">You said: {CONFIDENCE_LABEL[confidence].toLowerCase()}</p>
          )
        ) : (
          <>
            <ConfidenceSubmit disabled={choice === null} onSubmit={(c) => state.answer(beat.id, { choice: choice!, confidence: c })} />
            <DontKnow onClick={() => state.answer(beat.id, { unknown: true })} />
          </>
        )}
      </div>
    );
  if (answered && beat.response?.unknown) return <p className="label said">You said you don’t know yet.</p>;
  if (answered)
    return (
      <blockquote className="your-answer">
        <span className="label">
          {beat.attempts?.length ? 'Your second try' : 'You wrote'}
          {confidence ? ` · ${CONFIDENCE_LABEL[confidence].toLowerCase()}` : ''}
        </span>
        <p>{beat.response?.text}</p>
      </blockquote>
    );
  const ok = text.trim().length >= 2;
  const submit = (c: Confidence) => {
    if (ok) void state.answer(beat.id, { text: text.trim(), confidence: c }, retrying);
  };
  return (
    <div className={'answer' + (retrying ? ' retrying' : '')}>
      {retrying && <p className="label">Your second try: edit your answer with the feedback in mind.</p>}
      <textarea
        ref={area}
        className={'textarea' + (q.long ? ' long' : '')}
        placeholder={q.placeholder || 'Write your answer…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // ⌘↵ moves to the confidence buttons, which submit.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ok) {
            e.preventDefault();
            group.current?.querySelector<HTMLButtonElement>('button')?.focus();
          }
        }}
        aria-label="Your answer"
        rows={q.long ? 7 : 3}
      />
      <div className="answer-row">
        <span className="label">
          {text.trim() ? `${text.trim().split(/\s+/).length} words` : 'Dictation works well here.'}
          {retrying && (
            <>
              {' · '}
              <button className="link" onClick={onCancelRetry}>
                Keep my first answer
              </button>
            </>
          )}
        </span>
        <ConfidenceSubmit disabled={!ok} onSubmit={submit} groupRef={group} />
      </div>
      {!retrying && <DontKnow onClick={() => state.answer(beat.id, { unknown: true })} />}
    </div>
  );
}

// Not knowing yet is a fine answer: the tutor teaches it instead of grading.
function DontKnow({ onClick }: { onClick: () => void }) {
  return (
    <button className="link dont-know" onClick={onClick}>
      I don’t know yet — teach me
    </button>
  );
}
