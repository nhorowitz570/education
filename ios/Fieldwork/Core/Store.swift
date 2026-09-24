import Foundation
import Observation
import WidgetKit

// The synced workspace, as useWorkspace() keeps it on the web
// (src/lib/client/workspace.ts): GET /api/state for the whole state, and
// commands to /api/actions. Records (settings, prefs) apply optimistically
// and queue on the device until the server is reachable; plan edits need a
// connection and take the server's result. The state is cached per account
// so the app opens instantly.
@MainActor @Observable
final class Store {
    private(set) var owner: String?
    private(set) var state: JSON = .object([:])
    private(set) var prefs = Prefs()
    private(set) var ready = false
    private(set) var pending = 0
    var error: String?
    // Bumped after anything that changes what Today shows.
    private(set) var version = 0

    private var queue: [JSON] = []
    private var syncing = false

    var records: [JSON] { state["records"]?.array ?? [] }
    var plan: JSON? { state["plan"].flatMap { $0.isNull ? nil : $0 } }
    var hasPlan: Bool { plan != nil }
    func record(_ id: String) -> JSON? { records.first { $0["id"]?.string == id } }

    // "Today" in the learner's timezone, as the server computes it.
    var zone: TimeZone {
        record("settings:device")?["data"]?["timezone"]?.string.flatMap(TimeZone.init(identifier:)) ?? .current
    }
    var today: String { Day.string(Date(), in: zone) }

    func open(owner: String) async {
        if self.owner != owner {
            self.owner = owner
            Owner.id = owner
            state = .object([:])
            queue = []
            ready = false
            if let cached = Disk.read(JSON.self, "state", owner: owner) { apply(cached) }
            queue = Disk.read([JSON].self, "queue", owner: owner) ?? []
            pending = queue.count
            ready = true
        }
        await sync()
        // The device reports its timezone so greetings, reminders and streaks
        // follow the learner (src/lib/zone.ts).
        let zone = TimeZone.current.identifier
        if record("settings:device")?["data"]?["timezone"]?.string != zone {
            await saveRecord(kind: "settings", id: "settings:device", data: ["timezone": .string(zone)])
        }
    }

    func refresh() async { await sync() }

    func sync() async {
        guard let owner, !syncing else { return }
        syncing = true
        defer { syncing = false }
        do {
            while let command = queue.first {
                do {
                    let result: StateResponse = try await API.post("/api/actions", command)
                    guard result.ownerId == owner else { throw APIError(message: "Your account changed. Reopen the app before syncing.", status: 409) }
                    dequeue(command)
                    apply(replay(result.state))
                } catch let e as APIError where !(e.status == 0 || e.status == 409 || e.status == 429 || e.status >= 500) {
                    // A change the server permanently rejects must not block
                    // every later change.
                    dequeue(command)
                    error = "One change couldn’t be saved and was set aside: \(e.message)"
                }
            }
            let fresh: StateResponse = try await API.get("/api/state")
            guard fresh.ownerId == owner else { return }
            apply(replay(fresh.state))
            if error?.hasPrefix("One change") != true { error = nil }
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Saves a record (settings, prefs, memory, draft) with the web's shape.
    func saveRecord(kind: String, id: String, data: [String: JSON]) async {
        let command: JSON = .object([
            "type": .string("record"),
            "eventId": .string(UUID().uuidString.lowercased()),
            "record": .object([
                "id": .string(id), "kind": .string(kind), "data": .object(data),
                "updated_at": .string(Stamp.now()),
            ]),
        ])
        enqueue(command)
        apply(optimistic(state, command))
        await sync()
    }

    func setPrefs(_ change: (inout Prefs) -> Void) {
        var next = prefs
        change(&next)
        guard next != prefs, let data = try? JSON.from(next).object else { return }
        prefs = next
        Task { await saveRecord(kind: "settings", id: Prefs.record, data: data) }
    }

    // A plan edit (swap, remove, add, steer, rhythm…). Needs the server,
    // which applies the edit with its own date and returns the new state.
    func planEdit(_ edit: [String: JSON]) async throws {
        let command: JSON = .object([
            "type": .string("plan-edit"),
            "eventId": .string(UUID().uuidString.lowercased()),
            "today": .string(today),
            "edit": .object(edit),
        ])
        let result: StateResponse = try await API.post("/api/actions", command)
        apply(replay(result.state))
    }

    // Replaces the state from a route that returns it (import, runs).
    func adopt(_ next: JSON) { apply(replay(next)) }

    func signOut() {
        if let owner { Disk.clear(owner: owner) }
        owner = nil
        Owner.id = nil
        state = .object([:])
        queue = []
        pending = 0
        prefs = Prefs()
        ready = false
    }

    // MARK: - Internals

    private struct StateResponse: Decodable { let state: JSON; let ownerId: String }

    private func apply(_ next: JSON) {
        state = next
        let p = Prefs(json: record(Prefs.record)?["data"])
        if p != prefs { prefs = p }
        Feedback.shared.soundOn = prefs.sound
        version += 1
        if let owner { Disk.write(next, "state", owner: owner) }
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func enqueue(_ c: JSON) {
        queue.append(c)
        pending = queue.count
        if let owner { Disk.write(queue, "queue", owner: owner) }
    }

    private func dequeue(_ c: JSON) {
        queue.removeAll { $0["eventId"] == c["eventId"] }
        pending = queue.count
        if let owner { Disk.write(queue, "queue", owner: owner) }
    }

    private func replay(_ base: JSON) -> JSON { queue.reduce(base, optimistic) }

    // The part of applyCommand() the phone mirrors locally: records.
    private func optimistic(_ s: JSON, _ c: JSON) -> JSON {
        guard var o = s.object else { return s }
        var records = o["records"]?.array ?? []
        switch c["type"]?.string {
        case "record":
            guard let r = c["record"], let id = r["id"]?.string else { return s }
            if let existing = records.first(where: { $0["id"]?.string == id }),
               (existing["updated_at"]?.string ?? "") > (r["updated_at"]?.string ?? "") { return s }
            records.removeAll { $0["id"]?.string == id }
            records.append(r)
        case "delete-record":
            records.removeAll { $0["id"] == c["id"] }
        default: return s
        }
        o["records"] = .array(records)
        return .object(o)
    }
}

// Per-account files in Application Support, cleared on sign-out.
enum Disk {
    private static func url(_ name: String, owner: String) -> URL {
        let dir = URL.applicationSupportDirectory.appending(path: "accounts/\(owner)", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appending(path: name + ".json")
    }
    static func read<T: Decodable>(_ type: T.Type, _ name: String, owner: String) -> T? {
        guard let data = try? Data(contentsOf: url(name, owner: owner)) else { return nil }
        return try? JSONDecoder.api.decode(T.self, from: data)
    }
    static func write(_ value: some Encodable, _ name: String, owner: String) {
        guard let data = try? JSONEncoder.api.encode(value) else { return }
        try? data.write(to: url(name, owner: owner), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func clear(owner: String) {
        try? FileManager.default.removeItem(at: URL.applicationSupportDirectory.appending(path: "accounts/\(owner)"))
    }
}

enum Day {
    static func string(_ date: Date, in zone: TimeZone) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = zone
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    static func date(_ s: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: String(s.prefix(10)))
    }
}

// Record timestamps are compared as strings on the server, so they are
// always UTC with milliseconds and a Z, like Date.toISOString().
enum Stamp {
    static func now() -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: Date())
    }
    static func parse(_ s: String?) -> Date? {
        guard let s else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        // Postgres: microseconds and +00:00.
        let trimmed = s.replacingOccurrences(of: #"\.(\d{3})\d+"#, with: ".$1", options: .regularExpression)
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: trimmed)
    }
}
