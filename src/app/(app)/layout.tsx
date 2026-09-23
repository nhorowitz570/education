import { redirect } from 'next/navigation';
import { configured, serverClient } from '@/lib/supabase/server';
import { aiReady, voiceReady } from '@/lib/ai/env';
import { AppProvider } from '@/components/app/provider';
import { Shell } from '@/components/app/shell';
import type { AppConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!configured()) redirect('/welcome');
  const { data } = await (await serverClient()).auth.getUser();
  if (!data.user) redirect('/welcome');
  const config: AppConfig = {
    supabase: true,
    backend: !!process.env.SUPABASE_SECRET_KEY,
    ai: aiReady(),
    voice: voiceReady(),
    voiceProvider: process.env.VOICE_PROVIDER || 'live',
    push: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
    demo: false,
  };
  return (
    <AppProvider user={{ id: data.user.id, email: data.user.email }} config={config}>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
