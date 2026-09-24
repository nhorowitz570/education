import SwiftUI

// The Notebook (src/components/notebook/notebook.tsx): every idea met so
// far, in the learner's own words, with the explanation and picture that
// taught it and the questions they asked.
struct NotebookView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var model = NotebookModel.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                content
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await model.load(owner: store.owner) }
        .task { await model.load(owner: store.owner) }
    }

    private var header: some View {
        let entries = model.data?.entries ?? []
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                Kicker("Notebook")
                Spacer(minLength: 0)
                if let d = model.data, !d.entries.isEmpty {
                    ShareLink(
                        item: MarkdownFile(name: "fieldwork-notebook.md") { NotebookExport.markdown(d) },
                        preview: SharePreview("Notebook")
                    ) {
                        Label("Export", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.fw(.secondary, small: true))
                }
            }
            .frame(minHeight: 34)
            Text("What you’ve learned, in your words.")
                .font(.display(34))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if !entries.isEmpty {
                Text(counts(entries))
                    .font(.sans(13))
                    .foregroundStyle(FW.Palette.text3)
                    .monospacedDigit()
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, 12)
        .padding(.bottom, 24)
    }

    private func counts(_ entries: [NotebookEntry]) -> String {
        let ideas = entries.filter { !$0.offPlan }.count
        let trips = entries.filter(\.offPlan).count
        let explained = entries.filter { !$0.words.isEmpty }.count
        return NotebookText.count(ideas, "idea")
            + (trips > 0 ? " · \(NotebookText.count(trips, "side trip"))" : "")
            + " · \(explained) explained by you"
    }

    @ViewBuilder
    private var content: some View {
        if let d = model.data {
            if d.entries.isEmpty {
                empty
            } else {
                NotebookIndex(data: d) { router.push(.concept($0)) }
            }
        } else if let error = model.error {
            VStack(alignment: .leading, spacing: 10) {
                Text("The Notebook couldn’t load.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                ErrorNote(message: error) { Task { await model.load(owner: store.owner) } }
            }
            .padding(.top, 12)
        } else {
            VStack(spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in NotebookCardSkeleton() }
            }
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "book.closed").font(.system(size: 26)).foregroundStyle(FW.Palette.text2)
            Text("Your Notebook fills itself.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
            Text("Every idea you meet in a session lands here with your own explanation of it, the picture that made it click and the questions you asked. Nothing to write up.")
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text2)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 8)
            Button("Go to Today") { router.open("/") }.buttonStyle(.fw(.primary))
        }
        .padding(.vertical, 28)
    }
}

// Search, track filter and the cards, grouped by track.
private struct NotebookIndex: View {
    let data: NotebookData
    let onOpen: (String) -> Void
    @State private var query = ""
    @State private var track: String?
    @FocusState private var searching: Bool

    var body: some View {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let list = data.entries.filter { e in
            (track == nil || e.track == track) && (q.isEmpty || NotebookIndex.matches(e, q))
        }
        let groups = track.map { [NotebookTrack(id: $0, title: "")] } ?? data.tracks
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                search
                if data.tracks.count > 1 { chips }
            }
            .padding(.bottom, 28)
            if list.isEmpty {
                Text("Nothing matches “\(query)”.")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text2)
            }
            ForEach(groups) { g in
                let items = list.filter { $0.track == g.id }
                if !items.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        if !g.title.isEmpty {
                            HStack(spacing: 8) {
                                Dot(color: trackColor(g.id), size: 7)
                                Kicker(g.title)
                                Text("\(items.count)").font(.mono(11)).foregroundStyle(FW.Palette.text4).monospacedDigit()
                            }
                        }
                        VStack(spacing: 12) {
                            ForEach(items) { e in NotebookCard(entry: e) { onOpen(e.key) } }
                        }
                    }
                    .padding(.bottom, 36)
                }
            }
        }
    }

    static func matches(_ e: NotebookEntry, _ q: String) -> Bool {
        e.title.lowercased().contains(q)
            || e.summary.lowercased().contains(q)
            || e.words.contains { $0.text.lowercased().contains(q) }
            || e.notes.contains { $0.text.lowercased().contains(q) }
            || e.asks.contains { $0.question.lowercased().contains(q) }
    }

    private var search: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15))
                .foregroundStyle(FW.Palette.text3)
                .frame(width: 20)
            TextField("Search your ideas, words and notes", text: $query)
                .font(.sans(16))
                .foregroundStyle(FW.Palette.text)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .focused($searching)
                .accessibilityLabel("Search the Notebook")
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(FW.Palette.text3)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, query.isEmpty ? 14 : 6)
        .frame(minHeight: 46)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(searching ? FW.Palette.line3 : FW.Palette.line))
    }

    private var chips: some View {
        FlowLayout(spacing: 8) {
            NotebookChip(title: "All", color: nil, on: track == nil) { set(nil) }
            ForEach(data.tracks) { t in
                NotebookChip(title: t.title, color: trackColor(t.id), on: track == t.id) { set(track == t.id ? nil : t.id) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Filter by track")
    }

    private func set(_ t: String?) {
        Feedback.shared.play(.tap)
        withAnimation(.easeOut(duration: FW.Motion.base)) { track = t }
    }
}

// A filter chip with the track's dot (web: .chip.t-<track>).
private struct NotebookChip: View {
    let title: String
    let color: Color?
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let color { Circle().fill(on ? FW.Palette.onAccent : color).frame(width: 7, height: 7) }
                Text(title).font(.sans(14)).lineLimit(1)
            }
            .padding(.horizontal, 13)
            .frame(minHeight: 34)
            .foregroundStyle(on ? FW.Palette.onAccent : FW.Palette.text2)
            .background(on ? FW.Palette.accent : FW.Palette.surface, in: .capsule)
            .overlay(Capsule().strokeBorder(on ? .clear : FW.Palette.line))
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// One idea: its level, title, the learner's best answer (or the summary),
// recall strength and when it was last seen.
private struct NotebookCard: View {
    let entry: NotebookEntry
    let onOpen: () -> Void

    var body: some View {
        let e = entry
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(e.offPlan ? "Side trip" : notebookLevel(e.level))
                        .font(.sans(13))
                        .foregroundStyle(FW.Palette.text3)
                    Spacer(minLength: 0)
                    if e.shared != nil {
                        Image(systemName: "link")
                            .font(.system(size: 12))
                            .foregroundStyle(FW.Palette.text3)
                            .accessibilityLabel("Shared by link")
                    }
                }
                Text(e.title)
                    .font(.display(22))
                    .foregroundStyle(FW.Palette.text)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Group {
                    if let best = e.words.first {
                        Text("“\(NotebookText.clip(best.text, 150))”")
                            .font(.serif(15.5, italic: true))
                    } else {
                        Text(e.summary.isEmpty ? NotebookText.firstLine(e.explanation) : e.summary)
                            .font(.sans(14))
                    }
                }
                .foregroundStyle(FW.Palette.text2)
                .lineSpacing(2)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
                HStack(spacing: 12) {
                    if !e.offPlan {
                        Meter(value: e.strength, color: trackColor(e.track), height: 3)
                            .frame(width: 64)
                            .accessibilityLabel("\(Int((e.strength * 100).rounded()))% recall strength")
                    }
                    Text(foot)
                        .font(.sans(12))
                        .foregroundStyle(FW.Palette.text3)
                        .monospacedDigit()
                        .lineLimit(1)
                }
                .padding(.top, 4)
            }
            .padding(.top, 18)
            .padding(.horizontal, 18)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity, minHeight: 176, alignment: .topLeading)
            .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg).strokeBorder(FW.Palette.line))
            .contentShape(.rect(cornerRadius: FW.Radius.lg))
        }
        .buttonStyle(NotebookPress())
    }

    private var foot: String {
        let e = entry
        return [
            e.notes.isEmpty ? nil : "\(e.notes.count) note\(e.notes.count == 1 ? "" : "s")",
            e.asks.isEmpty ? nil : "\(e.asks.count) asked",
            NotebookText.day(e.last_seen),
        ]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: " · ")
    }
}

private struct NotebookPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.easeOut(duration: FW.Motion.fast), value: configuration.isPressed)
    }
}

private struct NotebookCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Skeleton(width: 70, height: 12)
            Skeleton(height: 22).frame(maxWidth: 240, alignment: .leading).padding(.top, 12)
            Skeleton(height: 12).padding(.top, 14)
            Skeleton(height: 12).frame(maxWidth: 200, alignment: .leading).padding(.top, 8)
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 176, alignment: .topLeading)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg).strokeBorder(FW.Palette.line))
    }
}

// MARK: - An entry

struct NotebookEntryView: View {
    let conceptKey: String
    @Environment(Store.self) private var store
    @State private var model = NotebookModel.shared
    @State private var sharing = false
    @State private var recalling = false
    @State private var more = false

    var body: some View {
        ScrollView {
            Group {
                if let e = model.entry(conceptKey) {
                    content(e)
                } else if model.data == nil, let error = model.error {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("The Notebook couldn’t load.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                        ErrorNote(message: error) { Task { await model.load(owner: store.owner) } }
                    }
                } else if model.data == nil {
                    VStack(alignment: .leading, spacing: 14) {
                        Skeleton(width: 140, height: 12)
                        Skeleton(height: 40).frame(maxWidth: 280, alignment: .leading)
                        SkeletonLines(count: 2)
                    }
                } else {
                    Text("That idea isn’t in your Notebook.").font(.sans(15)).foregroundStyle(FW.Palette.text2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 8)
            .padding(.bottom, 48)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load(owner: store.owner) }
        .task { if model.data == nil { await model.load(owner: store.owner) } }
        .sheet(isPresented: $sharing) {
            if let e = model.entry(conceptKey) { NotebookShareSheet(entry: e) }
        }
    }

    private func content(_ e: NotebookEntry) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            head(e)
            if !e.offPlan { strength(e) }
            if let best = e.words.first {
                NotebookSection(title: "In your words") {
                    NotebookWords(words: best, track: e.track)
                    if e.words.count > 1 {
                        if more {
                            ForEach(Array(e.words.dropFirst().enumerated()), id: \.offset) { _, w in NotebookWords(words: w, track: e.track) }
                        } else {
                            let n = e.words.count - 1
                            Button("\(n) more answer\(n == 1 ? "" : "s")") {
                                withAnimation(.easeOut(duration: FW.Motion.base)) { more = true }
                            }
                            .font(.sans(14, .medium))
                            .foregroundStyle(FW.Palette.text2)
                            .buttonStyle(.plain)
                            .frame(minHeight: 32)
                        }
                    }
                }
            }
            if e.explanation?.isEmpty == false || e.visual != nil {
                NotebookSection(title: "How it was explained") {
                    if let md = e.explanation, !md.isEmpty {
                        Markdown(text: md, face: store.prefs.reading.lessonFont, scale: store.prefs.readScale)
                    }
                    if let v = e.visual { VisualView(spec: v).padding(.top, 4) }
                }
            }
            if !e.misconceptions.isEmpty {
                NotebookSection(title: "Worth watching") {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(e.misconceptions, id: \.self) { m in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text("•").foregroundStyle(FW.Palette.text3)
                                Text(m).fixedSize(horizontal: false, vertical: true)
                            }
                            .font(.sans(15))
                            .foregroundStyle(FW.Palette.text2)
                        }
                    }
                }
            }
            if !e.asks.isEmpty {
                NotebookSection(title: "What you asked") {
                    VStack(spacing: 8) {
                        ForEach(Array(e.asks.enumerated()), id: \.offset) { i, a in NotebookAsk(ask: a, initiallyOpen: i == 0) }
                    }
                }
            }
            NotebookNotes(entry: e)
            if !e.sources.isEmpty {
                NotebookSection(title: "Where it came from") {
                    VStack(spacing: 0) {
                        ForEach(Array(e.sources.enumerated()), id: \.offset) { i, s in
                            Button { Router.shared.cover = .session(s.run) } label: {
                                HStack(spacing: 14) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(s.title).font(.sans(15)).foregroundStyle(FW.Palette.text).multilineTextAlignment(.leading)
                                        Text("\(NotebookText.kind(s.kind)) · \(NotebookText.day(s.at))")
                                            .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text4)
                                }
                                .padding(.vertical, 10)
                                .frame(minHeight: 56)
                                .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                            .overlay(alignment: .top) { if i > 0 { Rule() } }
                        }
                    }
                }
            }
        }
    }

    private func head(_ e: NotebookEntry) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Dot(color: trackColor(e.track), size: 7)
                Kicker(e.trackTitle + (e.offPlan ? "" : " · \(notebookLevel(e.level))"))
            }
            Text(e.title)
                .font(.display(34))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if !e.summary.isEmpty {
                Text(e.summary)
                    .font(.sans(17))
                    .foregroundStyle(FW.Palette.text2)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                if !e.offPlan {
                    Button { recall(e) } label: {
                        HStack(spacing: 8) {
                            if recalling { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "arrow.clockwise") }
                            Text("Quick recall")
                        }
                    }
                    .buttonStyle(.fw(.primary))
                    .disabled(recalling)
                }
                Button { sharing = true } label: {
                    Label(e.shared != nil ? "Shared" : "Share", systemImage: e.shared != nil ? "link" : "square.and.arrow.up")
                }
                .buttonStyle(.fw(.secondary))
            }
            .padding(.top, 6)
        }
        .padding(.top, 4)
        .padding(.bottom, 24)
    }

    private func strength(_ e: NotebookEntry) -> some View {
        let due: String = {
            guard let d = e.due_at else { return "" }
            if let date = Stamp.parse(d) ?? Dates.parse(d), date <= .now { return " · review due now" }
            return " · review due \(NotebookText.day(d))"
        }()
        return VStack(alignment: .leading, spacing: 8) {
            Meter(value: e.strength, color: trackColor(e.track), height: 6)
                .frame(maxWidth: 420)
            Text("\(Int((e.strength * 100).rounded()))% recall strength · first met \(NotebookText.day(e.first_seen))\(due)")
                .font(.sans(13))
                .foregroundStyle(FW.Palette.text3)
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Recall strength")
        .accessibilityValue("\(Int((e.strength * 100).rounded())) percent")
    }

    private func recall(_ e: NotebookEntry) {
        recalling = true
        Feedback.shared.play(.tap)
        Task {
            do { _ = try await Runs.start(.init(kind: "review", concepts: [e.key])) } catch { Toasts.shared.show(error.localizedDescription) }
            recalling = false
        }
    }
}

// A section under a hairline, with its eyebrow (web: .nb-section).
private struct NotebookSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Kicker(title)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 28)
        .overlay(alignment: .top) { Rule() }
        .padding(.top, 28)
    }
}

// One answer in the learner's words, with how it landed.
private struct NotebookWords: View {
    let words: NotebookEntry.Words
    let track: String
    @Environment(Store.self) private var store

    var body: some View {
        let scale = store.prefs.readScale
        VStack(alignment: .leading, spacing: 8) {
            Text(words.text)
                .font(.fw(store.prefs.reading.lessonFont, 19 * scale))
                .foregroundStyle(FW.Palette.text)
                .lineSpacing(5 * scale)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            HStack(spacing: 6) {
                if let v = words.verdict { Dot(color: verdictColor(v), size: 7) }
                Text(caption)
                    .font(.sans(13))
                    .foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.leading, 18)
        .overlay(alignment: .leading) { Rectangle().fill(trackColor(track)).frame(width: 2) }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var caption: String {
        let verdict: String? = switch words.verdict {
        case "solid": "Solid"
        case "partial": "Partly there"
        case "missed": "Not yet"
        default: nil
        }
        let step: String = switch words.step {
        case "attempt": "In your words"
        case "produce": "This week’s work"
        case "transfer": "A new situation"
        case "check": "Your call"
        case "recall": "Warm-up"
        default: "Your answer"
        }
        return (verdict.map { $0 + " · " } ?? "") + "\(step) · \(NotebookText.day(words.at))"
    }
}

// A question asked about this idea, folded to its question (web: details).
private struct NotebookAsk: View {
    let ask: NotebookEntry.AskNote
    @State private var open: Bool
    @Environment(Store.self) private var store

    init(ask: NotebookEntry.AskNote, initiallyOpen: Bool) {
        self.ask = ask
        _open = State(initialValue: initiallyOpen)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.snappy(duration: 0.28)) { open.toggle() }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let q = ask.quote, !q.isEmpty {
                            Text("“\(NotebookText.clip(q, 90, cut: 89))”")
                                .font(.sans(13))
                                .foregroundStyle(FW.Palette.text3)
                        }
                        Text(ask.question)
                            .font(.sans(15, .medium))
                            .foregroundStyle(FW.Palette.text)
                    }
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(FW.Palette.text3)
                        .rotationEffect(.degrees(open ? 180 : 0))
                        .frame(width: 16, height: 20)
                }
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(open ? .isSelected : [])
            if open {
                Rule()
                Markdown(text: ask.answer, face: store.prefs.reading.lessonFont, scale: store.prefs.readScale, size: 17)
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 16)
                    .transition(.opacity)
            }
        }
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line))
        .clipShape(.rect(cornerRadius: FW.Radius.base))
    }
}

// The learner's own notes on this idea's steps: edit and delete in place.
private struct NotebookNotes: View {
    let entry: NotebookEntry
    @Environment(Store.self) private var store
    @State private var editing: String?
    @State private var draft = ""
    @State private var busy = false
    @FocusState private var focused: Bool

    var body: some View {
        NotebookSection(title: "Your notes") {
            if entry.notes.isEmpty {
                Text("Add a note to any step during a session, or select a passage and choose Note. They collect here.")
                    .font(.sans(13))
                    .foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 10) {
                    ForEach(entry.notes) { n in note(n) }
                }
            }
        }
    }

    private func note(_ n: NotebookEntry.Note) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let q = n.quote, !q.isEmpty {
                Text("“\(q)”")
                    .font(.serif(15, italic: true))
                    .foregroundStyle(FW.Palette.text2)
                    .padding(.leading, 10)
                    .overlay(alignment: .leading) { Rectangle().fill(FW.Palette.line3).frame(width: 2) }
                    .fixedSize(horizontal: false, vertical: true)
            }
            if editing == n.id {
                TextEditor(text: $draft)
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text)
                    .scrollContentBackground(.hidden)
                    .focused($focused)
                    .frame(minHeight: 84)
                    .padding(8)
                    .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.sm))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.sm).strokeBorder(FW.Palette.line2))
                    .accessibilityLabel("Edit note")
                HStack(spacing: 8) {
                    Button("Save") { save(n) }
                        .buttonStyle(.fw(.primary, small: true))
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                    Button("Cancel") { editing = nil }
                        .buttonStyle(.fw(.ghost, small: true))
                }
            } else {
                Text(n.text)
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                HStack(spacing: 2) {
                    Text(NotebookText.day(n.at))
                        .font(.sans(13))
                        .foregroundStyle(FW.Palette.text3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button {
                        draft = n.text
                        editing = n.id
                        Task { focused = true }
                    } label: {
                        Image(systemName: "pencil").frame(width: 34, height: 34).contentShape(.rect)
                    }
                    .accessibilityLabel("Edit note")
                    Button { remove(n) } label: {
                        Image(systemName: "trash").frame(width: 34, height: 34).contentShape(.rect)
                    }
                    .accessibilityLabel("Delete note")
                    .disabled(busy)
                }
                .font(.system(size: 14))
                .foregroundStyle(FW.Palette.text3)
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Caution-tinted paper: the tint sits over the surface.
        .background(FW.Palette.caution.opacity(0.07), in: .rect(cornerRadius: FW.Radius.base))
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.caution.opacity(0.16)))
    }

    private func save(_ n: NotebookEntry.Note) {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true
        Task {
            do {
                let body: [String: JSON] = ["id": .string(n.id), "runId": .string(n.run), "beatId": .string(n.beat), "text": .string(text)]
                let _: JSON = try await API.post("/api/notes", body)
                editing = nil
                await NotebookModel.shared.load(owner: store.owner)
            } catch {
                Toasts.shared.show(error.localizedDescription)
            }
            busy = false
        }
    }

    private func remove(_ n: NotebookEntry.Note) {
        busy = true
        Task {
            do {
                try await API.delete("/api/notes", ["id": n.id])
                await NotebookModel.shared.load(owner: store.owner)
                Toasts.shared.show("Note removed.")
            } catch {
                Toasts.shared.show(error.localizedDescription)
            }
            busy = false
        }
    }
}

// MARK: - Text helpers

enum NotebookText {
    static func count(_ n: Int, _ word: String) -> String { "\(n) \(word)\(n == 1 ? "" : "s")" }

    // web: dateLabel(iso.slice(0, 10), false) → "Sep 24".
    static func day(_ iso: String) -> String { Dates.short(String(iso.prefix(10))) }

    static func clip(_ s: String, _ max: Int, cut: Int? = nil) -> String {
        guard s.count > max else { return s }
        return String(s.prefix(cut ?? max - 1)).trimmingCharacters(in: .whitespaces) + "…"
    }

    // The first sentence of an explanation, without Markdown marks.
    static func firstLine(_ md: String?) -> String {
        let plain = (md ?? "").replacingOccurrences(of: #"[*_`>#]"#, with: "", options: .regularExpression)
        var first = plain
        if let r = plain.range(of: #"[.!?]\s"#, options: .regularExpression) {
            first = String(plain[..<plain.index(after: r.lowerBound)])
        }
        return String(first.prefix(160))
    }

    static func kind(_ k: String) -> String {
        switch k {
        case "review": "Review"
        case "explore": "Side trip"
        case "rehearsal": "Rehearsal"
        default: "Session"
        }
    }
}

// The Notebook as one Markdown document, built on the device as the web does.
enum NotebookExport {
    static func markdown(_ data: NotebookData) -> String {
        var lines = ["# Notebook", ""]
        for t in data.tracks {
            let items = data.entries.filter { $0.track == t.id }
            if items.isEmpty { continue }
            lines += ["## \(t.title)", ""]
            for e in items {
                lines += ["### \(e.title)", ""]
                if !e.summary.isEmpty { lines += [e.summary, ""] }
                if let w = e.words.first { lines += ["> \(flat(w.text))", ""] }
                if let x = e.explanation, !x.isEmpty { lines += [x, ""] }
                for a in e.asks { lines.append("- **\(a.question)** \(String(flat(a.answer).prefix(400)))") }
                for n in e.notes { lines.append("- Note: \(flat(n.text))") }
                lines.append("")
            }
        }
        return lines.joined(separator: "\n")
    }

    private static func flat(_ s: String) -> String {
        s.replacingOccurrences(of: #"\n+"#, with: " ", options: .regularExpression)
    }
}
