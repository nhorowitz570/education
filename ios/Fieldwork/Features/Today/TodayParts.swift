import SwiftUI

// The morning brief: what today is for, the day's agenda with the tutor's
// margin notes, and one way in.
struct BriefCard: View {
    let t: TodayModel
    let agenda: [TodayView.AgendaItem]
    let brief: Brief?
    let loading: Bool
    let number: Int?
    let busy: String?
    let error: String?
    let onRun: (TodayAction) -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Aperture(size: 20, busy: loading)
                Text(((number.map { "No. \(String(format: "%03d", $0)) · " } ?? "") + stamp).uppercased())
                    .font(.mono(11)).tracking(1).foregroundStyle(FW.Palette.text2)
            }
            VStack(alignment: .leading, spacing: 10) {
                Text(brief?.title ?? (t.phase == "rest-day" ? "Nothing due today. Rest counts" : "Here’s what we’re working on today"))
                    .font(.display(30, italic: true))
                    .foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text(brief?.note ?? t.why)
                    .font(.sans(16))
                    .foregroundStyle(FW.Palette.text2)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .id(brief == nil ? "why" : "brief")
                    .transition(.opacity)
            }
            .opacity(loading ? 0.55 : 1)
            if !agenda.isEmpty { agendaList }
            if let p = t.primary { actions(p) }
            if let error { Text(error).font(.sans(14)).foregroundStyle(FW.Palette.negative) }
            if let evidence = t.focus?.evidence, !evidence.isEmpty, t.phase == "learning-day" {
                VStack(alignment: .leading, spacing: 6) {
                    Kicker("This week you’ll produce")
                    Text(evidence).font(.serif(17)).foregroundStyle(FW.Palette.text)
                }
                .padding(.top, 14)
                .overlay(alignment: .top) { Rule() }
            }
        }
        .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 22)
    }

    private var stamp: String {
        loading ? "Developing…" : brief != nil ? "Prepared for you" : t.phase == "rest-day" ? "A rest day" : "Today"
    }

    private var agendaList: some View {
        VStack(spacing: 0) {
            ForEach(Array(agenda.enumerated()), id: \.offset) { i, a in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(String(format: "%02d", i + 1)).font(.mono(12)).foregroundStyle(FW.Palette.text3).frame(width: 22, alignment: .leading)
                    Dot(color: trackColor(a.track), lit: true, size: 7).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
                    VStack(alignment: .leading, spacing: 3) {
                        if i > 0, let action = a.action {
                            Button { onRun(action) } label: { Text(a.label).multilineTextAlignment(.leading) }
                                .buttonStyle(.plain)
                                .disabled(busy != nil)
                        } else {
                            Text(a.label)
                        }
                        if let note = brief?.item_notes[safe: i] ?? nil {
                            Text("← " + note)
                                .font(.serif(15.5, italic: true))
                                .foregroundStyle(scheme == .dark ? FW.Palette.accent : FW.Palette.text2)
                        }
                    }
                    .font(.sans(15))
                    .foregroundStyle(FW.Palette.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let m = a.minutes { Text("\(max(1, Int(m.rounded()))) min").font(.sans(13)).foregroundStyle(FW.Palette.text3).monospacedDigit() }
                }
                .padding(.vertical, 14)
                .overlay(alignment: .top) { Rule() }
            }
        }
    }

    private func actions(_ p: TodayAction) -> some View {
        let total = agenda.filter { $0.kind != "practice" }.compactMap(\.minutes).reduce(0, +)
        return VStack(alignment: .leading, spacing: 10) {
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
                    Button { onRun(s) } label: { Text("Short on time? ") + Text("20 min").bold() }
                        .buttonStyle(.fw(.ghost, wide: true))
                        .disabled(busy != nil)
                } else {
                    Button(s.label) { onRun(s) }.buttonStyle(.fw(.secondary, wide: true)).disabled(busy != nil)
                }
            }
            if total > 0 {
                Text("Ends around \(Date.now.addingTimeInterval(total * 60).formatted(date: .omitted, time: .shortened)) · adapts as you go")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3).frame(maxWidth: .infinity)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Aperture(size: 20)
                Kicker("Wrapped for today", color: FW.Palette.text2)
            }
            Text("Today’s done.").font(.display(30, italic: true)).foregroundStyle(FW.Palette.text)
            HStack(spacing: 28) {
                stat("\(recap.minutes)", "minutes")
                stat("\(recap.answers)", recap.answers == 1 ? "answer" : "answers")
                if xp > 0 { stat("+\(xp)", "XP", color: FW.Palette.caution) }
            }
            if !recap.ideas.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Kicker("Ideas you worked on")
                    FlowLayout(spacing: 8) {
                        ForEach(recap.ideas, id: \.self) { idea in
                            Text(idea).font(.sans(13)).padding(.horizontal, 10).padding(.vertical, 6)
                                .background(FW.Palette.surface2, in: .capsule).foregroundStyle(FW.Palette.text)
                        }
                        if recap.more > 0 { Text("and \(recap.more) more").font(.sans(13)).foregroundStyle(FW.Palette.text3).padding(.vertical, 6) }
                    }
                }
            }
            if let next = t.focus {
                VStack(alignment: .leading, spacing: 6) {
                    Kicker("Next up · \(Dates.weekday(next.date))")
                    Text(next.title).font(.serif(17)).foregroundStyle(FW.Palette.text)
                }
                .padding(.top, 14)
                .overlay(alignment: .top) { Rule() }
            }
            if let p = t.primary {
                Button(p.label) { onRun(p) }.buttonStyle(.fw(.secondary, wide: true)).disabled(busy != nil)
                Text("Anything more is optional.").font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }
        }
        .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 22)
    }

    private func stat(_ value: String, _ label: String, color: Color = FW.Palette.text) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.display(34)).foregroundStyle(color).monospacedDigit()
            Text(label).font(.sans(13)).foregroundStyle(FW.Palette.text3)
        }
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
            VStack(alignment: .leading, spacing: 4) {
                Kicker("Learn anything")
                Text("A one-off, outside your plan. It still remembers what it learns about you.")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
            }
            HStack(spacing: 10) {
                Image(systemName: "sparkles").foregroundStyle(FW.Palette.judgment)
                TextField("Why do planes fly? How do index funds work?", text: $topic)
                    .font(.sans(16))
                    .submitLabel(.go)
                    .focused($focused)
                    .onSubmit { if ok { onGo(topic.trimmingCharacters(in: .whitespaces)) } }
                    .onChange(of: topic) { _, v in if v.count > 200 { topic = String(v.prefix(200)) } }
                Button {
                    onGo(topic.trimmingCharacters(in: .whitespaces))
                } label: {
                    Group {
                        if busy { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "arrow.right").font(.system(size: 15, weight: .semibold)) }
                    }
                    .frame(width: 40, height: 40)
                    .foregroundStyle(FW.Palette.onAccent)
                    .background(FW.Palette.accent, in: .circle)
                }
                .buttonStyle(.plain)
                .disabled(!ok || disabled)
                .opacity(!ok || disabled ? 0.4 : 1)
                .accessibilityLabel("Start exploring")
            }
            .padding(.leading, 16)
            .padding(.trailing, 8)
            .frame(height: 56)
            .background(FW.Palette.surface, in: .rect(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(focused ? FW.Palette.line3 : FW.Palette.line))
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
            HStack {
                Kicker("This week")
                Spacer()
                Text("\(week.done)/\(week.planned) done").font(.sans(13)).foregroundStyle(FW.Palette.text3).monospacedDigit()
            }
            HStack(spacing: 8) {
                ForEach(week.days, id: \.date) { d in
                    VStack(spacing: 6) {
                        DayMarkView(status: d.status, color: trackColor(d.track))
                        Text(String(d.weekday.prefix(1)))
                            .font(.sans(12, d.status == "today" ? .semibold : .regular))
                            .foregroundStyle(d.status == "today" ? FW.Palette.text : FW.Palette.text3)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(d.weekday): \(d.status)\(d.title.map { ", \($0)" } ?? "")")
                }
            }
            if let note { Text(note).font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(1) }
            if let m = t.milestone {
                HStack(spacing: 6) {
                    Image(systemName: "target").font(.system(size: 12))
                    Text("\(m.days)").font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text).monospacedDigit()
                    Text("days to \(m.title.split(separator: ":").first.map(String.init) ?? m.title)")
                }
                .font(.sans(13))
                .foregroundStyle(FW.Palette.text3)
                .padding(.top, 10)
                .overlay(alignment: .top) { Rule().padding(.top, -2) }
            }
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

// Level, today's quests and the streak in one line; opens the full sheet.
struct ProgressStrip: View {
    let progress: Progress
    let prefs: Prefs
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 12) {
                if prefs.game.xp {
                    LevelRing(level: progress.level, fraction: progress.fraction, size: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(progress.rank).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
                        Text(progress.todayXp > 0 ? "+\(progress.todayXp) XP today" : "\(progress.toNext) XP to level \(progress.level + 1)")
                            .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    }
                }
                Spacer(minLength: 8)
                if prefs.game.quests {
                    HStack(spacing: 4) {
                        ForEach(progress.quests.prefix(3)) { q in
                            RoundedRectangle(cornerRadius: 2).fill(q.done ? FW.Palette.positive : FW.Palette.surface3).frame(width: 7, height: 7)
                        }
                        Text("\(progress.quests.filter(\.done).count)/3").font(.sans(12)).foregroundStyle(FW.Palette.text3).monospacedDigit()
                    }
                }
                if prefs.game.streak {
                    Rectangle().fill(FW.Palette.line2).frame(width: 1, height: 22)
                    HStack(spacing: 3) {
                        Image(systemName: "flame.fill").foregroundStyle(progress.streak.todayDone ? FW.Palette.coral : FW.Palette.text4)
                        Text("\(progress.streak.current)").font(.sans(14, .semibold)).foregroundStyle(FW.Palette.text).monospacedDigit()
                        if progress.streak.unit == "week" { Text("wk").font(.sans(11)).foregroundStyle(FW.Palette.text3) }
                    }
                }
            }
            .card(FW.Radius.lg, fill: FW.Palette.raised, padding: 12)
        }
        .buttonStyle(.plain)
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
            Text("\(level)").font(.sans(size * 0.36, .semibold)).foregroundStyle(FW.Palette.text).monospacedDigit()
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
