import CoreTransferable
import SwiftUI
import UniformTypeIdentifiers

// Import (src/components/import.tsx): choose a plan file, review how it was
// read, then activate it. Three steps, shown as a stepper at the top: pick a
// file, preview it, confirm.
struct ImportView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var file: (name: String, text: String)?
    @State private var planJSON: JSON?
    @State private var plan: Plan?
    @State private var diff: ImportDiff?
    @State private var uncertain: [String] = []
    @State private var accepted = false
    @State private var busy = false
    @State private var error: String?
    @State private var done = false
    @State private var editing = false
    @State private var json = ""
    @State private var picking = false
    @State private var dropping = false

    private static let maxBytes = 2 * 1024 * 1024

    private var stage: Int { done ? 2 : plan != nil ? 1 : 0 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ImportSteps(stage: stage, reading: busy && plan == nil)
                    .rise(0)

                VStack(alignment: .leading, spacing: 6) {
                    Text(done ? "Your next chapter is ready." : plan != nil ? "Make sure it feels right." : "Bring your plan to life.")
                        .font(.sans(28, .bold))
                        .foregroundStyle(FW.Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(done ? "Start with one useful situation. Everything else can wait."
                         : plan != nil ? "Review the interpretation before it becomes your schedule."
                         : "A ChatGPT plan becomes small, useful steps you can actually start.")
                        .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .id(stage)
                .transition(.blurReplace)
                .rise(1)

                Group {
                    if done {
                        doneStage
                    } else if let plan {
                        review(plan)
                    } else {
                        upload
                    }
                }
                .transition(.asymmetric(
                    insertion: .offset(x: 28).combined(with: .opacity),
                    removal: .opacity
                ))
                .rise(2)

                if let error {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(FW.Palette.negative)
                            .padding(.top, 1)
                        Text(error)
                            .font(.sans(14))
                            .foregroundStyle(FW.Palette.text)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(14)
                    .background(FW.Palette.negative.opacity(0.09), in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Error: \(error)")
                    .transition(.opacity.combined(with: .scale(0.96)))
                }

                Label("New versions preserve the original file and your completed work.", systemImage: "lock.fill")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 8)
            .padding(.bottom, 48)
            .animation(Springs.smooth, value: stage)
            .animation(Springs.snappy, value: error)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("Import a plan")
        .navigationBarTitleDisplayMode(.inline)
        .fileImporter(isPresented: $picking, allowedContentTypes: Self.types, allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls): if let url = urls.first { Task { await read(url) } }
            case .failure(let e): error = e.localizedDescription
            }
        }
    }

    private static var types: [UTType] {
        [.json, .plainText, UTType(filenameExtension: "md"), UTType(filenameExtension: "markdown"), UTType("net.daringfireball.markdown")].compactMap { $0 }
    }

    // MARK: Upload

    private var upload: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button { picking = true } label: {
                VStack(spacing: 14) {
                    ZStack {
                        Circle().fill(FW.Palette.judgment.opacity(dropping ? 0.24 : 0.14))
                        if busy {
                            ImportSpinner(color: FW.Palette.judgment)
                        } else {
                            Image(systemName: dropping ? "arrow.down.doc.fill" : "arrow.up.doc.fill")
                                .font(.system(size: 30, weight: .semibold))
                                .foregroundStyle(FW.Palette.judgment)
                                .contentTransition(.symbolEffect(.replace))
                                .symbolEffect(.bounce, value: dropping)
                        }
                    }
                    .frame(width: 80, height: 80)
                    .scaleEffect(dropping ? 1.08 : 1)
                    VStack(spacing: 4) {
                        if busy {
                            ShimmerText(text: "Reading your plan…", font: .sans(18, .semibold))
                        } else {
                            Text(dropping ? "Let go to read it" : "Drop your plan here")
                                .font(.sans(18, .semibold)).foregroundStyle(FW.Palette.text)
                                .contentTransition(.opacity)
                            Text("or tap to choose a file").font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        }
                    }
                    HStack(spacing: 6) {
                        Pill(text: "JSON", icon: "curlybraces", color: FW.Palette.review)
                        Pill(text: "Markdown", icon: "text.alignleft", color: FW.Palette.finance)
                        Pill(text: "Up to 2 MB", icon: "scalemass", color: FW.Palette.text3)
                    }
                    .opacity(busy ? 0.4 : 1)
                }
                .frame(maxWidth: .infinity, minHeight: 260)
                .padding(20)
                .background(dropping ? FW.Palette.judgment.opacity(0.07) : FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.xl, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous)
                        .strokeBorder(dropping ? FW.Palette.judgment : FW.Palette.line3, style: StrokeStyle(lineWidth: dropping ? 2 : 1.5, dash: [7, 6]))
                )
                .scaleEffect(dropping ? 1.02 : 1)
                .animation(Springs.bouncy, value: dropping)
                .animation(Springs.snappy, value: busy)
                .contentShape(.rect(cornerRadius: FW.Radius.xl))
            }
            .buttonStyle(.pressable(0.98))
            .disabled(busy)
            .accessibilityLabel("Upload a ChatGPT plan")
            .accessibilityHint("JSON or Markdown, up to 2 MB")
            .dropDestination(for: ImportDroppedFile.self) { items, _ in
                guard let item = items.first else { return false }
                Task { await read(item.url, scoped: false) }
                return true
            } isTargeted: { dropping = $0 }

            GroupCard {
                ShareLink(item: SharedJSONFile(name: "fieldwork-plan-template.json", data: Data(importTemplate.utf8)), preview: SharePreview("fieldwork-plan-template.json")) {
                    GroupRow(icon: "doc.badge.plus", title: "Get the empty template", caption: "fieldwork-plan-template.json", color: FW.Palette.judgment) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(FW.Palette.text3)
                    }
                }
                .buttonStyle(.pressable(0.985))
            }
            Label("Ask ChatGPT to fill this format with your goals, learning dates, weekly topics, and source links.", systemImage: "sparkles")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Review

    private func review(_ plan: Plan) -> some View {
        let travelUnconfirmed = plan.schedule.travel_window?.dates_confirmed == false
        let needsCheck = !uncertain.isEmpty || travelUnconfirmed
        return VStack(alignment: .leading, spacing: 16) {
            // How the plan was read.
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    IconBadge(systemName: "doc.text.magnifyingglass", color: FW.Palette.judgment, size: 36)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Plan interpretation").font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text3)
                        if let file { Text(file.name).font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(1).truncationMode(.middle) }
                    }
                }
                Text(plan.title).font(.sans(22, .bold)).foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10, alignment: .top), GridItem(.flexible(), alignment: .top)], alignment: .leading, spacing: 10) {
                    fact("calendar", "Starts", PlanDate.label(plan.start_date), FW.Palette.finance)
                    fact("clock", "Typical window", "\(plan.schedule.start_local) – \(plan.schedule.end_local)", FW.Palette.review)
                    fact("repeat", "Learning rhythm", plan.isRolling ? "\(plan.slots.count) days a week" : "\(plan.weeks.count) weeks · \(plan.sessions.count) sessions", FW.Palette.judgment)
                    fact("globe", "Time zone", plan.schedule.timezone, FW.Palette.communication)
                }
                if plan.isRolling, !plan.slots.isEmpty {
                    Text(plan.rhythmSummary)
                        .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))

            if plan.isRolling {
                let first = plan.horizon?.weeks.first { $0.status != "done" }?.start ?? plan.start_date
                callout("Your first week", icon: "calendar.badge.checkmark", color: FW.Palette.finance) {
                    VStack(spacing: 0) {
                        ForEach(Array(plan.weekSessions(first).enumerated()), id: \.element.id) { i, s in
                            if i > 0 { Rule().padding(.leading, 42) }
                            HStack(spacing: 12) {
                                IconBadge(systemName: Glyph.track(s.subject), color: trackColor(s.subject), size: 30, circle: true)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(PlanDate.dayNames[PlanDate.dayIndex(s.date)]).font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
                                    Text(s.title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.vertical, 8)
                        }
                    }
                }
                callout("Beyond that, a direction", icon: "signpost.right.fill", color: FW.Palette.judgment) {
                    PlanMoreText(
                        text: "Only the first week is scheduled. Everything else waits in \(plan.horizon?.tracks.count ?? 0) tracks, in the order you wrote it, and each week is drafted on Sunday from what you’ve learned so far. You can change any week until its Monday.",
                        font: .sans(15), color: FW.Palette.text2
                    )
                    FlowLayout(spacing: 6) {
                        ForEach(plan.horizon?.tracks ?? []) { t in
                            Pill(text: "\(t.title) · \(t.backlog.count)", icon: Glyph.track(t.id), color: trackColor(t.id))
                        }
                    }
                    Label("Completed work stays in your history. Milestones travel with the plan.", systemImage: "checkmark.shield")
                        .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                callout(store.hasPlan ? "What changes" : "What comes with it", icon: "arrow.triangle.branch", color: FW.Palette.review) {
                    HStack(spacing: 10) {
                        StatTile(value: "\(diff?.added ?? plan.sessions.count)", label: "new sessions", icon: "plus.circle.fill", color: FW.Palette.positive)
                        StatTile(value: "\(diff?.changed ?? 0)", label: "changed", icon: "pencil.circle.fill", color: FW.Palette.caution)
                        StatTile(value: "\(diff?.removed ?? 0)", label: "removed", icon: "minus.circle.fill", color: FW.Palette.negative)
                    }
                }
            }

            if needsCheck {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        IconBadge(systemName: "exclamationmark.triangle.fill", color: FW.Palette.coral, size: 32)
                        Text("A few things to check").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(uncertain, id: \.self) { bullet($0) }
                        if travelUnconfirmed, let t = plan.schedule.travel_window {
                            bullet("Travel \(PlanDate.label(t.start)) – \(PlanDate.label(t.end)) is proposed.")
                        }
                    }
                    Button {
                        Feedback.shared.play(.tap)
                        withAnimation(Springs.bouncy) { accepted.toggle() }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: accepted ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 22))
                                .foregroundStyle(accepted ? FW.Palette.positive : FW.Palette.text3)
                                .contentTransition(.symbolEffect(.replace))
                            Text("I reviewed these assumptions.").font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 48)
                        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                        .contentShape(.rect)
                    }
                    .buttonStyle(.pressable)
                    .accessibilityAddTraits(accepted ? .isSelected : [])
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FW.Palette.coral.opacity(0.09), in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.coral.opacity(0.25)))
            }

            VStack(alignment: .leading, spacing: 0) {
                Button {
                    withAnimation(Springs.snappy) { editing.toggle() }
                } label: {
                    HStack(spacing: 14) {
                        IconBadge(systemName: "curlybraces", color: FW.Palette.text2, size: 32)
                        Text("Edit the interpreted JSON").font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(FW.Palette.text4)
                            .rotationEffect(.degrees(editing ? 180 : 0))
                    }
                    .frame(minHeight: 56)
                    .contentShape(.rect)
                }
                .buttonStyle(.pressable(0.985))

                if editing {
                    VStack(alignment: .leading, spacing: 10) {
                        TextEditor(text: $json)
                            .font(.system(size: 13, design: .monospaced))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .scrollContentBackground(.hidden)
                            .padding(10)
                            .frame(minHeight: 320)
                            .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: FW.Radius.base, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
                            .accessibilityLabel("Plan JSON")
                        Button { validate() } label: { Label("Validate changes", systemImage: "checkmark.seal") }
                            .buttonStyle(.fw(.secondary, wide: true))
                    }
                    .padding(.bottom, 14)
                    .transition(.opacity.combined(with: .offset(y: -6)))
                }
            }
            .padding(.horizontal, 14)
            .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))

            VStack(spacing: 10) {
                Button { Task { await activate() } } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().controlSize(.small).tint(FW.Palette.onAccent) }
                        Text(busy ? "Activating…" : "Activate this plan")
                        if !busy { Image(systemName: "arrow.right") }
                    }
                }
                .buttonStyle(.fw(.primary, wide: true))
                .disabled(busy || editing || (needsCheck && !accepted))
                Button { reset() } label: { Label("Choose another file", systemImage: "arrow.uturn.backward") }
                    .buttonStyle(.fw(.ghost, wide: true))
                    .disabled(busy)
            }
            .padding(.top, 4)
        }
    }

    private func fact(_ icon: String, _ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12, weight: .semibold)).foregroundStyle(color)
                Text(label).font(.sans(12, .medium)).foregroundStyle(FW.Palette.text3).lineLimit(1)
            }
            Text(value.isEmpty ? "—" : value).font(.sans(15, .semibold)).foregroundStyle(FW.Palette.text)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func callout<Content: View>(_ title: String, icon: String, color: Color, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                IconBadge(systemName: icon, color: color, size: 32)
                Text(title).font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line))
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle().fill(FW.Palette.coral).frame(width: 6, height: 6).padding(.top, 7)
            Text(text).foregroundStyle(FW.Palette.text).fixedSize(horizontal: false, vertical: true)
        }
        .font(.sans(15))
    }

    // MARK: Done

    private var doneStage: some View {
        VStack(spacing: 16) {
            ImportDoneMark()
            VStack(spacing: 6) {
                Text(plan?.title ?? "").font(.sans(22, .bold)).foregroundStyle(FW.Palette.text)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Label("Your first week is ready · private to your account", systemImage: "lock.fill")
                    .font(.sans(14)).foregroundStyle(FW.Palette.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button {
                let tab = router.tab
                router.paths[tab] = NavigationPath()
                router.open("/")
            } label: {
                HStack(spacing: 8) { Text("Go to Today"); Image(systemName: "arrow.right") }
            }
            .buttonStyle(.fw(.primary, wide: true))
            .padding(.top, 4)
        }
        .padding(22)
        .frame(maxWidth: .infinity)
        .background {
            Aurora(colors: [FW.Palette.finance, FW.Palette.review, FW.Palette.judgment], intensity: 0.3)
                .clipShape(.rect(cornerRadius: FW.Radius.xl, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
    }

    // MARK: Behaviour

    private func reset() {
        planJSON = nil
        plan = nil
        diff = nil
        uncertain = []
        accepted = false
        editing = false
        error = nil
    }

    private func read(_ url: URL, scoped: Bool = true) async {
        busy = true
        error = nil
        reset()
        defer { busy = false }
        let access = scoped && url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if size > Self.maxBytes { throw Failure("Choose a JSON or Markdown plan smaller than 2 MB.") }
            let name = url.lastPathComponent
            guard name.range(of: #"\.(json|md|markdown|txt)$"#, options: [.regularExpression, .caseInsensitive]) != nil else {
                throw Failure("Choose JSON or Markdown.")
            }
            let data = try Data(contentsOf: url)
            if data.count > Self.maxBytes { throw Failure("Choose a JSON or Markdown plan smaller than 2 MB.") }
            guard let text = String(data: data, encoding: .utf8) else { throw Failure("Choose JSON or Markdown.") }
            file = (name, text)
            let body: [String: JSON] = [
                "action": .string("preview"), "filename": .string(name), "original": .string(text),
                "eventId": .string(UUID().uuidString.lowercased()),
            ]
            let r: ImportPreview = try await API.post("/api/import", body)
            guard let decoded = try? r.plan.decode(Plan.self) else { throw Failure("The server sent an unexpected response.") }
            planJSON = r.plan
            plan = decoded
            diff = r.diff
            uncertain = r.uncertain
            json = String(decoding: youPrettyJSON(r.plan), as: UTF8.self)
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func validate() {
        let required = ["schema_version", "plan_id", "title", "start_date", "end_date", "profile", "schedule", "sources", "weeks", "sessions", "adaptation", "milestones"]
        guard let value = try? JSONDecoder.api.decode(JSON.self, from: Data(json.utf8)),
              let object = value.object,
              required.allSatisfy({ object[$0] != nil }),
              let next = try? value.decode(Plan.self),
              ([next.start_date, next.end_date] + next.sessions.map(\.date)).allSatisfy(Self.realDate),
              Set(next.sessions.map(\.id)).count == next.sessions.count
        else {
            error = "Check the required fields, real dates, and stable IDs in the edited plan."
            return
        }
        planJSON = value
        plan = next
        withAnimation { editing = false }
        error = nil
    }

    private static func realDate(_ s: String) -> Bool {
        s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil && PlanDate.date(s).map(PlanDate.string) == s
    }

    private func activate() async {
        guard let planJSON, let file else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let body: [String: JSON] = [
                "action": .string("activate"), "filename": .string(file.name), "original": .string(file.text),
                "plan": planJSON, "eventId": .string(UUID().uuidString.lowercased()),
            ]
            let r: ImportActivated = try await API.post("/api/import", body)
            store.adopt(r.state)
            done = true
            Feedback.shared.play(.complete)
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// Pick a file → preview → confirm, with the line between steps filling as
// each one is reached.
private struct ImportSteps: View {
    let stage: Int
    let reading: Bool
    private let steps: [(icon: String, label: String)] = [
        ("doc.badge.arrow.up", "Pick a file"),
        ("doc.text.magnifyingglass", "Preview"),
        ("checkmark.seal", "Confirm"),
    ]

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                if i > 0 {
                    ZStack(alignment: .leading) {
                        Capsule().fill(FW.Palette.surface2)
                        Capsule().fill(FW.Palette.positive)
                            .scaleEffect(x: stage >= i ? 1 : reading && i == 1 ? 0.5 : 0, anchor: .leading)
                    }
                    .frame(height: 3)
                    .padding(.top, 20)
                    .padding(.horizontal, -8)
                }
                step(i, s.icon, s.label)
            }
        }
        .animation(Springs.smooth, value: stage)
        .animation(Springs.smooth, value: reading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(stage + 1) of 3: \(steps[stage].label)")
    }

    private func step(_ i: Int, _ icon: String, _ label: String) -> some View {
        let passed = stage > i || (stage == 2 && i == 2)
        let current = stage == i && !passed
        return VStack(spacing: 8) {
            ZStack {
                Circle().fill(passed ? FW.Palette.positive : current ? FW.Palette.accent : FW.Palette.surface2)
                Image(systemName: passed ? "checkmark" : icon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(passed ? FW.Palette.raised : current ? FW.Palette.onAccent : FW.Palette.text3)
                    .contentTransition(.symbolEffect(.replace))
            }
            .frame(width: 42, height: 42)
            .scaleEffect(current ? 1.06 : 1)
            Text(label)
                .font(.sans(12, current ? .semibold : .medium))
                .foregroundStyle(current || passed ? FW.Palette.text : FW.Palette.text3)
                .lineLimit(1)
                .fixedSize()
        }
        .frame(width: 84)
    }
}

// A turning arc while a file is being read. Still under Reduce Motion.
private struct ImportSpinner: View {
    let color: Color
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var turn = false

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.7)
            .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
            .frame(width: 40, height: 40)
            .rotationEffect(.degrees(turn ? 360 : 0))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) { turn = true }
            }
            .accessibilityHidden(true)
    }
}

// The finished mark: a tick that springs in once, with a ring spreading out.
private struct ImportDoneMark: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(FW.Palette.positive.opacity(shown ? 0 : 0.5), lineWidth: 2)
                .scaleEffect(shown && !reduceMotion ? 1.6 : 1)
            Circle().fill(FW.Palette.positive)
                .scaleEffect(shown || reduceMotion ? 1 : 0.4)
            Image(systemName: "checkmark")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(FW.Palette.raised)
                .symbolEffect(.bounce, value: shown)
                .opacity(shown ? 1 : 0)
        }
        .frame(width: 84, height: 84)
        .onAppear { withAnimation(Springs.bouncy.delay(0.15)) { shown = true } }
        .accessibilityHidden(true)
    }
}

struct ImportDiff: Decodable, Sendable {
    var added: Int
    var changed: Int
    var removed: Int
}

private struct ImportPreview: Decodable, Sendable {
    var plan: JSON
    var diff: ImportDiff?
    var uncertain: [String]
    private enum K: String, CodingKey { case plan, diff, uncertain }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        plan = try c.decode(JSON.self, forKey: .plan)
        diff = c.lenient(ImportDiff.self, .diff)
        uncertain = c.lenient([String].self, .uncertain) ?? []
    }
}

private struct ImportActivated: Decodable, Sendable { var state: JSON }

// A file dragged in from Files or another app.
private struct ImportDroppedFile: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .data) { received in
            let copy = URL.temporaryDirectory.appending(path: received.file.lastPathComponent)
            try? FileManager.default.removeItem(at: copy)
            try FileManager.default.copyItem(at: received.file, to: copy)
            return ImportDroppedFile(url: copy)
        }
    }
}

// The empty template (src/lib/seed.ts EMPTY_TEMPLATE), as the web downloads it.
private let importTemplate = """
{
  "schema_version": "1.0",
  "plan_id": "my-education-plan",
  "title": "My education and growth",
  "start_date": "2026-09-28",
  "end_date": "2027-06-05",
  "profile": {
    "name": "Your name",
    "timezone": "America/Los_Angeles",
    "goals": [
      "Your first useful outcome"
    ],
    "preferences": {}
  },
  "schedule": {
    "weekdays": [
      0,
      1,
      2,
      3
    ],
    "start_local": "10:00",
    "end_local": "11:00",
    "timezone": "America/Los_Angeles"
  },
  "sources": [],
  "weeks": [
    {
      "id": "w01",
      "start_date": "2026-09-28",
      "mode": "standard",
      "topics": {
        "monday": "Your first topic"
      },
      "evidence": "A short explanation"
    }
  ],
  "sessions": [
    {
      "id": "w01-first",
      "date": "2026-09-28",
      "start_local": "10:00",
      "duration_minutes": 20,
      "optional": false,
      "subject": "your subject",
      "title": "Your first topic",
      "objective": "One clear skill",
      "evidence": "Explain your reasoning",
      "source_ids": [],
      "prerequisite_ids": [],
      "generation_instructions": "Find topic-specific primary sources before teaching."
    }
  ],
  "adaptation": {
    "recovery_minutes": 20,
    "review_cap_minutes": 10
  },
  "milestones": []
}
"""
