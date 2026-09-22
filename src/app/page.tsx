import { configured, serverClient } from '@/lib/supabase/server';
import { aiConfigured } from '@/lib/server/ai';
import { App } from '@/components/app';
import { Landing } from '@/components/entry/landing';
import type { AppConfig } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let user: { id: string; email?: string } | null = null;
  if (configured()) {
    const client = await serverClient();
    const { data } = await client.auth.getUser();
    user = data.user;
  }
  const demo = query.preview === '1';
  const config: AppConfig = {
    supabase: configured(),
    backend: !!process.env.SUPABASE_SECRET_KEY,
    ai: aiConfigured(),
    voice: !!process.env.OPENAI_API_KEY,
    voiceProvider: process.env.VOICE_PROVIDER || 'live',
    calendar:
      !!process.env.GOOGLE_CLIENT_ID &&
      !!process.env.GOOGLE_CLIENT_SECRET &&
      !!process.env.TOKEN_ENCRYPTION_KEY,
    push:
      !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      !!process.env.VAPID_PRIVATE_KEY,
    demo,
  };
  if (!user && !demo) return <Landing />;
  return (
    <App
      config={config}
      user={user ? { id: user.id, email: user.email } : null}
    />
  );
}
