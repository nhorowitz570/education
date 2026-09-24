import CoreTransferable
import SwiftUI
import UniformTypeIdentifiers

// Import (src/components/import.tsx): choose a plan file, review how it was
// read, then activate it. Three stages: upload, review, done.
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageHead(
                    eyebrow: "YOUR PLAN, YOUR PACE",
                    title: done ? "Your next chapter is ready." : plan != nil ? "Make sure it feels right." : "Bring your plan to life.",
                    subtitle: nil
                )
                Text(done ? "Start with one useful situation. Everything else can wait."
                     : plan != nil ? "Review the interpretation before it becomes your schedule."
                     : "A ChatGPT plan becomes small, useful steps you can actually start.")
                    .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, -12)

                if done {
                    doneStage
                } else if let plan {
                    review(plan)
                } else {
                    upload
                }
                if let error {
                    Text(error)
                        .font(.sans(14))
                        .foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                        .accessibilityLabel("Error: \(error)")
                }
                context.padding(.top, 14)
            }
            .padding(.horizontal, FW.Size.gutter)
            .padding(.top, 8)
            .padding(.bottom, 48)
            .animation(.easeOut(duration: FW.Motion.base), value: plan == nil)
            .animation(.easeOut(duration: FW.Motion.base), value: done)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("")
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
                VStack(spacing: 6) {
                    ZStack {
                        Circle().fill(FW.Palette.judgment.opacity(0.14))
                        if busy {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.up.doc").font(.system(size: 26)).foregroundStyle(FW.Palette.judgment)
                        }
                    }
                    .frame(width: 64, height: 64)
                    .padding(.bottom, 6)
                    Text(busy ? "Reading your plan…" : "Drop your plan here")
                        .font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    Text("or choose a file").font(.sans(15)).foregroundStyle(FW.Palette.text2)
                    Text("JSON or Markdown · up to 2 MB").font(.sans(12)).foregroundStyle(FW.Palette.text3)
                }
                .frame(maxWidth: .infinity, minHeight: 180)
                .padding(24)
                .background(dropping ? FW.Palette.surface2 : FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.xl))
                .overlay(
                    RoundedRectangle(cornerRadius: FW.Radius.xl)
                        .strokeBorder(dropping ? FW.Palette.text3 : FW.Palette.line3, style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
                )
                .contentShape(.rect(cornerRadius: FW.Radius.xl))
            }
            .buttonStyle(YouPressStyle())
            .disabled(busy)
            .accessibilityLabel("Upload a ChatGPT plan")
            .accessibilityHint("JSON or Markdown, up to 2 MB")
            .dropDestination(for: ImportDroppedFile.self) { items, _ in
                guard let item = items.first else { return false }
                Task { await read(item.url, scoped: false) }
                return true
            } isTargeted: { dropping = $0 }

            ShareLink(item: SharedJSONFile(name: "fieldwork-plan-template.json", data: Data(importTemplate.utf8)), preview: SharePreview("fieldwork-plan-template.json")) {
                Label("Get the empty template", systemImage: "arrow.right").labelStyle(ImportTrailingIcon())
            }
            .buttonStyle(.fw(.secondary))
            Text("Ask ChatGPT to fill this format with your goals, learning dates, weekly topics, and source links.")
                .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Review

    private func review(_ plan: Plan) -> some View {
        let travelUnconfirmed = plan.schedule.travel_window?.dates_confirmed == false
        let needsCheck = !uncertain.isEmpty || travelUnconfirmed
        return VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Plan interpretation")
                    .font(.sans(13)).foregroundStyle(FW.Palette.text2)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 26)
                    .background(FW.Palette.surface2, in: .capsule)
                    .overlay(Capsule().strokeBorder(FW.Palette.line2, lineWidth: 1))
                Text(plan.title).font(.display(26)).foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 14, alignment: .topLeading), GridItem(.flexible(), alignment: .topLeading)], alignment: .leading, spacing: 14) {
                    fact("Starts", PlanDate.label(plan.start_date))
                    fact("Learning rhythm", plan.isRolling ? plan.rhythmSummary : "\(plan.weeks.count) weeks · \(plan.sessions.count) sessions")
                    fact("Time zone", plan.schedule.timezone)
                    fact("Typical window", "\(plan.schedule.start_local) – \(plan.schedule.end_local)")
                }
            }
            .padding(.vertical, 16)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.judgment.opacity(0.10), in: .rect(cornerRadius: FW.Radius.lg))
            .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg))

            if plan.isRolling {
                let first = plan.horizon?.weeks.first { $0.status != "done" }?.start ?? plan.start_date
                callout {
                    Text("Your first week").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(plan.weekSessions(first)) { s in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(PlanDate.dayNames[PlanDate.dayIndex(s.date)]).font(.sans(12)).foregroundStyle(FW.Palette.text3)
                                    .frame(width: 92, alignment: .leading)
                                Text(s.title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                }
                callout {
                    Text("Beyond that, a direction").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    Text("Only the first week is scheduled. Everything else waits in \(plan.horizon?.tracks.count ?? 0) tracks, in the order you wrote it, and each week is drafted on Sunday from what you’ve learned so far. You can change any week until its Monday.")
                        .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                    FlowLayout(spacing: 6) {
                        ForEach(plan.horizon?.tracks ?? []) { t in
                            Text("\(t.title) · \(t.backlog.count) topics")
                                .font(.sans(13)).foregroundStyle(FW.Palette.text2)
                                .lineLimit(1)
                                .padding(.horizontal, 10)
                                .frame(minHeight: 28)
                                .background(FW.Palette.surface2, in: .capsule)
                                .overlay(Capsule().strokeBorder(FW.Palette.line2, lineWidth: 1))
                        }
                    }
                    Text("Completed work stays in your history. Milestones travel with the plan.")
                        .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                callout {
                    Text(store.hasPlan ? "What changes" : "What comes with it").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    Text("\(diff?.added ?? plan.sessions.count) new sessions · \(diff?.changed ?? 0) changed · \(diff?.removed ?? 0) removed from the schedule.")
                        .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if needsCheck {
                VStack(alignment: .leading, spacing: 10) {
                    Text("A few things to check").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(uncertain, id: \.self) { bullet($0) }
                        if travelUnconfirmed, let t = plan.schedule.travel_window {
                            bullet("Travel \(PlanDate.label(t.start)) – \(PlanDate.label(t.end)) is proposed.")
                        }
                    }
                    Button { accepted.toggle() } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Image(systemName: accepted ? "checkmark.square.fill" : "square")
                                .font(.system(size: 18))
                                .foregroundStyle(accepted ? FW.Palette.text : FW.Palette.text3)
                            Text("I reviewed these assumptions.").font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                        }
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(accepted ? .isSelected : [])
                }
                .padding(.vertical, 16)
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(FW.Palette.coral.opacity(0.11), in: .rect(cornerRadius: FW.Radius.lg))
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg))
            }

            Button {
                withAnimation(.snappy(duration: 0.3)) { editing.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Text("Edit the interpreted JSON")
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold))
                        .rotationEffect(.degrees(editing ? 180 : 0))
                }
                .font(.sans(14, .medium))
                .foregroundStyle(FW.Palette.text2)
                .frame(minHeight: 44)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)

            if editing {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Plan JSON").font(.sans(14, .medium)).foregroundStyle(FW.Palette.text2)
                    TextEditor(text: $json)
                        .font(.system(size: 13, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .scrollContentBackground(.hidden)
                        .padding(10)
                        .frame(minHeight: 320)
                        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                        .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line, lineWidth: 1))
                        .accessibilityLabel("Plan JSON")
                    Button("Validate changes") { validate() }
                        .buttonStyle(.fw(.secondary))
                }
                .transition(.opacity)
            }

            FlowLayout(spacing: 8) {
                Button { Task { await activate() } } label: {
                    Label(busy ? "Activating…" : "Activate this plan", systemImage: "arrow.right").labelStyle(ImportTrailingIcon())
                }
                .buttonStyle(.fw(.primary))
                .disabled(busy || editing || (needsCheck && !accepted))
                Button("Choose another file") { reset() }
                    .buttonStyle(.fw(.secondary))
                    .disabled(busy)
            }
        }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.sans(12)).foregroundStyle(FW.Palette.text3)
            Text(value.isEmpty ? "—" : value).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func callout<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10, content: content)
            .padding(.vertical, 16)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.lg))
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("•").foregroundStyle(FW.Palette.text3)
            Text(text).foregroundStyle(FW.Palette.text2).fixedSize(horizontal: false, vertical: true)
        }
        .font(.sans(15))
    }

    // MARK: Done

    private var doneStage: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                Circle().fill(FW.Palette.finance.opacity(0.16))
                Image(systemName: "checkmark").font(.system(size: 20, weight: .semibold)).foregroundStyle(FW.Palette.finance)
            }
            .frame(width: 48, height: 48)
            Text(plan?.title ?? "").font(.display(26)).foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            Text("Your first week is ready · private to your account")
                .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                let tab = router.tab
                router.paths[tab] = NavigationPath()
                router.open("/")
            } label: {
                Label("Go to Today", systemImage: "arrow.right").labelStyle(ImportTrailingIcon())
            }
            .buttonStyle(.fw(.primary))
            .padding(.top, 4)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.xl).strokeBorder(FW.Palette.line, lineWidth: 1))
    }

    // MARK: Context

    private var context: some View {
        let stage = done ? 2 : plan != nil ? 1 : 0
        return VStack(alignment: .leading, spacing: 14) {
            Rule()
            Text("A plan you can live with.").font(.sans(17, .semibold)).foregroundStyle(FW.Palette.text)
                .padding(.top, 8)
            Text("Short lessons. Flexible mornings. Progress that stays.")
                .font(.sans(15)).foregroundStyle(FW.Palette.text2)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(["Upload your plan", "Review the interpretation", "Start your first lesson"].enumerated()), id: \.offset) { i, s in
                    HStack(spacing: 12) {
                        Text("\(i + 1)")
                            .font(.sans(13, .semibold))
                            .foregroundStyle(i == stage ? FW.Palette.finance : FW.Palette.text3)
                            .frame(width: 26, height: 26)
                            .background(i == stage ? FW.Palette.finance.opacity(0.16) : FW.Palette.surface2, in: .circle)
                        Text(s).font(.sans(15)).foregroundStyle(i == stage ? FW.Palette.text : FW.Palette.text2)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(i == stage ? .isSelected : [])
                }
            }
            Text("New versions preserve the original file and your completed work.")
                .font(.sans(13)).foregroundStyle(FW.Palette.text3)
                .fixedSize(horizontal: false, vertical: true)
        }
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

private struct ImportTrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.title; configuration.icon }
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
