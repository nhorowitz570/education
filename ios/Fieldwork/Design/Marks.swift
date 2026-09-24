import SwiftUI

// The tutor's mark: a camera aperture in the warm safelight. It turns slowly
// while the tutor is thinking. Drawn from the web's 24×24 SVG
// (src/components/tutor/aperture.tsx).
struct Aperture: View {
    var size: CGFloat = 24
    var busy = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: !busy || reduceMotion)) { context in
            let angle = busy && !reduceMotion
                ? Angle.degrees(context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 6) * 60)
                : .zero
            ZStack {
                Circle().fill(FW.Palette.accent)
                ApertureBlades()
                    .fill(FW.Palette.onAccent)
                    .rotationEffect(angle)
                ApertureRays()
                    .stroke(FW.Palette.onAccent, style: StrokeStyle(lineWidth: 1.1 * size / 24, lineCap: .round))
                    .rotationEffect(angle)
            }
            .frame(width: size, height: size)
        }
        .accessibilityHidden(true)
    }
}

private struct ApertureBlades: Shape {
    func path(in rect: CGRect) -> Path {
        let s = rect.width / 24
        var p = Path()
        p.move(to: .init(x: 12 * s, y: 6.8 * s))
        p.addLine(to: .init(x: 16.5 * s, y: 9.4 * s))
        p.addLine(to: .init(x: 16.5 * s, y: 14.6 * s))
        p.addLine(to: .init(x: 12 * s, y: 17.2 * s))
        p.addLine(to: .init(x: 7.5 * s, y: 14.6 * s))
        p.addLine(to: .init(x: 7.5 * s, y: 9.4 * s))
        p.closeSubpath()
        return p
    }
}

private struct ApertureRays: Shape {
    func path(in rect: CGRect) -> Path {
        let s = rect.width / 24
        let segments: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (12, 6.8, 15.9, 1.3), (16.5, 9.4, 22.6, 8.2), (16.5, 14.6, 20.6, 19.4),
            (12, 17.2, 8.1, 22.7), (7.5, 14.6, 1.4, 15.8), (7.5, 9.4, 3.4, 4.6),
        ]
        var p = Path()
        for (x1, y1, x2, y2) in segments {
            p.move(to: .init(x: x1 * s, y: y1 * s))
            p.addLine(to: .init(x: x2 * s, y: y2 * s))
        }
        return p.intersection(Path(ellipseIn: rect.insetBy(dx: 0.5 * s, dy: 0.5 * s)))
    }
}

// Fieldwork's mark: a field of points with one lit, the next thing to learn.
struct FieldMark: View {
    var size: CGFloat = 28
    var body: some View {
        Canvas { ctx, box in
            let s = box.width / 28
            ctx.fill(Path(roundedRect: CGRect(origin: .zero, size: box), cornerRadius: 8 * s), with: .color(Color(red: 0.086, green: 0.09, blue: 0.102)))
            for r in 0..<3 {
                for c in 0..<3 {
                    let lit = c == 2 && r == 0
                    let radius = (lit ? 2.1 : 1.35) * s
                    let center = CGPoint(x: (8 + CGFloat(c) * 6) * s, y: (8 + CGFloat(r) * 6) * s)
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
                        with: .color(Color(red: 0.949, green: 0.945, blue: 0.929).opacity(lit ? 1 : 0.28))
                    )
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Fieldwork")
    }
}
