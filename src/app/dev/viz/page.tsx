import { notFound } from 'next/navigation';
// viz.css is imported here for standalone verification; the root layout can own it.
import '@/styles/viz.css';
import './dev.css';
import { Showcase } from './showcase';

export const metadata = { title: 'Visuals · Dev' };

export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Showcase />;
}
