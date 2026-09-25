import Foundation

#if DEBUG
// A signed-in app with no network, for checking every screen in the
// simulator: launch with `-demo`. Responses come from Debug/Fixtures, which
// mirror the server's contracts (docs/API.md). Never in release builds.
enum Demo {
    static let on = ProcessInfo.processInfo.arguments.contains("-demo")

    // The fixture that answers a request, by path.
    static func fixture(_ path: String, method: String, body: Data?) -> Data? {
        let route = path.split(separator: "?").first.map(String.init) ?? path
        let query = path.contains("?") ? String(path.split(separator: "?").last ?? "") : ""
        let action = body.flatMap { try? JSONDecoder().decode(JSON.self, from: $0) }?["action"]?.string
        let name: String
        switch (method, route) {
        case ("GET", "/api/state"), ("POST", "/api/actions"):
            // The fixture's workspace, handed to whoever the demo signed in as.
            guard let data = load("state"), case .object(var json)? = try? JSONDecoder().decode(JSON.self, from: data) else { return nil }
            json["ownerId"] = .string("demo")
            return try? JSONEncoder().encode(JSON.object(json))
        case ("GET", "/api/today"): name = "today"
        case ("POST", "/api/today/brief"): name = "today_brief"
        case ("GET", "/api/progress"): name = "progress"
        case ("GET", "/api/mastery"): name = query.contains("concepts=") ? "mastery_concepts" : "mastery"
        case ("GET", "/api/portfolio"): name = "portfolio"
        case ("GET", "/api/notebook"): name = query.contains("terms=1") ? "notebook_terms" : "notebook"
        case ("GET", "/api/notes"): name = "notes"
        case ("GET", "/api/insights"): name = "insights"
        case ("GET", "/api/memory"): name = "memory"
        case ("GET", "/api/usage"): name = "usage"
        case ("GET", "/api/practice"): name = "practice"
        case ("GET", "/api/tutor"): name = "tutor"
        case ("GET", "/api/chapters"): name = "chapters"
        case ("POST", "/api/import"): name = "import_preview"
        case (_, let r) where r.hasPrefix("/api/runs/"):
            if action == "finish" || ProcessInfo.processInfo.arguments.contains("-done") { name = "runs_done" } else { name = "runs_active" }
        case ("POST", "/api/runs"): return wrap("run", "runs_active")
        case (_, let r) where r.hasPrefix("/api/practice/"):
            name = ProcessInfo.processInfo.arguments.contains("-feedback") || action == "feedback" ? "practice_done" : "practice_one"
        default: return Data("{}".utf8)
        }
        return load(name)
    }

    static func load(_ name: String) -> Data? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else { return nil }
        return try? Data(contentsOf: url)
    }

    // POST /api/runs answers {run} from the GET fixture's {run}.
    private static func wrap(_ key: String, _ name: String) -> Data? {
        load(name)
    }

    // A stream finishes at once with the matching piece of a fixture.
    static func streamed(_ path: String, body: Data?) -> JSON {
        let b = body.flatMap { try? JSONDecoder().decode(JSON.self, from: $0) }
        if path == "/api/tutor" {
            return .object([
                "id": b?["reply_id"] ?? .string(UUID().uuidString),
                "blocks": .array([.object(["type": .string("text"), "md": .string("Here’s the short version: profit is what the books say you earned; cash is what you can spend today. They drift apart when customers pay late.")])]),
                "suggestions": .array([.string("Show me an example"), .string("Quiz me on it")]),
                "actions": .array([]),
            ])
        }
        if path.hasPrefix("/api/practice/") {
            return .object(["reply": .string("Fair point. But what happens if the numbers don’t hold up next quarter?"), "end": .bool(false)])
        }
        let run = load("runs_active").flatMap { try? JSONDecoder().decode(JSON.self, from: $0) }?["run"]
        let beat = run?["beats"]?.array?.first { $0["id"] == b?["beatId"] }
        switch b?["action"]?.string {
        case "answer":
            guard var o = beat?.object else { return .null }
            o["status"] = .string("done")
            o["response"] = .object(["text": b?["text"] ?? .null, "choice": b?["choice"] ?? .null, "confidence": b?["confidence"] ?? .null, "at": .string(Stamp.now())])
            o["feedback"] = .object(["verdict": .string("partial"), "score": .number(0.6), "blocks": .array([.object(["type": .string("text"), "md": .string("You’ve got the direction right: late payments are the gap. What’s missing is **why** it matters — a profitable month can still leave Jake unable to make payroll.")])])])
            return .object(o)
        case "ask":
            return .object(["id": .string(UUID().uuidString), "prompt": b?["prompt"] ?? .string(""), "intent": b?["intent"] ?? .string("why"),
                            "blocks": .array([.object(["type": .string("text"), "md": .string("Because the invoice counts as revenue the day it’s sent, but the money only arrives when Emily’s client pays, often 30 to 60 days later.")])]),
                            "at": .string(Stamp.now())])
        default:
            return beat ?? .null
        }
    }
}
#endif
