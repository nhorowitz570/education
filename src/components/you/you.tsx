'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { Segmented, Sheet } from '@/components/ui';
import { useApp, type Theme } from '@/components/app/provider';
import { useViewProps } from '@/components/app/legacy';
import { PasskeySettings } from '@/components/passkeys';
import { Settings } from '@/components/settings';
import type { Memory } from '@/lib/server/memory';
import type { Style } from '@/lib/learning/style';

const GROUPS: { title: string; kinds: Memory['kind'][] }[] = [
  { title: 'Goals', kinds: ['goal'] },
  { title: 'How you like to learn', kinds: ['preference', 'style'] },
  { title: 'Background and interests', kinds: ['background', 'interest', 'knowledge', 'life'] },
  { title: 'Moments worth remembering', kinds: ['episode'] },
];
const STYLE_AXES: { key: keyof Style; left: string; right: string }[] = [
  { key: 'depth', left: 'Brief', right: 'Thorough' },
  { key: 'challenge', left: 'Gentle', right: 'Stretching' },
  { key: 'visual', left: 'Words', right: 'Pictures' },
  { key: 'questions', left: 'Explain', right: 'Ask me' },
  { key: 'examples', left: 'Abstract', right: 'Concrete' },
];

export function You() {
  const { user, w, theme, setTheme, signOut, toast } = useApp();
  const props = useViewProps();
  const [memories, setMemories] = useState<Memory[] | null>(null),
    [style, setStyle] = useState<Style | null>(null),
    [usage, setUsage] = useState<{ total: number; byTier: Record<string, { calls: number; usd: number }>; cacheRate: number; models: Record<string, string> } | null>(null),
    [adding, setAdding] = useState(''),
    [editing, setEditing] = useState<Memory | null>(null),
    [forget, setForget] = useState(false);
  useEffect(() => {
    void api<{ memories: Memory[]; style: Style | null }>('/api/memory')
      .then((r) => {
        setMemories(r.memories);
        setStyle(r.style);
      })
      .catch(() => setMemories([]));
    void api<typeof usage>('/api/usage').then(setUsage).catch(() => {});
  }, []);
  async function save(m: Partial<Memory> & { content: string }) {
    const { memory } = await api<{ memory: Memory }>('/api/memory', {
      id: m.id,
      kind: m.kind || 'preference',
      content: m.content,
      pinned: m.pinned,
    });
    setMemories((list) => {
      const rest = (list || []).filter((x) => x.id !== memory.id);
      return [memory, ...rest];
    });
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
  const plan = w.state.plan;
  return (
    <div className="page narrow you">
      <header className="page-head">
        <div>
          <p className="eyebrow">You</p>
          <h1 className="title">{plan?.profile.name || 'Your space'}</h1>
          <p className="label" style={{ marginTop: 6 }}>
            {user.email}
            {plan ? ` · ${plan.title}` : ''}
          </p>
        </div>
      </header>

      <section className="you-section">
        <div className="section-head">
          <h2 className="heading">What Fieldwork knows</h2>
          <p className="label">Used quietly to teach you better. Edit or remove anything.</p>
        </div>
        {style && style.observations > 0 && (
          <div className="style-axes" aria-label="Your inferred teaching style">
            {STYLE_AXES.map((a) => (
              <div className="axis" key={a.key}>
                <span className="label">{a.left}</span>
                <div className="axis-track">
                  <i style={{ left: `${Math.round((style[a.key] as number) * 100)}%` }} />
                </div>
                <span className="label">{a.right}</span>
              </div>
            ))}
            <p className="label">Inferred from {style.observations} moments across your sessions. It moves slowly on purpose.</p>
          </div>
        )}
        {memories === null ? (
          <div className="skeleton line" style={{ width: '50%' }} />
        ) : memories.length === 0 ? (
          <p className="muted">Nothing yet. After a few sessions this fills with what helps you learn.</p>
        ) : (
          GROUPS.map((g) => {
            const list = memories.filter((m) => g.kinds.includes(m.kind));
            if (!list.length) return null;
            return (
              <div className="memory-group" key={g.title}>
                <p className="eyebrow">{g.title}</p>
                <div className="rows">
                  {list.map((m) => (
                    <div className="row memory" key={m.id}>
                      <div className="grow">
                        <p>{m.content}</p>
                        <p className="sub">
                          {m.source === 'user' ? 'You added this' : m.status === 'candidate' ? 'Tentative · seen once' : `Seen ${m.evidence}×`}
                          {m.pinned ? ' · Pinned' : ''}
                        </p>
                      </div>
                      <button className="btn icon small ghost" aria-label={m.pinned ? 'Unpin' : 'Pin'} aria-pressed={m.pinned} onClick={() => void save({ ...m, pinned: !m.pinned })}>
                        <Icon name="pin" size={16} />
                      </button>
                      <button className="btn icon small ghost" aria-label="Edit" onClick={() => setEditing(m)}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button className="btn icon small ghost" aria-label="Forget" onClick={() => void remove(m)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
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
            placeholder="Tell it something: “Use sports examples”, “I run a video studio”…"
            aria-label="Add something Fieldwork should know"
          />
          <button className="btn" disabled={adding.trim().length < 3}>
            Add
          </button>
        </form>
        {!!memories?.length && (
          <button className="link danger-link" onClick={() => setForget(true)}>
            Forget everything
          </button>
        )}
      </section>

      <section className="you-section">
        <div className="section-head">
          <h2 className="heading">Appearance</h2>
        </div>
        <Segmented<Theme>
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </section>

      <section className="you-section">
        <div className="section-head">
          <h2 className="heading">Sign-in</h2>
        </div>
        <PasskeySettings demo={false} />
        <button className="btn quiet" onClick={() => void signOut()}>
          <Icon name="logout" size={17} /> Sign out
        </button>
      </section>

      {usage && (
        <section className="you-section">
          <div className="section-head">
            <h2 className="heading">AI this month</h2>
            <p className="label">Unmetered. Shown so there are no surprises.</p>
          </div>
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
                    {t === 'fast' ? usage.models.fast : t === 'primary' ? usage.models.primary : t === 'reasoning' ? usage.models.reasoning : 'voice'} · {usage.byTier[t].calls}
                  </span>
                </div>
              ) : null,
            )}
          </div>
          {usage.cacheRate > 0 && <p className="label">{Math.round(usage.cacheRate * 100)}% of prompt tokens served from cache.</p>}
        </section>
      )}

      <section className="you-section">
        <Settings {...props} />
      </section>

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
              setMemories([]);
              setStyle(null);
              setForget(false);
              toast('Fieldwork will start learning about you again from scratch.');
            }}
          >
            Forget everything
          </button>
        </Sheet>
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
