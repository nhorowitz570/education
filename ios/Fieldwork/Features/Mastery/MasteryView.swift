import SwiftUI

// Mastery (src/components/mastery/mastery.tsx): what the learner has shown,
// one next challenge, and richer views (map, forecast, momentum, calibration,
// portfolio) that unlock once there's enough history to say something true.
struct MasteryView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var loader = Loader<MasteryData>("/api/mastery")
    @State private var focus: MasteryConcept?
    @State private var ahead = 0
    @State private var now = Date()

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
            .padding(.top, 8)
            .padding(.bottom, 48)
        }
        .screenBackground()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
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
        VStack(alignment: .leading, spacing: 20) {
            head(title: "Your map starts with a plan.", sessions: 0)
            Button("Import a plan") { router.push(.importPlan) }.buttonStyle(.fw(.primary))
        }
    }

    private func head(title: String, sessions: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker("Mastery")
            Text(title)
                .font(.display(34))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if sessions > 0 {
                HStack(spacing: 8) {
                    Button { router.tab = .notebook } label: { Label("Notebook", systemImage: "book.closed") }
                    Button { router.push(.insights) } label: { Label("Weekly insights", systemImage: "scope") }
                }
                .buttonStyle(.fw(.secondary, small: true))
                .padding(.top, 6)
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private var page: some View {
        let d = loader.value
        let sessions = d?.history.count ?? 0
        VStack(alignment: .leading, spacing: 40) {
            head(title: "What you can do.", sessions: sessions)
            if let d {
                sections(d, sessions: sessions)
            } else if let error = loader.error {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Mastery couldn’t load.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    ErrorNote(message: error) { Task { await loader.load() } }
                }
            } else {
                Skeleton(height: 260, radius: FW.Radius.lg)
            }
        }
    }

    @ViewBuilder
    private func sections(_ d: MasteryData, sessions: Int) -> some View {
        let unlocks = unlocks(d, sessions: sessions)
        let open = Set(unlocks.filter(\.open).map(\.id))
        let concepts = projected
        VStack(alignment: .leading, spacing: 20) {
            MasteryShown(concepts: today) { focus = $0 }
            MasteryNextChallenge(concepts: today, now: now)
        }
        if open.contains("map") {
            VStack(alignment: .leading, spacing: 24) {
                stats(concepts, mapped: d.mapped)
                if today.contains(where: { $0.model != nil }) {
                    MasteryForecast(today: today, concepts: concepts, ahead: $ahead)
                }
                MasteryMap(concepts: concepts, order: MasteryMap.order(plan: store.plan), ahead: ahead > 0) { focus = $0 }
            }
        }
        if open.contains("momentum"), let weeks = d.weeks {
            VStack(alignment: .leading, spacing: 12) {
                Kicker("Momentum · 8 weeks")
                MasteryMomentum(weeks: weeks)
            }
        }
        if open.contains("calibration"), let c = d.calibration {
            MasteryCalibration(c: c)
        }
        if !d.practice.isEmpty { practice(d.practice) }
        if d.weeks != nil, open.contains("portfolio") || !d.evidence.isEmpty {
            MasteryPortfolio(milestones: d.milestones)
        }
        let locked = unlocks.filter { !$0.open }
        if !locked.isEmpty { MasteryUnlocks(locked: locked) }
        if sessions > 0 { history(d.history) }
    }

    // The page grows with the learner: richer views appear once there is
    // enough history for them to say something true.
    private func unlocks(_ d: MasteryData, sessions: Int) -> [MasteryUnlock] {
        let rated = d.calibration?.total ?? 0
        let activeWeeks = (d.weeks ?? []).filter { $0.count > 0 }.count
        return [
            .init(id: "map", label: "Knowledge map and forgetting forecast", need: "ideas practised", have: today.filter { $0.level != "new" }.count, target: 5),
            .init(id: "momentum", label: "Momentum over eight weeks", need: "weeks with learning", have: activeWeeks, target: 2),
            .init(id: "calibration", label: "How well your confidence matches your accuracy", need: "rated answers", have: rated, target: 12),
            .init(id: "portfolio", label: "Portfolio and milestone rehearsals", need: "sessions finished", have: sessions, target: 3),
        ]
    }

    private func stats(_ concepts: [MasteryConcept], mapped: Bool) -> some View {
        let horizon = now.addingTimeInterval(Double(ahead) * 86400)
        let touched = concepts.filter { $0.level != "new" }
        let fading = touched.filter { $0.due.map { $0 <= horizon } ?? false }
        let solid = touched.filter { $0.level == "solid" || $0.level == "mastered" }
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 16, alignment: .topLeading), GridItem(.flexible(), spacing: 16, alignment: .topLeading)], alignment: .leading, spacing: 16) {
            Group {
                MasteryStat(value: "\(touched.count)", label: "ideas practised")
                MasteryStat(value: "\(solid.count)", label: "solid or better", color: solid.isEmpty ? FW.Palette.text : FW.Palette.positive)
                MasteryStat(value: "\(fading.count)", label: "ready to review", color: fading.isEmpty ? FW.Palette.text : FW.Palette.review)
                MasteryStat(value: "\(concepts.count)", label: "in the plan" + (mapped ? "" : " (mapping)"))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .animation(.easeOut(duration: FW.Motion.base), value: ahead)
    }

    private func practice(_ items: [MasteryData.PracticeItem]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Kicker("Speaking practice")
            VStack(spacing: 0) {
                ForEach(Array(items.prefix(6).enumerated()), id: \.element.id) { i, p in
                    Button { router.push(.practiceFeedback(p.id)) } label: {
                        HStack(spacing: 14) {
                            if let s = p.score {
                                Dot(color: verdictColor(s >= 0.75 ? "solid" : s >= 0.4 ? "partial" : "missed"))
                            } else {
                                Dot(color: FW.Palette.text3, hollow: true)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.title).font(.sans(15)).foregroundStyle(FW.Palette.text).multilineTextAlignment(.leading)
                                Text([practiceModeLabel(p.mode), Dates.short(String(p.date.prefix(10)))].filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            if let s = p.score {
                                Text("\(Int((s * 100).rounded()))")
                                    .font(.sans(13, .medium)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                                    .frame(minWidth: 28, alignment: .trailing)
                            }
                        }
                        .padding(.vertical, 10)
                        .frame(minHeight: 56)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .overlay(alignment: .top) { if i > 0 { Rule() } }
                }
            }
        }
    }

    private func history(_ items: [MasteryData.HistoryItem]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Kicker("Sessions")
            VStack(spacing: 0) {
                ForEach(Array(items.prefix(20).enumerated()), id: \.element.id) { i, h in
                    Button { router.cover = .session(h.id) } label: {
                        HStack(spacing: 14) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(h.title).font(.sans(15)).foregroundStyle(FW.Palette.text).multilineTextAlignment(.leading)
                                Text(h.summary ?? (h.kind == "review" ? "Review" : h.kind == "explore" ? "Exploration" : "Session"))
                                    .font(.sans(13))
                                    .foregroundStyle(FW.Palette.text3)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Text(Dates.short(String(h.date.prefix(10))))
                                .font(.sans(13))
                                .foregroundStyle(FW.Palette.text3)
                                .monospacedDigit()
                                .fixedSize()
                        }
                        .padding(.vertical, 10)
                        .frame(minHeight: 56)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .overlay(alignment: .top) { if i > 0 { Rule() } }
                }
            }
        }
    }
}
