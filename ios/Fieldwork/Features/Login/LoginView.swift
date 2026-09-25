import SwiftUI

// Mirrors src/components/entry/login.tsx: passkey first, then an emailed
// code (the app can't follow the email's link, so it asks for the code).
// Always in the darkroom. The aperture opens into place, and turns while
// it's waiting on the device or the server.
struct LoginView: View {
    @Environment(Auth.self) private var auth
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stage: Stage = .email
    @State private var email = ""
    @State private var code = ""
    @State private var busy: Busy?
    @State private var message = ""
    @State private var cooldown = 0
    @State private var shown = false
    @State private var misses = 0
    @FocusState private var focus: Field?

    enum Stage { case email, sent }
    enum Busy { case link, code, passkey }
    enum Field { case email, code }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                mark
                    .padding(.top, 64)
                    .padding(.bottom, 30)
                ZStack(alignment: .top) {
                    if stage == .email {
                        emailStage.transition(slide(from: .leading))
                    } else {
                        codeStage.transition(slide(from: .trailing))
                    }
                }
                if !message.isEmpty {
                    Label(message, systemImage: "exclamationmark.circle.fill")
                        .font(.sans(14, .medium))
                        .foregroundStyle(FW.Palette.text2)
                        .labelStyle(YouLoginNoteStyle())
                        .padding(.top, 20)
                        .transition(.opacity.combined(with: .offset(y: -6)))
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
            .animation(Springs.snappy, value: message)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .background(backdrop)
        // The way in is always the darkroom, as on the web.
        .environment(\.colorScheme, .dark)
        .task(id: cooldown) {
            guard cooldown > 0 else { return }
            try? await Task.sleep(for: .seconds(1))
            cooldown -= 1
        }
        .onAppear {
            withAnimation(reduceMotion ? .easeOut(duration: 0.2) : Springs.bouncy.delay(0.05)) { shown = true }
        }
    }

    // MARK: Pieces

    private var backdrop: some View {
        ZStack(alignment: .top) {
            FW.Palette.bg
            RadialGradient(colors: [FW.Palette.accent.opacity(0.10), .clear], center: .top, startRadius: 0, endRadius: 420)
                .frame(height: 520)
                .opacity(shown ? 1 : 0)
                .animation(.easeOut(duration: 1.2), value: shown)
        }
        .ignoresSafeArea()
        .environment(\.colorScheme, .dark)
    }

    // The aperture opens into place (the app's icon), then turns while busy.
    private var mark: some View {
        Aperture(size: 72, busy: busy != nil)
            .shadow(color: FW.Palette.accent.opacity(0.25), radius: 24)
            .scaleEffect(shown || reduceMotion ? 1 : 0.4)
            .rotationEffect(.degrees(shown || reduceMotion ? 0 : -120))
            .opacity(shown ? 1 : 0)
            .accessibilityLabel("Fieldwork")
    }

    private func slide(from edge: Edge) -> AnyTransition {
        guard !reduceMotion else { return .opacity }
        return .asymmetric(
            insertion: .move(edge: edge == .leading ? .leading : .trailing).combined(with: .opacity),
            removal: .move(edge: edge == .leading ? .leading : .trailing).combined(with: .opacity)
        )
    }

    private func heading(_ title: String, _ line: Text) -> some View {
        VStack(spacing: 10) {
            Text(title)
                .font(.display(34))
                .foregroundStyle(FW.Palette.text)
                .multilineTextAlignment(.center)
                .rise(1)
            line
                .font(.sans(16))
                .foregroundStyle(FW.Palette.text2)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
                .rise(2)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Email

    private var emailStage: some View {
        VStack(spacing: 0) {
            heading("Sign in to Fieldwork", Text("A personal learning space. Access is by invitation, so there’s no sign-up."))
                .padding(.bottom, 36)
            Button {
                Task { await passkey() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "person.badge.key.fill")
                        .font(.system(size: 19, weight: .semibold))
                        .symbolEffect(.bounce, value: busy == .passkey)
                    Text(busy == .passkey ? "Waiting for your device…" : "Sign in with passkey")
                        .contentTransition(.opacity)
                }
                .font(.sans(17, .semibold))
                .frame(height: 60)
            }
            .buttonStyle(.fw(.primary, wide: true))
            .disabled(busy != nil)
            .rise(3)
            HStack(spacing: 12) {
                Rule()
                Text("or").font(.sans(13, .medium)).foregroundStyle(FW.Palette.text3)
                Rule()
            }
            .padding(.vertical, 24)
            .rise(4)
            VStack(spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: "envelope.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(focus == .email ? FW.Palette.accent : FW.Palette.text3)
                        .accessibilityHidden(true)
                    TextField("", text: $email, prompt: Text("you@example.com").foregroundStyle(FW.Palette.text3))
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.send)
                        .focused($focus, equals: .email)
                        .onSubmit { Task { await send() } }
                        .font(.sans(17))
                        .foregroundStyle(FW.Palette.text)
                        .accessibilityLabel("Email")
                }
                .padding(.horizontal, 18)
                .frame(height: 56)
                .background(FW.Palette.surface, in: .capsule)
                .overlay(Capsule().strokeBorder(focus == .email ? FW.Palette.accent.opacity(0.7) : FW.Palette.line2, lineWidth: focus == .email ? 1.5 : 1))
                .animation(Springs.snappy, value: focus)
                .contentShape(.capsule)
                .onTapGesture { focus = .email }
                Button {
                    Task { await send() }
                } label: {
                    HStack(spacing: 8) {
                        if busy == .link { ProgressView().controlSize(.small) }
                        Text(busy == .link ? "Sending…" : "Email me a code")
                    }
                }
                .buttonStyle(.fw(.secondary, wide: true))
                .disabled(busy != nil || !email.contains("@"))
            }
            .rise(5)
        }
    }

    // MARK: Code

    private var codeStage: some View {
        let address = email.trimmingCharacters(in: .whitespaces)
        return VStack(spacing: 0) {
            heading("Check your inbox", Text("If \(Text(address).foregroundStyle(FW.Palette.text)) has access, a code is on its way. Enter the \(Config.codeLength)-digit code here."))
                .padding(.bottom, 32)
            ZStack {
                // One real field takes the typing and the code iOS offers
                // from Mail or Messages; the boxes just draw it.
                TextField("", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .focused($focus, equals: .code)
                    .foregroundStyle(.clear)
                    .tint(.clear)
                    .opacity(0.02)
                    .accessibilityLabel("\(Config.codeLength)-digit code")
                    .onChange(of: code) { _, v in
                        let digits = String(v.filter(\.isNumber).prefix(Config.codeLength))
                        if digits != v { code = digits }
                        if digits.count == Config.codeLength { Task { await verify(digits) } }
                    }
                    .disabled(busy == .code)
                CodeBoxes(code: code, length: Config.codeLength, focused: focus == .code, checking: busy == .code)
                    .modifier(Shake(travel: misses))
                    .contentShape(.rect)
                    .onTapGesture { focus = .code }
                    .accessibilityHidden(true)
            }
            .frame(height: 58)
            .rise(3)
            Group {
                if busy == .code {
                    ShimmerText(text: "Checking…", font: .sans(14, .medium))
                } else {
                    Color.clear
                }
            }
            .frame(height: 20)
            .padding(.top, 14)
            HStack {
                Button {
                    Task { await send() }
                } label: {
                    Label(cooldown > 0 ? "Resend in \(cooldown)s" : "Resend", systemImage: "arrow.clockwise")
                        .contentTransition(.numericText(countsDown: true))
                }
                .disabled(cooldown > 0 || busy != nil)
                Spacer()
                Button {
                    withAnimation(reduceMotion ? .easeOut(duration: 0.2) : Springs.smooth) {
                        stage = .email
                        code = ""
                        message = ""
                    }
                } label: {
                    Text("Use a different email")
                }
            }
            .font(.sans(15, .medium))
            .foregroundStyle(FW.Palette.text2)
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .padding(.top, 8)
            .rise(4)
        }
        .onAppear {
            Task {
                try? await Task.sleep(for: .milliseconds(350))
                focus = .code
            }
        }
    }

    // MARK: Behaviour

    private func send() async {
        let address = email.trimmingCharacters(in: .whitespaces)
        guard busy == nil, cooldown == 0, address.contains("@") else { return }
        busy = .link
        message = ""
        defer { busy = nil }
        do {
            try await auth.sendCode(to: address)
            withAnimation(reduceMotion ? .easeOut(duration: 0.2) : Springs.smooth) { stage = .sent }
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
            withAnimation(reduceMotion ? nil : .linear(duration: 0.45)) { misses += 1 }
            withAnimation(Springs.snappy) { code = "" }
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

// MARK: - Code boxes

// One box per digit, in two groups of four. Digits spring in as they're
// typed; the next empty box carries a blinking caret.
private struct CodeBoxes: View {
    let code: String
    let length: Int
    let focused: Bool
    let checking: Bool

    var body: some View {
        let digits = Array(code)
        HStack(spacing: 6) {
            ForEach(0..<length, id: \.self) { i in
                box(i, digit: i < digits.count ? String(digits[i]) : nil, active: focused && !checking && i == min(digits.count, length - 1) && digits.count < length)
                if i == length / 2 - 1 {
                    Capsule().fill(FW.Palette.line3).frame(width: 8, height: 2).padding(.horizontal, 2)
                }
            }
        }
    }

    private func box(_ i: Int, digit: String?, active: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        return ZStack {
            shape.fill(digit != nil ? FW.Palette.surface2 : FW.Palette.surface)
            shape.strokeBorder(active || checking ? FW.Palette.accent.opacity(checking ? 0.45 : 1) : digit != nil ? FW.Palette.line3 : FW.Palette.line2,
                               lineWidth: active ? 2 : 1)
            if let digit {
                Text(digit)
                    .font(.rounded(26, .semibold))
                    .foregroundStyle(FW.Palette.text)
                    .transition(.asymmetric(insertion: .scale(scale: 0.3).combined(with: .opacity).combined(with: .offset(y: 8)), removal: .opacity))
            } else if active {
                Caret()
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 58)
        .scaleEffect(active ? 1.04 : 1)
        .animation(Springs.bouncy, value: digit)
        .animation(Springs.snappy, value: active)
        .animation(Springs.snappy, value: checking)
    }
}

private struct Caret: View {
    @State private var on = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Capsule().fill(FW.Palette.accent).frame(width: 2, height: 24)
            .opacity(on ? 1 : 0.1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) { on = false }
            }
    }
}

// A quick side-to-side "no" when a code is wrong.
private struct Shake: GeometryEffect {
    var travel: Int
    var animatableData: CGFloat
    init(travel: Int) {
        self.travel = travel
        animatableData = CGFloat(travel)
    }
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 9 * sin(animatableData * .pi * 4), y: 0))
    }
}

// A note under the form: its glyph, then the words.
private struct YouLoginNoteStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon.foregroundStyle(FW.Palette.negative)
            configuration.title.fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
    }
}
