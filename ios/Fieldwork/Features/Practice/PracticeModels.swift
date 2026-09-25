import Foundation

// Practice (src/lib/practice/harness.ts, docs/API.md §6).

struct PracticeLine: Codable, Hashable, Sendable {
    var role: String // user, assistant
    var text: String
}

struct PracticeBrief: Codable, Hashable, Sendable {
    struct Partner: Codable, Hashable, Sendable {
        var name: String
        var role: String
        var stance: String
        var temperament: String?
        var pronouns: String?
    }
    var title: String
    var partner: Partner
    var situation: String
    var learner_role: String?
    var learner_goal: String
    var opening: String?
    var complications: [String]?
    var success: [String]?
    var prep: [String]
}

struct PracticeFeedback: Codable, Hashable, Sendable {
    struct Best: Codable, Hashable, Sendable { var quote: String; var why: String }
    struct Rewrite: Codable, Hashable, Sendable { var original: String; var better: String }
    struct Criterion: Codable, Hashable, Sendable { var name: String; var rating: String; var note: String }
    struct Note: Codable, Hashable, Sendable { var line: Int; var kind: String; var note: String }
    var headline: String
    var best: Best
    var change: String
    var rewrite: Rewrite
    var criteria: [Criterion]
    var score: Double
    var notes: [Note]?
}

struct PracticeState: Codable, Hashable, Sendable {
    struct Parent: Codable, Hashable, Sendable { var runId: String; var beatId: String }
    var mode: String
    var difficulty: String
    var minutes: Int
    var voice: String
    var topic: String
    var side: String?
    var brief: PracticeBrief
    var channel: String?
    var transcript: [PracticeLine]
    var seconds: Double?
    var feedback: PracticeFeedback?
    var parent: Parent?
    var concept: String?
    var resume: [PracticeLine]?
}

struct PracticeView: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var status: String
    var started_at: String?
    var practice: PracticeState
}

struct PracticeRecent: Decodable, Identifiable, Sendable {
    var id: String
    var title: String
    var status: String
    var started_at: String
    var mode: String
    var score: Double?
    var headline: String?
}

enum PracticeMode: String, CaseIterable, Identifiable, Sendable {
    case debate, conversation, negotiation, pitch, delegation, interview, explain, free
    var id: String { rawValue }
    var label: String {
        switch self {
        case .debate: "Debate"
        case .conversation: "Hard conversation"
        case .negotiation: "Negotiation"
        case .pitch: "Pitch & questions"
        case .delegation: "Delegation"
        case .interview: "Interview"
        case .explain: "Explain it"
        case .free: "Anything"
        }
    }
    var blurb: String {
        switch self {
        case .debate: "Argue a position against a sharp, fair opponent."
        case .conversation: "Feedback, disagreement, a missed commitment."
        case .negotiation: "Interests, alternatives, a walk-away point."
        case .pitch: "Make the case, then handle the skeptic."
        case .delegation: "Hand off work so it comes back right."
        case .interview: "Answer well under follow-up questions."
        case .explain: "Teach an idea to a smart non-expert."
        case .free: "Describe the conversation you want to rehearse."
        }
    }
    // A few words for the format tiles.
    var caption: String {
        switch self {
        case .debate: "Argue a side"
        case .conversation: "Say the hard thing"
        case .negotiation: "Get to a deal"
        case .pitch: "Sell an idea"
        case .delegation: "Hand off work"
        case .interview: "Handle follow-ups"
        case .explain: "Teach an idea"
        case .free: "Your own scenario"
        }
    }
    static func label(_ raw: String) -> String { PracticeMode(rawValue: raw)?.label ?? raw.capitalized }
}

enum Practice {
    struct Create: Encodable {
        var mode: String
        var topic: String
        var side: String?
        var difficulty: String?
        var minutes: Int?
        var voice: String?
        var parent: PracticeState.Parent?
    }
    struct Redo: Encodable {
        struct From: Encodable { var from: String; var line: Int }
        var redo: From
    }
    struct Result: Decodable { var practice: PracticeView }

    static func create(_ body: Create) async throws -> PracticeView {
        let r: Result = try await API.post("/api/practice", body)
        return r.practice
    }
    static func redo(from id: String, line: Int) async throws -> PracticeView {
        let r: Result = try await API.post("/api/practice", Redo(redo: .init(from: id, line: line)))
        return r.practice
    }
    static func get(_ id: String) async throws -> PracticeView {
        let r: Result = try await API.get("/api/practice/\(id)")
        return r.practice
    }
}

// Genders of the practice voices, for "plays a man/woman".
let voiceGender: [String: String] = ["cedar": "man", "willow": "woman", "meridian": "man", "gleam": "woman", "vesper": "man", "stone": "man"]
