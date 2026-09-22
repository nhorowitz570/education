import type { Metadata } from 'next';
import { Confirm } from '@/components/entry/confirm';
export const metadata: Metadata = { title: 'Signing in · Fieldwork' };
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams,
    one = (v: string | string[] | undefined) =>
      typeof v === 'string' ? v : '';
  return <Confirm tokenHash={one(q.token_hash)} type={one(q.type)} />;
}
