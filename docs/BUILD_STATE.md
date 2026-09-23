# Build state

September 22, 2026.

- **Learning engine:** instant session outlines, streamed beats, a BKT and forgetting-curve learner model, a concept graph mapped by Astra, a memory system with user control, and declarative AI visuals.
- **Practice:** a standalone surface for debates, hard conversations, negotiation, pitches, interviews, delegation and explaining. GPT-Live voice runs with a server conductor, and text practice is also available. Feedback is grounded in the transcript, with notes pinned to specific lines on a replay timeline and "Redo from here" to retry one moment.
- **Sessions:** finished steps fold into a trail; any passage can be highlighted and asked about; answers carry a confidence rating that feeds the learner model and a calibration chart; a text answer that misses can be retried once with the feedback in view. The day's first step is written up to an hour before the learning window, and breaks send a push when they end.
- **Mastery and Insights:** a forgetting forecast on the knowledge map, a portfolio grouped by milestone with Markdown export, milestone rehearsals two weeks out, and a weekly Insights read from Astra: measured activity, eight grades on fixed anchors, learning patterns and behavioural observations.
- **Access:** private, invite-only, passwordless sign-in (magic link or code, plus optional passkeys), with a landing page at `/welcome`.
- **Platform:** a single Vercel deployment with no separate worker. Scheduled work runs from Vercel Cron.
- **Checks:** 71 unit tests, TypeScript and the production build pass, and 13 backend checks against real Supabase pass. See [Verification](VERIFICATION.md).
- **Still to do:**
  - Push delivery on a physical device.
  - Passkeys, which await enabling in Supabase.
  - Google Calendar, which awaits OAuth credentials.
