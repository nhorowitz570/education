import AVFoundation
import SwiftUI

// Practice (src/components/practice/hub.tsx): suggestions from the plan, the
// formats, and recent conversations with their feedback. The top suggestion
// leads as the one big "start" card; the formats are a grid of tiles.
struct PracticeHome: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var recent = Loader<Recent>("/api/practice")
    @State private var setup: Setup?
    @State private var allRecent = false

    struct Recent: Decodable, Sendable { var practices: [PracticeRecent] }
    struct Setup: Identifiable { var mode: PracticeMode; var topic: String; var id: String { mode.rawValue + topic } }
    struct Suggestion { var mode: PracticeMode; var title: String; var topic: String; var why: String }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let top = suggestions.first {
                    hero(top).rise(0)
                }
                if suggestions.count > 1 {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHead(title: "More ideas")
                        ForEach(Array(suggestions.dropFirst().enumerated()), id: \.element.topic) { i, s in
                            suggestionCard(s).rise(i + 1)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 12) {
                    SectionHead(title: "Formats")
                    // A Grid (not a lazy one) so both tiles in a row share
                    // the taller one's height when a title wraps.
                    Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                        ForEach(0..<(PracticeMode.allCases.count + 1) / 2, id: \.self) { row in
                            GridRow {
                                ForEach(Array(PracticeMode.allCases.enumerated()).dropFirst(row * 2).prefix(2), id: \.element) { i, m in
                                    Button { setup = Setup(mode: m, topic: "") } label: {
                                        Tile(icon: m.icon, title: m.label, caption: m.caption, color: m.color)
                                    }
                                    .buttonStyle(.pressable)
                                    .frame(maxHeight: .infinity)
                                    .accessibilityHint(m.blurb)
                                    .rise(i + 2, step: 0.035)
                                }
                            }
                        }
                    }
                }
                recentSection.rise(4)
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .screenBackground()
        .navigationTitle("Practice")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    ForEach(PracticeMode.allCases) { m in
                        Button(m.label, systemImage: m.icon) { setup = Setup(mode: m, topic: "") }
                    }
                } label: {
                    Label("New practice", systemImage: "plus")
                }
            }
        }
        .task { await recent.load() }
        .refreshable { await recent.load() }
        .sheet(item: $setup) { s in SetupSheet(mode: s.mode, topic: s.topic) }
    }

    // The one hero: the plan's best next conversation, one big button.
    private func hero(_ s: Suggestion) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                IconBadge(systemName: s.mode.icon, color: s.mode.color, size: 30, circle: true)
                Text("Suggested · \(s.mode.label)")
                    .font(.sans(13, .semibold))
                    .foregroundStyle(FW.Palette.text2)
                    .lineLimit(1)
            }
            Text(s.title)
                .font(.sans(26, .bold))
                .foregroundStyle(FW.Palette.text)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 16)
            Text(s.why)
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text2)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            Button { setup = Setup(mode: s.mode, topic: s.topic) } label: {
                Label("Start practising", systemImage: "mic.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.primary, wide: true))
            .padding(.top, 22)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { Aurora(colors: [s.mode.color, FW.Palette.coral, FW.Palette.judgment], intensity: 0.42) }
        .clipShape(.rect(cornerRadius: FW.Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
    }

    private func suggestionCard(_ s: Suggestion) -> some View {
        Button { setup = Setup(mode: s.mode, topic: s.topic) } label: {
            HStack(spacing: 14) {
                IconBadge(systemName: s.mode.icon, color: s.mode.color, size: 44)
                VStack(alignment: .leading, spacing: 3) {
                    Text(s.title)
                        .font(.sans(16, .semibold))
                        .foregroundStyle(FW.Palette.text)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                    Text(s.mode.label).font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(1)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text4)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
        }
        .buttonStyle(.pressable)
        .accessibilityHint(s.why)
    }

    @ViewBuilder private var recentSection: some View {
        let list = recent.value?.practices
        VStack(alignment: .leading, spacing: 12) {
            SectionHead(title: "Recent", trailing: list.flatMap { $0.isEmpty ? nil : "\($0.count)" })
            if let list {
                if list.isEmpty {
                    HStack(spacing: 14) {
                        IconBadge(systemName: "waveform", color: FW.Palette.text3, size: 40, circle: true)
                        Text("Your conversations and feedback land here.")
                            .font(.sans(15)).foregroundStyle(FW.Palette.text3)
                    }
                    .padding(.vertical, 6)
                } else {
                    let shown = allRecent ? list : Array(list.prefix(4))
                    GroupCard {
                        ForEach(shown) { p in
                            Button { router.cover = .practice(p.id) } label: { RecentRow(p: p) }
                                .buttonStyle(.pressable(0.98))
                        }
                    }
                    if list.count > 4 {
                        Button {
                            withAnimation(Springs.smooth) { allRecent.toggle() }
                        } label: {
                            Label(allRecent ? "Show fewer" : "Show all \(list.count)", systemImage: allRecent ? "chevron.up" : "chevron.down")
                                .font(.sans(14, .semibold))
                                .foregroundStyle(FW.Palette.text2)
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                GroupCard {
                    ForEach(0..<3, id: \.self) { i in
                        HStack(spacing: 14) {
                            Circle().fill(FW.Palette.surface2).frame(width: 36, height: 36)
                            VStack(alignment: .leading, spacing: 8) {
                                Skeleton(width: [190, 150, 120][i], height: 13)
                                Skeleton(width: [110, 90, 80][i], height: 11)
                            }
                            Spacer()
                        }
                        .frame(minHeight: 64)
                    }
                }
            }
        }
    }

    // From the curriculum around today (hub.tsx).
    private var suggestions: [Suggestion] {
        let sessions = (store.plan?["sessions"]?.array ?? []).filter { ($0["date"]?.string ?? "") >= store.today }.prefix(12)
        var out: [Suggestion] = []
        if let c = sessions.first(where: { $0["subject"]?.string == "communication" }) {
            let title = c["title"]?.string ?? ""
            let mode: PracticeMode = title.range(of: "negotiat", options: .caseInsensitive) != nil ? .negotiation : title.range(of: "delegat", options: .caseInsensitive) != nil ? .delegation : .conversation
            out.append(.init(mode: mode, title: title, topic: title + " — " + (c["objective"]?.string ?? ""), why: "From this week’s communication session"))
        }
        if let j = sessions.first(where: { $0["subject"]?.string == "judgment" }) {
            let title = j["title"]?.string ?? ""
            out.append(.init(mode: .debate, title: title, topic: title, why: "Argue it, then hear the strongest other side"))
        }
        out.append(.init(mode: .pitch, title: "Pitch an idea in 60 seconds",
                         topic: "Pitch an idea or project you care about in 60 seconds, then handle a skeptic’s questions.", why: "The core of the June outcomes"))
        return Array(out.prefix(3))
    }
}

// A recent conversation: a score ring around its format, the title, when.
private struct RecentRow: View {
    let p: PracticeRecent

    var body: some View {
        let mode = PracticeMode(rawValue: p.mode)
        let color = scoreColor(p.score)
        HStack(spacing: 14) {
            ZStack {
                Circle().stroke(FW.Palette.surface2, lineWidth: 3)
                if let s = p.score {
                    Circle().trim(from: 0, to: s).stroke(color, style: .init(lineWidth: 3, lineCap: .round)).rotationEffect(.degrees(-90))
                }
                Image(systemName: mode?.icon ?? "waveform")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(p.score == nil ? FW.Palette.text3 : color)
            }
            .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(p.title).font(.sans(16, .medium)).foregroundStyle(FW.Palette.text).lineLimit(1)
                Text("\(PracticeMode.label(p.mode)) · \(relativeDay(p.started_at))")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let s = p.score {
                Text("\(Int((s * 100).rounded()))")
                    .font(.rounded(17, .semibold))
                    .foregroundStyle(FW.Palette.text2)
                    .monospacedDigit()
            } else if p.status != "done" {
                Text("Resume").font(.sans(13, .semibold)).foregroundStyle(FW.Palette.accent)
            }
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text4)
        }
        .padding(.vertical, 12)
        .frame(minHeight: 64)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint(p.headline ?? "")
    }
}

// Solid / partial / missed, by score (the dot on the web's recent list).
func scoreColor(_ score: Double?) -> Color {
    guard let s = score else { return FW.Palette.text3 }
    return s >= 0.75 ? FW.Palette.positive : s >= 0.4 ? FW.Palette.caution : FW.Palette.negative
}

// "Today", "Yesterday", "3 days ago", then a date.
private func relativeDay(_ s: String) -> String {
    guard let d = Dates.parse(s) else { return "" }
    let cal = Calendar.current
    if cal.isDateInToday(d) { return "Today" }
    if cal.isDateInYesterday(d) { return "Yesterday" }
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: d), to: cal.startOfDay(for: .now)).day ?? 0
    if days > 1, days < 7 { return "\(days) days ago" }
    return Dates.short(s)
}

extension PracticeMode {
    var icon: String {
        switch self {
        case .debate: "scalemass.fill"
        case .conversation: "bubble.left.and.bubble.right.fill"
        case .negotiation: "arrow.left.arrow.right"
        case .pitch: "megaphone.fill"
        case .delegation: "person.2.fill"
        case .interview: "person.text.rectangle.fill"
        case .explain: "lightbulb.fill"
        case .free: "sparkles"
        }
    }
    var color: Color {
        switch self {
        case .debate: FW.Palette.judgment
        case .conversation: FW.Palette.communication
        case .negotiation: FW.Palette.finance
        case .pitch: FW.Palette.coral
        case .delegation: FW.Palette.review
        case .interview: FW.Palette.judgment
        case .explain: FW.Palette.caution
        case .free: FW.Palette.text2
        }
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
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    HStack(spacing: 14) {
                        IconBadge(systemName: mode.icon, color: mode.color, size: 48)
                        Text(mode.blurb).font(.sans(15)).foregroundStyle(FW.Palette.text2).fixedSize(horizontal: false, vertical: true)
                    }
                    .rise(0)
                    field(mode == .debate ? "The motion or question" : "What do you want to practise?", icon: "text.bubble.fill") {
                        TextField(placeholder, text: $topic, axis: .vertical)
                            .lineLimit(3...)
                            .focused($focused)
                            .inputStyle(focused: focused)
                    }
                    .rise(1)
                    if mode == .debate {
                        field("Your side (optional)", icon: "flag.fill") {
                            TextField("Leave empty and it will pick the other side of whatever you argue", text: $side, axis: .vertical)
                                .lineLimit(1...)
                                .inputStyle(focused: false)
                        }
                        .rise(2)
                    }
                    field("How hard should they push?", icon: "dial.medium.fill") {
                        HStack(spacing: 10) {
                            ForEach(Self.difficulties, id: \.id) { d in
                                ChoiceCard(icon: d.icon, title: d.label, color: d.color, selected: difficulty == d.id) {
                                    difficulty = d.id
                                }
                            }
                        }
                    }
                    .rise(3)
                    field("Length", icon: "timer") {
                        HStack(spacing: 10) {
                            ForEach([5, 8, 12], id: \.self) { m in
                                LengthChip(minutes: m, selected: minutes == m) { minutes = m }
                            }
                        }
                    }
                    .rise(4)
                    field("Voice", icon: "waveform") { VoiceChoice(selection: $voice) }
                        .rise(5)
                    if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative) }
                }
                .padding(.horizontal, FW.Size.gutter + 4)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaBar(edge: .bottom) {
                Button {
                    Task { await create() }
                } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "sparkles") }
                        Text(busy ? "Writing the scenario" : "Set it up").contentTransition(.opacity)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(busy || topic.trimmingCharacters(in: .whitespaces).count < 3)
                .animation(Springs.snappy, value: busy)
                .padding(.horizontal, FW.Size.gutter + 4)
                .padding(.top, 10)
                .padding(.bottom, 8)
            }
            .navigationTitle(mode.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                }
            }
            .background(FW.Palette.raised)
        }
        .onAppear {
            voice = store.prefs.voice
            if topic.isEmpty { focused = true }
        }
        .presentationDetents([.large])
        .presentationCornerRadius(FW.Radius.xl)
        .presentationBackground(FW.Palette.raised)
    }

    private static let difficulties: [(id: String, label: String, icon: String, color: Color)] = [
        ("gentle", "Gentle", "leaf.fill", FW.Palette.positive),
        ("realistic", "Realistic", "person.2.fill", FW.Palette.communication),
        ("tough", "Tough", "flame.fill", FW.Palette.negative),
    ]

    private var placeholder: String {
        switch mode {
        case .debate: "e.g. Should states set their own minimum wage?"
        case .conversation: "e.g. Telling a collaborator their deliverable missed the brief"
        default: "Describe the situation in a sentence or two"
        }
    }

    private func field<C: View>(_ label: String, icon: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label {
                Text(label).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
            } icon: {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text3)
            }
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

// One of a row of visual choices: an icon over a word, tinted when picked.
private struct ChoiceCard: View {
    let icon: String
    let title: String
    let color: Color
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            withAnimation(Springs.snappy) { action() }
            Feedback.shared.play(.tap)
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(selected ? color : FW.Palette.text3)
                    .symbolEffect(.bounce, value: selected)
                Text(title).font(.sans(14, selected ? .semibold : .medium)).foregroundStyle(selected ? FW.Palette.text : FW.Palette.text2)
            }
            .frame(maxWidth: .infinity, minHeight: 76)
            .background(selected ? color.opacity(0.12) : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(selected ? color : FW.Palette.line, lineWidth: selected ? 1.5 : 1))
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// "8 min" as a big number in a chip.
private struct LengthChip: View {
    let minutes: Int
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            withAnimation(Springs.snappy) { action() }
            Feedback.shared.play(.tap)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(minutes)").font(.rounded(22))
                Text("min").font(.sans(13, .medium))
            }
            .foregroundStyle(selected ? FW.Palette.onAccent : FW.Palette.text)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(selected ? FW.Palette.accent : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(selected ? .clear : FW.Palette.line, lineWidth: 1))
        }
        .buttonStyle(.pressable)
        .accessibilityLabel("\(minutes) minutes")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

extension View {
    func inputStyle(focused: Bool) -> some View {
        self
            .font(.sans(16))
            .padding(14)
            .background(focused ? FW.Palette.bg : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line))
            .animation(Springs.snappy, value: focused)
    }
}

// Practice voices with samples you can hear (voice-picker.tsx): a row of
// avatars, a play button on each, and the picked voice's description.
struct VoiceChoice: View {
    @Binding var selection: String
    @State private var player: AVAudioPlayer?
    @State private var playing: String?

    var body: some View {
        let picked = Voice.all.first { $0.id == selection }
        VStack(alignment: .leading, spacing: 14) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 16) {
                ForEach(Voice.all) { v in avatar(v) }
            }
            if let picked {
                HStack(spacing: 8) {
                    Image(systemName: "person.wave.2.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(voiceColor(picked.id))
                    Text("\(picked.label) · \(picked.note) · plays a \(voiceGender[picked.id] ?? "man")")
                        .font(.sans(13)).foregroundStyle(FW.Palette.text2)
                        .lineLimit(2)
                }
                .id(picked.id)
                .transition(.blurReplace)
            }
        }
        .animation(Springs.snappy, value: selection)
        .onDisappear { player?.stop() }
    }

    private func avatar(_ v: Voice) -> some View {
        let on = v.id == selection
        let color = voiceColor(v.id)
        let isPlaying = playing == v.id
        return VStack(spacing: 8) {
            Button {
                selection = v.id
                Feedback.shared.play(.tap)
            } label: {
                ZStack {
                    Circle().fill(LinearGradient(colors: [color.opacity(0.9), color.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    if isPlaying {
                        Image(systemName: "waveform")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(FW.Palette.bg)
                            .symbolEffect(.variableColor.iterative, isActive: true)
                            .transition(.scale.combined(with: .opacity))
                    } else {
                        Text(String(v.label.prefix(1)))
                            .font(.rounded(24))
                            .foregroundStyle(FW.Palette.bg)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
                .frame(width: 64, height: 64)
                .padding(4)
                .overlay(Circle().strokeBorder(on ? FW.Palette.text : .clear, lineWidth: 2.5))
                .scaleEffect(on ? 1 : 0.94)
            }
            .buttonStyle(.pressable(0.94))
            .accessibilityLabel("\(v.label), \(v.note), plays a \(voiceGender[v.id] ?? "man")")
            .accessibilityAddTraits(on ? .isSelected : [])
            .overlay(alignment: .bottomTrailing) {
                Button { toggle(v.id) } label: {
                    Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(FW.Palette.text)
                        .frame(width: 28, height: 28)
                        .background(FW.Palette.raised, in: .circle)
                        .overlay(Circle().strokeBorder(FW.Palette.line2, lineWidth: 1))
                        .contentTransition(.symbolEffect(.replace))
                        .frame(width: 44, height: 44)
                        .contentShape(.circle)
                }
                .buttonStyle(.pressable(0.9))
                .offset(x: 12, y: 10)
                .accessibilityLabel(isPlaying ? "Stop sample" : "Play \(v.label)")
            }
            Text(v.label)
                .font(.sans(14, on ? .semibold : .medium))
                .foregroundStyle(on ? FW.Palette.text : FW.Palette.text2)
        }
        .animation(Springs.bouncy, value: on)
        .animation(Springs.snappy, value: isPlaying)
    }

    private func voiceColor(_ id: String) -> Color {
        switch id {
        case "cedar": FW.Palette.finance
        case "willow": FW.Palette.coral
        case "meridian": FW.Palette.review
        case "gleam": FW.Palette.caution
        case "vesper": FW.Palette.judgment
        default: FW.Palette.communication
        }
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
