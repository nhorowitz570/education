import SwiftUI

// The practice room, full screen (practice/room.tsx).
struct PracticeCallView: View {
    let practiceId: String
    @State private var practice: PracticeView?
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: { Image(systemName: "arrow.left").font(.system(size: 17, weight: .medium)).frame(width: 44, height: 44) }
                    .foregroundStyle(FW.Palette.text2)
                    .accessibilityLabel("Back to practice")
                Text(practice?.title ?? "").font(.sans(13, .medium)).foregroundStyle(FW.Palette.text2).lineLimit(1).frame(maxWidth: .infinity)
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.horizontal, 8)
            .background(.bar)
            ScrollView {
                Group {
                    if let practice {
                        PracticeConversation(initial: practice) { next in self.practice = next }
                    } else if let error {
                        Text(error).font(.sans(15)).foregroundStyle(FW.Palette.negative).padding(.top, 48)
                    } else {
                        Skeleton(width: 160, height: 14).padding(.top, 48)
                    }
                }
                .padding(.horizontal, FW.Size.gutter)
                .padding(.top, 20)
                .padding(.bottom, 48)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .screenBackground()
        .task {
            do { practice = try await Practice.get(practiceId) } catch { self.error = error.localizedDescription }
        }
    }
}

struct PracticeFeedbackView: View {
    let practiceId: String
    var body: some View { PracticeCallView(practiceId: practiceId) }
}

// A practice conversation: brief → voice or text → listening back →
// feedback (practice/conversation.tsx). Embedded in a session's roleplay
// step too.
struct PracticeConversation: View {
    @State private var practice: PracticeView
    var embedded = false
    var onReplace: ((PracticeView) -> Void)? = nil
    var onDone: (() -> Void)? = nil
    @State private var phase: Phase
    @State private var error: String?
    @State private var live: LiveCall

    enum Phase { case brief, voice, text, assessing, feedback }

    init(initial: PracticeView, embedded: Bool = false, onReplace: ((PracticeView) -> Void)? = nil, onDone: (() -> Void)? = nil) {
        _practice = State(initialValue: initial)
        self.embedded = embedded
        self.onReplace = onReplace
        self.onDone = onDone
        _phase = State(initialValue: initial.practice.feedback != nil ? .feedback : .brief)
        _live = State(initialValue: LiveCall(practiceId: initial.id))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            switch phase {
            case .brief:
                PracticeBriefView(practice: practice, onVoice: {
                    phase = .voice
                    Task { await live.start() }
                }, onText: { phase = .text })
            case .voice:
                VoiceStage(practice: practice, live: live) { phase = .text }
            case .text:
                TextStage(practice: practice) { t in Task { await assess(t) } }
            case .assessing:
                VStack(spacing: 10) {
                    Building(label: "", compact: true)
                    Text("Listening back").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    Text("Finding your best moment and the one change that matters most.").font(.sans(15)).foregroundStyle(FW.Palette.text2).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 64)
            case .feedback:
                if let f = practice.practice.feedback {
                    PracticeFeedbackPanel(practice: practice, feedback: f, onRedo: { line in try await replace(Practice.redo(from: practice.id, line: line)) }, onAgain: {
                        let p = practice.practice
                        try await replace(Practice.create(.init(mode: p.mode, topic: p.topic, side: p.side, difficulty: p.difficulty, minutes: p.minutes, voice: p.voice, parent: p.parent)))
                    })
                }
            }
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative) }
        }
        .onChange(of: live.status) { _, s in
            guard s == .ended, phase == .voice else { return }
            if live.lines.contains(where: { $0.role == "user" && !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }) {
                Task { await assess(live.lines) }
            } else {
                phase = .brief
                error = live.error ?? "The call ended before you said anything. Try again when you’re ready."
            }
        }
        .onDisappear { live.dispose() }
    }

    private func assess(_ transcript: [PracticeLine]) async {
        phase = .assessing
        error = nil
        struct Body: Encodable { let action = "feedback"; let transcript: [PracticeLine] }
        struct R: Decodable { let feedback: PracticeFeedback }
        do {
            let lines = transcript.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }.map { PracticeLine(role: $0.role, text: String($0.text.prefix(5000))) }
            let r: R = try await API.post("/api/practice/\(practice.id)", Body(transcript: lines))
            practice.status = "done"
            practice.practice.transcript = transcript
            practice.practice.feedback = r.feedback
            phase = .feedback
            Feedback.shared.play(.complete)
            onDone?()
        } catch {
            self.error = error.localizedDescription
            phase = transcript.isEmpty ? .brief : (practice.practice.feedback != nil ? .feedback : .brief)
        }
    }

    // A redo or a fresh try: in place when embedded, otherwise the room swaps.
    private func replace(_ next: PracticeView) {
        live.dispose()
        live = LiveCall(practiceId: next.id)
        practice = next
        phase = .brief
        error = nil
        onReplace?(next)
    }
}

private struct PracticeBriefView: View {
    let practice: PracticeView
    let onVoice: () -> Void
    let onText: () -> Void

    var body: some View {
        let p = practice.practice
        let b = p.brief
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 12) {
                Text(String(b.partner.name.prefix(1)))
                    .font(.sans(18, .semibold)).foregroundStyle(FW.Palette.text)
                    .frame(width: 48, height: 48).background(FW.Palette.surface2, in: .circle)
                VStack(alignment: .leading, spacing: 2) {
                    Text(b.partner.name).font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    Text(b.partner.role).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                }
                Spacer()
                Text(PracticeMode.label(p.mode)).font(.sans(13)).foregroundStyle(FW.Palette.text2)
                    .padding(.horizontal, 10).frame(height: 28).background(FW.Palette.surface, in: .capsule)
            }
            if let resume = p.resume, !resume.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Kicker("Redo from partway through")
                    Text("\(b.partner.name) picks up where you left off\(resume.last?.role == "assistant" ? ":" : ".")").font(.sans(15)).foregroundStyle(FW.Palette.text)
                    if let last = resume.last, last.role == "assistant" {
                        Text("“\(last.text)”").font(.serif(18)).foregroundStyle(FW.Palette.text)
                    }
                }
                .card(FW.Radius.base, fill: FW.Palette.communication.opacity(0.09), padding: 16)
            }
            Text(b.situation).font(.serif(20)).foregroundStyle(FW.Palette.text).lineSpacing(4)
            VStack(alignment: .leading, spacing: 0) {
                fact("Your goal", b.learner_goal)
                fact("They’re coming in with", b.partner.stance)
            }
            if !b.prep.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Kicker("Before you start")
                    ForEach(b.prep, id: \.self) { x in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("•").foregroundStyle(FW.Palette.text3)
                            Text(x).foregroundStyle(FW.Palette.text2)
                        }
                        .font(.sans(15))
                    }
                }
            }
            VStack(spacing: 10) {
                Button(action: onVoice) { Label("Start talking", systemImage: "mic.fill").frame(maxWidth: .infinity) }
                    .buttonStyle(.fw(.primary, wide: true))
                Button("Type instead", action: onText).buttonStyle(.fw(.secondary, wide: true))
                Text("About \(p.minutes) min · \(Voice.all.first { $0.id == p.voice }?.label ?? p.voice.capitalized) · \(p.difficulty)")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }
        }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.sans(13)).foregroundStyle(FW.Palette.text3)
            Text(value).font(.sans(15)).foregroundStyle(FW.Palette.text)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rule() }
    }
}

// The call: the partner's orb, captions, mute and end.
private struct VoiceStage: View {
    let practice: PracticeView
    let live: LiveCall
    let onFallback: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breathe = false

    var body: some View {
        let b = practice.practice.brief
        let planned = practice.practice.minutes * 60
        let left = max(0, planned - live.elapsed)
        let captions = Array(live.lines.suffix(3))
        VStack(spacing: 18) {
            HStack {
                Text(b.partner.name).font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                Spacer()
                Text("\(left / 60):\(String(format: "%02d", left % 60))").font(.sans(22)).foregroundStyle(FW.Palette.text2).monospacedDigit()
                    .accessibilityLabel("\(Int((Double(left) / 60).rounded(.up))) minutes left")
            }
            ZStack {
                Circle()
                    .strokeBorder(FW.Palette.text.opacity(0.08 + live.levels.me * 0.6), lineWidth: 1.5)
                    .frame(width: 180, height: 180)
                    .scaleEffect(1 + live.levels.me * 0.18)
                Circle()
                    .fill(RadialGradient(colors: [FW.Palette.surface3, FW.Palette.surface], center: .init(x: 0.35, y: 0.3), startRadius: 0, endRadius: 100))
                    .frame(width: 140, height: 140)
                    .overlay(Text(String(b.partner.name.prefix(1))).font(.sans(40, .medium)).foregroundStyle(FW.Palette.text2))
                    .shadow(color: FW.Palette.text.opacity(0.1 + live.levels.them * 0.35), radius: 10 + live.levels.them * 35)
                    .scaleEffect(live.status == .live ? 1 + live.levels.them * 0.12 : (breathe ? 1.03 : 0.97))
            }
            .frame(height: 220)
            .animation(.linear(duration: 0.09), value: live.levels.them)
            .onAppear { if !reduceMotion { withAnimation(.easeInOut(duration: 1.2).repeatForever()) { breathe = true } } }
            Text(status).font(.sans(15)).foregroundStyle(FW.Palette.text2).accessibilityAddTraits(.updatesFrequently)
            VStack(spacing: 8) {
                ForEach(Array(captions.enumerated()), id: \.offset) { i, l in
                    Text(l.text)
                        .font(.serif(19))
                        .foregroundStyle(l.role == "user" ? FW.Palette.text2 : FW.Palette.text)
                        .multilineTextAlignment(.center)
                        .opacity(0.45 + Double(i) / Double(max(1, captions.count - 1)) * 0.55)
                }
            }
            .frame(minHeight: 120, alignment: .bottom)
            HStack(spacing: 12) {
                Button { live.toggleMute() } label: {
                    Image(systemName: live.muted ? "mic.slash.fill" : "mic.fill").font(.system(size: 20))
                        .frame(width: 54, height: 54)
                        .foregroundStyle(live.muted ? FW.Palette.onAccent : FW.Palette.text)
                        .background(live.muted ? FW.Palette.accent : FW.Palette.surface2, in: .circle)
                }
                .buttonStyle(.plain)
                .disabled(live.status != .live)
                .accessibilityLabel(live.muted ? "Unmute" : "Mute")
                Button("End conversation") {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    Task { await live.end() }
                }
                .font(.sans(16, .medium))
                .foregroundStyle(FW.Palette.text)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(FW.Palette.negative.opacity(0.16), in: .capsule)
                .disabled(live.status == .ending)
            }
            if live.status == .error, let e = live.error {
                VStack(spacing: 10) {
                    Text(e).font(.sans(14)).foregroundStyle(FW.Palette.text2).multilineTextAlignment(.center)
                    HStack {
                        Button("Try again") { Task { await live.start() } }.buttonStyle(.fw(.secondary, small: true))
                        Button("Practise in text", action: onFallback).buttonStyle(.fw(.ghost, small: true))
                    }
                }
            }
        }
        .frame(minHeight: 560)
    }

    private var status: String {
        switch live.status {
        case .connecting, .idle: "Connecting…"
        case .ending: "Wrapping up…"
        case .live:
            live.muted ? "Muted" : live.levels.them > 0.08 ? "\(practice.practice.brief.partner.name) is speaking" : live.levels.me > 0.08 ? "You’re speaking" : "Listening"
        default: ""
        }
    }
}

// Text practice: the partner opens, then turn by turn.
private struct TextStage: View {
    let practice: PracticeView
    let onEnd: ([PracticeLine]) -> Void
    @State private var lines: [PracticeLine] = []
    @State private var streaming: String?
    @State private var draft = ""
    @State private var busy = false
    @State private var closed = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        let name = practice.practice.brief.partner.name
        VStack(alignment: .leading, spacing: 16) {
            ForEach(Array((practice.practice.resume ?? []).suffix(4).enumerated()), id: \.offset) { _, l in
                turn(l.role == "user" ? "You · earlier" : "\(name) · earlier", l.text, user: l.role == "user").opacity(0.5)
            }
            ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                turn(l.role == "user" ? "You" : name, l.text, user: l.role == "user")
            }
            if let s = streaming { turn(name, s.isEmpty ? "…" : s, user: false) }
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative) }
            VStack(spacing: 10) {
                TextField(closed ? "The conversation reached a close." : "Say it the way you would out loud…", text: $draft, axis: .vertical)
                    .lineLimit(2...6)
                    .font(.sans(16))
                    .focused($focused)
                    .disabled(closed)
                HStack {
                    Button("End & get feedback") { onEnd(lines) }
                        .buttonStyle(.fw(.secondary, small: true))
                        .disabled(!lines.contains { $0.role == "user" } || busy)
                    Spacer()
                    Button { Task { await say(draft) } } label: { Label("Send", systemImage: "arrow.up") }
                        .buttonStyle(.fw(.primary, small: true))
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy || closed)
                }
            }
            .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 12)
        }
        .task {
            lines = practice.practice.transcript
            if lines.isEmpty { await say("", opening: true) }
        }
    }

    private func turn(_ who: String, _ text: String, user: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(who.uppercased()).font(.sans(12, .semibold)).tracking(0.5).foregroundStyle(FW.Palette.text3)
            Text(text).font(.serif(18)).foregroundStyle(user ? FW.Palette.text2 : FW.Palette.text).lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private func say(_ text: String, opening: Bool = false) async {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard opening || !message.isEmpty else { return }
        busy = true
        error = nil
        if !opening {
            withAnimation { lines.append(PracticeLine(role: "user", text: message)) }
            draft = ""
        }
        streaming = ""
        defer { busy = false; streaming = nil }
        struct Body: Encodable { let action = "say"; let message: String }
        do {
            let done = try await API.stream("/api/practice/\(practice.id)", Body(message: message), handlers: .init(onSnap: { d in
                streaming = d["text"]?.string ?? streaming
            }))
            withAnimation { lines.append(PracticeLine(role: "assistant", text: done["reply"]?.string ?? "")) }
            if done["end"]?.bool == true { closed = true }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// How it went: headline, best line, one change, rewrite, criteria, replay.
private struct PracticeFeedbackPanel: View {
    let practice: PracticeView
    let feedback: PracticeFeedback
    let onRedo: (Int) async throws -> Void
    let onAgain: () async throws -> Void
    @State private var open: Bool
    @State private var lit: Int?
    @State private var busy: Int?
    @State private var again = false
    @State private var error: String?

    init(practice: PracticeView, feedback: PracticeFeedback, onRedo: @escaping (Int) async throws -> Void, onAgain: @escaping () async throws -> Void) {
        self.practice = practice
        self.feedback = feedback
        self.onRedo = onRedo
        self.onAgain = onAgain
        _open = State(initialValue: !(feedback.notes ?? []).isEmpty)
    }

    var body: some View {
        let f = feedback
        VStack(alignment: .leading, spacing: 22) {
            Kicker("How it went")
            Text(f.headline).font(.sans(23, .medium)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 8) {
                Text("“\(f.best.quote)”").font(.serif(24)).foregroundStyle(FW.Palette.text).lineSpacing(4)
                Text(f.best.why).font(.sans(15)).foregroundStyle(FW.Palette.text2)
            }
            section {
                Kicker("One change")
                Text(f.change).font(.sans(16)).foregroundStyle(FW.Palette.text)
            }
            section {
                Text("You said").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                Text(f.rewrite.original).font(.sans(15)).foregroundStyle(FW.Palette.text3).strikethrough(color: FW.Palette.text.opacity(0.25))
                Text("Stronger").font(.sans(13)).foregroundStyle(FW.Palette.text3).padding(.top, 6)
                Text(f.rewrite.better).font(.serif(19)).foregroundStyle(FW.Palette.text)
            }
            VStack(spacing: 0) {
                ForEach(f.criteria, id: \.name) { c in
                    HStack(alignment: .top, spacing: 12) {
                        Dot(color: c.rating == "strong" ? FW.Palette.positive : c.rating == "developing" ? FW.Palette.caution : FW.Palette.negative).padding(.top, 6)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.name).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                            Text(c.note).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        }
                        Spacer(minLength: 8)
                        Text(c.rating == "strong" ? "Strong" : c.rating == "developing" ? "Developing" : "Focus here").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    }
                    .padding(.vertical, 10)
                }
            }
            if !practice.practice.transcript.isEmpty { replay }
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative) }
            Button {
                again = true
                Task {
                    do { try await onAgain() } catch { self.error = error.localizedDescription }
                    again = false
                }
            } label: { HStack { if again { ProgressView() }; Text("Try it again") } }
            .buttonStyle(.fw(.secondary))
            .disabled(again)
        }
    }

    private func section<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8, content: content)
            .padding(.top, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) { Rule() }
    }

    private var replay: some View {
        let lines = practice.practice.transcript
        let notes = feedback.notes ?? []
        let name = practice.practice.brief.partner.name
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Kicker("Replay")
                Spacer()
                Button(open ? "Hide transcript" : "Show transcript") { withAnimation { open.toggle() } }
                    .font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text2)
            }
            ScrollViewReader { proxy in
                VStack(alignment: .leading, spacing: 12) {
                    GeometryReader { geo in
                        let words = lines.map { max(1, $0.text.split(separator: " ").count) }
                        let total = CGFloat(words.reduce(0, +))
                        let gaps = CGFloat(max(0, lines.count - 1)) * 2
                        HStack(alignment: .bottom, spacing: 2) {
                            ForEach(Array(lines.enumerated()), id: \.offset) { i, l in
                                let n = notes.first { $0.line == i }
                                Button {
                                    withAnimation { open = true; lit = i }
                                    Task {
                                        try? await Task.sleep(for: .milliseconds(150))
                                        withAnimation { proxy.scrollTo("line-\(i)", anchor: .center) }
                                        try? await Task.sleep(for: .seconds(1.6))
                                        withAnimation(.easeOut(duration: 0.6)) { if lit == i { lit = nil } }
                                    }
                                } label: {
                                    VStack(spacing: 2) {
                                        Circle().fill(n.map { noteColor($0.kind) } ?? .clear).frame(width: 7, height: 7)
                                        RoundedRectangle(cornerRadius: 3)
                                            .fill(l.role == "user" ? FW.Palette.communication.opacity(0.55) : FW.Palette.surface3)
                                            .frame(height: l.role == "user" ? 22 : 14)
                                    }
                                    .frame(width: max(5, (geo.size.width - gaps) * CGFloat(words[i]) / total))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(l.role == "user" ? "You" : name): \(l.text.prefix(80))\(n.map { " (note: \(noteLabel($0.kind)))" } ?? "")")
                            }
                        }
                        .frame(height: 34, alignment: .bottom)
                    }
                    .frame(height: 34)
                    HStack(spacing: 14) {
                        legend(FW.Palette.communication, "You")
                        legend(FW.Palette.surface3, name)
                        if !notes.isEmpty {
                            HStack(spacing: 5) { Circle().fill(FW.Palette.text).frame(width: 7, height: 7); Text("Notes") }
                        }
                    }
                    .font(.sans(12)).foregroundStyle(FW.Palette.text3)
                    if open {
                        VStack(alignment: .leading, spacing: 6) {
                            if !(practice.practice.resume ?? []).isEmpty {
                                Text("Picked up partway through an earlier conversation.").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            }
                            ForEach(Array(lines.enumerated()), id: \.offset) { i, l in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text((l.role == "user" ? "You" : name).uppercased()).font(.sans(12, .semibold)).tracking(0.5).foregroundStyle(FW.Palette.text3)
                                    Text(l.text).font(.serif(18)).foregroundStyle(l.role == "user" ? FW.Palette.text2 : FW.Palette.text)
                                    ForEach(notes.filter { $0.line == i }, id: \.note) { n in
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(noteLabel(n.kind)).font(.sans(12, .semibold)).foregroundStyle(noteColor(n.kind))
                                            Text(n.note).font(.sans(15)).foregroundStyle(FW.Palette.text)
                                        }
                                        .padding(10)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(FW.Palette.raised, in: .rect(cornerRadius: 11))
                                        .overlay(alignment: .leading) { Rectangle().fill(noteColor(n.kind)).frame(width: 2) }
                                    }
                                    if l.role == "user" {
                                        Button {
                                            busy = i
                                            Task {
                                                do { try await onRedo(i) } catch { self.error = error.localizedDescription }
                                                busy = nil
                                            }
                                        } label: {
                                            HStack(spacing: 5) {
                                                if busy == i { ProgressView().controlSize(.mini) } else { Image(systemName: "arrow.clockwise").font(.system(size: 12)) }
                                                Text("Redo from here")
                                            }
                                        }
                                        .font(.sans(13))
                                        .foregroundStyle(FW.Palette.text3)
                                        .disabled(busy != nil)
                                    }
                                }
                                .padding(.vertical, 10)
                                .padding(.horizontal, 12)
                                .background(lit == i ? FW.Palette.surface : .clear, in: .rect(cornerRadius: FW.Radius.base))
                                .id("line-\(i)")
                            }
                        }
                    }
                }
            }
        }
        .padding(.top, 18)
        .overlay(alignment: .top) { Rule() }
    }

    private func legend(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 5) { RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 6); Text(label) }
    }

    private func noteColor(_ kind: String) -> Color {
        kind == "strength" ? FW.Palette.positive : kind == "change" ? FW.Palette.caution : FW.Palette.review
    }
    private func noteLabel(_ kind: String) -> String {
        kind == "strength" ? "Worked" : kind == "change" ? "Change" : "Turning point"
    }
}

// The spoken part of a session: a practice built from the session's own
// scenario, embedded in place (session/roleplay.tsx).
struct RoleplayView: View {
    let run: RunView
    let beat: Beat
    @Environment(SessionModel.self) private var model
    @State private var practice: PracticeView?
    @State private var error: String?

    var body: some View {
        Group {
            if let practice {
                PracticeConversation(initial: practice, embedded: true, onReplace: { self.practice = $0 }) {
                    Task { await model.next() }
                }
                .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 20)
            } else if let error {
                Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative)
            } else {
                Building(label: "Casting your counterpart")
            }
        }
        .task(id: beat.id) {
            do {
                if let id = beat.practice?.id {
                    practice = try await Practice.get(id)
                } else {
                    let title = run.title
                    let mode = title.range(of: "negotiat", options: .caseInsensitive) != nil ? "negotiation" : title.range(of: "delegat", options: .caseInsensitive) != nil ? "delegation" : "conversation"
                    practice = try await Practice.create(.init(mode: mode, topic: String("\(title). \(run.session?.objective ?? "")".prefix(600)),
                                                                difficulty: "realistic", minutes: 8, voice: "cedar", parent: .init(runId: run.id, beatId: beat.id)))
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
