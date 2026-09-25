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

// A paragraph held to a couple of lines, with "More" to read the rest. The
// button only shows when the text is actually cut short. Used for the
// planner's notes here and the weekly read's observations in Insights.
struct PlanMoreText: View {
    let text: String
    var font: Font = .sans(15)
    var color: Color = FW.Palette.text2
    var lines = 2
    @State private var open = false
    @State private var full: CGFloat = 0
    @State private var shown: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(text)
                .font(font)
                .foregroundStyle(color)
                .lineSpacing(2)
                .lineLimit(open ? nil : lines)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .onGeometryChange(for: CGFloat.self, of: \.size.height) { shown = $0 }
                .background(alignment: .topLeading) {
                    // The whole paragraph, measured but never drawn.
                    Text(text)
                        .font(font)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .hidden()
                        .onGeometryChange(for: CGFloat.self, of: \.size.height) { full = $0 }
                }
            if open || full > shown + 2 {
                Button {
                    withAnimation(Springs.snappy) { open.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Text(open ? "Less" : "More")
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .bold))
                            .rotationEffect(.degrees(open ? 180 : 0))
                    }
                    .font(.sans(14, .semibold))
                    .foregroundStyle(FW.Palette.text)
                    .frame(minHeight: 28)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(open ? "Show less" : "Read more")
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
            GroupCard {
                ForEach(0..<7, id: \.self) { d in dayRow(d) }
            }
            PlanField(label: "Session length") {
                Segmented(options: [30, 45, 60, 90, 120].map { m in (m, m < 60 ? "\(m) min" : "\(m % 60 == 0 ? String(m / 60) : String(Double(m) / 60)) h") }, selection: $minutes)
            }
            VStack(alignment: .leading, spacing: 8) {
                GroupCard {
                    GroupRow(icon: "alarm", title: "Usual start", color: FW.Palette.review) {
                        DatePicker("Usual start", selection: $start, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                    }
                }
                Text("Reminders and the session written ahead of time use this. You can still learn whenever you like.")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 12) {
                StatTile(value: "\(count)", label: "session\(count == 1 ? "" : "s") a week", icon: "calendar", color: FW.Palette.judgment)
                StatTile(value: "~\(hours)", label: "hours a week", icon: "clock", color: FW.Palette.review)
            }
            .animation(Springs.snappy, value: count)
            .animation(Springs.snappy, value: minutes)
            Text("Your planner may suggest more; it never adds them without you.")
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

    // A weekday and the track it keeps; the menu picks another (or rest).
    private func dayRow(_ d: Int) -> some View {
        let key = String(d)
        let t = days[key]
        let color = t.map { trackColor($0) } ?? FW.Palette.text3
        let choice = Binding<String>(
            get: { days[key] ?? "" },
            set: { v in
                Feedback.shared.play(.tap)
                withAnimation(Springs.snappy) { days[key] = v.isEmpty ? nil : v }
            }
        )
        return Menu {
            Picker(PlanDate.dayNames[d], selection: choice) {
                Label("Rest", systemImage: "moon.zzz").tag("")
                ForEach(tracks) { tr in Label(tr.title, systemImage: Glyph.track(tr.id)).tag(tr.id) }
            }
            .pickerStyle(.inline)
        } label: {
            GroupRow(icon: t.map { Glyph.track($0) } ?? "moon.zzz.fill", title: PlanDate.dayNames[d], color: color) {
                HStack(spacing: 6) {
                    Text(t.map { plan.trackTitle($0) } ?? "Rest")
                        .font(.sans(15, .medium))
                        .foregroundStyle(t == nil ? FW.Palette.text3 : color)
                        .contentTransition(.opacity)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(FW.Palette.text4)
                }
                .lineLimit(1)
            }
            .symbolEffect(.bounce, value: t)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(PlanDate.dayNames[d]): \(t.map { plan.trackTitle($0) } ?? "Rest")")
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
        let color = trackColor(track.id)
        let canPause = track.paused || active > 1
        return SheetScaffold(title: track.title, subtitle: "\(track.backlog.count) topics waiting, in the order weeks take them.") {
            if !track.goals.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(track.goals, id: \.self) { g in
                        HStack(alignment: .top, spacing: 12) {
                            IconBadge(systemName: "scope", color: color, size: 28, circle: true)
                            Text(g).font(.sans(16, .medium)).foregroundStyle(FW.Palette.text)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 4)
                        }
                    }
                }
            }
            GroupCard {
                GroupRow(
                    icon: track.paused ? "pause.fill" : "play.fill",
                    title: track.paused ? "Paused" : "Active",
                    color: track.paused ? FW.Palette.text3 : color
                ) {
                    Toggle(track.paused ? "Resume" : "Pause", isOn: Binding(
                        get: { !track.paused },
                        set: { on in
                            guard on == track.paused else { return }
                            let next = track.paused ? "active" : "paused"
                            let message = track.paused ? "\(track.title) is back." : "\(track.title) paused from the next week drafted."
                            Task { await runPlanEdit(store, ["op": .string("track"), "track": .string(track.id), "status": .string(next)], message) }
                        }
                    ))
                    .labelsHidden()
                    .tint(color)
                    .disabled(!canPause)
                }
            }
            Text(track.paused ? "Its days go to your other tracks until you resume it." : "Pausing lends its days to your other tracks. Nothing is lost.")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
                .padding(.top, -8)
            VStack(alignment: .leading, spacing: 10) {
                SectionHead(title: "Up next", trailing: "\(track.backlog.count)")
                VStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, t in
                        if i > 0 { Rule().padding(.leading, 44) }
                        topicRow(track, t, index: i)
                    }
                }
                .padding(.horizontal, 14)
                .background(FW.Palette.bg.opacity(0.5), in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
                if track.backlog.count > 12 {
                    Button(all ? "Show fewer" : "Show all \(track.backlog.count)") { withAnimation(Springs.smooth) { all.toggle() } }
                        .buttonStyle(.fw(.secondary, small: true))
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func topicRow(_ track: Plan.Track, _ t: Plan.Topic, index i: Int) -> some View {
        let color = trackColor(track.id)
        let up = { Task { await runPlanEdit(store, ["op": .string("move-topic"), "track": .string(track.id), "topicId": .string(t.id), "to": .number(Double(i - 1))]) } }
        let next = { Task { await runPlanEdit(store, ["op": .string("move-topic"), "track": .string(track.id), "topicId": .string(t.id), "to": .number(0)], "Next up.") } }
        return HStack(spacing: 12) {
            Text("\(i + 1)")
                .font(.rounded(13, .semibold))
                .foregroundStyle(i == 0 ? FW.Palette.raised : color)
                .frame(width: 28, height: 28)
                .background(i == 0 ? color : color.opacity(0.13), in: .circle)
            HStack(spacing: 8) {
                Text(t.title).font(.sans(15, i == 0 ? .semibold : .regular)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                if t.added { PlanPill(text: "New") }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if i > 0 {
                Menu {
                    Button("Move up", systemImage: "arrow.up") { _ = up() }
                    Button("Make it next", systemImage: "arrow.up.to.line") { _ = next() }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(FW.Palette.text2)
                        .frame(width: 40, height: 40)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Move \(t.title)")
            } else {
                Text("Next").font(.sans(12, .semibold)).foregroundStyle(color)
                    .frame(width: 40)
            }
        }
        .padding(.vertical, 6)
        .frame(minHeight: 50)
        .contextMenu {
            if i > 0 {
                Button("Move up", systemImage: "arrow.up") { _ = up() }
                Button("Make it next", systemImage: "arrow.up.to.line") { _ = next() }
            }
        }
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
                group(own, Array(own.backlog.prefix(8)), showNew: true)
            }
            ForEach(others) { t in group(t, Array(t.backlog.prefix(3)), showNew: false) }
        }
    }

    private func group(_ track: Plan.Track, _ topics: [Plan.Topic], showNew: Bool) -> some View {
        let color = trackColor(track.id)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: Glyph.track(track.id)).font(.system(size: 13, weight: .semibold)).foregroundStyle(color)
                Text(track.title).font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text2)
            }
            GroupCard {
                ForEach(topics) { t in
                    Button { onPick(t.id) } label: {
                        HStack(spacing: 12) {
                            Text(t.title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            if showNew, t.added { PlanPill(text: "New") }
                            Spacer(minLength: 8)
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(color)
                        }
                        .padding(.vertical, 10)
                        .frame(minHeight: 50)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.pressable(0.98))
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
        SheetScaffold(title: "Add a session", subtitle: "To the week of \(PlanDate.monthDay(start)). It takes the track’s next topic.") {
            PlanField(label: "Track") {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                    ForEach(tracks) { t in trackTile(t) }
                }
            }
            PlanField(label: "Day", hint: taken.isEmpty ? nil : "A dot marks a day that already has a session.") {
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { d in dayButton(d) }
                }
            }
            Button("Add to \(PlanDate.dayNames[day])") { onAdd(track, day) }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(track.isEmpty)
                .contentTransition(.opacity)
        }
    }

    private func trackTile(_ t: Plan.Track) -> some View {
        let on = track == t.id
        let color = trackColor(t.id)
        return Button {
            Feedback.shared.play(.tap)
            withAnimation(Springs.snappy) { track = t.id }
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    IconBadge(systemName: Glyph.track(t.id), color: color, size: 34, filled: on)
                    Spacer(minLength: 4)
                    Image(systemName: on ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 18))
                        .foregroundStyle(on ? color : FW.Palette.text4)
                        .contentTransition(.symbolEffect(.replace))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.title).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text).lineLimit(1)
                    Text(t.backlog.first.map { "Next: \($0.title)" } ?? "")
                        .font(.sans(12)).foregroundStyle(FW.Palette.text3)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, minHeight: 30, alignment: .topLeading)
                }
            }
            .padding(12)
            .background(on ? color.opacity(0.08) : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(on ? color : FW.Palette.line, lineWidth: on ? 1.5 : 1))
            .contentShape(.rect(cornerRadius: FW.Radius.base))
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func dayButton(_ d: Int) -> some View {
        let on = day == d
        return Button {
            Feedback.shared.play(.tap)
            withAnimation(Springs.snappy) { day = d }
        } label: {
            VStack(spacing: 4) {
                Text(String(PlanDate.short(d).prefix(1)))
                    .font(.sans(15, .semibold))
                    .foregroundStyle(on ? FW.Palette.onAccent : FW.Palette.text)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(on ? FW.Palette.accent : FW.Palette.surface, in: .circle)
                    .overlay(Circle().strokeBorder(on ? .clear : FW.Palette.line2))
                Circle().fill(taken.contains(d) ? FW.Palette.text3 : .clear).frame(width: 5, height: 5)
            }
        }
        .buttonStyle(.pressable(0.9))
        .accessibilityLabel(PlanDate.dayNames[d] + (taken.contains(d) ? ", has a session" : ""))
        .accessibilityAddTraits(on ? .isSelected : [])
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

    var body: some View {
        let color = trackColor(session.subject)
        let trackName = plan.isRolling ? plan.trackTitle(session.subject) : session.subject
        SheetScaffold(title: plan.isRolling ? PlanDate.dayNames[PlanDate.dayIndex(session.date)] : PlanDate.label(session.date)) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    IconBadge(systemName: done ? "checkmark" : Glyph.track(session.subject), color: color, size: 44, circle: true, filled: done)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(trackName.prefix(1).uppercased() + trackName.dropFirst())
                            .font(.sans(13, .semibold)).foregroundStyle(color)
                        Text(session.title)
                            .font(.sans(22, .bold))
                            .foregroundStyle(FW.Palette.text)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                FlowLayout(spacing: 8) {
                    Pill(text: "\(session.duration_minutes) min", icon: "clock", color: FW.Palette.text2)
                    if !plan.isRolling { Pill(text: PlanDate.label(session.date), icon: "calendar", color: FW.Palette.text2) }
                    if done { Pill(text: "Done", icon: "checkmark", color: FW.Palette.positive) }
                    if session.added { Pill(text: "A new topic, proposed for this week", icon: "sparkles", color: FW.Palette.judgment) }
                }
            }
            Text(session.objective)
                .font(.sans(17))
                .lineSpacing(3)
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if plan.isRolling, let why = session.why {
                info("lightbulb.fill", "Why this week", why, FW.Palette.caution)
            }
            if !session.evidence.isEmpty {
                info("doc.text.fill", plan.isRolling ? "You’ll produce" : "Evidence this week", session.evidence, FW.Palette.review)
            }
            if !concepts.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Ideas it teaches").font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text2)
                    GroupCard {
                        ForEach(concepts) { c in
                            HStack(spacing: 14) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
                                    Text(levelLabel(c.level) + (c.misconceptions.first.map { " · watch: \($0)" } ?? ""))
                                        .font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(2)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                PlanMiniMeter(value: c.strength, color: trackColor(c.track))
                            }
                            .padding(.vertical, 10)
                            .frame(minHeight: 56)
                        }
                    }
                }
            }
            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.sans(14)).foregroundStyle(FW.Palette.negative).fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 10) {
                if done {
                    if !concepts.isEmpty {
                        Button { start(review: true) } label: { busyLabel("Review these ideas", icon: "arrow.triangle.2.circlepath") }
                            .buttonStyle(.fw(.primary, wide: true))
                    }
                } else {
                    Button { start(review: false) } label: { busyLabel("Start this session", icon: "play.fill") }
                        .buttonStyle(.fw(.primary, wide: true))
                }
                if canEdit {
                    HStack(spacing: 10) {
                        Button { onSwap() } label: { Label("Swap", systemImage: "arrow.triangle.2.circlepath") }
                            .buttonStyle(.fw(.secondary, wide: true))
                        Button { onRemove() } label: { Label("Take it out", systemImage: "xmark") }
                            .buttonStyle(.fw(.secondary, wide: true))
                    }
                }
            }
            .disabled(busy)
            .padding(.top, 4)
        }
        .presentationDetents([.medium, .large])
    }

    private func info(_ icon: String, _ label: String, _ text: String, _ color: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemName: icon, color: color, size: 32)
            VStack(alignment: .leading, spacing: 3) {
                Text(label).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3)
                Text(text).font(.sans(15)).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func busyLabel(_ title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            if busy { ProgressView().controlSize(.small).tint(FW.Palette.onAccent) } else { Image(systemName: icon) }
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
