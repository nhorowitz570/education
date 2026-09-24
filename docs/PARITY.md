# Web ↔ iPhone parity

Every screen and feature, on the web (`src/components`) and on iPhone (`ios/Fieldwork/Features`). Keep this current: when either side changes, update its row in the same change (see `AGENTS.md`). Anything the iPhone app doesn't have yet goes in **Gaps**, with the reason.

Status: ✅ same behaviour · 🔶 adapted for the platform (same data and outcome, different interaction) · — not on this platform (by design)

## Screens

| Screen / feature | Web | iPhone | Notes |
| --- | --- | --- | --- |
| Sign in: passkey | ✅ `entry/login.tsx` | ✅ `Login/LoginView.swift`, `Core/Passkeys.swift` | Same relying party `edu.nhorowitz.co`; passkeys sync through iCloud Keychain |
| Sign in: email | ✅ link or 8-digit code | 🔶 8-digit code only | The app can't follow the email's link, so it always asks for the code |
| Navigation | ✅ rail / phone tab bar | 🔶 tabs Today · Practice · Tutor · Notebook · You | Mastery, Insights and Learn are pushed from Today; Import from You or Today |
| Today: greeting, numbered brief, agenda, margin notes, begin | ✅ `today/today.tsx` | ✅ `Today/TodayView.swift` | Brief cached per day on each device |
| Today: Learn anything (explore) | ✅ | ✅ | |
| Today: shape next week, weekly insight, resume, exploration rows, tiles | ✅ | ✅ | |
| Today: progress strip + sheet, week strip, milestone | ✅ | ✅ | |
| Today: recap card (done for the day) | ✅ | ✅ | |
| Today: new-memories toast | ✅ | ✅ | |
| Session: fixed and adaptive runs, streamed steps, prefetch | ✅ `session/*` | ✅ `Session/*` | |
| Session: gauge, choice/text questions, confidence-as-submit, "I don't know yet", one retry | ✅ | ✅ | |
| Session: feedback with XP pop and combo | ✅ | ✅ | Plus haptics on iPhone |
| Session: asks (chips, free text, hint) | ✅ | ✅ | |
| Session: highlight a passage to ask or note | ✅ selection toolbar | 🔶 long-press a paragraph | Same intents (Why? Example, Simpler, Show me, Ask…, Note) |
| Session: notes on steps (offline queue) | ✅ | ✅ | |
| Session: known terms from earlier sessions | ✅ | ✅ | Dotted underline; tap opens the term card |
| Session: breaks with server-held end time | ✅ | ✅ | |
| Session: wrap up, finish here | ✅ | ✅ | |
| Session: roleplay step (embedded practice) | ✅ | ✅ | |
| Session: completion (reward, stats, what moved before→after, what you showed) | ✅ | ✅ | |
| Visuals (all 17 types) | ✅ `viz/*` | ✅ `Design/Visuals.swift` | Native renderers; sim formulas share test cases |
| Sentence-by-sentence streaming | ✅ `lib/stream-text.ts` | ✅ `Blocks.sentences` | Shared test cases |
| Practice hub: suggestions, formats, recent | ✅ `practice/hub.tsx` | ✅ `Practice/PracticeHome.swift` | |
| Practice setup: topic, side, difficulty, length, voice with samples | ✅ | ✅ | Samples bundled from `public/voices` |
| Practice brief, text practice, voice (GPT-Live) | ✅ | ✅ | iPhone voice uses native WebRTC |
| Practice feedback: best line, change, rewrite, criteria, replay timeline, redo from here, try again | ✅ | ✅ | |
| Tutor chat (thread synced across devices) | ✅ panel / embedded | ✅ Tutor tab | Thread lives in `tutor_messages` |
| Tutor actions (open, start today, writing style, remember) | ✅ | ✅ | |
| Notebook index, entry, notes, quick recall | ✅ | ✅ | |
| Notebook share cards | ✅ | ✅ | |
| Mastery | ✅ | ✅ | |
| Insights | ✅ | ✅ | |
| Learn (rolling plan: this week, next week draft, steer, tracks, rhythm) | ✅ | ✅ | |
| Import a plan | ✅ | ✅ | Files app picker |
| You: memory, teaching style, writing style, practice voice | ✅ | ✅ | |
| You: sessions, rhythm, plan, notifications, look & feel, game elements | ✅ | ✅ | Appearance is per device on both |
| You: sign-in (passkeys), AI cost, export, delete account, sign out | ✅ | ✅ | |
| Notifications | ✅ web push | ✅ APNs | Same per-kind switches (`prefs.notify`) |
| Home Screen widget | — | ✅ `FieldworkWidget` | Today's session and weekly streak |
| Siri / Shortcuts | — | ✅ `App/Intents.swift` | Start today's session, Ask my tutor, Practise a conversation |
| Haptics | — | ✅ `Core/Feedback.swift` | Sound cues match the web's synthesised tones |
| Install / update prompts | ✅ PWA | — | Not needed on iPhone |
| Public site (welcome, how it works, changelog, request access, share cards) | ✅ | — | Web only by design |

## Gaps

| What | Platform missing it | Why | Plan |
| --- | --- | --- | --- |
| _none yet_ | | | |
