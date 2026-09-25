import SwiftUI

// Learn (src/components/learn/learn.tsx, rolling.tsx). A plan that runs a
// week at a time shows this week as a day-by-day timeline, next week's draft
// (yours to shape until its Monday), your rhythm and the direction beyond. An
// older fixed plan shows this week, next week and its chapters.
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
                        LearnRolling(plan: plan, concepts: mastery.value?.concepts ?? [], onRhythm: { rhythm = true })
                    } else {
                        LearnFixed(plan: plan, concepts: mastery.value?.concepts ?? [])
                    }
                } else {
                    VStack(spacing: 14) {
                        IconBadge(systemName: "map.fill", color: FW.Palette.judgment, size: 72, circle: true)
                            .padding(.bottom, 6)
                        Text("No plan yet.").font(.sans(22, .bold)).foregroundStyle(FW.Palette.text)
                        Button { router.push(.importPlan) } label: { Label("Import a plan", systemImage: "square.and.arrow.down") }
                            .buttonStyle(.fw(.primary, wide: true))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 60)
                    .rise()
                }
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 4)
            .padding(.bottom, 48)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("Learn")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if plan?.isRolling == true {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Your rhythm", systemImage: "calendar") { rhythm = true }
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

// MARK: - Session rows (fixed plans)

private struct LearnSessionRow: View {
    let session: Plan.Session
    let done: Bool
    let today: String
    var strength: Double? = nil
    var sub: String
    let onOpen: () -> Void

    var body: some View {
        let color = trackColor(session.subject)
        let isToday = session.date == today
        Button(action: onOpen) {
            HStack(spacing: 12) {
                VStack(spacing: 0) {
                    Text(PlanDate.short(PlanDate.dayIndex(session.date)))
                        .font(.sans(12, .semibold))
                        .foregroundStyle(isToday ? FW.Palette.accent : FW.Palette.text3)
                    Text("\(Int(session.date.suffix(2)) ?? 0)")
                        .font(.rounded(19))
                        .foregroundStyle(FW.Palette.text)
                }
                .frame(width: 36)
                LearnNode(color: color, glyph: Glyph.track(session.subject), done: done, today: isToday, size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(session.title)
                            .font(.sans(15, .medium))
                            .foregroundStyle(done ? FW.Palette.text2 : FW.Palette.text)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if session.added { PlanPill(text: "New") }
                    }
                    Text(sub)
                        .font(.sans(13))
                        .foregroundStyle(FW.Palette.text3)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let strength, strength > 0 { PlanMiniMeter(value: strength, color: color) }
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text4)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 10)
            .frame(minHeight: 60)
            .contentShape(.rect)
        }
        .buttonStyle(.pressable)
        .accessibilityValue(done ? "Done" : "")
    }
}

// A day's marker: the track's glyph in its hue, filled with a tick once done.
private struct LearnNode: View {
    let color: Color
    let glyph: String
    var done = false
    var today = false
    var size: CGFloat = 36

    var body: some View {
        ZStack {
            Circle().fill(done ? color : color.opacity(today ? 0.2 : 0.13))
            if today && !done {
                Circle().strokeBorder(color, lineWidth: 2)
            }
            Image(systemName: done ? "checkmark" : glyph)
                .font(.system(size: size * (done ? 0.4 : 0.38), weight: .bold))
                .foregroundStyle(done ? FW.Palette.raised : color)
                .contentTransition(.symbolEffect(.replace))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

// A card with the raised fill and hairline used across Learn.
private extension View {
    func learnCard(padding: CGFloat = 16, tint: Color? = nil, stroke: Color = FW.Palette.line) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            .background {
                if let tint {
                    RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).fill(tint)
                }
            }
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(stroke, lineWidth: 1))
    }
}

// MARK: - Rolling plan

private struct LearnRolling: View {
    let plan: Plan
    let concepts: [PlanConcept]
    let onRhythm: () -> Void
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var open: Plan.Session?
    @State private var swapAfter: Plan.Session?
    @State private var pendingRun: String?
    @State private var swapping: Plan.Session?
    @State private var track: LearnTrackRef?
    @State private var adding = false
    @State private var shaping = false
    @State private var addAfterShape = false
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

        VStack(alignment: .leading, spacing: 28) {
            // The week at a glance.
            LearnWeekHeader(
                plan: plan, start: current, sessions: thisWeek, done: done, today: today,
                label: before ? "Starts \(PlanDate.label(plan.start_date))" : "Week \(index)",
                doneCount: doneThisWeek
            ) { s in open = s }
            .rise(0)

            // This week, day by day.
            VStack(alignment: .leading, spacing: 12) {
                SectionHead(title: before ? "Your first week" : "This week", trailing: PlanDate.range(current))
                if thisWeek.isEmpty {
                    muted("Nothing planned this week. Rest counts too.", icon: "moon.zzz.fill")
                } else {
                    LearnTimeline(start: current, today: today) { date in
                        ForEach(thisWeek.filter { $0.date == date }) { s in
                            card(s, done: done, today: today, canEdit: canEditNow)
                        }
                    } hasSession: { date in thisWeek.contains { $0.date == date } } node: { date in
                        let ss = thisWeek.filter { $0.date == date }
                        return ss.first.map { s in (trackColor(s.subject), Glyph.track(s.subject), ss.allSatisfy { done.contains($0.id) }) }
                    }
                }
                if canEditNow {
                    Label(today == current ? "You can reshape this week until tonight." : "You can reshape this week until it starts on Monday.", systemImage: "hand.draw")
                        .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .rise(1)

            // Next week
            if current <= today {
                let meta = plan.weekMeta(upcoming)
                Group {
                    if let meta {
                        LearnNextWeek(
                            plan: plan, start: upcoming, meta: meta, sessions: nextSessions, today: today,
                            onOpen: { open = $0 },
                            onSwap: { swapping = $0 },
                            onRemove: { remove($0) },
                            onShape: { shaping = true }
                        )
                    } else {
                        LearnDraftLater(start: upcoming)
                    }
                }
                .rise(2)
            }

            LearnRhythmCard(plan: plan, onOpen: onRhythm)
                .rise(3)

            direction(today)
                .rise(4)

            if !past.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHead(title: "Past weeks")
                    VStack(spacing: 0) {
                        ForEach(Array(past.enumerated()), id: \.element.start) { i, m in
                            let ss = plan.weekSessions(m.start)
                            if i > 0 { Rule() }
                            PlanDisclosure(
                                title: PlanDate.range(m.start),
                                teaser: "\(m.done ?? ss.filter { done.contains($0.id) }.count) of \(m.planned ?? ss.count) done",
                                open: Binding(get: { pastOpen.contains(m.start) }, set: { v in if v { pastOpen.insert(m.start) } else { pastOpen.remove(m.start) } })
                            ) {
                                if ss.isEmpty {
                                    muted("Nothing finished that week. Its topics went back to their tracks.", icon: "arrow.uturn.backward")
                                } else {
                                    VStack(spacing: 8) {
                                        ForEach(ss) { s in card(s, done: done, today: today, canEdit: false, compact: true) }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .learnCard(padding: 0)
                }
                .rise(5)
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
        .sheet(isPresented: $shaping, onDismiss: {
            if addAfterShape {
                addAfterShape = false
                adding = true
            }
        }) {
            if let meta = plan.weekMeta(upcoming) {
                LearnShapeSheet(start: upcoming, meta: meta) {
                    addAfterShape = true
                    shaping = false
                }
            }
        }
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

    private func card(_ s: Plan.Session, done: Set<String>, today: String, canEdit: Bool, compact: Bool = false) -> some View {
        let isDone = done.contains(s.id)
        let editable = canEdit && !isDone
        return LearnSessionCard(
            plan: plan, session: s, done: isDone, today: today,
            strength: planStrength(concepts, s.id),
            compact: compact,
            onSwap: editable ? { swapping = s } : nil,
            onRemove: editable ? { remove(s) } : nil
        ) { open = s }
    }

    private func remove(_ s: Plan.Session) {
        let message = s.added ? "Removed." : "\(s.title) goes back to \(plan.trackTitle(s.subject))."
        Task { await runPlanEdit(store, ["op": .string("remove"), "sessionId": .string(s.id)], message) }
    }

    private func muted(_ text: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(FW.Palette.text3)
            Text(text).font(.sans(15)).foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 8)
    }

    // What you're working toward: one row per track, then checkpoints.
    private func direction(_ today: String) -> some View {
        let tracks = plan.horizon?.tracks ?? []
        let checkpoints = plan.milestones.filter { $0.date >= today }
        return VStack(alignment: .leading, spacing: 28) {
            if !tracks.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHead(title: "Tracks", trailing: "\(tracks.reduce(0) { $0 + $1.backlog.count }) topics waiting")
                    GroupCard {
                        ForEach(tracks) { t in
                            LearnTrackRow(plan: plan, track: t) { track = LearnTrackRef(id: t.id) }
                        }
                    }
                }
            }
            if !checkpoints.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHead(title: "Checkpoints")
                    GroupCard {
                        ForEach(checkpoints.map { LearnCheckpoint(m: $0) }) { c in
                            let days = PlanDate.daysUntil(today, c.m.date)
                            GroupRow(icon: "flag.checkered", title: c.m.title, caption: "Target: \(PlanDate.month(c.m.date))", color: FW.Palette.coral) {
                                VStack(alignment: .trailing, spacing: 0) {
                                    Text("\(days)").font(.rounded(20))
                                        .foregroundStyle(days <= 21 ? FW.Palette.caution : FW.Palette.text)
                                    Text("days").font(.sans(12, .medium)).foregroundStyle(FW.Palette.text3)
                                }
                                .fixedSize()
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
            }
        }
    }
}

private struct LearnTrackRef: Identifiable { let id: String }
private struct LearnCheckpoint: Identifiable {
    let m: Plan.Milestone
    var id: String { m.date + m.title }
}

// MARK: - The week at a glance

// The plan's name, this week's progress ring and a strip of the seven days,
// each marked with its track's glyph (a tick once done). Today is ringed.
private struct LearnWeekHeader: View {
    let plan: Plan
    let start: String
    let sessions: [Plan.Session]
    let done: Set<String>
    let today: String
    let label: String
    let doneCount: Int
    let onOpen: (Plan.Session) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(label).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3)
                    Text(plan.title)
                        .font(.sans(22, .bold))
                        .foregroundStyle(FW.Palette.text)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                LearnRing(done: doneCount, total: sessions.count)
            }
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { d in
                    let date = PlanDate.addDays(start, d)
                    let ss = sessions.filter { $0.date == date }
                    let isToday = date == today
                    Button { if let s = ss.first { onOpen(s) } } label: {
                        VStack(spacing: 8) {
                            Text(String(PlanDate.short(d).prefix(1)))
                                .font(.sans(12, .semibold))
                                .foregroundStyle(isToday ? FW.Palette.text : FW.Palette.text3)
                            if let s = ss.first {
                                LearnNode(color: trackColor(s.subject), glyph: Glyph.track(s.subject), done: ss.allSatisfy { done.contains($0.id) }, today: isToday, size: 34)
                            } else {
                                Circle().strokeBorder(FW.Palette.line3, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                                    .frame(width: 34, height: 34)
                            }
                            Text("\(Int(date.suffix(2)) ?? 0)")
                                .font(.sans(13, isToday ? .bold : .medium))
                                .monospacedDigit()
                                .foregroundStyle(isToday ? FW.Palette.onAccent : FW.Palette.text2)
                                .frame(width: 26, height: 22)
                                .background { if isToday { Capsule().fill(FW.Palette.accent) } }
                        }
                        .frame(maxWidth: .infinity)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.pressable(0.92))
                    .disabled(ss.isEmpty)
                    .accessibilityLabel("\(PlanDate.dayNames[d])\(isToday ? ", today" : ""): \(ss.isEmpty ? "rest" : ss.map(\.title).joined(separator: ", "))")
                }
            }
        }
        .learnCard(padding: 18)
    }
}

// This week's sessions done, as a ring with the count inside.
private struct LearnRing: View {
    let done: Int
    let total: Int
    @State private var shown: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let value = total > 0 ? Double(done) / Double(total) : 0
        ZStack {
            Circle().stroke(FW.Palette.surface2, lineWidth: 6)
            Circle().trim(from: 0, to: shown)
                .stroke(FW.Palette.positive, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: -2) {
                Text("\(done)").font(.rounded(19)).foregroundStyle(FW.Palette.text).contentTransition(.numericText())
                Text("of \(total)").font(.sans(10, .semibold)).foregroundStyle(FW.Palette.text3)
            }
        }
        .frame(width: 60, height: 60)
        .onAppear { withAnimation(reduceMotion ? nil : Springs.smooth.delay(0.25)) { shown = value } }
        .onChange(of: value) { _, v in withAnimation(Springs.smooth) { shown = v } }
        .accessibilityElement()
        .accessibilityLabel("\(done) of \(total) done this week")
    }
}

// MARK: - Timeline

// Seven days down a rail: a day label, the day's marker, and its sessions
// (or a quiet "Rest"). Today's label is lit.
private struct LearnTimeline<Cards: View>: View {
    let start: String
    let today: String
    @ViewBuilder var cards: (String) -> Cards
    let hasSession: (String) -> Bool
    let node: (String) -> (Color, String, Bool)?

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { d in
                let date = PlanDate.addDays(start, d)
                let isToday = date == today
                let busy = hasSession(date)
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        Text(isToday ? "Today" : PlanDate.short(d))
                            .font(.sans(12, .semibold))
                            .foregroundStyle(isToday ? FW.Palette.accent : FW.Palette.text3)
                        Text("\(Int(date.suffix(2)) ?? 0)")
                            .font(.rounded(busy ? 20 : 16, busy ? .bold : .semibold))
                            .foregroundStyle(isToday ? FW.Palette.accent : busy ? FW.Palette.text : FW.Palette.text3)
                    }
                    .frame(width: 42)
                    .padding(.top, busy ? 10 : 2)
                    // The rail.
                    VStack(spacing: 0) {
                        Rectangle().fill(d == 0 ? .clear : FW.Palette.line2).frame(width: 2, height: busy ? 12 : 6)
                        if let n = node(date) {
                            LearnNode(color: n.0, glyph: n.1, done: n.2, today: isToday, size: 30)
                        } else {
                            Circle().fill(FW.Palette.surface3).frame(width: 10, height: 10).padding(.vertical, 2)
                        }
                        Rectangle().fill(d == 6 ? .clear : FW.Palette.line2).frame(width: 2).frame(maxHeight: .infinity)
                    }
                    .frame(width: 30)
                    VStack(alignment: .leading, spacing: 8) {
                        if busy {
                            cards(date)
                        } else {
                            Text("Rest").font(.sans(14)).foregroundStyle(FW.Palette.text4)
                                .padding(.top, 3)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, busy ? 12 : 10)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// One session in the timeline: title, minutes and track, why in a line.
// Editable ones carry a menu (and a long-press menu) to swap or remove.
private struct LearnSessionCard: View {
    let plan: Plan
    let session: Plan.Session
    let done: Bool
    let today: String
    var strength: Double? = nil
    var compact = false
    var onSwap: (() -> Void)? = nil
    var onRemove: (() -> Void)? = nil
    let onOpen: () -> Void

    private var state: String {
        done ? "done" : session.date == today ? "today" : session.date < today ? "open" : "planned"
    }

    var body: some View {
        let color = trackColor(session.subject)
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: 12) {
                if compact {
                    LearnNode(color: color, glyph: Glyph.track(session.subject), done: done, size: 30)
                }
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(session.title)
                            .font(.sans(16, .semibold))
                            .foregroundStyle(done ? FW.Palette.text2 : FW.Palette.text)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if session.added { PlanPill(text: "New") }
                    }
                    HStack(spacing: 6) {
                        Image(systemName: "clock").font(.system(size: 11, weight: .semibold))
                        Text("\(session.duration_minutes) min")
                        Text("·")
                        Text(plan.trackTitle(session.subject)).foregroundStyle(color)
                        switch state {
                        case "done": Text("· Done").foregroundStyle(FW.Palette.positive)
                        case "open": Text("· Still open").foregroundStyle(FW.Palette.caution)
                        default: EmptyView()
                        }
                    }
                    .font(.sans(13, .medium))
                    .foregroundStyle(FW.Palette.text3)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    if let why = session.why, !compact {
                        Text(why)
                            .font(.sans(13))
                            .foregroundStyle(FW.Palette.text3)
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                    }
                    if let strength, strength > 0 {
                        PlanMiniMeter(value: strength, color: color).padding(.top, 2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, onSwap != nil ? 30 : 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.raised, in: .rect(cornerRadius: 16, style: .continuous))
            .background {
                if state == "today" { RoundedRectangle(cornerRadius: 16, style: .continuous).fill(color.opacity(0.06)) }
            }
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(state == "today" ? color.opacity(0.7) : FW.Palette.line, lineWidth: state == "today" ? 1.5 : 1)
            )
            .opacity(done ? 0.8 : 1)
            .contentShape(.rect(cornerRadius: 16))
        }
        .buttonStyle(.pressable)
        .overlay(alignment: .topTrailing) {
            if let onSwap, let onRemove {
                Menu {
                    Button("Swap for another topic", systemImage: "arrow.triangle.2.circlepath", action: onSwap)
                    Button("Take it out of this week", systemImage: "xmark", role: .destructive, action: onRemove)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(FW.Palette.text2)
                        .frame(width: 44, height: 44)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Change \(session.title)")
            }
        }
        .contextMenu {
            if let onSwap, let onRemove {
                Button("Swap for another topic", systemImage: "arrow.triangle.2.circlepath", action: onSwap)
                Button("Take it out of this week", systemImage: "xmark", role: .destructive, action: onRemove)
            }
        }
    }
}

// MARK: - Tracks and rhythm

private struct LearnTrackRow: View {
    let plan: Plan
    let track: Plan.Track
    let onOpen: () -> Void

    var body: some View {
        let days = plan.slots.filter { $0.track == track.id }.map { PlanDate.short($0.day) }
        Button(action: onOpen) {
            HStack(spacing: 14) {
                IconBadge(systemName: Glyph.track(track.id), color: trackColor(track.id), size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(track.title).font(.sans(16, .medium)).foregroundStyle(FW.Palette.text).lineLimit(1)
                        if track.paused { PlanPill(text: "Paused", color: FW.Palette.text3) }
                    }
                    Group {
                        if let next = track.backlog.first {
                            Text("Next: \(next.title)")
                        } else {
                            Text("Everything on this track is covered.")
                        }
                    }
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(track.paused ? "—" : days.isEmpty ? "No day yet" : days.joined(separator: " · "))
                        .font(.sans(13, .medium)).foregroundStyle(FW.Palette.text2)
                    Text("\(track.backlog.count) topics").font(.sans(12)).monospacedDigit().foregroundStyle(FW.Palette.text3)
                }
                .lineLimit(1)
                .fixedSize()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text4)
            }
            .padding(.vertical, 11)
            .frame(minHeight: 60)
            .opacity(track.paused ? 0.6 : 1)
            .contentShape(.rect)
        }
        .buttonStyle(.pressable(0.985))
        .accessibilityHint("Shows the topics waiting on this track")
    }
}

// Which track each weekday keeps, as a row of glyphs; opens the rhythm sheet.
private struct LearnRhythmCard: View {
    let plan: Plan
    let onOpen: () -> Void

    var body: some View {
        let rhythm = plan.horizon?.rhythm
        let count = plan.slots.count
        VStack(alignment: .leading, spacing: 12) {
            SectionHead(title: "Your rhythm", trailing: rhythm.map { "\($0.minutes) min · \(PlanDate.clock($0.start_local))" })
            Button(action: onOpen) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { d in
                            let t = rhythm?.days[String(d)]
                            VStack(spacing: 6) {
                                if let t {
                                    IconBadge(systemName: Glyph.track(t), color: trackColor(t), size: 34, circle: true)
                                } else {
                                    IconBadge(systemName: "moon.zzz.fill", color: FW.Palette.text4, size: 34, circle: true)
                                }
                                Text(PlanDate.short(d)).font(.sans(12, .medium)).foregroundStyle(FW.Palette.text3)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    HStack {
                        Text("\(count) session\(count == 1 ? "" : "s") a week")
                            .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                        Spacer(minLength: 8)
                        Text("Change").font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text)
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(FW.Palette.text4)
                    }
                }
                .learnCard(padding: 16)
                .contentShape(.rect(cornerRadius: FW.Radius.lg))
            }
            .buttonStyle(.pressable)
            .accessibilityLabel("Your rhythm: \(plan.rhythmSummary)")
            .accessibilityHint("Change which day keeps which subject")
        }
    }
}

// MARK: - Next week

// Next week, while it's still a draft: the planner's note, the sessions, any
// suggestion for more, and one clear way to shape it.
private struct LearnNextWeek: View {
    let plan: Plan
    let start: String
    let meta: Plan.WeekMeta
    let sessions: [Plan.Session]
    let today: String
    let onOpen: (Plan.Session) -> Void
    let onSwap: (Plan.Session) -> Void
    let onRemove: (Plan.Session) -> Void
    let onShape: () -> Void
    @Environment(Store.self) private var store

    var body: some View {
        let canEdit = PlanDate.editable(start, today: today)
        let freeDay = [4, 5, 6, 0, 1, 2, 3].first { d in !sessions.contains { PlanDate.dayIndex($0.date) == d } }
        let minutes = sessions.reduce(0) { $0 + $1.duration_minutes }
        VStack(alignment: .leading, spacing: 12) {
            SectionHead(title: "Next week", trailing: PlanDate.range(start))
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    IconBadge(systemName: meta.status == "draft" ? "pencil.and.outline" : "calendar", color: FW.Palette.judgment, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(meta.status == "draft" ? "Drafted for you" : "Planned")
                            .font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                        Text("\(sessions.count) session\(sessions.count == 1 ? "" : "s") · \(LearnFormat.minutes(minutes))")
                            .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    }
                    Spacer(minLength: 8)
                    if meta.status == "draft" { PlanPill(text: "Draft", color: FW.Palette.caution, big: true) }
                }
                if let n = meta.note {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "sparkles").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.judgment)
                            .padding(.top, 3)
                        PlanMoreText(text: n, font: .sans(15), color: FW.Palette.text2)
                    }
                    .padding(12)
                    .background(FW.Palette.judgment.opacity(0.07), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                }
                if sessions.isEmpty {
                    Label("Nothing planned. A week away, or everything is paused.", systemImage: "moon.zzz")
                        .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(sessions.enumerated()), id: \.element.id) { i, s in
                            if i > 0 { Rule().padding(.leading, 88) }
                            row(s, canEdit: canEdit)
                        }
                    }
                }
                if canEdit, let s = meta.suggestion, let freeDay {
                    suggestion(s, day: freeDay)
                }
                if canEdit {
                    Button(action: onShape) {
                        Label("Shape next week", systemImage: "slider.horizontal.3")
                    }
                    .buttonStyle(.fw(.primary, wide: true))
                }
            }
            .learnCard(padding: 16)
        }
    }

    private func row(_ s: Plan.Session, canEdit: Bool) -> some View {
        Button { onOpen(s) } label: {
            HStack(spacing: 12) {
                Text(PlanDate.short(PlanDate.dayIndex(s.date)))
                    .font(.sans(13, .semibold))
                    .foregroundStyle(FW.Palette.text3)
                    .frame(width: 34, alignment: .leading)
                IconBadge(systemName: Glyph.track(s.subject), color: trackColor(s.subject), size: 30, circle: true)
                HStack(spacing: 6) {
                    Text(s.title)
                        .font(.sans(15, .medium))
                        .foregroundStyle(FW.Palette.text)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                    if s.added { PlanPill(text: "New") }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(s.duration_minutes)m")
                    .font(.sans(13, .medium))
                    .monospacedDigit()
                    .foregroundStyle(FW.Palette.text3)
            }
            .padding(.vertical, 9)
            .frame(minHeight: 52)
            .contentShape(.rect)
        }
        .buttonStyle(.pressable(0.985))
        .contextMenu {
            if canEdit {
                Button("Swap for another topic", systemImage: "arrow.triangle.2.circlepath") { onSwap(s) }
                Button("Take it out of this week", systemImage: "xmark", role: .destructive) { onRemove(s) }
            }
        }
    }

    private func suggestion(_ s: Plan.Suggestion, day: Int) -> some View {
        let track = s.track ?? plan.slots.first?.track ?? plan.horizon?.tracks.first?.id ?? ""
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                IconBadge(systemName: "plus.circle.fill", color: FW.Palette.judgment, size: 32, circle: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Room for \(s.extra == 1 ? "one more session" : "\(s.extra) more sessions")\(s.track.map { " of \(plan.trackTitle($0))" } ?? "")?")
                        .font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if !s.why.isEmpty {
                        PlanMoreText(text: s.why, font: .sans(13), color: FW.Palette.text3)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 8) {
                Button("Add \(PlanDate.short(day))") {
                    Task { await runPlanEdit(store, ["op": .string("add"), "week": .string(start), "track": .string(track), "day": .number(Double(day))], "Added on \(PlanDate.dayNames[day]).") }
                }
                .buttonStyle(.fw(.secondary, small: true))
                Button("No thanks") {
                    Task { await runPlanEdit(store, ["op": .string("dismiss-suggestion"), "week": .string(start)]) }
                }
                .buttonStyle(.fw(.ghost, small: true))
            }
            .padding(.leading, 44)
        }
        .padding(14)
        .background(FW.Palette.judgment.opacity(0.08), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(FW.Palette.judgment.opacity(0.2), lineWidth: 1))
    }
}

private enum LearnFormat {
    // "3 h 30 min", "45 min".
    static func minutes(_ m: Int) -> String {
        let h = m / 60, r = m % 60
        if h == 0 { return "\(r) min" }
        return r == 0 ? "\(h) h" : "\(h) h \(r) min"
    }
}

// Steer next week in a few words, redraft it, or add a session.
private struct LearnShapeSheet: View {
    let start: String
    let meta: Plan.WeekMeta
    let onAdd: () -> Void
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var note: String
    @State private var busy = false
    @FocusState private var focused: Bool

    init(start: String, meta: Plan.WeekMeta, onAdd: @escaping () -> Void) {
        self.start = start
        self.meta = meta
        self.onAdd = onAdd
        _note = State(initialValue: meta.steer ?? "")
    }

    var body: some View {
        SheetScaffold(title: "Shape next week", subtitle: PlanDate.range(start)) {
            VStack(alignment: .leading, spacing: 10) {
                Label("Anything for this week?", systemImage: "text.bubble")
                    .font(.sans(15, .semibold))
                    .foregroundStyle(FW.Palette.text)
                TextField("More speaking, less politics, a lighter week…", text: $note, axis: .vertical)
                    .font(.sans(16))
                    .lineLimit(3...6)
                    .focused($focused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .frame(minHeight: 96, alignment: .topLeading)
                    .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line, lineWidth: 1))
                    .onChange(of: note) { _, v in if v.count > 600 { note = String(v.prefix(600)) } }
                    .accessibilityLabel("Anything for this week?")
            }
            VStack(spacing: 10) {
                Button { Task { await redraft() } } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().controlSize(.small).tint(FW.Palette.onAccent) } else { Image(systemName: "arrow.clockwise") }
                        Text(busy ? "Redrafting…" : "Redraft")
                    }
                }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(busy)
                Button(action: onAdd) { Label("Add a session", systemImage: "plus") }
                    .buttonStyle(.fw(.secondary, wide: true))
                    .disabled(busy)
            }
            Label("Change anything until \(PlanDate.label(start)). What you don’t finish goes back to its track, never into a backlog.", systemImage: "arrow.uturn.backward")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .presentationDetents([.medium, .large])
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
            dismiss()
        } catch is CancellationError {
        } catch {
            Toasts.shared.show(error.localizedDescription)
        }
    }
}

private struct LearnStateBody: Decodable, Sendable { var state: JSON }

private struct LearnDraftLater: View {
    let start: String
    @Environment(Store.self) private var store
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHead(title: "Next week", trailing: PlanDate.range(start))
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    IconBadge(systemName: "calendar.badge.clock", color: FW.Palette.judgment, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Drafted Sunday at noon").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                        PlanMoreText(text: "Next week is drafted on Sunday at noon, from what you’ve learned this week. You’ll get a notice when it’s ready.", font: .sans(13), color: FW.Palette.text3)
                    }
                }
                Button { Task { await draft() } } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().controlSize(.small) } else { Image(systemName: "wand.and.sparkles") }
                        Text("Draft it now")
                    }
                }
                .buttonStyle(.fw(.secondary, wide: true))
                .disabled(busy)
            }
            .learnCard(padding: 16)
        }
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
            VStack(alignment: .leading, spacing: 4) {
                Text("\(PlanDate.monthDay(plan.start_date)) → \(PlanDate.monthDay(plan.end_date))")
                    .font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3)
                Text(plan.title).font(.sans(22, .bold)).foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                Pill(text: "\(totalDone) of \(totalPlanned) sessions", icon: "checkmark.circle.fill", color: FW.Palette.positive)
                    .padding(.top, 6)
            }
            .rise(0)
            if !shown.isEmpty {
                VStack(alignment: .leading, spacing: 28) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { j, w in
                        block(w, label: before ? (j > 0 ? "The week after" : "Your first week") : j > 0 ? "Next week" : "This week", done: done, today: today)
                            .rise(j + 1)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                SectionHead(title: "The whole plan", trailing: "\(book.count) chapters")
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
        VStack(alignment: .leading, spacing: 8) {
            if let label {
                SectionHead(title: label, trailing: "Week \(w.index) · " + PlanDate.monthDay(w.week.start_date) + (w.week.mode != "standard" ? " · \(w.week.mode)" : ""))
            } else {
                Text("Week \(w.index) · " + PlanDate.monthDay(w.week.start_date) + (w.week.mode != "standard" ? " · \(w.week.mode)" : ""))
                    .font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text2)
            }
            VStack(spacing: 0) {
                ForEach(Array(w.sessions.enumerated()), id: \.element.session.id) { i, item in
                    if i > 0 { Rule() }
                    let st = status(item.session, item.status, done: done, today: today)
                    let suffix = st == "today" ? " · today" : st == "missed" ? " · not done" : st == "reduced" ? " · shortened" : ""
                    LearnSessionRow(
                        session: item.session, done: st == "done", today: today,
                        strength: planStrength(concepts, item.session.id),
                        sub: item.session.subject + (item.session.optional ? " · optional" : "") + suffix
                    ) { open = item.session }
                }
            }
            .padding(.horizontal, label != nil ? 14 : 0)
            .background { if label != nil { RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).fill(FW.Palette.raised) } }
            .overlay { if label != nil { RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line) } }
            if !w.week.evidence.isEmpty {
                Label(w.week.evidence, systemImage: "checkmark.seal")
                    .font(.sans(14)).foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
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
                withAnimation(Springs.snappy) { if isOpen { expanded.remove(ch.id) } else { expanded.insert(ch.id) } }
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
                            Text(ch.outcome).font(.sans(14)).foregroundStyle(FW.Palette.text2)
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
            .buttonStyle(.pressable(0.985))
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
                .stroke(FW.Palette.positive, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if complete {
                Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(FW.Palette.positive)
            } else {
                Text("\(n)").font(.rounded(15)).foregroundStyle(FW.Palette.text)
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
