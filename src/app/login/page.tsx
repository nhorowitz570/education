import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { configured, serverClient } from '@/lib/supabase/server';
import { Login } from '@/components/entry/login';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in · Fieldwork' };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (configured()) {
    const { data } = await (await serverClient()).auth.getUser();
    if (data.user) redirect('/');
  }
  return <Login linkError={(await searchParams).error === 'link'} />;
}
