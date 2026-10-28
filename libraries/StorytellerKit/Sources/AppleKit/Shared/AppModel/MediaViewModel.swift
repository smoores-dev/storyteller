import Foundation
import ImageIO
import Observation
import StorytellerAppleWidgets
import StorytellerKit
import SwiftUI

#if canImport(AppKit)
import AppKit
#endif
#if canImport(UIKit)
import UIKit
#endif

private actor CoverLoadLimiter {
    private struct Waiter {
        let id: UUID
        let continuation: CheckedContinuation<Bool, Never>
    }

    private let limit: Int
    private var activeCount = 0
    private var waiters: [Waiter] = []

    init(limit: Int) {
        self.limit = max(limit, 1)
    }

    func acquire() async -> Bool {
        if Task.isCancelled { return false }
        if activeCount < limit {
            activeCount += 1
            return true
        }
        let id = UUID()
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                waiters.append(Waiter(id: id, continuation: continuation))
            }
        } onCancel: {
            Task {
                await self.cancelWaiter(id)
            }
        }
    }

    private func cancelWaiter(_ id: UUID) {
        guard let index = waiters.firstIndex(where: { $0.id == id }) else {
            return
        }
        let waiter = waiters.remove(at: index)
        waiter.continuation.resume(returning: false)
    }

    func release() {
        if waiters.isEmpty {
            activeCount = max(activeCount - 1, 0)
        } else {
            let waiter = waiters.removeLast()
            waiter.continuation.resume(returning: true)
        }
    }
}

private final class SendableCGImage: @unchecked Sendable {
    let image: CGImage

    init(_ image: CGImage) {
        self.image = image
    }
}

@MainActor
@Observable
public final class MediaViewModel {
    public struct LibraryRenderContext: Sendable {
        public let metadata: [BookMetadata]
        public let paths: [BookID: MediaPaths]
        public let folderSourceBookIds: Set<BookID>
        public let progress: [BookID: BookProgress]
        public let smartShelves: [SmartShelf]

        public init(
            metadata: [BookMetadata],
            paths: [BookID: MediaPaths],
            folderSourceBookIds: Set<BookID>,
            progress: [BookID: BookProgress],
            smartShelves: [SmartShelf],
        ) {
            self.metadata = metadata
            self.paths = paths
            self.folderSourceBookIds = folderSourceBookIds
            self.progress = progress
            self.smartShelves = smartShelves
        }
    }

    public var library: BookLibrary
    public var libraryVersion: Int = 0
    public var isReady: Bool = false
    public var connectionStatus: ConnectionStatus = .disconnected
    public var sourceConnectionInfos: [SourceConnectionInfo] = []
    public var availableStatuses: [BookStatus] = []
    public var availableStatusesBySourceID: [BookSourceID: [BookStatus]] = [:]
    public var lastNetworkOpSucceeded: Bool? = nil

    /// True when a network op failed or any Storyteller source is unreachable. Folder
    /// sources are local and never count as an issue. Used to drive the toolbar warning icon.
    public var hasServerConnectionIssue: Bool {
        if lastNetworkOpSucceeded == false { return true }
        if case .error = connectionStatus { return true }
        return sourceConnectionInfos.contains { info in
            guard info.kind == .storyteller else { return false }
            switch info.status {
                case .connected, .connecting: return false
                case .error, .disconnected: return true
            }
        }
    }

    public var connectionIssueIcon: String {
        "exclamationmark.triangle"
    }

    /// Connectivity for a single source, read from the cached `sourceConnectionInfos` so
    /// per-book download buttons don't each hit the actor. Falls back to the global status
    /// when the source isn't in the cache yet.
    public func connectionStatus(forSourceID sourceID: BookSourceID) -> ConnectionStatus {
        guard let info = sourceConnectionInfos.first(where: { $0.id == sourceID }) else {
            return connectionStatus
        }
        return info.status
    }

    /// True only when the book's own source can't currently download. A failure on a
    /// different source must not disable this book's buttons. Folder sources are local and
    /// never count as an error.
    public func hasConnectionError(forSourceID sourceID: BookSourceID) -> Bool {
        guard let info = sourceConnectionInfos.first(where: { $0.id == sourceID }) else {
            if lastNetworkOpSucceeded == false { return true }
            if case .error = connectionStatus { return true }
            return false
        }
        guard info.kind == .storyteller else { return false }
        if info.lastNetworkOpSucceeded == false { return true }
        if case .error = info.status { return true }
        return false
    }

    /// Sources the Copy To menu should offer for this book: excludes the book's own source,
    /// destinations that can't store its formats, and servers where the user may not upload.
    public func copyDestinations(for book: BookMetadata) -> [BookSourceRecord] {
        CopyDestinations.destinations(
            for: book,
            sources: bookSources,
            uploadPermittedSourceIDs: uploadPermittedSourceIDs,
        )
    }

    public var cachedConfig: StorytellerGlobalConfig = StorytellerGlobalConfig()
    public var pendingSyncsByBook: [BookID: PendingProgressSync] = [:]
    public var syncNotification: SyncNotification?
    public var smartShelves: [SmartShelf] = []
    public var libraryViewSnapshot = LibraryViewSnapshot()
    public var bookSources: [BookSourceRecord] = []
    public var uploadPermittedSourceIDs: Set<BookSourceID> = []
    @ObservationIgnored private var uploadPermissionTask: Task<Void, Never>?
    var bookProgressCache: [BookID: BookProgress] = [:]
    @ObservationIgnored private var readBookIds: Set<BookID> = []

    @ObservationIgnored private let libraryDerivationActor = LibraryDerivationActor()
    @ObservationIgnored private var libraryDerivationTask: Task<Void, Never>?
    @ObservationIgnored private var libraryDerivationGeneration = 0
    @ObservationIgnored private var visibleSidebarContents: [SidebarContentKind] = []
    @ObservationIgnored private var libraryPresentations: Set<UUID> = []
    @ObservationIgnored private var smartShelfBooksCache: [UUID: [BookMetadata]] = [:]

    @ObservationIgnored private var downloadManagerObserverId: UUID?
    @ObservationIgnored private var cachedMediaObserverId: UUID?
    @ObservationIgnored private var availableStatusLoadTasks: [BookSourceID: Task<Void, Never>] =
        [:]
    var downloadStatuses: [BookID: DownloadProgressState] = [:]
    private var incompleteDownloadCount: Int = 0
    private var cachedBookPaths: [BookID: MediaPaths] = [:]
    private var removableCachedBookPaths: [BookID: MediaPaths] = [:]
    private var folderSourceBookIds: Set<BookID> = []
    private var storytellerBookIds: Set<BookID> = []
    // Deep-link target (e.g. from a widget tap) waiting for the library to be ready.
    // Consumed and cleared by the first open attempt.
    public var pendingOpenBookID: BookID?
    // Deep-link target that should show book details in the library UI.
    // macOS has no standalone details screen, so the grid's info sidebar
    // consumes this; LibraryView navigates to a grid if none is on screen.
    public var pendingInfoBookID: BookID?
    @ObservationIgnored private var widgetSnapshotPublishTask: Task<Void, Never>?
    @ObservationIgnored private let usesInjectedLibrary: Bool
    @ObservationIgnored private var hasStarted = false

    private var sourceNamesByID: [BookSourceID: String] {
        Dictionary(uniqueKeysWithValues: bookSources.map { ($0.id, $0.name) })
    }

    public struct DownloadProgressState: Equatable {
        public struct CategoryState: Equatable {
            public var expected: Int64?
            public var latestReceived: Int64 = 0
            public var isFinished: Bool = false
            public var wasSkipped: Bool = false
            public var isFailed: Bool = false

            public var progressFraction: Double? {
                guard let expected, expected > 0 else { return nil }
                return min(max(Double(latestReceived) / Double(expected), 0), 1)
            }

            public var isActive: Bool {
                !isFinished && !wasSkipped
            }
        }

        public var categories: [LocalMediaCategory: CategoryState] = [:]
        public var errorDescription: String?

        public var totalReceived: Int64 {
            categories.values.reduce(0) { $0 + $1.latestReceived }
        }

        public var totalExpected: Int64? {
            guard !categories.isEmpty else { return nil }
            var sum: Int64 = 0
            for state in categories.values {
                guard let expected = state.expected else { return nil }
                sum += expected
            }
            return sum
        }

        public var progressFraction: Double? {
            guard let totalExpected = totalExpected, totalExpected > 0 else { return nil }
            return min(max(Double(totalReceived) / Double(totalExpected), 0), 1)
        }

        public var isActive: Bool {
            categories.values.contains { $0.isActive }
        }

        public var isCompleted: Bool {
            !categories.isEmpty && categories.values.allSatisfy { $0.isFinished || $0.wasSkipped }
        }

        public var hasError: Bool { errorDescription != nil }
    }

    public enum CoverVariant: Hashable, Sendable {
        case standard
        case audioSquare

        public var requestParameters: (audio: Bool, width: Int, height: Int) {
            switch self {
                case .standard:
                    return (audio: false, width: 209, height: 320)
                case .audioSquare:
                    return (audio: true, width: 209, height: 209)
            }
        }

        public var preferredAspectRatio: CGFloat {
            switch self {
                case .standard:
                    return 2.0 / 3.0
                case .audioSquare:
                    return 1.0
            }
        }
    }

    private struct CoverKey: Hashable, Sendable {
        let id: BookID
        let variant: CoverVariant
    }

    private struct CoverImagePayload: Sendable {
        let data: Data
        let cgImage: SendableCGImage
    }

    private enum CoverLoadResult: Sendable {
        case found(CoverImagePayload, persist: Bool)
        case missing
        case skipped

        var debugDescription: String {
            switch self {
                case .found(_, let persist):
                    return "found(persist:\(persist))"
                case .missing:
                    return "missing"
                case .skipped:
                    return "skipped"
            }
        }
    }

    private struct PendingCoverPublish {
        let item: BookMetadata
        let variant: CoverVariant
        let result: CoverLoadResult
        let debugSource: String?
    }

    private struct PendingCoverRequest {
        let item: BookMetadata
        let variant: CoverVariant
        let debugSource: String?
        let sequence: Int
    }

    @MainActor
    @Observable
    public final class CoverImageState {
        public var image: Image?
        public var cgImage: CGImage?
        #if canImport(AppKit)
        public var nsImage: NSImage?
        #endif
        public init(image: Image? = nil) { self.image = image }
    }

    @ObservationIgnored private var coverStates: [CoverKey: CoverImageState] = [:]
    private var missingCoverKeys: Set<CoverKey> = []
    @ObservationIgnored private var skippedCoverRetries:
        [CoverKey: (item: BookMetadata, variant: CoverVariant)] = [:]
    @ObservationIgnored private var coverTasks: [CoverKey: Task<Void, Never>] = [:]
    @ObservationIgnored private var uncancellableCoverKeys: Set<CoverKey> = []
    @ObservationIgnored private let coverLoadLimiter = CoverLoadLimiter(limit: 12)
    @ObservationIgnored private var pendingCoverRequests: [CoverKey: PendingCoverRequest] = [:]
    @ObservationIgnored private var coverRequestFlushTask: Task<Void, Never>?
    @ObservationIgnored private var coverRequestSequence = 0
    @ObservationIgnored private var pendingCoverPublishes: [CoverKey: PendingCoverPublish] = [:]
    @ObservationIgnored private var coverPublishFlushTask: Task<Void, Never>?
    @ObservationIgnored private var coverTraceCounts: [String: Int] = [:]
    @ObservationIgnored private var coverTraceFlushTask: Task<Void, Never>?
    @ObservationIgnored private var seriesGroupsCache:
        [MediaKind: (version: Int, groups: [(series: BookSeries?, books: [BookMetadata])])] = [:]
    @ObservationIgnored private var authorGroupsCache:
        [MediaKind: (version: Int, groups: [(author: BookCreator?, books: [BookMetadata])])] = [:]
    @ObservationIgnored private var collectionGroupsCache:
        [MediaKind: (
            version: Int, groups: [(collection: BookCollectionSummary?, books: [BookMetadata])]
        )] = [:]
    @ObservationIgnored private var narratorGroupsCache:
        [MediaKind: (version: Int, groups: [(narrator: BookCreator?, books: [BookMetadata])])] = [:]
    @ObservationIgnored private var translatorGroupsCache:
        [MediaKind: (version: Int, groups: [(translator: BookCreator?, books: [BookMetadata])])] =
            [:]
    @ObservationIgnored private var publicationYearGroupsCache:
        [MediaKind: (version: Int, groups: [(year: String, books: [BookMetadata])])] = [:]
    @ObservationIgnored private var tagGroupsCache:
        [MediaKind: (version: Int, groups: [(tag: String, books: [BookMetadata])])] = [:]
    @ObservationIgnored private var ratingGroupsCache:
        [MediaKind: (version: Int, groups: [(rating: String, books: [BookMetadata])])] = [:]
    @ObservationIgnored private var statusGroupsCache:
        [MediaKind: (version: Int, groups: [(status: String, books: [BookMetadata])])] = [:]
    @ObservationIgnored private var sourceGroupsCache:
        [MediaKind: (version: Int, groups: [(source: String, books: [BookMetadata])])] = [:]

    public init(
        injectLibrary: BookLibrary? = nil
    ) {
        #if os(iOS) || os(macOS)
        _ = CoverColorBackfill.shared
        #endif
        usesInjectedLibrary = injectLibrary != nil
        if let injectLibrary = injectLibrary {
            self.library = injectLibrary
        } else {
            self.library = BookLibrary(
                bookMetaData: [],
                ebookCoverCache: [:],
                audiobookCoverCache: [:],
            )
        }
    }

    public func start() async {
        guard !usesInjectedLibrary, !hasStarted else { return }
        hasStarted = true

        await ProgressSyncActor.shared.registerSyncNotificationCallback {
            @MainActor [weak self] synced, failedBookIDs in
            guard let self else { return }
            if synced > 0 {
                let message =
                    synced == 1
                    ? "Synced reading progress for 1 book"
                    : "Synced reading progress for \(synced) books"
                self.showSyncNotification(
                    SyncNotification(message: message, type: .success)
                )
            } else if !failedBookIDs.isEmpty {
                let bookNames = failedBookIDs.compactMap { bookID in
                    self.library.bookMetaData.first { $0.id == bookID }?.title
                }
                let message =
                    bookNames.isEmpty
                    ? "Failed to sync \(failedBookIDs.count) book(s)"
                    : "Failed to sync: \(bookNames.joined(separator: ", "))"
                self.showSyncNotification(
                    SyncNotification(
                        message: message,
                        type: .error,
                        failedBookIDs: failedBookIDs,
                    )
                )
            }
        }

        connectionStatus = await BookServiceActor.shared.connectionStatus
        sourceConnectionInfos = await BookServiceActor.shared.sourceConnectionInfos()

        await BookServiceActor.shared.request_notify { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let status = await BookServiceActor.shared.connectionStatus
                let networkOp = await BookServiceActor.shared.lastNetworkOpSucceeded
                self.connectionStatus = status
                self.lastNetworkOpSucceeded = networkOp
                self.sourceConnectionInfos =
                    await BookServiceActor.shared.sourceConnectionInfos()
                debugLogVerbose(
                    "[MediaViewModel] StorytellerActor notify: connectionStatus=\(status), lastNetworkOpSucceeded=\(String(describing: networkOp))"
                )
                if status == .connected {
                    let statuses = await BookServiceActor.shared.getAvailableStatuses()
                    if statuses != self.availableStatuses {
                        self.availableStatuses = statuses
                    }
                    self.refreshAvailableStatusCaches(
                        for: self.library.bookMetaData,
                        retryEmpty: true,
                    )
                    self.retrySkippedCoverLoads()
                }
            }
        }
        await setupSettingsSync()
        await setupPathCacheSync()
        #if os(iOS) || os(macOS)
        await publishWidgetSnapshot()
        observeWidgetPlayback()
        #endif
        await setupDownloadManagerObserver()
    }

    private func setupDownloadManagerObserver() async {
        let id = await DownloadManager.shared.addObserver { [weak self] records in
            Task { @MainActor [weak self] in
                self?.applyDownloadRecords(records)
            }
        }
        let initialRecords = await DownloadManager.shared.incompleteDownloads
        downloadManagerObserverId = id
        applyDownloadRecords(initialRecords)
    }

    private func applyDownloadRecords(_ records: [DownloadRecord]) {
        var statuses: [BookID: DownloadProgressState] = [:]
        for record in records {
            var state = statuses[record.bookID] ?? DownloadProgressState()
            var catState = DownloadProgressState.CategoryState()
            catState.expected = record.expectedBytes
            catState.latestReceived = record.receivedBytes

            switch record.state {
                case .completed:
                    catState.isFinished = true
                case .failed(let error, _):
                    catState.isFinished = true
                    catState.isFailed = true
                    state.errorDescription = error
                case .queued, .downloading, .importing:
                    catState.isFinished = false
                case .paused:
                    catState.isFinished = false
                    catState.isFailed = true
            }

            state.categories[record.category] = catState
            statuses[record.bookID] = state
        }
        downloadStatuses = statuses

        #if os(iOS)
        let transferring = records.contains { record in
            switch record.state {
                case .downloading, .importing: return true
                default: return false
            }
        }
        ScreenWakeLock.shared.set(transferring, reason: .downloading)
        #endif

        let count = records.filter(\.isIncomplete).count
        if incompleteDownloadCount != count {
            incompleteDownloadCount = count
            scheduleLibraryDerivation(reason: "downloadRecords")
        }
    }

    private func refreshUploadPermissions() {
        guard uploadPermissionTask == nil else { return }
        uploadPermissionTask = Task { @MainActor [weak self] in
            let permitted = await BookServiceActor.shared.uploadPermittedSourceIDs()
            guard let self else { return }
            self.setIfChanged(\.uploadPermittedSourceIDs, permitted)
            self.uploadPermissionTask = nil
        }
    }

    /// Assigns only when the value actually differs. `@Observable` notifies observers on every
    /// setter call regardless of equality, so unguarded reassignment of unchanged state (as happens
    /// on the frequent no-op background refreshes) churns the whole library UI and tears down any
    /// open context menu mid-interaction.
    private func setIfChanged<Value: Equatable>(
        _ keyPath: ReferenceWritableKeyPath<MediaViewModel, Value>,
        _ newValue: Value,
    ) {
        if self[keyPath: keyPath] != newValue {
            self[keyPath: keyPath] = newValue
        }
    }

    public func refreshMetadata(source: String = "unknown") async {
        let started = CFAbsoluteTimeGetCurrent()
        var checkpoint = started
        debugLog("[PerfTrace][MediaViewModel] refreshMetadata start source=\(source)")
        if smartShelves.isEmpty {
            await loadSmartShelves()
        }
        logPerfCheckpoint("refreshMetadata smartShelves", source: source, checkpoint: &checkpoint)
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        let libraryMetadata = snapshot.books
        let status = await BookServiceActor.shared.connectionStatus
        let paths = snapshot.mediaPaths
        let pendingSyncs = await ProgressSyncActor.shared.getPendingProgressSyncs()
        logPerfCheckpoint(
            "refreshMetadata status/paths/pending",
            source: source,
            checkpoint: &checkpoint,
        )

        debugLog(
            "[PerfTrace][MediaViewModel] refreshMetadata status=\(status) pendingSyncs=\(pendingSyncs.count)"
        )
        if !pendingSyncs.isEmpty {
            let bookIds = pendingSyncs.map { $0.bookID.description }.joined(separator: ", ")
            debugLog("[PerfTrace][MediaViewModel] refreshMetadata pendingBookIds=[\(bookIds)]")
        }

        setIfChanged(\.bookSources, snapshot.sources)
        refreshUploadPermissions()
        logPerfCheckpoint(
            "refreshMetadata load source metadata",
            source: source,
            checkpoint: &checkpoint,
        )
        debugLog(
            "[PerfTrace][MediaViewModel] refreshMetadata metadataCount=\(libraryMetadata.count)"
        )

        setIfChanged(
            \.pendingSyncsByBook,
            Dictionary(
                pendingSyncs.map { ($0.bookID, $0) },
                uniquingKeysWith: { current, candidate in
                    candidate.timestamp > current.timestamp ? candidate : current
                },
            ),
        )
        debugLog(
            "[PerfTrace][MediaViewModel] refreshMetadata pendingSyncsByBook=\(pendingSyncsByBook.count)"
        )

        setIfChanged(\.bookProgressCache, await ProgressSyncActor.shared.getAllBookProgress())
        logPerfCheckpoint(
            "refreshMetadata progress cache",
            source: source,
            checkpoint: &checkpoint,
        )
        debugLog(
            "[PerfTrace][MediaViewModel] refreshMetadata progressEntries=\(bookProgressCache.count)"
        )

        applyLibraryMetadata(libraryMetadata)
        logPerfCheckpoint(
            "refreshMetadata applyLibraryMetadata",
            source: source,
            checkpoint: &checkpoint,
        )
        setIfChanged(\.cachedBookPaths, paths)
        setIfChanged(\.removableCachedBookPaths, snapshot.cachedMediaPaths)
        let sourceKindsByID = Dictionary(
            uniqueKeysWithValues: bookSources.map { ($0.id, $0.kind) }
        )
        setIfChanged(
            \.folderSourceBookIds,
            Set(
                libraryMetadata.filter { book in
                    sourceKindsByID[book.sourceID] == .localFolder
                }.map(\.id)
            ),
        )
        setIfChanged(
            \.storytellerBookIds,
            Set(
                libraryMetadata.filter { book in
                    sourceKindsByID[book.sourceID] == .storyteller
                }.map(\.id)
            ),
        )
        sourceGroupsCache.removeAll()
        scheduleLibraryDerivation(reason: "refreshMetadata(\(source))")
        setIfChanged(\.connectionStatus, status)
        setIfChanged(
            \.lastNetworkOpSucceeded,
            await BookServiceActor.shared.lastNetworkOpSucceeded,
        )
        setIfChanged(
            \.sourceConnectionInfos,
            await BookServiceActor.shared.sourceConnectionInfos(),
        )
        setIfChanged(\.isReady, true)
        logPerfCheckpoint(
            "refreshMetadata publish remaining state",
            source: source,
            checkpoint: &checkpoint,
        )
        debugLog(
            "[PerfTrace][MediaViewModel] refreshMetadata connectionStatus=\(status) lastNetworkOpSucceeded=\(String(describing: lastNetworkOpSucceeded))"
        )
        debugLog(
            "[PerfTrace][MediaViewModel] refreshMetadata complete books=\(library.bookMetaData.count)"
        )
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
        debugLog(
            "[PerfTrace][MediaViewModel] refreshMetadata end source=\(source) elapsedMs=\(String(format: "%.1f", elapsed))"
        )
    }

    private func logPerfCheckpoint(
        _ name: String,
        source: String,
        checkpoint: inout CFAbsoluteTime,
    ) {
        let now = CFAbsoluteTimeGetCurrent()
        let elapsed = (now - checkpoint) * 1000
        checkpoint = now
        debugLog(
            "[PerfTrace][MediaViewModel] \(name) source=\(source) deltaMs=\(String(format: "%.1f", elapsed))"
        )
    }

    public func updateVisibleSidebarContents(_ contents: [SidebarContentKind]) {
        var seen: Set<String> = []
        let deduped = contents.filter { content in
            seen.insert(content.stableIdentifier).inserted
        }
        guard deduped != visibleSidebarContents else { return }
        visibleSidebarContents = deduped
        scheduleLibraryDerivation(reason: "visibleSidebarContents")
    }

    public func mediaGridSnapshot(for request: MediaGridRenderRequest) async
        -> MediaGridRenderSnapshot
    {
        let input = MediaGridRenderInput(
            request: request,
            metadata: library.bookMetaData,
            paths: cachedBookPaths,
            folderSourceBookIds: folderSourceBookIds,
        )
        return await libraryDerivationActor.deriveMediaGridSnapshot(from: input)
    }

    public func smartShelfBooks(for shelf: SmartShelf) async -> [BookMetadata] {
        if let cached = libraryViewSnapshot.smartShelfBooks[shelf.id] {
            return cached
        }
        if let cached = smartShelfBooksCache[shelf.id] {
            return cached
        }
        let input = SmartShelfBooksInput(
            metadata: library.bookMetaData,
            paths: cachedBookPaths,
            folderSourceBookIds: folderSourceBookIds,
            progress: bookProgressCache,
        )
        return await libraryDerivationActor.deriveBooksForShelf(shelf, from: input)
    }

    public func libraryRenderContext() -> LibraryRenderContext {
        LibraryRenderContext(
            metadata: library.bookMetaData,
            paths: cachedBookPaths,
            folderSourceBookIds: folderSourceBookIds,
            progress: bookProgressCache,
            smartShelves: smartShelves,
        )
    }

    private func scheduleLibraryDerivation(reason: String) {
        guard !libraryPresentations.isEmpty else { return }
        #if !os(iOS)
        guard !visibleSidebarContents.isEmpty else { return }
        #endif
        libraryDerivationGeneration += 1
        let generation = libraryDerivationGeneration
        #if os(iOS)
        let deriveGroups = true
        #else
        let deriveGroups = false
        #endif
        let input = LibraryDerivationInput(
            generation: generation,
            deriveGroups: deriveGroups,
            metadata: library.bookMetaData,
            paths: cachedBookPaths,
            folderSourceBookIds: folderSourceBookIds,
            storytellerBookIds: storytellerBookIds,
            progress: bookProgressCache,
            smartShelves: smartShelves,
            sidebarContents: visibleSidebarContents,
            incompleteDownloadCount: incompleteDownloadCount,
        )
        libraryDerivationTask?.cancel()
        debugLog(
            "[PerfTrace][MediaViewModel] scheduleLibraryDerivation reason=\(reason) generation=\(generation) contents=\(visibleSidebarContents.count) books=\(input.metadata.count)"
        )
        libraryDerivationTask = Task { [weak self] in
            guard let self else { return }
            guard let snapshot = try? await self.libraryDerivationActor.deriveSnapshot(from: input),
                !Task.isCancelled
            else { return }
            await MainActor.run { [weak self] in
                guard let self else { return }
                guard snapshot.generation == self.libraryDerivationGeneration else {
                    debugLog(
                        "[PerfTrace][MediaViewModel] discard stale libraryViewSnapshot snapshotGeneration=\(snapshot.generation) currentGeneration=\(self.libraryDerivationGeneration)"
                    )
                    return
                }
                self.libraryViewSnapshot = snapshot
                self.smartShelfBooksCache = snapshot.smartShelfBooks
                debugLog(
                    "[PerfTrace][MediaViewModel] publish libraryViewSnapshot generation=\(snapshot.generation) badges=\(snapshot.badgeCounts.count)"
                )
            }
        }
    }

    public func publishWidgetSnapshot(
        using publish: @escaping @Sendable () async -> Void = {
            let library = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
            let progress = await ProgressSyncActor.shared.getAllBookProgress()
            await StorytellerWidgetSnapshotStore.publishSnapshot(
                metadata: library.books,
                progress: progress,
                sources: library.sources,
            )
        }
    ) async {
        #if os(iOS) || os(macOS)
        let previous = widgetSnapshotPublishTask
        let task = Task {
            await previous?.value
            await publish()
        }
        widgetSnapshotPublishTask = task
        await task.value
        #endif
    }

    public func setLibraryPresentation(_ visible: Bool, owner: UUID) async {
        let wasVisible = !libraryPresentations.isEmpty
        if visible {
            libraryPresentations.insert(owner)
        } else {
            libraryPresentations.remove(owner)
        }
        let isVisible = !libraryPresentations.isEmpty
        if wasVisible != isVisible, !isVisible {
            libraryDerivationTask?.cancel()
            libraryDerivationGeneration += 1
        }
        await BookServiceActor.shared.setLibraryRefreshDemand(visible, owner: owner)
        if !wasVisible, isVisible {
            await ActiveReadingSession.shared.current?.saveProgressLocally(reason: .userClosedBook)
            await refreshMetadata(source: "library presented")
            await publishWidgetSnapshot()
        }
    }

    private func observeWidgetPlayback() {
        let session = ActiveReadingSession.shared.current
        let wasPlaying = session?.playbackSnapshot?.isPlaying == true
        withObservationTracking {
            _ = ActiveReadingSession.shared.current
            _ = session?.playbackSnapshot?.isPlaying
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.observeWidgetPlayback()
                let current = ActiveReadingSession.shared.current
                if session != nil
                    && (session !== current
                        || (wasPlaying && current?.playbackSnapshot?.isPlaying != true))
                {
                    await session?.saveProgressLocally(reason: .userPausedPlayback)
                    await self.publishWidgetSnapshot()
                }
            }
        }
    }

    private func refreshProgress() async {
        if !libraryPresentations.isEmpty {
            await refreshMetadata(source: "progress")
            return
        }
        let pending = await ProgressSyncActor.shared.getPendingProgressSyncs()
        setIfChanged(
            \.pendingSyncsByBook,
            Dictionary(
                pending.map { ($0.bookID, $0) },
                uniquingKeysWith: { _, newer in newer },
            ),
        )
        setIfChanged(\.bookProgressCache, await ProgressSyncActor.shared.getAllBookProgress())
    }

    private func setupSettingsSync() async {
        await SettingsActor.shared.request_notify { @MainActor [weak self] in
            guard let self else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                let config = await SettingsActor.shared.config
                let intervalChanged =
                    self.cachedConfig.sync.metadataRefreshIntervalSeconds
                    != config.sync.metadataRefreshIntervalSeconds
                self.cachedConfig = config
                if intervalChanged { await BookServiceActor.shared.restartPeriodicLibraryRefresh() }
            }
        }

        cachedConfig = await SettingsActor.shared.config
    }

    private func setupPathCacheSync() async {
        cachedMediaObserverId = await BookServiceActor.shared.addLibraryCacheObserver {
            [weak self] in
            Task { @MainActor [weak self] in
                await self?.syncPathCache()
                await self?.refreshMetadata(source: "LocalMediaActor.cachedMediaObserver")
            }
        }

        await ProgressSyncActor.shared.addObserver { [weak self] in
            Task { @MainActor in
                await self?.refreshProgress()
            }
        }

        await refreshMetadata(source: "start")
    }

    private func syncPathCache() async {
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        cachedBookPaths = snapshot.mediaPaths
        removableCachedBookPaths = snapshot.cachedMediaPaths
    }

    private func applyLibraryMetadata(_ metadata: [BookMetadata]) {
        guard metadata != library.bookMetaData else {
            debugLog(
                "[PerfTrace][MediaViewModel] applyLibraryMetadata unchanged skip count=\(metadata.count)"
            )
            return
        }
        let started = CFAbsoluteTimeGetCurrent()
        debugLog(
            "[PerfTrace][MediaViewModel] applyLibraryMetadata start incoming=\(metadata.count) previous=\(library.bookMetaData.count) libraryVersion=\(libraryVersion)"
        )
        let previousMetadataByID = Dictionary(
            library.bookMetaData.map { ($0.id, $0) },
            uniquingKeysWith: { current, _ in current },
        )
        let previousMapElapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
        debugLog(
            "[PerfTrace][MediaViewModel] applyLibraryMetadata previousMapMs=\(String(format: "%.1f", previousMapElapsed))"
        )
        let validIDs = Set(metadata.map(\.id))
        library = BookLibrary(
            bookMetaData: metadata,
            ebookCoverCache: [:],
            audiobookCoverCache: [:],
        )
        libraryVersion += 1
        invalidateDerivedCaches()
        debugLog("[PerfTrace][MediaViewModel] Updated library version=\(libraryVersion)")

        if availableStatuses.isEmpty, !metadata.isEmpty {
            Task { @MainActor [weak self] in
                let statuses = await BookServiceActor.shared.getAvailableStatuses()
                self?.availableStatuses = statuses
            }
        }
        refreshAvailableStatusCaches(for: metadata)
        readBookIds = Set(
            metadata.compactMap { metadata in
                guard let status = metadata.status?.name,
                    status.caseInsensitiveCompare("Read") == .orderedSame
                else { return nil }
                return metadata.id
            }
        )

        let invalidKeys = coverStates.keys.filter { !validIDs.contains($0.id) }
        for key in invalidKeys {
            coverStates.removeValue(forKey: key)
        }
        missingCoverKeys = Set(missingCoverKeys.filter { validIDs.contains($0.id) })
        pruneCoverTasks(keeping: validIDs)
        let pruneElapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
        debugLog(
            "[PerfTrace][MediaViewModel] applyLibraryMetadata after prune elapsedMs=\(String(format: "%.1f", pruneElapsed)) coverStates=\(coverStates.count) missingCovers=\(missingCoverKeys.count) activeCoverTasks=\(coverTasks.count)"
        )

        let storytellerSourceIDs = Set(
            bookSources.filter { $0.kind == .storyteller }.map(\.id)
        )
        let changedStorytellerBooks = metadata.filter { book in
            guard storytellerSourceIDs.contains(book.sourceID),
                let previous = previousMetadataByID[book.id],
                previous.updatedAt != book.updatedAt
            else { return false }
            return true
        }

        if !changedStorytellerBooks.isEmpty {
            debugLog(
                "[MetadataCoverRefresh] MediaVM applyLibraryMetadata changed books=\(changedStorytellerBooks.map(\.id))"
            )
            Task { @MainActor [weak self] in
                guard let self else { return }
                for book in changedStorytellerBooks {
                    for variant in coverVariantsToLoad(for: book) {
                        await refreshCover(for: book, variant: variant)
                    }
                }
            }
        }
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
        debugLog(
            "[PerfTrace][MediaViewModel] applyLibraryMetadata end elapsedMs=\(String(format: "%.1f", elapsed)) changedStorytellerBooks=\(changedStorytellerBooks.count)"
        )
    }

    private func refreshAvailableStatusCaches(
        for metadata: [BookMetadata],
        retryEmpty: Bool = false,
    ) {
        let sourceIDs = Set(metadata.map(\.sourceID))
        setIfChanged(
            \.availableStatusesBySourceID,
            availableStatusesBySourceID.filter { sourceIDs.contains($0.key) },
        )
        availableStatusLoadTasks = availableStatusLoadTasks.filter {
            sourceIDs.contains($0.key)
        }

        for sourceID in sourceIDs {
            if availableStatusLoadTasks[sourceID] != nil {
                continue
            }
            if let cached = availableStatusesBySourceID[sourceID],
                !cached.isEmpty || !retryEmpty
            {
                continue
            }

            availableStatusLoadTasks[sourceID] = Task { @MainActor [weak self] in
                let statuses = await BookServiceActor.shared.getAvailableStatuses(
                    sourceID: sourceID
                )
                guard let self else { return }
                self.availableStatusLoadTasks[sourceID] = nil
                let sorted = self.sortedUniqueStatuses(statuses)
                if self.availableStatusesBySourceID[sourceID] != sorted {
                    self.availableStatusesBySourceID[sourceID] = sorted
                }
            }
        }
    }

    private func sortedUniqueStatuses(_ statuses: [BookStatus]) -> [BookStatus] {
        var seenNames = Set<String>()
        return
            statuses
            .filter { status in
                seenNames.insert(status.name.lowercased()).inserted
            }
            .sorted {
                $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
    }

    private func invalidateDerivedCaches() {
        let started = CFAbsoluteTimeGetCurrent()
        let counts = [
            seriesGroupsCache.count,
            authorGroupsCache.count,
            collectionGroupsCache.count,
            narratorGroupsCache.count,
            translatorGroupsCache.count,
            publicationYearGroupsCache.count,
            tagGroupsCache.count,
            ratingGroupsCache.count,
            statusGroupsCache.count,
            sourceGroupsCache.count,
        ]
        seriesGroupsCache.removeAll()
        authorGroupsCache.removeAll()
        collectionGroupsCache.removeAll()
        narratorGroupsCache.removeAll()
        translatorGroupsCache.removeAll()
        publicationYearGroupsCache.removeAll()
        tagGroupsCache.removeAll()
        ratingGroupsCache.removeAll()
        statusGroupsCache.removeAll()
        sourceGroupsCache.removeAll()
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
        debugLog(
            "[PerfTrace][MediaViewModel] invalidateDerivedCaches previousBuckets=\(counts.reduce(0, +)) elapsedMs=\(String(format: "%.1f", elapsed))"
        )
    }

    private func pruneCoverTasks(keeping validIDs: Set<BookID>) {
        let invalidKeys = coverTasks.keys.filter { !validIDs.contains($0.id) }
        for key in invalidKeys {
            coverTasks[key]?.cancel()
            coverTasks.removeValue(forKey: key)
            uncancellableCoverKeys.remove(key)
        }
        pendingCoverRequests = pendingCoverRequests.filter { validIDs.contains($0.key.id) }
        skippedCoverRetries = skippedCoverRetries.filter { validIDs.contains($0.key.id) }
    }

    private func metadataMatchesKind(_ metadata: BookMetadata, kind: MediaKind) -> Bool {
        switch kind {
            case .ebook:
                return metadata.hasAvailableEbook || metadata.hasAvailableReadaloud
            case .audiobook:
                return !metadata.hasAvailableEbook && !metadata.hasAvailableReadaloud
                    && metadata.hasAvailableAudiobook
        }
    }

    private static func creatorGroupingKey(_ creator: BookCreator, unknownKey: String) -> String {
        let name = (creator.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty {
            return normalizedCategoryKey(name)
        }
        return creator.uuid ?? unknownKey
    }

    private static func normalizedCategoryKey(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
    }

    public func items(for kind: MediaKind, narrationFilter: NarrationFilter, tagFilter: String?)
        -> [BookMetadata]
    {
        let started = CFAbsoluteTimeGetCurrent()
        var base = library.bookMetaData.filter { metadataMatchesKind($0, kind: kind) }
        switch narrationFilter {
            case .both:
                break
            case .withAudio:
                base = base.filter(\.hasAnyAudiobookAsset)
            case .withoutAudio:
                base = base.filter { !$0.hasAnyAudiobookAsset }
        }
        if let tagFilter, !tagFilter.isEmpty {
            let target = tagFilter.lowercased()
            base = base.filter { item in
                item.tagNames.contains(where: { $0.lowercased() == target })
            }
        }
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
        debugLog(
            "[PerfTrace][MediaViewModel] items kind=\(kind) narration=\(narrationFilter) tag=\(tagFilter ?? "nil") result=\(base.count) elapsedMs=\(String(format: "%.1f", elapsed))"
        )
        return base
    }

    public func booksBySeries(for kind: MediaKind)
        -> [(series: BookSeries?, books: [BookMetadata])]
    {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.series[kind] {
            return groups.map { (series: $0.series, books: $0.books) }
        }
        return []
        #else
        if let cached = seriesGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksBySeries cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var seriesMap: [String: (series: BookSeries?, books: [BookMetadata])] = [:]

        for book in allBooks {
            if let seriesList = book.series, !seriesList.isEmpty {
                for series in seriesList {
                    let key = Self.normalizedCategoryKey(series.name)
                    if var existing = seriesMap[key] {
                        if existing.series?.uuid == nil, series.uuid != nil {
                            existing.series = series
                        }
                        if !existing.books.contains(where: { $0.id == book.id }) {
                            existing.books.append(book)
                        }
                        seriesMap[key] = existing
                    } else {
                        seriesMap[key] = (series: series, books: [book])
                    }
                }
            } else {
                if var existing = seriesMap["__no_series__"] {
                    existing.books.append(book)
                    seriesMap["__no_series__"] = existing
                } else {
                    seriesMap["__no_series__"] = (series: nil, books: [book])
                }
            }
        }

        for key in seriesMap.keys {
            let seriesName = seriesMap[key]?.series?.name.lowercased()
            seriesMap[key]?.books.sort { a, b in
                let posA =
                    a.series?.first(where: { $0.name.lowercased() == seriesName })?.position
                    ?? .greatestFiniteMagnitude
                let posB =
                    b.series?.first(where: { $0.name.lowercased() == seriesName })?.position
                    ?? .greatestFiniteMagnitude
                return posA < posB
            }
        }

        var result = Array(seriesMap.values)
        result.sort { a, b in
            guard let seriesA = a.series, let seriesB = b.series else {
                return a.series != nil
            }
            return seriesA.name.articleStrippedCompare(seriesB.name) == .orderedAscending
        }

        seriesGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
        debugLog(
            "[PerfTrace][MediaViewModel] booksBySeries cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksByAuthor(for kind: MediaKind)
        -> [(author: BookCreator?, books: [BookMetadata])]
    {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.authors[kind] {
            return groups.map { (author: $0.creator, books: $0.books) }
        }
        return []
        #else
        if let cached = authorGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksByAuthor cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var authorMap: [String: (author: BookCreator?, books: [BookMetadata])] = [:]

        for book in allBooks {
            if let authorsList = book.authors, !authorsList.isEmpty {
                for author in authorsList {
                    let key = Self.creatorGroupingKey(author, unknownKey: "__unknown__")
                    if var existing = authorMap[key] {
                        if existing.author?.uuid == nil, author.uuid != nil {
                            existing.author = author
                        }
                        if !existing.books.contains(where: { $0.id == book.id }) {
                            existing.books.append(book)
                        }
                        authorMap[key] = existing
                    } else {
                        authorMap[key] = (author: author, books: [book])
                    }
                }
            } else {
                if var existing = authorMap["__no_author__"] {
                    existing.books.append(book)
                    authorMap["__no_author__"] = existing
                } else {
                    authorMap["__no_author__"] = (author: nil, books: [book])
                }
            }
        }

        for key in authorMap.keys {
            authorMap[key]?.books.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        var result = Array(authorMap.values)
        result.sort { a, b in
            guard let authorA = a.author, let authorB = b.author else {
                return a.author != nil
            }
            let nameA = authorA.name ?? ""
            let nameB = authorB.name ?? ""
            return nameA.localizedCaseInsensitiveCompare(nameB) == .orderedAscending
        }

        authorGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
        debugLog(
            "[PerfTrace][MediaViewModel] booksByAuthor cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksByCollection(for kind: MediaKind) -> [(
        collection: BookCollectionSummary?, books: [BookMetadata]
    )] {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.collections[kind] {
            return groups.map { (collection: $0.collection, books: $0.books) }
        }
        return []
        #else
        if let cached = collectionGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksByCollection cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var collectionMap: [String: (collection: BookCollectionSummary?, books: [BookMetadata])] =
            [:]

        for book in allBooks {
            if let collectionsList = book.collections {
                for collection in collectionsList {
                    let key = Self.normalizedCategoryKey(collection.name)
                    if var existing = collectionMap[key] {
                        if existing.collection?.uuid == nil, collection.uuid != nil {
                            existing.collection = collection
                        }
                        if !existing.books.contains(where: { $0.id == book.id }) {
                            existing.books.append(book)
                        }
                        collectionMap[key] = existing
                    } else {
                        collectionMap[key] = (collection: collection, books: [book])
                    }
                }
            }
        }

        for key in collectionMap.keys {
            collectionMap[key]?.books.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        var result = Array(collectionMap.values)
        result.sort { a, b in
            guard let collectionA = a.collection, let collectionB = b.collection else {
                return a.collection != nil
            }
            return collectionA.name.articleStrippedCompare(collectionB.name)
                == .orderedAscending
        }

        collectionGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][MediaViewModel] booksByCollection cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksByNarrator(for kind: MediaKind)
        -> [(narrator: BookCreator?, books: [BookMetadata])]
    {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.narrators[kind] {
            return groups.map { (narrator: $0.creator, books: $0.books) }
        }
        return []
        #else
        if let cached = narratorGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksByNarrator cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var narratorMap: [String: (narrator: BookCreator?, books: [BookMetadata])] = [:]

        for book in allBooks {
            if let narratorsList = book.narrators, !narratorsList.isEmpty {
                for narrator in narratorsList {
                    let key = Self.creatorGroupingKey(narrator, unknownKey: "__unknown__")
                    if var existing = narratorMap[key] {
                        if existing.narrator?.uuid == nil, narrator.uuid != nil {
                            existing.narrator = narrator
                        }
                        if !existing.books.contains(where: { $0.id == book.id }) {
                            existing.books.append(book)
                        }
                        narratorMap[key] = existing
                    } else {
                        narratorMap[key] = (narrator: narrator, books: [book])
                    }
                }
            } else {
                if var existing = narratorMap["__no_narrator__"] {
                    existing.books.append(book)
                    narratorMap["__no_narrator__"] = existing
                } else {
                    narratorMap["__no_narrator__"] = (narrator: nil, books: [book])
                }
            }
        }

        for key in narratorMap.keys {
            narratorMap[key]?.books.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        var result = Array(narratorMap.values)
        result.sort { a, b in
            guard let narratorA = a.narrator, let narratorB = b.narrator else {
                return a.narrator != nil
            }
            let nameA = narratorA.name ?? ""
            let nameB = narratorB.name ?? ""
            return nameA.localizedCaseInsensitiveCompare(nameB) == .orderedAscending
        }

        narratorGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][MediaViewModel] booksByNarrator cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksByTranslator(for kind: MediaKind)
        -> [(translator: BookCreator?, books: [BookMetadata])]
    {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.translators[kind] {
            return groups.map { (translator: $0.creator, books: $0.books) }
        }
        return []
        #else
        if let cached = translatorGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksByTranslator cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var translatorMap: [String: (translator: BookCreator?, books: [BookMetadata])] = [:]

        for book in allBooks {
            let translators = (book.creators ?? []).filter { $0.role == "trl" }
            if !translators.isEmpty {
                for translator in translators {
                    let key = Self.creatorGroupingKey(translator, unknownKey: "__unknown__")
                    if var existing = translatorMap[key] {
                        if existing.translator?.uuid == nil, translator.uuid != nil {
                            existing.translator = translator
                        }
                        if !existing.books.contains(where: { $0.id == book.id }) {
                            existing.books.append(book)
                        }
                        translatorMap[key] = existing
                    } else {
                        translatorMap[key] = (translator: translator, books: [book])
                    }
                }
            } else {
                if var existing = translatorMap["__no_translator__"] {
                    existing.books.append(book)
                    translatorMap["__no_translator__"] = existing
                } else {
                    translatorMap["__no_translator__"] = (translator: nil, books: [book])
                }
            }
        }

        for key in translatorMap.keys {
            translatorMap[key]?.books.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        var result = Array(translatorMap.values)
        result.sort { a, b in
            guard let translatorA = a.translator, let translatorB = b.translator else {
                return a.translator != nil
            }
            let nameA = translatorA.name ?? ""
            let nameB = translatorB.name ?? ""
            return nameA.localizedCaseInsensitiveCompare(nameB) == .orderedAscending
        }

        translatorGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][MediaViewModel] booksByTranslator cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksByPublicationYear(for kind: MediaKind)
        -> [(year: String, books: [BookMetadata])]
    {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.publicationYears[kind] {
            return groups.map { (year: $0.name, books: $0.books) }
        }
        return []
        #else
        if let cached = publicationYearGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksByPublicationYear cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var yearMap: [String: [BookMetadata]] = [:]

        for book in allBooks {
            let year = BookMetadata.publicationYear(from: book.publicationDate) ?? "Unknown"
            if var existing = yearMap[year] {
                existing.append(book)
                yearMap[year] = existing
            } else {
                yearMap[year] = [book]
            }
        }

        for key in yearMap.keys {
            yearMap[key]?.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        var result: [(year: String, books: [BookMetadata])] = yearMap.map {
            (year: $0.key, books: $0.value)
        }
        result.sort { a, b in
            if a.year == "Unknown" { return false }
            if b.year == "Unknown" { return true }
            return a.year > b.year
        }

        publicationYearGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][MediaViewModel] booksByPublicationYear cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksByTag(for kind: MediaKind) -> [(tag: String, books: [BookMetadata])] {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.tags[kind] {
            return groups.map { (tag: $0.name, books: $0.books) }
        }
        return []
        #else
        if let cached = tagGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksByTag cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var tagMap: [String: (displayName: String, books: [BookMetadata])] = [:]

        for book in allBooks {
            for tagName in book.tagNames {
                let key = Self.normalizedCategoryKey(tagName)
                if var existing = tagMap[key] {
                    if !existing.books.contains(where: { $0.id == book.id }) {
                        existing.books.append(book)
                    }
                    tagMap[key] = existing
                } else {
                    tagMap[key] = (displayName: tagName, books: [book])
                }
            }
        }

        for key in tagMap.keys {
            tagMap[key]?.books.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        var result: [(tag: String, books: [BookMetadata])] = tagMap.map {
            (tag: $0.value.displayName, books: $0.value.books)
        }
        result.sort { a, b in
            a.tag.localizedCaseInsensitiveCompare(b.tag) == .orderedAscending
        }

        tagGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][MediaViewModel] booksByTag cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksByRating(for kind: MediaKind)
        -> [(rating: String, books: [BookMetadata])]
    {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.ratings[kind] {
            return groups.map { (rating: $0.name, books: $0.books) }
        }
        return []
        #else
        if let cached = ratingGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksByRating cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var ratingMap: [String: [BookMetadata]] = [:]

        for book in allBooks {
            let key: String
            if let r = book.rating, r > 0 {
                let stars = Int(r.rounded())
                key = "\(stars)"
            } else {
                key = "Unrated"
            }
            if var existing = ratingMap[key] {
                existing.append(book)
                ratingMap[key] = existing
            } else {
                ratingMap[key] = [book]
            }
        }

        for key in ratingMap.keys {
            ratingMap[key]?.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        var result: [(rating: String, books: [BookMetadata])] = ratingMap.map {
            (rating: $0.key, books: $0.value)
        }
        result.sort { a, b in
            if a.rating == "Unrated" { return false }
            if b.rating == "Unrated" { return true }
            return (Int(a.rating) ?? 0) > (Int(b.rating) ?? 0)
        }

        ratingGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][MediaViewModel] booksByRating cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksByStatus(for kind: MediaKind)
        -> [(status: String, books: [BookMetadata])]
    {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.statuses[kind] {
            return groups.map { (status: $0.name, books: $0.books) }
        }
        return []
        #else
        if let cached = statusGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksByStatus cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var statusMap: [String: [BookMetadata]] = [:]

        for book in allBooks {
            let key = book.status?.name ?? "Unknown"
            if var existing = statusMap[key] {
                existing.append(book)
                statusMap[key] = existing
            } else {
                statusMap[key] = [book]
            }
        }

        for key in statusMap.keys {
            statusMap[key]?.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        let statusOrder = ["Reading", "To read", "Read", "Unknown"]
        var result: [(status: String, books: [BookMetadata])] = statusMap.map {
            (status: $0.key, books: $0.value)
        }
        result.sort { a, b in
            let indexA = statusOrder.firstIndex(of: a.status) ?? statusOrder.count
            let indexB = statusOrder.firstIndex(of: b.status) ?? statusOrder.count
            if indexA != indexB { return indexA < indexB }
            return a.status.localizedCaseInsensitiveCompare(b.status) == .orderedAscending
        }

        statusGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][MediaViewModel] booksByStatus cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func booksBySource(for kind: MediaKind)
        -> [(source: String, books: [BookMetadata])]
    {
        #if os(iOS)
        if let groups = currentGroupSnapshot()?.sources[kind] {
            return groups.map { (source: $0.name, books: $0.books) }
        }
        return []
        #else
        if let cached = sourceGroupsCache[kind], cached.version == libraryVersion {
            debugLog(
                "[PerfTrace][MediaViewModel] booksBySource cacheHit kind=\(kind) groups=\(cached.groups.count) version=\(libraryVersion)"
            )
            return cached.groups
        }
        let started = CFAbsoluteTimeGetCurrent()
        let allBooks = library.bookMetaData

        var sourceMap: [String: [BookMetadata]] = [:]

        for book in allBooks {
            let key = book.source ?? sourceNamesByID[book.sourceID] ?? "Unknown"

            if var existing = sourceMap[key] {
                existing.append(book)
                sourceMap[key] = existing
            } else {
                sourceMap[key] = [book]
            }
        }

        for key in sourceMap.keys {
            sourceMap[key]?.sort { a, b in
                a.title.articleStrippedCompare(b.title) == .orderedAscending
            }
        }

        let sourceOrder = bookSources.map(\.name) + ["Storyteller", "Local Files", "Unknown"]
        var result: [(source: String, books: [BookMetadata])] = sourceMap.map {
            (source: $0.key, books: $0.value)
        }
        result.sort { a, b in
            let indexA = sourceOrder.firstIndex(of: a.source) ?? sourceOrder.count
            let indexB = sourceOrder.firstIndex(of: b.source) ?? sourceOrder.count
            if indexA != indexB { return indexA < indexB }
            return a.source.localizedCaseInsensitiveCompare(b.source) == .orderedAscending
        }

        sourceGroupsCache[kind] = (libraryVersion, result)
        let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1_000
        debugLog(
            "[PerfTrace][MediaViewModel] booksBySource cacheMiss kind=\(kind) books=\(allBooks.count) groups=\(result.count) elapsedMs=\(String(format: "%.1f", elapsed)) version=\(libraryVersion)"
        )
        return result
        #endif
    }

    public func badgeCount(for content: SidebarContentKind) -> Int {
        libraryViewSnapshot.badgeCounts[content.stableIdentifier] ?? 0
    }

    #if os(iOS)
    private func currentGroupSnapshot() -> LibraryGroupSnapshot? {
        let groups = libraryViewSnapshot.groups
        guard groups.generation == libraryDerivationGeneration else {
            return nil
        }
        return groups
    }
    #endif

    private func shouldIncludeAudiobookOnlyItems(for filter: NarrationFilter) -> Bool {
        switch filter {
            case .both, .withAudio:
                return true
            case .withoutAudio:
                return false
        }
    }

    private func matchesNarrationFilter(_ item: BookMetadata, filter: NarrationFilter) -> Bool {
        switch filter {
            case .both:
                return true
            case .withAudio:
                return item.hasAvailableAudiobook || item.hasAvailableReadaloud
            case .withoutAudio:
                return item.isEbookOnly
        }
    }

    private func matchesLocationFilter(_ item: BookMetadata, filter: LocationFilter) -> Bool {
        switch filter {
            case .all:
                return true
            case .downloaded:
                let hasDownload =
                    isCategoryDownloaded(.ebook, for: item)
                    || isCategoryDownloaded(.audio, for: item)
                    || isCategoryDownloaded(.synced, for: item)
                return hasDownload && !isLocalStandaloneBook(item.id)
            case .serverOnly:
                let hasDownload =
                    isCategoryDownloaded(.ebook, for: item)
                    || isCategoryDownloaded(.audio, for: item)
                    || isCategoryDownloaded(.synced, for: item)
                return !hasDownload && !isLocalStandaloneBook(item.id)
            case .localFiles:
                return isLocalStandaloneBook(item.id)
        }
    }

    private func mergeItems(_ primary: [BookMetadata], with supplemental: [BookMetadata])
        -> [BookMetadata]
    {
        guard !supplemental.isEmpty else { return primary }
        var result = primary
        var seen = Set(result.map(\.id))
        for item in supplemental where !seen.contains(item.id) {
            seen.insert(item.id)
            result.append(item)
        }
        return result
    }

    public func downloadStatus(for item: BookMetadata) -> DownloadProgressState? {
        downloadStatuses[item.id]
    }

    public func isDownloadInProgress(for item: BookMetadata) -> Bool {
        downloadStatuses[item.id]?.isActive ?? false
    }

    public func startDownload(for item: BookMetadata, category: LocalMediaCategory) {
        var status = downloadStatuses[item.id] ?? DownloadProgressState()
        status.categories[category] = DownloadProgressState.CategoryState()
        status.errorDescription = nil
        downloadStatuses[item.id] = status

        Task {
            await DownloadManager.shared.startDownload(for: item, category: category)
        }
    }

    public func cancelDownload(for item: BookMetadata, category: LocalMediaCategory) {
        if var state = downloadStatuses[item.id] {
            state.categories.removeValue(forKey: category)
            state.errorDescription = nil
            if state.categories.isEmpty {
                downloadStatuses[item.id] = nil
            } else {
                downloadStatuses[item.id] = state
            }
        }

        Task {
            await DownloadManager.shared.cancelDownload(for: item.id, category: category)
        }
    }

    public func isCategoryDownloaded(_ category: LocalMediaCategory, for item: BookMetadata) -> Bool
    {
        guard let paths = cachedBookPaths[item.id] else { return false }
        switch category {
            case .ebook:
                return paths.ebookPath != nil
            case .audio:
                return paths.audioPath != nil
            case .synced:
                return paths.syncedPath != nil
        }
    }

    public func hasCachedMedia(_ category: LocalMediaCategory, for item: BookMetadata) -> Bool {
        guard let paths = removableCachedBookPaths[item.id] else { return false }
        switch category {
            case .ebook:
                return paths.ebookPath != nil
            case .audio:
                return paths.audioPath != nil
            case .synced:
                return paths.syncedPath != nil
        }
    }

    public func localMediaPath(for bookID: BookID, category: LocalMediaCategory) -> URL? {
        guard let paths = cachedBookPaths[bookID] else { return nil }
        switch category {
            case .ebook:
                return paths.ebookPath
            case .audio:
                return paths.audioPath
            case .synced:
                return paths.syncedPath
        }
    }

    public func preferredDownloadedCategory(for item: BookMetadata) -> LocalMediaCategory? {
        if isCategoryDownloaded(.synced, for: item) { return .synced }
        let audioDownloaded = isCategoryDownloaded(.audio, for: item)
        let ebookDownloaded = isCategoryDownloaded(.ebook, for: item)
        if audioDownloaded && ebookDownloaded {
            return cachedConfig.library.preferAudioOverEbook ? .audio : .ebook
        }
        if audioDownloaded { return .audio }
        if ebookDownloaded { return .ebook }
        return nil
    }

    public func makePlayerBookDataLoadingCovers(
        for item: BookMetadata,
        category: LocalMediaCategory,
    ) async -> PlayerBookData {
        var bookData = makePlayerBookData(for: item, category: category)
        let hasAudio = bookData.metadata.hasAvailableAudiobook

        var audioCover: Image?
        if hasAudio {
            audioCover = await fullCoverImage(for: item.id, audio: true)
            if audioCover == nil {
                audioCover = await cachedCoverImage(bookID: item.id, audio: true)
            }
        }
        var standardCover = await fullCoverImage(for: item.id, audio: false)
        if standardCover == nil {
            standardCover = await cachedCoverImage(bookID: item.id, audio: false)
        }
        if let best = hasAudio ? (audioCover ?? standardCover) : (standardCover ?? audioCover) {
            bookData.coverArt = best
        }
        if hasAudio, let standardCover {
            bookData.ebookCoverArt = standardCover
        }
        return bookData
    }

    private func cachedCoverImage(bookID: BookID, audio: Bool) async -> Image? {
        guard let data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: audio),
            let payload = Self.makeCoverPayload(from: data)
        else { return nil }
        return Image(decorative: payload.cgImage.image, scale: 1, orientation: .up)
    }

    public func fullCoverImage(for bookID: BookID, audio: Bool) async -> Image? {
        var data = await BookServiceActor.shared.cachedFullCoverData(for: bookID, audio: audio)
        if data == nil {
            data = await BookServiceActor.shared.loadFullCover(for: bookID, audio: audio)
        }
        if data == nil {
            data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: audio)
        }
        guard let data, let payload = Self.makeCoverPayload(from: data, maxPixelSize: 2048)
        else { return nil }
        return Image(decorative: payload.cgImage.image, scale: 1, orientation: .up)
    }

    public func makePlayerBookData(
        for item: BookMetadata,
        category: LocalMediaCategory,
    ) -> PlayerBookData {
        let freshMetadata = library.bookMetaData.first { $0.id == item.id } ?? item
        let variant: CoverVariant = freshMetadata.hasAvailableAudiobook ? .audioSquare : .standard
        let cover = coverImage(for: freshMetadata, variant: variant)
        let ebookCover =
            freshMetadata.hasAvailableAudiobook
            ? coverImage(for: freshMetadata, variant: .standard)
            : nil
        return PlayerBookData(
            metadata: freshMetadata,
            localMediaPath: localMediaPath(for: item.id, category: category),
            category: category,
            coverArt: cover,
            ebookCoverArt: ebookCover,
        )
    }

    public func isLocalStandaloneBook(_ bookID: BookID) -> Bool {
        folderSourceBookIds.contains(bookID)
    }

    public func sourceLabel(for bookID: BookID) -> String {
        library.bookMetaData.first { $0.id == bookID }?.source ?? "Unknown"
    }

    public func sourceIDs(for bookIDs: [BookID]) -> [BookSourceID] {
        let requested = Set(bookIDs)
        var seen: Set<BookSourceID> = []
        var sourceIDs: [BookSourceID] = []

        for book in library.bookMetaData where requested.contains(book.id) {
            if seen.insert(book.sourceID).inserted {
                sourceIDs.append(book.sourceID)
            }
        }

        return sourceIDs
    }

    public func isServerBook(_ bookID: BookID) -> Bool {
        storytellerBookIds.contains(bookID)
    }

    public func canManageSourceMedia(for bookID: BookID) -> Bool {
        guard let source = bookSources.first(where: { $0.id == bookID.sourceID })
        else {
            return false
        }
        return source.capabilities.canManageMedia
    }

    public func isLocalFolderBook(_ bookID: BookID) -> Bool {
        folderSourceBookIds.contains(bookID)
    }

    public func deleteBookFromSource(_ item: BookMetadata) async -> Bool {
        let success = await BookServiceActor.shared.deleteBook(item.id)
        if success {
            await refreshMetadata(source: "MediaViewModel.deleteBookFromSource")
        }
        return success
    }

    public func deleteFolderAsset(for item: BookMetadata, format: StorytellerBookFormat) async
        -> Bool
    {
        let result = await BookServiceActor.shared.deleteBookAsset(
            item.id,
            type: format,
        )
        await refreshMetadata(source: "MediaViewModel.deleteFolderAsset")
        let didDelete: Bool = {
            if case DeleteAssetResult.success = result { return true }
            return false
        }()
        let label = folderAssetLabel(format).lowercased()
        showSyncNotification(
            SyncNotification(
                message: didDelete
                    ? "Deleted \(label) from folder source"
                    : "Failed to delete \(label)",
                type: didDelete ? .success : .error,
            )
        )
        return didDelete
    }

    public func deleteFolderBook(_ item: BookMetadata) async -> Bool {
        let success = await deleteBookFromSource(item)
        showSyncNotification(
            SyncNotification(
                message: success
                    ? "Deleted \(item.title) from folder source"
                    : "Failed to delete \(item.title)",
                type: success ? .success : .error,
            )
        )
        return success
    }

    public func folderAssetLabel(_ format: StorytellerBookFormat) -> String {
        switch format {
            case .ebook: return "Ebook"
            case .audiobook: return "Audiobook"
            case .readaloud: return "Readaloud"
        }
    }

    public func progress(for bookId: BookID) -> Double {
        if readBookIds.contains(bookId) { return 1.0 }
        return bookProgressCache[bookId]?.progressFraction ?? 0
    }

    public func position(for bookId: BookID) -> BookReadingPosition? {
        guard let bp = bookProgressCache[bookId], let locator = bp.locator else { return nil }
        return BookReadingPosition(
            uuid: nil,
            locator: locator,
            timestamp: bp.timestamp,
            createdAt: nil,
            updatedAt: nil,
        )
    }

    public func pendingSync(for bookId: BookID) -> PendingProgressSync? {
        pendingSyncsByBook[bookId]
    }

    public func downloadProgressFraction(
        for item: BookMetadata,
        category: LocalMediaCategory,
    ) -> Double? {
        downloadStatuses[item.id]?.categories[category]?.progressFraction
    }

    public func isCategoryDownloadInProgress(
        for item: BookMetadata,
        category: LocalMediaCategory,
    ) -> Bool {
        downloadStatuses[item.id]?.categories[category]?.isActive ?? false
    }

    public func isCategoryDownloadFailed(
        for item: BookMetadata,
        category: LocalMediaCategory,
    ) -> Bool {
        downloadStatuses[item.id]?.categories[category]?.isFailed ?? false
    }

    public func openMediaFolder(for item: BookMetadata, category: LocalMediaCategory) {
        #if canImport(AppKit)
        Task { [weak self] in
            guard
                let directory = await BookServiceActor.shared.localMediaDirectory(
                    for: item.id,
                    category: category,
                )
            else { return }
            await MainActor.run {
                guard self != nil else { return }
                NSWorkspace.shared.activateFileViewerSelecting([directory])
                NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder")
                    .first?.activate()
            }
        }
        #endif
    }

    public func deleteDownload(for item: BookMetadata, category: LocalMediaCategory) {
        Task { [weak self] in
            guard let self else { return }
            guard hasCachedMedia(category, for: item) else { return }
            do {
                try await BookServiceActor.shared.deleteCachedMedia(
                    for: item.id,
                    category: category,
                )
                await MainActor.run {
                    if var state = downloadStatuses[item.id] {
                        state.categories[category] = nil
                        downloadStatuses[item.id] = state
                    }
                }
            } catch {
                await MainActor.run {
                    var state = downloadStatuses[item.id] ?? DownloadProgressState()
                    state.errorDescription = error.localizedDescription
                    downloadStatuses[item.id] = state
                }
            }
        }
    }

    public func pauseDownload(for item: BookMetadata, category: LocalMediaCategory) {
        Task {
            await DownloadManager.shared.pauseDownload(for: item.id, category: category)
        }
    }

    public func resumeDownload(for item: BookMetadata, category: LocalMediaCategory) {
        Task {
            await DownloadManager.shared.resumeDownload(for: item.id, category: category)
        }
    }

    public func coverVariant(for item: BookMetadata) -> CoverVariant {
        if item.hasAvailableEbook {
            return .standard
        }
        if item.hasAvailableAudiobook {
            return .audioSquare
        }
        return .standard
    }

    public func coverVariant(for item: BookMetadata, preference: CoverPreference) -> CoverVariant {
        switch preference {
            case .preferEbook, .storytellerDouble:
                if item.hasAvailableEbook {
                    return .standard
                }
                return item.hasAvailableAudiobook ? .audioSquare : .standard
            case .preferAudiobook:
                if item.hasAvailableAudiobook || item.isAudiobookOnly {
                    return .audioSquare
                }
                return .standard
        }
    }

    public func coverImage(for item: BookMetadata, variant overrideVariant: CoverVariant? = nil)
        -> Image?
    {
        let variant = overrideVariant ?? coverVariant(for: item)
        let key = coverKey(for: item, variant: variant)
        return coverStates[key]?.image
    }

    public func coverState(for item: BookMetadata, variant overrideVariant: CoverVariant? = nil)
        -> CoverImageState
    {
        let variant = overrideVariant ?? coverVariant(for: item)
        let key = coverKey(for: item, variant: variant)
        if let existing = coverStates[key] { return existing }
        let state = CoverImageState()
        coverStates[key] = state
        return state
    }

    public func ensureCoverLoaded(
        for item: BookMetadata,
        variant overrideVariant: CoverVariant? = nil,
        debugSource: String? = nil,
    ) {
        let variant = overrideVariant ?? coverVariant(for: item)
        let key = coverKey(for: item, variant: variant)
        if coverStates[key]?.image != nil {
            recordCoverTrace("skipExisting", source: debugSource)
            debugCoverLog(debugSource, "skip existing image", item: item, variant: variant)
            return
        }
        if missingCoverKeys.contains(key) {
            recordCoverTrace("skipMissing", source: debugSource)
            debugCoverLog(debugSource, "skip known missing", item: item, variant: variant)
            return
        }
        if coverTasks[key] != nil {
            recordCoverTrace("skipLoading", source: debugSource)
            debugCoverLog(debugSource, "skip already loading", item: item, variant: variant)
            return
        }
        if pendingCoverRequests[key] != nil {
            coverRequestSequence += 1
            pendingCoverRequests[key] = PendingCoverRequest(
                item: item,
                variant: variant,
                debugSource: debugSource,
                sequence: coverRequestSequence,
            )
            recordCoverTrace("requestUpdated", source: debugSource)
            schedulePendingCoverRequestFlush(delay: .seconds(1))
            return
        }

        coverRequestSequence += 1
        pendingCoverRequests[key] = PendingCoverRequest(
            item: item,
            variant: variant,
            debugSource: debugSource,
            sequence: coverRequestSequence,
        )
        recordCoverTrace("requestQueued", source: debugSource)
        schedulePendingCoverRequestFlush(delay: .milliseconds(100))
    }

    private func schedulePendingCoverRequestFlush(delay: Duration) {
        guard coverRequestFlushTask == nil else { return }
        coverRequestFlushTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: delay)
            guard let self else { return }
            self.coverRequestFlushTask = nil
            self.flushPendingCoverRequests()
            if !self.pendingCoverRequests.isEmpty {
                self.schedulePendingCoverRequestFlush(delay: .seconds(1))
            }
        }
    }

    private func flushPendingCoverRequests() {
        guard !pendingCoverRequests.isEmpty else { return }
        let batch =
            pendingCoverRequests
            .sorted { lhs, rhs in lhs.value.sequence > rhs.value.sequence }
            .prefix(48)
        for (key, request) in batch {
            pendingCoverRequests.removeValue(forKey: key)
            startCoverLoad(
                request.item,
                variant: request.variant,
                debugSource: request.debugSource,
            )
        }
        recordCoverTrace("requestFlush", source: nil)
    }

    private func startCoverLoad(
        _ item: BookMetadata,
        variant: CoverVariant,
        debugSource: String?,
    ) {
        let key = coverKey(for: item, variant: variant)
        if coverStates[key]?.image != nil {
            recordCoverTrace("skipExisting", source: debugSource)
            debugCoverLog(debugSource, "skip existing image", item: item, variant: variant)
            return
        }
        if missingCoverKeys.contains(key) {
            recordCoverTrace("skipMissing", source: debugSource)
            debugCoverLog(debugSource, "skip known missing", item: item, variant: variant)
            return
        }
        if coverTasks[key] != nil {
            recordCoverTrace("skipLoading", source: debugSource)
            debugCoverLog(debugSource, "skip already loading", item: item, variant: variant)
            return
        }

        let isConnected = connectionStatus(forSourceID: item.sourceID) == .connected
        let limiter = coverLoadLimiter
        recordCoverTrace("start", source: debugSource)
        debugCoverLog(
            debugSource,
            "start task connected=\(isConnected)",
            item: item,
            variant: variant,
        )

        coverTasks[key] = Task { [weak self] in
            guard await limiter.acquire() else {
                await MainActor.run {
                    self?.recordCoverTrace("limiterCancelled", source: debugSource)
                    self?.debugCoverLog(
                        debugSource,
                        "limiter acquire cancelled",
                        item: item,
                        variant: variant,
                    )
                    self?.coverTasks[key] = nil
                }
                return
            }
            defer {
                Task {
                    await limiter.release()
                }
            }
            guard let self else { return }

            self.uncancellableCoverKeys.insert(key)
            let loadStarted = CFAbsoluteTimeGetCurrent()
            let result = await Task.detached(priority: .utility) {
                await Self.loadCoverOffMain(item: item, variant: variant, isConnected: isConnected)
            }.value
            let loadElapsed = (CFAbsoluteTimeGetCurrent() - loadStarted) * 1000

            guard !Task.isCancelled else {
                self.recordCoverTrace("cancelledAfterResult", source: debugSource)
                self.debugCoverLog(
                    debugSource,
                    "task cancelled after result loadMs=\(String(format: "%.1f", loadElapsed))",
                    item: item,
                    variant: variant,
                )
                self.coverTasks[key] = nil
                self.uncancellableCoverKeys.remove(key)
                return
            }

            self.recordCoverTrace("enqueue", source: debugSource)
            self.debugCoverLog(
                debugSource,
                "enqueue result=\(result.debugDescription) loadMs=\(String(format: "%.1f", loadElapsed))",
                item: item,
                variant: variant,
            )
            self.enqueueCoverPublish(result, for: item, variant: variant, debugSource: debugSource)
            self.coverTasks[key] = nil
        }
    }

    public func coverStatusLines(for item: BookMetadata) async -> [String] {
        var lines: [String] = []
        if item.hasAvailableEbook || !item.hasAvailableAudiobook {
            lines.append(await Self.coverStatusLine(label: "Ebook", bookID: item.id, audio: false))
        }
        if item.hasAvailableAudiobook {
            lines.append(
                await Self.coverStatusLine(label: "Audiobook", bookID: item.id, audio: true)
            )
        }
        return lines
    }

    private static nonisolated func coverStatusLine(
        label: String,
        bookID: BookID,
        audio: Bool,
    ) async -> String {
        guard
            let data = await CoverCacheActor.shared.cachedFullCoverData(for: bookID, audio: audio)
        else { return "\(label) reduced size" }
        guard
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return "\(label) full size" }
        return "\(label) full size (\(width) x \(height))"
    }

    public func prioritizeFullCovers(for item: BookMetadata) {
        Task(priority: .utility) {
            if item.hasAvailableEbook || !item.hasAvailableAudiobook {
                await CoverCacheActor.shared.prioritizeFullCover(
                    for: item.id,
                    audio: false,
                    version: item.updatedAt,
                )
            }
            if item.hasAvailableAudiobook {
                await CoverCacheActor.shared.prioritizeFullCover(
                    for: item.id,
                    audio: true,
                    version: item.updatedAt,
                )
            }
        }
    }

    private func retrySkippedCoverLoads() {
        guard !skippedCoverRetries.isEmpty else { return }
        let retries = skippedCoverRetries
        skippedCoverRetries.removeAll()
        for entry in retries.values {
            ensureCoverLoaded(for: entry.item, variant: entry.variant)
        }
    }

    public func cancelCoverLoad(
        for item: BookMetadata,
        variant overrideVariant: CoverVariant? = nil,
    ) {
        let variant = overrideVariant ?? coverVariant(for: item)
        let key = coverKey(for: item, variant: variant)
        guard coverStates[key]?.image == nil else { return }
        if pendingCoverRequests.removeValue(forKey: key) != nil {
            recordCoverTrace("requestDropped", source: nil)
            return
        }
        guard let task = coverTasks[key] else { return }
        if uncancellableCoverKeys.contains(key) {
            recordCoverTrace("cancelIgnoredVisible", source: nil)
            return
        }
        task.cancel()
        coverTasks[key] = nil
        recordCoverTrace("cancelledWaiting", source: nil)
    }

    private func enqueueCoverPublish(
        _ result: CoverLoadResult,
        for item: BookMetadata,
        variant: CoverVariant,
        debugSource: String?,
    ) {
        let key = coverKey(for: item, variant: variant)
        pendingCoverPublishes[key] = PendingCoverPublish(
            item: item,
            variant: variant,
            result: result,
            debugSource: debugSource,
        )
        schedulePendingCoverFlush()
    }

    private func schedulePendingCoverFlush() {
        guard !pendingCoverPublishes.isEmpty else { return }
        guard coverPublishFlushTask == nil else { return }
        coverPublishFlushTask = Task { @MainActor [weak self] in
            while let self, !self.pendingCoverPublishes.isEmpty {
                let flushStarted = CFAbsoluteTimeGetCurrent()
                let batchKeys = Array(self.pendingCoverPublishes.keys.prefix(8))
                for key in batchKeys {
                    guard let pending = self.pendingCoverPublishes.removeValue(forKey: key) else {
                        continue
                    }
                    self.publishCoverResult(
                        pending.result,
                        for: pending.item,
                        variant: pending.variant,
                        debugSource: pending.debugSource,
                    )
                }
                let flushElapsed = (CFAbsoluteTimeGetCurrent() - flushStarted) * 1000
                debugLog(
                    "[CoverPerf][flush] publishBatch count=\(batchKeys.count) remaining=\(self.pendingCoverPublishes.count) elapsedMs=\(String(format: "%.1f", flushElapsed))"
                )
                if !self.pendingCoverPublishes.isEmpty {
                    try? await Task.sleep(for: .milliseconds(33))
                }
            }
            self?.coverPublishFlushTask = nil
        }
    }

    private func publishCoverResult(
        _ result: CoverLoadResult,
        for item: BookMetadata,
        variant: CoverVariant,
        debugSource: String?,
    ) {
        let key = coverKey(for: item, variant: variant)
        debugCoverLog(
            debugSource,
            "publish result=\(result.debugDescription)",
            item: item,
            variant: variant,
        )
        recordCoverTrace("publish", source: debugSource)
        switch result {
            case .found(let payload, let persist):
                skippedCoverRetries.removeValue(forKey: key)
                registerCover(payload, for: item, variant: variant, persist: persist)
            case .missing:
                debugLog(
                    "[MediaViewModel] ensureCoverLoaded: no cover found for '\(item.title)' (\(item.id)), variant=\(variant)"
                )
                missingCoverKeys.insert(key)
            case .skipped:
                skippedCoverRetries[key] = (item, variant)
        }
        uncancellableCoverKeys.remove(key)
    }

    private func debugCoverLog(
        _ source: String?,
        _ message: String,
        item: BookMetadata,
        variant: CoverVariant,
    ) {
        if source == nil, !message.hasPrefix("task cancelled after result") { return }
        let source = source ?? "unspecified"
        debugLog(
            "[CoverPerf][\(source)] \(message) title='\(item.title)' id=\(item.id) variant=\(variant)"
        )
    }

    private func recordCoverTrace(_ event: String, source: String?) {
        let source = source ?? "unspecified"
        coverTraceCounts["\(source).\(event)", default: 0] += 1
        guard coverTraceFlushTask == nil else { return }
        coverTraceFlushTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            guard let self else { return }
            let counts = self.coverTraceCounts
            self.coverTraceCounts.removeAll()
            self.coverTraceFlushTask = nil
            guard !counts.isEmpty else { return }
            let summary =
                counts
                .sorted { lhs, rhs in lhs.key < rhs.key }
                .map { "\($0.key)=\($0.value)" }
                .joined(separator: ", ")
            debugLog(
                "[CoverPerf][summary] \(summary) pendingRequests=\(self.pendingCoverRequests.count) activeTasks=\(self.coverTasks.count) activeLoads=\(self.uncancellableCoverKeys.count) pendingPublishes=\(self.pendingCoverPublishes.count)"
            )
        }
    }

    private static nonisolated func loadCoverOffMain(
        item: BookMetadata,
        variant: CoverVariant,
        isConnected: Bool,
    ) async -> CoverLoadResult {
        let params = variant.requestParameters
        let coverStart = CFAbsoluteTimeGetCurrent()
        let response = await BookServiceActor.shared.loadCover(
            for: item.id,
            audio: params.audio,
            width: params.width,
            height: params.height,
            version: item.updatedAt,
            allowNetwork: isConnected,
            policy: .cachedThenFetch,
        )
        let coverElapsed = (CFAbsoluteTimeGetCurrent() - coverStart) * 1000
        debugLog(
            "[CoverDiag] book=\(item.id) source=\(item.sourceID) allowNetwork=\(isConnected) result=\(response.diagLabel) elapsed=\(String(format: "%.0f", coverElapsed))ms"
        )
        switch response {
            case .cached(let data):
                guard let payload = makeCoverPayload(from: data) else {
                    return .missing
                }
                return .found(payload, persist: false)
            case .fetched(let cover):
                guard let payload = makeCoverPayload(from: cover.data) else {
                    return .missing
                }
                return .found(payload, persist: true)
            case .missing:
                return .missing
            case .skippedOffline:
                return .skipped
        }
    }

    public func refreshCover(
        for item: BookMetadata,
        variant overrideVariant: CoverVariant? = nil,
    ) async {
        let variant = overrideVariant ?? coverVariant(for: item)
        let key = coverKey(for: item, variant: variant)
        debugLog(
            "[MetadataCoverRefresh] MediaVM refreshCover start bookID=\(item.id) variant=\(variant) updatedAt=\(item.updatedAt ?? "nil") connectionStatus=\(connectionStatus)"
        )
        pendingCoverRequests.removeValue(forKey: key)
        coverTasks[key]?.cancel()
        coverTasks[key] = nil
        uncancellableCoverKeys.remove(key)
        let hadExistingImage = coverStates[key]?.image != nil
        missingCoverKeys.remove(key)

        guard connectionStatus(forSourceID: item.sourceID) == .connected else {
            debugLog(
                "[MetadataCoverRefresh] MediaVM refreshCover skipped disconnected bookID=\(item.id) variant=\(variant) hadExistingImage=\(hadExistingImage)"
            )
            if !hadExistingImage {
                ensureCoverLoaded(for: item, variant: variant)
            }
            return
        }

        let params = variant.requestParameters
        let response = await BookServiceActor.shared.loadCover(
            for: item.id,
            audio: params.audio,
            width: params.width,
            height: params.height,
            version: item.updatedAt,
            allowNetwork: true,
            policy: .forceRefresh,
        )
        var cover: BookCover?
        if case .fetched(let fetched) = response {
            cover = fetched
        }
        if let cover {
            debugLog(
                "[MetadataCoverRefresh] MediaVM refreshCover received cover bookID=\(item.id) variant=\(variant) bytes=\(cover.data.count) contentType=\(cover.contentType ?? "nil")"
            )
            if let payload = Self.makeCoverPayload(from: cover.data) {
                registerCover(payload, for: item, variant: variant)
            } else if !hadExistingImage {
                debugLog(
                    "[MetadataCoverRefresh] MediaVM refreshCover invalid payload bookID=\(item.id) variant=\(variant)"
                )
                registerCover(nil, for: item, variant: variant)
            }
        } else if !hadExistingImage {
            debugLog(
                "[MetadataCoverRefresh] MediaVM refreshCover missing cover bookID=\(item.id) variant=\(variant)"
            )
            registerCover(nil, for: item, variant: variant)
        } else {
            debugLog(
                "[MetadataCoverRefresh] MediaVM refreshCover nil but preserving existing image bookID=\(item.id) variant=\(variant)"
            )
        }
    }

    public func deleteLocalCoverCache() async -> Bool {
        for task in coverTasks.values {
            task.cancel()
        }
        pendingCoverRequests.removeAll()
        coverRequestFlushTask?.cancel()
        coverRequestFlushTask = nil
        coverTasks.removeAll()
        uncancellableCoverKeys.removeAll()
        for state in coverStates.values {
            state.image = nil
            state.cgImage = nil
            #if canImport(AppKit)
            state.nsImage = nil
            #endif
        }
        missingCoverKeys.removeAll()

        do {
            try await BookServiceActor.shared.removeAllCachedCovers()
            debugLog("[MediaViewModel] Deleted local cover cache.")
            return true
        } catch {
            debugLog("[MediaViewModel] Failed to delete local cover cache: \(error)")
            return false
        }
    }

    public func invalidateCoverCache(
        for bookID: BookID,
        variants: [CoverVariant] = [.standard, .audioSquare],
    ) async {
        debugLog(
            "[MetadataCoverRefresh] MediaVM invalidateCoverCache start bookID=\(bookID) variants=\(variants)"
        )
        for variant in variants {
            let key = CoverKey(id: bookID, variant: variant)
            pendingCoverRequests.removeValue(forKey: key)
            coverTasks[key]?.cancel()
            coverTasks[key] = nil
            uncancellableCoverKeys.remove(key)
            if let state = coverStates[key] {
                debugLog(
                    "[MetadataCoverRefresh] MediaVM invalidateCoverCache clearing state bookID=\(bookID) variant=\(variant) stateObject=\(ObjectIdentifier(state))"
                )
                state.image = nil
                state.cgImage = nil
                #if canImport(AppKit)
                state.nsImage = nil
                #endif
            } else {
                debugLog(
                    "[MetadataCoverRefresh] MediaVM invalidateCoverCache no existing state bookID=\(bookID) variant=\(variant)"
                )
            }
            missingCoverKeys.remove(key)
        }

        do {
            try await BookServiceActor.shared.invalidateCachedCovers(for: bookID)
            debugLog(
                "[MetadataCoverRefresh] MediaVM invalidateCoverCache removed filesystem covers bookID=\(bookID)"
            )
        } catch {
            debugLog(
                "[MetadataCoverRefresh] MediaVM invalidateCoverCache failed bookID=\(bookID) error=\(error)"
            )
        }
    }

    private func registerCover(
        _ payload: CoverImagePayload?,
        for item: BookMetadata,
        variant: CoverVariant,
        persist: Bool = true,
    ) {
        let key = coverKey(for: item, variant: variant)
        let state = coverStates[key] ?? CoverImageState()
        coverStates[key] = state

        guard let payload else {
            debugLog(
                "[MediaViewModel] Registering missing cover for '\(item.title)' (\(item.id)), variant=\(variant)."
            )
            debugLog(
                "[MetadataCoverRefresh] MediaVM registerCover missing bookID=\(item.id) variant=\(variant) stateObject=\(ObjectIdentifier(state))"
            )
            missingCoverKeys.insert(key)
            state.image = nil
            state.cgImage = nil
            #if canImport(AppKit)
            state.nsImage = nil
            #endif
            return
        }

        let cgImage = payload.cgImage.image
        CoverImageBookIndex.register(
            cgImage,
            bookID: item.id,
            audio: variant.requestParameters.audio,
        )
        state.cgImage = cgImage
        #if canImport(AppKit)
        state.nsImage = NSImage(
            cgImage: cgImage,
            size: NSSize(width: cgImage.width, height: cgImage.height),
        )
        state.image = Image(decorative: cgImage, scale: 1, orientation: .up)
        #elseif canImport(UIKit)
        state.image = Image(decorative: cgImage, scale: 1, orientation: .up)
        #endif

        debugLog(
            "[MetadataCoverRefresh] MediaVM registerCover image bookID=\(item.id) variant=\(variant) stateObject=\(ObjectIdentifier(state)) pixels=\(cgImage.width)x\(cgImage.height) persist=\(persist)"
        )

        missingCoverKeys.remove(key)

        guard persist else { return }
        Task {
            await BookServiceActor.shared.persistCachedCover(
                bookID: item.id,
                audio: variant.requestParameters.audio,
                data: payload.data,
            )
        }
    }

    private func coverKey(for item: BookMetadata, variant: CoverVariant) -> CoverKey {
        CoverKey(id: item.id, variant: variant)
    }

    private func coverVariantsToLoad(for _: BookMetadata) -> [CoverVariant] {
        [.standard, .audioSquare]
    }

    private static nonisolated func makeCoverPayload(
        from data: Data,
        maxPixelSize: Int = 360,
    ) -> CoverImagePayload? {
        let options: CFDictionary =
            [
                kCGImageSourceShouldCache: false
            ] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, options) else { return nil }
        let thumbnailOptions: CFDictionary =
            [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceShouldCacheImmediately: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            ] as CFDictionary
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions) else {
            return nil
        }
        return CoverImagePayload(data: data, cgImage: SendableCGImage(image))
    }

    public func loadSmartShelves() async {
        do {
            let shelves = try await FilesystemActor.shared.loadSmartShelves()
            self.smartShelves = shelves
            scheduleLibraryDerivation(reason: "loadSmartShelves")
        } catch {
            debugLog("[MediaViewModel] Failed to load smart shelves: \(error)")
        }
    }

    public func saveSmartShelf(_ shelf: SmartShelf) async {
        if let index = smartShelves.firstIndex(where: { $0.id == shelf.id }) {
            smartShelves[index] = shelf
        } else {
            smartShelves.append(shelf)
        }
        smartShelfBooksCache.removeValue(forKey: shelf.id)
        scheduleLibraryDerivation(reason: "saveSmartShelf")
        do {
            try await FilesystemActor.shared.saveSmartShelves(smartShelves)
        } catch {
            debugLog("[MediaViewModel] Failed to save smart shelves: \(error)")
        }
    }

    public func deleteSmartShelf(id: UUID) async {
        smartShelves.removeAll { $0.id == id }
        smartShelfBooksCache.removeValue(forKey: id)
        scheduleLibraryDerivation(reason: "deleteSmartShelf")
        do {
            try await FilesystemActor.shared.saveSmartShelves(smartShelves)
        } catch {
            debugLog("[MediaViewModel] Failed to save smart shelves after delete: \(error)")
        }
    }

    public func booksForShelf(_ shelf: SmartShelf) -> [BookMetadata] {
        libraryViewSnapshot.smartShelfBooks[shelf.id] ?? smartShelfBooksCache[shelf.id] ?? []
    }

    public func showSyncNotification(_ notification: SyncNotification) {
        syncNotification = notification
        if notification.failedBookIDs.isEmpty {
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(5))
                if syncNotification?.id == notification.id {
                    syncNotification = nil
                }
            }
        }
    }

    public func dismissSyncNotification() {
        syncNotification = nil
    }

    public func ignoreFailedSyncs(_ failedBookIDs: [BookID]) {
        Task {
            for bookID in failedBookIDs {
                await ProgressSyncActor.shared.removePendingSync(for: bookID)
            }
            await MainActor.run {
                self.syncNotification = nil
            }
            await self.refreshMetadata(source: "ignoreFailedSyncs")
        }
    }
}
