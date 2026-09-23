'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { Segmented, Sheet } from '@/components/ui';
import { useApp } from '@/components/app/provider';
import { MODES, VOICES, type Difficulty, type Mode, type Voice } from '@/lib/practice/harness';
import type { PracticeView } from '@/lib/server/practice';

type Recent = { id: string; title: string; status: string; started_at: string; mode: Mode; score: number | null; headline: string | null };
type Setup = { mode: Mode; topic: string; side?: string };

export function PracticeHub() {
  const { w, today, config } = useApp();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  useEffect(() => {
    void api<{ practices: Recent[] }>('/api/practice')
      .then((r) => setRecent(r.practices))
      .catch(() => setRecent([]));
  }, []);
  // Suggestions come from the curriculum around today.
  const suggestions = useMemo(() => {
    const sessions = (w.state.plan?.sessions || []).filter((s) => s.date >= today).slice(0, 12);
    const comm = sessions.find((s) => s.subject === 'communication');
    const judgment = sessions.find((s) => s.subject === 'judgment');
    const out: (Setup & { why: string })[] = [];
    if (comm) out.push({ mode: /negotiat/i.test(comm.title) ? 'negotiation' : /delegat/i.test(comm.title) ? 'delegation' : 'conversation', topic: comm.title + ' — ' + comm.objective, why: 'From this week’s communication session' });
    if (judgment)
      out.push({ mode: 'debate', topic: judgment.title, why: 'Argue it, then hear the strongest other side' });
    out.push({ mode: 'pitch', topic: 'Pitch an idea or project you care about in 60 seconds, then handle a skeptic’s questions.', why: 'The core of the June outcomes' });
    return out.slice(0, 3);
  }, [w.state.plan, today]);

  return (
    <div className="page practice-hub">
      <header className="page-head">
        <div>
          <p className="eyebrow">Practice</p>
          <h1 className="title">Say it out loud.</h1>
        </div>
      </header>
      {!config.voice && <p className="banner">Voice needs the OpenAI key on the server. Text practice works now.</p>}

      <section className="hub-section">
        <p className="eyebrow">Suggested</p>
        <div className="rows">
          {suggestions.map((s) => (
            <button key={s.mode + s.topic} className="row" onClick={() => setSetup(s)}>
              <span className="mode-glyph" aria-hidden="true">
                <Icon name={s.mode === 'debate' ? 'visual' : 'practice'} size={18} />
              </span>
              <div className="grow">
                <p>{s.topic.split(' — ')[0]}</p>
                <p className="sub">
                  {MODES[s.mode].label} · {s.why}
                </p>
              </div>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      </section>

      <section className="hub-section">
        <p className="eyebrow">Choose a format</p>
        <div className="modes">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button key={m} className="mode" onClick={() => setSetup({ mode: m, topic: '' })}>
              <span className="heading">{MODES[m].label}</span>
              <span className="muted">{MODES[m].blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="hub-section">
        <p className="eyebrow">Recent</p>
        {recent === null ? (
          <div className="skeleton line" style={{ width: '40%' }} />
        ) : recent.length ? (
          <div className="rows">
            {recent.map((r) => (
              <Link key={r.id} className="row" href={'/practice/' + r.id}>
                <i className={'dot ' + (r.score === null ? 'hollow' : r.score >= 0.75 ? 'v-solid' : r.score >= 0.4 ? 'v-partial' : 'v-missed')} />
                <div className="grow">
                  <p>{r.title}</p>
                  <p className="sub">
                    {MODES[r.mode]?.label} · {new Date(r.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {r.headline ? ' · ' + r.headline : ''}
                  </p>
                </div>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">Nothing yet. Your conversations and their feedback will collect here.</p>
        )}
      </section>

      {setup && <SetupSheet initial={setup} onClose={() => setSetup(null)} />}
    </div>
  );
}

function SetupSheet({ initial, onClose }: { initial: Setup; onClose: () => void }) {
  const router = useRouter();
  const [topic, setTopic] = useState(initial.topic),
    [side, setSide] = useState(initial.side || ''),
    [difficulty, setDifficulty] = useState<Difficulty>('realistic'),
    [minutes, setMinutes] = useState<'5' | '8' | '12'>('8'),
    [voice, setVoice] = useState<Voice>('cedar'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const debate = initial.mode === 'debate';
  async function start() {
    setBusy(true);
    setError('');
    try {
      const { practice } = await api<{ practice: PracticeView }>('/api/practice', {
        mode: initial.mode,
        topic: topic.trim(),
        side: debate && side.trim() ? side.trim() : undefined,
        difficulty,
        minutes: Number(minutes),
        voice,
      });
      router.push('/practice/' + practice.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Sheet title={MODES[initial.mode].label} subtitle={MODES[initial.mode].blurb} onClose={onClose}>
      <label className="field">
        <span>{debate ? 'The motion or question' : 'What do you want to practise?'}</span>
        <textarea
          className="textarea"
          rows={3}
          value={topic}
          autoFocus
          placeholder={
            debate
              ? 'e.g. Should states set their own minimum wage?'
              : initial.mode === 'conversation'
                ? 'e.g. Telling a collaborator their deliverable missed the brief'
                : 'Describe the situation in a sentence or two'
          }
          onChange={(e) => setTopic(e.target.value)}
        />
      </label>
      {debate && (
        <label className="field">
          <span>Your side (optional)</span>
          <input className="input" value={side} onChange={(e) => setSide(e.target.value)} placeholder="Leave empty and it will pick the other side of whatever you argue" />
        </label>
      )}
      <div className="field">
        <span>How hard should they push?</span>
        <Segmented
          label="Difficulty"
          value={difficulty}
          onChange={setDifficulty}
          options={[
            { value: 'gentle', label: 'Gentle' },
            { value: 'realistic', label: 'Realistic' },
            { value: 'tough', label: 'Tough' },
          ]}
        />
      </div>
      <div className="setup-row">
        <div className="field">
          <span>Length</span>
          <Segmented
            label="Length"
            value={minutes}
            onChange={setMinutes}
            options={[
              { value: '5', label: '5 min' },
              { value: '8', label: '8 min' },
              { value: '12', label: '12 min' },
            ]}
          />
        </div>
      </div>
      <div className="field">
        <span>Voice</span>
        <div className="chips">
          {(Object.keys(VOICES) as Voice[]).map((v) => (
            <button key={v} className="chip" aria-pressed={voice === v} onClick={() => setVoice(v)} title={VOICES[v].note}>
              {VOICES[v].label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="conversation-error">{error}</p>}
      <button className="btn primary large wide" onClick={() => void start()} disabled={topic.trim().length < 3} data-busy={busy || undefined}>
        {busy ? 'Writing the scenario' : 'Set it up'}
      </button>
    </Sheet>
  );
}
