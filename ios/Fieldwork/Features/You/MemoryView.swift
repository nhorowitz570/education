import SwiftUI

// Memory (src/components/you/you.tsx MemorySheet): everything Fieldwork has
// learned about the learner. What it isn't sure of yet comes first, then the
// rest by kind, folded. Pushed from You rather than shown as a sheet.

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

private let memGroups: [(title: String, kinds: [String])] = [
    ("Goals", ["goal"]),
    ("How you like to learn", ["preference", "style"]),
    ("Background and interests", ["background", "interest", "knowledge"]),
    ("Moments worth remembering", ["episode"]),
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
    @State private var open: Set<String> = []
    @State private var started = false
    @FocusState private var addFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Memory").font(.display(32)).foregroundStyle(FW.Palette.text)
                    Text("Used quietly to teach you better. Edit or remove anything.")
                        .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let memories {
                    list(memories)
                } else if let error = loader.error {
                    ErrorNote(message: error) { Task { await load() } }
                } else {
                    SkeletonLines(count: 5).padding(.top, 8)
                }
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 8)
            .padding(.bottom, 48)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task { await begin() }
        .refreshable { await load() }
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

    @ViewBuilder
    private func list(_ all: [MemItem]) -> some View {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let match = { (m: MemItem) in q.isEmpty || m.content.lowercased().contains(q) }
        let unsure = all.filter { $0.status == "candidate" && match($0) }
        let sure = all.filter { $0.status != "candidate" && match($0) }
        let newCount = all.filter { memoryIsNew($0, since: since) }.count

        if all.count > 8 {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").font(.system(size: 15)).foregroundStyle(FW.Palette.text3)
                TextField("Search \(all.count) memories", text: $query)
                    .font(.sans(16))
                    .foregroundStyle(FW.Palette.text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .accessibilityLabel("Search memories")
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(FW.Palette.text3)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 46)
            .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line, lineWidth: 1))
        }

        if all.isEmpty {
            Text("Nothing yet. After a few sessions this fills with what helps you learn.")
                .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
        }

        if !unsure.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Kicker("Not sure yet · \(unsure.count)")
                Text("Seen once. Keep what’s true; dismiss what isn’t.")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                rows(unsure, tentative: true)
            }
        }

        let groups = memGroups.compactMap { g -> (String, [MemItem])? in
            let items = sure.filter { g.kinds.contains($0.kind) }
            return items.isEmpty ? nil : (g.title, items)
        }
        if !groups.isEmpty {
            VStack(spacing: 0) {
                Rule()
                ForEach(groups, id: \.0) { title, items in
                    let newHere = items.filter { memoryIsNew($0, since: since) }.count
                    PlanDisclosure(
                        title: title,
                        teaser: "\(items.count) \(items.count == 1 ? "memory" : "memories")\(newHere > 0 ? " · \(newHere) new" : "")",
                        titleSize: 15,
                        open: Binding(
                            get: { !q.isEmpty || open.contains(title) },
                            set: { v in if v { open.insert(title) } else { open.remove(title) } }
                        )
                    ) {
                        rows(items, tentative: false)
                    }
                    Rule()
                }
            }
        }
        if !q.isEmpty, unsure.isEmpty, sure.isEmpty {
            Text("Nothing matches “\(query)”.").font(.sans(15)).foregroundStyle(FW.Palette.text2)
        }

        addForm
        if newCount > 0 {
            Text("\(newCount) learned since you last looked, marked with a dot.")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
        }
        if !all.isEmpty {
            Button("Forget everything") { confirmForget = true }
                .font(.sans(15, .medium))
                .foregroundStyle(FW.Palette.negative)
                .buttonStyle(.plain)
                .frame(minHeight: 44)
        }
    }

    private func rows(_ items: [MemItem], tentative: Bool) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, m in
                if i > 0 { Rule() }
                MemRow(
                    memory: m,
                    origin: m.source_run.flatMap { origins[$0] },
                    fresh: memoryIsNew(m, since: since),
                    tentative: tentative,
                    onPin: { Task { await save(m, pinned: !m.pinned) } },
                    onEdit: { editing = m },
                    onForget: { Task { await remove(m) } },
                    onKeep: { Task { await review(m, "keep", toast: "Kept.") } },
                    onDismiss: { Task { await review(m, "dismiss", toast: "Dismissed.") } },
                    onOrigin: { openOrigin(m) }
                )
            }
        }
    }

    private var addForm: some View {
        let ready = adding.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3
        return HStack(spacing: 10) {
            TextField("Tell it something: “Use sports examples”…", text: $adding, axis: .vertical)
                .font(.sans(16))
                .lineLimit(1...4)
                .focused($addFocused)
                .submitLabel(.done)
                .onSubmit { add() }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(minHeight: 46)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line, lineWidth: 1))
                .accessibilityLabel("Add something Fieldwork should know")
            Button("Add") { add() }
                .buttonStyle(.fw(.secondary))
                .disabled(!ready)
        }
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
        let first = memories == nil
        memories = r.memories
        origins = r.origins
        if first, r.memories.count <= 6 { open = Set(memGroups.map(\.title)) }
    }

    private func put(_ m: MemItem) {
        var list = (memories ?? []).filter { $0.id != m.id }
        if m.status != "archived" { list.insert(m, at: 0) }
        withAnimation(.snappy(duration: 0.3)) { memories = list }
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
        withAnimation(.snappy(duration: 0.3)) { memories = (memories ?? []).filter { $0.id != m.id } }
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
            withAnimation { memories = [] }
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

// MARK: - Row

private struct MemRow: View {
    let memory: MemItem
    let origin: MemOrigin?
    let fresh: Bool
    let tentative: Bool
    let onPin: () -> Void
    let onEdit: () -> Void
    let onForget: () -> Void
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
            out += AttributedString("Learned in ")
            var link = AttributedString(origin.title)
            link.link = URL(string: "fieldwork-memory://origin")
            link.foregroundColor = FW.Palette.text2
            link.underlineStyle = .single
            out += link
        } else {
            out += AttributedString("Noticed in a session")
        }
        if !tentative, m.source != "user", m.evidence > 1 { out += AttributedString(" · seen \(m.evidence)×") }
        if m.pinned { out += AttributedString(" · pinned") }
        return out
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if fresh {
                        Circle().fill(FW.Palette.review).frame(width: 7, height: 7)
                            .alignmentGuide(.firstTextBaseline) { d in d[.bottom] }
                            .accessibilityLabel("New")
                    }
                    Text(memory.content)
                        .font(.sans(15))
                        .lineSpacing(3)
                        .foregroundStyle(FW.Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(meta)
                    .font(.sans(12.5))
                    .foregroundStyle(FW.Palette.text3)
                    .tint(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .environment(\.openURL, OpenURLAction { _ in
                        onOrigin()
                        return .handled
                    })
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if tentative {
                HStack(spacing: 2) {
                    Button(action: onKeep) { Label("Keep", systemImage: "checkmark") }
                        .buttonStyle(.fw(.secondary, small: true))
                    icon("xmark", label: "Dismiss", action: onDismiss)
                }
            } else {
                HStack(spacing: 0) {
                    icon(memory.pinned ? "pin.fill" : "pin", label: memory.pinned ? "Unpin" : "Pin", action: onPin)
                        .accessibilityAddTraits(memory.pinned ? .isSelected : [])
                    icon("pencil", label: "Edit", action: onEdit)
                    icon("trash", label: "Forget", action: onForget)
                }
            }
        }
        .padding(.vertical, 12)
    }

    private func icon(_ name: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: 15))
                .foregroundStyle(FW.Palette.text2)
                .frame(width: 36, height: 36)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
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
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line, lineWidth: 1))
                .accessibilityLabel("Memory")
            Button("Save") { onSave(trimmed) }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(trimmed.count < 3)
        }
        .onAppear { focused = true }
    }
}
