import { NextResponse } from 'next/server';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { mutate, readState } from '@/lib/server/state';
import { commandSchema, applyCommand } from '@/lib/commands';
import { dateInZone } from '@/lib/plan';
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
    // The server's own date decides what can still change.
    if (['shorten', 'recover', 'undo', 'plan-edit'].includes(command.type)) {
      const s = await readState(user.id);
      if ('today' in command)
        command.today = dateInZone(
          s.plan?.schedule.timezone || 'America/Los_Angeles',
        );
    }
    if (command.type === 'activate')
      throw new HttpError('Use the reviewed import flow to activate a plan.');
    // Sessions are graded and finished by the run engine (/api/runs).
    if (command.type === 'complete')
      throw new HttpError('Finish sessions from the session screen.');
    let attempt: Attempt | undefined;
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
