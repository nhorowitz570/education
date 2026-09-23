'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { BEAT_LABEL } from './beat';
import type { RunView } from '@/lib/learning/run';

type Mastery = {
  concepts: { key: string; title: string; track: string; strength: number; level: string; before?: number }[];
};

// The end of a session: what moved, what was shown, what happens next.
export function Complete({ run }: { run: RunView }) {
  const [mastery, setMastery] = useState<Mastery | null>(null);
  const keys = [...new Set(run.beats.map((b) => b.concept).filter(Boolean))] as string[];
  useEffect(() => {
    if (!keys.length) return;
    void api<Mastery>(`/api/mastery?concepts=${encodeURIComponent(keys.join(','))}&run=${run.id}`)
      .then(setMastery)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);
  const graded = run.beats.filter((b) => b.feedback);
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(run.started_at)) / 60000));
  const produced = run.beats.find((b) => b.type === 'produce' && b.response?.text);
  const track = run.session?.subject || 'general';
  return (
    <div className={'complete t-' + track}>
      <div className="complete-inner stagger">
        <div className="complete-mark" aria-hidden="true">
          <Icon name="check" size={28} strokeWidth={2} />
        </div>
        <p className="eyebrow">{run.kind === 'review' ? 'Review done' : run.kind === 'explore' ? 'Exploration done' : 'Session complete'}</p>
        <h1 className="display">{run.title}</h1>
        <div className="complete-stats">
          <div>
            <b className="num">{minutes}</b>
            <span>minutes</span>
          </div>
          <div>
            <b className="num">{run.beats.filter((b) => b.status === 'done').length}</b>
            <span>steps</span>
          </div>
          <div>
            <b className="num">{graded.filter((b) => b.feedback!.verdict === 'solid').length}/{graded.length}</b>
            <span>solid answers</span>
          </div>
        </div>

        {mastery && mastery.concepts.length > 0 && (
          <section className="complete-section">
            <p className="eyebrow">What moved</p>
            <div className="rows">
              {mastery.concepts.map((c) => (
                <div className={'row t-' + c.track} key={c.key}>
                  <div className="grow">
                    <p>{c.title}</p>
                    <div className="meter complete-meter" aria-label={`${Math.round(c.strength * 100)}% recall strength`}>
                      {c.before !== undefined && <i className="before" style={{ '--v': c.before } as React.CSSProperties} />}
                      <i style={{ '--v': c.strength } as React.CSSProperties} />
                    </div>
                  </div>
                  <span className="label">{c.level}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {graded.length > 0 && (
          <section className="complete-section">
            <p className="eyebrow">What you showed</p>
            <div className="rows">
              {graded.map((b) => (
                <div className="row" key={b.id}>
                  <i className={'dot v-' + b.feedback!.verdict} />
                  <div className="grow">
                    <p>{BEAT_LABEL[b.type]}</p>
                    <p className="sub">
                      {(b.feedback!.blocks.find((x) => x.type === 'text') as { md?: string } | undefined)?.md?.split(/(?<=[.!?])\s/)[0]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {produced && (
          <section className="complete-section">
            <p className="eyebrow">Saved to your evidence</p>
            <blockquote className="your-answer">
              <p>{produced.response!.text}</p>
            </blockquote>
          </section>
        )}

        <div className="complete-actions">
          <Link href="/" className="btn primary large">
            Back to Today
          </Link>
          <Link href="/mastery" className="btn quiet large">
            See your progress
          </Link>
        </div>
        <p className="label">Anything worth keeping from today has been added to what Fieldwork knows about how you learn.</p>
      </div>
    </div>
  );
}
