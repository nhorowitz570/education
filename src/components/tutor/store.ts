'use client';
import { useSyncExternalStore } from 'react';
import type { ChatMessage } from '@/lib/tutor';

// The tutor thread, kept on this device and shared by every place the chat
// appears (the dock on each page, the panel on Today), so a conversation
// started in one carries on in the other.
const KEEP = 60;
type Thread = { messages: ChatMessage[]; pending: boolean };
const EMPTY: Thread = { messages: [], pending: false };
const threads = new Map<string, Thread>();
const listeners = new Set<() => void>();
const key = (owner: string) => `fw:${owner}:tutor:thread`;

function read(owner: string): Thread {
  let t = threads.get(owner);
  if (!t) {
    let messages: ChatMessage[] = [];
    try {
      const raw = localStorage.getItem(key(owner));
      if (raw) messages = (JSON.parse(raw) as ChatMessage[]).filter((m) => m && m.id && m.role).slice(-KEEP);
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
    localStorage.setItem(key(owner), JSON.stringify(next.messages.slice(-KEEP)));
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useThread(owner: string): Thread {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === 'undefined' ? EMPTY : read(owner)),
    () => EMPTY,
  );
}
