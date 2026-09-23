# Build state

September 22, 2026.

- **Learning engine:** instant session outlines, streamed beats, a BKT and forgetting-curve learner model, a concept graph mapped by Astra, a memory system with user control, and declarative AI visuals.
- **Practice:** a standalone surface for debates, hard conversations, negotiation, pitches, interviews, delegation and explaining. GPT-Live voice runs with a server conductor, and text practice is also available. Feedback is grounded in the transcript.
- **Access:** private, invite-only, passwordless sign-in (magic link or code, plus optional passkeys), with a landing page at `/welcome`.
- **Platform:** a single Vercel deployment with no separate worker. Scheduled work runs from Vercel Cron.
- **Checks:** 60 unit tests, TypeScript and the production build pass, and 13 backend checks against real Supabase pass. See [Verification](VERIFICATION.md).
- **Still to do:**
  - Push delivery on a physical device.
  - Passkeys, which await enabling in Supabase.
  - Google Calendar, which awaits OAuth credentials.
