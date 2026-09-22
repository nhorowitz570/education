import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/dm-sans';
import './globals.css';
export const metadata: Metadata = {
  title: 'Fieldwork · Education & growth',
  description:
    'One useful next step. A private space for learning, practice, and growth.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Fieldwork' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBF8F4' },
    { media: '(prefers-color-scheme: dark)', color: '#242326' },
  ],
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
