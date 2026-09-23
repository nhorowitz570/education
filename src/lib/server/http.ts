import 'server-only';
import { NextResponse } from 'next/server';
import { serverClient, adminClient, configured } from '@/lib/supabase/server';
import { crossSite } from './origin';
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function context(request?: Request) {
  if (!configured())
    throw new HttpError(
      'Connect Supabase to use your private account. The local preview remains available.',
      503,
    );
  if (request && crossSite(request))
    throw new HttpError('This request came from a different site.', 403);
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError('Sign in to continue.', 401);
  const expectedOwner = request?.headers.get('x-fieldwork-owner');
  if (expectedOwner && expectedOwner !== data.user.id)
    throw new HttpError('Your account changed. Reload before continuing.', 409);
  if (!process.env.SUPABASE_SECRET_KEY)
    throw new HttpError('The private backend is awaiting configuration.', 503);
  return { user: data.user, db: adminClient() };
}
export async function body<T = unknown>(
  request: Request,
  max = 128000,
): Promise<T> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > max) throw new HttpError('This request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError('A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError('This request is too large.', 413);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all)) as T;
  } catch {
    throw new HttpError('This request is not valid JSON.');
  }
}
export function fail(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof Error && error.name === 'ZodError')
    return NextResponse.json(
      {
        error:
          'Some fields are invalid. Check the dates, required answers, and file format.',
      },
      { status: 400 },
    );
  // Supabase errors are plain objects; log their code and message so a
  // failure is diagnosable without logging request data.
  const detail = error as { name?: string; code?: string; message?: string } | null;
  console.error(
    'Fieldwork request failed:',
    error instanceof Error ? error.name : 'UnknownError',
    [detail?.code, detail?.message?.slice(0, 200)].filter(Boolean).join(' '),
  );
  return NextResponse.json(
    {
      error:
        error instanceof Error &&
        /allowance|budget|configured|conflict|already|Choose|date|plan|file|source/i.test(
          error.message,
        )
          ? error.message
          : 'This did not save. Your work is still here; please try again.',
    },
    { status: 500 },
  );
}
