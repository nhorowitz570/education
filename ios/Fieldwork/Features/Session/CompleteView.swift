import SwiftUI

// The end of a session (src/components/session/complete.tsx): what moved,
// what was shown, what happens next.
struct CompleteView: View {
    let run: RunView
    let fresh: Bool
    let onClose: () -> Void
    @Environment(Store.self) private var store
    @State private var mastery: [Moved] = []
    @State private var progress: Progress?
    @State private var appeared = false

    struct Moved: Decodable, Identifiable {
        var key: String
        var title: String
        var track: String?
        var strength: Double
        var level: String
        var before: Double?
        var id: String { key }
    }

    var body: some View {
        let graded = run.beats.filter { $0.feedback != nil }
        let solid = graded.filter { $0.feedback?.verdict == "solid" }.count
        let minutes = max(1, Int((run.elapsed ?? 0).rounded()))
        let steps = run.beats.filter { $0.status == "done" }.count
        let hue = trackColor(run.session?.subject)
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Image(systemName: "checkmark")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(FW.Palette.onAccent)
                    .frame(width: 56, height: 56)
                    .background(run.session?.subject == nil ? FW.Palette.text : hue, in: .circle)
                    .scaleEffect(appeared ? 1 : 0.6)
                    .opacity(appeared ? 1 : 0)
                Kicker(eyebrow)
                Text(run.title).font(.display(38)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                if store.prefs.game.xp, let p = progress { reward(p) }
                HStack(alignment: .firstTextBaseline, spacing: 36) {
                    stat(minutes, "minutes", delay: 0.3)
                    stat(steps, "steps", delay: 0.42)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 0) {
                            CountUp(to: solid, animate: fresh, delay: 0.54)
                            Text("/\(graded.count)")
                        }
                        .font(.display(34)).foregroundStyle(FW.Palette.text).monospacedDigit()
                        Text("solid answers").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    }
                }
                if !mastery.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Kicker("What moved · open any in your Notebook")
                        ForEach(Array(mastery.enumerated()), id: \.element.id) { i, c in moved(c, i) }
                    }
                }
                if !graded.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Kicker("What you showed")
                        ForEach(graded) { b in
                            HStack(alignment: .top, spacing: 12) {
                                Dot(color: verdictColor(b.feedback?.verdict)).padding(.top, 7)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(b.label).font(.sans(15)).foregroundStyle(FW.Palette.text)
                                    let first = leadingSentence(b.feedback?.blocks.first { $0.type == "text" }?.md ?? "")
                                    if !first.isEmpty { Text(first).font(.sans(13)).foregroundStyle(FW.Palette.text3) }
                                }
                            }
                            .padding(.vertical, 10)
                        }
                    }
                }
                if let produced = run.beats.first(where: { $0.type == "produce" && $0.response?.text != nil })?.response?.text {
                    VStack(alignment: .leading, spacing: 10) {
                        Kicker("Saved to your evidence")
                        Text(produced).font(.sans(15)).foregroundStyle(FW.Palette.text).card(FW.Radius.base, fill: FW.Palette.surface, padding: 14)
                    }
                }
                VStack(spacing: 10) {
                    Button("Back to Today") {
                        Router.shared.open("/")
                        onClose()
                    }
                    .buttonStyle(.fw(.primary, wide: true))
                    Button("See your progress") {
                        onClose()
                        Router.shared.push(.mastery, on: .today)
                    }
                    .buttonStyle(.fw(.secondary, wide: true))
                }
                .padding(.top, 8)
                Text("Anything worth keeping from today has been added to what Fieldwork knows about how you learn.")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }
            .padding(.horizontal, FW.Size.gutter + 4)
            .padding(.top, 48)
            .padding(.bottom, 48)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .screenBackground()
        .task {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) { appeared = true }
            progress = try? await API.get("/api/progress")
            let keys = Array(Set(run.beats.compactMap(\.concept)))
            guard !keys.isEmpty else { return }
            struct M: Decodable { let concepts: [Moved] }
            let q = keys.joined(separator: ",").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
            if let m: M = try? await API.get("/api/mastery?concepts=\(q)&run=\(run.id)") { mastery = m.concepts }
        }
    }

    private var eyebrow: String {
        switch run.kind {
        case "review": "Review done"
        case "explore": "Exploration done"
        case "rehearsal": "Rehearsal done"
        default: "Session complete"
        }
    }

    private func stat(_ value: Int, _ label: String, delay: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            CountUp(to: value, animate: fresh, delay: delay).font(.display(34)).foregroundStyle(FW.Palette.text).monospacedDigit()
            Text(label).font(.sans(13)).foregroundStyle(FW.Palette.text3)
        }
    }

    private func reward(_ p: Progress) -> some View {
        let earned = XP.session(run.beats) + (XP.finish[run.kind] ?? 0)
        let levelledUp = fresh && earned > (p.into ?? 0)
        let before = levelledUp ? 0 : max(0, Double((p.into ?? 0) - earned) / Double(max(p.span ?? 1, 1)))
        return HStack(spacing: 16) {
            LevelRing(level: p.level, fraction: p.fraction, size: 60)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 0) {
                    Text("+")
                    CountUp(to: earned, animate: fresh, delay: 0.25)
                    Text(" XP")
                }
                .font(.sans(26, .bold)).foregroundStyle(FW.Palette.caution)
                Meter(value: p.fraction, color: FW.Palette.caution, before: fresh ? before : nil, height: 6)
                HStack {
                    Text(levelledUp ? "Level up! You’re now level \(p.level), \(p.rank)." : "Level \(p.level) · \(p.toNext) XP to the next")
                        .font(.sans(13)).foregroundStyle(FW.Palette.text2)
                    Spacer()
                    if store.prefs.game.streak {
                        HStack(spacing: 3) {
                            Image(systemName: "flame.fill").foregroundStyle(p.streak.todayDone ? FW.Palette.coral : FW.Palette.text4)
                            Text("\(p.streak.current)").monospacedDigit()
                        }
                        .font(.sans(13, .semibold))
                    }
                }
            }
        }
        .card(FW.Radius.lg, fill: FW.Palette.caution.opacity(0.08), padding: 16)
    }

    private func moved(_ c: Moved, _ i: Int) -> some View {
        let delta = c.before.map { Int(((c.strength - $0) * 100).rounded()) }
        return Button {
            onClose()
            Router.shared.push(.concept(c.key), on: .notebook)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(c.title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text).multilineTextAlignment(.leading)
                    Meter(value: c.strength, color: trackColor(c.track), before: c.before)
                        .frame(maxWidth: 320)
                }
                Spacer(minLength: 8)
                if let d = delta, d != 0 {
                    Text(d > 0 ? "+\(d)" : "−\(abs(d))").font(.sans(12, .semibold)).foregroundStyle(d > 0 ? FW.Palette.positive : FW.Palette.text3).monospacedDigit()
                }
                Text(levelLabel(c.level)).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(FW.Palette.text3)
            }
            .padding(.vertical, 12)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(c.title), \(Int(c.strength * 100))% recall strength\(delta.map { ", \($0 >= 0 ? "up" : "down") \(abs($0)) points" } ?? "")")
    }
}

// Counts from 0 to a number with an ease-out, once; static under Reduce Motion.
struct CountUp: View {
    let to: Int
    var animate = true
    var delay: Double = 0
    @State private var value: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Text("\(Int(value.rounded()))")
            .contentTransition(.numericText(value: value))
            .onAppear {
                guard animate, !reduceMotion else { value = Double(to); return }
                withAnimation(.easeOut(duration: 0.9).delay(delay)) { value = Double(to) }
            }
            .onChange(of: to) { _, v in value = Double(v) }
    }
}
