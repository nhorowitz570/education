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
        SheetScaffold(title: "Share this idea", subtitle: "A card anyone with the link can see. It’s a snapshot: later sessions don’t change it.") {
            VStack(spacing: 0) {
                option(
                    "Include your explanation",
                    detail: entry.words.isEmpty ? "You haven’t explained this one yet." : "Your best answer about this idea, word for word.",
                    isOn: $words
                )
                .disabled(entry.words.isEmpty || busy)
                Rule()
                option("Show your first name", detail: "Otherwise the card is anonymous.", isOn: $name)
                    .disabled(busy)
            }
            if let url {
                linked(url)
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
            }
        }
        // The app's toasts sit under sheets; show this sheet's own on top.
        .presentationDetents([.medium, .large])
    }

    private func option(_ title: String, detail: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.sans(15, .medium)).foregroundStyle(FW.Palette.text)
                Text(detail).font(.sans(13)).foregroundStyle(FW.Palette.text3).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(FW.Palette.positive)
        .padding(.vertical, 12)
        .frame(minHeight: 60)
    }

    @ViewBuilder
    private func linked(_ url: URL) -> some View {
        HStack(spacing: 8) {
            Text(url.absoluteString)
                .font(.sans(14))
                .foregroundStyle(FW.Palette.text)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)
                .padding(.horizontal, 14)
                .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                .background(FW.Palette.surface, in: .rect(cornerRadius: FW.Radius.base))
                .overlay(RoundedRectangle(cornerRadius: FW.Radius.base).strokeBorder(FW.Palette.line))
                .accessibilityLabel("Share link")
                .accessibilityValue(url.absoluteString)
            Button("Copy") {
                UIPasteboard.general.string = url.absoluteString
                Feedback.shared.play(.tap)
                Toasts.shared.show("Link copied.")
            }
            .buttonStyle(.fw(.primary))
        }
        VStack(spacing: 8) {
            Button { openURL(url) } label: {
                Label("Open the card", systemImage: "arrow.up.right").frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.secondary, wide: true))
            ShareLink(item: RemoteImageFile(url: url.appending(path: "image"), name: fileName), preview: SharePreview(entry.title)) {
                Label("Share as image", systemImage: "photo").frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.secondary, wide: true))
            Button { make() } label: {
                Label("Update with these choices", systemImage: "arrow.clockwise").frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.secondary, wide: true))
            .disabled(busy)
            Button { stop() } label: {
                Label("Turn off the link", systemImage: "xmark").frame(maxWidth: .infinity)
            }
            .buttonStyle(.fw(.danger, wide: true))
            .disabled(busy)
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
                withAnimation(.easeOut(duration: FW.Motion.base)) { token = r.token }
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
                withAnimation(.easeOut(duration: FW.Motion.base)) { token = nil }
                await NotebookModel.shared.load(owner: store.owner)
                Toasts.shared.show("The link no longer works.")
            } catch {
                Toasts.shared.show(error.localizedDescription)
            }
            busy = false
        }
    }
}
