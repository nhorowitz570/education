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
            VStack(alignment: .leading, spacing: 22) {
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

    private func header(_ d: TodayResponse) -> some View {
        let t = d.today
        let date = Day.date(d.date).map { $0.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()) } ?? ""
        let week = t.week.flatMap { w in t.phase == "before-start" ? nil : " · Week \(w.index)\(w.total > 0 ? " of \(w.total)" : "")" } ?? ""
        return HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 10) {
                Text((date + week).uppercased()).font(.mono(11)).tracking(1).foregroundStyle(FW.Palette.text3)
                Text(greeting)
                    .font(.display(40))
                    .foregroundStyle(FW.Palette.text)
                    .minimumScaleFactor(0.8)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(.top, 12)
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let part = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
        let name = store.plan?["profile"]?["name"]?.string?.split(separator: " ").first.map(String.init) ?? ""
        return name.isEmpty ? "\(part)." : "\(part), \(name)."
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ d: TodayResponse) -> some View {
        let t = d.today
        if t.phase == "no-plan" {
            VStack(alignment: .leading, spacing: 14) {
                Text(t.headline).font(.display(30, italic: true)).foregroundStyle(FW.Palette.text)
                Text(t.why).font(.sans(16)).foregroundStyle(FW.Palette.text2)
                Button { router.push(.importPlan, on: .today) } label: {
                    Label("Import a plan", systemImage: "arrow.right").labelStyle(TrailingIcon())
                }
                .buttonStyle(.fw(.primary))
                .padding(.top, 6)
            }
            .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 24)
        } else if t.phase == "done-today", let recap = d.recap {
            RecapCard(t: t, recap: recap, xp: progress.value?.todayXp ?? 0, busy: busy) { run($0) }
        } else {
            BriefCard(t: t, agenda: agenda(t), brief: brief, loading: briefLoading, number: dayNumber(d.date), busy: busy, error: startError) { run($0) }
        }
        LearnAnything(busy: busy == "explore", disabled: busy != nil) { topic in
            run(TodayAction(kind: "explore", label: "Explore", detail: ""), topic: topic)
        }
        more(d)
        if let p = progress.value, store.prefs.anyGame, t.phase != "before-start" || p.xp > 0 {
            ProgressStrip(progress: p, prefs: store.prefs) { progressSheet = true }
        }
        if let s = t.startsIn {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(s)").font(.display(56)).foregroundStyle(FW.Palette.text).monospacedDigit()
                Text(s == 1 ? "day until it starts" : "days until it starts").font(.sans(15)).foregroundStyle(FW.Palette.text2)
            }
        }
        if t.week != nil { WeekStrip(t: t) }
    }

    @ViewBuilder
    private func more(_ d: TodayResponse) -> some View {
        let t = d.today
        let resume = t.secondary.first { $0.kind == "resume" }
        let tiles = t.secondary.filter { ["review", "rehearsal", "practice"].contains($0.kind) }
        if t.next != nil || d.insight != nil || resume != nil || d.exploring != nil {
            VStack(spacing: 0) {
                if let n = t.next {
                    Button { router.push(.learn, on: .today) } label: {
                        IndexRow(icon: "calendar", title: n.ready ? "Next week is ready to shape" : "Shape next week",
                                 detail: n.ready ? (n.note ?? "\(n.sessions) sessions drafted. Change anything until Monday.") : "Drafted Sunday at noon, or now if you like.") {
                            HStack(spacing: 10) {
                                if n.ready { Dot(color: FW.Palette.review, lit: true) }
                                Image(systemName: "chevron.right")
                            }
                        }
                    }
                }
                if let i = d.insight {
                    Button { router.push(.insights, on: .today) } label: {
                        IndexRow(icon: "scope", title: "Your week, read honestly", detail: i.headline, tint: FW.Palette.review) {
                            HStack(spacing: 10) { Dot(color: FW.Palette.review, lit: true); Image(systemName: "chevron.right") }
                        }
                    }
                }
                if let r = resume {
                    Button { run(r) } label: { IndexRow(icon: "play.fill", title: r.label, detail: r.detail) }
                        .disabled(busy != nil)
                }
                if let e = d.exploring {
                    Button { router.cover = .session(e.id) } label: { IndexRow(icon: "sparkles", title: "Pick up your exploration", detail: e.title) }
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(FW.Palette.text3)
        }
        if !tiles.isEmpty {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(tiles, id: \.label) { s in
                    Button { run(s) } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            Image(systemName: s.kind == "practice" ? "waveform" : s.kind == "review" ? "arrow.clockwise" : "target")
                                .font(.system(size: 15))
                                .foregroundStyle(s.kind == "review" ? FW.Palette.review : FW.Palette.text2)
                                .frame(width: 36, height: 36)
                                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.sm))
                            Text(s.kind == "practice" ? "Practise out loud" : s.label).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                                .multilineTextAlignment(.leading)
                            Text(s.kind == "practice" ? "Debate, pitch, hard talks" : s.kind == "review" ? "About \(Int(s.minutes ?? 5)) min" : "30-minute mock")
                                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 14)
                    }
                    .buttonStyle(.plain)
                    .disabled(busy != nil)
                }
            }
        }
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 16) {
            Skeleton(width: 120, height: 12).padding(.top, 20)
            Skeleton(height: 44).frame(maxWidth: 260)
            VStack(alignment: .leading, spacing: 16) {
                Skeleton(width: 120, height: 12)
                Skeleton(height: 52).frame(maxWidth: 280)
                Skeleton(height: 14).frame(maxWidth: 200)
                Skeleton(width: 160, height: 54, radius: 16).padding(.top, 10)
            }
            .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 24)
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

    private func dayNumber(_ date: String) -> Int? {
        guard let start = store.plan?["weeks"]?[0]?["start_date"]?.string, let a = Day.date(start), let b = Day.date(date) else { return nil }
        let n = Int((b.timeIntervalSince(a) / 86400).rounded()) + 1
        return n > 0 ? n : nil
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
