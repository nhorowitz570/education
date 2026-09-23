// Creates a disposable, pre-confirmed test account and prints Supabase SSR
// session cookies for automated end-to-end checks. No password is used: the
// session comes from an admin-generated magic link. Delete with --delete <id>.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
if (process.argv[2] === '--delete') {
  const { error } = await admin.auth.admin.deleteUser(process.argv[3]);
  if (error) throw error;
  console.log(JSON.stringify({ deleted: process.argv[3] }));
  process.exit(0);
}
// --user <id> signs an existing disposable account in again.
const existing = process.argv[2] === '--user' ? process.argv[3] : null;
let created: { user: { id: string; email?: string } };
if (existing) {
  const { data, error } = await admin.auth.admin.getUserById(existing);
  if (error || !data.user) throw error;
  created = { user: data.user };
} else {
  const email = `fieldwork-e2e-${crypto.randomUUID()}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { purpose: 'disposable-e2e-verification' },
  });
  if (error || !data.user) throw error;
  created = { user: data.user };
}
const email = created.user.email!;
const { data: link, error: le } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
});
if (le) throw le;
const jar = new Map<string, string>();
const client = createServerClient(
  url,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) =>
        items.forEach(({ name, value }) =>
          value ? jar.set(name, value) : jar.delete(name),
        ),
    },
  },
);
const { error: ve } = await client.auth.verifyOtp({
  type: 'magiclink',
  token_hash: link.properties.hashed_token,
});
if (ve) throw ve;
console.log(
  JSON.stringify({
    id: created.user.id,
    cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    cookies: [...jar].map(([name, value]) => ({ name, value })),
  }),
);
