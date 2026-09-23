import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { shareCard } from '@/lib/server/shares';

// The shared card as a 1200×630 image: the link preview, and the file behind
// "Download as image". Dark, the app's own type, one hue for the track.
const HUE: Record<string, string> = {
  finance: '#5fe0a4',
  communication: '#f3b862',
  judgment: '#a898ff',
  review: '#7cc4ff',
  life: '#ff8f70',
  explore: '#a4a3a8',
};
const font = (file: string) => readFile(join(process.cwd(), 'assets/fonts', file));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export async function GET(_r: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await shareCard(token);
  if (!share) return new Response('Not found', { status: 404 });
  const { card } = share;
  const hue = HUE[card.track] || '#f2f1ed';
  const [serif, serifItalic, sans, sansMedium] = await Promise.all([
    font('newsreader-latin-400-normal.woff'),
    font('newsreader-latin-400-italic.woff'),
    font('instrument-sans-latin-400-normal.woff'),
    font('instrument-sans-latin-500-normal.woff'),
  ]);
  const body = card.words || card.summary || card.explanation?.replace(/[*_`>#]/g, '') || '';
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 84px',
          background: `radial-gradient(90% 70% at 85% -10%, ${hue}22, transparent 60%), #0b0b0c`,
          color: '#f2f1ed',
          fontFamily: 'Instrument Sans',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: '#a4a3a8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <div style={{ width: 12, height: 12, borderRadius: 12, background: hue }} />
          {card.trackTitle}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontFamily: 'Newsreader', fontSize: card.title.length > 38 ? 68 : 84, lineHeight: 1.02, letterSpacing: '-0.02em' }}>
            {clip(card.title, 70)}
          </div>
          {body && (
            <div
              style={{
                display: 'flex',
                fontFamily: card.words ? 'Newsreader' : 'Instrument Sans',
                fontStyle: card.words ? 'italic' : 'normal',
                fontSize: 32,
                lineHeight: 1.4,
                color: '#c9c8cc',
                paddingLeft: card.words ? 26 : 0,
                borderLeft: card.words ? `3px solid ${hue}` : 'none',
              }}
            >
              {card.words ? `“${clip(body, 170)}”` : clip(body, 190)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 24, color: '#8d8c92' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#f2f1ed', fontWeight: 500 }}>
            <svg width="36" height="36" viewBox="0 0 28 28">
              <rect width="28" height="28" rx="8" fill="#1d1d20" />
              {[0, 1, 2].flatMap((r) =>
                [0, 1, 2].map((c) => (
                  <circle key={`${c}${r}`} cx={8 + c * 6} cy={8 + r * 6} r={c === 2 && r === 0 ? 2.1 : 1.35} fill={c === 2 && r === 0 ? '#f2f1ed' : 'rgba(242,241,237,.28)'} />
                )),
              )}
            </svg>
            Fieldwork
          </div>
          <div style={{ display: 'flex' }}>{card.name ? `From ${card.name}’s notebook` : 'From a Fieldwork notebook'}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Newsreader', data: serif, style: 'normal', weight: 400 },
        { name: 'Newsreader', data: serifItalic, style: 'italic', weight: 400 },
        { name: 'Instrument Sans', data: sans, style: 'normal', weight: 400 },
        { name: 'Instrument Sans', data: sansMedium, style: 'normal', weight: 500 },
      ],
      headers: { 'Cache-Control': 'private, max-age=300' },
    },
  );
}
