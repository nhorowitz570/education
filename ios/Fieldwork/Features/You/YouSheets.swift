import AVFoundation
import CoreTransferable
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import UserNotifications

// Settings sheets (src/components/you/sheets.tsx, writing.tsx, settings.tsx,
// passkeys.tsx): teaching style, writing, voice, notifications, reading,
// game elements, your plan, sign-in, AI cost and data & privacy.

// MARK: - Shared pieces

// A setting with its effect spelled out and a control on the right
// (web: .setting-line).
struct YouSettingLine<Control: View>: View {
    let title: String
    var detail: String? = nil
    @ViewBuilder var control: () -> Control

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail {
                    Text(detail).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            control()
        }
    }
}

// A JSON file handed to the share sheet (the web's download()).
struct SharedJSONFile: Transferable, Sendable {
    let name: String
    let data: Data

    init(name: String, json: JSON) {
        self.name = name
        data = youPrettyJSON(json)
    }
    init(name: String, data: Data) {
        self.name = name
        self.data = data
    }

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .json) { file in
            let url = URL.temporaryDirectory.appending(path: file.name)
            try file.data.write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}

func youPrettyJSON(_ json: JSON) -> Data {
    let e = JSONEncoder()
    e.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    return (try? e.encode(json)) ?? Data("{}".utf8)
}

// Shows the system share sheet for a file once it's ready (after a fetch).
@MainActor
enum YouShare {
    static func present(_ url: URL, done: @escaping @MainActor @Sendable (Bool) -> Void) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        guard var top = scene?.keyWindow?.rootViewController else { return }
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        vc.completionWithItemsHandler = { _, completed, _, _ in
            Task { @MainActor in done(completed) }
        }
        vc.popoverPresentationController?.sourceView = top.view
        top.present(vc, animated: true)
    }
}

// MARK: - Teaching style

private func youBand(_ x: Double, _ lo: String, _ mid: String, _ hi: String) -> String { x < 0.35 ? lo : x > 0.65 ? hi : mid }

private struct YouStyleAxis {
    let name: String, left: String, right: String
    let value: KeyPath<MemStyle, Double>
    let means: (Double) -> String
}

private var youStyleAxes: [YouStyleAxis] { [
    .init(name: "Depth", left: "Brief", right: "Thorough", value: \.depth) { x in
        "Replies of about \(Int(((50 + x * 140) / 10).rounded()) * 10) words"
    },
    .init(name: "Challenge", left: "Gentle", right: "Stretching", value: \.challenge) { x in
        youBand(x, "Small steps that build confidence", "A steady pace", "Pushes harder and skips the obvious")
    },
    .init(name: "Visuals", left: "Words", right: "Pictures", value: \.visual) { x in
        youBand(x, "Diagrams only when essential", "Diagrams when they clarify", "Diagrams and charts often")
    },
    .init(name: "Questions", left: "Explain", right: "Ask me", value: \.questions) { x in
        youBand(x, "Explains clearly before asking", "A balance of explaining and asking", "Asks you first, then explains")
    },
    .init(name: "Examples", left: "Abstract", right: "Concrete", value: \.examples) { x in
        youBand(x, "Comfortable with abstract framing", "A mix of framing and examples", "Always anchored in a concrete example")
    },
] }

// Each axis, with what its current position means in practice. The style is
// inferred from what the learner does and moves slowly on purpose.
struct YouStyleSheet: View {
    let style: MemStyle?

    var body: some View {
        let s = style.flatMap { $0.observations > 0 ? $0 : nil }
        SheetScaffold(title: "Teaching style", subtitle: "How your tutor writes for you, learned from what you do.") {
            if let s {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(youStyleAxes, id: \.name) { a in axis(a, s[keyPath: a.value]) }
                }
                .padding(18)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg))
            } else {
                Text("Nothing learned yet. After a few sessions this shows how your tutor has adapted to you.")
                    .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text((s.map { "Learned from \($0.observations) moments. " } ?? "")
                + "Asking for “simpler”, “go deeper”, an example or a picture moves these, and one session can’t swing them. To reset them, use Forget everything in Memory.")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func axis(_ a: YouStyleAxis, _ x: Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(a.name).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
                Spacer(minLength: 0)
                Text(a.means(x)).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 12) {
                Text(a.left).font(.sans(12)).foregroundStyle(FW.Palette.text3)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .frame(width: 64, alignment: .leading)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(FW.Palette.line2).frame(height: 2)
                        Circle().fill(FW.Palette.text).frame(width: 12, height: 12)
                            .offset(x: geo.size.width * min(max(x, 0), 1) - 6)
                    }
                    .frame(maxHeight: .infinity)
                }
                .frame(height: 12)
                Text(a.right).font(.sans(12)).foregroundStyle(FW.Palette.text3)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .frame(width: 64, alignment: .trailing)
            }
            .accessibilityElement()
            .accessibilityLabel("\(a.name): \(a.left) to \(a.right)")
            .accessibilityValue("\(Int((x * 100).rounded())) percent")
        }
    }
}

// MARK: - Writing style

struct YouWritingSheet: View {
    @Environment(Store.self) private var store

    var body: some View {
        SheetScaffold(title: "Writing style", subtitle: "How your tutor talks to you in lessons, feedback and chat. It changes the tone and length, never what’s true.") {
            YouWritingPicker(value: store.prefs.writing) { id in store.setPrefs { $0.writing = id } }
        }
    }
}

// The five styles as cards, each with a small stage that shows its character
// in motion (the chosen one plays), and a sample of how it sounds.
struct YouWritingPicker: View {
    let value: String
    let onChange: (String) -> Void

    var body: some View {
        let all = Writing.all
        let current = all.first { $0.id == value } ?? all[0]
        VStack(alignment: .leading, spacing: 18) {
            VStack(spacing: 10) {
                if let first = all.first { card(first) }
                ForEach(Array(stride(from: 1, to: all.count, by: 2)), id: \.self) { i in
                    HStack(alignment: .top, spacing: 10) {
                        card(all[i]).frame(maxHeight: .infinity, alignment: .top)
                        if i + 1 < all.count { card(all[i + 1]).frame(maxHeight: .infinity, alignment: .top) } else { Color.clear }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Writing style")
            VStack(alignment: .leading, spacing: 8) {
                Kicker("Sounds like")
                Text(current.sample)
                    .font(.serif(17))
                    .lineSpacing(5)
                    .foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 16)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
            .id(current.id)
            .transition(.opacity)
        }
        .animation(.easeOut(duration: FW.Motion.base), value: value)
    }

    private func card(_ w: Writing) -> some View {
        let on = w.id == value
        return Button {
            Feedback.shared.play(.tap)
            onChange(w.id)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                YouWritingStage(kind: w.id, playing: on)
                    .frame(height: 58)
                    .frame(maxWidth: .infinity)
                    .background(FW.Palette.bg, in: .rect(cornerRadius: 10))
                    .clipShape(.rect(cornerRadius: 10))
                Text(w.label).font(.sans(14.5, .semibold)).foregroundStyle(FW.Palette.text)
                    .padding(.top, 10)
                Text(w.note).font(.sans(12.5)).foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
            .padding(.bottom, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(on ? FW.Palette.surface : FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.base))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(on ? FW.Palette.accent : FW.Palette.line, lineWidth: 1))
            .contentShape(.rect(cornerRadius: FW.Radius.base))
        }
        .buttonStyle(YouPressStyle())
        .accessibilityLabel("\(w.label), \(w.note)")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// The web's .btn.danger: a quiet red tint, dimmed as a whole when disabled.
struct YouDangerStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(15, .medium))
            .padding(.horizontal, 18)
            .frame(minHeight: 46)
            .frame(maxWidth: .infinity)
            .foregroundStyle(FW.Palette.negative)
            .background(FW.Palette.negative.opacity(configuration.isPressed ? 0.22 : 0.14), in: .capsule)
            .opacity(enabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: FW.Motion.fast), value: configuration.isPressed)
            .contentShape(.capsule)
    }
}

struct YouPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: FW.Motion.fast), value: configuration.isPressed)
    }
}

// Little stages for each writing style (src/styles/tutor.css .ws-*). Only
// the chosen style moves, and nothing moves with Reduce Motion on.
private struct YouWritingStage: View {
    let kind: String
    let playing: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let live = playing && !reduceMotion
        TimelineView(.animation(minimumInterval: nil, paused: !live)) { tl in
            let t = live ? tl.date.timeIntervalSinceReferenceDate : -1
            stage(t)
        }
        .accessibilityHidden(true)
    }

    // Progress 0…1 through a loop of `period` seconds; nil when still.
    private func loop(_ t: Double, _ period: Double, delay: Double = 0) -> Double? {
        guard t >= 0 else { return nil }
        let x = (t - delay).truncatingRemainder(dividingBy: period)
        return (x < 0 ? x + period : x) / period
    }
    private func ease(_ x: Double) -> Double { 1 - pow(1 - min(max(x, 0), 1), 3) }
    private func lerp(_ p: Double, _ a: Double, _ b: Double) -> Double { min(max((p - a) / (b - a), 0), 1) }

    @ViewBuilder
    private func stage(_ t: Double) -> some View {
        switch kind {
        case "candid": candid(t)
        case "concise": concise(t)
        case "formal": formal(t)
        case "warm": warm(t)
        default: balanced(t)
        }
    }

    // Three even strokes, drawn in turn.
    private func balanced(_ t: Double) -> some View {
        GeometryReader { geo in
            VStack(alignment: .leading, spacing: 5) {
                ForEach(0..<3, id: \.self) { i in
                    let p = loop(t, 2.4, delay: Double(i) * 0.2)
                    Capsule().fill(FW.Palette.text3)
                        .frame(width: (geo.size.width - 36) * [0.78, 0.64, 0.70][i], height: 4)
                        .scaleEffect(x: p.map { $0 < 0.35 ? ease($0 / 0.35) : 1 } ?? 1, anchor: .leading)
                }
            }
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }

    // Says it with its chest, and the odd word gets bleeped.
    private func candid(_ t: Double) -> some View {
        let p = loop(t, 1.6)
        func shake(_ p: Double?) -> Double {
            guard let p else { return 0 }
            if p < 0.08 { return -1.5 * p / 0.08 }
            if p < 0.16 { return -1.5 + 3 * (p - 0.08) / 0.08 }
            if p < 0.24 { return 1.5 - 1.5 * (p - 0.16) / 0.08 }
            return 0
        }
        let bleep: Double = p.map { $0 < 0.3 ? 0 : $0 < 0.4 ? ease(($0 - 0.3) / 0.1) : $0 < 0.8 ? 1 : 1 - ease(($0 - 0.8) / 0.2) } ?? 0
        return ZStack(alignment: .topTrailing) {
            HStack(spacing: 5) {
                Text("!").font(.sans(22, .semibold)).foregroundStyle(FW.Palette.accent)
                    .rotationEffect(.degrees(-8))
                    .offset(x: shake(p))
                Text("real talk").font(.sans(16, .semibold)).foregroundStyle(FW.Palette.text)
                    .rotationEffect(.degrees(2))
                    .offset(x: shake(p.map { $0 - 0.05 }))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Text("#@%!")
                .font(.mono(10, .medium))
                .foregroundStyle(FW.Palette.onAccent)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(FW.Palette.accent, in: .rect(cornerRadius: 5))
                .rotationEffect(.degrees(9))
                .scaleEffect(bleep)
                .opacity(bleep > 0.01 ? 1 : 0)
                .padding(.top, 8)
                .padding(.trailing, 10)
        }
    }

    // A paragraph trims itself down to one line.
    private func concise(_ t: Double) -> some View {
        let p = loop(t, 2.8)
        // 0 = full paragraph, 1 = trimmed to one line.
        let k: Double = p.map { $0 < 0.25 ? 0 : $0 < 0.55 ? ease(lerp($0, 0.25, 0.55)) : $0 < 0.85 ? 1 : 1 - ease(lerp($0, 0.85, 1)) } ?? 0
        return GeometryReader { geo in
            let w = geo.size.width - 36
            VStack(alignment: .leading, spacing: 0) {
                Capsule().fill(FW.Palette.text)
                    .frame(width: w * (0.76 - 0.30 * k), height: 3 + 2 * k)
                ForEach(0..<3, id: \.self) { i in
                    Capsule().fill(FW.Palette.text3)
                        .frame(width: w * [0.76, 0.60, 0.42][i], height: 3 * (1 - k))
                        .scaleEffect(x: 1 - 0.8 * k, anchor: .leading)
                        .opacity(1 - k)
                        .padding(.top, 4 * (1 - k))
                }
            }
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }

    // A serif word, underlined by pen.
    private func formal(_ t: Double) -> some View {
        let p = loop(t, 2.6)
        let to: Double = p.map { $0 < 0.15 ? 0 : $0 < 0.5 ? ease(lerp($0, 0.15, 0.5)) : 1 } ?? 1
        let from: Double = p.map { $0 < 0.85 ? 0 : ease(lerp($0, 0.85, 1)) } ?? 0
        return VStack(spacing: 0) {
            Text("Thus,").font(.serif(24, italic: true)).foregroundStyle(FW.Palette.text)
            YouWritingPen()
                .trim(from: from, to: max(from, to))
                .stroke(FW.Palette.accent, style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
                .frame(width: 64, height: 10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // A slow breath.
    private func warm(_ t: Double) -> some View {
        let p = loop(t, 3.2)
        let breathe = p.map { 1 + 0.25 * (0.5 - 0.5 * cos($0 * 2 * .pi)) } ?? 1
        let ripple = p.map { $0 < 0.7 ? ease($0 / 0.7) : 1 }
        return ZStack {
            if let ripple {
                Circle().strokeBorder(FW.Palette.accent, lineWidth: 1.5)
                    .frame(width: 16, height: 16)
                    .scaleEffect(1 + 2.2 * ripple)
                    .opacity(0.6 * (1 - ripple))
            }
            Circle().fill(FW.Palette.accent).frame(width: 16, height: 16).scaleEffect(breathe)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct YouWritingPen: Shape {
    func path(in r: CGRect) -> Path {
        // M2 6 C 20 2, 40 9, 78 4 in an 80×10 box.
        let sx = r.width / 80, sy = r.height / 10
        var p = Path()
        p.move(to: CGPoint(x: 2 * sx, y: 6 * sy))
        p.addCurve(to: CGPoint(x: 78 * sx, y: 4 * sy), control1: CGPoint(x: 20 * sx, y: 2 * sy), control2: CGPoint(x: 40 * sx, y: 9 * sy))
        return p
    }
}

// MARK: - Practice voice

private let youVoiceGender: [String: String] = [
    "cedar": "man", "willow": "woman", "meridian": "man", "gleam": "woman", "vesper": "man", "stone": "man",
]

struct YouVoiceSheet: View {
    @Environment(Store.self) private var store
    var body: some View {
        SheetScaffold(title: "Practice voice", subtitle: "Who you talk to in practice conversations. You can still pick another for a single session.") {
            YouVoicePicker(value: store.prefs.voice) { id in store.setPrefs { $0.voice = id } }
        }
    }
}

// Every practice voice, each with a few seconds to hear it before choosing.
struct YouVoicePicker: View {
    let value: String
    let onChange: (String) -> Void
    @State private var player = YouVoiceSamplePlayer()

    var body: some View {
        VStack(spacing: 6) {
            ForEach(Voice.all) { v in
                let picked = v.id == value
                HStack(spacing: 6) {
                    Button {
                        Feedback.shared.play(.tap)
                        onChange(v.id)
                    } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                Circle().fill(picked ? FW.Palette.accent : .clear)
                                Circle().strokeBorder(picked ? .clear : FW.Palette.line3, lineWidth: 1.5)
                                if picked {
                                    Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(FW.Palette.onAccent)
                                }
                            }
                            .frame(width: 20, height: 20)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(v.label).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                                Text("\(v.note) · plays a \(youVoiceGender[v.id] ?? "man")")
                                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 8)
                        .frame(minHeight: 48)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(v.label), \(v.note)")
                    .accessibilityAddTraits(picked ? .isSelected : [])
                    Button { player.toggle(v.id) } label: {
                        Group {
                            if player.playing == v.id { YouVoiceBars() } else { Image(systemName: "play.fill").font(.system(size: 13)) }
                        }
                        .foregroundStyle(player.playing == v.id ? FW.Palette.text : FW.Palette.text2)
                        .frame(width: 40, height: 40)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(player.playing == v.id ? "Stop \(v.label)" : "Hear \(v.label)")
                }
                .padding(.leading, 4)
                .padding(.trailing, 6)
                .padding(.vertical, 4)
                .background(picked ? FW.Palette.raised : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(picked ? FW.Palette.line3 : FW.Palette.line, lineWidth: 1))
            }
        }
        .onDisappear { player.stop() }
    }
}

private struct YouVoiceBars: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: reduceMotion)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(0..<3, id: \.self) { i in
                    let phase = (t + Double(i) * 0.3) / 0.9 * 2 * .pi
                    RoundedRectangle(cornerRadius: 1.5)
                        .frame(width: 3, height: 14)
                        .scaleEffect(y: reduceMotion ? 0.7 : 0.675 - 0.325 * cos(phase), anchor: .bottom)
                }
            }
            .frame(height: 14)
        }
    }
}

@MainActor @Observable
final class YouVoiceSamplePlayer: NSObject, AVAudioPlayerDelegate {
    private(set) var playing: String?
    @ObservationIgnored private var player: AVAudioPlayer?

    func toggle(_ id: String) {
        player?.stop()
        if playing == id {
            playing = nil
            return
        }
        guard let url = Bundle.main.url(forResource: id, withExtension: "m4a"), let p = try? AVAudioPlayer(contentsOf: url) else {
            playing = nil
            return
        }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        p.delegate = self
        player = p
        playing = id
        p.play()
    }

    func stop() {
        player?.stop()
        player = nil
        finished()
    }

    // Back to the quiet, mixable session the app's sounds use.
    private func finished() {
        guard playing != nil else { return }
        playing = nil
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
    }

    nonisolated func audioPlayerDidFinishPlaying(_ p: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.finished() }
    }
    nonisolated func audioPlayerDecodeErrorDidOccur(_ p: AVAudioPlayer, error: Error?) {
        Task { @MainActor in self.finished() }
    }
}

// MARK: - Notifications

// The `settings:reminders` record (docs/API.md §4.3).
struct YouReminders {
    var enabled = false
    var travel = false
    var morning = "09:45"
    var followup = "10:30"
    var quietStart = "21:00"
    var quietEnd = "08:00"
    var raw: [String: JSON] = [:]

    init(_ data: JSON?) {
        raw = data?.object ?? [:]
        enabled = data?["enabled"]?.bool ?? false
        travel = data?["travel"]?.bool ?? false
        morning = data?["morning"]?.string ?? morning
        followup = data?["followup"]?.string ?? followup
        quietStart = data?["quietStart"]?.string ?? quietStart
        quietEnd = data?["quietEnd"]?.string ?? quietEnd
    }
    var on: Bool { enabled && !travel }
}

private struct YouNotifyKind {
    let key: WritableKeyPath<Prefs.Notify, Bool>
    let title: String
    let detail: String
    let time: String?
}

private var youNotifyKinds: [YouNotifyKind] { [
    .init(key: \.morning, title: "Session preview", detail: "What today’s session is about, on learning days.", time: "morning"),
    .init(key: \.nudge, title: "One nudge", detail: "Only if you haven’t started by then. Never more than one.", time: "followup"),
    .init(key: \.breaks, title: "Break’s over", detail: "When a break in a long session ends.", time: nil),
    .init(key: \.insights, title: "Weekly Insights", detail: "When last week’s read is ready, Monday morning.", time: nil),
    .init(key: \.week, title: "Next week’s draft", detail: "When next week is drafted and yours to shape, Sunday.", time: nil),
] }

func youNotifySummary(_ on: Bool, _ prefs: Prefs) -> String {
    guard on else { return "Off" }
    let n = prefs.notify
    let count = [n.morning, n.nudge, n.breaks, n.insights, n.week].filter { $0 }.count
    return count == 5 ? "All on" : count > 0 ? "\(count) of 5" : "None"
}

struct YouNotificationsSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @State private var on: Bool
    @State private var busy = false
    @State private var error: String?
    @State private var denied = false
    @State private var times: [String: String]
    @State private var pending: Task<Void, Never>?

    init(reminders: YouReminders) {
        _on = State(initialValue: reminders.on)
        _times = State(initialValue: [
            "morning": reminders.morning, "followup": reminders.followup,
            "quietStart": reminders.quietStart, "quietEnd": reminders.quietEnd,
        ])
    }

    var body: some View {
        SheetScaffold(title: "Notifications", subtitle: "Sent to this device. Nothing sensitive shows on the lock screen.") {
            YouSettingLine(title: "Allow notifications", detail: on ? "On for this device" : "Off for this device") {
                Toggle("Allow notifications", isOn: Binding(get: { on }, set: { v in Task { await toggle(v) } }))
                    .labelsHidden()
                    .disabled(busy)
            }
            if denied {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Notifications for Fieldwork are turned off in iOS Settings. Turn them on there, then come back.")
                        .font(.sans(14)).foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
                    }
                    .buttonStyle(.fw(.secondary, small: true))
                }
                .card(FW.Radius.base, fill: FW.Palette.surface, padding: 14)
            }
            if let error {
                Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 14) {
                Kicker("What to send")
                ForEach(youNotifyKinds, id: \.title) { k in
                    let enabled = store.prefs.notify[keyPath: k.key]
                    YouSettingLine(title: k.title, detail: k.detail) {
                        HStack(spacing: 10) {
                            if let slot = k.time {
                                timePicker(slot, label: "\(k.title) time").disabled(!enabled)
                            }
                            Toggle(k.title, isOn: Binding(
                                get: { store.prefs.notify[keyPath: k.key] },
                                set: { v in store.setPrefs { $0.notify[keyPath: k.key] = v } }
                            ))
                            .labelsHidden()
                        }
                    }
                }
            }
            .disabled(!on)
            .opacity(on ? 1 : 0.45)
            VStack(alignment: .leading, spacing: 10) {
                Kicker("Quiet hours")
                Text("Nothing is sent between these times, whatever else is on.")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 12) {
                    quiet("From", "quietStart")
                    quiet("Until", "quietEnd")
                }
            }
            .disabled(!on)
            .opacity(on ? 1 : 0.45)
        }
        .task { await checkPermission() }
        .onChange(of: scenePhase) { _, p in if p == .active { Task { await checkPermission() } } }
    }

    private func quiet(_ label: String, _ key: String) -> some View {
        HStack {
            Text(label).font(.sans(14)).foregroundStyle(FW.Palette.text2)
            Spacer(minLength: 4)
            timePicker(key, label: label)
        }
        .padding(.leading, 12)
        .padding(.trailing, 6)
        .frame(minHeight: 48)
        .frame(maxWidth: .infinity)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
    }

    private func timePicker(_ key: String, label: String) -> some View {
        DatePicker(label, selection: Binding(
            get: { PlanDate.time(times[key] ?? "09:00") ?? .now },
            set: { d in setTime(key, PlanDate.hm(d)) }
        ), displayedComponents: .hourAndMinute)
        .labelsHidden()
        .fixedSize()
    }

    private var current: [String: JSON] {
        store.record("settings:reminders")?["data"]?.object ?? [:]
    }

    private func save(_ patch: [String: JSON]) async {
        var data = current
        for (k, v) in times { data[k] = .string(v) }
        for (k, v) in patch { data[k] = v }
        await store.saveRecord(kind: "settings", id: "settings:reminders", data: data)
    }

    private func toggle(_ next: Bool) async {
        busy = true
        error = nil
        on = next
        defer { busy = false }
        if next {
            guard await Push.enable(ask: true) else {
                on = false
                denied = true
                return
            }
            denied = false
            await save(["enabled": .bool(true), "travel": .bool(false)])
        } else {
            await save(["enabled": .bool(false)])
        }
        if let e = store.error, e.hasPrefix("One change") { error = e }
    }

    // Times save a moment after the wheel settles, not on every tick.
    private func setTime(_ key: String, _ value: String) {
        guard times[key] != value else { return }
        times[key] = value
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            await save([:])
        }
    }

    private func checkPermission() async {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        denied = status == .denied
    }
}

// MARK: - Reading

private let youReadingSizes: [(String, String)] = [("s", "Small"), ("m", "Default"), ("l", "Large"), ("xl", "Largest")]

private let youFontInfo: [Face: (label: String, note: String, short: String)] = [
    .sans: ("Instrument Sans", "Clean and even", "Instrument Sans"),
    .serif: ("Newsreader", "A book serif", "Newsreader"),
    .hyperlegible: ("Atkinson Hyperlegible", "Designed for low vision", "Atkinson"),
    .dyslexic: ("OpenDyslexic", "Weighted letters for dyslexia", "OpenDyslexic"),
]

func youFontSummary(_ r: Prefs.Reading) -> String {
    var parts: [String] = []
    let short = { (f: Face) in youFontInfo[f]?.short ?? f.rawValue }
    if r.lessonFont == r.appFont, r.appFont != .sans {
        parts.append("\(short(r.appFont)) everywhere")
    } else {
        if r.lessonFont != .serif { parts.append("\(short(r.lessonFont)) in lessons") }
        if r.appFont != .sans { parts.append("\(short(r.appFont)) in the app") }
    }
    if r.size != "m", let label = youReadingSizes.first(where: { $0.0 == r.size })?.1 { parts.append("\(label) text") }
    return parts.isEmpty ? "Default" : parts.joined(separator: " · ")
}

struct YouReadingSheet: View {
    @Environment(Store.self) private var store

    var body: some View {
        let r = store.prefs.reading
        SheetScaffold(title: "Reading", subtitle: "Type for lessons and for everything else. Changes apply as you choose.") {
            preview(r)
            PlanField(label: "Lesson font", hint: "Used for everything you read and write inside a session.") {
                fontChoice(r.lessonFont, standard: .serif) { f in store.setPrefs { $0.reading.lessonFont = f } }
            }
            PlanField(label: "Lesson text size") {
                Segmented(options: youReadingSizes, selection: Binding(get: { store.prefs.reading.size }, set: { v in store.setPrefs { $0.reading.size = v } }))
            }
            PlanField(label: "Line length", hint: "Shorter lines are easier to track; longer ones fit more on screen.") {
                Segmented(options: [("narrow", "Shorter"), ("normal", "Default"), ("wide", "Longer")],
                          selection: Binding(get: { store.prefs.reading.width }, set: { v in store.setPrefs { $0.reading.width = v } }))
            }
            PlanField(label: "App font", hint: "Menus, pages and everything outside lessons.") {
                fontChoice(r.appFont, standard: .sans) { f in store.setPrefs { $0.reading.appFont = f } }
            }
        }
    }

    private func preview(_ r: Prefs.Reading) -> some View {
        let size = 17 * store.prefs.readScale
        let face = r.lessonFont
        return VStack(alignment: .leading, spacing: 10) {
            Kicker("Preview · a lesson")
            Text("A sale on credit is \(Text("profit").font(.fw(face, size, .semibold))) the day you make it, but it isn’t \(Text("cash").font(.fw(face, size, italic: true))) until the customer pays. That gap is where healthy businesses run out of money.")
                .font(.fw(face, size))
                .lineSpacing(size * 0.45)
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: r.width == "narrow" ? 290 : .infinity, alignment: .leading)
                .animation(.easeOut(duration: FW.Motion.base), value: size)
        }
        .padding(.top, 18)
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Preview")
    }

    private func fontChoice(_ value: Face, standard: Face, onChange: @escaping (Face) -> Void) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach([Face.sans, .serif, .hyperlegible, .dyslexic], id: \.self) { f in
                let on = f == value
                let info = youFontInfo[f]!
                Button {
                    Feedback.shared.play(.tap)
                    onChange(f)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Aa").font(.fw(f, f == .dyslexic ? 22 : 26)).foregroundStyle(FW.Palette.text)
                            .padding(.bottom, 4)
                        Text(info.label).font(.fw(f, f == .dyslexic ? 13 : 14, .medium)).foregroundStyle(FW.Palette.text)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(info.note + (f == standard ? " · default" : ""))
                            .font(.sans(12)).foregroundStyle(FW.Palette.text3)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .background(on ? FW.Palette.raised : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(on ? FW.Palette.text : FW.Palette.line, lineWidth: on ? 1.5 : 1))
                    .contentShape(.rect(cornerRadius: FW.Radius.base))
                }
                .buttonStyle(YouPressStyle())
                .accessibilityLabel("\(info.label), \(info.note)")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

// MARK: - Game elements

private struct YouGameItem {
    let key: WritableKeyPath<Prefs.Game, Bool>
    let title: String
    let detail: String
}

private var youGameItems: [YouGameItem] { [
    .init(key: \.xp, title: "XP and levels", detail: "Points for answers and sessions, and the level they add up to."),
    .init(key: \.streak, title: "Streak", detail: "How many learning days or weeks in a row. Planned time off never breaks it."),
    .init(key: \.quests, title: "Daily quests", detail: "Three small goals a day, with a bonus for all three."),
    .init(key: \.pops, title: "In-session celebrations", detail: "“+XP” and “3 in a row” as answers are marked."),
] }

func youGameSummary(_ p: Prefs) -> String {
    let on = youGameItems.filter { p.game[keyPath: $0.key] }.count
    return on == youGameItems.count ? "All on" : on == 0 ? "All off" : "\(on) of \(youGameItems.count)"
}

struct YouGameSheet: View {
    @Environment(Store.self) private var store
    var body: some View {
        SheetScaffold(title: "Game elements", subtitle: "Optional extras. Your learning, memory and progress work the same with all of them off.") {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(youGameItems, id: \.title) { g in
                    YouSettingLine(title: g.title, detail: g.detail) {
                        Toggle(g.title, isOn: Binding(
                            get: { store.prefs.game[keyPath: g.key] },
                            set: { v in store.setPrefs { $0.game[keyPath: g.key] = v } }
                        ))
                        .labelsHidden()
                        .disabled(g.title == "In-session celebrations" && !store.prefs.game.xp)
                    }
                }
            }
        }
    }
}

// MARK: - Your plan

struct YouPlanSheet: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let plan = store.decodedPlan
        SheetScaffold(title: "Your plan", subtitle: plan?.title ?? "No plan imported yet.") {
            VStack(spacing: 8) {
                Button {
                    dismiss()
                    router.push(.importPlan, on: .you)
                } label: {
                    youActionLabel(plan != nil ? "Import a new plan" : "Import a plan", icon: "square.and.arrow.down")
                }
                .buttonStyle(.fw(.primary, wide: true))
                if let json = store.plan {
                    ShareLink(item: SharedJSONFile(name: "fieldwork-plan.json", json: json), preview: SharePreview("fieldwork-plan.json")) {
                        youActionLabel("Export this plan", icon: "arrow.down.to.line")
                    }
                    .buttonStyle(.fw(.secondary, wide: true))
                } else {
                    Button {} label: { youActionLabel("Export this plan", icon: "arrow.down.to.line") }
                        .buttonStyle(.fw(.secondary, wide: true))
                        .disabled(true)
                }
                ShareLink(
                    item: SharedJSONFile(name: "fieldwork-progress.json", json: .object([
                        "attempts": store.state["attempts"] ?? .array([]),
                        "records": store.state["records"] ?? .array([]),
                    ])),
                    preview: SharePreview("fieldwork-progress.json")
                ) {
                    youActionLabel("Export progress", icon: "arrow.down.to.line")
                }
                .buttonStyle(.fw(.secondary, wide: true))
            }
        }
    }
}

func youActionLabel(_ title: String, icon: String) -> some View {
    HStack(spacing: 10) {
        Image(systemName: icon).font(.system(size: 15, weight: .medium)).frame(width: 20)
        Text(title)
        Spacer(minLength: 0)
    }
}

// MARK: - Sign-in

struct YouSignInSheet: View {
    let email: String?
    @State private var list: [Passkeys.Listed]?
    @State private var available = false
    @State private var loading = true
    @State private var message: String?
    @State private var adding = false
    @State private var removing: Passkeys.Listed?

    var body: some View {
        SheetScaffold(title: "Sign-in", subtitle: email) {
            if loading {
                SkeletonLines(count: 2)
            } else if available {
                passkeys
            }
            if let message, !available {
                Text(message).font(.sans(14)).foregroundStyle(FW.Palette.text2).fixedSize(horizontal: false, vertical: true)
            }
            Text("Without a passkey, you sign in with a code sent to your email.")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { await refresh() }
        .confirmationDialog("Remove this passkey?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                if let k = removing { Task { await remove(k) } }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var passkeys: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Passkeys").font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
                Text(list?.isEmpty == false ? "Sign in with Face ID, Touch ID or your password manager." : "Skip the email link next time.")
                    .font(.sans(14)).foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let list, !list.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, k in
                        if i > 0 { Rule() }
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(k.friendly_name.flatMap { $0.isEmpty ? nil : $0 } ?? "Passkey")
                                    .font(.sans(15)).foregroundStyle(FW.Palette.text)
                                    .lineLimit(1)
                                Text(k.last_used_at.map { "Used " + day($0) } ?? "Added " + day(k.created_at))
                                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Button("Remove") { removing = k }
                                .font(.sans(14, .medium))
                                .foregroundStyle(FW.Palette.text2)
                                .buttonStyle(.plain)
                                .frame(minHeight: 44)
                        }
                        .padding(.vertical, 6)
                    }
                }
            }
            if let message {
                Text(message).font(.sans(14)).foregroundStyle(FW.Palette.text2).fixedSize(horizontal: false, vertical: true)
            }
            Button { Task { await add() } } label: {
                HStack(spacing: 8) {
                    if adding { ProgressView().controlSize(.small) }
                    Text("Add a passkey")
                }
            }
            .buttonStyle(.fw(.secondary))
            .disabled(adding)
        }
        .card(FW.Radius.lg, fill: FW.Palette.surface, padding: 16)
    }

    private func day(_ s: String) -> String {
        Stamp.parse(s)?.formatted(date: .numeric, time: .omitted) ?? ""
    }

    private func refresh() async {
        defer { loading = false }
        do {
            list = try await Passkeys.shared.list()
            available = true
        } catch {
            // Not switched on for the project yet: hide the feature quietly.
            available = false
            let m = error.localizedDescription
            if !m.contains("switched on") { message = m }
        }
    }

    private func add() async {
        message = nil
        adding = true
        defer { adding = false }
        do {
            if try await Passkeys.shared.register() == .done { await refresh() }
        } catch {
            message = error.localizedDescription.lowercased().contains("exist")
                ? "This device already has a passkey for your account."
                : "The passkey wasn’t added. Try again."
        }
    }

    private func remove(_ k: Passkeys.Listed) async {
        do {
            try await Passkeys.shared.delete(k.id)
        } catch {
            message = error.localizedDescription
        }
        await refresh()
    }
}

// MARK: - AI cost

struct YouUsage: Decodable, Sendable {
    struct Tier: Decodable, Sendable {
        var calls: Int
        var usd: Double
        private enum K: String, CodingKey { case calls, usd }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: K.self)
            calls = Int(c.lenient(Double.self, .calls) ?? 0)
            usd = c.lenient(Double.self, .usd) ?? 0
        }
    }
    var total: Double
    var byTier: [String: Tier]
    var cacheRate: Double
    var models: [String: String]

    private enum K: String, CodingKey { case total, byTier, cacheRate, models }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        total = c.lenient(Double.self, .total) ?? 0
        byTier = c.lenient([String: Tier].self, .byTier) ?? [:]
        cacheRate = c.lenient(Double.self, .cacheRate) ?? 0
        models = c.lenient([String: String].self, .models) ?? [:]
    }
    var calls: Int { byTier.values.reduce(0) { $0 + $1.calls } }
}

func youDollars(_ v: Double) -> String { "$" + String(format: "%.2f", v) }

struct YouUsageSheet: View {
    let usage: YouUsage

    var body: some View {
        SheetScaffold(title: "AI cost this month", subtitle: "Unmetered. Shown so there are no surprises.") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 24, alignment: .topLeading), GridItem(.flexible(), alignment: .topLeading)], alignment: .leading, spacing: 18) {
                stat(youDollars(usage.total), "total")
                ForEach(["fast", "primary", "reasoning", "voice"], id: \.self) { t in
                    if let tier = usage.byTier[t] {
                        stat(youDollars(tier.usd), "\(t == "voice" ? "Voice" : usage.models[t] ?? t) · \(tier.calls) calls")
                    }
                }
            }
            if usage.cacheRate > 0 {
                Text("\(Int((usage.cacheRate * 100).rounded()))% of prompt tokens served from cache.")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.display(28)).monospacedDigit().foregroundStyle(FW.Palette.text)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Data & privacy

struct YouDataSheet: View {
    @State private var busy = false
    @State private var deleting = false

    var body: some View {
        SheetScaffold(title: "Data & privacy", subtitle: "Everything is yours to take or remove.") {
            VStack(spacing: 8) {
                Button { Task { await exportAll() } } label: {
                    HStack(spacing: 10) {
                        Group {
                            if busy { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.down.to.line").font(.system(size: 15, weight: .medium)) }
                        }
                        .frame(width: 20)
                        Text("Export all account data")
                        Spacer(minLength: 0)
                    }
                }
                .buttonStyle(.fw(.secondary, wide: true))
                .disabled(busy)
                Button { deleting = true } label: { youActionLabel("Delete my account", icon: "trash") }
                    .buttonStyle(YouDangerStyle())
            }
        }
        .sheet(isPresented: $deleting) {
            YouDeleteAccountSheet()
                .presentationDetents([.medium, .large])
        }
    }

    private func exportAll() async {
        busy = true
        defer { busy = false }
        do {
            let req = try await API.request("/api/export", method: "GET", body: nil)
            let (data, response) = try await API.session.data(for: req)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else { throw API.failure(data, status: status) }
            let url = URL.temporaryDirectory.appending(path: "fieldwork-account.json")
            try data.write(to: url, options: .atomic)
            YouShare.present(url) { completed in
                if completed { Toasts.shared.show("Account export downloaded.") }
            }
        } catch is CancellationError {
        } catch let e as APIError {
            Toasts.shared.show(e.message)
        } catch {
            Toasts.shared.show(API.reachability(error, fallback: "Couldn’t reach the server. Try again.").message)
        }
    }
}

private struct YouDeleteAccountSheet: View {
    @Environment(Store.self) private var store
    @Environment(Auth.self) private var auth
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        SheetScaffold(title: "Delete your account?") {
            Text("This removes your plans, progress, memories and private files. Export anything you want to keep first.")
                .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 8) {
                Text("Type DELETE MY ACCOUNT").font(.sans(14, .medium)).foregroundStyle(FW.Palette.text2)
                TextField("", text: $confirm)
                    .font(.sans(16))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 14)
                    .frame(minHeight: 46)
                    .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line, lineWidth: 1))
                    .accessibilityLabel("Type DELETE MY ACCOUNT")
            }
            Button { Task { await deleteAccount() } } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().controlSize(.small) }
                    Text("Permanently delete account")
                }
            }
            .buttonStyle(YouDangerStyle())
            .disabled(confirm != "DELETE MY ACCOUNT" || busy)
            if let error {
                Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func deleteAccount() async {
        error = nil
        busy = true
        defer { busy = false }
        do {
            try await API.delete("/api/account", ["confirm": confirm])
            await Push.unregister()
            store.signOut()
            await auth.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
