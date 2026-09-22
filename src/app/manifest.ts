import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fieldwork · Education & growth',
    short_name: 'Fieldwork',
    description: 'One useful next step.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FBF8F4',
    theme_color: '#FBF8F4',
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
