import Foundation
import StorytellerKit
import StoryAlignCore

/// On-device cache for StoryAlign's content-addressed transcriptions.
///
/// StoryAlign includes the decoded PCM hash, transcriber, and transcriber configuration in
/// `key`, so cached data is reused only when it is valid for the current alignment.
struct ReadaloudTranscriptionStore: TranscriptionStore {
    private let directory: URL

    init(fileManager: FileManager = .default) throws {
        directory = FilesystemActor.shared.storyAlignCacheDirectory()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func store(data: Data, key: String, context _: TranscriptionStoreContext) async throws {
        try data.write(to: fileURL(for: key), options: .atomic)
    }

    func fetch(key: String, context _: TranscriptionStoreContext) async throws -> Data? {
        let url = fileURL(for: key)
        guard FileManager.default.isReadableFile(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }

    private func fileURL(for key: String) -> URL {
        directory.appendingPathComponent(key, isDirectory: false)
    }
}
