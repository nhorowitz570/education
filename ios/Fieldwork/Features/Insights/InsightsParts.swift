import SwiftUI

// Pieces of the weekly read (src/components/insights/insights.tsx and
// src/styles/insights.css): the focus card, the week in numbers, the radar
// and grade rows, rhythm, answers, patterns, asking about the week, and the
// motion that goes with them (sections rise in as they're reached, numbers
// count up and charts draw once). Reduce Motion settles everything at once.

// MARK: - Motion

extension EnvironmentValues {
    // Whether the section around a chart has come into view.
    @Entry var insightsIn: Bool = true
}

// Sections rise into view as they're reached, and their charts draw then.
struct InsightsReveal: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let on = shown || reduceMotion
        content
            .environment(\.insightsIn, on)
            .opacity(on ? 1 : 0)
            .offset(y: on ? 0 : 18)
            .onScrollVisibilityChange(threshold: 0.12) { visible in
                if visible { reveal() }
            }
            .task {
                // A safety net: never leave a section hidden.
                try? await Task.sleep(for: .seconds(3))
                reveal()
            }
    }

    private func reveal() {
        guard !shown else { return }
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.7)) { shown = true }
    }
}

extension View {
    func insightsReveal() -> some View { modifier(InsightsReveal()) }
}

// A number that counts up once, when its section comes into view.
struct InsightsCount: View {
    let to: Double
    var decimals = 0
    var suffix = ""
    @Environment(\.insightsIn) private var on
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start: Date?
    @State private var finished = false

    var body: some View {
        let duration = 1.1 + min(0.9, log10(max(10, to)) * 0.22)
        TimelineView(.animation(paused: start == nil || finished || reduceMotion)) { ctx in
            let k = reduceMotion || finished ? 1 : start.map { min(1, max(0, ctx.date.timeIntervalSince($0) / duration)) } ?? 0
            Text(Self.format(to * (1 - pow(1 - k, 4)), decimals) + suffix)
                .monospacedDigit()
        }
        .onAppear(perform: begin)
        .onChange(of: on) { _, _ in begin() }
        .task(id: start) {
            guard start != nil else { return }
            try? await Task.sleep(for: .seconds(duration))
            finished = true
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.format(to, decimals) + suffix)
    }

    private func begin() {
        guard on, start == nil, !reduceMotion else { return }
        start = .now
    }

    static func format(_ v: Double, _ decimals: Int) -> String {
        v.formatted(.number.precision(.fractionLength(decimals)).grouping(.automatic))
    }
}

// MARK: - Formatting

enum InsightsFormat {
    static func band(_ s: Double?) -> Color {
        guard let s else { return FW.Palette.text4 }
        return s >= 75 ? FW.Palette.positive : s >= 60 ? FW.Palette.review : s >= 45 ? FW.Palette.caution : FW.Palette.negative
    }

    static func range(_ start: String, _ end: String) -> String {
        guard let a = Day.date(start), let b = Day.date(end) else { return "" }
        let sameMonth = start.prefix(7) == end.prefix(7)
        let from = a.formatted(.dateTime.month(.abbreviated).day())
        let to = sameMonth ? b.formatted(.dateTime.day()) : b.formatted(.dateTime.month(.abbreviated).day())
        return "\(from) – \(to)"
    }

    static func short(_ d: String) -> String { Dates.short(d) }

    static func hour(_ h: Int) -> String { "\((h + 11) % 12 + 1)\(h < 12 ? "am" : "pm")" }

    static func plural(_ n: Int, _ one: String, _ many: String? = nil) -> String {
        "\(n.formatted()) \(n == 1 ? one : many ?? one + "s")"
    }

    static func score(_ s: Double) -> String {
        s.rounded() == s ? "\(Int(s))" : s.formatted(.number.precision(.fractionLength(0...1)))
    }
}

// MARK: - Focus

// What to do next, first: it is the part of the read you can act on.
struct InsightsFocusCard: View {
    let insight: InsightRow
    let report: InsightReport
    let previous: InsightSummary?
    let latest: Bool
    @State private var focus: InsightReport.Focus
    @State private var busy = false

    init(insight: InsightRow, report: InsightReport, previous: InsightSummary?, latest: Bool) {
        self.insight = insight
        self.report = report
        self.previous = previous
        self.latest = latest
        _focus = State(initialValue: report.focus)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let check = report.focus_check { checkLine(check) }
            HStack(spacing: 12) {
                IconBadge(systemName: "scope", color: FW.Palette.review, size: 40, circle: true, filled: focus.adopted != nil)
                    .symbolEffect(.bounce, value: focus.adopted != nil)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Your focus next week").font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3)
                    Text(focus.title)
                        .font(.sans(20, .bold))
                        .foregroundStyle(FW.Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            PlanMoreText(text: focus.why, font: .sans(15), color: FW.Palette.text2)
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "arrow.turn.down.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(FW.Palette.review)
                    .padding(.top, 3)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Try").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.review)
                    Text(focus.try)
                        .font(.sans(15, .medium))
                        .foregroundStyle(FW.Palette.text)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .background(FW.Palette.review.opacity(0.09), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
            if latest {
                VStack(alignment: .leading, spacing: 8) {
                    Button { toggle() } label: {
                        HStack(spacing: 8) {
                            if busy {
                                ProgressView().tint(focus.adopted == nil ? FW.Palette.onAccent : FW.Palette.text)
                            } else if focus.adopted != nil {
                                Image(systemName: "checkmark.circle.fill").transition(.scale.combined(with: .opacity))
                            }
                            Text(focus.adopted != nil ? "Your focus this week" : "Make this my focus")
                                .contentTransition(.opacity)
                        }
                    }
                    .buttonStyle(.fw(focus.adopted != nil ? .secondary : .primary, wide: true))
                    .disabled(busy)
                    .accessibilityAddTraits(focus.adopted != nil ? .isSelected : [])
                    Text(focus.adopted != nil
                         ? "Pinned to memory, so every session works on it with you. Tap to remove."
                         : "Pins it to memory so your tutor works on it with you.")
                        .font(.sans(13))
                        .foregroundStyle(FW.Palette.text3)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if focus.adopted != nil {
                Label("You made this your focus.", systemImage: "checkmark.circle.fill")
                    .font(.sans(14, .medium))
                    .foregroundStyle(FW.Palette.positive)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(FW.Palette.line2))
    }

    private func checkLine(_ check: InsightReport.FocusCheck) -> some View {
        let (tag, icon, color): (String, String, Color) = switch check.verdict {
        case "yes": ("Done", "checkmark.circle.fill", FW.Palette.positive)
        case "partly": ("Partly", "circle.lefthalf.filled", FW.Palette.caution)
        case "no": ("Not yet", "xmark.circle.fill", FW.Palette.negative)
        default: ("Unclear", "questionmark.circle.fill", FW.Palette.text3)
        }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Label(tag, systemImage: icon)
                    .font(.sans(12, .semibold))
                    .foregroundStyle(color)
                    .padding(.horizontal, 9)
                    .frame(height: 24)
                    .background(color.opacity(0.14), in: .capsule)
                    .fixedSize()
                Text("Last week\(previous?.focus.map { ": \($0)" } ?? "")")
                    .font(.sans(14, .semibold))
                    .foregroundStyle(FW.Palette.text)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            PlanMoreText(text: check.note, font: .sans(14), color: FW.Palette.text2)
        }
        .padding(.bottom, 14)
        .overlay(alignment: .bottom) { Rule() }
    }

    private func toggle() {
        busy = true
        Feedback.shared.play(.tap)
        Task {
            struct Result: Decodable { let focus: InsightReport.Focus }
            do {
                let body: [String: JSON] = ["action": .string("adopt"), "id": .string(insight.id), "on": .bool(focus.adopted == nil)]
                let r: Result = try await API.post("/api/insights", body)
                withAnimation(Springs.bouncy) { focus = r.focus }
                Toasts.shared.show(r.focus.adopted != nil ? "Pinned. Your sessions will lean into it this week." : "Focus removed from memory.")
            } catch {
                Toasts.shared.show(error.localizedDescription)
            }
            busy = false
        }
    }
}

// MARK: - The week in numbers

struct InsightsStat: View {
    let value: Int
    let label: String
    var icon: String = "circle.fill"
    var color: Color = FW.Palette.text2
    var of: Int? = nil
    @Environment(\.insightsIn) private var on
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(color)
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    InsightsCount(to: Double(value))
                        .font(.rounded(26))
                        .foregroundStyle(FW.Palette.text)
                    if let of { Text("/\(of)").font(.rounded(16, .semibold)).foregroundStyle(FW.Palette.text3) }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            }
            Text(label)
                .font(.sans(13, .medium))
                .foregroundStyle(FW.Palette.text3)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            if let of {
                HStack(spacing: 4) {
                    ForEach(0..<of, id: \.self) { i in
                        Capsule()
                            .fill(i < value ? color : FW.Palette.surface3)
                            .frame(height: 5)
                            .scaleEffect(x: on ? 1 : 0.2, anchor: .leading)
                            .opacity(on ? 1 : 0)
                            .animation(reduceMotion ? nil : .spring(duration: 0.42, bounce: 0.3).delay(0.3 + Double(i) * 0.07), value: on)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Radar

// Eight grades on eight spokes. Last week sits behind as a faint outline, so
// the shape of the change reads at a glance.
struct InsightsRadar: View {
    let grades: [InsightGrade]
    let previous: [String: Double]
    @Environment(\.insightsIn) private var on
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = false
    @State private var drawn: CGFloat = 0
    @State private var settled = false

    private func score(_ k: String) -> Double? { grades.first { $0.key == k }?.score ?? nil }

    var body: some View {
        let keys = InsightGrades.keys
        let values = keys.map { max(0.04, (score($0) ?? 0) / 100) }
        let prev = keys.map { max(0.04, (previous[$0] ?? 0) / 100) }
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            let r = max(40, min(118, (w / 2 - 74) / 1.17, (h / 2 - 16) / 1.17))
            let c = CGPoint(x: w / 2, y: h / 2)
            ZStack(alignment: .topLeading) {
                ForEach([0.25, 0.5, 0.75, 1], id: \.self) { f in
                    InsightsPolygon(values: Array(repeating: f, count: keys.count), center: c, radius: r)
                        .stroke(FW.Palette.line2, lineWidth: 1)
                }
                InsightsSpokes(count: keys.count, center: c, radius: r).stroke(FW.Palette.line, lineWidth: 1)
                if !previous.isEmpty {
                    InsightsPolygon(values: prev, center: c, radius: r)
                        .stroke(FW.Palette.text3, style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
                        .opacity(settled ? 0.8 : 0)
                }
                ZStack(alignment: .topLeading) {
                    InsightsPolygon(values: values, center: c, radius: r).fill(FW.Palette.review.opacity(0.22))
                    InsightsPolygon(values: values, center: c, radius: r)
                        .trim(from: 0, to: drawn)
                        .stroke(FW.Palette.review, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
                    ForEach(Array(keys.enumerated()), id: \.offset) { i, k in
                        if let s = score(k) {
                            Circle()
                                .fill(InsightsFormat.band(s))
                                .overlay(Circle().strokeBorder(FW.Palette.bg, lineWidth: 2))
                                .frame(width: 10, height: 10)
                                .scaleEffect(settled ? 1 : 0.2)
                                .opacity(settled ? 1 : 0)
                                .animation(reduceMotion ? nil : .spring(duration: 0.5, bounce: 0.35).delay(Double(i) * 0.06), value: settled)
                                .position(InsightsPolygon.point(i, count: keys.count, value: s / 100, center: c, radius: r))
                        }
                    }
                }
                .scaleEffect(grown ? 1 : 0.01)
                .rotationEffect(.degrees(grown ? 0 : -24))
                ForEach(Array(keys.enumerated()), id: \.offset) { i, k in
                    label(k, point: InsightsPolygon.point(i, count: keys.count, value: 1.17, center: c, radius: r), center: c, width: w)
                }
            }
        }
        .frame(height: 236)
        .onAppear(perform: animate)
        .onChange(of: on) { _, _ in animate() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(grades.map { "\(InsightGrades.label[$0.key] ?? $0.key) \($0.score.map(InsightsFormat.score) ?? "not graded")" }.joined(separator: ", "))
    }

    private func label(_ key: String, point p: CGPoint, center c: CGPoint, width w: CGFloat) -> some View {
        let text = Text(InsightGrades.label[key] ?? key)
            .font(.system(size: 11.5, weight: .medium))
            .foregroundStyle(score(key) == nil ? FW.Palette.text4 : FW.Palette.text2)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        if abs(p.x - c.x) < 8 {
            return AnyView(text.fixedSize().position(p))
        }
        if p.x > c.x {
            let box = max(20, min(96, w - p.x - 2))
            return AnyView(text.frame(width: box, alignment: .leading).position(x: p.x + box / 2, y: p.y))
        }
        let box = max(20, min(96, p.x - 2))
        return AnyView(text.frame(width: box, alignment: .trailing).position(x: p.x - box / 2, y: p.y))
    }

    private func animate() {
        guard on, !grown else { return }
        if reduceMotion {
            grown = true; drawn = 1; settled = true
            return
        }
        withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 1.3).delay(0.25)) { grown = true }
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 1.6).delay(0.35)) { drawn = 1 }
        withAnimation(.easeOut(duration: 0.9).delay(0.7)) { settled = true }
    }
}

struct InsightsPolygon: Shape {
    let values: [Double]
    let center: CGPoint
    let radius: CGFloat

    static func point(_ i: Int, count: Int, value: Double, center c: CGPoint, radius r: CGFloat) -> CGPoint {
        let a = -Double.pi / 2 + Double(i) / Double(count) * Double.pi * 2
        return CGPoint(x: c.x + cos(a) * r * value, y: c.y + sin(a) * r * value)
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        for (i, v) in values.enumerated() {
            let pt = Self.point(i, count: values.count, value: v, center: center, radius: radius)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}

private struct InsightsSpokes: Shape {
    let count: Int
    let center: CGPoint
    let radius: CGFloat
    func path(in rect: CGRect) -> Path {
        var p = Path()
        for i in 0..<count {
            p.move(to: center)
            p.addLine(to: InsightsPolygon.point(i, count: count, value: 1, center: center, radius: radius))
        }
        return p
    }
}

// MARK: - Grades as rows

struct InsightsTrendPoint: Hashable { var week: String; var score: Double? }

// A grade as one line: name, bar against last week, score. The evidence and
// the trend across weeks fold out.
struct InsightsGradeRow: View {
    let grade: InsightGrade
    let prev: Double?
    let trend: [InsightsTrendPoint]
    let index: Int
    var last = false
    @Environment(\.insightsIn) private var on
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var open = false

    var body: some View {
        let g = grade
        let color = InsightsFormat.band(g.score)
        let delta = g.score.flatMap { s in prev.map { Int((s - $0).rounded()) } }
        let shown = trend.filter { $0.score != nil }.count
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(Springs.snappy) { open.toggle() }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(InsightGrades.label[g.key] ?? g.key)
                            .font(.sans(15, .semibold))
                            .foregroundStyle(FW.Palette.text)
                        Text(g.label)
                            .font(.sans(12.5, .medium))
                            .foregroundStyle(color)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    bar(color)
                        .frame(width: 76, height: 12)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        if let s = g.score {
                            InsightsCount(to: s.rounded())
                                .font(.rounded(21))
                                .foregroundStyle(color)
                        } else {
                            Text("—").font(.rounded(21)).foregroundStyle(FW.Palette.text4)
                        }
                        if let delta, delta != 0 {
                            HStack(spacing: 1) {
                                Image(systemName: delta > 0 ? "arrow.up" : "arrow.down").font(.system(size: 9, weight: .bold))
                                Text("\(abs(delta))")
                            }
                            .font(.sans(11.5, .semibold))
                            .foregroundStyle(delta > 0 ? FW.Palette.positive : FW.Palette.text3)
                            .accessibilityLabel("\(delta > 0 ? "up" : "down") \(abs(delta)) from last week")
                        }
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(width: 64, alignment: .trailing)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(FW.Palette.text4)
                        .rotationEffect(.degrees(open ? 180 : 0))
                        .frame(width: 16)
                }
                .padding(.vertical, 10)
                .frame(minHeight: 60)
                .contentShape(.rect)
            }
            .buttonStyle(.pressable(0.985))
            .accessibilityHint(open ? "Hides the evidence" : "Shows the evidence")
            if open {
                VStack(alignment: .leading, spacing: 10) {
                    Text(g.evidence)
                        .font(.sans(15))
                        .foregroundStyle(FW.Palette.text)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                    FlowLayout(spacing: 6) {
                        Text(InsightGrades.hint[g.key] ?? "").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        confidence(g.confidence)
                    }
                    if shown >= 2 { InsightsTrend(points: trend, color: color) }
                }
                .padding(.top, 2)
                .padding(.bottom, 16)
                .transition(.opacity.combined(with: .offset(y: -6)))
            }
        }
        .overlay(alignment: .bottom) { if !last { Rule() } }
    }

    private func bar(_ color: Color) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(FW.Palette.surface2).frame(height: 6)
                Capsule()
                    .fill(LinearGradient(colors: [color.opacity(0.55), color], startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width * (grade.score ?? 0) / 100, height: 6)
                    .scaleEffect(x: on ? 1 : 0, anchor: .leading)
                    .animation(reduceMotion ? nil : .timingCurve(0.16, 1, 0.3, 1, duration: 1.2).delay(Double(index) * 0.06 + 0.4), value: on)
                if let prev {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(FW.Palette.text3.opacity(0.7))
                        .frame(width: 2, height: 12)
                        .offset(x: geo.size.width * min(100, max(0, prev)) / 100 - 1)
                }
            }
            .frame(maxHeight: .infinity)
        }
        .accessibilityHidden(true)
    }

    private func confidence(_ c: String) -> some View {
        let levels = ["low", "medium", "high"]
        let n = levels.firstIndex(of: c) ?? 0
        return HStack(alignment: .bottom, spacing: 2) {
            ForEach(0..<3, id: \.self) { j in
                RoundedRectangle(cornerRadius: 1)
                    .frame(width: 3, height: [5, 8, 11][j])
                    .opacity(j <= n ? 1 : 0.3)
            }
            Text("\(c) confidence").font(.sans(12, .medium)).padding(.leading, 5)
        }
        .foregroundStyle(FW.Palette.text3)
    }
}

// The same grade over recent weeks, with the 60 anchor in a right gutter
// clear of the latest point (web: Trend).
struct InsightsTrend: View {
    let points: [InsightsTrendPoint]
    let color: Color
    private let height: CGFloat = 88, top: CGFloat = 10, bottom: CGFloat = 22, gutter: CGFloat = 52

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            let n = points.count
            let x = { (i: Int) -> CGFloat in n < 2 ? (w - gutter) / 2 : 8 + CGFloat(i) / CGFloat(n - 1) * (w - gutter - 16) }
            let y = { (s: Double) -> CGFloat in top + (1 - s / 100) * (height - top - bottom) }
            let label = Font.system(size: 10.5, weight: .medium)
            ZStack(alignment: .topLeading) {
                Path { p in
                    p.move(to: .init(x: 0, y: y(60)))
                    p.addLine(to: .init(x: w - gutter + 4, y: y(60)))
                }
                .stroke(FW.Palette.line2, style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
                Text("60 solid").font(label).foregroundStyle(FW.Palette.text3).fixedSize()
                    .frame(width: gutter - 8, alignment: .trailing)
                    .position(x: w - (gutter - 8) / 2, y: y(60))
                // Runs of graded weeks; an ungraded week breaks the line.
                Path { p in
                    var pen = false
                    for (i, pt) in points.enumerated() {
                        guard let s = pt.score else { pen = false; continue }
                        let at = CGPoint(x: x(i), y: y(s))
                        if pen { p.addLine(to: at) } else { p.move(to: at) }
                        pen = true
                    }
                }
                .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                ForEach(Array(points.enumerated()), id: \.offset) { i, pt in
                    if let s = pt.score {
                        let r: CGFloat = i == n - 1 ? 4 : 3
                        Circle()
                            .fill(InsightsFormat.band(s))
                            .overlay(Circle().stroke(FW.Palette.raised, lineWidth: 2))
                            .frame(width: r * 2, height: r * 2)
                            .position(x: x(i), y: y(s))
                    }
                }
                Text(InsightsFormat.short(points.first?.week ?? "")).font(label).foregroundStyle(FW.Palette.text3).fixedSize()
                    .frame(width: 80, alignment: .leading)
                    .position(x: x(0) + 40, y: height - 8)
                Text("This week").font(label).foregroundStyle(FW.Palette.text3).fixedSize()
                    .frame(width: 80, alignment: .trailing)
                    .position(x: x(max(0, n - 1)) - 40, y: height - 8)
            }
        }
        .frame(height: height)
        .frame(maxWidth: 420)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(points.map { "\(InsightsFormat.short($0.week)): \($0.score.map(InsightsFormat.score) ?? "not graded")" }.joined(separator: ", "))
    }
}

// MARK: - Rhythm

struct InsightsDays: View {
    let days: [InsightMetrics.DayCount]
    @Environment(\.insightsIn) private var on
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let top = max(30, days.map(\.minutes).max() ?? 0)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(Array(days.enumerated()), id: \.offset) { i, d in
                    VStack(spacing: 6) {
                        Text(d.minutes > 0 ? "\(Int(d.minutes.rounded()))" : " ")
                            .font(.sans(12))
                            .foregroundStyle(FW.Palette.text2)
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        GeometryReader { g in
                            let h = g.size.height * max(d.minutes > 0 ? 0.06 : 0, d.minutes / top)
                            ZStack(alignment: .bottom) {
                                RoundedRectangle(cornerRadius: 10).fill(FW.Palette.surface)
                                if d.minutes == 0 {
                                    InsightsHatch().stroke(FW.Palette.hatch, lineWidth: 2)
                                        .clipShape(.rect(cornerRadius: 10))
                                }
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(LinearGradient(colors: [FW.Palette.review.opacity(0.55), FW.Palette.review], startPoint: .bottom, endPoint: .top))
                                    .frame(height: h)
                                    .scaleEffect(y: on ? 1 : 0, anchor: .bottom)
                                    .animation(reduceMotion ? nil : .timingCurve(0.16, 1, 0.3, 1, duration: 0.9).delay(Double(i) * 0.07), value: on)
                            }
                            .frame(width: min(g.size.width, 34))
                            .frame(maxWidth: .infinity)
                        }
                        dots(d)
                            .frame(height: 22, alignment: .top)
                        Text(Day.date(d.date)?.formatted(.dateTime.weekday(.abbreviated)) ?? "")
                            .font(.sans(12))
                            .foregroundStyle(FW.Palette.text3)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 190)
            HStack(spacing: 6) {
                Circle().fill(FW.Palette.positive).frame(width: 5, height: 5)
                Text("answers")
                Circle().fill(FW.Palette.judgment).frame(width: 5, height: 5).padding(.leading, 8)
                Text("questions asked")
            }
            .font(.sans(13))
            .foregroundStyle(FW.Palette.text3)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(days.map { "\($0.date): \(Int($0.minutes.rounded())) minutes" }.joined(separator: ", "))
    }

    private func dots(_ d: InsightMetrics.DayCount) -> some View {
        FlowLayout(spacing: 2) {
            ForEach(0..<min(6, d.answers), id: \.self) { _ in Circle().fill(FW.Palette.positive).frame(width: 5, height: 5) }
            ForEach(0..<min(4, d.asks), id: \.self) { _ in Circle().fill(FW.Palette.judgment).frame(width: 5, height: 5) }
        }
        .frame(maxWidth: 34)
    }
}

private struct InsightsHatch: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x = rect.minX - rect.height
        while x < rect.maxX {
            p.move(to: .init(x: x, y: rect.minY))
            p.addLine(to: .init(x: x + rect.height, y: rect.maxY))
            x += 6
        }
        return p
    }
}

// A 24-hour dial: each spoke is an hour, its length how much happened then.
struct InsightsClock: View {
    let hours: [Double]
    @Environment(\.insightsIn) private var on
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let size: CGFloat = 240, c = size / 2, inner: CGFloat = 44, outer: CGFloat = 104
        let top = max(1, hours.max() ?? 0)
        let peak = hours.firstIndex(of: hours.max() ?? 0) ?? 0
        let total = hours.reduce(0, +)
        ZStack {
            Circle().fill(FW.Palette.surface).frame(width: (inner - 8) * 2, height: (inner - 8) * 2).position(x: c, y: c)
            ForEach(0..<24, id: \.self) { h in
                let v = hours[h]
                let a = -Double.pi / 2 + Double(h) / 24 * Double.pi * 2
                let len = v > 0 ? inner + (outer - inner) * v / top : inner + 3
                Path { p in
                    p.move(to: .init(x: c + cos(a) * inner, y: c + sin(a) * inner))
                    p.addLine(to: .init(x: c + cos(a) * len, y: c + sin(a) * len))
                }
                .stroke(
                    v > 0 ? (h == peak ? FW.Palette.judgment : FW.Palette.judgment.opacity(0.7)) : FW.Palette.surface3,
                    style: StrokeStyle(lineWidth: 5, lineCap: .round)
                )
                .opacity(on ? 1 : 0)
                .animation(reduceMotion ? nil : .easeOut(duration: 0.5).delay(Double(h) * 0.03), value: on)
            }
            ForEach([0, 6, 12, 18], id: \.self) { h in
                let a = -Double.pi / 2 + Double(h) / 24 * Double.pi * 2
                Text(h == 0 ? "12am" : h == 12 ? "12pm" : InsightsFormat.hour(h))
                    .font(.system(size: 10.5, weight: .medium))
                    .foregroundStyle(FW.Palette.text3)
                    .fixedSize()
                    .position(x: c + cos(a) * (outer + 14), y: c + sin(a) * (outer + 14))
            }
            VStack(spacing: 2) {
                Text(total > 0 ? InsightsFormat.hour(peak) : "—")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(FW.Palette.text)
                Text(total > 0 ? "your peak" : "no activity")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(FW.Palette.text3)
            }
            .fixedSize()
            .position(x: c, y: c)
        }
        .frame(width: size, height: size)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(total > 0 ? "Most active around \(InsightsFormat.hour(peak))" : "No activity")
    }
}

// MARK: - How your answers landed

struct InsightsAnswers: View {
    let a: InsightMetrics.Answers
    let optionalSteps: Int
    @Environment(\.insightsIn) private var on
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var parts: [(key: String, n: Int, label: String, color: Color)] {
        [("solid", a.solid, "Solid", FW.Palette.positive), ("partial", a.partial, "Partly there", FW.Palette.caution), ("missed", a.missed, "Not yet", FW.Palette.negative)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            HStack(spacing: 20) {
                donut
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(parts, id: \.key) { p in
                        HStack(spacing: 8) {
                            Dot(color: p.color)
                            Text(p.label).foregroundStyle(FW.Palette.text2).lineLimit(1).minimumScaleFactor(0.8)
                            Spacer(minLength: 12)
                            Text("\(p.n)").font(.sans(14, .medium)).foregroundStyle(FW.Palette.text).monospacedDigit()
                        }
                        .font(.sans(14))
                    }
                }
                .frame(maxWidth: .infinity)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 24, alignment: .topLeading), GridItem(.flexible(), alignment: .topLeading)], alignment: .leading, spacing: 18) {
                fact(a.avg_words.map { "\(Int($0.rounded()))" } ?? "—", "words per written answer")
                fact("\(a.retries_improved)/\(a.retries)", "retries that closed the gap")
                fact("\(a.skipped)", "questions skipped")
                fact("\(optionalSteps)", "optional steps taken")
            }
            if a.calibration.total > 0 { calibration }
        }
    }

    private var donut: some View {
        let total = Double(max(1, a.total))
        var offset = 0.0
        let segs: [(from: Double, to: Double, color: Color)] = parts.map { p in
            let len = a.total > 0 ? Double(p.n) / total : 0
            defer { offset += len }
            return (offset, offset + max(0, len - 0.006), p.color)
        }
        return ZStack {
            Circle().stroke(FW.Palette.surface2, lineWidth: 14)
            ForEach(Array(segs.enumerated()), id: \.offset) { i, s in
                Circle()
                    .trim(from: s.from, to: on ? s.to : s.from)
                    .stroke(s.color, style: StrokeStyle(lineWidth: 14, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
                    .animation(reduceMotion ? nil : .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.9).delay(0.2 + Double(i) * 0.18), value: on)
            }
            VStack(spacing: 2) {
                Text(a.avg_score.map { "\(Int(($0 * 100).rounded()))" } ?? "—")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(FW.Palette.text)
                    .monospacedDigit()
                Text("average score")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(FW.Palette.text3)
            }
        }
        .padding(7)
        .frame(width: 136, height: 136)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(parts.map { "\($0.label) \($0.n)" }.joined(separator: ", "))
    }

    private func fact(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.sans(26, .medium)).foregroundStyle(FW.Palette.text).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var calibration: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Right when…").font(.sans(13)).foregroundStyle(FW.Palette.text3)
            ForEach(Array([("low", "guessing"), ("medium", "fairly sure"), ("high", "certain")].enumerated()), id: \.offset) { i, row in
                let p = a.calibration.pct(row.0)
                HStack(spacing: 10) {
                    Text(row.1).frame(width: 84, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(FW.Palette.surface2)
                            Capsule().fill(FW.Palette.review)
                                .frame(width: g.size.width * Double(p ?? 0) / 100)
                                .scaleEffect(x: on ? 1 : 0, anchor: .leading)
                                .animation(reduceMotion ? nil : .timingCurve(0.16, 1, 0.3, 1, duration: 1.1).delay(0.3 + Double(i) * 0.12), value: on)
                        }
                    }
                    .frame(height: 6)
                    Text(p.map { "\($0)%" } ?? "—").monospacedDigit().frame(width: 40, alignment: .trailing)
                }
                .font(.sans(13))
                .foregroundStyle(FW.Palette.text2)
            }
        }
    }
}

// MARK: - Folded detail

// A folded card: a tinted glyph, a title and a one-line teaser; the detail
// draws as it opens.
struct InsightsDisclosure<Content: View>: View {
    let title: String
    let teaser: String
    var icon: String = "chevron.down"
    var color: Color = FW.Palette.text2
    @ViewBuilder var content: () -> Content
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(Springs.snappy) { open.toggle() }
            } label: {
                HStack(spacing: 14) {
                    IconBadge(systemName: icon, color: color, size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).font(.sans(16, .semibold)).foregroundStyle(FW.Palette.text)
                        if !teaser.isEmpty {
                            Text(teaser)
                                .font(.sans(13))
                                .foregroundStyle(FW.Palette.text3)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FW.Palette.text4)
                        .rotationEffect(.degrees(open ? 180 : 0))
                }
                .padding(.vertical, 12)
                .frame(minHeight: 60)
                .contentShape(.rect)
            }
            .buttonStyle(.pressable(0.985))
            .accessibilityAddTraits(open ? .isSelected : [])
            if open {
                content()
                    // Folded content draws as the fold opens.
                    .environment(\.insightsIn, true)
                    .padding(.top, 8)
                    .padding(.bottom, 18)
                    .transition(.opacity.combined(with: .offset(y: -6)))
            }
        }
        .padding(.horizontal, 14)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
    }
}

// The model's observations as short cards: a glyph, a title, two lines
// that open with "More".
private struct InsightsNote: View {
    let icon: String
    let color: Color
    var kind: String? = nil
    let title: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            IconBadge(systemName: icon, color: color, size: 36, circle: true)
            VStack(alignment: .leading, spacing: 4) {
                if let kind {
                    Text(kind).font(.sans(12, .semibold)).foregroundStyle(color)
                }
                Text(title)
                    .font(.sans(16, .semibold))
                    .foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                PlanMoreText(text: text, font: .sans(15), color: FW.Palette.text2)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
    }
}

struct InsightsPatterns: View {
    let patterns: [InsightReport.Pattern]

    var body: some View {
        VStack(spacing: 10) {
            ForEach(Array(patterns.enumerated()), id: \.offset) { i, p in
                let (kind, icon, color): (String, String, Color) = switch p.kind {
                case "strength": ("Strength", "bolt.fill", FW.Palette.positive)
                case "watch": ("Watch", "eye.fill", FW.Palette.caution)
                default: ("Noticed", "lightbulb.fill", FW.Palette.review)
                }
                InsightsNote(icon: icon, color: color, kind: kind, title: p.title, text: p.body)
                    .rise(i)
            }
        }
    }
}

struct InsightsMind: View {
    let mind: [InsightReport.Mind]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(mind.enumerated()), id: \.offset) { i, m in
                InsightsNote(icon: "brain.head.profile", color: FW.Palette.judgment, title: m.title, text: m.body)
                    .rise(i)
            }
            Label("Observations from how you worked this week, not a diagnosis of anything.", systemImage: "info.circle")
                .font(.sans(13))
                .foregroundStyle(FW.Palette.text3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
        }
    }
}

// MARK: - Ask about this week

// A question about the read, answered from the same week's numbers.
struct InsightsAsk: View {
    let id: String
    let lowest: InsightGrade?
    @State private var q = ""
    @State private var thread: [(q: String, a: String)] = []
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        let suggestions = [
            lowest.flatMap { g in g.score.map { "Why is \((InsightGrades.label[g.key] ?? g.key).lowercased()) \(InsightsFormat.score($0))?" } },
            "What should I change first?",
            "What went best this week?",
        ].compactMap { $0 }
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                IconBadge(systemName: "bubble.left.and.text.bubble.right.fill", color: FW.Palette.judgment, size: 32)
                Text("Ask about this week").font(.sans(20, .bold)).foregroundStyle(FW.Palette.text)
            }
            ForEach(Array(thread.enumerated()), id: \.offset) { _, t in
                VStack(alignment: .leading, spacing: 10) {
                    Text(t.q)
                        .font(.sans(15, .medium))
                        .foregroundStyle(FW.Palette.onAccent)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(FW.Palette.accent, in: .rect(cornerRadius: 18, style: .continuous))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Text(t.a)
                        .font(.sans(16))
                        .foregroundStyle(FW.Palette.text)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(FW.Palette.raised, in: .rect(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(FW.Palette.line))
                }
                .transition(.opacity.combined(with: .offset(y: 8)))
            }
            if busy { ShimmerText(text: "Thinking…").transition(.opacity) }
            if thread.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(suggestions, id: \.self) { s in
                        Button { ask(s) } label: {
                            Text(s)
                                .font(.sans(14, .medium))
                                .foregroundStyle(FW.Palette.text)
                                .lineLimit(1)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 36)
                                .background(FW.Palette.raised, in: .capsule)
                                .overlay(Capsule().strokeBorder(FW.Palette.line2))
                        }
                        .buttonStyle(.pressable)
                        .disabled(busy)
                    }
                }
            }
            HStack(spacing: 10) {
                TextField("Why did retention drop?", text: $q)
                    .font(.sans(16))
                    .foregroundStyle(FW.Palette.text)
                    .submitLabel(.send)
                    .focused($focused)
                    .onSubmit { ask(q) }
                    .onChange(of: q) { _, v in if v.count > 300 { q = String(v.prefix(300)) } }
                    .padding(.horizontal, 18)
                    .frame(minHeight: 48)
                    .background(FW.Palette.raised, in: .capsule)
                    .overlay(Capsule().strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line2))
                    .accessibilityLabel("Your question about this week")
                let ok = q.trimmingCharacters(in: .whitespaces).count >= 3 && !busy
                Button { ask(q) } label: {
                    Group {
                        if busy { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "arrow.up").font(.system(size: 16, weight: .semibold)) }
                    }
                    .frame(width: 48, height: 48)
                    .foregroundStyle(FW.Palette.onAccent)
                    .background(FW.Palette.accent, in: .circle)
                }
                .buttonStyle(.pressable)
                .disabled(!ok)
                .opacity(ok || busy ? 1 : 0.4)
                .animation(Springs.snappy, value: ok)
                .accessibilityLabel("Ask")
            }
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Ask about this week")
    }

    private func ask(_ question: String) {
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= 3, !busy else { return }
        busy = true
        error = nil
        Task {
            struct Answer: Decodable { let answer: String }
            do {
                let body: [String: JSON] = ["action": .string("ask"), "id": .string(id), "question": .string(text)]
                let r: Answer = try await API.post("/api/insights", body)
                withAnimation(Springs.smooth) { thread.append((text, r.answer)) }
                q = ""
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

// MARK: - How grades work

struct InsightsHowGrades: View {
    var body: some View {
        SheetScaffold(title: "How grades work", subtitle: "The same fixed anchors every week.") {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(InsightGrades.bands, id: \.from) { b in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(b.from)–\(b.to)")
                            .font(.sans(15, .medium))
                            .foregroundStyle(InsightsFormat.band(Double(b.from)))
                            .monospacedDigit()
                            .frame(width: 64, alignment: .leading)
                        Text(band(b.label, b.note))
                            .font(.sans(14))
                            .foregroundStyle(FW.Palette.text2)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            Text("60 means doing what the plan asks, well. Grades aren’t adjusted to encourage you or to push you, and an area without enough evidence is left ungraded rather than guessed.")
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(InsightGrades.keys, id: \.self) { k in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(InsightGrades.label[k] ?? k)
                            .font(.sans(14, .semibold))
                            .foregroundStyle(FW.Palette.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(width: 120, alignment: .leading)
                        Text(InsightGrades.hint[k] ?? "")
                            .font(.sans(14))
                            .foregroundStyle(FW.Palette.text2)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(.top, 16)
            .overlay(alignment: .top) { Rule() }
        }
        .presentationDetents([.medium, .large])
    }

    private func band(_ label: String, _ note: String) -> AttributedString {
        var b = AttributedString(label)
        b.font = .sans(14, .semibold)
        b.foregroundColor = FW.Palette.text
        return b + AttributedString(" " + note)
    }
}

// MARK: - First read and waiting

// A slowly turning ring in the three hues of the read.
struct InsightsOrb: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var turn = false

    var body: some View {
        Circle()
            .strokeBorder(
                AngularGradient(colors: [FW.Palette.review, FW.Palette.judgment, FW.Palette.positive, FW.Palette.review], center: .center),
                lineWidth: 14
            )
            .padding(10)
            .frame(width: 120, height: 120)
            .rotationEffect(.degrees(turn ? 360 : 0))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 14).repeatForever(autoreverses: false)) { turn = true }
            }
            .accessibilityHidden(true)
    }
}

struct InsightsGenerating: View {
    private let lines = ["Gathering the week", "Measuring time and follow-through", "Reading your answers", "Weighing the evidence", "Writing it up"]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var i = 0

    var body: some View {
        VStack(spacing: 14) {
            TimelineView(.animation(paused: reduceMotion)) { ctx in
                let t = ctx.date.timeIntervalSinceReferenceDate
                ZStack {
                    ForEach(0..<3, id: \.self) { k in
                        let color = [FW.Palette.review, FW.Palette.judgment, FW.Palette.positive][k]
                        let p = reduceMotion ? [0.45, 0.7, 0.95][k] : ((t + Double(k)) .truncatingRemainder(dividingBy: 3)) / 3
                        let eased = 1 - pow(1 - p, 3)
                        Circle()
                            .strokeBorder(color, lineWidth: 1.5)
                            .scaleEffect(0.3 + 0.7 * eased)
                            .opacity(reduceMotion ? 0.6 : 0.9 * (1 - eased))
                    }
                }
                .frame(width: 120, height: 120)
            }
            .padding(.bottom, 12)
            .accessibilityHidden(true)
            ShimmerText(text: "\(lines[i])…", font: .sans(20, .bold))
                .id(i)
                .transition(.blurReplace)
            Text("Astra is reading your week. This takes a minute or two, and you can leave; it will be here when you come back.")
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 48)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
        .task {
            while !Task.isCancelled, i < lines.count - 1 {
                try? await Task.sleep(for: .seconds(6))
                if Task.isCancelled { return }
                withAnimation(Springs.smooth) { i = min(lines.count - 1, i + 1) }
            }
        }
    }
}
