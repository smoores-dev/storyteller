import Foundation

public struct IncomingServerPosition: Sendable {
    public let locator: BookLocator
    public let timestamp: Double

    public init(locator: BookLocator, timestamp: Double) {
        self.locator = locator
        self.timestamp = timestamp
    }
}

public struct BookProgress: Sendable, Equatable {
    public let locator: BookLocator?
    public let timestamp: Double?
    public let source: ProgressSource

    public enum ProgressSource: Sendable, Equatable {
        case saved
        case pendingSync
    }

    public var progressFraction: Double {
        let raw =
            locator?.locations?.totalProgression
            ?? locator?.locations?.progression
            ?? 0
        return min(max(raw, 0), 1)
    }

    public init(
        locator: BookLocator?,
        timestamp: Double?,
        source: ProgressSource,
    ) {
        self.locator = locator
        self.timestamp = timestamp
        self.source = source
    }
}

struct ProgressQueuePersistence: Sendable {
    var load: @Sendable () async throws -> [PendingProgressSync]
    var save: @Sendable ([PendingProgressSync]) async throws -> Void

    static let live = Self(
        load: { try await FilesystemActor.shared.loadProgressQueue() },
        save: { try await FilesystemActor.shared.saveProgressQueue($0) },
    )
}

@globalActor
public actor ProgressSyncActor {
    public static let shared = ProgressSyncActor()

    private static let maxHistoryEntriesPerBook = 5000
    private static let minHistoryEntriesPerBook = 20
    private static let historyRetentionMs: Double = 24 * 60 * 60 * 1000

    enum QueueResult: Sendable {
        case queued  // Successfully added to queue
        case replacedOlder  // Replaced an older entry in queue
        case skippedNoChange  // Same timestamp as server/queue - nothing to do
        case skippedQueueHasNewer  // Queue already has newer entry
        case rejectedNewerPosition  // Server position is newer than incoming
    }

    private var pendingProgressQueue: [PendingProgressSync] = []
    /// Durable positions with no upload pending. Pending positions take precedence.
    private var storedPositions: [BookID: BookReadingPosition] = [:]
    private var lastWakeTimestamp: TimeInterval = Date().timeIntervalSince1970
    private var queueLoaded = false
    private var historyLoaded = false

    private var syncHistory: [BookID: [SyncHistoryEntry]] = [:]

    private var observers: [UUID: @Sendable () -> Void] = [:]
    private var syncNotificationCallback: (@Sendable @MainActor (Int, [BookID]) -> Void)?

    private var incomingPositionObservers:
        [UUID: (bookID: BookID, callback: @Sendable (IncomingServerPosition) -> Void)] =
            [:]
    private var pollingTask: Task<Void, Never>? = nil
    private var started = false

    private var queueFlushTask: Task<Void, Never>? = nil
    private var queueFlushRequested = false
    private var queueFlushNotifyUser = false
    private var lastQueueFlushAttempt: Date?
    private let queuePersistence: ProgressQueuePersistence
    private var progressCommitTask: Task<Void, Never>?

    public init() { queuePersistence = .live }

    init(queuePersistence: ProgressQueuePersistence) {
        self.queuePersistence = queuePersistence
    }

    func start() async {
        guard !started else { return }
        started = true
        await loadQueueFromDisk()
        await loadHistoryFromDisk()
    }

    private func ensureQueueLoaded() async -> Bool {
        guard !queueLoaded else { return true }
        await loadQueueFromDisk()
        return queueLoaded
    }

    private func ensureHistoryLoaded() async -> Bool {
        guard !historyLoaded else { return true }
        await loadHistoryFromDisk()
        return historyLoaded
    }

    /// Sync progress with full introspection data for debugging.
    /// - Parameters:
    ///   - bookID: The book's source-scoped identity
    ///   - locator: The reading position
    ///   - timestamp: Unix millisecond timestamp of the position
    ///   - reason: Why this sync was triggered
    ///   - sourceIdentifier: Human-readable source like "CarPlay/Audiobook", "Ebook Player"
    ///   - locationDescription: Human-readable position like "Chapter 3, 22%"
    public func syncProgress(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
        reason: SyncReason,
        sourceIdentifier: String = "Unknown",
        locationDescription: String = "",
        contextText: String? = nil,
    ) async -> SyncResult {
        debugLog(
            "[PSA] syncProgress: bookID=\(bookID), reason=\(reason.rawValue), timestamp=\(timestamp), source=\(sourceIdentifier)"
        )

        let locatorSummary = buildLocatorSummary(locator)

        guard
            let queueResult = await queueOfflineProgress(
                bookID: bookID,
                locator: locator,
                timestamp: timestamp,
                syncedToStoryteller: false,
            )
        else {
            return .failed
        }

        switch queueResult {
            case .rejectedNewerPosition:
                let serverTs = storedPositions[bookID]?.timestamp ?? 0
                let rejectionNote = "rejected: server has newer (\(serverTs) > \(timestamp))"
                await addHistoryEntry(
                    bookID: bookID,
                    timestamp: timestamp,
                    sourceIdentifier: sourceIdentifier,
                    locationDescription: locationDescription,
                    reason: reason,
                    result: .rejectedAsOlder,
                    locatorSummary: "\(locatorSummary)\n\(rejectionNote)",
                    locator: locator,
                )
                debugLog("[PSA] syncProgress: rejected as older than server")
                return .success

            case .skippedNoChange, .skippedQueueHasNewer:
                return .success

            case .queued, .replacedOlder:
                break
        }

        await updateLocalMetadataProgress(
            bookID: bookID,
            locator: locator,
            timestamp: timestamp,
        )

        await addHistoryEntry(
            bookID: bookID,
            timestamp: timestamp,
            sourceIdentifier: sourceIdentifier,
            locationDescription: locationDescription,
            reason: reason,
            result: .queued,
            locatorSummary: locatorSummary,
            locator: locator,
        )

        await ReadingTimelineActor.shared.record(
            bookID: bookID,
            locator: locator,
            timestamp: timestamp,
            reason: reason,
            sourceIdentifier: sourceIdentifier,
            locationDescription: locationDescription,
            contextText: contextText,
        )

        await notifyObservers()
        if reason == .periodicDuringActivePlayback {
            let interval = await SettingsActor.shared.config.sync.progressSyncIntervalSeconds
            if periodicFlushIsDue(interval: interval, now: Date()) {
                scheduleQueueFlush()
            }
        } else {
            scheduleQueueFlush()
        }
        return .queued
    }

    private func buildLocatorSummary(_ locator: BookLocator) -> String {
        var parts: [String] = []
        parts.append("href: \(locator.href)")
        if let fragments = locator.locations?.fragments, !fragments.isEmpty {
            parts.append("fragments: \(fragments.joined(separator: ", "))")
        }
        if let prog = locator.locations?.totalProgression {
            parts.append("total: \(String(format: "%.1f%%", prog * 100))")
        }
        return parts.joined(separator: " | ")
    }

    /// Flushes the pending queue to the server without making the caller wait: the
    /// send runs on a background task. Calls made while a flush is in flight are
    /// absorbed into a single rerun after it finishes. Pass notifyUser to show the
    /// sync-result toast when the flush completes.
    public func scheduleQueueFlush(notifyUser: Bool = false) {
        queueFlushRequested = true
        queueFlushNotifyUser = queueFlushNotifyUser || notifyUser
        guard queueFlushTask == nil else { return }
        queueFlushTask = Task {
            while queueFlushRequested {
                queueFlushRequested = false
                let notify = queueFlushNotifyUser
                queueFlushNotifyUser = false
                _ = await flushQueue(notifyUser: notify)
            }
            queueFlushTask = nil
        }
    }

    public func syncPendingQueue() async -> (synced: Int, failed: Int) {
        await flushQueue(notifyUser: true)
    }

    func periodicFlushIsDue(interval: TimeInterval, now: Date) -> Bool {
        interval > 0
            && now >= (lastQueueFlushAttempt?.addingTimeInterval(interval) ?? .distantPast)
    }

    func flushQueue(notifyUser: Bool, now: Date = Date()) async -> (synced: Int, failed: Int) {
        lastQueueFlushAttempt = now
        guard await ensureQueueLoaded() else { return (0, 0) }
        debugLog("[PSA] syncPendingQueue: starting with \(pendingProgressQueue.count) items")

        guard !pendingProgressQueue.isEmpty else {
            debugLog("[PSA] syncPendingQueue: queue empty")
            return (0, 0)
        }

        var syncedCount = 0
        var failedBookIDs: [BookID] = []

        let bookIDs = pendingProgressQueue.map(\.bookID)
        for bookID in bookIDs {
            let sourceStatus = await BookServiceActor.shared.connectionStatus(
                sourceID: bookID.sourceID
            )
            guard sourceStatus == .connected else {
                debugLog("[PSA] syncPendingQueue: source not connected, skipping \(bookID)")
                continue
            }

            // Read the live entry just before sending: every send below suspends this
            // actor, and a newer position may have replaced the entry in the meantime.
            guard let pending = pendingProgressQueue.first(where: { $0.bookID == bookID }),
                !pending.syncedToStoryteller
            else { continue }

            let result = await BookServiceActor.shared.sendProgressToServer(
                bookID: pending.bookID,
                locator: pending.locator,
                timestamp: pending.timestamp,
            )
            if result == .success {
                guard await recordUpload(pending) else { continue }
                syncedCount += 1

                await updateHistoryResult(
                    bookID: pending.bookID,
                    timestamp: pending.timestamp,
                    result: .sent,
                )
                debugLog("[PSA] syncPendingQueue: \(pending.bookID) sent successfully")
            } else if result == .failure {
                debugLog("[PSA] syncPendingQueue: \(pending.bookID) failed permanently")
                failedBookIDs.append(pending.bookID)
            }
        }

        let failedCount = failedBookIDs.count
        debugLog("[PSA] syncPendingQueue: complete - sent=\(syncedCount), failed=\(failedCount)")

        if syncedCount > 0 || failedCount > 0 {
            await notifyObservers()
            if notifyUser {
                await syncNotificationCallback?(syncedCount, failedBookIDs)
            }
        }

        return (syncedCount, failedCount)
    }

    func recordUpload(_ item: PendingProgressSync) async -> Bool {
        let saved = await commitProgress { pending, server in
            if item.timestamp > (server[item.bookID]?.timestamp ?? 0) {
                server[item.bookID] = Self.storedPosition(from: item)
            }
            if let index = pending.firstIndex(where: {
                $0.bookID == item.bookID && $0.timestamp == item.timestamp
            }) {
                pending[index].syncedToStoryteller = true
            }
            return true
        }
        return saved == true
    }

    /// Marks a queued position as uploaded. The upload may have raced a newer local
    /// position, so only confirm the entry if its timestamp still matches.
    public func confirmUpload(bookID: BookID, timestamp: Double) async {
        guard await ensureQueueLoaded() else { return }

        guard let index = pendingProgressQueue.firstIndex(where: { $0.bookID == bookID }) else {
            debugLog("[PSA] confirmUpload: no queue entry for \(bookID)")
            return
        }

        let pending = pendingProgressQueue[index]
        guard abs(pending.timestamp - timestamp) < 1.0 else {
            debugLog(
                "[PSA] confirmUpload: queue moved on for \(bookID) (queued=\(pending.timestamp), uploaded=\(timestamp))"
            )
            return
        }
        guard !pending.syncedToStoryteller else { return }

        guard await recordUpload(pending) else { return }
        await updateHistoryResult(
            bookID: bookID,
            timestamp: pending.timestamp,
            result: .sent,
        )
        await notifyObservers()
        debugLog("[PSA] confirmUpload: confirmed \(bookID) ts=\(pending.timestamp)")
    }

    public func getPendingProgressSyncs() async -> [PendingProgressSync] {
        guard await ensureQueueLoaded() else { return [] }
        return pendingProgressQueue
    }

    public func removePendingSync(for bookID: BookID) async {
        guard await ensureQueueLoaded() else { return }
        await removeFromQueue(bookID: bookID)
        await notifyObservers()
    }

    public func restoreCachedPositions(_ positions: [BookID: BookReadingPosition]) async {
        _ = await commitProgress { pending, server in
            let pendingIDs = Set(pending.map(\.bookID))
            for (bookID, position) in positions {
                guard server[bookID] == nil, !pendingIDs.contains(bookID),
                    position.locator != nil, (position.timestamp ?? 0) > 0
                else { continue }
                server[bookID] = position
            }
        }
    }

    public func updateServerPositions(from metadata: [BookMetadata]) async {
        let positions = Dictionary(
            metadata.compactMap { book in book.position.map { (book.id, $0) } },
            uniquingKeysWith: { first, second in
                (first.timestamp ?? 0) >= (second.timestamp ?? 0) ? first : second
            },
        )
        await updateServerPositions(positions)
    }

    public func updateServerPositions(_ positions: [BookID: BookReadingPosition]) async {
        let changes = await receiveServerPositions(positions)
        for (bookID, incoming) in positions {
            guard let change = changes[bookID],
                let timestamp = incoming.timestamp
            else { continue }

            if let pending = change.previousPending, change.result != .serverIncomingRejected {
                await updateHistoryResult(
                    bookID: bookID,
                    timestamp: pending.timestamp,
                    result: .completed,
                )
            }
            guard change.result != .completed else { continue }
            let locationDescription = buildLocationDescription(from: incoming.locator)
            await addHistoryEntry(
                bookID: bookID,
                timestamp: timestamp,
                sourceIdentifier: "Server",
                locationDescription: locationDescription,
                reason: .connectionRestored,
                result: change.result,
                locatorSummary: incoming.locator.map { buildLocatorSummary($0) } ?? "no locator",
                locator: incoming.locator,
            )
            if change.result == .serverIncomingAccepted, let locator = incoming.locator {
                await ReadingTimelineActor.shared.record(
                    bookID: bookID,
                    locator: locator,
                    timestamp: timestamp,
                    reason: .connectionRestored,
                    sourceIdentifier: "Server",
                    locationDescription: locationDescription,
                )
            }
        }
    }

    func receiveServerPositions(_ positions: [BookID: BookReadingPosition]) async
        -> [BookID: (
            result: SyncHistoryEntry.SyncHistoryResult, previousPending: PendingProgressSync?
        )]
    {
        let changes = await commitProgress {
            pending,
            stored
                -> [BookID: (
                    result: SyncHistoryEntry.SyncHistoryResult,
                    previousPending: PendingProgressSync?
                )] in
            var changes:
                [BookID: (
                    result: SyncHistoryEntry.SyncHistoryResult,
                    previousPending: PendingProgressSync?
                )] = [:]
            for (bookID, incoming) in positions {
                guard let timestamp = incoming.timestamp, timestamp > 0, incoming.locator != nil
                else { continue }
                let previous = pending.first { $0.bookID == bookID }
                if let previous, abs(previous.timestamp - timestamp) < 1.0 {
                    pending.removeAll { $0.bookID == bookID }
                    stored[bookID] = incoming
                    changes[bookID] = (.completed, previous)
                    continue
                }
                guard timestamp > (stored[bookID]?.timestamp ?? 0) else { continue }
                if let previous, previous.timestamp > timestamp {
                    changes[bookID] = (.serverIncomingRejected, previous)
                    continue
                }
                pending.removeAll { $0.bookID == bookID }
                stored[bookID] = incoming
                changes[bookID] = (.serverIncomingAccepted, previous)
            }
            return changes
        }
        guard let changes else { return [:] }
        for (bookID, change) in changes where change.result == .serverIncomingAccepted {
            if let position = positions[bookID], let locator = position.locator,
                let timestamp = position.timestamp
            {
                await notifyIncomingPositionObservers(
                    bookID: bookID,
                    locator: locator,
                    timestamp: timestamp,
                )
            }
        }
        if changes.values.contains(where: { $0.result != .serverIncomingRejected }) {
            await notifyObservers()
        }
        return changes
    }

    private func buildLocationDescription(from locator: BookLocator?) -> String {
        guard let locator = locator else { return "" }
        if let title = locator.title {
            if let prog = locator.locations?.totalProgression {
                return "\(title), \(Int(prog * 100))%"
            }
            return title
        }
        if let prog = locator.locations?.totalProgression {
            return "\(Int(prog * 100))% of book"
        }
        return "Unknown Chapter"
    }

    /// Get reconciled progress for all books (pending queue takes precedence over server)
    public func getAllBookProgress() async -> [BookID: BookProgress] {
        _ = await ensureQueueLoaded()

        var result: [BookID: BookProgress] = [:]

        for (bookID, serverPosition) in storedPositions {
            if let pending = pendingProgressQueue.first(where: { $0.bookID == bookID }) {
                result[bookID] = BookProgress(
                    locator: pending.locator,
                    timestamp: pending.timestamp,
                    source: .pendingSync,
                )
            } else {
                result[bookID] = BookProgress(
                    locator: serverPosition.locator,
                    timestamp: serverPosition.timestamp,
                    source: .saved,
                )
            }
        }

        for pending in pendingProgressQueue where result[pending.bookID] == nil {
            result[pending.bookID] = BookProgress(
                locator: pending.locator,
                timestamp: pending.timestamp,
                source: .pendingSync,
            )
        }

        return result
    }

    /// Get reconciled progress for a single book
    public enum ProgressReadError: Error { case unavailable }
    public func readBookProgress(for bookID: BookID) async throws -> BookProgress? {
        guard await ensureQueueLoaded() else { throw ProgressReadError.unavailable }
        return await getBookProgress(for: bookID)
    }

    public func getBookProgress(for bookID: BookID) async -> BookProgress? {
        _ = await ensureQueueLoaded()

        if let pending = pendingProgressQueue.first(where: { $0.bookID == bookID }) {
            return BookProgress(
                locator: pending.locator,
                timestamp: pending.timestamp,
                source: .pendingSync,
            )
        }

        if let serverPosition = storedPositions[bookID] {
            return BookProgress(
                locator: serverPosition.locator,
                timestamp: serverPosition.timestamp,
                source: .saved,
            )
        }

        return nil
    }

    public func recordWakeEvent() {
        let now = Date().timeIntervalSince1970
        let sleepDuration = now - lastWakeTimestamp
        debugLog("[PSA] recordWakeEvent: sleepDuration=\(sleepDuration)s")
        lastWakeTimestamp = now
    }

    @discardableResult
    public func addObserver(_ callback: @escaping @Sendable () -> Void) -> UUID {
        let id = UUID()
        observers[id] = callback
        debugLog("[PSA] addObserver: id=\(id), total observers=\(observers.count)")
        return id
    }

    public func removeObserver(id: UUID) {
        observers.removeValue(forKey: id)
        debugLog("[PSA] removeObserver: id=\(id), total observers=\(observers.count)")
    }

    public func registerSyncNotificationCallback(
        _ callback: @escaping @Sendable @MainActor (Int, [BookID]) -> Void
    ) {
        syncNotificationCallback = callback
    }

    @discardableResult
    public func addIncomingPositionObserver(
        for bookID: BookID,
        _ callback: @escaping @Sendable (IncomingServerPosition) -> Void,
    ) -> UUID {
        let id = UUID()
        incomingPositionObservers[id] = (bookID: bookID, callback: callback)
        debugLog(
            "[PSA] addIncomingPositionObserver: id=\(id), bookID=\(bookID), total=\(incomingPositionObservers.count)"
        )
        return id
    }

    public func removeIncomingPositionObserver(id: UUID) {
        incomingPositionObservers.removeValue(forKey: id)
        debugLog(
            "[PSA] removeIncomingPositionObserver: id=\(id), total=\(incomingPositionObservers.count)"
        )
    }

    public func startPolling() {
        guard pollingTask == nil else { return }
        debugLog("[PSA] startPolling: starting continuous polling task")
        pollingTask = Task {
            while !Task.isCancelled {
                await pollServerPositions()
                let hasConnectedSource = await BookServiceActor.shared.hasConnectedSource()
                let sleepInterval: Duration =
                    hasConnectedSource
                    ? .seconds(3)
                    : .seconds(15)
                try? await Task.sleep(for: sleepInterval)
            }
            pollingTask = nil
            debugLog("[PSA] polling task ended")
        }
    }

    public func stopPolling() {
        debugLog("[PSA] stopPolling: stopping polling task")
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func pollServerPositions() async {
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        let allPaths = snapshot.mediaPaths
        let downloadedBookIDs = Set(
            allPaths.filter { _, paths in
                paths.ebookPath != nil || paths.audioPath != nil || paths.syncedPath != nil
            }.keys
        )
        guard !downloadedBookIDs.isEmpty else { return }

        for bookID in downloadedBookIDs {
            if let position = await BookServiceActor.shared.fetchBookPosition(
                bookID: bookID
            ) {
                await updateServerPositions([bookID: position])
            }
        }
    }

    private func notifyIncomingPositionObservers(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
    ) async {
        let position = IncomingServerPosition(
            locator: locator,
            timestamp: timestamp,
        )
        for (_, observer) in incomingPositionObservers where observer.bookID == bookID {
            observer.callback(position)
        }
        debugLogVerbose(
            "[PSA] notifyIncomingPositionObservers: notified observers for bookID=\(bookID)"
        )
    }

    func queueOfflineProgress(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
        syncedToStoryteller: Bool = false,
    ) async -> QueueResult? {
        let result = await commitProgress { pending, server in
            let serverTimestamp = server[bookID]?.timestamp
            if let serverTimestamp, timestamp < serverTimestamp {
                return QueueResult.rejectedNewerPosition
            }
            let existing = pending.first { $0.bookID == bookID }
            if let existing, timestamp < existing.timestamp {
                return QueueResult.skippedQueueHasNewer
            }
            if timestamp == serverTimestamp || timestamp == existing?.timestamp {
                return QueueResult.skippedNoChange
            }
            pending.removeAll { $0.bookID == bookID }
            pending.append(
                PendingProgressSync(
                    bookID: bookID,
                    locator: locator,
                    timestamp: timestamp,
                    syncedToStoryteller: syncedToStoryteller,
                )
            )
            return existing == nil ? .queued : .replacedOlder
        }
        if result == .queued || result == .replacedOlder { await notifyObservers() }
        return result
    }

    private func removeFromQueue(bookID: BookID) async {
        _ = await commitProgress { pending, stored in
            if let position = pending.first(where: { $0.bookID == bookID }),
                position.timestamp > (stored[bookID]?.timestamp ?? 0)
            {
                stored[bookID] = Self.storedPosition(from: position)
            }
            pending.removeAll { $0.bookID == bookID }
        }
    }

    private func updateLocalMetadataProgress(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
    ) async {
        await LocalMediaActor.shared.updateBookProgress(
            bookID: bookID,
            locator: locator,
            timestamp: timestamp,
        )
    }

    private func notifyObservers() async {
        debugLogVerbose("[PSA] notifyObservers: notifying \(observers.count) observers")
        for (_, callback) in observers {
            callback()
        }
    }

    private func loadQueueFromDisk() async {
        guard !queueLoaded else { return }
        do {
            let loaded = try await queuePersistence.load()
            guard !queueLoaded else { return }
            pendingProgressQueue = loaded.filter { !$0.syncedToStoryteller }
            storedPositions = Dictionary(
                loaded.filter(\.syncedToStoryteller).map {
                    ($0.bookID, Self.storedPosition(from: $0))
                },
                uniquingKeysWith: { first, second in
                    (first.timestamp ?? 0) >= (second.timestamp ?? 0) ? first : second
                },
            )
            queueLoaded = true
            debugLog("[PSA] loadQueueFromDisk: loaded \(pendingProgressQueue.count) items")
        } catch {
            guard !queueLoaded else { return }
            debugLog("[PSA] loadQueueFromDisk: failed - \(error)")
        }
    }

    /// Keeps everything from the last 24 hours up to a hard cap, but never
    /// trims below the floor so rarely-synced books still show recent events.
    private static func trimHistory(_ entries: [SyncHistoryEntry]) -> [SyncHistoryEntry] {
        let cutoff = Date().timeIntervalSince1970 * 1000 - historyRetentionMs
        var trimmed = entries.filter { $0.arrivedAt >= cutoff }
        if trimmed.count < minHistoryEntriesPerBook {
            trimmed = Array(entries.suffix(minHistoryEntriesPerBook))
        }
        if trimmed.count > maxHistoryEntriesPerBook {
            trimmed = Array(trimmed.suffix(maxHistoryEntriesPerBook))
        }
        return trimmed
    }

    private static func storedPosition(from record: PendingProgressSync) -> BookReadingPosition {
        BookReadingPosition(
            uuid: nil,
            locator: record.locator,
            timestamp: record.timestamp,
            createdAt: nil,
            updatedAt: nil,
        )
    }

    private func commitProgress<Result: Sendable>(
        _ change:
            @escaping @Sendable (inout [PendingProgressSync], inout [BookID: BookReadingPosition])
            -> Result
    ) async -> Result? {
        guard await ensureQueueLoaded() else { return nil }
        let previous = progressCommitTask
        let task = Task<Result?, Never> {
            await previous?.value
            var pending = pendingProgressQueue
            var server = storedPositions
            let result = change(&pending, &server)
            guard pending != pendingProgressQueue || server != storedPositions else {
                return result
            }

            let pendingIDs = Set(pending.map(\.bookID))
            let confirmed = server.compactMap { bookID, position -> PendingProgressSync? in
                guard !pendingIDs.contains(bookID),
                    let locator = position.locator, let timestamp = position.timestamp
                else { return nil }
                return PendingProgressSync(
                    bookID: bookID,
                    locator: locator,
                    timestamp: timestamp,
                    syncedToStoryteller: true,
                )
            }
            do {
                try await queuePersistence.save(pending + confirmed)
            } catch {
                debugLog("[PSA] commitProgress: failed - \(error)")
                return nil
            }
            pendingProgressQueue = pending
            storedPositions = server
            return result
        }
        progressCommitTask = Task { _ = await task.value }
        return await task.value
    }

    private func addHistoryEntry(
        bookID: BookID,
        timestamp: Double,
        sourceIdentifier: String,
        locationDescription: String,
        reason: SyncReason,
        result: SyncHistoryEntry.SyncHistoryResult,
        locatorSummary: String,
        locator: BookLocator? = nil,
    ) async {
        guard await ensureHistoryLoaded() else { return }

        let entry = SyncHistoryEntry(
            timestamp: timestamp,
            sourceIdentifier: sourceIdentifier,
            locationDescription: locationDescription,
            reason: reason,
            result: result,
            locatorSummary: locatorSummary,
            locator: locator,
        )

        var entries = syncHistory[bookID] ?? []
        entries.append(entry)
        entries = Self.trimHistory(entries)

        syncHistory[bookID] = entries
        await saveHistoryToDisk()
    }

    private func updateHistoryResult(
        bookID: BookID,
        timestamp: Double,
        result: SyncHistoryEntry.SyncHistoryResult,
    ) async {
        guard await ensureHistoryLoaded() else { return }

        guard var entries = syncHistory[bookID] else { return }

        if let index = entries.lastIndex(where: { $0.timestamp == timestamp }) {
            let existing = entries[index]
            entries[index] = SyncHistoryEntry(
                timestamp: existing.timestamp,
                sourceIdentifier: existing.sourceIdentifier,
                locationDescription: existing.locationDescription,
                reason: existing.reason,
                result: result,
                locatorSummary: existing.locatorSummary,
                locator: existing.locator,
            )
            syncHistory[bookID] = entries
            await saveHistoryToDisk()
        }
    }

    public func getSyncHistory(for bookID: BookID) async -> [SyncHistoryEntry] {
        guard await ensureHistoryLoaded() else { return [] }
        return syncHistory[bookID] ?? []
    }

    public func getAllSyncHistory() async -> [BookID: [SyncHistoryEntry]] {
        guard await ensureHistoryLoaded() else { return [:] }
        return syncHistory
    }

    public func clearSyncHistory(for bookID: BookID) async {
        guard await ensureHistoryLoaded() else { return }
        syncHistory.removeValue(forKey: bookID)
        await saveHistoryToDisk()
    }

    public func restorePosition(
        bookID: BookID,
        locator: BookLocator,
        locationDescription: String,
    )
        async -> SyncResult
    {
        let timestamp = floor(Date().timeIntervalSince1970 * 1000)
        return await syncProgress(
            bookID: bookID,
            locator: locator,
            timestamp: timestamp,
            reason: .userRestoredFromHistory,
            sourceIdentifier: "Restored from History",
            locationDescription: locationDescription,
        )
    }

    private func loadHistoryFromDisk() async {
        guard !historyLoaded else { return }
        do {
            let loaded = try await FilesystemActor.shared.loadSyncHistory()
            guard !historyLoaded else { return }
            syncHistory = loaded
            historyLoaded = true
        } catch {
            guard !historyLoaded else { return }
            debugLog("[PSA] loadHistoryFromDisk: failed - \(error)")
        }
    }

    private func saveHistoryToDisk() async {
        guard historyLoaded else {
            debugLog("[PSA] saveHistoryToDisk: skipped because history is not loaded")
            return
        }
        do {
            try await FilesystemActor.shared.saveSyncHistory(syncHistory)
        } catch {
            debugLog("[PSA] saveHistoryToDisk: failed - \(error)")
        }
    }
}
