import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toFile } from 'openai';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { voiceAI, structured, replySchema } from '@/lib/server/ai';
import { reserve, settle } from '@/lib/server/budget';
import { voiceInstructions } from '@/lib/voice';
export async function POST(r: Request) {
  try {
    const { user } = await context(r);
    const v = z
      .object({
        voice: z.enum(['cedar', 'willow']).default('willow'),
        audio: z
          .string()
          .regex(/^[A-Za-z0-9+/=]+$/)
          .max(1400000),
        mime: z.enum(['audio/webm', 'audio/mp4']),
        history: z
          .array(
            z.object({
              role: z.enum(['user', 'assistant']),
              text: z.string().max(3000),
            }),
          )
          .max(12),
        eventId: z.string().uuid(),
      })
      .parse(await body(r, 1500000));
    if (v.voice === 'willow')
      throw new HttpError(
        'Willow is available in Live mode. Use a text reply here or start a Live conversation.',
        400,
      );
    const bytes = Buffer.from(v.audio, 'base64');
    if (bytes.length > 1000000)
      throw new HttpError('Keep a recorded turn under one minute.');
    const client = voiceAI(),
      model =
        process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
    if (
      model !== 'gpt-4o-mini-transcribe' ||
      (process.env.OPENAI_TTS_MODEL &&
        process.env.OPENAI_TTS_MODEL !== 'gpt-4o-mini-tts')
    )
      throw new HttpError(
        'Configure and verify pricing for a different chained speech provider first.',
        503,
      );
    const reserved = await reserve(
      user.id,
      'transcribe:' + v.eventId,
      0.5,
      model,
    );
    if (reserved.existing)
      throw new HttpError('This recording was already submitted.', 409);
    const t = await client.audio.transcriptions.create({
      file: await toFile(
        bytes,
        v.mime === 'audio/webm' ? 'turn.webm' : 'turn.mp4',
        { type: v.mime },
      ),
      model,
    });
    const usage = t.usage;
    const cost =
      usage?.type === 'tokens'
        ? (usage.input_tokens * 1.25 + usage.output_tokens * 5) / 1e6
        : usage?.type === 'duration'
          ? (usage.seconds * 0.003) / 60
          : null;
    if (cost !== null) await settle(reserved.id, cost);
    const reply = await structured(
      user.id,
      'chain-reply:' + v.eventId,
      replySchema,
      voiceInstructions(6, v.voice),
      { history: v.history, message: t.text },
      500,
    );
    const tts = await reserve(
      user.id,
      'tts:' + v.eventId,
      0.25,
      'gpt-4o-mini-tts',
    );
    const response = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'cedar',
      instructions:
        'Use an easy, grounded warmth and relaxed conversational pacing. Subtle emphasis, natural contractions, no announcer delivery. Speak only the supplied dialogue.',
      input: reply.reply.slice(0, 1500),
      response_format: 'mp3',
    });
    const audio = Buffer.from(await response.arrayBuffer()).toString('base64');
    // Speech endpoint omits final token usage. Retain a conservative reservation rather than inventing a measured bill.
    void tts;
    return NextResponse.json({ transcript: t.text, reply: reply.reply, audio });
  } catch (e) {
    return fail(e);
  }
}
