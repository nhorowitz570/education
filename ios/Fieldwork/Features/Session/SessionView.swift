import SwiftUI

// One session run, full screen (src/components/session/runner.tsx): a top
// bar, the trail of steps (finished ones fold into one line), and the dock
// for asking and moving on.
struct SessionView: View {
    let runId: String
    @State private var model: SessionModel
    @State private var extras: SessionExtras
    @State private var expanded: Set<String> = []
    @State private var quote: (beatId: String, text: String)?
    @Environment(\.dismiss) private var dismiss
    @Environment(Store.self) private var store

    init(runId: String) {
        self.runId = runId
        _model = State(initialValue: SessionModel(id: runId))
        _extras = State(initialValue: SessionExtras(runId: runId))
    }

    var body: some View {
        Group {
            if let run = model.run {
                if run.status == "done" {
                    CompleteView(run: run, fresh: model.finishedHere) { leave() }
                } else {
                    session(run)
                }
            } else if let error = model.error {
                VStack(spacing: 14) {
                    Text("This session couldn’t open.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    Text(error).font(.sans(15)).foregroundStyle(FW.Palette.text2).multilineTextAlignment(.center)
                    Button("Back to Today") { dismiss() }.buttonStyle(.secondary)
                }
                .padding(32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(alignment: .leading) {
                    SessionTopBar(title: "", onClose: leave) { EmptyView() }
                    Skeleton(width: 120, height: 14).padding(.top, 48).padding(.horizontal, FW.Size.gutter)
                    Spacer()
                }
            }
        }
        .screenBackground()
        .environment(model)
        .environment(extras)
        .task {
            await model.start()
            await extras.load()
        }
        .onDisappear { model.cancelAll() }
        .sheet(item: $extras.openTerm) { TermSheet(term: $0) }
    }

    private func leave() {
        model.leave()
        dismiss()
    }

    private func session(_ run: RunView) -> some View {
        let track = run.session?.subject ?? (run.kind == "review" ? "review" : "general")
        let beats = run.beats
        let current = model.current
        let last = current?.type == "recap" || (run.adaptive != true && model.index == beats.count - 1)
        let next = beats[safe: model.index + 1]
        let atCommitment = run.adaptive != true && next?.optional == true && current?.optional != true
        return VStack(spacing: 0) {
            if run.adaptive == true {
                ClockTopBar(run: run, track: track, onClose: leave)
            } else {
                FixedTopBar(run: run, track: track, onClose: leave)
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(beats.prefix(model.index + 1).enumerated()), id: \.element.id) { i, b in
                            BeatView(
                                beat: b,
                                current: i == model.index,
                                track: track,
                                collapsed: i < model.index && !expanded.contains(b.id),
                                onToggle: { toggle(b.id) },
                                run: run,
                                onAdvance: { advance(last: last) }
                            )
                            .id(b.id)
                        }
                        Color.clear.frame(height: 24).id("end")
                    }
                    .padding(.horizontal, FW.Size.gutter)
                    .frame(maxWidth: 680)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .environment(\.passage) { text, intent in passage(text, intent, proxy: proxy) }
                .environment(\.openURL, OpenURLAction { url in
                    if let term = extras.term(for: url) { extras.openTerm = term; return .handled }
                    return .systemAction
                })
                .onChange(of: model.index) { _, _ in
                    guard let id = model.current?.id else { return }
                    withAnimation(.easeOut(duration: FW.Motion.slow)) { proxy.scrollTo(id, anchor: .top) }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if let current {
                    SessionDock(
                        beat: current,
                        quote: $quote,
                        canContinue: model.ready(current),
                        last: last,
                        atCommitment: atCommitment,
                        canWrap: run.adaptive == true && run.wrapping != true && current.type != "recap",
                        onContinue: { advance(last: last) },
                        onFinishHere: { Task { await model.finish() } }
                    )
                }
            }
        }
    }

    private func toggle(_ id: String) {
        withAnimation(.easeOut(duration: FW.Motion.slow)) {
            if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) }
        }
    }

    private func advance(last: Bool) {
        guard let c = model.current, model.ready(c) else { return }
        Feedback.shared.play(.tap)
        Task { if last { await model.finish() } else { await model.next() } }
    }

    // Long-press on a passage: ask about it, or keep a note on it.
    private func passage(_ text: String, _ intent: PassageIntent, proxy: ScrollViewProxy) {
        guard let beatId = model.run?.beats.first(where: { b in
            (b.blocks ?? []).contains { ($0.md ?? "").contains(text.prefix(40)) } || (b.feedback?.blocks ?? []).contains { ($0.md ?? "").contains(text.prefix(40)) }
        })?.id ?? model.current?.id else { return }
        let q = String(text.prefix(600))
        switch intent {
        case .note: extras.start(beatId, quote: q)
        case .ask: quote = (beatId, q)
        default:
            let i = ["why": "why", "example": "example", "simpler": "simpler", "visual": "visual"]["\(intent)"] ?? "why"
            Task { await model.ask(beatId, intent: i, quote: q) }
            if beatId != model.current?.id {
                expanded.insert(beatId)
                withAnimation { proxy.scrollTo(beatId, anchor: .center) }
            }
        }
    }
}

// MARK: - Top bars

struct SessionTopBar<Right: View>: View {
    let title: String
    let onClose: () -> Void
    @ViewBuilder var right: () -> Right
    var bar: AnyView? = nil

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onClose) {
                Image(systemName: "xmark").font(.system(size: 17, weight: .medium)).frame(width: 44, height: 44)
            }
            .foregroundStyle(FW.Palette.text2)
            .accessibilityLabel("Save and leave")
            VStack(spacing: 8) {
                Text(title).font(.sans(13, .medium)).foregroundStyle(FW.Palette.text2).lineLimit(1)
                if let bar { bar }
            }
            .frame(maxWidth: .infinity)
            right().frame(minWidth: 44, alignment: .trailing)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(.bar)
    }
}

private struct FixedTopBar: View {
    let run: RunView
    let track: String
    let onClose: () -> Void
    @Environment(SessionModel.self) private var model

    var body: some View {
        let beats = run.beats
        let current = model.current
        let remaining = beats.dropFirst(model.index).filter { $0.optional != true || current?.optional == true }.reduce(0) { $0 + ($1.minutes ?? 0) }
        SessionTopBar(title: run.title, onClose: onClose, right: {
            Text("\(Int(remaining.rounded()))m").font(.sans(15)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                .accessibilityLabel("About \(Int(remaining.rounded())) minutes left")
        }, bar: AnyView(TrackBar(beats: beats, index: model.index, color: trackColor(track))))
    }
}

private struct TrackBar: View {
    let beats: [Beat]
    let index: Int
    let color: Color
    var body: some View {
        let total = max(beats.reduce(0) { $0 + ($1.minutes ?? 1) }, 1)
        GeometryReader { geo in
            let gaps = CGFloat(max(beats.count - 1, 0)) * 3
            HStack(spacing: 3) {
                ForEach(Array(beats.enumerated()), id: \.element.id) { i, b in
                    let w = max(3, (geo.size.width - gaps) * CGFloat((b.minutes ?? 1) / total))
                    Capsule()
                        .fill(i < index ? (b.type == "recall" ? FW.Palette.review : color).opacity(0.85) : i == index ? FW.Palette.text : FW.Palette.surface3)
                        .overlay { if b.type == "break" || (b.optional == true && i > index) { DiagonalHatch().stroke(FW.Palette.hatch, lineWidth: 1.5).clipShape(Capsule()) } }
                        .frame(width: w)
                }
            }
        }
        .frame(height: 4)
        .accessibilityElement()
        .accessibilityLabel("Session progress")
        .accessibilityValue("Step \(index + 1) of \(beats.count)")
    }
}

// Adaptive sessions measure time, not steps: the bar fills with the minutes
// actually spent, and the session plans itself to fill the budget.
private struct ClockTopBar: View {
    let run: RunView
    let track: String
    let onClose: () -> Void
    @Environment(SessionModel.self) private var model
    @Environment(Store.self) private var store

    var body: some View {
        TimelineView(.periodic(from: .now, by: 20)) { _ in
            let elapsed = model.elapsed
            let left = model.minutesLeft
            let fraction = min(1, elapsed / max(1, elapsed + Double(left)))
            SessionTopBar(title: run.title, onClose: onClose, right: {
                HStack(spacing: 8) {
                    if store.prefs.game.xp {
                        HStack(spacing: 3) {
                            Image(systemName: "sparkles").font(.system(size: 10))
                            Text("\(XP.session(run.beats))").font(.sans(12, .semibold)).monospacedDigit()
                        }
                        .foregroundStyle(FW.Palette.caution)
                        .padding(.horizontal, 8)
                        .frame(height: 26)
                        .background(FW.Palette.caution.opacity(0.14), in: .capsule)
                    }
                    Text("\(left)m").font(.sans(15)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("About \(left) minutes left")
            }, bar: AnyView(
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(FW.Palette.surface3)
                        Capsule().fill(trackColor(track)).frame(width: geo.size.width * fraction)
                            .animation(.easeOut(duration: 1.2), value: fraction)
                        HStack(spacing: 6) {
                            ForEach(run.beats.filter { $0.feedback != nil }) { b in
                                Circle().fill(verdictColor(b.feedback?.verdict)).frame(width: 4, height: 4)
                            }
                        }
                        .padding(.leading, 4)
                    }
                }
                .frame(height: 6)
            ))
        }
    }
}

// MARK: - Dock

private struct SessionDock: View {
    let beat: Beat
    @Binding var quote: (beatId: String, text: String)?
    let canContinue: Bool
    let last: Bool
    let atCommitment: Bool
    let canWrap: Bool
    let onContinue: () -> Void
    let onFinishHere: () -> Void
    @Environment(SessionModel.self) private var model
    @State private var text = ""
    @State private var confirmWrap = false
    @FocusState private var focused: Bool

    private let intents: [(String, String, String)] = [
        ("why", "Why?", "questionmark"), ("example", "Example", "text.alignleft"), ("deeper", "Go deeper", "arrow.down.to.line"),
        ("simpler", "Simpler", "line.3.horizontal"), ("visual", "Show me", "chart.bar"),
    ]

    var body: some View {
        let target = quote?.beatId ?? beat.id
        let busy = model.asking[target] != nil && model.asking[target]?.error == nil
        let openQuestion = beat.question != nil && beat.feedback == nil
        let generating = beat.blocks == nil && beat.type != "break"
        let gauge = beat.type == "gauge"
        let follow = Array((beat.asks?.last?.follow_ups ?? beat.follow_ups ?? []).prefix(2))
        VStack(alignment: .leading, spacing: 10) {
            if confirmWrap {
                VStack(alignment: .leading, spacing: 10) {
                    (Text("Wrap up now? ").bold() + Text("You’ll skip what’s left and get a short recap of what you did."))
                        .font(.sans(14)).foregroundStyle(FW.Palette.text)
                    HStack {
                        Button("Keep going") { confirmWrap = false }.buttonStyle(.fw(.ghost, small: true))
                        Button {
                            Task { await model.wrap(); confirmWrap = false }
                        } label: { HStack { if model.wrapping { ProgressView() }; Text("Wrap up") } }
                        .buttonStyle(.fw(.primary, small: true))
                        .disabled(model.wrapping)
                    }
                }
                .card(FW.Radius.base, fill: FW.Palette.raised, padding: 14)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if !generating && !gauge && beat.type != "break" && beat.type != "roleplay" {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        if openQuestion {
                            dockChip("Hint", icon: "sparkles", disabled: busy) { send("free", "Give me a hint without giving the answer away.") }
                        } else {
                            ForEach(follow, id: \.self) { f in
                                dockChip(f, icon: "sparkles", suggested: true, disabled: busy) { send("free", f) }
                            }
                            ForEach(intents, id: \.0) { i in
                                dockChip(i.1, icon: i.2, disabled: busy) { send(i.0) }
                            }
                        }
                    }
                    .padding(.horizontal, FW.Size.gutter)
                }
                .padding(.horizontal, -FW.Size.gutter)
            }
            if let q = quote {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles").font(.system(size: 12)).foregroundStyle(FW.Palette.text3)
                    Text("About “\(q.text.count > 90 ? String(q.text.prefix(89)) + "…" : q.text)”").font(.sans(13)).foregroundStyle(FW.Palette.text2).lineLimit(2)
                    Spacer()
                    Button { quote = nil } label: { Image(systemName: "xmark").font(.system(size: 12)) }
                        .foregroundStyle(FW.Palette.text3)
                        .accessibilityLabel("Stop asking about this passage")
                }
                .onAppear { focused = true }
            }
            HStack(spacing: 8) {
                if quote != nil || (beat.type != "break" && beat.type != "roleplay" && !gauge) {
                    HStack(spacing: 6) {
                        TextField(quote != nil ? "What about this part?" : openQuestion ? "Ask for help…" : "Ask anything about this…", text: $text)
                            .font(.sans(15))
                            .focused($focused)
                            .submitLabel(.send)
                            .onSubmit { if !text.trimmingCharacters(in: .whitespaces).isEmpty { send("free", text.trimmingCharacters(in: .whitespaces)) } }
                            .disabled(generating && quote == nil)
                        Button {
                            send("free", text.trimmingCharacters(in: .whitespaces))
                        } label: {
                            Image(systemName: "arrow.up").font(.system(size: 14, weight: .semibold))
                                .frame(width: 32, height: 32)
                                .foregroundStyle(FW.Palette.onAccent)
                                .background(FW.Palette.accent, in: .circle)
                        }
                        .buttonStyle(.plain)
                        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                        .opacity(text.trimmingCharacters(in: .whitespaces).isEmpty || busy ? 0.4 : 1)
                        .accessibilityLabel("Send")
                    }
                    .padding(.leading, 14)
                    .padding(.trailing, 6)
                    .frame(height: 46)
                    .background(FW.Palette.raised, in: .rect(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(FW.Palette.line2))
                }
                if !focused {
                    if canWrap && !confirmWrap {
                        Button("Wrap up") { withAnimation { confirmWrap = true } }.buttonStyle(.fw(.secondary, small: true))
                    }
                    if atCommitment && canContinue {
                        Button("Finish here", action: onFinishHere).buttonStyle(.fw(.secondary, small: true)).disabled(model.finishing)
                    }
                    if !openQuestion && !(gauge && beat.response?.gauge == nil) {
                        Button(action: onContinue) {
                            HStack(spacing: 6) {
                                if model.finishing { ProgressView().tint(FW.Palette.onAccent) }
                                Text(last ? "Finish session" : beat.type == "break" ? "I’m back" : atCommitment ? "Keep going" : "Continue")
                                    .lineLimit(1)
                                if !model.finishing { Image(systemName: "arrow.right") }
                            }
                            .frame(maxWidth: beat.type == "break" ? .infinity : nil)
                        }
                        .buttonStyle(.fw(.primary))
                        .fixedSize(horizontal: beat.type != "break", vertical: false)
                        .disabled(!canContinue || model.finishing)
                    }
                    if openQuestion {
                        Button("Skip") { Task { await model.next(skip: true) } }.buttonStyle(.fw(.ghost, small: true))
                            .accessibilityLabel("Skip this question")
                    }
                }
            }
            if let error = model.error {
                HStack {
                    Text(error).font(.sans(13)).foregroundStyle(FW.Palette.negative)
                    Button("Dismiss") { model.error = nil }.font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text2)
                }
            }
        }
        .padding(.horizontal, FW.Size.gutter)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .frame(maxWidth: 680)
        .frame(maxWidth: .infinity)
        .background(alignment: .top) {
            LinearGradient(colors: [FW.Palette.bg.opacity(0), FW.Palette.bg.opacity(0.94), FW.Palette.bg], startPoint: .top, endPoint: .init(x: 0.5, y: 0.35))
                .ignoresSafeArea()
                .padding(.top, -24)
        }
        .onChange(of: beat.id) { _, _ in confirmWrap = false }
        .animation(.easeOut(duration: FW.Motion.base), value: confirmWrap)
    }

    private func dockChip(_ label: String, icon: String, suggested: Bool = false, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12))
                Text(label).lineLimit(1)
            }
            .font(.sans(14))
            .padding(.horizontal, 12)
            .frame(height: 34)
            .foregroundStyle(suggested ? FW.Palette.text : FW.Palette.text2)
            .background(FW.Palette.surface, in: .capsule)
            .overlay(Capsule().strokeBorder(FW.Palette.line))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }

    private func send(_ intent: String, _ prompt: String = "") {
        let target = quote?.beatId ?? beat.id
        guard model.asking[target] == nil || model.asking[target]?.error != nil else { return }
        if let q = quote {
            Task { await model.ask(q.beatId, intent: intent, prompt: prompt, quote: q.text) }
            quote = nil
        } else {
            Task { await model.ask(beat.id, intent: intent, prompt: prompt) }
        }
        text = ""
        focused = false
    }
}

// A term from an earlier session, tapped in a lesson.
private struct TermSheet: View {
    let term: SessionExtras.Term
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Dot(color: trackColor(term.track))
                Kicker("From your Notebook · \(levelLabel(term.level))")
            }
            Text(term.title).font(.serif(21)).foregroundStyle(FW.Palette.text)
            Meter(value: term.strength, color: trackColor(term.track), height: 3)
            if let words = term.words {
                Text("“\(words)”").font(.serif(16, italic: true)).foregroundStyle(FW.Palette.text2)
            } else {
                Text("You met this in an earlier session.").font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }
            Button {
                dismiss()
                Router.shared.cover = nil
                Router.shared.push(.concept(term.key), on: .notebook)
            } label: { Label("Open in Notebook", systemImage: "arrow.right").labelStyle(TrailingIcon()) }
                .font(.sans(14, .semibold))
                .foregroundStyle(FW.Palette.text)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .presentationDetents([.height(280)])
        .presentationBackground(FW.Palette.raised)
        .presentationCornerRadius(FW.Radius.xl)
    }
}
