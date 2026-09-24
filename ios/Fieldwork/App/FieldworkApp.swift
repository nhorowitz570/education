import SwiftUI

@main
struct FieldworkApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var auth = Auth()
    @State private var store = Store()
    @State private var router = Router.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(store)
                .environment(router)
                .task {
                    ToastWindow.install()
                    await auth.start()
                }
                .onOpenURL { url in
                    // fieldwork://today, fieldwork://session/<id> … from the
                    // widget and Shortcuts.
                    router.open("/" + [url.host(), url.path()].compactMap { $0 }.joined().trimmingCharacters(in: CharacterSet(charactersIn: "/")) + (url.query().map { "?" + $0 } ?? ""))
                }
        }
    }
}

struct RootView: View {
    @Environment(Auth.self) private var auth
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    // Appearance is per device, like the web's localStorage theme.
    @AppStorage("fw.theme") private var theme: Theme = .system

    var body: some View {
        Group {
            switch auth.phase {
            case .loading:
                FW.Palette.bg.ignoresSafeArea()
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabs()
                    .task(id: auth.userId) {
                        guard let id = auth.userId else { return }
                        await store.open(owner: id)
                        _ = await Push.enable(ask: true)
                    }
            }
        }
        .preferredColorScheme(auth.phase == .signedIn ? theme.scheme : .dark)
        .tint(FW.Palette.accent)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, auth.phase == .signedIn { Task { await store.refresh() } }
        }
    }
}

struct MainTabs: View {
    @Environment(Router.self) private var router

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.tab) {
            Tab("Today", systemImage: "sun.horizon", value: AppTab.today) {
                NavigationStack(path: router.path(.today)) { TodayView().destinations() }
            }
            Tab("Practice", systemImage: "waveform", value: AppTab.practice) {
                NavigationStack(path: router.path(.practice)) { PracticeHome().destinations() }
            }
            Tab("Tutor", systemImage: "camera.aperture", value: AppTab.tutor) {
                NavigationStack(path: router.path(.tutor)) { TutorView().destinations() }
            }
            Tab("Notebook", systemImage: "book.closed", value: AppTab.notebook) {
                NavigationStack(path: router.path(.notebook)) { NotebookView().destinations() }
            }
            Tab("You", systemImage: "person.crop.circle", value: AppTab.you) {
                NavigationStack(path: router.path(.you)) { YouView().destinations() }
            }
        }
        .fullScreenCover(item: $router.cover) { cover in
            switch cover {
            case .session(let id): SessionView(runId: id)
            case .practice(let id): PracticeCallView(practiceId: id)
            }
        }
    }
}

extension View {
    func destinations() -> some View {
        navigationDestination(for: Destination.self) { d in
            switch d {
            case .mastery: MasteryView()
            case .insights: InsightsView()
            case .learn: LearnView()
            case .importPlan: ImportView()
            case .memory: MemoryView()
            case .concept(let key): NotebookEntryView(conceptKey: key)
            case .practiceFeedback(let id): PracticeFeedbackView(practiceId: id)
            }
        }
    }
}
