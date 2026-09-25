import SwiftUI

// Visual-first building blocks for iPhone: an icon in a tinted square, tiles
// for grids, stat tiles for numbers. Pair a glyph and a colour with a few
// words rather than a sentence.

// A glyph in a soft tinted square (or circle).
struct IconBadge: View {
    let systemName: String
    var color: Color = FW.Palette.text2
    var size: CGFloat = 40
    var circle = false
    var filled = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: circle ? size / 2 : size * 0.3, style: .continuous)
        Image(systemName: systemName)
            .font(.system(size: size * 0.42, weight: .semibold))
            .symbolRenderingMode(.hierarchical)
            .foregroundStyle(filled ? FW.Palette.onAccent : color)
            .frame(width: size, height: size)
            .background(filled ? AnyShapeStyle(color) : AnyShapeStyle(color.opacity(0.14)), in: shape)
            .accessibilityHidden(true)
    }
}

// A card in a grid: badge, a short title, a one-line caption.
struct Tile: View {
    let icon: String
    let title: String
    var caption: String? = nil
    var color: Color = FW.Palette.text2
    var badge: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                IconBadge(systemName: icon, color: color, size: 38)
                Spacer(minLength: 4)
                if let badge {
                    Text(badge)
                        .font(.sans(11, .bold))
                        .foregroundStyle(color)
                        .padding(.horizontal, 7)
                        .frame(height: 20)
                        .background(color.opacity(0.14), in: .capsule)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.sans(15, .semibold))
                    .foregroundStyle(FW.Palette.text)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                if let caption {
                    Text(caption)
                        .font(.sans(13))
                        .foregroundStyle(FW.Palette.text3)
                        .lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
        .padding(14)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
        .contentShape(.rect(cornerRadius: FW.Radius.lg))
    }
}

// A big number with its label, e.g. "12 · day streak".
struct StatTile: View {
    let value: String
    let label: String
    var icon: String? = nil
    var color: Color = FW.Palette.text

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                if let icon {
                    Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(color).symbolRenderingMode(.hierarchical)
                }
                Text(value)
                    .font(.rounded(24))
                    .foregroundStyle(FW.Palette.text)
                    .contentTransition(.numericText())
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            }
            Text(label).font(.sans(12, .medium)).foregroundStyle(FW.Palette.text3).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

// A grouped list in a rounded card (iOS Settings style), rows divided by
// hairlines inset past the icon.
struct GroupCard<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: content()) { rows in
                ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                    row
                    if i < rows.count - 1 {
                        Rectangle().fill(FW.Palette.line).frame(height: 1).padding(.leading, 64)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .background(FW.Palette.raised, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(FW.Palette.line, lineWidth: 1))
    }
}

// A row for GroupCard: badge, title, optional one-line caption, trailing.
struct GroupRow<Trailing: View>: View {
    let icon: String
    let title: String
    var caption: String? = nil
    var color: Color = FW.Palette.text2
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 14) {
            IconBadge(systemName: icon, color: color, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.sans(16, .medium)).foregroundStyle(FW.Palette.text).multilineTextAlignment(.leading)
                if let caption {
                    Text(caption).font(.sans(13)).foregroundStyle(FW.Palette.text3).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.vertical, 11)
        .frame(minHeight: 60)
        .contentShape(.rect)
    }
}

extension GroupRow where Trailing == AnyView {
    init(icon: String, title: String, caption: String? = nil, color: Color = FW.Palette.text2, value: String? = nil, chevron: Bool = true) {
        self.init(icon: icon, title: title, caption: caption, color: color) {
            AnyView(HStack(spacing: 8) {
                if let value { Text(value).font(.sans(15)).foregroundStyle(FW.Palette.text3).lineLimit(1) }
                if chevron { Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(FW.Palette.text4) }
            })
        }
    }
}

// A capsule of a few words: a glyph and a count or state.
struct Pill: View {
    let text: String
    var icon: String? = nil
    var color: Color = FW.Palette.text2
    var body: some View {
        HStack(spacing: 5) {
            if let icon { Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(color) }
            Text(text).font(.sans(13, .semibold)).foregroundStyle(FW.Palette.text).monospacedDigit().contentTransition(.numericText())
        }
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(FW.Palette.raised, in: .capsule)
        .overlay(Capsule().strokeBorder(FW.Palette.line, lineWidth: 1))
    }
}

// Icons for the kinds of things Fieldwork schedules.
enum Glyph {
    static func kind(_ kind: String?) -> String {
        switch kind {
        case "review": "arrow.triangle.2.circlepath"
        case "practice": "waveform"
        case "rehearsal": "target"
        case "explore": "sparkles"
        case "resume": "play.fill"
        case "session", "learn": "book.pages"
        default: "circle.dotted"
        }
    }
    static func track(_ track: String?) -> String {
        switch track?.lowercased() {
        case "finance": "chart.line.uptrend.xyaxis"
        case "communication": "bubble.left.and.bubble.right"
        case "judgment", "judgement": "scalemass"
        case "review": "arrow.triangle.2.circlepath"
        default: "book.pages"
        }
    }
}
