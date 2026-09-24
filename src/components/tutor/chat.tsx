'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { stream } from '@/lib/client/api';
import { useApp } from '@/components/app/provider';
import { Blocks } from '@/components/session/blocks';
import { Icon } from '@/components/icons';
import { WRITING, type Writing } from '@/lib/learning/voice';
import { plainOf, type ChatMessage, type TutorAction, type TutorReply } from '@/lib/tutor';
import { Aperture } from './aperture';
import { useThread, writeThread } from './store';

type Message = ChatMessage & { streaming?: boolean; error?: string };

const STARTERS = ['What’s on today?', 'Quiz me on this week', 'Explain the last idea again', 'I’m low on energy today'];

const id = () => crypto.randomUUID();

// Talking to the tutor outside a lesson. One thread per device, shared by
// every place it's shown.
export function useTutor(page: string) {
  const { user, setPrefs, w, today } = useApp();
  const thread = useThread(user.id);
  const busy = useRef(false);

  const patch = useCallback(
    (mid: string, p: Partial<Message>) =>
      writeThread(user.id, (t) => ({ ...t, messages: t.messages.map((m) => (m.id === mid ? { ...m, ...p } : m)) })),
    [user.id],
  );

  const apply = useCallback(
    (actions: TutorAction[]) => {
      for (const a of actions) {
        if (a.type === 'set_writing' && a.writing) setPrefs('writing', a.writing);
        if (a.type === 'checkin' && a.energy) {
          const old = w.state.records.find((r) => r.id === 'checkin:' + today)?.data;
          void w.record('checkin', 'checkin:' + today, {
            date: today,
            energy: Math.min(5, Math.max(1, Math.round(a.energy))),
            mood: (a.mood || String(old?.mood || 'Okay')).slice(0, 40),
            minutes: Number(old?.minutes || 60),
          });
        }
      }
    },
    [setPrefs, w, today],
  );

  const send = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said || busy.current) return;
      busy.current = true;
      const mine: Message = { id: id(), role: 'user', text: said, at: new Date().toISOString() };
      const reply: Message = { id: id(), role: 'tutor', blocks: [], streaming: true, at: new Date().toISOString() };
      let history: Message[] = [];
      writeThread(user.id, (t) => {
        history = [...(t.messages as Message[]).filter((m) => !m.streaming), mine];
        return { messages: [...history, reply], pending: true };
      });
      const turns = history
        .filter((m) => !m.error)
        .slice(-16)
        .map((m) => ({ role: m.role, text: (m.role === 'user' ? m.text || '' : plainOf(m.blocks)).slice(0, 4000) }))
        .filter((t) => t.text);
      try {
        const done = await stream<Pick<TutorReply, 'blocks' | 'suggestions' | 'actions'>>(
          '/api/tutor',
          { turns, page },
          { onSnap: (d) => patch(reply.id, { blocks: ((d as { blocks?: TutorReply['blocks'] }).blocks || []).filter(Boolean) }) },
        );
        patch(reply.id, { blocks: done.blocks, suggestions: done.suggestions, actions: done.actions, streaming: false });
        apply(done.actions);
      } catch (e) {
        patch(reply.id, { streaming: false, error: (e as Error).message });
      } finally {
        busy.current = false;
        writeThread(user.id, (t) => ({ ...t, pending: false }));
      }
    },
    [user.id, page, patch, apply],
  );

  const retry = useCallback(() => {
    const msgs = thread.messages as Message[];
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (!lastUser?.text) return;
    writeThread(user.id, (t) => ({ ...t, messages: t.messages.slice(0, t.messages.lastIndexOf(lastUser)) }));
    void send(lastUser.text);
  }, [thread.messages, user.id, send]);

  const clear = useCallback(() => writeThread(user.id, () => ({ messages: [], pending: false })), [user.id]);
  return { messages: thread.messages as Message[], pending: thread.pending, send, retry, clear };
}

export function TutorChat({ variant, page, onClose }: { variant: 'panel' | 'embedded'; page: string; onClose?: () => void }) {
  const { messages, pending, send, retry, clear } = useTutor(page);
  const { prefs, setPrefs } = useApp();
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const last = messages.at(-1);
  const chips = !messages.length ? STARTERS : last?.role === 'tutor' && !last.streaming ? last.suggestions || [] : [];

  // Follow the conversation as it grows, unless the learner scrolled up.
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (variant === 'panel') input.current?.focus();
  }, [variant]);

  const submit = (t = text) => {
    if (!t.trim() || pending) return;
    pinned.current = true;
    void send(t);
    setText('');
  };

  return (
    <section className={'tutor tutor-' + variant} aria-label="Your tutor">
      <header className="tutor-head">
        <Aperture size={26} busy={pending} />
        <div className="tutor-who">
          <b>Tutor</b>
          <span>{pending ? 'Thinking…' : 'Knows your week'}</span>
        </div>
        <label className="tutor-style" title="How your tutor writes">
          <span className="sr-only">Writing style</span>
          <select value={prefs.writing} onChange={(e) => setPrefs('writing', e.target.value as Writing)}>
            {(Object.keys(WRITING) as Writing[]).map((k) => (
              <option key={k} value={k}>
                {WRITING[k].label}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={12} />
        </label>
        {messages.length > 0 && !pending && (
          <button className="btn icon small ghost" onClick={clear} aria-label="Start a new conversation" title="New conversation">
            <Icon name="refresh" size={15} />
          </button>
        )}
        {onClose && (
          <button className="btn icon small ghost" onClick={onClose} aria-label="Close the tutor">
            <Icon name="close" size={16} />
          </button>
        )}
      </header>

      <div
        className="tutor-thread"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        aria-live="polite"
      >
        {!messages.length ? (
          <div className="tutor-empty">
            <p className="tutor-hello">Ask me anything.</p>
            <p className="muted">
              I know today’s plan, what you’ve covered this week and where you got stuck. You can also tell me to write differently, or how you’re feeling.
            </p>
          </div>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="tmsg from-user">
                <p>{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="tmsg from-tutor">
                {m.blocks?.length ? <Blocks blocks={m.blocks} streaming={!!m.streaming} /> : m.streaming ? <Dots /> : null}
                {m.error && (
                  <p className="tutor-error">
                    {m.error}{' '}
                    <button className="link" onClick={retry}>
                      Try again
                    </button>
                  </p>
                )}
                {!!m.actions?.length && <Actions actions={m.actions} onClose={onClose} />}
              </div>
            ),
          )
        )}
      </div>

      <footer className="tutor-foot">
        {chips.length > 0 && (
          <div className="tutor-chips" role="toolbar" aria-label="Suggestions">
            {chips.slice(0, 3).map((c) => (
              <button key={c} className="chip" disabled={pending} onClick={() => submit(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        <form
          className="tutor-compose"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={input}
            value={text}
            rows={1}
            maxLength={2000}
            placeholder="Message your tutor"
            onChange={(e) => {
              setText(e.target.value);
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(140, el.scrollHeight) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            aria-label="Message your tutor"
          />
          <button className="btn icon small primary" disabled={!text.trim() || pending} aria-label="Send">
            <Icon name="up" size={16} />
          </button>
        </form>
      </footer>
    </section>
  );
}

function Dots() {
  return (
    <span className="tutor-dots" aria-label="Thinking">
      <i />
      <i />
      <i />
    </span>
  );
}

// What the tutor did or offers to do, under its reply.
function Actions({ actions, onClose }: { actions: TutorAction[]; onClose?: () => void }) {
  const router = useRouter();
  return (
    <div className="tutor-actions">
      {actions.map((a, i) =>
        a.type === 'open' && a.href ? (
          <Link key={i} href={a.href} className="btn small" onClick={onClose}>
            {a.label || 'Open'} <Icon name="arrow" size={14} />
          </Link>
        ) : a.type === 'start_today' ? (
          <button
            key={i}
            className="btn small primary"
            onClick={() => {
              onClose?.();
              router.push('/?begin=1');
            }}
          >
            Start today’s session <Icon name="arrow" size={14} />
          </button>
        ) : a.type === 'set_writing' && a.writing ? (
          <span key={i} className="tutor-done">
            <Icon name="check" size={13} /> Writing style: {WRITING[a.writing].label}
          </span>
        ) : a.type === 'remember' ? (
          <span key={i} className="tutor-done">
            <Icon name="check" size={13} /> Saved to memory
          </span>
        ) : a.type === 'checkin' && a.energy ? (
          <span key={i} className="tutor-done">
            <Icon name="check" size={13} /> Checked in · energy {a.energy} of 5
          </span>
        ) : null,
      )}
    </div>
  );
}

// The tutor on every page: a mark in the corner that opens the chat.
export const TUTOR_TOGGLE = 'fw:tutor';
export function TutorDock({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  // The phone tab bar opens it too.
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener(TUTOR_TOGGLE, toggle);
    return () => window.removeEventListener(TUTOR_TOGGLE, toggle);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      {open && (
        <div className="tutor-layer" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <TutorChat variant="panel" page={page} onClose={() => setOpen(false)} />
        </div>
      )}
      <button className={'tutor-fab' + (open ? ' is-open' : '')} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close the tutor' : 'Talk to your tutor'}>
        <Aperture size={30} />
      </button>
    </>
  );
}
