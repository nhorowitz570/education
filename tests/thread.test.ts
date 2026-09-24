import { describe, expect, it } from 'vitest';
import { importInput, messageOf, sendInput } from '@/lib/thread';

describe('tutor thread', () => {
  const id = '8b3f1c9e-2a4d-4f6b-9c1e-0d2a3b4c5d6e';
  const reply = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  it('takes one new message with client-chosen ids', () => {
    expect(sendInput.parse({ id, reply_id: reply, text: '  What’s on today? ' })).toEqual({
      id,
      reply_id: reply,
      text: 'What’s on today?',
      page: '/',
    });
    expect(() => sendInput.parse({ id: 'nope', reply_id: reply, text: 'Hi' })).toThrow();
    expect(() => sendInput.parse({ id, reply_id: reply, text: '   ' })).toThrow();
  });
  it('turns stored rows into the chat shape, leaving out empty parts', () => {
    expect(
      messageOf({ id, role: 'tutor', text: null, blocks: [{ type: 'text', md: 'Cash is king.' }], actions: [], suggestions: null, created_at: '2026-09-24T10:00:00+00:00' }),
    ).toEqual({ id, role: 'tutor', blocks: [{ type: 'text', md: 'Cash is king.' }], at: '2026-09-24T10:00:00+00:00' });
  });
  it('accepts a device-kept thread for the one-time move', () => {
    const parsed = importInput.parse({ messages: [{ id, role: 'user', text: 'Hi', at: '2026-09-24T10:00:00.000Z' }] });
    expect(parsed.messages).toHaveLength(1);
    expect(() => importInput.parse({ messages: [{ id, role: 'user', text: 'Hi', at: 'yesterday' }] })).toThrow();
  });
});
