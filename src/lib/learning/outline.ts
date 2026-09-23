// Fixed shapes for reviews, rehearsals and explorations. Plan sessions are
// planned one step at a time instead (planner.ts). Either way the outline is
// instant, and the tutor fills each beat when it is reached.

export type BeatType =
  | 'gauge'
  | 'recall'
  | 'situation'
  | 'orient'
  | 'explain'
  | 'worked'
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
  // Offered, not required (the end of an exploration).
  optional?: boolean;
};

export type OutlineInput = {
  kind: 'review' | 'explore' | 'rehearsal';
  minutes: number; // time available
  concepts: string[]; // concepts in play
  dueReviews: string[]; // concepts due for retrieval, highest priority first
  evidence?: string; // rehearsal: the milestone's deliverable
};

let seq = 0;
const beat = (type: BeatType, intent: string, extra: Partial<OutlineBeat> = {}): OutlineBeat => ({
  id: `${type}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  type,
  minutes: extra.minutes ?? 3,
  intent,
  ...extra,
});

export function outline(i: OutlineInput): OutlineBeat[] {
  const main = i.concepts[0];
  if (i.kind === 'review') {
    const due = i.dueReviews.slice(0, Math.max(2, Math.floor(i.minutes / 3)));
    return [
      ...due.map((c) => beat('recall', 'Spaced retrieval in a fresh mini-situation.', { concept: c })),
      beat('recap', 'Two sentences: what held up and what to watch.', { minutes: 1 }),
    ];
  }
  if (i.kind === 'rehearsal') {
    // A mock of the milestone: probe the weakest prerequisites, then produce
    // the deliverable itself under realistic conditions.
    return [
      ...i.concepts.slice(0, 2).map((c) =>
        beat('recall', 'Retrieval of an idea the milestone depends on, in a fresh situation.', { concept: c }),
      ),
      beat('check', 'A decision that exposes whether the weakest prerequisite holds.', { concept: i.concepts.at(-1) || main, minutes: 4 }),
      beat('produce', `Mock of the milestone deliverable: ${i.evidence || 'the milestone’s work'}. Brief it exactly as the milestone would be judged.`, {
        concept: main,
        minutes: Math.max(12, i.minutes - 14),
      }),
      beat('recap', 'What is ready for the milestone, the one gap to close before it, and how.'),
    ];
  }
  return [
    beat('explain', 'Answer the learner’s curiosity directly and well, with a visual if it helps.', { concept: main, minutes: 6 }),
    beat('check', 'One question that makes them apply the idea just explored.', { concept: main, optional: true, minutes: 4 }),
    beat('recap', 'Two or three lines on what they now know, and one thread worth pulling next time. This is a side trip, not part of their plan.', { minutes: 2, optional: true }),
  ];
}

export const total = (beats: OutlineBeat[]) => beats.reduce((s, b) => s + b.minutes, 0);
