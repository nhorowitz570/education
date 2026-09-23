import type { Metadata } from 'next';
import { Landing } from '@/components/site/landing';
export const metadata: Metadata = {
  title: 'Fieldwork · Learning that remembers you',
  description:
    'A private tutor that runs your curriculum every morning, learns how you think, and brings each idea back right before it fades.',
};
export default function Welcome() {
  return <Landing />;
}
