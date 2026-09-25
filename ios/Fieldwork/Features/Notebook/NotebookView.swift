import SwiftUI

// The Notebook (src/components/notebook/notebook.tsx): every idea met so
// far, in the learner's own words, with the explanation and picture that
// taught it and the questions they asked. On iPhone it reads as a library:
// a quick-recall deck up top, then a shelf of idea cards per subject, with
// notes and an A–Z of terms one tap away.
struct NotebookView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var model = NotebookModel.shared
    @State private var query = ""
    @State private var pane: NotebookPane = .ideas

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 4)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("Notebook")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $query, prompt: "Ideas, words and notes")
        .autocorrectionDisabled()
        .toolbar {
            if let d = model.data, !d.entries.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(
                        item: MarkdownFile(name: "fieldwork-notebook.md") { NotebookExport.markdown(d) },
                        preview: SharePreview("Notebook")
                    ) {
                        Label("Export", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
        .refreshable { await model.load(owner: store.owner) }
        .task { await model.load(owner: store.owner) }
    }

    @ViewBuilder
    private var content: some View {
        if let d = model.data {
            if d.entries.isEmpty {
                empty
            } else {
                NotebookLibrary(data: d, query: query, pane: $pane) { router.push(.concept($0)) }
            }
        } else if let error = model.error {
            VStack(alignment: .leading, spacing: 12) {
                IconBadge(systemName: "exclamationmark.triangle", color: FW.Palette.caution, size: 48)
                Text("The Notebook couldn’t load.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                ErrorNote(message: error) { Task { await model.load(owner: store.owner) } }
            }
            .padding(.top, 12)
        } else {
            NotebookSkeleton()
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 14) {
            IconBadge(systemName: "book.closed", color: FW.Palette.review, size: 56)
            Text("Your Notebook fills itself.").font(.sans(22, .bold)).foregroundStyle(FW.Palette.text)
            Text("Ideas from your sessions land here, in your words.")
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
            Button("Go to Today") { router.open("/") }
                .buttonStyle(.fw(.primary, wide: true))
                .padding(.top, 6)
        }
        .padding(.vertical, 28)
        .rise()
    }
}

enum NotebookPane: Hashable { case ideas, notes, terms }

// The three ways in (ideas, notes, terms), each filtered by the search.
private struct NotebookLibrary: View {
    let data: NotebookData
    let query: String
    @Binding var pane: NotebookPane
    let onOpen: (String) -> Void
    @State private var track: String?

    var body: some View {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let list = data.entries.filter { q.isEmpty || NotebookLibrary.matches($0, q) }
        VStack(alignment: .leading, spacing: 0) {
            Segmented(options: [(NotebookPane.ideas, "Ideas"), (.notes, "Notes"), (.terms, "Terms")], selection: $pane.animation(Springs.snappy))
                .padding(.bottom, 14)
                .rise(0)
            counts
                .padding(.bottom, 24)
                .rise(1)
            Group {
                switch pane {
                case .ideas: ideas(list, searching: !q.isEmpty)
                case .notes: NotebookNotesPane(entries: list, query: query, onOpen: onOpen)
                case .terms: NotebookTermsPane(entries: list, query: query, onOpen: onOpen)
                }
            }
            .transition(.opacity.combined(with: .scale(0.98, anchor: .top)))
            .id(pane)
        }
    }

    static func matches(_ e: NotebookEntry, _ q: String) -> Bool {
        e.title.lowercased().contains(q)
            || e.summary.lowercased().contains(q)
            || e.words.contains { $0.text.lowercased().contains(q) }
            || e.notes.contains { $0.text.lowercased().contains(q) }
            || e.asks.contains { $0.question.lowercased().contains(q) }
    }

    // web: "7 ideas · 1 side trip · 3 explained by you", as pills.
    private var counts: some View {
        let ideas = data.entries.filter { !$0.offPlan }.count
        let trips = data.entries.filter(\.offPlan).count
        let explained = data.entries.filter { !$0.words.isEmpty }.count
        return ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Pill(text: NotebookText.count(ideas, "idea"), icon: "lightbulb", color: FW.Palette.caution)
                Pill(text: "\(explained) in your words", icon: "quote.bubble", color: FW.Palette.review)
                if trips > 0 { Pill(text: NotebookText.count(trips, "side trip"), icon: "sparkles", color: FW.Palette.coral) }
            }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func ideas(_ list: [NotebookEntry], searching: Bool) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            if !searching {
                let due = NotebookRecallHero.pick(data.entries)
                if !due.isEmpty { NotebookRecallHero(entries: due).rise(2) }
            }
            if data.tracks.count > 1 {
                chips.rise(3)
            }
            if list.isEmpty {
                noMatch
            } else if searching || track != nil {
                let items = list.filter { track == nil || $0.track == track }
                if items.isEmpty { noMatch } else { grid(items) }
            } else {
                shelves(list)
            }
        }
        .animation(Springs.smooth, value: track)
    }

    private var noMatch: some View {
        HStack(spacing: 12) {
            IconBadge(systemName: "magnifyingglass", color: FW.Palette.text3, size: 36)
            Text(query.isEmpty ? "Nothing here yet." : "Nothing matches “\(query)”.")
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text2)
        }
        .transition(.opacity)
    }

    // Filter by subject (web: .chip.t-<track>).
    private var chips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                NotebookChip(title: "All", icon: "square.grid.2x2", color: FW.Palette.text2, on: track == nil) { set(nil) }
                ForEach(data.tracks) { t in
                    NotebookChip(title: t.title, icon: notebookGlyph(t.id), color: notebookTint(t.id), on: track == t.id) { set(track == t.id ? nil : t.id) }
                }
            }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Filter by subject")
    }

    private func set(_ t: String?) {
        Feedback.shared.play(.tap)
        withAnimation(Springs.snappy) { track = t }
    }

    // One horizontal shelf of cards per subject.
    private func shelves(_ list: [NotebookEntry]) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            ForEach(Array(data.tracks.enumerated()), id: \.element.id) { i, g in
                let items = list.filter { $0.track == g.id }
                if !items.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Button { set(g.id) } label: {
                            HStack(spacing: 10) {
                                IconBadge(systemName: notebookGlyph(g.id), color: notebookTint(g.id), size: 30)
                                Text(g.title).font(.sans(20, .bold)).foregroundStyle(FW.Palette.text)
                                Text("\(items.count)").font(.sans(15, .medium)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(FW.Palette.text4)
                            }
                            .frame(minHeight: 44)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(g.title), \(items.count) ideas")
                        .accessibilityHint("Shows only this subject")
                        ScrollView(.horizontal) {
                            LazyHStack(spacing: 12) {
                                ForEach(items) { e in
                                    NotebookTile(entry: e) { onOpen(e.key) }
                                        .frame(width: 168)
                                        .scrollTransition(.interactive, axis: .horizontal) { c, phase in
                                            c.scaleEffect(phase.isIdentity ? 1 : 0.94).opacity(phase.isIdentity ? 1 : 0.75)
                                        }
                                }
                            }
                            .scrollTargetLayout()
                        }
                        .scrollTargetBehavior(.viewAligned)
                        .scrollIndicators(.hidden)
                        .contentMargins(.horizontal, FW.Size.gutter, for: .scrollContent)
                        .padding(.horizontal, -FW.Size.gutter)
                    }
                    .rise(4 + i)
                }
            }
        }
        .transition(.opacity)
    }

    private func grid(_ items: [NotebookEntry]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, e in
                NotebookTile(entry: e) { onOpen(e.key) }
                    .rise(i, step: 0.04)
            }
        }
        .transition(.opacity)
    }
}

// A subject chip: glyph and name, filled when chosen.
private struct NotebookChip: View {
    let title: String
    let icon: String
    let color: Color
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(on ? FW.Palette.onAccent : color)
                Text(title).font(.sans(14, .semibold)).lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 36)
            .foregroundStyle(on ? FW.Palette.onAccent : FW.Palette.text)
            .background(on ? AnyShapeStyle(FW.Palette.accent) : AnyShapeStyle(FW.Palette.raised), in: .capsule)
            .overlay(Capsule().strokeBorder(on ? .clear : FW.Palette.line))
            .contentShape(.capsule)
        }
        .buttonStyle(.pressable(0.94))
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// One idea as a card: subject glyph, recall ring, title, level and what's
// attached to it (notes, questions, a share link).
private struct NotebookTile: View {
    let entry: NotebookEntry
    let onOpen: () -> Void

    var body: some View {
        let e = entry
        let tint = notebookTint(e.track)
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    IconBadge(systemName: notebookGlyph(e.track), color: tint, size: 34)
                    Spacer(minLength: 4)
                    if e.offPlan {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(tint)
                            .frame(width: 36, height: 36)
                    } else {
                        NotebookRing(value: e.strength, color: tint, size: 36)
                    }
                }
                Spacer(minLength: 14)
                Text(e.title)
                    .font(.sans(16, .semibold))
                    .foregroundStyle(FW.Palette.text)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 8) {
                    Text(e.offPlan ? "Side trip" : notebookLevel(e.level))
                        .font(.sans(12, .semibold))
                        .foregroundStyle(e.offPlan ? tint : notebookLevelTint(e.level))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    attachments
                }
                .padding(.top, 10)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 184, maxHeight: 184, alignment: .topLeading)
            .background {
                RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous)
                    .fill(LinearGradient(colors: [tint.opacity(0.13), tint.opacity(0.03)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            }
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(tint.opacity(0.2), lineWidth: 1))
            .contentShape(.rect(cornerRadius: FW.Radius.lg))
        }
        .buttonStyle(.pressable)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isButton)
    }

    private var attachments: some View {
        let e = entry
        return HStack(spacing: 7) {
            if !e.words.isEmpty { Image(systemName: "quote.bubble") }
            if !e.notes.isEmpty { Image(systemName: "note.text") }
            if !e.asks.isEmpty { Image(systemName: "questionmark.bubble") }
            if e.shared != nil { Image(systemName: "link") }
        }
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(FW.Palette.text3)
    }

    private var label: String {
        let e = entry
        var parts = [e.title, e.offPlan ? "Side trip" : notebookLevel(e.level)]
        if !e.offPlan { parts.append("\(Int((e.strength * 100).rounded()))% recall strength") }
        if !e.words.isEmpty { parts.append("explained in your words") }
        if !e.notes.isEmpty { parts.append(NotebookText.count(e.notes.count, "note")) }
        if !e.asks.isEmpty { parts.append("\(e.asks.count) asked") }
        if e.shared != nil { parts.append("shared by link") }
        parts.append("last seen \(NotebookText.day(e.last_seen))")
        return parts.joined(separator: ", ")
    }
}

// MARK: - Quick recall

// The one hero: a small deck of the ideas most worth bringing back, to flip
// and swipe through, and a big button that starts a short review of them.
private struct NotebookRecallHero: View {
    let entries: [NotebookEntry]
    @State private var busy = false

    // Due ideas first (weakest first); otherwise the weakest practised ones.
    static func pick(_ all: [NotebookEntry]) -> [NotebookEntry] {
        let known = all.filter { !$0.offPlan && $0.level != "new" }
        let due = known.filter { e in
            guard let d = e.due_at, let date = Stamp.parse(d) ?? Dates.parse(d) else { return false }
            return date <= .now
        }
        let pool = due.isEmpty ? known.filter { $0.strength < 0.8 } : due
        return Array(pool.sorted { $0.strength < $1.strength }.prefix(5))
    }

    private var dueCount: Int {
        entries.filter { e in
            guard let d = e.due_at, let date = Stamp.parse(d) ?? Dates.parse(d) else { return false }
            return date <= .now
        }.count
    }

    var body: some View {
        let colors = Array(Set(entries.map(\.track))).sorted().map(notebookTint) + [FW.Palette.review]
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                IconBadge(systemName: "arrow.triangle.2.circlepath", color: FW.Palette.review, size: 44, filled: true)
                    .symbolEffect(.rotate, value: busy)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Quick recall").font(.sans(20, .bold)).foregroundStyle(FW.Palette.text)
                    Text(dueCount > 0 ? "\(dueCount) due now · about 5 min" : "\(NotebookText.count(entries.count, "idea")) to keep fresh")
                        .font(.sans(14, .medium))
                        .foregroundStyle(FW.Palette.text2)
                        .monospacedDigit()
                }
                Spacer(minLength: 0)
            }
            RecallDeck(entries: entries)
            Button { start() } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "play.fill") }
                    Text("Start recall")
                    Text("\(entries.count)")
                        .font(.sans(14, .bold))
                        .monospacedDigit()
                        .padding(.horizontal, 8)
                        .frame(height: 22)
                        .background(FW.Palette.onAccent.opacity(0.2), in: .capsule)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.primary, wide: true))
            .disabled(busy)
        }
        .padding(18)
        .background {
            Aurora(colors: colors, intensity: 0.32)
                .clipShape(.rect(cornerRadius: FW.Radius.xl, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
    }

    private func start() {
        busy = true
        Feedback.shared.play(.tap)
        Task {
            do { _ = try await Runs.start(.init(kind: "review", concepts: entries.map(\.key))) } catch { Toasts.shared.show(error.localizedDescription) }
            busy = false
        }
    }
}

// Cards stacked like a deck: tap to flip to what you said (or the gist),
// swipe to send the top card to the back.
private struct RecallDeck: View {
    let entries: [NotebookEntry]
    @State private var top = 0
    @State private var drag: CGFloat = 0
    @State private var flipped = false
    @State private var direction: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let n = entries.count
        let depth = min(3, n)
        let stack: [Slot] = (0..<depth).map { Slot(depth: $0, entry: entries[(top + $0) % n]) }
        ZStack {
            // Keyed by idea, so a swiped card slides to the back of the deck
            // (or flies off when the deck is deeper than what's shown).
            ForEach(stack) { item in
                card(item.entry, depth: item.depth)
                    .zIndex(Double(depth - item.depth))
                    .transition(swap)
            }
        }
        .frame(height: 176 + CGFloat(depth - 1) * 10, alignment: .top)
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.7), trigger: top)
        .sensoryFeedback(.selection, trigger: flipped)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint("Flip to check yourself, or go to the next card.")
        .accessibilityAction(named: "Flip") { flip() }
        .accessibilityAction(named: "Next card") { advance(1) }
    }

    private struct Slot: Identifiable {
        let depth: Int
        let entry: NotebookEntry
        var id: String { entry.key }
    }

    private var swap: AnyTransition {
        let removal: AnyTransition = .offset(x: reduceMotion ? 0 : 460 * direction).combined(with: .opacity)
        let insertion: AnyTransition = .opacity.combined(with: .scale(scale: 0.9, anchor: .bottom))
        return .asymmetric(insertion: insertion, removal: removal)
    }

    private var accessibilityText: String {
        let e = entries[top % entries.count]
        return flipped ? "\(e.title): \(back(e))" : e.title
    }

    @ViewBuilder
    private func card(_ e: NotebookEntry, depth d: Int) -> some View {
        let isTop = d == 0
        let tint = notebookTint(e.track)
        FlipCard(angle: isTop && flipped ? 180 : 0, reduced: reduceMotion) {
            face(tint: tint) {
                HStack(spacing: 8) {
                    Image(systemName: notebookGlyph(e.track)).font(.system(size: 13, weight: .semibold)).foregroundStyle(tint)
                    Text(e.trackTitle).font(.sans(13, .semibold)).foregroundStyle(tint)
                    Spacer(minLength: 0)
                    Text("\(((top + d) % entries.count) + 1)/\(entries.count)")
                        .font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                }
                Spacer(minLength: 8)
                Text(e.title)
                    .font(.sans(21, .bold))
                    .foregroundStyle(FW.Palette.text)
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                HStack(spacing: 6) {
                    Image(systemName: "hand.tap")
                    Text("Tap to check yourself")
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.left.and.right")
                }
                .font(.sans(12, .medium))
                .foregroundStyle(FW.Palette.text3)
            }
        } back: {
            face(tint: tint) {
                HStack(spacing: 8) {
                    Text(e.words.isEmpty ? "The gist" : "You said").font(.sans(13, .semibold)).foregroundStyle(tint)
                    Spacer(minLength: 0)
                    NotebookRing(value: e.strength, color: tint, size: 30, line: 3.5)
                }
                if let w = e.words.first {
                    Text("“\(NotebookText.clip(w.text, 180))”")
                        .font(.serif(16, italic: true))
                        .foregroundStyle(FW.Palette.text)
                        .lineSpacing(2)
                        .lineLimit(4)
                } else {
                    Text(back(e))
                        .font(.sans(15))
                        .foregroundStyle(FW.Palette.text)
                        .lineSpacing(2)
                        .lineLimit(4)
                }
                Spacer(minLength: 0)
            }
        }
        .scaleEffect(1 - CGFloat(d) * 0.05, anchor: .bottom)
        .offset(y: CGFloat(d) * 10)
        .offset(x: isTop ? drag : 0)
        .rotationEffect(.degrees(isTop && !reduceMotion ? Double(drag) / 22 : 0), anchor: .bottom)
        .opacity(d == 2 ? 0.7 : 1)
        .allowsHitTesting(isTop)
        .onTapGesture { flip() }
        .simultaneousGesture(isTop ? dragGesture : nil)
    }

    private func back(_ e: NotebookEntry) -> String {
        if let w = e.words.first { return w.text }
        return e.summary.isEmpty ? NotebookText.firstLine(e.explanation) : e.summary
    }

    private func face<C: View>(tint: Color, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) { content() }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 176, maxHeight: 176, alignment: .topLeading)
            .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            .background(tint.opacity(0.08), in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line2, lineWidth: 1))
            .shadow(color: .black.opacity(0.08), radius: 12, y: 6)
            .contentShape(.rect(cornerRadius: FW.Radius.lg))
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { v in
                guard abs(v.translation.width) > abs(v.translation.height) else { return }
                drag = v.translation.width
            }
            .onEnded { v in
                let fling = v.predictedEndTranslation.width
                if abs(drag) > 90 || abs(fling) > 260 {
                    advance(drag == 0 ? (fling > 0 ? 1 : -1) : (drag > 0 ? 1 : -1))
                } else {
                    withAnimation(Springs.bouncy) { drag = 0 }
                }
            }
    }

    private func flip() {
        withAnimation(.fw(Springs.smooth, reduced: reduceMotion)) { flipped.toggle() }
    }

    // The top card goes to the back of the deck.
    private func advance(_ direction: Int) {
        guard entries.count > 1 else {
            withAnimation(Springs.bouncy) { drag = 0; flipped = false }
            return
        }
        self.direction = direction < 0 ? -1 : 1
        withAnimation(.fw(Springs.smooth, reduced: reduceMotion)) {
            top = (top + 1) % entries.count
            drag = 0
            flipped = false
        }
    }
}

// A card with two faces that turns over around its vertical axis; the face
// swaps at the halfway point. A crossfade under Reduce Motion.
private struct FlipCard<Front: View, Back: View>: View, @preconcurrency Animatable {
    var angle: Double
    var reduced: Bool
    @ViewBuilder var front: () -> Front
    @ViewBuilder var back: () -> Back

    var animatableData: Double {
        get { angle }
        set { angle = newValue }
    }

    var body: some View {
        ZStack {
            if angle < 90 {
                front()
            } else {
                back().rotation3DEffect(.degrees(reduced ? 0 : 180), axis: (x: 0, y: 1, z: 0))
            }
        }
        .rotation3DEffect(.degrees(reduced ? 0 : angle), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
    }
}

// MARK: - Notes and terms

// Every note and question across the Notebook; tap one to open its idea,
// where notes are edited.
private struct NotebookNotesPane: View {
    let entries: [NotebookEntry]
    let query: String
    let onOpen: (String) -> Void

    var body: some View {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let notes = entries.flatMap { e in e.notes.map { (e, $0) } }
            .filter { q.isEmpty || $0.1.text.lowercased().contains(q) || $0.0.title.lowercased().contains(q) }
            .sorted { $0.1.at > $1.1.at }
        let asks = entries.flatMap { e in e.asks.map { (e, $0) } }
            .filter { q.isEmpty || $0.1.question.lowercased().contains(q) || $0.0.title.lowercased().contains(q) }
            .sorted { $0.1.at > $1.1.at }
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 12) {
                SectionHead(title: "Your notes", trailing: notes.isEmpty ? nil : "\(notes.count)")
                if notes.isEmpty {
                    NotebookHint(icon: "note.text", text: "Add a note to any step in a session.")
                } else {
                    VStack(spacing: 10) {
                        ForEach(Array(notes.enumerated()), id: \.element.1.id) { i, pair in
                            Button { onOpen(pair.0.key) } label: { card(pair.0, pair.1) }
                                .buttonStyle(.pressable)
                                .rise(i, step: 0.04)
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                SectionHead(title: "What you asked", trailing: asks.isEmpty ? nil : "\(asks.count)")
                if asks.isEmpty {
                    NotebookHint(icon: "questionmark.bubble", text: "Questions you ask the tutor land here.")
                } else {
                    GroupCard {
                        ForEach(Array(asks.enumerated()), id: \.offset) { _, pair in
                            Button { onOpen(pair.0.key) } label: {
                                GroupRow(icon: "questionmark.bubble", title: pair.1.question, caption: pair.0.title, color: notebookTint(pair.0.track))
                            }
                            .buttonStyle(.pressable(0.98))
                        }
                    }
                }
            }
        }
    }

    private func card(_ e: NotebookEntry, _ n: NotebookEntry.Note) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let q = n.quote, !q.isEmpty {
                Text("“\(q)”")
                    .font(.serif(15, italic: true))
                    .foregroundStyle(FW.Palette.text2)
                    .lineLimit(3)
                    .padding(.leading, 10)
                    .overlay(alignment: .leading) { Rectangle().fill(FW.Palette.caution.opacity(0.5)).frame(width: 2) }
                    .multilineTextAlignment(.leading)
            }
            Text(n.text)
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text)
                .lineSpacing(2)
                .lineLimit(5)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 8) {
                Image(systemName: notebookGlyph(e.track)).font(.system(size: 11, weight: .semibold)).foregroundStyle(notebookTint(e.track))
                Text(e.title).font(.sans(13, .medium)).foregroundStyle(FW.Palette.text2).lineLimit(1)
                Spacer(minLength: 8)
                Text(NotebookText.day(n.at)).font(.sans(13)).foregroundStyle(FW.Palette.text3).monospacedDigit()
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.caution.opacity(0.07), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(FW.Palette.caution.opacity(0.18)))
    }
}

// Every idea A–Z, with its one-line gist and recall ring.
private struct NotebookTermsPane: View {
    let entries: [NotebookEntry]
    let query: String
    let onOpen: (String) -> Void

    var body: some View {
        let sorted = entries.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        let letters = Dictionary(grouping: sorted) { String($0.title.prefix(1)).uppercased() }
        let keys = letters.keys.sorted()
        if sorted.isEmpty {
            NotebookHint(icon: "magnifyingglass", text: "Nothing matches “\(query)”.")
        } else {
            VStack(alignment: .leading, spacing: 20) {
                ForEach(Array(keys.enumerated()), id: \.element) { i, k in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(k).font(.rounded(15)).foregroundStyle(FW.Palette.text3).padding(.leading, 4)
                        GroupCard {
                            ForEach(letters[k] ?? []) { e in
                                Button { onOpen(e.key) } label: {
                                    GroupRow(icon: notebookGlyph(e.track), title: e.title, caption: gist(e), color: notebookTint(e.track)) {
                                        if e.offPlan {
                                            Image(systemName: "sparkles").font(.system(size: 13, weight: .semibold)).foregroundStyle(notebookTint(e.track))
                                        } else {
                                            NotebookRing(value: e.strength, color: notebookTint(e.track), size: 30, line: 3.5)
                                        }
                                    }
                                }
                                .buttonStyle(.pressable(0.98))
                            }
                        }
                    }
                    .rise(i, step: 0.04)
                }
            }
        }
    }

    private func gist(_ e: NotebookEntry) -> String? {
        let s = e.summary.isEmpty ? NotebookText.firstLine(e.explanation) : e.summary
        return s.isEmpty ? nil : s
    }
}

// A glyph and a line, for empty sections.
private struct NotebookHint: View {
    let icon: String
    let text: String
    var body: some View {
        HStack(spacing: 12) {
            IconBadge(systemName: icon, color: FW.Palette.text3, size: 36)
            Text(text).font(.sans(15)).foregroundStyle(FW.Palette.text2).fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct NotebookSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Skeleton(height: 38, radius: 12)
            Skeleton(height: 300, radius: FW.Radius.xl)
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 12) {
                    Skeleton(width: 160, height: 22)
                    HStack(spacing: 12) {
                        ForEach(0..<3, id: \.self) { _ in Skeleton(width: 168, height: 184, radius: FW.Radius.lg) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .clipped()
                }
            }
        }
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
        let e = model.entry(conceptKey)
        ScrollView {
            Group {
                if let e {
                    content(e)
                } else if model.data == nil, let error = model.error {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("The Notebook couldn’t load.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                        ErrorNote(message: error) { Task { await model.load(owner: store.owner) } }
                    }
                } else if model.data == nil {
                    VStack(alignment: .leading, spacing: 14) {
                        Skeleton(height: 220, radius: FW.Radius.xl)
                        SkeletonLines(count: 3)
                    }
                } else {
                    NotebookHint(icon: "book.closed", text: "That idea isn’t in your Notebook.")
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
        .toolbar {
            if let e {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { sharing = true } label: {
                        Label(e.shared != nil ? "Shared" : "Share", systemImage: e.shared != nil ? "link" : "square.and.arrow.up")
                    }
                }
            }
        }
        .refreshable { await model.load(owner: store.owner) }
        .task { if model.data == nil { await model.load(owner: store.owner) } }
        .sheet(isPresented: $sharing) {
            if let e = model.entry(conceptKey) { NotebookShareSheet(entry: e) }
        }
    }

    private func content(_ e: NotebookEntry) -> some View {
        VStack(alignment: .leading, spacing: 32) {
            head(e).rise(0)
            if let best = e.words.first {
                NotebookSection(title: "In your words", icon: "quote.bubble", color: FW.Palette.review) {
                    NotebookWords(words: best, track: e.track)
                    if e.words.count > 1 {
                        if more {
                            ForEach(Array(e.words.dropFirst().enumerated()), id: \.offset) { _, w in
                                NotebookWords(words: w, track: e.track)
                                    .transition(.opacity.combined(with: .move(edge: .top)))
                            }
                        } else {
                            let n = e.words.count - 1
                            Button {
                                withAnimation(Springs.smooth) { more = true }
                            } label: {
                                Label("\(n) more answer\(n == 1 ? "" : "s")", systemImage: "chevron.down")
                            }
                            .buttonStyle(.fw(.secondary, small: true))
                        }
                    }
                }
                .rise(1)
            }
            if e.explanation?.isEmpty == false || e.visual != nil {
                NotebookSection(title: "How it was explained", icon: "book.pages", color: notebookTint(e.track)) {
                    if let md = e.explanation, !md.isEmpty {
                        Markdown(text: md, face: store.prefs.reading.lessonFont, scale: store.prefs.readScale)
                    }
                    if let v = e.visual { VisualView(spec: v).padding(.top, 4) }
                }
                .rise(2)
            }
            if !e.misconceptions.isEmpty {
                NotebookSection(title: "Worth watching", icon: "exclamationmark.triangle", color: FW.Palette.caution) {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(e.misconceptions, id: \.self) { m in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Circle().fill(FW.Palette.caution).frame(width: 6, height: 6).alignmentGuide(.firstTextBaseline) { $0[.bottom] + 1 }
                                Text(m).fixedSize(horizontal: false, vertical: true)
                            }
                            .font(.sans(15))
                            .foregroundStyle(FW.Palette.text)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(FW.Palette.caution.opacity(0.08), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                }
                .rise(3)
            }
            if !e.asks.isEmpty {
                NotebookSection(title: "What you asked", icon: "questionmark.bubble", color: FW.Palette.judgment, count: e.asks.count) {
                    VStack(spacing: 8) {
                        ForEach(Array(e.asks.enumerated()), id: \.offset) { i, a in NotebookAsk(ask: a, initiallyOpen: i == 0) }
                    }
                }
                .rise(4)
            }
            NotebookNotes(entry: e).rise(5)
            if !e.sources.isEmpty {
                NotebookSection(title: "Where it came from", icon: "clock.arrow.circlepath", color: FW.Palette.text2) {
                    GroupCard {
                        ForEach(Array(e.sources.enumerated()), id: \.offset) { _, s in
                            Button { Router.shared.cover = .session(s.run) } label: {
                                GroupRow(
                                    icon: Glyph.kind(["review", "explore", "rehearsal"].contains(s.kind) ? s.kind : "session"),
                                    title: s.title,
                                    caption: "\(NotebookText.kind(s.kind)) · \(NotebookText.day(s.at))",
                                    color: notebookTint(e.track)
                                )
                            }
                            .buttonStyle(.pressable(0.98))
                        }
                    }
                }
                .rise(6)
            }
        }
    }

    // Subject, level and recall ring up top; then the title, the gist, when
    // it was met and when it's due, and one big button.
    private func head(_ e: NotebookEntry) -> some View {
        let tint = notebookTint(e.track)
        return VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 12) {
                IconBadge(systemName: notebookGlyph(e.track), color: tint, size: 48)
                VStack(alignment: .leading, spacing: 6) {
                    Text(e.trackTitle).font(.sans(14, .semibold)).foregroundStyle(tint)
                    NotebookLevelPill(level: e.offPlan ? nil : e.level)
                }
                Spacer(minLength: 8)
                if !e.offPlan {
                    NotebookRing(value: e.strength, color: tint, size: 68, line: 7)
                        .accessibilityLabel("Recall strength")
                        .accessibilityValue("\(Int((e.strength * 100).rounded())) percent")
                }
            }
            Text(e.title)
                .font(.display(34))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if !e.summary.isEmpty {
                Text(e.summary)
                    .font(.sans(17))
                    .foregroundStyle(FW.Palette.text2)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            meta(e)
            if !e.offPlan {
                Button { recall(e) } label: {
                    HStack(spacing: 8) {
                        if recalling { ProgressView().tint(FW.Palette.onAccent) } else {
                            Image(systemName: "arrow.triangle.2.circlepath").symbolEffect(.rotate, value: recalling)
                        }
                        Text("Quick recall")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(recalling)
                .padding(.top, 2)
            }
        }
        .padding(18)
        .background {
            RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous)
                .fill(LinearGradient(colors: [tint.opacity(0.14), tint.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.xl, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(tint.opacity(0.18), lineWidth: 1))
    }

    // web: "38% recall strength · first met Sep 20 · review due now".
    private func meta(_ e: NotebookEntry) -> some View {
        let due: (text: String, now: Bool)? = {
            guard let d = e.due_at else { return nil }
            if let date = Stamp.parse(d) ?? Dates.parse(d), date <= .now { return ("Review due now", true) }
            return ("Review \(NotebookText.day(d))", false)
        }()
        return FlowLayout(spacing: 8) {
            Pill(text: "Met \(NotebookText.day(e.first_seen))", icon: "calendar", color: FW.Palette.text3)
            if let due {
                Pill(text: due.text, icon: due.now ? "clock.badge.exclamationmark" : "clock", color: due.now ? FW.Palette.review : FW.Palette.text3)
            }
            if e.shared != nil {
                Pill(text: "Shared", icon: "link", color: FW.Palette.positive)
            }
        }
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

// A section with a tinted glyph and a bold title (web: .nb-section).
private struct NotebookSection<Content: View>: View {
    let title: String
    let icon: String
    var color: Color = FW.Palette.text2
    var count: Int? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                IconBadge(systemName: icon, color: color, size: 30)
                Text(title).font(.sans(20, .bold)).foregroundStyle(FW.Palette.text)
                Spacer(minLength: 8)
                if let count { Text("\(count)").font(.sans(15, .medium)).foregroundStyle(FW.Palette.text3).monospacedDigit() }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// One answer in the learner's words, with how it landed.
private struct NotebookWords: View {
    let words: NotebookEntry.Words
    let track: String
    @Environment(Store.self) private var store

    var body: some View {
        let scale = store.prefs.readScale
        VStack(alignment: .leading, spacing: 10) {
            Text(words.text)
                .font(.fw(store.prefs.reading.lessonFont, 19 * scale))
                .foregroundStyle(FW.Palette.text)
                .lineSpacing(5 * scale)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            HStack(spacing: 6) {
                if let v = words.verdict {
                    Image(systemName: v == "solid" ? "checkmark.circle.fill" : v == "partial" ? "circle.lefthalf.filled" : "circle.dashed")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(verdictColor(v))
                }
                Text(caption)
                    .font(.sans(13, .medium))
                    .foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.leading, 16)
        .overlay(alignment: .leading) { Capsule().fill(notebookTint(track)).frame(width: 3) }
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
                withAnimation(Springs.snappy) { open.toggle() }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let q = ask.quote, !q.isEmpty {
                            Text("“\(NotebookText.clip(q, 90, cut: 89))”")
                                .font(.sans(13))
                                .foregroundStyle(FW.Palette.text3)
                        }
                        Text(ask.question)
                            .font(.sans(15, .semibold))
                            .foregroundStyle(FW.Palette.text)
                    }
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(FW.Palette.text3)
                        .rotationEffect(.degrees(open ? 180 : 0))
                        .frame(width: 24, height: 24)
                        .background(FW.Palette.surface2, in: .circle)
                }
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .sensoryFeedback(.selection, trigger: open)
            .accessibilityAddTraits(open ? .isSelected : [])
            if open {
                Rule()
                Markdown(text: ask.answer, face: store.prefs.reading.lessonFont, scale: store.prefs.readScale, size: 17)
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 16)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(FW.Palette.line))
        .clipShape(.rect(cornerRadius: FW.Radius.base, style: .continuous))
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
        NotebookSection(title: "Your notes", icon: "note.text", color: FW.Palette.caution, count: entry.notes.isEmpty ? nil : entry.notes.count) {
            if entry.notes.isEmpty {
                Text("Add a note to any step in a session, or select a passage and choose Note.")
                    .font(.sans(14))
                    .foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 10) {
                    ForEach(entry.notes) { n in
                        note(n).transition(.opacity.combined(with: .scale(0.96)))
                    }
                }
                .animation(Springs.smooth, value: entry.notes)
            }
        }
    }

    private func note(_ n: NotebookEntry.Note) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let q = n.quote, !q.isEmpty {
                Text("“\(q)”")
                    .font(.serif(15, italic: true))
                    .foregroundStyle(FW.Palette.text2)
                    .padding(.leading, 10)
                    .overlay(alignment: .leading) { Rectangle().fill(FW.Palette.caution.opacity(0.5)).frame(width: 2) }
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
                    .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.sm))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.sm).strokeBorder(FW.Palette.line2))
                    .accessibilityLabel("Edit note")
                HStack(spacing: 8) {
                    Button("Save") { save(n) }
                        .buttonStyle(.fw(.primary, small: true))
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                    Button("Cancel") { withAnimation(Springs.snappy) { editing = nil } }
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
                        withAnimation(Springs.snappy) { editing = n.id }
                        Task { focused = true }
                    } label: {
                        Image(systemName: "pencil").frame(width: 36, height: 36).contentShape(.rect)
                    }
                    .accessibilityLabel("Edit note")
                    Button { remove(n) } label: {
                        Image(systemName: "trash").frame(width: 36, height: 36).contentShape(.rect)
                    }
                    .accessibilityLabel("Delete note")
                    .disabled(busy)
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(FW.Palette.text3)
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 14)
        .padding(.bottom, editing == n.id ? 14 : 6)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Caution-tinted paper: the tint sits over the surface.
        .background(FW.Palette.caution.opacity(0.07), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(FW.Palette.caution.opacity(0.18)))
    }

    private func save(_ n: NotebookEntry.Note) {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true
        Task {
            do {
                let body: [String: JSON] = ["id": .string(n.id), "runId": .string(n.run), "beatId": .string(n.beat), "text": .string(text)]
                let _: JSON = try await API.post("/api/notes", body)
                withAnimation(Springs.snappy) { editing = nil }
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

// MARK: - Shared with Mastery

// Subject hue and glyph; side trips (off-plan) read as coral sparkles.
func notebookTint(_ track: String?) -> Color {
    track == "explore" ? FW.Palette.coral : trackColor(track)
}

func notebookGlyph(_ track: String?) -> String {
    track == "explore" ? "sparkles" : Glyph.track(track)
}

// A hue per learner-model level, from grey (new) to green (mastered).
func notebookLevelTint(_ level: String?) -> Color {
    switch level {
    case "learning": FW.Palette.caution
    case "practiced", "practised": FW.Palette.review
    case "solid", "mastered": FW.Palette.positive
    default: FW.Palette.text3
    }
}

// Recall strength as a ring with the percentage inside; fills on appear.
struct NotebookRing: View {
    let value: Double
    var color: Color = FW.Palette.text
    var size: CGFloat = 36
    var line: CGFloat = 4
    var label = true
    @State private var shown: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle().stroke(color.opacity(0.16), lineWidth: line)
            Circle()
                .trim(from: 0, to: min(max(shown, 0), 1))
                .stroke(color, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if label {
                Text("\(Int((value * 100).rounded()))")
                    .font(.rounded(max(10, size * 0.3), .bold))
                    .foregroundStyle(FW.Palette.text)
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .padding(line)
            }
        }
        .frame(width: size, height: size)
        .onAppear {
            withAnimation(reduceMotion ? nil : Springs.gentle.delay(0.15)) { shown = value }
        }
        .onChange(of: value) { _, v in withAnimation(Springs.smooth) { shown = v } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Int((value * 100).rounded()))% strength")
    }
}

// The level as a small tinted capsule ("Learning", "Solid"); side trips
// when there's no level.
struct NotebookLevelPill: View {
    let level: String?
    var body: some View {
        let color = level.map(notebookLevelTint) ?? FW.Palette.coral
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(level.map(levelLabel) ?? "Side trip")
                .font(.sans(12, .semibold))
                .foregroundStyle(color)
                .lineLimit(1)
        }
        .padding(.horizontal, 9)
        .frame(height: 24)
        .background(color.opacity(0.13), in: .capsule)
        .fixedSize()
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
