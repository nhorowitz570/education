import Observation
import SwiftUI

// Navigation that understands the web's paths, so tutor actions,
// notifications and Siri can all say "/practice" or "/session/<id>" and land
// in the same place on either platform.
enum AppTab: String, Hashable, CaseIterable {
    case today, practice, tutor, notebook, you
}

enum Destination: Hashable {
    case mastery, insights, learn, importPlan, memory
    case concept(String)
    case practiceFeedback(String)
}

enum Cover: Identifiable, Hashable {
    case session(String)
    case practice(String)
    var id: String {
        switch self {
        case .session(let id): "session:\(id)"
        case .practice(let id): "practice:\(id)"
        }
    }
}

@MainActor @Observable
final class Router {
    static let shared = Router()

    var tab: AppTab = .today
    var paths: [AppTab: NavigationPath] = [:]
    var cover: Cover?
    // Set by "Start today's session" (tutor action, Siri, widget); Today
    // picks it up and begins.
    var beginToday = false
    // A question handed to the tutor from elsewhere (Siri, "Ask about this").
    var tutorDraft: String?

    func path(_ tab: AppTab) -> Binding<NavigationPath> {
        Binding(get: { self.paths[tab] ?? NavigationPath() }, set: { self.paths[tab] = $0 })
    }

    func push(_ d: Destination, on tab: AppTab? = nil) {
        let t = tab ?? self.tab
        self.tab = t
        var p = paths[t] ?? NavigationPath()
        p.append(d)
        paths[t] = p
    }

    func open(_ path: String) {
        let parts = path.split(separator: "?").first.map { $0.split(separator: "/").map(String.init) } ?? []
        let query = path.contains("?") ? String(path.split(separator: "?").last ?? "") : ""
        cover = nil
        switch parts.first {
        case nil, "today":
            tab = .today
            paths[.today] = NavigationPath()
            if query.contains("begin=1") { beginToday = true }
        case "session" where parts.count > 1: cover = .session(parts[1])
        case "practice":
            if parts.count > 1 { cover = .practice(parts[1]) } else { tab = .practice; paths[.practice] = NavigationPath() }
        case "notebook": tab = .notebook; paths[.notebook] = NavigationPath()
        case "you":
            tab = .you
            paths[.you] = NavigationPath()
            if query.contains("memory=") { push(.memory, on: .you) }
        case "tutor": tab = .tutor
        case "mastery": push(.mastery, on: .today)
        case "insights": push(.insights, on: .today)
        case "learn": push(.learn, on: .today)
        case "import": push(.importPlan, on: .you)
        default: tab = .today
        }
    }
}
