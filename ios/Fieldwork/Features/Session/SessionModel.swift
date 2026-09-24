import Foundation
import Observation

// Client state for one run, as src/components/session/use-run.ts keeps it:
// loads the run, generates each step when it's reached, prepares the next
// one in the background, and streams answers and questions into place.
@MainActor @Observable
final class SessionModel {
    struct Live { var partial: [Block] = []; var error: String? }
    struct Grading { var verdict: String?; var blocks: [Block] = [] }
    struct Asking { var prompt: String; var intent: String; var quote: String?; var partial: [Block] = []; var error: String? }

    let id: String
    private(set) var run: RunView?
    var index = 0
    var error: String?
    private(set) var live: [String: Live] = [:]
    private(set) var grading: [String: Grading] = [:]
    private(set) var asking: [String: Asking] = [:]
    private(set) var finishing = false
    private(set) var wrapping = false
    // Active minutes, in step with the server's clock: each interaction adds
    // the time since the last one, capped so stepping away doesn't count.
    private(set) var clock: (elapsed: Double, at: Date?) = (0, nil)
    // Became done while open here, so the end screen celebrates.
    private(set) var finishedHere = false

    private var inflight: [String: Task<Void, Never>] = [:]
    private var prefetch: Task<Void, Never>?
    private static let idle: TimeInterval = 12 * 60

    init(id: String) {
        self.id = id
        if let r = RunCache.take(id) {
            run = r
            index = min(r.cursor, max(r.beats.count - 1, 0))
            clock = (r.elapsed ?? 0, .now)
        }
    }

    var current: Beat? { run?.beats[safe: index] }

    // MARK: Loading and generating

    @discardableResult
    func load() async -> RunView? {
        struct R: Decodable { let run: RunView }
        do {
            let r: R = try await API.get("/api/runs/\(id)")
            let first = run == nil
            run = r.run
            if first || index == 0 { index = min(r.run.cursor, max(r.run.beats.count - 1, 0)) }
            clock = (r.run.elapsed ?? 0, .now)
            return r.run
        } catch {
            if run == nil { self.error = error.localizedDescription }
            return nil
        }
    }

    func start() async {
        if run == nil { await load() } else { Task { await load() } }
        focus()
    }

    // Generate the focused step; once it has content, prepare the next one.
    func focus() {
        guard let run, let current else { return }
        ensure(current.id)
        prefetch?.cancel()
        guard current.hasContent else { return }
        if let upcoming = run.beats.dropFirst(index + 1).first(where: { $0.type != "break" }), !upcoming.hasContent, upcoming.optional != true {
            let delay = ["situation", "orient", "explain", "worked", "recap"].contains(current.type) ? 0.3 : 0.9
            prefetch = Task { [weak self] in
                try? await Task.sleep(for: .seconds(delay))
                guard !Task.isCancelled else { return }
                self?.ensure(upcoming.id)
            }
        }
    }

    func ensure(_ beatId: String) {
        guard let beat = beat(beatId), !beat.hasContent, inflight[beatId] == nil else { return }
        live[beatId] = Live()
        inflight[beatId] = Task { [weak self] in
            guard let self else { return }
            defer { self.inflight[beatId] = nil }
            for attempt in 0... {
                do {
                    let done = try await API.stream("/api/runs/\(id)", Body.Beat(beatId: beatId), handlers: .init(onSnap: { [weak self] d in
                        self?.live[beatId] = Live(partial: Block.list(d["blocks"]))
                    }))
                    if let b = try? done.decode(Beat.self) { self.replace(b) }
                    self.live[beatId] = nil
                    self.focus()
                    return
                } catch is CancellationError {
                    return
                } catch let e as APIError where e.status == 425 && attempt < 20 {
                    // Another request is preparing this step: wait for it.
                    try? await Task.sleep(for: .seconds(1.5))
                    let fresh = await self.load()
                    if fresh?.beats.first(where: { $0.id == beatId })?.hasContent == true {
                        self.live[beatId] = nil
                        self.focus()
                        return
                    }
                } catch {
                    self.live[beatId] = Live(partial: self.live[beatId]?.partial ?? [], error: error.localizedDescription)
                    return
                }
            }
        }
    }

    func retry(_ beatId: String) {
        live[beatId] = nil
        ensure(beatId)
    }

    // MARK: Answering

    func answer(_ beatId: String, choice: Int? = nil, text: String? = nil, confidence: Confidence? = nil, unknown: Bool = false, retry: Bool = false) async {
        let before = beat(beatId)
        touch()
        patch(beatId) { b in
            if retry, let r = b.response, let f = b.feedback {
                b.attempts = (b.attempts ?? []) + [.init(response: r, feedback: f)]
                b.feedback = nil
            }
            b.response = Response(choice: choice, text: text, confidence: confidence?.rawValue, unknown: unknown ? true : nil, at: Stamp.now())
            b.status = "answered"
        }
        grading[beatId] = Grading()
        defer { grading[beatId] = nil }
        do {
            let done = try await API.stream("/api/runs/\(id)", Body.Answer(beatId: beatId, choice: choice, text: text, confidence: confidence?.rawValue, unknown: unknown, retry: retry), handlers: .init(
                onSnap: { [weak self] d in
                    guard let f = d["feedback"] else { return }
                    self?.grading[beatId] = Grading(verdict: f["verdict"]?.string, blocks: Block.list(f["blocks"]))
                },
                onPlan: { [weak self] d in
                    if let beats = try? d.decode([Beat].self) { self?.merge(beats) }
                }
            ))
            if let b = try? done.decode(Beat.self) { replace(b) }
            if let f = beat(beatId)?.feedback {
                Feedback.shared.play(unknown ? .partial : f.verdict == "solid" ? .solid : f.verdict == "partial" ? .partial : .missed)
            }
        } catch {
            patch(beatId) { b in
                if retry, let before {
                    b.response = before.response; b.feedback = before.feedback; b.attempts = before.attempts; b.status = before.status
                } else {
                    b.response = nil; b.status = "ready"
                }
            }
            self.error = error.localizedDescription
        }
        focus()
    }

    func gauge(_ beatId: String, _ value: Gauge) async {
        struct R: Decodable { let cursor: Int; let beats: [Beat] }
        patch(beatId) { $0.status = "done"; $0.response = Response(gauge: value.rawValue, at: Stamp.now()) }
        touch()
        Feedback.shared.play(.tap)
        do {
            let r: R = try await API.post("/api/runs/\(id)", Body.Gauge(beatId: beatId, value: value.rawValue))
            merge(r.beats)
            if let at = r.beats.firstIndex(where: { $0.id == beatId }), at + 1 < r.beats.count { index = at + 1 }
        } catch {
            patch(beatId) { $0.status = "ready"; $0.response = nil }
            self.error = error.localizedDescription
        }
        focus()
    }

    func ask(_ beatId: String, intent: String, prompt: String = "", quote: String? = nil) async {
        touch()
        asking[beatId] = Asking(prompt: prompt, intent: intent, quote: quote)
        do {
            let done = try await API.stream("/api/runs/\(id)", Body.Ask(beatId: beatId, intent: intent, prompt: prompt, quote: quote), handlers: .init(onSnap: { [weak self] d in
                self?.asking[beatId]?.partial = Block.list(d["blocks"])
            }))
            if let a = try? done.decode(Ask.self) { patch(beatId) { $0.asks = ($0.asks ?? []) + [a] } }
            asking[beatId] = nil
        } catch {
            asking[beatId]?.error = error.localizedDescription
            asking[beatId]?.partial = []
        }
    }

    func dismissAsk(_ beatId: String) { asking[beatId] = nil }

    // MARK: Moving on

    func next(skip: Bool = false) async {
        struct R: Decodable { let cursor: Int; let beats: [Beat]? }
        guard let run, let beat = current else { return }
        patch(beat.id) { $0.status = skip ? "skipped" : "done" }
        touch()
        let known = index + 1 < run.beats.count
        if known { index += 1 }
        focus()
        do {
            let r: R = try await API.post("/api/runs/\(id)", Body.Advance(beatId: beat.id, skip: skip))
            if let beats = r.beats { merge(beats) }
            if !known, let beats = r.beats, beats.count > index + 1 { index += 1 }
            focus()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Skip what's left and go to the wrap-up.
    func wrap() async {
        struct R: Decodable { let beats: [Beat] }
        guard let beat = current else { return }
        wrapping = true
        defer { wrapping = false }
        do {
            let r: R = try await API.post("/api/runs/\(id)", Body.Wrap(beatId: beat.id))
            merge(r.beats)
            run?.wrapping = true
            if let recap = r.beats.indices.first(where: { $0 > index && r.beats[$0].type == "recap" }),
               beat.question == nil || beat.feedback != nil || beat.type == "recap" {
                let _: JSON = try await API.post("/api/runs/\(id)", Body.Advance(beatId: beat.id, skip: beat.question != nil && beat.feedback == nil))
                index = recap
                focus()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func finish() async {
        guard let beat = current else { return }
        finishing = true
        defer { finishing = false }
        do {
            if beat.status != "done" { let _: JSON = try await API.post("/api/runs/\(id)", Body.Advance(beatId: beat.id, skip: false)) }
            let _: JSON = try await API.post("/api/runs/\(id)", ["action": "finish"])
            finishedHere = true
            run?.status = "done"
            Feedback.shared.play(.complete)
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Leaving an exploration once something was answered finishes it, so
    // what it showed about the learner is remembered.
    func leave() {
        guard let run, run.kind == "explore", run.status == "active",
              run.beats.contains(where: { ["ready", "answered", "done"].contains($0.status) }) else { return }
        Task { let _: JSON? = try? await API.post("/api/runs/\(id)", ["action": "finish"]) }
    }

    func startBreak(_ beatId: String) async -> Date? {
        struct R: Decodable { let until: String }
        let r: R? = try? await API.post("/api/runs/\(id)/break", ["beatId": beatId])
        return Stamp.parse(r?.until)
    }

    func cancelAll() {
        inflight.values.forEach { $0.cancel() }
        prefetch?.cancel()
    }

    // MARK: Derived

    // Ready to move on from the step on screen.
    func ready(_ b: Beat) -> Bool {
        if b.type == "break" { return true }
        if b.type == "gauge" { return b.response?.gauge != nil }
        if !b.hasContent || grading[b.id] != nil || asking[b.id] != nil { return false }
        if b.question != nil { return b.feedback != nil }
        return true
    }

    var elapsed: Double {
        guard let at = clock.at else { return run?.elapsed ?? 0 }
        return clock.elapsed + min(Date.now.timeIntervalSince(at), Self.idle) / 60
    }

    // What is actually left (src/lib/learning/duration.ts minutesLeft).
    var minutesLeft: Int {
        guard let run else { return 0 }
        let beats = run.beats
        let done = beats.prefix(index).filter { $0.type != "break" && $0.status != "skipped" }
        let expected = done.reduce(0) { $0 + ($1.minutes ?? 0) }
        let pace = expected >= 6 ? min(2, max(0.5, elapsed / expected)) : 1
        let ahead = beats.dropFirst(index).filter { !($0.optional == true && $0.status == "pending") && $0.status != "skipped" }
        let committed = ahead.enumerated().reduce(0.0) { n, e in
            n + (e.element.minutes ?? 0) * (e.element.type == "break" ? 1 : pace) * (e.offset == 0 ? 0.5 : 1)
        }
        let planned = run.wrapping == true || beats.contains { $0.type == "recap" }
        let budget = run.minutes_planned ?? 60
        return max(0, Int((planned ? committed : max(committed, budget - elapsed)).rounded()))
    }

    // Solid answers in a row, ending at this one.
    func combo(_ beatId: String) -> Int {
        let graded = (run?.beats ?? []).filter { $0.feedback != nil }
        guard let at = graded.firstIndex(where: { $0.id == beatId }) else { return 0 }
        var n = 0
        var j = at
        while j >= 0, graded[j].feedback?.verdict == "solid" { n += 1; j -= 1 }
        return n
    }

    // MARK: Internals

    func beat(_ id: String) -> Beat? { run?.beats.first { $0.id == id } }

    private func patch(_ beatId: String, _ change: (inout Beat) -> Void) {
        guard let i = run?.beats.firstIndex(where: { $0.id == beatId }) else { return }
        change(&run!.beats[i])
    }

    private func replace(_ b: Beat) {
        guard let i = run?.beats.firstIndex(where: { $0.id == b.id }) else { return }
        run!.beats[i] = b
    }

    // The server's plan decides which steps exist; what this client already
    // has (content streamed in, an answer in flight) is kept.
    private func merge(_ server: [Beat]) {
        guard var r = run else { return }
        let order = ["pending", "generating", "ready", "answered", "done", "skipped"]
        let rank = { (s: String) in order.firstIndex(of: s) ?? 0 }
        let mine = Dictionary(r.beats.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        r.beats = server.map { b in
            guard var m = mine[b.id] else { return b }
            if m.feedback == nil, b.feedback != nil { m.feedback = b.feedback }
            if m.blocks == nil { m.blocks = b.blocks; m.question = b.question; m.follow_ups = b.follow_ups }
            if m.correct_index == nil { m.correct_index = b.correct_index }
            if m.practice == nil { m.practice = b.practice }
            m.status = rank(m.status) >= rank(b.status) ? m.status : b.status
            return m
        }
        run = r
    }

    private func touch() {
        let now = Date.now
        guard let at = clock.at else { clock = (clock.elapsed, now); return }
        clock = (clock.elapsed + min(now.timeIntervalSince(at), Self.idle) / 60, now)
    }

    private enum Body {
        struct Beat: Encodable { let action = "beat"; let beatId: String }
        struct Answer: Encodable {
            let action = "answer"; let beatId: String; let choice: Int?; let text: String?; let confidence: String?; let unknown: Bool; let retry: Bool
        }
        struct Gauge: Encodable { let action = "gauge"; let beatId: String; let value: String }
        struct Ask: Encodable { let action = "ask"; let beatId: String; let intent: String; let prompt: String; let quote: String? }
        struct Advance: Encodable { let action = "advance"; let beatId: String; let skip: Bool }
        struct Wrap: Encodable { let action = "wrap"; let beatId: String }
    }
}
