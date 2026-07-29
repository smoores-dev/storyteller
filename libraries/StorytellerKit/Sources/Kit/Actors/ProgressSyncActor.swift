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
        case server
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

@globalActor
public actor ProgressSyncActor {
    public static let shared = ProgressSyncActor()

    private static let maxHistoryEntriesPerBook = 20

    private enum QueueResult {
        case queued  // Successfully added to queue
        case replacedOlder  // Replaced an older entry in queue
        case skippedNoChange  // Same timestamp as server/queue - nothing to do
        case skippedQueueHasNewer  // Queue already has newer entry
        case rejectedServerHasNewer  // Server position is newer than incoming
    }

    private var pendingProgressQueue: [PendingProgressSync] = []
    /// Latest known server position for each book. Updated when LMA loads metadata from server/disk,
    /// or when we successfully sync a position to the server.
    private var serverPositions: [BookID: BookReadingPosition] = [:]
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

    public init() {}

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
            case .rejectedServerHasNewer:
                let serverTs = serverPositions[bookID]?.timestamp ?? 0
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

        await notifyObservers()
        scheduleQueueFlush()
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

    private func flushQueue(notifyUser: Bool) async -> (synced: Int, failed: Int) {
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
            guard var pending = pendingProgressQueue.first(where: { $0.bookID == bookID }),
                !pending.syncedToStoryteller
            else { continue }

            let result = await BookServiceActor.shared.sendProgressToServer(
                bookID: pending.bookID,
                locator: pending.locator,
                timestamp: pending.timestamp,
            )
            if result == .success {
                pending.syncedToStoryteller = true
                updateServerPositionIfNewer(
                    bookID: pending.bookID,
                    locator: pending.locator,
                    timestamp: pending.timestamp,
                )
                await updateQueueItem(pending)
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

    private func updateQueueItem(_ item: PendingProgressSync) async {
        // Timestamp must match: a newer position may have replaced this entry while
        // its upload was in flight, and overwriting that entry would lose it.
        if let index = pendingProgressQueue.firstIndex(where: {
            $0.bookID == item.bookID && $0.timestamp == item.timestamp
        }) {
            pendingProgressQueue[index] = item
            await saveQueueToDisk()
        }
    }

    /// Marks a queued position as uploaded. The upload may have raced a newer local
    /// position, so only confirm the entry if its timestamp still matches.
    public func confirmUpload(bookID: BookID, timestamp: Double) async {
        guard await ensureQueueLoaded() else { return }

        guard let index = pendingProgressQueue.firstIndex(where: { $0.bookID == bookID }) else {
            debugLog("[PSA] confirmUpload: no queue entry for \(bookID)")
            return
        }

        var pending = pendingProgressQueue[index]
        guard abs(pending.timestamp - timestamp) < 1.0 else {
            debugLog(
                "[PSA] confirmUpload: queue moved on for \(bookID) (queued=\(pending.timestamp), uploaded=\(timestamp))"
            )
            return
        }
        guard !pending.syncedToStoryteller else { return }

        pending.syncedToStoryteller = true
        pendingProgressQueue[index] = pending
        updateServerPositionIfNewer(
            bookID: bookID,
            locator: pending.locator,
            timestamp: pending.timestamp,
        )
        await saveQueueToDisk()
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

    /// Called by LMA when metadata updates from server or disk.
    /// Performs timestamp-based reconciliation: only updates if incoming is newer than local,
    /// and removes pending queue items if server has confirmed a newer position.
    public func updateServerPositions(_ positions: [BookID: BookReadingPosition]) async {
        guard await ensureQueueLoaded() else { return }
        _ = await ensureHistoryLoaded()
        var updatedCount = 0
        var reconciledCount = 0

        for (bookID, incomingPosition) in positions {
            let incomingTimestamp = incomingPosition.timestamp ?? 0
            guard incomingTimestamp > 0 else { continue }

            if let pendingIndex = pendingProgressQueue.firstIndex(where: { $0.bookID == bookID }),
                abs(pendingProgressQueue[pendingIndex].timestamp - incomingTimestamp) < 1.0
            {
                let pendingTimestamp = pendingProgressQueue[pendingIndex].timestamp
                pendingProgressQueue.remove(at: pendingIndex)
                serverPositions[bookID] = incomingPosition
                await saveQueueToDisk()

                await updateHistoryResult(
                    bookID: bookID,
                    timestamp: pendingTimestamp,
                    result: .completed,
                )
                reconciledCount += 1
                continue
            }

            if let existing = serverPositions[bookID], let existingTs = existing.timestamp {
                if abs(existingTs - incomingTimestamp) < 1.0 {
                    continue
                }
            }

            let locatorSummary =
                incomingPosition.locator.map { buildLocatorSummary($0) } ?? "no locator"
            let locationDesc = buildLocationDescription(from: incomingPosition.locator)

            if let pendingIndex = pendingProgressQueue.firstIndex(where: { $0.bookID == bookID }) {
                let pending = pendingProgressQueue[pendingIndex]
                if incomingTimestamp > pending.timestamp {
                    debugLog(
                        "[PSA] updateServerPositions: server newer for \(bookID), removing pending (server: \(incomingTimestamp), pending: \(pending.timestamp))"
                    )
                    pendingProgressQueue.remove(at: pendingIndex)
                    serverPositions[bookID] = incomingPosition
                    reconciledCount += 1
                    updatedCount += 1

                    await updateHistoryResult(
                        bookID: bookID,
                        timestamp: pending.timestamp,
                        result: .completed,
                    )

                    await addHistoryEntry(
                        bookID: bookID,
                        timestamp: incomingTimestamp,
                        sourceIdentifier: "Server",
                        locationDescription: locationDesc,
                        reason: .connectionRestored,
                        result: .serverIncomingAccepted,
                        locatorSummary: locatorSummary,
                        locator: incomingPosition.locator,
                    )

                    if let locator = incomingPosition.locator {
                        await notifyIncomingPositionObservers(
                            bookID: bookID,
                            locator: locator,
                            timestamp: incomingTimestamp,
                        )
                    }
                } else {
                    debugLog(
                        "[PSA] updateServerPositions: pending newer for \(bookID), keeping pending (server: \(incomingTimestamp), pending: \(pending.timestamp))"
                    )

                    await addHistoryEntry(
                        bookID: bookID,
                        timestamp: incomingTimestamp,
                        sourceIdentifier: "Server",
                        locationDescription: locationDesc,
                        reason: .connectionRestored,
                        result: .serverIncomingRejected,
                        locatorSummary:
                            "rejected: pending is newer (\(pending.timestamp) > \(incomingTimestamp))",
                        locator: incomingPosition.locator,
                    )
                }
            } else {
                if let existing = serverPositions[bookID] {
                    let existingTimestamp = existing.timestamp ?? 0
                    if incomingTimestamp > existingTimestamp {
                        serverPositions[bookID] = incomingPosition
                        updatedCount += 1

                        await addHistoryEntry(
                            bookID: bookID,
                            timestamp: incomingTimestamp,
                            sourceIdentifier: "Server",
                            locationDescription: locationDesc,
                            reason: .connectionRestored,
                            result: .serverIncomingAccepted,
                            locatorSummary: locatorSummary,
                            locator: incomingPosition.locator,
                        )

                        if let locator = incomingPosition.locator {
                            await notifyIncomingPositionObservers(
                                bookID: bookID,
                                locator: locator,
                                timestamp: incomingTimestamp,
                            )
                        }
                    }
                } else {
                    serverPositions[bookID] = incomingPosition
                    updatedCount += 1
                }
            }
        }

        if reconciledCount > 0 {
            await saveQueueToDisk()
        }

        if updatedCount > 0 || reconciledCount > 0 {
            debugLogVerbose(
                "[PSA] updateServerPositions: updated \(updatedCount), reconciled \(reconciledCount), total=\(serverPositions.count)"
            )
        }
    }

    private func buildLocationDescription(from locator: BookLocator?) -> String {
        guard let locator = locator else { return "" }
        if let title = locator.title {
            if let prog = locator.locations?.totalProgression {
                return "\(title), \(Int(prog * 100))%"
            }
            return title
        }
        return "Unknown Chapter"
    }

    /// Get reconciled progress for all books (pending queue takes precedence over server)
    public func getAllBookProgress() async -> [BookID: BookProgress] {
        _ = await ensureQueueLoaded()

        var result: [BookID: BookProgress] = [:]

        for (bookID, serverPosition) in serverPositions {
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
                    source: .server,
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
    public func getBookProgress(for bookID: BookID) async -> BookProgress? {
        _ = await ensureQueueLoaded()

        if let pending = pendingProgressQueue.first(where: { $0.bookID == bookID }) {
            return BookProgress(
                locator: pending.locator,
                timestamp: pending.timestamp,
                source: .pendingSync,
            )
        }

        if let serverPosition = serverPositions[bookID] {
            return BookProgress(
                locator: serverPosition.locator,
                timestamp: serverPosition.timestamp,
                source: .server,
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

    private func updateServerPositionIfNewer(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
    ) {
        if let existing = serverPositions[bookID], let existingTimestamp = existing.timestamp {
            if timestamp <= existingTimestamp {
                debugLog(
                    "[PSA] updateServerPositionIfNewer: existing is newer, skipping (incoming: \(timestamp), existing: \(existingTimestamp))"
                )
                return
            }
        }

        let updatedAtString = Date(timeIntervalSince1970: timestamp / 1000).ISO8601Format()
        serverPositions[bookID] = BookReadingPosition(
            uuid: serverPositions[bookID]?.uuid,
            locator: locator,
            timestamp: timestamp,
            createdAt: serverPositions[bookID]?.createdAt,
            updatedAt: updatedAtString,
        )
        debugLog("[PSA] updateServerPositionIfNewer: bookID=\(bookID), timestamp=\(timestamp)")
    }

    private func queueOfflineProgress(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
        syncedToStoryteller: Bool = false,
    ) async -> QueueResult? {
        guard await ensureQueueLoaded() else { return nil }

        if let serverPosition = serverPositions[bookID],
            let serverTimestamp = serverPosition.timestamp
        {
            if timestamp == serverTimestamp {
                debugLog(
                    "[PSA] queueOfflineProgress: same as server, no change (timestamp: \(timestamp))"
                )
                return .skippedNoChange
            }
            if timestamp < serverTimestamp {
                debugLog(
                    "[PSA] queueOfflineProgress: server has newer, rejecting (incoming: \(timestamp), server: \(serverTimestamp))"
                )
                return .rejectedServerHasNewer
            }
        }

        if let existingIndex = pendingProgressQueue.firstIndex(where: { $0.bookID == bookID }) {
            let existing = pendingProgressQueue[existingIndex]
            if timestamp == existing.timestamp {
                debugLog(
                    "[PSA] queueOfflineProgress: same as queue, no change (timestamp: \(timestamp))"
                )
                return .skippedNoChange
            }
            if timestamp < existing.timestamp {
                debugLog(
                    "[PSA] queueOfflineProgress: queue has newer, skipping (incoming: \(timestamp), existing: \(existing.timestamp))"
                )
                return .skippedQueueHasNewer
            }
            pendingProgressQueue.remove(at: existingIndex)

            let pending = PendingProgressSync(
                bookID: bookID,
                locator: locator,
                timestamp: timestamp,
                syncedToStoryteller: syncedToStoryteller,
            )
            pendingProgressQueue.append(pending)

            debugLog(
                "[PSA] queueOfflineProgress: replaced older entry, bookID=\(bookID), queueSize=\(pendingProgressQueue.count)"
            )

            await saveQueueToDisk()
            await notifyObservers()
            return .replacedOlder
        }

        let pending = PendingProgressSync(
            bookID: bookID,
            locator: locator,
            timestamp: timestamp,
            syncedToStoryteller: syncedToStoryteller,
        )
        pendingProgressQueue.append(pending)

        debugLog(
            "[PSA] queueOfflineProgress: queued, bookID=\(bookID), queueSize=\(pendingProgressQueue.count)"
        )

        await saveQueueToDisk()
        await notifyObservers()
        return .queued
    }

    private func removeFromQueue(bookID: BookID) async {
        let before = pendingProgressQueue.count
        pendingProgressQueue.removeAll { $0.bookID == bookID }
        let after = pendingProgressQueue.count
        debugLog("[PSA] removeFromQueue: bookID=\(bookID), queueSize \(before) -> \(after)")
        await saveQueueToDisk()
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
            let loaded = try await FilesystemActor.shared.loadProgressQueue()
            guard !queueLoaded else { return }
            pendingProgressQueue = loaded
            queueLoaded = true
            debugLog("[PSA] loadQueueFromDisk: loaded \(pendingProgressQueue.count) items")
        } catch {
            guard !queueLoaded else { return }
            debugLog("[PSA] loadQueueFromDisk: failed - \(error)")
        }
    }

    private func saveQueueToDisk() async {
        guard queueLoaded else {
            debugLog("[PSA] saveQueueToDisk: skipped because the queue is not loaded")
            return
        }
        do {
            try await FilesystemActor.shared.saveProgressQueue(pendingProgressQueue)
            debugLog("[PSA] saveQueueToDisk: saved \(pendingProgressQueue.count) items")
        } catch {
            debugLog("[PSA] saveQueueToDisk: failed - \(error)")
        }
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

        if entries.count > Self.maxHistoryEntriesPerBook {
            entries = Array(entries.suffix(Self.maxHistoryEntriesPerBook))
        }

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
