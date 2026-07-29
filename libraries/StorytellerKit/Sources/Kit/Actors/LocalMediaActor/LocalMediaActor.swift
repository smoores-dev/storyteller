import Foundation
import ZIPFoundation

public struct MediaPaths: Sendable, Equatable {
    public var ebookPath: URL?
    public var audioPath: URL?
    public var syncedPath: URL?

    public init(ebookPath: URL? = nil, audioPath: URL? = nil, syncedPath: URL? = nil) {
        self.ebookPath = ebookPath
        self.audioPath = audioPath
        self.syncedPath = syncedPath
    }

    public func path(for category: LocalMediaCategory) -> URL? {
        switch category {
            case .ebook: return ebookPath
            case .audio: return audioPath
            case .synced: return syncedPath
        }
    }

    public var isAllNil: Bool {
        ebookPath == nil && audioPath == nil && syncedPath == nil
    }

    /// The single audio category a downloaded book plays as in the car / Android
    /// Auto browse trees. Readaloud (synced) wins when both are present, so a
    /// book never appears under both. `nil` when no audio media is local.
    public var playbackOwner: PlaybackOwner? {
        if syncedPath != nil { return .readaloud }
        if audioPath != nil { return .audiobook }
        return nil
    }
}

public enum PlaybackOwner: String, Sendable {
    case audiobook
    case readaloud
}

// Relative to the source cache dir, never absolute: the app-container path changes across installs.
public struct DownloadedMediaRecord: Codable, Sendable, Equatable {
    public var ebookRelativePath: String?
    public var audioRelativePath: String?
    public var syncedRelativePath: String?

    public init(
        ebookRelativePath: String? = nil,
        audioRelativePath: String? = nil,
        syncedRelativePath: String? = nil,
    ) {
        self.ebookRelativePath = ebookRelativePath
        self.audioRelativePath = audioRelativePath
        self.syncedRelativePath = syncedRelativePath
    }

    public var isEmpty: Bool {
        ebookRelativePath == nil && audioRelativePath == nil && syncedRelativePath == nil
    }
}

@globalActor
public actor LocalMediaActor: GlobalActor {
    public static let shared = LocalMediaActor()
    private var sourceCacheMetadata: [BookMetadata] = []
    private(set) public var sourceCacheBookPaths: [BookID: MediaPaths] = [:]
    private var downloadedMediaBySource: [BookSourceID: [String: DownloadedMediaRecord]] = [:]
    private var reconcileTask: Task<Void, Never>?
    private var activeMutationCount = 0
    private var reconcileInvalidated = false
    private let filesystem: FilesystemActor
    private let localLibrary: LocalLibraryManager
    private var periodicScanTask: Task<Void, Never>?

    private var observers: [UUID: @Sendable () -> Void] = [:]
    private var sourceCacheLoaded = false
    private var ledgerBootstrapNeeded = false
    private var started = false

    public init(
        filesystem: FilesystemActor = .shared,
        localLibrary: LocalLibraryManager = LocalLibraryManager(),
    ) {
        self.filesystem = filesystem
        self.localLibrary = localLibrary
    }

    func start() async {
        guard !started else { return }
        started = true
        try? await filesystem.ensureLocalStorageDirectories()
        try? await loadSourceCache()
        scheduleBootstrapReconcileIfNeeded()
        startPeriodicScan()
    }

    private func startPeriodicScan() {
        periodicScanTask?.cancel()
        periodicScanTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(600))
                guard !Task.isCancelled else { break }
                await self?.reconcileDownloadedMedia()
            }
        }
    }

    private func scheduleBootstrapReconcileIfNeeded() {
        guard ledgerBootstrapNeeded else { return }
        reconcileTask?.cancel()
        reconcileTask = Task { [weak self] in
            await self?.reconcileDownloadedMedia(persistAllSources: true)
        }
    }

    @discardableResult
    public func addObserver(_ callback: @escaping @Sendable () -> Void) -> UUID {
        let id = UUID()
        observers[id] = callback
        debugLog("[LMA] addObserver: id=\(id), total observers=\(observers.count)")
        return id
    }

    private func notifyObservers() async {
        debugLogVerbose("[LMA] notifyObservers: notifying \(observers.count) observers")
        for (_, callback) in observers {
            callback()
        }
    }

    private func relativePathInSourceCache(_ url: URL, sourceID: BookSourceID) async -> String? {
        let base = await filesystem.sourceCacheDirectory(sourceID: sourceID)
            .standardizedFileURL.path
        let prefix = base.hasSuffix("/") ? base : base + "/"
        let full = url.standardizedFileURL.path
        guard full.hasPrefix(prefix) else { return nil }
        return String(full.dropFirst(prefix.count))
    }

    private func downloadRecord(from paths: MediaPaths, sourceID: BookSourceID) async
        -> DownloadedMediaRecord
    {
        var record = DownloadedMediaRecord()
        if let ebookPath = paths.ebookPath {
            record.ebookRelativePath = await relativePathInSourceCache(
                ebookPath,
                sourceID: sourceID,
            )
        }
        if let audioPath = paths.audioPath {
            record.audioRelativePath = await relativePathInSourceCache(
                audioPath,
                sourceID: sourceID,
            )
        }
        if let syncedPath = paths.syncedPath {
            record.syncedRelativePath = await relativePathInSourceCache(
                syncedPath,
                sourceID: sourceID,
            )
        }
        return record
    }

    private func mediaPaths(from record: DownloadedMediaRecord, sourceID: BookSourceID) async
        -> MediaPaths
    {
        let base = await filesystem.sourceCacheDirectory(sourceID: sourceID)
        func resolve(_ relativePath: String?) -> URL? {
            relativePath.map { base.appendingPathComponent($0) }
        }
        return MediaPaths(
            ebookPath: resolve(record.ebookRelativePath),
            audioPath: resolve(record.audioRelativePath),
            syncedPath: resolve(record.syncedRelativePath),
        )
    }

    private func rebuildPathProjection() async {
        var projection: [BookID: MediaPaths] = [:]
        for (sourceID, ledger) in downloadedMediaBySource {
            for (bookUUID, record) in ledger {
                let bookID = BookID(sourceID: sourceID, uuid: bookUUID)
                projection[bookID] = await mediaPaths(from: record, sourceID: sourceID)
            }
        }
        sourceCacheBookPaths = projection
    }

    private func persistLedger(forSourceID sourceID: BookSourceID) async {
        let ledger = downloadedMediaBySource[sourceID] ?? [:]
        do {
            try await filesystem.saveDownloadedMediaLedger(ledger, sourceID: sourceID)
        } catch {
            debugLog("[LMA] persistLedger failed for source \(sourceID): \(error)")
        }
    }

    private func updateLedgerEntry(
        bookID: String,
        sourceID: BookSourceID,
        paths: MediaPaths,
    ) async {
        let record = await downloadRecord(from: paths, sourceID: sourceID)
        let existing = downloadedMediaBySource[sourceID]?[bookID]
        let scopedID = BookID(sourceID: sourceID, uuid: bookID)
        if record.isEmpty {
            guard existing != nil else { return }
            downloadedMediaBySource[sourceID]?.removeValue(forKey: bookID)
            sourceCacheBookPaths.removeValue(forKey: scopedID)
        } else {
            guard existing != record else { return }
            downloadedMediaBySource[sourceID, default: [:]][bookID] = record
            sourceCacheBookPaths[scopedID] = await mediaPaths(from: record, sourceID: sourceID)
        }
        await persistLedger(forSourceID: sourceID)
    }

    private func setLedgerPath(
        bookID: String,
        sourceID: BookSourceID,
        category: LocalMediaCategory,
        url: URL?,
    ) async {
        let scopedID = BookID(sourceID: sourceID, uuid: bookID)
        var paths = sourceCacheBookPaths[scopedID] ?? MediaPaths()
        switch category {
            case .ebook: paths.ebookPath = url
            case .audio: paths.audioPath = url
            case .synced: paths.syncedPath = url
        }
        await updateLedgerEntry(bookID: bookID, sourceID: sourceID, paths: paths)
    }

    public func updateSourceCacheMetadata(
        _ metadata: [BookMetadata],
        replacingSourceID sourceID: BookSourceID,
    ) async throws {
        let preserved = sourceCacheMetadata.filter { $0.sourceID != sourceID }
        let nextMetadata = preserved + metadata
        sourceCacheMetadata = nextMetadata
        sourceCacheLoaded = true
        let grouped = metadataBySourceID(nextMetadata)
        if grouped[sourceID] == nil {
            try await filesystem.saveSourceCacheLibraryMetadata([], sourceID: sourceID)
        }
        for (groupSourceID, groupMetadata) in grouped {
            try await filesystem.saveSourceCacheLibraryMetadata(
                groupMetadata,
                sourceID: groupSourceID,
            )
        }

        let positions = Dictionary(
            nextMetadata.compactMap { book -> (BookID, BookReadingPosition)? in
                guard let pos = book.position else { return nil }
                return (book.id, pos)
            },
            uniquingKeysWith: { first, second in
                (second.timestamp ?? 0) > (first.timestamp ?? 0) ? second : first
            },
        )
        await ProgressSyncActor.shared.updateServerPositions(positions)

        await notifyObservers()
    }

    public func updateSourceCacheBookMetadata(
        _ metadata: BookMetadata
    ) async throws {
        await ensureSourceCacheLoaded()

        sourceCacheMetadata.removeAll { $0.id == metadata.id }
        sourceCacheMetadata.append(metadata)
        sourceCacheLoaded = true

        let grouped = metadataBySourceID(sourceCacheMetadata)
        if let sourceMetadata = grouped[metadata.sourceID] {
            try await filesystem.saveSourceCacheLibraryMetadata(
                sourceMetadata,
                sourceID: metadata.sourceID,
            )
        } else {
            try await filesystem.saveSourceCacheLibraryMetadata([], sourceID: metadata.sourceID)
        }

        await notifyObservers()
    }

    public func libraryMetadata() async -> [BookMetadata] {
        await ensureSourceCacheLoaded()
        return sourceCacheMetadata
    }

    private func ensureSourceCacheLoaded() async {
        guard !sourceCacheLoaded else { return }
        do {
            try await loadSourceCache()
        } catch {
            debugLog("[LocalMediaActor] ensureSourceCacheLoaded failed: \(error)")
        }
    }

    private func metadataBySourceID(_ metadata: [BookMetadata])
        -> [BookSourceID: [BookMetadata]]
    {
        var grouped: [BookSourceID: [BookMetadata]] = [:]
        for book in metadata {
            grouped[book.sourceID, default: []].append(book)
        }
        return grouped
    }

    public func updateBookProgress(bookID: BookID, locator: BookLocator, timestamp: Double) async {
        debugLog("[LocalMediaActor] updateBookProgress: bookID=\(bookID), timestamp=\(timestamp)")

        let updatedAtString = Date(timeIntervalSince1970: timestamp / 1000).ISO8601Format()

        if let index = sourceCacheMetadata.firstIndex(where: { $0.id == bookID }) {
            let existing = sourceCacheMetadata[index]
            let existingTimestamp = existing.position?.timestamp ?? 0

            if timestamp <= existingTimestamp {
                debugLog(
                    "[LocalMediaActor] updateBookProgress: skipping source-cache update, existing is newer (incoming: \(timestamp), existing: \(existingTimestamp))"
                )
            } else {
                let newPosition = BookReadingPosition(
                    uuid: existing.position?.uuid,
                    locator: locator,
                    timestamp: timestamp,
                    createdAt: existing.position?.createdAt,
                    updatedAt: updatedAtString,
                )
                let updatedMetadata = BookMetadata(
                    bookID: existing.id,
                    title: existing.title,
                    subtitle: existing.subtitle,
                    description: existing.description,
                    language: existing.language,
                    createdAt: existing.createdAt,
                    updatedAt: existing.updatedAt,
                    publicationDate: existing.publicationDate,
                    authors: existing.authors,
                    narrators: existing.narrators,
                    creators: existing.creators,
                    series: existing.series,
                    tags: existing.tags,
                    collections: existing.collections,
                    ebook: existing.ebook,
                    audiobook: existing.audiobook,
                    readaloud: existing.readaloud,
                    status: existing.status,
                    position: newPosition,
                    rating: existing.rating,
                    pageCount: existing.pageCount,
                    duration: existing.duration,
                    alignedAt: existing.alignedAt,
                    alignedByStorytellerVersion: existing.alignedByStorytellerVersion,
                    alignedWith: existing.alignedWith,
                    source: existing.source,
                )
                sourceCacheMetadata[index] = updatedMetadata
                debugLog("[LocalMediaActor] updateBookProgress: updated source-cache metadata")
                let sourceMetadata = sourceCacheMetadata.filter {
                    $0.sourceID == updatedMetadata.sourceID
                }
                do {
                    try await filesystem.saveSourceCacheLibraryMetadata(
                        sourceMetadata,
                        sourceID: updatedMetadata.sourceID,
                    )
                    debugLog(
                        "[LocalMediaActor] updateBookProgress: persisted source-cache metadata"
                    )
                } catch {
                    debugLog(
                        "[LocalMediaActor] updateBookProgress: failed to persist source-cache metadata: \(error)"
                    )
                }
            }
        }

        // Folder sources persist progress through FolderSourceActor. LocalMediaActor only tracks
        // client-owned cache state.
    }

    private func loadSourceCache() async throws {
        try await filesystem.ensureLocalStorageDirectories()
        let bookSources = try await filesystem.loadOrCreateBookSources()
        let registeredSourceIDs = Set(
            bookSources.filter { $0.kind != .localFolder }.map(\.id)
        )
        #if os(watchOS)
        let sourceIDs = registeredSourceIDs.union(
            (try? await filesystem.sourceCacheSourceIDs()) ?? []
        )
        #else
        let sourceIDs = registeredSourceIDs
        #endif

        var cachedMetadata: [BookMetadata] = []
        var ledgers: [BookSourceID: [String: DownloadedMediaRecord]] = [:]
        for sourceID in sourceIDs.sorted() {
            guard
                let loadedMetadata = try await filesystem.loadSourceCacheLibraryMetadata(
                    sourceID: sourceID
                )
            else { continue }
            cachedMetadata.append(contentsOf: loadedMetadata)
            if let ledger = try? await filesystem.loadDownloadedMediaLedger(sourceID: sourceID) {
                ledgers[sourceID] = ledger
            } else {
                ledgerBootstrapNeeded = true
            }
        }

        sourceCacheMetadata = cachedMetadata
        downloadedMediaBySource = ledgers
        await rebuildPathProjection()
        sourceCacheLoaded = true

        var allPositions: [BookID: BookReadingPosition] = [:]
        for book in cachedMetadata {
            if let pos = book.position,
                (pos.timestamp ?? 0) >= (allPositions[book.id]?.timestamp ?? 0)
            {
                allPositions[book.id] = pos
            }
        }
        await ProgressSyncActor.shared.updateServerPositions(allPositions)

        await notifyObservers()
    }

    // User downloads/deletes preempt the background reconcile, which must never overwrite a ledger
    // entry a user action just wrote. beginMutation cancels any in-flight reconcile and latches an
    // invalidation flag the reconcile checks before committing its scan.
    private func beginMutation() {
        activeMutationCount += 1
        reconcileInvalidated = true
        reconcileTask?.cancel()
    }

    private func endMutation() {
        activeMutationCount -= 1
    }

    // The only place that scans the filesystem to discover downloaded media. persistAllSources
    // writes a ledger for every non-folder source even when empty, so first-run bootstrap leaves
    // a file behind and later launches skip the scan.
    public func reconcileDownloadedMedia(persistAllSources: Bool = false) async {
        await ensureSourceCacheLoaded()

        guard activeMutationCount == 0 else { return }
        reconcileInvalidated = false

        var rebuilt: [BookSourceID: [String: DownloadedMediaRecord]] = [:]
        for book in sourceCacheMetadata {
            guard !reconcileInvalidated else { return }
            let paths = await scanBookPaths(for: book.uuid, sourceID: book.sourceID)
            let record = await downloadRecord(from: paths, sourceID: book.sourceID)
            if !record.isEmpty {
                rebuilt[book.sourceID, default: [:]][book.uuid] = record
            }
        }

        let changed = rebuilt != downloadedMediaBySource
        guard changed || persistAllSources else { return }

        var sourcesToPersist = Set(rebuilt.keys).union(downloadedMediaBySource.keys)
        if persistAllSources {
            let nonFolderSourceIDs =
                (try? await filesystem.loadOrCreateBookSources())?
                .filter { $0.kind != .localFolder }
                .map(\.id) ?? []
            sourcesToPersist.formUnion(nonFolderSourceIDs)
        }

        guard !reconcileInvalidated, activeMutationCount == 0 else { return }
        downloadedMediaBySource = rebuilt
        await rebuildPathProjection()
        for sourceID in sourcesToPersist {
            await persistLedger(forSourceID: sourceID)
        }
        ledgerBootstrapNeeded = false
        debugLog(
            "[LMA] reconcileDownloadedMedia: ledger persisted for \(sourcesToPersist.count) source(s), changed=\(changed)"
        )
        guard changed else { return }
        await notifyObservers()
    }

    private func scanBookPaths(
        for uuid: String,
        sourceID: BookSourceID,
    ) async -> MediaPaths {
        var paths = MediaPaths()
        let fm = FileManager.default

        for category in LocalMediaCategory.allCases {
            guard
                let categoryDir = await filesystem.mediaDirectory(
                    for: uuid,
                    category: category,
                    sourceID: sourceID,
                )
            else {
                continue
            }

            guard
                let contents = try? fm.contentsOfDirectory(
                    at: categoryDir,
                    includingPropertiesForKeys: [.isDirectoryKey],
                    options: [.skipsHiddenFiles],
                )
            else {
                continue
            }

            switch category {
                case .ebook:
                    paths.ebookPath = firstMediaFile(in: contents, matchingExtensions: ["epub"])
                case .audio:
                    paths.audioPath = audioManifestFile(in: categoryDir)
                case .synced:
                    paths.syncedPath = firstMediaFile(in: contents, matchingExtensions: ["epub"])
            }
        }

        return paths
    }

    public func cachedMediaPaths(for metadata: [BookMetadata]) async -> [BookID: MediaPaths] {
        await ensureSourceCacheLoaded()
        return sourceCacheBookPaths
    }

    public func mediaFilePath(
        for bookID: BookID,
        category: LocalMediaCategory,
    ) async -> URL? {
        return sourceCacheBookPaths[bookID]?.path(for: category)
    }

    // Validates the recorded file still exists; on a miss, rescans this one book and re-syncs the
    // ledger (records a found file, or clears a stale entry).
    public func resolveAndRecordBookPath(
        for bookID: BookID,
        category: LocalMediaCategory,
    ) async -> URL? {
        if let cached = sourceCacheBookPaths[bookID]?
            .path(for: category),
            FileManager.default.fileExists(atPath: cached.path)
        {
            return cached
        }
        let scanned = await scanBookPaths(for: bookID.uuid, sourceID: bookID.sourceID)
        await updateLedgerEntry(
            bookID: bookID.uuid,
            sourceID: bookID.sourceID,
            paths: scanned,
        )
        return scanned.path(for: category)
    }

    private func firstMediaFile(in contents: [URL], matchingExtensions extensions: Set<String>)
        -> URL?
    {
        return contents.first { url in
            guard let values = try? url.resourceValues(forKeys: [.isDirectoryKey]),
                values.isDirectory != true
            else {
                return false
            }
            return extensions.contains(url.pathExtension.lowercased())
        }
    }

    private func audioManifestFile(in audioDirectory: URL) -> URL? {
        let manifestURL = audioDirectory.appendingPathComponent(
            "manifest.json",
            isDirectory: false,
        )
        guard FileManager.default.fileExists(atPath: manifestURL.path) else {
            return nil
        }
        return manifestURL
    }

    public func deleteMedia(
        for bookID: BookID,
        category: LocalMediaCategory,
    ) async throws {
        beginMutation()
        defer { endMutation() }
        try await filesystem.deleteMedia(
            for: bookID.uuid,
            category: category,
            sourceID: bookID.sourceID,
        )

        await setLedgerPath(
            bookID: bookID.uuid,
            sourceID: bookID.sourceID,
            category: category,
            url: nil,
        )
        await notifyObservers()
    }

    /// Removes every downloaded category for a book in one mutation. Tolerates categories that were
    /// never downloaded. Used when a book is deleted from its source so no stranded files remain.
    public func removeAllMedia(for bookID: BookID) async {
        beginMutation()
        defer { endMutation() }
        for category in LocalMediaCategory.allCases {
            try? await filesystem.deleteMedia(
                for: bookID.uuid,
                category: category,
                sourceID: bookID.sourceID,
            )
            await setLedgerPath(
                bookID: bookID.uuid,
                sourceID: bookID.sourceID,
                category: category,
                url: nil,
            )
        }
        await notifyObservers()
    }

    public func ensureLocalStorageDirectories() async throws {
        try await filesystem.ensureLocalStorageDirectories()
    }

    /// Imports a pre-downloaded file into LMA storage. Uses moveItem (not copy) to avoid
    /// doubling storage usage.
    public func importDownloadedFile(
        from tempURL: URL,
        metadata: BookMetadata,
        category: LocalMediaCategory,
        filename: String,
        audioIsPackage: Bool = true,
    ) async throws {
        beginMutation()
        defer { endMutation() }
        defer {
            try? FileManager.default.removeItem(at: tempURL)
        }

        try await filesystem.ensureLocalStorageDirectories()
        let cacheSourceID = metadata.sourceID

        let destinationDirectory = await filesystem.getMediaDirectory(
            category: category,
            bookName: metadata.title,
            uuidIdentifier: metadata.uuid,
            sourceID: cacheSourceID,
        )
        let bookRoot = destinationDirectory.deletingLastPathComponent()
        try await filesystem.ensureDirectoryExists(at: bookRoot)

        let fm = FileManager.default
        if category == .audio && audioIsPackage {
            let stagingDirectory = bookRoot.appendingPathComponent(
                ".audio.importing",
                isDirectory: true,
            )
            if fm.fileExists(atPath: stagingDirectory.path) {
                try fm.removeItem(at: stagingDirectory)
            }
            try await filesystem.ensureDirectoryExists(at: stagingDirectory)

            do {
                try extractAudiobookPackage(from: tempURL, to: stagingDirectory)
                guard
                    fm.fileExists(
                        atPath: stagingDirectory.appendingPathComponent("manifest.json").path
                    )
                else {
                    throw LocalMediaError.missingAudiobookManifest
                }

                if fm.fileExists(atPath: destinationDirectory.path) {
                    try fm.removeItem(at: destinationDirectory)
                }
                // A same-volume rename keeps interrupted extraction out of the live media path.
                try fm.moveItem(at: stagingDirectory, to: destinationDirectory)
                debugLog(
                    "[LMA] importDownloadedFile: extracted audiobook package to \(destinationDirectory.path)"
                )
                await setLedgerPath(
                    bookID: metadata.uuid,
                    sourceID: cacheSourceID,
                    category: .audio,
                    url: destinationDirectory.appendingPathComponent("manifest.json"),
                )
                await notifyObservers()
                return
            } catch {
                if fm.fileExists(atPath: stagingDirectory.path) {
                    try? fm.removeItem(at: stagingDirectory)
                }
                throw error
            }
        }

        try await filesystem.ensureDirectoryExists(at: destinationDirectory)
        let destinationURL = destinationDirectory.appendingPathComponent(filename)

        if fm.fileExists(atPath: destinationURL.path) {
            try fm.removeItem(at: destinationURL)
        }

        try fm.moveItem(at: tempURL, to: destinationURL)

        debugLog("[LMA] importDownloadedFile: moved \(filename) to \(destinationURL.path)")

        await setLedgerPath(
            bookID: metadata.uuid,
            sourceID: cacheSourceID,
            category: category,
            url: destinationURL,
        )
        await notifyObservers()
    }

    public func removeSourceCacheData(sourceID: BookSourceID) async throws {
        beginMutation()
        defer { endMutation() }
        await ensureSourceCacheLoaded()
        let booksToRemove = sourceCacheMetadata.filter {
            $0.sourceID == sourceID
        }

        for book in booksToRemove {
            try await filesystem.removeSourceCacheBookData(uuid: book.uuid, sourceID: sourceID)
        }

        sourceCacheMetadata.removeAll {
            $0.sourceID == sourceID
        }
        try await filesystem.saveSourceCacheLibraryMetadata([], sourceID: sourceID)

        downloadedMediaBySource[sourceID] = nil
        await rebuildPathProjection()
        await persistLedger(forSourceID: sourceID)

        await notifyObservers()
    }

    private func extractAudiobookPackage(from archiveURL: URL, to destinationDirectory: URL) throws
    {
        let archive = try Archive(url: archiveURL, accessMode: .read)
        let fm = FileManager.default

        for entry in archive {
            guard !entry.path.hasPrefix("/"), !entry.path.split(separator: "/").contains("..")
            else {
                continue
            }
            let destinationURL = destinationDirectory.appendingPathComponent(entry.path)
            if entry.type == .directory {
                try fm.createDirectory(at: destinationURL, withIntermediateDirectories: true)
                continue
            }

            try fm.createDirectory(
                at: destinationURL.deletingLastPathComponent(),
                withIntermediateDirectories: true,
            )
            _ = try archive.extract(entry, to: destinationURL)
        }
    }

}

public enum LocalMediaCategory: String, CaseIterable, Sendable, Codable {
    case audio
    case ebook
    case synced
}

enum LocalMediaError: Error, Sendable {
    case missingAudiobookManifest
    case importFailed(String)
}

extension LocalMediaError: LocalizedError {
    var errorDescription: String? {
        switch self {
            case .missingAudiobookManifest:
                "Audiobook package is missing manifest.json"
            case .importFailed(let message):
                message
        }
    }
}
