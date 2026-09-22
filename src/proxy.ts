import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
// Production deployment URLs forward to the canonical domain: sessions and
// passkeys are bound to one origin, so a second hostname would mean a second,
// signed-out app.
function canonicalRedirect(request: NextRequest) {
  const canonical = process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_ENV !== 'production' || !canonical) return null;
  const target = new URL(canonical),
    host = request.headers.get('host') || request.nextUrl.host;
  if (
    target.protocol !== 'https:' ||
    target.host === host ||
    target.host.endsWith('.vercel.app') ||
    !host.endsWith('.vercel.app') ||
    request.nextUrl.pathname.startsWith('/api/')
  )
    return null;
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, target);
  return NextResponse.redirect(url, 308);
}
export async function proxy(request: NextRequest) {
  const redirect = canonicalRedirect(request);
  if (redirect) return redirect;
  let response = NextResponse.next({ request });
  response.headers.set('Cache-Control', 'private, no-store');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items, headers) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        if (headers)
          Object.entries(headers).forEach(([k, v]) =>
            response.headers.set(k, v),
          );
        response.headers.set('Cache-Control', 'private, no-store');
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|icons/|fonts/|manifest.webmanifest).*)',
  ],
};
