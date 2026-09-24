import SwiftUI

// Type roles from the web (src/styles/tokens.css + base.css). Serif for
// display and lessons (Newsreader), sans for the interface (Instrument Sans),
// mono for small labels (IBM Plex Mono). Sizes scale with Dynamic Type.
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
    static func fw(_ face: Face, _ size: CGFloat, _ weight: Font.Weight = .regular, italic: Bool = false, relativeTo style: TextStyle = .body) -> Font {
        .custom(face.name(weight, italic: italic, display: size >= 26), size: size, relativeTo: style)
    }
    // Headings and big numbers.
    static func display(_ size: CGFloat, _ weight: Font.Weight = .regular, italic: Bool = false) -> Font {
        .custom(Face.serif.name(weight, italic: italic, display: true), size: size, relativeTo: .largeTitle)
    }
    static func serif(_ size: CGFloat, _ weight: Font.Weight = .regular, italic: Bool = false) -> Font {
        .custom(Face.serif.name(weight, italic: italic, display: size >= 26), size: size, relativeTo: .body)
    }
    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom(Face.sans.name(weight), size: size, relativeTo: size <= 13 ? .footnote : .body)
    }
    // Small uppercase labels ("No. 024", section kickers, counts).
    static func mono(_ size: CGFloat = 11, _ weight: Font.Weight = .regular) -> Font {
        .custom(weight.rank >= 1 ? "IBMPlexMono-Medium" : "IBMPlexMono-Regular", size: size, relativeTo: .caption)
    }
}

// The mono kicker used above sections on the web (`.eyebrow`).
struct Kicker: View {
    let text: String
    var color: Color = FW.Palette.text3
    init(_ text: String, color: Color = FW.Palette.text3) {
        self.text = text
        self.color = color
    }
    var body: some View {
        Text(text.uppercased())
            .font(.mono(11))
            .tracking(1.1)
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
