import SwiftUI

// The learner's preferences: the same synced `settings:prefs` record as the
// web (src/lib/prefs.ts). Every field falls back to its default on its own,
// so an old or partial record never breaks anything.
struct Prefs: Codable, Equatable, Sendable {
    struct Session: Codable, Equatable, Sendable {
        var familiarity = true
        var confidence = true
        var dontKnow = true
        var breaks = 5 // 0, 5 or 10
    }
    struct Game: Codable, Equatable, Sendable {
        var xp = true
        var streak = true
        var quests = true
        var pops = true
    }
    struct Reading: Codable, Equatable, Sendable {
        var size = "m" // s, m, l, xl
        var lessonFont: Face = .serif
        var appFont: Face = .sans
        var width = "normal" // narrow, normal, wide
        var motion = "system" // system, reduce, full
    }
    struct Notify: Codable, Equatable, Sendable {
        var morning = true
        var nudge = true
        var breaks = true
        var insights = true
        var week = true
    }

    var session = Session()
    var voice = "cedar"
    var writing = "balanced"
    var game = Game()
    var reading = Reading()
    var sound = false
    var notify = Notify()

    static let record = "settings:prefs"

    var anyGame: Bool { game.xp || game.streak || game.quests }
    // Lesson text scale for You → Reading → Size.
    var readScale: CGFloat {
        switch reading.size { case "s": 0.92; case "l": 1.1; case "xl": 1.22; default: 1 }
    }
}

extension Prefs {
    init(json: JSON?) {
        self.init()
        guard let j = json else { return }
        if let s = j["session"] {
            session.familiarity = s["familiarity"]?.bool ?? session.familiarity
            session.confidence = s["confidence"]?.bool ?? session.confidence
            session.dontKnow = s["dontKnow"]?.bool ?? session.dontKnow
            if let b = s["breaks"]?.int, [0, 5, 10].contains(b) { session.breaks = b }
        }
        if let v = j["voice"]?.string, Voice.all.contains(where: { $0.id == v }) { voice = v }
        if let w = j["writing"]?.string, Writing.all.contains(where: { $0.id == w }) { writing = w }
        if let g = j["game"] {
            game.xp = g["xp"]?.bool ?? true
            game.streak = g["streak"]?.bool ?? true
            game.quests = g["quests"]?.bool ?? true
            game.pops = g["pops"]?.bool ?? true
        }
        if let r = j["reading"] {
            if let v = r["size"]?.string, ["s", "m", "l", "xl"].contains(v) { reading.size = v }
            if let v = r["lessonFont"]?.string.flatMap(Face.init(rawValue:)) { reading.lessonFont = v }
            if let v = r["appFont"]?.string.flatMap(Face.init(rawValue:)) { reading.appFont = v }
            if let v = r["width"]?.string, ["narrow", "normal", "wide"].contains(v) { reading.width = v }
            if let v = r["motion"]?.string, ["system", "reduce", "full"].contains(v) { reading.motion = v }
        }
        sound = j["sound"]?.bool ?? false
        if let n = j["notify"] {
            notify.morning = n["morning"]?.bool ?? true
            notify.nudge = n["nudge"]?.bool ?? true
            notify.breaks = n["breaks"]?.bool ?? true
            notify.insights = n["insights"]?.bool ?? true
            notify.week = n["week"]?.bool ?? true
        }
    }
}

// Writing styles (src/lib/learning/voice.ts).
struct Writing: Identifiable, Sendable {
    let id: String, label: String, note: String
    let sample: String
    static let all: [Writing] = [
        .init(id: "balanced", label: "Balanced", note: "Clear and even", sample: "Profit is what the books say you earned. Cash is what you can actually spend today, and the two drift apart when money arrives late."),
        .init(id: "candid", label: "Candid", note: "Casual, blunt, swears", sample: "Look, profit is a story your accountant tells. Cash is whether the lights stay on. Mix those up and it will bite you in the ass."),
        .init(id: "concise", label: "Concise", note: "Only what matters", sample: "Profit: earned on paper. Cash: in the bank now. Late payments split them."),
        .init(id: "formal", label: "Formal", note: "Precise, academic", sample: "Profit measures revenue less expenses over a period; cash reflects actual receipts and payments. Timing differences between the two account for the divergence."),
        .init(id: "warm", label: "Warm", note: "Patient, encouraging", sample: "Here is the heart of it, and it trips up almost everyone at first: profit is what you earned, cash is what you have. They move apart when payments arrive late."),
    ]
}


// Practice voices (src/lib/practice/harness.ts); samples are bundled from
// public/voices.
struct Voice: Identifiable, Sendable {
    let id: String, label: String, note: String
    static let all: [Voice] = [
        .init(id: "cedar", label: "Cedar", note: "Grounded, North American"),
        .init(id: "willow", label: "Willow", note: "Warm, Irish"),
        .init(id: "meridian", label: "Meridian", note: "Clear, North American"),
        .init(id: "gleam", label: "Gleam", note: "Bright, North American"),
        .init(id: "vesper", label: "Vesper", note: "Measured, British"),
        .init(id: "stone", label: "Stone", note: "Low, Irish"),
    ]
}

// Device-only appearance, like the web's localStorage theme.
enum Theme: String, CaseIterable, Sendable {
    case system, dark, light
    var scheme: ColorScheme? {
        switch self { case .system: nil; case .dark: .dark; case .light: .light }
    }
    var label: String { rawValue.capitalized }
}
