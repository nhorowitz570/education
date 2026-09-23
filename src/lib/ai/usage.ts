import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { aiEnv, type Tier } from './env';

export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number } | null;
  output_tokens_details?: { reasoning_tokens?: number } | null;
} | null | undefined;

export function costOf(tier: Tier, usage: Usage) {
  const p = aiEnv().prices[tier],
    input = usage?.input_tokens || 0,
    cachedTokens = usage?.input_tokens_details?.cached_tokens || 0,
    output = usage?.output_tokens || 0;
  return (
    ((input - cachedTokens) * p.input + cachedTokens * p.cached + output * p.output) /
    1e6
  );
}

export async function logCall(row: {
  userId: string | null;
  task: string;
  tier: Tier | 'embedding' | 'voice';
  model: string;
  usage?: Usage;
  cost?: number;
  latency: number;
  ok: boolean;
  error?: string;
}) {
  const u = row.usage;
  const { error } = await adminClient()
    .from('ai_calls')
    .insert({
      user_id: row.userId,
      task: row.task,
      tier: row.tier,
      model: row.model,
      input_tokens: u?.input_tokens || 0,
      cached_tokens: u?.input_tokens_details?.cached_tokens || 0,
      output_tokens: u?.output_tokens || 0,
      reasoning_tokens: u?.output_tokens_details?.reasoning_tokens || 0,
      cost_usd: Number((row.cost ?? 0).toFixed(6)),
      latency_ms: Math.round(row.latency),
      ok: row.ok,
      error: row.error?.slice(0, 500),
    });
  // Accounting must never break learning; surface it in logs only.
  if (error) console.error('ai_calls insert failed:', error.message);
}

const monthly = new Map<string, { at: number; usd: number }>();
export async function monthSpend(userId: string) {
  const hit = monthly.get(userId);
  if (hit && Date.now() - hit.at < 30000) return hit.usd;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await adminClient()
    .from('ai_calls')
    .select('cost_usd')
    .eq('user_id', userId)
    .gte('created_at', start.toISOString());
  const usd = (data || []).reduce((s, r) => s + Number(r.cost_usd), 0);
  monthly.set(userId, { at: Date.now(), usd });
  return usd;
}

// Only active when AI_MONTHLY_LIMIT_USD is configured.
export async function guard(userId: string | null) {
  const limit = aiEnv().AI_MONTHLY_LIMIT_USD;
  if (!limit || !userId) return;
  if ((await monthSpend(userId)) >= limit)
    throw Object.assign(new Error('The monthly AI limit set for this app has been reached.'), {
      status: 429,
    });
}
