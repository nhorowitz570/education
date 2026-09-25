import SwiftUI

// Pieces of Mastery (src/components/mastery/mastery.tsx): what's been shown,
// the next challenge, the forgetting forecast, the knowledge map, momentum,
// calibration, the portfolio and the concept sheet.

// Days ahead the map can look, assuming nothing is reviewed in between.
let masteryAhead: [(days: Int, label: String)] = [(0, "Today"), (3, "3 days"), (7, "1 week"), (14, "2 weeks"), (30, "1 month")]

// Starts a review of some concepts and opens it, as the web's buttons do.
@MainActor
func masteryReview(_ keys: [String]) async throws {
    _ = try await Runs.start(.init(kind: "review", concepts: keys))
}

// MARK: - Subjects

// One ring per subject: average recall strength across its ideas, with how
// many have been practised.
struct MasterySubjects: View {
    let concepts: [MasteryConcept]

    private struct Subject: Identifiable {
        let id: String
        let strength: Double
        let practised: Int
        let total: Int
    }

    var body: some View {
        var first: [String: Double] = [:]
        for c in concepts { first[c.track] = min(first[c.track] ?? .infinity, c.position) }
        let subjects: [Subject] = first.keys.sorted { (first[$0]!, $0) < (first[$1]!, $1) }.map { t in
            let list = concepts.filter { $0.track == t }
            return Subject(
                id: t,
                strength: list.isEmpty ? 0 : list.map(\.strength).reduce(0, +) / Double(list.count),
                practised: list.filter { $0.level != "new" }.count,
                total: list.count
            )
        }
        return VStack(alignment: .leading, spacing: 14) {
            SectionHead(title: "Subjects")
            Group {
                if subjects.count <= 3 {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(subjects) { s in subject(s).frame(maxWidth: .infinity) }
                    }
                } else {
                    ScrollView(.horizontal) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(subjects) { s in subject(s).frame(width: 104) }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .contentMargins(.horizontal, 16, for: .scrollContent)
                    .padding(.horizontal, -16)
                }
            }
            .padding(.vertical, 18)
            .padding(.horizontal, subjects.count <= 3 ? 12 : 16)
            .frame(maxWidth: .infinity)
            .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
        }
    }

    private func subject(_ s: Subject) -> some View {
        let tint = trackColor(s.id)
        return VStack(spacing: 10) {
            ZStack {
                NotebookRing(value: s.strength, color: tint, size: 76, line: 8, label: false)
                VStack(spacing: 0) {
                    Image(systemName: Glyph.track(s.id)).font(.system(size: 14, weight: .semibold)).foregroundStyle(tint)
                    Text("\(Int((s.strength * 100).rounded()))%")
                        .font(.rounded(16))
                        .foregroundStyle(FW.Palette.text)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
            }
            VStack(spacing: 2) {
                Text(s.id.prefix(1).uppercased() + s.id.dropFirst())
                    .font(.sans(14, .semibold))
                    .foregroundStyle(FW.Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text("\(s.practised) of \(s.total) practised")
                    .font(.sans(12, .medium))
                    .foregroundStyle(FW.Palette.text3)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(s.id.capitalized): \(Int((s.strength * 100).rounded()))% average strength, \(s.practised) of \(s.total) ideas practised")
    }
}

// MARK: - What you've shown

struct MasteryShown: View {
    let concepts: [MasteryConcept]
    let onPick: (MasteryConcept) -> Void
    @State private var all = false

    var body: some View {
        let shown = concepts.filter { $0.rank >= 2 }.sorted { $0.rank != $1.rank ? $0.rank > $1.rank : $0.strength > $1.strength }
        let learning = concepts.filter { $0.level == "learning" }.count
        VStack(alignment: .leading, spacing: 14) {
            SectionHead(title: "What you’ve shown", trailing: shown.isEmpty ? nil : "\(shown.count)")
            if shown.isEmpty {
                HStack(spacing: 12) {
                    IconBadge(systemName: learning > 0 ? "leaf" : "sparkles", color: FW.Palette.caution, size: 40)
                    Text(learning > 0
                         ? "Learning \(learning) idea\(learning == 1 ? "" : "s"). A couple of solid answers on one puts it here."
                         : "Nothing yet. Ideas you can use show up here, strongest first.")
                        .font(.sans(15))
                        .foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
            } else {
                GroupCard {
                    ForEach(shown.prefix(all ? shown.count : 8)) { c in
                        Button { onPick(c) } label: { MasteryConceptRow(concept: c) }
                            .buttonStyle(.pressable(0.98))
                            .accessibilityLabel("\(c.title), \(levelLabel(c.level)), \(Int((c.strength * 100).rounded()))% strength")
                    }
                }
                if shown.count > 8 {
                    Button {
                        withAnimation(Springs.smooth) { all.toggle() }
                    } label: {
                        Label(all ? "Show fewer" : "\(shown.count - 8) more", systemImage: all ? "chevron.up" : "chevron.down")
                    }
                    .buttonStyle(.fw(.secondary, small: true))
                }
            }
        }
    }
}

// A concept: subject glyph, title over a strength meter, level pill.
struct MasteryConceptRow: View {
    let concept: MasteryConcept
    var body: some View {
        let c = concept
        let tint = trackColor(c.track)
        HStack(spacing: 14) {
            IconBadge(systemName: Glyph.track(c.track), color: tint, size: 36)
            VStack(alignment: .leading, spacing: 7) {
                Text(c.title)
                    .font(.sans(15, .medium))
                    .foregroundStyle(FW.Palette.text)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Meter(value: c.strength, color: tint, height: 5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            NotebookLevelPill(level: c.level)
        }
        .padding(.vertical, 12)
        .frame(minHeight: 60)
        .contentShape(.rect)
    }
}

// MARK: - Your next challenge

// The page's hero: one thing to do next, with a big button.
struct MasteryNextChallenge: View {
    let concepts: [MasteryConcept]
    let now: Date
    @Environment(Router.self) private var router
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let tricky = concepts.first { !$0.misconceptions.isEmpty && $0.level != "new" }
        let due = concepts
            .filter { $0.level != "new" && ($0.due.map { $0 <= now } ?? false) }
            .min { $0.recall < $1.recall }
        let pick = tricky ?? due
        let tint = pick.map { trackColor($0.track) } ?? FW.Palette.review
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                IconBadge(systemName: tricky != nil ? "bandage" : pick != nil ? "arrow.triangle.2.circlepath" : "sun.max", color: tint, size: 44, filled: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Your next challenge").font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text2)
                    Text(pick.map { tricky != nil ? "Untangle “\($0.title)”" : "Bring back “\($0.title)”" } ?? "Today’s session")
                        .font(.sans(19, .bold))
                        .foregroundStyle(FW.Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                if let pick, tricky == nil {
                    NotebookRing(value: pick.recall, color: tint, size: 48, line: 5)
                        .accessibilityLabel("Recall \(Int((pick.recall * 100).rounded())) percent")
                }
            }
            Text(detail(pick: pick, tricky: tricky))
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
            if let error {
                Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true)
            }
            Button { go(pick) } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: pick != nil ? "play.fill" : "arrow.right") }
                    Text(pick != nil ? "Start a 5-minute review" : "Go to Today")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.primary, wide: true))
            .disabled(busy)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            Aurora(colors: [tint, FW.Palette.review, tint], intensity: 0.3)
                .clipShape(.rect(cornerRadius: FW.Radius.xl, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(tint.opacity(0.22)))
    }

    private func detail(pick: MasteryConcept?, tricky: MasteryConcept?) -> String {
        guard let pick else { return "Nothing is fading or tangled. Next up: the next session." }
        if let tricky { return "Still tricky: \(tricky.misconceptions[0].trimmingCharacters(in: CharacterSet(charactersIn: ". ")))." }
        return "Recall is down to \(Int((pick.recall * 100).rounded()))%. A review now makes it last."
    }

    private func go(_ pick: MasteryConcept?) {
        guard let pick else { router.open("/"); return }
        busy = true
        error = nil
        Feedback.shared.play(.tap)
        Task {
            do { try await masteryReview([pick.key]) } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

// MARK: - Forgetting forecast

// Scrub forward in time: the map fades as the forgetting curve says it will
// if nothing is reviewed, which is the honest case for a short review now.
struct MasteryForecast: View {
    let today: [MasteryConcept]
    let concepts: [MasteryConcept]
    @Binding var ahead: Int
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let i = max(0, masteryAhead.firstIndex { $0.days == ahead } ?? 0)
        let before = Dictionary(today.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        let slipping = concepts.filter { c in
            guard c.model != nil, let was = before[c.key] else { return false }
            return c.rank < was.rank || (was.recall >= 0.7 && c.recall < 0.7)
        }
        let solidNow = today.filter { $0.rank >= 3 }.count
        let solidThen = concepts.filter { $0.rank >= 3 }.count
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    IconBadge(systemName: "hourglass", color: FW.Palette.review, size: 30)
                    Text("If you don’t review").font(.sans(17, .bold)).foregroundStyle(FW.Palette.text)
                }
                Text(line(i: i, slipping: slipping.count, drop: solidNow - solidThen))
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .contentTransition(.numericText())
                    .accessibilityAddTraits(.updatesFrequently)
            }
            if ahead > 0, !slipping.isEmpty {
                Button { review(slipping) } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(FW.Palette.onAccent) }
                        Text("Review these now")
                    }
                }
                .buttonStyle(.fw(.primary, small: true))
                .disabled(busy)
                .transition(.opacity.combined(with: .scale(0.9, anchor: .leading)))
            }
            scrub(i)
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative) }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
        .animation(Springs.snappy, value: ahead)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Forgetting forecast")
    }

    private func line(i: Int, slipping: Int, drop: Int) -> AttributedString {
        func plain(_ s: String) -> AttributedString { AttributedString(s) }
        func bold(_ s: String) -> AttributedString {
            var a = AttributedString(s)
            a.font = .sans(15, .semibold)
            a.foregroundColor = FW.Palette.text
            return a
        }
        if ahead == 0 { return plain("Slide ahead to see what fades without review.") }
        let label = masteryAhead[i].label
        let recall = plain(" Average recall \(avg(today))% → ") + bold("\(avg(concepts))%") + plain(".")
        if slipping > 0 {
            var s = plain("In \(label), ") + bold("\(slipping)") + plain(" idea\(slipping == 1 ? "" : "s") fade")
            if drop > 0 { s += plain(" and ") + bold("\(drop)") + plain(" drop below solid") }
            return s + plain(".") + recall
        }
        return plain("Everything holds for \(label).") + recall
    }

    private func avg(_ list: [MasteryConcept]) -> Int {
        let t = list.filter { $0.model != nil }
        guard !t.isEmpty else { return 0 }
        return Int((t.map(\.recall).reduce(0, +) / Double(t.count) * 100).rounded())
    }

    private func scrub(_ i: Int) -> some View {
        VStack(spacing: 8) {
            Slider(
                value: Binding(
                    get: { Double(i) },
                    set: { v in
                        let j = min(masteryAhead.count - 1, max(0, Int(v.rounded())))
                        if masteryAhead[j].days != ahead {
                            Feedback.shared.play(.tap)
                            ahead = masteryAhead[j].days
                        }
                    }
                ),
                in: 0...Double(masteryAhead.count - 1),
                step: 1
            )
            .tint(FW.Palette.review)
            .accessibilityLabel("Look ahead")
            .accessibilityValue(masteryAhead[i].label)
            HStack(spacing: 0) {
                ForEach(Array(masteryAhead.enumerated()), id: \.offset) { j, a in
                    Button {
                        Feedback.shared.play(.tap)
                        ahead = a.days
                    } label: {
                        Text(a.label)
                            .font(.sans(12, j == i ? .bold : .medium))
                            .foregroundStyle(j == i ? FW.Palette.review : FW.Palette.text3)
                            .lineLimit(1)
                            .fixedSize()
                            .frame(minHeight: 28)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHidden(true)
                    if j < masteryAhead.count - 1 { Spacer(minLength: 4) }
                }
            }
        }
    }

    private func review(_ slipping: [MasteryConcept]) {
        busy = true
        error = nil
        Task {
            do {
                try await masteryReview(slipping.sorted { $0.recall < $1.recall }.prefix(6).map(\.key))
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

// MARK: - Knowledge map

// Every concept in the plan, one column per track, time top to bottom (the
// web's phone layout); size and light by level. Tap a node for its sheet.
struct MasteryMap: View {
    let concepts: [MasteryConcept]
    let order: [String: Int]
    let ahead: Bool
    let onPick: (MasteryConcept) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let radius: [String: CGFloat] = ["new": 3.2, "learning": 4.2, "practiced": 5.2, "solid": 6.2, "mastered": 7.2]
    private let width: CGFloat = 360
    private let top: CGFloat = 40
    private let left: CGFloat = 8

    var body: some View {
        if concepts.isEmpty {
            Text("Import a plan to see its map.").font(.sans(15)).foregroundStyle(FW.Palette.text2)
        } else {
            let layout = self.layout()
            VStack(alignment: .leading, spacing: 12) {
                Color.clear
                    .aspectRatio(width / layout.height, contentMode: .fit)
                    .overlay { GeometryReader { g in canvas(layout, scale: g.size.width / width) } }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Knowledge map of every concept in the plan")
                Rule()
                legend
            }
        }
    }

    private struct Layout {
        var tracks: [String]
        var col: CGFloat
        var height: CGFloat
        var pos: [String: CGPoint]
    }

    private func when(_ c: MasteryConcept) -> Double {
        c.sessions.isEmpty ? c.position : c.sessions.map { order[$0].map(Double.init) ?? c.position }.min() ?? c.position
    }

    private func layout() -> Layout {
        var first: [String: Double] = [:]
        for c in concepts { first[c.track] = min(first[c.track] ?? .infinity, c.position) }
        let tracks = first.keys.sorted { (first[$0]!, $0) < (first[$1]!, $1) }
        let col = (width - 16) / CGFloat(max(1, tracks.count))
        let maxWhen = max(1, concepts.map(when).max() ?? 1)
        let span = max(420, min(1400, CGFloat(concepts.count) * 9))
        var pos: [String: CGPoint] = [:]
        var taken: [String: Int] = [:]
        for c in concepts.sorted(by: { when($0) < when($1) }) {
            let t = tracks.firstIndex(of: c.track) ?? 0
            let main = top + 12 + CGFloat(when(c) / maxWhen) * span
            let slot = "\(t):\(Int((main / 14).rounded()))"
            let n = taken[slot] ?? 0
            taken[slot] = n + 1
            let offset: CGFloat = n == 0 ? 0 : (n % 2 == 1 ? -1 : 1) * CGFloat((n + 1) / 2) * 11
            pos[c.key] = CGPoint(x: left + CGFloat(t) * col + col / 2 + offset, y: main)
        }
        return Layout(tracks: tracks, col: col, height: top + span + 24, pos: pos)
    }

    private func canvas(_ l: Layout, scale s: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
                for (i, _) in l.tracks.enumerated() {
                    let x = (left + CGFloat(i) * l.col + l.col / 2) * s
                    var p = Path()
                    p.move(to: .init(x: x, y: top * s))
                    p.addLine(to: .init(x: x, y: (l.height - 8) * s))
                    ctx.stroke(p, with: .color(FW.Palette.line), style: StrokeStyle(lineWidth: 1, dash: [2, 5]))
                }
                for c in concepts {
                    for pre in c.prerequisites {
                        guard let a = l.pos[pre], let b = l.pos[c.key] else { continue }
                        let mid = (a.y + b.y) / 2
                        var p = Path()
                        p.move(to: .init(x: a.x * s, y: a.y * s))
                        p.addCurve(to: .init(x: b.x * s, y: b.y * s), control1: .init(x: a.x * s, y: mid * s), control2: .init(x: b.x * s, y: mid * s))
                        let color = c.level != "new" ? FW.Palette.line3 : FW.Palette.line2
                        ctx.stroke(p, with: .color(color.opacity(ahead ? 0.5 : 1)), lineWidth: 1)
                    }
                }
            }
            ForEach(Array(l.tracks.enumerated()), id: \.element) { i, t in
                Text(t.prefix(1).uppercased() + t.dropFirst())
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundStyle(FW.Palette.text3)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(width: max(10, l.col * s - 4))
                    .position(x: (left + CGFloat(i) * l.col + l.col / 2) * s, y: 16 * s)
                    .accessibilityHidden(true)
            }
            ForEach(concepts) { c in
                if let p = l.pos[c.key] { node(c, scale: s).position(x: p.x * s, y: p.y * s) }
            }
        }
    }

    private func node(_ c: MasteryConcept, scale s: CGFloat) -> some View {
        let full = Self.radius["mastered"]! * s
        let r = (Self.radius[c.level] ?? 3.2) * s
        let color = trackColor(c.track)
        let isNew = c.level == "new"
        return Button { onPick(c) } label: {
            ZStack {
                Circle()
                    .strokeBorder(color.opacity(0.4), lineWidth: 1)
                    .frame(width: (full + 5) * 2, height: (full + 5) * 2)
                    .scaleEffect(c.level == "mastered" ? 1 : 0.6)
                    .opacity(c.level == "mastered" ? 1 : 0)
                Circle()
                    .fill(isNew ? FW.Palette.bg : color)
                    .overlay(Circle().strokeBorder(isNew ? color.opacity(0.45) : .clear, lineWidth: 1.2 * full / r))
                    .frame(width: full * 2, height: full * 2)
                    .scaleEffect(r / full)
                    .opacity(isNew ? 1 : 0.3 + c.strength * 0.7)
            }
            .frame(width: 28, height: 28)
            .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.7), value: c.level)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.7), value: c.strength)
        .accessibilityLabel("\(c.title): \(levelLabel(c.level))")
    }

    private var legend: some View {
        FlowLayout(spacing: 16) {
            ForEach(["new", "learning", "practiced", "solid", "mastered"], id: \.self) { l in
                HStack(spacing: 6) {
                    legendMark(l)
                    Text(levelLabel(l)).font(.sans(12)).foregroundStyle(FW.Palette.text3)
                }
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func legendMark(_ level: String) -> some View {
        switch level {
        case "new": Circle().strokeBorder(FW.Palette.text3, lineWidth: 1.2).frame(width: 7, height: 7)
        case "learning": Circle().fill(FW.Palette.text2.opacity(0.45)).frame(width: 8, height: 8)
        case "practiced": Circle().fill(FW.Palette.text2.opacity(0.65)).frame(width: 10, height: 10)
        case "solid": Circle().fill(FW.Palette.text2).frame(width: 12, height: 12)
        default:
            Circle().fill(FW.Palette.text2).frame(width: 13, height: 13)
                .padding(3)
                .overlay(Circle().strokeBorder(FW.Palette.text3, lineWidth: 1))
                .frame(width: 13, height: 13)
        }
    }

    // Curriculum order of every session, as curriculumSessions() in
    // src/lib/rolling.ts: the scheduled sessions, then each track's backlog
    // taken in turn by the weekly rhythm.
    static func order(plan: JSON?) -> [String: Int] {
        guard let plan else { return [:] }
        var ids = (plan["sessions"]?.array ?? []).compactMap { $0["id"]?.string }
        if let h = plan["horizon"], !h.isNull {
            let trackIds = (h["tracks"]?.array ?? []).compactMap { $0["id"]?.string }
            let lanes = (h["rhythm"]?["days"]?.object ?? [:])
                .compactMap { k, v in Int(k).flatMap { d in v.string.map { (d, $0) } } }
                .sorted { $0.0 < $1.0 }
                .map(\.1)
            var queues: [String: [String]] = [:]
            for t in h["tracks"]?.array ?? [] {
                if let id = t["id"]?.string { queues[id] = (t["backlog"]?.array ?? []).compactMap { $0["id"]?.string } }
            }
            let base = lanes.isEmpty ? trackIds : lanes
            let turn = base + trackIds.filter { !base.contains($0) }
            while queues.values.contains(where: { !$0.isEmpty }) {
                var moved = false
                for id in turn {
                    if var q = queues[id], !q.isEmpty {
                        ids.append(q.removeFirst())
                        queues[id] = q
                        moved = true
                    }
                }
                if !moved { break }
            }
        }
        var out: [String: Int] = [:]
        for (i, id) in ids.enumerated() where out[id] == nil { out[id] = i }
        return out
    }
}

// MARK: - Momentum

struct MasteryMomentum: View {
    let weeks: [MasteryData.WeekCount]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = false

    var body: some View {
        let top = Double(max(4, weeks.map(\.count).max() ?? 0))
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(Array(weeks.enumerated()), id: \.offset) { i, w in
                let now = i == weeks.count - 1
                VStack(spacing: 6) {
                    GeometryReader { g in
                        let h = g.size.height * max(0.04, Double(w.count) / top)
                        VStack(spacing: 0) {
                            Spacer(minLength: 0)
                            ZStack(alignment: .bottom) {
                                RoundedRectangle(cornerRadius: 6).fill(now ? FW.Palette.surface3 : FW.Palette.surface2)
                                Rectangle()
                                    .fill(FW.Palette.positive.opacity(0.7))
                                    .frame(height: w.count > 0 ? h * Double(w.solid) / Double(w.count) : 0)
                            }
                            .frame(width: min(g.size.width, 26), height: h)
                            .clipShape(.rect(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(now ? FW.Palette.line3 : .clear))
                            .scaleEffect(y: grown ? 1 : 0, anchor: .bottom)
                            .animation(reduceMotion ? nil : Springs.gentle.delay(Double(i) * 0.04), value: grown)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    Text(w.count > 0 ? "\(w.count)" : " ")
                        .font(.sans(11, .medium))
                        .foregroundStyle(FW.Palette.text3)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 140)
        .onAppear {
            if reduceMotion { grown = true } else { withAnimation(Springs.gentle.delay(0.1)) { grown = true } }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Learning activity over the last eight weeks")
        .accessibilityValue(weeks.map { "\($0.count)" }.joined(separator: ", "))
    }
}

// MARK: - Knowing when you know

struct MasteryCalibration: View {
    let c: CalibrationCounts
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = false
    private let rows: [(key: String, label: String, icon: String, opacity: Double)] = [
        ("low", "Guessing", "questionmark", 0.5), ("medium", "Fairly sure", "hand.thumbsup", 0.75), ("high", "Certain", "checkmark.seal", 1),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHead(title: "Knowing when you know", trailing: "\(c.total) rated")
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .bottom, spacing: 14) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                        let p = c.pct(r.key)
                        VStack(spacing: 8) {
                            Text(p.map { "\($0)%" } ?? "–")
                                .font(.rounded(20))
                                .foregroundStyle(FW.Palette.text)
                                .monospacedDigit()
                            GeometryReader { g in
                                ZStack(alignment: .bottom) {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(FW.Palette.surface2)
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(FW.Palette.review.opacity(r.opacity))
                                        .frame(height: g.size.height * Double(p ?? 0) / 100)
                                        .scaleEffect(y: grown ? 1 : 0, anchor: .bottom)
                                        .animation(reduceMotion ? nil : Springs.gentle.delay(Double(i) * 0.1), value: grown)
                                }
                                .frame(width: min(g.size.width, 48))
                                .frame(maxWidth: .infinity)
                            }
                            HStack(spacing: 4) {
                                Image(systemName: r.icon).font(.system(size: 11, weight: .bold)).foregroundStyle(FW.Palette.review)
                                Text(r.label).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text)
                            }
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            Text("\(c[r.key].n) answer\(c[r.key].n == 1 ? "" : "s")")
                                .font(.sans(12, .medium)).foregroundStyle(FW.Palette.text3).monospacedDigit().lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 190)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(rows.map { "\($0.label): \(c.pct($0.key).map(String.init) ?? "no") percent right" }.joined(separator: ", "))
                Rule()
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "lightbulb").font(.system(size: 14, weight: .semibold)).foregroundStyle(FW.Palette.caution)
                    Text(read)
                        .font(.sans(14))
                        .foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(16)
            .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
        }
        .onAppear { grown = true }
    }

    private var read: String {
        let hi = c.pct("high"), lo = c.pct("low")
        if c.total < 6 { return "Rate a few more answers and this will show whether your confidence matches your accuracy." }
        if let hi, c.high.n >= 3, hi < 70 { return "When you feel certain, you’re right \(hi)% of the time. Those are the answers worth double-checking." }
        if let hi, let lo, hi - lo >= 25 { return "Your confidence tracks your accuracy well: when you’re sure, you’re usually right." }
        if let lo, c.low.n >= 3, lo >= 70 { return "Your guesses are right \(lo)% of the time. You know more than you give yourself credit for." }
        return "Your confidence and accuracy are close to even. Keep rating honestly and the pattern will sharpen."
    }
}

// MARK: - Portfolio

// Everything produced, filed under the milestone it builds toward, with a
// rehearsal for each milestone still ahead. Each milestone folds open.
struct MasteryPortfolio: View {
    let milestones: [MasteryData.Milestone]
    @Environment(Store.self) private var store
    @State private var loader = Loader<PortfolioData>("/api/portfolio")
    @State private var busy = ""
    @State private var error: String?
    @State private var open: Set<Int> = [0]

    var body: some View {
        Group {
            if let data = loader.value, data.count > 0 || !milestones.isEmpty {
                content(data).rise()
            }
        }
        .task { await loader.load() }
    }

    private func content(_ data: PortfolioData) -> some View {
        let today = store.today
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                SectionHead(title: "Portfolio", trailing: NotebookText.count(data.count, "piece"))
                if data.count > 0 {
                    ShareLink(
                        item: MarkdownFile(name: "fieldwork-portfolio-\(today).md") { try await LibraryText.get("/api/portfolio?format=md") },
                        preview: SharePreview("Portfolio")
                    ) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 36, height: 36)
                            .background(FW.Palette.surface2, in: .circle)
                    }
                    .buttonStyle(.pressable(0.9))
                    .foregroundStyle(FW.Palette.text)
                    .accessibilityLabel("Export portfolio")
                }
            }
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true) }
            VStack(spacing: 10) {
                ForEach(Array(data.groups.enumerated()), id: \.offset) { i, g in group(g, index: i, today: today) }
            }
        }
    }

    private func group(_ g: PortfolioData.Group, index: Int, today: String) -> some View {
        let upcoming = !g.date.isEmpty && g.date >= today
        let isOpen = open.contains(index)
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(Springs.smooth) { if isOpen { open.remove(index) } else { open.insert(index) } }
            } label: {
                HStack(spacing: 12) {
                    IconBadge(systemName: upcoming ? "flag" : "checkmark.seal.fill", color: upcoming ? FW.Palette.text2 : FW.Palette.positive, size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(g.title).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        Text([g.date.isEmpty ? nil : Dates.short(g.date), NotebookText.count(g.items.count, "piece")].compactMap { $0 }.joined(separator: " · "))
                            .font(.sans(13)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(FW.Palette.text3)
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                        .frame(width: 24, height: 24)
                        .background(FW.Palette.surface2, in: .circle)
                }
                .padding(14)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .sensoryFeedback(.selection, trigger: isOpen)
            .accessibilityAddTraits(isOpen ? .isSelected : [])
            if isOpen {
                VStack(alignment: .leading, spacing: 14) {
                    if upcoming {
                        Button { rehearse(g.date) } label: {
                            HStack(spacing: 6) {
                                if busy == g.date { ProgressView() } else { Image(systemName: "target") }
                                Text("Rehearse")
                            }
                        }
                        .buttonStyle(.fw(.secondary, small: true))
                        .disabled(!busy.isEmpty)
                    }
                    if g.items.isEmpty {
                        Text(upcoming ? "Nothing filed yet. Work you produce toward this lands here." : "No work filed here.")
                            .font(.sans(14))
                            .foregroundStyle(FW.Palette.text3)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        ForEach(Array(g.items.enumerated()), id: \.offset) { _, e in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 6) {
                                    if let v = e.verdict { Dot(color: verdictColor(v), size: 7) }
                                    Text("\(e.title) · \(Dates.short(e.date))")
                                        .font(.sans(13, .medium))
                                        .foregroundStyle(FW.Palette.text3)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                Text(e.text)
                                    .font(.serif(17))
                                    .foregroundStyle(FW.Palette.text)
                                    .lineSpacing(4)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .textSelection(.enabled)
                            }
                            .padding(.top, 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .overlay(alignment: .top) { Rule() }
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 16)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
        .clipShape(.rect(cornerRadius: FW.Radius.lg, style: .continuous))
    }

    private func rehearse(_ date: String) {
        busy = date
        error = nil
        Feedback.shared.play(.tap)
        Task {
            do { _ = try await Runs.start(.init(kind: "rehearsal", milestone: date)) } catch { self.error = error.localizedDescription }
            busy = ""
        }
    }
}

// MARK: - Unlocks as you learn

struct MasteryUnlock: Identifiable {
    let id: String
    let label: String
    let icon: String
    let need: String
    let have: Int
    let target: Int
    var open: Bool { have >= target }
}

struct MasteryUnlocks: View {
    let locked: [MasteryUnlock]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHead(title: "Unlocks as you learn")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(locked) { u in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top) {
                            IconBadge(systemName: u.icon, color: FW.Palette.text3, size: 34)
                            Spacer(minLength: 4)
                            Image(systemName: "lock.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(FW.Palette.text4)
                        }
                        Text(u.label)
                            .font(.sans(14, .semibold))
                            .foregroundStyle(FW.Palette.text)
                            .lineLimit(3)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Meter(value: min(1, Double(u.have) / Double(u.target)), color: FW.Palette.review, height: 5)
                        Text("\(u.have)/\(u.target) \(u.need)")
                            .font(.sans(12, .medium))
                            .foregroundStyle(FW.Palette.text3)
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, minHeight: 176, maxHeight: 176, alignment: .topLeading)
                    .background(FW.Palette.raised.opacity(0.6), in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line2, style: StrokeStyle(lineWidth: 1, dash: [4, 4])))
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(u.label): \(u.have) of \(u.target) \(u.need)")
                }
            }
        }
        .accessibilityLabel("Views that unlock as you learn")
    }
}

// MARK: - Concept sheet

struct MasteryConceptSheet: View {
    let concept: MasteryConcept
    let all: [MasteryConcept]
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let c = concept
        let tint = trackColor(c.track)
        let prereqs = all.filter { c.prerequisites.contains($0.key) }
        SheetScaffold(title: c.title) {
            HStack(spacing: 12) {
                IconBadge(systemName: Glyph.track(c.track), color: tint, size: 48)
                VStack(alignment: .leading, spacing: 6) {
                    Text(c.track.prefix(1).uppercased() + c.track.dropFirst()).font(.sans(14, .semibold)).foregroundStyle(tint)
                    NotebookLevelPill(level: c.level)
                }
                Spacer(minLength: 8)
                NotebookRing(value: c.strength, color: tint, size: 64, line: 7)
            }
            .rise(0)
            if !c.summary.isEmpty {
                Text(c.summary).font(.sans(17)).foregroundStyle(FW.Palette.text).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                    .rise(1)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                StatTile(value: "\(Int((c.strength * 100).rounded()))%", label: "strength", icon: "chart.bar.fill", color: tint)
                StatTile(value: "\(Int((c.recall * 100).rounded()))%", label: "recall today", icon: "brain", color: FW.Palette.review)
                StatTile(value: "\(c.successes)", label: "successes", icon: "checkmark.circle.fill", color: FW.Palette.positive)
                if c.lapses > 0 { StatTile(value: "\(c.lapses)", label: "forgotten", icon: "arrow.uturn.backward", color: FW.Palette.negative) }
            }
            .rise(2)
            if !c.misconceptions.isEmpty || !prereqs.isEmpty || c.last_seen_at != nil {
                VStack(alignment: .leading, spacing: 14) {
                    if !c.misconceptions.isEmpty { field("Still tricky", c.misconceptions.joined(separator: "; "), icon: "exclamationmark.triangle", color: FW.Palette.caution) }
                    if !prereqs.isEmpty { field("Builds on", prereqs.map(\.title).joined(separator: ", "), icon: "arrow.triangle.branch", color: FW.Palette.judgment) }
                    if let seen = c.last_seen_at { field("Last practised", lastSeen(seen), icon: "clock", color: FW.Palette.text2) }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                .rise(3)
            }
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true) }
            if c.level != "new" {
                Button { review() } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "arrow.triangle.2.circlepath") }
                        Text("Review this now")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(busy)
                .rise(4)
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func field(_ label: String, _ text: String, icon: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemName: icon, color: color, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3)
                Text(text).font(.sans(15)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func lastSeen(_ seen: String) -> String {
        let when = Dates.weekdayShort(String(seen.prefix(10)))
        guard let due = concept.due_at else { return when }
        let now = (Stamp.parse(due) ?? .distantFuture) <= .now
        return "\(when) · review \(now ? "now" : Dates.weekdayShort(String(due.prefix(10))))"
    }

    // The session opens full screen from the app's root, so the sheet goes
    // first; the run is primed so it opens instantly.
    private func review() {
        busy = true
        error = nil
        Feedback.shared.play(.tap)
        Task {
            do {
                let r: Runs.Started = try await API.post("/api/runs", Runs.Start(kind: "review", concepts: [concept.key]))
                RunCache.prime(r.run)
                dismiss()
                try? await Task.sleep(for: .milliseconds(400))
                Router.shared.cover = .session(r.run.id)
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}
