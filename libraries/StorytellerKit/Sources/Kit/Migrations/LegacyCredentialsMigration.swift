import Foundation

extension FilesystemActor {
    private static let legacyStorytellerCredentialsMigrationID =
        "legacy-storyteller-credentials-v1"

    func runLegacyCredentialMigrations(for sources: [BookSourceRecord]) async throws {
        guard !migrationSentinelExists(Self.legacyStorytellerCredentialsMigrationID) else {
            return
        }

        defer {
            do {
                try writeMigrationSentinel(Self.legacyStorytellerCredentialsMigrationID)
            } catch {
                debugLog(
                    "[FilesystemActor] Failed to write legacy credentials migration sentinel: \(error)"
                )
            }
        }

        guard let storytellerSource = sources.first(where: { $0.kind == .storyteller }) else {
            return
        }

        guard !(await AuthenticationActor.shared.hasCredentials(sourceID: storytellerSource.id)),
            let oldCredentials = try await AuthenticationActor.shared.loadCredentials()
        else {
            return
        }

        try await AuthenticationActor.shared.saveCredentials(
            url: oldCredentials.url,
            username: oldCredentials.username,
            password: oldCredentials.password,
            sourceID: storytellerSource.id,
        )
    }
}
