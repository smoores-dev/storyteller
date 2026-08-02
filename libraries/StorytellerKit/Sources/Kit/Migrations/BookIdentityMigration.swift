import Foundation

private struct LegacyPendingProgressSync: Decodable {
    let bookId: String
    let sourceID: BookSourceID?
    let locator: BookLocator
    let timestamp: Double
    let syncedToStoryteller: Bool
}

enum BookIdentityMigrationError: Error {
    case sourceRegistryUnavailable
}

struct BookIdentityMigration {
    static let sentinelName = "book-identity-v2"
    static let legacyLocalProgressStashName = "legacy_local_library_metadata.json"

    struct Source {
        let id: BookSourceID
        let kind: BookSourceKind
        let cacheDirectory: URL
        let folderDirectory: URL?
        let isInternalFolder: Bool
    }

    let applicationSupportDirectory: URL
    let documentsDirectory: URL?
    let sources: [Source]
    let defaults: UserDefaults

    private var configDirectory: URL {
        applicationSupportDirectory.appendingPathComponent("Config", isDirectory: true)
    }

    private var sentinelURL: URL {
        configDirectory
            .appendingPathComponent("MigrationSentinels", isDirectory: true)
            .appendingPathComponent(Self.sentinelName, isDirectory: false)
    }

    func run() throws {
        let files = FileManager.default
        guard !files.fileExists(atPath: sentinelURL.path) else { return }
        guard !sources.isEmpty else {
            throw BookIdentityMigrationError.sourceRegistryUnavailable
        }

        try files.createDirectory(at: configDirectory, withIntermediateDirectories: true)

        var owners: [String: Set<BookSourceID>] = [:]
        for source in sources {
            let uuids: Set<String>
            switch source.kind {
                case .storyteller:
                    uuids = try migrateSourceCache(for: source)
                case .localFolder:
                    uuids = try migrateAvailableFolderState(for: source)
            }
            for uuid in uuids {
                owners[uuid, default: []].insert(source.id)
            }
        }

        try migrateProgressQueue()
        try migrateSyncHistory(owners: owners)
        try purgeDisposableState()

        defaults.removeObject(forKey: "iOSLastOpenBookRoute")
        defaults.removeObject(forKey: "doubleCoverAudioFront")

        try files.createDirectory(
            at: sentinelURL.deletingLastPathComponent(),
            withIntermediateDirectories: true,
        )
        try Data("done\n".utf8).write(to: sentinelURL, options: .atomic)
    }

    private func migrateSourceCache(for source: Source) throws -> Set<String> {
        let url = source.cacheDirectory.appendingPathComponent(
            "library_metadata.json",
            isDirectory: false,
        )
        let files = FileManager.default
        guard files.fileExists(atPath: url.path) else { return [] }

        let data = try Data(contentsOf: url)
        guard let objects = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            try files.removeItem(at: url)
            return []
        }

        let books = migratedBooks(objects, sourceID: source.id)
        if !objects.isEmpty, books.isEmpty {
            try files.removeItem(at: url)
            return []
        }

        try writeBooks(books, to: url)
        return Set(books.map(\.uuid))
    }

    private func migrateAvailableFolderState(for source: Source) throws -> Set<String> {
        guard let directory = source.folderDirectory else { return [] }
        let url = directory.appendingPathComponent("library_metadata.json", isDirectory: false)
        let files = FileManager.default
        guard files.fileExists(atPath: url.path) else { return [] }

        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            if isLegacyLocalSource(source) { throw error }
            return []
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard let state = try? decoder.decode(FolderSourceLibraryState.self, from: data),
            state.sourceID == source.id
        else { return [] }
        return Set(state.works.map(\.uuid))
    }

    func prepareLegacyLocalProgress() throws {
        let files = FileManager.default
        guard let source = sources.first(where: isLegacyLocalSource) else {
            try removeIfPresent(legacyLocalProgressStashURL)
            return
        }

        let internalFolderMetadataURL =
            applicationSupportDirectory
            .appendingPathComponent("InternalFolderSource", isDirectory: true)
            .appendingPathComponent("library_metadata.json", isDirectory: false)
        let candidates = [
            // Intermediate development builds wrote the legacy array at the path now owned by
            // FolderSourceLibraryState. Prefer that live copy over a stash left by a failed retry.
            internalFolderMetadataURL,
            legacyLocalProgressStashURL,
            applicationSupportDirectory
                .appendingPathComponent("local_media", isDirectory: true)
                .appendingPathComponent("library_metadata.json", isDirectory: false),
        ]
        for input in candidates where files.fileExists(atPath: input.path) {
            let data = try Data(contentsOf: input)
            guard
                let objects = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
            else {
                if input == legacyLocalProgressStashURL {
                    try removeIfPresent(input)
                }
                continue
            }

            let books = migratedBooks(objects, sourceID: source.id)
            guard objects.isEmpty || !books.isEmpty else {
                if input == legacyLocalProgressStashURL {
                    try removeIfPresent(input)
                }
                continue
            }
            try writeBooks(books, to: legacyLocalProgressStashURL)
            if input == internalFolderMetadataURL {
                // The folder scanner expects a top-level FolderSourceLibraryState object here.
                // Remove only a confirmed legacy array, and only after the atomic stash can be
                // decoded by the later merge step, so a failed startup remains retryable.
                try validateLegacyLocalProgressStash()
                try removeIfPresent(input)
            }
            return
        }
    }

    private var legacyLocalProgressStashURL: URL {
        configDirectory.appendingPathComponent(
            Self.legacyLocalProgressStashName,
            isDirectory: false,
        )
    }

    private func isLegacyLocalSource(_ source: Source) -> Bool {
        source.kind == .localFolder && source.isInternalFolder
    }

    private func migratedBooks(
        _ objects: [[String: Any]],
        sourceID: BookSourceID,
    ) -> [BookMetadata] {
        objects.compactMap { decodeBook($0, sourceID: sourceID) }
    }

    private func writeBooks(_ books: [BookMetadata], to url: URL) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true,
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(books).write(to: url, options: .atomic)
    }

    private func validateLegacyLocalProgressStash() throws {
        let data = try Data(contentsOf: legacyLocalProgressStashURL)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        _ = try decoder.decode([BookMetadata].self, from: data)
    }

    private func decodeBook(_ object: [String: Any], sourceID: BookSourceID) -> BookMetadata? {
        guard let migrated = migratedBookObject(object, sourceID: sourceID),
            let data = try? JSONSerialization.data(withJSONObject: migrated)
        else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try? decoder.decode(BookMetadata.self, from: data)
    }

    private func migratedBookObject(
        _ object: [String: Any],
        sourceID: BookSourceID,
    ) -> [String: Any]? {
        let currentID = object["id"] as? [String: Any]
        guard let uuid = (object["uuid"] as? String) ?? (currentID?["uuid"] as? String) else {
            return nil
        }

        var migrated = object
        migrated["id"] = ["sourceID": sourceID, "uuid": uuid]
        migrated.removeValue(forKey: "uuid")
        migrated.removeValue(forKey: "sourceID")
        migrated.removeValue(forKey: "source_id")
        return migrated
    }

    private func migrateProgressQueue() throws {
        let legacyURL = configDirectory.appendingPathComponent(
            "offline_progress_queue.json",
            isDirectory: false,
        )
        let currentURL = configDirectory.appendingPathComponent(
            "offline_progress_queue_v2.json",
            isDirectory: false,
        )
        let tempURL = configDirectory.appendingPathComponent(
            "offline_progress_queue.tmp",
            isDirectory: false,
        )
        let files = FileManager.default

        if files.fileExists(atPath: currentURL.path),
            let currentData = try? Data(contentsOf: currentURL),
            (try? progressDecoder().decode([PendingProgressSync].self, from: currentData)) != nil
        {
            try removeIfPresent(legacyURL)
            try removeIfPresent(tempURL)
            return
        }

        let legacy: [LegacyPendingProgressSync]
        let inputURL: URL? =
            files.fileExists(atPath: legacyURL.path)
            ? legacyURL
            : files.fileExists(atPath: tempURL.path) ? tempURL : nil
        if let inputURL {
            let data = try Data(contentsOf: inputURL)
            legacy =
                (try? progressDecoder().decode([LegacyPendingProgressSync].self, from: data)) ?? []
        } else {
            legacy = []
        }

        let migrated = legacy.compactMap { entry -> PendingProgressSync? in
            guard let sourceID = entry.sourceID,
                !sourceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else {
                return nil
            }
            return PendingProgressSync(
                bookID: BookID(sourceID: sourceID, uuid: entry.bookId),
                locator: entry.locator,
                timestamp: entry.timestamp,
                syncedToStoryteller: entry.syncedToStoryteller,
            )
        }

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(migrated).write(to: currentURL, options: .atomic)
        try removeIfPresent(legacyURL)
        try removeIfPresent(tempURL)
    }

    private func migrateSyncHistory(owners: [String: Set<BookSourceID>]) throws {
        let legacyURL = configDirectory.appendingPathComponent(
            "sync_history.json",
            isDirectory: false,
        )
        let currentURL = configDirectory.appendingPathComponent(
            "sync_history_v2.json",
            isDirectory: false,
        )
        let tempURL = configDirectory.appendingPathComponent(
            "sync_history.tmp",
            isDirectory: false,
        )
        let files = FileManager.default

        if files.fileExists(atPath: currentURL.path),
            let currentData = try? Data(contentsOf: currentURL),
            (try? decodePersistedSyncHistory(currentData)) != nil
        {
            try removeIfPresent(legacyURL)
            try removeIfPresent(tempURL)
            return
        }

        var migrated: [BookID: [SyncHistoryEntry]] = [:]
        let inputURL: URL? =
            files.fileExists(atPath: legacyURL.path)
            ? legacyURL
            : files.fileExists(atPath: tempURL.path) ? tempURL : nil
        if let inputURL {
            let data = try Data(contentsOf: inputURL)
            if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                for (uuid, value) in object {
                    guard let sourceIDs = owners[uuid], sourceIDs.count == 1,
                        let sourceID = sourceIDs.first,
                        let entries = value as? [[String: Any]]
                    else {
                        continue
                    }
                    let decoded = entries.compactMap(decodeHistoryEntry)
                    if !decoded.isEmpty {
                        migrated[BookID(sourceID: sourceID, uuid: uuid)] = decoded
                    }
                }
            }
        }

        let store = PersistedSyncHistory(
            books:
                migrated
                .map { PersistedSyncHistory.Book(bookID: $0.key, entries: $0.value) }
                .sorted { $0.bookID < $1.bookID }
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(store).write(to: currentURL, options: .atomic)
        try removeIfPresent(legacyURL)
        try removeIfPresent(tempURL)
    }

    private func decodeHistoryEntry(_ object: [String: Any]) -> SyncHistoryEntry? {
        guard let result = object["result"] as? String else { return nil }
        let mappedResult: String
        switch result {
            case "persisted": mappedResult = "queued"
            case "sentToServer": mappedResult = "sent"
            case "serverConfirmed": mappedResult = "completed"
            case "failed": return nil
            case "queued", "sent", "completed", "rejectedAsOlder",
                "serverIncomingAccepted", "serverIncomingRejected":
                mappedResult = result
            default:
                return nil
        }

        var migrated = object
        migrated["result"] = mappedResult
        guard let data = try? JSONSerialization.data(withJSONObject: migrated) else { return nil }
        return try? JSONDecoder().decode(SyncHistoryEntry.self, from: data)
    }

    private func purgeDisposableState() throws {
        let legacyPaths = [
            configDirectory.appendingPathComponent("downloads.json", isDirectory: false),
            applicationSupportDirectory.appendingPathComponent("ResumeData", isDirectory: true),
            applicationSupportDirectory.appendingPathComponent(
                "ProgressUploadSpool",
                isDirectory: true,
            ),
            applicationSupportDirectory.appendingPathComponent("Covers", isDirectory: true),
            applicationSupportDirectory.appendingPathComponent("CoversCache", isDirectory: true),
            applicationSupportDirectory
                .appendingPathComponent("SourceCache", isDirectory: true)
                .appendingPathComponent("downloaded_media.json", isDirectory: false),
        ]
        for url in legacyPaths {
            try removeIfPresent(url)
        }

        for source in sources {
            try removeIfPresent(
                source.cacheDirectory.appendingPathComponent(
                    "downloaded_media.json",
                    isDirectory: false,
                )
            )
        }

        if let documentsDirectory {
            try removeIfPresent(
                documentsDirectory.appendingPathComponent("chunks", isDirectory: true)
            )
        }
    }

    private func progressDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    private func removeIfPresent(_ url: URL) throws {
        let files = FileManager.default
        guard files.fileExists(atPath: url.path) else { return }
        try files.removeItem(at: url)
    }
}

extension FilesystemActor {
    func prepareBookIdentityMigrationBeforeStorage(
        for sourceRecords: [BookSourceRecord]
    ) throws {
        guard !migrationSentinelExists(BookIdentityMigration.sentinelName) else { return }
        guard !sourceRecords.isEmpty else {
            throw BookIdentityMigrationError.sourceRegistryUnavailable
        }

        let sources = sourceRecords.map { source in
            let isInternal = isInternalMigrationSource(source)
            return BookIdentityMigration.Source(
                id: source.id,
                kind: source.kind,
                cacheDirectory: sourceCacheDirectory(sourceID: source.id),
                folderDirectory: isInternal ? internalFolderSourceDirectory() : nil,
                isInternalFolder: isInternal,
            )
        }
        let migration = BookIdentityMigration(
            applicationSupportDirectory: getConfigDirectory().deletingLastPathComponent(),
            documentsDirectory: nil,
            sources: sources,
            defaults: .standard,
        )
        try migration.prepareLegacyLocalProgress()
    }

    func runBookIdentityMigration(for sourceRecords: [BookSourceRecord]) async throws {
        guard !migrationSentinelExists(BookIdentityMigration.sentinelName) else { return }
        guard !sourceRecords.isEmpty else {
            throw BookIdentityMigrationError.sourceRegistryUnavailable
        }

        try await migrateLegacyLocalProgressForBookIdentityMigration(
            sourceRecords: sourceRecords
        )

        var scopedFolders: [URL] = []
        defer {
            #if canImport(Darwin)
            for url in scopedFolders {
                url.stopAccessingSecurityScopedResource()
            }
            #endif
        }

        let sources = sourceRecords.map { source -> BookIdentityMigration.Source in
            let isInternal = isInternalMigrationSource(source)
            let folderDirectory: URL?
            if source.kind == .localFolder {
                folderDirectory = availableMigrationFolder(
                    for: source,
                    scopedFolders: &scopedFolders,
                )
            } else {
                folderDirectory = nil
            }
            return BookIdentityMigration.Source(
                id: source.id,
                kind: source.kind,
                cacheDirectory: sourceCacheDirectory(sourceID: source.id),
                folderDirectory: folderDirectory,
                isInternalFolder: isInternal,
            )
        }

        #if os(watchOS)
        let documentsDirectory = FileManager.default.urls(
            for: .documentDirectory,
            in: .userDomainMask,
        ).first
        #else
        let documentsDirectory: URL? = nil
        #endif

        await cancelLegacyBookIdentityBackgroundTasks()

        let migration = BookIdentityMigration(
            applicationSupportDirectory: getConfigDirectory().deletingLastPathComponent(),
            documentsDirectory: documentsDirectory,
            sources: sources,
            defaults: .standard,
        )
        try migration.run()
    }

    private func migrateLegacyLocalProgressForBookIdentityMigration(
        sourceRecords: [BookSourceRecord]
    ) async throws {
        let stashURL = getConfigDirectory().appendingPathComponent(
            BookIdentityMigration.legacyLocalProgressStashName,
            isDirectory: false,
        )
        let files = FileManager.default
        guard files.fileExists(atPath: stashURL.path) else { return }

        let data = try Data(contentsOf: stashURL)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard let legacy = try? decoder.decode([BookMetadata].self, from: data),
            !legacy.isEmpty,
            let source = sourceRecords.first(where: isInternalMigrationSource)
        else {
            try files.removeItem(at: stashURL)
            return
        }

        let folderURL = internalFolderSourceDirectory()
        _ = try await FolderSourceActor(sourceRecord: source).scanLibrary(in: folderURL)
        let scanned =
            try loadFolderSourceLibraryState(in: folderURL)
            ?? FolderSourceLibraryState(sourceID: source.id)
        let merged = LegacyLocalProgressMerge.merge(into: scanned, legacy: legacy)
        try saveFolderSourceLibraryState(merged, in: folderURL)
        try files.removeItem(at: stashURL)
    }

    private func cancelLegacyBookIdentityBackgroundTasks() async {
        #if canImport(Darwin)
        #if os(watchOS)
        let identifiers = [
            "dev.smoores.storyteller.watch.downloads",
            "dev.smoores.storyteller.watch.progressupload",
        ]
        #else
        let identifiers = [
            "dev.smoores.storyteller.downloads",
            "dev.smoores.storyteller.progressupload",
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

    func availableMigrationFolder(
        for source: BookSourceRecord,
        scopedFolders: inout [URL],
    ) -> URL? {
        #if os(macOS) || os(iOS)
        if let bookmarkData = source.storageBookmarkData {
            var stale = false
            let options: URL.BookmarkResolutionOptions = {
                #if os(macOS)
                return [.withSecurityScope]
                #else
                return []
                #endif
            }()
            guard
                let url = try? URL(
                    resolvingBookmarkData: bookmarkData,
                    options: options,
                    relativeTo: nil,
                    bookmarkDataIsStale: &stale,
                )
            else {
                return nil
            }
            if url.startAccessingSecurityScopedResource() {
                scopedFolders.append(url)
            }
            return FileManager.default.fileExists(atPath: url.path) ? url : nil
        }
        #endif

        let url: URL
        if let storagePath = source.storagePath, !storagePath.isEmpty {
            url = rebasedContainerFolderURL(
                for: URL(fileURLWithPath: storagePath, isDirectory: true)
            )
        } else {
            url = internalFolderSourceDirectory()
        }
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private func isInternalMigrationSource(_ source: BookSourceRecord) -> Bool {
        guard source.kind == .localFolder, source.storageBookmarkData == nil else { return false }
        guard let storagePath = source.storagePath, !storagePath.isEmpty else { return true }
        let configured = rebasedContainerFolderURL(
            for: URL(fileURLWithPath: storagePath, isDirectory: true)
        )
        return configured.standardizedFileURL
            == internalFolderSourceDirectory().standardizedFileURL
    }
}

enum LegacyLocalProgressMerge {
    static func merge(
        into state: FolderSourceLibraryState,
        legacy: [BookMetadata],
    ) -> FolderSourceLibraryState {
        let candidates = legacy.filter {
            $0.position != nil || $0.status != nil || $0.rating != nil
        }
        guard !candidates.isEmpty else { return state }

        var state = state
        let mediaByID = Dictionary(
            state.media.map { ($0.uuid, $0) },
            uniquingKeysWith: { first, _ in first },
        )
        let index = state.works.enumerated().map { offset, work in
            (
                offset: offset, names: filenames(of: work, mediaByID: mediaByID),
                title: titleKey(work.title),
            )
        }

        var consumed: Set<Int> = []
        for book in candidates {
            let bookNames = filenames(of: book)
            let bookTitle = titleKey(book.title)
            let match =
                index.first {
                    !consumed.contains($0.offset) && !bookNames.isEmpty
                        && !$0.names.isDisjoint(with: bookNames)
                }?.offset
                ?? index.first {
                    !consumed.contains($0.offset) && !bookTitle.isEmpty && $0.title == bookTitle
                }?.offset
            guard let offset = match else { continue }
            consumed.insert(offset)
            if !book.uuid.isEmpty { state.works[offset].uuid = book.uuid }
            if state.works[offset].position == nil { state.works[offset].position = book.position }
            if state.works[offset].status == nil { state.works[offset].status = book.status }
            if state.works[offset].rating == nil { state.works[offset].rating = book.rating }
        }
        return state
    }

    private static func filenames(
        of work: FolderSourceWork,
        mediaByID: [String: FolderSourceMedia],
    ) -> Set<String> {
        Set(
            work.mediaIDs.values
                .compactMap { mediaByID[$0] }
                .flatMap(\.relativePaths)
                .map { ($0 as NSString).lastPathComponent.lowercased() }
        )
    }

    private static func filenames(of book: BookMetadata) -> Set<String> {
        Set(
            [book.ebook?.filepath, book.audiobook?.filepath, book.readaloud?.filepath ?? nil]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .map { ($0 as NSString).lastPathComponent.lowercased() }
        )
    }

    private static func titleKey(_ title: String?) -> String {
        (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}
