'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { Disclosure, IndexRow, Segmented, SettingsGroup, Sheet, Switch } from '@/components/ui';
import { useApp, type Theme } from '@/components/app/provider';
import { PasskeySettings } from '@/components/passkeys';
import { DataSheet, PlanSheet } from '@/components/settings';
import { RhythmSheet } from '@/components/learn/rolling';
import {
  GameSheet,
  NotificationsSheet,
  ReadingSheet,
  StyleSheet,
  VoiceSheet,
  fontSummary,
  gameSummary,
  notifySummary,
  reminderPrefs,
  toggleSound,
} from './sheets';
import { VOICES } from '@/lib/practice/harness';
import { WRITING } from '@/lib/learning/voice';
import { WritingSheet } from './writing';
import { DAY_NAMES, isRolling, slots } from '@/lib/rolling';
import type { Memory, Origin } from '@/lib/server/memory';
import type { Style } from '@/lib/learning/style';

const GROUPS: { title: string; kinds: Memory['kind'][] }[] = [
  { title: 'Goals', kinds: ['goal'] },
  { title: 'How you like to learn', kinds: ['preference', 'style'] },
  { title: 'Background and interests', kinds: ['background', 'interest', 'knowledge'] },
  { title: 'Moments worth remembering', kinds: ['episode'] },
];
type Usage = { total: number; byTier: Record<string, { calls: number; usd: number }>; cacheRate: number; models: Record<string, string> };
type Open = 'memory' | 'style' | 'writing' | 'voice' | 'rhythm' | 'plan' | 'notify' | 'reading' | 'game' | 'signin' | 'usage' | 'data' | null;

// When the learner last looked at their memory. Anything inferred after that
// is new to them. First visits count only the last day, so a long history
// doesn't all arrive as "new".
export function memorySeenAt(records: { id: string; data: Record<string, unknown> }[]) {
  const at = records.find((r) => r.id === 'settings:memory')?.data.seen_at;
  return typeof at === 'string' ? at : new Date(Date.now() - 86400000).toISOString();
}
const isNew = (m: Memory, seen: string) => m.source === 'inferred' && m.created_at > seen;
const hm = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// You: every setting, grouped by what it changes, each showing its current
// value. Anything with more than one choice opens its own sheet.
export function You() {
  const { user, w, theme, setTheme, prefs, setPrefs, signOut } = useApp();
  const [memories, setMemories] = useState<Memory[] | null>(null),
    [style, setStyle] = useState<Style | null>(null),
    [origins, setOrigins] = useState<Record<string, Origin>>({}),
    [usage, setUsage] = useState<Usage | null>(null),
    [open, setOpen] = useState<Open>(null),
    [focusNew, setFocusNew] = useState(false);
  useEffect(() => {
    void api<{ memories: Memory[]; style: Style | null; origins?: Record<string, Origin> }>('/api/memory')
      .then((r) => {
        setMemories(r.memories);
        setStyle(r.style);
        setOrigins(r.origins || {});
      })
      .catch(() => setMemories([]));
    void api<Usage>('/api/usage').then(setUsage).catch(() => {});
    // Arriving from "Review" on a new-memory notice opens memory directly.
    if (new URLSearchParams(location.search).get('memory')) {
      setFocusNew(true);
      setOpen('memory');
      history.replaceState(null, '', '/you');
    }
  }, []);
  const plan = w.state.plan;
  const rolling = isRolling(plan) ? plan : null;
  const seen = memorySeenAt(w.state.records);
  const fresh = (memories || []).filter((m) => isNew(m, seen)).length;
  const tentative = (memories || []).filter((m) => m.status === 'candidate').length;
  const pinned = (memories || []).filter((m) => m.pinned).length;
  const reminders = reminderPrefs(w.state.records);
  const pushOn = !!reminders.enabled && !reminders.travel;
  const s = prefs.session;
  const days = rolling ? slots(rolling.horizon) : [];
  const noPlan = !plan ? 'Import a plan first' : !rolling ? 'Set by your fixed plan' : undefined;
  const learned = style && style.observations > 0;
  const close = () => setOpen(null);

  return (
    <div className="page narrow you">
      <header className="page-head you-head">
        <span className="you-avatar" aria-hidden="true">
          {(plan?.profile.name || user.email || 'Y').slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="title">{plan?.profile.name || 'Your space'}</h1>
          <p className="label">{user.email}</p>
        </div>
      </header>

      <SettingsGroup id="you-tutor" title="Your tutor" note="What it knows about you and how it teaches. Used in every session.">
        <IndexRow
          icon="memory"
          title="Memory"
          detail={`Your goals, background and preferences.${pinned ? ` ${pinned} pinned.` : ''}`}
          value={memories === null ? '…' : memories.length ? `${memories.length} saved` : 'Empty'}
          badge={
            fresh ? (
              <span className="badge-new">{fresh} new</span>
            ) : tentative ? (
              <span className="badge-new quiet">{tentative} to confirm</span>
            ) : undefined
          }
          onClick={() => {
            setFocusNew(false);
            setOpen('memory');
          }}
        />
        <IndexRow
          icon="spark"
          title="Teaching style"
          detail="How it explains, learned from what you do."
          value={style === null && memories === null ? '…' : learned ? 'Learning' : 'Not yet'}
          onClick={() => setOpen('style')}
        />
        <IndexRow
          icon="text"
          title="Writing style"
          detail="How it talks to you: tone, length, and whether it swears."
          value={WRITING[prefs.writing].label}
          onClick={() => setOpen('writing')}
        />
        <IndexRow
          icon="practice"
          title="Practice voice"
          detail="Your partner in practice conversations."
          value={VOICES[prefs.voice].label}
          onClick={() => setOpen('voice')}
        />
      </SettingsGroup>

      <SettingsGroup id="you-sessions" title="Sessions" note="How each lesson runs. Applies from the next session you start.">
        <IndexRow title="Familiarity check" detail="Before a new idea, asks how familiar it is so it can skip what you know.">
          <Switch checked={s.familiarity} onChange={(v) => setPrefs('session', { familiarity: v })} label="Familiarity check" />
        </IndexRow>
        <IndexRow title="Confidence rating" detail="Say how sure you are when you answer. It sharpens what the tutor reviews.">
          <Switch checked={s.confidence} onChange={(v) => setPrefs('session', { confidence: v })} label="Confidence rating" />
        </IndexRow>
        <IndexRow title="“I don’t know yet”" detail="A way to be taught instead of guessing at a question.">
          <Switch checked={s.dontKnow} onChange={(v) => setPrefs('session', { dontKnow: v })} label="I don’t know yet" />
        </IndexRow>
        <IndexRow title="Breaks" detail="A pause about every 50 minutes in sessions of an hour or more.">
          <Segmented
            label="Breaks"
            value={String(s.breaks) as '0' | '5' | '10'}
            onChange={(v) => setPrefs('session', { breaks: Number(v) as 0 | 5 | 10 })}
            options={[
              { value: '0', label: 'Off' },
              { value: '5', label: '5 min' },
              { value: '10', label: '10 min' },
            ]}
          />
        </IndexRow>
      </SettingsGroup>

      <SettingsGroup id="you-rhythm" title="Your rhythm" note="The shape of your week, filled in from your plan. Changes apply from the next week drafted.">
        <IndexRow
          icon="rhythm"
          title="Learning days"
          detail={rolling ? days.map((d) => `${DAY_NAMES[d.day].slice(0, 3)} ${rolling.horizon.tracks.find((t) => t.id === d.track)?.title || d.track}`).join(' · ') : noPlan}
          value={rolling ? `${days.length} a week` : undefined}
          onClick={rolling ? () => setOpen('rhythm') : undefined}
          disabled={!rolling}
        />
        <IndexRow
          icon="clock"
          title="Session length and start"
          detail={rolling ? 'Reminders and the session written ahead of time use the start.' : noPlan}
          value={rolling ? `${rolling.horizon.rhythm.minutes} min · ${hm(rolling.horizon.rhythm.start_local)}` : undefined}
          onClick={rolling ? () => setOpen('rhythm') : undefined}
          disabled={!rolling}
        />
        <IndexRow icon="learn" title="Your plan" detail={plan?.title || 'Import a plan to begin'} value={plan ? undefined : 'None'} onClick={() => setOpen('plan')} />
      </SettingsGroup>

      <SettingsGroup id="you-notify" title="Notifications" note="A preview, one nudge, and a few moments worth knowing about.">
        <IndexRow
          icon="bell"
          title="Notifications"
          detail={pushOn ? `Preview at ${hm(reminders.morning || '09:45')} on learning days` : 'Nothing is sent to this device'}
          value={notifySummary(pushOn, prefs)}
          onClick={() => setOpen('notify')}
        />
      </SettingsGroup>

      <SettingsGroup id="you-look" title="Look & feel">
        <IndexRow icon={theme === 'light' ? 'sun' : 'moon'} title="Appearance">
          <Segmented<Theme>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </IndexRow>
        <IndexRow
          icon="text"
          title="Reading"
          detail="Fonts for lessons and the app, text size, line length."
          value={fontSummary(prefs.reading)}
          onClick={() => setOpen('reading')}
        />
        <IndexRow icon="wave" title="Motion" detail="Animations and transitions.">
          <Segmented
            label="Motion"
            value={prefs.reading.motion}
            onChange={(v) => setPrefs('reading', { motion: v })}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'reduce', label: 'Less' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </IndexRow>
        <IndexRow icon="sound" title="Sound" detail="Soft tones for good answers and a finished session.">
          <Switch checked={prefs.sound} onChange={(v) => toggleSound(v, setPrefs)} label="Sound" />
        </IndexRow>
        <IndexRow icon="star" title="Game elements" detail="XP, levels, streaks and quests." value={gameSummary(prefs)} onClick={() => setOpen('game')} />
      </SettingsGroup>

      <SettingsGroup id="you-account" title="Account & data">
        <IndexRow icon="key" title="Sign-in" detail="Passkeys for this account, or a link by email." onClick={() => setOpen('signin')} />
        <IndexRow
          icon="spark"
          title="AI cost this month"
          detail={usage ? `${Object.values(usage.byTier).reduce((n, t) => n + t.calls, 0)} calls across lessons, practice and memory` : 'Loading…'}
          value={usage ? `$${usage.total.toFixed(2)}` : undefined}
          onClick={usage ? () => setOpen('usage') : undefined}
        />
        <IndexRow icon="download" title="Data & privacy" detail="Export everything, or delete your account." onClick={() => setOpen('data')} />
      </SettingsGroup>

      <button className="btn quiet you-signout" onClick={() => void signOut()}>
        <Icon name="logout" size={17} /> Sign out
      </button>

      {open === 'memory' && (
        <MemorySheet
          memories={memories || []}
          setMemories={setMemories}
          setStyle={setStyle}
          origins={origins}
          seen={seen}
          startOnNew={focusNew}
          onClose={close}
        />
      )}
      {open === 'style' && <StyleSheet style={style} onClose={close} />}
      {open === 'voice' && <VoiceSheet onClose={close} />}
      {open === 'writing' && <WritingSheet onClose={close} />}
      {open === 'rhythm' && rolling && <RhythmSheet plan={rolling} onClose={close} />}
      {open === 'plan' && <PlanSheet onClose={close} />}
      {open === 'notify' && <NotificationsSheet onClose={close} />}
      {open === 'reading' && <ReadingSheet onClose={close} />}
      {open === 'game' && <GameSheet onClose={close} />}
      {open === 'data' && <DataSheet onClose={close} />}
      {open === 'signin' && (
        <Sheet title="Sign-in" subtitle={user.email} onClose={close}>
          <PasskeySettings demo={false} />
          <p className="label">Without a passkey, you sign in with a link sent to your email.</p>
        </Sheet>
      )}
      {open === 'usage' && usage && <UsageSheet usage={usage} onClose={close} />}
    </div>
  );
}

function UsageSheet({ usage, onClose }: { usage: Usage; onClose: () => void }) {
  const name = (t: string) => (t === 'voice' ? 'Voice' : usage.models[t] || t);
  return (
    <Sheet title="AI cost this month" subtitle="Unmetered. Shown so there are no surprises." onClose={onClose}>
      <div className="usage">
        <div className="stat">
          <b className="num">${usage.total.toFixed(2)}</b>
          <span>total</span>
        </div>
        {(['fast', 'primary', 'reasoning', 'voice'] as const).map((t) =>
          usage.byTier[t] ? (
            <div className="stat" key={t}>
              <b className="num">${usage.byTier[t].usd.toFixed(2)}</b>
              <span>
                {name(t)} · {usage.byTier[t].calls} calls
              </span>
            </div>
          ) : null,
        )}
      </div>
      {usage.cacheRate > 0 && <p className="label">{Math.round(usage.cacheRate * 100)}% of prompt tokens served from cache.</p>}
    </Sheet>
  );
}

// Everything Fieldwork has learned about the learner: what it isn't sure of
// yet first, then the rest by kind, folded.
function MemorySheet({
  memories,
  setMemories,
  setStyle,
  origins,
  seen,
  startOnNew,
  onClose,
}: {
  memories: Memory[];
  setMemories: (f: (m: Memory[] | null) => Memory[] | null) => void;
  setStyle: (s: Style | null) => void;
  origins: Record<string, Origin>;
  seen: string;
  startOnNew: boolean;
  onClose: () => void;
}) {
  const { w, toast } = useApp();
  const [query, setQuery] = useState(''),
    [adding, setAdding] = useState(''),
    [editing, setEditing] = useState<Memory | null>(null),
    [forget, setForget] = useState(false);
  // "New" is judged against the moment the sheet opened, then the learner
  // has seen them.
  const [since] = useState(seen);
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void w.record('settings', 'settings:memory', { seen_at: new Date().toISOString() });
  }, [w]);

  function put(memory: Memory) {
    setMemories((list) => {
      const rest = (list || []).filter((x) => x.id !== memory.id);
      return memory.status === 'archived' ? rest : [memory, ...rest];
    });
    return memory;
  }
  async function save(m: Partial<Memory> & { content: string }) {
    const { memory } = await api<{ memory: Memory }>('/api/memory', {
      id: m.id,
      kind: m.kind || 'preference',
      content: m.content,
      pinned: m.pinned,
    });
    return put(memory);
  }
  // Keeping a tentative memory makes it count; dismissing retires it without
  // deleting, so the same guess isn't made again.
  async function review(m: Memory, verdict: 'keep' | 'dismiss') {
    const { memory } = await api<{ memory: Memory }>('/api/memory', { id: m.id, review: verdict });
    return put(memory);
  }
  async function remove(m: Memory) {
    setMemories((list) => (list || []).filter((x) => x.id !== m.id));
    try {
      await api('/api/memory', { id: m.id }, 'DELETE');
      toast('Forgotten.', { label: 'Undo', run: () => void save({ kind: m.kind, content: m.content, pinned: m.pinned }) });
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function confirm(m: Memory) {
    try {
      await review(m, 'keep');
      toast('Kept.');
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function dismiss(m: Memory) {
    try {
      await review(m, 'dismiss');
      toast('Dismissed.');
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const q = query.trim().toLowerCase();
  const match = (m: Memory) => !q || m.content.toLowerCase().includes(q);
  const unsure = memories.filter((m) => m.status === 'candidate' && match(m));
  const sure = memories.filter((m) => m.status !== 'candidate' && match(m));
  const newCount = memories.filter((m) => isNew(m, since)).length;
  const row = (m: Memory, tentative = false) => (
    <MemoryRow
      key={m.id}
      m={m}
      origin={m.source_run ? origins[m.source_run] : undefined}
      fresh={isNew(m, since)}
      tentative={tentative}
      onPin={() => void save({ ...m, pinned: !m.pinned })}
      onEdit={() => setEditing(m)}
      onForget={() => void remove(m)}
      onKeep={() => void confirm(m)}
      onDismiss={() => void dismiss(m)}
    />
  );

  return (
    <Sheet title="Memory" subtitle="Used quietly to teach you better. Edit or remove anything." onClose={onClose}>
      {memories.length > 8 && (
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${memories.length} memories`}
          aria-label="Search memories"
        />
      )}

      {memories.length === 0 && <p className="muted">Nothing yet. After a few sessions this fills with what helps you learn.</p>}

      {unsure.length > 0 && (
        <div className="mem-group">
          <p className="eyebrow">Not sure yet · {unsure.length}</p>
          <p className="label">Seen once. Keep what’s true; dismiss what isn’t.</p>
          <div className="mem-list">{unsure.map((m) => row(m, true))}</div>
        </div>
      )}

      {GROUPS.map((g) => {
        const list = sure.filter((m) => g.kinds.includes(m.kind));
        if (!list.length) return null;
        const newHere = list.filter((m) => isNew(m, since)).length;
        return (
          <Disclosure
            key={g.title + (q ? ':q' : '')}
            className="mem-fold"
            title={g.title}
            teaser={`${list.length} ${list.length === 1 ? 'memory' : 'memories'}${newHere ? ` · ${newHere} new` : ''}`}
            defaultOpen={!!q || (startOnNew && newHere > 0) || memories.length <= 6}
          >
            <div className="mem-list">{list.map((m) => row(m))}</div>
          </Disclosure>
        );
      })}
      {q && !unsure.length && !sure.length && <p className="muted">Nothing matches “{query}”.</p>}

      <form
        className="add-memory"
        onSubmit={(e) => {
          e.preventDefault();
          if (adding.trim().length < 3) return;
          void save({ kind: 'preference', content: adding.trim(), pinned: true }).then(() => setAdding(''));
        }}
      >
        <input
          className="input"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Tell it something: “Use sports examples”…"
          aria-label="Add something Fieldwork should know"
        />
        <button className="btn" disabled={adding.trim().length < 3}>
          Add
        </button>
      </form>
      {newCount > 0 && <p className="label">{newCount} learned since you last looked, marked with a dot.</p>}
      {memories.length > 0 && (
        <button className="link danger-link" onClick={() => setForget(true)}>
          Forget everything
        </button>
      )}

      {editing && (
        <EditMemory
          memory={editing}
          onClose={() => setEditing(null)}
          onSave={(content) => void save({ ...editing, content }).then(() => setEditing(null))}
        />
      )}
      {forget && (
        <Sheet title="Forget everything?" subtitle="Memories and your inferred teaching style are deleted. Progress and sessions stay." onClose={() => setForget(false)}>
          <button
            className="btn primary"
            onClick={async () => {
              await api('/api/memory', { all: true }, 'DELETE');
              setMemories(() => []);
              setStyle(null);
              setForget(false);
              toast('Fieldwork will start learning about you again from scratch.');
            }}
          >
            Forget everything
          </button>
        </Sheet>
      )}
    </Sheet>
  );
}

function MemoryRow({
  m,
  origin,
  fresh,
  tentative,
  onPin,
  onEdit,
  onForget,
  onKeep,
  onDismiss,
}: {
  m: Memory;
  origin?: Origin;
  fresh: boolean;
  tentative: boolean;
  onPin: () => void;
  onEdit: () => void;
  onForget: () => void;
  onKeep: () => void;
  onDismiss: () => void;
}) {
  const where = useMemo(() => {
    if (m.source === 'user') return 'You added this';
    if (m.source === 'import') return 'From your plan';
    return null;
  }, [m.source]);
  const href = origin && m.source_run ? (origin.kind === 'practice' ? '/practice/' + m.source_run : '/session/' + m.source_run) : null;
  return (
    <div className={'mem' + (fresh ? ' fresh' : '')}>
      <div className="grow">
        <p className="mem-text">
          {fresh && <i className="mem-dot" aria-label="New" />}
          {m.content}
        </p>
        <p className="label mem-meta">
          {where}
          {!where && origin && href && (
            <>
              Learned in{' '}
              <Link href={href} className="mem-origin">
                {origin.title}
              </Link>
            </>
          )}
          {!where && !origin && 'Noticed in a session'}
          {!tentative && m.source !== 'user' && m.evidence > 1 ? ` · seen ${m.evidence}×` : ''}
          {m.pinned ? ' · pinned' : ''}
        </p>
      </div>
      {tentative ? (
        <div className="mem-actions always">
          <button className="btn small" onClick={onKeep}>
            <Icon name="check" size={15} /> Keep
          </button>
          <button className="btn icon small ghost" aria-label="Dismiss" onClick={onDismiss}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : (
        <div className="mem-actions">
          <button className="btn icon small ghost" aria-label={m.pinned ? 'Unpin' : 'Pin'} aria-pressed={m.pinned} onClick={onPin}>
            <Icon name="pin" size={16} />
          </button>
          <button className="btn icon small ghost" aria-label="Edit" onClick={onEdit}>
            <Icon name="edit" size={16} />
          </button>
          <button className="btn icon small ghost" aria-label="Forget" onClick={onForget}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function EditMemory({ memory, onClose, onSave }: { memory: Memory; onClose: () => void; onSave: (c: string) => void }) {
  const [text, setText] = useState(memory.content);
  return (
    <Sheet title="Edit memory" onClose={onClose}>
      <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus aria-label="Memory" />
      <button className="btn primary" disabled={text.trim().length < 3} onClick={() => onSave(text.trim())}>
        Save
      </button>
    </Sheet>
  );
}
