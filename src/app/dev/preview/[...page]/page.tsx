import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Screen } from '../preview';

export default async function Page({ params }: { params: Promise<{ page: string[] }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { page } = await params;
  return (
    <Suspense>
      <Screen path={page} />
    </Suspense>
  );
}
