'use client';
import { useEffect, useRef, useState } from 'react';
import type { ViewProps } from './app';
import { api } from '@/lib/client/workspace';
import {
  VOICE_PROFILES,
  type PracticeVoice,
  type VoiceLine,
} from '@/lib/voice';
import { Button, Pill, SectionTitle } from './ui';
import { Icon } from './icons';
export function Voice(p: ViewProps) {
  const voicePrefs = p.w.state.records.find(
    (r) => r.id === 'settings:voice',
  )?.data;
  const [voice, setVoice] = useState<PracticeVoice>(
    voicePrefs?.voice === 'cedar' ? 'cedar' : 'willow',
  );
  const partner = VOICE_PROFILES[voice].name;
  const preparation = p.w.state.records.find(
    (r) => r.id === 'draft:voice',
  )?.data;
  const [stage, setStage] = useState(0),
    [notes, setNotes] = useState(String(preparation?.notes || '')),
    [pause, setPause] = useState(Number(preparation?.pause) || 6),
    [textMode, setTextMode] = useState(false),
    [lines, setLines] = useState<VoiceLine[]>([]),
    [input, setInput] = useState(''),
    [status, setStatus] = useState('Microphone off'),
    [busy, setBusy] = useState(false),
    [muted, setMuted] = useState(false),
    [error, setError] = useState(''),
    [feedback, setFeedback] = useState<{
      strength: string;
      next: string;
      retry: string;
    }>(),
    [elapsed, setElapsed] = useState(0),
    [retain, setRetain] = useState(
      !!p.w.state.records.find((r) => r.id === 'settings:voice')?.data
        .retainTranscript,
    ),
    [recording, setRecording] = useState(false);
  const connection = useRef<RTCPeerConnection | null>(null),
    channel = useRef<RTCDataChannel | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    session = useRef(''),
    started = useRef(0),
    closed = useRef<(() => void) | null>(null),
    linesRef = useRef(lines),
    recorder = useRef<MediaRecorder | null>(null),
    recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    id = useRef(crypto.randomUUID());
  linesRef.current = lines;
  function cleanup() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    channel.current?.close();
    connection.current?.close();
    connection.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
  }
  async function closeRemote() {
    if (session.current) {
      await fetch('/api/voice/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.current, action: 'close' }),
        keepalive: true,
      }).catch(() => {});
    }
  }
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden' && session.current) {
        void closeRemote();
        channel.current?.readyState === 'open' &&
          channel.current.send(JSON.stringify({ type: 'session.close' }));
        cleanup();
        setStatus('Stopped when the app left the foreground');
        setStage(3);
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      void closeRemote();
      cleanup();
      if (recordTimer.current) clearTimeout(recordTimer.current);
      recorder.current?.state === 'recording' && recorder.current.stop();
    };
  }, []);
  useEffect(() => {
    if (stage !== 2 || textMode) return;
    const timer = setInterval(() => {
      if (started.current)
        setElapsed(Math.floor((Date.now() - started.current) / 1000));
      if (session.current)
        void api('/api/voice/control', {
          id: session.current,
          action: 'heartbeat',
        }).catch(() => {
          setError('Connection lost. The server will close the session.');
        });
    }, 5000);
    return () => clearInterval(timer);
  }, [stage, textMode]);
  async function start() {
    setBusy(true);
    setError('');
    try {
      if (p.config.demo || !p.config.voice)
        throw new Error(
          'Live practice needs an OpenAI API key and the background worker. Your preparation is ready; the microphone stays off.',
        );
      if (p.config.voiceProvider === 'chain') {
        setTextMode(true);
        setStage(2);
        setStatus('Record one turn at a time');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
        throw new Error(
          'Voice is unavailable in this browser. Use the text conversation.',
        );
      setStatus('Requesting microphone…');
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = media;
      const pc = new RTCPeerConnection();
      connection.current = pc;
      media.getTracks().forEach((t) => pc.addTrack(t, media));
      audio.current = new Audio();
      audio.current.autoplay = true;
      pc.ontrack = (e) => {
        if (audio.current) {
          audio.current.srcObject = e.streams[0] || new MediaStream([e.track]);
          void audio.current
            .play()
            .catch(() => setError('Tap the speaker control to enable audio.'));
        }
      };
      const dc = pc.createDataChannel('oai-events');
      channel.current = dc;
      dc.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(data);
          if (event.type === 'session.started') {
            setStatus('Listening · AI role-play');
            started.current = Date.now();
          }
          if (
            event.type === 'session.input_transcript.delta' ||
            event.type === 'session.output_transcript.delta'
          ) {
            const role = event.type.includes('input') ? 'user' : 'assistant';
            setLines((old) => {
              const copy = [...old],
                last = copy.at(-1);
              if (last?.role === role)
                copy[copy.length - 1] = {
                  ...last,
                  text: last.text + event.delta,
                  end_ms: event.end_ms,
                };
              else
                copy.push({
                  role,
                  text: event.delta,
                  start_ms: event.start_ms,
                  end_ms: event.end_ms,
                });
              return copy;
            });
          }
          if (event.type === 'session.closed') {
            setStatus('Conversation ended');
            closed.current?.();
            cleanup();
            setStage(3);
          }
          if (event.type === 'error')
            setError('Voice reported an error. End the session and retry.');
        } catch {
          setError('An unreadable voice event arrived.');
        }
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected'].includes(pc.connectionState)) {
          setError(
            'Audio disconnected. End this attempt and retry when your connection is stable.',
          );
          void closeRemote();
          cleanup();
          setStage(3);
        }
      };
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve, reject) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const timeout = setTimeout(
          () =>
            reject(
              new Error('Audio connection timed out. Try another network.'),
            ),
          10000,
        );
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      const r = await api<{ id: string; sdp: string; expiresAt: string }>(
        '/api/voice/start',
        {
          sdp: pc.localDescription!.sdp,
          pause,
          retain,
          voice,
          eventId: crypto.randomUUID(),
        },
      );
      session.current = r.id;
      await pc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
      setStage(2);
      setStatus('Connecting to ' + partner + '…');
    } catch (e) {
      await closeRemote();
      cleanup();
      setStatus('Microphone off');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in browser site settings, or practice in text.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    setBusy(true);
    setStatus('Ending conversation…');
    await closeRemote();
    if (channel.current?.readyState === 'open') {
      const finished = new Promise<void>((resolve) => {
        closed.current = resolve;
      });
      channel.current.send(JSON.stringify({ type: 'session.close' }));
      await Promise.race([
        finished,
        new Promise<void>((resolve) => setTimeout(resolve, 12000)),
      ]);
    }
    cleanup();
    session.current = '';
    setStatus('Microphone off');
    setStage(3);
    setBusy(false);
    await evaluate();
  }
  async function evaluate() {
    if (!linesRef.current.some((l) => l.role === 'user')) return;
    try {
      const r = await api<typeof feedback>('/api/voice/feedback', {
        voice,
        transcript: linesRef.current.map(({ role, text }) => ({ role, text })),
        eventId: crypto.randomUUID(),
      });
      setFeedback(r);
      await p.w.record('external', 'voice:' + id.current, {
        date: p.today,
        kind: 'voice',
        completed: true,
        ...(retain ? { transcript: linesRef.current, feedback: r } : {}),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send(text = input) {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (p.config.demo || !p.config.ai)
        throw new Error(
          'The AI conversation is awaiting an OpenRouter API key. You can still write and save your preparation.',
        );
      const r = await api<{ reply: string }>('/api/voice/text', {
        voice,
        message: text,
        history: lines.slice(-16).map(({ role, text }) => ({ role, text })),
        eventId: crypto.randomUUID(),
      });
      setLines((old) => [
        ...old,
        { role: 'user', text },
        { role: 'assistant', text: r.reply },
      ]);
      setInput('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    setError('');
    try {
      if (!p.config.ai || p.config.demo)
        throw new Error(
          'Recorded practice needs the configured speech provider.',
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mime = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4',
        mr = new MediaRecorder(media, {
          mimeType: mime,
          audioBitsPerSecond: 64000,
        });
      recorder.current = mr;
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        setRecording(false);
        media.getTracks().forEach((t) => t.stop());
        if (recordTimer.current) clearTimeout(recordTimer.current);
        const data = await new Blob(chunks, { type: mime }).arrayBuffer();
        if (data.byteLength > 1000000) {
          setError('Keep each recorded turn under one minute.');
          return;
        }
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.readAsDataURL(new Blob([data], { type: mime }));
        });
        setBusy(true);
        try {
          const r = await api<{
            transcript: string;
            reply: string;
            audio: string;
          }>('/api/voice/audio', {
            voice,
            audio: base64,
            mime,
            history: lines.slice(-12).map(({ role, text }) => ({ role, text })),
            eventId: crypto.randomUUID(),
          });
          setLines((old) => [
            ...old,
            { role: 'user', text: r.transcript },
            { role: 'assistant', text: r.reply },
          ]);
          const output = new Audio('data:audio/mpeg;base64,' + r.audio);
          audio.current = output;
          await output.play();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      };
      mr.start();
      setRecording(true);
      recordTimer.current = setTimeout(
        () => mr.state === 'recording' && mr.stop(),
        60000,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="screen-grid">
      <div className="main-lane">
        <div className="row between meta">
          <span>COMMUNICATION · 5–10 MIN</span>
          <button
            className="text-button"
            onClick={async () => {
              await closeRemote();
              cleanup();
              await p.w.record('draft', 'draft:voice', {
                notes,
                pause,
                voice,
                kind: 'voice',
              });
              p.go('today');
            }}
          >
            Save & exit
          </button>
        </div>
        <SectionTitle
          title={
            stage === 0
              ? 'Give someone room to do good work.'
              : stage === 1
                ? 'Take a moment to prepare.'
                : stage === 2
                  ? 'A conversation with ' + partner + '.'
                  : 'One thing to carry forward.'
          }
        />
        {stage === 0 && (
          <>
            <section className="hero lavender">
              <span className="circle">
                <Icon name="mic" />
              </span>
              <h2>Delegate the outcome.</h2>
              <p>
                {partner} is editing a client film. Make the assignment clear,
                then hear what {voice === 'cedar' ? 'he' : 'she'} needs.
              </p>
              <Pill>Fictional scenario · AI partner</Pill>
            </section>
            <p className="explanation">
              Name the outcome, owner, deadline, and a useful boundary. Leave
              room for questions.
            </p>
            <Button onClick={() => setStage(1)}>
              Prepare first
              <Icon name="arrow" />
            </Button>
            <button
              className="text-button"
              onClick={() => {
                setTextMode(true);
                setStage(2);
                setLines([
                  {
                    role: 'assistant',
                    text: 'I have time to start the edit. What do you need from me?',
                  },
                ]);
              }}
            >
              Use a text conversation
            </button>
          </>
        )}
        {stage === 1 && (
          <>
            <section className="callout peach">
              <h3>A clear first cut. Thursday, 3 pm.</h3>
              <p>
                {partner} owns the edit. The story and dialogue matter most.
                Scope changes should come back to you first.
              </p>
            </section>
            <label>
              Practice voice
              <select
                value={voice}
                onChange={(e) => {
                  const selected = e.target.value as PracticeVoice;
                  setVoice(selected);
                  void p.w.record('settings', 'settings:voice', {
                    ...voicePrefs,
                    voice: selected,
                  });
                }}
              >
                <option value="cedar">Cedar · male · Alex</option>
                <option value="willow">Willow · female · Maya</option>
              </select>
            </label>
            <label>
              Your opening thought
              <textarea
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={3000}
                placeholder={`What does a good result look like? What can ${partner} decide?`}
              />
            </label>
            <label>
              Thinking pauses
              <select
                value={pause}
                onChange={(e) => setPause(Number(e.target.value))}
              >
                <option value="4">Give me a moment · about 4 seconds</option>
                <option value="6">A little more space · about 6 seconds</option>
                <option value="9">Take it slowly · about 9 seconds</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={retain}
                onChange={(e) => setRetain(e.target.checked)}
              />
              Keep my editable transcript and feedback
            </label>
            <Button disabled={busy} onClick={() => void start()}>
              {busy ? 'Connecting…' : 'Start conversation'}
              <Icon name="mic" />
            </Button>
            <p className="muted">
              The microphone starts only when you choose. Keep the app open
              during practice.
            </p>
            <button
              className="text-button"
              onClick={() => {
                setTextMode(true);
                setStage(2);
                setLines([
                  {
                    role: 'assistant',
                    text: 'I have time to start the edit. What do you need from me?',
                  },
                ]);
              }}
            >
              Practice in text instead
            </button>
          </>
        )}
        {stage === 2 &&
          (textMode ? (
            <>
              <div className="voice-log">
                {lines.map((l, i) => (
                  <div className={'bubble ' + l.role} key={i}>
                    {l.text}
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label>
                  Your reply
                  <textarea
                    rows={3}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <div className="row wrap">
                  <Button type="submit" disabled={busy || !input.trim()}>
                    Send
                    <Icon name="arrow" />
                  </Button>
                  <Button
                    kind="secondary"
                    disabled={busy || voice === 'willow'}
                    onClick={() => void record()}
                  >
                    {recording ? 'Stop recording' : 'Record a turn'}
                    <Icon name="mic" />
                  </Button>
                  <Button
                    kind="secondary"
                    onClick={() => {
                      setStage(3);
                      void evaluate();
                    }}
                  >
                    Finish practice
                  </Button>
                </div>
              </form>
              <p className="muted">
                {voice === 'willow'
                  ? 'Willow speaks in Live conversations. This mode uses text replies.'
                  : 'Recorded mode uses transcription, a text model, and Cedar speech. Up to one minute per turn.'}
              </p>
            </>
          ) : (
            <>
              <div className="voice-center">
                <div className={'voice-orb ' + (!muted ? 'active' : '')}>
                  <Icon name="mic" size={46} />
                </div>
                <h2>{muted ? 'Take your time.' : partner + ' is here.'}</h2>
                <p role="status">{status}</p>
                <Pill>
                  {Math.floor(elapsed / 60)}:
                  {String(elapsed % 60).padStart(2, '0')}
                </Pill>
              </div>
              <div className="voice-controls">
                <Button
                  kind="secondary"
                  onClick={() => {
                    stream.current
                      ?.getAudioTracks()
                      .forEach((t) => (t.enabled = muted));
                    if (channel.current?.readyState === 'open')
                      channel.current.send(
                        JSON.stringify({
                          type: muted
                            ? 'session.input_audio.unmute'
                            : 'session.input_audio.mute',
                        }),
                      );
                    setMuted(!muted);
                  }}
                >
                  {muted ? 'Unmute' : 'Mute'}
                  <Icon name="mic" />
                </Button>
                <Button disabled={busy} onClick={() => void end()}>
                  End conversation
                </Button>
              </div>
              <button
                className="text-button"
                onClick={() => void audio.current?.play()}
              >
                Enable speaker audio
              </button>
              <details>
                <summary>Live transcript</summary>
                {lines.map((l, i) => (
                  <p key={i} className="preserve">
                    <strong>{l.role === 'user' ? 'You' : partner}: </strong>
                    {l.text}
                  </p>
                ))}
              </details>
            </>
          ))}
        {stage === 3 && (
          <>
            <section className="hero mint">
              <Pill>
                {lines.some((l) => l.role === 'user')
                  ? 'Practice complete'
                  : 'Conversation closed'}
              </Pill>
              <h2>{feedback?.strength || 'You made space to practice.'}</h2>
              <p>
                {feedback?.next ||
                  'Feedback needs a completed conversation and an AI connection.'}
              </p>
            </section>
            {feedback && (
              <div className="callout lavender">
                <span className="eyebrow">TRY THIS NEXT</span>
                <p>{feedback.retry}</p>
              </div>
            )}
            <div className="row wrap">
              <Button
                onClick={() => {
                  setStage(1);
                  setLines([]);
                  setFeedback(undefined);
                  id.current = crypto.randomUUID();
                }}
              >
                Try it again
                <Icon name="arrow" />
              </Button>
              <Button kind="secondary" onClick={() => p.go('today')}>
                Done for now
              </Button>
            </div>
            {lines.length > 0 && (
              <details>
                <summary>Edit your transcript</summary>
                <textarea
                  rows={8}
                  value={lines
                    .map(
                      (l) =>
                        (l.role === 'user' ? 'You: ' : partner + ': ') + l.text,
                    )
                    .join('\n')}
                  onChange={(e) =>
                    setLines(
                      e.target.value.split('\n').map((text) => ({
                        role: text.startsWith('You:') ? 'user' : 'assistant',
                        text: text.replace(/^(You|Maya|Alex):\s*/, ''),
                      })),
                    )
                  }
                />
                <Button
                  kind="secondary"
                  onClick={() =>
                    void p.w.record('external', 'voice:' + id.current, {
                      date: p.today,
                      kind: 'voice',
                      transcript: lines,
                      feedback,
                    })
                  }
                >
                  Save this transcript
                </Button>
              </details>
            )}
          </>
        )}
        {error && (
          <p className="form-message" role="alert">
            {error}
          </p>
        )}
      </div>
      <aside className="context">
        <h3>Keep it simple.</h3>
        <div className="callout lavender">
          <span className="eyebrow">YOUR BRIEF</span>
          <p>{notes || 'Outcome. Owner. Deadline. Decision boundaries.'}</p>
        </div>
        <p>Clarity, relevance, reasoning, and listening.</p>
        <p>
          {stage === 2
            ? 'The voice is AI-generated.'
            : 'Preparation is part of the practice.'}
        </p>
        <div className="white-box">
          <span className="eyebrow">LIVE COST</span>
          <p>
            $0.05 per minute for voice.
            <br />
            Any backend model work is extra.
          </p>
        </div>
      </aside>
    </div>
  );
}
