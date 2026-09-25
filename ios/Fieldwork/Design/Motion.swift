import SwiftUI

// Motion on iPhone: springs rather than fixed curves, things rise into place
// the first time they're seen, presses squash a little and answer with a
// light tap. Everything falls back to a plain fade under Reduce Motion.
enum Springs {
    // Taps, toggles, small state changes.
    static let snappy = Animation.snappy(duration: 0.32, extraBounce: 0.02)
    // Layout moves (the tutor's composer, cards reflowing).
    static let smooth = Animation.smooth(duration: 0.5, extraBounce: 0.04)
    // Rewards and confirmations.
    static let bouncy = Animation.bouncy(duration: 0.55, extraBounce: 0.12)
    // Entrances.
    static let gentle = Animation.spring(response: 0.62, dampingFraction: 0.86)
}

extension Animation {
    // A spring, or a short fade when the reader prefers less motion.
    static func fw(_ spring: Animation, reduced: Bool) -> Animation {
        reduced ? .easeOut(duration: 0.18) : spring
    }
}

// Fades, lifts and unblurs into place once, the first time it appears.
private struct Rise: ViewModifier {
    let delay: Double
    let distance: CGFloat
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : distance)
            .blur(radius: shown || reduceMotion ? 0 : 5)
            .onAppear {
                guard !shown else { return }
                withAnimation(reduceMotion ? .easeOut(duration: 0.2) : Springs.gentle.delay(delay)) { shown = true }
            }
    }
}

extension View {
    // Staggered entrance: pass the item's position for a cascade.
    func rise(_ index: Int = 0, step: Double = 0.055, delay: Double = 0, distance: CGFloat = 16) -> some View {
        modifier(Rise(delay: delay + Double(min(index, 8)) * step, distance: distance))
    }

    // Cards ease back and fade slightly as they scroll off the edges.
    func scrollSettle() -> some View {
        scrollTransition(.interactive, axis: .vertical) { content, phase in
            content
                .scaleEffect(phase.isIdentity ? 1 : 0.96, anchor: phase.value < 0 ? .bottom : .top)
                .opacity(phase.isIdentity ? 1 : 0.7)
        }
    }
}

// Any tappable surface: squashes a little on press and answers with a light
// haptic. Use for cards, tiles and rows.
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.97
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? scale : 1)
            .brightness(configuration.isPressed ? -0.02 : 0)
            .animation(configuration.isPressed ? .snappy(duration: 0.18) : Springs.bouncy, value: configuration.isPressed)
            .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.55), trigger: configuration.isPressed) { _, pressed in pressed }
            .contentShape(.rect)
    }
}

extension ButtonStyle where Self == PressableStyle {
    static var pressable: PressableStyle { .init() }
    static func pressable(_ scale: CGFloat) -> PressableStyle { .init(scale: scale) }
}

// "Thinking…" with a light sweeping across it, like a chat that's working.
struct ShimmerText: View {
    let text: String
    var font: Font = .sans(15, .medium)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let x = CGFloat((t.truncatingRemainder(dividingBy: 1.6)) / 1.6) * 2.4 - 0.7
            Text(text)
                .font(font)
                .foregroundStyle(FW.Palette.text3)
                .overlay {
                    if !reduceMotion {
                        LinearGradient(stops: [
                            .init(color: .clear, location: max(0, x - 0.25)),
                            .init(color: FW.Palette.text, location: min(1, max(0, x))),
                            .init(color: .clear, location: min(1, x + 0.25)),
                        ], startPoint: .leading, endPoint: .trailing)
                        .mask(Text(text).font(font))
                    }
                }
        }
        .accessibilityLabel(text)
    }
}

// A slow, living wash of colour behind hero cards. Still under Reduce Motion.
struct Aurora: View {
    var colors: [Color]
    var base: Color = FW.Palette.raised
    var intensity: Double = 0.55
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            let c = colors.isEmpty ? [FW.Palette.accent] : colors
            let a = c[0].opacity(intensity)
            let b = c[min(1, c.count - 1)].opacity(intensity * 0.8)
            let d = c[min(2, c.count - 1)].opacity(intensity * 0.6)
            MeshGradient(width: 3, height: 3, points: [
                [0, 0], [0.5, 0], [1, 0],
                [0, 0.5], [Float(0.5 + 0.18 * sin(t * 0.5)), Float(0.5 + 0.14 * cos(t * 0.43))], [1, 0.5],
                [0, 1], [Float(0.5 + 0.2 * cos(t * 0.37)), 1], [1, 1],
            ], colors: [
                a, base, b,
                base, d.opacity(0.5), base,
                b, base, a.opacity(0.6),
            ])
            .background(base)
        }
        .accessibilityHidden(true)
    }
}
