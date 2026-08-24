import Foundation

extension FilesystemActor {
    private static let silveranHandoffMigrationID = "silveran-handoff-v1"

    func runSilveranHandoffMigrationIfNeeded() async throws {
        guard !migrationSentinelExists(Self.silveranHandoffMigrationID) else { return }

        try adoptLegacySilveranGlobalConfig()
        await cancelLegacySilveranBackgroundSessions()
        try writeMigrationSentinel(Self.silveranHandoffMigrationID)
    }

    private func adoptLegacySilveranGlobalConfig() throws {
        let configDirectory = getConfigDirectory()
        let legacy = configDirectory.appendingPathComponent(
            "SilveranGlobalConfig.json",
            isDirectory: false,
        )
        let current = configDirectory.appendingPathComponent(
            "StorytellerGlobalConfig.json",
            isDirectory: false,
        )
        let files = FileManager.default
        guard files.fileExists(atPath: legacy.path),
            !files.fileExists(atPath: current.path)
        else { return }

        try files.moveItem(at: legacy, to: current)
        debugLog("[StorytellerMigrations] Adopted legacy Silveran global config")
    }

    private func cancelLegacySilveranBackgroundSessions() async {
        #if canImport(Darwin)
        #if os(watchOS)
        let identifiers = [
            "com.kyonifer.silveran.watch.downloads",
            "com.kyonifer.silveran.watch.progressupload",
        ]
        #else
        let identifiers = [
            "com.kyonifer.silveran.downloads",
            "com.kyonifer.silveran.progressupload",
        ]
        #endif

        for identifier in identifiers {
            let configuration = URLSessionConfiguration.background(withIdentifier: identifier)
            let session = URLSession(configuration: configuration)
            await withCheckedContinuation { continuation in
                session.getAllTasks { tasks in
                    tasks.forEach { $0.cancel() }
                    session.invalidateAndCancel()
                    continuation.resume()
                }
            }
        }
        #endif
    }
}
