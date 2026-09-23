'use client';
import { useState } from 'react';
import { useCached } from '@/lib/client/cached';
import { useApp } from '@/components/app/provider';
import { Icon } from '@/components/icons';
import { CountUp, Sheet } from '@/components/ui';
import { levelOf, type Progress } from '@/lib/gamify';
import { anyGame } from '@/lib/prefs';

export function useProgress() {
  const { user } = useApp();
  return useCached<Progress>('/api/progress', user.id);
}

// Level, streak and today's quests in one quiet line. The detail (XP, quests,
// badges) opens in a sheet.
export function ProgressStrip({ progress }: { progress: Progress }) {
  const [open, setOpen] = useState(false);
  const { prefs } = useApp();
  const g = prefs.game;
  const p = progress;
  const done = p.quests.filter((q) => q.done).length;
  // Every part can be turned off under You → Game elements; with all of
  // them off the strip isn't shown at all.
  if (!anyGame(prefs)) return null;
  const said = [
    g.xp && `Level ${p.level}`,
    g.streak && `${p.streak.current}-${p.streak.unit} streak`,
    g.quests && `${done} of ${p.quests.length} quests done`,
  ].filter(Boolean);
  return (
    <>
      <button className="xp-strip" onClick={() => setOpen(true)} aria-label={`${said.join(', ')}. Show details`}>
        {g.xp ? (
          <>
            <LevelRing level={p.level} fill={p.into / p.span} size={40} />
            <span className="grow">
              <b>{p.rank}</b>
              <span className="label num">{p.todayXp > 0 ? `+${p.todayXp} XP today` : `${(p.next - p.xp).toLocaleString()} XP to level ${p.level + 1}`}</span>
            </span>
          </>
        ) : (
          <span className="grow">
            <b>{g.quests ? 'Today’s quests' : 'Your streak'}</b>
          </span>
        )}
        {g.quests && (
          <span className="xp-quests" aria-hidden="true">
            <span className="quest-pips">
              {p.quests.map((q) => (
                <i key={q.id} className={q.done ? 'on' : ''} />
              ))}
            </span>
            <span className="label num">
              {done}/{p.quests.length}
            </span>
          </span>
        )}
        {g.streak && <Streak n={p.streak.current} lit={p.streak.todayDone} unit={p.streak.unit} />}
      </button>
      {open && <ProgressSheet progress={p} onClose={() => setOpen(false)} />}
    </>
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

export function Streak({ n, lit, unit = 'day' }: { n: number; lit: boolean; unit?: 'day' | 'week' }) {
  return (
    <span
      className={'streak' + (lit ? ' lit' : '')}
      aria-label={`${n}-${unit} streak${lit ? '' : ', not yet extended today'}`}
      title={unit === 'week' ? `${n} week${n === 1 ? '' : 's'} in a row` : `${n} day${n === 1 ? '' : 's'} in a row`}
    >
      <Icon name="flame" size={20} />
      <b className="num">{n}</b>
      {unit === 'week' && <small className="streak-unit">wk</small>}
    </span>
  );
}

function ProgressSheet({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  const { prefs } = useApp();
  const g = prefs.game;
  const p = progress;
  const earned = p.badges.filter((b) => b.earned).length;
  const done = p.quests.filter((q) => q.done).length;
  return (
    <Sheet
      title={g.xp ? `Level ${p.level} · ${p.rank}` : 'Progress'}
      subtitle={g.xp ? `${p.xp.toLocaleString()} XP · ${(p.next - p.xp).toLocaleString()} to level ${p.level + 1}` : undefined}
      onClose={onClose}
    >
      {g.xp && (
        <div className="xp-bar" style={{ '--p': p.into / p.span } as React.CSSProperties}>
          <i />
        </div>
      )}
      {g.quests && (
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
          <p className="label">{done === p.quests.length ? 'All three done: +30 XP bonus.' : 'All three earn a +30 XP bonus.'}</p>
        </div>
      )}
      <p className="eyebrow">
        Badges <span className="num faint">{earned}/{p.badges.length}</span>
      </p>
      <div className="badge-grid">
        {p.badges.map((b) => (
          <div key={b.id} className={'badge' + (b.earned ? ' earned' : '')}>
            <span className="badge-mark" aria-hidden="true">
              <Icon name={b.earned ? 'star' : 'key'} size={18} />
            </span>
            <p>{b.label}</p>
            <p className="label">{b.detail}</p>
          </div>
        ))}
      </div>
      {g.streak && (
        <p className="label">
          {p.streak.unit === 'week' ? (
            <>
              Best streak: <span className="num">{p.streak.best}</span> weeks. A week counts once you’ve learned on two days of it; a week away never breaks it.
            </>
          ) : (
            <>
              Best streak: <span className="num">{p.streak.best}</span> learning days. Days without a planned session never break a streak.
            </>
          )}
        </p>
      )}
      <p className="label">Choose which of these appear under You → Game elements.</p>
    </Sheet>
  );
}

// The end of a session: XP counted up into the level bar.
export function SessionReward({ earned, progress }: { earned: number; progress: Progress | null }) {
  const { prefs } = useApp();
  if (!progress || !prefs.game.xp) return null;
  const before = levelOf(Math.max(0, progress.xp - earned));
  const levelled = before.level < progress.level;
  return (
    <section className="reward" aria-label={`${earned} XP earned`}>
      <LevelRing level={progress.level} fill={progress.into / progress.span} size={60} />
      <div className="grow">
        <p className="reward-xp num">
          +<CountUp to={earned} delay={250} /> XP
        </p>
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
      {prefs.game.streak && <Streak n={progress.streak.current} lit={progress.streak.todayDone} unit={progress.streak.unit} />}
    </section>
  );
}
