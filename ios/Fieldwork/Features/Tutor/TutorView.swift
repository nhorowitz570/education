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
        } catch is CancellationError {
            // Stopped from the composer: keep what arrived. The server still
            // saves the full reply, which the next pull brings in.
            patch(replyId) { $0.streaming = nil }
            messages.removeAll { $0.id == replyId && ($0.blocks ?? []).isEmpty }
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

// Laid out like a chat app: with nothing said yet, the question and the
// composer sit in the middle of the screen; the first message sends the
// composer down to the bottom and the conversation takes the space above.
struct TutorView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var thread = TutorThread.shared
    @State private var text = ""
    @State private var sending: Task<Void, Never>?
    @State private var anchor: String?
    @State private var viewport: CGFloat = 600
    @FocusState private var focused: Bool

    // Same as the web (src/components/tutor/chat.tsx), with a glyph each.
    private let starters: [(String, String)] = [
        ("What’s on today?", "calendar"),
        ("Quiz me on this week", "questionmark.bubble"),
        ("Explain the last idea again", "lightbulb"),
        ("Give me a quick review", "arrow.triangle.2.circlepath"),
    ]

    var body: some View {
        let empty = thread.messages.isEmpty
        VStack(spacing: 0) {
            if empty {
                Spacer(minLength: 0)
                hero
                    .transition(.asymmetric(insertion: .opacity, removal: .opacity.combined(with: .scale(scale: 0.92)).combined(with: .offset(y: -30))))
            } else {
                conversation
                    .transition(.opacity)
            }
            composer
            if empty {
                starterList
                    .transition(.opacity.combined(with: .offset(y: 20)))
                Spacer(minLength: 0)
                Spacer(minLength: 0)
            }
        }
        .animation(.fw(Springs.smooth, reduced: reduceMotion), value: empty)
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { styleMenu }
            if !empty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        sending?.cancel()
                        withAnimation(Springs.smooth) { thread.clear() }
                        anchor = nil
                        Feedback.shared.play(.tap)
                    } label: { Image(systemName: "square.and.pencil") }
                    .disabled(thread.pending)
                    .accessibilityLabel("New conversation")
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
                submit(draft)
            }
        }
        .onChange(of: router.tutorDraft) { _, d in
            guard let d else { return }
            router.tutorDraft = nil
            submit(d)
        }
    }

    // MARK: Empty state

    private var hero: some View {
        VStack(spacing: 14) {
            Aperture(size: 52, busy: focused)
                .rise(0)
            Text("What should we dig into?")
                .font(.sans(26, .bold))
                .foregroundStyle(FW.Palette.text)
                .multilineTextAlignment(.center)
                .rise(1)
            Text("I know your plan and where you got stuck.")
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text3)
                .multilineTextAlignment(.center)
                .rise(2)
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 28)
    }

    private var starterList: some View {
        VStack(spacing: 2) {
            ForEach(Array(starters.enumerated()), id: \.offset) { i, s in
                Button { submit(s.0) } label: {
                    HStack(spacing: 14) {
                        Image(systemName: s.1)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(FW.Palette.text2)
                            .frame(width: 24)
                        Text(s.0).font(.sans(16)).foregroundStyle(FW.Palette.text)
                        Spacer()
                    }
                    .padding(.horizontal, 14)
                    .frame(height: 48)
                    .contentShape(.rect)
                }
                .buttonStyle(.pressable)
                .rise(i, delay: 0.15)
            }
        }
        .padding(.horizontal, FW.Size.gutter)
        .padding(.top, 14)
    }

    // MARK: Conversation

    private var conversation: some View {
        let messages = thread.messages
        let split = anchor.flatMap { a in messages.firstIndex { $0.id == a } } ?? messages.count
        return ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(messages.prefix(split)) { m in row(m, last: m.id == messages.last?.id) }
                    if split < messages.count {
                        // The turn just sent is held at the top of the screen
                        // while the reply writes itself in below it.
                        VStack(alignment: .leading, spacing: 22) {
                            ForEach(messages.suffix(from: split)) { m in row(m, last: m.id == messages.last?.id) }
                        }
                        .frame(minHeight: max(0, viewport - 40), alignment: .top)
                    }
                    Color.clear.frame(height: 1).id("end")
                }
                .padding(.horizontal, FW.Size.gutter + 4)
                .padding(.top, 12)
                .padding(.bottom, 16)
                .animation(.fw(Springs.smooth, reduced: reduceMotion), value: messages.count)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.height } action: { _, h in viewport = h }
            .onChange(of: anchor) { _, a in
                guard let a else { return }
                Task {
                    try? await Task.sleep(for: .milliseconds(60))
                    withAnimation(.fw(Springs.smooth, reduced: reduceMotion)) { proxy.scrollTo(a, anchor: .top) }
                }
            }
            .onChange(of: thread.messages.last?.id) { _, _ in
                if anchor == nil { proxy.scrollTo("end", anchor: .bottom) }
            }
        }
    }

    @ViewBuilder
    private func row(_ m: TutorMessage, last: Bool) -> some View {
        MessageView(message: m, last: last, pending: thread.pending,
                    onRetry: { sending = Task { await thread.retry(store: store) } },
                    onFollow: { submit($0) })
            .id(m.id)
    }

    // MARK: Composer

    private var composer: some View {
        let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return HStack(alignment: .bottom, spacing: 10) {
            TextField("Ask anything", text: $text, axis: .vertical)
                .lineLimit(1...6)
                .font(.sans(17))
                .focused($focused)
                .padding(.vertical, 11)
                .submitLabel(.send)
                .onSubmit { submit(text) }
                .onChange(of: text) { _, v in if v.count > 2000 { text = String(v.prefix(2000)) } }
                .accessibilityLabel("Message your tutor")
            Button {
                if thread.pending { sending?.cancel() } else { submit(text) }
            } label: {
                Image(systemName: thread.pending ? "stop.fill" : "arrow.up")
                    .font(.system(size: thread.pending ? 13 : 16, weight: .bold))
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(FW.Palette.onAccent)
                    .background(FW.Palette.accent, in: .circle)
                    .opacity(empty && !thread.pending ? 0.25 : 1)
                    .scaleEffect(empty && !thread.pending ? 0.9 : 1)
                    .animation(Springs.bouncy, value: empty)
            }
            .buttonStyle(.plain)
            .disabled(empty && !thread.pending)
            .padding(.bottom, 5)
            .accessibilityLabel(thread.pending ? "Stop" : "Send")
        }
        .padding(.leading, 18)
        .padding(.trailing, 6)
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(focused ? 0.1 : 0.05), radius: 14, y: 6)
        .padding(.horizontal, FW.Size.gutter)
        .padding(.top, 6)
        .padding(.bottom, 10)
    }

    // The title doubles as the writing-style picker, like a model picker.
    private var styleMenu: some View {
        Menu {
            Picker("How your tutor writes", selection: Binding(get: { store.prefs.writing }, set: { w in store.setPrefs { $0.writing = w } })) {
                ForEach(Writing.all) { Text($0.label).tag($0.id) }
            }
        } label: {
            HStack(spacing: 6) {
                Text("Tutor").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                Text(Writing.all.first { $0.id == store.prefs.writing }?.label ?? "Balanced")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text3)
                    .contentTransition(.interpolate)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold)).foregroundStyle(FW.Palette.text3)
            }
            .padding(.horizontal, 12)
            .frame(height: 36)
            .contentShape(.capsule)
        }
        .accessibilityLabel("Writing style")
    }

    private func submit(_ t: String) {
        let said = t.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !said.isEmpty, !thread.pending else { return }
        text = ""
        Feedback.shared.play(.tap)
        sending = Task { await thread.send(said, page: "/", store: store) }
        // Hold the new turn at the top once it's in.
        Task {
            try? await Task.sleep(for: .milliseconds(30))
            anchor = thread.messages.last(where: { $0.role == "user" })?.id
        }
    }
}

private struct MessageView: View {
    let message: TutorMessage
    let last: Bool
    let pending: Bool
    let onRetry: () -> Void
    let onFollow: (String) -> Void
    @Environment(Router.self) private var router
    @State private var copied = false

    var body: some View {
        if message.role == "user" {
            HStack {
                Spacer(minLength: 56)
                Text(message.text ?? "")
                    .font(.sans(16))
                    .foregroundStyle(FW.Palette.text)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(FW.Palette.surface2, in: .rect(cornerRadius: 22, style: .continuous))
                    .textSelection(.enabled)
            }
            .transition(.asymmetric(
                insertion: .scale(scale: 0.6, anchor: .bottomTrailing).combined(with: .opacity).combined(with: .offset(y: 40)),
                removal: .opacity))
        } else {
            VStack(alignment: .leading, spacing: 14) {
                if let blocks = message.blocks, !blocks.isEmpty {
                    Blocks(blocks: blocks, streaming: message.streaming == true, face: .sans, size: 16.5, color: FW.Palette.text)
                        .transition(.opacity)
                } else if message.streaming == true {
                    Thinking()
                        .transition(.opacity.combined(with: .scale(scale: 0.8, anchor: .leading)))
                }
                if let e = message.error {
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.circle.fill").foregroundStyle(FW.Palette.negative)
                        Text(e).font(.sans(14)).foregroundStyle(FW.Palette.text2)
                        Button("Try again", action: onRetry).font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text)
                    }
                }
                if let actions = message.actions, !actions.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(Array(actions.enumerated()), id: \.offset) { _, a in action(a) }
                    }
                    .rise(0)
                }
                if message.streaming != true, message.error == nil, !(message.blocks ?? []).isEmpty {
                    tools.rise(0, delay: 0.1)
                }
                if last, message.streaming != true, let follow = message.suggestions, !follow.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(follow.prefix(3).enumerated()), id: \.offset) { i, f in
                            Button { onFollow(f) } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "arrow.turn.down.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(FW.Palette.text3)
                                    Text(f).font(.sans(15)).foregroundStyle(FW.Palette.text).multilineTextAlignment(.leading)
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(FW.Palette.raised, in: .rect(cornerRadius: 16, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(FW.Palette.line))
                            }
                            .buttonStyle(.pressable)
                            .disabled(pending)
                            .rise(i, step: 0.07, delay: 0.2)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .animation(Springs.smooth, value: message.streaming)
        }
    }

    // Copy, under a finished reply.
    private var tools: some View {
        HStack(spacing: 18) {
            Button {
                UIPasteboard.general.string = (message.blocks ?? []).compactMap(\.md).joined(separator: "\n\n")
                Feedback.shared.play(.tap)
                withAnimation(Springs.bouncy) { copied = true }
                Task {
                    try? await Task.sleep(for: .seconds(1.6))
                    withAnimation(Springs.smooth) { copied = false }
                }
            } label: {
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 28, height: 28)
            }
            .accessibilityLabel(copied ? "Copied" : "Copy")
            if last {
                Button(action: onRetry) { Image(systemName: "arrow.clockwise").frame(width: 28, height: 28) }
                    .disabled(pending)
                    .accessibilityLabel("Ask again")
            }
        }
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(FW.Palette.text3)
        .buttonStyle(.plain)
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
        Label(text, systemImage: "checkmark.circle.fill")
            .font(.sans(13, .medium))
            .foregroundStyle(FW.Palette.positive)
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(FW.Palette.positive.opacity(0.12), in: .capsule)
    }
}

// The tutor working on an answer: a breathing dot and a shimmering word.
private struct Thinking: View {
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(FW.Palette.text)
                .frame(width: 12, height: 12)
                .scaleEffect(on ? 1 : 0.7)
                .opacity(on ? 1 : 0.5)
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.8).repeatForever(), value: on)
            ShimmerText(text: "Thinking")
        }
        .padding(.vertical, 4)
        .onAppear { on = true }
    }
}
