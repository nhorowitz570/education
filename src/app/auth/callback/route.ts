import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
// PKCE return path for Supabase's default magic-link email. It only succeeds in
// the browser that requested the link; the token-hash template routes through
// /auth/confirm instead, which works from any browser or the installed app.
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get('code');
  if (code) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
