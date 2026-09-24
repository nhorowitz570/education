import Observation
import SwiftUI

// Page-level pieces shared by every screen, mirroring the web's .page-head,
// .rows/.row, .meter, .dot, segmented controls, sheets and toasts.

// Eyebrow + serif title at the top of a screen (web: .page-head).
struct PageHead<Trailing: View>: View {
    let eyebrow: String
    let title: String
    var subtitle: String? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Kicker(eyebrow)
                Text(title)
                    .font(.display(32))
                    .foregroundStyle(FW.Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle {
                    Text(subtitle).font(.sans(13)).foregroundStyle(FW.Palette.text3)
                }
            }
            Spacer(minLength: 0)
            trailing()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension PageHead where Trailing == EmptyView {
    init(eyebrow: String, title: String, subtitle: String? = nil) {
        self.init(eyebrow: eyebrow, title: title, subtitle: subtitle) { EmptyView() }
    }
}

// A section eyebrow with an optional trailing note (web: .eyebrow rows).
struct SectionHead: View {
    let title: String
    var trailing: String? = nil
    var body: some View {
        HStack {
            Kicker(title)
            Spacer()
            if let trailing { Text(trailing).font(.mono(11)).foregroundStyle(FW.Palette.text3) }
        }
    }
}

// 8pt dot in a subject hue; hollow for not-yet, lit adds a faint glow.
struct Dot: View {
    var color: Color = FW.Palette.text2
    var hollow = false
    var lit = false
    var size: CGFloat = 8
    var body: some View {
        Circle()
            .fill(hollow ? .clear : color)
            .overlay(Circle().strokeBorder(hollow ? color : .clear, lineWidth: 1.5))
            .frame(width: size, height: size)
            .shadow(color: lit ? color.opacity(0.6) : .clear, radius: lit ? 5 : 0)
    }
}

// A 4pt progress meter (web: .meter), with an optional "before" marker.
struct Meter: View {
    var value: Double
    var color: Color = FW.Palette.text
    var before: Double? = nil
    var height: CGFloat = 4
    @State private var shown: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(FW.Palette.surface2)
                if let before {
                    Capsule().fill(FW.Palette.text4).frame(width: geo.size.width * min(max(before, 0), 1))
                }
                Capsule().fill(color).frame(width: geo.size.width * min(max(shown, 0), 1))
            }
        }
        .frame(height: height)
        .onAppear {
            shown = before ?? 0
            withAnimation(reduceMotion ? nil : .easeOut(duration: 1.1).delay(0.2)) { shown = value }
        }
        .onChange(of: value) { _, v in withAnimation(.easeOut(duration: FW.Motion.slow)) { shown = v } }
        .accessibilityHidden(true)
    }
}

// A settings/index row: glyph, title, detail, value, chevron (web: IndexRow).
struct IndexRow<Accessory: View>: View {
    let icon: String
    let title: String
    var detail: String? = nil
    var value: String? = nil
    var tint: Color = FW.Palette.text2
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.sm))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                if let detail { Text(detail).font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true) }
            }
            Spacer(minLength: 8)
            if let value { Text(value).font(.sans(14)).foregroundStyle(FW.Palette.text2).lineLimit(1) }
            accessory()
        }
        .padding(.vertical, 10)
        .frame(minHeight: 56)
        .contentShape(.rect)
    }
}

extension IndexRow where Accessory == Image {
    init(icon: String, title: String, detail: String? = nil, value: String? = nil, tint: Color = FW.Palette.text2) {
        self.init(icon: icon, title: title, detail: detail, value: value, tint: tint) {
            Image(systemName: "chevron.right")
        }
    }
}

// Segmented control in the web's style (surface track, surface-3 thumb).
struct Segmented<T: Hashable>: View {
    let options: [(T, String)]
    @Binding var selection: T
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let on = option.0 == selection
                Button {
                    withAnimation(.snappy(duration: 0.25)) { selection = option.0 }
                    Feedback.shared.play(.tap)
                } label: {
                    Text(option.1)
                        .font(.sans(13, on ? .semibold : .regular))
                        .foregroundStyle(on ? FW.Palette.text : FW.Palette.text2)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background {
                            if on {
                                RoundedRectangle(cornerRadius: 9).fill(FW.Palette.surface3).matchedGeometryEffect(id: "thumb", in: ns)
                            }
                        }
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(FW.Palette.surface, in: .rect(cornerRadius: 12))
    }
}

// Sheet chrome: title, subtitle and a close button, on the raised surface.
struct SheetScaffold<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    @ViewBuilder var content: () -> Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let subtitle {
                        Text(subtitle).font(.sans(14)).foregroundStyle(FW.Palette.text2).fixedSize(horizontal: false, vertical: true)
                    }
                    content()
                }
                .padding(.horizontal, FW.Size.gutter + 4)
                .padding(.bottom, 32)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                }
            }
            .background(FW.Palette.raised)
        }
        .presentationCornerRadius(FW.Radius.xl)
        .presentationBackground(FW.Palette.raised)
    }
}

// Toasts: short confirmations at the bottom, at most two, optional action.
@MainActor @Observable
final class Toasts {
    static let shared = Toasts()
    struct Item: Identifiable, Equatable {
        let id = UUID()
        let message: String
        var action: String?
        static func == (a: Item, b: Item) -> Bool { a.id == b.id }
    }
    private(set) var items: [Item] = []
    private var actions: [UUID: () -> Void] = [:]

    func show(_ message: String, action: String? = nil, run: (() -> Void)? = nil) {
        let item = Item(message: message, action: action)
        if let run { actions[item.id] = run }
        withAnimation(.spring(duration: 0.4)) {
            items.append(item)
            if items.count > 2 { items.removeFirst() }
        }
        Task {
            try? await Task.sleep(for: .milliseconds(action == nil ? 3200 : 6000))
            dismiss(item.id)
        }
    }

    func run(_ id: UUID) {
        actions[id]?()
        dismiss(id)
    }

    func dismiss(_ id: UUID) {
        withAnimation(.easeOut(duration: FW.Motion.base)) { items.removeAll { $0.id == id } }
        actions[id] = nil
    }
}

struct ToastLayer: View {
    @State private var toasts = Toasts.shared
    var body: some View {
        VStack(spacing: 8) {
            ForEach(toasts.items) { t in
                HStack(spacing: 14) {
                    Text(t.message).font(.sans(14)).foregroundStyle(FW.Palette.text)
                    if let action = t.action {
                        Button(action) { toasts.run(t.id) }
                            .font(.sans(14, .semibold))
                            .foregroundStyle(FW.Palette.accent)
                    }
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 16)
                .background(FW.Palette.surface3, in: .rect(cornerRadius: 16))
                .shadow(color: .black.opacity(0.4), radius: 18, y: 10)
                .transition(.move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.96)))
                .onTapGesture { toasts.dismiss(t.id) }
            }
        }
        .padding(.bottom, 90)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .allowsHitTesting(!toasts.items.isEmpty)
    }
}

// Learner model levels (src/lib/learning/model.ts).
func levelLabel(_ level: String?) -> String {
    switch level {
    case "new": "Not started"
    case "learning": "Learning"
    case "practiced", "practised": "Practised"
    case "solid": "Solid"
    case "mastered": "Mastered"
    default: level?.capitalized ?? ""
    }
}

func verdictColor(_ verdict: String?) -> Color {
    switch verdict {
    case "solid": FW.Palette.positive
    case "partial": FW.Palette.caution
    case "missed": FW.Palette.negative
    default: FW.Palette.text3
    }
}

// "Sep 24", "Wed, Sep 24" and friends for YYYY-MM-DD or ISO strings.
enum Dates {
    static func parse(_ s: String?) -> Date? {
        guard let s else { return nil }
        return s.count <= 10 ? Day.date(s) : Stamp.parse(s)
    }
    static func short(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        return d.formatted(.dateTime.month(.abbreviated).day())
    }
    static func weekdayShort(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        return d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }
    static func weekday(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        return d.formatted(.dateTime.weekday(.wide))
    }
}

// Loads one API route with stale-while-revalidate, like src/lib/client/cached.ts:
// paint the last response, refetch, and refetch when the app returns.
@MainActor @Observable
final class Loader<T: Decodable & Sendable> {
    private(set) var value: T?
    private(set) var error: String?
    private(set) var loading = false
    let path: String
    private static var memory: [String: Any] { get { LoaderCache.values } set { LoaderCache.values = newValue } }

    init(_ path: String) {
        self.path = path
        value = Self.memory[path] as? T
    }

    func load() async {
        loading = true
        defer { loading = false }
        do {
            let v: T = try await API.get(path)
            value = v
            error = nil
            Self.memory[path] = v
        } catch is CancellationError {
        } catch {
            if value == nil { self.error = error.localizedDescription }
        }
    }
}

@MainActor enum LoaderCache { static var values: [String: Any] = [:] }

// Toasts live in their own pass-through window above sheets and covers, so a
// confirmation shown from a sheet is still seen.
@MainActor
enum ToastWindow {
    private static var window: UIWindow?

    static func install() {
        guard window == nil,
              let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        let w = PassThroughWindow(windowScene: scene)
        w.windowLevel = .alert + 1
        let host = UIHostingController(rootView: ToastLayer())
        host.view.backgroundColor = .clear
        w.rootViewController = host
        w.isHidden = false
        window = w
    }
}

private final class PassThroughWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        // Only the toasts themselves take touches.
        return hit === rootViewController?.view ? nil : hit
    }
}
