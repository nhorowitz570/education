# Architecture

Fieldwork answers one question when it opens: *what should I learn right now?* Everything else supports that answer. It should be quick to start, adapt to the learner as it goes, and keep enough memory that the next session is better than the last.

## The shape of a session

```
Today ──Begin──▶ startRun()            instant; no model call
                   │  outline()        deterministic beats from plan + learner model
                   ▼
            /session/[id]
                   │  beat reached ──▶ streamBeat()   Sol writes this beat, streamed as NDJSON
                   │  next beat    ──▶ prefetched while the learner reads
                   │  answer       ──▶ answerBeat()   grade (Luna → Sol when hard) → record evidence
                   │  question     ──▶ askBeat()      tutor reply in the context of this beat
                   ▼
              finishRun() ──after()──▶ summary + memory consolidation
```

**The outline is code; the content is AI.** `src/lib/learning/outline.ts` builds the beats (`recall`, `situation`, `explain`, `check`, `attempt`, `transfer`, `roleplay`, `produce`, `break`, `recap`) from the time available, the learner's strength on the session's concepts, and what's due for review. A fluent learner skips the long explanation. A learner coming back from missed days gets a 20-minute return session. Beats after the commitment point are optional. Tapping Begin never waits for a model, and pacing is predictable.

**Beats stream in and build themselves.** `generate()` streams structured output. The client parses partial JSON (`src/lib/partial-json.ts`) and renders paragraphs and visuals as they arrive. A visual appears only once its spec validates, with a skeleton until then.

**Answer keys never reach the browser.** Question beats store their key and rubric in `runs.secrets`. Authenticated users can't select that column, and only the server grader reads it.

## Learner model

`src/lib/learning/model.ts` keeps one `ConceptState` per concept.

- **Knowledge:** Bayesian Knowledge Tracing with soft evidence. Graded scores between 0 and 1 blend the correct and incorrect posteriors. Evidence given with help counts for half. Guess rate depends on the question type.
- **Memory:** a power-law forgetting curve with a stability that grows on successful spaced recall and shrinks on lapses (FSRS-like). Review intervals grow roughly 2½ → 6 → 15+ days.
- **Misconceptions:** recorded by the grader, carried into later prompts, and marked resolved when later evidence shows otherwise.
- **Levels:** new → learning → practised → solid → mastered. These derive from the knowledge estimate × current recall strength, so an idea that isn't reviewed decays visibly on the Mastery map.

Every piece of evidence is appended to `learning_events` and then projected into `concept_states`, so the state can be rebuilt from the event log.

**The concept graph.** On first use, Astra maps the plan's sessions into concepts with prerequisites (`mapCurriculum`). Until that finishes, each session stands in for its own concept, and `carryOver` moves any early evidence onto the mapped concepts. Review priority weights decay by how many upcoming concepts depend on the idea.

## Memory

Memory is separate from the learner model. It holds what the tutor should *know about the person*, not what the person knows.

| Layer | Where | How it's used |
| --- | --- | --- |
| Core facts: goals, background, preferences | `memories` (pinned or high confidence) | Always in context |
| Relevant memories | `memories` + pgvector `match_memories` | Retrieved per beat by similarity to the topic, re-scored by recency and confidence |
| Style | `learner_profiles.style` | Depth, challenge, visuals, questions vs. explanation, concreteness. An EMA over behavioural signals such as asks, skips, "shorter" and "more detail" |
| Episodes | `runs.summary` | One-line recaps of recent sessions |

After each session and practice, Luna reads the transcript and proposes operations (`add`, `reinforce`, `update`, `archive`). Near-duplicates at similarity ≥ 0.9 are merged. A single observation stays a *candidate* until it recurs. The learner can see, pin and delete every memory under You → Memory, or delete them all.

## Practice (GPT-Live)

Practice is a separate surface from lessons, though a lesson's `roleplay` beat creates a linked practice and gets its feedback back.

1. **Brief.** Sol writes a scenario (partner, stance, situation, opening line, one or two complications, success criteria). Recent partner names are avoided.
2. **Call.** The browser opens WebRTC to GPT-Live through a server-mediated SDP exchange. The server then attaches a *conductor* to the same session over the sideband WebSocket, inside the request's `after()`. The conductor opens the conversation, sends each complication as a mid-call instruction at 38% and 66% of the planned time, signals the wrap-up, enforces the hard limit, closes the call if the client disappears, and saves the authoritative transcript and usage.
3. **Feedback.** Sol grades the transcript against the brief's criteria: one best line quoted back, one change, a rewrite of a real line, and 2–4 criteria. It waits for the conductor to settle so it grades the full transcript.

Text practice uses the same brief and feedback, with Sol playing the partner.

Voice-session state lives in `private.voice_sessions` and is mutated only through the `voice_patch` RPC. That makes every state change atomic, and a closed call can't reopen.

## AI orchestration

All model calls go through `generate()` in `src/lib/ai/engine.ts`. Tasks are declared once in `src/lib/ai/tasks.ts` with a tier, effort, verbosity and output budget. Routing escalates hard or high-stakes work one tier. Prompts are layered, most stable first, so the prompt cache hits: core philosophy, then task, then learner, then memory, then curriculum, then the live beat. See [AI and voice](AI_AND_VOICE.md).

## Data

| Table | Holds | Access |
| --- | --- | --- |
| `plan_versions`, `workspaces` | Imported plans (immutable versions) and synced app state | RLS: owner |
| `concepts`, `concept_states`, `learning_events` | Concept graph, learner model, evidence log | RLS: owner read; server writes |
| `runs` | Sessions and practice: outline, beats, context, summary; `secrets` holds answer keys | Server only (select revoked) |
| `memories` | Memory items with embeddings | RLS: owner read; server writes |
| `learner_profiles` | Style profile | RLS: owner read |
| `ai_calls` | Every model call: task, tier, model, tokens, cost, latency | RLS: owner read |
| `private.voice_sessions` | Live call lifecycle | Server only via RPC |

## Scheduled work

`/api/cron` runs every 15 minutes on Vercel Cron and is authenticated with `CRON_SECRET`. Each tick sends due push reminders (one per slot, deduplicated in the database), deletes expired food photos, and settles voice calls whose conductor vanished. Every step is idempotent.

## Security

- **Invite-only access:** sign-ups are off, sign-in is by magic link or passkey, and `*.vercel.app` redirects to the canonical domain.
- **Mutations:** protected by a `Sec-Fetch-Site` / `Origin` check against the serving host (`src/lib/server/origin.ts`).
- **Untrusted input:** imported plans, transcripts and learner text are wrapped as untrusted data in prompts.
- **Visuals:** AI visuals are declarative specs (`src/lib/viz/schema.ts`), with formulas compiled by a safe expression parser. No model-written code ever runs.
