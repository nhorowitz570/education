import 'server-only';
import { z } from 'zod';

// All AI configuration is read and validated here, once. Model identifiers are
// never hard-coded elsewhere: tasks name a tier and this file resolves it.
const price = z.coerce.number().min(0).max(1000);
const schema = z.object({
  // Text models go through OpenRouter by default; voice (GPT-Live) and
  // embeddings always use OpenAI directly.
  AI_PROVIDER: z.enum(['openai', 'openrouter']).default('openrouter'),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENROUTER_API_KEY: z.string().min(20).optional(),
  // Verified against the OpenAI model list on 2026-09-22.
  AI_MODEL_FAST: z.string().min(2).default('gpt-6-luna'),
  AI_MODEL_PRIMARY: z.string().min(2).default('gpt-6-sol'),
  AI_MODEL_REASONING: z.string().min(2).default('gpt-6-astra'),
  AI_MODEL_EMBEDDING: z.string().min(2).default('text-embedding-3-small'),
  // USD per million tokens (input, cached input, output) for cost accounting.
  AI_PRICE_FAST: z.string().default('0.10,0.01,0.50'),
  AI_PRICE_PRIMARY: z.string().default('2,0.20,10'),
  AI_PRICE_REASONING: z.string().default('10,1,50'),
  // Optional runaway guard. Unset means unmetered; usage is still logged.
  AI_MONTHLY_LIMIT_USD: z.coerce.number().positive().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600000).default(90000),
  OPENAI_VOICE_MODEL: z.string().default('gpt-live-1'),
  VOICE_SESSION_LIMIT_SECONDS: z.coerce.number().int().min(60).max(1500).default(900),
});
export type AIEnv = z.infer<typeof schema> & {
  prices: Record<Tier, { input: number; cached: number; output: number }>;
};
export type Tier = 'fast' | 'primary' | 'reasoning';

let cached: AIEnv | null = null;
export function aiEnv(): AIEnv {
  if (cached) return cached;
  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((k) => [k, process.env[k] || undefined]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      'AI configuration is invalid: ' +
        parsed.error.issues.map((i) => i.path.join('.')).join(', '),
    );
  const parse = (v: string) => {
    const [input, cachedInput, output] = v.split(',').map((n) => price.parse(n));
    return { input, cached: cachedInput, output };
  };
  cached = {
    ...parsed.data,
    prices: {
      fast: parse(parsed.data.AI_PRICE_FAST),
      primary: parse(parsed.data.AI_PRICE_PRIMARY),
      reasoning: parse(parsed.data.AI_PRICE_REASONING),
    },
  };
  return cached;
}

export function aiReady() {
  const env = aiEnv();
  return env.AI_PROVIDER === 'openai'
    ? !!env.OPENAI_API_KEY
    : !!env.OPENROUTER_API_KEY;
}
export function voiceReady() {
  return !!aiEnv().OPENAI_API_KEY;
}
