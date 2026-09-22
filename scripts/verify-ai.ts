import { readFileSync, writeFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import { getLesson, assessDecision } from '../src/lib/server/lessons';
import { structured, replySchema, model } from '../src/lib/server/ai';
import { readState, privateRows } from '../src/lib/server/state';
const account = JSON.parse(readFileSync('.qa-review-account.json', 'utf8'));
const jar = new Map<string, string>();
const client = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach((x) => jar.set(x.name, x.value)),
    },
  },
);
const signed = await client.auth.signInWithPassword(account);
if (signed.error) throw new Error(signed.error.message);
const origin = process.env.NEXT_PUBLIC_APP_URL!;
if (!(await readState(account.id)).plan) {
  const original = readFileSync('examples/learning-plan.json', 'utf8');
  const response = await fetch(origin + '/api/import', {
    method: 'POST',
    headers: {
      origin,
      'Content-Type': 'application/json',
      cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '),
    },
    body: JSON.stringify({
      action: 'activate',
      filename: 'sample.json',
      original,
      plan: JSON.parse(original),
      eventId: crypto.randomUUID(),
    }),
  });
  if (!response.ok) throw new Error('Import: ' + response.status);
}
const { lesson, key } = await getLesson(
  account.id,
  'w01-monday',
  undefined,
  true,
);
writeFileSync(
  'docs/verification/generated-lesson.json',
  JSON.stringify(lesson, null, 2) + '\n',
);
console.log(
  'Generated and saved source-grounded lesson:',
  JSON.stringify(lesson),
);
const decision = await assessDecision(
  account.id,
  lesson,
  key,
  key.correct_choice,
  'Any reported profit means the same amount is already in the bank, so no payment timing matters.',
);
if (decision.correct) throw new Error('Incorrect reasoning was accepted.');
console.log(
  'Reasoning assessment rejected a correct choice with incorrect reasoning.',
);
const usage = await privateRows<{
  state: string;
  actual_usd: number;
  reserved_usd: number;
}>('usage_events', account.id);
writeFileSync(
  'docs/verification/ai.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      provider: 'OpenRouter',
      model: model(),
      structuredResponse: true,
      generatedLesson: lesson.generated,
      verifiedSources: lesson.sources.map((s) => s.url),
      incorrectReasoningRejected: true,
      settledUSD: usage
        .filter((x) => x.state === 'settled')
        .reduce((n, x) => n + Number(x.actual_usd), 0),
      heldUSD: usage
        .filter((x) => x.state === 'reserved')
        .reduce((n, x) => n + Number(x.reserved_usd), 0),
    },
    null,
    2,
  ) + '\n',
);
