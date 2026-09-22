import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);
const email = `fieldwork-review-${crypto.randomUUID()}@example.invalid`,
  password = crypto.randomUUID() + crypto.randomUUID();
const { data, error } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { purpose: 'disposable-ui-verification' },
});
if (error || !data.user) throw error;
writeFileSync(
  '.qa-review-account.json',
  JSON.stringify({ id: data.user.id, email, password }),
  { mode: 0o600 },
);
console.log(
  'Disposable browser verification account created; credentials stay in an ignored local file.',
);
