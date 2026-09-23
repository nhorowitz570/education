import { notFound } from 'next/navigation';
import { Preview } from './preview';

// A dev-only way to look at signed-in screens without an account: the real
// components on a local demo workspace, with the API answered by fixtures.
export const metadata = { title: 'Preview · Dev' };

export default function Layout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Preview>{children}</Preview>;
}
