import Foundation

// What the Home Screen widget shows, written by the app whenever Today
// loads and read by the widget from the shared app group.
struct Glance: Codable, Equatable, Sendable {
    var date: String
    // Today's session, or nil on a free day.
    var title: String?
    var track: String?
    var minutes: Int?
    var done: Bool
    // Weekly streak, when the learner shows it (You → Game).
    var streak: Int?
    var week: [Bool?] // Mon…Sun: done, missed, or not a learning day

    static let key = "fw.glance"
    static let group = "group.co.nhorowitz.fieldwork"

    static func load() -> Glance? {
        guard let data = UserDefaults(suiteName: group)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Glance.self, from: data)
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults(suiteName: Self.group)?.set(data, forKey: Self.key)
    }

    static let sample = Glance(date: "2026-09-24", title: "Reading a cash flow statement", track: "finance", minutes: 45, done: false, streak: 6, week: [true, true, nil, false, nil, nil, nil])
}
