import Foundation
import Observation
import Supabase

// Sign-in, the same accounts as the web: a passkey first, an emailed
// 8-digit code as the fallback. Supabase keeps the session in the Keychain
// and refreshes it; the API client asks here for a fresh access token.
@MainActor @Observable
final class Auth {
    enum Phase: Equatable { case loading, signedOut, signedIn }

    static let supabase = SupabaseClient(
        supabaseURL: Config.supabaseURL,
        supabaseKey: Config.supabaseKey,
        options: .init(auth: .init(emitLocalSessionAsInitialSession: true))
    )

    private(set) var phase: Phase = .loading
    private(set) var userId: String?
    private(set) var email: String?
    private var watching = false

    func start() async {
        guard !watching else { return }
        watching = true
        #if DEBUG
        if Demo.on {
            userId = "demo"
            email = "nathan@example.com"
            phase = .signedIn
            return
        }
        #endif
        // Paint straight away from the stored session; the stream below
        // confirms or corrects it once the SDK has checked.
        if let s = Self.supabase.auth.currentSession {
            userId = s.user.id.uuidString.lowercased()
            email = s.user.email
            phase = .signedIn
        } else {
            phase = .signedOut
        }
        for await (_, session) in Self.supabase.auth.authStateChanges {
            var live = session
            if let s = session, s.isExpired { live = try? await Self.supabase.auth.refreshSession() }
            if let session = live {
                userId = session.user.id.uuidString.lowercased()
                email = session.user.email
                phase = .signedIn
            } else {
                userId = nil
                email = nil
                phase = .signedOut
            }
        }
    }

    // A valid access token, refreshed when close to expiry.
    nonisolated static func accessToken() async throws -> String {
        #if DEBUG
        if Demo.on { return "demo" }
        #endif
        return try await supabase.auth.session.accessToken
    }

    // Unknown addresses get the same answer as known ones, as on the web, so
    // the form can't be used to find out who has access.
    private static let noAccount = /signup|not allowed|user not found|otp_disabled/.ignoresCase()

    func sendCode(to email: String) async throws {
        do {
            try await Self.supabase.auth.signInWithOTP(email: email, shouldCreateUser: false)
        } catch {
            if "\(error)".contains(Self.noAccount) { return }
            if "\(error)".contains(/429|rate limit|over_email_send_rate_limit/.ignoresCase()) {
                throw Failure("Too many requests. Wait a minute, then try again.")
            }
            throw Failure(error.localizedDescription)
        }
    }

    func verify(email: String, code: String) async throws {
        do {
            try await Self.supabase.auth.verifyOTP(email: email, token: code, type: .email)
        } catch {
            throw Failure("That code didn’t work. Check the latest email or send a new one.")
        }
    }

    // After a 401: a fresh token might fix it (it expired in flight).
    nonisolated static func refresh() async -> Bool {
        #if DEBUG
        if Demo.on { return false }
        #endif
        return (try? await supabase.auth.refreshSession()) != nil
    }

    // The server still refuses the session: back to sign-in.
    nonisolated static func expired() async {
        #if DEBUG
        if Demo.on { return }
        #endif
        try? await supabase.auth.signOut(scope: .local)
    }

    func adopt(accessToken: String, refreshToken: String) async throws {
        try await Self.supabase.auth.setSession(accessToken: accessToken, refreshToken: refreshToken)
    }

    func signOut() async {
        try? await Self.supabase.auth.signOut()
        phase = .signedOut
        userId = nil
    }
}

struct Failure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
