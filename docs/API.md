# Fieldwork API reference

> **Source of truth is the TypeScript; update this file whenever a route's contract changes (the iPhone app in ios/ is built from it).**

Written against the tree of 2026-09-24. Covers every route under `src/app/api/` except `venture`, `food-photo`, `cron` and `interest` (server-only or being removed). Life, Venture, check-in and food features are out of scope and ignored throughout.

Contents

1. [Conventions](#1-conventions): base URL, auth, headers, errors, streaming, dates
2. [Route index](#2-route-index)
3. [Shared types](#3-shared-types)
4. [App state sync](#4-app-state-sync)
5. [Session (runs) lifecycle](#5-session-runs-lifecycle)
6. [Practice](#6-practice)
7. [Tutor, brief and hook](#7-tutor-brief-and-hook)
8. [Learning views](#8-learning-views): mastery, progress, notebook, notes, shares, portfolio, chapters, insights, memory
9. [Plan import and weekly drafts](#9-plan-import-and-weekly-drafts)
10. [Account, export, usage](#10-account-export-usage)
11. [Push](#11-push)
12. [Auth (Supabase)](#12-auth-supabase)
13. [Public configuration](#13-public-configuration)

---

## 1. Conventions

### Base URL

`https://edu.nhorowitz.co` (the value of `NEXT_PUBLIC_APP_URL`). All paths below are relative to it. `/api/*` is never redirected by the canonical-host proxy.

### Authentication

Every route calls `context(request)` in `src/lib/server/http.ts`:

| Check | Result on failure |
|---|---|
| Supabase not configured on the server | `503` "Connect Supabase to use your private account…" |
| No `Authorization: Bearer` header and the request is cross-site (non-GET with foreign `Sec-Fetch-Site`/`Origin`) | `403` "This request came from a different site." |
| Token or cookie session invalid/expired | `401` "Sign in to continue." |
| `X-Fieldwork-Owner` header present and ≠ the token's user id | `409` "Your account changed. Reload before continuing." |
| `SUPABASE_SECRET_KEY` missing | `503` |

The iPhone app authenticates with **`Authorization: Bearer <Supabase access token>`** (the `access_token` from a Supabase Auth session, see §12). A bearer request skips the CSRF check. On `401`, refresh the Supabase session and retry once.

Optional header **`X-Fieldwork-Owner: <user uuid>`**: the id of the account whose data the client has cached. The server rejects the request with `409` if the token belongs to someone else. The web sends it only on `/api/state` and `/api/actions` (`src/lib/client/workspace.ts`); the iPhone app should send it on every request once it knows its owner id.

### Request bodies

- JSON, `Content-Type: application/json`.
- Read by `body(request, max)`: the raw byte limit is **128 000 bytes** unless the route says otherwise. Over the limit → `413` "This request is too large."; empty → `400` "A request body is required."; not JSON → `400` "This request is not valid JSON."
- **Some `DELETE` routes take a JSON body** (`/api/memory`, `/api/notes`, `/api/shares`, `/api/account`). Send it; `URLSession` allows a body on DELETE.
- zod `.trim()` fields are trimmed before length checks. zod objects **strip unknown keys** (extra fields are ignored, not rejected).

### Errors

Every non-streaming failure is `{ "error": string }` with the status from `fail()`:

| Cause | Status | `error` |
|---|---|---|
| `HttpError(message, status)` thrown by the route | its status | its message |
| zod validation failure | `400` | "Some fields are invalid. Check the dates, required answers, and file format." |
| Any other exception | `500` | the exception's message if it matches `/allowance|budget|configured|conflict|already|Choose|date|plan|file|source/i`, else "This did not save. Your work is still here; please try again." |

Statuses you will see from AI work (`src/lib/ai/engine.ts`): `429` (monthly AI allowance reached / provider rate limit), `422` (the model refused), `502` (malformed or cut-short model output, provider rejected key), `503` (no AI key on the server). Platform errors (`413`, `502`, `504` from Vercel) may have a non-JSON body: fall back to a generic message.

```ts
type ApiError = { error: string };
```

### Streaming (NDJSON)

Streaming routes (built with `ndjson()` in `src/lib/server/stream.ts`) respond `200` with

```
Content-Type: application/x-ndjson; charset=utf-8
Cache-Control: no-store, no-transform
X-Accel-Buffering: no
```

and a body of one JSON object per line (`\n`-terminated):

```ts
type StreamEvent<Snap, Done> =
  | { t: 'snap'; data: Snap }                       // partial snapshot, REPLACES the previous one
  | { t: 'meta'; tier: string; cached?: boolean }   // which model tier answered ('fast'|'primary'|'reasoning', or 'cached')
  | { t: 'plan'; data: Beat[] }                     // runs 'answer' only: the run's full, authoritative beat list
  | { t: 'done'; data: Done }                       // final payload; exactly one on success
  | { t: 'error'; status: number; message: string } // failure after the stream started
```

Rules:

- A `snap` is a **partial JSON snapshot of the final shape** (parsed from the model's incomplete output). Each one replaces the last; do not append. Arrays may end with an incomplete element (e.g. a `visual` block whose spec is half-filled, or `null`); decode leniently and render only what parses. Snapshots are throttled to one per ~40 ms.
- `done` arrives once. A stream that ends without `done` or `error` is a failure (the web shows "The response ended early. Try again.", treated as `502`).
- `error` arrives with HTTP `200` already sent. Its `status` follows the table above (unknown errors → `500`, message "Something went wrong. Try again.").
- Failures **before** the stream starts (auth, validation, route-level checks) are ordinary JSON errors with a non-200 status.
- The server finishes the work even if the client disconnects; content generated for a disconnected client is saved.
- Web client: `stream()` in `src/lib/client/api.ts`. On iOS, `URLSession.bytes(for:)` + `.lines` is equivalent.

Per-route `snap`/`done` payloads are listed with each route.

### Dates and ids

- Local dates: `"YYYY-MM-DD"`. Local times: `"HH:MM"` (24 h). Instants: ISO-8601 strings from Postgres or `Date.toISOString()` (`"2026-09-24T10:00:00.000Z"`); Postgres timestamps may carry `+00:00` and microseconds, so parse leniently.
- When the client **sends** an instant to a `z.string().datetime()` field (record `updated_at`), it must be UTC with a `Z` suffix; offsets are rejected. Use exactly `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`: record timestamps are compared as strings.
- Ids generated by the client (`eventId`, tutor message ids) are lowercase UUID v4 strings.
- "Today" on the server is computed in the learner's zone (§4, `settings:device`).

---

## 2. Route index

| Method & path | Purpose | Web caller(s) | § |
|---|---|---|---|
| `GET /api/state` | Load the synced workspace (plan, attempts, records) | `src/lib/client/workspace.ts` | 4 |
| `POST /api/actions` | Apply one queued command | `src/lib/client/workspace.ts` (via `useWorkspace().send/record` from `app/provider.tsx`, `learn/rolling.tsx`, `learn/adjust.tsx`, `you/you.tsx`, `you/sheets.tsx`) | 4 |
| `GET /api/today` | Today screen model | `src/components/today/today.tsx` | 7.4 |
| `POST /api/today/brief` | Morning brief | `src/components/today/today.tsx` | 7.2 |
| `GET /api/today/hook` | One-line teaser for a session | none currently | 7.3 |
| `GET /api/tutor` | Read the tutor thread | `src/components/tutor/store.ts` | 7.1 |
| `POST /api/tutor` | Send a message, stream the reply | `src/components/tutor/chat.tsx` | 7.1 |
| `PUT /api/tutor` | One-time import of a device-kept thread | `src/components/tutor/store.ts` | 7.1 |
| `DELETE /api/tutor` | Clear the thread | `src/components/tutor/chat.tsx` | 7.1 |
| `POST /api/runs` | Start or resume a session/review/exploration/return/rehearsal | `today/today.tsx`, `learn/learn.tsx`, `learn/rolling.tsx`, `mastery/mastery.tsx`, `notebook/notebook.tsx`, `app/legacy.ts` | 5 |
| `GET /api/runs` | Recent runs | none currently | 5 |
| `GET /api/runs/[id]` | Fetch a run | `session/use-run.ts` | 5 |
| `POST /api/runs/[id]` | Beat / answer / gauge / wrap / ask / advance / finish | `session/use-run.ts`, `session/runner.tsx` | 5 |
| `POST /api/runs/[id]/break` | Start a break | `session/runner.tsx` | 5 |
| `GET /api/practice` | Recent practices | `practice/hub.tsx` | 6 |
| `POST /api/practice` | Create a practice (brief) or a redo | `practice/hub.tsx`, `practice/conversation.tsx`, `session/roleplay.tsx` | 6 |
| `GET /api/practice/[id]` | Fetch a practice | `practice/room.tsx`, `session/roleplay.tsx` | 6 |
| `POST /api/practice/[id]` | live (SDP) / control / say / feedback | `practice/use-live.ts`, `practice/conversation.tsx` | 6 |
| `GET /api/mastery` | Learner model for display | `mastery/mastery.tsx`, `learn/learn.tsx`, `session/complete.tsx` | 8.1 |
| `GET /api/progress` | XP, level, streak, quests, badges | `progress/progress.tsx`, `session/complete.tsx` | 8.2 |
| `GET /api/notebook` | Notebook entries, or `?terms=1` | `notebook/notebook.tsx`, `session/extras.tsx` | 8.3 |
| `GET/POST/DELETE /api/notes` | Learner notes on beats | `session/extras.tsx`, `notebook/notebook.tsx` | 8.4 |
| `POST/DELETE /api/shares` | Share a Notebook card | `notebook/notebook.tsx` | 8.5 |
| `GET /api/portfolio` | Produced work, JSON or Markdown | `mastery/mastery.tsx` | 8.6 |
| `GET /api/chapters` | Model-written chapter names (dated plans) | `learn/learn.tsx` | 8.7 |
| `GET/POST /api/insights` | Weekly insights | `insights/insights.tsx` | 8.8 |
| `GET/POST/DELETE /api/memory` | Memories | `you/you.tsx` | 8.9 |
| `POST /api/import` | Preview/activate a plan file | `src/components/import.tsx` | 9.1 |
| `POST /api/plan/week` | Draft/redraft next week | `learn/rolling.tsx` | 9.2 |
| `GET /api/account` | Monthly AI spend summary | none currently | 10 |
| `DELETE /api/account` | Delete the account | `src/components/settings.tsx` | 10 |
| `GET /api/export` | Download all data | `src/components/settings.tsx` | 10 |
| `GET /api/usage` | This month's AI usage | `you/you.tsx` | 10 |
| `GET/POST/DELETE /api/push` | Web push key, device registration | `src/components/pwa.tsx` | 11 |

Component paths are under `src/components/` unless absolute.

Share links (not an API): `https://edu.nhorowitz.co/c/<token>` (public card page), with an OG image at `/c/<token>/image`. `token` is 18 random bytes, base64url (24 chars).

---

## 3. Shared types

TypeScript notation. `?` means the key may be absent; `| null` means present with `null`. Treat both as optional in Swift unless noted.

### 3.1 Blocks and visuals (`src/lib/learning/run.ts`, `src/lib/viz/schema.ts`)

```ts
type Block =
  | { type: 'text'; md: string }        // Markdown
  | { type: 'callout'; md: string }     // Markdown, set apart
  | { type: 'visual'; visual: Viz };

type Tone = 'default' | 'accent' | 'positive' | 'negative' | 'muted';

// Every Viz has `takeaway: string` (one sentence: what to notice).
// Optional fields are nullable (always present, value null), never omitted.
type Viz =
  | { type: 'bar'; title: string; unit: string;          // unit: "$" (prefix), "%", "hrs" or "" (suffix)
      bars: { label: string; value: number; tone: Tone; pending: number | null; note: string | null }[];
      takeaway: string }                                   // pending: part of value not yet realised (draw hatched)
  | { type: 'line'; title: string; unit: string; x_label: string | null;
      series: { name: string; tone: Tone; dashed: boolean; points: { x: string; y: number }[] }[];
      annotations: { x: string; label: string }[];
      takeaway: string }
  | { type: 'waterfall'; title: string; unit: string;
      start: { label: string; value: number };
      steps: { label: string; delta: number }[];
      end_label: string;
      takeaway: string }
  | { type: 'flow'; title: string;
      steps: { label: string; detail: string | null; tone: Tone }[];
      loops: boolean;                                      // last step feeds back to the first
      takeaway: string }
  | { type: 'timeline'; title: string;
      events: { when: string; label: string; detail: string | null; tone: Tone }[];
      takeaway: string }
  | { type: 'compare'; title: string;
      columns: { heading: string; tone: Tone }[];
      rows: { label: string; cells: string[] }[];          // cells[i] belongs to columns[i]
      takeaway: string }
  | { type: 'matrix'; title: string;
      x_axis: { label: string; low: string; high: string };
      y_axis: { label: string; low: string; high: string };
      items: { label: string; x: number; y: number; tone: Tone }[];   // x, y in 0..1
      takeaway: string }
  | { type: 'concepts'; title: string;
      nodes: { id: string; label: string; tone: Tone; emphasis: boolean }[];
      edges: { from: string; to: string; label: string | null }[];    // from/to are node ids
      takeaway: string }
  | { type: 'stat';                                        // no title
      items: { label: string; value: string; delta: string | null; tone: Tone }[];
      takeaway: string }
  | { type: 'statement'; title: string; unit: string;
      sections: { heading: string | null;
                  rows: { label: string; value: number; emphasis: 'normal' | 'subtotal' | 'total' }[] }[];
      takeaway: string }
  | { type: 'sim'; title: string;
      inputs: { id: string; label: string; min: number; max: number; step: number; value: number; unit: string }[];
      outputs: { label: string; formula: string; format: 'currency' | 'number' | 'percent'; tone: Tone }[];
      takeaway: string }
  | { type: 'spectrum'; title: string; left: string; right: string;
      markers: { label: string; position: number; tone: Tone }[];      // position 0 (left) .. 1 (right)
      takeaway: string }
  | { type: 'cycle'; title: string;
      steps: { label: string; detail: string | null; tone: Tone }[];   // 3–6 stages
      centre: string | null;                                           // ≤ 18 chars, drawn in the middle
      takeaway: string }
  | { type: 'tree'; title: string;
      nodes: { id: string; parent: string | null; label: string; detail: string | null; tone: Tone }[];
      takeaway: string }                                   // one root (parent null), ≤ 3 levels, ≤ 12 nodes
  | { type: 'parts'; title: string; unit: string;
      parts: { label: string; value: number; tone: Tone }[];           // 2–6 parts of one whole
      total_label: string | null;
      takeaway: string }
  | { type: 'balance'; title: string;
      left:  { label: string; items: { label: string; weight: number }[] };   // weight 1 (minor) .. 3 (major)
      right: { label: string; items: { label: string; weight: number }[] };
      takeaway: string }
  | { type: 'venn'; title: string;
      sets: { label: string; tone: Tone }[];               // exactly 2 or 3
      regions: { sets: number[]; items: string[] }[];      // sets: indexes into `sets`, e.g. [0] or [0,1]
      takeaway: string };
```

`sim` formulas: arithmetic over input ids with `+ - * / ^ ( )`, numbers, and `min() max() round() abs()`. Evaluate client-side as the learner moves the sliders (the web evaluator is `src/lib/viz/formula.ts`; never `eval`). Unknown `visual.type` values should render nothing. Labels in the web UI: `bar` "bar chart", `line` "line chart", `waterfall` "bridge", `flow` "process", `timeline`, `compare` "comparison", `matrix`, `concepts` "concept map", `stat` "figures", `statement`, `sim` "model", `spectrum`, `cycle`, `tree` "hierarchy", `parts` "breakdown", `balance`, `venn` "overlap".

### 3.2 Runs and beats (`src/lib/learning/run.ts`, `src/lib/learning/outline.ts`, `src/lib/learning/planner.ts`)

```ts
type BeatType =
  | 'gauge' | 'recall' | 'situation' | 'orient' | 'explain' | 'worked' | 'check'
  | 'attempt' | 'transfer' | 'roleplay' | 'produce' | 'break' | 'recap';
// Question beats (take an answer): recall, check, attempt, transfer, produce.
// Teaching beats: situation, orient, explain, worked, recap.

type Verdict = 'solid' | 'partial' | 'missed';           // score ≥ 0.75 solid, ≥ 0.4 partial, else missed
type Confidence = 'low' | 'medium' | 'high';             // labels: Guessing, Fairly sure, Certain
type Gauge = 'new' | 'heard' | 'used';                   // "How familiar is this?"
type AskIntent = 'why' | 'example' | 'deeper' | 'simpler' | 'visual' | 'free';

type Question = {
  kind: 'choice' | 'text';
  options: string[] | null;       // choice: 1–5 options; text: null
  placeholder: string | null;
  long: boolean;                  // true for produce/attempt (multi-line composer)
};
type Feedback = { verdict: Verdict; score: number /* 0..1 */; blocks: Block[] };
type Response = {
  choice?: number; text?: string; confidence?: Confidence;
  unknown?: boolean;              // "I don't know yet"
  gauge?: Gauge;                  // gauge beats only
  at: string;
};
type Ask = {
  id: string; prompt: string; quote?: string; intent: AskIntent;
  blocks: Block[]; follow_ups?: string[]; at: string;
};

type Beat = {
  id: string;                     // e.g. "explain-1a-x9k2"; opaque, ≤ 80 chars
  type: BeatType;
  minutes: number;                // planned length
  concept?: string;               // concept key
  intent: string;                 // the tutor's brief for this step (internal wording; don't show)
  optional?: boolean;             // offered, not required
  status: 'pending' | 'generating' | 'ready' | 'answered' | 'done' | 'skipped';
  generating_at?: string | null;
  blocks?: Block[];               // content; present once generated (break: [])
  follow_ups?: string[];          // teaching beats: suggested questions (≤ 3)
  question?: Question;            // question beats
  response?: Response;
  feedback?: Feedback | null;     // null briefly during a retry
  attempts?: { response: Response; feedback: Feedback }[];  // earlier try kept on retry
  asks?: Ask[];
  practice?: { id: string; status: 'open' | 'done' };       // roleplay beats: the embedded practice
  tier?: string;                  // model tier that wrote it
  correct_index?: number;         // choice questions, set once graded
};

type RunKind = 'session' | 'review' | 'explore' | 'practice' | 'return' | 'rehearsal';

type RunView = {
  id: string;                     // uuid
  kind: RunKind;
  title: string;
  status: 'active' | 'done' | 'abandoned';
  cursor: number;                 // index of the first beat not yet passed
  beats: Beat[];
  summary: string | null;         // written after finish (async)
  started_at: string;
  session: { id: string; title: string; subject: string; date: string; objective: string } | null;
  minutes_planned: number | null;
  break_until?: string | null;    // ISO, set while a break is running
  elapsed?: number;               // active minutes so far, one decimal
  adaptive?: true;                // present only on adaptive (plan session / return) runs
  wrapping?: boolean;             // present only on adaptive runs
};
```

A text answer can be retried once when `feedback.verdict !== 'solid' && question.kind === 'text' && !attempts?.length && !response.unknown` (`canRetry`).

### 3.3 Plan (`src/lib/plan.ts`)

```ts
type Id = string;   // /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/
type TrackId = string; // /^[a-z0-9][a-z0-9-]{0,39}$/

type Session = {
  id: Id; date: string; start_local: string /* HH:MM */;
  duration_minutes: number;       // 5..240
  optional: boolean;
  subject: string;                // ≤ 100; in rolling plans, the track id
  title: string;                  // ≤ 300
  objective: string;              // ≤ 6000
  evidence: string;               // ≤ 6000
  source_ids: Id[];               // ≤ 30
  prerequisite_ids: Id[];         // ≤ 30
  generation_instructions: string;
  added?: boolean;                // proposed by the AI, not in the original plan
  why?: string;                   // ≤ 400, why it was chosen this week
};
type Topic = {
  id: Id; title: string; objective: string; evidence: string; source_ids: Id[];
  generation_instructions: string; minutes?: number; added?: boolean;
};
type Track = {
  id: TrackId; title: string /* ≤ 60 */; why: string; goals: string[];
  status: 'active' | 'paused';
  backlog: Topic[];               // ordered list of waiting topics
};
type WeekMeta = {
  start: string;                  // a Monday
  status: 'draft' | 'active' | 'done';
  origin: 'import' | 'planner' | 'ai';
  generated_at: string;
  note?: string;                  // ≤ 400
  steer?: string;                 // ≤ 600, learner's steering note
  suggestion?: { extra: 1 | 2; track: TrackId | null; why: string } | null;
  planned?: number; done?: number;
};
type Horizon = {
  version: 1;
  rhythm: {
    days: Record<'0'|'1'|'2'|'3'|'4'|'5'|'6', TrackId>;   // weekday (0 = Monday) → track; sparse
    minutes: number;              // 10..240, default session length
    start_local: string;
  };
  tracks: Track[];                // 1..12
  weeks: WeekMeta[];
};
type Plan = {
  schema_version: '1.0';
  plan_id: Id;
  title: string;
  start_date: string; end_date: string;
  profile: { name: string; timezone: string; goals: string[]; preferences: Record<string, unknown> };
  schedule: {
    weekdays: number[];           // 0..6
    start_local: string; end_local: string; timezone: string;
    travel_window?: { start: string; end: string; dates_confirmed: boolean };
    weekly_review?: string; friday?: string;
  };
  sources: { id: Id; title: string; url: string; use: string }[];
  weeks: { id: Id; start_date: string; mode: string; topics: Record<string, string>; evidence: string }[];
  sessions: Session[];            // in a rolling plan: only weeks that exist
  growth: Record<string, unknown>;
  adaptation: Record<string, unknown>;
  milestones: { date: string; title: string }[];
  horizon?: Horizon;              // present = rolling plan (every plan imported now is rolling)
};
```

### 3.4 App state (`src/lib/types.ts`)

```ts
type ScheduleEntry = {
  date: string; start_local: string; duration_minutes: number;
  status: 'planned' | 'skipped' | 'travel' | 'reduced';
};
type Revision = {
  id: string; reason: string; created_at: string;
  before: Record<string /* session id */, ScheduleEntry>;
  after: Record<string, ScheduleEntry>;
  undone_at?: string;
};
type Attempt = {           // one per finished plan session
  id: string; plan_id?: string; session_id: string; objective_id: string;
  lesson_id: string;       // the run id
  completed_at: string; date: string; reduced: boolean; assisted: boolean;
  reasoning: string; transfer: string;
  feedback: { strength: string; gap: string; next: string; independent: boolean; correct: boolean;
              rubric: { issue: string; evidence: string; reasoning: string; uncertainty: string } };
  points: number; review_of?: string;
};
type UserRecord = {
  id: string;              // ≤ 180
  kind: string;            // see §4.3
  data: Record<string, unknown>;
  updated_at: string;
};
type AppState = {
  plan?: Plan;
  planVersionId?: string;
  attempts: Attempt[];
  records: UserRecord[];
  overrides: Record<string /* session id */, ScheduleEntry>;
  revisions: Revision[];
  revision: number;        // server revision counter
  // Older workspaces may carry extra keys; ignore unknown keys.
};
```

A session's effective schedule is `{ ...session, ...overrides[session.id] }` (status defaults to `'planned'`).

### 3.5 Preferences (`src/lib/prefs.ts`) — the `settings:prefs` record's `data`

```ts
type Font = 'sans' | 'serif' | 'hyperlegible' | 'dyslexic';
type Voice = 'cedar' | 'willow' | 'meridian' | 'gleam' | 'vesper' | 'stone';
type Writing = 'balanced' | 'candid' | 'concise' | 'formal' | 'warm';
type Prefs = {
  session: { familiarity: boolean; confidence: boolean; dontKnow: boolean; breaks: 0 | 5 | 10 };
  voice: Voice;
  writing: Writing;
  game: { xp: boolean; streak: boolean; quests: boolean; pops: boolean };
  reading: { size: 's' | 'm' | 'l' | 'xl'; lessonFont: Font; appFont: Font;
             width: 'narrow' | 'normal' | 'wide'; motion: 'system' | 'reduce' | 'full' };
  sound: boolean;
  notify: { morning: boolean; nudge: boolean; breaks: boolean; insights: boolean; week: boolean };
};
const DEFAULT_PREFS: Prefs = {
  session: { familiarity: true, confidence: true, dontKnow: true, breaks: 5 },
  voice: 'cedar', writing: 'balanced',
  game: { xp: true, streak: true, quests: true, pops: true },
  reading: { size: 'm', lessonFont: 'serif', appFont: 'sans', width: 'normal', motion: 'system' },
  sound: false,
  notify: { morning: true, nudge: true, breaks: true, insights: true, week: true },
};
```

Every field falls back to its default independently when missing or invalid; decode each field with a default. Writing styles: Balanced "Clear and even", Candid "Casual, blunt, swears", Concise "Only what matters", Formal "Precise, academic", Warm "Patient, encouraging" (samples in `src/lib/learning/voice.ts`). Voices: Cedar (man, North American), Willow (woman, Irish), Meridian (man, North American), Gleam (woman, North American), Vesper (man, British), Stone (man, Irish).

Server use: `session.*` shapes new runs, `writing` sets the tutor's style, `notify.*` gates pushes (§11). The rest are client display settings.

### 3.6 Tutor (`src/lib/tutor.ts`)

```ts
type TutorRoute = '/' | '/learn' | '/practice' | '/mastery' | '/notebook' | '/insights' | '/you';
type TutorAction = {                      // every key always present
  type: 'set_writing' | 'open' | 'remember' | 'start_today';
  writing: Writing | null;                // set_writing
  href: TutorRoute | null;                // open
  label: string | null;                   // open: button text, ≤ 4 words
  content: string | null;                 // remember: the sentence saved
};
type ChatMessage = {
  id: string;                             // uuid
  role: 'user' | 'tutor';
  text?: string;                          // user messages
  blocks?: Block[];                       // tutor messages
  actions?: TutorAction[];                // omitted when empty
  suggestions?: string[];                 // ≤ 3 follow-up chips; omitted when empty
  at: string;
};
```

---

## 4. App state sync

The plan, schedule changes, attempts and small synced settings live in one **workspace document** per account (`public.workspaces`, optimistic revision counter) plus `public.attempts`. Everything else (runs, notes, memories, insights…) is read from its own route.

### 4.1 `GET /api/state`

Purpose: load the workspace. Before reading, the server brings a rolling plan up to today (`ensureHorizon`: closes ended weeks, promotes a waiting draft, plans a missing current week); this may write.

Response `200`:

```ts
{ ownerId: string /* user uuid */; state: AppState }
```

`state.attempts` contains only attempts for the active plan.

### 4.2 `POST /api/actions`

Purpose: apply one command to the workspace. Body: a `Command`; limit 128 KB.

```ts
type Command =
  | { type: 'record'; eventId: string; record: {
        id: string;                           // 1..180
        kind: RecordKind;
        data: Record<string /* ≤ 100 */, unknown>;   // JSON.stringify(data).length < 30000
        updated_at: string;                   // ISO UTC with Z; ≤ now + 5 min
      } }
  | { type: 'delete-record'; eventId: string; id: string /* ≤ 180 */ }
  | { type: 'shorten'; eventId: string; sessionId: string; minutes: 20 | 60 | 120; today: string }
  | { type: 'move'; eventId: string; sessionId: string; date: string; time: string /* HH:MM */ }
  | { type: 'recover'; eventId: string; today: string }
  | { type: 'undo'; eventId: string; revisionId: string /* uuid */; today: string }
  | { type: 'plan-edit'; eventId: string; today: string; edit: PlanEdit };
  // 'complete' and 'activate' exist in the schema but the server rejects them with 400:
  // sessions finish through /api/runs, plans activate through /api/import.

type PlanEdit =
  | { op: 'swap'; sessionId: string; topicId: string }        // replace a session with a waiting topic
  | { op: 'remove'; sessionId: string }                       // topic returns to its track (AI-added ones vanish)
  | { op: 'add'; week: string /* Monday */; track: TrackId; day: 0|1|2|3|4|5|6 }  // track's next topic on that day
  | { op: 'dismiss-suggestion'; week: string }
  | { op: 'steer'; week: string; note: string /* ≤ 600 */ }
  | { op: 'rhythm'; days: Record<string /* '0'..'6' */, TrackId>; minutes: number /* 10..240 */; start_local?: string }
  | { op: 'track'; track: TrackId; status: 'active' | 'paused' }   // the last active track can't pause
  | { op: 'move-topic'; track: TrackId; topicId: string; to: number /* 0..500 */ };
```

`eventId`: a fresh UUID per command (the idempotency key). `today`: required by the schema, but the server **replaces** it with its own date in the learner's zone for `shorten`, `recover`, `undo` and `plan-edit`; send the device's local date.

Response `200`: `{ state: AppState; ownerId: string }` (the new authoritative state).

Server behaviour:

- **Idempotent by `eventId`.** Each committed `eventId` is recorded; resending the same command returns `200` with the current state and changes nothing.
- **Optimistic concurrency.** The server re-reads, re-applies and commits against the stored `revision`, retrying up to 4 times. If it still loses the race → `500` (message is the generic one). Retry.
- **`record` is last-writer-wins by `updated_at`** (string comparison): if the stored record with that id has a later `updated_at`, the command succeeds but changes nothing.
- **`plan-edit` never fails for "doesn't apply"**: an edit on a week that can no longer change (a week is editable while `today <= week start`), an unknown topic, a done session, or an edit that would make the plan invalid leaves the plan unchanged and returns `200`.
- `shorten`/`move`/`undo` can throw (e.g. "Session not found.", "Finished work cannot be rescheduled.", "Choose a date inside your plan.", "This session was edited again…") → `500` with that message if it matches the pass-through regex, else the generic one.
- Other statuses: `400` (zod, future `updated_at`, `complete`/`activate`), `409` (owner mismatch, "Your active plan changed…").

Command semantics, for optimistic local application:

| Command | Effect |
|---|---|
| `record` | Upsert `records[id]` unless the stored one is newer. |
| `delete-record` | Remove the record with that id. |
| `shorten` | New `Revision` (id = `eventId`) whose `after[sessionId]` = current entry with `date` = today (unless before plan start), `duration_minutes` = minutes, `status` = `'reduced'` if shorter than the session else `'planned'`; merged into `overrides`, appended to `revisions`. |
| `move` | Revision setting `date` and `start_local` (date must be inside the plan). |
| `recover` | Revision moving missed essential sessions into future non-optional slots (first one 20 min, `reduced`), skipping what doesn't fit and past optional ones. |
| `undo` | Restores `before` for each session in the revision (skipping past or finished ones), sets `undone_at`. |
| `plan-edit` | Pure function `applyEdit` in `src/lib/rolling.ts`. |

**Recommendation for Swift:** apply `record`/`delete-record` locally (trivial), and for every other command show a pending state and adopt the server's returned `state`. Reimplementing `schedule.ts`/`rolling.ts` is optional.

### 4.3 Records

`RecordKind` accepted by the server includes `'settings' | 'draft' | 'memory' | 'reflection' | 'busy' | 'external'` (plus Life kinds being removed). The iPhone app only needs to **write `'settings'`**; decode `kind` as a string and keep unknown records untouched.

Validation (`src/lib/records.ts`): `data` must be finite JSON (no NaN/Infinity, depth < 12, arrays ≤ 1000, < 30000 chars). For `kind: 'settings'`: keys `morning`, `followup`, `quietStart`, `quietEnd` must be `HH:MM` when present, and `timezone` must be a valid IANA zone (≤ 64 chars) when present. `busy`: `{ date, start: HH:MM, end: HH:MM }` with `end > start`.

Settings records (all `kind: 'settings'`):

| `id` | `data` | Written by | Read by |
|---|---|---|---|
| `settings:prefs` | `Prefs` (§3.5), always the **whole** merged object | `app/provider.tsx` `setPrefs(group, partial)` merges one group over current prefs and writes it all | server: run shaping, tutor writing style, push gating; client: display |
| `settings:device` | `{ timezone: string }` (IANA) | `app/provider.tsx`: whenever the device zone differs from the stored one | server: every "today", greeting, streak, reminder (`zoneOf`, falls back to `plan.schedule.timezone`, then `America/Los_Angeles`) |
| `settings:reminders` | `{ enabled?: boolean; travel?: boolean; morning?: 'HH:MM' /* default 09:45 */; followup?: 'HH:MM' /* 10:30 */; quietStart?: 'HH:MM' /* 21:00 */; quietEnd?: 'HH:MM' /* 08:00 */ }` | `you/sheets.tsx` Notifications sheet | cron reminders: sent only when `enabled && !travel` |
| `settings:memory` | `{ seen_at: string /* ISO */ }` | `you/you.tsx` when the memory list is opened | `/api/today` `memories.fresh` count |

The iPhone app should write `settings:device` on launch/foreground when the zone changed, and `settings:prefs` on any settings change.

### 4.4 Client algorithm (`src/lib/client/workspace.ts`)

State held per owner (`ownerId`): `state` (last known), `queue` (pending commands, FIFO), both persisted locally (web: IndexedDB `fieldwork-private-v1`, keys `owner`, `state`, `queue`). If the stored owner differs from the signed-in user, wipe local data first. Sign-out wipes it too.

1. **Launch:** load cached `state` and `queue`, paint, then `sync()`.
2. **send(command):** validate, apply locally (`applyCommand`; if that throws, reject before queueing), append to the persisted queue (dedupe by `eventId`), publish the optimistic state, then `sync()`.
3. **sync()** (single-flight; skipped while offline):
   - While the queue is non-empty: `POST /api/actions` with the head command and `X-Fieldwork-Owner`.
     - Success: check `ownerId === owner` (else stop: "Your account changed. Reload before syncing."), remove the command, publish `result.state` with the remaining queue re-applied on top (commands that no longer apply are skipped silently).
     - Network error (status 0), `409`, `429`, `≥ 500`: **retryable**. Stop syncing, keep the queue, show the error.
     - Any other status (`400`, `401`…): **permanent**. Drop that command ("One change couldn't be saved and was set aside: …") and continue.
   - Then `GET /api/state`, check `ownerId`, publish it with any queued commands re-applied.
4. **Triggers:** launch, every `send`, returning online, app becoming visible (web also broadcasts between tabs).

Offline: commands queue and apply locally; they replay in order when back online. Because `eventId` is idempotent, replaying a command whose response was lost is safe.

Caveat: `shorten`/`move`/`undo` business-rule failures come back as `500` and the web treats them as retryable, so one can block the queue. The iPhone app should cap retries of a single command (e.g. after 3 consecutive `500`s with the same message, set it aside) and should validate these locally before sending.

Other routes that return a new `state` (`/api/import` activate, `/api/plan/week`) replace the local state directly (`w.replace`). After `POST /api/runs/[id] {action:'finish'}` for a plan session, the server adds an `Attempt`; refetch `/api/state` to see it.

---

## 5. Session (runs) lifecycle

Server: `src/lib/server/runs.ts`. Client reference: `src/components/session/use-run.ts`, `runner.tsx`.

### 5.1 `POST /api/runs` — start or resume

Body:

```ts
{
  kind: 'session' | 'review' | 'explore' | 'return' | 'rehearsal';
  sessionId?: string;      // ≤ 100; plan session (session/return)
  minutes?: number;        // int 5..240
  topic?: string;          // 2..400 trimmed; explore: what to explore
  concepts?: string[];     // ≤ 8 keys (≤ 80 each); review: which concepts
  milestone?: string;      // YYYY-MM-DD; rehearsal: the milestone's date
}
```

Response `200`: `{ run: RunView }`. No model call; the outline is instant and beats are generated when reached.

Behaviour:

- With `sessionId`: `404` "That session isn't in your plan." if unknown. An **active run for that session is resumed** (returned as-is) instead of creating a duplicate. A run prepared ahead by the scheduler is opened (its clock starts now) or, if the kind/length differs, abandoned and replaced.
- `kind: 'session'` without `sessionId` becomes `kind: 'explore'` (title = topic or "Exploration").
- `review` with nothing due → `409` "Nothing is due for review right now…". With `concepts`, reviews those (if in the concept map).
- `rehearsal` needs a matching milestone date → else `404`.
- Minutes default: override length → session length → review 10, rehearsal 30, else 20.
- Plan `session`/`return` runs are **adaptive**: they start with 1–4 planned beats, and more are appended as the learner goes (`plan` events, `advance`/`gauge`/`wrap` responses). Other kinds get a fixed outline: review = recall × n + recap; rehearsal = recall ×≤2, check, produce, recap; explore = explain, check (optional), recap (optional).

Web callers then `primeRun(run)` and navigate to `/session/<id>`.

### 5.2 `GET /api/runs` — recent runs

Response: `{ runs: { id: string; kind: RunKind; title: string; status: RunView['status']; session_id: string | null; summary: string | null; started_at: string; ended_at: string | null; minutes_planned: number | null }[] }` (newest first, ≤ 60, includes practice runs).

### 5.3 `GET /api/runs/[id]`

Response: `{ run: RunView }`. `404` "Session not found." `id` must be a UUID (else `400`).

### 5.4 `POST /api/runs/[id]` — actions

Body limit 64 000 bytes. Discriminated by `action`. `beatId` is always ≤ 80 chars.

#### `beat` — generate (or fetch) a beat's content · streaming

```ts
{ action: 'beat'; beatId: string }
```

| Event | Payload |
|---|---|
| `snap` | `{ blocks: Block[] }` (partial) |
| `meta` | `{ tier }` after generation; `{ tier, cached: true }` if the beat already had content |
| `done` | `Beat` with `status: 'ready'` and content: teaching beats `blocks` + `follow_ups`; question beats `blocks` (the question is the last text block) + `question` |

Special cases (no model call, only `done`): beat already has `blocks` → `meta` (cached) + `done`; `break` → `blocks: []`; `gauge` → one text block "Next up: **<concept title>**. <summary>"; `roleplay` → one text block inviting the spoken part (then see §6 with `parent`).

Errors: `404` "Step not found." (in-stream); **`425` "Still preparing this step."** when another request is generating it (< 60 s): wait 1.5 s, `GET` the run, and retry if the beat still has no content (web: up to 20 times). On a generation failure the beat returns to `pending`.

#### `answer` — submit an answer · streaming

```ts
{
  action: 'answer'; beatId: string;
  choice?: number;               // int 0..9 (index into question.options)
  text?: string;                 // ≤ 6000 trimmed
  confidence?: 'low' | 'medium' | 'high';   // asked before feedback when prefs.session.confidence
  unknown?: boolean;             // default false: "I don't know yet" (teach me; no attempt)
  retry?: boolean;               // default false: second try after feedback (text questions, once)
}
```

At least one of `choice`, non-empty `text`, `unknown: true` → else `400` "Write an answer or choose an option." (JSON, before the stream). Beat not ready (no question or key yet) → `409` "This step isn't ready for an answer yet." (in-stream).

| Event | Payload |
|---|---|
| `snap` | `{ feedback: { verdict?: Verdict; blocks: Block[] } }` (verdict appears once known; always `'missed'` for `unknown`) |
| `meta` | `{ tier }` |
| `plan` | `Beat[]`: the run's **complete** beat list after the planner reacted to the verdict (adaptive runs only, optional). Merge by id: keep local content/answers, take the server's list/order. |
| `done` | `Beat` with `response`, `feedback`, `attempts`, `status: 'done'`, and `correct_index` for choice questions |

If the beat already has feedback and `retry` is false (or retry not allowed), `done` returns the existing beat immediately. Scoring: choice answers are anchored (correct ≥ 0.75, wrong ≤ 0.3); `unknown` scores 0.

#### `gauge` — "How familiar is this?"

```ts
{ action: 'gauge'; beatId: string; value: 'new' | 'heard' | 'used' }
```

Response: `{ cursor: number; beats: Beat[] }` (full list, planner extended). `409` if the beat isn't a gauge. Client then moves to the beat after the gauge.

#### `advance` — mark a beat done (or skipped) and move on

```ts
{ action: 'advance'; beatId: string; skip?: boolean /* default false */ }
```

Response: `{ cursor: number; beats?: Beat[] }` (`beats` present when the planner appended steps). Records exposure for teaching beats, clears a running break. Web: moves the index optimistically if the next beat is already known; otherwise waits for `beats`.

#### `wrap` — end early with a recap (adaptive runs)

```ts
{ action: 'wrap'; beatId: string /* current beat */ }
```

Response: `{ beats: Beat[] }`: untouched later steps are replaced by a recap. `409` "This session can't wrap up early." on non-adaptive runs. Web then (if the current beat is not an unanswered question, or is a recap) calls `advance` on the current beat (`skip: true` if it is an unanswered question) and jumps to the recap. `RunView.wrapping` becomes true.

#### `ask` — ask the tutor about a beat · streaming

```ts
{
  action: 'ask'; beatId: string;
  intent: 'why' | 'example' | 'deeper' | 'simpler' | 'visual' | 'free';
  prompt?: string;               // ≤ 2000 trimmed, default ''; required for 'free' unless quote
  quote?: string;                // 2..800 trimmed: a highlighted passage
}
```

`intent: 'free'` with neither `prompt` nor `quote` → `400` "Ask a question first." Chip labels: why "Why?", example "An example, please", deeper "Go deeper", simpler "Say it more simply", visual "Show me". While a question is unanswered the tutor won't reveal the answer.

| Event | Payload |
|---|---|
| `snap` | `{ blocks: Block[] }` |
| `meta` | `{ tier }` |
| `done` | `Ask` (append to `beat.asks`) |

#### `finish`

```ts
{ action: 'finish' }
```

Response: `{ ok: true }`. Idempotent. Stops the clock, sets `status: 'done'`, `ended_at`, `cursor = beats.length`; for a plan session not yet attempted, records an `Attempt` in the workspace. Summary and memory consolidation run afterwards (`summary` appears on later reads).

Web finishing sequence: if the current beat isn't `done`, `advance` it first, then `finish`. A run ends at its `recap` (adaptive) or its last beat (fixed). Leaving an `explore` run that has any `ready`/`answered`/`done` beat also calls `finish`.

### 5.5 `POST /api/runs/[id]/break`

Body: `{ beatId: string /* ≤ 80, a 'break' beat */ }`. Response: `{ until: string /* ISO */ }`. Idempotent while a break is running (returns the same `until`). `409` if not a break beat. The break lasts `beat.minutes`; when it ends and the learner hasn't advanced, the server pushes "Break's over" (key `break:<runId>:<beatId>`, url `/session/<runId>`, gated by `prefs.notify.breaks`). Show a countdown to `until`; `advance` ends the break.

### 5.6 Client flow (per `use-run.ts`)

1. Open with `GET /api/runs/[id]` (or the `RunView` from `POST /api/runs`). Current index = `min(cursor, beats.length - 1)`. Local clock starts from `run.elapsed`; each interaction adds `min(now − last, 12 min)`.
2. For the current beat without content (`blocks` absent and type ≠ `break`): stream `beat`. One in-flight request per beat.
3. Once the current beat has content, **prefetch** the next beat that isn't a `break` and isn't `optional`, after 300 ms (teaching beats) or 900 ms (others).
4. Question beat: optional confidence picker, then `answer`. Show `snap` feedback live; on `plan`, merge beats; on `done`, replace the beat. On failure, restore the beat to `ready` without a response (or, for a retry, restore the previous response/feedback).
5. Gauge beat: three choices → `gauge`. Break beat: `break` + countdown. Roleplay beat: §6 with `parent`.
6. Continue → `advance`; on the last beat → `finish`.
7. Notes on a beat: §8.4. Known terms for linking earlier ideas: `GET /api/notebook?terms=1&run=<id>`.
8. On completion the web shows `GET /api/progress` and `GET /api/mastery?concepts=<keys>&run=<id>` (before/after strengths).

Merge rule for server beat lists: server order and membership win; for a beat present locally, keep local fields, but take the server's `feedback` if the local one is missing, and the more advanced `status` by order `pending < generating < ready < answered < done < skipped`.

---

## 6. Practice

Server: `src/lib/server/practice.ts`, `src/lib/practice/harness.ts`. Client: `src/components/practice/*`, `src/components/session/roleplay.tsx`. Practices are runs with `kind: 'practice'`.

### 6.1 Types

```ts
type Mode = 'debate' | 'conversation' | 'negotiation' | 'pitch' | 'delegation' | 'interview' | 'explain' | 'free';
// Labels: Debate, Hard conversation, Negotiation, Pitch & questions, Delegation, Interview, Explain it, Anything.
type Difficulty = 'gentle' | 'realistic' | 'tough';
type Line = { role: 'user' | 'assistant'; text: string };

type PracticeBrief = {
  title: string;
  partner: {
    name: string; role: string; stance: string; temperament: string;
    pronouns?: string; from?: string; triggers?: string[]; delivery?: string;  // absent on older briefs
  };
  situation: string;            // 2–3 sentences to read before starting
  learner_role: string;
  learner_goal: string;
  opening: string;              // partner's first line
  complications: string[];
  success: string[];            // what good looks like
  prep: string[];               // prompts to think about first
};

type PracticeFeedback = {
  headline: string;
  best: { quote: string; why: string };
  change: string;
  rewrite: { original: string; better: string };
  criteria: { name: string; rating: 'strong' | 'developing' | 'focus'; note: string }[];
  score: number;                // 0..1
  notes?: { line: number /* index into transcript, a user line */; kind: 'strength' | 'change' | 'moment'; note: string }[];
};

type PracticeState = {
  mode: Mode; difficulty: Difficulty; minutes: number; voice: Voice;
  topic: string; side?: string;
  brief: PracticeBrief;
  channel: 'voice' | 'text' | null;
  transcript: Line[];
  seconds?: number;
  feedback?: PracticeFeedback;
  parent?: { runId: string; beatId: string };
  concept?: string;
  resume?: Line[];              // redo: earlier lines, context only
  redo_of?: { id: string; line: number };
};

type PracticeView = {
  id: string; title: string;
  status: 'active' | 'done' | 'abandoned';
  started_at: string;
  practice: PracticeState;
};
```

### 6.2 `GET /api/practice`

Response: `{ practices: { id: string; title: string; status: string; started_at: string; mode: Mode; score: number | null; headline: string | null }[] }` (≤ 20, newest first).

### 6.3 `POST /api/practice` — create (one model call for the brief) or redo

Create body:

```ts
{
  mode: Mode;
  topic: string;               // 3..600 trimmed
  side?: string;               // ≤ 300 trimmed; debate: the learner's position
  difficulty?: Difficulty;     // default 'realistic'
  minutes?: 5 | 8 | 12;        // default 8
  voice?: Voice;               // default 'cedar' (web uses prefs.voice)
  parent?: { runId: string /* uuid */; beatId: string /* ≤ 80 */ };  // roleplay inside a session
}
```

Redo body (tried first; no model call): `{ redo: { from: string /* practice uuid */; line: number /* int 0..600, a user line index */ } }` → `400` "Pick one of your own lines to redo from." if that line isn't the learner's.

Response: `{ practice: PracticeView }`. With `parent`, the parent beat gets `practice: { id, status: 'open' }`.

Roleplay beat inside a session (web `roleplay.tsx`): if `beat.practice?.id` exists, `GET /api/practice/<id>`; else create with `mode` = `negotiation` if the run title matches /negotiat/i, `delegation` if /delegat/i, else `conversation`; `topic` = `"<run.title>. <run.session.objective>"` (≤ 600); `difficulty: 'realistic'`, `minutes: 8`, `voice: 'cedar'`, `parent: { runId, beatId }`. When feedback is written, the parent beat gets `practice.status: 'done'` and a `feedback` (`verdict` from score, one text block "headline change"); the client then `advance`s the beat.

### 6.4 `GET /api/practice/[id]`

Response: `{ practice: PracticeView }`. `404` "Practice not found."

### 6.5 `POST /api/practice/[id]` — actions

Body limit 400 000 bytes.

```ts
| { action: 'live'; sdp: string /* 20..60000 chars: the SDP offer */ }
| { action: 'control'; voiceId: string /* uuid */; op: 'heartbeat' | 'close'; seconds?: number /* 0..3600 */ }
| { action: 'say'; message?: string /* ≤ 3000 trimmed, default '' */ }
| { action: 'feedback'; transcript?: Line[] /* ≤ 600 lines, text ≤ 5000 */ }
```

| Action | Response |
|---|---|
| `live` | `{ voiceId: string; sdp: string /* SDP answer */; limitSeconds: number; plannedSeconds: number }` |
| `control` | `{ status: 'active' \| 'closing' \| 'closed' \| 'unconfirmed' }`; `404` "Conversation not found." |
| `say` | **streaming**: `snap` `{ text: string }` (partner reply so far), `done` `{ reply: string; end: boolean }` |
| `feedback` | `{ feedback: PracticeFeedback }` |

`live` errors: `503` "Voice needs the OpenAI API key on the server.", `409` "Another voice conversation is still open. End it first, or wait a minute.", `502` "Voice is busy right now…" / "The voice session couldn't start…", `429` monthly allowance. `limitSeconds = min(minutes × 60 + 90, 740)`; `plannedSeconds = minutes × 60`.

### 6.6 Text practice

1. On entering the text stage with an empty transcript, send `say` with `message: ''`: the partner opens (reply = opening line; the server stores it).
2. Each learner turn: append the user line locally, send `say` with the text, show `snap.text` as the partner types, append `done.reply`. `done.end: true` means the partner closed the conversation (hide the composer).
3. "End & get feedback" → `feedback` with the visible transcript.

The server keeps the transcript (`channel: 'text'`). Send non-empty messages after the opening.

### 6.7 Voice (GPT-Live over WebRTC)

The server creates the provider session and brokers the SDP; audio flows directly between the device and the provider. A server-side "conductor" attached over the provider sideband opens the conversation, injects complications (at 38 % and 66 % of the planned time) and a wrap-up cue (at `max(planned − 60 s, 80 %)`), enforces the hard limit, and records the transcript and usage.

Client steps (`use-live.ts`):

1. **Microphone:** `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`. iOS: `AVAudioSession` category `.playAndRecord`, mode `.voiceChat`, and the WebRTC audio track with the equivalent constraints.
2. **Peer connection:** `new RTCPeerConnection()` (default configuration, no custom ICE servers). Add the mic track. Handle the remote audio track (`ontrack`) by playing it.
3. **Data channel:** create **`oai-events`** on the client (default options: ordered, reliable) **before** creating the offer.
4. **Offer:** `createOffer()`, `setLocalDescription`, then wait for ICE gathering to complete **or 2.5 s**, whichever comes first (no trickle ICE). Take `localDescription.sdp`.
5. **Exchange:** `POST /api/practice/<id>` with JSON `{ "action": "live", "sdp": "<offer SDP text>" }` and the usual headers (`Authorization`, `Content-Type: application/json`). The SDP travels as a JSON string, not as `application/sdp`.
6. **Answer:** from the JSON response keep `voiceId` and `limitSeconds`; `setRemoteDescription({ type: 'answer', sdp: response.sdp })`. If the screen was left meanwhile, send `control` `close` and tear down.
7. **Data channel messages** (JSON text frames):
   - Received: `session.started` (the call is live: start the clock), `session.input_transcript.delta` / `session.output_transcript.delta` with `delta: string` (append to the last line if same role — input = `user`, output = `assistant` — else start a new line), `session.usage.updated` with `usage: { seconds: number }` (keep for heartbeats), `session.input_audio.muted` / `session.input_audio.unmuted`, `session.closed` (the call ended: release everything), `error`.
   - Sent (only these are allowed): `{"type":"session.input_audio.mute"}`, `{"type":"session.input_audio.unmute"}` (also disable/enable the local track), `{"type":"session.close"}`.
   - The partner speaks first; the client sends nothing to start.
8. **Heartbeat:** while live, every **5 s** `POST {action:'control', voiceId, op:'heartbeat', seconds: <last usage seconds>}`. Never overlap two heartbeats. The server ends the call if it hears nothing for **45 s** (`client-gone`).
9. **Clock and limit:** elapsed = seconds since `session.started` (ticked every 0.5 s). Show time left against `plannedSeconds` (`minutes × 60`). At `elapsed ≥ limitSeconds − 5`, end the call. The server also closes at its hard limit.
10. **Ending:** send `{"type":"session.close"}` on the data channel (if open) and `POST {action:'control', voiceId, op:'close', seconds}`; wait for `session.closed` **up to 8 s**; then stop the mic, close the channel and peer connection. Leaving the screen does the same immediately. A peer connection state of `failed` ends the call ("The audio connection dropped.").
11. **Feedback:** if any user line has text, `POST {action:'feedback', transcript: <client lines, empty ones dropped, text ≤ 5000>}`. The server waits up to 12 s for the conductor to save its (authoritative) transcript, prefers the longer of the two, grades, marks the practice `done` and returns `{ feedback }`. No user lines → `409` "There's nothing to give feedback on yet. Say a few lines first." Calling `feedback` again returns the stored feedback.

After feedback: "Redo from here" on a user line → `POST /api/practice {redo:{from, line}}`; "Again" → `POST /api/practice` with the same `mode/topic/side/difficulty/minutes/voice/parent`.

Whether voice is configured is not exposed by an API; a `503` from `live` means text only.

---

## 7. Tutor, brief and hook

### 7.1 `/api/tutor` — the persistent chat

One thread per account in `public.tutor_messages`, shared by web and iPhone. The server keeps the last 60 messages readable and reads the last 16 as context.

**`GET /api/tutor`** → `{ messages: ChatMessage[] }` (oldest first, ≤ 60).

**`POST /api/tutor`** · streaming · body limit 16 000 bytes

```ts
{
  id: string;          // uuid, chosen by the client for the user message
  reply_id: string;    // uuid, chosen by the client for the tutor reply
  text: string;        // 1..2000 trimmed
  page?: string;       // ≤ 120, default '/': the screen the learner is on (use a TutorRoute)
}
```

The user message is saved before streaming (a resend with the same `id` keeps the first copy). The reply is saved under `reply_id` before `done` is sent.

| Event | Payload |
|---|---|
| `snap` | `{ blocks: Block[] }` (partial; may contain `null`s, filter them) |
| `done` | `{ id: string /* = reply_id */; blocks: Block[]; suggestions: string[] /* ≤ 3 */; actions: TutorAction[] }` |
| `error` | as §1 |

No `meta` events. On failure the user message stays in the thread without a reply; retry by resending the **same** `id` with a new `reply_id` (web: removes its local copies of the last user message and anything after, then resends).

**`PUT /api/tutor`** · body limit 400 000 bytes · one-time move of a device-kept thread:

```ts
{ messages: { id: string /* uuid */; role: 'user' | 'tutor'; text?: string /* ≤ 4000 */;
              blocks?: unknown[] /* ≤ 40 */; suggestions?: string[] /* ≤ 3, ≤ 120 each */;
              at: string /* ISO with offset or Z */ }[] /* ≤ 60 */ }
```

→ `{ imported: boolean }` (false if the account already has messages or the list is empty). The iPhone app doesn't need this unless it kept a thread before syncing.

**`DELETE /api/tutor`** (no body) → `{ cleared: true }`.

Client behaviour (`tutor/store.ts`, `tutor/chat.tsx`): paint the cached thread, `GET` on launch and whenever the app returns to the foreground (skip replacing while a reply is pending). Sending: append the user message and an empty streaming tutor bubble optimistically; fill it from `snap`; on `done` set blocks, suggestions, actions. Chips: starters when empty ("What's on today?", "Quiz me on this week", "Explain the last idea again", "Give me a quick review"), else the last tutor message's `suggestions`. The header has a writing-style picker (writes `prefs.writing`).

Actions (rendered under the reply, in order):

| `type` | Client does |
|---|---|
| `set_writing` | Write `settings:prefs` with `writing` = `action.writing` immediately on `done`; show "✓ Writing style: <label>". |
| `open` | Button labelled `label` (fallback "Open") that navigates to `href` (map each `TutorRoute` to a native tab/screen) and closes the chat. |
| `remember` | Nothing to do: the server already saved `content` as a memory. Show "✓ Saved to memory". |
| `start_today` | Button "Start today's session": close the chat, go to Today and start `today.primary` (web: `/?begin=1`). |

### 7.2 `POST /api/today/brief` — morning brief

Body limit 16 000 bytes:

```ts
{
  date: string;                              // YYYY-MM-DD, the /api/today `date`
  agenda: {                                  // ≤ 6, in order
    label: string;                           // ≤ 160
    kind: string;                            // ≤ 20 (an Action kind)
    minutes: number | null;                  // 0..300
    track: string | null;                    // ≤ 40
  }[];
}
```

Response: `{ brief: { title: string /* ≤ 90 */; note: string /* ≤ 600 */; item_notes: (string | null)[] /* one per agenda item, ≤ 8 words */ } }`.

The web builds the agenda from `/api/today` (`agendaOf` in `today/today.tsx`): the primary action unless `explore`/`practice` (label = review label or `focus.title` or `headline`; minutes = `primary.minutes ?? focus.minutes`; track = `primary.track ?? focus.subject`), then up to 4 total from `secondary`: `review` (if primary isn't review; track `'review'`), `rehearsal` (minutes 30, track `'judgment'`), `practice` (label "Practise it out loud", minutes null, track `'communication'`). It requests a brief only when `phase` is neither `no-plan` nor `done-today`, and caches it per owner + date + agenda for the day. One model call per request; cache it.

### 7.3 `GET /api/today/hook?session=<sessionId>`

`session`: 1..120 chars, a session in the plan (else `404`). Response: `{ hook: string }` (one line ≤ 26 words, or `""`), `Cache-Control: private, max-age=43200`. One model call; cache for the day. Not currently used by the web.

### 7.4 `GET /api/today`

Runs `ensureHorizon` first. Response:

```ts
{
  today: TodayView;
  date: string;                   // local date in the learner's zone
  mapped: boolean;                // concept map built yet
  preview: { type: BeatType; minutes: number }[];   // likely shape of the next session (no gauge), scaled to its length
  insight: { id: string; headline: string } | null; // an unseen weekly insight
  exploring: { id: string; title: string } | null;  // an unfinished exploration (< 3 days)
  recap: { minutes: number; sessions: number; answers: number; ideas: string[] /* ≤ 4 */; more: number } | null;  // today's finished work
  memories: { fresh: number };    // inferred memories since settings:memory.seen_at (or the last day)
}

type Action = {
  kind: 'resume' | 'session' | 'review' | 'return' | 'explore' | 'practice' | 'rehearsal';
  label: string; detail: string;
  sessionId?: string; milestone?: string /* date */; runId?: string; minutes?: number; track?: string;
};
type DayMark = {
  date: string; weekday: string;  // "Mon"
  status: 'done' | 'planned' | 'today' | 'missed' | 'open' | 'skipped' | 'travel' | 'reduced' | 'rest';
  track?: string; title?: string;
};
type TodayView = {
  phase: 'no-plan' | 'before-start' | 'learning-day' | 'rest-day' | 'done-today' | 'after-end';
  greeting: string; headline: string; why: string;
  primary: Action | null;
  secondary: Action[];
  week: { index: number; total: number; days: DayMark[]; done: number; planned: number } | null;
  focus: { title: string; subject: string; objective: string; evidence: string; date: string; minutes: number } | null;
  due: { count: number; minutes: number };
  milestone: { title: string; date: string; days: number } | null;
  startsIn: number | null;
  next: { start: string; ready: boolean; sessions: number; note?: string } | null;  // rolling: next week's draft
};
```

Running an action (web `today.tsx`): `practice` → Practice tab; `resume` with `runId` → open that run; otherwise `POST /api/runs` with `kind` = the action kind if it is `return | review | explore | rehearsal`, else `'session'`, plus `sessionId`, `milestone`, `minutes`, and `topic` (explore).

---

## 8. Learning views

### 8.1 `GET /api/mastery`

Query: `concepts=<comma-separated keys>` (optional), `run=<run uuid>` (optional, with `concepts`).

```ts
type ConceptView = {
  key: string; title: string; track: string; summary: string;
  prerequisites: string[]; sessions: string[] /* session ids */; position: number;
  strength: number;               // 0..1, what they can do now
  recall: number;                 // 0..1, recall probability now
  level: 'new' | 'learning' | 'practiced' | 'solid' | 'mastered';
  due_at: string | null; last_seen_at: string | null;
  successes: number; lapses: number;
  misconceptions: string[];       // unresolved
  model: { p_known: number; stability: number /* days */; exposures: number; last_seen_at: string | null } | null;
  before?: number;                // with ?run: strength before that run
};
```

- With `concepts`: `{ concepts: ConceptView[] }` only.
- No plan: `{ concepts: [], mapped: false, hasPlan: false, evidence: [], practice: [], history: [], weeks: [] }`.
- Otherwise:

```ts
{
  concepts: ConceptView[];
  mapped: boolean; hasPlan: true;
  evidence: { run: string; title: string; date: string; text: string; verdict: string | null }[];  // produce answers
  practice: { id: string; title: string; date: string; mode?: string; score: number | null; headline: string | null }[];
  history: { id: string; kind: RunKind; title: string; date: string; summary: string | null }[];
  weeks: { week: string /* end date */; count: number; solid: number }[];   // 8 weeks, oldest first
  calibration: Record<'low' | 'medium' | 'high', { n: number; right: number }>;
  milestones: { date: string; title: string }[];
}
```

Forgetting projection (client): `retrievability(days) = (1 + days / (9 × stability))^-1` (0.6 if stability ≤ 0 but seen), `strength = clamp(p_known × (0.35 + 0.65 × R))`.

### 8.2 `GET /api/progress`

```ts
{
  xp: number; todayXp: number;
  level: number; floor: number; next: number; into: number; span: number;  // level n needs 50·n·(n−1) total XP
  rank: 'Novice' | 'Apprentice' | 'Practitioner' | 'Analyst' | 'Strategist' | 'Operator' | 'Principal';
  streak: { current: number; best: number; todayDone: boolean; unit: 'day' | 'week' };
  quests: { id: string; label: string; target: number; progress: number; done: boolean; xp: number }[];
  badges: { id: string; label: string; detail: string; earned: boolean }[];
}
```

Hide game elements per `prefs.game`.

### 8.3 `GET /api/notebook`

Without query: `NotebookView`. With `?terms=1` (and optional `&run=<id>` to exclude ideas met only in that run): `{ terms: Term[] }`.

```ts
type NotebookEntry = {
  key: string;                    // concept key, or 'trip:<runId>' for an exploration
  title: string; track: string; trackTitle: string; summary: string;
  offPlan: boolean;               // exploration
  strength: number; level: string; due_at: string | null;
  first_seen: string; last_seen: string;
  explanation: string | null;     // Markdown
  visual: Viz | null;
  words: { text: string; verdict: Verdict | null; step: string; run: string; at: string }[];     // ≤ 6, best first
  asks: { question: string; quote?: string; answer: string; run: string; at: string }[];        // ≤ 8
  notes: { id: string; text: string; quote?: string | null; run: string; beat: string; concept?: string | null; at: string }[];
  sources: { run: string; title: string; kind: string; at: string }[];
  misconceptions: string[];
  shared?: string | null;         // live share token
};
type NotebookView = { entries: NotebookEntry[]; tracks: { id: string; title: string }[] };
type Term = { key: string; title: string; track: string; strength: number; level: string; words: string | null; phrases: string[] /* lowercase */ };
```

### 8.4 `/api/notes`

```ts
type NoteRow = { id: string; run_id: string; beat_id: string; concept_key: string | null; quote: string | null; text: string; created_at: string };
```

- `GET /api/notes?run=<uuid>` → `{ notes: NoteRow[] }` (oldest first).
- `POST /api/notes` body `{ id?: string /* uuid: update */; runId: string /* uuid */; beatId: string /* 1..120 */; text: string /* 1..2000 trimmed */; quote?: string /* ≤ 600 trimmed */ }` → `{ note: NoteRow }`. `404` if the beat isn't in that run.
- `DELETE /api/notes` body `{ id: string }` → `{ ok: true }`.

`503` "Notes need the latest database update." if the table is missing.

### 8.5 `/api/shares`

- `POST` body `{ key: string /* 1..120, a Notebook entry key */; words?: boolean /* default true: include best answer */; name?: boolean /* default false: include first name */ }` → `{ token: string; url: string /* https://<host>/c/<token> */ }`. Replaces any live link for that key. `404` if not in the Notebook.
- `DELETE` body `{ key: string }` → `{ ok: true }` (turns the link off).

### 8.6 `GET /api/portfolio`

JSON (default):

```ts
{
  groups: { title: string; date: string /* '' for the trailing group */;
            items: { run: string; title: string; date: string; brief: string; text: string; verdict: string | null; feedback: string }[] }[];
  count: number;
}
```

`?format=md` returns `text/markdown` as an attachment (`fieldwork-portfolio-<date>.md`).

### 8.7 `GET /api/chapters`

Only used for dated (non-rolling) plans. → `{ names: { id: string; title: string /* ≤ 80 */; outcome: string /* ≤ 300 */ }[] }` (`[]` without a plan). May take one model call the first time.

### 8.8 `/api/insights`

```ts
type GradeKey = 'effort' | 'engagement' | 'consistency' | 'understanding' | 'retention' | 'transfer' | 'calibration' | 'communication';
type InsightReport = {
  headline: string; summary: string; data_note: string | null;
  grades: { key: GradeKey; score: number | null /* 0..100 */; confidence: 'low' | 'medium' | 'high'; label: string; evidence: string }[];
  patterns: { kind: 'strength' | 'watch' | 'observation'; title: string; body: string }[];
  mind: { title: string; body: string }[];
  moment: { quote: string; why: string } | null;
  focus: { title: string; why: string; try: string; adopted?: { memory_id: string; at: string } | null };
  focus_check?: { verdict: 'yes' | 'partly' | 'no' | 'unclear'; note: string } | null;
};
type InsightSummary = {
  id: string; week_start: string; week_end: string;
  status: 'generating' | 'ready' | 'failed';
  seen_at: string | null; created_at: string;
  headline: string | null; focus: string | null;
  grades: { key: GradeKey; score: number | null }[];
};
type InsightRow = {
  id: string; week_start: string; week_end: string;
  status: 'generating' | 'ready' | 'failed';
  metrics: InsightMetrics | {};   // {} while generating
  report: InsightReport | null;   // null for an empty week
  model: string | null; error: string | null;
  seen_at: string | null; created_at: string; updated_at: string;
};
```

`InsightMetrics` is the measured week (`src/lib/insights.ts`): `week {start,end,zone}`, `totals` (minutes, days_active, sessions_started, sessions_finished, reviews, explorations, rehearsals, practices, steps_done, steps_skipped, answers, questions_asked, words_written, words_spoken), `by_day[] {date, minutes, answers, asks}`, `by_hour: number[24]`, `schedule {planned, completed, missed, skipped_by_choice, reduced, optional_steps_taken}`, `answers {total, solid, partial, missed, skipped, avg_score|null, retries, retries_improved, words_written, avg_words|null, by_type: Record<string,{n,avg}>, calibration: Record<'low'|'medium'|'high',{n,right}>}`, `asks {total, by_intent: Record<string,number>, highlighted, examples: string[]}`, `practice[] {mode, difficulty, channel|null, minutes, words_spoken, score|null, headline|null, criteria[] {name, rating}, best|null, finished}`, `concepts {total, touched, levels: Record<string,number>, due, new_misconceptions: string[]}`, `samples[] {step, text, verdict, confidence|null, retried}`, `empty: boolean`.

- `GET /api/insights[?id=<uuid>]` → `{ weeks: InsightSummary[] /* ≤ 26, newest first */; insight: InsightRow | null }` (the requested week, else the newest ready one, else the newest). Unknown `id` → `404`.
- `POST /api/insights`:
  - `{ action: 'generate' }` → `{ id: string; status: 'generating' }`. Only for a first read or to retry a failed newest one; otherwise `409` "Your next read arrives on Monday." / "This week's read is already being written." Poll `GET` until `status` is `ready` or `failed`.
  - `{ action: 'seen'; id }` → `{ ok: true }`.
  - `{ action: 'adopt'; id; on: boolean }` → `{ focus: InsightReport['focus'] }` (latest ready week only; pins the focus as a goal memory). `409` otherwise.
  - `{ action: 'ask'; id; question: string /* 3..300 trimmed */ }` → `{ answer: string }`.

### 8.9 `/api/memory`

```ts
type Memory = {
  id: string;
  kind: 'goal' | 'interest' | 'preference' | 'background' | 'knowledge' | 'episode' | 'style';
  content: string; concept_keys: string[];
  confidence: number; evidence: number;
  status: 'candidate' | 'active' | 'archived';
  pinned: boolean;
  source: 'inferred' | 'user' | 'import';
  source_run?: string | null;
  created_at: string; updated_at: string; last_used_at: string | null;
};
type Style = { depth: number; challenge: number; visual: number; questions: number; examples: number; observations: number }; // 0..1
```

- `GET` → `{ memories: Memory[] /* not archived, pinned first */; style: Style | null; origins: Record<string /* run id */, { title: string; kind: string; at: string }> }`.
- `POST`, review form (tried first): `{ id: string /* uuid */; review: 'keep' | 'dismiss' }` → `{ memory: Memory }` (keep → active; dismiss → archived).
- `POST`, write form: `{ id?: string; kind?: Memory['kind'] /* default 'preference' */; content: string /* 3..600 trimmed */; pinned?: boolean; status?: 'active' | 'archived' }` → `{ memory: Memory }`.
- `DELETE` body `{ id: string }` or `{ all: true }` (also deletes the inferred style) → `{ ok: true }`.

After showing the memory list, write `settings:memory` `{ seen_at: now }`.

---

## 9. Plan import and weekly drafts

### 9.1 `POST /api/import`

Body limit ≈ 4.3 MB:

```ts
{
  action: 'preview' | 'activate';
  filename: string;        // 1..200, must end .json .md .markdown or .txt
  original: string;        // the file text, ≤ 2 MB (2 097 152 bytes UTF-8)
  plan?: Plan;             // activate: the reviewed plan from preview
  eventId: string;         // uuid
}
```

- `preview` → `{ plan: Plan; diff: { added: number; changed: number; removed: number }; uncertain: string[] }`. JSON files (or Markdown with a fenced ```json block) are parsed; other Markdown (≤ 80 000 chars) is read by the model. The result is always converted to a rolling plan. `422` if the Markdown can't be read.
- `activate` (with `plan`) → `{ state: AppState; version: string /* plan version uuid */; diff }`. Replace local state with `state`.

Parse errors come back as `500` with the validation text (it matches the pass-through regex).

### 9.2 `POST /api/plan/week`

Body `{ action: 'draft' | 'redraft' }`: draft next week now (normally automatic Sunday noon), or redraft it after steering (`plan-edit` `steer`). → `{ state: AppState; ownerId: string }`. `409` "Import a plan first." / "That week has already started." One model call.

---

## 10. Account, export, usage

- **`GET /api/account`** → `{ used: number /* USD this month */; limit: number | null; textModel: string; textProvider: 'OpenRouter' | 'OpenAI'; voiceModel: string }`.
- **`DELETE /api/account`** body `{ confirm: 'DELETE MY ACCOUNT' }` → `{ deleted: true }`. `409` while a voice session is still closing (retry later). Afterwards sign out and wipe local data.
- **`GET /api/export`** → JSON attachment (`fieldwork-account.json`): `{ exported_at: string; profiles, plan_versions, workspaces, attempts, lesson_versions, concepts, concept_states, learning_events, runs, memories, learner_profiles, plan_chapters, notes, shares: object[] }`. Treat as an opaque file to save/share.
- **`GET /api/usage`** → `{ total: number; byTier: Record<string, { calls: number; usd: number }>; cacheRate: number; limit: number | null; models: { fast: string; primary: string; reasoning: string; voice: string } }`.

---

## 11. Push

Web push subscriptions and iPhone APNs tokens share one table; an iPhone's key is `apns:<lowercase hex token>`.

- **`GET /api/push`** → `{ key: string }` (VAPID public key, web only). `503` if web push isn't configured.
- **`POST /api/push`**, iPhone:

  ```ts
  { apns: string /* hex, 64..200 chars, /^[0-9a-f]+$/i */; sandbox: boolean /* true for Xcode/debug builds, false for TestFlight/App Store */ }
  ```

  → `{ saved: true; delivering: boolean }` (`delivering` false = the server has no APNs key yet). Idempotent; re-register on every launch and when the token changes.
- **`POST /api/push`**, web: the browser `PushSubscription.toJSON()`: `{ endpoint: string /* https URL on a known push service */; keys: { p256dh: string; auth: string }; expirationTime?: number | null }` → `{ saved: true }`.
- **`DELETE /api/push?apns=<hex token>`** (no body) → `{ deleted: true }`: forgets that iPhone (call on sign-out). Without `?apns`, deletes **every** device for the account.

APNs delivery (`src/lib/server/apns.ts`): topic `co.nhorowitz.fieldwork` (`APNS_TOPIC`), push type `alert`, priority 10, expiry 15 min, `apns-collapse-id` = the notification key. Payload:

```json
{ "aps": { "alert": { "title": "…", "body": "…" }, "sound": "default", "thread-id": "<key prefix before the first ':'>" },
  "url": "/session/…" }
```

Open `url` on tap (map web paths to native screens). Dead tokens (410, BadDeviceToken) are deleted server-side.

| Key | Title | `url` | Gated by `prefs.notify` | When |
|---|---|---|---|---|
| `<date>:morning` | "Fieldwork" | `/` | `morning` | at `settings:reminders.morning` on a planned day, if not started |
| `<date>:followup` | "Fieldwork" | `/` | `nudge` | at `settings:reminders.followup`, if still not started |
| `break:<runId>:<beatId>` | "Break's over" | `/session/<runId>` | `breaks` | when a break ends |
| `insights:<weekStart>` | "Your week, read honestly" | `/insights` | `insights` | Monday morning |
| `week:<weekStart>` | "Next week is ready" | `/learn#next` | `week` | Sunday draft |

Morning/follow-up reminders additionally require `settings:reminders.enabled === true` and `travel !== true`, and respect the quiet hours. Each key is sent at most once per account.

---

## 12. Auth (Supabase)

Supabase Auth REST lives at `{SUPABASE_URL}/auth/v1`. Every request sends:

```
apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json;charset=UTF-8
X-Supabase-Api-Version: 2024-01-01
```

and, for calls that act as the user, `Authorization: Bearer <access_token>`.

Session object (returned by verify endpoints):

```ts
type Session = {
  access_token: string;     // JWT; use as the API bearer token
  token_type: 'bearer';
  expires_in: number;       // seconds (project: 3600)
  expires_at?: number;      // epoch seconds (compute from expires_in if absent)
  refresh_token: string;
  user: { id: string; email?: string; [k: string]: unknown };
};
```

Auth errors are JSON, typically `{ code: number; error_code: string; msg: string }` (older: `{ error, error_description }`).

### 12.1 Email one-time code (8 digits)

Access is by invitation: never create users.

1. **Send:** `POST /auth/v1/otp` body `{ "email": "<email>", "create_user": false, "data": {} }`. The web also passes `redirect_to` for the magic link; the app only needs the code. Treat errors matching `/signup|not allowed|user not found|otp_disabled/i` (in `error_code` or `msg`) as success, so the form doesn't reveal who has access. `429` → "Too many requests. Wait a minute, then try again." Resend cooldown: 60 s.
2. **Verify:** `POST /auth/v1/verify` body `{ "email": "<email>", "token": "<8 digits>", "type": "email" }` → `Session`. Auto-submit when 8 digits are entered. Failure → "That code didn't work. Check the latest email or send a new one." Codes expire after 1 h.
3. **Refresh:** `POST /auth/v1/token?grant_type=refresh_token` body `{ "refresh_token": "…" }` → `Session`. Refresh before `expires_at`.
4. **Sign out:** `POST /auth/v1/logout` with the bearer token; also `DELETE /api/push?apns=<token>` first and wipe local data.

### 12.2 Passkeys (experimental Supabase endpoints)

Relying party: `rp_id = "edu.nhorowitz.co"`, origin `https://edu.nhorowitz.co`, display name "Fieldwork". The iPhone app needs the Associated Domains entitlement `webcredentials:edu.nhorowitz.co`; `https://edu.nhorowitz.co/.well-known/apple-app-site-association` serves `{ "webcredentials": { "apps": ["<TEAM_ID>.co.nhorowitz.fieldwork"] } }` (team defaults to `WB5QDXNHR8`). Use `ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: "edu.nhorowitz.co")`.

All binary values below are **base64url without padding**.

**Sign in (no session needed)**

1. `POST /auth/v1/passkeys/authentication/options` body `{ "gotrue_meta_security": {} }` (what auth-js sends when there is no captcha) →

   ```ts
   { challenge_id: string; expires_at: number;
     options: { challenge: string; timeout?: number; rpId?: string;
                allowCredentials?: { id: string; type: 'public-key'; transports?: string[] }[];
                userVerification?: 'required' | 'preferred' | 'discouraged';
                hints?: string[]; extensions?: object } }
   ```

2. Run the assertion with `options.challenge` (decode base64url to bytes).
3. `POST /auth/v1/passkeys/authentication/verify` body:

   ```ts
   { challenge_id: string;
     credential: {
       id: string; rawId: string;             // credential id (same value)
       type: 'public-key';
       response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string };
       clientExtensionResults: {};            // send {}
       authenticatorAttachment?: 'platform' | 'cross-platform';
     } }
   ```

   → `Session` (fields at the top level, as in §12). Error codes: `passkey_disabled` ("Passkeys aren't switched on yet. Use an email link."), `webauthn_credential_not_found` ("No passkey on this device yet. Sign in by email, then add one in Settings."). A user cancel is silent.

**Register (needs `Authorization: Bearer <access_token>`)**

1. `POST /auth/v1/passkeys/registration/options` body `{}` →

   ```ts
   { challenge_id: string; expires_at: number;
     options: { rp: { id?: string; name: string }; user: { id: string /* base64url */; name: string; displayName: string };
                challenge: string; pubKeyCredParams: { type: 'public-key'; alg: number }[]; timeout?: number;
                excludeCredentials?: { id: string; type: 'public-key'; transports?: string[] }[];
                authenticatorSelection?: { authenticatorAttachment?: string; residentKey?: string; requireResidentKey?: boolean; userVerification?: string };
                attestation?: string; hints?: string[]; extensions?: object } }
   ```

2. Create the credential (`challenge`, `user.id` decoded to bytes, `user.name`).
3. `POST /auth/v1/passkeys/registration/verify` body:

   ```ts
   { challenge_id: string;
     credential: {
       id: string; rawId: string; type: 'public-key';
       response: { clientDataJSON: string; attestationObject: string; transports?: string[] };
       clientExtensionResults: {};
       authenticatorAttachment?: 'platform' | 'cross-platform';
     } }
   ```

   → `{ id: string; friendly_name?: string; created_at: string }`. An "already registered" error means this device already has a passkey for the account.

**Manage (bearer)**

- `GET /auth/v1/passkeys` → `{ id: string; friendly_name?: string; created_at: string; last_used_at?: string }[]`.
- `PATCH /auth/v1/passkeys/<id>` body `{ "friendly_name": "…" /* ≤ 120 */ }` → the updated item.
- `DELETE /auth/v1/passkeys/<id>` → empty body on success.

The web remembers "this device has a passkey" (localStorage `fieldwork-passkey-device = '1'`) to show the passkey button first; do the same in the app.

---

## 13. Public configuration

Public values only; never ship server secrets in the app.

| Name | Value / meaning |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://edu.nhorowitz.co`: API base URL and passkey origin |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (Auth REST at `/auth/v1`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key, sent as `apikey` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push only; not needed on iPhone |

Constants the app shares with the server: email OTP length **8**, passkey RP id **`edu.nhorowitz.co`**, APNs topic / bundle id **`co.nhorowitz.fieldwork`**.

Server-only (for reference, never in the client): `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `AI_*`, `OPENAI_VOICE_MODEL`, `CRON_SECRET`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_TOPIC`, `APPLE_TEAM_ID`, `APP_ALLOWED_ORIGINS`.
