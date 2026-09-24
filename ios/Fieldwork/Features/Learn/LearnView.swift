import SwiftUI

// Learn (src/components/learn/learn.tsx, rolling.tsx). A plan that runs a
// week at a time shows this week, next week's draft (yours to shape until its
// Monday) and the direction beyond. An older fixed plan shows this week, next
// week and its chapters.
struct LearnView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var mastery = Loader<PlanConcepts>("/api/mastery")
    @State private var rhythm = false

    var body: some View {
        let plan = store.decodedPlan
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let plan {
                    if plan.isRolling {
                        LearnRolling(plan: plan, concepts: mastery.value?.concepts ?? [])
                    } else {
                        LearnFixed(plan: plan, concepts: mastery.value?.concepts ?? [])
                    }
                } else {
                    VStack(alignment: .leading, spacing: 20) {
                        PageHead(eyebrow: "Learn", title: "No plan yet.")
                        Button("Import a plan") { router.push(.importPlan) }
                            .buttonStyle(.fw(.primary))
                    }
                }
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 8)
            .padding(.bottom, 48)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if plan?.isRolling == true {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { rhythm = true } label: { Label("Your rhythm", systemImage: "calendar").labelStyle(.titleAndIcon) }
                }
            }
        }
        .sheet(isPresented: $rhythm) { if let plan { PlanRhythmSheet(plan: plan) } }
        .task { if plan != nil { await mastery.load() } }
        .refreshable {
            await store.refresh()
            await mastery.load()
        }
    }
}

// MARK: - Session rows

private struct LearnSessionRow: View {
    let session: Plan.Session
    let done: Bool
    let today: String
    var strength: Double? = nil
    // Rolling plans say why; fixed ones show the subject.
    var sub: String
    // Rolling plans add "today" / "still open this week"; fixed plans pass their own.
    var autoSuffix = true
    var onSwap: (() -> Void)? = nil
    var onRemove: (() -> Void)? = nil
    let onOpen: () -> Void

    private var state: String {
        done ? "done" : session.date == today ? "today" : session.date < today ? "open" : "planned"
    }

    var body: some View {
        let color = trackColor(session.subject)
        HStack(spacing: 4) {
            Button(action: onOpen) {
                HStack(spacing: 12) {
                    VStack(spacing: 1) {
                        Text(PlanDate.short(PlanDate.dayIndex(session.date)).uppercased())
                            .font(.sans(11)).tracking(0.4)
                            .foregroundStyle(FW.Palette.text3)
                        Text("\(Int(session.date.suffix(2)) ?? 0)")
                            .font(.sans(19, .medium)).monospacedDigit()
                            .foregroundStyle(FW.Palette.text)
                    }
                    .frame(width: 34)
                    Dot(color: color, hollow: !done, lit: state == "today")
                        .opacity(state == "open" ? 0.7 : 1)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(session.title)
                                .font(.sans(15))
                                .foregroundStyle(done ? FW.Palette.text2 : FW.Palette.text)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            if session.added { PlanPill(text: "New") }
                        }
                        Text(sub + (!autoSuffix ? "" : state == "today" ? " · today" : state == "open" ? " · still open this week" : ""))
                            .font(.sans(13))
                            .foregroundStyle(FW.Palette.text3)
                            .multilineTextAlignment(.leading)
                            .lineLimit(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let strength, strength > 0 { PlanMiniMeter(value: strength, color: color) }
                    if done {
                        Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(color)
                            .accessibilityLabel("Done")
                    } else if onSwap == nil {
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text3)
                            .accessibilityHidden(true)
                    }
                }
                .padding(.vertical, 10)
                .frame(minHeight: 60)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            if let onSwap, let onRemove {
                HStack(spacing: 0) {
                    icon("arrow.triangle.2.circlepath", label: "Swap \(session.title)", action: onSwap)
                    icon("xmark", label: "Take \(session.title) out of this week", action: onRemove)
                }
            }
        }
    }

    private func icon(_ name: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(FW.Palette.text2)
                .frame(width: 34, height: 40)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

private func learnRows<Item: Identifiable, Row: View>(_ items: [Item], @ViewBuilder row: @escaping (Item) -> Row) -> some View {
    VStack(spacing: 0) {
        ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
            if i > 0 { Rule() }
            row(item)
        }
    }
}

private struct LearnSectionHead<Trailing: View>: View {
    let eyebrow: String
    let title: String
    @ViewBuilder var trailing: () -> Trailing
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(eyebrow)
            HStack(spacing: 10) {
                Text(title).font(.sans(20, .semibold)).foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                trailing()
            }
        }
        .padding(.bottom, 8)
    }
}

extension LearnSectionHead where Trailing == EmptyView {
    init(eyebrow: String, title: String) { self.init(eyebrow: eyebrow, title: title) { EmptyView() } }
}

// MARK: - Rolling plan

private struct LearnRolling: View {
    let plan: Plan
    let concepts: [PlanConcept]
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var open: Plan.Session?
    @State private var swapAfter: Plan.Session?
    @State private var pendingRun: String?
    @State private var swapping: Plan.Session?
    @State private var track: LearnTrackRef?
    @State private var adding = false
    @State private var pastOpen: Set<String> = []

    var body: some View {
        let today = store.today
        let done = store.planDoneIds
        let current = plan.currentWeek(today: today)
        let upcoming = PlanDate.nextWeek(current <= today ? today : current)
        let thisWeek = plan.weekSessions(current)
        let nextSessions = plan.weekSessions(upcoming)
        let weeks = plan.horizon?.weeks ?? []
        let past = weeks.filter { $0.start < current }.reversed()
        let index = weeks.filter { $0.start <= current && !plan.weekSessions($0.start).isEmpty }.count
        let doneThisWeek = thisWeek.filter { done.contains($0.id) }.count
        let before = today < plan.start_date
        let canEditNow = PlanDate.editable(current, today: today)

        VStack(alignment: .leading, spacing: 32) {
            PageHead(
                eyebrow: "Learn",
                title: plan.title,
                subtitle: "\(before ? "Starts \(PlanDate.label(plan.start_date))" : "Week \(index)") · \(doneThisWeek) of \(thisWeek.count) done this week"
            )

            // This week
            VStack(alignment: .leading, spacing: 0) {
                LearnSectionHead(eyebrow: before ? "Your first week" : "This week", title: PlanDate.range(current))
                if thisWeek.isEmpty {
                    muted("Nothing planned this week. Rest counts too.")
                } else {
                    learnRows(thisWeek) { s in row(s, done: done, today: today, canEdit: canEditNow) }
                }
                if canEditNow {
                    Text(today == current ? "You can reshape this week until tonight." : "You can reshape this week until it starts on Monday.")
                        .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        .padding(.vertical, 6)
                }
            }

            // Next week
            if current <= today {
                let meta = plan.weekMeta(upcoming)
                VStack(alignment: .leading, spacing: 0) {
                    LearnSectionHead(eyebrow: "Next week", title: PlanDate.range(upcoming)) {
                        if meta?.status == "draft" { PlanPill(text: "Draft", color: FW.Palette.caution) }
                    }
                    if let meta {
                        LearnNextWeek(
                            plan: plan, start: upcoming, meta: meta, sessions: nextSessions, done: done, today: today,
                            row: { s, canEdit in AnyView(row(s, done: done, today: today, canEdit: canEdit)) },
                            onAdd: { adding = true }
                        )
                    } else {
                        LearnDraftLater()
                    }
                }
            }

            direction(today)

            if !past.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Kicker("Past weeks").padding(.bottom, 4)
                    Rule()
                    ForEach(Array(past), id: \.start) { m in
                        let ss = plan.weekSessions(m.start)
                        PlanDisclosure(
                            title: PlanDate.range(m.start),
                            teaser: "\(m.done ?? ss.filter { done.contains($0.id) }.count) of \(m.planned ?? ss.count) done",
                            open: Binding(get: { pastOpen.contains(m.start) }, set: { v in if v { pastOpen.insert(m.start) } else { pastOpen.remove(m.start) } })
                        ) {
                            if ss.isEmpty {
                                muted("Nothing finished that week. Its topics went back to their tracks.")
                            } else {
                                learnRows(ss) { s in row(s, done: done, today: today, canEdit: false) }
                            }
                        }
                        Rule()
                    }
                }
            }
        }
        .sheet(item: $open, onDismiss: afterSessionSheet) { s in
            let isDone = done.contains(s.id)
            PlanSessionSheet(
                plan: plan, session: s,
                concepts: concepts.filter { $0.sessions.contains(s.id) },
                done: isDone,
                canEdit: PlanDate.editable(PlanDate.weekOf(s.date), today: today) && !isDone,
                onSwap: {
                    swapAfter = s
                    open = nil
                },
                onRemove: {
                    remove(s)
                    open = nil
                },
                onStarted: { pendingRun = $0 }
            )
        }
        .sheet(item: $swapping) { s in
            PlanSwapSheet(plan: plan, session: s) { topicId in
                swapping = nil
                Task { await runPlanEdit(store, ["op": .string("swap"), "sessionId": .string(s.id), "topicId": .string(topicId)], "Swapped.") }
            }
        }
        .sheet(item: $track) { t in PlanTrackSheet(trackId: t.id) }
        .sheet(isPresented: $adding) {
            PlanAddSheet(plan: plan, start: upcoming, taken: nextSessions.map { PlanDate.dayIndex($0.date) }) { trackId, day in
                adding = false
                Task { await runPlanEdit(store, ["op": .string("add"), "week": .string(upcoming), "track": .string(trackId), "day": .number(Double(day))], "Added.") }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func afterSessionSheet() {
        if let id = pendingRun {
            pendingRun = nil
            router.cover = .session(id)
        } else if let s = swapAfter {
            swapAfter = nil
            swapping = s
        }
    }

    private func row(_ s: Plan.Session, done: Set<String>, today: String, canEdit: Bool) -> some View {
        let isDone = done.contains(s.id)
        let editable = canEdit && !isDone
        return LearnSessionRow(
            session: s, done: isDone, today: today,
            strength: planStrength(concepts, s.id),
            sub: s.why ?? "\(subjectLabel(s.subject)) · \(s.duration_minutes) min",
            onSwap: editable ? { swapping = s } : nil,
            onRemove: editable ? { remove(s) } : nil
        ) { open = s }
    }

    private func subjectLabel(_ s: String) -> String {
        let t = s.replacingOccurrences(of: "-", with: " ")
        return t.prefix(1).uppercased() + t.dropFirst()
    }

    private func remove(_ s: Plan.Session) {
        let message = s.added ? "Removed." : "\(s.title) goes back to \(plan.trackTitle(s.subject))."
        Task { await runPlanEdit(store, ["op": .string("remove"), "sessionId": .string(s.id)], message) }
    }

    private func muted(_ text: String) -> some View {
        Text(text).font(.sans(15)).foregroundStyle(FW.Palette.text2)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, 6)
    }

    // What you're working toward: one card per track, then checkpoints.
    private func direction(_ today: String) -> some View {
        let tracks = plan.horizon?.tracks ?? []
        let checkpoints = plan.milestones.filter { $0.date >= today }
        return VStack(alignment: .leading, spacing: 0) {
            LearnSectionHead(eyebrow: "Direction", title: "What you’re working toward")
            VStack(spacing: 12) {
                ForEach(tracks) { t in
                    LearnTrackCard(plan: plan, track: t) { track = LearnTrackRef(id: t.id) }
                }
            }
            if !checkpoints.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Kicker("Checkpoints")
                    learnRows(checkpoints.map { LearnCheckpoint(m: $0) }) { c in
                        let days = PlanDate.daysUntil(today, c.m.date)
                        HStack(spacing: 14) {
                            Image(systemName: "scope")
                                .font(.system(size: 15))
                                .foregroundStyle(FW.Palette.text2)
                                .frame(width: 36, height: 36)
                                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.sm))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.m.title).font(.sans(15)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                                Text("Target: \(PlanDate.month(c.m.date))").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Text("\(days)").font(.sans(20, .medium)).monospacedDigit()
                                    .foregroundStyle(days <= 21 ? FW.Palette.caution : FW.Palette.text)
                                Text("days").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            }
                            .fixedSize()
                        }
                        .padding(.vertical, 10)
                        .frame(minHeight: 56)
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.top, 24)
            }
        }
    }
}

private struct LearnTrackRef: Identifiable { let id: String }
private struct LearnCheckpoint: Identifiable {
    let m: Plan.Milestone
    var id: String { m.date + m.title }
}

private struct LearnTrackCard: View {
    let plan: Plan
    let track: Plan.Track
    let onOpen: () -> Void

    var body: some View {
        let days = plan.slots.filter { $0.track == track.id }.map { PlanDate.short($0.day) }
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Dot(color: trackColor(track.id))
                    Text(track.title).font(.sans(16, .semibold)).foregroundStyle(FW.Palette.text)
                        .lineLimit(2)
                    Spacer(minLength: 8)
                    Text(track.paused ? "Paused" : days.isEmpty ? "No day yet" : days.joined(separator: " · "))
                        .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        .lineLimit(1)
                        .fixedSize()
                }
                if let goal = track.goals.first {
                    Text(goal).font(.serif(16)).foregroundStyle(FW.Palette.text)
                        .lineSpacing(3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Group {
                    if let next = track.backlog.first {
                        Text("\(Text("Next").font(.sans(13)).foregroundStyle(FW.Palette.text3))  \(next.title)")
                    } else {
                        Text("Everything on this track is covered.").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    }
                }
                .font(.sans(14))
                .foregroundStyle(FW.Palette.text2)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                Text("\(track.backlog.count) topics waiting").font(.sans(13)).monospacedDigit().foregroundStyle(FW.Palette.text3)
            }
            .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 18)
            .opacity(track.paused ? 0.6 : 1)
            .contentShape(.rect(cornerRadius: FW.Radius.lg))
        }
        .buttonStyle(YouPressStyle())
    }
}

// Next week, while it's still a draft: the sessions, the planner's note, any
// suggestion for more, and a way to steer it.
private struct LearnNextWeek: View {
    let plan: Plan
    let start: String
    let meta: Plan.WeekMeta
    let sessions: [Plan.Session]
    let done: Set<String>
    let today: String
    let row: (Plan.Session, Bool) -> AnyView
    let onAdd: () -> Void
    @Environment(Store.self) private var store
    @State private var note: String
    @State private var busy = false
    @FocusState private var focused: Bool

    init(plan: Plan, start: String, meta: Plan.WeekMeta, sessions: [Plan.Session], done: Set<String>, today: String,
         row: @escaping (Plan.Session, Bool) -> AnyView, onAdd: @escaping () -> Void) {
        self.plan = plan
        self.start = start
        self.meta = meta
        self.sessions = sessions
        self.done = done
        self.today = today
        self.row = row
        self.onAdd = onAdd
        _note = State(initialValue: meta.steer ?? "")
    }

    var body: some View {
        let canEdit = PlanDate.editable(start, today: today)
        let freeDay = [4, 5, 6, 0, 1, 2, 3].first { d in !sessions.contains { PlanDate.dayIndex($0.date) == d } }
        VStack(alignment: .leading, spacing: 0) {
            if let n = meta.note {
                Text(n).font(.serif(19)).lineSpacing(4).foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
                    .padding(.bottom, 10)
            }
            if sessions.isEmpty {
                Text("Nothing planned. A week away, or everything is paused.")
                    .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                    .padding(.vertical, 6)
            } else {
                learnRows(sessions) { s in row(s, canEdit) }
            }
            if canEdit, let s = meta.suggestion, let freeDay {
                suggestion(s, day: freeDay)
            }
            if canEdit { steer }
        }
    }

    private func suggestion(_ s: Plan.Suggestion, day: Int) -> some View {
        let track = s.track ?? plan.slots.first?.track ?? plan.horizon?.tracks.first?.id ?? ""
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: "sparkles").font(.system(size: 16)).foregroundStyle(FW.Palette.judgment)
                .frame(width: 20)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Room for \(s.extra == 1 ? "one more session" : "\(s.extra) more sessions")\(s.track.map { " of \(plan.trackTitle($0))" } ?? "")?")
                        .font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if !s.why.isEmpty {
                        Text(s.why).font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
                    }
                }
                HStack(spacing: 6) {
                    Button("Add \(PlanDate.short(day))") {
                        Task { await runPlanEdit(store, ["op": .string("add"), "week": .string(start), "track": .string(track), "day": .number(Double(day))], "Added on \(PlanDate.dayNames[day]).") }
                    }
                    .buttonStyle(.fw(.secondary, small: true))
                    Button {
                        Task { await runPlanEdit(store, ["op": .string("dismiss-suggestion"), "week": .string(start)]) }
                    } label: {
                        Image(systemName: "xmark").font(.system(size: 13, weight: .medium)).foregroundStyle(FW.Palette.text2)
                            .frame(width: 34, height: 34)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("No thanks")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .background(FW.Palette.judgment.opacity(0.09), in: .rect(cornerRadius: FW.Radius.lg))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg).strokeBorder(FW.Palette.judgment.opacity(0.22), lineWidth: 1))
        .padding(.top, 14)
    }

    private var steer: some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker("Anything for this week?")
            TextField("More speaking, less politics, a lighter week…", text: $note, axis: .vertical)
                .font(.sans(16))
                .lineLimit(2...6)
                .focused($focused)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(minHeight: 72, alignment: .topLeading)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line, lineWidth: 1))
                .onChange(of: note) { _, v in if v.count > 600 { note = String(v.prefix(600)) } }
                .accessibilityLabel("Anything for this week?")
            HStack(spacing: 8) {
                Button { Task { await redraft() } } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.clockwise").font(.system(size: 14, weight: .medium)) }
                        Text("Redraft")
                    }
                }
                .buttonStyle(.fw(.secondary))
                .disabled(busy)
                Button(action: onAdd) { Label("Add a session", systemImage: "plus") }
                    .buttonStyle(.fw(.ghost))
            }
            Text("Change anything until \(PlanDate.label(start)). What you don’t finish goes back to its track, never into a backlog.")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 18)
        .overlay(alignment: .top) { Rule() }
        .padding(.top, 18)
    }

    private func redraft() async {
        focused = false
        busy = true
        defer { busy = false }
        do {
            let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
            if text != (meta.steer ?? "") {
                try await store.planEdit(["op": .string("steer"), "week": .string(start), "note": .string(text)])
            }
            await store.sync()
            let r: LearnStateBody = try await API.post("/api/plan/week", ["action": "redraft"])
            store.adopt(r.state)
            Toasts.shared.show("Redrafted.")
        } catch is CancellationError {
        } catch {
            Toasts.shared.show(error.localizedDescription)
        }
    }
}

private struct LearnStateBody: Decodable, Sendable { var state: JSON }

private struct LearnDraftLater: View {
    @Environment(Store.self) private var store
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Next week is drafted on Sunday at noon, from what you’ve learned this week. You’ll get a notice when it’s ready.")
                .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
            Button { Task { await draft() } } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().controlSize(.small) }
                    Text("Draft it now")
                }
            }
            .buttonStyle(.fw(.secondary))
            .disabled(busy)
        }
        .padding(.vertical, 18)
        .padding(.horizontal, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg))
    }

    private func draft() async {
        busy = true
        defer { busy = false }
        do {
            let r: LearnStateBody = try await API.post("/api/plan/week", ["action": "draft"])
            store.adopt(r.state)
        } catch is CancellationError {
        } catch {
            Toasts.shared.show(error.localizedDescription)
        }
    }
}

// MARK: - Fixed plan

// A plan with every week dated (imported before plans ran a week at a time).
// The web's "Adjust schedule" flow isn't offered here.
private struct LearnFixed: View {
    let plan: Plan
    let concepts: [PlanConcept]
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var names = Loader<LearnChapterNames>("/api/chapters")
    @State private var open: Plan.Session?
    @State private var pendingRun: String?
    @State private var expanded: Set<String> = []

    struct Week: Identifiable {
        let week: Plan.Week
        let index: Int
        let sessions: [(session: Plan.Session, status: String)]
        var id: String { week.id }
    }

    var body: some View {
        let today = store.today
        let done = store.planDoneIds
        let weeks = buildWeeks()
        let current = weeks.firstIndex { w in
            today >= w.week.start_date && (w.index == weeks.count || today < weeks[w.index].week.start_date)
        }
        let before = today < (weeks.first?.week.start_date ?? plan.start_date)
        let now: [Int] = before ? [0, 1] : current.map { [$0, $0 + 1] } ?? []
        let shown = now.filter { weeks.indices.contains($0) }.map { weeks[$0] }
        let totalDone = weeks.reduce(0) { n, w in n + w.sessions.filter { done.contains($0.session.id) }.count }
        let totalPlanned = weeks.reduce(0) { n, w in n + w.sessions.filter { !$0.session.optional }.count }
        let book = learnChapters(plan, names: names.value?.names ?? [])

        VStack(alignment: .leading, spacing: 32) {
            PageHead(
                eyebrow: "Learn", title: plan.title,
                subtitle: "\(PlanDate.monthDay(plan.start_date)) → \(PlanDate.monthDay(plan.end_date)) · \(totalDone) of \(totalPlanned) sessions"
            )
            if !shown.isEmpty {
                VStack(alignment: .leading, spacing: 28) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { j, w in
                        block(w, label: before ? (j > 0 ? "The week after" : "Your first week") : j > 0 ? "Next week" : "This week", done: done, today: today)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Kicker("The whole plan")
                VStack(spacing: 10) {
                    ForEach(Array(book.enumerated()), id: \.element.id) { n, ch in
                        chapter(ch, n: n + 1, weeks: weeks, done: done, today: today)
                    }
                }
            }
        }
        .task { await names.load() }
        .sheet(item: $open, onDismiss: {
            if let id = pendingRun {
                pendingRun = nil
                router.cover = .session(id)
            }
        }) { s in
            PlanSessionSheet(
                plan: plan, session: s,
                concepts: concepts.filter { $0.sessions.contains(s.id) },
                done: done.contains(s.id),
                onStarted: { pendingRun = $0 }
            )
        }
    }

    // Weeks with their sessions, each at its effective date (overrides applied).
    private func buildWeeks() -> [Week] {
        let overrides = store.state["overrides"]?.object ?? [:]
        let sessions: [(session: Plan.Session, status: String)] = plan.sessions.map { s in
            guard let o = overrides[s.id] else { return (s, "planned") }
            var x = s
            if let d = o["date"]?.string { x.date = d }
            if let m = o["duration_minutes"]?.int { x.duration_minutes = m }
            if let t = o["start_local"]?.string { x.start_local = t }
            return (x, o["status"]?.string ?? "planned")
        }
        return plan.weeks.enumerated().map { i, wk in
            let end = i + 1 < plan.weeks.count ? plan.weeks[i + 1].start_date : "9999-12-31"
            let mine = sessions.filter { $0.session.date >= wk.start_date && $0.session.date < end }.sorted { $0.session.date < $1.session.date }
            return Week(week: wk, index: i + 1, sessions: mine)
        }
    }

    private func status(_ s: Plan.Session, _ raw: String, done: Set<String>, today: String) -> String {
        if done.contains(s.id) { return "done" }
        if raw == "skipped" || raw == "travel" { return raw }
        if s.date == today { return "today" }
        if s.date < today { return "missed" }
        return raw == "reduced" ? "reduced" : "planned"
    }

    private func block(_ w: Week, label: String?, done: Set<String>, today: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label ?? "Week \(w.index)").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                Text((label != nil ? "Week \(w.index) · " : "") + PlanDate.monthDay(w.week.start_date) + (w.week.mode != "standard" ? " · \(w.week.mode)" : ""))
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }
            .padding(.bottom, 4)
            VStack(spacing: 0) {
                ForEach(Array(w.sessions.enumerated()), id: \.element.session.id) { i, item in
                    if i > 0 { Rule() }
                    let st = status(item.session, item.status, done: done, today: today)
                    let suffix = st == "today" ? " · today" : st == "missed" ? " · not done" : st == "reduced" ? " · shortened" : ""
                    LearnSessionRow(
                        session: item.session, done: st == "done", today: today,
                        strength: planStrength(concepts, item.session.id),
                        sub: item.session.subject + (item.session.optional ? " · optional" : "") + suffix,
                        autoSuffix: false
                    ) { open = item.session }
                }
            }
            if !w.week.evidence.isEmpty {
                Text(w.week.evidence).font(.serif(16)).foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }
        }
    }

    private func chapter(_ ch: LearnChapter, n: Int, weeks: [Week], done: Set<String>, today: String) -> some View {
        let inside = weeks.filter { ch.weeks.contains($0.id) }
        let sessions = inside.flatMap { $0.sessions.map(\.session).filter { !$0.optional } }
        let finished = sessions.filter { done.contains($0.id) }.count
        let isNow = ch.start <= today && today <= ch.end
        let isOpen = expanded.contains(ch.id)
        var tracks: [String] = []
        for s in sessions where !tracks.contains(s.subject) { tracks.append(s.subject) }
        var meta = "\(PlanDate.monthDay(ch.start)) – \(PlanDate.monthDay(ch.end)) · \(inside.count) week\(inside.count == 1 ? "" : "s")"
        if !sessions.isEmpty { meta += " · \(finished)/\(sessions.count) sessions" }
        if let m = ch.milestone { meta += " · milestone: \(m)" }
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.snappy(duration: 0.3)) { if isOpen { expanded.remove(ch.id) } else { expanded.insert(ch.id) } }
            } label: {
                HStack(alignment: .top, spacing: 14) {
                    LearnChapterRing(done: finished, total: sessions.count, n: n)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(ch.title).font(.sans(16, .semibold)).foregroundStyle(FW.Palette.text)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            if isNow { PlanPill(text: "Now", color: FW.Palette.accent) }
                        }
                        if !ch.outcome.isEmpty {
                            Text(ch.outcome).font(.serif(15)).foregroundStyle(FW.Palette.text2)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Text(meta).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if !tracks.isEmpty {
                            HStack(spacing: 4) { ForEach(tracks, id: \.self) { Dot(color: trackColor($0), size: 7) } }
                                .padding(.top, 2)
                                .accessibilityHidden(true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(FW.Palette.text3)
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                        .padding(.top, 10)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            if isOpen {
                VStack(alignment: .leading, spacing: 24) {
                    ForEach(inside) { w in block(w, label: nil, done: done, today: today) }
                }
                .padding(.top, 18)
                .transition(.opacity)
            }
        }
        .card(FW.Radius.lg, fill: isNow ? FW.Palette.raised : FW.Palette.surface, padding: 16)
        .opacity(ch.end < today && !isOpen ? 0.75 : 1)
    }
}

private struct LearnChapterRing: View {
    let done: Int
    let total: Int
    let n: Int
    var body: some View {
        let complete = total > 0 && done == total
        ZStack {
            Circle().stroke(FW.Palette.line2, lineWidth: 2.5)
            Circle().trim(from: 0, to: total > 0 ? Double(done) / Double(total) : 0)
                .stroke(FW.Palette.text, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if complete {
                Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(FW.Palette.text)
            } else {
                Text("\(n)").font(.sans(15, .medium)).monospacedDigit().foregroundStyle(FW.Palette.text)
            }
        }
        .frame(width: 38, height: 38)
        .accessibilityElement()
        .accessibilityLabel("\(done) of \(total) sessions done")
    }
}

// MARK: - Chapters (src/lib/chapters.ts)

private struct LearnChapterNames: Decodable, Sendable {
    struct Name: Decodable, Sendable { var id: String; var title: String; var outcome: String }
    var names: [Name]
}

private struct LearnChapter: Identifiable {
    var id: String
    var weeks: [String]
    var start: String
    var end: String
    var milestone: String?
    var title: String
    var outcome: String
}

// The plan's weeks, grouped into chapters a few weeks long. A milestone always
// closes a chapter, and runs of travel or return weeks become their own short
// interlude. Named later by the model; until then the last week's evidence
// stands in.
private func learnChapters(_ plan: Plan, names: [LearnChapterNames.Name]) -> [LearnChapter] {
    let weeks = plan.weeks.sorted { $0.start_date < $1.start_date }
    guard !weeks.isEmpty else { return [] }
    let size = 4
    func endOf(_ i: Int) -> String { i + 1 < weeks.count ? PlanDate.addDays(weeks[i + 1].start_date, -1) : plan.end_date }
    func milestoneIn(_ i: Int) -> Plan.Milestone? {
        plan.milestones.first { $0.date >= weeks[i].start_date && $0.date <= endOf(i) }
    }
    func special(_ i: Int) -> Bool {
        weeks[i].mode.range(of: "travel|return|break|holiday|vacation", options: [.regularExpression, .caseInsensitive]) != nil && milestoneIn(i) == nil
    }
    var spans: [[Int]] = []
    var cur: [Int] = []
    for i in weeks.indices {
        if let last = cur.last, special(i) != special(last) {
            spans.append(cur)
            cur = []
        }
        cur.append(i)
        if milestoneIn(i) != nil {
            spans.append(cur)
            cur = []
        }
    }
    if !cur.isEmpty { spans.append(cur) }
    var groups: [[Int]] = []
    for span in spans {
        if special(span[0]) || span.count <= size + 1 {
            groups.append(span)
            continue
        }
        let n = Int((Double(span.count) / Double(size)).rounded())
        let chunk = Int((Double(span.count) / Double(max(n, 1))).rounded(.up))
        var j = 0
        while j < span.count {
            groups.append(Array(span[j..<min(j + chunk, span.count)]))
            j += chunk
        }
    }
    let named = Dictionary(names.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    func clean(_ s: String) -> String {
        var t = s.replacingOccurrences(of: #"^milestone \d+:\s*"#, with: "", options: [.regularExpression, .caseInsensitive])
        if t.hasSuffix(".") { t.removeLast() }
        return t.trimmingCharacters(in: .whitespaces)
    }
    func lower(_ s: String) -> String {
        guard s.count > 1, s.first!.isUppercase, s.dropFirst().first!.isLowercase else { return s }
        return s.prefix(1).lowercased() + s.dropFirst()
    }
    return groups.map { g in
        let first = weeks[g[0]]
        let lastIndex = g[g.count - 1]
        let milestone = milestoneIn(lastIndex)
        let outcomes = g.map { weeks[$0].evidence }.filter {
            !$0.isEmpty && $0.range(of: "^maintenance|^keep one skill", options: [.regularExpression, .caseInsensitive]) == nil
        }
        let fallback = milestone?.title ?? outcomes.last ?? first.topics.values.sorted().first ?? "Weeks \(g[0] + 1)–\(lastIndex + 1)"
        let id = "ch-" + first.id
        let name = named[id]
        return LearnChapter(
            id: id,
            weeks: g.map { weeks[$0].id },
            start: first.start_date,
            end: endOf(lastIndex),
            milestone: milestone?.title,
            title: name?.title ?? clean(fallback),
            outcome: name?.outcome ?? (outcomes.isEmpty ? "" : "By the end: \(outcomes.map { lower(clean($0)) }.joined(separator: "; ")).")
        )
    }
}
