'use client';
import { useState } from 'react';
import { useCached } from '@/lib/client/cached';
import { useApp } from '@/components/app/provider';
import { Icon } from '@/components/icons';
import { Sheet } from '@/components/ui';
import { levelOf, type Progress } from '@/lib/gamify';

export function useProgress() {
  const { user } = useApp();
  return useCached<Progress>('/api/progress', user.id);
}

// Level, streak and today's quests: the small daily game around learning.
export function ProgressCard({ progress }: { progress: Progress }) {
  const [open, setOpen] = useState(false);
  const p = progress;
  const done = p.quests.filter((q) => q.done).length;
  return (
    <section className="xp-card" aria-label="Level, streak and today’s quests">
      <button className="xp-head" onClick={() => setOpen(true)} aria-label={`Level ${p.level}, ${p.xp} XP. Show badges`}>
        <LevelRing level={p.level} fill={p.into / p.span} />
        <div className="grow">
          <p className="xp-rank">
            {p.rank} <span className="num">· {p.xp.toLocaleString()} XP</span>
          </p>
          <div className="xp-bar" style={{ '--p': p.into / p.span } as React.CSSProperties}>
            <i />
          </div>
          <p className="label num">
            {(p.next - p.xp).toLocaleString()} XP to level {p.level + 1}
            {p.todayXp > 0 ? ` · +${p.todayXp} today` : ''}
          </p>
        </div>
        <Streak n={p.streak.current} lit={p.streak.todayDone} />
      </button>
      <div className="quests">
        <p className="eyebrow">
          Today’s quests <span className="num faint">{done}/{p.quests.length}</span>
        </p>
        {p.quests.map((q) => (
          <div key={q.id} className={'quest' + (q.done ? ' done' : '')}>
            <span className="quest-check" aria-hidden="true">
              {q.done && <Icon name="check" size={13} strokeWidth={2.4} />}
            </span>
            <span className="grow">{q.label}</span>
            {q.target > 1 && !q.done && (
              <span className="label num">
                {q.progress}/{q.target}
              </span>
            )}
            <span className="quest-xp num">+{q.xp}</span>
          </div>
        ))}
        {done === p.quests.length && <p className="label quest-all">All three done: +30 XP bonus.</p>}
      </div>
      {open && <BadgeSheet progress={p} onClose={() => setOpen(false)} />}
    </section>
  );
}

export function LevelRing({ level, fill, size = 52 }: { level: number; fill: number; size?: number }) {
  const r = size / 2 - 4,
    c = 2 * Math.PI * r;
  return (
    <span className="level-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fg"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.02, Math.min(1, fill)))}
        />
      </svg>
      <b className="num">{level}</b>
    </span>
  );
}

export function Streak({ n, lit }: { n: number; lit: boolean }) {
  return (
    <span className={'streak' + (lit ? ' lit' : '')} aria-label={`${n}-day streak${lit ? '' : ', not yet extended today'}`}>
      <Icon name="flame" size={20} />
      <b className="num">{n}</b>
    </span>
  );
}

function BadgeSheet({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  const earned = progress.badges.filter((b) => b.earned).length;
  return (
    <Sheet title={`Level ${progress.level} · ${progress.rank}`} subtitle={`${earned} of ${progress.badges.length} badges`} onClose={onClose}>
      <div className="badge-grid">
        {progress.badges.map((b) => (
          <div key={b.id} className={'badge' + (b.earned ? ' earned' : '')}>
            <span className="badge-mark" aria-hidden="true">
              <Icon name={b.earned ? 'star' : 'key'} size={18} />
            </span>
            <p>{b.label}</p>
            <p className="label">{b.detail}</p>
          </div>
        ))}
      </div>
      <p className="label">
        Best streak: <span className="num">{progress.streak.best}</span> learning days. Days without a planned session never break a streak.
      </p>
    </Sheet>
  );
}

// The end of a session: XP counted up into the level bar.
export function SessionReward({ earned, progress }: { earned: number; progress: Progress | null }) {
  if (!progress) return null;
  const before = levelOf(Math.max(0, progress.xp - earned));
  const levelled = before.level < progress.level;
  return (
    <section className="reward" aria-label={`${earned} XP earned`}>
      <LevelRing level={progress.level} fill={progress.into / progress.span} size={60} />
      <div className="grow">
        <p className="reward-xp num">+{earned} XP</p>
        <div
          className="xp-bar reward-bar"
          style={{ '--p': progress.into / progress.span, '--from': levelled ? 0 : before.into / before.span } as React.CSSProperties}
        >
          <i />
        </div>
        <p className="label">
          {levelled ? `Level up! You’re now level ${progress.level}, ${progress.rank}.` : `Level ${progress.level} · ${progress.next - progress.xp} XP to the next`}
        </p>
      </div>
      <Streak n={progress.streak.current} lit={progress.streak.todayDone} />
    </section>
  );
}
