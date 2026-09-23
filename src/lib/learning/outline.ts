// Deterministic session structure. The outline is built instantly from the
// plan and the learner model; the tutor fills each beat when it is reached.
// This keeps "Begin" immediate and makes pacing predictable, while content
// stays adaptive.

export type BeatType =
  | 'recall'
  | 'situation'
  | 'explain'
  | 'check'
  | 'attempt'
  | 'transfer'
  | 'roleplay'
  | 'produce'
  | 'break'
  | 'recap';

export type OutlineBeat = {
  id: string;
  type: BeatType;
  minutes: number;
  concept?: string;
  // Guidance for the tutor about this beat's purpose in the session.
  intent: string;
  // Beats after the day's commitment point are offered, not required.
  optional?: boolean;
};

export type OutlineInput = {
  kind: 'session' | 'review' | 'return' | 'explore';
  minutes: number; // time available
  track?: string; // finance | communication | judgment | ...
  concepts: string[]; // concepts this session teaches
  known?: number; // learner's current strength on those concepts, 0..1
  dueReviews: string[]; // concepts due for retrieval, highest priority first
  commitmentMinutes?: number; // e.g. 60 in the first two weeks
  evidence?: string; // the week's evidence task, if this session produces it
  voice?: boolean;
};

const MIN: Record<BeatType, number> = {
  recall: 3,
  situation: 4,
  explain: 6,
  check: 4,
  attempt: 10,
  transfer: 8,
  roleplay: 15,
  produce: 15,
  break: 5,
  recap: 3,
};

let seq = 0;
const beat = (type: BeatType, intent: string, extra: Partial<OutlineBeat> = {}): OutlineBeat => ({
  id: `${type}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  type,
  minutes: extra.minutes ?? MIN[type],
  intent,
  ...extra,
});

export function outline(i: OutlineInput): OutlineBeat[] {
  const main = i.concepts[0];
  const reviews = i.dueReviews.slice(0, i.minutes >= 60 ? 2 : 1);
  const warmup = reviews.map((c) =>
    beat('recall', 'Warm-up retrieval of an earlier idea that is starting to fade.', { concept: c }),
  );

  if (i.kind === 'review') {
    const due = i.dueReviews.slice(0, Math.max(2, Math.floor(i.minutes / 3)));
    return [
      ...due.map((c) => beat('recall', 'Spaced retrieval in a fresh mini-situation.', { concept: c })),
      beat('recap', 'Two sentences: what held up and what to watch.', { minutes: 1 }),
    ];
  }
  if (i.kind === 'explore') {
    return [
      beat('explain', 'Answer the learner’s curiosity directly and well, with a visual if it helps.', { concept: main }),
      beat('check', 'One question that makes them apply the idea just explored.', { concept: main, optional: true }),
      beat('recap', 'Connect what they explored to their plan or goals, briefly.', { minutes: 2, optional: true }),
    ];
  }
  if (i.kind === 'return' || i.minutes <= 25) {
    return [
      ...warmup.slice(0, 1),
      beat('situation', 'A short, low-pressure situation to restart momentum.', { concept: main }),
      beat('explain', 'The essential idea, briefly.', { concept: main, minutes: 4 }),
      beat('check', 'A decision that uses the idea.', { concept: main }),
      beat('recap', 'Name what they did and the next step.', { minutes: 2 }),
    ];
  }

  // A learner who already shows the idea skips redundant instruction and goes
  // straight to harder application.
  const fluent = (i.known ?? 0) >= 0.8;
  const communication = /communicat|leader|convers|negotiat|delegat/i.test(i.track || '');
  const core: OutlineBeat[] = [
    ...warmup,
    beat('situation', 'Open on a realistic situation that makes the objective matter.', { concept: main }),
    ...(fluent
      ? []
      : [beat('explain', 'Explain the one idea needed to resolve the situation.', { concept: main })]),
    beat('check', fluent ? 'A harder decision that exposes nuance.' : 'A decision that tests the idea just explained.', {
      concept: main,
    }),
    beat('attempt', 'The learner explains their reasoning or produces a small output; guided if needed.', {
      concept: main,
    }),
  ];
  const second: OutlineBeat[] = [
    beat('transfer', 'The same idea in a changed situation, so they must transfer it.', {
      concept: i.concepts[1] || main,
    }),
    communication && i.voice
      ? beat('roleplay', 'Spoken role-play applying the skill with a realistic counterpart.', { concept: main })
      : beat('attempt', 'Apply the idea to a new scenario and justify the choice.', {
          concept: i.concepts[1] || main,
        }),
  ];
  const third: OutlineBeat[] = i.evidence
    ? [beat('produce', `Produce this week’s evidence: ${i.evidence}`, { concept: main })]
    : [beat('transfer', 'A final, more open application or discussion.', { concept: main })];

  let beats: OutlineBeat[] = [...core];
  let used = total(beats);
  const add = (section: OutlineBeat[], withBreak: number) => {
    const cost = total(section) + withBreak;
    if (used + cost > i.minutes + 5) return false;
    if (withBreak) beats.push(beat('break', 'Short break.', { minutes: withBreak }));
    beats.push(...section);
    used += cost;
    return true;
  };
  add(second, i.minutes >= 60 ? 5 : 0);
  if (i.minutes >= 90) add(third, i.minutes >= 100 ? 10 : 0);
  beats.push(beat('recap', 'Close the session.', { minutes: 3 }));

  // Mark everything after the commitment point as optional (plan: weeks 1–2
  // commit to the first hour; the rest is available, not mandatory).
  if (i.commitmentMinutes && i.commitmentMinutes < i.minutes) {
    let t = 0,
      crossed = false;
    beats = beats.map((b) => {
      t += b.minutes;
      if (b.type !== 'recap' && t > i.commitmentMinutes! + 3) crossed = true;
      return crossed && b.type !== 'recap' ? { ...b, optional: true } : b;
    });
  }
  return beats;
}

export const total = (beats: OutlineBeat[]) => beats.reduce((s, b) => s + b.minutes, 0);
