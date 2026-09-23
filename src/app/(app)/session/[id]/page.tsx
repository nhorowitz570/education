import { Runner } from '@/components/session/runner';
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Runner id={id} />;
}
