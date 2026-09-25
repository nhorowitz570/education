import SwiftUI

// Insights (src/components/insights/insights.tsx): once a week, a read of
// how the learner actually learned, graded against fixed anchors. One week
// at a time; the page checks back while a read is being written.
struct InsightsView: View {
    @Environment(Router.self) private var router
    @State private var data: InsightsData? = LoaderCache.values["/api/insights"] as? InsightsData
    @State private var error: String?
    @State private var id: String?
    @State private var starting = false
    @State private var startError: String?
    @State private var marked: String?
    @State private var howOpen = false

    private var path: String { id.map { "/api/insights?id=\($0)" } ?? "/api/insights" }
    private var insight: InsightRow? { data?.insight }
    private var generating: Bool { insight?.status == "generating" || (starting && insight == nil) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                states
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 4)
            .padding(.bottom, 96)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("Insights")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("How grades work", systemImage: "info.circle") { howOpen = true }
            }
        }
        .sheet(isPresented: $howOpen) { InsightsHowGrades() }
        .refreshable { await load() }
        .task { await load() }
        // While a read is being written, check back every few seconds.
        .task(id: generating) {
            while generating, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4))
                if Task.isCancelled { return }
                await load()
            }
        }
        // Opening a fresh read marks it seen, which clears Today's notice.
        .onChange(of: insight?.id, initial: true) { _, _ in markSeen() }
        .onChange(of: insight?.status) { _, _ in markSeen() }
    }

    private func load() async {
        let path = self.path
        do {
            let d: InsightsData = try await API.get(path)
            guard path == self.path else { return }
            withAnimation(Springs.smooth) { data = d }
            error = nil
            LoaderCache.values[path] = d
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = error.localizedDescription }
        }
    }

    private func pick(_ week: String) {
        Feedback.shared.play(.tap)
        id = week
        if let cached = LoaderCache.values[path] as? InsightsData { withAnimation(Springs.smooth) { data = cached } }
        Task { await load() }
    }

    private func markSeen() {
        guard let i = insight, i.status == "ready", i.seen_at == nil, marked != i.id else { return }
        marked = i.id
        Task {
            let body: [String: JSON] = ["action": .string("seen"), "id": .string(i.id)]
            let _: JSON? = try? await API.post("/api/insights", body)
        }
    }

    private func start() {
        starting = true
        startError = nil
        Feedback.shared.play(.tap)
        Task {
            do {
                let body: [String: JSON] = ["action": .string("generate")]
                let _: JSON = try await API.post("/api/insights", body)
                await load()
            } catch {
                startError = error.localizedDescription
            }
            starting = false
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Your week, read honestly.")
                .font(.sans(15))
                .foregroundStyle(FW.Palette.text3)
            if let i = insight, let d = data { stepper(d.weeks, current: i) }
        }
        .rise(0)
    }

    // One week at a time, stepped through like pages.
    private func stepper(_ weeks: [InsightSummary], current: InsightRow) -> some View {
        let i = weeks.firstIndex { $0.id == current.id }
        let older = i.flatMap { $0 + 1 < weeks.count ? weeks[$0 + 1] : nil }
        let newer = i.flatMap { $0 > 0 ? weeks[$0 - 1] : nil }
        return HStack(spacing: 0) {
            Button { if let older { pick(older.id) } } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44).contentShape(.rect)
            }
            .disabled(older == nil)
            .opacity(older == nil ? 0.25 : 1)
            .accessibilityLabel("Earlier week")
            Spacer(minLength: 4)
            HStack(spacing: 8) {
                Image(systemName: "calendar")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FW.Palette.review)
                Text(InsightsFormat.range(current.week_start, current.week_end))
                    .font(.sans(16, .semibold))
                    .foregroundStyle(FW.Palette.text)
                    .monospacedDigit()
                    .lineLimit(1)
                    .contentTransition(.numericText())
                if newer == nil {
                    Text("Latest")
                        .font(.sans(12, .semibold))
                        .foregroundStyle(FW.Palette.positive)
                        .padding(.horizontal, 8)
                        .frame(height: 22)
                        .background(FW.Palette.positive.opacity(0.14), in: .capsule)
                        .transition(.opacity.combined(with: .scale(0.9)))
                }
            }
            Spacer(minLength: 4)
            Button { if let newer { pick(newer.id) } } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 44).contentShape(.rect)
            }
            .disabled(newer == nil)
            .opacity(newer == nil ? 0.25 : 1)
            .accessibilityLabel("Later week")
        }
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(FW.Palette.text)
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
        .background(FW.Palette.raised, in: .capsule)
        .overlay(Capsule().strokeBorder(FW.Palette.line))
        .animation(Springs.snappy, value: current.id)
    }

    // MARK: States

    @ViewBuilder
    private var states: some View {
        if data == nil, error == nil {
            VStack(alignment: .leading, spacing: 14) {
                Skeleton(height: 150, radius: FW.Radius.lg)
                HStack(spacing: 12) {
                    Skeleton(height: 84, radius: FW.Radius.lg)
                    Skeleton(height: 84, radius: FW.Radius.lg)
                }
                Skeleton(height: 200, radius: FW.Radius.lg)
            }
            .padding(.top, 24)
        }
        if let error, data == nil {
            VStack(alignment: .leading, spacing: 10) {
                Text("Insights couldn’t load.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                ErrorNote(message: error) { Task { await load() } }
            }
            .padding(.top, 28)
        }
        if data != nil, insight == nil, !starting {
            centered {
                InsightsOrb().padding(.bottom, 8)
                Text("Your first read").font(.sans(22, .bold)).foregroundStyle(FW.Palette.text)
                Text("Once a week, Fieldwork looks at how you actually learned.")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                FlowLayout(spacing: 8) {
                    Pill(text: "Time", icon: "clock", color: FW.Palette.review)
                    Pill(text: "Follow-through", icon: "checkmark.circle", color: FW.Palette.positive)
                    Pill(text: "Curiosity", icon: "questionmark.bubble", color: FW.Palette.judgment)
                    Pill(text: "What stuck", icon: "brain", color: FW.Palette.coral)
                }
                .padding(.vertical, 4)
                Button { start() } label: { Label("Read my last seven days", systemImage: "scope") }
                    .buttonStyle(.fw(.primary, wide: true))
                    .padding(.top, 4)
                Text("Each area is graded against fixed anchors. A new read arrives every Monday.")
                    .font(.sans(13))
                    .foregroundStyle(FW.Palette.text3)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if let startError { errorLine(startError) }
            }
        }
        if generating { InsightsGenerating() }
        if let i = insight, i.status == "failed" {
            centered {
                IconBadge(systemName: "exclamationmark.arrow.trianglehead.counterclockwise", color: FW.Palette.caution, size: 64, circle: true)
                    .padding(.bottom, 6)
                Text("This read didn’t finish.").font(.sans(20, .bold)).foregroundStyle(FW.Palette.text)
                Text("Something went wrong while it was being written. Nothing was lost.")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button { start() } label: {
                    HStack(spacing: 8) {
                        if starting { ProgressView().tint(FW.Palette.onAccent) }
                        Text("Try again")
                    }
                }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(starting)
                if let startError { errorLine(startError) }
            }
        }
        if let i = insight, i.status == "ready", i.report == nil {
            centered {
                IconBadge(systemName: "moon.zzz.fill", color: FW.Palette.review, size: 64, circle: true)
                    .padding(.bottom, 6)
                Text(InsightsFormat.range(i.week_start, i.week_end)).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3)
                Text("A quiet week.").font(.sans(20, .bold)).foregroundStyle(FW.Palette.text)
                Text("There was no learning activity to read. Rest weeks count too; the next read arrives Monday.")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Back to Today") { router.open("/") }.buttonStyle(.fw(.primary, wide: true))
            }
        }
        if let i = insight, i.status == "ready", let report = i.report, let metrics = i.metrics {
            let ready = (data?.weeks ?? []).filter { $0.status == "ready" }
            InsightsReportView(
                insight: i,
                report: report,
                metrics: metrics,
                previous: ready.first { $0.week_start < i.week_start },
                weeks: ready,
                latest: ready.first?.id == i.id,
                onHow: { howOpen = true }
            )
            .id(i.id)
            .transition(.opacity)
        }
    }

    private func centered<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(spacing: 14) { content() }
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
            .padding(.top, 40)
            .insightsReveal()
    }

    private func errorLine(_ s: String) -> some View {
        Text(s).font(.sans(14)).foregroundStyle(FW.Palette.negative).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
    }
}

// The read itself: the headline and the week in numbers first, then the
// focus, the grades, the moment, the observations as short cards, the folded
// detail, asking about it, and how it was written.
private struct InsightsReportView: View {
    let insight: InsightRow
    let report: InsightReport
    let metrics: InsightMetrics
    let previous: InsightSummary?
    let weeks: [InsightSummary]
    let latest: Bool
    let onHow: () -> Void

    var body: some View {
        let t = metrics.totals
        let a = metrics.answers
        let prev: [String: Double] = Dictionary(
            (previous?.grades ?? []).compactMap { g in g.score.map { (g.key, $0) } },
            uniquingKeysWith: { x, _ in x }
        )
        let graded = report.grades.filter { $0.score != nil }
        let overall = graded.isEmpty ? nil : (graded.compactMap(\.score).reduce(0, +) / Double(graded.count)).rounded()
        let peak = metrics.by_hour.firstIndex(of: metrics.by_hour.max() ?? 0) ?? 0
        let hasHours = metrics.by_hour.contains { $0 > 0 }
        let lowest = graded.min { ($0.score ?? 0) < ($1.score ?? 0) }
        let kinds = Dictionary(grouping: report.patterns, by: \.kind).mapValues(\.count)
        VStack(alignment: .leading, spacing: 28) {
            hero
                .padding(.top, 20)
                .insightsReveal()

            // The week in numbers.
            VStack(alignment: .leading, spacing: 12) {
                SectionHead(title: "The week in numbers")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
                    InsightsStat(value: t.minutes, label: "minutes learning", icon: "clock.fill", color: FW.Palette.review)
                    InsightsStat(value: t.days_active, label: "days active", icon: "flame.fill", color: FW.Palette.coral, of: 7)
                    InsightsStat(value: t.sessions_finished, label: "session\(t.sessions_finished == 1 ? "" : "s") finished", icon: "checkmark.circle.fill", color: FW.Palette.positive)
                    InsightsStat(value: t.answers, label: "answer\(t.answers == 1 ? "" : "s")", icon: "text.bubble.fill", color: FW.Palette.judgment)
                }
                FlowLayout(spacing: 8) {
                    Pill(text: InsightsFormat.plural(t.words_written, "word") + " written", icon: "pencil", color: FW.Palette.text2)
                    Pill(text: InsightsFormat.plural(t.questions_asked, "question") + " asked", icon: "questionmark.bubble", color: FW.Palette.judgment)
                    if t.words_spoken > 0 {
                        Pill(text: InsightsFormat.plural(t.words_spoken, "word") + " spoken", icon: "waveform", color: FW.Palette.communication)
                    }
                    if t.practices > 0 {
                        Pill(text: InsightsFormat.plural(t.practices, "practice conversation"), icon: "person.2.fill", color: FW.Palette.finance)
                    }
                }
                InsightsCard(title: "Day by day", icon: "chart.bar.fill", color: FW.Palette.review) {
                    InsightsDays(days: metrics.by_day)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("The week in numbers")
            .insightsReveal()

            InsightsFocusCard(insight: insight, report: report, previous: previous, latest: latest)
                .insightsReveal()

            // Grades.
            VStack(alignment: .leading, spacing: 12) {
                SectionHead(title: "Eight areas", trailing: overall.map { _ in "\(graded.count) graded" })
                VStack(spacing: 6) {
                    InsightsRadar(grades: report.grades, previous: prev)
                    if let overall {
                        VStack(spacing: 0) {
                            InsightsCount(to: overall)
                                .font(.rounded(44))
                                .foregroundStyle(InsightsFormat.band(overall))
                            Text("overall, across \(graded.count) areas").font(.sans(13, .medium)).foregroundStyle(FW.Palette.text3)
                        }
                    }
                }
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity)
                .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
                VStack(spacing: 0) {
                    ForEach(Array(InsightGrades.keys.enumerated()), id: \.offset) { i, k in
                        if let g = report.grades.first(where: { $0.key == k }) {
                            InsightsGradeRow(grade: g, prev: prev[k], trend: trend(k), index: i, last: k == InsightGrades.keys.last)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
                Label("Tap an area for the evidence. The tick marks last week.", systemImage: "hand.tap")
                    .font(.sans(13))
                    .foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .insightsReveal()

            if let m = report.moment {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        IconBadge(systemName: "quote.opening", color: FW.Palette.coral, size: 32)
                        Text("Moment of the week").font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text2)
                    }
                    // The learner's own words keep the reading face.
                    Text("“\(m.quote)”")
                        .font(.serif(21))
                        .foregroundStyle(FW.Palette.text)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                    PlanMoreText(text: m.why, font: .sans(15), color: FW.Palette.text2)
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
                .insightsReveal()
            }

            if !report.patterns.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHead(title: "How you learn", trailing: [
                        kinds["strength"].map { InsightsFormat.plural($0, "strength") },
                        kinds["watch"].map { "\($0) to watch" },
                    ].compactMap { $0 }.joined(separator: " · "))
                    InsightsPatterns(patterns: report.patterns)
                }
                .insightsReveal()
            }

            if !report.mind.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHead(title: "Behind the numbers")
                    InsightsMind(mind: report.mind)
                }
                .insightsReveal()
            }

            VStack(alignment: .leading, spacing: 12) {
                SectionHead(title: "In detail")
                VStack(spacing: 10) {
                    InsightsDisclosure(
                        title: "When you learn",
                        teaser: InsightsFormat.plural(t.days_active, "active day") + (hasHours ? " · peak \(InsightsFormat.hour(peak))" : ""),
                        icon: "clock.fill",
                        color: FW.Palette.judgment
                    ) {
                        InsightsClock(hours: metrics.by_hour)
                    }
                    if a.total > 0 {
                        InsightsDisclosure(
                            title: "How your answers landed",
                            teaser: InsightsFormat.plural(a.total, "answer") + (a.avg_score.map { " · avg \(Int(($0 * 100).rounded()))" } ?? "") + " · \(a.solid) solid",
                            icon: "chart.pie.fill",
                            color: FW.Palette.positive
                        ) {
                            InsightsAnswers(a: a, optionalSteps: metrics.schedule.optional_steps_taken)
                        }
                    }
                }
            }
            .insightsReveal()

            InsightsAsk(id: insight.id, lowest: lowest)
                .insightsReveal()

            Button(action: onHow) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: "sparkles").font(.system(size: 12, weight: .semibold))
                    Text(footer(t))
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.sans(13))
                .foregroundStyle(FW.Palette.text3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows how grades work")
            .insightsReveal()
        }
    }

    // The one hero on the page: a short bold headline over a slow wash.
    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: previous != nil ? "arrow.left.arrow.right" : "sparkles")
                    .font(.system(size: 12, weight: .bold))
                Text(previous != nil ? "Compared with the week before" : "Your first read")
                    .font(.sans(13, .semibold))
            }
            .foregroundStyle(FW.Palette.text2)
            Text(report.headline)
                .font(.sans(24, .bold))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            PlanMoreText(text: report.summary, font: .sans(16), color: FW.Palette.text2)
            if let note = report.data_note, !note.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "info.circle.fill").font(.system(size: 13))
                    Text(note).fixedSize(horizontal: false, vertical: true)
                }
                .font(.sans(13, .medium))
                .foregroundStyle(FW.Palette.text2)
                .padding(.vertical, 9)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FW.Palette.bg.opacity(0.6), in: .rect(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            Aurora(colors: [FW.Palette.review, FW.Palette.judgment, FW.Palette.positive], intensity: 0.32)
                .clipShape(.rect(cornerRadius: FW.Radius.xl, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(FW.Palette.line))
    }

    // Up to eight weeks of each grade, oldest first, ending at this one.
    private func trend(_ key: String) -> [InsightsTrendPoint] {
        weeks.filter { $0.week_start <= insight.week_start }
            .prefix(8)
            .reversed()
            .map { w in InsightsTrendPoint(week: w.week_start, score: w.grades.first { $0.key == key }?.score ?? nil) }
    }

    private func footer(_ t: InsightMetrics.Totals) -> AttributedString {
        let by = insight.model?.lowercased().contains("astra") == true ? "Astra" : "the reasoning model"
        var text = AttributedString("Written by \(by) from \(InsightsFormat.plural(t.answers + t.questions_asked + t.steps_done, "measured moment")). ")
        var link = AttributedString("How grades work")
        link.underlineStyle = .single
        link.foregroundColor = FW.Palette.text2
        text += link
        return text
    }
}

// A titled chart card with a tinted glyph.
private struct InsightsCard<Content: View>: View {
    let title: String
    let icon: String
    let color: Color
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                IconBadge(systemName: icon, color: color, size: 30)
                Text(title).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
    }
}
