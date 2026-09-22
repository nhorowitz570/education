import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { emptyState, type AppState, type Attempt } from '@/lib/types';
export async function readState(userId: string): Promise<AppState> {
  const db = adminClient();
  const [{ data, error }, { data: attempts, error: ae }] = await Promise.all([
    db
      .from('workspaces')
      .select('data,revision,active_plan_version')
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('attempts')
      .select('data')
      .eq('user_id', userId)
      .order('completed_at'),
  ]);
  if (error || ae)
    throw new Error(
      'Your workspace could not be loaded. Check the backend migration.',
    );
  return {
    ...emptyState,
    ...data?.data,
    attempts: (attempts || [])
      .map((a) => a.data as Attempt)
      .filter((a) => !a.plan_id || a.plan_id === data?.data?.plan?.plan_id),
    revision: Number(data?.revision || 0),
    planVersionId: data?.active_plan_version || undefined,
  };
}
export async function commit(
  userId: string,
  state: AppState,
  eventId: string,
  attempt?: Attempt,
  planVersionId?: string,
) {
  const { data, error } = await adminClient().rpc('commit_workspace', {
    p_user_id: userId,
    p_expected: state.revision,
    p_next: state,
    p_event_id: eventId,
    p_attempt: attempt || null,
    p_plan_version: planVersionId || null,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
export async function mutate(
  userId: string,
  eventId: string,
  change: (state: AppState) => AppState | Promise<AppState>,
  attempt?: Attempt,
  planVersionId?: string,
) {
  for (let retry = 0; retry < 4; retry++) {
    const current = await readState(userId);
    const next = await change(current);
    if (await commit(userId, next, eventId, attempt, planVersionId))
      return readState(userId);
  }
  throw new Error(
    'Another device made a change. Please retry; your draft is safe.',
  );
}
export async function privateRows<T = Record<string, unknown>>(
  table: string,
  userId?: string,
): Promise<T[]> {
  const { data, error } = await adminClient().rpc('private_read', {
    p_table: table,
    p_user_id: userId || null,
  });
  if (error) throw new Error(error.message);
  return data as T[];
}
export async function privatePut(table: string, row: Record<string, unknown>) {
  const { data, error } = await adminClient().rpc('private_put', {
    p_table: table,
    p_row: row,
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function privateDelete(
  table: string,
  userId: string,
  key?: string,
) {
  const { error } = await adminClient().rpc('private_delete', {
    p_table: table,
    p_user_id: userId,
    p_key: key || null,
  });
  if (error) throw new Error(error.message);
}
