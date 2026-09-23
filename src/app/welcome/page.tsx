import type { Metadata } from 'next';
import { Landing } from '@/components/entry/landing';
export const metadata: Metadata = { title: 'Fieldwork · The way I learn' };
export const dynamic = 'force-dynamic';
export default function Welcome() {
  return <Landing />;
}
