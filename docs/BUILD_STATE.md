# Build state

September 23, 2026.

- **Learning engine:** instant session outlines, streamed beats, a BKT and forgetting-curve learner model, a concept graph mapped by Astra, a memory system with user control, and declarative AI visuals.
- **Practice:** a standalone surface for debates, hard conversations, negotiation, pitches, interviews, delegation and explaining. GPT-Live voice runs with a server conductor, and text practice is also available. Feedback is grounded in the transcript, with notes pinned to specific lines on a replay timeline and "Redo from here" to retry one moment.
- **Sessions:** finished steps fold into a trail; any passage can be highlighted and asked about; answers carry a confidence rating that feeds the learner model and a calibration chart; a text answer that misses can be retried once with the feedback in view. The day's first step is written up to an hour before the learning window, and breaks send a push when they end.
- **Adaptive sessions:** a planner decides each next step from verdicts, familiarity and active time, so sessions fill their budget. A familiarity tap before new ideas, orient and worked-example steps for newcomers, "I don't know yet", and Wrap up.
- **Venture:** a pixel-art business simulation with deterministic books, Luna-written events and reviews, onboarding, autosave, months earned by learning, tools unlocked by studying, and the company available to the tutor as a scenario.
- **Gamification:** XP, levels, a streak that ignores unplanned days, three daily quests and badges, shown on Today, in sessions and at the end of each session.
- **Learn and Mastery:** Learn shows this week and next with the rest of the plan in outcome-named chapters. Mastery starts with what's been shown and one next challenge, unlocking the map, momentum, calibration and portfolio as history grows.
- **Mastery and Insights:** a forgetting forecast on the knowledge map, a portfolio grouped by milestone with Markdown export, milestone rehearsals two weeks out, and a weekly Insights read from Astra: measured activity, eight grades on fixed anchors, learning patterns and behavioural observations.
- **Notebook:** every idea met so far, built from the sessions themselves (no model calls): the learner's best answers, the explanation and visual that taught it, their questions and notes, recall strength and a one-tap recall. Notes can be added to any step or selected passage. One entry can be shared as a snapshot card by link (`/c/[token]`, with an image at `/c/[token]/image`) and turned off at any time. Lessons underline ideas met in earlier sessions and show the learner's words about them.
- **Settings:** You is grouped by what each setting changes and shows its value: memory, teaching style (inferred, with what each position means), practice voice with samples, session defaults (familiarity check, confidence, “I don't know yet”, breaks), the rhythm from the plan, each kind of notification, reading (lesson and app fonts including OpenDyslexic and Atkinson Hyperlegible, size, line length), motion, sound and each game element. They live in one synced `settings:prefs` record (`src/lib/prefs.ts`).
- **Time:** the device's time zone is kept as `settings:device` and used for “today”, greetings, reminders and streaks. Every run keeps an active-time clock, so durations exclude time away.
- **Access:** private, invite-only, passwordless sign-in (magic link or code, plus optional passkeys), with a public site at `/welcome`, `/how-it-works`, `/changelog` and `/request-access` (responses land in `interest_requests`).
- **Platform:** a single Vercel deployment with no separate worker. Scheduled work runs from Vercel Cron.
- **Checks:** 100 unit tests, TypeScript and the production build pass, and 13 backend checks against real Supabase pass. See [Verification](VERIFICATION.md).
- **Still to do:**
  - Push delivery on a physical device.
  - Passkeys, which await enabling in Supabase.
