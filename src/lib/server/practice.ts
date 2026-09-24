import 'server-only';
import { z } from 'zod';
import OpenAI from 'openai';
import WebSocket from 'ws';
import { adminClient } from '@/lib/supabase/server';
import { HttpError } from './http';
import { readState } from './state';
import { privatePut, privateRows } from './state';
import { reserve, settle } from './budget';
import { record, slug } from './learner';
import { consolidate, memoryLayer, recall } from './memory';
import { signal } from './runs';
import { generate } from '@/lib/ai/engine';
import { logCall } from '@/lib/ai/usage';
import { aiEnv } from '@/lib/ai/env';
import {
  briefSchema,
  complicationInstruction,
  feedbackSchema,
  liveCost,
  liveInstructions,
  MODES,
  openingCommentary,
  WRAP_UP,
  type Brief,
  type Difficulty,
  type Line,
  type Mode,
  type PracticeFeedback,
  type Voice,
  VOICES,
} from '@/lib/practice/harness';

export type PracticeState = {
  mode: Mode;
  difficulty: Difficulty;
  minutes: number;
  voice: Voice;
  topic: string;
  side?: string;
  brief: Brief;
  channel: 'voice' | 'text' | null;
  transcript: Line[];
  seconds?: number;
  feedback?: PracticeFeedback;
  parent?: { runId: string; beatId: string };
  concept?: string;
  // A redo: the earlier part of another practice, replayed as context.
  resume?: Line[];
  redo_of?: { id: string; line: number };
};
export type PracticeView = {
  id: string;
  title: string;
  status: 'active' | 'done' | 'abandoned';
  started_at: string;
  practice: PracticeState;
};

const db = () => adminClient();

async function load(userId: string, id: string) {
  const { data } = await db()
    .from('runs')
    .select('id,title,status,started_at,context,plan_id')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('kind', 'practice')
    .maybeSingle();
  if (!data) throw new HttpError('Practice not found.', 404);
  return data as { id: string; title: string; status: PracticeView['status']; started_at: string; plan_id: string | null; context: { practice: PracticeState } };
}
const toView = (row: Awaited<ReturnType<typeof load>>): PracticeView => ({
  id: row.id,
  title: row.title,
  status: row.status,
  started_at: row.started_at,
  practice: row.context.practice,
});
async function save(userId: string, id: string, practice: PracticeState, fields?: Record<string, unknown>) {
  await db().rpc('merge_run', { p_run: id, p_user: userId, p_context: { practice }, p_fields: fields || null });
}

export async function getPractice(userId: string, id: string) {
  return toView(await load(userId, id));
}

export async function listPractice(userId: string) {
  const { data } = await db()
    .from('runs')
    .select('id,title,status,started_at,context')
    .eq('user_id', userId)
    .eq('kind', 'practice')
    .order('started_at', { ascending: false })
    .limit(20);
  return (data || []).map((r) => {
    const p = (r.context as { practice: PracticeState }).practice;
    return {
      id: r.id as string,
      title: r.title as string,
      status: r.status as string,
      started_at: r.started_at as string,
      mode: p.mode,
      score: p.feedback?.score ?? null,
      headline: p.feedback?.headline ?? null,
    };
  });
}

// ---------- Creating a practice: one Sol call for the brief ----------

export async function createPractice(
  userId: string,
  input: {
    mode: Mode;
    topic: string;
    side?: string;
    difficulty: Difficulty;
    minutes: number;
    voice: Voice;
    parent?: { runId: string; beatId: string };
  },
) {
  const state = await readState(userId);
  const plan = state.plan;
  let sessionContext = '',
    concept: string | undefined,
    planId = plan?.plan_id || null;
  if (input.parent) {
    const { data: parent } = await db()
      .from('runs')
      .select('session_id,title,beats,context')
      .eq('id', input.parent.runId)
      .eq('user_id', userId)
      .maybeSingle();
    const session = parent?.session_id ? plan?.sessions.find((s) => s.id === parent.session_id) : undefined;
    const beat = (parent?.beats as { id: string; concept?: string; intent: string }[] | undefined)?.find(
      (b) => b.id === input.parent!.beatId,
    );
    concept = beat?.concept;
    sessionContext = [
      session ? `This practice is part of the session "${session.title}": ${session.objective}` : '',
      beat ? `Purpose: ${beat.intent}` : '',
      (parent?.context as { scenario_facts?: string[] })?.scenario_facts?.length
        ? `Scenario facts from the session so far: ${(parent!.context as { scenario_facts: string[] }).scenario_facts.join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  const memories = memoryLayer(await recall(userId, `${MODES[input.mode].label}: ${input.topic}`, concept ? [concept] : [], 6));
  // Models reach for the same few names; suggest a fresh one and avoid repeats.
  const { data: recentRuns } = await db()
    .from('runs')
    .select('context')
    .eq('user_id', userId)
    .eq('kind', 'practice')
    .order('started_at', { ascending: false })
    .limit(8);
  const recentNames = (recentRuns || [])
    .map((r) => (r.context as { practice?: PracticeState }).practice?.brief.partner.name.split(' ')[0])
    .filter(Boolean);
  // The character is whoever this voice sounds like: gender and accent come
  // from the voice, and the name and background are written to fit them.
  const sound = VOICES[input.voice];
  const { data: brief } = await generate({
    task: 'practice.brief',
    userId,
    schema: briefSchema,
    context: [
      { name: 'learner', content: plan ? `Goals: ${plan.profile.goals.join('; ')}` : null },
      { name: 'memories', content: memories },
      { name: 'session', content: sessionContext || null },
    ],
    input: [
      `Practice type: ${MODES[input.mode].label} — ${MODES[input.mode].blurb}`,
      `What the learner wants to practise: ${input.topic}`,
      input.side ? `The learner will argue: ${input.side}. The partner argues the strongest opposing case.` : '',
      `Difficulty: ${input.difficulty}. Length: about ${input.minutes} minutes.`,
      `The partner is voiced by a ${sound.gender} with a ${sound.accent} accent. Write them as a ${sound.gender} whose name, hometown and background plausibly go with that accent (an Irish accent means an Irish name and an Irish life, or clearly Irish roots), and whose role fits the scenario. Give a first name and surname that fit, not a stock AI name (no Priya, Marcus, Elena, Maya, Alex, Jordan, Sarah). Avoid these recently used first names: ${[...new Set(recentNames)].join(', ') || 'none'}.`,
      input.difficulty === 'tough'
        ? 'Tough mode: make this someone with strong feelings about the topic, with specific triggers the learner could plausibly hit.'
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  const practice: PracticeState = {
    mode: input.mode,
    difficulty: input.difficulty,
    minutes: input.minutes,
    voice: input.voice,
    topic: input.topic,
    side: input.side,
    brief,
    channel: null,
    transcript: [],
    parent: input.parent,
    concept: concept || `skill-${input.mode}`,
  };
  const { data, error } = await db()
    .from('runs')
    .insert({
      user_id: userId,
      plan_id: planId,
      kind: 'practice',
      title: brief.title.slice(0, 200) || MODES[input.mode].label,
      beats: [],
      context: { practice },
      minutes_planned: input.minutes,
    })
    .select('id,title,status,started_at,context,plan_id')
    .single();
  if (error) throw new Error('The practice could not be created.');
  if (input.parent)
    await db().rpc('patch_run_beat', {
      p_run: input.parent.runId,
      p_user: userId,
      p_beat: input.parent.beatId,
      p_patch: { practice: { id: data.id, status: 'open' } },
    });
  return toView(data as Awaited<ReturnType<typeof load>>);
}

// "Redo from here": the same partner and brief, picked up at one of the
// learner's lines, so a hard moment can be tried again without replaying
// the whole conversation. No model call; it opens instantly.
export async function redoPractice(userId: string, fromId: string, line: number) {
  const source = await load(userId, fromId);
  const p = source.context.practice;
  if (p.transcript[line]?.role !== 'user') throw new HttpError('Pick one of your own lines to redo from.', 400);
  const practice: PracticeState = {
    ...p,
    channel: null,
    transcript: [],
    seconds: undefined,
    feedback: undefined,
    parent: undefined,
    resume: [...(p.resume || []), ...p.transcript.slice(0, line)].slice(-60),
    redo_of: { id: fromId, line },
  };
  const { data, error } = await db()
    .from('runs')
    .insert({
      user_id: userId,
      plan_id: source.plan_id,
      kind: 'practice',
      title: source.title,
      beats: [],
      context: { practice },
      minutes_planned: p.minutes,
    })
    .select('id,title,status,started_at,context,plan_id')
    .single();
  if (error) throw new Error('The redo could not be created.');
  return toView(data as Awaited<ReturnType<typeof load>>);
}

// ---------- Live voice ----------

type VoiceRow = {
  id: string;
  user_id: string;
  reservation_id: string;
  provider_id?: string;
  run_id?: string;
  status: 'active' | 'closing' | 'closed' | 'unconfirmed';
  expires_at: string;
  client_seen_at: string;
  usage_seconds: number;
  planned_seconds?: number;
  transcript: Line[];
  retain_transcript: boolean;
  final_usage_confirmed: boolean;
  monitor_seen_at?: string;
  ended_reason?: string;
};

// Targeted, race-free update of one voice session (see voice_patch).
async function patchVoice(id: string, userId: string, patch: Record<string, unknown>) {
  const { data, error } = await db().rpc('voice_patch', { p_id: id, p_user: userId, p_patch: patch });
  if (error) throw new Error('Voice session update failed.');
  return data as VoiceRow | null;
}

// Sessions whose monitor vanished are settled from their last observed usage
// instead of blocking every future call.
export async function resolveStale(userId?: string) {
  const rows = await privateRows<VoiceRow>('voice_sessions', userId);
  for (const r of rows.filter((r) => ['active', 'closing', 'unconfirmed'].includes(r.status))) {
    const stale =
      Date.now() > Date.parse(r.expires_at) + 90000 ||
      (r.status !== 'active' && Date.now() - Date.parse(r.client_seen_at) > 90000) ||
      Date.now() - Date.parse(r.client_seen_at) > 180000;
    if (!stale) continue;
    await patchVoice(r.id, r.user_id, { status: 'closed', ended_reason: 'resolved-stale' });
    await settle(r.reservation_id, liveCost(Number(r.usage_seconds) || 60)).catch(() => {});
  }
}

export async function startLive(userId: string, practiceId: string, sdp: string) {
  const env = aiEnv();
  if (!env.OPENAI_API_KEY) throw new HttpError('Voice needs the OpenAI API key on the server.', 503);
  const row = await load(userId, practiceId);
  const p = row.context.practice;
  await resolveStale(userId);
  const limit = Math.min(p.minutes * 60 + 90, 740);
  const reservation = await reserve(userId, 'live:' + crypto.randomUUID(), liveCost(limit + 30), env.OPENAI_VOICE_MODEL);
  const voiceRow: VoiceRow = {
    id: crypto.randomUUID(),
    user_id: userId,
    reservation_id: reservation.id,
    run_id: practiceId,
    status: 'active',
    expires_at: new Date(Date.now() + limit * 1000).toISOString(),
    client_seen_at: new Date().toISOString(),
    usage_seconds: 0,
    planned_seconds: p.minutes * 60,
    transcript: [],
    retain_transcript: true,
    final_usage_confirmed: false,
  };
  try {
    await privatePut('voice_sessions', voiceRow);
  } catch {
    await settle(reservation.id, 0, true);
    throw new HttpError('Another voice conversation is still open. End it first, or wait a minute.', 409);
  }
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: 30000 });
  let created;
  try {
    created = await client.live.create({
      session: {
        model: env.OPENAI_VOICE_MODEL,
        instructions: liveInstructions(p.brief, { mode: p.mode, difficulty: p.difficulty, minutes: p.minutes, pause: 4, resume: p.resume }),
        audio: { output: { voice: p.voice } },
        store: false,
        delegation: { type: 'client' },
        client: {
          data_channel: {
            allowed_client_events: ['session.input_audio.mute', 'session.input_audio.unmute', 'session.close'],
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
      transport: { type: 'webrtc', sdp },
    } as Parameters<OpenAI['live']['create']>[0]);
  } catch (e) {
    await patchVoice(voiceRow.id, userId, { status: 'closed', ended_reason: 'create-failed' });
    await settle(reservation.id, 0, true);
    throw new HttpError(
      e instanceof OpenAI.APIError && e.status === 429
        ? 'Voice is busy right now. Try again in a moment, or practise in text.'
        : 'The voice session couldn’t start. Try again, or practise in text.',
      502,
    );
  }
  const live = created as unknown as { session: { id: string }; transport: { sdp: string } };
  voiceRow.provider_id = live.session.id;
  await privatePut('voice_sessions', { id: voiceRow.id, user_id: userId, reservation_id: voiceRow.reservation_id, expires_at: voiceRow.expires_at, provider_id: live.session.id });
  await save(userId, practiceId, { ...p, channel: 'voice' });
  return { voiceId: voiceRow.id, sdp: live.transport.sdp, limitSeconds: limit, plannedSeconds: p.minutes * 60, voiceRow, practice: p };
}

// The conductor: attached to the live session over the server sideband for
// its whole life. Opens the conversation, introduces complications on
// schedule, signals the wrap-up, enforces the limit, closes when the client
// disappears, and records usage and the transcript. Runs inside after().
export async function conduct(userId: string, row: VoiceRow, practice: PracticeState) {
  const env = aiEnv();
  const started = Date.now(),
    planned = (row.planned_seconds || practice.minutes * 60) * 1000,
    hardStop = Date.parse(row.expires_at);
  const transcript: Line[] = [];
  let usage = 0,
    closedReason: string | null = null,
    closeSent = false,
    finalized = false;
  const schedule = [
    ...practice.brief.complications.slice(0, 2).map((c, i) => ({ kind: 'complication', at: planned * (i === 0 ? 0.38 : 0.66), content: complicationInstruction(c) })),
    { kind: 'wrap-up', at: Math.max(planned - 60000, planned * 0.8), content: WRAP_UP },
  ];
  const ws = new WebSocket(
    `wss://api.openai.com/v1/live/sessions/${encodeURIComponent(row.provider_id!)}/attach?graceful_close=true`,
    { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, handshakeTimeout: 8000 },
  );
  const send = (e: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(e));
  const close = (why: string) => {
    if (closeSent) return;
    closeSent = true;
    closedReason ??= why;
    send({ type: 'session.close' });
  };
  const finished = new Promise<void>((resolve) => {
    ws.on('open', () => {
      send({ type: 'session.commentary.append', delegation_id: null, content: openingCommentary(practice.brief, practice.resume) });
      void patchVoice(row.id, userId, { monitor: true }).catch(() => {});
    });
    ws.on('message', (raw) => {
      let e: { type: string; delta?: string; usage?: { seconds: number }; reason?: string; delegation?: { id: string; target: string } };
      try {
        e = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (e.type === 'session.usage.updated' && e.usage) usage = Math.max(usage, Number(e.usage.seconds) || 0);
      if (e.type === 'session.input_transcript.delta' || e.type === 'session.output_transcript.delta') {
        const role = e.type.includes('input') ? 'user' : 'assistant';
        const last = transcript.at(-1);
        if (last?.role === role) last.text += e.delta || '';
        else transcript.push({ role, text: e.delta || '' });
      }
      if (e.type === 'session.delegation.created' && e.delegation?.target === 'client')
        send({
          type: 'session.commentary.append',
          delegation_id: e.delegation.id,
          content: 'No tools are available. Stay in character and continue the conversation.',
        });
      if (e.type === 'error') console.warn('live session error', row.id, JSON.stringify(e).slice(0, 400));
      if (e.type === 'session.closed') {
        if (e.usage) usage = Math.max(usage, Number(e.usage.seconds) || 0);
        closedReason ??= e.reason || 'closed';
        finalized = true;
        ws.close();
        resolve();
      }
    });
    ws.on('close', () => resolve());
    ws.on('error', () => resolve());
  });
  // Timeline and liveness loop.
  const tick = setInterval(async () => {
    const elapsed = Date.now() - started;
    while (schedule.length && elapsed >= schedule[0].at) {
      const cue = schedule.shift()!;
      send({ type: 'session.instructions.append', delegation_id: null, content: cue.content });
      console.info('live cue', row.id, cue.kind, Math.round(elapsed / 1000) + 's');
    }
    if (Date.now() >= hardStop) close('limit');
    try {
      // Read-only probe: an empty patch returns the current row.
      const current = await patchVoice(row.id, userId, {});
      if (current?.status === 'closing') close('learner-ended');
      // Generous: a slow network must not end a live conversation. A closed
      // tab also drops WebRTC, which ends the session on the provider side.
      else if (current && Date.now() - Date.parse(current.client_seen_at) > 45000) close('client-gone');
    } catch {}
  }, 3000);
  await Promise.race([finished, new Promise((r) => setTimeout(r, Math.max(0, hardStop - Date.now()) + 45000))]);
  clearInterval(tick);
  if (ws.readyState === WebSocket.OPEN) ws.close();
  const seconds = usage || Math.round((Date.now() - started) / 1000);
  console.info('live session ended', row.id, closedReason || 'monitor-timeout', seconds + 's', finalized ? 'confirmed' : 'unconfirmed');
  // The server transcript is authoritative when it has content. It is saved
  // before the row closes, because feedback waits for the close.
  if (transcript.some((l) => l.role === 'user' && l.text.trim())) {
    const fresh = await load(userId, row.run_id!).catch(() => null);
    if (fresh) await save(userId, row.run_id!, { ...fresh.context.practice, transcript: tidy(transcript), seconds }).catch(() => {});
  }
  await patchVoice(row.id, userId, {
    status: 'closed',
    usage_seconds: seconds,
    final_usage_confirmed: finalized,
    ended_reason: closedReason || 'monitor-timeout',
  }).catch(() => {});
  await settle(row.reservation_id, liveCost(seconds)).catch(() => {});
  await logCall({
    userId,
    task: 'practice.live',
    tier: 'voice',
    model: env.OPENAI_VOICE_MODEL,
    cost: liveCost(seconds),
    latency: Date.now() - started,
    ok: true,
  });
}

// Numbered so feedback notes can point at exact lines; long calls keep their end.
function numbered(p: PracticeState) {
  const lines = p.transcript.map((l, i) => `[${i}] ${l.role === 'user' ? 'Learner' : p.brief.partner.name}: ${l.text}`);
  let out = lines.join('\n');
  while (out.length > 30000 && lines.length > 1) {
    lines.shift();
    out = lines.join('\n');
  }
  return out;
}

const tidy = (lines: Line[]) =>
  lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text).slice(-400);

export async function voiceControl(userId: string, voiceId: string, action: 'heartbeat' | 'close', seconds?: number) {
  const row = await patchVoice(voiceId, userId, {
    touch: true,
    usage_seconds: seconds || 0,
    ...(action === 'close' ? { status: 'closing', ended_reason: 'learner-ended' } : {}),
  });
  if (!row) throw new HttpError('Conversation not found.', 404);
  return { status: row.status };
}

// ---------- Text practice ----------

const partnerSchema = z.object({ reply: z.string(), end: z.boolean() });
export async function say(userId: string, id: string, message: string, onPartial: (text: string) => void) {
  const row = await load(userId, id);
  const p = row.context.practice;
  const transcript = [...p.transcript, { role: 'user' as const, text: message }];
  const opening = !p.transcript.length && !message;
  const { data } = await generate({
    task: 'practice.partner',
    userId,
    schema: partnerSchema,
    context: [
      { name: 'character', content: liveInstructions(p.brief, { mode: p.mode, difficulty: p.difficulty, minutes: p.minutes, pause: 3, resume: p.resume }) },
      {
        name: 'conversation',
        content: p.transcript.map((l) => `${l.role === 'user' ? 'Learner' : p.brief.partner.name}: ${l.text}`).join('\n') || null,
      },
    ],
    input: opening ? openingCommentary(p.brief, p.resume) : `Learner: ${message}`,
    onPartial: (v) => onPartial((v as { reply?: string }).reply || ''),
  });
  const next: Line[] = opening ? [{ role: 'assistant', text: data.reply }] : [...transcript, { role: 'assistant', text: data.reply }];
  await save(userId, id, { ...p, channel: 'text', transcript: next });
  return { reply: data.reply, end: data.end };
}

// ---------- Feedback ----------

// A voice call's conductor saves the transcript a few seconds after the
// learner hangs up. Feedback waits for it rather than grading a partial copy.
async function callSettled(userId: string, runId: string, ms = 12000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const rows = await privateRows<VoiceRow>('voice_sessions', userId).catch(() => []);
    if (!rows.some((r) => r.run_id === runId && ['active', 'closing'].includes(r.status))) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function assess(userId: string, id: string, clientTranscript?: Line[]) {
  if ((await load(userId, id)).context.practice.channel === 'voice') await callSettled(userId, id);
  const row = await load(userId, id);
  let p = row.context.practice;
  if (p.feedback) return p.feedback;
  // Prefer the server-observed transcript; fall back to what the client saw.
  if (clientTranscript?.length && clientTranscript.length > p.transcript.length) p = { ...p, transcript: tidy(clientTranscript) };
  if (!p.transcript.some((l) => l.role === 'user'))
    throw new HttpError('There’s nothing to give feedback on yet. Say a few lines first.', 409);
  const words = p.transcript.filter((l) => l.role === 'user').reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const { data } = await generate({
    task: 'practice.feedback',
    userId,
    schema: feedbackSchema,
    signals: { hard: words > 900 },
    context: [
      {
        name: 'practice',
        content: [
          `Type: ${MODES[p.mode].label}. Difficulty: ${p.difficulty}.`,
          `Situation: ${p.brief.situation}`,
          `Learner goal: ${p.brief.learner_goal}`,
          `What good looks like: ${p.brief.success.join('; ')}`,
          `Partner: ${p.brief.partner.name}, ${p.brief.partner.role} — ${p.brief.partner.stance}`,
        ].join('\n'),
      },
      {
        name: 'earlier',
        content: p.resume?.length
          ? `This is a redo from partway through. The earlier part is context only; grade only the new transcript.\n${p.resume
              .map((l) => `${l.role === 'user' ? 'Learner' : p.brief.partner.name}: ${l.text}`)
              .join('\n')
              .slice(-8000)}`
          : null,
      },
    ],
    input: `Transcript (speech-to-text; ignore transcription errors and disfluencies). Each line is numbered [n]:\n${numbered(p)}\n\nCriteria to rate (2–4, specific to this practice type): e.g. clarity of the main point, listening and responding to what was said, handling pushback, reasoning and evidence, a concrete next step.\nNotes must reference learner lines by their [n].`,
  });
  // Notes may only point at the learner's own lines.
  data.notes = (data.notes || [])
    .filter((n) => p.transcript[n.line]?.role === 'user')
    .sort((a, b) => a.line - b.line)
    .slice(0, 6);
  // Merge onto the latest state so a transcript saved meanwhile survives.
  const latest = (await load(userId, id)).context.practice;
  p = { ...latest, transcript: latest.transcript.length >= p.transcript.length ? latest.transcript : p.transcript, feedback: data };
  await save(userId, id, p, { status: 'done', ended_at: new Date().toISOString() });
  if (p.parent)
    await db().rpc('patch_run_beat', {
      p_run: p.parent.runId,
      p_user: userId,
      p_beat: p.parent.beatId,
      p_patch: {
        practice: { id, status: 'done' },
        feedback: {
          verdict: data.score >= 0.75 ? 'solid' : data.score >= 0.4 ? 'partial' : 'missed',
          score: data.score,
          blocks: [{ type: 'text', md: `${data.headline} ${data.change}` }],
        },
      },
    });
  return data;
}

export async function afterAssess(userId: string, id: string) {
  const row = await load(userId, id);
  const p = row.context.practice;
  if (!p.feedback) return;
  const planId = row.plan_id;
  if (planId && p.concept)
    await record(userId, planId, id, slug(p.concept), {
      kind: 'roleplay',
      score: p.feedback.score,
      at: new Date().toISOString(),
      detail: { mode: p.mode, difficulty: p.difficulty, channel: p.channel },
    }).catch(() => {});
  if (p.feedback.score < 0.4) await signal(userId, 'struggled').catch(() => {});
  const text = p.transcript.map((l) => `${l.role === 'user' ? 'Learner' : 'Partner'}: ${l.text}`).join('\n');
  await consolidate(userId, id, `Practice: ${MODES[p.mode].label} — ${p.topic}\n${text}\nFeedback: ${p.feedback.headline} ${p.feedback.change}`, [p.concept || '']).catch(() => {});
}
