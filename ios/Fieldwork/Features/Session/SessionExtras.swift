import Foundation
import Observation

// What a session knows beyond its own steps (session/extras.tsx): the
// learner's notes on each step, and ideas met in earlier sessions so a
// lesson can point back to them.
@MainActor @Observable
final class SessionExtras {
    struct Note: Codable, Identifiable, Hashable, Sendable {
        var id: String
        var run_id: String
        var beat_id: String
        var concept_key: String?
        var quote: String?
        var text: String
        var created_at: String
    }
    struct Draft: Equatable { var beatId: String; var quote: String?; var id: String?; var text: String }
    struct Term: Codable, Identifiable, Hashable, Sendable {
        var key: String
        var title: String
        var track: String
        var strength: Double
        var level: String
        var words: String?
        var phrases: [String]
        var id: String { key }
    }

    let runId: String
    private(set) var notes: [Note] = []
    var draft: Draft?
    private(set) var saving = false
    var noteError: String?
    private(set) var terms: [Term] = []
    var openTerm: Term?

    init(runId: String) { self.runId = runId }

    func load() async {
        struct N: Decodable { let notes: [Note] }
        struct T: Decodable { let terms: [Term] }
        await flush()
        if let n: N = try? await API.get("/api/notes?run=\(runId)") {
            notes = n.notes + pending().filter { $0.body.runId == runId }.map(\.note)
        }
        if let t: T = try? await API.get("/api/notebook?terms=1&run=\(runId)") {
            terms = t.terms.map { $0.phrases.isEmpty ? Term(key: $0.key, title: $0.title, track: $0.track, strength: $0.strength, level: $0.level, words: $0.words, phrases: Self.phrases($0.title)) : $0 }
        }
    }

    func start(_ beatId: String, quote: String? = nil) {
        noteError = nil
        draft = Draft(beatId: beatId, quote: quote, text: "")
    }

    func edit(_ n: Note) {
        noteError = nil
        draft = Draft(beatId: n.beat_id, quote: n.quote, id: n.id, text: n.text)
    }

    func save() async {
        guard let d = draft, !d.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        saving = true
        defer { saving = false }
        let waiting = d.id?.hasPrefix("pending:") == true
        let body = Body(id: waiting ? nil : d.id, runId: runId, beatId: d.beatId, text: d.text.trimmingCharacters(in: .whitespacesAndNewlines), quote: d.quote)
        struct R: Decodable { let note: Note }
        do {
            let r: R = try await API.post("/api/notes", body)
            if waiting, let id = d.id { drop(id) }
            notes = notes.filter { $0.id != r.note.id && $0.id != d.id } + [r.note]
            draft = nil
        } catch let e as APIError where e.status == 0 {
            // Offline: kept on the device and sent once the app is back online.
            let key = d.id ?? "pending:" + UUID().uuidString.lowercased()
            keep(key, body)
            notes = notes.filter { $0.id != key } + [Pending(key: key, body: body).note]
            draft = nil
        } catch {
            noteError = error.localizedDescription
        }
    }

    func remove(_ id: String) async {
        notes.removeAll { $0.id == id }
        if id.hasPrefix("pending:") { drop(id); return }
        _ = try? await API.delete("/api/notes", ["id": id])
    }

    func notes(for beatId: String) -> [Note] { notes.filter { $0.beat_id == beatId && $0.id != draft?.id } }

    // MARK: Known terms

    // Phrases worth recognising in a lesson: the whole title, and its halves
    // when it's a comparison ("Profit vs cash").
    nonisolated static func phrases(_ title: String) -> [String] {
        let clean = title.replacingOccurrences(of: #"[“”"()]"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        let parts = clean.split(separator: /\s+(?:vs\.?|versus|and|or|&)\s+|:\s+|,\s+|\s+[–—-]\s+/.ignoresCase())
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.count >= 5 && !["the", "a", "an", "why", "how", "what"].contains($0.lowercased()) }
        var out: [String] = []
        if clean.count >= 4, clean.split(separator: " ").count <= 5 { out.append(clean) }
        for p in parts where p.split(separator: " ").count <= 4 && !out.contains(p) { out.append(p) }
        return out.map { $0.lowercased() }.sorted { $0.count > $1.count }
    }

    // Marks the first mention of each earlier idea in a step's text as a
    // link (fwterm:<key>), skipping the step's own idea. Longer phrases win,
    // whole words only (a plural "s" allowed), each idea once.
    func decorate(_ blocks: [Block], except: String?) -> [Block] {
        guard !terms.isEmpty else { return blocks }
        var used: Set<String> = except.map { [$0] } ?? []
        let candidates = terms.flatMap { t in t.phrases.map { ($0, t) } }.sorted { $0.0.count > $1.0.count }
        return blocks.map { block in
            guard block.type != "visual", let md = block.md else { return block }
            var hits: [(Range<String.Index>, Term)] = []
            let lower = md.lowercased()
            for (phrase, term) in candidates where !used.contains(term.key) {
                var from = lower.startIndex
                while let r = lower.range(of: phrase, range: from..<lower.endIndex) {
                    var end = r.upperBound
                    if end < lower.endIndex, lower[end] == "s", lower.index(after: end) == lower.endIndex || !lower[lower.index(after: end)].isLetterOrDigit { end = lower.index(after: end) }
                    let before = r.lowerBound > lower.startIndex ? lower[lower.index(before: r.lowerBound)] : " "
                    let after = end < lower.endIndex ? lower[end] : " "
                    let inLink = lower[..<r.lowerBound].last(where: { $0 == "[" || $0 == "]" }) == "["
                    if !before.isLetterOrDigit, !after.isLetterOrDigit, !inLink, !hits.contains(where: { $0.0.overlaps(r.lowerBound..<end) }) {
                        hits.append((r.lowerBound..<end, term))
                        used.insert(term.key)
                        break
                    }
                    from = lower.index(after: r.lowerBound)
                }
            }
            // Lowercasing can change length in rare scripts; then skip marking.
            guard !hits.isEmpty, lower.count == md.count else { return block }
            var out = md
            for (range, term) in hits.sorted(by: { $0.0.lowerBound > $1.0.lowerBound }) {
                let lo = out.index(out.startIndex, offsetBy: lower.distance(from: lower.startIndex, to: range.lowerBound))
                let hi = out.index(out.startIndex, offsetBy: lower.distance(from: lower.startIndex, to: range.upperBound))
                out.replaceSubrange(lo..<hi, with: "[\(out[lo..<hi])](fwterm:\(term.key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? term.key))")
            }
            var b = block
            b.md = out
            return b
        }
    }

    func term(for url: URL) -> Term? {
        guard url.scheme == "fwterm" else { return nil }
        let key = url.absoluteString.dropFirst("fwterm:".count).removingPercentEncoding ?? ""
        return terms.first { $0.key == key }
    }

    // MARK: Offline notes

    struct Body: Codable { var id: String?; var runId: String; var beatId: String; var text: String; var quote: String? }
    struct Pending: Codable {
        var key: String
        var body: Body
        var note: Note { Note(id: key, run_id: body.runId, beat_id: body.beatId, quote: body.quote, text: body.text, created_at: Stamp.now()) }
    }
    private static let store = "fw.pending-notes"
    private func pending() -> [Pending] {
        (UserDefaults.standard.data(forKey: Self.store)).flatMap { try? JSONDecoder().decode([Pending].self, from: $0) } ?? []
    }
    private func keep(_ key: String, _ body: Body) {
        let list = pending().filter { $0.key != key } + [Pending(key: key, body: body)]
        UserDefaults.standard.set(try? JSONEncoder().encode(list), forKey: Self.store)
    }
    private func drop(_ key: String) {
        UserDefaults.standard.set(try? JSONEncoder().encode(pending().filter { $0.key != key }), forKey: Self.store)
    }
    private func flush() async {
        struct R: Decodable { let note: Note }
        for p in pending() {
            do {
                let _: R = try await API.post("/api/notes", p.body)
                drop(p.key)
            } catch let e as APIError where e.status == 0 {
                return
            } catch {
                drop(p.key)
            }
        }
    }
}

private extension Character {
    var isLetterOrDigit: Bool { isLetter || isNumber }
}
