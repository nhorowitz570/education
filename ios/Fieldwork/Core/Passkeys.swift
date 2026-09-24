import AuthenticationServices
import Foundation
import UIKit

// Passkeys through Supabase Auth's WebAuthn endpoints (the same ones
// supabase-js calls on the web: /auth/v1/passkeys/...). The relying party is
// edu.nhorowitz.co, so passkeys made on the web work here through iCloud
// Keychain, and ones made here work on the web.
@MainActor
final class Passkeys: NSObject {
    static let shared = Passkeys()

    enum Outcome { case done, cancelled }

    struct Listed: Decodable, Identifiable, Sendable {
        let id: String
        let friendly_name: String?
        let created_at: String
        let last_used_at: String?
    }

    // Sign in with any passkey for this domain; adopts the returned session.
    func signIn(auth: Auth) async throws -> Outcome {
        let start = try await request("passkeys/authentication/options", body: ["gotrue_meta_security": [String: String]()])
        guard let challengeId = start["challenge_id"]?.string,
              let options = start["options"],
              let challenge = options["challenge"]?.string.flatMap(Data.init(base64URL:))
        else { throw Failure("Passkey sign-in didn’t complete. Try again or use an email code.") }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options["rpId"]?.string ?? Config.relyingParty)
        let assertion = provider.createCredentialAssertionRequest(challenge: challenge)
        if let allowed = options["allowCredentials"]?.array {
            assertion.allowedCredentials = allowed.compactMap { $0["id"]?.string.flatMap(Data.init(base64URL:)) }
                .map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        }
        guard let credential = try await perform(assertion), let authenticatorData = credential.authenticatorData, let signature = credential.signature else { return .cancelled }
        let id = credential.id.base64URL
        var response: [String: String] = [
            "authenticatorData": authenticatorData.base64URL,
            "clientDataJSON": credential.clientData.base64URL,
            "signature": signature.base64URL,
        ]
        if let user = credential.userID, !user.isEmpty { response["userHandle"] = user.base64URL }
        let verified = try await request("passkeys/authentication/verify", body: [
            "challenge_id": challengeId,
            "credential": ["id": id, "rawId": id, "type": "public-key", "response": response, "clientExtensionResults": [String: String](), "authenticatorAttachment": "platform"] as [String: Any],
        ])
        let session = verified["session"] ?? verified
        guard let access = session["access_token"]?.string, let refresh = session["refresh_token"]?.string else {
            throw Failure("Passkey sign-in didn’t complete. Try again or use an email code.")
        }
        try await auth.adopt(accessToken: access, refreshToken: refresh)
        return .done
    }

    // Adds a passkey on this iPhone to the signed-in account.
    func register() async throws -> Outcome {
        let jwt = try await Auth.accessToken()
        let start = try await request("passkeys/registration/options", body: [:], jwt: jwt)
        guard let challengeId = start["challenge_id"]?.string,
              let options = start["options"],
              let challenge = options["challenge"]?.string.flatMap(Data.init(base64URL:)),
              let user = options["user"],
              let userId = user["id"]?.string.flatMap(Data.init(base64URL:))
        else { throw Failure("Couldn’t start adding a passkey. Try again.") }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options["rp"]?["id"]?.string ?? Config.relyingParty)
        let registration = provider.createCredentialRegistrationRequest(challenge: challenge, name: user["name"]?.string ?? "Fieldwork", userID: userId)
        if let excluded = options["excludeCredentials"]?.array {
            registration.excludedCredentials = excluded.compactMap { $0["id"]?.string.flatMap(Data.init(base64URL:)) }
                .map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        }
        guard let credential = try await perform(registration), let attestation = credential.attestation else { return .cancelled }
        let id = credential.id.base64URL
        _ = try await request("passkeys/registration/verify", body: [
            "challenge_id": challengeId,
            "credential": [
                "id": id, "rawId": id, "type": "public-key",
                "response": ["attestationObject": attestation.base64URL, "clientDataJSON": credential.clientData.base64URL, "transports": ["internal", "hybrid"]],
                "clientExtensionResults": [String: String](), "authenticatorAttachment": "platform",
            ] as [String: Any],
        ], jwt: jwt)
        return .done
    }

    func list() async throws -> [Listed] {
        let jwt = try await Auth.accessToken()
        let data = try await raw("passkeys", method: "GET", body: nil, jwt: jwt)
        return try JSONDecoder.api.decode([Listed].self, from: data)
    }

    func delete(_ id: String) async throws {
        let jwt = try await Auth.accessToken()
        _ = try await raw("passkeys/\(id)", method: "DELETE", body: nil, jwt: jwt)
    }

    // MARK: - Plumbing

    private func request(_ path: String, body: [String: Any], jwt: String? = nil) async throws -> JSON {
        let data = try await raw(path, method: "POST", body: body, jwt: jwt)
        return try JSONDecoder.api.decode(JSON.self, from: data)
    }

    private func raw(_ path: String, method: String, body: [String: Any]?, jwt: String?) async throws -> Data {
        var req = URLRequest(url: Config.supabaseURL.appending(path: "auth/v1/" + path))
        req.httpMethod = method
        req.setValue(Config.supabaseKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(jwt ?? Config.supabaseKey)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = try? JSONDecoder.api.decode(JSON.self, from: data)
            let code = json?["error_code"]?.string ?? json?["code"]?.string ?? ""
            switch code {
            case "passkey_disabled": throw Failure("Passkeys aren’t switched on yet. Use an email code.")
            case "webauthn_credential_not_found": throw Failure("No passkey for this account yet. Sign in with an email code, then add one in You.")
            default: throw Failure(json?["msg"]?.string ?? json?["message"]?.string ?? "Passkey sign-in didn’t complete. Try again or use an email code.")
            }
        }
        return data
    }

    // What the ceremony returned, copied out of AuthenticationServices' types.
    struct Signed: Sendable {
        let id: Data
        let clientData: Data
        var authenticatorData: Data?
        var signature: Data?
        var userID: Data?
        var attestation: Data?
    }

    private var continuation: CheckedContinuation<Signed?, Error>?

    private func perform(_ request: ASAuthorizationRequest) async throws -> Signed? {
        try await withCheckedThrowingContinuation { c in
            continuation = c
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }
}

extension Passkeys: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        var signed: Signed?
        if let a = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
            signed = Signed(id: a.credentialID, clientData: a.rawClientDataJSON, authenticatorData: a.rawAuthenticatorData, signature: a.signature, userID: a.userID)
        } else if let r = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
            signed = Signed(id: r.credentialID, clientData: r.rawClientDataJSON, attestation: r.rawAttestationObject)
        }
        let result = signed
        MainActor.assumeIsolated {
            continuation?.resume(returning: result)
            continuation = nil
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        MainActor.assumeIsolated {
            if (error as? ASAuthorizationError)?.code == .canceled {
                continuation?.resume(returning: nil)
            } else {
                continuation?.resume(throwing: Failure("Passkey sign-in didn’t complete. Try again or use an email code."))
            }
            continuation = nil
        }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first!
            return scene.keyWindow ?? UIWindow(windowScene: scene)
        }
    }
}

extension Data {
    init?(base64URL: String) {
        var s = base64URL.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while s.count % 4 != 0 { s += "=" }
        self.init(base64Encoded: s)
    }
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
