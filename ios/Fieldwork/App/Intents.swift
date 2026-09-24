import AppIntents

// Siri, Shortcuts and Spotlight: start today's session, ask the tutor, open
// practice. Each opens the app where the web would.
struct StartTodayIntent: AppIntent {
    static let title: LocalizedStringResource = "Start today’s session"
    static let description = IntentDescription("Opens Fieldwork and begins today’s session.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        Router.shared.open("/?begin=1")
        return .result()
    }
}

struct AskTutorIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask my tutor"
    static let description = IntentDescription("Opens the tutor with your question.")
    static let openAppWhenRun = true

    @Parameter(title: "Question", requestValueDialog: "What do you want to ask?")
    var question: String

    @MainActor
    func perform() async throws -> some IntentResult {
        Router.shared.tutorDraft = question
        Router.shared.tab = .tutor
        return .result()
    }
}

struct OpenPracticeIntent: AppIntent {
    static let title: LocalizedStringResource = "Practise a conversation"
    static let description = IntentDescription("Opens Practice to rehearse a conversation.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        Router.shared.open("/practice")
        return .result()
    }
}

struct FieldworkShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartTodayIntent(),
            phrases: ["Start today’s session in \(.applicationName)", "Start learning in \(.applicationName)"],
            shortTitle: "Start today",
            systemImageName: "play.fill"
        )
        AppShortcut(
            intent: AskTutorIntent(),
            phrases: ["Ask my tutor in \(.applicationName)", "Ask \(.applicationName)"],
            shortTitle: "Ask my tutor",
            systemImageName: "camera.aperture"
        )
        AppShortcut(
            intent: OpenPracticeIntent(),
            phrases: ["Practise a conversation in \(.applicationName)"],
            shortTitle: "Practise",
            systemImageName: "waveform"
        )
    }
}
