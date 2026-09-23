import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Instrument_Sans, Newsreader } from 'next/font/google';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/shell.css';
import '@/styles/screens.css';
import '@/styles/session.css';
import '@/styles/viz.css';
import '@/styles/insights.css';
import '@/styles/legacy.css';
const sans = Instrument_Sans({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-sans',
  display: 'swap',
});
const serif = Newsreader({
  subsets: ['latin'],
  axes: ['opsz'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});
export const metadata: Metadata = {
  title: 'Fieldwork',
  description: 'A private learning environment. Access is by invitation.',
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Fieldwork',
  },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#09090a' },
    { media: '(prefers-color-scheme: light)', color: '#f5f4f0' },
  ],
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Apply a saved theme before hydration so there is no flash. */}
        <Script id="theme" strategy="beforeInteractive">
          {"try{var t=localStorage.getItem('fieldwork-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}"}
        </Script>
        {children}
      </body>
    </html>
  );
}
