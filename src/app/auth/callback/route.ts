import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get('code');
  if (code) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          url.searchParams.get('next') === '/reset-password'
            ? '/reset-password'
            : '/',
          url.origin,
        ),
      );
  }
  return NextResponse.redirect(new URL('/?auth_error=link', url.origin));
}
