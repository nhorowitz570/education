import SwiftUI
import UserNotifications

// One step of a session (src/components/session/beat.tsx): its label (or a
// one-line trail row once passed), the tutor's content, the question and
// feedback, notes and the learner's asks.
struct BeatView: View {
    let beat: Beat
    let current: Bool
    let track: String
    let collapsed: Bool
    let onToggle: () -> Void
    let run: RunView
    let onAdvance: () -> Void
    @Environment(SessionModel.self) private var model
    @Environment(SessionExtras.self) private var extras
    @Environment(Store.self) private var store
    @State private var fresh = false
    @State private var retrying = false

    private var hue: Color { beat.type == "recall" ? FW.Palette.review : trackColor(track) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if current {
                HStack(spacing: 8) {
                    Dot(color: hue, lit: true)
                    Text(beat.label.uppercased()).font(.sans(12, .semibold)).tracking(0.6).foregroundStyle(FW.Palette.text2)
                    if beat.optional == true { Text("· optional").font(.sans(12)).foregroundStyle(FW.Palette.text3) }
                }
                .padding(.top, 28)
                .padding(.bottom, 16)
            } else {
                trailRow
            }
            if !collapsed {
                content
                    .padding(.leading, current ? 0 : 28)
                    .padding(.bottom, current ? 24 : 16)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .onChange(of: model.grading[beat.id] == nil) { was, now in
            if !was && now && beat.feedback != nil { fresh = true }
        }
        .onChange(of: beat.attempts?.count) { _, _ in retrying = false }
    }

    // MARK: Trail row

    private var trailRow: some View {
        let verdict = beat.feedback?.verdict
        let unknown = beat.response?.unknown == true
        return Button(action: onToggle) {
            HStack(spacing: 10) {
                Dot(color: verdict.map(verdictColor) ?? hue, lit: verdict == nil)
                    .frame(width: 12)
                Text(beat.label.uppercased()).font(.sans(11, .semibold)).tracking(0.5).foregroundStyle(FW.Palette.text3)
                    .fixedSize()
                Text((verdict.map { "\(unknown ? "Learnt it" : verdictLabel[$0] ?? "") · " } ?? "") + summary)
                    .font(.sans(14)).foregroundStyle(FW.Palette.text2).lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .medium)).foregroundStyle(FW.Palette.text3)
                    .rotationEffect(.degrees(collapsed ? 0 : 90))
            }
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityValue(collapsed ? "Collapsed" : "Expanded")
    }

    private var summary: String {
        if beat.status == "skipped" { return "Skipped" }
        if beat.type == "gauge" { return beat.response?.gauge.flatMap(Gauge.init(rawValue:))?.label ?? "Skipped" }
        if beat.type == "break" { return "\(Int(beat.minutes ?? 5))-minute break" }
        if beat.type == "roleplay" { return beat.practice?.status == "done" ? (firstSentence(beat.feedback?.blocks).nilIfEmpty ?? "Practised out loud") : "Practice conversation" }
        if let f = beat.feedback { return firstSentence(f.blocks) }
        return firstSentence(beat.blocks)
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        let live = model.live[beat.id]
        let blocks = beat.blocks ?? live?.partial ?? []
        let streaming = beat.blocks == nil && live != nil && live?.error == nil
        VStack(alignment: .leading, spacing: 18) {
            if let error = live?.error {
                VStack(alignment: .leading, spacing: 10) {
                    Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative)
                    Button { model.retry(beat.id) } label: { Label("Try again", systemImage: "arrow.clockwise") }
                        .buttonStyle(.fw(.secondary, small: true))
                }
                .card(FW.Radius.base, fill: FW.Palette.negative.opacity(0.08), padding: 14)
            } else if blocks.isEmpty && (streaming || (beat.blocks == nil && beat.type != "break")) {
                Building(label: beat.building)
            } else {
                Blocks(blocks: streaming ? blocks : extras.decorate(blocks, except: beat.concept), streaming: streaming)
            }
            ForEach(Array((beat.attempts ?? []).enumerated()), id: \.offset) { i, a in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Dot(color: verdictColor(a.feedback.verdict))
                        Text("\(i == 0 ? "First try" : "Try \(i + 1)") · \(verdictLabel[a.feedback.verdict] ?? "")").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    }
                    if let t = a.response.text { Text(t).font(.sans(15)).foregroundStyle(FW.Palette.text2) }
                    Blocks(blocks: a.feedback.blocks)
                }
                .opacity(0.78)
            }
            if retrying, let f = beat.feedback {
                FeedbackCard(verdict: f.verdict, blocks: f.blocks, streaming: false)
            }
            if beat.type == "gauge", beat.blocks != nil { GaugeChoice(beat: beat, current: current) }
            if beat.question != nil, beat.blocks != nil {
                QuestionView(beat: beat, current: current, retrying: retrying) { retrying = false }
            }
            feedback
            if beat.type == "break", current { BreakTimer(beat: beat, until: run.break_until, onDone: onAdvance) }
            if beat.type == "roleplay", beat.blocks != nil { RoleplayView(run: run, beat: beat) }
            BeatNotes(beatId: beat.id, canAdd: beat.blocks != nil && beat.type != "break" && beat.type != "gauge")
            ForEach(beat.asks ?? []) { a in
                AskView(quote: a.quote, prompt: a.prompt.isEmpty ? (a.quote != nil ? "Explain this part" : "") : a.prompt, intent: a.intent, blocks: a.blocks, streaming: false)
            }
            if let asking = model.asking[beat.id] {
                AskView(quote: asking.quote, prompt: asking.prompt.isEmpty ? (intentText[asking.intent] ?? "Explain this part") : asking.prompt,
                        intent: asking.intent, blocks: asking.partial, streaming: true, error: asking.error) { model.dismissAsk(beat.id) }
                    .id("asking-" + beat.id)
            }
        }
    }

    @ViewBuilder
    private var feedback: some View {
        let grading = model.grading[beat.id]
        if (grading != nil || beat.feedback != nil) && !retrying {
            let unknown = beat.response?.unknown == true
            let verdict = grading != nil ? grading?.verdict : beat.feedback?.verdict
            let pops = store.prefs.game.pops && store.prefs.game.xp
            let xp = beat.feedback.map { XP.answer($0.verdict, confidence: beat.response?.confidence, unknown: unknown, score: $0.score) } ?? 0
            FeedbackCard(
                verdict: verdict,
                blocks: grading?.blocks ?? beat.feedback?.blocks ?? [],
                streaming: grading != nil,
                retried: !(beat.attempts ?? []).isEmpty && grading == nil,
                unknown: unknown,
                xp: grading == nil && fresh && pops ? xp : 0,
                combo: grading == nil && fresh && store.prefs.game.pops ? model.combo(beat.id) : 0
            ) {
                if current && grading == nil && beat.canRetry {
                    Button { retrying = true } label: { Label("Try again with this in mind", systemImage: "arrow.clockwise") }
                        .buttonStyle(.fw(.secondary, small: true))
                }
            }
        }
    }
}

let intentText: [String: String] = ["why": "Why?", "example": "Example", "deeper": "Go deeper", "simpler": "Simpler", "visual": "Show me"]

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

// A breathing dot and what the tutor is doing, over skeleton lines.
struct Building: View {
    let label: String
    var compact = false
    @State private var breathe = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Circle().fill(FW.Palette.text3).frame(width: 8, height: 8)
                    .scaleEffect(breathe ? 1 : 0.85).opacity(breathe ? 1 : 0.45)
                if !label.isEmpty { Text(label).font(.sans(14)).foregroundStyle(FW.Palette.text3) }
            }
            if !compact {
                VStack(alignment: .leading, spacing: 10) {
                    GeometryReader { geo in
                        VStack(alignment: .leading, spacing: 10) {
                            Skeleton(width: geo.size.width * 0.92)
                            Skeleton(width: geo.size.width * 0.84)
                            Skeleton(width: geo.size.width * 0.58)
                        }
                    }
                    .frame(height: 62)
                }
            }
        }
        .onAppear { withAnimation(.easeInOut(duration: 1.2).repeatForever()) { breathe = true } }
        .accessibilityElement(children: .combine)
    }
}

// "How familiar is this?": one tap decides how the idea is taught.
private struct GaugeChoice: View {
    let beat: Beat
    let current: Bool
    @Environment(SessionModel.self) private var model

    var body: some View {
        let picked = beat.response?.gauge.flatMap(Gauge.init(rawValue:))
        VStack(alignment: .leading, spacing: 10) {
            Text("How familiar is this?").font(.sans(13)).foregroundStyle(FW.Palette.text3)
            ForEach(Array(Gauge.allCases.enumerated()), id: \.element) { i, g in
                Button {
                    Task { await model.gauge(beat.id, g) }
                } label: {
                    HStack(spacing: 14) {
                        HStack(alignment: .bottom, spacing: 3) {
                            ForEach(0..<3) { j in
                                RoundedRectangle(cornerRadius: 1.5).fill(j <= i ? FW.Palette.text : FW.Palette.surface3)
                                    .frame(width: 4, height: [5, 8, 12][j])
                            }
                        }
                        .frame(width: 22)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(g.label).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
                            Text(g.detail).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        }
                        Spacer()
                    }
                    .card(FW.Radius.base, fill: FW.Palette.surface, padding: 14)
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(picked == g ? FW.Palette.text : .clear, lineWidth: 1.5))
                    .opacity(picked != nil && picked != g ? 0.45 : 1)
                }
                .buttonStyle(.plain)
                .disabled(!current || picked != nil)
            }
        }
    }
}

// The question: options or a written answer, with "How sure?" as submit.
private struct QuestionView: View {
    let beat: Beat
    let current: Bool
    let retrying: Bool
    let onCancelRetry: () -> Void
    @Environment(SessionModel.self) private var model
    @Environment(Store.self) private var store
    @State private var choice: Int?
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let q = beat.question!
        let answered = beat.response != nil && !retrying
        let confidence = beat.response?.confidence.flatMap(Confidence.init(rawValue:))
        VStack(alignment: .leading, spacing: 12) {
            if q.kind == "choice" {
                ForEach(Array((q.options ?? []).enumerated()), id: \.offset) { i, o in
                    choiceRow(i, o, answered: answered)
                }
                if answered {
                    said(confidence)
                } else {
                    ConfidenceSubmit(disabled: choice == nil) { c in
                        Task { await model.answer(beat.id, choice: choice, confidence: c) }
                    }
                    dontKnow
                }
            } else if answered && beat.response?.unknown == true {
                said(nil)
            } else if answered {
                VStack(alignment: .leading, spacing: 6) {
                    Text((beat.attempts?.isEmpty == false ? "Your second try" : "You wrote") + (confidence.map { " · \($0.label.lowercased())" } ?? ""))
                        .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    Text(beat.response?.text ?? "").font(.fw(store.prefs.reading.lessonFont, 16)).foregroundStyle(FW.Palette.text)
                }
                .card(FW.Radius.base, fill: FW.Palette.surface, padding: 14)
            } else {
                written(q)
            }
        }
        .onAppear { choice = beat.response?.choice }
        .onChange(of: retrying) { _, r in
            if r { text = beat.response?.text ?? ""; focused = true }
        }
    }

    private func choiceRow(_ i: Int, _ o: String, answered: Bool) -> some View {
        let picked = (answered ? beat.response?.choice : choice) == i
        let correct = beat.correct_index
        let state = correct.map { i == $0 ? "right" : picked ? "wrong" : "rest" } ?? (picked ? "picked" : "")
        let ring: Color = state == "right" ? FW.Palette.positive : state == "wrong" ? FW.Palette.negative : state == "picked" ? FW.Palette.text : .clear
        return Button {
            choice = i
            Feedback.shared.play(.tap)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(String(UnicodeScalar(65 + i)!))
                    .font(.sans(13, .semibold))
                    .frame(width: 26, height: 26)
                    .foregroundStyle(state == "picked" ? FW.Palette.bg : FW.Palette.text2)
                    .background(state == "picked" ? FW.Palette.text : FW.Palette.surface2, in: .rect(cornerRadius: 8))
                    .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 5 }
                Text(o).font(.sans(16)).foregroundStyle(FW.Palette.text).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if state == "right" { Image(systemName: "checkmark").foregroundStyle(FW.Palette.positive) }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(state == "right" ? FW.Palette.positive.opacity(0.08) : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(ring, lineWidth: 1.5))
            .opacity(state == "rest" ? 0.5 : 1)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(answered)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }

    private func written(_ q: Question) -> some View {
        let ok = text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
        let words = text.split(whereSeparator: \.isWhitespace).count
        return VStack(alignment: .leading, spacing: 10) {
            if retrying { Text("Your second try: edit your answer with the feedback in mind.").font(.sans(13)).foregroundStyle(FW.Palette.text3) }
            TextField(q.placeholder ?? "Write your answer…", text: $text, axis: .vertical)
                .lineLimit(q.long == true ? 7... : 3...)
                .font(.fw(store.prefs.reading.lessonFont, 17))
                .focused($focused)
                .padding(14)
                .background(focused ? FW.Palette.raised : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line))
                .accessibilityLabel("Your answer")
            HStack {
                Text(words > 0 ? "\(words) words" : "Dictation works well here.").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                if retrying {
                    Text("·").foregroundStyle(FW.Palette.text3)
                    Button("Keep my first answer", action: onCancelRetry).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text2)
                }
            }
            ConfidenceSubmit(disabled: !ok) { c in
                focused = false
                Task { await model.answer(beat.id, text: text.trimmingCharacters(in: .whitespacesAndNewlines), confidence: c, retry: retrying) }
            }
            if !retrying { dontKnow }
        }
    }

    @ViewBuilder
    private var dontKnow: some View {
        if store.prefs.session.dontKnow {
            Button("I don’t know yet — teach me") { Task { await model.answer(beat.id, unknown: true) } }
                .font(.sans(14))
                .foregroundStyle(FW.Palette.text3)
        }
    }

    private func said(_ c: Confidence?) -> some View {
        Text(beat.response?.unknown == true ? "You said you don’t know yet." : c.map { "You said: \($0.label.lowercased())" } ?? "")
            .font(.sans(13)).foregroundStyle(FW.Palette.text3)
    }
}

// "How sure?" doubles as the submit button: one tap commits the answer and
// the confidence together.
private struct ConfidenceSubmit: View {
    let disabled: Bool
    let onSubmit: (Confidence?) -> Void
    @Environment(Store.self) private var store

    var body: some View {
        if !store.prefs.session.confidence {
            Button { onSubmit(nil) } label: { Label("Check my answer", systemImage: "arrow.right").labelStyle(TrailingIcon()) }
                .buttonStyle(.fw(.primary))
                .disabled(disabled)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("How sure?").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                HStack(spacing: 8) {
                    ForEach(Array(Confidence.allCases.enumerated()), id: \.element) { i, c in
                        Button { onSubmit(c) } label: {
                            HStack(spacing: 8) {
                                HStack(alignment: .bottom, spacing: 2) {
                                    ForEach(0..<3) { j in
                                        RoundedRectangle(cornerRadius: 1).fill(j <= i ? FW.Palette.text : FW.Palette.text4).frame(width: 3, height: [5, 8, 11][j])
                                    }
                                }
                                Text(c.label).font(.sans(14, .medium)).lineLimit(1).minimumScaleFactor(0.85)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(FW.Palette.text)
                            .background(FW.Palette.surface2, in: .rect(cornerRadius: FW.Radius.base))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .disabled(disabled)
                .opacity(disabled ? 0.4 : 1)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Check your answer: how sure are you?")
        }
    }
}

struct FeedbackCard<Extra: View>: View {
    let verdict: String?
    let blocks: [Block]
    let streaming: Bool
    var retried = false
    var unknown = false
    var xp = 0
    var combo = 0
    @ViewBuilder var extra: () -> Extra
    @State private var popped = false

    var body: some View {
        let color = unknown ? FW.Palette.review : verdictColor(verdict)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Dot(color: color)
                Text(unknown ? (streaming ? "Teaching it" : "Here’s how it works") : verdict.flatMap { verdictLabel[$0] } ?? "Reading your answer")
                    .font(.sans(13, .semibold)).foregroundStyle(color)
                if retried { Text("· second try").font(.sans(13)).foregroundStyle(FW.Palette.text3) }
                if xp > 0 {
                    Text("+\(xp) XP").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.caution)
                        .padding(.horizontal, 8).frame(height: 22).background(FW.Palette.caution.opacity(0.14), in: .capsule)
                        .scaleEffect(popped ? 1 : 0.6).opacity(popped ? 1 : 0)
                }
                if combo >= 3 {
                    HStack(spacing: 3) { Image(systemName: "flame.fill"); Text("\(combo) in a row") }
                        .font(.sans(12, .semibold)).foregroundStyle(FW.Palette.coral)
                        .scaleEffect(popped ? 1 : 0.6).opacity(popped ? 1 : 0)
                }
            }
            if !blocks.isEmpty {
                Blocks(blocks: blocks, streaming: streaming, size: 17)
            } else if streaming {
                Building(label: "", compact: true)
            }
            extra()
        }
        .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 18)
        .onAppear {
            guard xp > 0 || combo >= 3 else { return }
            withAnimation(.spring(response: 0.4, dampingFraction: 0.55).delay(0.25)) { popped = true }
        }
    }
}

extension FeedbackCard where Extra == EmptyView {
    init(verdict: String?, blocks: [Block], streaming: Bool) {
        self.init(verdict: verdict, blocks: blocks, streaming: streaming) { EmptyView() }
    }
}

// An ask under a step: the quoted passage, the question, the answer.
private struct AskView: View {
    let quote: String?
    let prompt: String
    let intent: String
    let blocks: [Block]
    let streaming: Bool
    var error: String? = nil
    var onDismiss: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let quote {
                Text("“\(quote)”").font(.serif(15, italic: true)).foregroundStyle(FW.Palette.text2).lineLimit(3)
                    .padding(.leading, 10)
                    .overlay(alignment: .leading) { Rectangle().fill(FW.Palette.line3).frame(width: 2) }
            }
            if !prompt.isEmpty {
                Label(prompt, systemImage: intentIcon)
                    .font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text2)
            }
            if let error {
                HStack {
                    Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative)
                    if let onDismiss { Button("Dismiss", action: onDismiss).buttonStyle(.fw(.secondary, small: true)) }
                }
            } else if !blocks.isEmpty {
                Blocks(blocks: blocks, streaming: streaming)
            } else if streaming {
                Building(label: "Thinking", compact: true)
            }
        }
        .padding(.leading, 16)
        .overlay(alignment: .leading) { Rectangle().fill(FW.Palette.line2).frame(width: 1) }
    }

    private var intentIcon: String {
        ["why": "questionmark", "example": "text.alignleft", "deeper": "arrow.down.to.line", "simpler": "line.3.horizontal", "visual": "chart.bar"][intent] ?? "sparkles"
    }
}

// A step's notes, and the editor when one is being written here.
private struct BeatNotes: View {
    let beatId: String
    let canAdd: Bool
    @Environment(SessionExtras.self) private var extras
    @FocusState private var focused: Bool

    var body: some View {
        @Bindable var x = extras
        let writing = extras.draft?.beatId == beatId
        VStack(alignment: .leading, spacing: 10) {
            ForEach(extras.notes(for: beatId)) { n in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "note.text").font(.system(size: 13)).foregroundStyle(FW.Palette.caution)
                    VStack(alignment: .leading, spacing: 4) {
                        if let q = n.quote { Text("“\(q)”").font(.serif(14, italic: true)).foregroundStyle(FW.Palette.text2).lineLimit(3) }
                        Text(n.text).font(.sans(15)).foregroundStyle(FW.Palette.text)
                    }
                    Spacer(minLength: 0)
                    Button { extras.edit(n) } label: { Image(systemName: "pencil") }.accessibilityLabel("Edit note")
                    Button { Task { await extras.remove(n.id) } } label: { Image(systemName: "trash") }.accessibilityLabel("Delete note")
                }
                .font(.system(size: 13))
                .foregroundStyle(FW.Palette.text3)
                .padding(12)
                .background(FW.Palette.caution.opacity(0.07), in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.caution.opacity(0.16)))
            }
            if writing {
                VStack(alignment: .leading, spacing: 10) {
                    if let q = extras.draft?.quote { Text("“\(q)”").font(.serif(14, italic: true)).foregroundStyle(FW.Palette.text2).lineLimit(3) }
                    TextField("A note for yourself. It goes to your Notebook.", text: Binding(get: { x.draft?.text ?? "" }, set: { x.draft?.text = $0 }), axis: .vertical)
                        .lineLimit(2...)
                        .font(.sans(15))
                        .focused($focused)
                        .padding(12)
                        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                        .accessibilityLabel("Your note")
                    HStack(spacing: 10) {
                        Button("Save note") { Task { await extras.save() } }
                            .buttonStyle(.fw(.primary, small: true))
                            .disabled((extras.draft?.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || extras.saving)
                        Button("Cancel") { extras.draft = nil }.buttonStyle(.fw(.ghost, small: true))
                        if let e = extras.noteError { Text(e).font(.sans(13)).foregroundStyle(FW.Palette.negative) }
                    }
                }
                .onAppear { focused = true }
            } else if canAdd {
                Button { extras.start(beatId) } label: { Label("Add a note", systemImage: "note.text") }
                    .font(.sans(13))
                    .foregroundStyle(FW.Palette.text3)
            }
        }
    }
}

// A break: a ring counting down to the server's end time.
private struct BreakTimer: View {
    let beat: Beat
    let until: String?
    let onDone: () -> Void
    @Environment(SessionModel.self) private var model
    @State private var end: Date?
    @State private var notify = false

    var body: some View {
        let total = (beat.minutes ?? 5) * 60
        TimelineView(.periodic(from: .now, by: 0.5)) { ctx in
            let finish = end ?? ctx.date.addingTimeInterval(total)
            let left = max(0, Int(finish.timeIntervalSince(ctx.date).rounded()))
            let progress = 1 - min(1, Double(left) / total)
            VStack(spacing: 16) {
                ZStack {
                    Circle().stroke(FW.Palette.surface3, lineWidth: 4)
                    Circle().trim(from: 0, to: progress).stroke(FW.Palette.text, style: .init(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.5), value: progress)
                    Text("\(left / 60):\(String(format: "%02d", left % 60))").font(.display(30)).monospacedDigit().foregroundStyle(FW.Palette.text)
                }
                .frame(width: 132, height: 132)
                Text(left > 0 ? (notify ? "Step away from the screen. We’ll send a notification when it’s time." : "Step away from the screen. Stretch, get water.") : "Ready when you are.")
                    .font(.sans(15)).foregroundStyle(FW.Palette.text2).multilineTextAlignment(.center)
                if left == 0 { Button("Continue", action: onDone).buttonStyle(.primary) }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .task {
            if let u = Stamp.parse(until), u > .now { end = u }
            notify = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .authorized
            if let u = await model.startBreak(beat.id) { end = u }
        }
    }
}

