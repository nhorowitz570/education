// Teaching style inferred from behaviour, updated slowly so one interaction
// cannot swing it. Each dimension is 0..1 with 0.5 as the neutral default.
export type Style = {
  depth: number; // 0 brief … 1 thorough
  challenge: number; // 0 gentle … 1 stretching
  visual: number; // 0 rarely … 1 often
  questions: number; // 0 explain more … 1 ask more
  examples: number; // 0 abstract ok … 1 always concrete
  observations: number;
};
export const NEUTRAL: Style = {
  depth: 0.4,
  challenge: 0.5,
  visual: 0.5,
  questions: 0.35,
  examples: 0.7,
  observations: 0,
};

export type Signal =
  | 'asked_deeper'
  | 'asked_simpler'
  | 'asked_example'
  | 'asked_visual'
  | 'asked_why'
  | 'skipped_question'
  | 'fast_correct'
  | 'struggled'
  | 'expanded_visual';

const EFFECT: Record<Signal, Partial<Record<keyof Style, number>>> = {
  asked_deeper: { depth: 1, challenge: 0.6 },
  asked_simpler: { depth: 0, challenge: 0.3 },
  asked_example: { examples: 1 },
  asked_visual: { visual: 1 },
  asked_why: { depth: 0.75 },
  skipped_question: { questions: 0.1 },
  fast_correct: { challenge: 0.85 },
  struggled: { challenge: 0.3 },
  expanded_visual: { visual: 0.8 },
};

// Exponential moving average with a small step; early observations move it a
// bit more so personalisation shows up within the first sessions.
export function observe(style: Style, signal: Signal): Style {
  const rate = style.observations < 10 ? 0.12 : 0.06;
  const next: Style = { ...style, observations: style.observations + 1 };
  for (const [k, target] of Object.entries(EFFECT[signal]) as [keyof Style, number][])
    next[k] = next[k] + (target - next[k]) * rate;
  return next;
}

export function styleLayer(s: Style) {
  const band = (x: number, lo: string, mid: string, hi: string) => (x < 0.35 ? lo : x > 0.65 ? hi : mid);
  const words = Math.round(50 + s.depth * 140);
  return [
    `Typical reply length: about ${words - 20}–${words + 30} words unless the moment needs more.`,
    `Challenge: ${band(s.challenge, 'build confidence; keep steps small', 'steady', 'push harder; skip the obvious')}.`,
    `Visuals: ${band(s.visual, 'only when essential', 'when they clarify', 'often — this learner responds to pictures')}.`,
    `Questioning: ${band(s.questions, 'favour clear explanation over questions', 'balanced', 'likes to be asked')}.`,
    `Examples: ${band(s.examples, 'abstract framing is fine', 'mix abstract and concrete', 'always anchor in a concrete example')}.`,
    s.observations < 5 ? 'These are early estimates; stay close to defaults.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}
