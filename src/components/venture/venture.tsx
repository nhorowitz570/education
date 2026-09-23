'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import type { View } from './game';
import '@/styles/venture.css';

// The game is its own bundle, loaded fresh each time Venture opens and
// dropped when you leave, so it never weighs on the rest of the app.
const Game = dynamic(() => import('./game'), { ssr: false });

const TIPS = [
  'Profit is an opinion; cash is a fact.',
  'Revenue counts when it’s earned. Cash counts when it arrives.',
  'Every sale has to cover its own cost before it pays the rent.',
  'Unserved customers don’t come back for long.',
  'A tired team is a slower team.',
  'Buying stock turns cash into something that might sell.',
  'Debt buys time. Interest is the price.',
];
const MIN_MS = 1400;

export function Venture() {
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  // Picked after hydration, so server and client render the same first frame.
  const [tip, setTip] = useState(TIPS[0]);
  useEffect(() => setTip(TIPS[Math.floor(Math.random() * TIPS.length)]), []);

  useEffect(() => {
    let alive = true;
    const started = Date.now();
    const steps = [
      import('./game').then(() => alive && setProgress((p) => p + 1)),
      api<View>('/api/venture').then((d) => {
        if (!alive) return;
        setData(d);
        setProgress((p) => p + 1);
      }),
      document.fonts?.ready.then(() => alive && setProgress((p) => p + 1)),
    ];
    Promise.all(steps)
      .then(() => new Promise((ok) => setTimeout(ok, Math.max(0, MIN_MS - (Date.now() - started)))))
      .then(() => alive && setReady(true))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);

  if (ready && data) return <Game initial={data} />;
  return <Loading progress={progress / 3} tip={tip} error={error} />;
}

function Loading({ progress, tip, error }: { progress: number; tip: string; error: string }) {
  // The bar creeps while waiting, so it never looks stuck.
  const [creep, setCreep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCreep((c) => Math.min(0.3, c + 0.02)), 120);
    return () => clearInterval(t);
  }, []);
  const shown = Math.min(1, progress * 0.7 + creep);
  const cells = 20;
  return (
    <div className="vl" role="status" aria-live="polite" aria-label={error ? 'Venture couldn’t load' : 'Loading Venture'}>
      <div className="vl-inner">
        <p className="px-font vl-logo">Venture</p>
        <div className="vl-walker" aria-hidden="true">
          <i />
        </div>
        {error ? (
          <>
            <p className="vl-tip">Venture couldn’t load: {error}</p>
            <button className="px-btn primary" onClick={() => location.reload()}>
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="vl-bar" aria-hidden="true">
              {Array.from({ length: cells }, (_, i) => (
                <i key={i} className={i < Math.round(shown * cells) ? 'on' : ''} />
              ))}
            </div>
            <p className="px-font vl-state">{progress < 1 ? 'Opening the books…' : 'Unlocking the door…'}</p>
            <p className="vl-tip">{tip}</p>
          </>
        )}
      </div>
    </div>
  );
}
