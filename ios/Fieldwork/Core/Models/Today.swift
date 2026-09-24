import Foundation

// GET /api/today (src/lib/learning/today.ts) and GET /api/progress
// (src/lib/gamify.ts). See docs/API.md §7.4 and §8.2.

struct TodayResponse: Decodable, Sendable {
    var today: TodayModel
    var date: String
    var mapped: Bool?
    var insight: Insight?
    var exploring: Exploring?
    var recap: Recap?
    var memories: Memories?

    struct Insight: Decodable, Sendable { var id: String; var headline: String }
    struct Exploring: Decodable, Sendable { var id: String; var title: String }
    struct Recap: Decodable, Sendable { var minutes: Int; var sessions: Int; var answers: Int; var ideas: [String]; var more: Int }
    struct Memories: Decodable, Sendable { var fresh: Int }
}

struct TodayAction: Codable, Hashable, Sendable {
    var kind: String // resume, session, review, return, explore, practice, rehearsal
    var label: String
    var detail: String
    var sessionId: String?
    var milestone: String?
    var runId: String?
    var minutes: Double?
    var track: String?
}

struct DayMark: Decodable, Hashable, Sendable {
    var date: String
    var weekday: String
    var status: String // done, planned, today, missed, open, skipped, travel, reduced, rest
    var track: String?
    var title: String?
}

struct TodayModel: Decodable, Sendable {
    var phase: String // no-plan, before-start, learning-day, rest-day, done-today, after-end
    var greeting: String?
    var headline: String
    var why: String
    var primary: TodayAction?
    var secondary: [TodayAction]
    var week: Week?
    var focus: Focus?
    var due: Due?
    var milestone: Milestone?
    var startsIn: Int?
    var next: Next?

    struct Week: Decodable, Sendable { var index: Int; var total: Int; var days: [DayMark]; var done: Int; var planned: Int }
    struct Focus: Decodable, Sendable { var title: String; var subject: String; var objective: String; var evidence: String; var date: String; var minutes: Double }
    struct Due: Decodable, Sendable { var count: Int; var minutes: Double }
    struct Milestone: Decodable, Sendable { var title: String; var date: String; var days: Int }
    struct Next: Decodable, Sendable { var start: String; var ready: Bool; var sessions: Int; var note: String? }
}

struct Brief: Codable, Sendable {
    var title: String
    var note: String
    var item_notes: [String?]
}

struct Progress: Decodable, Sendable {
    var xp: Int
    var todayXp: Int
    var level: Int
    var floor: Int?
    var next: Int?
    var into: Int?
    var span: Int?
    var rank: String
    var streak: Streak
    var quests: [Quest]
    var badges: [Badge]

    struct Streak: Decodable, Sendable { var current: Int; var best: Int; var todayDone: Bool; var unit: String }
    struct Quest: Decodable, Sendable, Identifiable { var id: String; var label: String; var target: Int; var progress: Int; var done: Bool; var xp: Int }
    struct Badge: Decodable, Sendable, Identifiable { var id: String; var label: String; var detail: String; var earned: Bool }

    var fraction: Double {
        guard let into, let span, span > 0 else { return 0 }
        return Double(into) / Double(span)
    }
    var toNext: Int { max(0, (next ?? xp) - xp) }
}

// Starting any kind of run, the same body the web sends to POST /api/runs.
enum Runs {
    struct Start: Encodable {
        var kind: String
        var sessionId: String?
        var minutes: Int?
        var topic: String?
        var concepts: [String]?
        var milestone: String?
    }
    struct Started: Decodable { var run: RunView }

    @MainActor
    static func start(_ body: Start) async throws -> RunView {
        let r: Started = try await API.post("/api/runs", body)
        RunCache.prime(r.run)
        Router.shared.cover = .session(r.run.id)
        return r.run
    }

    // Runs an action from Today (or Siri): practice opens Practice, resume
    // opens the run, anything else starts one.
    @MainActor
    static func run(_ a: TodayAction, topic: String? = nil) async throws {
        if a.kind == "practice" { Router.shared.open("/practice"); return }
        if a.kind == "resume", let id = a.runId { Router.shared.cover = .session(id); return }
        let kind = ["return", "review", "explore", "rehearsal"].contains(a.kind) ? a.kind : "session"
        _ = try await start(.init(kind: kind, sessionId: a.sessionId, minutes: a.minutes.map { Int($0.rounded()) }, topic: topic, milestone: a.milestone))
    }
}

// A run the app already has (just started), so the session opens instantly.
@MainActor enum RunCache {
    private static var runs: [String: RunView] = [:]
    static func prime(_ run: RunView) { runs[run.id] = run }
    static func take(_ id: String) -> RunView? { runs.removeValue(forKey: id) }
}
