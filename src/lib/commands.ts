import { z } from 'zod';
import { validRecord, validGymSettings } from './records';
import { dateSchema, timeSchema, planSchema } from './plan';
import type { AppState, UserRecord, Attempt } from './types';
import {
  applyRevision,
  shortRevision,
  moveRevision,
  recoveryRevision,
  undoRevision,
} from './schedule';
const record = z
  .object({
    id: z.string().min(1).max(180),
    kind: z.enum([
      'checkin',
      'food',
      'social',
      'workout',
      'reflection',
      'memory',
      'draft',
      'settings',
      'busy',
      'body',
      'external',
    ]),
    data: z
      .record(z.string().max(100), z.unknown())
      .refine((x) => JSON.stringify(x).length < 30000),
    updated_at: z.string().datetime(),
  })
  .refine(
    (r) =>
      validRecord(r.kind, r.data) &&
      (r.id !== 'settings:gym' || validGymSettings(r.data)),
    'Invalid activity fields.',
  );
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('record'), eventId: z.string().uuid(), record }),
  z.object({
    type: z.literal('delete-record'),
    eventId: z.string().uuid(),
    id: z.string().max(180),
  }),
  z.object({
    type: z.literal('shorten'),
    eventId: z.string().uuid(),
    sessionId: z.string().max(100),
    minutes: z.union([z.literal(20), z.literal(60), z.literal(120)]),
    today: dateSchema,
  }),
  z.object({
    type: z.literal('move'),
    eventId: z.string().uuid(),
    sessionId: z.string().max(100),
    date: dateSchema,
    time: timeSchema,
  }),
  z.object({
    type: z.literal('recover'),
    eventId: z.string().uuid(),
    today: dateSchema,
  }),
  z.object({
    type: z.literal('undo'),
    eventId: z.string().uuid(),
    revisionId: z.string().uuid(),
    today: dateSchema,
  }),
  z.object({
    type: z.literal('complete'),
    eventId: z.string().uuid(),
    lessonId: z.string().min(1).max(180),
    sessionId: z.string().max(160),
    choice: z.number().int().min(0).max(10),
    reasoning: z.string().min(10).max(4000),
    transfer: z.string().min(10).max(4000),
    assisted: z.boolean(),
    reduced: z.boolean(),
    date: dateSchema,
    reviewOf: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('activate'),
    eventId: z.string().uuid(),
    plan: planSchema,
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function applyCommand(
  state: AppState,
  c: Command,
  completion?: Attempt,
): AppState {
  switch (c.type) {
    case 'record': {
      const existing = state.records.find((r) => r.id === c.record.id);
      if (existing && existing.updated_at > c.record.updated_at) return state;
      return {
        ...state,
        records: [
          ...state.records.filter((r) => r.id !== c.record.id),
          c.record as UserRecord,
        ],
      };
    }
    case 'delete-record':
      return { ...state, records: state.records.filter((r) => r.id !== c.id) };
    case 'shorten': {
      const r = shortRevision(state, c.sessionId, c.minutes, c.today);
      r.id = c.eventId;
      return applyRevision(state, r);
    }
    case 'move': {
      const r = moveRevision(state, c.sessionId, c.date, c.time);
      r.id = c.eventId;
      return applyRevision(state, r);
    }
    case 'recover': {
      const r = recoveryRevision(state, c.today);
      r.id = c.eventId;
      return applyRevision(state, r);
    }
    case 'undo':
      return undoRevision(state, c.revisionId, c.today);
    case 'complete':
      return completion
        ? {
            ...state,
            attempts: state.attempts.some(
              (a) => a.session_id === completion.session_id,
            )
              ? state.attempts
              : [...state.attempts, completion],
            records: state.records.filter(
              (r) =>
                !(
                  r.kind === 'draft' &&
                  r.data.sessionId === c.sessionId.split(':review:')[0]
                ),
            ),
          }
        : state;
    case 'activate':
      return {
        ...state,
        plan: c.plan,
        overrides:
          state.plan?.plan_id === c.plan.plan_id ? state.overrides : {},
        revisions:
          state.plan?.plan_id === c.plan.plan_id ? state.revisions : [],
      };
  }
}
