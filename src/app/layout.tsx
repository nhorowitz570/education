import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Atkinson_Hyperlegible, IBM_Plex_Mono, Instrument_Sans, Newsreader } from 'next/font/google';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/400-italic.css';
import '@fontsource/opendyslexic/700.css';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/shell.css';
import '@/styles/screens.css';
import '@/styles/session.css';
import '@/styles/viz.css';
import '@/styles/insights.css';
import '@/styles/tutor.css';
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
// Small labels only: dates, counts, the brief's number.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
// Only downloaded when chosen under You → Reading.
const hyper = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-hyper',
  display: 'swap',
  preload: false,
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
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${hyper.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Apply the saved theme and reading choices before hydration so there is no flash. */}
        <Script id="theme" strategy="beforeInteractive">
          {
            "try{var d=document.documentElement.dataset,t=localStorage.getItem('fieldwork-theme');if(t==='dark'||t==='light'){d.theme=t}var r=JSON.parse(localStorage.getItem('fieldwork-reading')||'{}');if(r.appFont&&r.appFont!=='sans')d.appFont=r.appFont;if(r.lessonFont&&r.lessonFont!=='serif')d.lessonFont=r.lessonFont;if(r.size&&r.size!=='m')d.textSize=r.size;if(r.width&&r.width!=='normal')d.line=r.width;if(r.motion&&r.motion!=='system')d.motion=r.motion}catch(e){}"
          }
        </Script>
        {children}
      </body>
    </html>
  );
}
