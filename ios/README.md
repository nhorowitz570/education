# Fieldwork for iPhone

A native SwiftUI app (iOS 27+) for the same account as the web app. It calls the same API on `https://edu.nhorowitz.co` with the Supabase access token (`Authorization: Bearer …`), so everything a learner does on one shows up on the other. The contracts it relies on are in [`docs/API.md`](../docs/API.md); what exists on each side is in [`docs/PARITY.md`](../docs/PARITY.md).

## Open and run

```sh
brew install xcodegen      # once
npm run ios:open           # generates Fieldwork.xcodeproj from project.yml and opens it
```

The Xcode project is generated from `project.yml` and isn't committed; run `npm run ios:project` after adding or removing files. Signing uses team `WB5QDXNHR8` and bundle id `co.nhorowitz.fieldwork` (widget: `co.nhorowitz.fieldwork.widget`, app group `group.co.nhorowitz.fieldwork`).

- **Demo mode (simulator):** in Xcode, Product → Scheme → Edit Scheme → Run → Arguments, add `-demo`. The app skips sign-in and answers every request from `Fieldwork/Debug/Fixtures`. Add `-done` to open finished sessions, `-feedback` to open practices with feedback. Debug builds only.
- **Tests:** `xcodebuild test -project Fieldwork.xcodeproj -scheme Fieldwork -destination 'platform=iOS Simulator,name=Fieldwork iPhone 17 Pro'`.

## Layout

| Path | What |
| --- | --- |
| `Fieldwork/App` | Entry point, tabs (Today · Practice · Tutor · Notebook · You), routing by web path, Siri/Shortcuts intents, public config |
| `Fieldwork/Core` | Auth (passkeys + email code via Supabase), API client with NDJSON streaming, synced workspace store, prefs, push, sound and haptics, models |
| `Fieldwork/Design` | Darkroom typography, components, Markdown blocks and the native visual renderers |
| `Fieldwork/Features` | One folder per screen, mirroring `src/components` |
| `FieldworkWidget` | Home Screen widget (today's session, weekly streak) |
| `Shared` | Code used by the app and the widget |
| `../design/tokens/FieldworkTokens.swift` | Colours, radii and motion generated from `src/styles/tokens.css` |

## Services

- **Passkeys** use the web's relying party, `edu.nhorowitz.co`, through `webcredentials` in the entitlements and `/.well-known/apple-app-site-association` on the site. Passkeys made in Safari work here and the other way round (iCloud Keychain).
- **Email code** is Supabase's 8-digit email OTP.
- **Push** registers the APNs device token with `POST /api/push {apns, sandbox}`. The server sends through APNs when `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_PRIVATE_KEY` are set in Vercel, with the same per-kind switches as web push. Builds run from Xcode register sandbox tokens; TestFlight/App Store builds register production ones.
- **Voice practice** uses WebRTC (`stasel/WebRTC`) to GPT-Live, with the SDP exchanged through `/api/practice/<id>`; no key lives in the app.
- **Secrets never ship in the app.** `App/Config.swift` holds only public values (site URL, Supabase URL and publishable key).
