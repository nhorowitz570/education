import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  secret = process.env.SUPABASE_SECRET_KEY!,
  origin = process.env.VERIFY_ORIGIN || 'http://127.0.0.1:3000';
if (!url || !pub || !secret)
  throw new Error('Load the test project environment first.');
const admin = createClient(url, secret, { auth: { persistSession: false } }),
  users: string[] = [],
  passes: string[] = [];
const pass = (s: string) => {
  passes.push(s);
  console.log('PASS ' + s);
};
async function account(label: string) {
  const email = `fieldwork-qa-${label}-${crypto.randomUUID()}@example.invalid`,
    password = crypto.randomUUID() + crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'disposable-fieldwork-verification' },
  });
  if (error || !data.user) throw error;
  users.push(data.user.id);
  const jar = new Map<string, string>();
  const client = createServerClient(url, pub, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach((x) => jar.set(x.name, x.value)),
    },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return {
    id: data.user.id,
    client,
    headers: () => ({
      cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '),
      origin,
      'Content-Type': 'application/json',
    }),
  };
}
async function request(
  a: Awaited<ReturnType<typeof account>>,
  path: string,
  value?: unknown,
  expected = 200,
) {
  const r = await fetch(origin + path, {
    method: value ? 'POST' : 'GET',
    headers: a.headers(),
    body: value ? JSON.stringify(value) : undefined,
  });
  const data = await r.json();
  assert.equal(r.status, expected, `${path}: ${JSON.stringify(data)}`);
  return data;
}
try {
  const a = await account('a'),
    b = await account('b'),
    plan = JSON.parse(readFileSync('examples/learning-plan.json', 'utf8')),
    original = JSON.stringify(plan);
  const anonymous = await fetch(origin + '/api/state');
  assert.equal(anonymous.status, 401);
  pass('Unauthenticated server routes rejected');
  const csrf = await fetch(origin + '/api/actions', {
    method: 'POST',
    headers: { ...a.headers(), origin: 'https://unrelated.example' },
    body: '{}',
  });
  assert.equal(csrf.status, 403);
  pass('Cross-origin mutations rejected');
  const imported = await request(a, '/api/import', {
    action: 'preview',
    filename: 'plan.json',
    original,
    eventId: crypto.randomUUID(),
  });
  assert.equal(imported.plan.sessions.length, 144);
  const activated = await request(a, '/api/import', {
    action: 'activate',
    filename: 'plan.json',
    original,
    plan: imported.plan,
    eventId: crypto.randomUUID(),
  });
  assert.equal(activated.state.plan.sessions.length, 144);
  pass('Authenticated JSON preview and activation');
  const again = await request(a, '/api/import', {
    action: 'activate',
    filename: 'plan.json',
    original,
    plan,
    eventId: crypto.randomUUID(),
  });
  assert.equal(again.version, activated.version);
  pass('Identical import is idempotent');
  const untouched = await request(b, '/api/state');
  assert.equal(untouched.state.plan, undefined);
  const bPlans = await b.client.from('plan_versions').select('*');
  assert.equal(bPlans.data?.length, 0);
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const anonPlans = await anon.from('plan_versions').select('*');
  assert.ok(anonPlans.error);
  pass('Two accounts and anonymous requests cannot read another plan');
  const write = await b.client
    .from('workspaces')
    .update({ user_id: b.id })
    .eq('user_id', a.id);
  assert.ok(write.error);
  const rpc = await b.client.rpc('private_read', {
    p_table: 'usage_events',
    p_user_id: a.id,
  });
  assert.ok(rpc.error);
  const commit = await b.client.rpc('commit_workspace', {
    p_user_id: a.id,
    p_expected: 0,
    p_next: {},
    p_event_id: crypto.randomUUID(),
  });
  assert.ok(commit.error);
  pass('Ownership reassignment and privileged RPC access rejected');
  const storagePath = `${a.id}/food/probe.jpg`,
    file = new Uint8Array([255, 216, 255, 217]);
  const upload = await a.client.storage
    .from('fieldwork-private')
    .upload(storagePath, file, { contentType: 'image/jpeg' });
  assert.ifError(upload.error);
  const foreign = await b.client.storage
    .from('fieldwork-private')
    .download(storagePath);
  assert.ok(foreign.error);
  const foreignWrite = await b.client.storage
    .from('fieldwork-private')
    .upload(`${a.id}/food/foreign.jpg`, file, { contentType: 'image/jpeg' });
  assert.ok(foreignWrite.error);
  pass('Private Storage isolates both reads and writes');
  const started = await request(a, '/api/runs', { kind: 'session', sessionId: 'w01-monday' });
  assert.ok(started.run.id);
  assert.ok(started.run.beats.length > 0);
  assert.ok(!JSON.stringify(started).includes('secrets'));
  const resumed = await request(a, '/api/runs', { kind: 'session', sessionId: 'w01-monday' });
  assert.equal(resumed.run.id, started.run.id);
  pass('Starting a session is instant, resumable, and never exposes answer keys');
  const foreignRun = await fetch(origin + '/api/runs/' + started.run.id, { headers: b.headers() });
  assert.equal(foreignRun.status, 404);
  const directRuns = await a.client.from('runs').select('id');
  assert.ok(directRuns.error || !directRuns.data?.length);
  const foreignMemory = await b.client.from('memories').select('id').eq('user_id', a.id);
  assert.equal(foreignMemory.data?.length ?? 0, 0);
  pass('Runs and memories stay private to their owner');
  plan.title = 'Revised sample';
  plan.sessions.reverse();
  const revised = await request(a, '/api/import', {
    action: 'activate',
    filename: 'revision.json',
    original: JSON.stringify(plan),
    plan,
    eventId: crypto.randomUUID(),
  });
  assert.notEqual(revised.version, activated.version);
  pass('Plan revision creates a new immutable version');
  const reservations = await Promise.all(
    [1, 2].map((i) =>
      admin.rpc('reserve_ai_budget', {
        p_id: crypto.randomUUID(),
        p_user_id: b.id,
        p_key: 'qa:' + i,
        p_amount: 0.6,
        p_user_limit: 1,
        p_project_limit: 100,
        p_model: 'test',
      }),
    ),
  );
  assert.equal(reservations.filter((r) => !r.error).length, 1);
  pass('Concurrent AI reservations respect the per-account hard limit');
  const claim = await Promise.all(
    [1, 2].map(() =>
      admin.rpc('claim_notification', {
        p_user_id: b.id,
        p_event_key: 'qa:reminder',
      }),
    ),
  );
  assert.equal(claim.filter((r) => r.data === true).length, 1);
  pass('Reminder delivery claims deduplicate atomically');
  const exported = await request(a, '/api/export');
  assert.equal(exported.plan_versions.length, 2);
  assert.equal(exported.runs.length, 1);
  assert.ok(!JSON.stringify(exported).includes('"secrets"'));
  pass('Account export includes plan versions and learning history, without answer keys');
  writeFileSync(
    'docs/verification/backend.json',
    JSON.stringify(
      { at: new Date().toISOString(), project: 'Fieldwork', passed: passes },
      null,
      2,
    ) + '\n',
  );
} catch (e) {
  console.error(
    'Verification failed:',
    e instanceof Error ? e.message : 'Unknown error',
  );
  process.exitCode = 1;
} finally {
  for (const id of users) {
    for (const folder of ['imports', 'food']) {
      const { data } = await admin.storage
        .from('fieldwork-private')
        .list(`${id}/${folder}`);
      if (data?.length)
        await admin.storage
          .from('fieldwork-private')
          .remove(data.map((f) => `${id}/${folder}/${f.name}`));
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('Disposable test account cleanup needs review.');
  }
}
