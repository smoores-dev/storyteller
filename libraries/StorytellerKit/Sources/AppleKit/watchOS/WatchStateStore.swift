#if os(watchOS)
import Foundation
import StorytellerKit

enum WatchStateStore {
    private static let phoneSourceListFilename = "watch_phone_sources_v2.json"

    static func loadPhoneSourceList() async throws -> PhoneSourceList? {
        let url = await phoneSourceListURL()
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONDecoder().decode(PhoneSourceList.self, from: Data(contentsOf: url))
    }

    static func savePhoneSourceList(_ sourceList: PhoneSourceList) async throws {
        let url = await phoneSourceListURL()
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true,
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(sourceList).write(to: url, options: .atomic)
    }

    private static func phoneSourceListURL() async -> URL {
        await FilesystemActor.shared.getConfigDirectory()
            .appendingPathComponent(phoneSourceListFilename, isDirectory: false)
    }
}
#endif
