import SwiftUI

// You (src/components/you/you.tsx): who you are and how far you've come at
// the top, then every setting in grouped cards, each showing its current
// value. Anything with more than one choice opens its own sheet; Memory opens
// as its own screen.
struct YouView: View {
    @Environment(Store.self) private var store
    @Environment(Auth.self) private var auth
    @Environment(Router.self) private var router
    // Appearance is per device, like the web's localStorage theme.
    @AppStorage("fw.theme") private var theme: Theme = .system
    @State private var memory = Loader<MemListResponse>("/api/memory")
    @State private var usage = Loader<YouUsage>("/api/usage")
    @State private var progress = Loader<Progress>("/api/progress")
    @State private var open: Sheet?
    @State private var signingOut = false
    @State private var confirmSignOut = false
    @State private var exporting = false

    enum Sheet: String, Identifiable {
        case style, writing, voice, sessions, rhythm, plan, notify, reading, game, signin, usage, progress, delete
        var id: String { rawValue }
    }

    var body: some View {
        let plan = store.decodedPlan
        ScrollView {
            VStack(spacing: 28) {
                header(plan).rise(0)
                stats(plan).rise(1)
                section("Learning", 2) { learning }
                section("Schedule", 3) { schedule(plan) }
                section("App", 4) { app }
                section("Account", 5) { account }
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 12)
            .padding(.bottom, 48)
        }
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await reload() }
        .onAppear { Task { await reload() } }
        .sheet(item: $open) { sheet(for: $0, plan: plan) }
        .confirmationDialog("Sign out of Fieldwork?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await signOut() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func reload() async {
        async let a: Void = memory.load()
        async let b: Void = usage.load()
        async let c: Void = progress.load()
        _ = await (a, b, c)
    }

    private func signOut() async {
        signingOut = true
        await Push.unregister()
        store.signOut()
        await auth.signOut()
        signingOut = false
    }

    private func exportAll() async {
        guard !exporting else { return }
        withAnimation(Springs.snappy) { exporting = true }
        await YouExport.all()
        withAnimation(Springs.snappy) { exporting = false }
    }

    // MARK: Header

    private func header(_ plan: Plan?) -> some View {
        let name = plan?.profile.name.trimmingCharacters(in: .whitespaces) ?? ""
        let initial = String((name.isEmpty ? (auth.email ?? "Y") : name).prefix(1)).uppercased()
        let p = store.prefs.game.xp ? progress.value : nil
        return VStack(spacing: p == nil ? 14 : 20) {
            YouAvatar(initial: initial, fraction: p?.fraction, level: p?.level)
            VStack(spacing: 4) {
                Text(name.isEmpty ? "Your space" : name)
                    .font(.display(32))
                    .foregroundStyle(FW.Palette.text)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                    .accessibilityAddTraits(.isHeader)
                if let email = auth.email {
                    Text(email)
                        .font(.sans(14))
                        .foregroundStyle(FW.Palette.text3)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }

    // A row of numbers: XP and streak when those are switched on, then what
    // the tutor remembers and the week's rhythm to fill the row.
    private func stats(_ plan: Plan?) -> some View {
        let game = store.prefs.game
        let p = progress.value
        let saved = memory.value?.memories.count
        var items: [YouStat] = []
        if game.xp {
            items.append(.init(id: "xp", value: p.map { "\($0.xp)" } ?? "–", label: p.map { "XP · level \($0.level)" } ?? "XP",
                               icon: "bolt.fill", color: FW.Palette.caution) { if p != nil { open = .progress } })
        }
        if game.streak {
            items.append(.init(id: "streak", value: p.map { "\($0.streak.current)" } ?? "–",
                               label: p?.streak.unit == "week" ? "Week streak" : "Day streak",
                               icon: "flame.fill", color: FW.Palette.coral) { if p != nil { open = .progress } })
        }
        items.append(.init(id: "memory", value: saved.map { "\($0)" } ?? "–", label: saved == 1 ? "Memory" : "Memories",
                           icon: "brain.head.profile", color: FW.Palette.review) { router.push(.memory, on: .you) })
        if let rolling = plan?.isRolling == true ? plan : nil {
            items.append(.init(id: "days", value: "\(rolling.slots.count)", label: "Days a week",
                               icon: "calendar", color: FW.Palette.finance) { open = .rhythm })
        } else if let quests = p?.quests, game.quests {
            items.append(.init(id: "quests", value: "\(quests.filter(\.done).count)/\(quests.count)", label: "Quests today",
                               icon: "checklist", color: FW.Palette.finance) { open = .progress })
        }
        return HStack(spacing: 10) {
            ForEach(items.prefix(3)) { s in
                Button(action: s.action) {
                    StatTile(value: s.value, label: s.label, icon: s.icon, color: s.color)
                }
                .buttonStyle(.pressable)
            }
        }
        .animation(Springs.snappy, value: items.map(\.value))
    }

    private func section<C: View>(_ title: String, _ index: Int, @ViewBuilder content: @escaping () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Kicker(title)
                .padding(.leading, 4)
                .accessibilityAddTraits(.isHeader)
            GroupCard(content: content)
                .clipShape(.rect(cornerRadius: FW.Radius.lg, style: .continuous))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .rise(index)
    }

    // MARK: Learning

    @ViewBuilder
    private var learning: some View {
        let list = memory.value?.memories
        let seen = memorySeenAt(store)
        let fresh = (list ?? []).filter { memoryIsNew($0, since: seen) }.count
        let tentative = (list ?? []).filter { $0.status == "candidate" }.count
        let learned = (memory.value?.style?.observations ?? 0) > 0
        let writing = Writing.all.first { $0.id == store.prefs.writing }?.label ?? "Balanced"
        let voice = Voice.all.first { $0.id == store.prefs.voice }?.label ?? "Cedar"
        let loading = memory.value == nil && memory.error == nil

        Button { router.push(.memory, on: .you) } label: {
            GroupRow(icon: "brain.head.profile", title: "Memory", color: FW.Palette.review) {
                YouTrail(
                    value: list.map { $0.isEmpty ? "Empty" : "\($0.count) saved" } ?? (loading ? "…" : nil),
                    badge: fresh > 0 ? "\(fresh) new" : tentative > 0 ? "\(tentative) to check" : nil,
                    quiet: fresh == 0
                )
            }
        }
        .buttonStyle(YouRowStyle())
        Button { open = .style } label: {
            GroupRow(icon: "sparkles", title: "Teaching style", color: FW.Palette.judgment, value: loading ? "…" : learned ? "Learning" : "Not yet")
        }
        .buttonStyle(YouRowStyle())
        Button { open = .writing } label: {
            GroupRow(icon: "text.bubble.fill", title: "Writing style", color: FW.Palette.coral, value: writing)
        }
        .buttonStyle(YouRowStyle())
        Button { open = .voice } label: {
            GroupRow(icon: "waveform", title: "Practice voice", color: FW.Palette.finance, value: voice)
        }
        .buttonStyle(YouRowStyle())
    }

    // MARK: Schedule

    @ViewBuilder
    private func schedule(_ plan: Plan?) -> some View {
        let rolling = plan?.isRolling == true ? plan : nil
        let h = rolling?.horizon
        let s = store.prefs.session
        let aids = [s.familiarity, s.confidence, s.dontKnow].filter { $0 }.count

        Button { open = .sessions } label: {
            GroupRow(icon: "book.pages.fill", title: "Sessions", color: FW.Palette.communication,
                     value: aids == 3 ? "All on" : "\(aids) of 3")
        }
        .buttonStyle(YouRowStyle())
        Button { open = .rhythm } label: {
            GroupRow(
                icon: "calendar", title: "Rhythm",
                caption: rolling == nil ? (plan == nil ? "Import a plan first" : "Set by your fixed plan") : nil,
                color: FW.Palette.finance,
                value: h.map { "\(rolling?.slots.count ?? 0) days · \($0.rhythm.minutes) min" },
                chevron: rolling != nil
            )
        }
        .buttonStyle(YouRowStyle())
        .disabled(rolling == nil)
        .opacity(rolling == nil ? 0.55 : 1)
        Button { open = .plan } label: {
            GroupRow(icon: "map.fill", title: "Your plan", caption: plan?.title, color: FW.Palette.review, value: plan == nil ? "None" : nil)
        }
        .buttonStyle(YouRowStyle())
    }

    // MARK: App

    @ViewBuilder
    private var app: some View {
        let prefs = store.prefs
        let r = YouReminders(store.record("settings:reminders")?["data"])

        Button { open = .notify } label: {
            GroupRow(icon: "bell.badge.fill", title: "Notifications",
                     caption: r.on ? "Preview at \(PlanDate.clock(r.morning))" : nil,
                     color: FW.Palette.coral, value: youNotifySummary(r.on, prefs))
        }
        .buttonStyle(YouRowStyle())
        Menu {
            Picker("Appearance", selection: $theme) {
                Label("Automatic", systemImage: "circle.lefthalf.filled").tag(Theme.system)
                Label("Dark", systemImage: "moon.fill").tag(Theme.dark)
                Label("Light", systemImage: "sun.max.fill").tag(Theme.light)
            }
        } label: {
            GroupRow(icon: theme == .light ? "sun.max.fill" : theme == .dark ? "moon.fill" : "circle.lefthalf.filled",
                     title: "Appearance", color: FW.Palette.judgment) {
                YouMenuValue(text: theme == .system ? "Auto" : theme.label)
            }
        }
        .buttonStyle(YouRowStyle())
        Button { open = .reading } label: {
            GroupRow(icon: "textformat.size", title: "Reading", color: FW.Palette.communication) {
                YouTrail(value: youFontSummary(prefs.reading), badge: nil)
            }
        }
        .buttonStyle(YouRowStyle())
        Menu {
            Picker("Motion", selection: Binding(get: { store.prefs.reading.motion }, set: { v in store.setPrefs { $0.reading.motion = v } })) {
                Text("Automatic").tag("system")
                Text("Less").tag("reduce")
                Text("Full").tag("full")
            }
        } label: {
            GroupRow(icon: "wind", title: "Motion", color: FW.Palette.review) {
                YouMenuValue(text: ["system": "Auto", "reduce": "Less", "full": "Full"][prefs.reading.motion] ?? "Auto")
            }
        }
        .buttonStyle(YouRowStyle())
        GroupRow(icon: prefs.sound ? "speaker.wave.2.fill" : "speaker.slash.fill", title: "Sound", color: FW.Palette.finance) {
            Toggle("Sound", isOn: Binding(get: { store.prefs.sound }, set: { v in
                store.setPrefs { $0.sound = v }
                Feedback.shared.soundOn = v
                if v { Feedback.shared.play(.solid) }
            }))
            .labelsHidden()
        }
        Button { open = .game } label: {
            GroupRow(icon: "star.fill", title: "Game elements", color: FW.Palette.caution, value: youGameSummary(prefs))
        }
        .buttonStyle(YouRowStyle())
    }

    // MARK: Account

    @ViewBuilder
    private var account: some View {
        let u = usage.value

        Button { open = .signin } label: {
            GroupRow(icon: "person.badge.key.fill", title: "Sign-in", color: FW.Palette.review, value: "Passkeys")
        }
        .buttonStyle(YouRowStyle())
        Button { open = .usage } label: {
            GroupRow(icon: "dollarsign.circle.fill", title: "AI cost this month", color: FW.Palette.finance,
                     value: u.map { youDollars($0.total) } ?? (usage.error == nil ? "…" : nil), chevron: u != nil)
        }
        .buttonStyle(YouRowStyle())
        .disabled(u == nil)
        Button { Task { await exportAll() } } label: {
            GroupRow(icon: "square.and.arrow.up.fill", title: "Export my data", color: FW.Palette.judgment) {
                if exporting {
                    ProgressView().controlSize(.small).transition(.opacity.combined(with: .scale(0.8)))
                } else {
                    Image(systemName: "arrow.down.to.line").font(.system(size: 14, weight: .semibold)).foregroundStyle(FW.Palette.text4)
                }
            }
        }
        .buttonStyle(YouRowStyle())
        .disabled(exporting)
        Button { open = .delete } label: {
            GroupRow(icon: "trash.fill", title: "Delete account", color: FW.Palette.negative, value: nil)
        }
        .buttonStyle(YouRowStyle())
        Button { confirmSignOut = true } label: {
            GroupRow(icon: "rectangle.portrait.and.arrow.right", title: "Sign out", color: FW.Palette.text2) {
                if signingOut { ProgressView().controlSize(.small) }
            }
        }
        .buttonStyle(YouRowStyle())
        .disabled(signingOut)
    }

    // MARK: Sheets

    @ViewBuilder
    private func sheet(for s: Sheet, plan: Plan?) -> some View {
        switch s {
        case .style: YouStyleSheet(style: memory.value?.style).presentationDetents([.medium, .large])
        case .writing: YouWritingSheet().presentationDetents([.large])
        case .voice: YouVoiceSheet().presentationDetents([.medium, .large])
        case .sessions: YouSessionsSheet().presentationDetents([.medium, .large])
        case .rhythm:
            if let plan, plan.isRolling { PlanRhythmSheet(plan: plan) }
        case .plan: YouPlanSheet().presentationDetents([.medium])
        case .notify: YouNotificationsSheet(reminders: YouReminders(store.record("settings:reminders")?["data"])).presentationDetents([.large])
        case .reading: YouReadingSheet().presentationDetents([.large])
        case .game: YouGameSheet().presentationDetents([.medium, .large])
        case .signin: YouSignInSheet(email: auth.email).presentationDetents([.medium, .large])
        case .usage:
            if let u = usage.value { YouUsageSheet(usage: u).presentationDetents([.medium, .large]) }
        case .progress:
            if let p = progress.value { ProgressSheet(progress: p) }
        case .delete: YouDeleteAccountSheet().presentationDetents([.medium, .large])
        }
    }
}

// MARK: - Pieces

private struct YouStat: Identifiable {
    let id: String
    let value: String
    let label: String
    let icon: String
    let color: Color
    let action: () -> Void
}

// The initial in a warm disc, ringed by progress to the next level when XP
// is on. The ring draws itself in the first time it's seen.
private struct YouAvatar: View {
    let initial: String
    let fraction: Double?
    let level: Int?
    @State private var shown: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if fraction != nil {
                Circle().stroke(FW.Palette.surface2, lineWidth: 5)
                Circle()
                    .trim(from: 0, to: shown)
                    .stroke(
                        AngularGradient(colors: [FW.Palette.caution, FW.Palette.coral, FW.Palette.caution], center: .center),
                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
            }
            Text(initial)
                .font(.rounded(38))
                .foregroundStyle(FW.Palette.bg)
                .frame(width: 84, height: 84)
                .background(
                    LinearGradient(colors: [FW.Palette.coral, FW.Palette.caution], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: .circle
                )
        }
        .frame(width: 102, height: 102)
        .overlay(alignment: .bottom) {
            if let level {
                Text("Level \(level)")
                    .font(.sans(12, .bold))
                    .foregroundStyle(FW.Palette.text)
                    .padding(.horizontal, 9)
                    .frame(height: 22)
                    .background(FW.Palette.raised, in: .capsule)
                    .overlay(Capsule().strokeBorder(FW.Palette.line2, lineWidth: 1))
                    .offset(y: 8)
                    .contentTransition(.numericText())
                    .transition(.scale(0.6).combined(with: .opacity))
            }
        }
        .animation(Springs.bouncy, value: level)
        .onAppear { animate(to: fraction) }
        .onChange(of: fraction) { _, f in animate(to: f) }
        .accessibilityElement()
        .accessibilityLabel(level.map { "Level \($0)" } ?? "Profile")
    }

    private func animate(to f: Double?) {
        guard let f else { return }
        let target = min(max(f, 0.02), 1)
        if reduceMotion { shown = target; return }
        withAnimation(.easeOut(duration: 1.1).delay(0.25)) { shown = target }
    }
}

// A row's value with an optional count badge beside it, and a chevron.
private struct YouTrail: View {
    let value: String?
    let badge: String?
    var quiet = false

    var body: some View {
        HStack(spacing: 8) {
            if let badge {
                Text(badge)
                    .font(.sans(12, .semibold))
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, 8)
                    .frame(height: 22)
                    .foregroundStyle(quiet ? FW.Palette.text2 : FW.Palette.review)
                    .background(quiet ? FW.Palette.surface2 : FW.Palette.review.opacity(0.16), in: .capsule)
                    .transition(.scale(0.7).combined(with: .opacity))
            }
            if let value {
                Text(value).font(.sans(15)).foregroundStyle(FW.Palette.text3)
                    .lineLimit(1).truncationMode(.tail)
                    .frame(maxWidth: 170, alignment: .trailing)
                    .contentTransition(.numericText())
            }
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text4)
        }
        .animation(Springs.snappy, value: badge)
    }
}

// The current choice of an inline menu, with the up-down glyph iOS uses.
private struct YouMenuValue: View {
    let text: String
    var body: some View {
        HStack(spacing: 5) {
            Text(text).font(.sans(15)).foregroundStyle(FW.Palette.text3).contentTransition(.interpolate)
            Image(systemName: "chevron.up.chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(FW.Palette.text4)
        }
    }
}

// Rows inside a card light up edge to edge while pressed, like Settings.
private struct YouRowStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                Rectangle()
                    .fill(FW.Palette.surface2)
                    .padding(.horizontal, -14)
                    .opacity(configuration.isPressed ? 1 : 0)
            }
            .animation(configuration.isPressed ? nil : .easeOut(duration: 0.25), value: configuration.isPressed)
            .contentShape(.rect)
    }
}
