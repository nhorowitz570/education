import SwiftUI

// Renders the tutor's blocks (text, callout, visual), shared by lessons, the
// tutor chat and feedback, like src/components/session/blocks.tsx. While a
// reply streams it is revealed a sentence at a time, never mid-word.
struct Blocks: View {
    let blocks: [Block]
    var streaming = false
    var face: Face? = nil
    var size: CGFloat = 18
    var color: Color = FW.Palette.text
    @Environment(Store.self) private var store

    var body: some View {
        let face = face ?? store.prefs.reading.lessonFont
        let shown = streaming ? Self.settled(blocks) : blocks
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(shown.enumerated()), id: \.offset) { _, block in
                switch block.type {
                case "visual":
                    if let v = block.visual { VisualView(spec: v) } else { Skeleton(height: 160, radius: FW.Radius.lg) }
                case "callout":
                    Markdown(text: block.md ?? "", face: face, scale: store.prefs.readScale, size: size - 1, color: color)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                        .overlay(alignment: .leading) {
                            Rectangle().fill(FW.Palette.accent).frame(width: 2).padding(.vertical, 12)
                        }
                default:
                    Markdown(text: block.md ?? "", face: face, scale: store.prefs.readScale, size: size, color: color)
                }
            }
        }
        .animation(.easeOut(duration: FW.Motion.base), value: shown.count)
    }

    // While a reply streams, the last text block shows only finished
    // sentences (src/lib/stream-text.ts): a long unfinished tail is released
    // at a clause break, and a unit with an open ** or ` is held back.
    static func settled(_ blocks: [Block]) -> [Block] {
        guard var last = blocks.last, last.type != "visual", let md = last.md else { return blocks }
        last.md = sentences(md, writing: true).joined()
        var out = Array(blocks.dropLast())
        if !(last.md ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { out.append(last) }
        return out
    }

    static func sentences(_ text: String, writing: Bool) -> [String] {
        var out: [String] = []
        var last = text.startIndex
        for m in text.matches(of: /[.!?…:;]["”’)\]]*\s+|\n/) {
            out.append(String(text[last..<m.range.upperBound]))
            last = m.range.upperBound
        }
        let tail = String(text[last...])
        if !writing {
            if !tail.isEmpty { out.append(tail) }
        } else if tail.count > 140 {
            let cuts = [", ", " — ", " – "].compactMap { tail.range(of: $0, options: .backwards) }
            if let cut = cuts.max(by: { $0.lowerBound < $1.lowerBound }), tail.distance(from: tail.startIndex, to: cut.lowerBound) > 60 {
                out.append(String(tail[..<tail.index(cut.lowerBound, offsetBy: 2)]))
            }
        }
        if writing, !out.isEmpty {
            let joined = out.joined()
            if joined.components(separatedBy: "**").count % 2 == 0 || joined.components(separatedBy: "`").count % 2 == 0 { out.removeLast() }
        }
        return out
    }
}

// A small Markdown renderer: paragraphs, headings, bullet and numbered
// lists and quotes, with inline emphasis, code and links.
struct Markdown: View {
    let text: String
    var face: Face = .serif
    var scale: CGFloat = 1
    var size: CGFloat = 18
    var color: Color = FW.Palette.text

    enum Part: Hashable {
        case paragraph(String)
        case heading(String)
        case bullet(String)
        case number(Int, String)
        case quote(String)

        var plain: String {
            let raw: String
            switch self {
            case .paragraph(let s), .heading(let s), .bullet(let s), .number(_, let s), .quote(let s): raw = s
            }
            return String(Markdown.inline(raw).characters)
        }
    }

    static func parse(_ text: String) -> [Part] {
        var parts: [Part] = []
        var paragraph: [String] = []
        func flush() {
            if !paragraph.isEmpty { parts.append(.paragraph(paragraph.joined(separator: " "))) }
            paragraph = []
        }
        for raw in text.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { flush(); continue }
            if line.hasPrefix("#") {
                flush()
                parts.append(.heading(line.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces)))
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("• ") {
                flush()
                parts.append(.bullet(String(line.dropFirst(2))))
            } else if let m = line.firstMatch(of: /^(\d+)[.)]\s+(.*)$/) {
                flush()
                parts.append(.number(Int(m.1) ?? 1, String(m.2)))
            } else if line.hasPrefix(">") {
                flush()
                parts.append(.quote(line.dropFirst().trimmingCharacters(in: .whitespaces)))
            } else {
                paragraph.append(line)
            }
        }
        flush()
        return parts
    }

    static func inline(_ s: String) -> AttributedString {
        var a = (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
        // Ideas met in earlier sessions (fwterm: links) get a dotted underline
        // instead of looking like web links.
        for run in a.runs where run.link?.scheme == "fwterm" {
            a[run.range].underlineStyle = Text.LineStyle(pattern: .dot, color: FW.Palette.text3)
            a[run.range].foregroundColor = FW.Palette.text
        }
        return a
    }

    @Environment(\.passage) private var passage

    var body: some View {
        let body = Font.fw(face, size * scale)
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(Self.parse(text).enumerated()), id: \.offset) { _, part in
                Group {
                switch part {
                case .paragraph(let s):
                    Text(Self.inline(s)).font(body).foregroundStyle(color).lineSpacing(5 * scale)
                case .heading(let s):
                    Text(Self.inline(s)).font(.display(22 * scale)).foregroundStyle(color).padding(.top, 4)
                case .bullet(let s):
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("•").font(body).foregroundStyle(FW.Palette.text3)
                        Text(Self.inline(s)).font(body).foregroundStyle(color).lineSpacing(5 * scale)
                    }
                case .number(let n, let s):
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(n).").font(.mono(13 * scale)).foregroundStyle(FW.Palette.text3)
                        Text(Self.inline(s)).font(body).foregroundStyle(color).lineSpacing(5 * scale)
                    }
                case .quote(let s):
                    Text(Self.inline(s)).font(body.italic()).foregroundStyle(FW.Palette.text2)
                        .padding(.leading, 12)
                        .overlay(alignment: .leading) { Rectangle().fill(FW.Palette.line3).frame(width: 2) }
                }
                }
                .modifier(PassageMenu(text: part.plain, action: passage))
            }
        }
        .tint(FW.Palette.accent)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Long-press a passage to ask about exactly that part, or note it: the
// phone's version of the web's highlight-to-ask toolbar.
enum PassageIntent: Sendable { case why, example, simpler, visual, ask, note }

struct PassageKey: EnvironmentKey {
    static let defaultValue: (@MainActor (String, PassageIntent) -> Void)? = nil
}

extension EnvironmentValues {
    var passage: (@MainActor (String, PassageIntent) -> Void)? {
        get { self[PassageKey.self] }
        set { self[PassageKey.self] = newValue }
    }
}

private struct PassageMenu: ViewModifier {
    let text: String
    let action: (@MainActor (String, PassageIntent) -> Void)?

    func body(content: Content) -> some View {
        if let action {
            content.contextMenu {
                Button("Why?", systemImage: "questionmark") { action(text, .why) }
                Button("Example", systemImage: "text.alignleft") { action(text, .example) }
                Button("Simpler", systemImage: "line.3.horizontal") { action(text, .simpler) }
                Button("Show me", systemImage: "chart.bar") { action(text, .visual) }
                Button("Ask…", systemImage: "sparkles") { action(text, .ask) }
                Button("Note", systemImage: "note.text") { action(text, .note) }
                Divider()
                Button("Copy", systemImage: "doc.on.doc") { UIPasteboard.general.string = text }
            }
        } else {
            content.textSelection(.enabled)
        }
    }
}
