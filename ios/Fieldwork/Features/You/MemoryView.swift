import SwiftUI

// Memory (src/components/you/you.tsx MemorySheet): everything Fieldwork has
// learned about the learner, as cards grouped by kind. What it isn't sure of
// yet comes first; swipe a memory to pin, edit or forget it. Pushed from You
// rather than shown as a sheet.

// MARK: - Model (docs/API.md §8.9)

struct MemItem: Decodable, Sendable, Identifiable, Hashable {
    var id: String
    var kind: String // goal, interest, preference, background, knowledge, episode, style
    var content: String
    var status: String // candidate, active, archived
    var pinned: Bool
    var source: String // inferred, user, import
    var source_run: String?
    var created_at: String
    var evidence: Int

    private enum K: String, CodingKey { case id, kind, content, status, pinned, source, source_run, created_at, evidence }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        id = try c.decode(String.self, forKey: .id)
        kind = c.lenient(String.self, .kind) ?? "preference"
        content = c.lenient(String.self, .content) ?? ""
        status = c.lenient(String.self, .status) ?? "active"
        pinned = c.lenient(Bool.self, .pinned) ?? false
        source = c.lenient(String.self, .source) ?? "inferred"
        source_run = c.lenient(String.self, .source_run)
        created_at = c.lenient(String.self, .created_at) ?? ""
        evidence = Int(c.lenient(Double.self, .evidence) ?? 1)
    }
}

struct MemStyle: Decodable, Sendable, Hashable {
    var depth: Double
    var challenge: Double
    var visual: Double
    var questions: Double
    var examples: Double
    var observations: Int

    private enum K: String, CodingKey { case depth, challenge, visual, questions, examples, observations }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        depth = c.lenient(Double.self, .depth) ?? 0.5
        challenge = c.lenient(Double.self, .challenge) ?? 0.5
        visual = c.lenient(Double.self, .visual) ?? 0.5
        questions = c.lenient(Double.self, .questions) ?? 0.5
        examples = c.lenient(Double.self, .examples) ?? 0.5
        observations = Int(c.lenient(Double.self, .observations) ?? 0)
    }
}

struct MemOrigin: Decodable, Sendable, Hashable {
    var title: String
    var kind: String
    private enum K: String, CodingKey { case title, kind }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        title = c.lenient(String.self, .title) ?? "a session"
        kind = c.lenient(String.self, .kind) ?? "session"
    }
}

struct MemListResponse: Decodable, Sendable {
    var memories: [MemItem]
    var style: MemStyle?
    var origins: [String: MemOrigin]

    private enum K: String, CodingKey { case memories, style, origins }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        memories = (c.lenient([MemMaybe].self, .memories) ?? []).compactMap(\.value)
        style = c.lenient(MemStyle.self, .style)
        origins = c.lenient([String: MemOrigin].self, .origins) ?? [:]
    }
}

private struct MemMaybe: Decodable, Sendable {
    let value: MemItem?
    init(from decoder: Decoder) throws { value = try? MemItem(from: decoder) }
}

private struct MemWrapped: Decodable, Sendable { var memory: MemItem }

// When the learner last looked at their memory. Anything inferred after that
// is new to them. First visits count only the last day, so a long history
// doesn't all arrive as "new".
@MainActor
func memorySeenAt(_ store: Store) -> String {
    if let at = store.record("settings:memory")?["data"]?["seen_at"]?.string { return at }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: Date(timeIntervalSinceNow: -86400))
}

func memoryIsNew(_ m: MemItem, since seen: String) -> Bool {
    guard m.source == "inferred" else { return false }
    if let a = Stamp.parse(m.created_at), let b = Stamp.parse(seen) { return a > b }
    return m.created_at > seen
}

private struct MemGroup {
    let title: String
    let kinds: [String]
    let icon: String
    let color: Color
}

private let memGroups: [MemGroup] = [
    .init(title: "Goals", kinds: ["goal"], icon: "target", color: FW.Palette.finance),
    .init(title: "How you like to learn", kinds: ["preference", "style"], icon: "slider.horizontal.3", color: FW.Palette.judgment),
    .init(title: "Background and interests", kinds: ["background", "interest", "knowledge"], icon: "person.text.rectangle.fill", color: FW.Palette.communication),
    .init(title: "Moments worth remembering", kinds: ["episode"], icon: "star.bubble.fill", color: FW.Palette.coral),
]

// MARK: - Screen

struct MemoryView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var loader = Loader<MemListResponse>("/api/memory")
    @State private var memories: [MemItem]?
    @State private var origins: [String: MemOrigin] = [:]
    @State private var since = ""
    @State private var query = ""
    @State private var adding = ""
    @State private var editing: MemItem?
    @State private var confirmForget = false
    @State private var started = false
    @FocusState private var addFocused: Bool

    var body: some View {
        Group {
            if let memories {
                list(memories)
            } else {
                ScrollView {
                    Group {
                        if let error = loader.error {
                            ErrorNote(message: error) { Task { await load() } }
                        } else {
                            VStack(spacing: 12) {
                                ForEach(0..<3, id: \.self) { _ in
                                    SkeletonLines(count: 3).padding(16).background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                                }
                            }
                        }
                    }
                    .padding(.horizontal, FW.Size.gutter)
                    .padding(.top, 8)
                }
            }
        }
        .screenBackground()
        .navigationTitle("Memory")
        .navigationBarTitleDisplayMode(.large)
        .task { await begin() }
        .sheet(item: $editing) { m in
            MemEditSheet(memory: m) { content in
                Task {
                    if await save(m, content: content) != nil { editing = nil }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .alert("Forget everything?", isPresented: $confirmForget) {
            Button("Forget everything", role: .destructive) { Task { await forgetAll() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Memories and your inferred teaching style are deleted. Progress and sessions stay.")
        }
    }

    // MARK: Content

    private func list(_ all: [MemItem]) -> some View {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let match = { (m: MemItem) in q.isEmpty || m.content.lowercased().contains(q) }
        let unsure = all.filter { $0.status == "candidate" && match($0) }
        let sure = all.filter { $0.status != "candidate" && match($0) }
        let groups = memGroups.compactMap { g -> (MemGroup, [MemItem])? in
            let items = sure.filter { g.kinds.contains($0.kind) }
            return items.isEmpty ? nil : (g, items)
        }

        return List {
            Section {
                addForm
                    .listRowBackground(FW.Palette.raised)
            } header: {
                summary(all)
            } footer: {
                Text(all.isEmpty ? "Used quietly to teach you better." : "Used quietly to teach you better. Swipe a memory to edit or forget it.")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }

            if all.isEmpty {
                Section {
                    YouEmpty(icon: "brain.head.profile", color: FW.Palette.review, title: "Nothing yet", line: "After a few sessions, this fills with what helps you learn.")
                        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
            }

            if !unsure.isEmpty {
                Section {
                    ForEach(unsure) { m in row(m, tentative: true) }
                } header: {
                    MemHeader(icon: "questionmark.circle.fill", color: FW.Palette.caution, title: "Not sure yet", count: unsure.count)
                } footer: {
                    Text("Seen once. Keep what’s true; dismiss what isn’t.").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                }
            }

            ForEach(groups, id: \.0.title) { g, items in
                Section {
                    ForEach(items) { m in row(m, tentative: false) }
                } header: {
                    MemHeader(icon: g.icon, color: g.color, title: g.title, count: items.count)
                }
            }

            if !q.isEmpty, unsure.isEmpty, sure.isEmpty {
                Section {
                    Text("Nothing matches “\(query)”.").font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        .listRowBackground(FW.Palette.raised)
                }
            }

            if !all.isEmpty {
                Section {
                    Button(role: .destructive) { confirmForget = true } label: {
                        Label("Forget everything", systemImage: "trash")
                            .font(.sans(16, .medium))
                            .foregroundStyle(FW.Palette.negative)
                    }
                    .listRowBackground(FW.Palette.raised)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .listSectionSpacing(22)
        .listRowSeparatorTint(FW.Palette.line)
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await load() }
        .modifier(MemSearch(enabled: all.count > 8, query: $query, count: all.count))
    }

    // Counts at a glance.
    private func summary(_ all: [MemItem]) -> some View {
        let fresh = all.filter { memoryIsNew($0, since: since) }.count
        let pinned = all.filter(\.pinned).count
        return HStack(spacing: 8) {
            Pill(text: "\(all.count) saved", icon: "brain.head.profile", color: FW.Palette.text2)
            if fresh > 0 { Pill(text: "\(fresh) new", icon: "sparkles", color: FW.Palette.review) }
            if pinned > 0 { Pill(text: "\(pinned) pinned", icon: "pin.fill", color: FW.Palette.caution) }
            Spacer(minLength: 0)
        }
        .textCase(nil)
        .padding(.leading, -4)
        .padding(.bottom, 8)
        .rise(0)
    }

    private func row(_ m: MemItem, tentative: Bool) -> some View {
        MemRow(
            memory: m,
            origin: m.source_run.flatMap { origins[$0] },
            fresh: memoryIsNew(m, since: since),
            tentative: tentative,
            onKeep: { Task { await review(m, "keep", toast: "Kept.") } },
            onDismiss: { Task { await review(m, "dismiss", toast: "Dismissed.") } },
            onOrigin: { openOrigin(m) }
        )
        .listRowBackground(FW.Palette.raised)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            if tentative {
                Button { Task { await review(m, "dismiss", toast: "Dismissed.") } } label: { Label("Dismiss", systemImage: "xmark") }
                    .tint(FW.Palette.text3)
            } else {
                Button(role: .destructive) { Task { await remove(m) } } label: { Label("Forget", systemImage: "trash") }
                Button { editing = m } label: { Label("Edit", systemImage: "pencil") }
                    .tint(FW.Palette.review)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if tentative {
                Button { Task { await review(m, "keep", toast: "Kept.") } } label: { Label("Keep", systemImage: "checkmark") }
                    .tint(FW.Palette.positive)
            } else {
                Button { Task { await save(m, pinned: !m.pinned) } } label: {
                    Label(m.pinned ? "Unpin" : "Pin", systemImage: m.pinned ? "pin.slash.fill" : "pin.fill")
                }
                .tint(FW.Palette.caution)
            }
        }
        .contextMenu {
            if tentative {
                Button { Task { await review(m, "keep", toast: "Kept.") } } label: { Label("Keep", systemImage: "checkmark") }
                Button { Task { await review(m, "dismiss", toast: "Dismissed.") } } label: { Label("Dismiss", systemImage: "xmark") }
            } else {
                Button { Task { await save(m, pinned: !m.pinned) } } label: {
                    Label(m.pinned ? "Unpin" : "Pin", systemImage: m.pinned ? "pin.slash" : "pin")
                }
                Button { editing = m } label: { Label("Edit", systemImage: "pencil") }
            }
            if let run = m.source_run, let origin = origins[run] {
                Button { openOrigin(m) } label: { Label("Open \(origin.title)", systemImage: "arrow.up.forward.app") }
            }
            if !tentative {
                Button(role: .destructive) { Task { await remove(m) } } label: { Label("Forget", systemImage: "trash") }
            }
        }
    }

    private var addForm: some View {
        let ready = adding.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3
        return HStack(alignment: .center, spacing: 10) {
            Image(systemName: "plus.bubble.fill")
                .font(.system(size: 18))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(FW.Palette.text3)
            TextField("Tell it something: “Use sports examples”", text: $adding, axis: .vertical)
                .font(.sans(16))
                .lineLimit(1...4)
                .focused($addFocused)
                .submitLabel(.done)
                .onSubmit { add() }
                .accessibilityLabel("Add something Fieldwork should know")
            Button { add() } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(ready ? FW.Palette.onAccent : FW.Palette.text3, ready ? FW.Palette.accent : FW.Palette.surface2)
                    .scaleEffect(ready ? 1 : 0.9)
                    .animation(Springs.bouncy, value: ready)
            }
            .buttonStyle(.plain)
            .disabled(!ready)
            .accessibilityLabel("Add")
        }
        .padding(.vertical, 4)
    }

    // MARK: Behaviour

    private func begin() async {
        guard !started else { return }
        started = true
        // "New" is judged against the moment this opened; then they've seen them.
        since = memorySeenAt(store)
        if let cached = loader.value { adopt(cached) }
        Task { await store.saveRecord(kind: "settings", id: "settings:memory", data: ["seen_at": .string(Stamp.now())]) }
        await load()
    }

    private func load() async {
        await loader.load()
        if let v = loader.value { adopt(v) }
    }

    private func adopt(_ r: MemListResponse) {
        withAnimation(memories == nil ? nil : Springs.snappy) {
            memories = r.memories
            origins = r.origins
        }
    }

    private func put(_ m: MemItem) {
        var list = (memories ?? []).filter { $0.id != m.id }
        if m.status != "archived" { list.insert(m, at: 0) }
        withAnimation(Springs.snappy) { memories = list }
    }

    @discardableResult
    private func save(_ m: MemItem, content: String? = nil, pinned: Bool? = nil) async -> MemItem? {
        do {
            let body: [String: JSON] = [
                "id": .string(m.id), "kind": .string(m.kind),
                "content": .string(content ?? m.content), "pinned": .bool(pinned ?? m.pinned),
            ]
            let r: MemWrapped = try await API.post("/api/memory", body)
            put(r.memory)
            return r.memory
        } catch {
            Toasts.shared.show(error.localizedDescription)
            return nil
        }
    }

    private func add() {
        let text = adding.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= 3 else { return }
        Task {
            do {
                let r: MemWrapped = try await API.post("/api/memory", ["kind": JSON.string("preference"), "content": .string(text), "pinned": .bool(true)])
                put(r.memory)
                adding = ""
                addFocused = false
                Feedback.shared.play(.tap)
            } catch {
                Toasts.shared.show(error.localizedDescription)
            }
        }
    }

    // Keeping a tentative memory makes it count; dismissing retires it without
    // deleting, so the same guess isn't made again.
    private func review(_ m: MemItem, _ verdict: String, toast: String) async {
        do {
            let r: MemWrapped = try await API.post("/api/memory", ["id": JSON.string(m.id), "review": .string(verdict)])
            put(r.memory)
            Toasts.shared.show(toast)
        } catch {
            Toasts.shared.show(error.localizedDescription)
        }
    }

    private func remove(_ m: MemItem) async {
        let before = memories
        withAnimation(Springs.snappy) { memories = (memories ?? []).filter { $0.id != m.id } }
        do {
            try await API.delete("/api/memory", ["id": m.id])
            Toasts.shared.show("Forgotten.", action: "Undo") {
                Task {
                    do {
                        let r: MemWrapped = try await API.post("/api/memory", ["kind": JSON.string(m.kind), "content": .string(m.content), "pinned": .bool(m.pinned)])
                        put(r.memory)
                    } catch {
                        Toasts.shared.show(error.localizedDescription)
                    }
                }
            }
        } catch {
            memories = before
            Toasts.shared.show(error.localizedDescription)
        }
    }

    private func forgetAll() async {
        do {
            try await API.delete("/api/memory", ["all": true])
            withAnimation(Springs.smooth) { memories = [] }
            LoaderCache.values["/api/memory"] = nil
            Toasts.shared.show("Fieldwork will start learning about you again from scratch.")
        } catch {
            Toasts.shared.show(error.localizedDescription)
        }
    }

    private func openOrigin(_ m: MemItem) {
        guard let run = m.source_run, let origin = origins[run] else { return }
        if origin.kind == "practice" {
            router.push(.practiceFeedback(run))
        } else {
            router.cover = .session(run)
        }
    }
}

// Search appears once there's enough to search through.
private struct MemSearch: ViewModifier {
    let enabled: Bool
    @Binding var query: String
    let count: Int
    func body(content: Content) -> some View {
        if enabled {
            content.searchable(text: $query, prompt: "Search \(count) memories")
        } else {
            content
        }
    }
}

// A kind's header: its glyph, its name and how many.
private struct MemHeader: View {
    let icon: String
    let color: Color
    let title: String
    let count: Int
    var body: some View {
        HStack(spacing: 10) {
            IconBadge(systemName: icon, color: color, size: 28)
            Text(title).font(.sans(16, .semibold)).foregroundStyle(FW.Palette.text)
            Spacer(minLength: 4)
            Text("\(count)").font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                .contentTransition(.numericText())
        }
        .textCase(nil)
        .padding(.leading, -4)
        .padding(.bottom, 4)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Row

private struct MemRow: View {
    let memory: MemItem
    let origin: MemOrigin?
    let fresh: Bool
    let tentative: Bool
    let onKeep: () -> Void
    let onDismiss: () -> Void
    let onOrigin: () -> Void

    private var meta: AttributedString {
        let m = memory
        var out = AttributedString()
        if m.source == "user" {
            out += AttributedString("You added this")
        } else if m.source == "import" {
            out += AttributedString("From your plan")
        } else if let origin, m.source_run != nil {
            out += AttributedString("From ")
            var link = AttributedString(origin.title)
            link.link = URL(string: "fieldwork-memory://origin")
            link.foregroundColor = FW.Palette.text2
            link.underlineStyle = .single
            out += link
        } else {
            out += AttributedString("Noticed in a session")
        }
        if !tentative, m.source != "user", m.evidence > 1 { out += AttributedString(" · seen \(m.evidence)×") }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(memory.content)
                .font(.sans(15))
                .lineSpacing(2)
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                if fresh {
                    Text("New")
                        .font(.sans(11, .bold))
                        .foregroundStyle(FW.Palette.review)
                        .padding(.horizontal, 7)
                        .frame(height: 18)
                        .background(FW.Palette.review.opacity(0.16), in: .capsule)
                        .accessibilityLabel("New")
                }
                if memory.pinned {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FW.Palette.caution)
                        .accessibilityLabel("Pinned")
                }
                Text(meta)
                    .font(.sans(12.5))
                    .foregroundStyle(FW.Palette.text3)
                    .tint(FW.Palette.text2)
                    .lineLimit(1)
                    .environment(\.openURL, OpenURLAction { _ in
                        onOrigin()
                        return .handled
                    })
            }
            if tentative {
                HStack(spacing: 8) {
                    Button(action: onKeep) { Label("Keep", systemImage: "checkmark") }
                        .buttonStyle(.fw(.primary, small: true))
                    Button(action: onDismiss) { Label("Dismiss", systemImage: "xmark") }
                        .buttonStyle(.fw(.secondary, small: true))
                }
                .labelStyle(.titleAndIcon)
                .padding(.top, 2)
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Edit

private struct MemEditSheet: View {
    let memory: MemItem
    let onSave: (String) -> Void
    @State private var text: String
    @FocusState private var focused: Bool

    init(memory: MemItem, onSave: @escaping (String) -> Void) {
        self.memory = memory
        self.onSave = onSave
        _text = State(initialValue: memory.content)
    }

    var body: some View {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        SheetScaffold(title: "Edit memory") {
            TextField("Memory", text: $text, axis: .vertical)
                .font(.sans(16))
                .lineLimit(3...8)
                .focused($focused)
                .padding(14)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
                .accessibilityLabel("Memory")
            Button("Save") { onSave(trimmed) }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(trimmed.count < 3)
        }
        .onAppear { focused = true }
    }
}
