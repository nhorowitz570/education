import 'server-only';
import { after } from 'next/server';
import { HttpError } from './http';

type Event = { t: string; [k: string]: unknown };

// NDJSON response for progressively generated content. Snapshots are
// throttled (the final state is always delivered). The work continues to
// completion even if the client disconnects, so a prefetched step that the
// learner never waited for is still saved.
export function ndjson(work: (send: (e: Event) => void) => Promise<unknown>) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true,
    lastSnap = 0,
    pending: Event | null = null,
    timer: ReturnType<typeof setTimeout> | null = null;
  const write = (e: Event) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
    } catch {
      open = false;
    }
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending) {
      write(pending);
      pending = null;
      lastSnap = Date.now();
    }
  };
  const send = (e: Event) => {
    if (e.t === 'snap') {
      pending = e;
      const wait = 40 - (Date.now() - lastSnap);
      if (wait <= 0) flush();
      else timer ??= setTimeout(flush, wait);
      return;
    }
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
    write(e);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      open = false;
    },
  });
  const done = work(send)
    .catch((e) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) console.error('Stream failed:', e instanceof Error ? e.message : e);
      send({
        t: 'error',
        status,
        message: e instanceof HttpError ? e.message : 'Something went wrong. Try again.',
      });
    })
    .finally(() => {
      if (open) {
        open = false;
        try {
          controller.close();
        } catch {}
      }
    });
  after(() => done);
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
