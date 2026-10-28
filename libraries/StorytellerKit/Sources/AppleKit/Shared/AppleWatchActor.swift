import Foundation

#if canImport(WatchConnectivity)
import WatchConnectivity
#endif

#if os(iOS)
import UIKit
#endif

public enum WatchTransferState: Sendable, Codable {
    case queued
    case transferring(progress: Double)
    case completed
    case cancelled
    case failed(message: String)
}

public struct WatchTransferItem: Sendable, Identifiable, Codable {
    public let id: UUID
    public let bookID: BookID
    public let bookTitle: String
    public let category: LocalMediaCategory
    public let state: WatchTransferState
    public let totalBytes: Int64
    public let transferredBytes: Int64
    public let startedAt: Date
    public var completedAt: Date?

    public var progress: Double {
        guard totalBytes > 0 else { return 0 }
        return Double(transferredBytes) / Double(totalBytes)
    }
}

public enum WatchTransferEvent: Sendable {
    case stateChanged(item: WatchTransferItem)
    case transfersUpdated(items: [WatchTransferItem])
    case watchBooksUpdated(books: [WatchBookInfo])
    case watchReachabilityChanged(isReachable: Bool)
}

#if canImport(WatchConnectivity)

private let watchChunkCount = 100

@globalActor
public actor AppleWatchActor: NSObject {
    public static let shared = AppleWatchActor()

    private var session: WCSession?
    private var pendingTransfers: [UUID: WatchTransferItem] = [:]
    private var completedTransfers: [UUID: WatchTransferItem] = [:]
    private var watchBooks: [WatchBookInfo] = []
    private var chunksCompleted: [UUID: Int] = [:]
    private var chunksExpected: [UUID: Int] = [:]
    private var observers: [UUID: @Sendable @MainActor (WatchTransferEvent) -> Void] = [:]
    private var smilObserverID: UUID?
    private var sourceListObserverID: UUID?
    private var lastPublishedPhoneSourceRecords: [BookSourceRecord]?
    private var lastPublishedPhoneSourceList: PhoneSourceList?

    public override init() {
        super.init()
    }

    public func activate() {
        guard WCSession.isSupported() else {
            debugLog("[AppleWatchActor] WatchConnectivity not supported on this device")
            return
        }

        let wcSession = WCSession.default
        wcSession.delegate = self
        session = wcSession
        wcSession.activate()
        Task { [weak self] in
            await self?.startObservingPhoneSources()
        }
        debugLog("[AppleWatchActor] WCSession activation requested")
    }

    public func addObserver(_ callback: @escaping @Sendable @MainActor (WatchTransferEvent) -> Void)
        -> UUID
    {
        let id = UUID()
        observers[id] = callback
        return id
    }

    public func removeObserver(_ id: UUID) {
        observers.removeValue(forKey: id)
    }

    private func notifyObservers(_ event: WatchTransferEvent) {
        let callbacks = observers.values
        Task { @MainActor in
            for callback in callbacks {
                callback(event)
            }
        }
    }

    public func isWatchPaired() -> Bool {
        #if os(iOS)
        session?.isPaired == true
        #else
        true
        #endif
    }

    public func isWatchReachable() -> Bool {
        session?.isReachable == true && connectedWatchContext() != nil
    }

    public func getPendingTransfers() -> [WatchTransferItem] {
        pendingTransfers.values.sorted { $0.startedAt < $1.startedAt }
    }

    public func getCompletedTransfers() -> [WatchTransferItem] {
        completedTransfers.values.sorted {
            ($0.completedAt ?? $0.startedAt) > ($1.completedAt ?? $1.startedAt)
        }
    }

    public func getWatchBooks() -> [WatchBookInfo] {
        watchBooks
    }

    public func queueTransfer(
        book: BookMetadata,
        category: LocalMediaCategory,
        sourceURL: URL,
    ) async throws {
        guard let session, session.activationState == .activated else {
            throw WatchTransferError.sessionNotActive
        }
        #if os(iOS)
        guard session.isPaired else {
            throw WatchTransferError.watchNotPaired
        }
        #endif
        guard connectedWatchContext() != nil else {
            throw WatchTransferError.watchUpdateRequired
        }
        reconcileOutstandingFileTransfers()
        if pendingTransfers.values.contains(where: {
            $0.bookID == book.id && $0.category == category
        }) {
            return
        }

        let attributes = try FileManager.default.attributesOfItem(atPath: sourceURL.path)
        let fileSize = attributes[.size] as? Int64 ?? 0
        guard fileSize > 0 else {
            throw WatchTransferError.transferFailed("File is empty")
        }

        let transferID = UUID()
        let item = WatchTransferItem(
            id: transferID,
            bookID: book.id,
            bookTitle: book.title,
            category: category,
            state: .queued,
            totalBytes: fileSize,
            transferredBytes: 0,
            startedAt: Date(),
        )
        pendingTransfers[transferID] = item
        chunksCompleted[transferID] = 0
        notifyObservers(.stateChanged(item: item))
        notifyObservers(.transfersUpdated(items: getPendingTransfers()))

        _ = updateItem(item, state: .transferring(progress: 0))
        do {
            try sendFileInChunks(
                sourceURL: sourceURL,
                book: book,
                category: category,
                transferID: transferID,
            )
        } catch {
            failTransfer(
                transferID: transferID,
                message: error.localizedDescription,
                notifyWatch: true,
            )
            throw error
        }
    }

    private func updateItem(
        _ item: WatchTransferItem,
        state: WatchTransferState,
        transferredBytes: Int64? = nil,
        completedAt: Date? = nil,
    ) -> WatchTransferItem {
        let updated = WatchTransferItem(
            id: item.id,
            bookID: item.bookID,
            bookTitle: item.bookTitle,
            category: item.category,
            state: state,
            totalBytes: item.totalBytes,
            transferredBytes: transferredBytes ?? item.transferredBytes,
            startedAt: item.startedAt,
            completedAt: completedAt ?? item.completedAt,
        )
        pendingTransfers[item.id] = updated
        notifyObservers(.stateChanged(item: updated))
        return updated
    }

    private func sendFileInChunks(
        sourceURL: URL,
        book: BookMetadata,
        category: LocalMediaCategory,
        transferID: UUID,
    ) throws {
        guard let session, session.activationState == .activated else {
            throw WatchTransferError.sessionNotActive
        }
        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
            throw WatchTransferError.fileNotFound(sourceURL.path)
        }

        let totalSize =
            try FileManager.default.attributesOfItem(atPath: sourceURL.path)[.size] as? Int64 ?? 0
        guard totalSize > 0 else {
            throw WatchTransferError.transferFailed("File is empty")
        }

        let chunkSize = (totalSize + Int64(watchChunkCount) - 1) / Int64(watchChunkCount)
        let actualChunkCount = Int((totalSize + chunkSize - 1) / chunkSize)
        let tempDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "watch_chunks_\(transferID.uuidString)",
            isDirectory: true,
        )
        try? FileManager.default.removeItem(at: tempDirectory)
        try FileManager.default.createDirectory(
            at: tempDirectory,
            withIntermediateDirectories: true,
        )

        let fileExtension = sourceURL.pathExtension
        let fileHandle = try FileHandle(forReadingFrom: sourceURL)
        defer { try? fileHandle.close() }
        chunksExpected[transferID] = actualChunkCount

        for chunkIndex in 0..<actualChunkCount {
            guard connectedWatchContext() != nil else {
                throw WatchTransferError.watchUpdateRequired
            }

            let startOffset = Int64(chunkIndex) * chunkSize
            try fileHandle.seek(toOffset: UInt64(startOffset))
            let bytesToRead = min(Int(chunkSize), Int(totalSize - startOffset))
            guard let chunkData = try fileHandle.read(upToCount: bytesToRead), !chunkData.isEmpty
            else {
                throw WatchTransferError.transferFailed("Could not read transfer chunk")
            }

            let chunkURL = tempDirectory.appendingPathComponent(
                "chunk_\(String(format: "%03d", chunkIndex)).\(fileExtension)"
            )
            try chunkData.write(to: chunkURL)

            let payload = WatchChunkTransferPayload(
                transferID: transferID,
                phoneBookID: book.id,
                category: category,
                chunkIndex: chunkIndex,
                totalChunks: actualChunkCount,
                totalFileSize: totalSize,
                fileExtension: fileExtension,
                title: book.title,
                authors: book.authors?.compactMap(\.name) ?? [],
                bookMetadata: book,
            )
            let metadata = try WatchProtocolMessage.chunkTransfer(payload).encode()
            let transfer = session.transferFile(chunkURL, metadata: metadata)
            debugLog(
                "[AppleWatchActor] Queued chunk \(chunkIndex + 1)/\(actualChunkCount), isTransferring: \(transfer.isTransferring)"
            )
        }
    }

    public func cancelTransfer(transferID: UUID) {
        cancelTransfer(transferID: transferID, notifyWatch: true)
    }

    private func cancelTransfer(transferID: UUID, notifyWatch: Bool) {
        guard let item = pendingTransfers[transferID] else { return }

        cancelOutstandingFiles(transferID: transferID)
        if notifyWatch {
            queueTransferCancellation(transferID: transferID)
        }

        let cancelled = WatchTransferItem(
            id: item.id,
            bookID: item.bookID,
            bookTitle: item.bookTitle,
            category: item.category,
            state: .cancelled,
            totalBytes: item.totalBytes,
            transferredBytes: item.transferredBytes,
            startedAt: item.startedAt,
            completedAt: Date(),
        )
        pendingTransfers.removeValue(forKey: transferID)
        chunksCompleted.removeValue(forKey: transferID)
        chunksExpected.removeValue(forKey: transferID)
        removeTransferFiles(transferID: transferID)
        notifyObservers(.stateChanged(item: cancelled))
        notifyObservers(.transfersUpdated(items: getPendingTransfers()))
    }

    public func removeCompletedTransfer(transferID: UUID) {
        completedTransfers.removeValue(forKey: transferID)
        notifyObservers(.transfersUpdated(items: getPendingTransfers()))
    }

    public func requestWatchLibrary() {
        guard let session,
            session.activationState == .activated,
            session.isReachable,
            connectedWatchContext() != nil,
            let request = try? WatchProtocolMessage.watchLibraryRequest.encode()
        else { return }

        session.sendMessage(
            request,
            replyHandler: { [weak self] response in
                guard let message = try? WatchProtocolMessage.decode(from: response) else { return }
                Task { await self?.handleWatchLibrary(message) }
            },
            errorHandler: { error in
                debugLog("[AppleWatchActor] Failed to request library: \(error)")
            },
        )
    }

    public func deleteBookFromWatch(bookID: BookID, category: LocalMediaCategory) {
        guard session?.activationState == .activated,
            session?.isReachable == true,
            connectedWatchContext() != nil
        else { return }

        let message = WatchProtocolMessage.deleteBook(
            WatchDeleteBookPayload(bookID: bookID, category: category)
        )
        send(
            message,
            replyHandler: { [weak self] response in
                guard case .acknowledgement = try? WatchProtocolMessage.decode(from: response)
                else { return }
                Task { await self?.requestWatchLibrary() }
            },
        )
    }

    private func handleWatchLibrary(_ message: WatchProtocolMessage) {
        guard case .watchLibrary(let library) = message else { return }
        watchBooks = library.books
        notifyObservers(.watchBooksUpdated(books: library.books))
    }

    private func handleTransferComplete(transferID: UUID) {
        guard let current = pendingTransfers.removeValue(forKey: transferID) else { return }

        chunksCompleted.removeValue(forKey: transferID)
        chunksExpected.removeValue(forKey: transferID)
        let completed = WatchTransferItem(
            id: current.id,
            bookID: current.bookID,
            bookTitle: current.bookTitle,
            category: current.category,
            state: .completed,
            totalBytes: current.totalBytes,
            transferredBytes: current.totalBytes,
            startedAt: current.startedAt,
            completedAt: Date(),
        )
        completedTransfers[transferID] = completed
        removeTransferFiles(transferID: transferID)
        notifyObservers(.stateChanged(item: completed))
        notifyObservers(.transfersUpdated(items: getPendingTransfers()))
        requestWatchLibrary()
    }

    private func handleChunkSent(transferID: UUID) {
        guard let item = pendingTransfers[transferID],
            let expected = chunksExpected[transferID]
        else { return }

        let completed = (chunksCompleted[transferID] ?? 0) + 1
        chunksCompleted[transferID] = completed
        let progress = min(Double(completed) / Double(expected), 1)
        _ = updateItem(
            item,
            state: .transferring(progress: progress),
            transferredBytes: Int64(Double(item.totalBytes) * progress),
        )
    }

    private func handleFileTransferResult(transferID: UUID, errorMessage: String?) {
        if let errorMessage {
            failTransfer(
                transferID: transferID,
                message: errorMessage,
                notifyWatch: true,
            )
        } else {
            handleChunkSent(transferID: transferID)
        }
    }

    private func failTransfer(
        transferID: UUID,
        message: String,
        notifyWatch: Bool,
    ) {
        cancelOutstandingFiles(transferID: transferID)
        if notifyWatch {
            queueTransferCancellation(transferID: transferID)
        }
        chunksCompleted.removeValue(forKey: transferID)
        chunksExpected.removeValue(forKey: transferID)
        removeTransferFiles(transferID: transferID)

        guard let item = pendingTransfers.removeValue(forKey: transferID) else { return }
        let failed = WatchTransferItem(
            id: item.id,
            bookID: item.bookID,
            bookTitle: item.bookTitle,
            category: item.category,
            state: .failed(message: message),
            totalBytes: item.totalBytes,
            transferredBytes: item.transferredBytes,
            startedAt: item.startedAt,
            completedAt: Date(),
        )
        completedTransfers[transferID] = failed
        notifyObservers(.stateChanged(item: failed))
        notifyObservers(.transfersUpdated(items: getPendingTransfers()))
    }

    private func cancelOutstandingFiles(transferID: UUID) {
        guard let session else { return }
        for transfer in session.outstandingFileTransfers {
            guard let metadata = transfer.file.metadata,
                case .chunkTransfer(let payload) = try? WatchProtocolMessage.decode(from: metadata),
                payload.transferID == transferID
            else { continue }
            transfer.cancel()
        }
    }

    private func reconcileOutstandingFileTransfers() {
        guard let session else { return }
        let activeTransferIDs = Set(pendingTransfers.keys)
        var orphanedTransferIDs: Set<UUID> = []

        for transfer in session.outstandingFileTransfers {
            guard let metadata = transfer.file.metadata,
                case .chunkTransfer(let payload) = try? WatchProtocolMessage.decode(from: metadata)
            else {
                transfer.cancel()
                continue
            }
            guard !activeTransferIDs.contains(payload.transferID) else { continue }
            transfer.cancel()
            orphanedTransferIDs.insert(payload.transferID)
        }

        for transferID in orphanedTransferIDs {
            chunksCompleted.removeValue(forKey: transferID)
            chunksExpected.removeValue(forKey: transferID)
            removeTransferFiles(transferID: transferID)
            queueTransferCancellation(transferID: transferID)
        }
    }

    private func queueTransferCancellation(transferID: UUID) {
        guard let session else { return }
        let alreadyQueued = session.outstandingUserInfoTransfers.contains { transfer in
            guard
                case .cancelTransfer(let reference) = try? WatchProtocolMessage.decode(
                    from: transfer.userInfo
                )
            else { return false }
            return reference.transferID == transferID
        }
        guard !alreadyQueued,
            let envelope = try? WatchProtocolMessage.cancelTransfer(
                WatchTransferReference(transferID: transferID)
            ).encode()
        else { return }
        session.transferUserInfo(envelope)
    }

    private func removeTransferFiles(transferID: UUID) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "watch_chunks_\(transferID.uuidString)",
            isDirectory: true,
        )
        try? FileManager.default.removeItem(at: directory)
    }

    private func connectedWatchContext() -> WatchProtocolContext? {
        guard let session,
            case .context(let context) = try? WatchProtocolMessage.decode(
                from: session.receivedApplicationContext
            )
        else { return nil }
        return context
    }

    private func publishApplicationContext(force: Bool = false) async {
        guard let session, session.activationState == .activated else { return }
        let sourceRecords = await BookServiceActor.shared.bookSources
        guard force || sourceRecords != lastPublishedPhoneSourceRecords else { return }
        let sourceList = await phoneSourceList(from: sourceRecords)
        guard force || sourceList != lastPublishedPhoneSourceList else { return }
        do {
            try session.updateApplicationContext(
                WatchProtocolMessage.context(
                    WatchProtocolContext(phoneSourceList: sourceList)
                ).encode()
            )
            lastPublishedPhoneSourceRecords = sourceRecords
            lastPublishedPhoneSourceList = sourceList
        } catch {
            debugLog("[AppleWatchActor] Failed to publish application context: \(error)")
        }
    }

    private func startObservingPhoneSources() async {
        guard sourceListObserverID == nil else { return }
        sourceListObserverID = await BookServiceActor.shared.addLibraryCacheObserver {
            Task { await AppleWatchActor.shared.publishApplicationContext() }
        }
    }

    private func send(
        _ message: WatchProtocolMessage,
        replyHandler: (([String: Any]) -> Void)? = nil,
    ) {
        guard let session, let encoded = try? message.encode() else { return }
        session.sendMessage(
            encoded,
            replyHandler: replyHandler,
            errorHandler: { error in
                debugLog("[AppleWatchActor] Failed to send \(message.kind.rawValue): \(error)")
            },
        )
    }

    public func startObservingSMILPlayer() {
        guard smilObserverID == nil else { return }
        let observerID = UUID()
        smilObserverID = observerID
        Task {
            await PlaybackEngineActor.shared.addStateObserver(id: observerID) { [weak self] _ in
                Task { await self?.sendPlaybackStateToWatch() }
            }
        }
    }

    public func stopObservingSMILPlayer() {
        guard let observerID = smilObserverID else { return }
        smilObserverID = nil
        Task {
            await PlaybackEngineActor.shared.removeStateObserver(id: observerID)
        }
    }

    public func sendPlaybackStateToWatch() async {
        guard session?.isReachable == true, connectedWatchContext() != nil else { return }
        guard let state = await buildRemotePlaybackState() else {
            send(.noPlaybackState)
            return
        }
        send(.playbackState(state))
    }

    private func buildRemotePlaybackState() async -> RemotePlaybackState? {
        guard let smilState = await PlaybackEngineActor.shared.getCurrentState(),
            let bookID = smilState.bookID
        else { return nil }

        let chapters = await PlaybackEngineActor.shared.getChapterSummaries()
            .enumerated()
            .map { index, chapter in
                RemoteChapter(
                    index: index,
                    title: chapter.title,
                    sectionIndex: chapter.sectionIndex,
                )
            }
        let currentChapterIndex =
            chapters.firstIndex { $0.sectionIndex == smilState.currentSectionIndex } ?? 0

        return RemotePlaybackState(
            bookTitle: await PlaybackEngineActor.shared.getLoadedBookTitle() ?? "Unknown",
            bookID: bookID,
            chapterTitle: smilState.chapterLabel ?? "Chapter \(currentChapterIndex + 1)",
            currentChapterIndex: currentChapterIndex,
            chapters: chapters,
            isPlaying: smilState.isPlaying,
            chapterElapsed: smilState.chapterElapsed,
            chapterDuration: smilState.chapterTotal,
            bookElapsed: smilState.bookElapsed,
            bookDuration: smilState.bookTotal,
            playbackRate: smilState.playbackRate,
            volume: smilState.volume,
        )
    }

    private func handlePlaybackCommand(_ command: RemotePlaybackCommand) async {
        guard let session = await ActiveReadingSession.shared.current else { return }
        switch command {
            case .togglePlayPause: try? await session.togglePlayback()
            case .skipForward: await session.handlePlaybackCommand(.skipForward(30))
            case .skipBackward: await session.handlePlaybackCommand(.skipBackward(30))
            case .seekToChapter(let index):
                let chapters = await PlaybackEngineActor.shared.getChapterSummaries()
                if let chapter = chapters.first(where: { $0.sectionIndex == index }) {
                    await session.selectChapter(id: chapter.id)
                }
            case .setPlaybackRate(let rate): await session.setPlaybackRate(rate)
            case .setVolume(let volume): await session.setVolume(volume)
        }
    }

    private func handleIncomingMessage(_ message: WatchProtocolMessage) async {
        switch message {
            case .progress(let payload):
                await handleRelayedProgress(payload)
            case .transferComplete(let reference):
                guard pendingTransfers[reference.transferID] != nil else { return }
                handleTransferComplete(transferID: reference.transferID)
            case .transferFailed(let failure):
                guard pendingTransfers[failure.transferID] != nil else { return }
                failTransfer(
                    transferID: failure.transferID,
                    message: failure.message,
                    notifyWatch: false,
                )
            case .cancelTransfer(let reference):
                guard pendingTransfers[reference.transferID] != nil else { return }
                cancelTransfer(transferID: reference.transferID, notifyWatch: false)
            case .watchLibrary:
                handleWatchLibrary(message)
            case .playbackCommand(let command):
                await handlePlaybackCommand(command)
            case .playbackStateRequest:
                await sendPlaybackStateToWatch()
            default:
                break
        }
    }

    private func handleRequest(
        _ message: WatchProtocolMessage,
        replyHandler: SendableReplyHandler,
    ) async {
        switch message {
            case .ping:
                replyHandler.reply(.pong)
            case .playbackStateRequest:
                guard connectedWatchContext() != nil,
                    let state = await buildRemotePlaybackState()
                else {
                    replyHandler.reply(.noPlaybackState)
                    return
                }
                replyHandler.reply(.playbackState(state))
            case .playbackCommand(let command):
                await handlePlaybackCommand(command)
                replyHandler.reply(.acknowledgement)
            case .sourceCatalogRequest:
                let sourceList = await phoneSourceList()
                await publishApplicationContext(force: true)
                replyHandler.reply(.sourceCatalog(sourceList))
            case .credentialRequest(let request):
                guard let reply = await credentialReply(sourceID: request.phoneSourceID) else {
                    replyHandler.reply(
                        .failure(WatchFailure(message: "No credentials configured"))
                    )
                    return
                }
                replyHandler.reply(.credentialReply(reply))
            case .libraryMetadataRequest:
                guard connectedWatchContext() != nil else {
                    replyHandler.reply(
                        .failure(WatchFailure(message: "Watch context unavailable"))
                    )
                    return
                }
                let books = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly).books
                replyHandler.reply(
                    .libraryMetadataResponse(WatchLibraryMetadataResponse(books: books))
                )
            default:
                replyHandler.reply(.failure(WatchFailure(message: "Unhandled request")))
        }
    }

    private func phoneSourceList() async -> PhoneSourceList {
        let sourceRecords = await BookServiceActor.shared.bookSources
        return await phoneSourceList(from: sourceRecords)
    }

    private func phoneSourceList(
        from sourceRecords: [BookSourceRecord]
    ) async -> PhoneSourceList {
        var sources: [PhoneSource] = []
        for record in sourceRecords {
            let credentials =
                record.kind == .storyteller
                ? try? await AuthenticationActor.shared.loadCredentials(
                    sourceID: record.id
                )
                : nil
            sources.append(
                PhoneSource(
                    sourceID: record.id,
                    name: record.name,
                    kind: record.kind,
                    serverURL: credentials?.url,
                    username: credentials?.username,
                    serverUUID: nil,
                )
            )
        }
        return PhoneSourceList(
            sources: sources.sorted {
                let comparison = $0.name.localizedCaseInsensitiveCompare($1.name)
                return comparison == .orderedSame
                    ? $0.sourceID < $1.sourceID : comparison == .orderedAscending
            }
        )
    }

    private func credentialReply(sourceID: BookSourceID) async -> WatchCredentialReply? {
        guard
            let source = await BookServiceActor.shared.bookSources.first(where: {
                $0.id == sourceID && $0.kind == .storyteller
            }),
            let credentials = try? await AuthenticationActor.shared.loadCredentials(
                sourceID: sourceID
            )
        else { return nil }

        return WatchCredentialReply(
            phoneSourceID: sourceID,
            name: source.name,
            serverURL: credentials.url,
            username: credentials.username,
            password: credentials.password,
            serverUUID: nil,
        )
    }

    private func handleRelayedProgress(_ payload: WatchProgressPayload) async {
        #if os(iOS)
        let backgroundTask = await beginRelayBackgroundTask()
        #endif

        guard payload.watchBookID.uuid == payload.phoneBookID.uuid else {
            #if os(iOS)
            await endRelayBackgroundTask(backgroundTask)
            #endif
            return
        }

        let sourceExists = await BookServiceActor.shared.bookSources.contains {
            $0.id == payload.phoneBookID.sourceID
        }
        if sourceExists {
            let result = await ProgressSyncActor.shared.syncProgress(
                bookID: payload.phoneBookID,
                locator: payload.locator,
                timestamp: payload.timestamp,
                reason: .relayedFromWatch,
                sourceIdentifier: "Watch Relay",
            )
            #if os(iOS)
            await ProgressUploadManager.shared.enqueuePendingUploads()
            #endif
            if result != .failed {
                queueProgressReceipt(
                    WatchProgressReceipt(
                        watchBookID: payload.watchBookID,
                        timestamp: payload.timestamp,
                    )
                )
            }
        }

        #if os(iOS)
        await endRelayBackgroundTask(backgroundTask)
        #endif
    }

    private func queueProgressReceipt(_ receipt: WatchProgressReceipt) {
        guard let session else { return }
        let alreadyQueued = session.outstandingUserInfoTransfers.contains { transfer in
            guard
                case .progressReceived(let queued) = try? WatchProtocolMessage.decode(
                    from: transfer.userInfo
                )
            else { return false }
            return queued.watchBookID == receipt.watchBookID
                && queued.timestamp >= receipt.timestamp
        }
        guard !alreadyQueued,
            let envelope = try? WatchProtocolMessage.progressReceived(receipt).encode()
        else { return }
        session.transferUserInfo(envelope)
    }

    #if os(iOS)
    private func beginRelayBackgroundTask() async -> UIBackgroundTaskIdentifier {
        await MainActor.run {
            var taskID: UIBackgroundTaskIdentifier = .invalid
            taskID = UIApplication.shared.beginBackgroundTask(withName: "WatchProgressRelay") {
                if taskID != .invalid {
                    UIApplication.shared.endBackgroundTask(taskID)
                    taskID = .invalid
                }
            }
            return taskID
        }
    }

    private func endRelayBackgroundTask(_ taskID: UIBackgroundTaskIdentifier) async {
        await MainActor.run {
            if taskID != .invalid {
                UIApplication.shared.endBackgroundTask(taskID)
            }
        }
    }
    #endif

    private func handleActivationComplete(
        activationState: WCSessionActivationState,
        error: Error?,
    ) async {
        if let error {
            debugLog("[AppleWatchActor] Activation failed: \(error)")
            return
        }
        guard activationState == .activated else { return }
        reconcileOutstandingFileTransfers()
        await startObservingPhoneSources()
        await publishApplicationContext(force: true)
        guard connectedWatchContext() != nil else {
            stopObservingSMILPlayer()
            return
        }
        requestWatchLibrary()
        if session?.isReachable == true {
            startObservingSMILPlayer()
        }
    }

    private func handleReachabilityChange(isReachable: Bool) async {
        await publishApplicationContext()
        let isCompatibleAndReachable = isReachable && connectedWatchContext() != nil
        notifyObservers(.watchReachabilityChanged(isReachable: isCompatibleAndReachable))
        if isCompatibleAndReachable {
            requestWatchLibrary()
            startObservingSMILPlayer()
        } else {
            stopObservingSMILPlayer()
        }
    }

    private func handleApplicationContext(_: WatchProtocolContext) async {
        await publishApplicationContext()
        let isCompatibleAndReachable = session?.isReachable == true
        notifyObservers(.watchReachabilityChanged(isReachable: isCompatibleAndReachable))
        guard isCompatibleAndReachable else { return }
        requestWatchLibrary()
        startObservingSMILPlayer()
    }
}

extension AppleWatchActor: WCSessionDelegate {
    nonisolated public func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?,
    ) {
        Task {
            await self.handleActivationComplete(
                activationState: activationState,
                error: error,
            )
        }
    }

    #if os(iOS)
    nonisolated public func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated public func sessionDidDeactivate(_ session: WCSession) {
        Task { await self.activate() }
    }
    #endif

    nonisolated public func sessionReachabilityDidChange(_ session: WCSession) {
        let isReachable = session.isReachable
        Task { await self.handleReachabilityChange(isReachable: isReachable) }
    }

    nonisolated public func session(_ session: WCSession, didReceiveMessage message: [String: Any])
    {
        guard let decoded = try? WatchProtocolMessage.decode(from: message) else { return }
        Task { await self.handleIncomingMessage(decoded) }
    }

    nonisolated public func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void,
    ) {
        let sendableReply = SendableReplyHandler(replyHandler)
        guard let decoded = try? WatchProtocolMessage.decode(from: message) else {
            sendableReply.reply(
                .failure(WatchFailure(message: "Incompatible watch protocol"))
            )
            return
        }
        Task { await self.handleRequest(decoded, replyHandler: sendableReply) }
    }

    nonisolated public func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any] = [:],
    ) {
        guard let decoded = try? WatchProtocolMessage.decode(from: userInfo) else { return }
        Task { await self.handleIncomingMessage(decoded) }
    }

    nonisolated public func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any],
    ) {
        guard
            case .context(let context) = try? WatchProtocolMessage.decode(
                from: applicationContext
            )
        else { return }
        Task { await self.handleApplicationContext(context) }
    }

    nonisolated public func session(
        _ session: WCSession,
        didFinish fileTransfer: WCSessionFileTransfer,
        error: Error?,
    ) {
        guard let metadata = fileTransfer.file.metadata,
            case .chunkTransfer(let payload) = try? WatchProtocolMessage.decode(from: metadata),
            payload.bookMetadata.id == payload.phoneBookID
        else { return }
        let errorMessage = error?.localizedDescription
        Task {
            await self.handleFileTransferResult(
                transferID: payload.transferID,
                errorMessage: errorMessage,
            )
        }
    }
}

struct SendableReplyHandler: @unchecked Sendable {
    private let handler: ([String: Any]) -> Void

    init(_ handler: @escaping ([String: Any]) -> Void) {
        self.handler = handler
    }

    func reply(_ message: WatchProtocolMessage) {
        guard let encoded = try? message.encode() else { return }
        handler(encoded)
    }
}

#else

@globalActor
public actor AppleWatchActor {
    public static let shared = AppleWatchActor()

    public init() {}

    public func activate() {
        debugLog("[AppleWatchActor] WatchConnectivity not available on this platform")
    }

    public func addObserver(_ callback: @escaping @Sendable @MainActor (WatchTransferEvent) -> Void)
        -> UUID
    {
        UUID()
    }

    public func removeObserver(_ id: UUID) {}
    public func isWatchPaired() -> Bool { false }
    public func isWatchReachable() -> Bool { false }
    public func getPendingTransfers() -> [WatchTransferItem] { [] }
    public func getCompletedTransfers() -> [WatchTransferItem] { [] }
    public func getWatchBooks() -> [WatchBookInfo] { [] }

    public func queueTransfer(book: BookMetadata, category: LocalMediaCategory, sourceURL: URL)
        async throws
    {
        throw WatchTransferError.notSupported
    }

    public func cancelTransfer(transferID: UUID) {}
    public func removeCompletedTransfer(transferID: UUID) {}
    public func requestWatchLibrary() {}
    public func deleteBookFromWatch(bookID: BookID, category: LocalMediaCategory) {}
}

#endif

enum WatchTransferError: Error, LocalizedError {
    case sessionNotActive
    case watchNotPaired
    case watchUpdateRequired
    case transferFailed(String)
    case fileNotFound(String)
    case notSupported

    var errorDescription: String? {
        switch self {
            case .sessionNotActive:
                "Watch session is not active"
            case .watchNotPaired:
                "No Apple Watch is paired"
            case .watchUpdateRequired:
                "Update Storyteller on Apple Watch before sending books."
            case .transferFailed(let reason):
                "Transfer failed: \(reason)"
            case .fileNotFound(let path):
                "File not found: \(path)"
            case .notSupported:
                "Apple Watch transfers not supported on this platform"
        }
    }
}
