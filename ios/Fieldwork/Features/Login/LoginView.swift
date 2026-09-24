import SwiftUI

// Mirrors src/components/entry/login.tsx: passkey first, then an emailed
// code (the app can't follow the email's link, so it asks for the code).
struct LoginView: View {
    @Environment(Auth.self) private var auth
    @State private var stage: Stage = .email
    @State private var email = ""
    @State private var code = ""
    @State private var busy: Busy?
    @State private var message = ""
    @State private var cooldown = 0
    @FocusState private var focus: Field?

    enum Stage { case email, sent }
    enum Busy { case link, code, passkey }
    enum Field { case email, code }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                FieldMark(size: 36)
                    .padding(.bottom, 28)
                HStack(spacing: 8) {
                    Circle().fill(FW.Palette.finance).frame(width: 6, height: 6).shadow(color: FW.Palette.finance, radius: 5)
                    Kicker("Private")
                }
                .padding(.bottom, 14)
                if stage == .email { emailStage } else { codeStage }
                Text(message)
                    .font(.sans(14))
                    .foregroundStyle(FW.Palette.text2)
                    .padding(.top, 18)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            .padding(.horizontal, 24)
            .padding(.top, 72)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        // The way in is always the darkroom, as on the web.
        .environment(\.colorScheme, .dark)
        .task(id: cooldown) {
            guard cooldown > 0 else { return }
            try? await Task.sleep(for: .seconds(1))
            cooldown -= 1
        }
    }

    private var emailStage: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Sign in to Fieldwork")
                .font(.display(34))
                .foregroundStyle(FW.Palette.text)
                .padding(.bottom, 10)
            Text("A personal learning space. Access is by invitation, so there’s no sign-up.")
                .font(.sans(16))
                .foregroundStyle(FW.Palette.text2)
                .padding(.bottom, 32)
            Button {
                Task { await passkey() }
            } label: {
                Label(busy == .passkey ? "Waiting for your device…" : "Sign in with passkey", systemImage: "person.badge.key")
            }
            .buttonStyle(.fw(.primary, wide: true))
            .disabled(busy != nil)
            HStack(spacing: 12) {
                Rule()
                Text("or").font(.sans(13)).foregroundStyle(FW.Palette.text3)
                Rule()
            }
            .padding(.vertical, 22)
            Text("Email").font(.sans(13, .medium)).foregroundStyle(FW.Palette.text2).padding(.bottom, 8)
            TextField("you@example.com", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.send)
                .focused($focus, equals: .email)
                .onSubmit { Task { await send() } }
                .font(.sans(17))
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line2))
                .padding(.bottom, 12)
            Button {
                Task { await send() }
            } label: {
                Text(busy == .link ? "Sending…" : "Email me a code")
            }
            .buttonStyle(.fw(.secondary, wide: true))
            .disabled(busy != nil || !email.contains("@"))
        }
    }

    private var codeStage: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Check your inbox")
                .font(.display(34))
                .foregroundStyle(FW.Palette.text)
                .padding(.bottom, 10)
            (Text("If ") + Text(email.trimmingCharacters(in: .whitespaces)).foregroundStyle(FW.Palette.text) + Text(" has access, a code is on its way. Enter the \(Config.codeLength)-digit code here."))
                .font(.sans(16))
                .foregroundStyle(FW.Palette.text2)
                .padding(.bottom, 28)
            Text("Code").font(.sans(13, .medium)).foregroundStyle(FW.Palette.text2).padding(.bottom, 8)
            TextField(String(repeating: "0", count: Config.codeLength), text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .focused($focus, equals: .code)
                .multilineTextAlignment(.center)
                .font(.mono(28, .medium))
                .tracking(6)
                .frame(height: 64)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line2))
                .onChange(of: code) { _, v in
                    let digits = String(v.filter(\.isNumber).prefix(Config.codeLength))
                    if digits != v { code = digits }
                    if digits.count == Config.codeLength { Task { await verify(digits) } }
                }
                .disabled(busy == .code)
            HStack {
                Button(cooldown > 0 ? "Resend in \(cooldown)s" : "Resend") { Task { await send() } }
                    .disabled(cooldown > 0 || busy != nil)
                Spacer()
                Button("Use a different email") {
                    stage = .email
                    code = ""
                    message = ""
                }
            }
            .font(.sans(14))
            .foregroundStyle(FW.Palette.text2)
            .padding(.top, 18)
        }
        .onAppear { focus = .code }
    }

    private func send() async {
        let address = email.trimmingCharacters(in: .whitespaces)
        guard busy == nil, cooldown == 0, address.contains("@") else { return }
        busy = .link
        message = ""
        defer { busy = nil }
        do {
            try await auth.sendCode(to: address)
            stage = .sent
            cooldown = 60
        } catch {
            message = error.localizedDescription
        }
    }

    private func verify(_ value: String) async {
        guard busy == nil else { return }
        busy = .code
        message = ""
        do {
            try await auth.verify(email: email.trimmingCharacters(in: .whitespaces), code: value)
            Feedback.shared.play(.tap)
        } catch {
            code = ""
            message = error.localizedDescription
            Feedback.shared.play(.missed)
        }
        busy = nil
    }

    private func passkey() async {
        busy = .passkey
        message = ""
        defer { busy = nil }
        do {
            _ = try await Passkeys.shared.signIn(auth: auth)
        } catch {
            message = error.localizedDescription
        }
    }
}
