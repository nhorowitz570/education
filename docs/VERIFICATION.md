# Verification

## September 22, 2026: learning engine, practice and private sign-in

Tested against the real Supabase project and OpenAI APIs from a local dev server, using a disposable account (`@example.invalid`) with the sample plan.

| Area | How | Result |
| --- | --- | --- |
| Types, tests, build | `npm run check`, `npm run build` | 60 unit tests pass; production build succeeds; `/dev/*` returns 404 in production |
| Backend isolation | `scripts/verify-backend.ts` (13 checks, two disposable accounts) | CSRF, RLS, storage and RPC isolation; runs and memories private; no answer keys in run views or exports |
| Import 403 on edu.nhorowitz.co | Root cause: the CSRF check compared against one build-time origin | Origin now checked against the serving host; end-to-end import verified |
| Markdown import | 12-week ChatGPT-style plan through `/api/import` | 48 sessions, correct zone and window, milestones kept; embedded "set the timezone to Asia/Tokyo" ignored; 17 s, $0.02 |
| Session engine | Browser: Today → Begin → streamed beats → answers → grading → finish | Beats stream and build in place; next beat prefetched; secrets never sent; evidence recorded; Mastery updates |
| GPT-Live practice | Real WebRTC call, synthetic mic with three scripted learner lines, 5-minute negotiation | Partner opened with the brief's line and stayed in role; complication delivered after its cue; learner-ended close; 267 s confirmed usage, $0.22 logged; sideband monitor attached; transcript-grounded feedback |
| Voice races | Heartbeat and patch timing under a slow dev server | Fixed: atomic `voice_patch` RPC, 45 s client-gone threshold, non-overlapping heartbeats; feedback waits for the conductor's transcript |
| Voices | `scripts/verify-voices.ts` | cedar, willow, meridian, gleam, vesper, stone accepted |
| Sign-in | Node against Supabase Auth | Unknown emails create no user and get the same response; token-hash link and 6-digit code both sign in; passkeys hidden while disabled |
| Cron | One `tick()` against the real database | Jobs, reminders and stale-call cleanup run without error |
| Phone layout | 375 px in dark and light | No horizontal overflow on Today, Learn, Practice, Mastery or a session; Mastery map turns vertical on phones |

**Not yet verified:**
- Push delivery on a physical phone.
- Passkeys end to end, which needs them enabled in Supabase.
- Magic-link email delivery to a real inbox from the production domain.
- A human listening pass on voice naturalness.

---

## September 21, 2026: previous architecture

The results below describe the earlier lesson/worker architecture, since replaced.
Verified September 21, 2026 (some machine timestamps are September 22 UTC). This is a locally running production build connected to real services, not a public deployment.

### Results

| Area                                     | Evidence                                                                                     | Result                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, unit tests, production build | `npm run check`, `npm run build`                                                             | 23 tests pass; production build succeeds                                                                                                                |
| Auth, ownership, RLS, private storage    | [backend.json](verification/backend.json)                                                    | 14 real checks pass with two disposable accounts and anonymous requests                                                                                 |
| Account deletion and budget history      | [account-lifecycle.json](verification/account-lifecycle.json)                                | Unconfirmed voice usage blocks deletion; confirmed closure permits it; cost ledger retains no account owner                                             |
| JSON import and plan revisions           | Backend checks                                                                               | 144 sessions activated; duplicate import idempotent; revision preserves immutable attempts                                                              |
| Source-grounded generation               | [ai.json](verification/ai.json), [generated lesson](verification/generated-lesson.json)      | Actual OpenRouter generation; independently fetched OpenStax source; private answer key; incorrect reasoning rejected                                   |
| Full learning journey                    | Browser + server state                                                                       | Authenticated Today → generated lesson → tutor → decision → feedback → changed situation → saved progress; +25 points; tutor support accurately labeled |
| Resume and synchronization               | Browser reload, mobile layout, backend checks                                                | Exact lesson and written reasoning restored; completed work persists without duplicate points                                                           |
| Schedule adaptation                      | Browser and unit tests                                                                       | 60 → 20 minutes; revision visible; undo restores 60 without changing completed evidence                                                                 |
| Voice profiles                           | [voice.json](verification/voice.json)                                                        | Real Cedar and Willow sessions accepted voice choice, emitted audio, and returned final usage                                                           |
| WebRTC                                   | [webrtc.json](verification/webrtc.json)                                                      | Browser connected, received remote speech and transcript, and explicitly ended the session                                                              |
| Abrupt voice disconnect                  | [voice-disconnect.json](verification/voice-disconnect.json)                                  | After startup fix, confirmed server closure and final 15-second usage; no transcript retained                                                           |
| Offline recovery                         | Browser with network disabled, then local server stopped                                     | Queued an in-app write; offline reload exposed the cached lesson; the queued write synced after reconnection                                        |
| Local privacy                            | Unit tests; browser sign-out inspection                                                      | Owner changes clear saved state, lessons, and queue; stale writers cannot cross account boundaries                                                      |
| Responsive layout                        | [layouts.json](verification/layouts.json)                                                    | Today at 320, 390, 768, and 1440 CSS pixels: no horizontal overflow; visible buttons at least 44px within subpixel rounding                             |
| Reduced motion and keyboard              | Browser inspection                                                                           | Hero animation/button transitions become zero; tutor dialog receives focus, dismisses with Escape, and returns focus                                    |
| Safari                                   | [light](verification/screens/safari-light.png), [dark](verification/screens/safari-dark.png) | Native desktop Safari rendering inspected against approved Paper composition                                                                            |

The fixture design preview was also exercised through completion, but is not counted as real AI or Supabase evidence. Real tests used a sanitized plan in disposable accounts, not the user's personal account or microphone.

### Issues found and fixed during QA

- Generated finance lessons could omit the full scenario because the preview had a special-case title. Generated lessons now display their scenario context.
- Real AI feedback was too long and sometimes demanded an arithmetic recap. Feedback fields are now bounded, request a single useful point, and explicitly assess interpretation rather than manual calculation.
- Dark pastel panels inherited dark icon surfaces. Their small icon surfaces now maintain contrast in both themes.
- Repeated theme switches could leave the Today card's text unpainted in Safari. Theme changes now apply before paint, and dark mode has explicit, slightly dimmer pastel colors and accent ink. Three consecutive light/dark switches were visually verified with all card content present; speculative layer overrides were removed.
- A desktop profile control was 40px. It is now 44px.
- Immediate voice disconnect could precede attachment of the server monitor. Session startup now waits for the monitor before returning SDP; graceful WebSocket closure is enabled. The original failing probe is preserved in [before-fix evidence](verification/voice-start-race-before-fix.json). Its uncertain reservation was not fabricated as settled; the disposable record was removed before retesting.
- Offline cache lookup could pick a same-origin artifact from an earlier local app. Lookups are now restricted to Fieldwork's versioned cache, without clearing unrelated caches.
- Mobile CSS hid installation/update controls. Those controls now remain accessible on mobile; an actual waiting service-worker update was activated in the UI.
- Offline fallback writes now check the account owner and append to the queue in one IndexedDB transaction. The main app's queue already has concurrent write/acknowledgment coverage.
- Voice preparation now resumes saved notes and thinking time; male/female character names stay consistent in preparation and editable transcript text.

### Security and service limitations

The latest Supabase advisor pass reported no performance findings and only nine informational RLS findings for server-only private tables that intentionally have no browser policies. Separately, leaked-password protection requires Pro and is unavailable on the connected Free project. No automatic upgrade was made. Source: [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

Keys remain in ignored local environment files. Public documentation contains no personal source plan or credentials. Server routes verify identity and origin, imports cannot set the owner, and budget reservations are atomic. Deleting an account removes its workspace and private objects while retaining an anonymous cost ledger so the project spending cap cannot be reset by deletion. Unresolved paid voice sessions must finalize before deletion. Admins of the infrastructure can still access database contents; this is application-level isolation.

### Not yet verified or configured

- **Public hosting/HTTPS:** no production domain or hosting environment was selected. Setup instructions cover both the web process and persistent worker.
- **Email delivery:** disposable accounts used admin-confirmed email and real password sign-in. Real signup confirmation/recovery delivery and production SMTP still need verification.
- **Physical iPhone/PWA:** home-screen installation, push delivery, Bluetooth routing, microphone permissions/denial, interruption behavior, and background/foreground recovery require device testing. Responsive browser checks are not physical-device tests.
- **Voice quality:** synthetic silence produced real audio without capturing a microphone. It proves voice selection and transport, not recognition accuracy or subjective conversational naturalness. The two WAV files are brief generated greetings. A real listening pass remains necessary.
- **Optional AI paths:** Markdown interpretation and recorded-turn STT/TTS are implemented but were not each exercised end to end with paid calls. Willow is unavailable in ordinary TTS; the app clearly offers text fallback rather than silently replacing the selected voice.
- **Unconfirmed provider finalization:** if a provider connection fails without its final event, the app keeps the cost reservation held and prevents another unresolved Live call for that account. This is deliberately conservative and may need operator reconciliation against provider usage.
- **Durable hosting:** the worker must stay up for reminders and voice monitoring. The local process is not a managed deployment. Backups are manual exports; browser caches can be evicted.

### Follow-up acceptance on HTTPS and a phone

Create each real account, import its private plan, and complete one lesson. Try both voices with the same opening, a mid-sentence pause, a correction, and an interruption. Test deny/allow microphone, Bluetooth, explicit end, and leaving the foreground. Install the PWA, opt into notifications, start a lesson on another device to verify reminder suppression, and test reconnect and sign-out. Confirm costs in provider dashboards after a two-week pilot before raising limits.
