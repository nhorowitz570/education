# AI and voice

Model IDs, prices and GPT-Live behaviour were verified against the live APIs on September 22, 2026. Providers change; everything below is configurable in `.env`.

## Models

| Tier | Model | Price per 1M tokens (in / cached / out) | Used for |
| --- | --- | --- | --- |
| fast | `gpt-6-luna` | $0.10 / $0.01 / $0.50 | Quick grading, memory extraction, summaries |
| primary | `gpt-6-sol` | $2 / $0.20 / $10 | Teaching beats, questions, tutor replies, deep grading, practice briefs, partners and feedback, Markdown import |
| reasoning | `gpt-6-astra` | $10 / $1 / $50 | Curriculum mapping, diagnosing persistent misconceptions, and escalations |
| voice | `gpt-live-1` | $0.05 per minute (15 s minimum) | Spoken practice |
| embedding | `text-embedding-3-small` | — | Memory retrieval |

Astra doesn't accept reasoning effort `none`, so routing lifts it to `medium`. Tasks marked escalatable (teaching, replies, deep grading, practice feedback) move up a tier when a signal says the work is hard or high-stakes. The signals are: two or more lapses or open misconceptions on the concept, a learner who has asked to go deeper twice, a practice transcript over 900 words, or grading a milestone piece of work. If Astra fails, the call falls back to Sol.

**Providers.** Text models run through OpenRouter (`openai/gpt-6-*`), restricted to providers that don't retain prompts (`data_collection: deny`), and each call logs OpenRouter's reported billed cost. GPT-Live and embeddings call OpenAI directly with `OPENAI_API_KEY`. `AI_PROVIDER=openai` switches text to OpenAI direct as well. OpenRouter rejects the `prompt_cache_options` TTL, so it is sent only on the direct route; `prompt_cache_key` works on both.

## How the tutor is kept concise

Conciseness is set in the harness, not left to the model's taste:

- **`text.verbosity` is `low`** on every tutoring task, with tight `max_output_tokens`.
- **The core prompt** (`src/lib/ai/prompts.ts`) sets the defaults:
  - Answer the question that was asked.
  - Ask at most one question.
  - Never re-explain something the learner already showed they understand.
  - Sometimes just explain; a quiz isn't always the right move.
  - Personalise silently, without narrating what you know about the learner.
- **The output is structured**, as blocks with an optional visual. The UI then offers follow-ups ("go deeper", "example", "shorter") instead of the model pre-empting them. That makes answers concise by default, adaptive through the style profile, and expandable when the learner asks.

## Prompt layers and caching

```
instructions  = CORE (tutor) or OPERATOR_CORE (utility)  +  task / beat prompt     ← identical across learners
developer     = <learner> <style> <memory> <curriculum> <session> <beat>          ← most stable → most volatile
user          = the learner's input, or the beat to write
```

`prompt_cache_key` is `fw:{task}:{beat}` (plus a 30-minute TTL on the direct OpenAI route). Stable prefixes are shared across calls, so a session's beats mostly hit the cache. Every call is logged to `ai_calls` with cached-token counts.

## Visuals

The model never writes code. It returns a spec for one of 12 primitives (bar, line, waterfall, flow, timeline, compare, matrix, concepts, stat, statement, sim, spectrum). The spec is part of the structured-output schema, so it arrives already shaped correctly; the client still re-validates it with zod before drawing, and shows a skeleton until then. `sim` exposes sliders over a formula compiled by a whitelist expression parser, and an output whose formula doesn't compile is left out instead of breaking the visual.

## GPT-Live harness

**Session creation.** `client.live.create` with WebRTC transport. The browser sends its SDP offer to our server, which creates the session and returns the answer, so the API key never reaches the browser.

**Instructions** (`src/lib/practice/harness.ts`) follow OpenAI's GPT-Live prompting structure:

- **Role and tone:** the partner's name, role, stance and temperament from the brief.
- **Conversation style:** one or two short sentences, one question at a time, no coaching or summarising.
- **Difficulty:** gentle, realistic or tough.
- **Debate conduct:** debates only. Use real facts without invented statistics, concede good points, and never strawman.
- **Backchannel policy:** thinking room scaled to the learner's pause preference.
- **Interruption policy:** stop and respond to the new point, and ignore noise.
- **Complications:** only on the app's cue.
- **Time and wrap-up.**
- **Delegation policy:** none, so it always answers in character.
- **Boundaries:** no feedback during the call, and never claim real actions.

**The conductor** (`conduct()` in `src/lib/server/practice.ts`) attaches over `wss://api.openai.com/v1/live/sessions/{id}/attach` and:

- sends `session.commentary.append` to open with the brief's line;
- sends `session.instructions.append` for complications at 38% and 66% and the wrap-up about 60 s before the end;
- closes the call on the hard limit, on a learner-ended signal, or when the client has been silent for more than 45 s;
- records the transcript and usage, logs voice cost, and marks the session closed with a reason.

**Verified end to end** on September 22 with a real WebRTC call and a synthetic microphone speaking three scripted lines (see [Verification](VERIFICATION.md)):

- The partner opened with the brief's line and responded to each turn in role.
- The first complication arrived on the partner's next turn after its cue ("finance pays suppliers 30 days after invoice").
- The partner waited silently while the learner was quiet instead of filling the silence.
- Ending the call recorded `learner-ended`, confirmed usage (267 s, $0.22) and a monitored session.
- Feedback quoted the learner's own words and named the concession that weakened their position.

**Voices** accepted by GPT-Live: cedar, willow, meridian, gleam, vesper, stone (`scripts/verify-voices.ts`).

## Costs in practice

Measured in development:

| Activity | Measured cost |
| --- | --- |
| Session beat on Sol | about $0.01 |
| Quick grade on Luna | under $0.001 |
| Deep grade on Sol | about $0.01 |
| Practice brief / feedback on Sol | about $0.005 / $0.008 |
| 4½-minute voice call | $0.22 |
| Markdown import of a 12-week plan | $0.02 |
| Curriculum map on Astra (once per plan) | $0.42 |

A full session with several questions typically costs well under $0.25, excluding voice. Everything is visible under You → Usage.
