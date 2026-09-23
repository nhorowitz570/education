'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import type { Line } from '@/lib/practice/harness';

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'ending' | 'ended' | 'error';

// One GPT-Live conversation over WebRTC. Every await checks whether the
// screen was left meanwhile, so a half-started call never keeps the
// microphone or a paid session open.
export function useLive(practiceId: string) {
  const [status, setStatus] = useState<LiveStatus>('idle'),
    [lines, setLines] = useState<Line[]>([]),
    [error, setError] = useState(''),
    [muted, setMuted] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [limit, setLimit] = useState(0);
  const pc = useRef<RTCPeerConnection | null>(null),
    dc = useRef<RTCDataChannel | null>(null),
    mic = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    voiceId = useRef(''),
    started = useRef(0),
    usage = useRef(0),
    disposed = useRef(false),
    closedSignal = useRef<(() => void) | null>(null),
    ctx = useRef<AudioContext | null>(null),
    levels = useRef({ me: 0, them: 0 }),
    analysers = useRef<{ me?: AnalyserNode; them?: AnalyserNode }>({});
  const linesRef = useRef<Line[]>([]);
  linesRef.current = lines;

  const release = useCallback(() => {
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    dc.current?.close();
    pc.current?.close();
    dc.current = null;
    pc.current = null;
    if (audio.current) {
      audio.current.srcObject = null;
      audio.current = null;
    }
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    analysers.current = {};
  }, []);

  const beating = useRef(false);
  const control = useCallback(
    async (op: 'heartbeat' | 'close') => {
      if (!voiceId.current) return;
      // Heartbeats never overlap; a slow one simply skips the next tick.
      if (op === 'heartbeat' && beating.current) return;
      beating.current = op === 'heartbeat';
      try {
        await api(`/api/practice/${practiceId}`, { action: 'control', voiceId: voiceId.current, op, seconds: usage.current });
      } catch {
      } finally {
        if (op === 'heartbeat') beating.current = false;
      }
    },
    [practiceId],
  );

  const end = useCallback(async () => {
    if (!pc.current) return;
    setStatus('ending');
    const finished = new Promise<void>((resolve) => (closedSignal.current = resolve));
    if (dc.current?.readyState === 'open') dc.current.send(JSON.stringify({ type: 'session.close' }));
    void control('close');
    await Promise.race([finished, new Promise<void>((r) => setTimeout(r, 8000))]);
    release();
    setStatus('ended');
  }, [control, release]);

  const start = useCallback(async () => {
    disposed.current = false;
    setError('');
    setStatus('connecting');
    const gone = () => disposed.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
        throw new Error('Voice isn’t available in this browser. You can practise in text instead.');
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (gone()) return media.getTracks().forEach((t) => t.stop());
      mic.current = media;
      const peer = new RTCPeerConnection();
      pc.current = peer;
      media.getTracks().forEach((t) => peer.addTrack(t, media));
      const player = new Audio();
      player.autoplay = true;
      audio.current = player;
      const context = new AudioContext();
      ctx.current = context;
      const meAnalyser = context.createAnalyser();
      meAnalyser.fftSize = 256;
      context.createMediaStreamSource(media).connect(meAnalyser);
      analysers.current.me = meAnalyser;
      peer.ontrack = (e) => {
        const remote = e.streams[0] || new MediaStream([e.track]);
        player.srcObject = remote;
        void player.play().catch(() => setError('Tap anywhere to turn on the audio.'));
        const them = context.createAnalyser();
        them.fftSize = 256;
        context.createMediaStreamSource(remote).connect(them);
        analysers.current.them = them;
      };
      const channel = peer.createDataChannel('oai-events');
      dc.current = channel;
      channel.onmessage = ({ data }) => {
        let e: { type: string; delta?: string; usage?: { seconds: number } };
        try {
          e = JSON.parse(data);
        } catch {
          return;
        }
        if (e.type === 'session.started') {
          started.current = Date.now();
          setStatus('live');
        }
        if (e.type === 'session.usage.updated' && e.usage) usage.current = e.usage.seconds;
        if (e.type === 'session.input_transcript.delta' || e.type === 'session.output_transcript.delta') {
          const role = e.type.includes('input') ? 'user' : 'assistant';
          setLines((old) => {
            const last = old.at(-1);
            if (last?.role === role) return [...old.slice(0, -1), { role, text: last.text + (e.delta || '') }];
            return [...old, { role, text: e.delta || '' }];
          });
        }
        if (e.type === 'session.input_audio.muted') setMuted(true);
        if (e.type === 'session.input_audio.unmuted') setMuted(false);
        if (e.type === 'session.closed') {
          closedSignal.current?.();
          release();
          setStatus('ended');
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          setError('The audio connection dropped.');
          release();
          setStatus('ended');
        }
      };
      await peer.setLocalDescription(await peer.createOffer());
      await new Promise<void>((resolve) => {
        if (peer.iceGatheringState === 'complete') return resolve();
        const t = setTimeout(resolve, 2500); // good-enough candidates; don't wait forever
        peer.addEventListener('icegatheringstatechange', () => {
          if (peer.iceGatheringState === 'complete') {
            clearTimeout(t);
            resolve();
          }
        });
      });
      if (gone()) return release();
      const r = await api<{ voiceId: string; sdp: string; limitSeconds: number; plannedSeconds: number }>(
        `/api/practice/${practiceId}`,
        { action: 'live', sdp: peer.localDescription!.sdp },
      );
      voiceId.current = r.voiceId;
      setLimit(r.limitSeconds);
      if (gone()) {
        void control('close');
        return release();
      }
      await peer.setRemoteDescription({ type: 'answer', sdp: r.sdp });
    } catch (e) {
      release();
      if (voiceId.current) void control('close');
      setStatus('error');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone access is off. Allow it in your browser’s site settings, or practise in text.'
          : (e as Error).message,
      );
    }
  }, [practiceId, release, control]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (dc.current?.readyState === 'open')
      dc.current.send(JSON.stringify({ type: next ? 'session.input_audio.mute' : 'session.input_audio.unmute' }));
    setMuted(next);
  }, [muted]);

  // Heartbeat, clock and the hard limit.
  useEffect(() => {
    if (status !== 'live') return;
    const clock = setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setElapsed(s);
      if (limit && s >= limit - 5) void end();
    }, 500);
    const beat = setInterval(() => void control('heartbeat'), 5000);
    return () => {
      clearInterval(clock);
      clearInterval(beat);
    };
  }, [status, limit, end, control]);

  // Leaving the screen ends the call and releases the microphone.
  useEffect(
    () => () => {
      disposed.current = true;
      if (dc.current?.readyState === 'open') dc.current.send(JSON.stringify({ type: 'session.close' }));
      void control('close');
      release();
    },
    [control, release],
  );

  const sample = useCallback(() => {
    const read = (a?: AnalyserNode) => {
      if (!a) return 0;
      const buf = new Uint8Array(a.fftSize);
      a.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    };
    const me = read(analysers.current.me),
      them = read(analysers.current.them);
    levels.current = { me: levels.current.me * 0.6 + me * 0.4, them: levels.current.them * 0.6 + them * 0.4 };
    return levels.current;
  }, []);

  return { status, lines, linesRef, error, muted, elapsed, limit, start, end, toggleMute, sample };
}
