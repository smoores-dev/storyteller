import Dispatch
import Foundation
import ZIPFoundation

func encodedIdentityPathComponent(_ input: String) -> String {
    let encoded = Data(input.utf8).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
    return "b64_\(encoded)"
}

struct PersistedSyncHistory: Codable, Sendable {
    struct Book: Codable, Sendable {
        let bookID: BookID
        let entries: [SyncHistoryEntry]
    }

    let books: [Book]
}

func decodePersistedSyncHistory(_ data: Data) throws -> [BookID: [SyncHistoryEntry]] {
    let store = try JSONDecoder().decode(PersistedSyncHistory.self, from: data)
    return store.books.reduce(into: [:]) { history, book in
        history[book.bookID] = book.entries
    }
}

struct PersistedReadingTimeline: Codable, Sendable {
    struct Book: Codable, Sendable {
        let bookID: BookID
        let visits: [ReadingVisit]
    }

    let books: [Book]
}

/// Handles filesystem storage for local media, including directory management and metadata persistence.
public actor FilesystemActor {
    public static let shared = FilesystemActor()
    private let ioQueue = DispatchQueue(label: "FilesystemActor.ioQueue", qos: .utility)
    private var pendingQueueWriteTask: Task<Void, Error>?
    private var pendingQueueWriteId: Int = 0
    private var pendingHistoryWriteTask: Task<Void, Error>?
    private var pendingHistoryWriteId: Int = 0
    private var pendingTimelineWriteTask: Task<Void, Error>?
    private var pendingTimelineWriteId: Int = 0

    public init() {}

    public func ensureLocalStorageDirectories() throws {
        try ensureDirectoryExists(at: sourceCacheRootDirectory())
        try ensureDirectoryExists(at: derivedMediaRootDirectory())
    }

    public func sourceCacheRootDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("SourceCache", isDirectory: true)
    }

    public func derivedMediaRootDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("DerivedMedia", isDirectory: true)
    }

    public func epubExtractionRootDirectory() -> URL {
        derivedMediaRootDirectory()
            .appendingPathComponent("EPUBExtraction", isDirectory: true)
    }

    public func folderSourceDerivedAudiobookRootDirectory(sourceID: BookSourceID) -> URL {
        derivedMediaRootDirectory()
            .appendingPathComponent("FolderSourceAudiobooks", isDirectory: true)
            .appendingPathComponent(sanitizedPathComponent(from: sourceID), isDirectory: true)
    }

    public func folderSourceDerivedAudiobookDirectory(
        sourceID: BookSourceID,
        bookID: String,
    ) -> URL {
        folderSourceDerivedAudiobookRootDirectory(sourceID: sourceID)
            .appendingPathComponent(sanitizedPathComponent(from: bookID), isDirectory: true)
    }

    public func removeFolderSourceDerivedAudiobooks(sourceID: BookSourceID) throws {
        let directory = folderSourceDerivedAudiobookRootDirectory(sourceID: sourceID)
        guard FileManager.default.fileExists(atPath: directory.path) else { return }
        try FileManager.default.removeItem(at: directory)
    }

    public func sourceCacheDirectory(sourceID: BookSourceID) -> URL {
        return sourceCacheRootDirectory()
            .appendingPathComponent(sanitizedPathComponent(from: sourceID), isDirectory: true)
    }

    func sourceCacheSourceIDs() throws -> Set<BookSourceID> {
        let root = sourceCacheRootDirectory()
        try ensureDirectoryExists(at: root)
        let directories = try FileManager.default.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles],
        )

        var sourceIDs: Set<BookSourceID> = []
        for directory in directories {
            guard
                (try? directory.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
            else { continue }
            let sourceID = directory.lastPathComponent
            if !sourceID.isEmpty {
                sourceIDs.insert(sourceID)
            }
        }
        return sourceIDs
    }

    public func internalFolderSourceRootDirectory() -> URL {
        #if os(iOS)
        /// A visible subfolder rather than Documents itself: Files only lists the app
        /// under On My iPhone when Documents contains a non-hidden item, and the
        /// source marker is a dotfile.
        if let documents = documentsBaseDirectory() {
            return documents.appendingPathComponent("Books", isDirectory: true)
        }
        #endif
        return appSupportInternalFolderSourceDirectory()
    }

    func appSupportInternalFolderSourceDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("InternalFolderSource", isDirectory: true)
    }

    nonisolated func documentsBaseDirectory() -> URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    }

    public func internalFolderSourceDirectory() -> URL {
        internalFolderSourceRootDirectory()
    }

    public nonisolated func whisperModelsDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("WhisperModels", isDirectory: true)
    }

    public nonisolated func storyAlignCacheDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("StoryAlignCache", isDirectory: true)
    }

    public func ensureInternalFolderSourceDirectory(sourceID: BookSourceID) throws -> URL {
        let directory = internalFolderSourceDirectory()
        try ensureSourceIDMarker(in: directory, sourceID: sourceID)
        return directory
    }

    public func sourceIDMarker(in directory: URL) throws -> BookSourceID? {
        let filenames = [
            BookSourceRecord.sourceIDFilename,
            BookSourceRecord.legacySourceIDFilename,
        ]
        for filename in filenames {
            let marker = directory.appendingPathComponent(filename, isDirectory: false)
            guard FileManager.default.fileExists(atPath: marker.path) else {
                continue
            }
            let sourceID = try String(contentsOf: marker, encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !sourceID.isEmpty {
                return sourceID
            }
        }
        return nil
    }

    public func ensureSourceIDMarker(in directory: URL, sourceID: BookSourceID) throws {
        try ensureDirectoryExists(at: directory)
        if let existing = try? sourceIDMarker(in: directory), existing == sourceID {
            return
        }
        let marker = directory.appendingPathComponent(
            BookSourceRecord.sourceIDFilename,
            isDirectory: false,
        )
        try sourceID.write(to: marker, atomically: true, encoding: .utf8)
    }

    public func getMediaDirectory(
        category: LocalMediaCategory,
        bookName: String,
        uuidIdentifier: String? = nil,
        sourceID: BookSourceID,
    ) async -> URL {
        let cacheDirectory = sourceCacheDirectory(sourceID: sourceID)
        let folderName = await resolveBookFolderName(
            in: cacheDirectory,
            bookName: bookName,
            uuidIdentifier: uuidIdentifier,
        )
        return
            cacheDirectory
            .appendingPathComponent(folderName, isDirectory: true)
            .appendingPathComponent(category.rawValue, isDirectory: true)
    }

    public func resolveBookFolderName(
        in sourceDirectory: URL,
        bookName: String,
        uuidIdentifier: String?,
    ) async -> String {
        let sanitizedBase = sanitizedPathComponent(from: bookName)
        let uuidSanitized: String? = {
            guard let uuidIdentifier else { return nil }
            let sanitized = sanitizedPathComponent(from: uuidIdentifier)
            return sanitized.isEmpty ? nil : sanitized
        }()

        if let uuidSanitized {
            if let existing = try? await existingFolder(
                matching: uuidSanitized,
                in: sourceDirectory,
            ) {
                return existing
            }

            if sanitizedBase.isEmpty {
                return uuidSanitized
            }

            if sanitizedBase.caseInsensitiveCompare(uuidSanitized) == .orderedSame {
                return sanitizedBase
            }

            return "\(sanitizedBase) - \(uuidSanitized)"
        }

        let baseForLocal = sanitizedBase.isEmpty ? "Book" : sanitizedBase
        return baseForLocal
    }

    public func mediaDirectory(
        for uuid: String,
        category: LocalMediaCategory,
        sourceID: BookSourceID,
    ) async -> URL? {
        let sourceDirectory = sourceCacheDirectory(sourceID: sourceID)
        let sanitizedUuid = sanitizedPathComponent(from: uuid)
        guard
            let folderName = try? await existingFolder(
                matching: sanitizedUuid,
                in: sourceDirectory,
            )
        else {
            return nil
        }

        let categoryDir =
            sourceDirectory
            .appendingPathComponent(folderName, isDirectory: true)
            .appendingPathComponent(category.rawValue, isDirectory: true)

        let fm = FileManager.default
        guard fm.fileExists(atPath: categoryDir.path) else { return nil }
        return categoryDir
    }

    public func deleteMedia(
        for uuid: String,
        category: LocalMediaCategory,
        sourceID: BookSourceID,
    ) async throws {
        let sourceDirectory = sourceCacheDirectory(sourceID: sourceID)
        let sanitizedUuid = sanitizedPathComponent(from: uuid)
        guard
            let folderName = try? await existingFolder(
                matching: sanitizedUuid,
                in: sourceDirectory,
            )
        else {
            return
        }

        let categoryDir =
            sourceDirectory
            .appendingPathComponent(folderName, isDirectory: true)
            .appendingPathComponent(category.rawValue, isDirectory: true)

        let fm = FileManager.default
        if fm.fileExists(atPath: categoryDir.path) {
            try fm.removeItem(at: categoryDir)
        }
    }

    public func ensureDirectoryExists(at url: URL) throws {
        let fm = FileManager.default
        if !fm.fileExists(atPath: url.path) {
            try fm.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }

    public func saveSourceCacheLibraryMetadata(
        _ metadata: [BookMetadata],
        sourceID: BookSourceID,
    ) throws {
        let cacheDir = sourceCacheDirectory(sourceID: sourceID)
        try ensureDirectoryExists(at: cacheDir)

        let metadataURL = cacheDir.appendingPathComponent(
            "library_metadata.json",
            isDirectory: false,
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(metadata)
        try write(data: data, to: metadataURL)
    }

    public func loadSourceCacheLibraryMetadata(sourceID: BookSourceID) throws -> [BookMetadata]? {
        try loadLibraryMetadata(in: sourceCacheDirectory(sourceID: sourceID))
    }

    public func saveDownloadedMediaLedger(
        _ ledger: [String: DownloadedMediaRecord],
        sourceID: BookSourceID,
    ) throws {
        let cacheDir = sourceCacheDirectory(sourceID: sourceID)
        try ensureDirectoryExists(at: cacheDir)
        let ledgerURL = cacheDir.appendingPathComponent(
            "downloaded_media.json",
            isDirectory: false,
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(ledger)
        try write(data: data, to: ledgerURL)
    }

    public func loadDownloadedMediaLedger(
        sourceID: BookSourceID
    ) throws -> [String: DownloadedMediaRecord]? {
        let ledgerURL = sourceCacheDirectory(sourceID: sourceID)
            .appendingPathComponent("downloaded_media.json", isDirectory: false)
        let fm = FileManager.default
        guard fm.fileExists(atPath: ledgerURL.path) else { return nil }
        let data = try Data(contentsOf: ledgerURL)
        return try JSONDecoder().decode([String: DownloadedMediaRecord].self, from: data)
    }

    private func loadLibraryMetadata(in directory: URL) throws -> [BookMetadata]? {
        let metadataURL = directory.appendingPathComponent(
            "library_metadata.json",
            isDirectory: false,
        )

        let fm = FileManager.default
        guard fm.fileExists(atPath: metadataURL.path) else {
            return nil
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let data = try Data(contentsOf: metadataURL)
        return try decoder.decode([BookMetadata].self, from: data)
    }

    public func saveFolderSourceLibraryState(_ state: FolderSourceLibraryState, in directory: URL)
        throws
    {
        try ensureDirectoryExists(at: directory)
        let metadataURL = directory.appendingPathComponent(
            "library_metadata.json",
            isDirectory: false,
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(state)
        try write(data: data, to: metadataURL)
    }

    public func loadFolderSourceLibraryState(in directory: URL) throws -> FolderSourceLibraryState?
    {
        let metadataURL = directory.appendingPathComponent(
            "library_metadata.json",
            isDirectory: false,
        )

        let fm = FileManager.default
        guard fm.fileExists(atPath: metadataURL.path) else {
            return nil
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let data = try Data(contentsOf: metadataURL)
        return try decoder.decode(FolderSourceLibraryState.self, from: data)
    }

    public func getConfigDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("Config", isDirectory: true)
    }

    public func saveBookSources(_ sources: [BookSourceRecord]) throws {
        let configDir = getConfigDirectory()
        try ensureDirectoryExists(at: configDir)

        let sourcesURL = configDir.appendingPathComponent(
            "book_sources.json",
            isDirectory: false,
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(sources)
        try write(data: data, to: sourcesURL)
    }

    public func loadBookSources() async throws -> [BookSourceRecord]? {
        let sourcesURL = getConfigDirectory().appendingPathComponent(
            "book_sources.json",
            isDirectory: false,
        )

        let fm = FileManager.default
        guard fm.fileExists(atPath: sourcesURL.path) else {
            return nil
        }

        let decoder = JSONDecoder()
        let data = try Data(contentsOf: sourcesURL)
        let sources = try decoder.decode([BookSourceRecord].self, from: data)
        return sources
    }

    public func loadOrCreateBookSources() async throws -> [BookSourceRecord] {
        if let sources = try await loadBookSources(), !sources.isEmpty {
            return sources
        }

        return try createDefaultBookSources()
    }

    public func loadProgressQueue() async throws -> [PendingProgressSync] {
        await waitForPendingQueueWrite()
        let configDir = getConfigDirectory()
        let queueURL = configDir.appendingPathComponent(
            "offline_progress_queue_v2.json",
            isDirectory: false,
        )

        let fm = FileManager.default
        guard fm.fileExists(atPath: queueURL.path) else {
            return []
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let data = try Data(contentsOf: queueURL)
        do {
            return try decoder.decode([PendingProgressSync].self, from: data)
        } catch is DecodingError {
            try fm.removeItem(at: queueURL)
            return []
        }
    }

    public func saveProgressQueue(_ queue: [PendingProgressSync]) async throws {
        let configDir = getConfigDirectory()
        try ensureDirectoryExists(at: configDir)

        let queueURL = configDir.appendingPathComponent(
            "offline_progress_queue_v2.json",
            isDirectory: false,
        )
        let queueSnapshot = queue
        let writeId = pendingQueueWriteId + 1
        pendingQueueWriteId = writeId
        let task = Task {
            try await withCheckedThrowingContinuation { continuation in
                ioQueue.async {
                    do {
                        let encoder = JSONEncoder()
                        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                        encoder.dateEncodingStrategy = .iso8601
                        let data = try encoder.encode(queueSnapshot)
                        try data.write(to: queueURL, options: .atomic)
                        continuation.resume()
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
            }
        }
        pendingQueueWriteTask = task

        defer {
            if pendingQueueWriteId == writeId {
                pendingQueueWriteTask = nil
            }
        }

        try await task.value
    }

    public func progressUploadSpoolDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("ProgressUploadSpool", isDirectory: true)
    }

    public func writeProgressUploadSpoolFile(
        bookID: BookID,
        token: String,
        data: Data,
    ) throws -> URL {
        let directory = progressUploadSpoolDirectory()
            .appendingPathComponent("V2", isDirectory: true)
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.sourceID),
                isDirectory: true,
            )
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.uuid),
                isDirectory: true,
            )
        try ensureDirectoryExists(at: directory)
        let fileURL = directory.appendingPathComponent(
            "\(encodedIdentityPathComponent(token)).json",
            isDirectory: false,
        )
        try data.write(to: fileURL, options: .atomic)
        return fileURL
    }

    public func removeProgressUploadSpoolFile(bookID: BookID, token: String) {
        let fileURL = progressUploadSpoolDirectory()
            .appendingPathComponent("V2", isDirectory: true)
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.sourceID),
                isDirectory: true,
            )
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.uuid),
                isDirectory: true,
            )
            .appendingPathComponent(
                "\(encodedIdentityPathComponent(token)).json",
                isDirectory: false,
            )
        try? FileManager.default.removeItem(at: fileURL)
    }

    public func loadSyncHistory() async throws -> [BookID: [SyncHistoryEntry]] {
        await waitForPendingHistoryWrite()
        let historyURL = syncHistoryURL()

        let fm = FileManager.default
        guard fm.fileExists(atPath: historyURL.path) else {
            return [:]
        }

        let data = try Data(contentsOf: historyURL)
        return try decodePersistedSyncHistory(data)
    }

    func syncHistoryURL() -> URL {
        getConfigDirectory().appendingPathComponent(
            "sync_history_v2.json",
            isDirectory: false,
        )
    }

    public func saveSyncHistory(_ history: [BookID: [SyncHistoryEntry]]) async throws {
        let configDir = getConfigDirectory()
        try ensureDirectoryExists(at: configDir)

        let historyURL = configDir.appendingPathComponent(
            "sync_history_v2.json",
            isDirectory: false,
        )
        let historySnapshot = history
        let writeId = pendingHistoryWriteId + 1
        pendingHistoryWriteId = writeId
        let task = Task {
            try await withCheckedThrowingContinuation { continuation in
                ioQueue.async {
                    do {
                        let encoder = JSONEncoder()
                        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                        let store = PersistedSyncHistory(
                            books:
                                historySnapshot
                                .map {
                                    PersistedSyncHistory.Book(bookID: $0.key, entries: $0.value)
                                }
                                .sorted { $0.bookID < $1.bookID }
                        )
                        let data = try encoder.encode(store)
                        try data.write(to: historyURL, options: .atomic)
                        continuation.resume()
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
            }
        }
        pendingHistoryWriteTask = task

        defer {
            if pendingHistoryWriteId == writeId {
                pendingHistoryWriteTask = nil
            }
        }

        try await task.value
    }

    private func waitForPendingQueueWrite() async {
        while let task = pendingQueueWriteTask {
            let currentId = pendingQueueWriteId
            _ = try? await task.value
            if pendingQueueWriteId == currentId {
                break
            }
        }
    }

    private func waitForPendingHistoryWrite() async {
        while let task = pendingHistoryWriteTask {
            let currentId = pendingHistoryWriteId
            _ = try? await task.value
            if pendingHistoryWriteId == currentId {
                break
            }
        }
    }

    public func loadReadingTimeline() async throws -> [BookID: [ReadingVisit]] {
        await waitForPendingTimelineWrite()
        let timelineURL = readingTimelineURL()

        let fm = FileManager.default
        guard fm.fileExists(atPath: timelineURL.path) else {
            return [:]
        }

        let data = try Data(contentsOf: timelineURL)
        let store = try JSONDecoder().decode(PersistedReadingTimeline.self, from: data)
        return store.books.reduce(into: [:]) { timeline, book in
            timeline[book.bookID] = book.visits
        }
    }

    func readingTimelineURL() -> URL {
        getConfigDirectory().appendingPathComponent(
            "reading_timeline_v1.json",
            isDirectory: false,
        )
    }

    public func saveReadingTimeline(_ timeline: [BookID: [ReadingVisit]]) async throws {
        let configDir = getConfigDirectory()
        try ensureDirectoryExists(at: configDir)

        let timelineURL = readingTimelineURL()
        let snapshot = timeline
        let writeId = pendingTimelineWriteId + 1
        pendingTimelineWriteId = writeId
        let task = Task {
            try await withCheckedThrowingContinuation { continuation in
                ioQueue.async {
                    do {
                        let encoder = JSONEncoder()
                        encoder.outputFormatting = [.sortedKeys]
                        let store = PersistedReadingTimeline(
                            books:
                                snapshot
                                .map {
                                    PersistedReadingTimeline.Book(
                                        bookID: $0.key,
                                        visits: $0.value,
                                    )
                                }
                                .sorted { $0.bookID < $1.bookID }
                        )
                        let data = try encoder.encode(store)
                        try data.write(to: timelineURL, options: .atomic)
                        continuation.resume()
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
            }
        }
        pendingTimelineWriteTask = task

        defer {
            if pendingTimelineWriteId == writeId {
                pendingTimelineWriteTask = nil
            }
        }

        try await task.value
    }

    private func waitForPendingTimelineWrite() async {
        while let task = pendingTimelineWriteTask {
            let currentId = pendingTimelineWriteId
            _ = try? await task.value
            if pendingTimelineWriteId == currentId {
                break
            }
        }
    }

    public func saveCoverImage(bookID: BookID, data: Data, variant: String) throws {
        let coverURL = coverFileURL(bookID: bookID, variant: variant)
        try ensureDirectoryExists(at: coverURL.deletingLastPathComponent())
        try write(data: data, to: coverURL)
    }

    public func loadCoverImage(bookID: BookID, variant: String) -> Data? {
        let coverURL = coverFileURL(bookID: bookID, variant: variant)
        let fm = FileManager.default

        guard fm.fileExists(atPath: coverURL.path) else {
            return nil
        }

        return try? Data(contentsOf: coverURL)
    }

    public func removeCoverImage(bookID: BookID, variant: String) throws {
        let coverURL = coverFileURL(bookID: bookID, variant: variant)
        guard FileManager.default.fileExists(atPath: coverURL.path) else { return }
        try FileManager.default.removeItem(at: coverURL)
    }

    public func removeAllCoverImages() throws {
        let coversDir = coversCacheDirectory()
        let fm = FileManager.default

        if fm.fileExists(atPath: coversDir.path) {
            try fm.removeItem(at: coversDir)
        }
    }

    public func removeCoverImages(bookID: BookID) throws {
        let bookDirectory = coversCacheDirectory()
            .appendingPathComponent("V2", isDirectory: true)
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.sourceID),
                isDirectory: true,
            )
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.uuid),
                isDirectory: true,
            )
        let fm = FileManager.default
        guard fm.fileExists(atPath: bookDirectory.path) else { return }
        try fm.removeItem(at: bookDirectory)
    }

    private func coversCacheDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("CoversCache", isDirectory: true)
    }

    private func coverFileURL(bookID: BookID, variant: String) -> URL {
        coversCacheDirectory()
            .appendingPathComponent("V2", isDirectory: true)
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.sourceID),
                isDirectory: true,
            )
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.uuid),
                isDirectory: true,
            )
            .appendingPathComponent(
                "\(encodedIdentityPathComponent(variant)).dat",
                isDirectory: false,
            )
    }

    public func removeSourceCacheBookData(
        uuid: String,
        sourceID: BookSourceID,
    ) async throws {
        let cacheDir = sourceCacheDirectory(sourceID: sourceID)
        let sanitizedUuid = sanitizedPathComponent(from: uuid)
        guard
            let folderName = try? await existingFolder(
                matching: sanitizedUuid,
                in: cacheDir,
            )
        else {
            try removeCoverImages(bookID: BookID(sourceID: sourceID, uuid: uuid))
            return
        }

        let bookRoot = cacheDir.appendingPathComponent(folderName, isDirectory: true)
        let fm = FileManager.default
        if fm.fileExists(atPath: bookRoot.path) {
            try fm.removeItem(at: bookRoot)
        }
        try removeCoverImages(bookID: BookID(sourceID: sourceID, uuid: uuid))
    }

    public func getHighlightsDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("Highlights", isDirectory: true)
    }

    public func loadHighlights(bookID: BookID) throws -> [Highlight]? {
        let fileURL = highlightsFileURL(bookID: bookID)
        let fm = FileManager.default
        guard fm.fileExists(atPath: fileURL.path) else {
            return nil
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([Highlight].self, from: Data(contentsOf: fileURL))
    }

    public func saveHighlights(bookID: BookID, highlights: [Highlight]) throws {
        let fileURL = highlightsFileURL(bookID: bookID)
        try ensureDirectoryExists(at: fileURL.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        try write(data: try encoder.encode(highlights), to: fileURL)
    }

    public func deleteHighlights(bookID: BookID) throws {
        let fileURL = highlightsFileURL(bookID: bookID)
        let fm = FileManager.default
        if fm.fileExists(atPath: fileURL.path) {
            try fm.removeItem(at: fileURL)
        }
    }

    func highlightsV2Directory() -> URL {
        getHighlightsDirectory().appendingPathComponent("V2", isDirectory: true)
    }

    func highlightsFileURL(bookID: BookID) -> URL {
        highlightsV2Directory()
            .appendingPathComponent(
                encodedIdentityPathComponent(bookID.sourceID),
                isDirectory: true,
            )
            .appendingPathComponent(
                "\(encodedIdentityPathComponent(bookID.uuid)).json",
                isDirectory: false,
            )
    }

    private func existingFolder(
        matching uuidSanitized: String,
        in domainDirectory: URL,
    ) async throws -> String? {
        let fm = FileManager.default
        let contents = try fm.contentsOfDirectory(
            at: domainDirectory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles],
        )

        let lowercasedUUID = uuidSanitized.lowercased()
        let exactSuffix = " - \(lowercasedUUID)"

        for url in contents {
            guard
                let values = try? url.resourceValues(forKeys: [.isDirectoryKey]),
                values.isDirectory == true
            else {
                continue
            }

            let folderName = url.lastPathComponent
            if folderName.caseInsensitiveCompare(uuidSanitized) == .orderedSame {
                return folderName
            }

            let lowerFolder = folderName.lowercased()
            if lowerFolder.hasSuffix(exactSuffix) {
                return folderName
            }

            if let range = lowerFolder.range(of: exactSuffix + " ") {
                let suffixRemainder = lowerFolder[range.upperBound...]
                let allowed = CharacterSet.decimalDigits.union(.whitespaces)
                if suffixRemainder.unicodeScalars.allSatisfy({ allowed.contains($0) }) {
                    return folderName
                }
            }
        }

        return nil
    }

    private func sanitizedPathComponent(from input: String) -> String {
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
            } else {
                if !lastWasSeparator && !result.isEmpty {
                    result.append(" ")
                    lastWasSeparator = true
                }
            }
        }

        let sanitized = result.trimmingCharacters(in: .whitespacesAndNewlines)
        if sanitized.count > 120 {
            let endIndex = sanitized.index(sanitized.startIndex, offsetBy: 120)
            return String(sanitized[..<endIndex])
        }
        return sanitized
    }

    private func write(data: Data, to destination: URL) throws {
        try data.write(to: destination, options: .atomic)
    }

    public func getWebResourcesDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("WebResources", isDirectory: true)
    }

    public func copyWebResources(from sourceDirectory: URL) throws {
        let webResourcesDir = getWebResourcesDirectory()

        let fm = FileManager.default
        if fm.fileExists(atPath: webResourcesDir.path) {
            try fm.removeItem(at: webResourcesDir)
        }

        try ensureDirectoryExists(at: webResourcesDir.deletingLastPathComponent())

        let htmlURL = sourceDirectory.appendingPathComponent("foliate_wrap.html")
        let foliateJSURL = sourceDirectory.appendingPathComponent("foliate-js", isDirectory: true)
        guard fm.fileExists(atPath: htmlURL.path) else {
            throw NSError(
                domain: "FilesystemActor",
                code: 1,
                userInfo: [
                    NSLocalizedDescriptionKey: "Failed to find foliate_wrap.html in web resources"
                ],
            )
        }
        guard fm.fileExists(atPath: foliateJSURL.path) else {
            throw NSError(
                domain: "FilesystemActor",
                code: 2,
                userInfo: [
                    NSLocalizedDescriptionKey: "Failed to find foliate-js folder in web resources"
                ],
            )
        }

        try fm.copyItem(at: sourceDirectory, to: webResourcesDir)
    }

    private static let audioExtensions: Set<String> = [
        "mp3", "m4a", "m4b", "mp4", "wav", "ogg", "opus", "aac", "flac",
    ]

    public func cleanupExtractedEpubDirectories() {
        let fm = FileManager.default
        var cleanedCount = 0

        guard
            let sourceDirectories = try? fm.contentsOfDirectory(
                at: sourceCacheRootDirectory(),
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [.skipsHiddenFiles],
            )
        else { return }

        for sourceDirectory in sourceDirectories {
            guard
                let sourceValues = try? sourceDirectory.resourceValues(forKeys: [.isDirectoryKey]),
                sourceValues.isDirectory == true
            else { continue }

            guard
                let bookFolders = try? fm.contentsOfDirectory(
                    at: sourceDirectory,
                    includingPropertiesForKeys: [.isDirectoryKey],
                    options: [.skipsHiddenFiles],
                )
            else { continue }

            for bookFolder in bookFolders {
                guard let values = try? bookFolder.resourceValues(forKeys: [.isDirectoryKey]),
                    values.isDirectory == true
                else { continue }

                for category in LocalMediaCategory.allCases {
                    let extractedDir =
                        bookFolder
                        .appendingPathComponent(category.rawValue, isDirectory: true)
                        .appendingPathComponent("extracted", isDirectory: true)

                    if fm.fileExists(atPath: extractedDir.path) {
                        do {
                            try fm.removeItem(at: extractedDir)
                            cleanedCount += 1
                        } catch {
                            debugLog(
                                "[FilesystemActor] Failed to clean up extracted dir: \(extractedDir.path) - \(error)"
                            )
                        }
                    }
                }
            }
        }

        if cleanedCount > 0 {
            debugLog("[FilesystemActor] Cleaned up \(cleanedCount) extracted EPUB directories")
        }
    }

    public func prepareEpubForReading(
        epubPath: URL,
        sourceID: BookSourceID,
        bookID: String,
        category: LocalMediaCategory,
    ) async throws -> URL {
        let extractionDir = derivedEpubExtractionDirectory(
            epubPath: epubPath,
            sourceID: sourceID,
            bookID: bookID,
            category: category,
        )
        return try await extractEpubIfNeeded(
            epubPath: epubPath,
            extractedDir: extractionDir,
        )
    }

    private func extractEpubIfNeeded(
        epubPath: URL,
        extractedDir: URL,
    ) async throws -> URL {
        let fm = FileManager.default

        debugLog("[FilesystemActor] Extracting EPUB for reader access...")

        let sizesFile = extractedDir.appendingPathComponent("_sizes.json")
        if fm.fileExists(atPath: extractedDir.path) {
            if fm.fileExists(atPath: sizesFile.path) {
                debugLog(
                    "[FilesystemActor] Extracted directory already exists and complete, reusing: \(extractedDir.path)"
                )
                return URL(fileURLWithPath: extractedDir.path, isDirectory: true)
            } else {
                debugLog(
                    "[FilesystemActor] Extracted directory exists but incomplete, removing: \(extractedDir.path)"
                )
                try? fm.removeItem(at: extractedDir)
            }
        }

        try fm.createDirectory(at: extractedDir, withIntermediateDirectories: true)

        debugLog("[FilesystemActor] Extracting EPUB to: \(extractedDir.path)")

        let archive: Archive
        do {
            archive = try Archive(url: epubPath, accessMode: .read)
        } catch {
            throw NSError(
                domain: "FilesystemActor",
                code: 4,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Failed to open EPUB archive: \(epubPath.path) - \(error)"
                ],
            )
        }

        var skippedAudioFiles = 0
        var skippedErrors = 0
        var fileSizes: [String: UInt64] = [:]

        for entry in archive {
            let ext = URL(fileURLWithPath: entry.path).pathExtension.lowercased()
            if Self.audioExtensions.contains(ext) {
                skippedAudioFiles += 1
                continue
            }

            let destinationURL = extractedDir.appendingPathComponent(entry.path)
            do {
                _ = try archive.extract(entry, to: destinationURL)
                fileSizes[entry.path] = entry.uncompressedSize
            } catch {
                debugLog(
                    "[FilesystemActor] Skipping file due to extraction error: \(entry.path) - \(error.localizedDescription)"
                )
                skippedErrors += 1
            }
        }

        let sizesURL = extractedDir.appendingPathComponent("_sizes.json")
        let sizesData = try JSONSerialization.data(withJSONObject: fileSizes)
        try sizesData.write(to: sizesURL)

        debugLog(
            "[FilesystemActor] EPUB extracted (skipped \(skippedAudioFiles) audio, \(skippedErrors) errors, wrote \(fileSizes.count) files)"
        )

        return URL(fileURLWithPath: extractedDir.path, isDirectory: true)
    }

    private func derivedEpubExtractionDirectory(
        epubPath: URL,
        sourceID: BookSourceID,
        bookID: String,
        category: LocalMediaCategory,
    ) -> URL {
        let fingerprint = fileFingerprint(for: epubPath)
        return epubExtractionRootDirectory()
            .appendingPathComponent(sanitizedPathComponent(from: sourceID), isDirectory: true)
            .appendingPathComponent(sanitizedPathComponent(from: bookID), isDirectory: true)
            .appendingPathComponent(category.rawValue, isDirectory: true)
            .appendingPathComponent(fingerprint, isDirectory: true)
            .appendingPathComponent("extracted", isDirectory: true)
    }

    private func fileFingerprint(for url: URL) -> String {
        let attributes = (try? FileManager.default.attributesOfItem(atPath: url.path)) ?? [:]
        let size = attributes[.size] as? UInt64 ?? 0
        let modifiedAt = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        let modifiedMilliseconds = Int64((modifiedAt * 1000).rounded())
        return "\(size)-\(modifiedMilliseconds)"
    }

    public func extractAudioData(from epubPath: URL, audioPath: String) async throws -> Data {
        let archive: Archive
        do {
            archive = try Archive(url: epubPath, accessMode: .read)
        } catch {
            throw NSError(
                domain: "FilesystemActor",
                code: 5,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Failed to open EPUB archive for audio: \(epubPath.path) - \(error)"
                ],
            )
        }

        let pathsToTry = [audioPath] + ["OPS", "OEBPS", "epub"].map { "\($0)/\(audioPath)" }

        for path in pathsToTry {
            if let entry = archive[path] {
                var data = Data()
                _ = try archive.extract(entry, skipCRC32: true) { chunk in
                    data.append(chunk)
                }
                debugLog(
                    "[FilesystemActor] Extracted audio from EPUB: \(path) (\(data.count) bytes)"
                )
                return data
            }
        }

        throw NSError(
            domain: "FilesystemActor",
            code: 6,
            userInfo: [NSLocalizedDescriptionKey: "Audio file not found in EPUB: \(audioPath)"],
        )
    }

    public func extractAudioToFile(from epubPath: URL, audioPath: String, destination: URL)
        async throws
    {
        let archive: Archive
        do {
            archive = try Archive(url: epubPath, accessMode: .read)
        } catch {
            throw NSError(
                domain: "FilesystemActor",
                code: 5,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Failed to open EPUB archive for audio: \(epubPath.path) - \(error)"
                ],
            )
        }

        let pathsToTry = [audioPath] + ["OPS", "OEBPS", "epub"].map { "\($0)/\(audioPath)" }

        for path in pathsToTry {
            if let entry = archive[path] {
                FileManager.default.createFile(atPath: destination.path, contents: nil)
                let handle = try FileHandle(forWritingTo: destination)
                defer { try? handle.close() }

                _ = try archive.extract(entry, skipCRC32: true) { chunk in
                    handle.write(chunk)
                }
                debugLog(
                    "[FilesystemActor] Extracted audio to file: \(destination.path)"
                )
                return
            }
        }

        throw NSError(
            domain: "FilesystemActor",
            code: 6,
            userInfo: [NSLocalizedDescriptionKey: "Audio file not found in EPUB: \(audioPath)"],
        )
    }

    public func saveSmartShelves(_ shelves: [SmartShelf]) throws {
        let configDir = getConfigDirectory()
        try ensureDirectoryExists(at: configDir)

        let url = configDir.appendingPathComponent("smart_shelves.json", isDirectory: false)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(shelves)
        try data.write(to: url, options: .atomic)
    }

    public func loadSmartShelves() throws -> [SmartShelf] {
        let configDir = getConfigDirectory()
        let newUrl = configDir.appendingPathComponent("smart_shelves.json", isDirectory: false)
        let legacyUrl = configDir.appendingPathComponent(
            "dynamic_shelves.json",
            isDirectory: false,
        )

        let url: URL
        if FileManager.default.fileExists(atPath: newUrl.path) {
            url = newUrl
        } else if FileManager.default.fileExists(atPath: legacyUrl.path) {
            url = legacyUrl
        } else {
            return []
        }

        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([SmartShelf].self, from: data)
    }

    private func getResumeDataDirectory() -> URL {
        applicationSupportBaseDirectory()
            .appendingPathComponent("ResumeDataV2", isDirectory: true)
    }

    public func saveDownloadState(_ records: [DownloadRecord]) throws {
        let configDir = getConfigDirectory()
        try ensureDirectoryExists(at: configDir)

        let url = configDir.appendingPathComponent("downloads_v2.json", isDirectory: false)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(records)
        try data.write(to: url, options: .atomic)
    }

    public func loadDownloadState() throws -> [DownloadRecord] {
        let configDir = getConfigDirectory()
        let url = configDir.appendingPathComponent("downloads_v2.json", isDirectory: false)

        guard FileManager.default.fileExists(atPath: url.path) else { return [] }

        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([DownloadRecord].self, from: data)
    }

    public func saveResumeData(_ resumeData: Data, for downloadId: String) throws {
        let dir = getResumeDataDirectory()
        try ensureDirectoryExists(at: dir)

        let url = dir.appendingPathComponent("\(downloadId).resumedata", isDirectory: false)
        try resumeData.write(to: url, options: .atomic)
    }

    public func loadResumeData(for downloadId: String) throws -> Data? {
        let dir = getResumeDataDirectory()
        let url = dir.appendingPathComponent("\(downloadId).resumedata", isDirectory: false)

        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }

    public func hasResumeData(for downloadId: String) -> Bool {
        let dir = getResumeDataDirectory()
        let url = dir.appendingPathComponent("\(downloadId).resumedata", isDirectory: false)
        return FileManager.default.fileExists(atPath: url.path)
    }

    public func deleteResumeData(for downloadId: String) throws {
        let dir = getResumeDataDirectory()
        let url = dir.appendingPathComponent("\(downloadId).resumedata", isDirectory: false)
        let fm = FileManager.default
        if fm.fileExists(atPath: url.path) {
            try fm.removeItem(at: url)
        }
    }

    /// Rebases a persisted folder-source path that belongs to this app's own container
    /// onto the *current* container. iOS changes the app's data UUID between builds, so
    /// an absolute path stored earlier can reference a container that no longer exists.
    /// Covers the Application Support layout and, on iOS, the Documents directory. A path
    /// that is not part of our own container layout, including a user-chosen external
    /// folder that merely happens to sit under some `Library/Application Support` or
    /// provider `Documents` directory, is returned unchanged.
    public func rebasedContainerFolderURL(for url: URL) -> URL {
        if let rebased = rebased(
            url,
            ontoBase: applicationSupportBaseDirectory(),
            marker: "/Library/Application Support",
        ) {
            return rebased
        }

        #if os(iOS)
        /// The prefix check keeps external provider folders with a /Documents segment
        /// (iCloud Drive app folders) out of the rebase.
        if url.standardizedFileURL.path.contains("/Containers/Data/Application/"),
            let documents = documentsBaseDirectory(),
            let rebased = rebased(url, ontoBase: documents, marker: "/Documents")
        {
            return rebased
        }
        #endif

        return url
    }

    private func rebased(_ url: URL, ontoBase baseURL: URL, marker: String) -> URL? {
        let base = baseURL.standardizedFileURL.path
        let path = url.standardizedFileURL.path

        if path == base || path.hasPrefix(base + "/") {
            return url
        }

        guard
            let baseMarker = base.range(of: marker, options: .backwards),
            let pathMarker = path.range(of: marker, options: .backwards)
        else {
            return nil
        }

        let separators = CharacterSet(charactersIn: "/")
        let baseTail = String(base[baseMarker.upperBound...]).trimmingCharacters(in: separators)
        let pathTail = String(path[pathMarker.upperBound...]).trimmingCharacters(in: separators)

        let relativeTail: String
        if baseTail.isEmpty {
            relativeTail = pathTail
        } else if pathTail == baseTail {
            relativeTail = ""
        } else if pathTail.hasPrefix(baseTail + "/") {
            relativeTail = String(pathTail.dropFirst(baseTail.count + 1))
        } else {
            return nil
        }

        guard !relativeTail.isEmpty else {
            return baseURL
        }
        return baseURL.appendingPathComponent(relativeTail, isDirectory: true)
    }

    private nonisolated func applicationSupportBaseDirectory() -> URL {
        StorytellerPlatform.applicationSupportDirectory()
    }
}
