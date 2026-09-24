import Foundation
import Observation
import UniformTypeIdentifiers
import CoreTransferable

// Models for Notebook, Mastery and Insights: GET /api/notebook, /api/mastery,
// /api/portfolio and /api/insights (docs/API.md §8). Enum-like fields stay
// strings, and anything the server may leave out decodes leniently.

// MARK: - Notebook (src/lib/notebook.ts)

struct NotebookData: Codable, Sendable {
    var entries: [NotebookEntry]
    var tracks: [NotebookTrack]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        entries = c.lenient([NotebookEntry].self, .entries) ?? []
        tracks = c.lenient([NotebookTrack].self, .tracks) ?? []
    }
}

struct NotebookTrack: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
}

struct NotebookEntry: Codable, Hashable, Sendable, Identifiable {
    var key: String
    var title: String
    var track: String
    var trackTitle: String
    var summary: String
    var offPlan: Bool
    var strength: Double
    var level: String
    var due_at: String?
    var first_seen: String
    var last_seen: String
    var explanation: String?
    var visual: JSON?
    var words: [Words]
    var asks: [AskNote]
    var notes: [Note]
    var sources: [Source]
    var misconceptions: [String]
    var shared: String?

    var id: String { key }

    struct Words: Codable, Hashable, Sendable {
        var text: String
        var verdict: String?
        var step: String
        var run: String
        var at: String
    }
    struct AskNote: Codable, Hashable, Sendable {
        var question: String
        var quote: String?
        var answer: String
        var run: String
        var at: String
    }
    struct Note: Codable, Hashable, Sendable, Identifiable {
        var id: String
        var text: String
        var quote: String?
        var run: String
        var beat: String
        var concept: String?
        var at: String
    }
    struct Source: Codable, Hashable, Sendable {
        var run: String
        var title: String
        var kind: String
        var at: String
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        title = c.lenient(String.self, .title) ?? key
        track = c.lenient(String.self, .track) ?? ""
        trackTitle = c.lenient(String.self, .trackTitle) ?? track.capitalized
        summary = c.lenient(String.self, .summary) ?? ""
        offPlan = c.lenient(Bool.self, .offPlan) ?? false
        strength = c.lenient(Double.self, .strength) ?? 0
        level = c.lenient(String.self, .level) ?? "new"
        due_at = c.lenient(String.self, .due_at)
        first_seen = c.lenient(String.self, .first_seen) ?? ""
        last_seen = c.lenient(String.self, .last_seen) ?? first_seen
        explanation = c.lenient(String.self, .explanation)
        let v = c.lenient(JSON.self, .visual)
        visual = v?.isNull == true ? nil : v
        words = c.lenient([Words].self, .words) ?? []
        asks = c.lenient([AskNote].self, .asks) ?? []
        notes = c.lenient([Note].self, .notes) ?? []
        sources = c.lenient([Source].self, .sources) ?? []
        misconceptions = c.lenient([String].self, .misconceptions) ?? []
        shared = c.lenient(String.self, .shared)
    }
}

// The Notebook's data, shared by the index and every entry so an edit on an
// entry shows on the index straight away (web: useCached('/api/notebook')).
@MainActor @Observable
final class NotebookModel {
    static let shared = NotebookModel()
    private(set) var data: NotebookData?
    private(set) var error: String?
    private(set) var loading = false
    private var owner: String?

    // Paints what the app already has for this account, then refetches.
    func load(owner: String?) async {
        if owner != self.owner {
            self.owner = owner
            data = owner.flatMap { Disk.read(NotebookData.self, "notebook", owner: $0) }
            error = nil
        }
        loading = true
        defer { loading = false }
        do {
            let d: NotebookData = try await API.get("/api/notebook")
            data = d
            error = nil
            if let owner { Disk.write(d, "notebook", owner: owner) }
        } catch is CancellationError {
        } catch {
            if data == nil { self.error = error.localizedDescription }
        }
    }

    func entry(_ key: String) -> NotebookEntry? { data?.entries.first { $0.key == key } }
}

// web: LEVEL_LABEL in src/lib/notebook.ts ("new" is "New" here).
func notebookLevel(_ level: String) -> String {
    switch level {
    case "new": "New"
    case "learning": "Learning"
    case "practiced", "practised": "Practised"
    case "solid": "Solid"
    case "mastered": "Mastered"
    default: level
    }
}

// MARK: - Mastery (src/app/api/mastery/route.ts)

struct MasteryData: Decodable, Sendable {
    var concepts: [MasteryConcept]
    var mapped: Bool
    var hasPlan: Bool?
    var evidence: [Evidence]
    var practice: [PracticeItem]
    var history: [HistoryItem]
    var weeks: [WeekCount]?
    var calibration: CalibrationCounts?
    var milestones: [Milestone]

    struct Evidence: Decodable, Hashable, Sendable { var run: String; var title: String; var date: String; var text: String; var verdict: String? }
    struct PracticeItem: Decodable, Hashable, Sendable, Identifiable { var id: String; var title: String; var date: String; var mode: String?; var score: Double?; var headline: String? }
    struct HistoryItem: Decodable, Hashable, Sendable, Identifiable { var id: String; var kind: String; var title: String; var date: String; var summary: String? }
    struct WeekCount: Decodable, Hashable, Sendable { var week: String; var count: Int; var solid: Int }
    struct Milestone: Decodable, Hashable, Sendable { var date: String; var title: String }

    enum CodingKeys: String, CodingKey { case concepts, mapped, hasPlan, evidence, practice, history, weeks, calibration, milestones }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        concepts = c.lenient([MasteryConcept].self, .concepts) ?? []
        mapped = c.lenient(Bool.self, .mapped) ?? false
        hasPlan = c.lenient(Bool.self, .hasPlan)
        evidence = c.lenient([Evidence].self, .evidence) ?? []
        practice = c.lenient([PracticeItem].self, .practice) ?? []
        history = c.lenient([HistoryItem].self, .history) ?? []
        weeks = c.lenient([WeekCount].self, .weeks)
        calibration = c.lenient(CalibrationCounts.self, .calibration)
        milestones = c.lenient([Milestone].self, .milestones) ?? []
    }

    var noPlan: Bool { hasPlan == false || (hasPlan == nil && weeks == nil && history.isEmpty) }
}

struct CalibrationCounts: Codable, Hashable, Sendable {
    struct Cell: Codable, Hashable, Sendable { var n: Int; var right: Int }
    var low: Cell
    var medium: Cell
    var high: Cell

    subscript(_ key: String) -> Cell {
        switch key { case "low": low; case "medium": medium; default: high }
    }
    var total: Int { low.n + medium.n + high.n }
    func pct(_ key: String) -> Int? {
        let c = self[key]
        return c.n > 0 ? Int((Double(c.right) / Double(c.n) * 100).rounded()) : nil
    }
}

struct MasteryConcept: Decodable, Hashable, Sendable, Identifiable {
    var key: String
    var title: String
    var track: String
    var summary: String
    var prerequisites: [String]
    var sessions: [String]
    var position: Double
    var strength: Double
    var recall: Double
    var level: String
    var due_at: String?
    var last_seen_at: String?
    var successes: Int
    var lapses: Int
    var misconceptions: [String]
    var model: Model?

    var id: String { key }

    struct Model: Decodable, Hashable, Sendable {
        var p_known: Double
        var stability: Double
        var exposures: Double
        var last_seen_at: String?
    }

    enum CodingKeys: String, CodingKey {
        case key, title, track, summary, prerequisites, sessions, position, strength, recall, level, due_at, last_seen_at, successes, lapses, misconceptions, model
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        title = c.lenient(String.self, .title) ?? key
        track = c.lenient(String.self, .track) ?? ""
        summary = c.lenient(String.self, .summary) ?? ""
        prerequisites = c.lenient([String].self, .prerequisites) ?? []
        sessions = c.lenient([String].self, .sessions) ?? []
        position = c.lenient(Double.self, .position) ?? 0
        strength = c.lenient(Double.self, .strength) ?? 0
        recall = c.lenient(Double.self, .recall) ?? 0
        level = c.lenient(String.self, .level) ?? "new"
        due_at = c.lenient(String.self, .due_at)
        last_seen_at = c.lenient(String.self, .last_seen_at)
        successes = c.lenient(Int.self, .successes) ?? 0
        lapses = c.lenient(Int.self, .lapses) ?? 0
        misconceptions = c.lenient([String].self, .misconceptions) ?? []
        model = c.lenient(Model.self, .model)
    }

    // The learner-model levels in order (src/lib/learning/model.ts).
    static let rank: [String: Int] = ["new": 0, "learning": 1, "practiced": 2, "solid": 3, "mastered": 4]
    var rank: Int { Self.rank[level] ?? 0 }

    var due: Date? { due_at.flatMap(Stamp.parse) }

    // The concept as the forgetting curve expects it at a future moment, if
    // nothing is reviewed in between (projected() in model.ts).
    func projected(at: Date) -> MasteryConcept {
        guard let m = model else { return self }
        var c = self
        let r = Self.retrievability(m, at: at)
        c.recall = r
        c.strength = m.exposures > 0 ? min(1, max(0, m.p_known * (0.35 + 0.65 * r))) : 0
        c.level = Self.level(m, r: r)
        return c
    }

    private static func retrievability(_ m: Model, at: Date) -> Double {
        guard let seen = m.last_seen_at.flatMap(Stamp.parse), m.stability > 0 else { return m.exposures > 0 ? 0.6 : 0 }
        let days = max(0, at.timeIntervalSince(seen) / 86400)
        return pow(1 + days / (9 * m.stability), -1)
    }

    private static func level(_ m: Model, r: Double) -> String {
        if m.exposures <= 0 { return "new" }
        if m.p_known >= 0.9, m.stability >= 21, r >= 0.8 { return "mastered" }
        if m.p_known >= 0.8, m.stability >= 6, r >= 0.7 { return "solid" }
        if m.p_known >= 0.55 { return "practiced" }
        return "learning"
    }
}

struct PortfolioData: Decodable, Sendable {
    var count: Int
    var groups: [Group]

    struct Group: Decodable, Hashable, Sendable {
        var title: String
        var date: String
        var items: [Item]
    }
    struct Item: Decodable, Hashable, Sendable {
        var run: String
        var title: String
        var date: String
        var text: String
        var verdict: String?
    }
}

// Practice modes (src/lib/practice/harness.ts MODES).
func practiceModeLabel(_ mode: String?) -> String {
    switch mode {
    case "debate": "Debate"
    case "conversation": "Hard conversation"
    case "negotiation": "Negotiation"
    case "pitch": "Pitch & questions"
    case "delegation": "Delegation"
    case "interview": "Interview"
    case "explain": "Explain it"
    case "free": "Anything"
    default: mode?.capitalized ?? ""
    }
}

// MARK: - Insights (src/lib/insights.ts)

struct InsightsData: Decodable, Sendable {
    var weeks: [InsightSummary]
    var insight: InsightRow?

    enum CodingKeys: String, CodingKey { case weeks, insight }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        weeks = c.lenient([InsightSummary].self, .weeks) ?? []
        insight = c.lenient(InsightRow.self, .insight)
    }
}

struct InsightSummary: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var week_start: String
    var week_end: String
    var status: String
    var seen_at: String?
    var headline: String?
    var focus: String?
    var grades: [GradeScore]

    struct GradeScore: Decodable, Hashable, Sendable { var key: String; var score: Double? }

    enum CodingKeys: String, CodingKey { case id, week_start, week_end, status, seen_at, headline, focus, grades }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        week_start = c.lenient(String.self, .week_start) ?? ""
        week_end = c.lenient(String.self, .week_end) ?? ""
        status = c.lenient(String.self, .status) ?? "ready"
        seen_at = c.lenient(String.self, .seen_at)
        headline = c.lenient(String.self, .headline)
        focus = c.lenient(String.self, .focus)
        grades = c.lenient([GradeScore].self, .grades) ?? []
    }
}

struct InsightRow: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var week_start: String
    var week_end: String
    var status: String // generating, ready, failed
    var metrics: InsightMetrics?
    var report: InsightReport?
    var model: String?
    var seen_at: String?

    enum CodingKeys: String, CodingKey { case id, week_start, week_end, status, metrics, report, model, seen_at }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        week_start = c.lenient(String.self, .week_start) ?? ""
        week_end = c.lenient(String.self, .week_end) ?? ""
        status = c.lenient(String.self, .status) ?? "ready"
        // {} while generating: only a measured week has totals.
        let raw = c.lenient(JSON.self, .metrics)
        metrics = raw?["totals"] != nil ? try? raw?.decode(InsightMetrics.self) : nil
        report = c.lenient(InsightReport.self, .report)
        model = c.lenient(String.self, .model)
        seen_at = c.lenient(String.self, .seen_at)
    }
}

struct InsightGrade: Decodable, Hashable, Sendable {
    var key: String
    var score: Double?
    var confidence: String
    var label: String
    var evidence: String

    enum CodingKeys: String, CodingKey { case key, score, confidence, label, evidence }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        score = c.lenient(Double.self, .score)
        confidence = c.lenient(String.self, .confidence) ?? "low"
        label = c.lenient(String.self, .label) ?? ""
        evidence = c.lenient(String.self, .evidence) ?? ""
    }
}

struct InsightReport: Decodable, Hashable, Sendable {
    var headline: String
    var summary: String
    var data_note: String?
    var grades: [InsightGrade]
    var patterns: [Pattern]
    var mind: [Mind]
    var moment: Moment?
    var focus: Focus
    var focus_check: FocusCheck?

    struct Pattern: Decodable, Hashable, Sendable { var kind: String; var title: String; var body: String }
    struct Mind: Decodable, Hashable, Sendable { var title: String; var body: String }
    struct Moment: Decodable, Hashable, Sendable { var quote: String; var why: String }
    struct Focus: Decodable, Hashable, Sendable {
        var title: String
        var why: String
        var `try`: String
        var adopted: Adopted?
        struct Adopted: Decodable, Hashable, Sendable { var memory_id: String?; var at: String? }

        enum CodingKeys: String, CodingKey { case title, why, `try`, adopted }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = c.lenient(String.self, .title) ?? ""
            why = c.lenient(String.self, .why) ?? ""
            `try` = c.lenient(String.self, .try) ?? ""
            adopted = c.lenient(Adopted.self, .adopted)
        }
    }
    struct FocusCheck: Decodable, Hashable, Sendable { var verdict: String; var note: String }

    enum CodingKeys: String, CodingKey { case headline, summary, data_note, grades, patterns, mind, moment, focus, focus_check }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        headline = c.lenient(String.self, .headline) ?? ""
        summary = c.lenient(String.self, .summary) ?? ""
        data_note = c.lenient(String.self, .data_note)
        grades = c.lenient([InsightGrade].self, .grades) ?? []
        patterns = c.lenient([Pattern].self, .patterns) ?? []
        mind = c.lenient([Mind].self, .mind) ?? []
        moment = c.lenient(Moment.self, .moment)
        focus = try c.decode(Focus.self, forKey: .focus)
        focus_check = c.lenient(FocusCheck.self, .focus_check)
    }
}

struct InsightMetrics: Decodable, Hashable, Sendable {
    var totals: Totals
    var by_day: [DayCount]
    var by_hour: [Double]
    var schedule: Schedule
    var answers: Answers

    struct Totals: Decodable, Hashable, Sendable {
        var minutes: Int
        var days_active: Int
        var sessions_finished: Int
        var practices: Int
        var steps_done: Int
        var answers: Int
        var questions_asked: Int
        var words_written: Int
        var words_spoken: Int

        enum CodingKeys: String, CodingKey { case minutes, days_active, sessions_finished, practices, steps_done, answers, questions_asked, words_written, words_spoken }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            func n(_ k: CodingKeys) -> Int { Int((c.lenient(Double.self, k) ?? 0).rounded()) }
            minutes = n(.minutes); days_active = n(.days_active); sessions_finished = n(.sessions_finished)
            practices = n(.practices); steps_done = n(.steps_done); answers = n(.answers)
            questions_asked = n(.questions_asked); words_written = n(.words_written); words_spoken = n(.words_spoken)
        }
    }
    struct DayCount: Decodable, Hashable, Sendable { var date: String; var minutes: Double; var answers: Int; var asks: Int }
    struct Schedule: Decodable, Hashable, Sendable {
        var optional_steps_taken: Int
        enum CodingKeys: String, CodingKey { case optional_steps_taken }
        init(from decoder: Decoder) throws {
            optional_steps_taken = (try? decoder.container(keyedBy: CodingKeys.self).lenient(Int.self, .optional_steps_taken)) ?? 0
        }
    }
    struct Answers: Decodable, Hashable, Sendable {
        var total: Int
        var solid: Int
        var partial: Int
        var missed: Int
        var skipped: Int
        var avg_score: Double?
        var retries: Int
        var retries_improved: Int
        var avg_words: Double?
        var calibration: CalibrationCounts

        enum CodingKeys: String, CodingKey { case total, solid, partial, missed, skipped, avg_score, retries, retries_improved, avg_words, calibration }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            total = c.lenient(Int.self, .total) ?? 0
            solid = c.lenient(Int.self, .solid) ?? 0
            partial = c.lenient(Int.self, .partial) ?? 0
            missed = c.lenient(Int.self, .missed) ?? 0
            skipped = c.lenient(Int.self, .skipped) ?? 0
            avg_score = c.lenient(Double.self, .avg_score)
            retries = c.lenient(Int.self, .retries) ?? 0
            retries_improved = c.lenient(Int.self, .retries_improved) ?? 0
            avg_words = c.lenient(Double.self, .avg_words)
            calibration = c.lenient(CalibrationCounts.self, .calibration)
                ?? .init(low: .init(n: 0, right: 0), medium: .init(n: 0, right: 0), high: .init(n: 0, right: 0))
        }
    }

    enum CodingKeys: String, CodingKey { case totals, by_day, by_hour, schedule, answers }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        totals = try c.decode(Totals.self, forKey: .totals)
        by_day = c.lenient([DayCount].self, .by_day) ?? []
        let hours = c.lenient([Double].self, .by_hour) ?? []
        by_hour = hours.count == 24 ? hours : Array(repeating: 0, count: 24)
        schedule = try c.decode(Schedule.self, forKey: .schedule)
        answers = try c.decode(Answers.self, forKey: .answers)
    }
}

enum InsightGrades {
    static let keys = ["effort", "engagement", "consistency", "understanding", "retention", "transfer", "calibration", "communication"]
    static let label: [String: String] = [
        "effort": "Effort", "engagement": "Engagement", "consistency": "Consistency", "understanding": "Understanding",
        "retention": "Retention", "transfer": "Transfer", "calibration": "Calibration", "communication": "Communication",
    ]
    static let hint: [String: String] = [
        "effort": "Time, follow-through and care in your answers",
        "engagement": "Curiosity: questions, highlights, exploring",
        "consistency": "Showing up on the days you planned",
        "understanding": "Getting new ideas right",
        "retention": "Remembering earlier ideas",
        "transfer": "Using ideas in new situations",
        "calibration": "Knowing when you know",
        "communication": "Practice conversations",
    ]
    static let bands: [(from: Int, to: Int, label: String, note: String)] = [
        (90, 100, "Exceptional", "Rare, and only with strong evidence."),
        (75, 89, "Strong", "Clearly above what the plan asks."),
        (60, 74, "Solid", "Doing what the plan asks, well."),
        (45, 59, "Mixed", "Real effort with clear gaps, or uneven."),
        (30, 44, "Below", "Below what the plan asks."),
        (0, 29, "Largely absent", "Little to grade."),
    ]
}

// MARK: - Sharing files

// A Markdown document handed to the share sheet as a real .md file. `fetch`
// builds the text lazily (the portfolio comes from the server).
struct MarkdownFile: Transferable, Sendable {
    let name: String
    let fetch: @Sendable () async throws -> String

    init(name: String, text: String) {
        self.name = name
        self.fetch = { text }
    }
    init(name: String, fetch: @escaping @Sendable () async throws -> String) {
        self.name = name
        self.fetch = fetch
    }

    static let markdown = UTType(filenameExtension: "md", conformingTo: .plainText) ?? .plainText

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: markdown) { file in
            let text = try await file.fetch()
            let url = URL.temporaryDirectory.appending(path: file.name)
            try Data(text.utf8).write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}

// A PNG downloaded when the share sheet asks for it (the shared card image).
struct RemoteImageFile: Transferable, Sendable {
    let url: URL
    let name: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .png) { file in
            let (data, response) = try await URLSession.shared.data(from: file.url)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw APIError(message: "The image couldn’t be made.", status: 0) }
            let url = URL.temporaryDirectory.appending(path: file.name)
            try data.write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}

// Fetches an authenticated text route (the portfolio as Markdown).
enum LibraryText {
    static func get(_ path: String) async throws -> String {
        let req = try await API.request(path, method: "GET", body: nil)
        let (data, response) = try await API.session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw API.failure(data, status: status) }
        return String(decoding: data, as: UTF8.self)
    }
}
