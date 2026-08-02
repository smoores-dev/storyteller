import Foundation

extension FilesystemActor {
    private static let keychainAccessibilityMigrationID = "keychain-after-first-unlock-v1"

    /// Keychain accessibility only applies at write time, so items saved before the
    /// switch to kSecAttrAccessibleAfterFirstUnlock stay locked-device-inaccessible
    /// until re-saved. Re-save every stored credential once through the normal APIs.
    ///
    /// The sentinel is only written when every read/write succeeded. During a locked
    /// background launch the old WhenUnlocked items throw errSecInteractionNotAllowed,
    /// which is exactly the state this migration exists to fix, so finalizing then
    /// would permanently strand those credentials as WhenUnlocked. Leaving the
    /// sentinel absent retries on a later unlocked launch.
    func runKeychainAccessibilityMigrations(for sources: [BookSourceRecord]) async throws {
        guard !migrationSentinelExists(Self.keychainAccessibilityMigrationID) else { return }

        var allSucceeded = true

        for source in sources {
            do {
                guard
                    let credentials = try await AuthenticationActor.shared.loadCredentials(
                        sourceID: source.id
                    )
                else { continue }

                try await AuthenticationActor.shared.saveCredentials(
                    url: credentials.url,
                    username: credentials.username,
                    password: credentials.password,
                    sourceID: source.id,
                )
            } catch {
                allSucceeded = false
                debugLog(
                    "[FilesystemActor] Keychain migration could not process source \(source.id) (likely locked device): \(error)"
                )
            }
        }

        do {
            if let token = try await AuthenticationActor.shared.loadHardcoverToken(),
                !token.isEmpty
            {
                try await AuthenticationActor.shared.saveHardcoverToken(token)
            }
        } catch {
            allSucceeded = false
            debugLog(
                "[FilesystemActor] Keychain migration could not process hardcover token: \(error)"
            )
        }

        guard allSucceeded else {
            debugLog(
                "[FilesystemActor] Keychain accessibility migration deferred; will retry on a later launch"
            )
            return
        }

        try writeMigrationSentinel(Self.keychainAccessibilityMigrationID)
    }
}
