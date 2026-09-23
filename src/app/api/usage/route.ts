import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
import { adminClient } from '@/lib/supabase/server';
import { aiEnv } from '@/lib/ai/env';

// This month's AI usage by model tier. Informational: the app is unmetered
// unless AI_MONTHLY_LIMIT_USD is configured.
export async function GET(r: Request) {
  try {
    const { user } = await context(r);
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const { data } = await adminClient()
      .from('ai_calls')
      .select('tier,model,cost_usd,ok,cached_tokens,input_tokens')
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString());
    const env = aiEnv();
    const byTier: Record<string, { calls: number; usd: number }> = {};
    let cached = 0,
      input = 0;
    for (const row of data || []) {
      const t = (byTier[row.tier] ??= { calls: 0, usd: 0 });
      t.calls++;
      t.usd += Number(row.cost_usd);
      cached += row.cached_tokens || 0;
      input += row.input_tokens || 0;
    }
    return NextResponse.json({
      total: Object.values(byTier).reduce((s, t) => s + t.usd, 0),
      byTier,
      cacheRate: input ? cached / input : 0,
      limit: env.AI_MONTHLY_LIMIT_USD ?? null,
      models: { fast: env.AI_MODEL_FAST, primary: env.AI_MODEL_PRIMARY, reasoning: env.AI_MODEL_REASONING, voice: env.OPENAI_VOICE_MODEL },
    });
  } catch (e) {
    return fail(e);
  }
}
