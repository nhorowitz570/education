'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/icons';
import { BEAT_LABEL } from './beat';
import type { RunView } from '@/lib/learning/run';
import { XP, sessionXp, type Progress } from '@/lib/gamify';
import { SessionReward } from '@/components/progress/progress';
import { CountUp } from '@/components/ui';
import { play } from '@/lib/client/sound';

type Mastery = {
  concepts: { key: string; title: string; track: string; strength: number; level: string; before?: number }[];
};

// The end of a session: what moved, what was shown, what happens next.
export function Complete({ run, fresh = false }: { run: RunView; fresh?: boolean }) {
  const [mastery, setMastery] = useState<Mastery | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    void api<Progress>('/api/progress')
      .then(setProgress)
      .catch(() => {});
  }, [run.id]);
  const earned = sessionXp(run.beats) + (XP.finish[run.kind] || 0);
  const keys = [...new Set(run.beats.map((b) => b.concept).filter(Boolean))] as string[];
  useEffect(() => {
    if (!keys.length) return;
    void api<Mastery>(`/api/mastery?concepts=${encodeURIComponent(keys.join(','))}&run=${run.id}`)
      .then(setMastery)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);
  const graded = run.beats.filter((b) => b.feedback);
  // Active time, so a session opened in the morning and finished at night
  // still shows the minutes actually spent on it.
  const minutes = Math.max(1, Math.round(run.elapsed ?? 0));
  const produced = run.beats.find((b) => b.type === 'produce' && b.response?.text);
  const track = run.session?.subject || 'general';
  useEffect(() => {
    if (fresh) play('complete');
  }, [fresh]);
  const n = (to: number, i: number) => (fresh ? <CountUp to={to} delay={300 + i * 120} /> : to);
  return (
    <div className={'complete t-' + track}>
      <div className="complete-inner stagger">
        <div className="complete-mark" aria-hidden="true">
          <Icon name="check" size={28} strokeWidth={2} />
        </div>
        <p className="eyebrow">
          {run.kind === 'review'
            ? 'Review done'
            : run.kind === 'explore'
              ? 'Exploration done'
              : run.kind === 'rehearsal'
                ? 'Rehearsal done'
                : 'Session complete'}
        </p>
        <h1 className="display">{run.title}</h1>
        <SessionReward earned={earned} progress={progress} />
        <div className="complete-stats">
          <div>
            <b className="num">{n(minutes, 0)}</b>
            <span>minutes</span>
          </div>
          <div>
            <b className="num">{n(run.beats.filter((b) => b.status === 'done').length, 1)}</b>
            <span>steps</span>
          </div>
          <div>
            <b className="num">
              {n(graded.filter((b) => b.feedback!.verdict === 'solid').length, 2)}/{graded.length}
            </b>
            <span>solid answers</span>
          </div>
        </div>

        {mastery && mastery.concepts.length > 0 && (
          <section className="complete-section">
            <p className="eyebrow">What moved · open any in your Notebook</p>
            <div className="rows">
              {mastery.concepts.map((c, i) => {
                const delta = c.before !== undefined ? Math.round((c.strength - c.before) * 100) : null;
                return (
                  <Link className={'row t-' + c.track} key={c.key} href={`/notebook?e=${encodeURIComponent(c.key)}`}>
                    <div className="grow">
                      <p>{c.title}</p>
                      <div
                        className="meter complete-meter"
                        aria-label={`${Math.round(c.strength * 100)}% recall strength${delta !== null ? `, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} points` : ''}`}
                      >
                        {c.before !== undefined && <i className="before" style={{ '--v': c.before } as React.CSSProperties} />}
                        <i
                          style={
                            { '--v': c.strength, '--from': c.before ?? 0, animationDelay: `${450 + i * 120}ms` } as React.CSSProperties
                          }
                        />
                      </div>
                    </div>
                    {delta !== null && delta !== 0 && (
                      <span className={'complete-delta num' + (delta < 0 ? ' down' : '')}>
                        {delta > 0 ? '+' : '−'}
                        {Math.abs(delta)}
                      </span>
                    )}
                    <span className="label">{c.level}</span>
                    <Icon name="chevron" size={16} />
                  </Link>
                );
              })}
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
