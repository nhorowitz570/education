# AI and voice decisions

Researched and verified September 21, 2026. Provider availability and prices can change.

## Provider split

OpenRouter handles the learning loop: researched lesson generation, tutoring, reasoning/transfer assessment, Markdown interpretation, text role-play, voice feedback, and optional food-image interpretation. Direct OpenAI handles GPT-Live and optional speech transcription/synthesis. The browser never receives either long-lived key.

The default text model is `openai/gpt-5.6-luna`. The OpenRouter model catalog returned $0.20 per million input tokens and $1.20 per million output tokens. Requests require structured-output support, deny providers that collect data under OpenRouter's routing policy, and enforce configured price ceilings. Server-side web search uses one bounded Exa fast search with at most three results. The app reconciles reported `usage.cost`; missing usage leaves the reservation held. Sources: [model catalog](https://openrouter.ai/api/v1/models), [structured output](https://openrouter.ai/docs/guides/features/structured-outputs), [provider selection](https://openrouter.ai/docs/guides/routing/provider-selection), [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [web search](https://openrouter.ai/docs/guides/features/server-tools/web-search).

Lesson URLs are fetched and checked separately from search. Retrieval blocks private-network destinations and pins validated DNS results. The model selects a real source passage, and the server checks its index before storing the claim support. A second quality check can request one repair; a material failure prevents persistence. Public lesson content excludes the answer key. A correct letter with incorrect reasoning is rejected. AI remains fallible: citations and uncertainty remain accessible in the lesson.

## Live transport and cost

GPT-Live has a dedicated session protocol. Fieldwork uses browser WebRTC, a server-mediated SDP handshake, and an authenticated server WebSocket attached to the same Live session. Instructions are supplied at session creation, so there is no separate dashboard agent to configure. Sources: [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [server controls](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live), [session management](https://developers.openai.com/api/docs/guides/live-conversations).

Published voice pricing is $0.05 per minute, billed by the second; backend work is separate. The session API applies a 15-second minimum, which Fieldwork's reservation and settlement code respect. A 10-minute call is approximately $0.50 for the voice layer, plus post-call text assessment. This is a pricing estimate, not a measured monthly bill. Sources: [model](https://developers.openai.com/api/docs/models/gpt-live-1), [pricing](https://developers.openai.com/api/docs/pricing).

The worker monitors usage and explicit close, enforces expiry, and closes sessions when client heartbeats expire. Unconfirmed closure leaves a reservation held. The microphone starts only after Start and browser permission; no background listening or raw-audio retention is implemented.

## Cedar and Willow

Both requested voices were accepted by actual GPT-Live sessions and returned audio. The prompt is maintained in `src/lib/voice.ts` with one shared scenario and a small delivery-specific profile:

| Mode            | Character | Delivery                                                                                                                 |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cedar · male    | Alex      | Relaxed and grounded, direct phrasing, subtle emphasis; no announcer voice or artificial gravitas                        |
| Willow · female | Maya      | Warm and gently expressive, natural regional character; no exaggerated accent, sing-song rhythm, or constant reassurance |

The conversation itself follows the same standards in both modes: one or two short sentences per turn, one question at a time, sparse listening acknowledgments, time for self-correction, and prompt yielding when interrupted. The model stays in a plausible colleague role and saves evaluation until after practice. It never claims to send messages or perform real actions.

OpenAI's current prompting guide recommends distinct sections for backchannels, interruption, and delegation, plus a concise role/tone description. Fieldwork follows that structure. Thinking time is a conversational instruction, not a guaranteed silence timer. Actual interruption timing and subjective sound quality still require a human conversation test. Source: [Prompting GPT-Live](https://developers.openai.com/api/docs/guides/live-prompting).

The recorded-turn fallback is speech-to-text → OpenRouter text → OpenAI TTS. Regular TTS lists Cedar but does not list Willow. The UI therefore offers text fallback for both voices, and recorded speech replies only with Cedar; it never substitutes another female voice without saying so. We have not established that this fallback is cheaper. Source: [TTS voice availability](https://developers.openai.com/api/docs/guides/text-to-speech).

## Evidence and next listening pass

`verification/voice.json` records two real synthetic-silence sessions and their final billed usage. The short WAV samples are generated greetings, not recordings of a user. `verification/webrtc.json` records the browser's successful remote audio track, transcript, and confirmed close. Synthetic silence verifies the transport without capturing the user's microphone; it does not verify recognition of an actual conversation.

For the first human listening pass, try the same delegation in each mode: pause mid-sentence, say “let me think,” interrupt a reply, correct the deadline, and introduce one scope change. Judge intelligibility, natural pacing, interruption recovery, and useful clarification. Assess the learner's meaning and reasoning, never accent, pitch, personality, or neurotypical behavior.
