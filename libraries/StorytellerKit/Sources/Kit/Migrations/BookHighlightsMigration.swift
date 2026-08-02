import Foundation

private struct ReleasedBookHighlights: Decodable {
    let bookId: String
    let highlights: [ReleasedHighlight]
}

private struct ReleasedHighlight: Decodable {
    let id: UUID
    let bookId: String
    let locator: BookLocator
    let text: String
    let color: HighlightColor?
    let note: String?
    let createdAt: Date

    func sourceScoped(to bookID: BookID) -> Highlight {
        Highlight(
            id: id,
            bookID: bookID,
            locator: locator,
            text: text,
            color: color,
            note: note,
            createdAt: createdAt,
        )
    }
}

struct BookHighlightsMigration {
    static let sentinelName = "book-highlights-v2"
    static let markerSuffix = ".migrated"

    struct Source {
        let id: BookSourceID
        let kind: BookSourceKind
        let cacheDirectory: URL
        let folderDirectory: URL?
    }

    let applicationSupportDirectory: URL
    let sources: [Source]

    var highlightsDirectory: URL {
        applicationSupportDirectory.appendingPathComponent("Highlights", isDirectory: true)
    }

    var v1Directory: URL {
        highlightsDirectory.appendingPathComponent("V1", isDirectory: true)
    }

    var sentinelURL: URL {
        applicationSupportDirectory
            .appendingPathComponent("Config", isDirectory: true)
            .appendingPathComponent("MigrationSentinels", isDirectory: true)
            .appendingPathComponent(Self.sentinelName, isDirectory: false)
    }

    func run() throws {
        let files = FileManager.default
        guard !files.fileExists(atPath: sentinelURL.path) else { return }

        let archiveCompleted = try archiveReleasedFiles()
        let archivedFiles = try archivedHighlightFiles()
        var pending: [(url: URL, highlights: ReleasedBookHighlights)] = []

        for url in archivedFiles where !markerExists(for: url) {
            let data: Data
            do {
                data = try Data(contentsOf: url)
            } catch {
                debugLog(
                    "[StorytellerMigrations] V1 highlight read deferred for \(url.lastPathComponent): \(error)"
                )
                continue
            }

            let decoded = decodeReleasedHighlights(data)
            guard let decoded,
                !decoded.bookId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                !decoded.highlights.isEmpty
            else {
                do {
                    try writeMarker(for: url)
                } catch {
                    debugLog(
                        "[StorytellerMigrations] V1 highlight marker deferred for \(url.lastPathComponent): \(error)"
                    )
                }
                continue
            }
            pending.append((url, decoded))
        }

        if !pending.isEmpty {
            let ownership = currentOwnership()

            for item in pending {
                guard let owners = ownership[item.highlights.bookId], !owners.isEmpty else {
                    continue
                }

                do {
                    try migrate(item.highlights, to: owners)
                    try writeMarker(for: item.url)
                } catch {
                    debugLog(
                        "[StorytellerMigrations] V1 highlight migration deferred for \(item.url.lastPathComponent): \(error)"
                    )
                }
            }
        }

        guard archiveCompleted else { return }
        guard try releasedRootJSONFiles().isEmpty else { return }
        guard try archivedHighlightFiles().allSatisfy({ markerExists(for: $0) }) else { return }

        try files.createDirectory(
            at: sentinelURL.deletingLastPathComponent(),
            withIntermediateDirectories: true,
        )
        try Data("done\n".utf8).write(to: sentinelURL, options: .atomic)
    }

    func markerURL(for archivedFile: URL) -> URL {
        URL(fileURLWithPath: archivedFile.path + Self.markerSuffix)
    }

    func v2FileURL(for bookID: BookID) -> URL {
        highlightsDirectory
            .appendingPathComponent("V2", isDirectory: true)
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.sourceID),
                isDirectory: true,
            )
            .appendingPathComponent(
                "\(encodedIdentityPathComponent(bookID.uuid)).json",
                isDirectory: false,
            )
    }

    private func archiveReleasedFiles() throws -> Bool {
        let files = FileManager.default
        guard files.fileExists(atPath: highlightsDirectory.path) else { return true }

        let contents = try files.contentsOfDirectory(
            at: highlightsDirectory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles],
        )
        let rootJSONNames = Set(
            contents
                .filter { $0.pathExtension.lowercased() == "json" }
                .map(\.lastPathComponent)
        )
        var completed = true

        for url in contents where url.pathExtension.lowercased() == "json" {
            let destination = v1Directory.appendingPathComponent(
                url.lastPathComponent,
                isDirectory: false,
            )
            if !archive(url, at: destination) {
                completed = false
            }
        }

        for url in contents where url.pathExtension.lowercased() == "tmp" {
            let stem = url.deletingPathExtension().lastPathComponent
            guard !stem.isEmpty else { continue }
            let logicalName = "\(stem).json"
            let destination = v1Directory.appendingPathComponent(
                logicalName,
                isDirectory: false,
            )

            if rootJSONNames.contains(logicalName) || regularFileExists(at: destination) {
                try? files.removeItem(at: url)
            } else if !archive(url, at: destination) {
                completed = false
            }
        }

        return completed
    }

    private func archive(_ source: URL, at destination: URL) -> Bool {
        let files = FileManager.default
        do {
            if files.fileExists(atPath: destination.path) {
                guard regularFileExists(at: destination) else { return false }
            } else {
                try files.createDirectory(
                    at: destination.deletingLastPathComponent(),
                    withIntermediateDirectories: true,
                )
                try Data(contentsOf: source).write(to: destination, options: .atomic)
            }
            try files.removeItem(at: source)
            return true
        } catch {
            debugLog(
                "[StorytellerMigrations] V1 highlight archival deferred for \(source.lastPathComponent): \(error)"
            )
            return false
        }
    }

    private func releasedRootJSONFiles() throws -> [URL] {
        let files = FileManager.default
        guard files.fileExists(atPath: highlightsDirectory.path) else { return [] }
        return try files.contentsOfDirectory(
            at: highlightsDirectory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles],
        ).filter { $0.pathExtension.lowercased() == "json" }
    }

    private func archivedHighlightFiles() throws -> [URL] {
        let files = FileManager.default
        guard files.fileExists(atPath: v1Directory.path) else { return [] }
        return try files.contentsOfDirectory(
            at: v1Directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles],
        ).filter {
            $0.pathExtension.lowercased() == "json" && regularFileExists(at: $0)
        }.sorted { $0.path < $1.path }
    }

    private func markerExists(for archivedFile: URL) -> Bool {
        regularFileExists(at: markerURL(for: archivedFile))
    }

    private func regularFileExists(at url: URL) -> Bool {
        (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
    }

    private func writeMarker(for archivedFile: URL) throws {
        try Data("done\n".utf8).write(to: markerURL(for: archivedFile), options: .atomic)
    }

    private func decodeReleasedHighlights(_ data: Data) -> ReleasedBookHighlights? {
        guard !data.isEmpty else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(ReleasedBookHighlights.self, from: data)
    }

    private func currentOwnership() -> [String: Set<BookSourceID>] {
        let files = FileManager.default
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        var ownership: [String: Set<BookSourceID>] = [:]

        for source in sources {
            do {
                let uuids: [String]
                switch source.kind {
                    case .storyteller:
                        let url = source.cacheDirectory.appendingPathComponent(
                            "library_metadata.json",
                            isDirectory: false,
                        )
                        guard files.fileExists(atPath: url.path) else { continue }
                        let books = try decoder.decode(
                            [BookMetadata].self,
                            from: Data(contentsOf: url),
                        )
                        uuids = books.map(\.id.uuid)
                    case .localFolder:
                        guard let directory = source.folderDirectory else { continue }
                        let url = directory.appendingPathComponent(
                            "library_metadata.json",
                            isDirectory: false,
                        )
                        guard files.fileExists(atPath: url.path) else { continue }
                        let state = try decoder.decode(
                            FolderSourceLibraryState.self,
                            from: Data(contentsOf: url),
                        )
                        guard state.sourceID == source.id else {
                            debugLog(
                                "[StorytellerMigrations] Ignoring highlight ownership from folder state with the wrong source ID: \(source.id)"
                            )
                            continue
                        }
                        uuids = state.works.map(\.uuid)
                }

                for uuid in uuids where !uuid.isEmpty {
                    ownership[uuid, default: []].insert(source.id)
                }
            } catch {
                debugLog(
                    "[StorytellerMigrations] Highlight ownership unavailable for source \(source.id): \(error)"
                )
            }
        }
        return ownership
    }

    private func migrate(
        _ released: ReleasedBookHighlights,
        to owners: Set<BookSourceID>,
    ) throws {
        for sourceID in owners.sorted() {
            let bookID = BookID(sourceID: sourceID, uuid: released.bookId)
            let migrated = released.highlights.map { $0.sourceScoped(to: bookID) }
            let existing = try loadV2(bookID: bookID)
            var existingIDs = Set(existing.map(\.id))
            let additions = migrated.filter { existingIDs.insert($0.id).inserted }
            guard !additions.isEmpty else { continue }
            try saveV2(existing + additions, bookID: bookID)
        }
    }

    private func loadV2(bookID: BookID) throws -> [Highlight] {
        let url = v2FileURL(for: bookID)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([Highlight].self, from: Data(contentsOf: url))
    }

    private func saveV2(_ highlights: [Highlight], bookID: BookID) throws {
        let url = v2FileURL(for: bookID)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true,
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(highlights).write(to: url, options: .atomic)
    }
}

extension FilesystemActor {
    func runBookHighlightsMigration(for sourceRecords: [BookSourceRecord]) throws {
        guard !migrationSentinelExists(BookHighlightsMigration.sentinelName) else { return }

        var scopedFolders: [URL] = []
        defer {
            #if canImport(Darwin)
            for url in scopedFolders {
                url.stopAccessingSecurityScopedResource()
            }
            #endif
        }

        let sources = sourceRecords.map { source in
            BookHighlightsMigration.Source(
                id: source.id,
                kind: source.kind,
                cacheDirectory: sourceCacheDirectory(sourceID: source.id),
                folderDirectory: source.kind == .localFolder
                    ? availableMigrationFolder(for: source, scopedFolders: &scopedFolders)
                    : nil,
            )
        }
        try BookHighlightsMigration(
            applicationSupportDirectory: getConfigDirectory().deletingLastPathComponent(),
            sources: sources,
        ).run()
    }
}
