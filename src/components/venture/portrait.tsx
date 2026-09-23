'use client';
import { useEffect, useRef } from 'react';
import { sprite } from './pixel';

// Marta, the company's accountant, who reads the books and brings the news.
const MARTA = [
  '...hhhhhh...',
  '..hhhhhhhh..',
  '.hhssssssh..',
  '.hssssssssh.',
  '.hsgsssgssh.',
  '.hsgsssgssh.',
  '.hssssssssh.',
  '..ssssmssh..',
  '...ssssss...',
  '..cccwwccc..',
  '.cccccwcccc.',
  'cccccccccccc',
];
const PAL = { h: '#3b2a24', s: '#e2b08c', g: '#1b1b1f', m: '#b0584a', c: '#3f6fb0', w: '#f3f1ea' };

export function Portrait({ size = 48 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    c.width = 12;
    c.height = 12;
    ctx.clearRect(0, 0, 12, 12);
    sprite(ctx, MARTA, 0, 0, PAL);
  }, []);
  return <canvas ref={ref} className="px-portrait" style={{ width: size, height: size }} aria-hidden="true" />;
}
