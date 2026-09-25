import AVFoundation
import CoreTransferable
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import UserNotifications

// Settings sheets (src/components/you/sheets.tsx, writing.tsx, settings.tsx,
// passkeys.tsx): teaching style, writing, voice, sessions, notifications,
// reading, game elements, your plan, sign-in, AI cost and deleting the
// account. Choices are cards with a picture of what they do; the fine print
// sits in a footnote at the bottom.

// MARK: - Shared pieces

// Grouped rows on a sheet (GroupCard sits on the raised surface the sheet
// already uses, so sheets group on the surface a step down).
struct YouSheetCard<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: content()) { rows in
                ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                    row
                    if i < rows.count - 1 {
                        Rectangle().fill(FW.Palette.line).frame(height: 1).padding(.leading, 50)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
    }
}

// A small label over a group of choices on a sheet.
struct YouSheetLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Kicker(text).padding(.leading, 4).padding(.bottom, -8).accessibilityAddTraits(.isHeader)
    }
}

// The fine print, kept to the bottom of a sheet.
struct YouFootnote: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .font(.sans(13))
            .foregroundStyle(FW.Palette.text3)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 4)
            .padding(.top, 4)
    }
}

// A choice as a card: tinted and outlined in the accent with a check when
// it's the one picked.
struct YouChoice<Label: View>: View {
    let selected: Bool
    var radius: CGFloat = FW.Radius.base
    // Small chips rely on the outline alone.
    var check = true
    let action: () -> Void
    @ViewBuilder var label: () -> Label

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        Button {
            Feedback.shared.play(.tap)
            withAnimation(Springs.snappy) { action() }
        } label: {
            label()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(FW.Palette.surface, in: shape)
                .overlay { shape.fill(FW.Palette.accent.opacity(selected ? 0.07 : 0)) }
                .overlay { shape.strokeBorder(selected ? FW.Palette.accent : FW.Palette.line, lineWidth: selected ? 2 : 1) }
                .overlay(alignment: .topTrailing) {
                    if selected && check {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(FW.Palette.onAccent, FW.Palette.accent)
                            .padding(8)
                            .transition(.scale(0.4).combined(with: .opacity))
                    }
                }
                .contentShape(shape)
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .animation(Springs.bouncy, value: selected)
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

// Everything in the account as one JSON file, handed to the share sheet.
@MainActor
enum YouExport {
    static func all() async {
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

// MARK: - Teaching style

private func youBand(_ x: Double, _ lo: String, _ mid: String, _ hi: String) -> String { x < 0.35 ? lo : x > 0.65 ? hi : mid }

private struct YouStyleAxis {
    let name: String, left: String, right: String
    let icon: String
    let color: Color
    let value: KeyPath<MemStyle, Double>
    let means: (Double) -> String
}

private var youStyleAxes: [YouStyleAxis] { [
    .init(name: "Depth", left: "Brief", right: "Thorough", icon: "text.alignleft", color: FW.Palette.review, value: \.depth) { x in
        "Replies of about \(Int(((50 + x * 140) / 10).rounded()) * 10) words"
    },
    .init(name: "Challenge", left: "Gentle", right: "Stretching", icon: "mountain.2.fill", color: FW.Palette.coral, value: \.challenge) { x in
        youBand(x, "Small steps that build confidence", "A steady pace", "Pushes harder and skips the obvious")
    },
    .init(name: "Visuals", left: "Words", right: "Pictures", icon: "chart.bar.xaxis", color: FW.Palette.finance, value: \.visual) { x in
        youBand(x, "Diagrams only when essential", "Diagrams when they clarify", "Diagrams and charts often")
    },
    .init(name: "Questions", left: "Explain", right: "Ask me", icon: "questionmark.bubble.fill", color: FW.Palette.judgment, value: \.questions) { x in
        youBand(x, "Explains clearly before asking", "A balance of explaining and asking", "Asks you first, then explains")
    },
    .init(name: "Examples", left: "Abstract", right: "Concrete", icon: "lightbulb.fill", color: FW.Palette.caution, value: \.examples) { x in
        youBand(x, "Comfortable with abstract framing", "A mix of framing and examples", "Always anchored in a concrete example")
    },
] }

// Each axis as a dial between two ends, with what its position means in
// practice. The style is inferred from what the learner does and moves
// slowly on purpose.
struct YouStyleSheet: View {
    let style: MemStyle?

    var body: some View {
        let s = style.flatMap { $0.observations > 0 ? $0 : nil }
        SheetScaffold(title: "Teaching style", subtitle: "How your tutor writes for you, learned from what you do.") {
            if let s {
                YouSheetCard {
                    ForEach(Array(youStyleAxes.enumerated()), id: \.element.name) { i, a in
                        YouStyleAxisRow(axis: a, x: s[keyPath: a.value], index: i)
                    }
                }
            } else {
                YouEmpty(icon: "sparkles", color: FW.Palette.judgment, title: "Nothing learned yet", line: "After a few sessions, this shows how your tutor has adapted.")
            }
            YouFootnote((s.map { "Learned from \($0.observations) moments. " } ?? "")
                + "Asking for “simpler”, “go deeper”, an example or a picture moves these, and one session can’t swing them. Forget everything in Memory resets them.")
        }
    }
}

private struct YouStyleAxisRow: View {
    let axis: YouStyleAxis
    let x: Double
    let index: Int
    @State private var shown = 0.5
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            IconBadge(systemName: axis.icon, color: axis.color, size: 36)
            VStack(alignment: .leading, spacing: 8) {
                Text(axis.name).font(.sans(16, .semibold)).foregroundStyle(FW.Palette.text)
                HStack(spacing: 10) {
                    Text(axis.left).font(.sans(12, .medium)).foregroundStyle(FW.Palette.text3)
                        .lineLimit(1).minimumScaleFactor(0.8).frame(width: 62, alignment: .leading)
                    GeometryReader { geo in
                        let w = geo.size.width
                        ZStack(alignment: .leading) {
                            Capsule().fill(FW.Palette.surface3).frame(height: 6)
                            Capsule().fill(axis.color.opacity(0.35))
                                .frame(width: max(6, w * min(max(shown, 0), 1)), height: 6)
                            Circle().fill(axis.color)
                                .frame(width: 16, height: 16)
                                .overlay(Circle().strokeBorder(FW.Palette.surface, lineWidth: 3))
                                .shadow(color: axis.color.opacity(0.45), radius: 4)
                                .offset(x: w * min(max(shown, 0), 1) - 8)
                        }
                        .frame(maxHeight: .infinity)
                    }
                    .frame(height: 16)
                    Text(axis.right).font(.sans(12, .medium)).foregroundStyle(FW.Palette.text3)
                        .lineLimit(1).minimumScaleFactor(0.8).frame(width: 62, alignment: .trailing)
                }
                .accessibilityElement()
                .accessibilityLabel("\(axis.name): \(axis.left) to \(axis.right)")
                .accessibilityValue("\(Int((x * 100).rounded())) percent")
                Text(axis.means(x)).font(.sans(13)).foregroundStyle(FW.Palette.text2)
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
        }
        .padding(.vertical, 14)
        .onAppear {
            if reduceMotion { shown = x } else {
                withAnimation(Springs.bouncy.delay(0.15 + Double(index) * 0.06)) { shown = x }
            }
        }
    }
}

// An empty state: a big glyph, a title and one line.
struct YouEmpty: View {
    let icon: String
    var color: Color = FW.Palette.text2
    let title: String
    let line: String
    var body: some View {
        VStack(spacing: 12) {
            IconBadge(systemName: icon, color: color, size: 56, circle: true)
            VStack(spacing: 4) {
                Text(title).font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                Text(line).font(.sans(14)).foregroundStyle(FW.Palette.text3).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .padding(.horizontal, 16)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
    }
}

// MARK: - Writing style

struct YouWritingSheet: View {
    @Environment(Store.self) private var store

    var body: some View {
        SheetScaffold(title: "Writing style", subtitle: "Changes the tone and length, never what’s true.") {
            YouWritingPicker(value: store.prefs.writing) { id in store.setPrefs { $0.writing = id } }
        }
    }
}

// A sample of how the chosen style sounds, then the five styles as cards,
// each with a small stage that shows its character in motion (the chosen one
// plays).
struct YouWritingPicker: View {
    let value: String
    let onChange: (String) -> Void
    @Environment(Store.self) private var store

    var body: some View {
        let all = Writing.all
        let current = all.first { $0.id == value } ?? all[0]
        VStack(alignment: .leading, spacing: 18) {
            sample(current)
            VStack(spacing: 10) {
                if let first = all.first { card(first) }
                ForEach(Array(stride(from: 1, to: all.count, by: 2)), id: \.self) { i in
                    HStack(alignment: .top, spacing: 10) {
                        card(all[i])
                        if i + 1 < all.count { card(all[i + 1]) } else { Color.clear }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Writing style")
        }
    }

    // How the tutor sounds, in the face lessons are read in.
    private func sample(_ w: Writing) -> some View {
        let face = store.prefs.reading.lessonFont
        return HStack(alignment: .top, spacing: 10) {
            Aperture(size: 26)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 6) {
                Text("Sounds like").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
                Text(w.sample)
                    .font(.fw(face, 16))
                    .lineSpacing(4)
                    .foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .id(w.id)
                    .transition(.blurReplace)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.surface, in: UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: 18, style: .continuous))
        }
        .animation(Springs.smooth, value: w.id)
        .accessibilityElement(children: .combine)
    }

    private func card(_ w: Writing) -> some View {
        let on = w.id == value
        return YouChoice(selected: on) { onChange(w.id) } label: {
            VStack(alignment: .leading, spacing: 2) {
                YouWritingStage(kind: w.id, playing: on)
                    .frame(height: 58)
                    .frame(maxWidth: .infinity)
                    .background(FW.Palette.bg, in: .rect(cornerRadius: 10))
                    .clipShape(.rect(cornerRadius: 10))
                Text(w.label).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
                    .padding(.top, 10)
                Text(w.note).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
            .padding(10)
            .padding(.bottom, 2)
        }
        .accessibilityLabel("\(w.label), \(w.note)")
    }
}

// The web's .btn.danger: a quiet red tint, dimmed as a whole when disabled.
struct YouDangerStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(16, .semibold))
            .padding(.horizontal, 18)
            .frame(minHeight: 52)
            .frame(maxWidth: .infinity)
            .foregroundStyle(FW.Palette.negative)
            .background(FW.Palette.negative.opacity(configuration.isPressed ? 0.22 : 0.14), in: .capsule)
            .opacity(enabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(configuration.isPressed ? .snappy(duration: 0.16) : Springs.bouncy, value: configuration.isPressed)
            .contentShape(.capsule)
    }
}

// Kept for other screens' cards; new cards use `.pressable`.
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

    // A serif word, underlined by pen. (The serif is the point: it's what
    // "formal" looks like on the page.)
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

private func youVoiceColor(_ id: String) -> Color {
    switch id {
    case "cedar": FW.Palette.finance
    case "willow": FW.Palette.coral
    case "meridian": FW.Palette.review
    case "gleam": FW.Palette.caution
    case "vesper": FW.Palette.judgment
    default: FW.Palette.communication
    }
}

struct YouVoiceSheet: View {
    @Environment(Store.self) private var store
    var body: some View {
        SheetScaffold(title: "Practice voice", subtitle: "Who you talk to in practice conversations.") {
            YouVoicePicker(value: store.prefs.voice) { id in store.setPrefs { $0.voice = id } }
            YouFootnote("You can still pick another voice for a single session.")
        }
    }
}

// Every practice voice, each with a few seconds to hear it before choosing.
struct YouVoicePicker: View {
    let value: String
    let onChange: (String) -> Void
    @State private var player = YouVoiceSamplePlayer()

    var body: some View {
        YouSheetCard {
            ForEach(Voice.all) { v in row(v) }
        }
        .onDisappear { player.stop() }
    }

    private func row(_ v: Voice) -> some View {
        let picked = v.id == value
        let playing = player.playing == v.id
        let color = youVoiceColor(v.id)
        return HStack(spacing: 12) {
            Button {
                Feedback.shared.play(.tap)
                withAnimation(Springs.snappy) { onChange(v.id) }
            } label: {
                HStack(spacing: 12) {
                    Text(String(v.label.prefix(1)))
                        .font(.rounded(17))
                        .foregroundStyle(color)
                        .frame(width: 38, height: 38)
                        .background(color.opacity(0.16), in: .circle)
                        .overlay(Circle().strokeBorder(color, lineWidth: picked ? 2 : 0))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(v.label).font(.sans(16, .medium)).foregroundStyle(FW.Palette.text)
                        Text("\(v.note) · \(youVoiceGender[v.id] ?? "man")")
                            .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            .lineLimit(1).minimumScaleFactor(0.85)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: picked ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 22))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(picked ? FW.Palette.onAccent : FW.Palette.line3, picked ? FW.Palette.accent : FW.Palette.line3)
                        .contentTransition(.symbolEffect(.replace))
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(v.label), \(v.note)")
            .accessibilityAddTraits(picked ? .isSelected : [])
            Button { player.toggle(v.id) } label: {
                Group {
                    if playing { YouVoiceBars() } else { Image(systemName: "play.fill").font(.system(size: 13, weight: .semibold)) }
                }
                .foregroundStyle(playing ? FW.Palette.onAccent : FW.Palette.text)
                .frame(width: 36, height: 36)
                .background(playing ? FW.Palette.accent : FW.Palette.surface3, in: .circle)
                .contentShape(.circle)
            }
            .buttonStyle(.pressable(0.9))
            .accessibilityLabel(playing ? "Stop \(v.label)" : "Hear \(v.label)")
        }
        .padding(.vertical, 11)
        .frame(minHeight: 60)
        .animation(Springs.snappy, value: playing)
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

// MARK: - Sessions

// How each lesson runs: the three in-session aids and breaks.
struct YouSessionsSheet: View {
    @Environment(Store.self) private var store

    var body: some View {
        let s = store.prefs.session
        SheetScaffold(title: "Sessions", subtitle: "How each lesson runs.") {
            YouSheetCard {
                aid("Familiarity check", "Skips what you already know", "hand.raised.fill", FW.Palette.review, \.familiarity, s.familiarity)
                aid("Confidence rating", "Say how sure you are", "gauge.with.dots.needle.50percent", FW.Palette.judgment, \.confidence, s.confidence)
                aid("“I don’t know yet”", "Be taught instead of guessing", "lightbulb.fill", FW.Palette.caution, \.dontKnow, s.dontKnow)
            }
            YouSheetLabel("Breaks")
            HStack(spacing: 10) {
                breakChoice(0, "Off", "pause.circle")
                breakChoice(5, "5 min", "cup.and.saucer.fill")
                breakChoice(10, "10 min", "figure.walk")
            }
            .fixedSize(horizontal: false, vertical: true)
            YouFootnote("Breaks come about every 50 minutes in sessions of an hour or more. Changes apply from the next session you start.")
        }
    }

    private func aid(_ title: String, _ caption: String, _ icon: String, _ color: Color, _ key: WritableKeyPath<Prefs.Session, Bool>, _ on: Bool) -> some View {
        GroupRow(icon: icon, title: title, caption: caption, color: color) {
            Toggle(title, isOn: Binding(get: { on }, set: { v in store.setPrefs { $0.session[keyPath: key] = v } }))
                .labelsHidden()
        }
    }

    private func breakChoice(_ minutes: Int, _ label: String, _ icon: String) -> some View {
        let on = store.prefs.session.breaks == minutes
        return YouChoice(selected: on, check: false) { store.setPrefs { $0.session.breaks = minutes } } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(on ? FW.Palette.text : FW.Palette.text3)
                    .symbolEffect(.bounce, value: on)
                Text(label).font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        }
        .accessibilityLabel("Breaks: \(label)")
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
    let icon: String
    let color: Color
}

private var youNotifyKinds: [YouNotifyKind] { [
    .init(key: \.morning, title: "Session preview", detail: "What today’s session is about", icon: "sun.horizon.fill", color: FW.Palette.caution),
    .init(key: \.nudge, title: "One nudge", detail: "Only if you haven’t started", icon: "hand.wave.fill", color: FW.Palette.coral),
    .init(key: \.breaks, title: "Break’s over", detail: "When a break in a session ends", icon: "cup.and.saucer.fill", color: FW.Palette.communication),
    .init(key: \.insights, title: "Weekly Insights", detail: "Monday morning", icon: "chart.bar.fill", color: FW.Palette.review),
    .init(key: \.week, title: "Next week’s draft", detail: "Sunday, yours to shape", icon: "calendar.badge.clock", color: FW.Palette.finance),
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
        let n = store.prefs.notify
        SheetScaffold(title: "Notifications", subtitle: "Sent to this device.") {
            YouSheetCard {
                GroupRow(icon: on ? "bell.badge.fill" : "bell.slash.fill", title: "Allow notifications",
                         caption: on ? "On for this device" : "Off for this device", color: on ? FW.Palette.coral : FW.Palette.text3) {
                    Toggle("Allow notifications", isOn: Binding(get: { on }, set: { v in Task { await toggle(v) } }))
                        .labelsHidden()
                        .disabled(busy)
                }
            }
            if denied {
                HStack(spacing: 12) {
                    IconBadge(systemName: "exclamationmark.triangle.fill", color: FW.Palette.caution, size: 36)
                    Text("Off in iOS Settings")
                        .font(.sans(14, .medium)).foregroundStyle(FW.Palette.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
                    }
                    .buttonStyle(.fw(.secondary, small: true))
                }
                .padding(12)
                .background(FW.Palette.caution.opacity(0.1), in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                .transition(.opacity.combined(with: .scale(0.96)))
            }
            if let error {
                Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true)
            }
            Group {
                YouSheetLabel("What to send")
                YouSheetCard {
                    ForEach(youNotifyKinds, id: \.title) { k in
                        GroupRow(icon: k.icon, title: k.title, caption: k.detail, color: k.color) {
                            Toggle(k.title, isOn: Binding(
                                get: { store.prefs.notify[keyPath: k.key] },
                                set: { v in store.setPrefs { $0.notify[keyPath: k.key] = v } }
                            ))
                            .labelsHidden()
                        }
                    }
                }
                YouSheetLabel("Times")
                YouSheetCard {
                    timeRow("Session preview", "sun.horizon.fill", FW.Palette.caution, "morning").disabled(!n.morning).opacity(n.morning ? 1 : 0.5)
                    timeRow("Nudge", "hand.wave.fill", FW.Palette.coral, "followup").disabled(!n.nudge).opacity(n.nudge ? 1 : 0.5)
                    timeRow("Quiet from", "moon.zzz.fill", FW.Palette.judgment, "quietStart")
                    timeRow("Quiet until", "sunrise.fill", FW.Palette.review, "quietEnd")
                }
            }
            .disabled(!on)
            .opacity(on ? 1 : 0.45)
            YouFootnote("Nothing is sent during quiet hours, whatever else is on, and nothing sensitive shows on the lock screen.")
        }
        .animation(Springs.snappy, value: on)
        .animation(Springs.snappy, value: denied)
        .task { await checkPermission() }
        .onChange(of: scenePhase) { _, p in if p == .active { Task { await checkPermission() } } }
    }

    private func timeRow(_ title: String, _ icon: String, _ color: Color, _ key: String) -> some View {
        GroupRow(icon: icon, title: title, color: color) {
            timePicker(key, label: title)
        }
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

// "Sans" is the system face on iPhone (Instrument Sans on the web).
private let youFontInfo: [Face: (label: String, note: String, short: String)] = [
    .sans: ("Sans", "Clean and even", "Sans"),
    .serif: ("Newsreader", "A book serif", "Newsreader"),
    .hyperlegible: ("Atkinson Hyperlegible", "For low vision", "Atkinson"),
    .dyslexic: ("OpenDyslexic", "For dyslexia", "OpenDyslexic"),
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
        SheetScaffold(title: "Reading", subtitle: "Type for lessons and for everything else.") {
            preview(r)
            YouSheetLabel("Lesson font")
            fontChoice(r.lessonFont, standard: .serif) { f in store.setPrefs { $0.reading.lessonFont = f } }
            YouSheetLabel("Lesson text size")
            HStack(spacing: 8) {
                ForEach(Array(youReadingSizes.enumerated()), id: \.element.0) { i, s in
                    YouChoice(selected: r.size == s.0, check: false) { store.setPrefs { $0.reading.size = s.0 } } label: {
                        VStack(spacing: 6) {
                            Text("A").font(.fw(r.lessonFont, [14, 17, 20, 23][i], .medium)).foregroundStyle(FW.Palette.text)
                                .frame(height: 28, alignment: .bottom)
                            Text(s.1).font(.sans(12, .medium)).foregroundStyle(FW.Palette.text2).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .accessibilityLabel("Text size: \(s.1)")
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            YouSheetLabel("Line length")
            HStack(spacing: 8) {
                ForEach([("narrow", "Shorter", 0.5), ("normal", "Default", 0.72), ("wide", "Longer", 0.94)], id: \.0) { w in
                    YouChoice(selected: r.width == w.0, check: false) { store.setPrefs { $0.reading.width = w.0 } } label: {
                        VStack(spacing: 10) {
                            YouLinesGlyph(width: w.2)
                                .frame(height: 22)
                            Text(w.1).font(.sans(12, .medium)).foregroundStyle(FW.Palette.text2)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .padding(.horizontal, 14)
                    }
                    .accessibilityLabel("Line length: \(w.1)")
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            YouSheetLabel("App font")
            fontChoice(r.appFont, standard: .sans) { f in store.setPrefs { $0.reading.appFont = f } }
            YouFootnote("The lesson font is used for everything you read and write in a session; the app font for menus and pages. Shorter lines are easier to track.")
        }
    }

    private func preview(_ r: Prefs.Reading) -> some View {
        let size = 17 * store.prefs.readScale
        let face = r.lessonFont
        return VStack(alignment: .leading, spacing: 10) {
            Label("A lesson", systemImage: "book.pages").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
            Text("A sale on credit is \(Text("profit").font(.fw(face, size, .semibold))) the day you make it, but it isn’t \(Text("cash").font(.fw(face, size, italic: true))) until the customer pays. That gap is where healthy businesses run out of money.")
                .font(.fw(face, size))
                .lineSpacing(size * 0.45)
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: r.width == "narrow" ? 250 : r.width == "normal" ? 300 : .infinity, alignment: .leading)
                .animation(Springs.smooth, value: size)
                .animation(Springs.smooth, value: r.width)
                .animation(.easeOut(duration: FW.Motion.base), value: face)
        }
        .padding(.top, 16)
        .padding(.horizontal, 18)
        .padding(.bottom, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Preview")
    }

    private func fontChoice(_ value: Face, standard: Face, onChange: @escaping (Face) -> Void) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach([Face.sans, .serif, .hyperlegible, .dyslexic], id: \.self) { f in
                let info = youFontInfo[f]!
                YouChoice(selected: f == value) { onChange(f) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Aa").font(.fw(f, f == .dyslexic ? 24 : 28)).foregroundStyle(FW.Palette.text)
                            .frame(height: 36, alignment: .bottomLeading)
                            .padding(.bottom, 4)
                        Text(info.label).font(.fw(f, f == .dyslexic ? 13 : 14, .medium)).foregroundStyle(FW.Palette.text)
                            .lineLimit(1).minimumScaleFactor(0.75)
                        Text(f == standard ? "Default" : info.note)
                            .font(.sans(12)).foregroundStyle(FW.Palette.text3)
                            .lineLimit(1).minimumScaleFactor(0.85)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                }
                .accessibilityLabel("\(info.label), \(info.note)")
            }
        }
    }
}

// Three lines of text as bars, for picking a line length.
private struct YouLinesGlyph: View {
    let width: Double
    var body: some View {
        GeometryReader { geo in
            VStack(alignment: .leading, spacing: 4) {
                ForEach([1.0, 0.86, 0.64], id: \.self) { k in
                    Capsule().fill(FW.Palette.text3).frame(width: geo.size.width * width * k, height: 3)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Game elements

private struct YouGameItem {
    let key: WritableKeyPath<Prefs.Game, Bool>
    let title: String
    let detail: String
    let icon: String
    let color: Color
}

private var youGameItems: [YouGameItem] { [
    .init(key: \.xp, title: "XP and levels", detail: "Points for answers and sessions", icon: "bolt.fill", color: FW.Palette.caution),
    .init(key: \.streak, title: "Streak", detail: "Planned time off never breaks it", icon: "flame.fill", color: FW.Palette.coral),
    .init(key: \.quests, title: "Daily quests", detail: "Three small goals, a bonus for all", icon: "checklist", color: FW.Palette.finance),
    .init(key: \.pops, title: "In-session celebrations", detail: "“+XP” and “3 in a row”", icon: "party.popper.fill", color: FW.Palette.judgment),
] }

func youGameSummary(_ p: Prefs) -> String {
    let on = youGameItems.filter { p.game[keyPath: $0.key] }.count
    return on == youGameItems.count ? "All on" : on == 0 ? "All off" : "\(on) of \(youGameItems.count)"
}

struct YouGameSheet: View {
    @Environment(Store.self) private var store
    var body: some View {
        SheetScaffold(title: "Game elements", subtitle: "Optional extras.") {
            YouSheetCard {
                ForEach(youGameItems, id: \.title) { g in
                    let on = store.prefs.game[keyPath: g.key]
                    let locked = g.key == \.pops && !store.prefs.game.xp
                    GroupRow(icon: g.icon, title: g.title, caption: g.detail, color: on && !locked ? g.color : FW.Palette.text3) {
                        Toggle(g.title, isOn: Binding(
                            get: { store.prefs.game[keyPath: g.key] },
                            set: { v in store.setPrefs { $0.game[keyPath: g.key] = v } }
                        ))
                        .labelsHidden()
                        .disabled(locked)
                    }
                    .opacity(locked ? 0.5 : 1)
                    .animation(Springs.snappy, value: on)
                }
            }
            YouFootnote("Your learning, memory and progress work the same with all of them off.")
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
        SheetScaffold(title: "Your plan") {
            HStack(spacing: 14) {
                IconBadge(systemName: "map.fill", color: FW.Palette.review, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan?.title ?? "No plan yet").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                        .lineLimit(2)
                    if let plan {
                        Text("\(Dates.short(plan.start_date)) – \(Dates.short(plan.end_date))").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    } else {
                        Text("Import one to begin").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    }
                }
                Spacer(minLength: 0)
            }
            Button {
                dismiss()
                router.push(.importPlan, on: .you)
            } label: {
                Label(plan != nil ? "Import a new plan" : "Import a plan", systemImage: "square.and.arrow.down")
            }
            .buttonStyle(.fw(.primary, wide: true))
            YouSheetCard {
                if let json = store.plan {
                    ShareLink(item: SharedJSONFile(name: "fieldwork-plan.json", json: json), preview: SharePreview("fieldwork-plan.json")) {
                        GroupRow(icon: "doc.text.fill", title: "Export this plan", color: FW.Palette.judgment, value: nil)
                    }
                    .buttonStyle(.plain)
                } else {
                    GroupRow(icon: "doc.text.fill", title: "Export this plan", color: FW.Palette.judgment, value: nil, chevron: false)
                        .opacity(0.45)
                }
                ShareLink(
                    item: SharedJSONFile(name: "fieldwork-progress.json", json: .object([
                        "attempts": store.state["attempts"] ?? .array([]),
                        "records": store.state["records"] ?? .array([]),
                    ])),
                    preview: SharePreview("fieldwork-progress.json")
                ) {
                    GroupRow(icon: "chart.line.uptrend.xyaxis", title: "Export progress", color: FW.Palette.finance, value: nil)
                }
                .buttonStyle(.plain)
            }
        }
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
                SkeletonLines(count: 2).padding(.vertical, 8)
            } else if available {
                passkeys
            }
            if let message {
                Text(message).font(.sans(14)).foregroundStyle(FW.Palette.text2).fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }
            YouFootnote("Without a passkey, you sign in with a code sent to your email.")
        }
        .animation(Springs.snappy, value: list?.map(\.id))
        .animation(Springs.snappy, value: loading)
        .task { await refresh() }
        .confirmationDialog("Remove this passkey?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                if let k = removing { Task { await remove(k) } }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    @ViewBuilder
    private var passkeys: some View {
        if let list, !list.isEmpty {
            YouSheetLabel("Passkeys")
            YouSheetCard {
                ForEach(list) { k in
                    let name = k.friendly_name.flatMap { $0.isEmpty ? nil : $0 } ?? "Passkey"
                    GroupRow(icon: glyph(name), title: name,
                             caption: k.last_used_at.map { "Used " + day($0) } ?? "Added " + day(k.created_at),
                             color: FW.Palette.review) {
                        Button("Remove") { removing = k }
                            .font(.sans(14, .medium))
                            .foregroundStyle(FW.Palette.negative)
                            .buttonStyle(.plain)
                            .frame(minHeight: 44)
                    }
                    .transition(.opacity.combined(with: .scale(0.96)))
                }
            }
        } else {
            YouEmpty(icon: "person.badge.key.fill", color: FW.Palette.review, title: "No passkeys yet", line: "Sign in with Face ID next time, and skip the email code.")
        }
        Button { Task { await add() } } label: {
            HStack(spacing: 8) {
                if adding { ProgressView().controlSize(.small).tint(FW.Palette.onAccent) } else { Image(systemName: "plus") }
                Text("Add a passkey")
            }
        }
        .buttonStyle(.fw(.primary, wide: true))
        .disabled(adding)
    }

    private func glyph(_ name: String) -> String {
        let n = name.lowercased()
        if n.contains("iphone") { return "iphone" }
        if n.contains("ipad") { return "ipad" }
        if n.contains("mac") || n.contains("laptop") { return "laptopcomputer" }
        return "key.fill"
    }

    private func day(_ s: String) -> String {
        Stamp.parse(s)?.formatted(date: .abbreviated, time: .omitted) ?? ""
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
            VStack(spacing: 2) {
                Text(youDollars(usage.total))
                    .font(.rounded(48))
                    .foregroundStyle(FW.Palette.text)
                    .contentTransition(.numericText())
                Text("\(usage.calls) calls this month").font(.sans(14)).foregroundStyle(FW.Palette.text3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                ForEach(Array(["fast", "primary", "reasoning", "voice"].enumerated()), id: \.element) { i, t in
                    if let tier = usage.byTier[t] {
                        tile(youDollars(tier.usd), t == "voice" ? "Voice" : usage.models[t] ?? t, "\(tier.calls) calls", icon(t))
                            .rise(i)
                    }
                }
            }
            if usage.cacheRate > 0 {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label("Served from cache", systemImage: "bolt.horizontal.fill").font(.sans(14, .medium)).foregroundStyle(FW.Palette.text2)
                        Spacer()
                        Text("\(Int((usage.cacheRate * 100).rounded()))%").font(.rounded(17, .semibold)).foregroundStyle(FW.Palette.text)
                    }
                    Meter(value: usage.cacheRate, color: FW.Palette.finance, height: 6)
                }
                .padding(14)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            }
        }
    }

    private func icon(_ tier: String) -> (String, Color) {
        switch tier {
        case "fast": ("hare.fill", FW.Palette.finance)
        case "primary": ("sparkles", FW.Palette.coral)
        case "reasoning": ("brain", FW.Palette.judgment)
        default: ("waveform", FW.Palette.review)
        }
    }

    private func tile(_ value: String, _ name: String, _ calls: String, _ icon: (String, Color)) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            IconBadge(systemName: icon.0, color: icon.1, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.rounded(22)).foregroundStyle(FW.Palette.text).lineLimit(1).minimumScaleFactor(0.7)
                Text(name).font(.sans(13, .medium)).foregroundStyle(FW.Palette.text2).lineLimit(1).minimumScaleFactor(0.8)
                Text(calls).font(.sans(12)).foregroundStyle(FW.Palette.text3).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Delete account

struct YouDeleteAccountSheet: View {
    @Environment(Store.self) private var store
    @Environment(Auth.self) private var auth
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let ready = confirm == "DELETE MY ACCOUNT"
        SheetScaffold(title: "Delete your account?") {
            HStack(alignment: .top, spacing: 14) {
                IconBadge(systemName: "exclamationmark.triangle.fill", color: FW.Palette.negative, size: 44)
                Text("This removes your plans, progress, memories and private files. Export anything you want to keep first.")
                    .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Type DELETE MY ACCOUNT").font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3).padding(.leading, 4)
                TextField("", text: $confirm)
                    .font(.sans(17, .medium))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 16)
                    .frame(minHeight: 52)
                    .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(ready ? FW.Palette.negative : FW.Palette.line, lineWidth: ready ? 1.5 : 1))
                    .accessibilityLabel("Type DELETE MY ACCOUNT")
            }
            Button { Task { await deleteAccount() } } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().controlSize(.small) } else { Image(systemName: "trash") }
                    Text("Permanently delete account")
                }
            }
            .buttonStyle(YouDangerStyle())
            .disabled(!ready || busy)
            if let error {
                Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true)
            }
        }
        .animation(Springs.snappy, value: ready)
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
