import { PracticeRoom } from '@/components/practice/room';
export default async function PracticeRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PracticeRoom id={id} />;
}
