import SwiftUI

// The morning brief as one card: what today is for in a line or two, the
// day's steps as a short path with the tutor's notes, and one way in.
struct BriefCard: View {
    let t: TodayModel
    let agenda: [TodayView.AgendaItem]
    let brief: Brief?
    let loading: Bool
    let busy: String?
    let error: String?
    let onRun: (TodayAction) -> Void
    @State private var expanded = false

    var body: some View {
        let hues = agenda.map { trackColor($0.track) }
        let note = brief?.note ?? t.why
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 10) {
                Aperture(size: 24, busy: loading)
                Text(stamp).font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text2)
                    .contentTransition(.opacity)
                Spacer(minLength: 8)
                if total > 0 { Pill(text: "\(Int(total.rounded())) min", icon: "clock", color: FW.Palette.text3) }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(brief?.title ?? (t.phase == "rest-day" ? "Nothing due today. Rest counts" : "Here’s today"))
                    .font(.sans(26, .bold))
                    .foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .contentTransition(.opacity)
                VStack(alignment: .leading, spacing: 4) {
                    Text(note)
                        .font(.sans(15))
                        .foregroundStyle(FW.Palette.text2)
                        .lineSpacing(2)
                        .lineLimit(expanded ? nil : 2)
                        .fixedSize(horizontal: false, vertical: true)
                    if note.count > 110 {
                        Button(expanded ? "Less" : "More") { withAnimation(Springs.snappy) { expanded.toggle() } }
                            .font(.sans(14, .semibold))
                            .foregroundStyle(FW.Palette.text)
                            .buttonStyle(.plain)
                    }
                }
                .id(brief == nil ? "why" : "brief")
                .transition(.blurReplace)
            }
            .opacity(loading ? 0.55 : 1)
            if !agenda.isEmpty { steps }
            if let p = t.primary { actions(p) }
            if let error {
                Label(error, systemImage: "exclamationmark.circle.fill").font(.sans(14)).foregroundStyle(FW.Palette.negative)
            }
            if let evidence = t.focus?.evidence, !evidence.isEmpty, t.phase == "learning-day" {
                HStack(alignment: .top, spacing: 12) {
                    IconBadge(systemName: "doc.text", color: FW.Palette.text2, size: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("You’ll make this week").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
                        Text(evidence).font(.sans(14, .medium)).foregroundStyle(FW.Palette.text).lineLimit(2)
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            Aurora(colors: hues.isEmpty ? [FW.Palette.accent] : hues, base: FW.Palette.raised, intensity: 0.2)
        }
        .clipShape(.rect(cornerRadius: FW.Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(FW.Palette.line))
        .animation(Springs.smooth, value: brief?.title)
    }

    private var total: Double { agenda.filter { $0.kind != "practice" }.compactMap(\.minutes).reduce(0, +) }

    private var stamp: String {
        loading ? "Developing…" : brief != nil ? "Prepared for you" : t.phase == "rest-day" ? "A rest day" : "Today"
    }

    // The day's steps, joined by a line, each with its glyph and colour.
    private var steps: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(agenda.enumerated()), id: \.offset) { i, a in
                let hue = trackColor(a.track)
                let last = i == agenda.count - 1
                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 0) {
                        IconBadge(systemName: Glyph.kind(a.kind), color: hue, size: 36, circle: true, filled: i == 0)
                        if !last {
                            Rectangle().fill(FW.Palette.line2).frame(width: 2).frame(maxHeight: .infinity).padding(.vertical, 4)
                        }
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(a.label)
                                .font(.sans(16, i == 0 ? .semibold : .medium))
                                .foregroundStyle(FW.Palette.text)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            if let m = a.minutes {
                                Text("\(max(1, Int(m.rounded()))) min").font(.sans(13, .medium)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                            }
                        }
                        if let note = brief?.item_notes[safe: i] ?? nil {
                            Text(note).font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(2)
                                .transition(.opacity)
                        }
                    }
                    .padding(.top, 7)
                    .padding(.bottom, last ? 0 : 18)
                }
                .contentShape(.rect)
                .onTapGesture { if i > 0, let action = a.action, busy == nil { onRun(action) } }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(i > 0 && a.action != nil ? .isButton : [])
            }
        }
    }

    private func actions(_ p: TodayAction) -> some View {
        VStack(spacing: 10) {
            Button { onRun(p) } label: {
                HStack(spacing: 8) {
                    if busy == p.label { ProgressView().tint(FW.Palette.onAccent) }
                    Text(p.label)
                    if busy != p.label { Image(systemName: "arrow.right") }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.primary, wide: true))
            .disabled(busy != nil)
            ForEach(t.secondary.filter { $0.kind == "session" }, id: \.label) { s in
                if s.label == "Only 20 minutes" {
                    Button { onRun(s) } label: { Label("Short on time? 20 min", systemImage: "timer") }
                        .buttonStyle(.fw(.ghost, small: true))
                        .disabled(busy != nil)
                } else {
                    Button(s.label) { onRun(s) }.buttonStyle(.fw(.secondary, wide: true)).disabled(busy != nil)
                }
            }
            if total > 0 {
                Text("Done around \(Date.now.addingTimeInterval(total * 60).formatted(date: .omitted, time: .shortened))")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }
        }
    }
}

// The end of a learning day: what it added up to, and what comes next.
struct RecapCard: View {
    let t: TodayModel
    let recap: TodayResponse.Recap
    let xp: Int
    let busy: String?
    let onRun: (TodayAction) -> Void
    @State private var shown = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 14) {
                IconBadge(systemName: "checkmark", color: FW.Palette.positive, size: 48, circle: true, filled: true)
                    .scaleEffect(shown ? 1 : 0.4)
                    .symbolEffect(.bounce, value: shown)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Today’s done").font(.sans(26, .bold)).foregroundStyle(FW.Palette.text)
                    Text("Anything more is optional.").font(.sans(14)).foregroundStyle(FW.Palette.text3)
                }
            }
            HStack(spacing: 10) {
                stat("\(recap.minutes)", "minutes", "clock.fill", FW.Palette.text2)
                stat("\(recap.answers)", recap.answers == 1 ? "answer" : "answers", "checkmark.bubble.fill", FW.Palette.positive)
                if xp > 0 { stat("+\(xp)", "XP", "star.fill", FW.Palette.caution) }
            }
            if !recap.ideas.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Kicker("Ideas you worked on")
                    FlowLayout(spacing: 8) {
                        ForEach(Array(recap.ideas.enumerated()), id: \.offset) { i, idea in
                            Text(idea).font(.sans(13, .medium)).padding(.horizontal, 12).padding(.vertical, 7)
                                .background(FW.Palette.surface2, in: .capsule).foregroundStyle(FW.Palette.text)
                                .rise(i, step: 0.04, delay: 0.3)
                        }
                        if recap.more > 0 { Text("+\(recap.more) more").font(.sans(13)).foregroundStyle(FW.Palette.text3).padding(.vertical, 7) }
                    }
                }
            }
            if let next = t.focus {
                HStack(spacing: 12) {
                    IconBadge(systemName: Glyph.track(next.subject), color: trackColor(next.subject), size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Next up · \(Dates.weekday(next.date))").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
                        Text(next.title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text).lineLimit(2)
                    }
                }
            }
            if let p = t.primary {
                Button(p.label) { onRun(p) }.buttonStyle(.fw(.secondary, wide: true)).disabled(busy != nil)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { Aurora(colors: [FW.Palette.positive, FW.Palette.caution], base: FW.Palette.raised, intensity: 0.18) }
        .clipShape(.rect(cornerRadius: FW.Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(FW.Palette.line))
        .onAppear { withAnimation(Springs.bouncy.delay(0.15)) { shown = true } }
    }

    private func stat(_ value: String, _ label: String, _ icon: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(color)
            Text(value).font(.rounded(24)).foregroundStyle(FW.Palette.text).monospacedDigit()
            Text(label).font(.sans(12, .medium)).foregroundStyle(FW.Palette.text3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(FW.Palette.surface.opacity(0.7), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// Curiosity, answered on the spot: a one-off outside the plan.
struct LearnAnything: View {
    let busy: Bool
    let disabled: Bool
    let onGo: (String) -> Void
    @State private var topic = ""
    @FocusState private var focused: Bool

    var body: some View {
        let ok = topic.trimmingCharacters(in: .whitespaces).count > 2
        VStack(alignment: .leading, spacing: 10) {
            SectionHead(title: "Learn anything")
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(FW.Palette.judgment)
                    .symbolEffect(.bounce, value: focused)
                TextField("Why do planes fly?", text: $topic)
                    .font(.sans(17))
                    .submitLabel(.go)
                    .focused($focused)
                    .onSubmit { if ok { onGo(topic.trimmingCharacters(in: .whitespaces)) } }
                    .onChange(of: topic) { _, v in if v.count > 200 { topic = String(v.prefix(200)) } }
                Button {
                    onGo(topic.trimmingCharacters(in: .whitespaces))
                } label: {
                    Group {
                        if busy { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)) }
                    }
                    .frame(width: 38, height: 38)
                    .foregroundStyle(FW.Palette.onAccent)
                    .background(FW.Palette.accent, in: .circle)
                    .scaleEffect(ok ? 1 : 0.85)
                    .opacity(!ok || disabled ? 0.25 : 1)
                    .animation(Springs.bouncy, value: ok)
                }
                .buttonStyle(.plain)
                .disabled(!ok || disabled)
                .accessibilityLabel("Start exploring")
            }
            .padding(.leading, 16)
            .padding(.trailing, 8)
            .frame(height: 58)
            .background(FW.Palette.raised, in: .rect(cornerRadius: 29, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 29, style: .continuous).strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line))
            .animation(Springs.snappy, value: focused)
            Text("A one-off lesson outside your plan.").font(.sans(13)).foregroundStyle(FW.Palette.text3)
        }
    }
}

// The rolling week: seven marks tinted by each day's track.
struct WeekStrip: View {
    let t: TodayModel

    var body: some View {
        let week = t.week!
        let after = week.days.first { $0.status == "planned" || $0.status == "reduced" }
        let alsoOpen = week.days.filter { $0.status == "open" && $0.title != t.focus?.title }
        let note: String? = t.phase == "done-today" ? nil
            : !alsoOpen.isEmpty ? "Also open: \(alsoOpen.map(\.weekday).joined(separator: ", ")) · \(alsoOpen[0].title ?? "")"
            : after.map { "Next: \($0.weekday) · \($0.title ?? "")" }
            ?? (t.phase == "learning-day" ? "The last session this week." : "Rest days count too.")
        VStack(alignment: .leading, spacing: 12) {
            SectionHead(title: "This week", trailing: "\(week.done)/\(week.planned) done")
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    ForEach(Array(week.days.enumerated()), id: \.element.date) { i, d in
                        VStack(spacing: 6) {
                            DayMarkView(status: d.status, color: trackColor(d.track))
                            Text(String(d.weekday.prefix(3)))
                                .font(.sans(12, d.status == "today" ? .bold : .medium))
                                .foregroundStyle(d.status == "today" ? FW.Palette.text : FW.Palette.text3)
                        }
                        .frame(maxWidth: .infinity)
                        .rise(i, step: 0.04, delay: 0.2, distance: 10)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(d.weekday): \(d.status)\(d.title.map { ", \($0)" } ?? "")")
                    }
                }
                if let note {
                    Label { Text(note).lineLimit(1) } icon: { Image(systemName: "arrow.turn.down.right") }
                        .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                }
                if let m = t.milestone {
                    Label {
                        Text("\(Text("\(m.days)").bold().foregroundStyle(FW.Palette.text)) days to \(m.title.split(separator: ":").first.map(String.init) ?? m.title)")
                            .lineLimit(1)
                    } icon: { Image(systemName: "flag.checkered") }
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                }
            }
            .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 16)
        }
    }
}

struct DayMarkView: View {
    let status: String
    let color: Color
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 10)
        ZStack {
            switch status {
            case "done": shape.fill(color)
            case "today": shape.fill(color.opacity(0.18)).overlay(shape.strokeBorder(color, lineWidth: 1.5))
            case "planned", "reduced": shape.strokeBorder(color.opacity(0.45), lineWidth: 1)
            case "missed": shape.fill(FW.Palette.surface).overlay(DiagonalHatch().stroke(FW.Palette.hatch, lineWidth: 2).clipShape(shape))
            case "open": shape.fill(color.opacity(0.08)).overlay(DiagonalHatch().stroke(color.opacity(0.35), lineWidth: 2).clipShape(shape)).overlay(shape.strokeBorder(color.opacity(0.45), lineWidth: 1))
            default: shape.strokeBorder(FW.Palette.line, lineWidth: 1)
            }
        }
        .frame(height: 36)
        .frame(maxWidth: 56)
    }
}

struct DiagonalHatch: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x = rect.minX - rect.height
        while x < rect.maxX {
            p.move(to: .init(x: x, y: rect.maxY))
            p.addLine(to: .init(x: x + rect.height, y: rect.minY))
            x += 5
        }
        return p
    }
}

struct LevelRing: View {
    let level: Int
    let fraction: Double
    var size: CGFloat = 40
    var body: some View {
        ZStack {
            Circle().stroke(FW.Palette.surface2, lineWidth: 4)
            Circle().trim(from: 0, to: fraction).stroke(FW.Palette.caution, style: .init(lineWidth: 4, lineCap: .round)).rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 1), value: fraction)
            Text("\(level)").font(.rounded(size * 0.38, .bold)).contentTransition(.numericText()).foregroundStyle(FW.Palette.text).monospacedDigit()
        }
        .frame(width: size, height: size)
    }
}

struct ProgressSheet: View {
    let progress: Progress
    var body: some View {
        SheetScaffold(title: "Level \(progress.level) · \(progress.rank)", subtitle: "\(progress.xp) XP · \(progress.toNext) to level \(progress.level + 1)") {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(FW.Palette.surface2)
                    Capsule().fill(LinearGradient(colors: [FW.Palette.caution, FW.Palette.coral], startPoint: .leading, endPoint: .trailing))
                        .frame(width: geo.size.width * progress.fraction)
                }
            }
            .frame(height: 6)
            SectionHead(title: "Today’s quests", trailing: "\(progress.quests.filter(\.done).count)/3")
            VStack(spacing: 10) {
                ForEach(progress.quests) { q in
                    HStack(spacing: 12) {
                        Image(systemName: q.done ? "checkmark.square.fill" : "square")
                            .foregroundStyle(q.done ? FW.Palette.positive : FW.Palette.text3)
                        Text(q.label).strikethrough(q.done).foregroundStyle(q.done ? FW.Palette.text3 : FW.Palette.text)
                        Spacer()
                        Text("+\(q.xp)").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.caution)
                    }
                    .font(.sans(15))
                }
            }
            Text(progress.quests.allSatisfy(\.done) ? "All three done: +30 XP bonus." : "All three earn a +30 XP bonus.")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            SectionHead(title: "Badges", trailing: "\(progress.badges.filter(\.earned).count)/\(progress.badges.count)")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(progress.badges) { b in
                    VStack(alignment: .leading, spacing: 6) {
                        Image(systemName: b.earned ? "star.fill" : "key").foregroundStyle(b.earned ? FW.Palette.caution : FW.Palette.text3)
                        Text(b.label).font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text)
                        Text(b.detail).font(.sans(12)).foregroundStyle(FW.Palette.text3)
                    }
                    .card(FW.Radius.base, fill: b.earned ? FW.Palette.caution.opacity(0.1) : FW.Palette.surface, padding: 12)
                    .opacity(b.earned ? 1 : 0.55)
                }
            }
            Text(progress.streak.unit == "week"
                 ? "Best streak: \(progress.streak.best) weeks. A week counts once you’ve learned on two days of it; a week away never breaks it."
                 : "Best streak: \(progress.streak.best) learning days. Days without a planned session never break a streak.")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            Text("Choose which of these appear under You → Game elements.").font(.sans(13)).foregroundStyle(FW.Palette.text3)
        }
        .presentationDetents([.medium, .large])
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
