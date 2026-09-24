import UIKit
import UserNotifications

// APNs registration. The device token goes to /api/push, which keeps it
// alongside web push subscriptions; the server sends through APNs with the
// same per-kind switches as the web (You → Notifications). Builds run from
// Xcode get sandbox tokens, TestFlight/App Store builds production ones.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await Push.register(token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("APNs registration failed:", error.localizedDescription)
        #endif
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let path = response.notification.request.content.userInfo["url"] as? String ?? "/"
        Task { @MainActor in Router.shared.open(path) }
        completionHandler()
    }
}

enum Push {
    static var sandbox: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    private static let saved = "fw.push.token"

    // Asks once (after sign-in) and registers; later launches just refresh
    // the token so the server always has the current one.
    @MainActor
    static func enable(ask: Bool) async -> Bool {
        let center = UNUserNotificationCenter.current()
        var status = await center.notificationSettings().authorizationStatus
        if status == .notDetermined, ask {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            status = await center.notificationSettings().authorizationStatus
        }
        guard status == .authorized || status == .provisional else { return false }
        UIApplication.shared.registerForRemoteNotifications()
        return true
    }

    static func register(_ token: String) async {
        struct Body: Encodable { let apns: String; let sandbox: Bool }
        do {
            let _: JSON = try await API.post("/api/push", Body(apns: token, sandbox: sandbox))
            UserDefaults.standard.set(token, forKey: saved)
        } catch {}
    }

    // Forgets this iPhone on the server (sign-out).
    static func unregister() async {
        guard let token = UserDefaults.standard.string(forKey: saved) else { return }
        _ = try? await API.delete("/api/push?apns=\(token)")
        UserDefaults.standard.removeObject(forKey: saved)
    }
}
