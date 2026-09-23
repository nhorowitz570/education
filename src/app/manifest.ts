import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/brand';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'A private tutor that runs each session and remembers how you learn.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#09090a',
    theme_color: '#09090a',
    orientation: 'any',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
