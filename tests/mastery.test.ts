import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/http', () => ({
  context: vi.fn(async () => ({ user: { id: 'learner-1' } })),
  fail: vi.fn((error: Error) => {
    throw error;
  }),
}));
vi.mock('@/lib/server/state', () => ({
  readState: vi.fn(async () => ({ plan: null })),
}));

import { GET } from '@/app/api/mastery/route';

describe('mastery API', () => {
  it('returns every collection the page reads before a plan is imported', async () => {
    const response = await GET(new Request('https://fieldwork.test/api/mastery'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      concepts: [],
      mapped: false,
      hasPlan: false,
      evidence: [],
      practice: [],
      history: [],
      weeks: [],
    });
  });
});
