import { LiveWS } from 'openai/resources/live/ws';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { voiceAI } from '../src/lib/server/ai';
import { reserve, settle } from '../src/lib/server/budget';
import {
  voiceInstructions,
  liveCost,
  type PracticeVoice,
} from '../src/lib/voice';
const uid = JSON.parse(readFileSync('.qa-review-account.json', 'utf8')).id;
mkdirSync('docs/verification/voice', { recursive: true });
const reports: unknown[] = [];
for (const voice of ['cedar', 'willow'] as PracticeVoice[]) {
  const budget = await reserve(
    uid,
    'qa:voice:' + voice + ':' + crypto.randomUUID(),
    0.06,
    'gpt-live-1',
  );
  const report = await new Promise<Record<string, unknown>>(
    (resolve, reject) => {
      const ws = new LiveWS(voiceAI());
      const chunks: Buffer[] = [];
      let transcript = '',
        started = false,
        finished = false,
        voiceAccepted = false;
      let feed: ReturnType<typeof setInterval> | undefined,
        closeTimer: ReturnType<typeof setTimeout> | undefined;
      const close = () => {
        if (feed) clearInterval(feed);
        if (started && ws.socket.readyState === 1)
          ws.send({ type: 'session.close' });
      };
      const timeout = setTimeout(() => {
        close();
        setTimeout(() => {
          if (!finished) {
            ws.socket.platformSocket.terminate();
            reject(new Error(voice + ': final session usage not confirmed.'));
          }
        }, 12000);
      }, 25000);
      ws.socket.on('open', () =>
        ws.send({
          type: 'session.start',
          session: {
            model: 'gpt-live-1',
            store: false,
            instructions: voiceInstructions(6, voice),
            audio: {
              format: { type: 'audio/pcm', rate: 24000 },
              output: { voice },
            },
            delegation: { type: 'client' },
          },
        }),
      );
      ws.on('event', (e) => {
        if (e.type === 'session.started') {
          started = true;
          voiceAccepted = e.session.audio?.output?.voice === voice;
          console.log(voice + ': session started with requested voice.');
          feed = setInterval(
            () =>
              ws.send({
                type: 'session.input_audio.append',
                audio: Buffer.alloc(4800).toString('base64'),
              }),
            100,
          );
          ws.send({
            type: 'session.instructions.append',
            delegation_id: null,
            content:
              'Begin the conversation now with a brief natural opening in English, following the role-play instructions. Then listen.',
          });
          ws.send({
            type: 'session.commentary.append',
            delegation_id: null,
            content:
              'The learner is ready for the practice conversation. Begin now.',
          });
        }
        if (e.type === 'session.output_audio.delta')
          chunks.push(Buffer.from(e.delta, 'base64'));
        if (e.type === 'session.output_transcript.delta') {
          transcript += e.delta;
          if (!closeTimer) closeTimer = setTimeout(close, 9000);
        }
        if (e.type === 'session.delegation.created')
          ws.send({
            type: 'session.commentary.append',
            delegation_id: e.delegation.id,
            content:
              'Continue this fictional colleague conversation. No tools are available.',
          });
        if (e.type === 'session.closed') {
          finished = true;
          clearTimeout(timeout);
          if (closeTimer) clearTimeout(closeTimer);
          if (feed) clearInterval(feed);
          ws.close();
          const pcm = Buffer.concat(chunks),
            wav = Buffer.alloc(44);
          wav.write('RIFF', 0);
          wav.writeUInt32LE(36 + pcm.length, 4);
          wav.write('WAVEfmt ', 8);
          wav.writeUInt32LE(16, 16);
          wav.writeUInt16LE(1, 20);
          wav.writeUInt16LE(1, 22);
          wav.writeUInt32LE(24000, 24);
          wav.writeUInt32LE(48000, 28);
          wav.writeUInt16LE(2, 32);
          wav.writeUInt16LE(16, 34);
          wav.write('data', 36);
          wav.writeUInt32LE(pcm.length, 40);
          writeFileSync(
            'docs/verification/voice/' + voice + '.wav',
            Buffer.concat([wav, pcm]),
          );
          void settle(budget.id, liveCost(e.usage.seconds))
            .then(() =>
              resolve({
                voice,
                voiceAccepted,
                sessionStarted: started,
                audioBytes: pcm.length,
                transcript,
                seconds: e.usage.seconds,
                finalUsageConfirmed: true,
                costUSD: liveCost(e.usage.seconds),
              }),
            )
            .catch(reject);
        }
      });
      ws.on('error', (e) => {
        console.error(voice + ': ' + e.message);
        close();
        if (!started) {
          clearTimeout(timeout);
          ws.socket.platformSocket.terminate();
          reject(new Error('Live session could not start.'));
        }
      });
    },
  );
  reports.push(report);
  console.log(JSON.stringify(report));
}
writeFileSync(
  'docs/verification/voice.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      transport:
        'server WebSocket with synthetic silence; no user microphone captured',
      reports,
    },
    null,
    2,
  ) + '\n',
);
