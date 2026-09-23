import type { Metadata } from 'next';
import { HowItWorks } from '@/components/site/how-it-works';
export const metadata: Metadata = {
  title: 'How it works · Fieldwork',
  description: 'Eleven systems wake up every morning to teach one person. Here is what each one does.',
};
export default function HowItWorksPage() {
  return <HowItWorks />;
}
