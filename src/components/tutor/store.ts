'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '@/lib/client/api';
import { THREAD_KEEP } from '@/lib/thread';
import type { ChatMessage } from '@/lib/tutor';

// The tutor thread lives on the account, shared with the iPhone app. This
// store mirrors it for every place the chat appears (the dock on each page,
// the panel on Today), with a copy on the device so it paints instantly.
type Thread = { messages: ChatMessage[]; pending: boolean };
const EMPTY: Thread = { messages: [], pending: false };
const threads = new Map<string, Thread>();
const synced = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const key = (owner: string) => `fw:${owner}:tutor:thread`;

function read(owner: string): Thread {
  let t = threads.get(owner);
  if (!t) {
    let messages: ChatMessage[] = [];
    try {
      const raw = localStorage.getItem(key(owner));
      if (raw) messages = (JSON.parse(raw) as ChatMessage[]).filter((m) => m && m.id && m.role).slice(-THREAD_KEEP);
    } catch {}
    t = { messages, pending: false };
    threads.set(owner, t);
  }
  return t;
}

export function writeThread(owner: string, change: (t: Thread) => Thread) {
  const next = change(read(owner));
  threads.set(owner, next);
  try {
    localStorage.setItem(
      key(owner),
      JSON.stringify(next.messages.filter((m) => !(m as { streaming?: boolean }).streaming).slice(-THREAD_KEEP)),
    );
  } catch {}
  listeners.forEach((l) => l());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pulls the account's thread. The first time, a thread this browser kept
// before syncing existed is moved onto the account if the account has none.
async function pull(owner: string, first: boolean) {
  let { messages } = await api<{ messages: ChatMessage[] }>('/api/tutor');
  const local = read(owner).messages.filter((m) => UUID.test(m.id) && !(m as { error?: string }).error);
  if (first && !messages.length && local.length) {
    await api('/api/tutor', { messages: local.map(({ id, role, text, blocks, suggestions, at }) => ({ id, role, text, blocks, suggestions, at })) }, 'PUT').catch(() => {});
    ({ messages } = await api<{ messages: ChatMessage[] }>('/api/tutor'));
  }
  if (read(owner).pending) return;
  writeThread(owner, (t) => ({ ...t, messages }));
}

export function syncThread(owner: string, first = false) {
  const running = synced.get(owner);
  if (running && !first) return running;
  const p = pull(owner, first).catch(() => {});
  synced.set(owner, p);
  return p;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useThread(owner: string): Thread {
  // Catch up on load and whenever the tab comes back, so a conversation
  // continued on the phone shows up here.
  useEffect(() => {
    if (!synced.has(owner)) void syncThread(owner, true);
    const onShow = () => document.visibilityState === 'visible' && void pull(owner, false).catch(() => {});
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [owner]);
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === 'undefined' ? EMPTY : read(owner)),
    () => EMPTY,
  );
}
