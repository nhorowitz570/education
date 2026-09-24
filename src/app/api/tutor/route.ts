import { NextResponse } from 'next/server';
import { context, body, fail } from '@/lib/server/http';
import { ndjson } from '@/lib/server/stream';
import { tutorChat } from '@/lib/server/tutor';
import { clearThread, importThread, readThread, recentTurns, saveReply, saveUserMessage } from '@/lib/server/thread';
import { importInput, sendInput } from '@/lib/thread';
import type { TutorReply } from '@/lib/tutor';

export const maxDuration = 120;

// The persistent tutor chat, one thread per account shared by the web and
// the iPhone app. GET reads it, POST sends one message and streams the reply
// back as blocks, DELETE starts a new conversation.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    return NextResponse.json({ messages: await readThread(user.id) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const input = sendInput.parse(await body(r, 16000));
    await saveUserMessage(user.id, input.id, input.text, input.page);
    const turns = await recentTurns(user.id);
    return ndjson(async (send) => {
      let reply: Pick<TutorReply, 'blocks' | 'suggestions' | 'actions'> | undefined;
      await tutorChat(user.id, { turns, page: input.page }, (e) =>
        e.t === 'done' ? (reply = e.data as typeof reply) : send(e),
      );
      if (!reply) return;
      // The finished reply joins the thread before the client hears of it,
      // so another device that reloads sees it.
      await saveReply(user.id, input.reply_id, reply).catch(() => {});
      send({ t: 'done', data: { ...reply, id: input.reply_id } });
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(r: Request) {
  try {
    const { user } = await context(r);
    const { messages } = importInput.parse(await body(r, 400000));
    return NextResponse.json({ imported: await importThread(user.id, messages) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(r: Request) {
  try {
    const { user } = await context(r);
    await clearThread(user.id);
    return NextResponse.json({ cleared: true });
  } catch (e) {
    return fail(e);
  }
}
