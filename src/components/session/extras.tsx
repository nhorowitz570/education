'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { DecorateText, plainRuns } from '@/components/ui';
import { findTerms, phrasesOf, LEVEL_LABEL, type Note, type Term } from '@/lib/notebook';
import type { Block } from '@/lib/learning/run';

// What a session knows beyond its own steps: the learner's notes on each
// step, and the ideas they've met in earlier sessions, so a lesson can point
// back to them.

type NoteRow = { id: string; run_id: string; beat_id: string; concept_key: string | null; quote: string | null; text: string; created_at: string };
type Draft = { beatId: string; quote?: string; id?: string; text: string };
type Extras = {
  notes: Note[];
  draft: Draft | null;
  startNote: (beatId: string, quote?: string) => void;
  editNote: (n: Note) => void;
  setDraftText: (text: string) => void;
  cancelNote: () => void;
  saveNote: () => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  saving: boolean;
  noteError: string;
  terms: Term[];
  openTerm: (t: Term, at: DOMRect) => void;
};
const Ctx = createContext<Extras | null>(null);
export const useExtras = () => useContext(Ctx);

type Pending = { key: string; body: { id?: string; runId: string; beatId: string; text: string; quote?: string } };
const PENDING = 'fieldwork-pending-notes';
function pendingNotes(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING) || '[]') as Pending[];
  } catch {
    return [];
  }
}
function keepPending(key: string, body: Pending['body']) {
  try {
    localStorage.setItem(PENDING, JSON.stringify([...pendingNotes().filter((p) => p.key !== key), { key, body }]));
  } catch {}
}
function dropPending(key: string) {
  try {
    localStorage.setItem(PENDING, JSON.stringify(pendingNotes().filter((p) => p.key !== key)));
  } catch {}
}

const toNote = (r: NoteRow): Note => ({ id: r.id, text: r.text, quote: r.quote, run: r.run_id, beat: r.beat_id, concept: r.concept_key, at: r.created_at });

export function SessionExtras({ runId, children }: { runId: string; children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]),
    [draft, setDraft] = useState<Draft | null>(null),
    [saving, setSaving] = useState(false),
    [noteError, setNoteError] = useState(''),
    [terms, setTerms] = useState<Term[]>([]),
    [open, setOpen] = useState<{ term: Term; at: DOMRect } | null>(null);
  useEffect(() => {
    void api<{ notes: NoteRow[] }>(`/api/notes?run=${runId}`)
      .then((r) => setNotes(r.notes.map(toNote)))
      .catch(() => {});
    void api<{ terms: Term[] }>(`/api/notebook?terms=1&run=${runId}`)
      .then((r) => setTerms(r.terms.map((t) => (t.phrases.length ? t : { ...t, phrases: phrasesOf(t.title) }))))
      .catch(() => {});
  }, [runId]);
  // Without a connection a note waits on this device and is sent once the
  // app is back online; it shows in place meanwhile.
  const flush = useCallback(async () => {
    for (const p of pendingNotes()) {
      try {
        const { note } = await api<{ note: NoteRow }>('/api/notes', p.body);
        dropPending(p.key);
        if (p.body.runId === runId) setNotes((list) => [...list.filter((n) => n.id !== p.key && n.id !== note.id), toNote(note)]);
      } catch (e) {
        if ((e as { status?: number }).status !== 0) dropPending(p.key);
        else return;
      }
    }
  }, [runId]);
  useEffect(() => {
    void flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [flush]);
  const saveNote = useCallback(async () => {
    if (!draft || !draft.text.trim()) return;
    setSaving(true);
    setNoteError('');
    const waiting = draft.id?.startsWith('pending:');
    const body = { id: waiting ? undefined : draft.id, runId, beatId: draft.beatId, text: draft.text.trim(), quote: draft.quote };
    try {
      const { note } = await api<{ note: NoteRow }>('/api/notes', body);
      if (waiting) dropPending(draft.id!);
      setNotes((list) => [...list.filter((n) => n.id !== note.id && n.id !== draft.id), toNote(note)]);
      setDraft(null);
    } catch (e) {
      if ((e as { status?: number }).status === 0) {
        const key = draft.id || 'pending:' + crypto.randomUUID();
        keepPending(key, body);
        setNotes((list) => [
          ...list.filter((n) => n.id !== key),
          { id: key, text: body.text, quote: body.quote, run: runId, beat: body.beatId, at: new Date().toISOString() },
        ]);
        setDraft(null);
      } else setNoteError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [draft, runId]);
  const removeNote = useCallback(async (id: string) => {
    setNotes((list) => list.filter((n) => n.id !== id));
    if (id.startsWith('pending:')) return dropPending(id);
    await api('/api/notes', { id }, 'DELETE').catch(() => {});
  }, []);
  const closeTerm = useCallback(() => setOpen(null), []);
  const value = useMemo<Extras>(
    () => ({
      notes,
      draft,
      startNote: (beatId, quote) => {
        setNoteError('');
        setDraft({ beatId, quote, text: '' });
      },
      editNote: (n) => {
        setNoteError('');
        setDraft({ beatId: n.beat, id: n.id, quote: n.quote || undefined, text: n.text });
      },
      setDraftText: (text) => setDraft((d) => (d ? { ...d, text } : d)),
      cancelNote: () => setDraft(null),
      saveNote,
      removeNote,
      saving,
      noteError,
      terms,
      openTerm: (term, at) => setOpen({ term, at }),
    }),
    [notes, draft, saveNote, removeNote, saving, noteError, terms],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <TermCard term={open.term} at={open.at} onClose={closeTerm} />}
    </Ctx.Provider>
  );
}

// Marks the first mention of each earlier idea in a step's finished text.
// The step's own idea isn't marked: it's the one being taught. Which run of
// text carries each mark is decided up front from the step's blocks, so
// rendering stays pure.
export function KnownTerms({ except, blocks, children }: { except?: string; blocks: Block[]; children: ReactNode }) {
  const x = useExtras();
  const terms = x?.terms;
  const openTerm = x?.openTerm;
  const text = blocks.map((b) => (b.type === 'visual' ? '' : b.md || '')).join('\n\n');
  const owners = useMemo(() => {
    if (!terms?.length) return new Map<string, Term[]>();
    const used = new Set<string>(except ? [except] : []);
    const byRun = new Map<string, Term[]>();
    for (const run of plainRuns(text))
      for (const h of findTerms(run, terms, used)) {
        used.add(h.term.key);
        byRun.set(run, [...(byRun.get(run) || []), h.term]);
      }
    return byRun;
  }, [terms, except, text]);
  const decorate = useCallback(
    (run: string, key: string): ReactNode => {
      const mine = owners.get(run);
      if (!mine?.length || !openTerm) return run;
      const hits = findTerms(run, mine);
      const out: ReactNode[] = [];
      let at = 0;
      hits.forEach((h, i) => {
        if (h.start > at) out.push(run.slice(at, h.start));
        out.push(
          <button
            key={key + ':' + i}
            type="button"
            className={'term t-' + h.term.track}
            onClick={(e) => openTerm(h.term, e.currentTarget.getBoundingClientRect())}
            aria-label={`${run.slice(h.start, h.end)}: from your Notebook`}
          >
            {run.slice(h.start, h.end)}
          </button>,
        );
        at = h.end;
      });
      if (at < run.length) out.push(run.slice(at));
      return out;
    },
    [owners, openTerm],
  );
  return owners.size ? <DecorateText.Provider value={decorate}>{children}</DecorateText.Provider> : <>{children}</>;
}

function TermCard({ term, at, onClose }: { term: Term; at: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => {
      document.addEventListener('pointerdown', away);
      window.addEventListener('scroll', onClose, { passive: true, once: true });
    }, 0);
    document.addEventListener('keydown', esc);
    ref.current?.focus();
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', onClose);
    };
  }, [onClose]);
  const width = Math.min(340, window.innerWidth - 24);
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, at.left + at.width / 2 - width / 2));
  const below = window.innerHeight - at.bottom > 240;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={term.title}
      className={'term-card t-' + term.track + (below ? '' : ' above')}
      style={{ left, width, ...(below ? { top: at.bottom + 10 } : { bottom: window.innerHeight - at.top + 10 }) }}
    >
      <p className="eyebrow">
        <i className="dot" aria-hidden="true" /> From your Notebook · {LEVEL_LABEL[term.level] || term.level}
      </p>
      <p className="term-card-title">{term.title}</p>
      <div className="meter" aria-label={`${Math.round(term.strength * 100)}% recall strength`}>
        <i style={{ '--v': term.strength } as React.CSSProperties} />
      </div>
      {term.words ? (
        <blockquote className="term-card-words">“{term.words}”</blockquote>
      ) : (
        <p className="label">You met this in an earlier session.</p>
      )}
      <a className="link" href={`/notebook?e=${encodeURIComponent(term.key)}`} target="_blank" rel="noreferrer">
        Open in Notebook <Icon name="arrow" size={14} />
      </a>
    </div>
  );
}

// A step's notes, and the editor when one is being written here.
export function BeatNotes({ beatId, canAdd }: { beatId: string; canAdd: boolean }) {
  const x = useExtras();
  const area = useRef<HTMLTextAreaElement>(null);
  const writing = x?.draft?.beatId === beatId;
  useEffect(() => {
    if (writing) requestAnimationFrame(() => area.current?.focus());
  }, [writing]);
  if (!x) return null;
  const mine = x.notes.filter((n) => n.beat === beatId && n.id !== x.draft?.id);
  return (
    <>
      {mine.map((n) => (
        <div className="beat-note" key={n.id}>
          <Icon name="note" size={15} />
          <div className="grow">
            {n.quote && <p className="beat-note-quote">“{n.quote}”</p>}
            <p>{n.text}</p>
          </div>
          <button className="btn icon small ghost" aria-label="Edit note" onClick={() => x.editNote(n)}>
            <Icon name="edit" size={14} />
          </button>
          <button className="btn icon small ghost" aria-label="Delete note" onClick={() => void x.removeNote(n.id)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      {writing ? (
        <form
          className="note-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void x.saveNote();
          }}
        >
          {x.draft?.quote && <p className="beat-note-quote">“{x.draft.quote}”</p>}
          <textarea
            ref={area}
            className="textarea"
            rows={2}
            value={x.draft?.text || ''}
            placeholder="A note for yourself. It goes to your Notebook."
            aria-label="Your note"
            onChange={(e) => x.setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void x.saveNote();
              }
              if (e.key === 'Escape') x.cancelNote();
            }}
          />
          <div className="row-inline">
            <button className="btn small primary" disabled={!x.draft?.text.trim() || x.saving} data-busy={x.saving || undefined}>
              Save note
            </button>
            <button type="button" className="btn small ghost" onClick={x.cancelNote}>
              Cancel
            </button>
            {x.noteError && (
              <span className="label" role="alert">
                {x.noteError}
              </span>
            )}
          </div>
        </form>
      ) : (
        canAdd && (
          <button className="link add-note" onClick={() => x.startNote(beatId)}>
            <Icon name="note" size={14} /> Add a note
          </button>
        )
      )}
    </>
  );
}
