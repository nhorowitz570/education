import SwiftUI

// Shared building blocks that mirror the web's classes in
// src/styles/components.css: .card, .btn (primary/ghost), .chip, skeletons.

extension View {
    // A raised panel: surface fill, hairline border, the web's radius.
    func card(_ radius: CGFloat = FW.Radius.lg, fill: Color = FW.Palette.surface, padding: CGFloat? = 16) -> some View {
        self
            .padding(padding ?? 0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: .rect(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(FW.Palette.line, lineWidth: 1))
    }

    func screenBackground() -> some View {
        background(FW.Palette.bg.ignoresSafeArea())
    }
}

struct FWButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, ghost, danger }
    var kind: Kind = .secondary
    var small = false
    var wide = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(small ? 14 : 15, .medium))
            .padding(.horizontal, small ? 12 : 18)
            .frame(minHeight: small ? 34 : 46)
            .frame(maxWidth: wide ? .infinity : nil)
            .foregroundStyle(foreground)
            .background(background, in: .capsule)
            .overlay(Capsule().strokeBorder(kind == .secondary ? FW.Palette.line2 : .clear, lineWidth: 1))
            .opacity(enabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: FW.Motion.fast), value: configuration.isPressed)
            .contentShape(.capsule)
    }

    private var foreground: Color {
        switch kind {
        case .primary: FW.Palette.onAccent
        case .danger: FW.Palette.negative
        case .secondary, .ghost: FW.Palette.text
        }
    }
    private var background: Color {
        switch kind {
        case .primary: FW.Palette.accent
        case .secondary: FW.Palette.surface2
        case .ghost, .danger: .clear
        }
    }
}

extension ButtonStyle where Self == FWButtonStyle {
    static var primary: FWButtonStyle { .init(kind: .primary) }
    static var secondary: FWButtonStyle { .init(kind: .secondary) }
    static var ghost: FWButtonStyle { .init(kind: .ghost) }
    static func fw(_ kind: FWButtonStyle.Kind, small: Bool = false, wide: Bool = false) -> FWButtonStyle {
        .init(kind: kind, small: small, wide: wide)
    }
}

// Suggestion chips (tutor follow-ups, starters, known terms).
struct Chip: View {
    let text: String
    var selected = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.sans(14))
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(minHeight: 34)
                .foregroundStyle(selected ? FW.Palette.onAccent : FW.Palette.text2)
                .background(selected ? FW.Palette.accent : FW.Palette.surface2, in: .capsule)
                .overlay(Capsule().strokeBorder(FW.Palette.line2, lineWidth: selected ? 0 : 1))
        }
        .buttonStyle(.plain)
    }
}

// A placeholder bar with the web's slow shimmer; respects Reduce Motion.
struct Skeleton: View {
    var width: CGFloat? = nil
    var height: CGFloat = 14
    var radius: CGFloat = 6
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -1

    var body: some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(FW.Palette.surface2)
            .overlay {
                if !reduceMotion {
                    GeometryReader { geo in
                        LinearGradient(colors: [.clear, FW.Palette.surface3.opacity(0.9), .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: geo.size.width * 0.6)
                            .offset(x: phase * geo.size.width * 1.6)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: radius))
                }
            }
            .frame(width: width, height: height)
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1 }
            }
            .accessibilityHidden(true)
    }
}

struct SkeletonLines: View {
    var count = 3
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(0..<count, id: \.self) { i in
                Skeleton(width: nil, height: 13).frame(maxWidth: i == count - 1 ? 220 : .infinity, alignment: .leading)
            }
        }
    }
}

// A hairline rule.
struct Rule: View {
    var body: some View {
        Rectangle().fill(FW.Palette.line).frame(height: 1)
    }
}

// Inline error with a retry, used for failed loads.
struct ErrorNote: View {
    let message: String
    var retry: (() -> Void)?
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message).font(.sans(15)).foregroundStyle(FW.Palette.text2)
            if let retry {
                Button("Try again", action: retry).buttonStyle(.fw(.secondary, small: true))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Subject hue for a plan track (finance, communication, judgment, review).
func trackColor(_ track: String?) -> Color {
    switch track?.lowercased() {
    case "finance": FW.Palette.finance
    case "communication": FW.Palette.communication
    case "judgment", "judgement": FW.Palette.judgment
    case "review": FW.Palette.review
    default: FW.Palette.text3
    }
}
