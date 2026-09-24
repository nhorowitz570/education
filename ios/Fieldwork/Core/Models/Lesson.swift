import Foundation

// What a session looks like on screen: src/lib/learning/run.ts. Enum-like
// fields are kept as strings so a new server value never fails a decode.

struct Block: Codable, Hashable, Sendable, Identifiable {
    var type: String // text, visual, callout
    var md: String?
    var visual: JSON?
    var id: Int { hashValue }

    static func text(_ md: String) -> Block { .init(type: "text", md: md) }

    // Blocks from a streaming snapshot: anything that doesn't parse yet is
    // dropped until it does.
    static func list(_ json: JSON?) -> [Block] {
        (json?.array ?? []).compactMap { j in
            guard let type = j["type"]?.string else { return nil }
            return Block(type: type, md: j["md"]?.string, visual: j["visual"])
        }
    }
}

struct Question: Codable, Hashable, Sendable {
    var kind: String // choice, text
    var options: [String]?
    var placeholder: String?
    var long: Bool?
}

struct Response: Codable, Hashable, Sendable {
    var choice: Int?
    var text: String?
    var confidence: String? // low, medium, high
    var unknown: Bool?
    var gauge: String? // new, heard, used
    var at: String?
}

struct Verdict: Codable, Hashable, Sendable {
    var verdict: String // solid, partial, missed
    var score: Double?
    var blocks: [Block]
}

struct Ask: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var prompt: String
    var quote: String?
    var intent: String
    var blocks: [Block]
    var follow_ups: [String]?
    var at: String?
}

struct Beat: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var type: String
    var minutes: Double?
    var concept: String?
    var intent: String?
    var optional: Bool?
    var status: String // pending, generating, ready, answered, done, skipped
    var blocks: [Block]?
    var follow_ups: [String]?
    var question: Question?
    var response: Response?
    var feedback: Verdict?
    var attempts: [Attempt]?
    var asks: [Ask]?
    var practice: Linked?
    var tier: String?
    var correct_index: Int?

    struct Attempt: Codable, Hashable, Sendable { var response: Response; var feedback: Verdict }
    struct Linked: Codable, Hashable, Sendable { var id: String; var status: String }

    static let questionTypes: Set<String> = ["recall", "check", "attempt", "transfer", "produce"]
    var isQuestion: Bool { Self.questionTypes.contains(type) }
    // A text answer that missed can be retried once, with the feedback in view.
    var canRetry: Bool {
        guard let f = feedback else { return false }
        return f.verdict != "solid" && question?.kind == "text" && (attempts ?? []).isEmpty && response?.unknown != true
    }

    // The label over each step (BEAT_LABEL in session/beat.tsx).
    var label: String {
        switch type {
        case "gauge": "Where you’re starting"
        case "recall": "Warm-up"
        case "situation": "Situation"
        case "orient": "The big picture"
        case "explain": "The idea"
        case "worked": "Worked example"
        case "check": "Your call"
        case "attempt": "In your words"
        case "transfer": "New situation"
        case "produce": "This week’s work"
        case "roleplay": "Say it out loud"
        case "break": "Break"
        case "recap": "Wrap-up"
        default: type.capitalized
        }
    }

    // Shown while a step is being written.
    var building: String {
        switch type {
        case "gauge": "Looking ahead"
        case "recall": "Picking something worth revisiting"
        case "situation": "Setting the scene"
        case "orient": "Mapping the territory"
        case "explain": "Finding the clearest way in"
        case "worked": "Working through an example"
        case "check": "Framing your decision"
        case "attempt": "Preparing your turn"
        case "transfer": "Changing the situation"
        case "produce": "Framing this week’s work"
        case "recap": "Looking back over the session"
        case "roleplay": "Casting your counterpart"
        default: "Preparing"
        }
    }

    var hasContent: Bool { type == "break" || blocks != nil }
}

struct RunView: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var kind: String // session, review, explore, practice, return, rehearsal
    var title: String
    var status: String // active, done, abandoned
    var cursor: Int
    var beats: [Beat]
    var summary: String?
    var started_at: String?
    var session: Session?
    var minutes_planned: Double?
    var break_until: String?
    var adaptive: Bool?
    var elapsed: Double?
    var wrapping: Bool?

    struct Session: Codable, Hashable, Sendable {
        var id: String
        var title: String
        var subject: String?
        var date: String?
        var objective: String?
    }
}

enum Confidence: String, CaseIterable, Sendable {
    case low, medium, high
    var label: String {
        switch self { case .low: "Guessing"; case .medium: "Fairly sure"; case .high: "Certain" }
    }
}

enum Gauge: String, CaseIterable, Sendable {
    case new, heard, used
    var label: String {
        switch self { case .new: "New to me"; case .heard: "Heard of it"; case .used: "I’ve used it" }
    }
    var detail: String {
        switch self { case .new: "Start from the beginning"; case .heard: "A quick explanation, then practice"; case .used: "Skip ahead to something harder" }
    }
}

let verdictLabel: [String: String] = ["solid": "Solid", "partial": "Partly there", "missed": "Not yet"]

// XP as the server counts it (src/lib/gamify.ts).
enum XP {
    static func answer(_ verdict: String, confidence: String?, unknown: Bool, score: Double?) -> Int {
        if unknown { return 5 }
        let s = score ?? (verdict == "solid" ? 1 : verdict == "partial" ? 0.5 : 0)
        let base = ["solid": 15, "partial": 10, "missed": 5][verdict] ?? 0
        let calibrated = (confidence == "high" && s >= 0.75) || (confidence == "low" && s < 0.4)
        return base + (calibrated ? 5 : 0)
    }
    static func session(_ beats: [Beat]) -> Int {
        beats.reduce(0) { n, b in
            guard let f = b.feedback else { return n }
            return n + answer(f.verdict, confidence: b.response?.confidence, unknown: b.response?.unknown == true, score: f.score)
        }
    }
    static let finish: [String: Int] = ["session": 40, "return": 40, "review": 20, "rehearsal": 40, "explore": 15, "practice": 30]
}

// Plain first sentence of some blocks, for one-line summaries.
func firstSentence(_ blocks: [Block]?, max: Int = 110) -> String {
    let text = (blocks ?? []).filter { $0.type != "visual" }
        .map { ($0.md ?? "").replacingOccurrences(of: #"(?m)^\s*(?:\d+[.)]|[-*])\s+"#, with: "", options: .regularExpression) }
        .joined(separator: " ")
        .replacingOccurrences(of: #"[*_`>#]"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
    let first = leadingSentence(text)
    return first.count > max ? String(first.prefix(max - 1)).trimmingCharacters(in: .whitespaces) + "…" : first
}

// Text up to and including the first ".", "!" or "?" that ends a sentence.
func leadingSentence(_ text: String) -> String {
    var i = text.startIndex
    while i < text.endIndex {
        let next = text.index(after: i)
        if ".!?".contains(text[i]), next == text.endIndex || text[next].isWhitespace { return String(text[...i]) }
        i = next
    }
    return text
}
