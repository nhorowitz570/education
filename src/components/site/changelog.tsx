'use client';
import { useState } from 'react';
import { evidenceChart } from './curves';
import s from './site.module.css';

type Kind = 'New' | 'Improved' | 'Fixed';
type Release = {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: [Kind, string][];
  feature?: boolean;
};

// Newest first. Add a release by adding an entry here.
const RELEASES: Release[] = [
  {
    version: '0.7',
    date: 'September 23, 2026',
    title: 'A Notebook that writes itself, and settings that are yours',
    summary:
      'Everything you learn now collects in a Notebook, in your own words. Lessons point back to ideas you already know, and nearly everything about how Fieldwork teaches, reads and nudges can be changed.',
    feature: true,
    changes: [
      ['New', 'The Notebook: every idea you’ve met, with your best explanation of it, the picture that taught it, the questions you asked and your notes. Search it, export it, or recall any idea in one tap.'],
      ['New', 'Share one idea as a card anyone can open by link, or download it as an image. It’s a snapshot, and you can turn the link off at any time.'],
      ['New', 'Notes on any step of a session, or on a passage you select. They go straight to your Notebook.'],
      ['New', 'Lessons underline ideas you learned before. Tap one to see what you said about it last time.'],
      ['New', 'Reading settings: separate fonts for lessons and the app (including OpenDyslexic and Atkinson Hyperlegible), text size and line length.'],
      ['New', 'Hear every practice voice before you choose one, in settings and when you set up a conversation.'],
      ['New', 'Optional sounds for good answers and a finished session. Off unless you turn them on.'],
      ['Improved', 'Settings are grouped by what they change and show their current value: session defaults, your rhythm, each kind of notification, motion and each game element.'],
      ['Improved', 'Starting a session carries its title from Today into the lesson, and the lesson opens on its content.'],
      ['Fixed', 'A session opened in the morning and finished at night no longer claims to have taken all day. Only active time counts.'],
      ['Fixed', 'Greetings, “today” and reminders follow the time zone of the device you’re on.'],
    ],
  },
  {
    version: '0.6',
    date: 'September 23, 2026',
    title: 'Sessions that adapt as you go, and a company to run',
    summary:
      'Sessions now plan themselves one step at a time and fill the time you set aside. New ideas get taught before they get tested. And there’s Venture: a business you run alongside your lessons.',
    feature: true,
    changes: [
      ['New', 'Venture: run a pixel-art coffee roastery, design studio or food truck with real books, where profit and cash disagree just as they do in real life. Months are earned by learning.'],
      ['New', 'Before a new idea, one tap says how familiar it is. Brand-new ideas start with the big picture and a worked example, not a question.'],
      ['New', '“I don’t know yet” is an answer: the tutor teaches it instead of grading it.'],
      ['New', 'Wrap up any session early with a short recap of what you did.'],
      ['New', 'XP, levels, a streak that ignores your days off, three daily quests and badges.'],
      ['Improved', 'Sessions plan each next step from how your answers go and the real clock, so a fast morning goes deeper instead of ending early.'],
      ['Improved', 'Learn shows this week and next; the rest of the plan folds into chapters named for what you’ll be able to do.'],
      ['Improved', 'Mastery starts with what you’ve shown and one next challenge, and unlocks richer charts as your history grows.'],
    ],
  },
  {
    version: '0.5',
    date: 'September 22, 2026',
    title: 'Confidence, rehearsals and a weekly read',
    summary:
      'Sessions got sharper, practice got a replay, and every week now ends with one honest read of how it went.',
    changes: [
      ['New', 'Say how sure you are with each answer. Confident mistakes are caught, and a calibration chart shows how well your certainty matches reality.'],
      ['New', 'Highlight any passage and ask for why, an example, something simpler, or a picture.'],
      ['New', 'Weekly Insights: eight grades, your learning patterns and one thing to focus on, written from what you actually did.'],
      ['New', 'Milestone rehearsals and a portfolio grouped by milestone, exportable as Markdown.'],
      ['New', 'Practice replays with feedback pinned to exact lines, and “Redo from here” to retry one moment.'],
      ['Improved', 'The day’s first step is written before your learning window, so Begin opens straight onto content.'],
      ['Improved', 'Finished steps fold into a one-line trail, a missed answer can be retried once, and breaks remind you when they’re over.'],
      ['Improved', 'A forgetting forecast on the Mastery map: slide ahead to see what fades without review.'],
    ],
  },
  {
    version: '0.4.1',
    date: 'September 22, 2026',
    title: 'Mastery, before you’ve imported anything',
    summary: 'A small one. The mastery page no longer breaks when you open it before your first plan is in.',
    changes: [['Fixed', 'The Mastery page shows a friendly empty state instead of an error when there’s no plan yet.']],
  },
  {
    version: '0.4',
    date: 'September 22, 2026',
    title: 'The rebuild: a tutor that streams, remembers and talks back',
    summary:
      'Fieldwork was rebuilt around three things: a tutor that writes each step as you read it, a model of what you actually know, and spoken practice with a partner who pushes back.',
    feature: true,
    changes: [
      ['New', 'Sessions open instantly. The plan is built in code and each step streams in as it’s written.'],
      ['New', 'A learner model tracks what you know and how well you remember it, idea by idea.'],
      ['New', 'A memory of how you learn, which you can read, pin and delete.'],
      ['New', 'Live voice practice for negotiations, pitches, debates and hard conversations, with feedback that quotes you.'],
      ['New', 'Visuals the tutor can draw on demand: charts, flows, timelines and simulations you can pull on.'],
      ['Improved', 'A new design system with dark and light themes, and a proper mobile tab bar.'],
      ['Improved', 'Importing a plan from Markdown now takes seconds and costs about two cents.'],
    ],
  },
  {
    version: '0.3',
    date: 'September 22, 2026',
    title: 'Private by default',
    summary: 'No passwords, no sign-up form. Accounts are added by hand, and signing in takes one tap.',
    changes: [
      ['New', 'Sign in with an emailed link, or a six-digit code when you’re in the installed app.'],
      ['New', 'Passkeys: add one in Settings and sign in with Face ID or Touch ID next time.'],
      ['New', 'A public landing page, so there’s something to see before you sign in.'],
      ['Fixed', 'Saving from the live site no longer fails with a “different site” error.'],
    ],
  },
  {
    version: '0.2',
    date: 'September 22, 2026',
    title: 'Live on the web',
    summary: 'Fieldwork moved from a laptop to a real address, with a round of polish on the way.',
    changes: [
      ['New', 'Deployed and reachable from any device, with scheduled work running in the background.'],
      ['Improved', 'Tighter spacing, clearer type and calmer colour across every screen.'],
    ],
  },
  {
    version: '0.1',
    date: 'September 21, 2026',
    title: 'First light',
    summary: 'The first working version: an installable app that turns a year-long plan into a morning routine.',
    changes: [
      ['New', 'Import a curriculum and see the whole year laid out, week by week.'],
      ['New', 'A daily session with one clear next step.'],
      ['New', 'Installs to your home screen and works offline for what you’ve already opened.'],
    ],
  },
];

const WORKS = [
  ['Your calendar, respected', 'Sessions that fit around what’s already booked, from read-only free/busy.'],
  ['Passkeys everywhere', 'Sign in with Face ID or Touch ID on every device, no email round trip.'],
  ['Reminders on your phone', 'Morning and end-of-break nudges delivered to the installed app.'],
  ['Room for more people', 'If there’s real interest, a small group gets their own Fieldwork first.'],
];

const TAG: Record<Kind, string> = { New: s.tagNew, Improved: s.tagImproved, Fixed: s.tagFixed };
const mini = evidenceChart(250, 110, 0, 8);

function Strip() {
  return (
    <div className={s.strip} aria-hidden>
      <div className={s.stripPanel}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className={s.miniBeats}>
            <span>Recall</span>
            <span data-now="">Situation</span>
            <span>Explain</span>
          </div>
          <p className={s.voice} style={{ fontSize: 17, lineHeight: 1.4 }}>
            <span className={s.caret}>Profitable on paper, short on cash. The gap is timing, not</span>
          </p>
        </div>
        <span>Streaming tutor</span>
      </div>
      <div className={s.stripPanel}>
        <svg viewBox="0 0 250 110" style={{ width: '100%', height: 110 }}>
          <defs>
            <linearGradient id="mini-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fe0a4" stopOpacity="0.18" />
              <stop offset="1" stopColor="#5fe0a4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={mini.area} fill="url(#mini-fill)" />
          <path d={mini.line} fill="none" stroke="#5fe0a4" strokeWidth="2" strokeLinecap="round" />
          {mini.dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r="3.5" fill={d.kind === 'missed' ? '#ff8a6b' : '#5fe0a4'} />
          ))}
        </svg>
        <span>Learner model</span>
      </div>
      <div className={s.stripPanel}>
        <div className={s.miniWave}>
          {Array.from({ length: 56 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  height: `${(4 + Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.2)) * 84 * Math.sin((Math.PI * i) / 55) ** 1.2).toFixed(1)}px`,
                  '--i': i,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <span>Live voice practice</span>
      </div>
    </div>
  );
}

export function Changelog() {
  const [filter, setFilter] = useState<Kind | 'All'>('All');
  const visible = RELEASES.map((r) => ({
    ...r,
    changes: r.changes.filter(([k]) => filter === 'All' || k === filter),
  })).filter((r) => r.changes.length);
  return (
    <>
      <header className={s.logHead}>
        <div className={s.stack} style={{ gap: 24 }}>
          <h1 className={`${s.display} ${s.logTitle}`}>
            <span className={s.heroLine}>
              <span>Changelog</span>
            </span>
          </h1>
          <p className={s.lede} style={{ maxWidth: '24em' }}>
            Everything that&rsquo;s changed, as it ships. Built in the open, one
            morning at a time.
          </p>
        </div>
        <div className={s.filters} role="group" aria-label="Filter changes">
          {(['All', 'New', 'Improved', 'Fixed'] as const).map((k) => (
            <button key={k} className={s.chip} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k}
            </button>
          ))}
        </div>
      </header>

      <section className={s.works} aria-labelledby="works-title">
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <h2 id="works-title" style={{ fontSize: 15, fontWeight: 500 }}>
            In the works
          </h2>
          <span className={s.small} style={{ fontWeight: 400 }}>
            Being built right now
          </span>
        </div>
        <div className={s.worksGrid}>
          {WORKS.map(([title, text], i) => (
            <div key={title} className={`${s.work} ${s.rv}`} data-reveal style={{ '--d': i } as React.CSSProperties}>
              <b>{title}</b>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={s.releases} aria-label="Releases">
        {visible.map((r) => (
          <article key={r.version} className={`${s.release} ${s.rv}`} data-reveal>
            <div className={s.releaseMeta}>
              <time>{r.date}</time>
              <span>Version {r.version}</span>
            </div>
            <div className={s.releaseBody}>
              <h2 className={`${s.releaseTitle} ${r.feature ? s.releaseBig : ''}`}>{r.title}</h2>
              <p>{r.summary}</p>
              {r.feature && filter === 'All' && <Strip />}
              <ul className={s.changes} key={filter}>
                {r.changes.map(([kind, text]) => (
                  <li key={text}>
                    <span className={`${s.tag} ${TAG[kind]}`}>{kind}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
        {!visible.length && <p className={s.emptyNote}>Nothing in this category yet.</p>}
      </section>
    </>
  );
}
