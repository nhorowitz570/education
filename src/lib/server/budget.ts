import 'server-only';
import { adminClient } from '@/lib/supabase/server';
export async function reserve(
  userId: string,
  key: string,
  amount: number,
  model: string,
) {
  const { data, error } = await adminClient().rpc('reserve_ai_budget', {
    p_id: crypto.randomUUID(),
    p_user_id: userId,
    p_key: key,
    p_amount: amount,
    // Unmetered unless a limit is configured; reservations still record cost.
    p_user_limit: Number(process.env.AI_MONTHLY_LIMIT_USD || 1e6),
    p_project_limit: Number(process.env.AI_PROJECT_MONTHLY_LIMIT_USD || 1e6),
    p_model: model,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; state: string; existing: boolean };
}
export async function settle(id: string, amount: number, release = false) {
  const { error } = await adminClient().rpc('settle_ai_budget', {
    p_id: id,
    p_amount: amount,
    p_release: release,
  });
  if (error) throw new Error(error.message);
}
export function textCost(
  usage: { input_tokens?: number; output_tokens?: number },
  searchCalls = 0,
) {
  return (
    ((usage.input_tokens || 0) *
      Number(process.env.MODEL_INPUT_USD_PER_MILLION || 0.2)) /
      1e6 +
    ((usage.output_tokens || 0) *
      Number(process.env.MODEL_OUTPUT_USD_PER_MILLION || 1.2)) /
      1e6 +
    searchCalls * 0.01
  );
}
