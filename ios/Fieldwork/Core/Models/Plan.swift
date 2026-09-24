import Foundation

// Plan types (src/lib/plan.ts, src/lib/rolling.ts) for Learn, You and Import.
// Decoded leniently from `store.plan` (docs/API.md §3.3): every field falls
// back on its own, so an older or partial plan still shows. Nested so the
// generic names (Session, Track, Topic) never collide with other modules.
struct Plan: Decodable, Sendable {
    var plan_id: String
    var title: String
    var start_date: String
    var end_date: String
    var profile: Profile
    var schedule: Schedule
    var weeks: [Week]
    var sessions: [Session]
    var milestones: [Milestone]
    var horizon: Horizon?

    struct Profile: Decodable, Sendable {
        var name: String
        var timezone: String
        var goals: [String]
    }

    struct Schedule: Decodable, Sendable {
        var weekdays: [Int]
        var start_local: String
        var end_local: String
        var timezone: String
        var travel_window: Travel?
    }

    struct Travel: Decodable, Sendable {
        var start: String
        var end: String
        var dates_confirmed: Bool
    }

    // The v1 week list (dated plans; kept in step for rolling ones).
    struct Week: Decodable, Sendable, Identifiable {
        var id: String
        var start_date: String
        var mode: String
        var topics: [String: String]
        var evidence: String
    }

    struct Session: Decodable, Sendable, Identifiable, Hashable {
        var id: String
        var date: String
        var start_local: String
        var duration_minutes: Int
        var optional: Bool
        var subject: String
        var title: String
        var objective: String
        var evidence: String
        var added: Bool
        var why: String?
    }

    struct Topic: Decodable, Sendable, Identifiable, Hashable {
        var id: String
        var title: String
        var objective: String
        var evidence: String
        var minutes: Int?
        var added: Bool
    }

    struct Track: Decodable, Sendable, Identifiable, Hashable {
        var id: String
        var title: String
        var why: String
        var goals: [String]
        var status: String // active, paused
        var backlog: [Topic]
        var paused: Bool { status == "paused" }
    }

    struct Suggestion: Decodable, Sendable, Hashable {
        var extra: Int
        var track: String?
        var why: String
    }

    struct WeekMeta: Decodable, Sendable, Hashable {
        var start: String
        var status: String // draft, active, done
        var origin: String
        var note: String?
        var steer: String?
        var suggestion: Suggestion?
        var planned: Int?
        var done: Int?
    }

    struct Rhythm: Decodable, Sendable {
        var days: [String: String] // "0" (Monday) … "6" → track id
        var minutes: Int
        var start_local: String
    }

    struct Horizon: Decodable, Sendable {
        var rhythm: Rhythm
        var tracks: [Track]
        var weeks: [WeekMeta]
    }

    struct Milestone: Decodable, Sendable, Hashable {
        var date: String
        var title: String
    }
}

// MARK: - Lenient decoding

private struct PlanMaybe<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

private struct PlanKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
    init(_ s: String) { stringValue = s }
}

private extension KeyedDecodingContainer where Key == PlanKey {
    func str(_ k: String, _ fallback: String = "") -> String { lenient(String.self, PlanKey(k)) ?? fallback }
    func optStr(_ k: String) -> String? { lenient(String.self, PlanKey(k)) }
    func int(_ k: String) -> Int? { lenient(Double.self, PlanKey(k)).flatMap { $0.isFinite ? Int($0.rounded()) : nil } }
    func bool(_ k: String, _ fallback: Bool = false) -> Bool { lenient(Bool.self, PlanKey(k)) ?? fallback }
    func list<T: Decodable>(_ k: String, _ t: T.Type) -> [T] {
        // One malformed item drops that item, not the list.
        (lenient([PlanMaybe<T>].self, PlanKey(k)) ?? []).compactMap(\.value)
    }
    func item<T: Decodable>(_ k: String, _ t: T.Type) -> T? { lenient(T.self, PlanKey(k)) }
}

extension Plan {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        // A plan without a title or dates isn't a plan.
        guard let title = c.optStr("title"), let start = c.optStr("start_date") else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Not a plan"))
        }
        plan_id = c.str("plan_id")
        self.title = title
        start_date = start
        end_date = c.str("end_date", start)
        profile = c.item("profile", Profile.self) ?? Profile(name: "", timezone: "", goals: [])
        schedule = c.item("schedule", Schedule.self) ?? Schedule(weekdays: [], start_local: "10:00", end_local: "11:00", timezone: "", travel_window: nil)
        weeks = c.list("weeks", Week.self)
        sessions = c.list("sessions", Session.self)
        milestones = c.list("milestones", Milestone.self)
        horizon = c.item("horizon", Horizon.self)
    }
}

extension Plan.Profile {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        name = c.str("name")
        timezone = c.str("timezone")
        goals = c.lenient([String].self, PlanKey("goals")) ?? []
    }
}

extension Plan.Schedule {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        weekdays = (c.lenient([Double].self, PlanKey("weekdays")) ?? []).map { Int($0) }
        start_local = c.str("start_local", "10:00")
        end_local = c.str("end_local", "11:00")
        timezone = c.str("timezone")
        travel_window = c.item("travel_window", Plan.Travel.self)
    }
}

extension Plan.Travel {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        start = c.str("start")
        end = c.str("end")
        dates_confirmed = c.bool("dates_confirmed", true)
    }
}

extension Plan.Week {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        guard let id = c.optStr("id"), let start = c.optStr("start_date") else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Week"))
        }
        self.id = id
        start_date = start
        mode = c.str("mode", "standard")
        topics = c.lenient([String: String].self, PlanKey("topics")) ?? [:]
        evidence = c.str("evidence")
    }
}

extension Plan.Session {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        guard let id = c.optStr("id"), let date = c.optStr("date") else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Session"))
        }
        self.id = id
        self.date = date
        start_local = c.str("start_local", "10:00")
        duration_minutes = c.int("duration_minutes") ?? 30
        optional = c.bool("optional")
        subject = c.str("subject", "general")
        title = c.str("title", "Session")
        objective = c.str("objective")
        evidence = c.str("evidence")
        added = c.bool("added")
        why = c.optStr("why").flatMap { $0.isEmpty ? nil : $0 }
    }
}

extension Plan.Topic {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        guard let id = c.optStr("id") else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Topic"))
        }
        self.id = id
        title = c.str("title", "Topic")
        objective = c.str("objective")
        evidence = c.str("evidence")
        minutes = c.int("minutes")
        added = c.bool("added")
    }
}

extension Plan.Track {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        guard let id = c.optStr("id") else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Track"))
        }
        self.id = id
        title = c.str("title", id)
        why = c.str("why")
        goals = c.lenient([String].self, PlanKey("goals")) ?? []
        status = c.str("status", "active")
        backlog = c.list("backlog", Plan.Topic.self)
    }
}

extension Plan.Suggestion {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        extra = max(1, c.int("extra") ?? 1)
        track = c.optStr("track")
        why = c.str("why")
    }
}

extension Plan.WeekMeta {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        guard let start = c.optStr("start") else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "WeekMeta"))
        }
        self.start = start
        status = c.str("status", "active")
        origin = c.str("origin", "planner")
        note = c.optStr("note").flatMap { $0.isEmpty ? nil : $0 }
        steer = c.optStr("steer")
        suggestion = c.item("suggestion", Plan.Suggestion.self)
        planned = c.int("planned")
        done = c.int("done")
    }
}

extension Plan.Rhythm {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        days = c.lenient([String: String].self, PlanKey("days")) ?? [:]
        minutes = c.int("minutes") ?? 60
        start_local = c.str("start_local", "10:00")
    }
}

extension Plan.Horizon {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        guard let rhythm = c.item("rhythm", Plan.Rhythm.self) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Horizon"))
        }
        self.rhythm = rhythm
        tracks = c.list("tracks", Plan.Track.self)
        weeks = c.list("weeks", Plan.WeekMeta.self)
    }
}

extension Plan.Milestone {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: PlanKey.self)
        guard let date = c.optStr("date") else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Milestone"))
        }
        self.date = date
        title = c.str("title")
    }
}

// MARK: - Reading a plan (src/lib/rolling.ts)

extension Plan {
    // A plan that runs a week at a time (every plan imported now).
    var isRolling: Bool { horizon != nil }

    // Learning days in weekday order: 0 = Monday.
    var slots: [(day: Int, track: String)] {
        guard let h = horizon else { return [] }
        return h.rhythm.days.compactMap { k, v in Int(k).map { (day: $0, track: v) } }
            .filter { (0...6).contains($0.day) }
            .sorted { $0.day < $1.day }
    }

    func trackTitle(_ id: String) -> String {
        horizon?.tracks.first { $0.id == id }?.title ?? id
    }

    func track(_ id: String) -> Track? { horizon?.tracks.first { $0.id == id } }

    // "Mon Finance · Wed Communication".
    var rhythmSummary: String {
        slots.map { "\(PlanDate.short($0.day)) \(trackTitle($0.track))" }.joined(separator: " · ")
    }

    func weekMeta(_ start: String) -> WeekMeta? { horizon?.weeks.first { $0.start == start } }

    func weekSessions(_ start: String) -> [Session] {
        let end = PlanDate.weekEnd(start)
        return sessions.filter { $0.date >= start && $0.date <= end }.sorted { $0.date < $1.date }
    }

    // The week a rolling plan is on now (its first week before it starts).
    func currentWeek(today: String) -> String {
        PlanDate.weekOf(today < start_date ? start_date : today)
    }
}

// Dates as the web handles them: plain YYYY-MM-DD strings, weeks from Monday.
enum PlanDate {
    static let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    static func short(_ day: Int) -> String { String(dayNames[((day % 7) + 7) % 7].prefix(3)) }

    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = format
        return f
    }

    static func date(_ s: String) -> Date? { formatter("yyyy-MM-dd").date(from: String(s.prefix(10))) }
    static func string(_ d: Date) -> String { formatter("yyyy-MM-dd").string(from: d) }

    static func addDays(_ s: String, _ n: Int) -> String {
        guard let d = date(s), let next = calendar.date(byAdding: .day, value: n, to: d) else { return s }
        return string(next)
    }
    // 0 = Monday … 6 = Sunday.
    static func dayIndex(_ s: String) -> Int {
        guard let d = date(s) else { return 0 }
        return (calendar.component(.weekday, from: d) + 5) % 7
    }
    static func weekOf(_ s: String) -> String { addDays(s, -dayIndex(s)) }
    static func weekEnd(_ start: String) -> String { addDays(start, 6) }
    static func nextWeek(_ s: String) -> String { addDays(weekOf(s), 7) }
    // A week can be reshaped until its Monday is over.
    static func editable(_ start: String, today: String) -> Bool { today <= start }
    static func daysUntil(_ from: String, _ to: String) -> Int {
        guard let a = date(from), let b = date(to) else { return 0 }
        return Int((b.timeIntervalSince(a) / 86400).rounded())
    }

    // "Mon, Sep 28" (web: dateLabel(d)).
    static func label(_ s: String) -> String { date(s).map { formatter("EEE, MMM d").string(from: $0) } ?? s }
    // "Sep 28" (web: dateLabel(d, false)).
    static func monthDay(_ s: String) -> String { date(s).map { formatter("MMM d").string(from: $0) } ?? s }
    // "October 2026".
    static func month(_ s: String) -> String { date(s).map { formatter("MMMM yyyy").string(from: $0) } ?? s }
    // "Sep 28 – Oct 4", or "Sep 28 – 4" inside one month.
    static func range(_ start: String) -> String {
        let end = weekEnd(start)
        let tail = start.prefix(7) == end.prefix(7) ? (date(end).map { formatter("d").string(from: $0) } ?? end) : monthDay(end)
        return "\(monthDay(start)) – \(tail)"
    }
    // "9:45 AM" for "09:45".
    static func clock(_ hm: String) -> String {
        guard let d = time(hm) else { return hm }
        return d.formatted(.dateTime.hour().minute())
    }
    // HH:MM ↔ a Date today (local), for time pickers.
    static func time(_ hm: String) -> Date? {
        let p = hm.split(separator: ":").compactMap { Int($0) }
        guard p.count == 2 else { return nil }
        return Calendar.current.date(bySettingHour: p[0], minute: p[1], second: 0, of: Date())
    }
    static func hm(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}

extension Store {
    // Session ids with a finished attempt (the web's `done` set).
    var planDoneIds: Set<String> {
        Set((state["attempts"]?.array ?? []).compactMap { $0["session_id"]?.string })
    }
    // Decoded once per state change, however many views ask.
    var decodedPlan: Plan? {
        let v = version
        if PlanMemo.version == v, PlanMemo.owner == owner { return PlanMemo.plan }
        let p = try? plan?.decode(Plan.self)
        PlanMemo.version = v
        PlanMemo.owner = owner
        PlanMemo.plan = p
        return p
    }
}

@MainActor private enum PlanMemo {
    static var version = -1
    static var owner: String?
    static var plan: Plan?
}
