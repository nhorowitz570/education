import { NextResponse } from 'next/server';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { mutate, readState } from '@/lib/server/state';
import { commandSchema, applyCommand } from '@/lib/commands';
import { dateInZone } from '@/lib/plan';
import { getLesson, assess } from '@/lib/server/lessons';
import type { Attempt } from '@/lib/types';
export async function POST(request: Request) {
  try {
    const { user } = await context(request),
      command = commandSchema.parse(await body(request));
    if (command.type === 'record') {
      if (new Date(command.record.updated_at).getTime() > Date.now() + 300000)
        throw new HttpError(
          'The activity time is in the future. Check your device clock.',
        );
    }
    if (['shorten', 'recover', 'undo'].includes(command.type)) {
      const s = await readState(user.id);
      if ('today' in command)
        command.today = dateInZone(
          s.plan?.schedule.timezone || 'America/Los_Angeles',
        );
    }
    if (command.type === 'activate')
      throw new HttpError('Use the reviewed import flow to activate a plan.');
    let attempt: Attempt | undefined;
    if (command.type === 'complete') {
      const state = await readState(user.id),
        plan = state.plan;
      if (!plan) throw new HttpError('Import a plan first.');
      const baseId = command.sessionId.split(':review:')[0];
      if (!plan.sessions.some((s) => s.id === baseId))
        throw new HttpError('This session is not in your plan.');
      const prior = state.attempts.find(
        (a) => a.session_id === command.sessionId,
      );
      if (prior) return NextResponse.json({ state, ownerId: user.id });
      const { lesson, key } = await getLesson(
        user.id,
        baseId,
        command.reviewOf,
      );
      if (command.sessionId !== lesson.session_id)
        throw new HttpError('The review session does not match this lesson.');
      if (command.lessonId !== lesson.id)
        throw new HttpError('The lesson changed. Reload it before saving.');
      const feedback = await assess(
        user.id,
        lesson,
        key,
        command.choice,
        command.reasoning,
        command.transfer,
        command.assisted,
      );
      attempt = {
        id: command.eventId,
        plan_id: plan.plan_id,
        session_id: command.sessionId,
        objective_id: lesson.objective_id,
        lesson_id: lesson.id,
        completed_at: new Date().toISOString(),
        date: dateInZone(plan.schedule.timezone),
        reduced: state.overrides[baseId]?.status === 'reduced',
        assisted: command.assisted,
        reasoning: command.reasoning,
        transfer: command.transfer,
        feedback,
        points: 25,
        review_of: command.reviewOf,
      };
    }
    const state = await mutate(
      user.id,
      command.eventId,
      (s) => {
        if (attempt && s.plan?.plan_id !== attempt.plan_id)
          throw new HttpError(
            'Your active plan changed. Reopen the lesson before saving.',
            409,
          );
        return applyCommand(s, command, attempt);
      },
      attempt,
    );
    return NextResponse.json({ state, ownerId: user.id });
  } catch (e) {
    return fail(e);
  }
}
