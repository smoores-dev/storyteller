import Foundation
import Testing

@testable import StorytellerKit

private struct LegacyQueueItem: Encodable {
    let bookId: String
    let sourceID: String?
    let locator: BookLocator
    let timestamp: Double
    let syncedToStoryteller: Bool
}

private actor StartupAttemptCounter {
    private var value = 0

    func increment() {
        value += 1
    }

    func count() -> Int {
        value
    }
}

private struct MigrationFixture {
    let root: URL
    let applicationSupport: URL
    let documents: URL
    let storytellerCache: URL
    let folderSource: URL
    let defaults: UserDefaults

    init() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        applicationSupport = root.appendingPathComponent("ApplicationSupport", isDirectory: true)
        documents = root.appendingPathComponent("Documents", isDirectory: true)
        storytellerCache =
            applicationSupport
            .appendingPathComponent("SourceCache", isDirectory: true)
            .appendingPathComponent("source-a", isDirectory: true)
        folderSource = root.appendingPathComponent("FolderSource", isDirectory: true)

        let suite = "BookIdentityMigrationTests.\(UUID().uuidString)"
        defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)

        for directory in [applicationSupport, documents, storytellerCache, folderSource] {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
            )
        }
    }

    var sources: [BookIdentityMigration.Source] {
        [
            BookIdentityMigration.Source(
                id: "source-a",
                kind: .storyteller,
                cacheDirectory: storytellerCache,
                folderDirectory: nil,
                isInternalFolder: false,
            ),
            BookIdentityMigration.Source(
                id: "source-b",
                kind: .localFolder,
                cacheDirectory:
                    applicationSupport
                    .appendingPathComponent("SourceCache", isDirectory: true)
                    .appendingPathComponent("source-b", isDirectory: true),
                folderDirectory: folderSource,
                isInternalFolder: false,
            ),
        ]
    }

    var migration: BookIdentityMigration {
        BookIdentityMigration(
            applicationSupportDirectory: applicationSupport,
            documentsDirectory: documents,
            sources: sources,
            defaults: defaults,
        )
    }

    var config: URL {
        applicationSupport.appendingPathComponent("Config", isDirectory: true)
    }

    var sentinel: URL {
        config
            .appendingPathComponent("MigrationSentinels", isDirectory: true)
            .appendingPathComponent(BookIdentityMigration.sentinelName, isDirectory: false)
    }

    var internalFolderSource: URL {
        applicationSupport.appendingPathComponent("InternalFolderSource", isDirectory: true)
    }

    var legacyLocalProgressStash: URL {
        config.appendingPathComponent(
            BookIdentityMigration.legacyLocalProgressStashName,
            isDirectory: false,
        )
    }

    var internalFolderMigration: BookIdentityMigration {
        BookIdentityMigration(
            applicationSupportDirectory: applicationSupport,
            documentsDirectory: documents,
            sources: [
                BookIdentityMigration.Source(
                    id: "internal-source",
                    kind: .localFolder,
                    cacheDirectory:
                        applicationSupport
                        .appendingPathComponent("SourceCache", isDirectory: true)
                        .appendingPathComponent("internal-source", isDirectory: true),
                    folderDirectory: internalFolderSource,
                    isInternalFolder: true,
                )
            ],
            defaults: defaults,
        )
    }
}

@Test func runtimeStateRetriesFailuresAndCachesSuccess() async {
    let state = StorytellerRuntimeState()
    let attempts = StartupAttemptCounter()

    let first = await state.run {
        await attempts.increment()
        return false
    }
    let second = await state.run {
        await attempts.increment()
        return true
    }
    let cached = await state.run {
        await attempts.increment()
        return false
    }

    #expect(!first)
    #expect(second)
    #expect(cached)
    #expect(await attempts.count() == 2)
}

@Test func terminalBookIdentityMigrationMigratesOwnedStateAndPurgesDisposableState() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    try FileManager.default.createDirectory(at: fixture.config, withIntermediateDirectories: true)

    try writeJSON(
        [
            ["uuid": "unique", "title": "Unique", "sourceID": "wrong"],
            ["uuid": "shared", "title": "Shared"],
            ["title": "Malformed"],
        ],
        to: fixture.storytellerCache.appendingPathComponent("library_metadata.json"),
    )
    try writeJSON(
        [
            "schemaVersion": 1,
            "sourceID": "source-b",
            "works": [
                [
                    "uuid": "shared", "title": "Shared", "mediaIDs": [],
                    "groupingKey": "Shared",
                ],
                [
                    "uuid": "folder-only", "title": "Folder Only", "mediaIDs": [],
                    "groupingKey": "Folder Only",
                ],
            ],
            "media": [
                [
                    "uuid": "media-id",
                    "role": "ebook",
                    "relativePaths": ["book.epub"],
                    "signature": ["fileCount": 1, "totalSize": 12, "modifiedAt": [:]],
                    "extractedMetadata": [
                        "uuid": "embedded", "title": "Embedded", "sourceID": "wrong",
                    ],
                    "missing": false,
                    "previousRelativePaths": [],
                ]
            ],
        ],
        to: fixture.folderSource.appendingPathComponent("library_metadata.json"),
    )

    let locator = BookLocator(
        href: "chapter.xhtml",
        type: "text/html",
        title: nil,
        locations: nil,
        text: nil,
    )
    let queue = [
        LegacyQueueItem(
            bookId: "unique",
            sourceID: "source-a",
            locator: locator,
            timestamp: 10,
            syncedToStoryteller: true,
        ),
        LegacyQueueItem(
            bookId: "missing-source",
            sourceID: nil,
            locator: locator,
            timestamp: 11,
            syncedToStoryteller: false,
        ),
        LegacyQueueItem(
            bookId: "empty-source",
            sourceID: "  ",
            locator: locator,
            timestamp: 12,
            syncedToStoryteller: false,
        ),
    ]
    let queueEncoder = JSONEncoder()
    queueEncoder.dateEncodingStrategy = .iso8601
    try queueEncoder.encode(queue).write(
        to: fixture.config.appendingPathComponent("offline_progress_queue.json"),
        options: .atomic,
    )

    let accepted = try historyObject(result: "persisted")
    let failed = try historyObject(result: "failed")
    try writeJSON(
        [
            "unique": [accepted, failed],
            "shared": [accepted],
            "folder-only": [accepted],
            "unknown": [accepted],
        ],
        to: fixture.config.appendingPathComponent("sync_history.json"),
    )

    let disposable = [
        fixture.config.appendingPathComponent("downloads.json"),
        fixture.applicationSupport.appendingPathComponent("ResumeData/blob"),
        fixture.applicationSupport.appendingPathComponent("ProgressUploadSpool/body"),
        fixture.applicationSupport.appendingPathComponent("Covers/cover"),
        fixture.applicationSupport.appendingPathComponent("CoversCache/cover"),
        fixture.storytellerCache.appendingPathComponent("downloaded_media.json"),
        fixture.documents.appendingPathComponent("chunks/part"),
    ]
    for url in disposable {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true,
        )
        try Data("legacy".utf8).write(to: url)
    }
    fixture.defaults.set(Data("route".utf8), forKey: "iOSLastOpenBookRoute")
    fixture.defaults.set(["unique"], forKey: "doubleCoverAudioFront")

    try fixture.migration.run()

    let metadataData = try Data(
        contentsOf: fixture.storytellerCache.appendingPathComponent("library_metadata.json")
    )
    let metadata = try JSONDecoder().decode([BookMetadata].self, from: metadataData)
    #expect(
        Set(metadata.map(\.id))
            == Set([
                BookID(sourceID: "source-a", uuid: "unique"),
                BookID(sourceID: "source-a", uuid: "shared"),
            ])
    )

    let folderData = try Data(
        contentsOf: fixture.folderSource.appendingPathComponent("library_metadata.json")
    )
    let folder = try JSONDecoder().decode(FolderSourceLibraryState.self, from: folderData)
    #expect(folder.media.first?.extractedMetadata?.title == "Embedded")

    let queueData = try Data(
        contentsOf: fixture.config.appendingPathComponent("offline_progress_queue_v2.json")
    )
    let migratedQueue = try JSONDecoder().decode([PendingProgressSync].self, from: queueData)
    #expect(migratedQueue.count == 1)
    #expect(migratedQueue.first?.bookID == BookID(sourceID: "source-a", uuid: "unique"))
    #expect(migratedQueue.first?.syncedToStoryteller == true)

    let historyData = try Data(
        contentsOf: fixture.config.appendingPathComponent("sync_history_v2.json")
    )
    let history = try decodePersistedSyncHistory(historyData)
    #expect(
        Set(history.keys)
            == Set([
                BookID(sourceID: "source-a", uuid: "unique"),
                BookID(sourceID: "source-b", uuid: "folder-only"),
            ])
    )
    #expect(history[BookID(sourceID: "source-a", uuid: "unique")]?.map(\.result) == [.queued])

    for url in disposable {
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }
    #expect(fixture.defaults.object(forKey: "iOSLastOpenBookRoute") == nil)
    #expect(fixture.defaults.object(forKey: "doubleCoverAudioFront") == nil)
    #expect(FileManager.default.fileExists(atPath: fixture.sentinel.path))

}

@Test func terminalBookIdentityMigrationTreatsValidV2FilesAsAuthoritative() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    try FileManager.default.createDirectory(at: fixture.config, withIntermediateDirectories: true)

    let locator = BookLocator(
        href: "current.xhtml",
        type: "text/html",
        title: nil,
        locations: nil,
        text: nil,
    )
    let currentQueue = [
        PendingProgressSync(
            bookID: BookID(sourceID: "current-source", uuid: "current-book"),
            locator: locator,
            timestamp: 99,
        )
    ]
    try JSONEncoder().encode(currentQueue).write(
        to: fixture.config.appendingPathComponent("offline_progress_queue_v2.json")
    )
    try writeJSON([], to: fixture.config.appendingPathComponent("offline_progress_queue.json"))
    try Data("stale queue temp".utf8).write(
        to: fixture.config.appendingPathComponent("offline_progress_queue.tmp")
    )

    let currentHistory = PersistedSyncHistory(
        books: [
            PersistedSyncHistory.Book(
                bookID: BookID(sourceID: "current-source", uuid: "current-book"),
                entries: [],
            )
        ]
    )
    try JSONEncoder().encode(currentHistory).write(
        to: fixture.config.appendingPathComponent("sync_history_v2.json")
    )
    try writeJSON([:], to: fixture.config.appendingPathComponent("sync_history.json"))
    try Data("stale history temp".utf8).write(
        to: fixture.config.appendingPathComponent("sync_history.tmp")
    )

    try fixture.migration.run()

    let queueData = try Data(
        contentsOf: fixture.config.appendingPathComponent("offline_progress_queue_v2.json")
    )
    #expect(try JSONDecoder().decode([PendingProgressSync].self, from: queueData) == currentQueue)
    let historyData = try Data(
        contentsOf: fixture.config.appendingPathComponent("sync_history_v2.json")
    )
    #expect(
        Set(try decodePersistedSyncHistory(historyData).keys)
            == Set([
                BookID(sourceID: "current-source", uuid: "current-book")
            ])
    )
    #expect(
        !FileManager.default.fileExists(
            atPath: fixture.config.appendingPathComponent("offline_progress_queue.json").path
        )
    )
    #expect(
        !FileManager.default.fileExists(
            atPath: fixture.config.appendingPathComponent("sync_history.json").path
        )
    )
    #expect(
        !FileManager.default.fileExists(
            atPath: fixture.config.appendingPathComponent("offline_progress_queue.tmp").path
        )
    )
    #expect(
        !FileManager.default.fileExists(
            atPath: fixture.config.appendingPathComponent("sync_history.tmp").path
        )
    )
}

@Test func terminalBookIdentityMigrationRecoversTempOnlyTransactions() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    try FileManager.default.createDirectory(at: fixture.config, withIntermediateDirectories: true)
    try writeJSON(
        [["uuid": "temp-book", "title": "Temp Book"]],
        to: fixture.storytellerCache.appendingPathComponent("library_metadata.json"),
    )

    let locator = BookLocator(
        href: "temp.xhtml",
        type: "text/html",
        title: nil,
        locations: nil,
        text: nil,
    )
    let queue = [
        LegacyQueueItem(
            bookId: "temp-book",
            sourceID: "source-a",
            locator: locator,
            timestamp: 10,
            syncedToStoryteller: false,
        ),
        LegacyQueueItem(
            bookId: "dropped",
            sourceID: nil,
            locator: locator,
            timestamp: 11,
            syncedToStoryteller: false,
        ),
    ]
    let queueEncoder = JSONEncoder()
    queueEncoder.dateEncodingStrategy = .iso8601
    try queueEncoder.encode(queue).write(
        to: fixture.config.appendingPathComponent("offline_progress_queue.tmp"),
        options: .atomic,
    )
    try writeJSON(
        ["temp-book": [try historyObject(result: "persisted")]],
        to: fixture.config.appendingPathComponent("sync_history.tmp"),
    )

    try fixture.migration.run()

    let queueData = try Data(
        contentsOf: fixture.config.appendingPathComponent("offline_progress_queue_v2.json")
    )
    let migratedQueue = try JSONDecoder().decode([PendingProgressSync].self, from: queueData)
    #expect(migratedQueue.map(\.bookID) == [BookID(sourceID: "source-a", uuid: "temp-book")])
    let historyData = try Data(
        contentsOf: fixture.config.appendingPathComponent("sync_history_v2.json")
    )
    #expect(
        Set(try decodePersistedSyncHistory(historyData).keys)
            == [BookID(sourceID: "source-a", uuid: "temp-book")]
    )
    #expect(FileManager.default.fileExists(atPath: fixture.sentinel.path))
}

@Test func terminalBookIdentityMigrationPrefersCommittedJSONOverTemp() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    try FileManager.default.createDirectory(at: fixture.config, withIntermediateDirectories: true)
    try writeJSON(
        [
            ["uuid": "json-book", "title": "JSON Book"],
            ["uuid": "temp-book", "title": "Temp Book"],
        ],
        to: fixture.storytellerCache.appendingPathComponent("library_metadata.json"),
    )

    let locator = BookLocator(
        href: "chapter.xhtml",
        type: "text/html",
        title: nil,
        locations: nil,
        text: nil,
    )
    let queueEncoder = JSONEncoder()
    queueEncoder.dateEncodingStrategy = .iso8601
    try queueEncoder.encode([
        LegacyQueueItem(
            bookId: "json-book",
            sourceID: "source-a",
            locator: locator,
            timestamp: 1,
            syncedToStoryteller: false,
        )
    ]).write(
        to: fixture.config.appendingPathComponent("offline_progress_queue.json"),
        options: .atomic,
    )
    try queueEncoder.encode([
        LegacyQueueItem(
            bookId: "temp-book",
            sourceID: "source-a",
            locator: locator,
            timestamp: 2,
            syncedToStoryteller: false,
        )
    ]).write(
        to: fixture.config.appendingPathComponent("offline_progress_queue.tmp"),
        options: .atomic,
    )
    try writeJSON(
        ["json-book": [try historyObject(result: "persisted")]],
        to: fixture.config.appendingPathComponent("sync_history.json"),
    )
    try writeJSON(
        ["temp-book": [try historyObject(result: "persisted")]],
        to: fixture.config.appendingPathComponent("sync_history.tmp"),
    )

    try fixture.migration.run()

    let queueData = try Data(
        contentsOf: fixture.config.appendingPathComponent("offline_progress_queue_v2.json")
    )
    let migratedQueue = try JSONDecoder().decode([PendingProgressSync].self, from: queueData)
    #expect(migratedQueue.map(\.bookID) == [BookID(sourceID: "source-a", uuid: "json-book")])
    let historyData = try Data(
        contentsOf: fixture.config.appendingPathComponent("sync_history_v2.json")
    )
    #expect(
        Set(try decodePersistedSyncHistory(historyData).keys)
            == [BookID(sourceID: "source-a", uuid: "json-book")]
    )
}

@Test func terminalBookIdentityMigrationSentinelMakesLaterRunsNoOps() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    try fixture.migration.run()

    let legacyDownload = fixture.config.appendingPathComponent("downloads.json")
    try Data("created-after-migration".utf8).write(to: legacyDownload)
    fixture.defaults.set(Data("newer".utf8), forKey: "iOSLastOpenBookRoute")

    try fixture.migration.run()

    #expect(FileManager.default.fileExists(atPath: legacyDownload.path))
    #expect(fixture.defaults.data(forKey: "iOSLastOpenBookRoute") == Data("newer".utf8))
}

@Test func terminalBookIdentityMigrationDoesNotPublishSentinelAfterFailure() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    try FileManager.default.createDirectory(at: fixture.config, withIntermediateDirectories: true)

    let sentinelParent = fixture.sentinel.deletingLastPathComponent()
    try Data("not-a-directory".utf8).write(to: sentinelParent)

    #expect(throws: (any Error).self) {
        try fixture.migration.run()
    }
    #expect(!FileManager.default.fileExists(atPath: fixture.sentinel.path))

    try FileManager.default.removeItem(at: sentinelParent)
    try fixture.migration.run()
    #expect(FileManager.default.fileExists(atPath: fixture.sentinel.path))
}

@Test func terminalBookIdentityMigrationRequiresLoadedSourceRegistry() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let legacyDownload = fixture.config.appendingPathComponent("downloads.json")
    try FileManager.default.createDirectory(at: fixture.config, withIntermediateDirectories: true)
    try Data("keep".utf8).write(to: legacyDownload)

    let migration = BookIdentityMigration(
        applicationSupportDirectory: fixture.applicationSupport,
        documentsDirectory: fixture.documents,
        sources: [],
        defaults: fixture.defaults,
    )

    #expect(throws: BookIdentityMigrationError.sourceRegistryUnavailable) {
        try migration.run()
    }
    #expect(FileManager.default.fileExists(atPath: legacyDownload.path))
    #expect(!FileManager.default.fileExists(atPath: fixture.sentinel.path))
}

@Test func terminalBookIdentityMigrationPreservesProgressThroughReleasedStorageLayout()
    async throws
{
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let legacyRoot = fixture.applicationSupport.appendingPathComponent(
        "local_media",
        isDirectory: true,
    )
    let internalFolder = fixture.applicationSupport.appendingPathComponent(
        "InternalFolderSource",
        isDirectory: true,
    )
    let legacyMetadataURL = legacyRoot.appendingPathComponent(
        "library_metadata.json",
        isDirectory: false,
    )
    let stash = fixture.config.appendingPathComponent(
        BookIdentityMigration.legacyLocalProgressStashName,
        isDirectory: false,
    )

    var legacyObject = try #require(
        JSONSerialization.jsonObject(
            with: JSONEncoder().encode(migrationLegacyBook())
        ) as? [String: Any]
    )
    legacyObject.removeValue(forKey: "id")
    legacyObject["uuid"] = "legacy-book"
    try writeJSON([legacyObject], to: legacyMetadataURL)

    let source = BookIdentityMigration.Source(
        id: "internal-source",
        kind: .localFolder,
        cacheDirectory: fixture.applicationSupport
            .appendingPathComponent("SourceCache", isDirectory: true)
            .appendingPathComponent("internal-source", isDirectory: true),
        folderDirectory: internalFolder,
        isInternalFolder: true,
    )
    let migration = BookIdentityMigration(
        applicationSupportDirectory: fixture.applicationSupport,
        documentsDirectory: fixture.documents,
        sources: [source],
        defaults: fixture.defaults,
    )

    try migration.prepareLegacyLocalProgress()

    let filesystem = FilesystemActor()
    try await filesystem.migrateLegacyRoot(
        from: legacyRoot,
        to: internalFolder,
        defaultDestination: internalFolder,
        defaultSourceID: source.id,
        configuredSourceIDs: [source.id],
    )

    #expect(!FileManager.default.fileExists(atPath: legacyMetadataURL.path))
    #expect(
        !FileManager.default.fileExists(
            atPath: internalFolder.appendingPathComponent("library_metadata.json").path
        )
    )

    let legacy = try JSONDecoder().decode(
        [BookMetadata].self,
        from: Data(contentsOf: stash),
    )
    let scanned = FolderSourceLibraryState(
        sourceID: source.id,
        works: [
            FolderSourceWork(
                uuid: "scanned-book",
                title: "Legacy Book",
                mediaIDs: [.ebook: "media-id"],
                groupingKey: "Legacy Book/legacy book",
            )
        ],
        media: [
            FolderSourceMedia(
                uuid: "media-id",
                role: .ebook,
                relativePaths: ["Legacy Book.epub"],
                signature: FolderSourceMediaSignature(
                    fileCount: 1,
                    totalSize: 1,
                    modifiedAt: [:],
                ),
            )
        ],
    )
    let merged = LegacyLocalProgressMerge.merge(into: scanned, legacy: legacy)
    try await filesystem.saveFolderSourceLibraryState(merged, in: internalFolder)
    try FileManager.default.removeItem(at: stash)
    try migration.run()

    let saved = try #require(
        try await filesystem.loadFolderSourceLibraryState(in: internalFolder)
    )
    #expect(saved.works.first?.uuid == "legacy-book")
    #expect(saved.works.first?.position?.timestamp == 4242)
    #expect(FileManager.default.fileExists(atPath: fixture.sentinel.path))
}

@Test func bookIdentityPreflightEvacuatesLegacyInternalArrayOnRetry() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let metadataURL = fixture.internalFolderSource.appendingPathComponent(
        "library_metadata.json",
        isDirectory: false,
    )

    var liveObject = try #require(
        JSONSerialization.jsonObject(
            with: JSONEncoder().encode(migrationLegacyBook())
        ) as? [String: Any]
    )
    liveObject.removeValue(forKey: "id")
    liveObject["uuid"] = "live-legacy-book"
    try writeJSON([liveObject], to: metadataURL)

    try FileManager.default.createDirectory(
        at: fixture.config,
        withIntermediateDirectories: true,
    )
    try JSONEncoder().encode([migrationLegacyBook()]).write(
        to: fixture.legacyLocalProgressStash,
        options: .atomic,
    )

    try fixture.internalFolderMigration.prepareLegacyLocalProgress()

    #expect(!FileManager.default.fileExists(atPath: metadataURL.path))
    let stashed = try JSONDecoder().decode(
        [BookMetadata].self,
        from: Data(contentsOf: fixture.legacyLocalProgressStash),
    )
    #expect(stashed.map(\.id) == [BookID(sourceID: "internal-source", uuid: "live-legacy-book")])
}

@Test func bookIdentityPreflightEvacuatesEmptyLegacyInternalArray() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let metadataURL = fixture.internalFolderSource.appendingPathComponent(
        "library_metadata.json",
        isDirectory: false,
    )
    try writeJSON([], to: metadataURL)

    try fixture.internalFolderMigration.prepareLegacyLocalProgress()

    #expect(!FileManager.default.fileExists(atPath: metadataURL.path))
    let stashed = try JSONDecoder().decode(
        [BookMetadata].self,
        from: Data(contentsOf: fixture.legacyLocalProgressStash),
    )
    #expect(stashed.isEmpty)
}

@Test func bookIdentityPreflightLeavesCurrentInternalStateByteForByteUntouched() throws {
    let fixture = try MigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let metadataURL = fixture.internalFolderSource.appendingPathComponent(
        "library_metadata.json",
        isDirectory: false,
    )
    try FileManager.default.createDirectory(
        at: fixture.internalFolderSource,
        withIntermediateDirectories: true,
    )
    let state = FolderSourceLibraryState(sourceID: "internal-source")
    let original = try JSONEncoder().encode(state)
    try original.write(to: metadataURL, options: .atomic)

    try fixture.internalFolderMigration.prepareLegacyLocalProgress()

    #expect(try Data(contentsOf: metadataURL) == original)
    #expect(!FileManager.default.fileExists(atPath: fixture.legacyLocalProgressStash.path))
}

@Test func terminalBookIdentityMigrationDiscardsUnusableLegacyLocalProgress() throws {
    for data in [
        Data("not-json".utf8),
        try JSONSerialization.data(withJSONObject: [["title": "Missing UUID"]]),
    ] {
        let fixture = try MigrationFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let stash = fixture.config.appendingPathComponent(
            BookIdentityMigration.legacyLocalProgressStashName,
            isDirectory: false,
        )
        try FileManager.default.createDirectory(
            at: fixture.config,
            withIntermediateDirectories: true,
        )
        try data.write(to: stash)

        let migration = BookIdentityMigration(
            applicationSupportDirectory: fixture.applicationSupport,
            documentsDirectory: fixture.documents,
            sources: [
                BookIdentityMigration.Source(
                    id: "internal-source",
                    kind: .localFolder,
                    cacheDirectory: fixture.applicationSupport
                        .appendingPathComponent("SourceCache", isDirectory: true)
                        .appendingPathComponent("internal-source", isDirectory: true),
                    folderDirectory: fixture.folderSource,
                    isInternalFolder: true,
                )
            ],
            defaults: fixture.defaults,
        )

        try migration.prepareLegacyLocalProgress()
        #expect(!FileManager.default.fileExists(atPath: stash.path))
        try migration.run()
        #expect(FileManager.default.fileExists(atPath: fixture.sentinel.path))
    }
}

private func historyObject(result: String) throws -> [String: Any] {
    let entry = SyncHistoryEntry(
        timestamp: 1_710_000_000_000,
        sourceIdentifier: "test",
        locationDescription: "Chapter",
        reason: .periodicDuringActivePlayback,
        result: .queued,
        locatorSummary: "chapter.xhtml",
    )
    var object = try #require(
        JSONSerialization.jsonObject(with: JSONEncoder().encode(entry)) as? [String: Any]
    )
    object["result"] = result
    return object
}

private func migrationLegacyBook() -> BookMetadata {
    BookMetadata(
        bookID: BookID(sourceID: "legacy", uuid: "legacy-book"),
        title: "Legacy Book",
        subtitle: nil,
        description: nil,
        language: nil,
        createdAt: nil,
        updatedAt: nil,
        publicationDate: nil,
        authors: nil,
        narrators: nil,
        creators: nil,
        series: nil,
        tags: nil,
        collections: nil,
        ebook: BookAsset(
            uuid: "legacy-asset",
            filepath: "Legacy Book.epub",
            missing: 0,
            createdAt: nil,
            updatedAt: nil,
        ),
        audiobook: nil,
        readaloud: nil,
        status: nil,
        position: BookReadingPosition(
            uuid: "legacy-position",
            locator: nil,
            timestamp: 4242,
            createdAt: nil,
            updatedAt: nil,
        ),
        rating: nil,
    )
}

private func writeJSON(_ object: Any, to url: URL) throws {
    try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true,
    )
    try JSONSerialization.data(
        withJSONObject: object,
        options: [.prettyPrinted, .sortedKeys],
    ).write(to: url, options: .atomic)
}
