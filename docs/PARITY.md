# Web ↔ iPhone parity

Every screen and feature, on the web (`src/components`) and on iPhone (`ios/Fieldwork/Features`). Keep this current: when either side changes, update its row in the same change (see `AGENTS.md`). Anything the iPhone app doesn't have yet goes in **Gaps**, with the reason.

Status: ✅ same behaviour · 🔶 adapted for the platform (same data and outcome, different interaction) · — not on this platform (by design)

## Look and feel

The iPhone app has its own presentation (September 2026, at the owner's request): system type (SF Pro) instead of the serif outside lessons, visual-first screens (icon tiles, rings, stat tiles, grouped settings) with shorter copy, and spring animations throughout. Lessons keep the learner's reading font and full text. The data, actions and features match the web; where the iPhone shows something the web doesn't, it's listed in **Gaps**.

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
| Tutor chat (thread synced across devices) | ✅ panel / embedded | 🔶 Tutor tab, chat-app layout | Thread lives in `tutor_messages`. iPhone: composer centred until the first message, stop button, copy / ask again, writing style picked from the title |
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
| Fixed-plan "Adjust schedule" (move, shorten, recover, undo) and the field-map strip | iPhone | Only older fixed plans use them; the owner's plan is rolling | Port if a fixed plan is imported again |
| Router ignores `/learn#next` (opens Learn at the top) | iPhone | Anchor scrolling not wired up | Scroll to the next-week card |
| Email sign-in by link | iPhone | The app can't follow the email's link | Code only, by design |
| Practice brief: "What good looks like" (the brief's success criteria as a checklist) | Web | Added in the iPhone redesign | Add to `practice/conversation.tsx` brief |
| Notebook: quick-recall deck on the index, Notes and Terms panes | Web | Added in the iPhone redesign | Consider for the web Notebook |
| Mastery: a ring per subject; shorter next-challenge copy | Web | Added in the iPhone redesign | Consider for the web |
| Notebook share sheet: live card preview | Web | Added in the iPhone redesign | Consider for the web |
| Today: Progress and Your plan tiles; quests shown only in the level sheet | Web / iPhone | iPhone Today keeps just the streak and level in the header | Quests stay one tap away |
| You: sign out asks to confirm; session switches and breaks in their own sheet; export and delete as separate rows | Web | iPhone reorganised settings into grouped cards | Same settings, different grouping |
