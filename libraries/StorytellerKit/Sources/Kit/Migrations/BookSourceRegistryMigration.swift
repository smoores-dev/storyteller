import Foundation

extension FilesystemActor {
    static let bookSourceRegistryMigrationID = "book-source-registry-v1"

    /// Modern roots count too, so a lost registry file re-adopts existing data
    /// instead of being treated as a fresh install.
    func hasAdoptableBookSourceData() -> Bool {
        hasAdoptableData(in: [
            legacySourceCacheRootDirectory(),
            legacyLocalFolderRootDirectory(),
            sourceCacheRootDirectory(),
            internalFolderSourceRootDirectory(),
        ])
    }

    private func hasAdoptableData(in roots: [URL]) -> Bool {
        let fm = FileManager.default
        for root in roots {
            guard
                let contents = try? fm.contentsOfDirectory(
                    at: root,
                    includingPropertiesForKeys: nil,
                    options: [.skipsHiddenFiles],
                )
            else { continue }
            if !contents.isEmpty { return true }
        }
        return false
    }

    func migrateLegacyBookSourceRegistry() throws -> [BookSourceRecord] {
        let sources = try createLegacyBookSourceRecords()
        try saveBookSources(sources)
        writeMigrationSentinelBestEffort(Self.bookSourceRegistryMigrationID)
        return sources
    }

    private func createLegacyBookSourceRecords() throws -> [BookSourceRecord] {
        let now = StorytellerDate.isoTimestamp(from: Date())
        var sources: [BookSourceRecord] = []

        if hasAdoptableData(in: [legacySourceCacheRootDirectory(), sourceCacheRootDirectory()]) {
            let storytellerID = try legacySourceID(
                legacyRoot: legacySourceCacheRootDirectory(),
                modernRoot: sourceCacheRootDirectory(),
            )
            sources.append(
                BookSourceRecord(
                    id: storytellerID,
                    name: "My Storyteller Server",
                    kind: .storyteller,
                    capabilities: .storyteller,
                    createdAt: now,
                    updatedAt: now,
                    storagePath: nil,
                )
            )
        }

        let localFolderID = try legacySourceID(
            legacyRoot: legacyLocalFolderRootDirectory(),
            modernRoot: internalFolderSourceRootDirectory(),
        )
        sources.append(
            BookSourceRecord(
                id: localFolderID,
                name: BookSourceKind.localFolder.defaultName,
                kind: .localFolder,
                capabilities: .localFolder,
                createdAt: now,
                updatedAt: now,
                storagePath: internalFolderSourceDirectory().path,
            )
        )

        return sources
    }

    private func legacySourceID(legacyRoot: URL, modernRoot: URL) throws -> BookSourceID {
        if let existingID = try sourceIDFromChildDirectory(in: modernRoot) {
            return existingID
        }
        if let existingID = try sourceIDFromChildDirectory(in: legacyRoot) {
            return existingID
        }

        for root in [modernRoot, legacyRoot] {
            let markerURL = root.appendingPathComponent(
                BookSourceRecord.sourceIDFilename,
                isDirectory: false,
            )
            if let existing = try? String(contentsOf: markerURL, encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines),
                !existing.isEmpty
            {
                return existing
            }
        }

        return UUID().uuidString
    }

    private func writeMigrationSentinelBestEffort(_ migrationID: String) {
        do {
            try writeMigrationSentinel(migrationID)
        } catch {
            debugLog(
                "[FilesystemActor] Failed to write migration sentinel \(migrationID): \(error)"
            )
        }
    }

    private func sourceIDFromChildDirectory(in root: URL) throws -> BookSourceID? {
        let fm = FileManager.default
        guard fm.fileExists(atPath: root.path) else { return nil }
        let contents = try fm.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles],
        )

        for url in contents {
            let values = try? url.resourceValues(forKeys: [.isDirectoryKey])
            guard values?.isDirectory == true else { continue }
            let marker = url.appendingPathComponent(
                BookSourceRecord.sourceIDFilename,
                isDirectory: false,
            )
            guard fm.fileExists(atPath: marker.path),
                let id = try? String(contentsOf: marker, encoding: .utf8)
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                !id.isEmpty
            else {
                continue
            }
            return id
        }

        return nil
    }

    func legacySourceCacheRootDirectory() -> URL {
        StorytellerPlatform.applicationSupportDirectory()
            .appendingPathComponent("storyteller_media", isDirectory: true)
    }

    func legacySourceCacheDirectory(sourceID: BookSourceID?) -> URL {
        guard let sourceID else { return legacySourceCacheRootDirectory() }
        return legacySourceCacheRootDirectory()
            .appendingPathComponent(
                migrationSanitizedPathComponent(from: sourceID),
                isDirectory: true,
            )
    }

    func legacyLocalFolderRootDirectory() -> URL {
        StorytellerPlatform.applicationSupportDirectory()
            .appendingPathComponent("local_media", isDirectory: true)
    }

    func legacyLocalFolderDirectory(sourceID: BookSourceID?) -> URL {
        guard let sourceID else { return legacyLocalFolderRootDirectory() }
        return legacyLocalFolderRootDirectory()
            .appendingPathComponent(
                migrationSanitizedPathComponent(from: sourceID),
                isDirectory: true,
            )
    }

    private func migrationSanitizedPathComponent(from input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }

        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_ "))
        var result = ""
        result.reserveCapacity(trimmed.count)
        var lastWasSeparator = false

        for scalar in trimmed.unicodeScalars {
            if allowed.contains(scalar) {
                let character = Character(scalar)
                if character.isWhitespace {
                    if !lastWasSeparator && !result.isEmpty {
                        result.append(" ")
                        lastWasSeparator = true
                    }
                } else {
                    result.append(character)
                    lastWasSeparator = false
                }
            } else if !lastWasSeparator && !result.isEmpty {
                result.append(" ")
                lastWasSeparator = true
            }
        }

        let sanitized = result.trimmingCharacters(in: .whitespacesAndNewlines)
        if sanitized.count > 120 {
            let endIndex = sanitized.index(sanitized.startIndex, offsetBy: 120)
            return String(sanitized[..<endIndex])
        }
        return sanitized
    }
}
