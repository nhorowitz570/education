import type { CSSProperties } from 'react';
const paths: Record<string, string> = {
  home: 'm3 10 9-7 9 7v10H3zM9 20v-7h6v7',
  book: 'M3 4h6c2 0 3 1 3 3v14c0-2-1-3-3-3H3zM21 4h-6c-2 0-3 1-3 3v14c0-2 1-3 3-3h6z',
  growth: 'M3 9v6M6 6v12M6 12h12M18 6v12M21 9v6',
  progress: 'M4 20v-7M10 20V8M16 20V3M3 20h18',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  check: 'm5 12 4 4L19 6',
  chevron: 'm9 5 7 7-7 7',
  down: 'm6 9 6 6 6-6',
  close: 'm6 6 12 12M18 6 6 18',
  calendar: 'M4 5h16v16H4zM8 2v6M16 2v6M4 10h16',
  finance: 'M3 6h18v15H3zM8 6V3h8v3M3 12h18M10 12v3h4v-3',
  mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8',
  upload: 'M12 16V3M7 8l5-5 5 5M4 15v6h16v-6',
  bell: 'M5 17h14l-2-4V8a5 5 0 0 0-10 0v5zM10 21h4',
  play: 'm8 4 12 8-12 8z',
  pause: 'M8 4v16M16 4v16',
  chat: 'M3 4h18v13H8l-5 4z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  leaf: 'M4 20C3 8 9 3 21 3c0 12-5 18-17 17M4 20l11-11',
  settings: 'M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2z',
  logout: 'M9 3H3v18h6M10 12h11M16 7l5 5-5 5',
  link: 'm9 14 6-6M7 16l-2 2a4 4 0 0 1-5-5l5-5M17 8l2-2a4 4 0 0 0-5-5l-5 5',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
};
export function Icon({
  name,
  size = 22,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d={paths[name] || paths.book} />
      {name === 'sun' && <circle cx="12" cy="12" r="5" />}
      {name === 'settings' && <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
