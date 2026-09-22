# Fieldwork

A private education and growth app: open Today, start one useful task, and keep the progress. Responsive Next.js web app and installable PWA with Supabase accounts, source-grounded AI lessons, voice practice, and flexible scheduling.

The approved Studio design lives in [Paper](https://app.paper.design/file/01M330NHHR8TDBZH6ARGSW4X8R/p-2-0/5P-0). See [design references](design-references.md), [interaction specification](design/interaction-spec.md), and [verification report](docs/VERIFICATION.md).

## Run locally

Use Node 26 (the verified runtime), or a compatible modern Node release. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with your own credentials. The private local workspace already has credentials; do not replace that file. Open `http://127.0.0.1:3000`. `/?preview=1` is an explicitly labeled, local-only design preview with a reviewed sample lesson. It does not call AI or sync to Supabase.

Run the worker in a second terminal:

```sh
npm run jobs
```

The worker is required for queued lesson generation, reminders, and Live session monitoring. The app refuses to start Live when its worker heartbeat is stale. Start one worker per environment; it must remain running while calls are active.

For a production build locally:

```sh
npm run check
npm run build
npm start
```

## Services and configuration

| Service    | Variables                                                                                 | Purpose                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Supabase   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Private accounts, immutable plan versions, synced progress, private uploads                          |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL`                                             | Lessons, tutoring, reasoning assessment, import interpretation, voice feedback, food-image estimates |
| OpenAI     | `OPENAI_API_KEY`, `OPENAI_VOICE_MODEL`                                                    | GPT-Live voice conversation; direct speech APIs for the optional recorded-turn mode                  |
| Google     | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`                        | Optional read-only calendar free/busy                                                                |
| Web Push   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                      | User-enabled reminders                                                                               |

Only `NEXT_PUBLIC_` values are exposed to the browser. Never prefix server secrets with it. Use a random 32-byte base64 encryption key for calendar credentials. Generate a VAPID pair with `npx web-push generate-vapid-keys`, then keep its private key server-side.

Default text model: `openai/gpt-5.6-luna` through OpenRouter. Voice: `gpt-live-1` directly through OpenAI, with **Cedar (male)** and **Willow (female)**. No manually created Live agent is required. Model choices, per-million-token price ceilings, monthly caps, and session duration are configurable. See [AI and voice decisions](docs/AI_AND_VOICE.md).

The default combined AI limit is $20 per account and $40 per project per month, with a 10-minute limit per voice session. Reservations are atomic; uncertain provider costs remain held rather than being treated as free. These limits cover calls made through this app, not unrelated provider usage, hosting, or subscriptions. Nothing purchases or upgrades a service automatically.

## Supabase setup

The connected development project is Fieldwork in ConnexaAI. All five repository migrations have been applied. For a new environment, create your own Supabase project and apply migrations in order:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Configure Supabase Auth's Site URL to your exact app origin. Allow `/auth/callback` on that origin, including the local `http://127.0.0.1:3000/auth/callback` while developing. The callback sends recovery sessions to `/reset-password`. Configure production SMTP for reliable signup and recovery email delivery; this has not been tested with a real user's mailbox.

RLS isolates each account's plan and progress. Private storage paths include the authenticated account ID. Server-only tables deliberately have no browser policies. Supabase administrators still have infrastructure-level access; application isolation is not end-to-end encryption.

Register separate accounts, then import your own JSON or Markdown plan. The full personal source files remain local and are excluded from Git. [The example plan](examples/learning-plan.json) contains 144 sessions with sanitized profile and growth fields. The import screen also provides an empty ChatGPT template. Re-importing identical content is idempotent; revisions show a diff and preserve completion evidence.

Export from Settings periodically. Keep both plan and progress exports in a private backup location. Free-project pause/storage limits apply; no paid upgrade or automated off-site backup has been configured.

## Deploy

The web app is deployed at [education-eosin-xi.vercel.app](https://education-eosin-xi.vercel.app/) on Vercel. The repository pins Vercel's Next.js preset in `vercel.json`; the project setting must also remain Next.js. Set `NEXT_PUBLIC_APP_URL` and Supabase Auth's Site URL to the exact HTTPS origin, and allow both `/auth/callback` and `/auth/callback?next=/reset-password` as redirect URLs.

Vercel currently hosts the web app only. A separate persistent Node worker with outbound WebSocket access is still required for queued lessons, reminders, and Live voice monitoring. It has not been deployed, so those features are not production verified. An occasional cron invocation cannot replace the worker during a voice call.

1. Install dependencies and inject the environment variables into both services. The web build also needs the public Supabase and VAPID values.
2. Set `NEXT_PUBLIC_APP_URL` to the exact HTTPS origin. Run `npm run build`.
3. Run the web service with `npx next start --hostname 0.0.0.0 --port "$PORT"` and the worker with `npm run jobs`. Give each a restart policy and graceful shutdown time.
4. Update Supabase Site URL/redirects. For Google OAuth, enable Calendar API and allow `https://YOUR_HOST/api/calendar/callback`. Use the same callback path locally when testing; no calendar writes are requested.
5. Verify signup/recovery, import, a generated lesson, Live start/end, and push delivery on the actual HTTPS site. Install on iPhone through Safari → Share → Add to Home Screen. Request notifications from the installed app.

Selected lessons can be saved for offline reading. Simple writes queue on the device and sync on reconnection/foreground open. New AI generation, voice, and calendar sync require internet. Browser storage can be evicted; offline storage is not a backup. Voice stops when the app leaves the foreground.

## Verification commands

```sh
npm run check
npm run build
npm audit
```

Live integration checks below create disposable accounts and make billable provider requests. They are not part of CI:

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-backend.ts
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-voice.ts
```

`scripts/create-review-account.ts` writes ignored temporary credentials for UI testing. `scripts/verify-ai.ts` uses that account and the sanitized example plan. Keep those files local. The report identifies what was tested with real services and what still needs physical-device or deployment verification.
