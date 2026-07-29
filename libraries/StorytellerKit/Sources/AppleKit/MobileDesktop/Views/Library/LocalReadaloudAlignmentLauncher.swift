#if os(iOS) || os(macOS)
import Foundation

@MainActor
public enum LocalReadaloudAlignmentLauncher {
    static func data(
        for item: BookMetadata,
        mediaViewModel: MediaViewModel,
    ) -> ReadaloudGeneratorData? {
        let ebookURL = mediaViewModel.localMediaPath(for: item.id, category: .ebook)
        let audioURLs =
            mediaViewModel.localMediaPath(for: item.id, category: .audio)
            .map(resolveAudioURLs) ?? []

        return ReadaloudGeneratorData(
            bookID: item.id,
            bookTitle: item.title,
            sourceName: item.source ?? "source",
            sourceKind: mediaViewModel.isLocalFolderBook(item.id)
                ? .localFolder
                : (mediaViewModel.isServerBook(item.id) ? .storyteller : nil),
            destination: .source,
            ebookURL: ebookURL,
            audioURLs: audioURLs,
        )
    }

    private static func resolveAudioURLs(_ url: URL) -> [URL] {
        guard url.lastPathComponent == "manifest.json" else { return [url] }

        struct Manifest: Decodable {
            let readingOrder: [ReadingOrderItem]
        }

        struct ReadingOrderItem: Decodable {
            let href: String
        }

        do {
            let data = try Data(contentsOf: url)
            let manifest = try JSONDecoder().decode(Manifest.self, from: data)
            return manifest.readingOrder.compactMap { item in
                let audioURL = url.deletingLastPathComponent().appendingPathComponent(item.href)
                return FileManager.default.fileExists(atPath: audioURL.path) ? audioURL : nil
            }
        } catch {
            debugLog(
                "[LocalReadaloudAlignmentLauncher] Failed to resolve audiobook manifest: \(error)"
            )
            return []
        }
    }

}

#endif
