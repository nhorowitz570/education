'use client';
import { ImportView } from '@/components/import';
import { useViewProps } from '@/components/app/legacy';
export default function ImportPage() {
  const p = useViewProps();
  return (
    <div className="page narrow legacy">
      <ImportView {...p} />
    </div>
  );
}
