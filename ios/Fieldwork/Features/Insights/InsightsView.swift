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
            .padding(.top, 8)
            .padding(.bottom, 96)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
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
            data = d
            error = nil
            LoaderCache.values[path] = d
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = error.localizedDescription }
        }
    }

    private func pick(_ week: String) {
        id = week
        if let cached = LoaderCache.values[path] as? InsightsData { data = cached }
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
        VStack(alignment: .leading, spacing: 10) {
            Kicker("Insights")
            Text("Your week, read honestly.")
                .font(.display(34))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if let i = insight, let d = data { stepper(d.weeks, current: i).padding(.top, 6) }
        }
        .padding(.top, 4)
    }

    // One week at a time, stepped through like pages.
    private func stepper(_ weeks: [InsightSummary], current: InsightRow) -> some View {
        let i = weeks.firstIndex { $0.id == current.id }
        let older = i.flatMap { $0 + 1 < weeks.count ? weeks[$0 + 1] : nil }
        let newer = i.flatMap { $0 > 0 ? weeks[$0 - 1] : nil }
        return HStack(spacing: 2) {
            Button { if let older { pick(older.id) } } label: {
                Image(systemName: "chevron.left").frame(width: 34, height: 34).contentShape(.rect)
            }
            .disabled(older == nil)
            .opacity(older == nil ? 0.25 : 1)
            .accessibilityLabel("Earlier week")
            Text(InsightsFormat.range(current.week_start, current.week_end))
                .font(.sans(14))
                .foregroundStyle(FW.Palette.text)
                .monospacedDigit()
                .lineLimit(1)
                .frame(minWidth: 108)
                .padding(.horizontal, 6)
                .contentTransition(.opacity)
            Button { if let newer { pick(newer.id) } } label: {
                Image(systemName: "chevron.right").frame(width: 34, height: 34).contentShape(.rect)
            }
            .disabled(newer == nil)
            .opacity(newer == nil ? 0.25 : 1)
            .accessibilityLabel("Later week")
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(FW.Palette.text)
        .buttonStyle(.plain)
        .padding(3)
        .background(FW.Palette.surface, in: .rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(FW.Palette.line))
    }

    // MARK: States

    @ViewBuilder
    private var states: some View {
        if data == nil, error == nil {
            VStack(alignment: .leading, spacing: 0) {
                Skeleton(width: 140, height: 12)
                Skeleton(height: 44).frame(maxWidth: 280, alignment: .leading).padding(.top, 16)
                Skeleton(height: 120, radius: FW.Radius.lg).padding(.top, 28)
            }
            .padding(.top, 28)
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
                InsightsOrb().padding(.bottom, 12)
                Text("Your first read").font(.sans(18, .semibold)).foregroundStyle(FW.Palette.text)
                Text("Once a week, Fieldwork looks at how you actually learned: time, follow-through, curiosity, what stuck and what didn’t. Each area is graded against fixed anchors. A new read arrives every Monday.")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button { start() } label: { Label("Read my last seven days", systemImage: "scope") }
                    .buttonStyle(.fw(.primary))
                if let startError { errorLine(startError) }
            }
        }
        if generating { InsightsGenerating() }
        if let i = insight, i.status == "failed" {
            centered {
                Text("This read didn’t finish.").font(.sans(18, .semibold)).foregroundStyle(FW.Palette.text)
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
                .buttonStyle(.fw(.primary))
                .disabled(starting)
                if let startError { errorLine(startError) }
            }
        }
        if let i = insight, i.status == "ready", i.report == nil {
            centered {
                Kicker(InsightsFormat.range(i.week_start, i.week_end))
                Text("A quiet week.").font(.sans(18, .semibold)).foregroundStyle(FW.Palette.text)
                Text("There was no learning activity to read. Rest weeks count too; the next read arrives Monday.")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Back to Today") { router.open("/") }.buttonStyle(.fw(.primary))
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
                latest: ready.first?.id == i.id
            )
            .id(i.id)
        }
    }

    private func centered<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(spacing: 14) { content() }
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .insightsReveal()
    }

    private func errorLine(_ s: String) -> some View {
        Text(s).font(.sans(14)).foregroundStyle(FW.Palette.negative).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
    }
}

// The read itself: hero, focus, numbers, grades, moment, the folded detail,
// asking about it, and how it was written.
private struct InsightsReportView: View {
    let insight: InsightRow
    let report: InsightReport
    let metrics: InsightMetrics
    let previous: InsightSummary?
    let weeks: [InsightSummary]
    let latest: Bool
    @State private var howOpen = false

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
        VStack(alignment: .leading, spacing: 40) {
            hero
                .padding(.top, 28)
                .insightsReveal()
            InsightsFocusCard(insight: insight, report: report, previous: previous, latest: latest)
                .insightsReveal()
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    InsightsStat(value: t.minutes, label: "minutes learning")
                    InsightsStat(value: t.days_active, label: "days active", of: 7)
                    InsightsStat(value: t.sessions_finished, label: "session\(t.sessions_finished == 1 ? "" : "s") finished")
                }
                .fixedSize(horizontal: false, vertical: true)
                Text(secondary(t).joined(separator: " · "))
                    .font(.sans(14))
                    .foregroundStyle(FW.Palette.text3)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("The week in numbers")
            .insightsReveal()
            VStack(alignment: .leading, spacing: 20) {
                VStack(spacing: 8) {
                    InsightsRadar(grades: report.grades, previous: prev)
                    if let overall {
                        VStack(spacing: 0) {
                            InsightsCount(to: overall)
                                .font(.sans(44, .medium))
                                .foregroundStyle(FW.Palette.text)
                            Text("across \(graded.count) graded areas").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 0) {
                    Rule()
                    ForEach(Array(InsightGrades.keys.enumerated()), id: \.offset) { i, k in
                        if let g = report.grades.first(where: { $0.key == k }) {
                            InsightsGradeRow(grade: g, prev: prev[k], trend: trend(k), index: i)
                        }
                    }
                    Text("Tap an area for the evidence. The tick marks last week.")
                        .font(.sans(13))
                        .foregroundStyle(FW.Palette.text3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                }
            }
            .insightsReveal()
            if let m = report.moment {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker("Moment of the week")
                    Text("“\(m.quote)”")
                        .font(.display(26))
                        .foregroundStyle(FW.Palette.text)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 12)
                        .padding(.bottom, 14)
                    Text(m.why)
                        .font(.sans(15))
                        .foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 16)
                .insightsReveal()
            }
            VStack(spacing: 0) {
                InsightsDisclosure(
                    title: "Rhythm",
                    teaser: InsightsFormat.plural(t.days_active, "active day") + (hasHours ? " · most active around \(InsightsFormat.hour(peak))" : "")
                ) {
                    VStack(spacing: 16) {
                        card("Day by day") { InsightsDays(days: metrics.by_day) }
                        card("When you learn") { InsightsClock(hours: metrics.by_hour) }
                    }
                }
                if a.total > 0 {
                    InsightsDisclosure(
                        title: "How your answers landed",
                        teaser: InsightsFormat.plural(a.total, "answer") + (a.avg_score.map { " · average \(Int(($0 * 100).rounded()))" } ?? "") + " · \(a.solid) solid"
                    ) {
                        card(nil) { InsightsAnswers(a: a, optionalSteps: metrics.schedule.optional_steps_taken) }
                    }
                }
                if !report.patterns.isEmpty {
                    InsightsDisclosure(
                        title: "How you learn",
                        teaser: [
                            kinds["strength"].map { InsightsFormat.plural($0, "strength") },
                            kinds["watch"].map { "\($0) to watch" },
                            kinds["observation"].map { "\($0) noticed" },
                        ].compactMap { $0 }.joined(separator: " · ")
                    ) {
                        InsightsPatterns(patterns: report.patterns)
                    }
                }
                if !report.mind.isEmpty {
                    InsightsDisclosure(title: "Behind the numbers", teaser: report.mind.map(\.title).joined(separator: " · ")) {
                        InsightsMind(mind: report.mind)
                    }
                }
                Rule()
            }
            .insightsReveal()
            InsightsAsk(id: insight.id, lowest: lowest)
                .insightsReveal()
            Text(footer(t))
                .font(.sans(13))
                .foregroundStyle(FW.Palette.text3)
                .tint(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
                .environment(\.openURL, OpenURLAction { _ in
                    howOpen = true
                    return .handled
                })
                .insightsReveal()
        }
        .sheet(isPresented: $howOpen) { InsightsHowGrades() }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker(previous != nil ? "Compared with the week before" : "Your first read")
            Text(report.headline)
                .font(.display(32))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
            Text(report.summary)
                .font(.sans(18))
                .foregroundStyle(FW.Palette.text2)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 16)
            if let note = report.data_note, !note.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "sparkle").font(.system(size: 12))
                    Text(note).fixedSize(horizontal: false, vertical: true)
                }
                .font(.sans(13))
                .foregroundStyle(FW.Palette.text2)
                .padding(.vertical, 8)
                .padding(.horizontal, 14)
                .background(FW.Palette.surface, in: .rect(cornerRadius: 18))
                .padding(.top, 16)
            }
        }
    }

    private func card<C: View>(_ title: String?, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let title { Kicker(title) }
            content()
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl).strokeBorder(FW.Palette.line))
    }

    private func secondary(_ t: InsightMetrics.Totals) -> [String] {
        [
            InsightsFormat.plural(t.answers, "answer"),
            InsightsFormat.plural(t.words_written, "word") + " written",
            InsightsFormat.plural(t.questions_asked, "question") + " asked",
            t.words_spoken > 0 ? InsightsFormat.plural(t.words_spoken, "word") + " spoken" : nil,
            t.practices > 0 ? InsightsFormat.plural(t.practices, "practice conversation") : nil,
        ].compactMap { $0 }
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
        link.link = URL(string: "fieldwork-insights://how")
        link.underlineStyle = .single
        link.foregroundColor = FW.Palette.text2
        text += link
        return text
    }
}
