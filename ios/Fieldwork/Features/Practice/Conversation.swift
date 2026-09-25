import SwiftUI

// The practice room, full screen (practice/room.tsx).
struct PracticeCallView: View {
    let practiceId: String
    var body: some View {
        NavigationStack { PracticeRoom(practiceId: practiceId, closable: true) }
    }
}

// A finished practice pushed onto a stack keeps that stack's back button.
struct PracticeFeedbackView: View {
    let practiceId: String
    var body: some View { PracticeRoom(practiceId: practiceId, closable: false) }
}

private struct PracticeRoom: View {
    let practiceId: String
    let closable: Bool
    @State private var practice: PracticeView?
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            if let practice {
                PracticeConversation(initial: practice) { next in self.practice = next }
            } else if let error {
                ContentUnavailableView {
                    Label("Couldn’t open this practice", systemImage: "exclamationmark.bubble.fill")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await load() } }.buttonStyle(.fw(.secondary, small: true))
                }
            } else {
                ProgressView().controlSize(.large).tint(FW.Palette.text3)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenBackground()
        .navigationTitle(practice?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if closable {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Back to practice", systemImage: "xmark") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        error = nil
        do { practice = try await Practice.get(practiceId) } catch { self.error = error.localizedDescription }
    }
}

// A practice conversation: brief → voice or text → listening back →
// feedback (practice/conversation.tsx). Embedded in a session's roleplay
// step too, where it lays out as one column inside the step's card.
struct PracticeConversation: View {
    @State private var practice: PracticeView
    var embedded = false
    var onReplace: ((PracticeView) -> Void)? = nil
    var onDone: (() -> Void)? = nil
    @State private var phase: Phase
    @State private var error: String?
    @State private var live: LiveCall
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
        ZStack(alignment: .top) {
            switch phase {
            case .brief:
                PracticeBriefView(practice: practice, embedded: embedded, error: error, onVoice: {
                    phase = .voice
                    Task { await live.start() }
                }, onText: { phase = .text })
                .transition(.blurReplace)
            case .voice:
                VoiceStage(practice: practice, live: live, embedded: embedded) { phase = .text }
                    .transition(.blurReplace)
            case .text:
                TextStage(practice: practice, embedded: embedded) { t in Task { await assess(t) } }
                    .transition(.blurReplace)
            case .assessing:
                AssessingView(embedded: embedded)
                    .transition(.blurReplace)
            case .feedback:
                if let f = practice.practice.feedback {
                    PracticeFeedbackPanel(practice: practice, feedback: f, embedded: embedded, outerError: error, onRedo: { line in try await replace(Practice.redo(from: practice.id, line: line)) }, onAgain: {
                        let p = practice.practice
                        try await replace(Practice.create(.init(mode: p.mode, topic: p.topic, side: p.side, difficulty: p.difficulty, minutes: p.minutes, voice: p.voice, parent: p.parent)))
                    })
                    .transition(.blurReplace)
                }
            }
        }
        .animation(.fw(Springs.smooth, reduced: reduceMotion), value: phase)
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

// Full screen, a phase scrolls under a pinned bottom bar that holds its main
// action; embedded in a session step, it's one column with the bar last.
private struct PhaseLayout<Content: View, Bar: View>: View {
    let embedded: Bool
    var anchorBottom = false
    @ViewBuilder var content: () -> Content
    @ViewBuilder var bar: () -> Bar

    var body: some View {
        if embedded {
            VStack(alignment: .leading, spacing: 24) {
                content()
                bar()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            ScrollView {
                content()
                    .padding(.horizontal, FW.Size.gutter)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                    .frame(maxWidth: 640)
                    .frame(maxWidth: .infinity)
            }
            .defaultScrollAnchor(anchorBottom ? .bottom : nil)
            .defaultScrollAnchor(anchorBottom ? .bottom : nil, for: .sizeChanges)
            .scrollDismissesKeyboard(.interactively)
            .safeAreaBar(edge: .bottom) {
                bar()
                    .padding(.horizontal, FW.Size.gutter)
                    .padding(.top, 10)
                    .padding(.bottom, 8)
                    .frame(maxWidth: 640)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}

// The partner's initial in a warm gradient disc.
private struct PartnerAvatar: View {
    let name: String
    var size: CGFloat = 40

    var body: some View {
        Text(String(name.prefix(1)))
            .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
            .foregroundStyle(FW.Palette.bg)
            .frame(width: size, height: size)
            .background(LinearGradient(colors: [FW.Palette.communication, FW.Palette.coral], startPoint: .topLeading, endPoint: .bottomTrailing), in: .circle)
            .accessibilityHidden(true)
    }
}

// A card with an icon and a short title over its content.
private struct InfoCard<Content: View>: View {
    let icon: String
    let title: String
    var color: Color = FW.Palette.text2
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                IconBadge(systemName: icon, color: color, size: 30)
                Text(title).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
    }
}

// MARK: Brief

private struct PracticeBriefView: View {
    let practice: PracticeView
    let embedded: Bool
    let error: String?
    let onVoice: () -> Void
    let onText: () -> Void

    var body: some View {
        let p = practice.practice
        let b = p.brief
        let mode = PracticeMode(rawValue: p.mode)
        PhaseLayout(embedded: embedded) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 14) {
                    PartnerAvatar(name: b.partner.name, size: 60)
                    VStack(alignment: .leading, spacing: 3) {
                        Label(PracticeMode.label(p.mode), systemImage: mode?.icon ?? "waveform")
                            .font(.sans(13, .semibold))
                            .foregroundStyle(mode?.color ?? FW.Palette.text3)
                        Text(b.partner.name).font(.sans(22, .bold)).foregroundStyle(FW.Palette.text)
                        Text(b.partner.role).font(.sans(14)).foregroundStyle(FW.Palette.text2).lineLimit(2)
                    }
                }
                .rise(0)
                HStack(spacing: 8) {
                    Pill(text: "\(p.minutes) min", icon: "timer", color: FW.Palette.text3)
                    Pill(text: p.difficulty.capitalized, icon: difficultyIcon(p.difficulty), color: FW.Palette.text3)
                    Pill(text: Voice.all.first { $0.id == p.voice }?.label ?? p.voice.capitalized, icon: "waveform", color: FW.Palette.text3)
                }
                .rise(1)
                if let resume = p.resume, !resume.isEmpty {
                    InfoCard(icon: "arrow.uturn.backward", title: "Redo from partway through", color: FW.Palette.communication) {
                        Text("\(b.partner.name) picks up where you left off\(resume.last?.role == "assistant" ? ":" : ".")")
                            .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        if let last = resume.last, last.role == "assistant" {
                            QuoteLine(text: last.text, color: FW.Palette.communication)
                        }
                    }
                    .rise(2)
                }
                goal(b.learner_goal).rise(2)
                InfoCard(icon: "text.quote", title: "The scene", color: FW.Palette.review) {
                    Text(b.situation).font(.sans(16)).foregroundStyle(FW.Palette.text).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .rise(3)
                GroupCard {
                    if let role = b.learner_role, !role.isEmpty {
                        BriefRow(icon: "person.fill", color: FW.Palette.judgment, label: "You", value: role)
                    }
                    BriefRow(icon: "exclamationmark.bubble.fill", color: FW.Palette.communication,
                             label: "\(b.partner.name.components(separatedBy: " ").first ?? b.partner.name) is coming in with", value: b.partner.stance)
                }
                .rise(4)
                if let success = b.success, !success.isEmpty {
                    InfoCard(icon: "checkmark.seal.fill", title: "What good looks like", color: FW.Palette.positive) {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(success, id: \.self) { s in
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Image(systemName: "checkmark.circle").font(.system(size: 15, weight: .semibold)).foregroundStyle(FW.Palette.positive)
                                    Text(s).font(.sans(15)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                    .rise(5)
                }
                if !b.prep.isEmpty {
                    InfoCard(icon: "lightbulb.fill", title: "Before you start", color: FW.Palette.caution) {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(b.prep.enumerated()), id: \.offset) { i, x in
                                HStack(alignment: .top, spacing: 10) {
                                    Text("\(i + 1)")
                                        .font(.rounded(12, .bold))
                                        .foregroundStyle(FW.Palette.text2)
                                        .frame(width: 22, height: 22)
                                        .background(FW.Palette.surface2, in: .circle)
                                    Text(x).font(.sans(15)).foregroundStyle(FW.Palette.text2)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .padding(.top, 1)
                                }
                            }
                        }
                    }
                    .rise(6)
                }
                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.sans(14)).foregroundStyle(FW.Palette.negative)
                        .transition(.blurReplace)
                }
            }
        } bar: {
            HStack(spacing: 10) {
                Button(action: onText) {
                    Label("Type", systemImage: "keyboard")
                }
                .buttonStyle(.fw(.secondary))
                .accessibilityLabel("Type instead")
                Button(action: onVoice) {
                    Label("Start talking", systemImage: "mic.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.fw(.primary, wide: true))
            }
        }
    }

    private func goal(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            IconBadge(systemName: "target", color: FW.Palette.positive, size: 40, circle: true, filled: true)
            VStack(alignment: .leading, spacing: 3) {
                Text("Your goal").font(.sans(13, .semibold)).foregroundStyle(FW.Palette.positive)
                Text(text).font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.positive.opacity(0.09), in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.positive.opacity(0.22), lineWidth: 1))
    }

    private func difficultyIcon(_ d: String) -> String {
        switch d {
        case "gentle": "leaf.fill"
        case "tough": "flame.fill"
        default: "person.2.fill"
        }
    }
}

// A row of the brief: badge, a small label, the sentence.
private struct BriefRow: View {
    let icon: String
    let color: Color
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            IconBadge(systemName: icon, color: color, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3)
                Text(value).font(.sans(15)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
    }
}

// A line someone said, set off by a coloured bar.
private struct QuoteLine: View {
    let text: String
    var color: Color = FW.Palette.text3
    var size: CGFloat = 17

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 1.5).fill(color).frame(width: 3)
            Text("“\(text)”").font(.sans(size, .medium)).foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: Voice

// The call: the partner's orb, which moves with both voices, captions, mute
// and a big end button.
private struct VoiceStage: View {
    let practice: PracticeView
    let live: LiveCall
    let embedded: Bool
    let onFallback: () -> Void

    var body: some View {
        let b = practice.practice.brief
        let planned = practice.practice.minutes * 60
        let left = max(0, planned - live.elapsed)
        let offset = max(0, live.lines.count - 3)
        let captions = Array(live.lines.suffix(3).enumerated())
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                PartnerAvatar(name: b.partner.name, size: 40)
                VStack(alignment: .leading, spacing: 1) {
                    Text(b.partner.name).font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    Text(b.partner.role).font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(1)
                }
                Spacer(minLength: 8)
                HStack(spacing: 7) {
                    Circle()
                        .fill(live.status == .live ? FW.Palette.negative : FW.Palette.text4)
                        .frame(width: 7, height: 7)
                    Text("\(left / 60):\(String(format: "%02d", left % 60))")
                        .font(.rounded(16, .semibold))
                        .foregroundStyle(FW.Palette.text)
                        .monospacedDigit()
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.snappy, value: left)
                }
                .padding(.horizontal, 12)
                .frame(height: 34)
                .background(FW.Palette.raised, in: .capsule)
                .overlay(Capsule().strokeBorder(FW.Palette.line, lineWidth: 1))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(Int((Double(left) / 60).rounded(.up))) minutes left")
            }
            Spacer(minLength: 12)
            CallOrb(initial: String(b.partner.name.prefix(1)), status: live.status, them: live.levels.them, me: live.levels.me, size: embedded ? 140 : 168)
            ZStack {
                Text(status)
                    .font(.sans(16, .medium))
                    .foregroundStyle(FW.Palette.text2)
                    .id(status)
                    .transition(.blurReplace)
            }
            .frame(height: 24)
            .animation(Springs.snappy, value: status)
            .accessibilityAddTraits(.updatesFrequently)
            Spacer(minLength: 12)
            if live.status == .error {
                VStack(spacing: 14) {
                    Label(live.error ?? "Voice isn’t available right now.", systemImage: "exclamationmark.triangle.fill")
                        .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        Button("Practise in text", action: onFallback).buttonStyle(.fw(.secondary, wide: true))
                        Button { Task { await live.start() } } label: {
                            Label("Try again", systemImage: "arrow.clockwise").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.fw(.primary, wide: true))
                    }
                }
                .transition(.blurReplace)
            } else {
                VStack(spacing: 10) {
                    ForEach(captions, id: \.offset) { i, l in
                        Text(l.text)
                            .font(.sans(l.role == "user" ? 16 : 18, .medium))
                            .foregroundStyle(l.role == "user" ? FW.Palette.text2 : FW.Palette.text)
                            .multilineTextAlignment(.center)
                            .opacity(0.35 + Double(i + 1) / Double(max(1, captions.count)) * 0.65)
                            .frame(maxWidth: .infinity)
                            .id(offset + i)
                            .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 14)), removal: .opacity))
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(height: embedded ? 110 : 150, alignment: .bottom)
                .clipped()
                .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.3)], startPoint: .top, endPoint: .bottom))
                .animation(Springs.smooth, value: live.lines.count)
                controls.padding(.top, 20)
            }
        }
        .padding(.horizontal, embedded ? 0 : FW.Size.gutter)
        .padding(.top, embedded ? 0 : 8)
        .padding(.bottom, embedded ? 0 : 12)
        .frame(maxWidth: 640, minHeight: embedded ? 520 : nil, maxHeight: embedded ? nil : .infinity)
        .frame(maxWidth: .infinity)
        .animation(Springs.smooth, value: live.status)
    }

    private var controls: some View {
        let ending = live.status == .ending
        return HStack(spacing: 14) {
            Button { live.toggleMute() } label: {
                Image(systemName: live.muted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace))
                    .foregroundStyle(live.muted ? FW.Palette.bg : FW.Palette.text)
                    .frame(width: 64, height: 64)
                    .background(live.muted ? FW.Palette.text : FW.Palette.surface2, in: .circle)
                    .overlay(Circle().strokeBorder(FW.Palette.line, lineWidth: 1))
            }
            .buttonStyle(.pressable(0.9))
            .disabled(live.status != .live)
            .opacity(live.status == .live ? 1 : 0.45)
            .accessibilityLabel(live.muted ? "Unmute" : "Mute")
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                Task { await live.end() }
            } label: {
                HStack(spacing: 10) {
                    if ending {
                        ProgressView().tint(FW.Palette.bg)
                    } else {
                        Image(systemName: "phone.down.fill").font(.system(size: 18, weight: .semibold))
                    }
                    Text(ending ? "Wrapping up" : "End conversation").contentTransition(.opacity)
                }
                .font(.sans(17, .semibold))
                .foregroundStyle(FW.Palette.bg)
                .frame(maxWidth: .infinity, minHeight: 64)
                .background(FW.Palette.negative.opacity(ending ? 0.6 : 1), in: .capsule)
            }
            .buttonStyle(.pressable(0.96))
            .disabled(ending)
        }
    }

    private var status: String {
        switch live.status {
        case .connecting, .idle: "Connecting…"
        case .ending: "Wrapping up…"
        case .live:
            live.muted ? "Muted" : live.levels.them > 0.08 ? "\(practice.practice.brief.partner.name) is speaking" : live.levels.me > 0.08 ? "You’re speaking" : "Listening"
        case .error: "Couldn’t connect"
        default: ""
        }
    }
}

// The partner as a living orb: ripples swell with their voice, the outer
// ring with yours; a sweeping arc while connecting, dimmed as it wraps up.
private struct CallOrb: View {
    let initial: String
    let status: LiveCall.Status
    let them: Double
    let me: Double
    var size: CGFloat = 168
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let c1 = FW.Palette.communication, c2 = FW.Palette.coral, c3 = FW.Palette.judgment
        let isLive = status == .live
        let connecting = status == .connecting || status == .idle
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            let breath = isLive ? 0 : (sin(t * 2.4) + 1) / 2
            ZStack {
                ForEach(0..<3, id: \.self) { i in
                    let k = Double(i + 1)
                    let push = isLive ? 0.25 + them * 1.3 + sin(t * 1.3 + k) * 0.05 : 0.2 + breath * 0.25
                    Circle()
                        .stroke(c1.opacity(max(0, 0.3 - 0.07 * k) * (isLive ? 0.6 + them : 0.7)), lineWidth: 1.5)
                        .frame(width: size, height: size)
                        .scaleEffect(1 + 0.15 * k * push)
                }
                Circle()
                    .strokeBorder(FW.Palette.text.opacity(isLive ? 0.07 + me * 0.55 : 0.05), lineWidth: 2 + me * 4)
                    .frame(width: size + 28, height: size + 28)
                    .scaleEffect(1 + me * 0.08)
                if connecting {
                    Circle()
                        .trim(from: 0, to: 0.24)
                        .stroke(c1, style: .init(lineWidth: 3, lineCap: .round))
                        .frame(width: size + 28, height: size + 28)
                        .rotationEffect(.radians(t * 3.2))
                        .transition(.opacity)
                }
                Circle()
                    .fill(AngularGradient(colors: [c1, c2, c3, c1], center: .center, angle: .radians(t * 0.7)))
                    .overlay(Circle().fill(RadialGradient(colors: [.white.opacity(0.38), .clear], center: .init(x: 0.32, y: 0.26), startRadius: 0, endRadius: size * 0.62)))
                    .overlay(
                        Text(initial)
                            .font(.system(size: size * 0.28, weight: .bold, design: .rounded))
                            .foregroundStyle(FW.Palette.bg.opacity(0.92))
                    )
                    .frame(width: size, height: size)
                    .scaleEffect(isLive ? 1 + them * 0.12 : status == .ending || status == .ended ? 0.84 : 0.95 + breath * 0.04)
                    .saturation(isLive ? 1 : connecting ? 0.65 : 0.25)
                    .shadow(color: c1.opacity(isLive ? 0.22 + them * 0.45 : 0.16), radius: 18 + them * 30)
            }
        }
        .frame(width: size * 1.75, height: size * 1.75)
        .animation(.smooth(duration: 0.22), value: them)
        .animation(.smooth(duration: 0.22), value: me)
        .animation(Springs.smooth, value: status)
        .accessibilityHidden(true)
    }
}

// MARK: Text

// Text practice: the partner opens, then turn by turn, as chat bubbles.
private struct TextStage: View {
    let practice: PracticeView
    let embedded: Bool
    let onEnd: ([PracticeLine]) -> Void
    @State private var lines: [PracticeLine] = []
    @State private var streaming: String?
    @State private var draft = ""
    @State private var busy = false
    @State private var closed = false
    @State private var error: String?
    @FocusState private var focused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Item: Identifiable {
        let id: String
        let user: Bool
        let text: String
        let earlier: Bool
    }

    // The earlier lines when redoing, this conversation, and the reply as it
    // streams (it keeps its place when it lands, so it doesn't re-enter).
    private var items: [Item] {
        var out = Array((practice.practice.resume ?? []).suffix(4).enumerated()).map { i, l in
            Item(id: "e\(i)", user: l.role == "user", text: l.text, earlier: true)
        }
        out += lines.enumerated().map { i, l in Item(id: "l\(i)", user: l.role == "user", text: l.text, earlier: false) }
        if let s = streaming { out.append(Item(id: "l\(lines.count)", user: false, text: s, earlier: false)) }
        return out
    }

    var body: some View {
        let name = practice.practice.brief.partner.name
        let list = items
        PhaseLayout(embedded: embedded, anchorBottom: true) {
            VStack(spacing: 10) {
                if !(practice.practice.resume ?? []).isEmpty {
                    Label("Picking up from earlier", systemImage: "clock.arrow.circlepath")
                        .font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 4)
                }
                ForEach(Array(list.enumerated()), id: \.element.id) { i, item in
                    ChatBubble(text: item.text, user: item.user, name: name,
                               showAvatar: !item.user && (i == list.count - 1 || list[i + 1].user))
                        .opacity(item.earlier ? 0.5 : 1)
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.86, anchor: item.user ? .bottomTrailing : .bottomLeading).combined(with: .opacity).combined(with: .offset(y: 10)),
                            removal: .opacity))
                }
                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill").font(.sans(14)).foregroundStyle(FW.Palette.negative)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .animation(.fw(Springs.bouncy, reduced: reduceMotion), value: list.count)
        } bar: {
            composer
        }
        .task {
            lines = practice.practice.transcript
            if lines.isEmpty { await say("", opening: true) }
        }
    }

    private var composer: some View {
        let canSend = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !busy && !closed
        return VStack(alignment: .trailing, spacing: 10) {
            Button { onEnd(lines) } label: {
                Label("End & get feedback", systemImage: "checkmark")
            }
            .buttonStyle(.fw(closed ? .primary : .secondary, small: true))
            .disabled(!lines.contains { $0.role == "user" } || busy)
            HStack(alignment: .bottom, spacing: 8) {
                TextField(closed ? "The conversation reached a close." : "Say it the way you would out loud…", text: $draft, axis: .vertical)
                    .lineLimit(1...6)
                    .font(.sans(16))
                    .focused($focused)
                    .disabled(closed)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(FW.Palette.raised, in: .rect(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line2, lineWidth: 1))
                Button { Task { await say(draft) } } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(FW.Palette.onAccent)
                        .frame(width: 46, height: 46)
                        .background(FW.Palette.accent, in: .circle)
                }
                .buttonStyle(.pressable(0.88))
                .disabled(!canSend)
                .opacity(canSend ? 1 : 0.35)
                .animation(Springs.snappy, value: canSend)
                .accessibilityLabel("Send")
            }
        }
    }

    private func say(_ text: String, opening: Bool = false) async {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard opening || !message.isEmpty else { return }
        busy = true
        error = nil
        if !opening {
            lines.append(PracticeLine(role: "user", text: message))
            draft = ""
            Feedback.shared.play(.tap)
        }
        streaming = ""
        defer { busy = false; streaming = nil }
        struct Body: Encodable { let action = "say"; let message: String }
        do {
            let done = try await API.stream("/api/practice/\(practice.id)", Body(message: message), handlers: .init(onSnap: { d in
                streaming = d["text"]?.string ?? streaming
            }))
            lines.append(PracticeLine(role: "assistant", text: done["reply"]?.string ?? ""))
            if done["end"]?.bool == true { closed = true }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// One turn as a bubble: theirs on the left with their initial, yours on the
// right in the accent. An empty reply shows as typing dots.
private struct ChatBubble: View {
    let text: String
    let user: Bool
    let name: String
    var showAvatar = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if user {
                Spacer(minLength: 48)
            } else if showAvatar {
                PartnerAvatar(name: name, size: 28)
            } else {
                Color.clear.frame(width: 28, height: 1)
            }
            Group {
                if text.isEmpty {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 20, weight: .bold))
                        .symbolEffect(.variableColor.iterative, isActive: !reduceMotion)
                        .frame(height: 22)
                        .accessibilityLabel("\(name) is typing")
                } else {
                    Text(text).font(.sans(16)).lineSpacing(2)
                }
            }
            .foregroundStyle(user ? FW.Palette.onAccent : FW.Palette.text)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(user ? FW.Palette.accent : FW.Palette.surface2, in: UnevenRoundedRectangle(
                topLeadingRadius: 20, bottomLeadingRadius: user ? 20 : 6, bottomTrailingRadius: user ? 6 : 20, topTrailingRadius: 20, style: .continuous))
            .fixedSize(horizontal: false, vertical: true)
            if !user { Spacer(minLength: 48) }
        }
        .frame(maxWidth: .infinity, alignment: user ? .trailing : .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(user ? "You" : name): \(text)")
    }
}

// MARK: Listening back

private struct AssessingView: View {
    let embedded: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "waveform")
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(FW.Palette.communication)
                .symbolEffect(.variableColor.iterative.reversing, isActive: !reduceMotion)
                .frame(width: 104, height: 104)
                .background(FW.Palette.communication.opacity(0.12), in: .circle)
            ShimmerText(text: "Listening back…", font: .sans(20, .semibold))
            Text("Finding your best moment and the one change that matters most.")
                .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 32)
        .padding(.vertical, embedded ? 56 : 0)
        .frame(maxWidth: .infinity, maxHeight: embedded ? nil : .infinity)
    }
}

// MARK: Feedback

// How it went: a score ring and the headline up top, then the best line, one
// change, a rewrite, the criteria as meters, and the replay.
private struct PracticeFeedbackPanel: View {
    let practice: PracticeView
    let feedback: PracticeFeedback
    let embedded: Bool
    let outerError: String?
    let onRedo: (Int) async throws -> Void
    let onAgain: () async throws -> Void
    @State private var open: Bool
    @State private var lit: Int?
    @State private var busy: Int?
    @State private var again = false
    @State private var error: String?

    init(practice: PracticeView, feedback: PracticeFeedback, embedded: Bool, outerError: String?, onRedo: @escaping (Int) async throws -> Void, onAgain: @escaping () async throws -> Void) {
        self.practice = practice
        self.feedback = feedback
        self.embedded = embedded
        self.outerError = outerError
        self.onRedo = onRedo
        self.onAgain = onAgain
        _open = State(initialValue: !(feedback.notes ?? []).isEmpty)
    }

    var body: some View {
        let f = feedback
        PhaseLayout(embedded: embedded) {
            VStack(alignment: .leading, spacing: 14) {
                scoreCard.rise(0)
                InfoCard(icon: "star.fill", title: "Your best line", color: FW.Palette.positive) {
                    QuoteLine(text: f.best.quote, color: FW.Palette.positive, size: 17)
                    Text(f.best.why).font(.sans(15)).foregroundStyle(FW.Palette.text2).fixedSize(horizontal: false, vertical: true)
                }
                .rise(1)
                InfoCard(icon: "arrow.triangle.turn.up.right.diamond.fill", title: "One change", color: FW.Palette.caution) {
                    Text(f.change).font(.sans(16)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                }
                .rise(2)
                InfoCard(icon: "wand.and.stars", title: "Say it stronger", color: FW.Palette.review) {
                    rewrite
                }
                .rise(3)
                InfoCard(icon: "checklist", title: "How you did", color: FW.Palette.judgment) {
                    VStack(spacing: 16) {
                        ForEach(f.criteria, id: \.name) { c in criterion(c) }
                    }
                }
                .rise(4)
                if !practice.practice.transcript.isEmpty { replay.rise(5) }
                if let e = error ?? outerError {
                    Label(e, systemImage: "exclamationmark.circle.fill").font(.sans(14)).foregroundStyle(FW.Palette.negative)
                }
            }
        } bar: {
            Button {
                again = true
                Task {
                    do { try await onAgain() } catch { self.error = error.localizedDescription }
                    again = false
                }
            } label: {
                HStack(spacing: 8) {
                    if again { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "arrow.clockwise") }
                    Text("Try it again")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.primary, wide: true))
            .disabled(again)
        }
    }

    private var scoreCard: some View {
        let f = feedback
        let color = scoreColor(f.score)
        let turns = practice.practice.transcript.filter { $0.role == "user" }.count
        return VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 18) {
                ScoreRing(score: f.score, color: color, size: 96)
                VStack(alignment: .leading, spacing: 10) {
                    Text(f.score >= 0.75 ? "Strong" : f.score >= 0.4 ? "Getting there" : "Focus here")
                        .font(.rounded(24))
                        .foregroundStyle(color)
                    HStack(spacing: 8) {
                        if let s = practice.practice.seconds, s > 0 {
                            Pill(text: "\(max(1, Int((s / 60).rounded()))) min", icon: "clock.fill", color: FW.Palette.text3)
                        }
                        if turns > 0 {
                            Pill(text: "\(turns) \(turns == 1 ? "turn" : "turns")", icon: "bubble.left.fill", color: FW.Palette.text3)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            Text(f.headline)
                .font(.sans(17, .semibold))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
    }

    private var rewrite: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("You said").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
                Text(feedback.rewrite.original).font(.sans(15)).foregroundStyle(FW.Palette.text3)
                    .strikethrough(color: FW.Palette.text3.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 12)
            Image(systemName: "arrow.down")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(FW.Palette.text4)
                .padding(.leading, 12)
            VStack(alignment: .leading, spacing: 4) {
                Text("Stronger").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.positive)
                Text(feedback.rewrite.better).font(.sans(16, .semibold)).foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.positive.opacity(0.09), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        }
    }

    private func criterion(_ c: PracticeFeedback.Criterion) -> some View {
        let color = c.rating == "strong" ? FW.Palette.positive : c.rating == "developing" ? FW.Palette.caution : FW.Palette.negative
        let value = c.rating == "strong" ? 1.0 : c.rating == "developing" ? 0.6 : 0.25
        return VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(c.name).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                Spacer(minLength: 8)
                Text(c.rating == "strong" ? "Strong" : c.rating == "developing" ? "Developing" : "Focus here")
                    .font(.sans(13, .semibold)).foregroundStyle(color)
            }
            Meter(value: value, color: color, height: 6)
            Text(c.note).font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var replay: some View {
        let lines = practice.practice.transcript
        let notes = feedback.notes ?? []
        let name = practice.practice.brief.partner.name
        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                IconBadge(systemName: "waveform.path", color: FW.Palette.communication, size: 30)
                Text("Replay").font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
                Spacer()
                Button {
                    withAnimation(Springs.smooth) { open.toggle() }
                } label: {
                    Label(open ? "Hide transcript" : "Show transcript", systemImage: open ? "chevron.up" : "chevron.down")
                        .font(.sans(13, .semibold))
                        .foregroundStyle(FW.Palette.text2)
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
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
                                    withAnimation(Springs.smooth) { open = true; lit = i }
                                    Task {
                                        try? await Task.sleep(for: .milliseconds(150))
                                        withAnimation(Springs.smooth) { proxy.scrollTo("line-\(i)", anchor: .center) }
                                        try? await Task.sleep(for: .seconds(1.6))
                                        withAnimation(.easeOut(duration: 0.6)) { if lit == i { lit = nil } }
                                    }
                                } label: {
                                    VStack(spacing: 3) {
                                        Circle().fill(n.map { noteColor($0.kind) } ?? .clear).frame(width: 7, height: 7)
                                        RoundedRectangle(cornerRadius: 3)
                                            .fill(l.role == "user" ? FW.Palette.communication.opacity(lit == i ? 1 : 0.6) : FW.Palette.surface3)
                                            .frame(height: l.role == "user" ? 24 : 14)
                                    }
                                    .frame(width: max(5, (geo.size.width - gaps) * CGFloat(words[i]) / total))
                                    .contentShape(.rect)
                                }
                                .buttonStyle(.pressable(0.9))
                                .accessibilityLabel("\(l.role == "user" ? "You" : name): \(l.text.prefix(80))\(n.map { " (note: \(noteLabel($0.kind)))" } ?? "")")
                            }
                        }
                        .frame(height: 38, alignment: .bottom)
                    }
                    .frame(height: 38)
                    HStack(spacing: 14) {
                        legend(FW.Palette.communication, "You")
                        legend(FW.Palette.surface3, name)
                        if !notes.isEmpty {
                            HStack(spacing: 5) { Circle().fill(FW.Palette.text2).frame(width: 7, height: 7); Text("Notes") }
                        }
                    }
                    .font(.sans(12)).foregroundStyle(FW.Palette.text3)
                    if open {
                        VStack(alignment: .leading, spacing: 8) {
                            if !(practice.practice.resume ?? []).isEmpty {
                                Label("Picked up partway through an earlier conversation.", systemImage: "clock.arrow.circlepath")
                                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            }
                            ForEach(Array(lines.enumerated()), id: \.offset) { i, l in
                                let user = l.role == "user"
                                VStack(alignment: user ? .trailing : .leading, spacing: 8) {
                                    ChatBubble(text: l.text, user: user, name: name)
                                    ForEach(notes.filter { $0.line == i }, id: \.note) { n in
                                        HStack(alignment: .top, spacing: 10) {
                                            Image(systemName: noteIcon(n.kind))
                                                .font(.system(size: 13, weight: .semibold))
                                                .foregroundStyle(noteColor(n.kind))
                                                .frame(width: 18)
                                                .padding(.top, 1)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(noteLabel(n.kind)).font(.sans(12, .semibold)).foregroundStyle(noteColor(n.kind))
                                                Text(n.note).font(.sans(14)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                                            }
                                        }
                                        .padding(12)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(noteColor(n.kind).opacity(0.08), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                                    }
                                    if user {
                                        Button {
                                            busy = i
                                            Task {
                                                do { try await onRedo(i) } catch { self.error = error.localizedDescription }
                                                busy = nil
                                            }
                                        } label: {
                                            HStack(spacing: 5) {
                                                if busy == i { ProgressView().controlSize(.mini) } else { Image(systemName: "arrow.uturn.backward").font(.system(size: 12, weight: .semibold)) }
                                                Text("Redo from here")
                                            }
                                            .font(.sans(13, .semibold))
                                            .foregroundStyle(FW.Palette.text2)
                                            .padding(.horizontal, 12)
                                            .frame(height: 32)
                                            .background(FW.Palette.surface, in: .capsule)
                                            .overlay(Capsule().strokeBorder(FW.Palette.line, lineWidth: 1))
                                        }
                                        .buttonStyle(.pressable)
                                        .disabled(busy != nil)
                                    }
                                }
                                .padding(8)
                                .background(lit == i ? FW.Palette.surface2.opacity(0.7) : .clear, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                                .id("line-\(i)")
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
        .clipShape(.rect(cornerRadius: FW.Radius.lg, style: .continuous))
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
    private func noteIcon(_ kind: String) -> String {
        kind == "strength" ? "checkmark.circle.fill" : kind == "change" ? "arrow.triangle.turn.up.right.circle.fill" : "sparkles"
    }
}

// The overall score as a ring that fills and counts up the first time.
private struct ScoreRing: View {
    let score: Double
    let color: Color
    var size: CGFloat = 96
    @State private var shown = 0.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle().stroke(FW.Palette.surface2, lineWidth: 9)
            Circle()
                .trim(from: 0, to: min(max(shown, 0), 1))
                .stroke(color, style: .init(lineWidth: 9, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: -2) {
                Text("\(Int((shown * 100).rounded()))")
                    .font(.rounded(size * 0.32))
                    .foregroundStyle(FW.Palette.text)
                    .contentTransition(.numericText(value: shown))
                    .monospacedDigit()
                Text("of 100").font(.sans(11, .medium)).foregroundStyle(FW.Palette.text3)
            }
        }
        .frame(width: size, height: size)
        .onAppear {
            guard shown == 0 else { return }
            withAnimation(reduceMotion ? nil : .smooth(duration: 1.1).delay(0.25)) { shown = score }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Score \(Int((score * 100).rounded())) out of 100")
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
