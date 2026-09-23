import { Pixelify_Sans, Silkscreen } from 'next/font/google';
import { Venture } from '@/components/venture/venture';

const display = Silkscreen({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-pixel', display: 'swap' });
const body = Pixelify_Sans({ subsets: ['latin'], variable: '--font-pixel-body', display: 'swap' });

export const metadata = { title: 'Venture · Fieldwork' };

export default function VenturePage() {
  return (
    <div className={`page venture-root ${display.variable} ${body.variable}`}>
      <Venture />
    </div>
  );
}
