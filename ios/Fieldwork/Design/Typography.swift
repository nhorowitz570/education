import SwiftUI
import UIKit

// Type on iPhone. The interface is set in the system face (SF Pro), bold for
// headings and rounded for numbers, so it reads quickly at a glance. Lesson
// text keeps the reader's chosen face (Newsreader by default, or Atkinson
// Hyperlegible / OpenDyslexic), the same as on the web. Sizes scale with
// Dynamic Type.
enum Face: String, CaseIterable, Codable, Sendable {
    case serif, sans, hyperlegible, dyslexic

    func name(_ w: Font.Weight, italic: Bool = false, display: Bool = false) -> String {
        let weight = w.rank
        switch self {
        case .serif:
            let family = display ? "NewsreaderDisplay" : "NewsreaderText"
            if italic { return "\(family)-Italic" }
            return "\(family)-\(weight >= 2 ? "SemiBold" : weight >= 1 ? "Medium" : "Regular")"
        case .sans:
            return "InstrumentSans-\(weight >= 2 ? "SemiBold" : weight >= 1 ? "Medium" : "Regular")"
        case .hyperlegible:
            if italic { return "AtkinsonHyperlegible-Italic" }
            return weight >= 2 ? "AtkinsonHyperlegible-Bold" : "AtkinsonHyperlegible-Regular"
        case .dyslexic:
            if italic { return "OpenDyslexic-Italic" }
            return weight >= 2 ? "OpenDyslexic-Bold" : "OpenDyslexic-Regular"
        }
    }
}

extension Font {
    // Reading text in a chosen face. "Sans" is the system face on iPhone.
    static func fw(_ face: Face, _ size: CGFloat, _ weight: Font.Weight = .regular, italic: Bool = false, relativeTo style: TextStyle = .body) -> Font {
        if face == .sans {
            let f = Font.system(size: scaled(size, style), weight: weight)
            return italic ? f.italic() : f
        }
        return .custom(face.name(weight, italic: italic, display: size >= 26), size: size, relativeTo: style)
    }
    // Headings: the system face, bold and a touch smaller than the old serif
    // sizes callers pass, which ran optically small.
    static func display(_ size: CGFloat, _ weight: Font.Weight = .bold, italic: Bool = false) -> Font {
        .system(size: scaled(size * 0.84, .largeTitle), weight: weight)
    }
    // Lesson and quoted text that stays in the serif.
    static func serif(_ size: CGFloat, _ weight: Font.Weight = .regular, italic: Bool = false) -> Font {
        .custom(Face.serif.name(weight, italic: italic, display: size >= 26), size: size, relativeTo: .body)
    }
    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: scaled(size, size <= 13 ? .footnote : .body), weight: weight)
    }
    // Big numbers, stats and counters.
    static func rounded(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .system(size: scaled(size, .title), weight: weight, design: .rounded)
    }
    // Small labels and counts (was IBM Plex Mono on the web).
    static func mono(_ size: CGFloat = 11, _ weight: Font.Weight = .regular) -> Font {
        .system(size: scaled(size + 1, .caption), weight: weight.rank >= 1 ? .semibold : .medium).monospacedDigit()
    }

    private static func scaled(_ size: CGFloat, _ style: TextStyle) -> CGFloat {
        UIFontMetrics(forTextStyle: style.uiStyle).scaledValue(for: size)
    }
}

private extension Font.TextStyle {
    var uiStyle: UIFont.TextStyle {
        switch self {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }
}

// A small label above a group ("This week", "Learn anything").
struct Kicker: View {
    let text: String
    var color: Color = FW.Palette.text3
    init(_ text: String, color: Color = FW.Palette.text3) {
        self.text = text
        self.color = color
    }
    var body: some View {
        Text(text)
            .font(.sans(13, .semibold))
            .foregroundStyle(color)
    }
}

extension Font.Weight {
    // 0 regular, 1 medium, 2 semibold or heavier (the static cuts we ship).
    var rank: Int {
        switch self {
        case .semibold, .bold, .heavy, .black: 2
        case .medium: 1
        default: 0
        }
    }
}
