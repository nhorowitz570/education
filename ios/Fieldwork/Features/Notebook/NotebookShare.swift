import SwiftUI
import UIKit

// Share one idea as a card anyone with the link can see (web: ShareSheet in
// src/components/notebook/notebook.tsx, POST/DELETE /api/shares). The card
// is a snapshot; turning the link off makes it stop working.
struct NotebookShareSheet: View {
    let entry: NotebookEntry
    @Environment(Store.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var words: Bool
    @State private var name = false
    @State private var token: String?
    @State private var busy = false

    init(entry: NotebookEntry) {
        self.entry = entry
        _words = State(initialValue: !entry.words.isEmpty)
        _token = State(initialValue: entry.shared)
    }

    private var url: URL? { token.map { Config.site.appending(path: "c/\($0)") } }

    var body: some View {
        SheetScaffold(title: "Share this idea", subtitle: "Anyone with the link sees a snapshot of this card.") {
            preview
            GroupCard {
                option("Include your explanation", icon: "quote.bubble", color: FW.Palette.review,
                       detail: entry.words.isEmpty ? "You haven’t explained this one yet." : "Your best answer, word for word.",
                       isOn: $words)
                    .disabled(entry.words.isEmpty || busy)
                option("Show your first name", icon: "person.crop.circle", color: FW.Palette.judgment,
                       detail: "Otherwise the card is anonymous.", isOn: $name)
                    .disabled(busy)
            }
            Group {
                if let url {
                    linked(url)
                        .transition(.blurReplace)
                } else {
                    Button { make() } label: {
                        HStack(spacing: 8) {
                            if busy { ProgressView().tint(FW.Palette.onAccent) } else { Image(systemName: "link") }
                            Text("Create link")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.fw(.primary, wide: true))
                    .disabled(busy)
                    .transition(.blurReplace)
                }
            }
        }
        // The app's toasts sit under sheets; show this sheet's own on top.
        .presentationDetents([.medium, .large])
        .sensoryFeedback(.success, trigger: token) { old, new in old == nil && new != nil }
    }

    // A small picture of the card as it will be shared; it follows the
    // toggles above.
    private var preview: some View {
        let tint = notebookTint(entry.track)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                IconBadge(systemName: notebookGlyph(entry.track), color: tint, size: 28)
                Text(entry.trackTitle).font(.sans(13, .semibold)).foregroundStyle(tint)
                Spacer(minLength: 0)
                Text("Fieldwork").font(.sans(12, .semibold)).foregroundStyle(FW.Palette.text3)
            }
            Text(entry.title)
                .font(.sans(20, .bold))
                .foregroundStyle(FW.Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if words, let w = entry.words.first {
                Text("“\(NotebookText.clip(w.text, 140))”")
                    .font(.serif(15, italic: true))
                    .foregroundStyle(FW.Palette.text2)
                    .lineLimit(3)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            } else if !entry.summary.isEmpty {
                Text(entry.summary)
                    .font(.sans(14))
                    .foregroundStyle(FW.Palette.text2)
                    .lineLimit(2)
                    .transition(.opacity)
            }
            if name {
                Label("Your first name", systemImage: "person.fill")
                    .font(.sans(12, .medium))
                    .foregroundStyle(FW.Palette.text3)
                    .transition(.opacity.combined(with: .scale(0.9, anchor: .leading)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous)
                .fill(LinearGradient(colors: [tint.opacity(0.16), tint.opacity(0.03)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .background(FW.Palette.bg, in: .rect(cornerRadius: FW.Radius.lg, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: FW.Radius.lg, style: .continuous).strokeBorder(tint.opacity(0.2)))
        .animation(Springs.smooth, value: words)
        .animation(Springs.smooth, value: name)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Preview of the shared card")
    }

    private func option(_ title: String, icon: String, color: Color, detail: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            HStack(spacing: 14) {
                IconBadge(systemName: icon, color: color, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.sans(16, .medium)).foregroundStyle(FW.Palette.text)
                    Text(detail).font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(FW.Palette.positive)
        .padding(.vertical, 11)
        .frame(minHeight: 60)
    }

    @ViewBuilder
    private func linked(_ url: URL) -> some View {
        VStack(spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "link").font(.system(size: 14, weight: .semibold)).foregroundStyle(FW.Palette.positive)
                Text(url.absoluteString)
                    .font(.sans(14))
                    .foregroundStyle(FW.Palette.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel("Share link")
                    .accessibilityValue(url.absoluteString)
                Button("Copy") {
                    UIPasteboard.general.string = url.absoluteString
                    Feedback.shared.play(.tap)
                    Toasts.shared.show("Link copied.")
                }
                .buttonStyle(.fw(.primary, small: true))
            }
            .padding(.leading, 14)
            .padding(.trailing, 6)
            .frame(minHeight: 50)
            .background(FW.Palette.surface, in: .capsule)
            .overlay(Capsule().strokeBorder(FW.Palette.line))
            GroupCard {
                Button { openURL(url) } label: {
                    GroupRow(icon: "arrow.up.right", title: "Open the card", color: FW.Palette.review)
                }
                .buttonStyle(.pressable(0.98))
                ShareLink(item: RemoteImageFile(url: url.appending(path: "image"), name: fileName), preview: SharePreview(entry.title)) {
                    GroupRow(icon: "photo", title: "Share as image", color: FW.Palette.judgment)
                }
                .buttonStyle(.pressable(0.98))
                Button { make() } label: {
                    GroupRow(icon: "arrow.clockwise", title: "Update with these choices", color: FW.Palette.positive, chevron: false)
                }
                .buttonStyle(.pressable(0.98))
                .disabled(busy)
                Button { stop() } label: {
                    GroupRow(icon: "xmark", title: "Turn off the link", color: FW.Palette.negative, chevron: false)
                }
                .buttonStyle(.pressable(0.98))
                .disabled(busy)
            }
        }
    }

    // web: download={`${e.title}.png`}; slashes can't be in a file name.
    private var fileName: String {
        let clean = entry.title.replacingOccurrences(of: #"[/\\:]"#, with: "-", options: .regularExpression)
        return (clean.isEmpty ? "Fieldwork" : clean) + ".png"
    }

    private func make() {
        busy = true
        Task {
            struct Made: Decodable { let token: String }
            do {
                let body: [String: JSON] = ["key": .string(entry.key), "words": .bool(words), "name": .bool(name)]
                let r: Made = try await API.post("/api/shares", body)
                withAnimation(Springs.smooth) { token = r.token }
                await NotebookModel.shared.load(owner: store.owner)
            } catch {
                Toasts.shared.show(error.localizedDescription)
            }
            busy = false
        }
    }

    private func stop() {
        busy = true
        Task {
            do {
                try await API.delete("/api/shares", ["key": entry.key])
                withAnimation(Springs.smooth) { token = nil }
                await NotebookModel.shared.load(owner: store.owner)
                Toasts.shared.show("The link no longer works.")
            } catch {
                Toasts.shared.show(error.localizedDescription)
            }
            busy = false
        }
    }
}
