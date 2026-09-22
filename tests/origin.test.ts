import { describe, it, expect, afterEach } from 'vitest';
import { crossSite, servingOrigin } from '@/lib/server/origin';

const post = (url: string, headers: Record<string, string>) =>
  new Request(url, { method: 'POST', headers });
const saved = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = saved;
});

describe('cross-site request guard', () => {
  it('accepts same-origin writes on any host the app is served from', () => {
    // The regression: a build configured for one origin rejected its own
    // deployment URLs, aliases and localhost with 403.
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000';
    for (const origin of [
      'http://localhost:3100',
      'https://education-gfu259vus-connexa1.vercel.app',
      'https://education-eosin-xi.vercel.app',
    ]) {
      const host = new URL(origin).host;
      expect(
        crossSite(post(origin + '/api/import', { origin, host })),
      ).toBe(false);
      expect(
        crossSite(
          post('http://internal/api/import', {
            origin,
            'x-forwarded-host': host,
            'x-forwarded-proto': new URL(origin).protocol.replace(':', ''),
          }),
        ),
      ).toBe(false);
    }
  });
  it('trusts Fetch Metadata when the browser sends it', () => {
    const url = 'https://app.example/api/actions';
    expect(crossSite(post(url, { 'sec-fetch-site': 'same-origin' }))).toBe(
      false,
    );
    expect(crossSite(post(url, { 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(crossSite(post(url, { 'sec-fetch-site': 'same-site' }))).toBe(true);
  });
  it('rejects a foreign or opaque Origin', () => {
    const url = 'https://app.example/api/account';
    expect(crossSite(post(url, { origin: 'https://evil.example' }))).toBe(true);
    expect(crossSite(post(url, { origin: 'null' }))).toBe(true);
  });
  it('still honours an explicitly configured canonical origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://learn.example';
    expect(
      crossSite(
        post('http://10.0.0.4/api/lesson', { origin: 'https://learn.example' }),
      ),
    ).toBe(false);
  });
  it('never blocks safe methods', () => {
    expect(
      crossSite(
        new Request('https://app.example/api/state', {
          headers: { origin: 'https://evil.example' },
        }),
      ),
    ).toBe(false);
  });
  it('derives the serving origin from proxy headers', () => {
    expect(
      servingOrigin(
        post('http://127.0.0.1/api/x', {
          'x-forwarded-host': 'a.example, b.example',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://a.example');
  });
});
