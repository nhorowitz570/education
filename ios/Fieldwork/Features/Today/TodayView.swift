import SwiftUI

// Today (src/components/today/today.tsx): the greeting, the numbered morning
// brief with the day's agenda and the tutor's margin notes, Learn anything,
// more ways in, progress and the week.
struct TodayView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var today = Loader<TodayResponse>("/api/today")
    @State private var progress = Loader<Progress>("/api/progress")
    @State private var brief: Brief?
    @State private var briefLoading = false
    @State private var busy: String?
    @State private var startError: String?
    @State private var progressSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let d = today.value {
                    header(d)
                    content(d)
                } else if let error = today.error {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Today couldn’t load.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                        ErrorNote(message: error) { Task { await today.load() } }
                    }
                    .padding(.top, 40)
                } else {
                    skeleton
                }
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await reload() }
        .task { await reload() }
        .onChange(of: store.version) { _, _ in Task { await today.load() } }
        .onChange(of: router.beginToday) { _, begin in if begin { beginPrimary() } }
        .sheet(isPresented: $progressSheet) { if let p = progress.value { ProgressSheet(progress: p) } }
    }

    private func reload() async {
        async let a: Void = today.load()
        async let b: Void = progress.load()
        _ = await (a, b)
        await loadBrief()
        publishGlance()
        noticeMemories()
        if router.beginToday { beginPrimary() }
    }

    // MARK: Header

    // The date and a greeting, with the streak and level to the right.
    private func header(_ d: TodayResponse) -> some View {
        let t = d.today
        let date = Day.date(d.date).map { $0.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()) } ?? ""
        let week = t.week.flatMap { w in t.phase == "before-start" ? nil : " · Week \(w.index)" } ?? ""
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(date + week).font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text3)
                Text(greeting)
                    .font(.sans(30, .bold))
                    .foregroundStyle(FW.Palette.text)
                    .minimumScaleFactor(0.75)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            if let p = progress.value, store.prefs.game.streak || store.prefs.game.xp {
                Button { progressSheet = true } label: {
                    HStack(spacing: 8) {
                        if store.prefs.game.streak {
                            HStack(spacing: 4) {
                                Image(systemName: "flame.fill")
                                    .foregroundStyle(p.streak.todayDone ? FW.Palette.coral : FW.Palette.text4)
                                    .symbolEffect(.bounce, value: p.streak.todayDone)
                                Text("\(p.streak.current)").font(.rounded(16, .bold)).foregroundStyle(FW.Palette.text)
                                    .contentTransition(.numericText())
                            }
                        }
                        if store.prefs.game.xp { LevelRing(level: p.level, fraction: p.fraction, size: 34) }
                    }
                    .padding(.leading, store.prefs.game.streak ? 12 : 4)
                    .padding(.trailing, 4)
                    .frame(height: 44)
                    .background(FW.Palette.raised, in: .capsule)
                    .overlay(Capsule().strokeBorder(FW.Palette.line))
                }
                .buttonStyle(.pressable)
                .accessibilityLabel("Level \(p.level), \(p.streak.current) \(p.streak.unit == "week" ? "week" : "day") streak")
                .rise(1)
            }
        }
        .padding(.top, 12)
        .rise(0)
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let part = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
        let name = store.plan?["profile"]?["name"]?.string?.split(separator: " ").first.map(String.init) ?? ""
        return name.isEmpty ? part : "\(part), \(name)"
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ d: TodayResponse) -> some View {
        let t = d.today
        if t.phase == "no-plan" {
            VStack(alignment: .leading, spacing: 16) {
                IconBadge(systemName: "map", color: FW.Palette.accent, size: 48)
                Text(t.headline).font(.sans(24, .bold)).foregroundStyle(FW.Palette.text)
                Text(t.why).font(.sans(15)).foregroundStyle(FW.Palette.text2).lineLimit(3)
                Button { router.push(.importPlan, on: .today) } label: {
                    Label("Import a plan", systemImage: "arrow.right").labelStyle(TrailingIcon())
                }
                .buttonStyle(.fw(.primary, wide: true))
                .padding(.top, 4)
            }
            .card(FW.Radius.xl, fill: FW.Palette.raised, padding: 22)
            .rise(1)
        } else if t.phase == "done-today", let recap = d.recap {
            RecapCard(t: t, recap: recap, xp: progress.value?.todayXp ?? 0, busy: busy) { run($0) }
                .rise(1)
        } else {
            BriefCard(t: t, agenda: agenda(t), brief: brief, loading: briefLoading, busy: busy, error: startError) { run($0) }
                .rise(1)
        }
        if let s = t.startsIn {
            HStack(spacing: 16) {
                Text("\(s)").font(.rounded(44, .bold)).foregroundStyle(FW.Palette.text).contentTransition(.numericText())
                VStack(alignment: .leading, spacing: 2) {
                    Text(s == 1 ? "day to go" : "days to go").font(.sans(16, .semibold)).foregroundStyle(FW.Palette.text)
                    Text("Your plan starts soon").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                }
                Spacer()
                IconBadge(systemName: "hourglass", color: FW.Palette.review, size: 44)
            }
            .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 16)
            .rise(2)
        }
        LearnAnything(busy: busy == "explore", disabled: busy != nil) { topic in
            run(TodayAction(kind: "explore", label: "Explore", detail: ""), topic: topic)
        }
        .rise(2)
        if t.week != nil { WeekStrip(t: t).rise(3) }
        more(d).rise(4)
    }

    // Other ways in, as a grid: pick up where you left off, the week ahead,
    // the weekly read, review and practice, progress and the plan.
    private func more(_ d: TodayResponse) -> some View {
        let t = d.today
        let resume = t.secondary.first { $0.kind == "resume" }
        let tiles = t.secondary.filter { ["review", "rehearsal", "practice"].contains($0.kind) }
        return VStack(alignment: .leading, spacing: 12) {
            SectionHead(title: "More")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                if let r = resume {
                    Button { run(r) } label: { Tile(icon: "play.fill", title: r.label, caption: r.detail, color: FW.Palette.accent) }
                        .disabled(busy != nil)
                }
                if let e = d.exploring {
                    Button { router.cover = .session(e.id) } label: { Tile(icon: "sparkles", title: "Your exploration", caption: e.title, color: FW.Palette.judgment) }
                }
                if let i = d.insight {
                    Button { router.push(.insights, on: .today) } label: {
                        Tile(icon: "scope", title: "Your week, read honestly", caption: i.headline, color: FW.Palette.review, badge: "New")
                    }
                }
                ForEach(tiles, id: \.label) { s in
                    Button { run(s) } label: {
                        Tile(icon: Glyph.kind(s.kind),
                             title: s.kind == "practice" ? "Practise out loud" : s.label,
                             caption: s.kind == "practice" ? "Debate, pitch, hard talks" : s.kind == "review" ? "About \(Int(s.minutes ?? 5)) min" : "30-minute mock",
                             color: s.kind == "review" ? FW.Palette.review : s.kind == "practice" ? FW.Palette.communication : FW.Palette.judgment)
                    }
                    .disabled(busy != nil)
                }
                if let n = t.next {
                    Button { router.push(.learn, on: .today) } label: {
                        Tile(icon: "calendar.badge.plus", title: n.ready ? "Next week is ready" : "Shape next week",
                             caption: n.ready ? "\(n.sessions) sessions drafted" : "Drafted Sunday at noon",
                             color: FW.Palette.review, badge: n.ready ? "Ready" : nil)
                    }
                } else {
                    Button { router.push(.learn, on: .today) } label: {
                        Tile(icon: "calendar", title: "Your plan", caption: "This week and next", color: FW.Palette.finance)
                    }
                }
                Button { router.push(.mastery, on: .today) } label: {
                    Tile(icon: "chart.bar.fill", title: "Progress", caption: "What’s sticking", color: FW.Palette.positive)
                }
            }
            .buttonStyle(.pressable)
        }
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 16) {
            Skeleton(width: 120, height: 12).padding(.top, 20)
            Skeleton(height: 34).frame(maxWidth: 260)
            VStack(alignment: .leading, spacing: 16) {
                Skeleton(width: 44, height: 44, radius: 14)
                Skeleton(height: 28).frame(maxWidth: 260)
                Skeleton(height: 14).frame(maxWidth: 200)
                Skeleton(height: 52, radius: 26).padding(.top, 10)
            }
            .card(FW.Radius.xl, fill: FW.Palette.raised, padding: 22)
        }
    }

    // MARK: Behaviour

    struct AgendaItem: Hashable { var label: String; var kind: String; var minutes: Double?; var track: String?; var action: TodayAction? }

    private func agenda(_ t: TodayModel) -> [AgendaItem] {
        var out: [AgendaItem] = []
        if let p = t.primary, p.kind != "explore", p.kind != "practice" {
            out.append(.init(label: p.kind == "review" ? p.label : t.focus?.title ?? t.headline, kind: p.kind,
                             minutes: p.minutes ?? t.focus?.minutes, track: p.track ?? t.focus?.subject, action: p))
        }
        for s in t.secondary where out.count < 4 {
            if s.kind == "review", t.primary?.kind != "review" { out.append(.init(label: s.label, kind: "review", minutes: s.minutes, track: "review", action: s)) }
            if s.kind == "rehearsal" { out.append(.init(label: s.label, kind: "rehearsal", minutes: 30, track: "judgment", action: s)) }
            if s.kind == "practice" { out.append(.init(label: "Practise it out loud", kind: "practice", minutes: nil, track: "communication", action: s)) }
        }
        return out
    }

    // Written once a day from what the learner did; kept for the day.
    private func loadBrief() async {
        guard let d = today.value, d.today.phase != "no-plan", d.today.phase != "done-today" else { brief = nil; return }
        struct Item: Codable { let label: String; let kind: String; let minutes: Double?; let track: String? }
        struct Body: Encodable { let date: String; let agenda: [Item] }
        struct Result: Decodable { let brief: Brief }
        let items = agenda(d.today).map { Item(label: $0.label, kind: $0.kind, minutes: $0.minutes, track: $0.track) }
        let sig = (try? String(data: JSONEncoder.api.encode(items), encoding: .utf8)) ?? ""
        let key = "fw.brief.\(store.owner ?? "").\(d.date).\(sig.count).\(sig.prefix(80))"
        if let data = UserDefaults.standard.data(forKey: key), let cached = try? JSONDecoder().decode(Brief.self, from: data) {
            brief = cached
            return
        }
        briefLoading = true
        defer { briefLoading = false }
        if let r: Result = try? await API.post("/api/today/brief", Body(date: d.date, agenda: items)) {
            withAnimation(.easeOut(duration: FW.Motion.slow)) { brief = r.brief }
            UserDefaults.standard.set(try? JSONEncoder().encode(r.brief), forKey: key)
        }
    }

    private func run(_ a: TodayAction, topic: String? = nil) {
        guard busy == nil else { return }
        busy = a.kind == "explore" ? "explore" : a.label
        startError = nil
        Feedback.shared.play(.tap)
        Task {
            do { try await Runs.run(a, topic: topic) } catch { startError = error.localizedDescription }
            busy = nil
            await today.load()
        }
    }

    private func beginPrimary() {
        guard let p = today.value?.today.primary else { return }
        router.beginToday = false
        run(p)
    }

    // New memories from recent sessions: said once, quietly, with a way to look.
    private func noticeMemories() {
        guard let fresh = today.value?.memories?.fresh, fresh > 0 else { return }
        let seen = store.record("settings:memory")?["data"]?["seen_at"]?.string ?? "never"
        let key = "fw.memtoast.\(seen).\(fresh)"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        UserDefaults.standard.set(true, forKey: key)
        Toasts.shared.show("Fieldwork noticed \(fresh == 1 ? "something new" : "\(fresh) new things") about you.", action: "Review") {
            router.push(.memory, on: .you)
        }
    }

    // What the Home Screen widget shows.
    private func publishGlance() {
        guard let d = today.value else { return }
        let t = d.today
        let first = agenda(t).first
        let order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        var week: [Bool?] = Array(repeating: nil, count: 7)
        for day in t.week?.days ?? [] {
            if let i = order.firstIndex(of: String(day.weekday.prefix(3))) {
                week[i] = day.status == "done" ? true : ["missed", "planned", "today", "open", "reduced"].contains(day.status) ? false : nil
            }
        }
        Glance(date: d.date, title: t.phase == "rest-day" || t.phase == "no-plan" ? nil : first?.label,
               track: first?.track, minutes: first?.minutes.map { Int($0.rounded()) }, done: t.phase == "done-today",
               streak: store.prefs.game.streak ? progress.value?.streak.current : nil, week: week).save()
    }
}

struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.title; configuration.icon }
    }
}
