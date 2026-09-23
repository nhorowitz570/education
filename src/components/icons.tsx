import type { CSSProperties } from 'react';

// One grid (24), one stroke (1.6), round joins. Shapes are geometric and
// quiet so they read as part of the interface, not decoration.
const paths: Record<string, string> = {
  today: 'M12 3v2M4.9 5.9l1.4 1.4M3 13h2M19 13h2M17.7 7.3l1.4-1.4M7 17a5 5 0 0 1 10 0M3 21h18',
  learn: 'M5 19c3 0 3-5 7-5s4-8 7-8M5 19a2 2 0 1 0 0 .01M19 6a2 2 0 1 0 0 .01M12 14a1.6 1.6 0 1 0 0 .01',
  practice: 'M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2',
  mastery: 'M6 6.5a1.5 1.5 0 1 0 0 .01M18 5.5a1.5 1.5 0 1 0 0 .01M12 12.5a2 2 0 1 0 0 .01M6 18.5a1.5 1.5 0 1 0 0 .01M18 17.5a1.5 1.5 0 1 0 0 .01M7.2 7.4l3.3 3.6M16.8 6.6l-3.4 4.1M10.4 13.8l-3.2 3.6M13.6 13.7l3.2 2.8',
  life: 'M3 12h4l2-5 4 10 2-5h6',
  you: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c.7-3.9 4-6 8-6s7.3 2.1 8 6',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  back: 'M20 12H5M11 6l-6 6 6 6',
  chevron: 'm9 5 7 7-7 7',
  down: 'm6 9 6 6 6-6',
  up: 'm6 15 6-6 6 6',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12.5 4.2 4.2L19 7',
  plus: 'M12 5v14M5 12h14',
  send: 'M12 19V5M6 11l6-6 6 6',
  stop: 'M7 7h10v10H7z',
  spark: 'M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6zM19 16l.7 2 2 .8-2 .7-.7 2-.7-2-2-.7 2-.8z',
  why: 'M9.2 9a3 3 0 1 1 4.4 2.6c-1 .5-1.6 1.2-1.6 2.4M12 17.5v.01',
  example: 'M4 6h16M4 12h10M4 18h7',
  deeper: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  simpler: 'M5 12h14M5 7h14M5 17h8',
  visual: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  mic: 'M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4',
  micOff: 'M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M18.5 10.5a6.5 6.5 0 0 1-1.1 3.6M5.5 10.5a6.5 6.5 0 0 0 9.9 5.5M12 17v4M3 3l18 18',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M8 5v14M16 5v14',
  key: 'M8 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12h9M18 12v3M15 12v2',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.2 2',
  source: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  pin: 'M9 4h6l-1 5 3 3H7l3-3zM12 12v8',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4',
  calendar: 'M4 6h16v15H4zM8 3v5M16 3v5M4 11h16',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  import: 'M12 3v11M7 9l5 5 5-5M5 21h14',
  memory: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18M12 7v5M12 12l-3.5 3.5M12 12l3.5 2',
  edit: 'M5 19h4L19 9l-4-4L5 15zM13.5 6.5l4 4',
  logout: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  sources: 'M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-5a2 2 0 0 0-2 2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12h.01',
  flame: 'M12 21c4 0 6-2.7 6-6 0-4-3-6-4-9-1.5 2-2 3.5-2 5-1.5-1-2-2.5-2-4C7 9 6 11.5 6 15c0 3.3 2 6 6 6',
  wave: 'M2 12c2 0 2-5 4-5s2 10 4 10 2-14 4-14 2 14 4 14 2-10 4-10',
};

export function Icon({
  name,
  size = 20,
  style,
  className,
  strokeWidth = 1.6,
}: {
  name: keyof typeof paths | string;
  size?: number;
  style?: CSSProperties;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  );
}
