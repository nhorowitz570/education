import { NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { voiceAI } from '@/lib/server/ai';
import { privateRows, privatePut } from '@/lib/server/state';
import { reserve, settle } from '@/lib/server/budget';
import { voiceInstructions, liveCost } from '@/lib/voice';
export async function POST(r: Request) {
  try {
    const { user } = await context(r),
      v = z
        .object({
          sdp: z.string().min(20).max(50000),
          pause: z.number().int().min(2).max(10),
          retain: z.boolean(),
          voice: z.enum(['cedar', 'willow']).default('willow'),
          eventId: z.string().uuid(),
        })
        .parse(await body(r)),
      client = voiceAI();
    const health = await privateRows<{ heartbeat: string }>('worker_health');
    if (
      !health.some((h) => Date.now() - new Date(h.heartbeat).getTime() < 15000)
    )
      throw new HttpError(
        'Voice monitoring is offline. Start the background worker before opening a paid session.',
        503,
      );
    const limit = Math.max(
        30,
        Math.min(600, Number(process.env.VOICE_SESSION_LIMIT_SECONDS || 600)),
      ),
      reservation = await reserve(
        user.id,
        'live:' + v.eventId,
        liveCost(limit + 30),
        process.env.OPENAI_VOICE_MODEL || 'gpt-live-1',
      );
    if (reservation.existing)
      throw new HttpError('This voice start was already used. Try again.', 409);
    const row = {
      id: crypto.randomUUID(),
      user_id: user.id,
      reservation_id: reservation.id,
      expires_at: new Date(Date.now() + limit * 1000).toISOString(),
      retain_transcript: v.retain,
      client_seen_at: new Date().toISOString(),
      status: 'active',
    };
    // The unique unresolved-session index claims a slot before any paid provider call.
    try {
      await privatePut('voice_sessions', row);
    } catch {
      await settle(reservation.id, 0, true);
      throw new HttpError(
        'An earlier conversation is still open or awaiting cost reconciliation. End it before starting another.',
        409,
      );
    }
    let result;
    try {
      result = await client.live.create({
        session: {
          model: process.env.OPENAI_VOICE_MODEL || 'gpt-live-1',
          instructions: voiceInstructions(v.pause, v.voice),
          audio: { output: { voice: v.voice } },
          store: false,
          delegation: { type: 'client' },
          client: {
            data_channel: {
              allowed_client_events: [
                'session.input_audio.mute',
                'session.input_audio.unmute',
                'session.close',
              ],
              allowed_server_events: [
                'session.started',
                'session.input_transcript.delta',
                'session.output_transcript.delta',
                'session.input_audio.muted',
                'session.input_audio.unmuted',
                'session.usage.updated',
                'session.closed',
                'error',
              ].map((type) => ({ type })),
            },
          },
        },
        transport: { type: 'webrtc', sdp: v.sdp },
      });
    } catch (e) {
      const rejected =
        e instanceof OpenAI.APIError &&
        e.status &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408;
      await privatePut('voice_sessions', {
        ...row,
        status: rejected ? 'closed' : 'unconfirmed',
      });
      if (rejected) await settle(reservation.id, 0, true);
      throw e;
    }
    await privatePut('voice_sessions', {
      ...row,
      provider_id: result.session.id,
    });
    // Attach the trusted monitor before the browser can connect and immediately
    // disappear. Otherwise a short call can end before final usage is observed.
    const monitorDeadline = Date.now() + 8000;
    let monitored = false;
    while (Date.now() < monitorDeadline) {
      const current = (
        await privateRows<{
          id: string;
          monitor_seen_at?: string;
          status: string;
        }>('voice_sessions', user.id)
      ).find((s) => s.id === row.id);
      if (current?.status === 'active' && current.monitor_seen_at) {
        monitored = true;
        break;
      }
      if (current?.status !== 'active') break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!monitored) {
      await privatePut('voice_sessions', {
        ...row,
        provider_id: result.session.id,
        status: 'closing',
      });
      throw new HttpError(
        'The voice monitor could not attach. This session is being closed; try again shortly.',
        503,
      );
    }
    return NextResponse.json({
      id: row.id,
      sdp: result.transport.sdp,
      expiresAt: row.expires_at,
      limitSeconds: limit,
    });
  } catch (e) {
    return fail(e);
  }
}
