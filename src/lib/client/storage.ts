import { openDB } from 'idb';
import type { AppState } from '@/lib/types';
import type { Command } from '@/lib/commands';
const database = () =>
  openDB('fieldwork-private-v1', 1, {
    upgrade(db) {
      db.createObjectStore('data');
    },
  });
export async function claimLocal(owner: string) {
  const db = await database();
  const tx = db.transaction('data', 'readwrite');
  const old = await tx.store.get('owner');
  if (old !== owner) await tx.store.clear();
  await tx.store.put(owner, 'owner');
  await tx.done;
}
export async function clearLocal() {
  const db = await database();
  await db.clear('data');
  // Notes written offline and not yet sent are private too.
  try {
    localStorage.removeItem('fieldwork-pending-notes');
  } catch {}
}
export async function localGet<T>(
  owner: string,
  key: string,
): Promise<T | undefined> {
  const db = await database();
  const tx = db.transaction('data', 'readonly');
  if ((await tx.store.get('owner')) !== owner) return undefined;
  return tx.store.get(key);
}
export async function localSet(owner: string, key: string, value: unknown) {
  const db = await database();
  const tx = db.transaction('data', 'readwrite');
  if ((await tx.store.get('owner')) === owner) await tx.store.put(value, key);
  await tx.done;
}
export const savedState = (owner: string) => localGet<AppState>(owner, 'state');
export const savedQueue = (owner: string) =>
  localGet<Command[]>(owner, 'queue');
export async function localOwner(): Promise<string | undefined> {
  return (await database()).get('data', 'owner');
}
export async function updateQueue(owner: string, command: Command | string) {
  const db = await database(),
    tx = db.transaction('data', 'readwrite');
  if ((await tx.store.get('owner')) !== owner) {
    await tx.done;
    throw new Error('Your account changed. Reload before saving.');
  }
  const current = ((await tx.store.get('queue')) || []) as Command[];
  const id = typeof command === 'string' ? command : command.eventId;
  const next = current.filter((c) => c.eventId !== id);
  if (typeof command !== 'string') next.push(command);
  await tx.store.put(next, 'queue');
  await tx.done;
  return next;
}
