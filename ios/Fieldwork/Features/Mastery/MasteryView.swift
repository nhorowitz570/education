import SwiftUI

// Mastery (src/components/mastery/mastery.tsx): what the learner has shown,
// one next challenge, and richer views (map, forecast, momentum, calibration,
// portfolio) that unlock once there's enough history to say something true.
// On iPhone it leads with pictures: a ring per subject, stat tiles, meters.
struct MasteryView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var loader = Loader<MasteryData>("/api/mastery")
    @State private var focus: MasteryConcept?
    @State private var ahead = 0
    @State private var now = Date()
    @State private var allSessions = false

    var body: some View {
        ScrollView {
            Group {
                if let d = loader.value, d.noPlan {
                    noPlan
                } else {
                    page
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 4)
            .padding(.bottom, 48)
        }
        .screenBackground()
        .navigationTitle("Mastery")
        .navigationBarTitleDisplayMode(.large)
        .refreshable {
            await loader.load()
            now = .now
        }
        .task {
            await loader.load()
            now = .now
        }
        .sheet(item: $focus) { c in MasteryConceptSheet(concept: c, all: projected) }
    }

    private var today: [MasteryConcept] { loader.value?.concepts ?? [] }
    private var projected: [MasteryConcept] {
        ahead == 0 ? today : today.map { $0.projected(at: now.addingTimeInterval(Double(ahead) * 86400)) }
    }

    private var noPlan: some View {
        VStack(alignment: .leading, spacing: 14) {
            IconBadge(systemName: "map", color: FW.Palette.review, size: 56)
            Text("Your map starts with a plan.").font(.sans(22, .bold)).foregroundStyle(FW.Palette.text)
            Button("Import a plan") { router.push(.importPlan) }
                .buttonStyle(.fw(.primary, wide: true))
                .padding(.top, 6)
        }
        .padding(.top, 12)
        .rise()
    }

    @ViewBuilder
    private var page: some View {
        let d = loader.value
        let sessions = d?.history.count ?? 0
        VStack(alignment: .leading, spacing: 32) {
            if let d {
                sections(d, sessions: sessions)
            } else if let error = loader.error {
                VStack(alignment: .leading, spacing: 12) {
                    IconBadge(systemName: "exclamationmark.triangle", color: FW.Palette.caution, size: 48)
                    Text("Mastery couldn’t load.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    ErrorNote(message: error) { Task { await loader.load() } }
                }
            } else {
                VStack(spacing: 16) {
                    Skeleton(height: 150, radius: FW.Radius.xl)
                    Skeleton(height: 220, radius: FW.Radius.xl)
                    Skeleton(height: 260, radius: FW.Radius.lg)
                }
            }
        }
    }

    @ViewBuilder
    private func sections(_ d: MasteryData, sessions: Int) -> some View {
        let unlocks = unlocks(d, sessions: sessions)
        let open = Set(unlocks.filter(\.open).map(\.id))
        let concepts = projected
        if !today.isEmpty {
            MasterySubjects(concepts: today).rise(0)
        }
        MasteryNextChallenge(concepts: today, now: now).rise(1)
        MasteryShown(concepts: today) { focus = $0 }.rise(2)
        if open.contains("map") {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: "Knowledge map")
                stats(concepts, mapped: d.mapped)
                if today.contains(where: { $0.model != nil }) {
                    MasteryForecast(today: today, concepts: concepts, ahead: $ahead)
                }
                MasteryMap(concepts: concepts, order: MasteryMap.order(plan: store.plan), ahead: ahead > 0) { focus = $0 }
                    .padding(14)
                    .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
            }
            .rise(3)
        }
        if open.contains("momentum"), let weeks = d.weeks {
            VStack(alignment: .leading, spacing: 14) {
                SectionHead(title: "Momentum", trailing: "8 weeks")
                MasteryMomentum(weeks: weeks)
                    .padding(16)
                    .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
            }
            .rise(4)
        }
        if open.contains("calibration"), let c = d.calibration {
            MasteryCalibration(c: c).rise(5)
        }
        if !d.practice.isEmpty { practice(d.practice).rise(6) }
        if d.weeks != nil, open.contains("portfolio") || !d.evidence.isEmpty {
            MasteryPortfolio(milestones: d.milestones)
        }
        let locked = unlocks.filter { !$0.open }
        if !locked.isEmpty { MasteryUnlocks(locked: locked).rise(7) }
        if sessions > 0 {
            history(d.history).rise(8)
            elsewhere.rise(9)
        }
    }

    // Where to go next from here (web: the head's Notebook and Insights links).
    private var elsewhere: some View {
        HStack(spacing: 12) {
            Button { router.tab = .notebook } label: {
                Tile(icon: "book.closed", title: "Notebook", caption: "Your ideas", color: FW.Palette.caution)
            }
            .buttonStyle(.pressable)
            Button { router.push(.insights) } label: {
                Tile(icon: "scope", title: "Weekly insights", caption: "Patterns", color: FW.Palette.judgment)
            }
            .buttonStyle(.pressable)
        }
    }

    // The page grows with the learner: richer views appear once there is
    // enough history for them to say something true.
    private func unlocks(_ d: MasteryData, sessions: Int) -> [MasteryUnlock] {
        let rated = d.calibration?.total ?? 0
        let activeWeeks = (d.weeks ?? []).filter { $0.count > 0 }.count
        return [
            .init(id: "map", label: "Knowledge map and forgetting forecast", icon: "map", need: "ideas practised", have: today.filter { $0.level != "new" }.count, target: 5),
            .init(id: "momentum", label: "Momentum over eight weeks", icon: "chart.bar", need: "weeks with learning", have: activeWeeks, target: 2),
            .init(id: "calibration", label: "How well your confidence matches your accuracy", icon: "gauge.with.needle", need: "rated answers", have: rated, target: 12),
            .init(id: "portfolio", label: "Portfolio and milestone rehearsals", icon: "folder", need: "sessions finished", have: sessions, target: 3),
        ]
    }

    private func stats(_ concepts: [MasteryConcept], mapped: Bool) -> some View {
        let horizon = now.addingTimeInterval(Double(ahead) * 86400)
        let touched = concepts.filter { $0.level != "new" }
        let fading = touched.filter { $0.due.map { $0 <= horizon } ?? false }
        let solid = touched.filter { $0.level == "solid" || $0.level == "mastered" }
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            StatTile(value: "\(touched.count)", label: "ideas practised", icon: "checkmark.circle", color: FW.Palette.caution)
            StatTile(value: "\(solid.count)", label: "solid or better", icon: "star.fill", color: FW.Palette.positive)
            StatTile(value: "\(fading.count)", label: "ready to review", icon: "arrow.triangle.2.circlepath", color: FW.Palette.review)
            StatTile(value: "\(concepts.count)", label: "in the plan" + (mapped ? "" : " (mapping)"), icon: "map", color: FW.Palette.text2)
        }
        .animation(Springs.snappy, value: ahead)
    }

    private func practice(_ items: [MasteryData.PracticeItem]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHead(title: "Speaking practice")
            GroupCard {
                ForEach(items.prefix(6)) { p in
                    Button { router.push(.practiceFeedback(p.id)) } label: {
                        GroupRow(
                            icon: "waveform",
                            title: p.title,
                            caption: [practiceModeLabel(p.mode), Dates.short(String(p.date.prefix(10)))].filter { !$0.isEmpty }.joined(separator: " · "),
                            color: p.score.map { verdictColor($0 >= 0.75 ? "solid" : $0 >= 0.4 ? "partial" : "missed") } ?? FW.Palette.text3
                        ) {
                            HStack(spacing: 8) {
                                if let s = p.score {
                                    NotebookRing(value: s, color: verdictColor(s >= 0.75 ? "solid" : s >= 0.4 ? "partial" : "missed"), size: 32, line: 3.5)
                                }
                                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text4)
                            }
                        }
                    }
                    .buttonStyle(.pressable(0.98))
                }
            }
        }
    }

    private func history(_ items: [MasteryData.HistoryItem]) -> some View {
        let shown = Array(items.prefix(allSessions ? 20 : 5))
        return VStack(alignment: .leading, spacing: 14) {
            SectionHead(title: "Sessions", trailing: "\(min(items.count, 20))")
            GroupCard {
                ForEach(shown) { h in
                    Button { router.cover = .session(h.id) } label: {
                        GroupRow(
                            icon: Glyph.kind(["review", "explore", "rehearsal"].contains(h.kind) ? h.kind : "session"),
                            title: h.title,
                            caption: h.summary ?? (h.kind == "review" ? "Review" : h.kind == "explore" ? "Exploration" : "Session"),
                            color: h.kind == "review" ? FW.Palette.review : h.kind == "explore" ? FW.Palette.coral : FW.Palette.text2
                        ) {
                            Text(Dates.short(String(h.date.prefix(10))))
                                .font(.sans(13, .medium))
                                .foregroundStyle(FW.Palette.text3)
                                .monospacedDigit()
                                .fixedSize()
                        }
                    }
                    .buttonStyle(.pressable(0.98))
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            if items.count > 5 {
                Button {
                    withAnimation(Springs.smooth) { allSessions.toggle() }
                } label: {
                    Label(allSessions ? "Show fewer" : "Show all \(min(items.count, 20))", systemImage: allSessions ? "chevron.up" : "chevron.down")
                }
                .buttonStyle(.fw(.secondary, small: true))
            }
        }
    }
}
