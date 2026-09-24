import { context, body, fail } from '@/lib/server/http';
import { ndjson } from '@/lib/server/stream';
import { tutorChat } from '@/lib/server/tutor';
import { chatInput } from '@/lib/tutor';

export const maxDuration = 120;

// The persistent tutor chat. The thread lives on the learner's device; each
// message sends the recent turns and streams the reply back as blocks.
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const input = chatInput.parse(await body(r, 96000));
    return ndjson((send) => tutorChat(user.id, input, send));
  } catch (e) {
    return fail(e);
  }
}
