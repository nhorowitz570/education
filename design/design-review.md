# Fieldwork — Studio design review
Status: design complete for review; production implementation awaits Nathan's feedback.
Date: September 21, 2026.

[Open Paper](https://app.paper.design/file/01M330NHHR8TDBZH6ARGSW4X8R) · [Desktop page](https://app.paper.design/file/01M330NHHR8TDBZH6ARGSW4X8R/p-2-0) · [Mobile page](https://app.paper.design/file/01M330NHHR8TDBZH6ARGSW4X8R/p-3-0) · [Journey map and interaction notes](https://app.paper.design/file/01M330NHHR8TDBZH6ARGSW4X8R/p-4-0)

## The direction
Studio follows Nathan's supplied education-dashboard reference: warm white, lightly weighted large type, rounded navigation, and restrained mint/lavender/peach/blush panels. The single next action is the visual center. Subject color helps orientation; text and icons carry the meaning too.

The initial Signal and Seminar studies remain available on the first page. Studio is the selected revision following Nathan's reference. Fieldwork is an editable working name, not an assertion of brand availability.

## What to review
The set contains **22 desktop and 31 mobile product artboards**, plus journey and system notes.

| Experience | Desktop | Mobile |
| --- | --- | --- |
| Today, light and dark | D01–D02 | M01–M02 |
| Situation, reasoning, feedback, changed case, saved work | D03–D07 | M03–M07 |
| Voice briefing, preparation, live conversation, feedback | D08–D11 | M08–M11 |
| Weekly learning plan | D12 | M12 |
| Growth overview and guided workout | D13–D14 | M13–M15 |
| Skills, useful work, points, and consistency | D15 | M16, M29 |
| Upload, interpretation, and activated plan | D16–D18 | M17–M19, M27 |
| Shorter day and welcoming return | D19–D20 | M20–M21 |
| Weekly reflection and schedule adjustment | D21–D22 | M22–M23 |
| Offline, install, microphone permission, tutor, sources, check-in | Supporting notes | M24–M26, M28, M30–M31 |

Desktop artboards use a 1440-pixel canvas; mobile uses 390 × 844. D15 extends slightly vertically to keep the complete evidence list visible. This is a responsive composition specification, not a browser resize test.

## Main journey
1. **Today:** “Explain why profit isn't cash · 20 min.” Start the lesson; the rest of today stays collapsed.
2. **Situation:** a fictional studio has sales, incoming cash, and bills with different timing.
3. **Reasoning:** choose what is missing and explain the decision. Optional tutor help stays beside the desktop lesson or on its own mobile screen.
4. **Feedback:** address the specific gap, then try a changed caterer scenario.
5. **Saved:** preserve the attempt, reasoning, and next step. The immediate completion is practice evidence; the later Progress example includes a separate transfer attempt before showing a demonstrated skill.

Shorter days retain the objective with less work. Returning after two missed learning days offers a familiar 20-minute case and explains the future schedule changes, with undo. Earned work stays intact.

## Curriculum fidelity
The JSON contains 36 weeks and 144 sessions, September 28, 2026–June 5, 2027. The normal learning window is Monday–Thursday, 10:00–12:00 in America/Los_Angeles. The first two weeks require one hour; Friday stays open. The proposed December 21–January 3 maintenance window remains editable. Milestones are December 17, March 4, and June 5.

The first lesson follows the supplied profit-versus-cash objective. The delegation role-play follows the communication curriculum. Workout days at 5 pm are proposed. Exercise names, reps, loads, prior performance, responses, transcripts, point totals, and progress shown in the design are illustrative. The workout template needs review against Nathan's restart and shoulder context before it becomes a personalized routine.

## Accessibility and motion
- Primary controls are 52px high; secondary controls target at least 44px. Navigation includes text labels.
- Focus order, visible focus, radio-group behavior, announced save states, focus restoration, and text scaling are specified in the interaction notes. Paper does not prove actual DOM semantics or keyboard operation.
- Final secondary text #5F5A56 has calculated contrast ratios of 6.43:1 on warm white, 5.29:1 on mint/peach, 4.91:1 on lavender, and 4.62:1 on blush.
- Light and dark Today screens were visually checked. Accent panels keep dark text in both themes.
- Proposed motion is a short 160–200ms transition with at most 6px travel. Reduced motion removes travel and continuous animation. A microphone state remains understandable without a moving waveform.
- Final implementation must validate 320px phone widths, tablet layouts, large text, physical touch, screen readers, and keyboard behavior.

## Interaction and platform limits
The Paper toolset and inspected editor expose Design/Theme editing, but no hotspot or transition authoring. The artboards are linked conceptually by a numbered journey map. They are **not a clickable prototype**; button actions and persistence are annotated.

No authentication, Supabase persistence, lesson generation, live voice, calendar connection, notifications, or offline synchronization is functioning in this design file. “Saved” and “connected” presentation states, where shown, illustrate intended behavior. No backend, native app, deployment, or paid service was created.

The implementation remains one responsive web app and installable PWA. Native iOS is a later phase. Voice requires foreground/network support to be verified; the design does not promise background calls. Model choice and quotas remain configurable. The $25–$75/month target is not purchase authorization.

## Review files
- Desktop.pdf: the complete desktop sequence.
- Mobile.pdf: the complete mobile sequence.
- Interaction-notes.pdf: the journey map, accessibility/motion notes, and state guidance.
- previews/: native PNG exports from Paper.
- paper-artboards.json: stable node IDs and dimensions for a later approved build.
- [Design references](../design-references.md): inspected Mobbin flows and source checks.
- [Interaction specification](interaction-spec.md): intended transitions and persistence rules.

The three supplied source files remain unchanged. Review this design before beginning production implementation.
