import { Suspense } from 'react';
import { Notebook } from '@/components/notebook/notebook';
export default function NotebookPage() {
  return (
    <Suspense>
      <Notebook />
    </Suspense>
  );
}
