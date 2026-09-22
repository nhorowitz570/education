# Fieldwork build state

September 21, 2026. The approved Studio direction is implemented as a responsive web app and mobile PWA. Native iOS remains a separate phase.

- Connected Supabase Free project: Fieldwork, ConnexaAI. Five migrations applied; private account/database/storage isolation tested with two disposable accounts.
- OpenRouter key and direct OpenAI key configured locally. Real sourced lesson, tutor, assessment, Cedar/Willow Live audio, browser WebRTC, and disconnect finalization verified.
- Local production build runs at `http://127.0.0.1:3000`; a separate Node worker processes lessons, reminders, and voice monitoring.
- Google Calendar code is present but awaits OAuth credentials. Web Push is configured but device delivery remains unverified. No public HTTPS deployment has been made.
- All 23 unit tests, TypeScript checks, and production build pass. See [verification](VERIFICATION.md) for evidence, fixes found during QA, and remaining platform checks.

The public repository excludes credentials, original personal curriculum files, and disposable-account credentials. The included 144-session example is sanitized. The private original plan can be imported through the account UI.
