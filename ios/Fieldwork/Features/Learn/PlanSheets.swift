import SwiftUI

// Rhythm, track, swap, add and session sheets (src/components/learn/rolling.tsx),
// plus the small pieces Learn, You and Import share: a disclosure, a chip
// tinted by track, a labelled field and the plan-edit helper.

// MARK: - Shared pieces

// A plan edit (src/lib/rolling.ts PlanEdit) with the web's toast after it.
@MainActor
func runPlanEdit(_ store: Store, _ edit: [String: JSON], _ message: String? = nil) async {
    do {
        try await store.planEdit(edit)
        if let message { Toasts.shared.show(message) }
    } catch is CancellationError {
    } catch {
        Toasts.shared.show(error.localizedDescription)
    }
}

// A concept from GET /api/mastery, as Learn shows it (strength per session).
struct PlanConcept: Decodable, Sendable, Identifiable, Hashable {
    var key: String
    var title: String
    var track: String
    var strength: Double
    var level: String
    var sessions: [String]
    var misconceptions: [String]
    var id: String { key }

    private enum K: String, CodingKey { case key, title, track, strength, level, sessions, misconceptions }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        key = try c.decode(String.self, forKey: .key)
        title = c.lenient(String.self, .title) ?? key
        track = c.lenient(String.self, .track) ?? ""
        strength = c.lenient(Double.self, .strength) ?? 0
        level = c.lenient(String.self, .level) ?? "new"
        sessions = c.lenient([String].self, .sessions) ?? []
        misconceptions = c.lenient([String].self, .misconceptions) ?? []
    }
}

struct PlanConcepts: Decodable, Sendable {
    var concepts: [PlanConcept]
    private enum K: String, CodingKey { case concepts }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        concepts = (c.lenient([PlanConceptMaybe].self, .concepts) ?? []).compactMap(\.value)
    }
}

private struct PlanConceptMaybe: Decodable, Sendable {
    let value: PlanConcept?
    init(from decoder: Decoder) throws { value = try? PlanConcept(from: decoder) }
}

// Average strength of the concepts a session teaches, if any.
func planStrength(_ concepts: [PlanConcept], _ sessionId: String) -> Double? {
    let cs = concepts.filter { $0.sessions.contains(sessionId) }
    guard !cs.isEmpty else { return nil }
    return cs.reduce(0) { $0 + $1.strength } / Double(cs.count)
}

// A section that folds (web: Disclosure).
struct PlanDisclosure<Content: View>: View {
    let title: String
    var teaser: String? = nil
    var titleSize: CGFloat = 16
    @Binding var open: Bool
    @ViewBuilder var content: () -> Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.3)) { open.toggle() }
            } label: {
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.sans(titleSize, .semibold))
                            .foregroundStyle(FW.Palette.text)
                            .fixedSize(horizontal: false, vertical: true)
                        if let teaser {
                            Text(teaser).font(.sans(14)).foregroundStyle(FW.Palette.text3)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(FW.Palette.text3)
                        .rotationEffect(.degrees(open ? 180 : 0))
                }
                .padding(.vertical, 12)
                .frame(minHeight: 56)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityValue(open ? "Expanded" : "Collapsed")
            if open {
                content()
                    .padding(.top, 2)
                    .padding(.bottom, 20)
                    .transition(.opacity)
            }
        }
    }
}

// A chip; selected ones fill with their track's hue (web: .chip.t-<track>).
struct PlanChip: View {
    let text: String
    var selected = false
    var color: Color = FW.Palette.accent
    let action: () -> Void

    var body: some View {
        Button {
            Feedback.shared.play(.tap)
            action()
        } label: {
            Text(text)
                .font(.sans(13.5, selected ? .medium : .regular))
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(minHeight: 32)
                .foregroundStyle(selected ? FW.Palette.onAccent : FW.Palette.text2)
                .background(selected ? color : FW.Palette.surface2, in: .capsule)
                .overlay(Capsule().strokeBorder(FW.Palette.line2, lineWidth: selected ? 0 : 1))
                .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// A labelled choice inside a sheet, with the effect spelled out (web: Field).
struct PlanField<Content: View>: View {
    let label: String
    var hint: String? = nil
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(label).font(.sans(14, .medium)).foregroundStyle(FW.Palette.text2)
            content()
            if let hint {
                Text(hint).font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// "New" / "Draft" pills.
struct PlanPill: View {
    let text: String
    var color: Color = FW.Palette.judgment
    var big = false
    var body: some View {
        Text(text)
            .font(.sans(big ? 13 : 11.5, .semibold))
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, big ? 12 : 8)
            .frame(minHeight: big ? 26 : 20)
            .foregroundStyle(color)
            .background(color.opacity(0.16), in: .capsule)
    }
}

// A thin strength meter (web: .meter.mini).
struct PlanMiniMeter: View {
    let value: Double
    var color: Color
    var body: some View {
        Meter(value: value, color: color, height: 4)
            .frame(width: 44)
            .accessibilityElement()
            .accessibilityLabel("\(Int((value * 100).rounded()))% strength")
    }
}

// MARK: - Rhythm

// The week's shape: each weekday keeps its track, so Monday always means the
// same thing. Changes apply from the next week drafted. Opens from Learn and
// from You → Your rhythm.
struct PlanRhythmSheet: View {
    let plan: Plan
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var days: [String: String]
    @State private var minutes: Int
    @State private var start: Date

    init(plan: Plan) {
        self.plan = plan
        _days = State(initialValue: plan.horizon?.rhythm.days ?? [:])
        _minutes = State(initialValue: plan.horizon?.rhythm.minutes ?? 60)
        _start = State(initialValue: PlanDate.time(plan.horizon?.rhythm.start_local ?? "10:00") ?? .now)
    }

    private var tracks: [Plan.Track] { plan.horizon?.tracks ?? [] }
    private var count: Int { days.count }
    private var hours: String {
        let h = (Double(count * minutes) / 6).rounded() / 10
        return h == h.rounded() ? String(Int(h)) : String(h)
    }

    var body: some View {
        SheetScaffold(title: "Your rhythm", subtitle: "Each day keeps its subject, so the week feels familiar while what you learn adapts.") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(0..<7, id: \.self) { d in
                    let key = String(d)
                    HStack(alignment: .top, spacing: 10) {
                        Text(PlanDate.short(d))
                            .font(.sans(13, .semibold))
                            .foregroundStyle(FW.Palette.text2)
                            .frame(width: 40, height: 32, alignment: .leading)
                        FlowLayout(spacing: 6) {
                            PlanChip(text: "Rest", selected: days[key] == nil) { days[key] = nil }
                            ForEach(tracks) { t in
                                PlanChip(text: t.title, selected: days[key] == t.id, color: trackColor(t.id)) { days[key] = t.id }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(PlanDate.dayNames[d])
                }
            }
            PlanField(label: "Session length") {
                Segmented(options: [30, 45, 60, 90, 120].map { m in (m, m < 60 ? "\(m) min" : "\(m % 60 == 0 ? String(m / 60) : String(Double(m) / 60)) h") }, selection: $minutes)
            }
            PlanField(label: "Usual start", hint: "Reminders and the session written ahead of time use this. You can still learn whenever you like.") {
                DatePicker("Usual start", selection: $start, displayedComponents: .hourAndMinute)
                    .labelsHidden()
            }
            Text("\(count) session\(count == 1 ? "" : "s") a week, about \(hours) hours. Your planner may suggest more; it never adds them without you.")
                .font(.sans(13))
                .foregroundStyle(FW.Palette.text3)
                .fixedSize(horizontal: false, vertical: true)
            Button("Save rhythm") {
                let edit: [String: JSON] = [
                    "op": .string("rhythm"),
                    "days": .object(days.mapValues { .string($0) }),
                    "minutes": .number(Double(minutes)),
                    "start_local": .string(PlanDate.hm(start)),
                ]
                dismiss()
                Task { await runPlanEdit(store, edit, "Saved. It applies from the next week drafted.") }
            }
            .buttonStyle(.fw(.primary, wide: true))
            .disabled(count == 0)
        }
    }
}

// MARK: - Track

struct PlanTrackSheet: View {
    let trackId: String
    @Environment(Store.self) private var store
    @State private var all = false

    var body: some View {
        let plan = store.decodedPlan
        if let plan, let track = plan.track(trackId) {
            content(plan, track)
        } else {
            SheetScaffold(title: "Track") { Text("This track is no longer in your plan.").font(.sans(15)).foregroundStyle(FW.Palette.text2) }
        }
    }

    private func content(_ plan: Plan, _ track: Plan.Track) -> some View {
        let shown = all ? track.backlog : Array(track.backlog.prefix(12))
        let active = (plan.horizon?.tracks ?? []).filter { !$0.paused }.count
        return SheetScaffold(title: track.title, subtitle: "\(track.backlog.count) topics waiting, in the order weeks take them.") {
            if !track.goals.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(track.goals, id: \.self) { g in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("•").font(.serif(17)).foregroundStyle(FW.Palette.text3)
                            Text(g).font(.serif(17)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, t in
                    if i > 0 { Rule() }
                    HStack(spacing: 12) {
                        Text("\(i + 1)")
                            .font(.sans(13))
                            .monospacedDigit()
                            .foregroundStyle(FW.Palette.text3)
                            .frame(width: 24, alignment: .trailing)
                        HStack(spacing: 8) {
                            Text(t.title).font(.sans(15)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                            if t.added { PlanPill(text: "New") }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if i > 0 {
                            iconButton("arrow.up", label: "Move \(t.title) up") {
                                Task { await runPlanEdit(store, ["op": .string("move-topic"), "track": .string(track.id), "topicId": .string(t.id), "to": .number(Double(i - 1))]) }
                            }
                            iconButton("arrow.up.to.line", label: "Move \(t.title) to next") {
                                Task { await runPlanEdit(store, ["op": .string("move-topic"), "track": .string(track.id), "topicId": .string(t.id), "to": .number(0)], "Next up.") }
                            }
                        } else {
                            Color.clear.frame(width: 80, height: 1)
                        }
                    }
                    .padding(.vertical, 4)
                    .frame(minHeight: 44)
                }
            }
            if track.backlog.count > 12 {
                Button(all ? "Show fewer" : "Show all \(track.backlog.count)") { withAnimation { all.toggle() } }
                    .font(.sans(15, .medium))
                    .foregroundStyle(FW.Palette.text)
                    .underline(color: FW.Palette.line3)
            }
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(track.paused ? "Paused" : "Active").font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                    Text(track.paused ? "Its days go to your other tracks until you resume it." : "Pausing lends its days to your other tracks. Nothing is lost.")
                        .font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button(track.paused ? "Resume" : "Pause") {
                    let next = track.paused ? "active" : "paused"
                    let message = track.paused ? "\(track.title) is back." : "\(track.title) paused from the next week drafted."
                    Task { await runPlanEdit(store, ["op": .string("track"), "track": .string(track.id), "status": .string(next)], message) }
                }
                .buttonStyle(.fw(.secondary, small: true))
                .disabled(!track.paused && active <= 1)
            }
            .padding(.top, 4)
        }
    }

    private func iconButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(FW.Palette.text2)
                .frame(width: 36, height: 36)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Swap

struct PlanSwapSheet: View {
    let plan: Plan
    let session: Plan.Session
    let onPick: (String) -> Void

    var body: some View {
        let tracks = plan.horizon?.tracks ?? []
        let own = tracks.first { $0.id == session.subject }
        let others = tracks.filter { $0.id != session.subject && !$0.paused && !$0.backlog.isEmpty }
        SheetScaffold(title: "Swap for another topic", subtitle: "Instead of “\(session.title)”. It goes back to its track.") {
            if let own, !own.backlog.isEmpty {
                group(own.title, Array(own.backlog.prefix(8)), showNew: true)
            }
            ForEach(others) { t in group(t.title, Array(t.backlog.prefix(3)), showNew: false) }
        }
    }

    private func group(_ title: String, _ topics: [Plan.Topic], showNew: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(title)
            VStack(spacing: 0) {
                ForEach(Array(topics.enumerated()), id: \.element.id) { i, t in
                    if i > 0 { Rule() }
                    Button { onPick(t.id) } label: {
                        HStack(spacing: 8) {
                            Text(t.title).font(.sans(15)).foregroundStyle(FW.Palette.text)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            if showNew, t.added { PlanPill(text: "New") }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 8)
                        .frame(minHeight: 46)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Add

struct PlanAddSheet: View {
    let plan: Plan
    let start: String
    let taken: [Int]
    let onAdd: (String, Int) -> Void
    @State private var track: String
    @State private var day: Int

    init(plan: Plan, start: String, taken: [Int], onAdd: @escaping (String, Int) -> Void) {
        self.plan = plan
        self.start = start
        self.taken = taken
        self.onAdd = onAdd
        let tracks = (plan.horizon?.tracks ?? []).filter { !$0.paused && !$0.backlog.isEmpty }
        _track = State(initialValue: tracks.first?.id ?? "")
        _day = State(initialValue: [4, 5, 6, 0, 1, 2, 3].first { !taken.contains($0) } ?? 4)
    }

    var body: some View {
        let tracks = (plan.horizon?.tracks ?? []).filter { !$0.paused && !$0.backlog.isEmpty }
        let next = tracks.first { $0.id == track }?.backlog.first
        SheetScaffold(title: "Add a session", subtitle: "To the week of \(PlanDate.monthDay(start)). It takes the track’s next topic.") {
            PlanField(label: "Track") {
                FlowLayout(spacing: 6) {
                    ForEach(tracks) { t in
                        PlanChip(text: t.title, selected: track == t.id, color: trackColor(t.id)) { track = t.id }
                    }
                }
            }
            PlanField(label: "Day") {
                FlowLayout(spacing: 6) {
                    ForEach(0..<7, id: \.self) { d in
                        PlanChip(text: PlanDate.short(d) + (taken.contains(d) ? " ·" : ""), selected: day == d) { day = d }
                    }
                }
            }
            if let next {
                Text("Next on this track: \(Text(next.title).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text))")
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button("Add to \(PlanDate.dayNames[day])") { onAdd(track, day) }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(track.isEmpty)
        }
    }
}

// MARK: - Session

// One session: what it's for, the ideas it teaches, and a way in. `plan` is
// set for rolling plans (track names, why, swap and remove).
struct PlanSessionSheet: View {
    let plan: Plan
    let session: Plan.Session
    let concepts: [PlanConcept]
    let done: Bool
    var canEdit = false
    var onSwap: () -> Void = {}
    var onRemove: () -> Void = {}
    // Called with the new run's id; the parent opens it once this sheet is gone.
    let onStarted: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?

    private var subtitle: String {
        plan.isRolling
            ? "\(PlanDate.dayNames[PlanDate.dayIndex(session.date)]) · \(plan.trackTitle(session.subject)) · \(session.duration_minutes) min"
            : "\(PlanDate.label(session.date)) · \(session.subject) · \(session.duration_minutes) min"
    }

    var body: some View {
        SheetScaffold(title: session.title, subtitle: subtitle) {
            if session.added { PlanPill(text: "A new topic, proposed for this week", big: true) }
            Text(session.objective)
                .font(.serif(18))
                .lineSpacing(5)
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if plan.isRolling, let why = session.why {
                PlanField(label: "Why this week") { para(why) }
            }
            if !session.evidence.isEmpty {
                PlanField(label: plan.isRolling ? "You’ll produce" : "Evidence this week") { para(session.evidence) }
            }
            if !concepts.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(concepts.enumerated()), id: \.element.id) { i, c in
                        if i > 0 { Rule() }
                        HStack(spacing: 14) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.title).font(.sans(15)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                                Text(levelLabel(c.level) + (c.misconceptions.first.map { " · watch: \($0)" } ?? ""))
                                    .font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            PlanMiniMeter(value: c.strength, color: trackColor(c.track))
                        }
                        .padding(.vertical, 10)
                        .frame(minHeight: 56)
                    }
                }
            }
            if let error {
                Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true)
            }
            FlowLayout(spacing: 8) {
                if done {
                    if !concepts.isEmpty {
                        Button { start(review: true) } label: { busyLabel("Review these ideas") }
                            .buttonStyle(.fw(.primary))
                    }
                } else {
                    Button { start(review: false) } label: { busyLabel("Start this session") }
                        .buttonStyle(.fw(.primary))
                }
                if canEdit {
                    Button { onSwap() } label: { Label("Swap", systemImage: "arrow.triangle.2.circlepath") }
                        .buttonStyle(.fw(.secondary))
                    Button("Take it out") { onRemove() }
                        .buttonStyle(.fw(.ghost))
                }
            }
            .disabled(busy)
        }
    }

    private func para(_ text: String) -> some View {
        Text(text).font(.sans(15)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
    }

    private func busyLabel(_ title: String) -> some View {
        HStack(spacing: 8) {
            if busy { ProgressView().controlSize(.small).tint(FW.Palette.onAccent) }
            Text(title)
        }
    }

    private func start(review: Bool) {
        busy = true
        error = nil
        Task {
            do {
                let body = review
                    ? Runs.Start(kind: "review", concepts: concepts.map(\.key))
                    : Runs.Start(kind: "session", sessionId: session.id)
                let r: Runs.Started = try await API.post("/api/runs", body)
                RunCache.prime(r.run)
                onStarted(r.run.id)
                dismiss()
            } catch is CancellationError {
                busy = false
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}
