'use client';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const OFFLINE = 'You’re offline. This needs a connection.';

async function errorFrom(res: Response) {
  // Platform errors (413, 502, 504) are not JSON; never surface a parser error.
  try {
    const j = await res.json();
    if (j?.error) return new ApiError(j.error, res.status);
  } catch {}
  return new ApiError(
    res.status === 504
      ? 'That took too long. Try again.'
      : res.status === 413
        ? 'That’s too large to send.'
        : res.status >= 500
          ? 'Something went wrong on our side. Try again.'
          : 'That didn’t work. Try again.',
    res.status,
  );
}

export async function api<T = Record<string, unknown>>(
  path: string,
  data?: unknown,
  method?: string,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: method || (data !== undefined ? 'POST' : 'GET'),
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
      cache: 'no-store',
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(navigator.onLine ? 'Couldn’t reach the server. Try again.' : OFFLINE, 0);
  }
  if (!res.ok) throw await errorFrom(res);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('The server sent an unexpected response.', res.status);
  }
}

export type StreamHandlers = {
  onSnap?: (data: unknown) => void;
  onMeta?: (meta: { tier: string; cached?: boolean }) => void;
  // The session's next steps, decided once an answer is graded.
  onPlan?: (data: unknown) => void;
};

// Reads an NDJSON stream of {t:'snap'|'meta'|'plan'|'done'|'error'} events and
// resolves with the final 'done' payload.
export async function stream<T>(
  path: string,
  body: unknown,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(navigator.onLine ? 'Couldn’t reach the tutor. Try again.' : OFFLINE, 0);
  }
  if (!res.ok || !res.body) throw await errorFrom(res);
  const reader = res.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    done: T | undefined;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buffer += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (!line.trim()) continue;
      const e = JSON.parse(line) as { t: string; data?: unknown; message?: string; status?: number; tier?: string; cached?: boolean };
      if (e.t === 'snap') handlers.onSnap?.(e.data);
      else if (e.t === 'meta') handlers.onMeta?.({ tier: e.tier!, cached: e.cached });
      else if (e.t === 'plan') handlers.onPlan?.(e.data);
      else if (e.t === 'done') done = e.data as T;
      else if (e.t === 'error') throw new ApiError(e.message || 'Something went wrong.', e.status || 500);
    }
  }
  if (done === undefined) throw new ApiError('The response ended early. Try again.', 502);
  return done;
}
