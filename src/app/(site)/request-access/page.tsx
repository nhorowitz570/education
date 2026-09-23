import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequestAccess } from '@/components/site/request-access';
export const metadata: Metadata = {
  title: 'Request access · Fieldwork',
  description: 'Fieldwork is private for now. Tell me you’re interested.',
};
// The form reads ?email= from the landing page's hand-off.
export default function RequestAccessPage() {
  return (
    <Suspense>
      <RequestAccess />
    </Suspense>
  );
}
