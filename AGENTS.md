<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Web and iPhone stay in step

Fieldwork ships as this web app and a native SwiftUI iPhone app in `ios/`. Both talk to the same API (`src/app/api`) and Supabase project, and the owner treats continuity between them as vital.

- **Every user-facing change lands on both in the same change**: a new feature, a changed screen or flow, copy, a setting, a notification, a removed feature. Build the web side, then the iPhone side (`ios/Fieldwork/Features/<Screen>`), using the same copy, data and behaviour.
- **The iPhone has its own look** (see "Look and feel" in `docs/PARITY.md`): system type outside lessons, visual-first screens, short copy, springs. Keep features, data and behaviour identical; use the kit in `ios/Fieldwork/Design` (`Motion.swift`, `Tiles.swift`) rather than porting the web's layout or prose one-to-one. Lessons keep their text and the reader's font.
- If the iPhone side genuinely can't be done in the same change, add a row to the **Gaps** table in `docs/PARITY.md` saying what's missing and why. Don't leave a silent difference.
- Update `docs/PARITY.md` whenever a screen or feature changes on either side.
- **API contracts:** when a route's request or response changes, update `docs/API.md`, the Swift models that decode it, and `ios/Fieldwork/Debug/Fixtures`. Prefer additive, optional fields so older app builds keep working; the app is installed from Xcode or TestFlight, so it can lag the web by days.
- **Design tokens:** `src/styles/tokens.css` is the source. Run `npx tsx scripts/tokens.ts` after changing it; the app compiles `design/tokens/FieldworkTokens.swift` directly.
- **Web-only logic the app mirrors** (sentence streaming, sim formulas, prefs defaults, XP rules, term matching) has matching tests in `tests/` and `ios/FieldworkTests`. Change both together.
- **Checks before calling a change done:** `npm run check` for the web, and `npm run ios:build` (plus the iOS tests: `cd ios && xcodebuild test -project Fieldwork.xcodeproj -scheme Fieldwork -destination 'platform=iOS Simulator,name=Fieldwork iPhone 17 Pro'`) for the app. Look at changed iPhone screens in the simulator; launch with `-demo` to use fixture data without signing in (see `ios/README.md`).
- The iPhone app always talks to production (`https://edu.nhorowitz.co`). A server change the app depends on isn't usable from the phone until it's deployed, and migrations must be applied first.
