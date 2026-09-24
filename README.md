# Fieldwork

A private tutor for a handful of people. Import a curriculum once; each morning Fieldwork runs the session, checks what stuck, and brings ideas back before they fade. Practise hard conversations, debates and pitches out loud with GPT-Live. Web app and installable PWA on Next.js, Supabase, OpenRouter and OpenAI, plus a native SwiftUI iPhone app in [`ios/`](ios/README.md) that uses the same API and account.

It is invite-only: there is no sign-up. Accounts are added by hand in Supabase, and people sign in with an emailed link (or a passkey once they've added one).

- [Architecture](docs/ARCHITECTURE.md): how a session is built, the learner model, memory, and the data layout
- [AI and voice](docs/AI_AND_VOICE.md): model routing, prompts, GPT-Live harness, costs
- [Verification](docs/VERIFICATION.md): what has been tested against real services
- [API](docs/API.md): every route's contract, which the iPhone app is built from
- [Parity](docs/PARITY.md): each screen and feature on the web and on iPhone

## Run locally

```sh
npm ci
cp .env.example .env.local   # fill in Supabase and OpenAI keys
npm run dev                  # http://127.0.0.1:3000
```

Sign-in links from a local server return to the loopback origin, so add `http://127.0.0.1:3000/**` to Supabase's redirect URLs while developing.

```sh
npm run check    # typecheck + unit tests
npm run build
```

There is no separate worker. Background work runs inside requests (`after()`), and scheduled work runs from Vercel Cron.

## Configuration

| Service  | Variables                                                                                 | Purpose                                                    |
| -------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Accounts, plans, learner model, memory, private storage    |
| OpenRouter | `OPENROUTER_API_KEY`, `AI_MODEL_*`                                                      | Tutoring and grading: GPT-6 Luna / Sol / Astra             |
| OpenAI   | `OPENAI_API_KEY`, `OPENAI_VOICE_MODEL`                                                    | GPT-Live voice practice, memory embeddings                 |
| App      | `NEXT_PUBLIC_APP_URL`, `APP_ALLOWED_ORIGINS`, `CRON_SECRET`                               | Canonical origin, CSRF allow-list, cron authentication     |
| Web Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                      | Optional morning reminders                                 |
| APNs     | `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (optional `APNS_TOPIC`, `APPLE_TEAM_ID`) | Notifications on the iPhone app                            |

AI is unmetered by default; every call's tokens and cost are still logged to `ai_calls` and shown under You → AI cost this month. Set `AI_MONTHLY_LIMIT_USD` for a per-account guard. `AI_PROVIDER=openai` would send text models to OpenAI directly instead of OpenRouter.

## Supabase

Migrations live in `supabase/migrations`. For a fresh project: `npx supabase link --project-ref …` then `npx supabase db push`.

Auth settings (dashboard → Authentication):

- **Sign-ups off.** Add people under Users → Add user.
- **Site URL** `https://edu.nhorowitz.co`; redirect URLs `https://edu.nhorowitz.co/**` (plus the loopback origin for development).
- **Email template → Magic link:** paste `supabase/templates/magic_link.html`. It sends both a link to `/auth/confirm` and an 8-digit code (the project’s email OTP length; the web and iPhone app both expect 8).
- **Passkeys (optional):** enable with relying party `edu.nhorowitz.co`. The sign-in screen hides passkeys while they're disabled.

## Deploy (Vercel)

1. Set the variables above in Vercel (Production), including `CRON_SECRET` and `NEXT_PUBLIC_APP_URL=https://edu.nhorowitz.co`.
2. `vercel.json` schedules `/api/cron` every 15 minutes (reminders, queued jobs, stale voice-call cleanup).
3. Requests to `*.vercel.app` redirect to the canonical domain, so passkeys and sign-in links stay on one origin.
4. Live voice runs through a server conductor inside the request that started it (`maxDuration` 800s), which is why calls are capped at 15 minutes.

## Checks against real services

These create disposable accounts and make small billable requests. Point them at a local server, never production:

```sh
VERIFY_ORIGIN=http://127.0.0.1:3000 node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-backend.ts
node --env-file=.env.local --import tsx scripts/verify-voices.ts
node --env-file=.env.local --import tsx scripts/e2e-session.ts            # disposable signed-in session for UI testing
```
