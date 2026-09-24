import Observation
import SwiftUI

// The tutor outside lessons (src/components/tutor/chat.tsx). One thread per
// account, shared with the web through /api/tutor.
struct TutorMessage: Codable, Identifiable, Hashable, Sendable {
    struct Action: Codable, Hashable, Sendable {
        var type: String // set_writing, open, remember, start_today
        var writing: String?
        var href: String?
        var label: String?
        var content: String?
    }
    var id: String
    var role: String // user, tutor
    var text: String?
    var blocks: [Block]?
    var actions: [Action]?
    var suggestions: [String]?
    var at: String
    var streaming: Bool? = nil
    var error: String? = nil
}

@MainActor @Observable
final class TutorThread {
    static let shared = TutorThread()
    private(set) var messages: [TutorMessage] = []
    private(set) var pending = false
    private var owner: String?

    func open(owner: String) async {
        if self.owner != owner {
            self.owner = owner
            messages = Disk.read([TutorMessage].self, "tutor", owner: owner) ?? []
        }
        await pull()
    }

    // Catch up with the account's thread (web and phone share it).
    func pull() async {
        struct R: Decodable { let messages: [TutorMessage] }
        guard !pending, let r: R = try? await API.get("/api/tutor"), !pending else { return }
        messages = r.messages
        save()
    }

    func send(_ text: String, page: String, resend: String? = nil, store: Store) async {
        let said = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !said.isEmpty, !pending else { return }
        pending = true
        defer { pending = false; save() }
        let mine = TutorMessage(id: resend ?? UUID().uuidString.lowercased(), role: "user", text: said, at: Stamp.now())
        let replyId = UUID().uuidString.lowercased()
        messages = messages.filter { $0.streaming != true && $0.id != mine.id } + [mine, TutorMessage(id: replyId, role: "tutor", blocks: [], at: Stamp.now(), streaming: true)]
        struct Body: Encodable { let id: String; let reply_id: String; let text: String; let page: String }
        do {
            let done = try await API.stream("/api/tutor", Body(id: mine.id, reply_id: replyId, text: said, page: page), handlers: .init(onSnap: { [weak self] d in
                self?.patch(replyId) { $0.blocks = Block.list(d["blocks"]) }
            }))
            let actions = (try? done["actions"]?.decode([TutorMessage.Action].self)) ?? []
            patch(replyId) {
                $0.blocks = Block.list(done["blocks"])
                $0.suggestions = done["suggestions"]?.array?.compactMap(\.string)
                $0.actions = actions
                $0.streaming = nil
            }
            for a in actions where a.type == "set_writing" {
                if let w = a.writing { store.setPrefs { $0.writing = w } }
            }
        } catch {
            patch(replyId) { $0.streaming = nil; $0.error = error.localizedDescription }
        }
    }

    func retry(store: Store) async {
        guard let last = messages.last(where: { $0.role == "user" }), let text = last.text, let i = messages.lastIndex(of: last) else { return }
        messages = Array(messages.prefix(upTo: i))
        await send(text, page: "/", resend: last.id, store: store)
    }

    func clear() {
        messages = []
        save()
        Task { _ = try? await API.delete("/api/tutor") }
    }

    private func patch(_ id: String, _ change: (inout TutorMessage) -> Void) {
        guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
        change(&messages[i])
    }

    private func save() {
        guard let owner else { return }
        Disk.write(messages.filter { $0.streaming != true }.suffix(60), "tutor", owner: owner)
    }
}

struct TutorView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.scenePhase) private var scenePhase
    @State private var thread = TutorThread.shared
    @State private var text = ""
    @FocusState private var focused: Bool

    private let starters = ["What’s on today?", "Quiz me on this week", "Explain the last idea again"]

    var body: some View {
        let last = thread.messages.last
        let chips = thread.messages.isEmpty ? starters : (last?.role == "tutor" && last?.streaming != true ? last?.suggestions ?? [] : [])
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if thread.messages.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Ask me anything.").font(.display(28, italic: true)).foregroundStyle(FW.Palette.text)
                            Text("I know today’s plan, what you’ve covered this week and where you got stuck. You can also tell me to write differently.")
                                .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        }
                        .padding(.top, 24)
                    }
                    ForEach(thread.messages) { m in
                        MessageView(message: m, pending: thread.pending) { Task { await thread.retry(store: store) } }
                            .id(m.id)
                    }
                    Color.clear.frame(height: 1).id("end")
                }
                .padding(.horizontal, FW.Size.gutter)
                .padding(.bottom, 12)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .onChange(of: thread.messages.last?.blocks?.count) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
            .onChange(of: thread.messages.count) { _, _ in withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
            .safeAreaInset(edge: .bottom, spacing: 0) { composer(chips: chips) }
        }
        .screenBackground()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                HStack(spacing: 10) {
                    Aperture(size: 26, busy: thread.pending)
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Tutor").font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text)
                        Text(thread.pending ? "Thinking…" : "Knows your week").font(.sans(12)).foregroundStyle(FW.Palette.text3)
                    }
                }
                .fixedSize()
            }
            .sharedBackgroundVisibility(.hidden)
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("How your tutor writes", selection: Binding(get: { store.prefs.writing }, set: { w in store.setPrefs { $0.writing = w } })) {
                        ForEach(Writing.all) { Text($0.label).tag($0.id) }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(Writing.all.first { $0.id == store.prefs.writing }?.label ?? "Balanced")
                        Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                    }
                    .font(.sans(13))
                }
                .accessibilityLabel("Writing style")
            }
            if !thread.messages.isEmpty && !thread.pending {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { thread.clear() } label: { Image(systemName: "arrow.clockwise") }
                        .accessibilityLabel("Start a new conversation")
                }
            }
        }
        .task(id: store.owner) {
            if let owner = store.owner { await thread.open(owner: owner) }
        }
        .onChange(of: scenePhase) { _, p in if p == .active { Task { await thread.pull() } } }
        .onAppear {
            if let draft = router.tutorDraft {
                router.tutorDraft = nil
                Task { await thread.send(draft, page: "/", store: store) }
            }
        }
        .onChange(of: router.tutorDraft) { _, d in
            guard let d else { return }
            router.tutorDraft = nil
            Task { await thread.send(d, page: "/", store: store) }
        }
    }

    private func composer(chips: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if !chips.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(chips.prefix(3), id: \.self) { c in
                        Button { submit(c) } label: {
                            Text(c).font(.sans(13)).multilineTextAlignment(.leading)
                                .padding(.horizontal, 12).padding(.vertical, 7)
                                .foregroundStyle(FW.Palette.text2)
                                .background(FW.Palette.surface, in: .capsule)
                                .overlay(Capsule().strokeBorder(FW.Palette.line))
                        }
                        .buttonStyle(.plain)
                        .disabled(thread.pending)
                    }
                }
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Message your tutor", text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .font(.sans(15))
                    .focused($focused)
                    .padding(.vertical, 9)
                    .onChange(of: text) { _, v in if v.count > 2000 { text = String(v.prefix(2000)) } }
                    .accessibilityLabel("Message your tutor")
                Button { submit(text) } label: {
                    Image(systemName: "arrow.up").font(.system(size: 15, weight: .semibold))
                        .frame(width: 34, height: 34)
                        .foregroundStyle(FW.Palette.onAccent)
                        .background(FW.Palette.accent, in: .rect(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || thread.pending)
                .opacity(text.trimmingCharacters(in: .whitespaces).isEmpty || thread.pending ? 0.4 : 1)
                .padding(.bottom, 3)
                .accessibilityLabel("Send")
            }
            .padding(.leading, 14)
            .padding(.trailing, 6)
            .padding(.vertical, 3)
            .background(FW.Palette.surface2, in: .rect(cornerRadius: FW.Radius.base))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line))
        }
        .padding(.horizontal, FW.Size.gutter)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(FW.Palette.bg)
    }

    private func submit(_ t: String) {
        guard !t.trimmingCharacters(in: .whitespaces).isEmpty, !thread.pending else { return }
        text = ""
        Feedback.shared.play(.tap)
        Task { await thread.send(t, page: "/", store: store) }
    }
}

private struct MessageView: View {
    let message: TutorMessage
    let pending: Bool
    let onRetry: () -> Void
    @Environment(Router.self) private var router

    var body: some View {
        if message.role == "user" {
            HStack {
                Spacer(minLength: 48)
                Text(message.text ?? "")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(FW.Palette.surface3, in: UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 5, topTrailingRadius: 16))
                    .textSelection(.enabled)
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else {
            VStack(alignment: .leading, spacing: 10) {
                if let blocks = message.blocks, !blocks.isEmpty {
                    Blocks(blocks: blocks, streaming: message.streaming == true, face: .sans, size: 15, color: FW.Palette.text.opacity(0.88))
                } else if message.streaming == true {
                    TypingDots()
                }
                if let e = message.error {
                    HStack(spacing: 6) {
                        Text(e).foregroundStyle(FW.Palette.negative)
                        Button("Try again", action: onRetry).fontWeight(.semibold).foregroundStyle(FW.Palette.text)
                    }
                    .font(.sans(14))
                }
                if let actions = message.actions, !actions.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(Array(actions.enumerated()), id: \.offset) { _, a in action(a) }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func action(_ a: TutorMessage.Action) -> some View {
        switch a.type {
        case "open":
            if let href = a.href {
                Button { router.open(href) } label: { Label(a.label ?? "Open", systemImage: "arrow.right").labelStyle(TrailingIcon()) }
                    .buttonStyle(.fw(.secondary, small: true))
            }
        case "start_today":
            Button { router.open("/?begin=1") } label: { Label("Start today’s session", systemImage: "arrow.right").labelStyle(TrailingIcon()) }
                .buttonStyle(.fw(.primary, small: true))
        case "set_writing":
            if let w = a.writing { done("Writing style: \(Writing.all.first { $0.id == w }?.label ?? w)") }
        case "remember":
            done("Saved to memory")
        default:
            EmptyView()
        }
    }

    private func done(_ text: String) -> some View {
        Label(text, systemImage: "checkmark")
            .font(.sans(12.5))
            .foregroundStyle(FW.Palette.accent)
            .padding(.horizontal, 10)
            .frame(height: 26)
            .background(FW.Palette.accent.opacity(0.12), in: .capsule)
    }
}

private struct TypingDots: View {
    @State private var on = false
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle().fill(FW.Palette.text3).frame(width: 6, height: 6)
                    .offset(y: on ? -3 : 0)
                    .animation(.easeInOut(duration: 0.6).repeatForever().delay(Double(i) * 0.15), value: on)
            }
        }
        .padding(.vertical, 6)
        .onAppear { on = true }
        .accessibilityLabel("Thinking")
    }
}
