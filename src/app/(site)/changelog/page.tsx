import type { Metadata } from 'next';
import { Changelog } from '@/components/site/changelog';
export const metadata: Metadata = {
  title: 'Changelog · Fieldwork',
  description: 'Everything that’s changed in Fieldwork, as it ships.',
};
export default function ChangelogPage() {
  return <Changelog />;
}
