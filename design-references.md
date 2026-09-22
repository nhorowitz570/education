# Design references
Reviewed September 21, 2026. Actual Mobbin screens and flows were inspected through Mobbin MCP before building the Paper screens.

## Visual direction
Nathan's supplied image is the main visual reference for the revised **Studio** direction: warm off-white canvas, a narrow rounded navigation rail, confident but light typography, pastel subject panels, and a quiet right-hand context panel. The design keeps one next action prominent and puts the rest of today behind a disclosure.

Two compact initial studies are preserved on Paper's first page:
- **Signal:** black, white, yellow, condensed hierarchy. Its next-action emphasis was useful, but its visual intensity was superseded by Nathan's reference.
- **Seminar:** warm neutrals, serif editorial headings, burgundy controls. It had the calmer mood, but less of the approachable education-app character Nathan requested.

**Studio is the selected revision.** It keeps the warmer pacing of Seminar and the decisive next action of Signal, using DM Sans, mint, lavender, peach, and blush to follow the supplied reference. The full desktop and mobile sets are on pages 02 and 03. The two old Signal layout studies are marked Archived.

## Patterns adopted
| Reference inspected | What informed this product |
| --- | --- |
| [Quizlet — mobile continuation](https://mobbin.com/screens/e3067f6b-ea92-4688-a482-22cb28c31b31) | One large continuation action. Today names the objective and duration before anything else. |
| [Superlist — desktop focus](https://mobbin.com/screens/f3c55a25-0602-4a5c-bd59-f69c38d76a1d) and [Amie — desktop schedule](https://mobbin.com/screens/0425c4c2-a329-4a49-910d-751409f30258) | A readable main task lane with explicit time. Secondary schedule context stays out of the primary decision. Overdue-task pressure was not adopted. |
| [Brilliant — desktop explanation flow](https://mobbin.com/flows/29d8be7e-47f8-483e-a5cf-1c0c7c9a288b) | A short problem, optional explanation, and a clear return to the problem. This became situation → reasoning → feedback → changed situation. |
| [Duolingo — mobile lesson progression](https://mobbin.com/flows/7f446798-f87a-4eb5-8cfe-03e817a1290a) | Visible local progress through a lesson. The app shows the immediate sequence without making the whole year's syllabus a game path. |
| [Duolingo — mobile role-play](https://mobbin.com/flows/39a1fe9c-a07b-4001-a6ef-aec7023259e3) and [ChatGPT — desktop voice](https://mobbin.com/flows/be100cd4-ee02-4e2d-87dc-43d23681e4fe) | Scenario first, explicit microphone start, clear mute/end controls, then useful feedback. Preparation, thinking pauses, and a text alternative remain available. |
| [Hevy — workout logging](https://mobbin.com/flows/7b6374ff-8ff6-4d7b-babe-077e72b6ee1f) | One exercise at a time, last performance, sets/reps/load, and a rest timer. Social publishing and competitive comparison were not adopted. |
| [Headspace — desktop progression](https://mobbin.com/screens/81a53f98-3a1e-4b83-bfdb-35089dd9bd00), [Ahead — mobile skills](https://mobbin.com/screens/26e848ed-2272-470d-8a78-8444b98e79eb), and [Mimo — mobile progression](https://mobbin.com/screens/ca7d9736-f766-4786-b2de-cfe08a193040) | Skills and milestones give progress meaning. In Fieldwork, independent answers and later transfer demonstrate a skill; points record practice. |
| [Pipedrive — import detail flow](https://mobbin.com/flows/041cbcfd-0a61-451e-995a-8c5d09713f26) | An inspectable import summary, history, and recovery informed upload → interpretation → activation. The CRM's density was not adopted. |

Additional inspected screens included [Preply](https://mobbin.com/screens/3af9d328-5c6d-447f-b0ef-ede219101e55), [Nibble](https://mobbin.com/screens/2fd67730-8874-4d0d-ae89-945026db9f06), [Teachable](https://mobbin.com/screens/be865fb9-7894-4e03-8262-c14a16d810e3), and [Perplexity Health](https://mobbin.com/screens/20122940-8ac0-4b93-980a-b4ac799c9b5b). Their recommendation density, long course list, or health overview did not fit the central task as well. The desktop workout search did not produce a suitable set logger; Hevy's mobile flow informed the purpose-built desktop workout layout.

## Source checks used in the design
- The supplied plan and JSON determine the dates, schedule, subject order, milestones, and import summary. They are product inputs; the user's later Paper-first instruction and supplied visual reference take precedence over the build brief's sequence.
- The fictional first lesson uses the stable distinction between profit and cash described in the [SEC beginners' guide to financial statements](https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide). Checked September 21, 2026. The studio's numbers are invented teaching examples, not Nathan's business finances. Opening cash and payment timing remain necessary to judge whether bills can be paid.
- The install guidance was checked against [Apple's iPhone Home Screen instructions](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios). The exact browser menu can vary by iOS version.
- The proposed notification behavior follows [WebKit's Home Screen Web Push guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/): feature detection and a user-initiated permission request. This design does not verify an installed PWA or enabled notifications.
- GPT-Live access, transport, model names, and current prices must be checked from official documentation during the approved implementation phase. No API capability or price was inferred from a visual reference.
