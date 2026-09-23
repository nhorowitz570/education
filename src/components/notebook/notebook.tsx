'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { useCached } from '@/lib/client/cached';
import { Icon } from '@/components/icons';
import { Markdown, Sheet, Switch, dateLabel } from '@/components/ui';
import { Visual } from '@/components/viz/visual';
import { useApp } from '@/components/app/provider';
import { LEVEL_LABEL, type Entry, type NotebookView } from '@/lib/notebook';
import type { RunView } from '@/lib/learning/run';
import { primeRun } from '@/components/session/use-run';

const day = (iso: string) => dateLabel(iso.slice(0, 10), false);
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const VERDICT = { solid: 'Solid', partial: 'Partly there', missed: 'Not yet' } as const;
const STEP: Record<string, string> = {
  attempt: 'In your words',
  produce: 'This week’s work',
  transfer: 'A new situation',
  check: 'Your call',
  recall: 'Warm-up',
};

// The Notebook: every idea met so far, in the learner's own words, with the
// explanation and picture that taught it and the questions they asked.
export function Notebook() {
  const { user } = useApp();
  const { data, error, refresh } = useCached<NotebookView>('/api/notebook', user.id);
  const params = useSearchParams();
  const router = useRouter();
  const open = params.get('e');
  const entry = open && data ? data.entries.find((e) => e.key === open) : null;
  const path = usePathname();
  const go = (key: string | null) =>
    startTransition(() => router.push(key ? `${path}?e=${encodeURIComponent(key)}` : path, { scroll: true }));

  if (open && entry) return <EntryView entry={entry} onBack={() => go(null)} onChanged={refresh} />;
  return (
    <div className="page notebook">
      <header className="page-head">
        <div>
          <p className="eyebrow">Notebook</p>
          <h1 className="title serif-title">What you’ve learned, in your words.</h1>
          {data && data.entries.length > 0 && (
            <p className="label" style={{ marginTop: 8 }}>
              {count(data.entries.filter((e) => !e.offPlan).length, 'idea')}
              {data.entries.some((e) => e.offPlan) ? ` · ${count(data.entries.filter((e) => e.offPlan).length, 'side trip')}` : ''} ·{' '}
              {data.entries.filter((e) => e.words.length).length} explained by you
            </p>
          )}
        </div>
        {data && data.entries.length > 0 && (
          <button className="btn quiet" onClick={() => exportMarkdown(data)}>
            <Icon name="download" size={17} /> Export
          </button>
        )}
      </header>
      {!data ? (
        error ? (
          <div className="today-error">
            <p className="heading">The Notebook couldn’t load.</p>
            <p className="muted">{error}</p>
            <button className="btn" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : (
          <NotebookSkeleton />
        )
      ) : data.entries.length === 0 ? (
        <div className="notebook-empty">
          <Icon name="notebook" size={28} />
          <p className="heading">Your Notebook fills itself.</p>
          <p className="muted">
            Every idea you meet in a session lands here with your own explanation of it, the picture that made it click and the
            questions you asked. Nothing to write up.
          </p>
          <Link href="/" className="btn primary">
            Go to Today
          </Link>
        </div>
      ) : (
        <Index data={data} onOpen={go} />
      )}
    </div>
  );
}

function Index({ data, onOpen }: { data: NotebookView; onOpen: (key: string) => void }) {
  const [query, setQuery] = useState(''),
    [track, setTrack] = useState<string | null>(null);
  const q = useDeferredValue(query.trim().toLowerCase());
  const list = useMemo(
    () =>
      data.entries.filter(
        (e) =>
          (!track || e.track === track) &&
          (!q ||
            e.title.toLowerCase().includes(q) ||
            e.summary.toLowerCase().includes(q) ||
            e.words.some((w) => w.text.toLowerCase().includes(q)) ||
            e.notes.some((n) => n.text.toLowerCase().includes(q)) ||
            e.asks.some((a) => a.question.toLowerCase().includes(q))),
      ),
    [data, q, track],
  );
  const groups = track ? [{ id: track, title: '' }] : data.tracks;
  return (
    <>
      <div className="notebook-tools">
        <label className="notebook-search">
          <Icon name="search" size={17} />
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your ideas, words and notes"
            aria-label="Search the Notebook"
          />
        </label>
        {data.tracks.length > 1 && (
          <div className="chips" role="group" aria-label="Filter by track">
            <button className="chip" aria-pressed={!track} onClick={() => setTrack(null)}>
              All
            </button>
            {data.tracks.map((t) => (
              <button key={t.id} className={'chip t-' + t.id} aria-pressed={track === t.id} onClick={() => setTrack(track === t.id ? null : t.id)}>
                <i className="dot" aria-hidden="true" />
                {t.title}
              </button>
            ))}
          </div>
        )}
      </div>
      {!list.length && <p className="muted">Nothing matches “{query}”.</p>}
      {groups.map((g) => {
        const items = list.filter((e) => e.track === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id} className={'notebook-group t-' + g.id}>
            {g.title && (
              <p className="eyebrow notebook-group-title">
                <i className="dot" aria-hidden="true" /> {g.title} <span className="faint num">{items.length}</span>
              </p>
            )}
            <div className="notebook-grid stagger">
              {items.map((e) => (
                <Card key={e.key} entry={e} onOpen={() => onOpen(e.key)} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function Card({ entry: e, onOpen }: { entry: Entry; onOpen: () => void }) {
  const best = e.words[0];
  return (
    <button className={'nb-card t-' + e.track} onClick={onOpen}>
      <span className="nb-card-top">
        <span className="label">{e.offPlan ? 'Side trip' : LEVEL_LABEL[e.level] || e.level}</span>
        {e.shared && (
          <span className="nb-shared" title="Shared by link">
            <Icon name="link" size={13} />
          </span>
        )}
      </span>
      <span className="nb-card-title">{e.title}</span>
      {best ? (
        <span className="nb-card-words">“{best.text.length > 150 ? best.text.slice(0, 149).trimEnd() + '…' : best.text}”</span>
      ) : (
        <span className="nb-card-summary">{e.summary || firstLine(e.explanation)}</span>
      )}
      <span className="nb-card-foot">
        {!e.offPlan && (
          <span className="meter nb-meter" aria-label={`${Math.round(e.strength * 100)}% recall strength`}>
            <i style={{ '--v': e.strength } as React.CSSProperties} />
          </span>
        )}
        <span className="label tnum">
          {[e.notes.length && `${e.notes.length} note${e.notes.length === 1 ? '' : 's'}`, e.asks.length && `${e.asks.length} asked`, day(e.last_seen)]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </button>
  );
}

const firstLine = (md: string | null) =>
  (md || '')
    .replace(/[*_`>#]/g, '')
    .split(/(?<=[.!?])\s/)[0]
    ?.slice(0, 160) || '';

function EntryView({ entry: e, onBack, onChanged }: { entry: Entry; onBack: () => void; onChanged: () => Promise<void> | void }) {
  const router = useRouter();
  const { toast } = useApp();
  const [sharing, setSharing] = useState(false),
    [recalling, setRecalling] = useState(false),
    [more, setMore] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [e.key]);
  async function recall() {
    setRecalling(true);
    try {
      const { run } = await api<{ run: RunView }>('/api/runs', { kind: 'review', concepts: [e.key] });
      primeRun(run);
      router.push('/session/' + run.id);
    } catch (err) {
      toast((err as Error).message);
      setRecalling(false);
    }
  }
  const [best, ...rest] = e.words;
  return (
    <article className={'page narrow nb-entry t-' + e.track}>
      <button className="btn quiet nb-back" onClick={onBack}>
        <Icon name="back" size={17} /> Notebook
      </button>
      <header className="nb-entry-head">
        <p className="eyebrow">
          <i className="dot" aria-hidden="true" /> {e.trackTitle}
          {!e.offPlan && ` · ${LEVEL_LABEL[e.level] || e.level}`}
        </p>
        <h1 className="display serif-display">{e.title}</h1>
        {e.summary && <p className="muted nb-summary">{e.summary}</p>}
        <div className="nb-actions">
          {!e.offPlan && (
            <button className="btn primary" onClick={() => void recall()} data-busy={recalling || undefined} disabled={recalling}>
              <Icon name="refresh" size={17} /> Quick recall
            </button>
          )}
          <button className="btn quiet" onClick={() => setSharing(true)}>
            <Icon name={e.shared ? 'link' : 'share'} size={17} /> {e.shared ? 'Shared' : 'Share'}
          </button>
        </div>
      </header>

      {!e.offPlan && (
        <section className="nb-strength" aria-label="Recall strength">
          <div className="meter" style={{ height: 6 }}>
            <i style={{ '--v': e.strength } as React.CSSProperties} />
          </div>
          <p className="label tnum">
            {Math.round(e.strength * 100)}% recall strength · first met {day(e.first_seen)}
            {e.due_at ? ` · review ${new Date(e.due_at) <= new Date() ? 'due now' : 'due ' + day(e.due_at)}` : ''}
          </p>
        </section>
      )}

      {best && (
        <section className="nb-section">
          <p className="eyebrow">In your words</p>
          <Words w={best} />
          {rest.length > 0 &&
            (more ? (
              rest.map((w, i) => <Words key={i} w={w} />)
            ) : (
              <button className="link" onClick={() => setMore(true)}>
                {rest.length} more answer{rest.length === 1 ? '' : 's'}
              </button>
            ))}
        </section>
      )}

      {(e.explanation || e.visual) && (
        <section className="nb-section">
          <p className="eyebrow">How it was explained</p>
          {e.explanation && <Markdown src={e.explanation} />}
          {e.visual && (
            <div className="nb-visual">
              <Visual spec={e.visual} />
            </div>
          )}
        </section>
      )}

      {e.misconceptions.length > 0 && (
        <section className="nb-section">
          <p className="eyebrow">Worth watching</p>
          <ul className="nb-watch">
            {e.misconceptions.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {e.asks.length > 0 && (
        <section className="nb-section">
          <p className="eyebrow">What you asked</p>
          <div className="nb-asks">
            {e.asks.map((a, i) => (
              <details key={i} className="nb-ask" open={i === 0}>
                <summary>
                  {a.quote && <span className="nb-ask-quote">“{a.quote.length > 90 ? a.quote.slice(0, 89) + '…' : a.quote}”</span>}
                  <span className="nb-ask-q">{a.question}</span>
                </summary>
                <Markdown src={a.answer} className="prose nb-ask-a" />
              </details>
            ))}
          </div>
        </section>
      )}

      <Notes entry={e} onChanged={onChanged} />

      <section className="nb-section">
        <p className="eyebrow">Where it came from</p>
        <div className="rows">
          {e.sources.map((s) => (
            <Link key={s.run} className="row" href={'/session/' + s.run}>
              <div className="grow">
                <p>{s.title}</p>
                <p className="sub">
                  {s.kind === 'review' ? 'Review' : s.kind === 'explore' ? 'Side trip' : s.kind === 'rehearsal' ? 'Rehearsal' : 'Session'} · {day(s.at)}
                </p>
              </div>
              <Icon name="chevron" size={18} />
            </Link>
          ))}
        </div>
      </section>

      {sharing && <ShareSheet entry={e} onClose={() => setSharing(false)} onChanged={onChanged} />}
    </article>
  );
}

function Words({ w }: { w: Entry['words'][number] }) {
  return (
    <figure className="nb-words">
      <blockquote>{w.text}</blockquote>
      <figcaption className="label">
        {w.verdict && <i className={'dot v-' + w.verdict} aria-hidden="true" />}
        {w.verdict ? VERDICT[w.verdict] + ' · ' : ''}
        {STEP[w.step] || 'Your answer'} · {day(w.at)}
      </figcaption>
    </figure>
  );
}

function Notes({ entry: e, onChanged }: { entry: Entry; onChanged: () => Promise<void> | void }) {
  const { toast } = useApp();
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState('');
  if (!e.notes.length)
    return (
      <section className="nb-section">
        <p className="eyebrow">Your notes</p>
        <p className="label">Add a note to any step during a session, or select a passage and choose Note. They collect here.</p>
      </section>
    );
  async function save(id: string, run: string, beat: string) {
    try {
      await api('/api/notes', { id, runId: run, beatId: beat, text: draft.trim() });
      setEditing(null);
      await onChanged();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      await api('/api/notes', { id }, 'DELETE');
      await onChanged();
      toast('Note removed.');
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <section className="nb-section">
      <p className="eyebrow">Your notes</p>
      <div className="nb-notes">
        {e.notes.map((n) => (
          <div className="nb-note" key={n.id}>
            {n.quote && <blockquote className="ask-quote">“{n.quote}”</blockquote>}
            {editing === n.id ? (
              <div className="note-edit">
                <textarea className="textarea" rows={3} value={draft} autoFocus onChange={(x) => setDraft(x.target.value)} aria-label="Edit note" />
                <div className="row-inline">
                  <button className="btn small primary" disabled={!draft.trim()} onClick={() => void save(n.id, n.run, n.beat)}>
                    Save
                  </button>
                  <button className="btn small ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p>{n.text}</p>
                <div className="nb-note-foot">
                  <span className="label">{day(n.at)}</span>
                  <button
                    className="btn icon small ghost"
                    aria-label="Edit note"
                    onClick={() => {
                      setDraft(n.text);
                      setEditing(n.id);
                    }}
                  >
                    <Icon name="edit" size={15} />
                  </button>
                  <button className="btn icon small ghost" aria-label="Delete note" onClick={() => void remove(n.id)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// A link anyone can open: a snapshot card of this idea. Turning it off makes
// the link stop working.
function ShareSheet({ entry: e, onClose, onChanged }: { entry: Entry; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const { toast } = useApp();
  const [words, setWords] = useState(e.words.length > 0),
    [name, setName] = useState(false),
    [token, setToken] = useState(e.shared || null),
    [busy, setBusy] = useState(false);
  const url = token ? `${location.origin}/c/${token}` : '';
  async function make() {
    setBusy(true);
    try {
      const r = await api<{ token: string }>('/api/shares', { key: e.key, words, name });
      setToken(r.token);
      await onChanged();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    try {
      await api('/api/shares', { key: e.key }, 'DELETE');
      setToken(null);
      await onChanged();
      toast('The link no longer works.');
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied.');
    } catch {
      toast('Copy the link from the box.');
    }
  }
  return (
    <Sheet title="Share this idea" subtitle="A card anyone with the link can see. It’s a snapshot: later sessions don’t change it." onClose={onClose}>
      <div className="setting-list">
        <div className="setting-line">
          <div className="grow">
            <p>Include your explanation</p>
            <p className="label">{e.words.length ? 'Your best answer about this idea, word for word.' : 'You haven’t explained this one yet.'}</p>
          </div>
          <Switch checked={words} onChange={setWords} label="Include your explanation" disabled={!e.words.length || busy} />
        </div>
        <div className="setting-line">
          <div className="grow">
            <p>Show your first name</p>
            <p className="label">Otherwise the card is anonymous.</p>
          </div>
          <Switch checked={name} onChange={setName} label="Show your first name" disabled={busy} />
        </div>
      </div>
      {token ? (
        <>
          <div className="share-link">
            <input className="input" readOnly value={url} aria-label="Share link" onFocus={(x) => x.currentTarget.select()} />
            <button className="btn primary" onClick={() => void copy()}>
              Copy
            </button>
          </div>
          <div className="sheet-actions">
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              <Icon name="arrow" size={17} /> Open the card
            </a>
            <a className="btn" href={`/c/${token}/image`} download={`${e.title}.png`}>
              <Icon name="download" size={17} /> Download as image
            </a>
            <button className="btn" onClick={() => void make()} disabled={busy}>
              <Icon name="refresh" size={17} /> Update with these choices
            </button>
            <button className="btn danger" onClick={() => void stop()} disabled={busy}>
              <Icon name="close" size={17} /> Turn off the link
            </button>
          </div>
        </>
      ) : (
        <button className="btn primary large wide" onClick={() => void make()} data-busy={busy || undefined} disabled={busy}>
          <Icon name="link" size={17} /> Create link
        </button>
      )}
    </Sheet>
  );
}

function NotebookSkeleton() {
  return (
    <div aria-busy="true" className="notebook-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="nb-card skeleton-card">
          <div className="skeleton line" style={{ width: 70 }} />
          <div className="skeleton" style={{ height: 22, width: '75%', marginTop: 12 }} />
          <div className="skeleton line" style={{ width: '92%', marginTop: 14 }} />
          <div className="skeleton line" style={{ width: '64%' }} />
        </div>
      ))}
    </div>
  );
}

function exportMarkdown(data: NotebookView) {
  const lines = ['# Notebook', ''];
  for (const t of data.tracks) {
    const items = data.entries.filter((e) => e.track === t.id);
    if (!items.length) continue;
    lines.push(`## ${t.title}`, '');
    for (const e of items) {
      lines.push(`### ${e.title}`, '');
      if (e.summary) lines.push(e.summary, '');
      if (e.words[0]) lines.push(`> ${e.words[0].text.replace(/\n+/g, ' ')}`, '');
      if (e.explanation) lines.push(e.explanation, '');
      for (const a of e.asks) lines.push(`- **${a.question}** ${a.answer.replace(/\n+/g, ' ').slice(0, 400)}`);
      for (const n of e.notes) lines.push(`- Note: ${n.text.replace(/\n+/g, ' ')}`);
      lines.push('');
    }
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fieldwork-notebook.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
