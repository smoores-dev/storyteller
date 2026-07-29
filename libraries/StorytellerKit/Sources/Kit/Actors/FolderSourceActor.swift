import Foundation
import ZIPFoundation

#if canImport(AVFoundation)
import AVFoundation
#endif

public actor FolderSourceActor: BookSourceActor {
    public static let availableStatuses: [BookStatus] = [
        BookStatus(uuid: "folder-status-to-read", name: "To read", isDefault: true),
        BookStatus(uuid: "folder-status-reading", name: "Reading"),
        BookStatus(uuid: "folder-status-read", name: "Read"),
    ]

    private let sourceRecordValue: BookSourceRecord
    private let filesystem: FilesystemActor
    private let localLibrary: LocalLibraryManager

    private var metadataCache: [BookMetadata] = []
    private var pathCache: [String: MediaPaths] = [:]
    private var stateCache: FolderSourceLibraryState?
    private var activeFolderAccessURL: URL?
    private var activeFolderAccessDidStart = false
    private var folderWatchToken: (any FolderWatchToken)?
    private var folderChangeRescanTask: Task<Void, Never>?
    private var libraryChangeHandler: (@Sendable () async -> Void)?

    private enum FolderSourceWriteLayout {
        case mediaTypeSubfolders
        case sameFolder
    }

    public init(
        sourceRecord: BookSourceRecord,
        filesystem: FilesystemActor = .shared,
        localLibrary: LocalLibraryManager = LocalLibraryManager(),
    ) {
        self.sourceRecordValue = sourceRecord
        self.filesystem = filesystem
        self.localLibrary = localLibrary
    }

    deinit {
        folderWatchToken?.cancel()
        folderChangeRescanTask?.cancel()
        if activeFolderAccessDidStart {
            #if canImport(Darwin)
            activeFolderAccessURL?.stopAccessingSecurityScopedResource()
            #endif
        }
    }

    public var sourceRecord: BookSourceRecord {
        sourceRecordValue
    }

    public var connectionStatus: ConnectionStatus {
        .connected
    }

    public func fetchLibraryInformation() async -> [BookMetadata]? {
        do {
            let library = try await scanLibrary()
            metadataCache = library.metadata
            pathCache = library.paths
            await startWatchingFolderIfNeeded()
            return library.metadata
        } catch {
            debugLog("[FolderSourceActor] Failed to fetch library: \(error)")
            return nil
        }
    }

    /// Called after a watcher-triggered rescan finds actual changes, so the owning service can
    /// notify UI observers. Folder sources otherwise have no channel back to the service layer.
    public func setLibraryChangeHandler(_ handler: (@Sendable () async -> Void)?) {
        libraryChangeHandler = handler
    }

    private func startWatchingFolderIfNeeded() async {
        guard folderWatchToken == nil, let watcher = StorytellerPlatform.folderWatcher else { return }
        do {
            try await retainFolderAccessForResolvedMedia()
        } catch {
            debugLog("[FolderSourceActor] Cannot watch folder without access: \(error)")
            return
        }
        guard let url = activeFolderAccessURL else { return }
        folderWatchToken = watcher.watch(url) { [weak self] in
            guard let self else { return }
            Task { await self.scheduleFolderChangeRescan() }
        }
    }

    private func scheduleFolderChangeRescan() {
        folderChangeRescanTask?.cancel()
        folderChangeRescanTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            await self?.rescanAfterFolderChange()
        }
    }

    private func rescanAfterFolderChange() async {
        // Saving our own library state file lands inside the watched folder and echoes back as
        // one more event; that rescan finds nothing changed and goes quiet here.
        let before = metadataCache
        guard let after = await fetchLibraryInformation(), after != before else { return }
        debugLog(
            "[FolderSourceActor] Folder contents changed on disk; rescanned \(after.count) book(s)"
        )
        await libraryChangeHandler?()
    }

    public func cachedLibraryInformation() async -> [BookMetadata] {
        if !metadataCache.isEmpty {
            return metadataCache
        }
        do {
            let resolved = try await resolvedFolderURL()
            defer { stopAccessing(resolved) }
            let state = try await savedState(in: resolved.url)
            let projected = projectLibrary(from: state, folderURL: resolved.url)
            stateCache = state
            metadataCache = projected.metadata
            pathCache = projected.paths
            return projected.metadata
        } catch {
            debugLog("[FolderSourceActor] Failed to load cached library: \(error)")
            return []
        }
    }

    func debugScanLibrary(in folderURL: URL) async throws -> [BookMetadata] {
        try await scanLibrary(in: folderURL).metadata
    }

    func debugWriteDestinationDirectory(
        in folderURL: URL,
        bookID: String,
        category: LocalMediaCategory,
    ) -> String {
        guard let placement = writePlacement(for: bookID, root: folderURL) else { return "" }
        let destination = destinationDirectory(for: category, placement: placement)
        return relativePath(for: destination, root: folderURL)
    }

    func debugValidatedMediaFilePath(in folderURL: URL, relativePath: String) throws -> String {
        let url = try validatedMediaFileURL(forRelativePath: relativePath, root: folderURL)
        return self.relativePath(for: url, root: folderURL)
    }

    public func fetchCoverImage(
        for bookId: String,
        audio _: Bool,
        width _: Int?,
        height _: Int?,
        version _: String?,
        ifNoneMatch _: String?,
        ifModifiedSince _: String?,
    ) async -> BookCover? {
        guard let data = await extractCover(for: bookId) else {
            return nil
        }
        return BookCover(
            data: data,
            contentType: nil,
            etag: nil,
            lastModified: nil,
            cacheControl: nil,
            contentDisposition: nil,
        )
    }

    public func sendProgressToServer(
        bookId: String,
        locator: BookLocator,
        timestamp: Double,
    ) async -> HTTPResult {
        do {
            try await updateBookProgress(bookId: bookId, locator: locator, timestamp: timestamp)
            return .success
        } catch {
            debugLog("[FolderSourceActor] Failed to save progress: \(error)")
            return .failure
        }
    }

    public func fetchBookPosition(bookId: String) async -> BookReadingPosition? {
        // A known book with no saved position must answer nil from cache; falling through to a
        // rescan here would put a full folder scan on every position poll for unopened books.
        if let book = await cachedLibraryInformation().first(where: { $0.uuid == bookId }) {
            return book.position
        }
        guard let metadata = await fetchLibraryInformation() else { return nil }
        return metadata.first(where: { $0.uuid == bookId })?.position
    }

    public func resolveLocalMedia(
        for bookID: String,
        category: LocalMediaCategory,
    ) async -> ResolvedLocalMedia? {
        // A folder source reads files in place; it never populates the LMA download cache (the
        // download path resolves folder media without copying it), so resolution is always the
        // in-folder file.
        if pathCache[bookID] == nil {
            _ = await fetchLibraryInformation()
        }
        do {
            try await retainFolderAccessForResolvedMedia()
        } catch {
            debugLog("[FolderSourceActor] Failed to retain folder access: \(error)")
            return nil
        }
        guard let paths = pathCache[bookID] else { return nil }
        let url: URL?
        switch category {
            case .ebook:
                url = paths.ebookPath
            case .audio:
                guard let folderURL = activeFolderAccessURL else { return nil }
                url = try? await derivedAudiobookManifest(for: bookID, folderURL: folderURL)
            case .synced:
                url = paths.syncedPath
        }
        guard let url, FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }
        return ResolvedLocalMedia(
            bookID: BookID(sourceID: sourceRecordValue.id, uuid: bookID),
            category: category,
            url: url,
            kind: .source,
        )
    }

    /// Real audio file URLs backing a book, in track order. Unlike `resolveLocalMedia`, which for
    /// audio returns a derived manifest, this returns the source files themselves.
    public func localAudioFiles(for bookID: String) async -> [URL] {
        if pathCache[bookID] == nil {
            _ = await fetchLibraryInformation()
        }
        do {
            try await retainFolderAccessForResolvedMedia()
        } catch {
            debugLog(
                "[FolderSourceActor] Failed to retain folder access for audio export: \(error)"
            )
            return []
        }
        guard let folderURL = activeFolderAccessURL,
            let media = mediaForWork(bookID: bookID)[.audio]
        else {
            return []
        }
        return media.relativePaths
            .map { folderURL.appendingPathComponent($0) }
            .filter { FileManager.default.fileExists(atPath: $0.path) }
    }

    public func acceptBook(
        bookUUID: String,
        title: String,
        ebook: StorytellerUploadAsset?,
        audiobooks: [StorytellerUploadAsset],
        readaloud: StorytellerUploadAsset?,
        collectionUUID _: String?,
        onProgress: (@Sendable (Double) -> Void)?,
    ) async -> String? {
        do {
            let acceptedBookID = try await importBookAssets(
                bookUUID: bookUUID,
                bookName: title,
                ebook: ebook,
                audiobooks: audiobooks,
                readaloud: readaloud,
            )
            onProgress?(1.0)
            return acceptedBookID
        } catch {
            debugLog("[FolderSourceActor] acceptBook failed: \(error)")
            return nil
        }
    }

    public func deleteBook(_ bookID: String) async -> Bool {
        do {
            try await removeBookFiles(bookID)
            return true
        } catch {
            debugLog("[FolderSourceActor] deleteBook failed for \(bookID): \(error)")
            return false
        }
    }

    public func deleteAsset(
        _ bookID: String,
        category: LocalMediaCategory,
    ) async -> DeleteAssetResult {
        do {
            let previous = await fetchLibraryInformation()?.first(where: { $0.uuid == bookID })
            try await deleteMedia(bookID, category: category)
            if let updated = await fetchLibraryInformation()?.first(where: { $0.uuid == bookID }) {
                return .success(updated)
            }
            if let previous {
                return .success(previous)
            }
            return .failed
        } catch {
            debugLog("[FolderSourceActor] deleteAsset failed for \(bookID): \(error)")
            return .failed
        }
    }

    public func replaceAsset(
        _ asset: StorytellerUploadAsset,
        bookID: String,
        replaceMetadata _: Bool,
        onProgress: (@Sendable (Double) -> Void)?,
    ) async -> ReplaceAssetResult {
        do {
            try await replaceAsset(asset, bookName: asset.filename, bookUUID: bookID)
            onProgress?(1.0)
            return .success
        } catch {
            debugLog("[FolderSourceActor] replaceAsset failed for \(bookID): \(error)")
            return .failed
        }
    }

    public func updateStatus(
        forBooks bookIDs: [String],
        toStatusNamed statusName: String,
    ) async -> Bool {
        guard
            let status = Self.availableStatuses.first(where: {
                $0.name.caseInsensitiveCompare(statusName) == .orderedSame
            })
        else {
            return false
        }
        return await updateStatus(forBooks: bookIDs, to: status)
    }

    public func closeFolderAccess() {
        folderWatchToken?.cancel()
        folderWatchToken = nil
        if activeFolderAccessDidStart {
            #if canImport(Darwin)
            activeFolderAccessURL?.stopAccessingSecurityScopedResource()
            #endif
        }
        activeFolderAccessURL = nil
        activeFolderAccessDidStart = false
    }

    public func packageAudiobook(for bookID: String) async -> URL? {
        do {
            let resolved = try await resolvedFolderURL()
            defer { stopAccessing(resolved) }
            if stateCache == nil {
                _ = try await scanLibrary(in: resolved.url)
            }
            guard
                let state = stateCache,
                let work = state.works.first(where: { $0.uuid == bookID }),
                let mediaID = work.mediaIDs[.audio],
                let media = state.media.first(where: { $0.uuid == mediaID }),
                !media.missing
            else {
                return nil
            }

            let audioFiles = media.relativePaths.map {
                resolved.url.appendingPathComponent($0)
            }.filter {
                FileManager.default.fileExists(atPath: $0.path)
            }
            guard !audioFiles.isEmpty else { return nil }

            let fm = FileManager.default
            let stagingDir = fm.temporaryDirectory.appendingPathComponent(
                "storyteller-content-server",
                isDirectory: true,
            )
            try fm.createDirectory(at: stagingDir, withIntermediateDirectories: true)
            let zipURL = stagingDir.appendingPathComponent(
                "\(bookID)-\(UUID().uuidString).audiobook"
            )
            if fm.fileExists(atPath: zipURL.path) {
                try fm.removeItem(at: zipURL)
            }

            let manifestData = try await audiobookManifestData(
                title: work.title,
                audioFiles: audioFiles,
            )
            let manifestURL = stagingDir.appendingPathComponent(
                "\(UUID().uuidString)-manifest.json"
            )
            try manifestData.write(to: manifestURL, options: .atomic)
            defer { try? fm.removeItem(at: manifestURL) }

            let archive = try Archive(url: zipURL, accessMode: .create)
            for file in audioFiles {
                try archive.addEntry(
                    with: file.lastPathComponent,
                    fileURL: file,
                    compressionMethod: .none,
                )
            }
            try archive.addEntry(
                with: "manifest.json",
                fileURL: manifestURL,
                compressionMethod: .none,
            )
            try archive.addEntry(
                with: "manifest.audiobook-manifest",
                fileURL: manifestURL,
                compressionMethod: .none,
            )
            return zipURL
        } catch {
            debugLog("[FolderSourceActor] packageAudiobook failed for \(bookID): \(error)")
            return nil
        }
    }

    private func retainFolderAccessForResolvedMedia() async throws {
        if let activeFolderAccessURL,
            FileManager.default.fileExists(atPath: activeFolderAccessURL.path)
        {
            return
        }

        closeFolderAccess()

        let resolved = try await resolvedFolderURL()
        activeFolderAccessURL = resolved.url
        activeFolderAccessDidStart = resolved.didStartAccessing
    }

    public func updateStatus(forBooks bookIds: [String], to status: BookStatus) async -> Bool {
        guard !bookIds.isEmpty else { return false }
        do {
            let resolved = try await resolvedFolderURL()
            defer { stopAccessing(resolved) }

            if metadataCache.isEmpty {
                _ = try await scanLibrary(in: resolved.url)
            }

            var state = try await savedState(in: resolved.url)
            var updatedAny = false
            for bookId in bookIds {
                guard let index = state.works.firstIndex(where: { $0.uuid == bookId }) else {
                    continue
                }
                state.works[index].status = status
                updatedAny = true
            }

            guard updatedAny else { return false }
            try await filesystem.saveFolderSourceLibraryState(state, in: resolved.url)
            stateCache = state
            let projected = projectLibrary(from: state, folderURL: resolved.url)
            metadataCache = projected.metadata
            pathCache = projected.paths
            return true
        } catch {
            debugLog("[FolderSourceActor] Failed to save status: \(error)")
            return false
        }
    }

    /// Returns the UUID of the work that ended up holding the assets, which is not always the
    /// passed `bookUUID`: the post-import scan groups files by name, so assets can join an
    /// existing work, and brand-new works are minted by the scan itself.
    @discardableResult
    public func importBookAssets(
        bookUUID: String,
        bookName: String,
        ebook: StorytellerUploadAsset? = nil,
        audiobooks: [StorytellerUploadAsset] = [],
        readaloud: StorytellerUploadAsset? = nil,
    ) async throws -> String {
        let resolved = try await resolvedFolderURL()
        defer { stopAccessing(resolved) }
        return try await importBookAssets(
            bookUUID: bookUUID,
            bookName: bookName,
            ebook: ebook,
            audiobooks: audiobooks,
            readaloud: readaloud,
            root: resolved.url,
        )
    }

    @discardableResult
    func debugImportBookAssets(
        in folderURL: URL,
        bookUUID: String,
        bookName: String,
        ebook: StorytellerUploadAsset? = nil,
        audiobooks: [StorytellerUploadAsset] = [],
        readaloud: StorytellerUploadAsset? = nil,
    ) async throws -> String {
        try await importBookAssets(
            bookUUID: bookUUID,
            bookName: bookName,
            ebook: ebook,
            audiobooks: audiobooks,
            readaloud: readaloud,
            root: folderURL,
        )
    }

    private func importBookAssets(
        bookUUID: String,
        bookName: String,
        ebook: StorytellerUploadAsset?,
        audiobooks: [StorytellerUploadAsset],
        readaloud: StorytellerUploadAsset?,
        root: URL,
    ) async throws -> String {
        guard ebook != nil || !audiobooks.isEmpty || readaloud != nil else {
            throw LocalMediaError.importFailed("No assets selected")
        }

        if stateCache == nil {
            _ = try await scanLibrary(in: root)
        }

        // An existing book reuses its on-disk placement; a new book gets a fresh directory using the
        // folder's prevailing layout.
        let existingPlacement = writePlacement(for: bookUUID, root: root)
        let newBookStem = assetFilenameStem(forNewBookTitled: bookName)
        let placement =
            existingPlacement
            ?? defaultWritePlacement(forNewBookTitled: newBookStem, root: root)

        // Incoming filenames are whatever the origin used (storyteller, for one, caches epubs
        // under work UUIDs but audio under human-readable names), and same-folder layouts group
        // media into works by filename stem. Rewrite every asset onto one stem so the scan sees a
        // single work: the book title for a new book, or the stem of the already-present files for
        // an existing one.
        let stem =
            existingPlacement == nil
            ? newBookStem
            : existingAssetFilenameStem(forBook: bookUUID) ?? newBookStem

        var writtenURLs: [URL] = []

        if let ebook {
            writtenURLs.append(
                try await writeAsset(
                    renamed(ebook, to: "\(stem).\(fileExtension(for: ebook))"),
                    to: destinationDirectory(for: .ebook, placement: placement),
                )
            )
        }

        if !audiobooks.isEmpty {
            let audioDirectory = destinationDirectory(for: .audio, placement: placement)
            try await filesystem.ensureDirectoryExists(at: audioDirectory)

            var usedFilenames: Set<String> = []
            for audiobook in audiobooks {
                // Multi-track audiobooks keep their original names as a suffix: tracks stay
                // distinct and their name-sorted playback order survives the rename.
                let filename =
                    audiobooks.count == 1
                    ? "\(stem).\(fileExtension(for: audiobook))"
                    : "\(stem) - \(preferredFilename(for: audiobook))"
                writtenURLs.append(
                    try await writeAsset(
                        renamed(audiobook, to: filename),
                        to: audioDirectory,
                        usedFilenames: &usedFilenames,
                    )
                )
            }
        }

        if let readaloud {
            writtenURLs.append(
                try await writeAsset(
                    renamed(readaloud, to: "\(stem) readaloud.\(fileExtension(for: readaloud))"),
                    to: destinationDirectory(for: .synced, placement: placement),
                )
            )
        }

        _ = try await scanLibrary(in: root)
        return workID(containingAnyOf: writtenURLs, root: root) ?? bookUUID
    }

    private func workID(containingAnyOf urls: [URL], root: URL) -> String? {
        guard let state = stateCache else { return nil }
        let writtenPaths = Set(urls.map { relativePath(for: $0, root: root) })
        let mediaByID = Dictionary(uniqueKeysWithValues: state.media.map { ($0.uuid, $0) })
        return state.works.first { work in
            work.mediaIDs.values.contains { mediaID in
                mediaByID[mediaID]?.relativePaths.contains(where: writtenPaths.contains) ?? false
            }
        }?.uuid
    }

    public func replaceAsset(
        _ asset: StorytellerUploadAsset,
        bookName: String,
        bookUUID: String,
    ) async throws {
        if pathCache[bookUUID] == nil {
            _ = await fetchLibraryInformation()
        }

        let resolved = try await resolvedFolderURL()
        defer { stopAccessing(resolved) }

        try deleteExistingMedia(
            bookUUID,
            category: localMediaCategory(for: asset.format),
            root: resolved.url,
        )

        switch asset.format {
            case .ebook:
                try await importBookAssets(
                    bookUUID: bookUUID,
                    bookName: bookName,
                    ebook: asset,
                )
            case .audiobook:
                try await importBookAssets(
                    bookUUID: bookUUID,
                    bookName: bookName,
                    audiobooks: [asset],
                )
            case .readaloud:
                try await importBookAssets(
                    bookUUID: bookUUID,
                    bookName: bookName,
                    readaloud: asset,
                )
        }
    }

    private func removeBookFiles(_ bookID: String) async throws {
        if pathCache[bookID] == nil {
            _ = await fetchLibraryInformation()
        }

        let resolved = try await resolvedFolderURL()
        defer { stopAccessing(resolved) }

        let media = mediaForWork(bookID: bookID).values
        guard !media.isEmpty else {
            try await removeMetadata(bookID: bookID)
            return
        }

        let fm = FileManager.default
        let urls = try media.flatMap(\.relativePaths).map {
            try validatedMediaFileURL(forRelativePath: $0, root: resolved.url)
        }
        for url in urls where fm.fileExists(atPath: url.path) {
            try fm.removeItem(at: url)
        }
        try await removeMetadata(bookID: bookID)
    }

    public func deleteMedia(
        _ bookID: String,
        category: LocalMediaCategory,
    ) async throws {
        if pathCache[bookID] == nil {
            _ = await fetchLibraryInformation()
        }
        let resolved = try await resolvedFolderURL()
        defer { stopAccessing(resolved) }

        try deleteExistingMedia(bookID, category: category, root: resolved.url)
        _ = try await scanLibrary(in: resolved.url)
    }

    private func scanLibrary() async throws -> LocalLibraryManager.ScanResult {
        let resolved = try await resolvedFolderURL()
        defer { stopAccessing(resolved) }
        return try await scanLibrary(in: resolved.url)
    }

    func scanLibrary(in folderURL: URL) async throws -> LocalLibraryManager.ScanResult {
        try await filesystem.ensureDirectoryExists(at: folderURL)
        try await filesystem.ensureSourceIDMarker(in: folderURL, sourceID: sourceRecordValue.id)

        let previousState = try await savedState(in: folderURL)
        let nextState = try await scanState(in: folderURL, previousState: previousState)
        let projected = projectLibrary(from: nextState, folderURL: folderURL)

        logDuplicateFolderUUIDs(projected.metadata, folderURL: folderURL)
        // The state file lives inside the folder, so an unconditional save makes every scan look
        // like a folder change to the watcher. Rescans of an unchanged tree only bump lastSeenAt;
        // skip the write for those.
        if !Self.equivalentIgnoringSeenTimestamps(previousState, nextState) {
            try await filesystem.saveFolderSourceLibraryState(nextState, in: folderURL)
        }
        stateCache = nextState
        metadataCache = projected.metadata
        pathCache = projected.paths

        return LocalLibraryManager.ScanResult(metadata: projected.metadata, paths: projected.paths)
    }

    private static func equivalentIgnoringSeenTimestamps(
        _ lhs: FolderSourceLibraryState,
        _ rhs: FolderSourceLibraryState,
    ) -> Bool {
        var lhs = lhs
        var rhs = rhs
        for index in lhs.media.indices {
            lhs.media[index].lastSeenAt = nil
        }
        for index in rhs.media.indices {
            rhs.media[index].lastSeenAt = nil
        }
        return lhs == rhs
    }

    private func savedMetadata(in folderURL: URL) async throws -> [BookMetadata] {
        let state = try await savedState(in: folderURL)
        return projectLibrary(from: state, folderURL: folderURL).metadata
    }

    private func savedState(in folderURL: URL) async throws -> FolderSourceLibraryState {
        if let state = try await filesystem.loadFolderSourceLibraryState(in: folderURL) {
            return state
        }
        return FolderSourceLibraryState(sourceID: sourceRecordValue.id)
    }

    private struct FolderMediaCandidate: Sendable, Hashable {
        let role: FolderSourceMediaRole
        let urls: [URL]
        let relativePaths: [String]
        let extractedMetadata: FolderSourceExtractedMetadata?
        let groupingDirectory: String
        let groupingStem: String
    }

    private func scanState(
        in folderURL: URL,
        previousState: FolderSourceLibraryState,
    ) async throws -> FolderSourceLibraryState {
        let candidates = await mediaCandidates(in: folderURL)
        let now = Date().ISO8601Format()
        var previousMediaByPaths: [Set<String>: FolderSourceMedia] = [:]
        for media in previousState.media {
            previousMediaByPaths[Set(media.relativePaths)] = media
        }
        let previousWorkByMediaID = previousWorkLookup(previousState)
        var media: [FolderSourceMedia] = []
        var works: [FolderSourceWork] = []
        var seenPreviousMediaIDs: Set<String> = []
        var seenPreviousWorkIDs: Set<String> = []
        var claimedPreviousWorkIDs: Set<String> = []

        for group in groupedCandidates(candidates) {
            var mediaIDs: [FolderSourceMediaRole: String] = [:]
            var groupMedia: [FolderSourceMedia] = []
            for candidate in group {
                let paths = Set(candidate.relativePaths)
                let previous = previousMediaByPaths[paths]
                let mediaRecord = mediaRecord(
                    from: candidate,
                    previous: previous,
                    root: folderURL,
                    now: now,
                )
                mediaIDs[candidate.role] = mediaRecord.uuid
                groupMedia.append(mediaRecord)
                media.append(mediaRecord)
                if let previous {
                    seenPreviousMediaIDs.insert(previous.uuid)
                }
            }

            let candidatePreviousWorks = groupMedia.compactMap { previousWorkByMediaID[$0.uuid] }
            for previousWork in candidatePreviousWorks {
                seenPreviousWorkIDs.insert(previousWork.uuid)
            }
            let previousWork = candidatePreviousWorks.first {
                !claimedPreviousWorkIDs.contains($0.uuid)
            }
            if let previousWork {
                claimedPreviousWorkIDs.insert(previousWork.uuid)
            }
            works.append(
                workRecord(
                    from: group,
                    mediaIDs: mediaIDs,
                    previous: previousWork,
                )
            )
        }

        // An empty scan likely means the folder was briefly unreadable, not that every book was
        // deleted; retain prior state rather than wiping the library.
        if candidates.isEmpty {
            for previous in previousState.media where !seenPreviousMediaIDs.contains(previous.uuid)
            {
                var missing = previous
                missing.missing = true
                media.append(missing)
            }
            for previous in previousState.works where !seenPreviousWorkIDs.contains(previous.uuid) {
                works.append(previous)
            }
        }

        return FolderSourceLibraryState(
            sourceID: sourceRecordValue.id,
            works: works.sorted { $0.title.articleStrippedCompare($1.title) == .orderedAscending },
            media: media,
        )
    }

    private struct RawMediaFile {
        let url: URL
        let role: FolderSourceMediaRole
        let directory: String
        let stem: String
    }

    private func mediaCandidates(in root: URL) async -> [FolderMediaCandidate] {
        var filesByDirectory: [String: [RawMediaFile]] = [:]
        for url in regularFiles(in: root) {
            let ext = url.pathExtension.lowercased()
            let role: FolderSourceMediaRole
            if ext == "epub" {
                role =
                    mediaTypeSubfolderRole(for: relativeDirectory(for: url, root: root))
                    ?? (localLibrary.isReadaloudEpub(at: url) ? .readaloud : .ebook)
            } else if ext == "cbz" {
                role = .ebook
            } else if audiobookMediaExtensions.contains(ext) {
                role = .audio
            } else {
                continue
            }

            let location = groupingLocation(for: url, root: root)
            let stem =
                location.stem
                ?? nonEmpty(normalizedGroupingText(url.deletingPathExtension().lastPathComponent))
                ?? url.deletingPathExtension().lastPathComponent.lowercased()
            filesByDirectory[location.directory, default: []].append(
                RawMediaFile(url: url, role: role, directory: location.directory, stem: stem)
            )
        }

        var candidates: [FolderMediaCandidate] = []
        for (directory, files) in filesByDirectory {
            let stems = Set(files.map(\.stem))
            var byGroup: [String: [FolderSourceMediaRole: [URL]]] = [:]
            for file in files {
                let key = groupKey(for: file.stem, among: stems)
                byGroup[key, default: [:]][file.role, default: []].append(file.url)
            }

            for (key, urlsByRole) in byGroup {
                for (role, urls) in urlsByRole {
                    let grouped = role == .audio ? [sortedByName(urls)] : urls.map { [$0] }
                    for groupURLs in grouped {
                        let metadata = try? await localLibrary.extractMetadata(
                            from: groupURLs[0],
                            category: role.localMediaCategory,
                            sourceID: sourceRecordValue.id,
                        )
                        candidates.append(
                            FolderMediaCandidate(
                                role: role,
                                urls: groupURLs,
                                relativePaths: groupURLs.map { relativePath(for: $0, root: root) },
                                extractedMetadata: metadata.map(FolderSourceExtractedMetadata.init),
                                groupingDirectory: directory,
                                groupingStem: key,
                            )
                        )
                    }
                }
            }
        }

        return candidates
    }

    private func sortedByName(_ urls: [URL]) -> [URL] {
        urls.sorted {
            $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending
        }
    }

    private func groupKey(for stem: String, among stems: Set<String>) -> String {
        var best = stem
        for candidate in stems where candidate != stem {
            guard stem.hasPrefix("\(candidate) ") else { continue }
            if candidate.count < best.count
                || (candidate.count == best.count && candidate < best)
            {
                best = candidate
            }
        }
        return best
    }

    private func regularFiles(in root: URL) -> [URL] {
        guard
            let enumerator = FileManager.default.enumerator(
                at: root,
                includingPropertiesForKeys: [
                    .isRegularFileKey, .fileSizeKey, .contentModificationDateKey,
                ],
                options: [.skipsHiddenFiles, .skipsPackageDescendants],
            )
        else {
            return []
        }

        var urls: [URL] = []
        for case let url as URL in enumerator where isRegularFile(url) {
            urls.append(url)
        }
        return urls
    }

    private func groupedCandidates(_ candidates: [FolderMediaCandidate])
        -> [[FolderMediaCandidate]]
    {
        let byDirectory = Dictionary(grouping: candidates, by: \.groupingDirectory)
        var groups: [[FolderMediaCandidate]] = []
        for directoryCandidates in byDirectory.values {
            let byStem = Dictionary(grouping: directoryCandidates, by: \.groupingStem)
            for stemCandidates in byStem.values {
                let byRole = Dictionary(grouping: stemCandidates, by: \.role)
                var group: [FolderMediaCandidate] = []
                for role in FolderSourceMediaRole.allCases {
                    guard let roleCandidates = byRole[role], !roleCandidates.isEmpty else {
                        continue
                    }
                    let ordered = roleCandidates.sorted {
                        ($0.relativePaths.first ?? "") < ($1.relativePaths.first ?? "")
                    }
                    group.append(ordered[0])
                    for extra in ordered.dropFirst() {
                        debugLog(
                            "[FolderSourceActor] Multiple \(role.rawValue) files share stem '\(extra.groupingStem)'; using '\(ordered[0].relativePaths.first ?? "")', ignoring '\(extra.relativePaths.first ?? "")'"
                        )
                    }
                }
                if !group.isEmpty {
                    groups.append(group)
                }
            }
        }
        return groups
    }

    private func mediaRecord(
        from candidate: FolderMediaCandidate,
        previous: FolderSourceMedia?,
        root: URL,
        now: String,
    ) -> FolderSourceMedia {
        var record =
            previous
            ?? FolderSourceMedia(
                role: candidate.role,
                relativePaths: candidate.relativePaths,
                signature: signature(for: candidate.urls, root: root),
                firstSeenAt: now,
            )
        if Set(record.relativePaths) != Set(candidate.relativePaths) {
            record.previousRelativePaths.append(contentsOf: record.relativePaths)
        }
        record.role = candidate.role
        record.relativePaths = candidate.relativePaths
        record.signature = signature(for: candidate.urls, root: root)
        record.extractedMetadata = candidate.extractedMetadata
        record.missing = false
        record.lastSeenAt = now
        return record
    }

    private func workRecord(
        from candidates: [FolderMediaCandidate],
        mediaIDs: [FolderSourceMediaRole: String],
        previous: FolderSourceWork?,
    ) -> FolderSourceWork {
        let preferredMetadata =
            candidates.first(where: { $0.role == .ebook })?.extractedMetadata
            ?? candidates.first(where: { $0.role == .readaloud })?.extractedMetadata
            ?? candidates.first?.extractedMetadata
        let title =
            nonEmpty(preferredMetadata?.title)
            ?? titleFromGroupingStem(candidates.first?.groupingStem)
            ?? candidates.first?.urls.first?.deletingPathExtension().lastPathComponent
            ?? "Untitled Book"
        return FolderSourceWork(
            uuid: previous?.uuid ?? UUID().uuidString,
            title: title,
            subtitle: preferredMetadata?.subtitle,
            description: preferredMetadata?.description,
            language: preferredMetadata?.language,
            createdAt: previous?.createdAt ?? preferredMetadata?.createdAt,
            updatedAt: preferredMetadata?.updatedAt ?? previous?.updatedAt,
            publicationDate: preferredMetadata?.publicationDate,
            authors: preferredMetadata?.authors,
            narrators: preferredMetadata?.narrators,
            creators: preferredMetadata?.creators,
            series: preferredMetadata?.series,
            tags: preferredMetadata?.tags,
            collections: preferredMetadata?.collections,
            status: previous?.status ?? preferredMetadata?.status,
            position: previous?.position ?? preferredMetadata?.position,
            rating: previous?.rating ?? preferredMetadata?.rating,
            mediaIDs: mediaIDs,
            groupingKey:
                "\(candidates.first?.groupingDirectory ?? "")/\(candidates.first?.groupingStem ?? "")",
            groupingReason: "Grouped by matching folder and filename prefix",
        )
    }

    private func projectLibrary(
        from state: FolderSourceLibraryState,
        folderURL: URL,
    ) -> LocalLibraryManager.ScanResult {
        let mediaByID = Dictionary(
            state.media.map { ($0.uuid, $0) },
            uniquingKeysWith: { a, _ in a },
        )
        var metadata: [BookMetadata] = []
        var paths: [String: MediaPaths] = [:]
        var emittedWorkIDs: Set<String> = []

        for work in state.works {
            guard emittedWorkIDs.insert(work.uuid).inserted else {
                debugLog(
                    "[FolderSourceActor] Duplicate work id '\(work.uuid)' (\(work.title)); skipping the duplicate in projection"
                )
                continue
            }
            let ebook = mediaByID[work.mediaIDs[.ebook] ?? ""]
            let readaloud = mediaByID[work.mediaIDs[.readaloud] ?? ""]
            let audio = mediaByID[work.mediaIDs[.audio] ?? ""]
            let book = BookMetadata(
                bookID: BookID(sourceID: sourceRecordValue.id, uuid: work.uuid),
                title: work.title,
                subtitle: work.subtitle,
                description: work.description,
                language: work.language,
                createdAt: work.createdAt,
                updatedAt: work.updatedAt,
                publicationDate: work.publicationDate,
                authors: work.authors,
                narrators: work.narrators,
                creators: work.creators,
                series: work.series,
                tags: work.tags,
                collections: work.collections,
                ebook: bookAsset(for: ebook, workID: work.uuid),
                audiobook: bookAsset(for: audio, workID: work.uuid),
                readaloud: bookReadaloud(for: readaloud, workID: work.uuid),
                status: work.status,
                position: work.position,
                rating: work.rating,
                source: sourceRecordValue.name,
            )
            metadata.append(book)

            var mediaPaths = MediaPaths()
            if let ebook, !ebook.missing, let relativePath = ebook.relativePaths.first {
                mediaPaths.ebookPath = folderURL.appendingPathComponent(relativePath)
            }
            if let readaloud, !readaloud.missing, let relativePath = readaloud.relativePaths.first {
                mediaPaths.syncedPath = folderURL.appendingPathComponent(relativePath)
            }
            if let audio, !audio.missing, let relativePath = audio.relativePaths.first {
                mediaPaths.audioPath = folderURL.appendingPathComponent(relativePath)
            }
            if mediaPaths.ebookPath != nil || mediaPaths.audioPath != nil
                || mediaPaths.syncedPath != nil
            {
                paths[work.uuid] = mediaPaths
            }
        }

        return LocalLibraryManager.ScanResult(metadata: metadata, paths: paths)
    }

    private func derivedAudiobookManifest(for bookID: String, folderURL: URL) async throws -> URL {
        if stateCache == nil {
            _ = try await scanLibrary(in: folderURL)
        }
        guard
            let state = stateCache,
            let work = state.works.first(where: { $0.uuid == bookID }),
            let mediaID = work.mediaIDs[.audio],
            let media = state.media.first(where: { $0.uuid == mediaID }),
            !media.missing
        else {
            throw LocalMediaError.missingAudiobookManifest
        }

        let audioFiles = media.relativePaths.map {
            folderURL.appendingPathComponent($0)
        }.filter {
            FileManager.default.fileExists(atPath: $0.path)
        }
        guard !audioFiles.isEmpty else {
            throw LocalMediaError.missingAudiobookManifest
        }

        let manifestDirectory = await filesystem.folderSourceDerivedAudiobookDirectory(
            sourceID: sourceRecordValue.id,
            bookID: bookID,
        )
        try await filesystem.ensureDirectoryExists(at: manifestDirectory)
        let manifestURL = manifestDirectory.appendingPathComponent(
            "manifest.json",
            isDirectory: false,
        )
        let manifestData = try await audiobookManifestData(
            title: work.title,
            audioFiles: audioFiles,
            href: { $0.absoluteString },
        )
        try manifestData.write(to: manifestURL, options: .atomic)
        return manifestURL
    }

    private func previousWorkLookup(_ state: FolderSourceLibraryState)
        -> [String: FolderSourceWork]
    {
        var result: [String: FolderSourceWork] = [:]
        for work in state.works {
            for mediaID in work.mediaIDs.values {
                result[mediaID] = work
            }
        }
        return result
    }

    private func bookAsset(for media: FolderSourceMedia?, workID: String) -> BookAsset? {
        guard let media else { return nil }
        let extracted = media.extractedMetadata
        let extractedAsset =
            media.role == .audio ? extracted?.audiobook : extracted?.ebook
        return BookAsset(
            uuid: workID,
            filepath: media.relativePaths.first ?? "",
            missing: media.missing ? 1 : 0,
            isEpub2: extractedAsset?.isEpub2,
            isEpub3: extractedAsset?.isEpub3,
            pageCount: extractedAsset?.pageCount,
            duration: extractedAsset?.duration,
            fileSize: Int(media.signature.totalSize),
            createdAt: extractedAsset?.createdAt,
            updatedAt: extractedAsset?.updatedAt,
        )
    }

    private func bookReadaloud(for media: FolderSourceMedia?, workID: String) -> BookReadaloud? {
        guard let media else { return nil }
        let extracted = media.extractedMetadata?.readaloud
        return BookReadaloud(
            uuid: workID,
            filepath: media.relativePaths.first,
            missing: media.missing ? 1 : 0,
            status: extracted?.status ?? "aligned",
            currentStage: extracted?.currentStage,
            stageProgress: extracted?.stageProgress,
            queuePosition: extracted?.queuePosition,
            restartPending: extracted?.restartPending,
            pageCount: extracted?.pageCount,
            duration: extracted?.duration,
            fileSize: Int(media.signature.totalSize),
            createdAt: extracted?.createdAt,
            updatedAt: extracted?.updatedAt,
        )
    }

    private func signature(for urls: [URL], root: URL) -> FolderSourceMediaSignature {
        var totalSize: Int64 = 0
        var modifiedAt: [String: Double] = [:]
        for url in urls {
            guard
                let values = try? url.resourceValues(forKeys: [
                    .fileSizeKey, .contentModificationDateKey,
                ])
            else {
                continue
            }
            totalSize += Int64(values.fileSize ?? 0)
            modifiedAt[relativePath(for: url, root: root)] =
                values.contentModificationDate?.timeIntervalSince1970 ?? 0
        }
        return FolderSourceMediaSignature(
            fileCount: urls.count,
            totalSize: totalSize,
            modifiedAt: modifiedAt,
        )
    }

    private func relativePath(for url: URL, root: URL) -> String {
        let rootPath = root.standardizedFileURL.path
        let filePath = url.standardizedFileURL.path
        guard filePath.hasPrefix(rootPath) else { return url.lastPathComponent }
        let start = filePath.index(filePath.startIndex, offsetBy: rootPath.count)
        return String(filePath[start...]).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    private func relativeDirectory(for url: URL, root: URL) -> String {
        let path = relativePath(for: url.deletingLastPathComponent(), root: root)
        return path == "." ? "" : path
    }

    private func relativeDirectory(inRelativePath path: String) -> String? {
        let normalized = path.replacingOccurrences(of: "\\", with: "/")
        guard let range = normalized.range(of: "/", options: .backwards) else {
            return ""
        }
        return String(normalized[..<range.lowerBound])
    }

    private func groupingLocation(for url: URL, root: URL) -> (directory: String, stem: String?) {
        let directory = relativeDirectory(for: url, root: root)
        guard let parent = mediaTypeSubfolderParentDirectory(for: directory) else {
            return (directory, nil)
        }
        return (parent, mediaTypeSubfolderGroupingStem(for: parent))
    }

    private func mediaTypeSubfolderParentDirectory(for directory: String) -> String? {
        let normalized = directory.replacingOccurrences(of: "\\", with: "/")
        let parts = normalized.split(separator: "/", omittingEmptySubsequences: false).map(
            String.init
        )
        guard let last = parts.last?.lowercased(),
            ["audio", "ebook", "synced", "comic"].contains(last)
        else {
            return nil
        }
        let parent = parts.dropLast().joined(separator: "/")
        return parent.isEmpty ? nil : parent
    }

    private func mediaTypeSubfolderRole(for directory: String) -> FolderSourceMediaRole? {
        let normalized = directory.replacingOccurrences(of: "\\", with: "/")
        let last = normalized.split(separator: "/", omittingEmptySubsequences: false).last?
            .lowercased()
        switch last {
            case "ebook", "comic":
                return .ebook
            case "synced":
                return .readaloud
            case "audio":
                return .audio
            default:
                return nil
        }
    }

    private func mediaTypeSubfolderGroupingStem(for directory: String) -> String? {
        let stem = normalizedGroupingText(lastPathComponent(inRelativePath: directory))
        return stem.isEmpty ? nil : stem
    }

    private func lastPathComponent(inRelativePath path: String) -> String {
        let normalized = path.replacingOccurrences(of: "\\", with: "/")
        return normalized.split(separator: "/").last.map(String.init) ?? path
    }

    private func normalizedGroupingText(_ text: String) -> String {
        let roleWords = [
            "readaloud", "read aloud", "media overlay", "media overlays", "audiobook",
            "audio book", "ebook", "epub", "unabridged",
        ]
        var normalized = text.lowercased()
        for word in roleWords {
            normalized = normalized.replacingOccurrences(of: word, with: " ")
        }
        normalized = normalized.replacingOccurrences(
            of: #"[\W_]+"#,
            with: " ",
            options: .regularExpression,
        )
        normalized = normalized.replacingOccurrences(
            of: #"\b\d+\b$"#,
            with: "",
            options: .regularExpression,
        )
        return normalized.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func titleFromGroupingStem(_ stem: String?) -> String? {
        guard let stem = nonEmpty(stem) else { return nil }
        return stem.split(separator: " ").map { word in
            word.prefix(1).uppercased() + word.dropFirst()
        }.joined(separator: " ")
    }

    private func nonEmpty(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func isRegularFile(_ url: URL) -> Bool {
        (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
    }

    private func writePlacement(
        for bookID: String,
        root: URL,
    ) -> (layout: FolderSourceWriteLayout, baseDirectory: URL)? {
        let directories = mediaForWork(bookID: bookID).values
            .flatMap(\.relativePaths)
            .compactMap { relativeDirectory(inRelativePath: $0) }
        guard !directories.isEmpty else { return nil }

        if directories.contains(where: { mediaTypeSubfolderRole(for: $0) != nil }) {
            let base = directories.compactMap(mediaTypeSubfolderParentDirectory(for:)).first ?? ""
            return (.mediaTypeSubfolders, root.appendingPathComponent(base, isDirectory: true))
        }
        return (.sameFolder, root.appendingPathComponent(directories[0], isDirectory: true))
    }

    private func defaultWritePlacement(
        forNewBookTitled title: String,
        root: URL,
    ) -> (layout: FolderSourceWriteLayout, baseDirectory: URL) {
        let dirName = uniqueTopLevelDirectoryName(from: title, root: root)
        return (prevailingWriteLayout(), root.appendingPathComponent(dirName, isDirectory: true))
    }

    private func prevailingWriteLayout() -> FolderSourceWriteLayout {
        let directories = (stateCache?.media ?? [])
            .flatMap(\.relativePaths)
            .compactMap { relativeDirectory(inRelativePath: $0) }
        if directories.isEmpty {
            return .mediaTypeSubfolders
        }
        if directories.contains(where: { mediaTypeSubfolderRole(for: $0) != nil }) {
            return .mediaTypeSubfolders
        }
        return .sameFolder
    }

    private func uniqueTopLevelDirectoryName(from title: String, root: URL) -> String {
        let base = sanitizedDirectoryName(from: title)
        let fm = FileManager.default
        var candidate = base
        var index = 2
        while fm.fileExists(
            atPath: root.appendingPathComponent(candidate, isDirectory: true).path
        ) {
            candidate = "\(base) \(index)"
            index += 1
        }
        return candidate
    }

    private func sanitizedDirectoryName(from title: String) -> String {
        let illegal = CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
        let cleaned =
            title
            .components(separatedBy: illegal)
            .joined(separator: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "Untitled Book" : cleaned
    }

    private func destinationDirectory(
        for category: LocalMediaCategory,
        placement: (layout: FolderSourceWriteLayout, baseDirectory: URL),
    ) -> URL {
        switch placement.layout {
            case .mediaTypeSubfolders:
                return placement.baseDirectory.appendingPathComponent(
                    category.rawValue,
                    isDirectory: true,
                )
            case .sameFolder:
                return placement.baseDirectory
        }
    }

    private func mediaForWork(bookID: String) -> [FolderSourceMediaRole: FolderSourceMedia] {
        guard let state = stateCache,
            let work = state.works.first(where: { $0.uuid == bookID })
        else {
            return [:]
        }
        let mediaByID = Dictionary(uniqueKeysWithValues: state.media.map { ($0.uuid, $0) })
        var result: [FolderSourceMediaRole: FolderSourceMedia] = [:]
        for (role, mediaID) in work.mediaIDs {
            if let media = mediaByID[mediaID], !media.missing {
                result[role] = media
            }
        }
        return result
    }

    private func deleteExistingMedia(
        _ bookID: String,
        category: LocalMediaCategory,
        root: URL,
    ) throws {
        let role = mediaRole(for: category)
        guard let media = mediaForWork(bookID: bookID)[role] else {
            return
        }
        let fm = FileManager.default
        let urls = try media.relativePaths.map {
            try validatedMediaFileURL(forRelativePath: $0, root: root)
        }
        for url in urls where fm.fileExists(atPath: url.path) {
            try fm.removeItem(at: url)
        }
    }

    private func validatedMediaFileURL(forRelativePath path: String, root: URL) throws -> URL {
        let normalized = path.replacingOccurrences(of: "\\", with: "/")
        guard !normalized.isEmpty,
            !normalized.hasPrefix("/"),
            !normalized.split(separator: "/").contains("..")
        else {
            throw LocalMediaError.importFailed("Refusing unsafe media path \(path)")
        }

        let root = root.standardizedFileURL
        let url = root.appendingPathComponent(normalized, isDirectory: false).standardizedFileURL
        guard url.path.hasPrefix(root.path + "/") else {
            throw LocalMediaError.importFailed("Refusing media path outside source folder \(path)")
        }

        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
            isDirectory.boolValue
        {
            throw LocalMediaError.importFailed("Refusing to delete media directory \(path)")
        }

        return url
    }

    private func mediaRole(for category: LocalMediaCategory) -> FolderSourceMediaRole {
        switch category {
            case .ebook:
                return .ebook
            case .audio:
                return .audio
            case .synced:
                return .readaloud
        }
    }

    private func extractImportMetadata(
        from sourceFileURL: URL,
        category: LocalMediaCategory,
    ) async throws -> BookMetadata {
        guard category == .audio, sourceFileURL.hasDirectoryPath else {
            return try await localLibrary.extractMetadata(
                from: sourceFileURL,
                category: category,
                sourceID: sourceRecordValue.id,
            )
        }

        let bookUUID = UUID().uuidString
        return BookMetadata(
            bookID: BookID(sourceID: sourceRecordValue.id, uuid: bookUUID),
            title: sourceFileURL.lastPathComponent,
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
            ebook: nil,
            audiobook: BookAsset(
                uuid: bookUUID,
                filepath: "manifest.json",
                missing: 0,
                createdAt: nil,
                updatedAt: nil,
            ),
            readaloud: nil,
            status: nil,
            position: nil,
            rating: nil,
            source: sourceRecordValue.name,
        )
    }

    private func audiobookManifestData(
        title: String,
        audioFiles: [URL],
        href: (URL) -> String = { $0.lastPathComponent },
    ) async throws -> Data {
        var readingOrder: [[String: Any]] = []
        var totalDuration = 0.0
        for audioFile in audioFiles {
            var item: [String: Any] = [
                "href": href(audioFile),
                "type": mediaType(for: audioFile),
            ]
            if let duration = await audioDuration(for: audioFile) {
                item["duration"] = duration
                totalDuration += duration
            }
            readingOrder.append(item)
        }

        var metadata: [String: Any] = [
            "@type": "http://schema.org/Audiobook",
            "title": title,
        ]
        if totalDuration > 0 {
            metadata["duration"] = totalDuration
        }

        let manifest: [String: Any] = [
            "metadata": metadata,
            "links": [
                [
                    "rel": "self",
                    "href": "manifest.json",
                    "type": "application/audiobook+json",
                ]
            ],
            "readingOrder": readingOrder,
            "toc": readingOrder.enumerated().map { index, item in
                [
                    "href": "\(item["href"] ?? "")#t=0",
                    "title": audioFiles.count == 1 ? "Full Book" : "Track \(index + 1)",
                ]
            },
        ]

        let data = try JSONSerialization.data(
            withJSONObject: manifest,
            options: [.prettyPrinted, .sortedKeys],
        )
        return data
    }

    private func writeAsset(
        _ asset: StorytellerUploadAsset,
        to destinationDirectory: URL,
        usedFilenames: inout Set<String>,
    ) async throws -> URL {
        try await filesystem.ensureDirectoryExists(at: destinationDirectory)
        let destinationURL = uniqueAvailableFileURL(
            named: preferredFilename(for: asset),
            in: destinationDirectory,
            usedFilenames: &usedFilenames,
        )
        try asset.data.write(to: destinationURL, options: .atomic)
        return destinationURL
    }

    private func writeAsset(
        _ asset: StorytellerUploadAsset,
        to destinationDirectory: URL,
    ) async throws -> URL {
        var usedFilenames: Set<String> = []
        return try await writeAsset(asset, to: destinationDirectory, usedFilenames: &usedFilenames)
    }

    private func preferredFilename(for asset: StorytellerUploadAsset) -> String {
        let fallback = "\(asset.format.rawValue).\(defaultExtension(for: asset))"
        let filename = asset.filename.isEmpty ? fallback : asset.filename
        let lastPathComponent = URL(fileURLWithPath: filename).lastPathComponent
        return lastPathComponent.isEmpty ? fallback : lastPathComponent
    }

    private func renamed(
        _ asset: StorytellerUploadAsset,
        to filename: String,
    ) -> StorytellerUploadAsset {
        StorytellerUploadAsset(
            format: asset.format,
            filename: filename,
            data: asset.data,
            contentType: asset.contentType,
            relativePath: asset.relativePath,
        )
    }

    private func fileExtension(for asset: StorytellerUploadAsset) -> String {
        let ext = URL(fileURLWithPath: preferredFilename(for: asset)).pathExtension
        return ext.isEmpty ? defaultExtension(for: asset) : ext
    }

    /// Filename stem for a new book's assets. Some callers derive the title from an asset's
    /// filename, so a trailing media extension is stripped to avoid names like "Book.epub.epub".
    private func assetFilenameStem(forNewBookTitled title: String) -> String {
        let sanitized = sanitizedDirectoryName(from: title)
        let url = URL(fileURLWithPath: sanitized)
        let ext = url.pathExtension.lowercased()
        guard ext == "epub" || ext == "cbz" || audiobookMediaExtensions.contains(ext) else {
            return sanitized
        }
        return nonEmpty(url.deletingPathExtension().lastPathComponent) ?? sanitized
    }

    /// Filename stem shared by a book's files already on disk, so newly written assets join the
    /// same scan group instead of introducing a second stem.
    private func existingAssetFilenameStem(forBook bookID: String) -> String? {
        let media = mediaForWork(bookID: bookID)
        let preferred = media[.ebook] ?? media[.readaloud] ?? media[.audio]
        guard let path = preferred?.relativePaths.first else { return nil }
        return nonEmpty(URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent)
    }

    private func uniqueAvailableFileURL(
        named filename: String,
        in directory: URL,
        usedFilenames: inout Set<String>,
    ) -> URL {
        let url = URL(fileURLWithPath: filename)
        let basename = url.deletingPathExtension().lastPathComponent
        let pathExtension = url.pathExtension
        var candidate = filename
        var index = 2
        while usedFilenames.contains(candidate)
            || FileManager.default.fileExists(
                atPath: directory.appendingPathComponent(candidate, isDirectory: false).path
            )
        {
            candidate =
                pathExtension.isEmpty
                ? "\(basename) \(index)"
                : "\(basename) \(index).\(pathExtension)"
            index += 1
        }
        usedFilenames.insert(candidate)
        return directory.appendingPathComponent(candidate, isDirectory: false)
    }

    private func localMediaCategory(for format: StorytellerBookFormat) -> LocalMediaCategory {
        switch format {
            case .ebook:
                return .ebook
            case .audiobook:
                return .audio
            case .readaloud:
                return .synced
        }
    }

    private func defaultExtension(for asset: StorytellerUploadAsset) -> String {
        switch asset.format {
            case .ebook, .readaloud:
                return "epub"
            case .audiobook:
                return asset.contentType == "audio/mp4" ? "m4b" : "mp3"
        }
    }

    private var audiobookMediaExtensions: Set<String> {
        AudioMediaTypes.fileExtensions
    }

    private func mediaType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
            case "aac":
                return "audio/aac"
            case "flac":
                return "audio/flac"
            case "m4a", "m4b":
                return "audio/mp4"
            case "mp3":
                return "audio/mpeg"
            case "ogg", "opus":
                return "audio/ogg"
            case "wav":
                return "audio/wav"
            default:
                return "application/octet-stream"
        }
    }

    private func audioDuration(for url: URL) async -> Double? {
        #if canImport(AVFoundation)
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration) else { return nil }
        let seconds = CMTimeGetSeconds(duration)
        return seconds.isFinite && seconds > 0 ? seconds : nil
        #else
        return nil
        #endif
    }

    private func savedMetadataByUUID(_ metadata: [BookMetadata]) -> [String: BookMetadata] {
        var savedByUUID: [String: BookMetadata] = [:]
        for saved in metadata {
            if savedByUUID[saved.uuid] != nil {
                debugLog(
                    "[FolderSourceActor] Duplicate saved metadata UUID \(saved.uuid) in \(sourceRecordValue.name)"
                )
                continue
            }
            savedByUUID[saved.uuid] = saved
        }
        return savedByUUID
    }

    private func mergeSavedState(
        into scanned: BookMetadata,
        saved: BookMetadata?,
    ) -> BookMetadata {
        guard let saved else { return scanned }
        return metadata(
            scanned,
            status: saved.status,
            position: saved.position,
        )
    }

    private func logDuplicateFolderUUIDs(_ metadata: [BookMetadata], folderURL: URL) {
        var seen: Set<String> = []
        var duplicates: Set<String> = []
        for book in metadata {
            if seen.contains(book.uuid) {
                duplicates.insert(book.uuid)
            } else {
                seen.insert(book.uuid)
            }
        }
        guard !duplicates.isEmpty else { return }
        debugLog(
            "[FolderSourceActor] Duplicate book UUIDs in folder source \(sourceRecordValue.name) at \(folderURL.path): \(duplicates.sorted().joined(separator: ", "))"
        )
    }

    private func updateBookProgress(
        bookId: String,
        locator: BookLocator,
        timestamp: Double,
    ) async throws {
        let resolved = try await resolvedFolderURL()
        defer { stopAccessing(resolved) }

        if metadataCache.isEmpty {
            _ = try await scanLibrary(in: resolved.url)
        }

        var state = try await savedState(in: resolved.url)
        guard let latestIndex = state.works.firstIndex(where: { $0.uuid == bookId }) else {
            return
        }
        let latest = state.works[latestIndex]
        let latestTimestamp = latest.position?.timestamp ?? 0
        guard timestamp > latestTimestamp else { return }

        let updatedAtString = Date(timeIntervalSince1970: timestamp / 1000).ISO8601Format()
        let newPosition = BookReadingPosition(
            uuid: latest.position?.uuid,
            locator: locator,
            timestamp: timestamp,
            createdAt: latest.position?.createdAt,
            updatedAt: updatedAtString,
        )
        state.works[latestIndex].position = newPosition
        stateCache = state
        let projected = projectLibrary(from: state, folderURL: resolved.url)
        metadataCache = projected.metadata
        pathCache = projected.paths
        try await filesystem.saveFolderSourceLibraryState(state, in: resolved.url)
    }

    private func removeMetadata(bookID: String) async throws {
        let resolved = try await resolvedFolderURL()
        defer { stopAccessing(resolved) }

        var state = try await savedState(in: resolved.url)
        guard let work = state.works.first(where: { $0.uuid == bookID }) else { return }
        let mediaIDs = Set(work.mediaIDs.values)
        state.works.removeAll { $0.uuid == bookID }
        state.media.removeAll { mediaIDs.contains($0.uuid) }
        try await filesystem.saveFolderSourceLibraryState(state, in: resolved.url)
        stateCache = state
        let projected = projectLibrary(from: state, folderURL: resolved.url)
        metadataCache = projected.metadata
        pathCache = projected.paths
    }

    private func extractCover(for bookID: String) async -> Data? {
        if pathCache[bookID] == nil {
            _ = await fetchLibraryInformation()
        }
        guard let paths = pathCache[bookID] else { return nil }

        if let ebookPath = paths.ebookPath {
            let data =
                ebookPath.pathExtension.lowercased() == "cbz"
                ? localLibrary.extractCoverFromComicArchive(at: ebookPath)
                : localLibrary.extractCoverFromEpub(at: ebookPath)
            if let data {
                return data
            }
        }

        if let syncedPath = paths.syncedPath,
            let data = localLibrary.extractCoverFromEpub(at: syncedPath)
        {
            return data
        }

        if let audioPath = paths.audioPath,
            let data = await localLibrary.extractCoverFromAudiobook(at: audioPath)
        {
            return data
        }

        return nil
    }

    private func resolvedFolderURL() async throws -> (
        url: URL,
        didStartAccessing: Bool
    ) {
        if let resolved = bookmarkedFolderURL() {
            try await filesystem.ensureDirectoryExists(at: resolved.url)
            return resolved
        }

        if let storagePath = sourceRecordValue.storagePath, !storagePath.isEmpty {
            // A folder source whose location lives inside our app-support container is
            // stored as an absolute path, but the container moves when iOS changes the
            // app's data UUID between builds. Rebase such paths onto the current container
            // so the library still resolves; genuinely external folders pass through
            // unchanged.
            let stored = URL(fileURLWithPath: storagePath, isDirectory: true)
            let url = await filesystem.rebasedContainerFolderURL(for: stored)
            try await filesystem.ensureDirectoryExists(at: url)
            return (url, false)
        }

        throw LocalMediaError.importFailed("Folder source has no storage location")
    }

    private func bookmarkedFolderURL() -> (
        url: URL,
        didStartAccessing: Bool
    )? {
        #if os(macOS)
        if let bookmarkData = sourceRecordValue.storageBookmarkData {
            var stale = false
            if let url = try? URL(
                resolvingBookmarkData: bookmarkData,
                options: [.withSecurityScope],
                relativeTo: nil,
                bookmarkDataIsStale: &stale,
            ) {
                let didStartAccessing = url.startAccessingSecurityScopedResource()
                return (url, didStartAccessing)
            }
        }
        #elseif os(iOS)
        if let bookmarkData = sourceRecordValue.storageBookmarkData {
            var stale = false
            if let url = try? URL(
                resolvingBookmarkData: bookmarkData,
                options: [],
                relativeTo: nil,
                bookmarkDataIsStale: &stale,
            ) {
                let didStartAccessing = url.startAccessingSecurityScopedResource()
                return (url, didStartAccessing)
            }
        }
        #endif

        return nil
    }

    private func stopAccessing(_ resolved: (url: URL, didStartAccessing: Bool)) {
        if resolved.didStartAccessing {
            #if canImport(Darwin)
            resolved.url.stopAccessingSecurityScopedResource()
            #endif
        }
    }

    private func metadata(
        _ existing: BookMetadata,
        status: BookStatus? = nil,
        position: BookReadingPosition? = nil,
    ) -> BookMetadata {
        BookMetadata(
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
            status: status ?? existing.status,
            position: position ?? existing.position,
            rating: existing.rating,
            pageCount: existing.pageCount,
            duration: existing.duration,
            alignedAt: existing.alignedAt,
            alignedByStorytellerVersion: existing.alignedByStorytellerVersion,
            alignedWith: existing.alignedWith,
            source: sourceRecordValue.name,
        )
    }

    private func mergedBookMetadata(
        scanned: BookMetadata,
        saved: BookMetadata,
        position: BookReadingPosition? = nil,
    ) -> BookMetadata {
        BookMetadata(
            bookID: BookID(sourceID: sourceRecordValue.id, uuid: saved.uuid),
            title: scanned.title,
            subtitle: scanned.subtitle,
            description: scanned.description,
            language: scanned.language,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
            publicationDate: scanned.publicationDate,
            authors: scanned.authors,
            narrators: scanned.narrators,
            creators: scanned.creators,
            series: scanned.series,
            tags: scanned.tags,
            collections: scanned.collections,
            ebook: scanned.ebook.map { asset in
                BookAsset(
                    uuid: saved.uuid,
                    filepath: asset.filepath,
                    missing: asset.missing,
                    createdAt: asset.createdAt,
                    updatedAt: asset.updatedAt,
                )
            },
            audiobook: scanned.audiobook.map { asset in
                BookAsset(
                    uuid: saved.uuid,
                    filepath: asset.filepath,
                    missing: asset.missing,
                    createdAt: asset.createdAt,
                    updatedAt: asset.updatedAt,
                )
            },
            readaloud: scanned.readaloud.map { asset in
                BookReadaloud(
                    uuid: saved.uuid,
                    filepath: asset.filepath,
                    missing: asset.missing,
                    status: asset.status,
                    currentStage: asset.currentStage,
                    stageProgress: asset.stageProgress,
                    queuePosition: asset.queuePosition,
                    restartPending: asset.restartPending,
                    createdAt: asset.createdAt,
                    updatedAt: asset.updatedAt,
                )
            },
            status: saved.status,
            position: position ?? saved.position,
            rating: saved.rating,
            pageCount: scanned.pageCount ?? saved.pageCount,
            duration: scanned.duration ?? saved.duration,
            alignedAt: scanned.alignedAt ?? saved.alignedAt,
            alignedByStorytellerVersion: scanned.alignedByStorytellerVersion
                ?? saved.alignedByStorytellerVersion,
            alignedWith: scanned.alignedWith ?? saved.alignedWith,
            source: sourceRecordValue.name,
        )
    }
}
