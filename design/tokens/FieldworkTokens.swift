// Generated from src/styles/tokens.css by scripts/tokens.ts. Do not edit.
// Dark is the reference; light is tuned separately rather than inverted.
import SwiftUI

public enum FW {
  public enum Palette {
    public static let bg = Color.adaptive(light: .init(red: 0.9608, green: 0.9569, blue: 0.9412, opacity: 1), dark: .init(red: 0.0392, green: 0.0392, blue: 0.0431, opacity: 1))
    public static let raised = Color.adaptive(light: .init(red: 1, green: 1, blue: 1, opacity: 1), dark: .init(red: 0.0667, green: 0.0667, blue: 0.0745, opacity: 1))
    public static let surface = Color.adaptive(light: .init(red: 0.9373, green: 0.9333, blue: 0.9137, opacity: 1), dark: .init(red: 0.0824, green: 0.0824, blue: 0.0902, opacity: 1))
    public static let surface2 = Color.adaptive(light: .init(red: 0.9059, green: 0.902, blue: 0.8784, opacity: 1), dark: .init(red: 0.1059, green: 0.1059, blue: 0.1176, opacity: 1))
    public static let surface3 = Color.adaptive(light: .init(red: 0.8627, green: 0.8588, blue: 0.8314, opacity: 1), dark: .init(red: 0.1412, green: 0.1412, blue: 0.1569, opacity: 1))
    public static let line = Color.adaptive(light: .init(red: 0.0745, green: 0.0745, blue: 0.0863, opacity: 0.07), dark: .init(red: 0.9294, green: 0.9216, blue: 0.902, opacity: 0.07))
    public static let line2 = Color.adaptive(light: .init(red: 0.0745, green: 0.0745, blue: 0.0863, opacity: 0.12), dark: .init(red: 0.9294, green: 0.9216, blue: 0.902, opacity: 0.12))
    public static let line3 = Color.adaptive(light: .init(red: 0.0745, green: 0.0745, blue: 0.0863, opacity: 0.22), dark: .init(red: 0.9294, green: 0.9216, blue: 0.902, opacity: 0.2))
    public static let text = Color.adaptive(light: .init(red: 0.0784, green: 0.0784, blue: 0.0863, opacity: 1), dark: .init(red: 0.9294, green: 0.9216, blue: 0.902, opacity: 1))
    public static let text2 = Color.adaptive(light: .init(red: 0.3608, green: 0.3569, blue: 0.3804, opacity: 1), dark: .init(red: 0.6431, green: 0.6392, blue: 0.6588, opacity: 1))
    public static let text3 = Color.adaptive(light: .init(red: 0.5529, green: 0.549, blue: 0.5725, opacity: 1), dark: .init(red: 0.4588, green: 0.4549, blue: 0.4784, opacity: 1))
    public static let text4 = Color.adaptive(light: .init(red: 0.7059, green: 0.702, blue: 0.7216, opacity: 1), dark: .init(red: 0.2902, green: 0.2902, blue: 0.3098, opacity: 1))
    public static let accent = Color.adaptive(light: .init(red: 0.0784, green: 0.0784, blue: 0.0863, opacity: 1), dark: .init(red: 0.949, green: 0.7765, blue: 0.651, opacity: 1))
    public static let onAccent = Color.adaptive(light: .init(red: 1, green: 1, blue: 1, opacity: 1), dark: .init(red: 0.102, green: 0.0706, blue: 0.0471, opacity: 1))
    public static let glow = Color.adaptive(light: .init(red: 0.0784, green: 0.0784, blue: 0.0863, opacity: 0.18), dark: .init(red: 0.949, green: 0.7765, blue: 0.651, opacity: 0.14))
    public static let finance = Color.adaptive(light: .init(red: 0.0745, green: 0.5294, blue: 0.3529, opacity: 1), dark: .init(red: 0.498, green: 0.8471, blue: 0.6824, opacity: 1))
    public static let communication = Color.adaptive(light: .init(red: 0.6902, green: 0.4392, blue: 0.0824, opacity: 1), dark: .init(red: 0.9412, green: 0.7451, blue: 0.4745, opacity: 1))
    public static let judgment = Color.adaptive(light: .init(red: 0.3961, green: 0.3216, blue: 0.8627, opacity: 1), dark: .init(red: 0.698, green: 0.651, blue: 0.9608, opacity: 1))
    public static let review = Color.adaptive(light: .init(red: 0.1569, green: 0.4667, blue: 0.7529, opacity: 1), dark: .init(red: 0.549, green: 0.7843, blue: 0.9608, opacity: 1))
    public static let coral = Color.adaptive(light: .init(red: 0.8157, green: 0.3255, blue: 0.1843, opacity: 1), dark: .init(red: 0.9569, green: 0.5843, blue: 0.4784, opacity: 1))
    public static let positive = Color.adaptive(light: .init(red: 0.0745, green: 0.5294, blue: 0.3529, opacity: 1), dark: .init(red: 0.498, green: 0.8471, blue: 0.6824, opacity: 1))
    public static let negative = Color.adaptive(light: .init(red: 0.8235, green: 0.2627, blue: 0.1804, opacity: 1), dark: .init(red: 1, green: 0.5412, blue: 0.4588, opacity: 1))
    public static let caution = Color.adaptive(light: .init(red: 0.6902, green: 0.4392, blue: 0.0824, opacity: 1), dark: .init(red: 0.9412, green: 0.7451, blue: 0.4745, opacity: 1))
    public static let hatch = Color.adaptive(light: .init(red: 0.0784, green: 0.0784, blue: 0.0863, opacity: 0.1), dark: .init(red: 0.949, green: 0.9451, blue: 0.9294, opacity: 0.1))
  }
  public enum Radius {
    public static let xs: CGFloat = 8
    public static let sm: CGFloat = 11
    public static let base: CGFloat = 14
    public static let lg: CGFloat = 20
    public static let xl: CGFloat = 28
  }
  public enum Size {
    public static let gutter: CGFloat = 16
    public static let rail: CGFloat = 76
    public static let tabbar: CGFloat = 64
  }
  public enum Motion {
    public static let fast: Double = 0.16
    public static let base: Double = 0.24
    public static let slow: Double = 0.42
    public static let ease = UnitCurve.bezier(startControlPoint: UnitPoint(x: 0.2, y: 0.8), endControlPoint: UnitPoint(x: 0.2, y: 1))
    public static let easeInOut = UnitCurve.bezier(startControlPoint: UnitPoint(x: 0.65, y: 0), endControlPoint: UnitPoint(x: 0.35, y: 1))
  }
  public enum Font {
    public static let sans = "Instrument Sans"
    public static let serif = "Newsreader"
    public static let hyperlegible = "Atkinson Hyperlegible"
    public static let dyslexic = "OpenDyslexic"
  }
}

extension Color {
  static func adaptive(light: Color, dark: Color) -> Color {
    #if canImport(UIKit)
    Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light) })
    #else
    Color(NSColor(name: nil) { $0.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(dark) : NSColor(light) })
    #endif
  }
}
