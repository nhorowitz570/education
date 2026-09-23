// Records a few seconds of every practice voice for the voice pickers
// (You → Practice voice, and Practice's setup sheet). Billable, a few cents.
// Needs macOS (afconvert). Usage:
//   node --env-file=.env.local --import tsx scripts/voice-samples.ts [voice…]
import OpenAI from 'openai';
import { LiveWS } from 'openai/resources/live/ws';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOICES, type Voice } from '../src/lib/practice/harness';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
const model = process.env.OPENAI_VOICE_MODEL || 'gpt-live-1';
const out = join(process.cwd(), 'public/voices');
mkdirSync(out, { recursive: true });

const line = (name: string) =>
  `Hi, I'm ${name}. Whenever you're ready, we'll practise this together. Take your time, and don't worry about getting it perfect.`;

function wav(pcm: Buffer, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// The session's clock only runs while it hears audio, so silence is streamed
// in real time. Output audio also runs continuously, so the recording ends a
// moment after the transcript has finished the line, and silence is trimmed.
async function record(voice: Voice) {
  const text = line(VOICES[voice].label);
  return new Promise<Buffer>((resolve, reject) => {
    const ws = new LiveWS(client);
    const chunks: Buffer[] = [];
    let said = '',
      tick: NodeJS.Timeout | undefined,
      ending: NodeJS.Timeout | undefined;
    const silence = Buffer.alloc(2400 * 2).toString('base64'); // 100 ms at 24 kHz
    const finish = () => {
      clearInterval(tick);
      if (ws.socket.readyState === 1) ws.send({ type: 'session.close' } as never);
      setTimeout(() => ws.socket.platformSocket.terminate?.(), 1000);
      resolve(trim(Buffer.concat(chunks)));
    };
    const giveUp = setTimeout(() => (said ? finish() : reject(new Error(`${voice}: no audio`))), 40000);
    ws.on('error', (e: Error) => reject(new Error(`${voice}: ${e.message}`)));
    ws.socket.on('open', () =>
      ws.send({
        type: 'session.start',
        session: {
          model,
          store: false,
          instructions: 'You record short voice samples for a settings screen. When given a line, say it exactly once, warmly and naturally, with nothing before or after it.',
          audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice } },
          delegation: { type: 'client' },
        },
      } as never),
    );
    ws.on('event', ((e: { type: string; delta?: string }) => {
      if (e.type === 'session.started') {
        tick = setInterval(() => ws.send({ type: 'session.input_audio.append', audio: silence } as never), 100);
        ws.send({ type: 'session.commentary.append', delegation_id: null, content: `Say exactly: "${text}"` } as never);
      }
      if (e.type === 'session.output_audio.delta' && e.delta) chunks.push(Buffer.from(e.delta, 'base64'));
      if (e.type === 'session.output_transcript.delta' && e.delta) {
        said += e.delta;
        if (said.replace(/\W/g, '').length >= text.replace(/\W/g, '').length - 2 && !ending) {
          clearTimeout(giveUp);
          ending = setTimeout(finish, 1500);
        }
      }
    }) as never);
  });
}

// Cuts silence from both ends (keeping a little air) and fades the edges.
function trim(pcm: Buffer) {
  const n = pcm.length / 2,
    at = (i: number) => pcm.readInt16LE(i * 2),
    loud = (i: number) => Math.abs(at(i)) > 600;
  let start = 0,
    end = n - 1;
  while (start < n && !loud(start)) start++;
  while (end > start && !loud(end)) end--;
  start = Math.max(0, start - 2400);
  end = Math.min(n - 1, end + 4800);
  const out = Buffer.alloc((end - start + 1) * 2);
  const fade = 720;
  for (let i = start; i <= end; i++) {
    const k = i - start,
      g = Math.min(1, k / fade, (end - i) / fade);
    out.writeInt16LE(Math.round(at(i) * g), k * 2);
  }
  return out;
}

// Pass voice names to re-record only those.
const only = process.argv.slice(2);
for (const voice of (Object.keys(VOICES) as Voice[]).filter((v) => !only.length || only.includes(v))) {
  const pcm = await record(voice);
  const tmp = join(out, `${voice}.wav`);
  writeFileSync(tmp, wav(pcm));
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', tmp, join(out, `${voice}.m4a`)]);
  rmSync(tmp);
  console.log(`${voice}: ${(pcm.length / 48000).toFixed(1)}s`);
}
process.exit(0);
