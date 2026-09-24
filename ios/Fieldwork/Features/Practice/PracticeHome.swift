import AVFoundation
import SwiftUI

// Practice (src/components/practice/hub.tsx): suggestions from the plan, the
// formats, and recent conversations with their feedback.
struct PracticeHome: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var recent = Loader<Recent>("/api/practice")
    @State private var setup: Setup?

    struct Recent: Decodable, Sendable { var practices: [PracticeRecent] }
    struct Setup: Identifiable { var mode: PracticeMode; var topic: String; var id: String { mode.rawValue + topic } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                PageHead(eyebrow: "Practice", title: "Say it out loud.")
                    .padding(.top, 12)
                VStack(alignment: .leading, spacing: 8) {
                    Kicker("Suggested")
                    ForEach(suggestions, id: \.topic) { s in
                        Button { setup = Setup(mode: s.mode, topic: s.topic) } label: {
                            IndexRow(icon: s.mode == .debate ? "chart.bar" : "waveform",
                                     title: s.topic.components(separatedBy: " — ").first ?? s.topic,
                                     detail: "\(s.mode.label) · \(s.why)")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(FW.Palette.text3)
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    Kicker("Choose a format")
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        ForEach(PracticeMode.allCases) { m in
                            Button { setup = Setup(mode: m, topic: "") } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(m.label).font(.sans(15.5, .semibold)).foregroundStyle(FW.Palette.text)
                                    Text(m.blurb).font(.sans(12.5)).foregroundStyle(FW.Palette.text3)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Spacer(minLength: 0)
                                }
                                .frame(maxWidth: .infinity, minHeight: 86, alignment: .topLeading)
                                .card(FW.Radius.lg, fill: FW.Palette.surface, padding: 14)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Kicker("Recent")
                    if let list = recent.value?.practices {
                        if list.isEmpty {
                            Text("Nothing yet. Your conversations and their feedback will collect here.")
                                .font(.sans(15)).foregroundStyle(FW.Palette.text3)
                        }
                        ForEach(list) { p in
                            Button { router.cover = .practice(p.id) } label: {
                                HStack(spacing: 14) {
                                    Dot(color: p.score.map { $0 >= 0.75 ? FW.Palette.positive : $0 >= 0.4 ? FW.Palette.caution : FW.Palette.negative } ?? FW.Palette.text3,
                                        hollow: p.score == nil)
                                        .frame(width: 12)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text).lineLimit(2)
                                        Text("\(PracticeMode.label(p.mode)) · \(Dates.short(p.started_at))\(p.headline.map { " · \($0)" } ?? "")")
                                            .font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(2)
                                    }
                                    Spacer(minLength: 8)
                                    Image(systemName: "chevron.right").foregroundStyle(FW.Palette.text3)
                                }
                                .padding(.vertical, 12)
                                .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                        }
                    } else {
                        ForEach(0..<3, id: \.self) { i in
                            HStack(spacing: 14) {
                                Dot(color: FW.Palette.text4, hollow: true)
                                VStack(alignment: .leading, spacing: 8) {
                                    Skeleton(width: [210, 170, 130][i], height: 13)
                                    Skeleton(width: [130, 110, 90][i], height: 11)
                                }
                            }
                            .padding(.vertical, 12)
                        }
                    }
                }
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .task { await recent.load() }
        .refreshable { await recent.load() }
        .sheet(item: $setup) { s in SetupSheet(mode: s.mode, topic: s.topic) }
    }

    // From the curriculum around today (hub.tsx).
    private var suggestions: [(mode: PracticeMode, topic: String, why: String)] {
        let sessions = (store.plan?["sessions"]?.array ?? []).filter { ($0["date"]?.string ?? "") >= store.today }.prefix(12)
        var out: [(PracticeMode, String, String)] = []
        if let c = sessions.first(where: { $0["subject"]?.string == "communication" }) {
            let title = c["title"]?.string ?? ""
            let mode: PracticeMode = title.range(of: "negotiat", options: .caseInsensitive) != nil ? .negotiation : title.range(of: "delegat", options: .caseInsensitive) != nil ? .delegation : .conversation
            out.append((mode, title + " — " + (c["objective"]?.string ?? ""), "From this week’s communication session"))
        }
        if let j = sessions.first(where: { $0["subject"]?.string == "judgment" }) {
            out.append((.debate, j["title"]?.string ?? "", "Argue it, then hear the strongest other side"))
        }
        out.append((.pitch, "Pitch an idea or project you care about in 60 seconds, then handle a skeptic’s questions.", "The core of the June outcomes"))
        return Array(out.prefix(3))
    }
}

// Setting up a conversation: topic, side, difficulty, length and voice.
private struct SetupSheet: View {
    let mode: PracticeMode
    @State var topic: String
    @State private var side = ""
    @State private var difficulty = "realistic"
    @State private var minutes = 8
    @State private var voice = "cedar"
    @State private var busy = false
    @State private var error: String?
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool

    init(mode: PracticeMode, topic: String) {
        self.mode = mode
        _topic = State(initialValue: topic)
    }

    var body: some View {
        SheetScaffold(title: mode.label, subtitle: mode.blurb) {
            field(mode == .debate ? "The motion or question" : "What do you want to practise?") {
                TextField(placeholder, text: $topic, axis: .vertical)
                    .lineLimit(3...)
                    .focused($focused)
                    .inputStyle(focused: focused)
            }
            if mode == .debate {
                field("Your side (optional)") {
                    TextField("Leave empty and it will pick the other side of whatever you argue", text: $side, axis: .vertical)
                        .lineLimit(1...)
                        .inputStyle(focused: false)
                }
            }
            field("How hard should they push?") {
                Segmented(options: [("gentle", "Gentle"), ("realistic", "Realistic"), ("tough", "Tough")], selection: $difficulty)
            }
            field("Length") {
                Segmented(options: [(5, "5 min"), (8, "8 min"), (12, "12 min")], selection: $minutes)
            }
            field("Voice") { VoiceChoice(selection: $voice) }
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative) }
            Button {
                Task { await create() }
            } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().tint(FW.Palette.onAccent) }
                    Text(busy ? "Writing the scenario" : "Set it up")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.primary, wide: true))
            .disabled(busy || topic.trimmingCharacters(in: .whitespaces).count < 3)
        }
        .onAppear {
            voice = store.prefs.voice
            if topic.isEmpty { focused = true }
        }
        .presentationDetents([.large])
    }

    private var placeholder: String {
        switch mode {
        case .debate: "e.g. Should states set their own minimum wage?"
        case .conversation: "e.g. Telling a collaborator their deliverable missed the brief"
        default: "Describe the situation in a sentence or two"
        }
    }

    private func field<C: View>(_ label: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.sans(13, .medium)).foregroundStyle(FW.Palette.text2)
            content()
        }
    }

    private func create() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let p = try await Practice.create(.init(mode: mode.rawValue, topic: String(topic.trimmingCharacters(in: .whitespacesAndNewlines).prefix(600)),
                                                     side: side.trimmingCharacters(in: .whitespaces).nilIfEmpty, difficulty: difficulty, minutes: minutes, voice: voice))
            dismiss()
            router.cover = .practice(p.id)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension View {
    func inputStyle(focused: Bool) -> some View {
        self
            .font(.sans(16))
            .padding(14)
            .background(focused ? FW.Palette.raised : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line))
    }
}

// Practice voices with samples you can hear (voice-picker.tsx).
struct VoiceChoice: View {
    @Binding var selection: String
    @State private var player: AVAudioPlayer?
    @State private var playing: String?

    var body: some View {
        VStack(spacing: 6) {
            ForEach(Voice.all) { v in
                let on = v.id == selection
                HStack(spacing: 12) {
                    Button {
                        selection = v.id
                        Feedback.shared.play(.tap)
                    } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().fill(on ? FW.Palette.accent : .clear).overlay(Circle().strokeBorder(on ? .clear : FW.Palette.line3, lineWidth: 1.5))
                                if on { Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(FW.Palette.onAccent) }
                            }
                            .frame(width: 20, height: 20)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(v.label).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                                Text("\(v.note) · plays a \(voiceGender[v.id] ?? "man")").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(minHeight: 48)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    Button { toggle(v.id) } label: {
                        Image(systemName: playing == v.id ? "stop.fill" : "play.fill").font(.system(size: 13))
                            .frame(width: 36, height: 36)
                            .foregroundStyle(FW.Palette.text2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(playing == v.id ? "Stop sample" : "Play \(v.label)")
                }
                .padding(.leading, 12)
                .padding(.trailing, 4)
                .background(on ? FW.Palette.raised : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(on ? FW.Palette.line3 : FW.Palette.line))
            }
        }
        .onDisappear { player?.stop() }
    }

    private func toggle(_ id: String) {
        if playing == id {
            player?.stop()
            playing = nil
            return
        }
        guard let url = Bundle.main.url(forResource: id, withExtension: "m4a") else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
        player = try? AVAudioPlayer(contentsOf: url)
        player?.play()
        playing = id
        let duration = player?.duration ?? 3
        Task {
            try? await Task.sleep(for: .seconds(duration + 0.1))
            if playing == id { playing = nil }
        }
    }
}
