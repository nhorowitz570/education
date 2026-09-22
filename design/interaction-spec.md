# Studio interaction specification
These are intended product behaviors, not working integrations in Paper. The canvas map uses the same D/M screen identifiers.

## Routes and transitions
| Trigger | Destination or behavior |
| --- | --- |
| D01/M01 Start lesson | D03/M03; retrieve the persisted lesson or generate once and persist it. |
| D03/M03 continue | D04/M04; capture the learner's answer before revealing suggested reasoning. |
| D04/M04 submit | D05/M05; preserve the original answer, show specific feedback. |
| D05/M05 try another situation | D06/M06; a changed example checks immediate transfer. |
| D06/M06 finish | D07/M07; save attempt and feedback once; distinguish local pending save from server sync. |
| D07/M07 done | Today; advance the next action. Later Progress shows skill evidence only when the later independent transfer condition is met. |
| Ask tutor | D04 side panel or M28; return to the same question and draft. Help received is recorded so it is not counted as independent assessment. |
| Show sources | D03 contextual source information or M30; display title, URL, checked date, claim support, and uncertainty. |
| Make it shorter | D19/M20; preview what stays, moves, and drops, then apply with undo. |
| Return after missed learning days | D20/M21; 20-minute restart, preserved progress, no automatic extra session tomorrow. |
| Learn | D12/M12; show the current week and major milestones, with M29 for detail. |
| Adjust week | D22/M23; preview a future schedule change. A completed attempt cannot be undone by schedule undo. |
| Start voice practice | D08/M08 → D09/M09; scenario and editable preparation. No microphone yet. |
| Start conversation | Request permission, then D10/M10. Permission failure opens M26 with recovery and text alternative. |
| End conversation | Close audio/session resources, then D11/M11. One strength, one useful retry. |
| Growth | D13/M13; workout D14/M14; food/social M15. |
| Import a plan | D16/M17 → D17/M18 → D18/M19. Essential missing fields use M27 before activation. |
| Add to Home Screen | M25; platform-specific instructions, then voluntary reminder setup. |
| Offline | M24; cached material remains readable if available. New AI/voice and current retrieval require internet. |
| Morning check-in | M31; energy, mood, and available time; close back to Today. |
| Weekly reflection | D21/M22 inside Thursday's block; save a few lines and optionally adjust next week. |

## Navigation and focus
Use native buttons and links with descriptive accessible names. The four destinations are Today, Learn, Growth, and Progress. Secondary calendar, settings, profile, and import controls do not become a fifth primary tab.

Keep primary actions near the task. Desktop buttons fit their label with a comfortable minimum width. Mobile forms can use full-width actions. Every tappable text affordance has a minimum 44 × 44 hit area even when its visible label is smaller.

Tab order follows the visual reading order. Opening a dialog or mobile tutor moves focus to its title; closing returns focus to the launcher. Escape closes dismissible overlays without discarding drafts. Radio choices use a single tab stop and arrow keys. Never move focus merely because feedback or a background save arrived. Announce save/error results politely. Errors identify both the field and a correction.

A visible focus ring uses a high-contrast outer ring with separation from dark button surfaces. Text remains legible at larger sizes, with panels growing vertically. A 320px viewport must not scroll sideways.

## Responsive layout
At wide widths, use the compact rail, flexible main lane, and optional 304px context panel. Reading and input blocks should keep comfortable line lengths rather than stretching body paragraphs across a large display. Collapse the context panel below the task at medium widths; move persistent navigation to the bottom on narrow screens. Do not shrink a three-column desktop layout onto a phone.

Respect browser/PWA safe areas and keyboard insets. Primary buttons must remain reachable when the software keyboard is open. Lesson and voice headers offer Save & exit; a PWA does not need browser chrome drawn into its content.

## Saving, imports, and schedule changes
Show Saving → Saved when acknowledged. Offline completion displays Saved on this device / Sync pending, and reconciles idempotently on reconnection or foreground open. A server failure offers retry without losing the answer. “Saved on all devices” requires a server acknowledgement and appropriate synchronization evidence.

Keep draft answers and workout sets through navigation. A duplicate completion cannot award points twice. Retries improve feedback, not the point count. Clear per-account local data on logout/account switch.

Import is a preview before activation. Show dates, time zone, workload, subjects, milestones, and uncertain fields. Original uploads and immutable versions stay private. A reimport shows a diff and preserves stable IDs and completed evidence. Identical content does not create another plan version. Imported prose is untrusted content, not authority to run tools or alter account ownership.

Every schedule revision explains its reason and what changed. Undo remains available in history after a toast disappears. It affects future schedule only, checks intervening edits, and preserves finished work. A shortened session is recorded as reduced practice; do not silently claim complete curriculum coverage after dropping material.

## Voice and growth
Preparation notes stay visible during voice practice. Microphone state is always explicit. Longer thinking pauses are configurable. Mute, End, and a text alternative remain available. A disconnect stops or expires the paid session server-side; a client timer alone is insufficient. Transcript retention is voluntary and editable, raw audio is not stored by default.

Workout logging shows one exercise and its sets with last performance. Rest can be skipped, an exercise substituted, or the session shortened. Comfort/discomfort changes any progression suggestion. Never automatically raise load from reps alone.

Food is a few protein/produce taps and an optional photo, not mandatory calorie accounting. Social challenges mark an attempt without grading personality. Reflection and points never punish missed days.

## Motion and accessibility checks for implementation
Use a 160–200ms opacity/position transition, maximum 6px travel, for task transitions. Keep focus stable. Honor prefers-reduced-motion by removing travel and continuous waveform movement; state labels remain. Completion feedback should be brief and must not block Done. Avoid count-up animations and infinite decorative motion.

Measure text and control contrast in the rendered app, including hover/focus/disabled/error states. Verify keyboard-only completion of import, lesson, schedule undo, and workout logging. Test text scaling and a screen reader. The Paper file supports visual review; it is not evidence that these behaviors have passed runtime tests.

## Proposed implementation contracts
Use separate authenticated accounts and private plan versions. All user-owned data needs server authorization and database/storage ownership checks. Tutor memory must be inspectable, editable, and deletable, including derived retrieval entries. Settings must expose reminders, retention, connection status, memory, export/delete, and model/budget controls.

Do not infer paid API access from ChatGPT access. Evaluate GPT-Live using then-current official documentation and prices after design approval, retaining a configurable provider alternative. Set quotas before requests and reconcile actual usage. Calendar reads busy intervals first; manual scheduling works without a connection. Notifications are permission-based and best-effort.

No contract in this document is a claim of implementation or integration verification.
