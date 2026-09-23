import 'server-only';
import { cache } from 'react';
import { adminClient } from '@/lib/supabase/server';
import type { Card } from './notebook';

// A shared card, by its token. Revoked or unknown tokens read as nothing.
// `count` records a view; the image and metadata reads don't.
export const shareCard = cache(async (token: string, count = false): Promise<{ card: Card; created_at: string } | null> => {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = adminClient();
  if (count) {
    const { data } = await db.rpc('view_share', { p_token: token });
    return (data as { card: Card; created_at: string } | null) || null;
  }
  const { data } = await db.from('shares').select('card,created_at').eq('token', token).is('revoked_at', null).maybeSingle();
  return (data as { card: Card; created_at: string } | null) || null;
});
