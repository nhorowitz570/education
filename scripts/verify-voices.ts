// Checks that every voice offered in Practice is accepted by GPT-Live.
// Billable (~$0.08). The conductor itself needs a WebRTC session (the
// sideband attach is not available for WebSocket sessions), so it is
// verified in a browser. Usage:
//   node --env-file=.env.local --import tsx scripts/verify-live-harness.ts
import OpenAI from 'openai';
import { LiveWS } from 'openai/resources/live/ws';
import { VOICES, type Voice } from '../src/lib/practice/harness';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
const model = process.env.OPENAI_VOICE_MODEL || 'gpt-live-1';

// 1. Every voice the setup sheet offers must be accepted by the model.
const accepted: Record<string, boolean> = {};
for (const voice of Object.keys(VOICES) as Voice[]) {
  accepted[voice] = await new Promise<boolean>((resolve) => {
    const ws = new LiveWS(client);
    const done = (ok: boolean) => {
      if (ws.socket.readyState === 1) ws.send({ type: 'session.close' });
      setTimeout(() => ws.socket.platformSocket.terminate?.(), 3000);
      resolve(ok);
    };
    const t = setTimeout(() => done(false), 15000);
    ws.socket.on('open', () =>
      ws.send({
        type: 'session.start',
        session: { model, store: false, instructions: 'Say hello.', audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice } }, delegation: { type: 'client' } },
      } as never),
    );
    ws.on('event', ((e: { type: string; session?: { audio?: { output?: { voice?: string } } } }) => {
      if (e.type === 'session.started') {
        clearTimeout(t);
        done(e.session?.audio?.output?.voice === voice);
      }
      if (e.type === 'error') {
        clearTimeout(t);
        done(false);
      }
    }) as never);
  });
  console.log(`voice ${voice}: ${accepted[voice] ? 'accepted' : 'REJECTED'}`);
}

process.exit(Object.values(accepted).every(Boolean) ? 0 : 1);
