import { createBrowserClient } from '@supabase/ssr';
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // Passkeys are opt-in and still experimental in Supabase Auth.
    { auth: { experimental: { passkey: true } } },
  );
}

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
// Sign-in links always return to the canonical site (edu.nhorowitz.co in
// production) so sessions and passkeys live on one origin. Local development
// keeps its own loopback origin.
export function authRedirect(path = '/auth/callback') {
  const here = window.location;
  const base = LOOPBACK.test(here.hostname)
    ? here.origin
    : process.env.NEXT_PUBLIC_APP_URL || here.origin;
  return new URL(path, base).toString();
}
