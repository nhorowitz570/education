import SwiftUI

// You (src/components/you/you.tsx): every setting, grouped by what it
// changes, each showing its current value. Anything with more than one
// choice opens its own sheet; Memory opens as its own screen.
struct YouView: View {
    @Environment(Store.self) private var store
    @Environment(Auth.self) private var auth
    @Environment(Router.self) private var router
    // Appearance is per device, like the web's localStorage theme.
    @AppStorage("fw.theme") private var theme: Theme = .system
    @State private var memory = Loader<MemListResponse>("/api/memory")
    @State private var usage = Loader<YouUsage>("/api/usage")
    @State private var open: Sheet?
    @State private var signingOut = false

    enum Sheet: String, Identifiable {
        case style, writing, voice, rhythm, plan, notify, reading, game, signin, usage, data
        var id: String { rawValue }
    }

    var body: some View {
        let plan = store.decodedPlan
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header(plan)
                tutor
                sessions
                rhythm(plan)
                notifications
                look
                account
                Button {
                    Task { await signOut() }
                } label: {
                    HStack(spacing: 8) {
                        if signingOut { ProgressView().controlSize(.small) } else { Image(systemName: "rectangle.portrait.and.arrow.right").font(.system(size: 15)) }
                        Text("Sign out")
                    }
                }
                .buttonStyle(.fw(.secondary))
                .disabled(signingOut)
                .padding(.top, 8)
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 20)
            .padding(.bottom, 48)
        }
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .refreshable { await reload() }
        .onAppear { Task { await reload() } }
        .sheet(item: $open) { sheet(for: $0, plan: plan) }
    }

    private func reload() async {
        async let a: Void = memory.load()
        async let b: Void = usage.load()
        _ = await (a, b)
    }

    private func signOut() async {
        signingOut = true
        await Push.unregister()
        store.signOut()
        await auth.signOut()
        signingOut = false
    }

    // MARK: Header

    private func header(_ plan: Plan?) -> some View {
        let name = plan?.profile.name.trimmingCharacters(in: .whitespaces) ?? ""
        let initial = String((name.isEmpty ? (auth.email ?? "Y") : name).prefix(1)).uppercased()
        return HStack(spacing: 16) {
            Text(initial)
                .font(.sans(22, .semibold))
                .foregroundStyle(FW.Palette.text)
                .frame(width: 56, height: 56)
                .background(FW.Palette.surface2, in: .circle)
                .overlay(Circle().strokeBorder(FW.Palette.line2, lineWidth: 1))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(name.isEmpty ? "Your space" : name)
                    .font(.display(32))
                    .foregroundStyle(FW.Palette.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                    .accessibilityAddTraits(.isHeader)
                if let email = auth.email {
                    Text(email)
                        .font(.sans(13))
                        .foregroundStyle(FW.Palette.text3)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: Your tutor

    private var tutor: some View {
        let list = memory.value?.memories
        let seen = memorySeenAt(store)
        let fresh = (list ?? []).filter { memoryIsNew($0, since: seen) }.count
        let tentative = (list ?? []).filter { $0.status == "candidate" }.count
        let pinned = (list ?? []).filter(\.pinned).count
        let style = memory.value?.style
        let learned = (style?.observations ?? 0) > 0
        let writing = Writing.all.first { $0.id == store.prefs.writing }?.label ?? "Balanced"
        let voice = Voice.all.first { $0.id == store.prefs.voice }?.label ?? "Cedar"
        return YouGroup(title: "Your tutor", note: "What it knows about you and how it teaches. Used in every session.") {
            YouRow(
                icon: "brain", title: "Memory",
                detail: "Your goals, background and preferences.\(pinned > 0 ? " \(pinned) pinned." : "")",
                value: list.map { $0.isEmpty ? "Empty" : "\($0.count) saved" } ?? (memory.error == nil ? "…" : nil),
                badge: fresh > 0 ? YouBadge(text: "\(fresh) new", quiet: false) : tentative > 0 ? YouBadge(text: "\(tentative) to confirm", quiet: true) : nil
            ) { router.push(.memory, on: .you) }
            YouRow(
                icon: "sparkles", title: "Teaching style", detail: "How it explains, learned from what you do.",
                value: memory.value == nil && memory.error == nil ? "…" : learned ? "Learning" : "Not yet"
            ) { open = .style }
            YouRow(icon: "textformat", title: "Writing style", detail: "How it talks to you: tone, length, and whether it swears.", value: writing) { open = .writing }
            YouRow(icon: "waveform", title: "Practice voice", detail: "Your partner in practice conversations.", value: voice) { open = .voice }
        }
    }

    // MARK: Sessions

    private var sessions: some View {
        let s = store.prefs.session
        return YouGroup(title: "Sessions", note: "How each lesson runs. Applies from the next session you start.") {
            YouControlRow(title: "Familiarity check", detail: "Before a new idea, asks how familiar it is so it can skip what you know.") {
                Toggle("Familiarity check", isOn: Binding(get: { s.familiarity }, set: { v in store.setPrefs { $0.session.familiarity = v } })).labelsHidden()
            }
            YouControlRow(title: "Confidence rating", detail: "Say how sure you are when you answer. It sharpens what the tutor reviews.") {
                Toggle("Confidence rating", isOn: Binding(get: { s.confidence }, set: { v in store.setPrefs { $0.session.confidence = v } })).labelsHidden()
            }
            YouControlRow(title: "“I don’t know yet”", detail: "A way to be taught instead of guessing at a question.") {
                Toggle("I don’t know yet", isOn: Binding(get: { s.dontKnow }, set: { v in store.setPrefs { $0.session.dontKnow = v } })).labelsHidden()
            }
            YouStackedRow(title: "Breaks", detail: "A pause about every 50 minutes in sessions of an hour or more.") {
                Segmented(options: [(0, "Off"), (5, "5 min"), (10, "10 min")],
                          selection: Binding(get: { store.prefs.session.breaks }, set: { v in store.setPrefs { $0.session.breaks = v } }))
            }
        }
    }

    // MARK: Your rhythm

    private func rhythm(_ plan: Plan?) -> some View {
        let rolling = plan?.isRolling == true ? plan : nil
        let noPlan = plan == nil ? "Import a plan first" : rolling == nil ? "Set by your fixed plan" : nil
        let h = rolling?.horizon
        return YouGroup(title: "Your rhythm", note: "The shape of your week, filled in from your plan. Changes apply from the next week drafted.") {
            YouRow(
                icon: "calendar", title: "Learning days",
                detail: rolling?.rhythmSummary ?? noPlan,
                value: rolling.map { "\($0.slots.count) a week" },
                disabled: rolling == nil
            ) { open = .rhythm }
            YouRow(
                icon: "clock", title: "Session length and start",
                detail: rolling != nil ? "Reminders and the session written ahead of time use the start." : noPlan,
                value: h.map { "\($0.rhythm.minutes) min · \(PlanDate.clock($0.rhythm.start_local))" },
                disabled: rolling == nil
            ) { open = .rhythm }
            YouRow(icon: "book", title: "Your plan", detail: plan?.title ?? "Import a plan to begin", value: plan == nil ? "None" : nil) { open = .plan }
        }
    }

    // MARK: Notifications

    private var notifications: some View {
        let r = YouReminders(store.record("settings:reminders")?["data"])
        return YouGroup(title: "Notifications", note: "A preview, one nudge, and a few moments worth knowing about.") {
            YouRow(
                icon: "bell", title: "Notifications",
                detail: r.on ? "Preview at \(PlanDate.clock(r.morning)) on learning days" : "Nothing is sent to this device",
                value: youNotifySummary(r.on, store.prefs)
            ) { open = .notify }
        }
    }

    // MARK: Look & feel

    private var look: some View {
        let prefs = store.prefs
        return YouGroup(title: "Look & feel") {
            YouStackedRow(icon: theme == .light ? "sun.max" : "moon", title: "Appearance") {
                Segmented(options: [(Theme.system, "Auto"), (.dark, "Dark"), (.light, "Light")], selection: $theme)
            }
            YouRow(icon: "textformat.size", title: "Reading", detail: "Fonts for lessons and the app, text size, line length.", value: youFontSummary(prefs.reading)) { open = .reading }
            YouStackedRow(icon: "wind", title: "Motion", detail: "Animations and transitions.") {
                Segmented(options: [("system", "Auto"), ("reduce", "Less"), ("full", "Full")],
                          selection: Binding(get: { store.prefs.reading.motion }, set: { v in store.setPrefs { $0.reading.motion = v } }))
            }
            YouControlRow(icon: "speaker.wave.2", title: "Sound", detail: "Soft tones for good answers and a finished session.") {
                Toggle("Sound", isOn: Binding(get: { store.prefs.sound }, set: { v in
                    store.setPrefs { $0.sound = v }
                    Feedback.shared.soundOn = v
                    if v { Feedback.shared.play(.solid) }
                }))
                .labelsHidden()
            }
            YouRow(icon: "star", title: "Game elements", detail: "XP, levels, streaks and quests.", value: youGameSummary(prefs)) { open = .game }
        }
    }

    // MARK: Account & data

    private var account: some View {
        let u = usage.value
        return YouGroup(title: "Account & data") {
            YouRow(icon: "key", title: "Sign-in", detail: "Passkeys for this account, or a link by email.") { open = .signin }
            YouRow(
                icon: "sparkles", title: "AI cost this month",
                detail: u.map { "\($0.calls) calls across lessons, practice and memory" } ?? (usage.error == nil ? "Loading…" : nil),
                value: u.map { youDollars($0.total) },
                disabled: u == nil,
                showsDisabled: false
            ) { open = .usage }
            YouRow(icon: "arrow.down.to.line", title: "Data & privacy", detail: "Export everything, or delete your account.") { open = .data }
        }
    }

    // MARK: Sheets

    @ViewBuilder
    private func sheet(for s: Sheet, plan: Plan?) -> some View {
        switch s {
        case .style: YouStyleSheet(style: memory.value?.style).presentationDetents([.medium, .large])
        case .writing: YouWritingSheet()
        case .voice: YouVoiceSheet()
        case .rhythm:
            if let plan, plan.isRolling { PlanRhythmSheet(plan: plan) }
        case .plan: YouPlanSheet().presentationDetents([.medium])
        case .notify: YouNotificationsSheet(reminders: YouReminders(store.record("settings:reminders")?["data"]))
        case .reading: YouReadingSheet()
        case .game: YouGameSheet().presentationDetents([.medium, .large])
        case .signin: YouSignInSheet(email: auth.email).presentationDetents([.medium, .large])
        case .usage:
            if let u = usage.value { YouUsageSheet(usage: u).presentationDetents([.medium]) }
        case .data: YouDataSheet().presentationDetents([.medium])
        }
    }
}

// MARK: - Rows

// A group of settings: a name, one line on what it changes, and its rows
// with hairlines between them (web: SettingsGroup).
struct YouGroup<Content: View>: View {
    let title: String
    var note: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            VStack(alignment: .leading, spacing: 3) {
                Kicker(title).accessibilityAddTraits(.isHeader)
                if let note {
                    Text(note).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.bottom, 4)
            VStack(spacing: 0) {
                Group(subviews: content()) { rows in
                    ForEach(rows.indices, id: \.self) { i in
                        if i > 0 { Rule() }
                        rows[i]
                    }
                }
            }
        }
    }
}

struct YouBadge {
    let text: String
    let quiet: Bool
}

// A leading glyph in the web's rounded square.
private struct YouGlyph: View {
    let icon: String
    var body: some View {
        Image(systemName: icon)
            .font(.system(size: 15))
            .foregroundStyle(FW.Palette.text2)
            .frame(width: 36, height: 36)
            .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.sm))
            .accessibilityHidden(true)
    }
}

private struct YouTitle: View {
    let title: String
    let detail: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if let detail {
                Text(detail).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// A row that opens something (web: IndexRow with onClick): glyph, title and
// detail, an optional badge and value, and a chevron.
struct YouRow: View {
    var icon: String? = nil
    let title: String
    var detail: String? = nil
    var value: String? = nil
    var badge: YouBadge? = nil
    var disabled = false
    // A row that just isn't ready yet (still loading) keeps full contrast.
    var showsDisabled = true
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                if let icon { YouGlyph(icon: icon) }
                YouTitle(title: title, detail: detail)
                if let badge {
                    Text(badge.text)
                        .font(.sans(12, .semibold))
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.horizontal, 8)
                        .frame(minHeight: 22)
                        .foregroundStyle(badge.quiet ? FW.Palette.text2 : FW.Palette.review)
                        .background(badge.quiet ? FW.Palette.surface2 : FW.Palette.review.opacity(0.18), in: .capsule)
                }
                if let value {
                    Text(value)
                        .font(.sans(14))
                        .monospacedDigit()
                        .foregroundStyle(FW.Palette.text2)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: 150, alignment: .trailing)
                }
                if !disabled {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(FW.Palette.text3)
                        .accessibilityHidden(true)
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 56)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled && showsDisabled ? 0.55 : 1)
    }
}

// A row with a control on the right (switches).
private struct YouControlRow<Control: View>: View {
    var icon: String? = nil
    let title: String
    var detail: String? = nil
    @ViewBuilder var control: () -> Control

    var body: some View {
        HStack(spacing: 14) {
            if let icon { YouGlyph(icon: icon) }
            YouTitle(title: title, detail: detail)
            control()
        }
        .padding(.vertical, 10)
        .frame(minHeight: 56)
    }
}

// A row whose control is too wide for one line and sits beneath its label
// (web: .index-row:has(> .segmented) on narrow screens).
private struct YouStackedRow<Control: View>: View {
    var icon: String? = nil
    let title: String
    var detail: String? = nil
    @ViewBuilder var control: () -> Control

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                if let icon { YouGlyph(icon: icon) }
                YouTitle(title: title, detail: detail)
            }
            control()
                .padding(.leading, icon == nil ? 0 : 50)
        }
        .padding(.vertical, 12)
        .frame(minHeight: 56)
    }
}
