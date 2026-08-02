#if os(watchOS)
import Foundation
import StorytellerKit
import WatchConnectivity

public final class WatchSessionManager: NSObject, WCSessionDelegate, @unchecked Sendable {
    public static let shared = WatchSessionManager()

    private var session: WCSession?
    nonisolated(unsafe) private var cachedBookInfos: [WatchBookInfo] = []
    nonisolated(unsafe) private var latestPhoneSourceList = PhoneSourceList(sources: [])

    nonisolated(unsafe) var onTransferProgress: ((String, Int, Int) -> Void)?
    nonisolated(unsafe) var onTransferComplete: ((BookID, String) -> Void)?
    nonisolated(unsafe) var onImportComplete: ((Bool) -> Void)?
    nonisolated(unsafe) var onBookDeleted: (() -> Void)?
    nonisolated(unsafe) var onPlaybackStateReceived: ((RemotePlaybackState?) -> Void)?
    nonisolated(unsafe) var onCredentialSourcesReceived: (([PhoneSource]) -> Void)?
    nonisolated(unsafe) var onCredentialsReceived: ((WatchCredentialReply) -> Void)?
    nonisolated(unsafe) private var retriedTerminalTransferIDs: Set<UUID> = []

    private override init() {
        super.init()
    }

    public var isPhoneReachable: Bool {
        guard let session, session.isReachable else { return false }
        return protocolContext(from: session.receivedApplicationContext) != nil
    }

    public func activate() {
        guard WCSession.isSupported() else { return }
        let wcSession = WCSession.default
        wcSession.delegate = self
        wcSession.activate()
        session = wcSession

        refreshCachedBooks()
        let receivedSourceList = protocolContext(
            from: wcSession.receivedApplicationContext
        )?.phoneSourceList
        Task {
            if let stored = try? await WatchStateStore.loadPhoneSourceList() {
                latestPhoneSourceList = stored
            }
            if let receivedSourceList {
                await storePhoneSourceList(receivedSourceList)
            }
            _ = await ProgressSyncActor.shared.addObserver {
                Task { await WatchSessionManager.shared.relayPendingProgress() }
            }
            await relayPendingProgress()
        }
    }

    public func refreshCachedBooks() {
        Task {
            let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
            cachedBookInfos = snapshot.books.flatMap { book -> [WatchBookInfo] in
                guard let paths = snapshot.cachedMediaPaths[book.id] else { return [] }
                let categories: [LocalMediaCategory] = [
                    paths.ebookPath == nil ? nil : .ebook,
                    paths.audioPath == nil ? nil : .audio,
                    paths.syncedPath == nil ? nil : .synced,
                ].compactMap { $0 }
                return categories.map { category in
                    WatchBookInfo(
                        bookID: book.id,
                        title: book.title,
                        authorNames: book.authors?.compactMap(\.name) ?? [],
                        category: category,
                        sizeBytes: 0,
                    )
                }
            }
        }
    }

    public func publishProtocolContext() async {
        guard let session else { return }
        do {
            try session.updateApplicationContext(
                try WatchProtocolMessage.context(
                    WatchProtocolContext()
                ).encode()
            )
        } catch {
            print("[WatchSessionManager] Failed to publish protocol context: \(error)")
        }
    }

    public func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?,
    ) {
        if let error {
            print("[WatchSessionManager] Activation error: \(error)")
            return
        }
        guard activationState == .activated else { return }
        let receivedSourceList = protocolContext(
            from: session.receivedApplicationContext
        )?.phoneSourceList
        Task {
            await publishProtocolContext()
            if let receivedSourceList {
                await storePhoneSourceList(receivedSourceList)
            }
            await relayPendingProgress()
        }
    }

    public func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any],
    ) {
        guard let context = protocolContext(from: applicationContext) else {
            print("[WatchSessionManager] Ignored non-v2 application context")
            return
        }
        let receivedSourceList = context.phoneSourceList
        Task {
            if let receivedSourceList {
                await storePhoneSourceList(receivedSourceList)
            }
            await relayPendingProgress()
        }
    }

    public func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        Task { await relayPendingProgress() }
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleEnvelope(message, replyHandler: nil)
    }

    public func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void,
    ) {
        handleEnvelope(message, replyHandler: replyHandler)
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handleEnvelope(userInfo, replyHandler: nil)
    }

    private func handleEnvelope(
        _ envelope: [String: Any],
        replyHandler: (([String: Any]) -> Void)?,
    ) {
        let message: WatchProtocolMessage
        do {
            message = try WatchProtocolMessage.decode(from: envelope)
        } catch {
            reply(.failure(WatchFailure(message: "Watch protocol v2 required")), to: replyHandler)
            return
        }

        if case .cancelTransfer(let reference) = message {
            WatchStorageManager.shared.cancelChunkedTransfer(
                transferID: reference.transferID
            )
            let callback = onImportComplete
            Task { @MainActor in callback?(false) }
            reply(.acknowledgement, to: replyHandler)
            return
        }

        guard canSendToPhone else {
            reply(.failure(WatchFailure(message: "Watch protocol v2 required")), to: replyHandler)
            return
        }

        switch message {
            case .deleteBook(let payload):
                handleDeleteBook(payload, replyHandler: replyHandler)
            case .cancelTransfer:
                return
            case .watchLibraryRequest:
                let sendableReply = replyHandler.map(SendableWatchReplyHandler.init)
                Task {
                    let library = await currentWatchLibrary()
                    sendableReply?.reply(
                        try? WatchProtocolMessage.watchLibrary(library).encode()
                    )
                }
            case .playbackState(let state):
                onPlaybackStateReceived?(state)
                reply(.acknowledgement, to: replyHandler)
            case .noPlaybackState:
                onPlaybackStateReceived?(nil)
                reply(.acknowledgement, to: replyHandler)
            case .progressReceived(let receipt):
                Task {
                    await ProgressSyncActor.shared.confirmUpload(
                        bookID: receipt.watchBookID,
                        timestamp: receipt.timestamp,
                    )
                }
                reply(.acknowledgement, to: replyHandler)
            case .ping:
                reply(.pong, to: replyHandler)
            default:
                reply(
                    .failure(WatchFailure(message: "Unsupported watch message")),
                    to: replyHandler,
                )
        }
    }

    private func handleDeleteBook(
        _ payload: WatchDeleteBookPayload,
        replyHandler: (([String: Any]) -> Void)?,
    ) {
        let sendableReply = replyHandler.map(SendableWatchReplyHandler.init)
        Task {
            do {
                try await BookServiceActor.shared.deleteCachedMedia(
                    for: payload.bookID,
                    category: payload.category,
                )
                refreshCachedBooks()
                await MainActor.run { onBookDeleted?() }
                sendableReply?.reply(try? WatchProtocolMessage.acknowledgement.encode())
            } catch {
                sendableReply?.reply(
                    try? WatchProtocolMessage.failure(
                        WatchFailure(message: error.localizedDescription)
                    ).encode()
                )
            }
        }
    }

    public func requestCredentialSourcesFromPhone() {
        sendRequest(.sourceCatalogRequest) { [weak self] response in
            guard case .sourceCatalog(let sourceList) = response, let self else {
                self?.deliverCredentialSources([])
                return
            }
            let sourceIDs = sourceList.sources.map(\.sourceID)
            guard sourceIDs.allSatisfy({ !$0.isEmpty }), Set(sourceIDs).count == sourceIDs.count
            else {
                self.deliverCredentialSources([])
                return
            }
            Task {
                await self.storePhoneSourceList(sourceList)
                self.deliverCredentialSources(
                    sourceList.sources.filter {
                        $0.kind == .storyteller && $0.serverURL != nil && $0.username != nil
                    }
                )
            }
        } onError: { [weak self] error in
            print("[WatchSessionManager] Source catalog request failed: \(error)")
            guard let self else { return }
            self.deliverCredentialSources(
                self.latestPhoneSourceList.sources.filter {
                    $0.kind == .storyteller && $0.serverURL != nil && $0.username != nil
                }
            )
        }
    }

    public func requestCredentialsFromPhone(sourceID: BookSourceID) {
        sendRequest(
            .credentialRequest(WatchCredentialRequest(phoneSourceID: sourceID))
        ) { [weak self] response in
            guard case .credentialReply(let credentials) = response,
                credentials.phoneSourceID == sourceID
            else {
                print("[WatchSessionManager] Invalid credential reply")
                return
            }
            let callback = self?.onCredentialsReceived
            Task { @MainActor in callback?(credentials) }
        } onError: { error in
            print("[WatchSessionManager] Credential request failed: \(error)")
        }
    }

    private func deliverCredentialSources(_ sources: [PhoneSource]) {
        let callback = onCredentialSourcesReceived
        Task { @MainActor in callback?(sources) }
    }

    public func session(_ session: WCSession, didReceive file: WCSessionFile) {
        guard let envelope = file.metadata,
            let message = try? WatchProtocolMessage.decode(from: envelope),
            case .chunkTransfer(let payload) = message
        else {
            print("[WatchSessionManager] Rejected non-v2 or invalid file transfer")
            return
        }
        guard validIncomingChunk(payload) else {
            rejectTransfer(
                payload,
                message: "Invalid transfer metadata",
                deleting: file.fileURL,
            )
            return
        }

        let quarantineDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("watch-incoming", isDirectory: true)
        let quarantinedURL = quarantineDirectory.appendingPathComponent(UUID().uuidString)
        do {
            try FileManager.default.createDirectory(
                at: quarantineDirectory,
                withIntermediateDirectories: true,
            )
            try FileManager.default.moveItem(at: file.fileURL, to: quarantinedURL)
        } catch {
            print("[WatchSessionManager] Failed to retain received chunk: \(error)")
            rejectTransfer(
                payload,
                message: "Could not retain a transfer chunk",
                deleting: file.fileURL,
            )
            return
        }

        Task {
            await processReceivedChunk(at: quarantinedURL, payload: payload)
        }
    }

    private func validIncomingChunk(_ payload: WatchChunkTransferPayload) -> Bool {
        payload.bookMetadata.id == payload.phoneBookID
            && payload.totalChunks > 0
            && payload.chunkIndex >= 0
            && payload.chunkIndex < payload.totalChunks
            && payload.totalFileSize >= 0
            && !payload.fileExtension.isEmpty
    }

    private func processReceivedChunk(
        at quarantinedURL: URL,
        payload: WatchChunkTransferPayload,
    ) async {
        guard validIncomingChunk(payload) else {
            rejectTransfer(
                payload,
                message: "Invalid transfer metadata",
                deleting: quarantinedURL,
            )
            return
        }

        let result = WatchStorageManager.shared.receiveChunk(
            from: quarantinedURL,
            payload: payload,
        )
        guard result.accepted else {
            rejectTransfer(
                payload,
                message: "Apple Watch rejected a transfer chunk",
                deleting: quarantinedURL,
            )
            return
        }

        onTransferProgress?(
            payload.title,
            payload.chunkIndex + 1,
            payload.totalChunks,
        )

        guard result.isComplete, let manifest = result.manifest else { return }

        do {
            let localBookID = try await importTransferredBook(manifest)
            onTransferComplete?(localBookID, manifest.title)
            await MainActor.run { onImportComplete?(true) }
            notifyPhoneTransferComplete(transferID: manifest.transferID)
        } catch {
            print("[WatchSessionManager] Failed to import transfer: \(error)")
            rejectTransfer(payload, message: error.localizedDescription)
        }
    }

    private func importTransferredBook(_ manifest: WatchTransferManifest) async throws -> BookID {
        guard manifest.bookMetadata.id == manifest.phoneBookID else {
            throw WatchTransferImportError.bookIdentityMismatch
        }
        guard
            let tempURL = WatchStorageManager.shared.assembleChunksToTempFile(manifest: manifest)
        else {
            throw WatchTransferImportError.assemblyFailed
        }

        do {
            try await mergeBookMetadataIntoLibrary(manifest.bookMetadata)
            try await BookServiceActor.shared.importDownloadedFileToCache(
                from: tempURL,
                metadata: manifest.bookMetadata,
                category: manifest.category,
                filename: "book.\(manifest.fileExtension)",
            )
            refreshCachedBooks()
            return manifest.phoneBookID
        } catch {
            try? FileManager.default.removeItem(at: tempURL)
            throw error
        }
    }

    private func rejectTransfer(
        _ payload: WatchChunkTransferPayload,
        message: String,
        deleting fileURL: URL? = nil,
    ) {
        if let fileURL {
            try? FileManager.default.removeItem(at: fileURL)
        }
        WatchStorageManager.shared.cancelChunkedTransfer(transferID: payload.transferID)
        notifyPhoneTransferFailed(
            transferID: payload.transferID,
            message: message,
        )
        onImportComplete?(false)
    }

    private func mergeBookMetadataIntoLibrary(_ book: BookMetadata) async throws {
        var sourceBooks = await BookServiceActor.shared
            .librarySnapshot(policy: .cachedOnly).books
            .filter { $0.sourceID == book.sourceID }

        if let index = sourceBooks.firstIndex(where: { $0.id == book.id }) {
            if isNewer(book, than: sourceBooks[index]) {
                sourceBooks[index] = book
            }
        } else {
            sourceBooks.append(book)
        }

        try await BookServiceActor.shared.updateLibraryCacheMetadata(
            sourceBooks,
            replacingSourceID: book.sourceID,
        )
    }

    private func isNewer(_ incoming: BookMetadata, than current: BookMetadata) -> Bool {
        let incomingPositionTimestamp = incoming.position?.timestamp ?? 0
        let currentPositionTimestamp = current.position?.timestamp ?? 0
        if incomingPositionTimestamp != 0 || currentPositionTimestamp != 0 {
            return incomingPositionTimestamp > currentPositionTimestamp
        }
        guard let incomingUpdatedAt = incoming.updatedAt else { return false }
        guard let currentUpdatedAt = current.updatedAt else { return true }
        return incomingUpdatedAt > currentUpdatedAt
    }

    public func requestLibraryMetadataFromPhone() async -> Bool {
        guard canSendToPhone else { return false }

        return await withCheckedContinuation { continuation in
            sendRequest(.libraryMetadataRequest) { [weak self] response in
                guard case .libraryMetadataResponse(let metadata) = response,
                    let self
                else {
                    continuation.resume(returning: false)
                    return
                }
                Task {
                    let result = await self.mergePhoneMetadata(metadata.books)
                    continuation.resume(returning: result)
                }
            } onError: { error in
                print("[WatchSessionManager] Library metadata request failed: \(error)")
                continuation.resume(returning: false)
            }
        }
    }

    private func mergePhoneMetadata(_ phoneBooks: [BookMetadata]) async -> Bool {
        let cached = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly).books
        var translatedBySource: [BookSourceID: [BookMetadata]] = [:]
        for phoneBook in phoneBooks {
            guard let phoneSource = latestPhoneSourceList.source(id: phoneBook.sourceID) else {
                continue
            }

            let localBookID: BookID?
            if cached.contains(where: { $0.id == phoneBook.id }) {
                localBookID = phoneBook.id
            } else if let watchSourceID = await watchSourceID(matching: phoneSource) {
                localBookID = BookID(sourceID: watchSourceID, uuid: phoneBook.uuid)
            } else {
                localBookID = nil
            }

            guard let localBookID else { continue }
            translatedBySource[localBookID.sourceID, default: []].append(
                phoneBook.withBookID(localBookID)
            )
        }

        do {
            for (sourceID, incomingBooks) in translatedBySource {
                var sourceBooks = cached.filter { $0.sourceID == sourceID }
                for incoming in incomingBooks {
                    if let index = sourceBooks.firstIndex(where: { $0.id == incoming.id }) {
                        if isNewer(incoming, than: sourceBooks[index]) {
                            sourceBooks[index] = incoming
                        }
                    } else {
                        sourceBooks.append(incoming)
                    }
                }
                try await BookServiceActor.shared.updateLibraryCacheMetadata(
                    sourceBooks,
                    replacingSourceID: sourceID,
                )
            }
            refreshCachedBooks()
            return !translatedBySource.isEmpty
        } catch {
            print("[WatchSessionManager] Failed to merge phone metadata: \(error)")
            return false
        }
    }

    private func currentWatchLibrary() async -> WatchLibrary {
        var phoneSourceByWatchSource: [BookSourceID: BookSourceID] = [:]
        let watchSources = await BookServiceActor.shared.bookSources
            .filter { $0.kind == .storyteller }
        for source in watchSources {
            guard
                let credentials = try? await AuthenticationActor.shared.loadCredentials(
                    sourceID: source.id
                ),
                let phoneSource = latestPhoneSourceList.matchingServer(
                    serverURL: credentials.url,
                    username: credentials.username,
                )
            else { continue }
            phoneSourceByWatchSource[source.id] = phoneSource.sourceID
        }

        var books: [WatchBookInfo] = []
        for book in cachedBookInfos {
            let phoneSourceID =
                latestPhoneSourceList.source(id: book.bookID.sourceID)?.sourceID
                ?? phoneSourceByWatchSource[book.bookID.sourceID]
            let phoneBookID = phoneSourceID.map {
                BookID(sourceID: $0, uuid: book.bookID.uuid)
            }
            books.append(
                WatchBookInfo(
                    bookID: book.bookID,
                    phoneBookID: phoneBookID,
                    title: book.title,
                    authorNames: book.authorNames,
                    category: book.category,
                    sizeBytes: book.sizeBytes,
                )
            )
        }
        return WatchLibrary(books: books)
    }

    public func relayPendingProgress() async {
        guard let session, canSendToPhone else { return }
        let outstanding = session.outstandingUserInfoTransfers
        let pending = await ProgressSyncActor.shared.getPendingProgressSyncs()
            .filter { !$0.syncedToStoryteller }

        for item in pending {
            let phoneBookID = await progressRelayTarget(for: item)
            var alreadyQueued = false
            for transfer in outstanding {
                guard let message = try? WatchProtocolMessage.decode(from: transfer.userInfo),
                    case .progress(let queued) = message,
                    queued.watchBookID == item.bookID
                else { continue }

                if let phoneBookID,
                    queued.phoneBookID == phoneBookID,
                    queued.timestamp >= item.timestamp
                {
                    alreadyQueued = true
                } else {
                    transfer.cancel()
                }
            }
            guard let phoneBookID, !alreadyQueued else { continue }

            do {
                let envelope = try WatchProtocolMessage.progress(
                    WatchProgressPayload(
                        watchBookID: item.bookID,
                        phoneBookID: phoneBookID,
                        locator: item.locator,
                        timestamp: item.timestamp,
                    )
                ).encode()
                session.transferUserInfo(envelope)
            } catch {
                print("[WatchSessionManager] Failed to queue progress: \(error)")
            }
        }
    }

    private func progressRelayTarget(for item: PendingProgressSync) async -> BookID? {
        let watchSource = await BookServiceActor.shared.bookSources.first {
            $0.id == item.bookID.sourceID && $0.kind == .storyteller
        }

        if watchSource == nil,
            let phoneSource = latestPhoneSourceList.source(id: item.bookID.sourceID)
        {
            if let watchSourceID = await watchSourceID(matching: phoneSource) {
                let result = await BookServiceActor.shared.sendProgressToServer(
                    bookID: BookID(sourceID: watchSourceID, uuid: item.bookID.uuid),
                    locator: item.locator,
                    timestamp: item.timestamp,
                )
                if result == .success {
                    await ProgressSyncActor.shared.confirmUpload(
                        bookID: item.bookID,
                        timestamp: item.timestamp,
                    )
                    return nil
                }
            }
            return item.bookID
        }

        guard let watchSource else { return nil }
        if let phoneSource = latestPhoneSourceList.source(id: watchSource.id) {
            return BookID(sourceID: phoneSource.sourceID, uuid: item.bookID.uuid)
        }
        guard
            let credentials = try? await AuthenticationActor.shared.loadCredentials(
                sourceID: watchSource.id
            ),
            let phoneSource = latestPhoneSourceList.matchingServer(
                serverURL: credentials.url,
                username: credentials.username,
            )
        else { return nil }
        return BookID(sourceID: phoneSource.sourceID, uuid: item.bookID.uuid)
    }

    private func watchSourceID(matching phoneSource: PhoneSource) async -> BookSourceID? {
        guard phoneSource.serverURL != nil, phoneSource.username != nil else {
            return nil
        }
        let sources = await BookServiceActor.shared.bookSources
            .filter { $0.kind == .storyteller }
            .sorted { $0.id < $1.id }
        for source in sources {
            guard
                let credentials = try? await AuthenticationActor.shared.loadCredentials(
                    sourceID: source.id
                ),
                phoneSource.matchesServer(
                    serverURL: credentials.url,
                    username: credentials.username,
                    serverUUID: nil,
                )
            else { continue }
            return source.id
        }
        return nil
    }

    public func session(
        _ session: WCSession,
        didFinish userInfoTransfer: WCSessionUserInfoTransfer,
        error: Error?,
    ) {
        guard let error else { return }
        guard let message = try? WatchProtocolMessage.decode(from: userInfoTransfer.userInfo)
        else {
            print("[WatchSessionManager] Invalid user info transfer failed: \(error)")
            return
        }
        print("[WatchSessionManager] \(message.kind.rawValue) transfer failed: \(error)")
        let transferID: UUID
        switch message {
            case .transferComplete(let reference):
                transferID = reference.transferID
            case .transferFailed(let failure):
                transferID = failure.transferID
            default:
                return
        }
        guard retriedTerminalTransferIDs.insert(transferID).inserted else { return }
        sendTerminalTransferMessage(message)
    }

    private func notifyPhoneTransferComplete(transferID: UUID) {
        sendTerminalTransferMessage(
            .transferComplete(WatchTransferReference(transferID: transferID))
        )
    }

    private func notifyPhoneTransferFailed(
        transferID: UUID,
        message: String,
    ) {
        sendTerminalTransferMessage(
            .transferFailed(
                WatchTransferFailure(
                    transferID: transferID,
                    message: message,
                )
            )
        )
    }

    private func sendTerminalTransferMessage(_ message: WatchProtocolMessage) {
        guard let session, session.activationState == .activated else { return }
        do {
            let envelope = try message.encode()
            session.transferUserInfo(envelope)
            if session.isReachable, canSendToPhone {
                session.sendMessage(
                    envelope,
                    replyHandler: nil,
                    errorHandler: { error in
                        print(
                            "[WatchSessionManager] Immediate terminal transfer message failed: \(error)"
                        )
                    },
                )
            }
        } catch {
            print("[WatchSessionManager] Failed to report terminal transfer state: \(error)")
        }
    }

    public func requestPlaybackState() {
        sendRequest(.playbackStateRequest) { [weak self] response in
            switch response {
                case .playbackState(let state): self?.onPlaybackStateReceived?(state)
                case .noPlaybackState: self?.onPlaybackStateReceived?(nil)
                default: self?.onPlaybackStateReceived?(nil)
            }
        } onError: { [weak self] error in
            print("[WatchSessionManager] Playback state request failed: \(error)")
            self?.onPlaybackStateReceived?(nil)
        }
    }

    public func sendPlaybackCommand(_ command: RemotePlaybackCommand) {
        send(.playbackCommand(command))
    }

    private var canSendToPhone: Bool {
        guard let session,
            session.activationState == .activated,
            protocolContext(from: session.receivedApplicationContext) != nil
        else { return false }
        return true
    }

    private func protocolContext(from envelope: [String: Any]) -> WatchProtocolContext? {
        guard let message = try? WatchProtocolMessage.decode(from: envelope),
            case .context(let context) = message
        else { return nil }
        return context
    }

    private func storePhoneSourceList(_ sourceList: PhoneSourceList) async {
        latestPhoneSourceList = sourceList
        do {
            try await WatchStateStore.savePhoneSourceList(sourceList)
        } catch {
            print("[WatchSessionManager] Failed to persist phone source list: \(error)")
        }
        if session?.isReachable == true {
            send(.watchLibrary(await currentWatchLibrary()))
        }
    }

    private func send(_ message: WatchProtocolMessage) {
        guard let session, session.isReachable, canSendToPhone else { return }
        do {
            session.sendMessage(
                try message.encode(),
                replyHandler: nil,
                errorHandler: { error in
                    print("[WatchSessionManager] Send failed: \(error)")
                },
            )
        } catch {
            print("[WatchSessionManager] Failed to encode message: \(error)")
        }
    }

    private func sendRequest(
        _ message: WatchProtocolMessage,
        onReply: @escaping @Sendable (WatchProtocolMessage) -> Void,
        onError: @escaping @Sendable (Error) -> Void,
    ) {
        guard let session, session.isReachable, canSendToPhone else {
            onError(WatchSessionError.phoneUnavailable)
            return
        }
        do {
            session.sendMessage(
                try message.encode(),
                replyHandler: { envelope in
                    do {
                        onReply(try WatchProtocolMessage.decode(from: envelope))
                    } catch {
                        onError(error)
                    }
                },
                errorHandler: onError,
            )
        } catch {
            onError(error)
        }
    }

    private func reply(
        _ message: WatchProtocolMessage,
        to replyHandler: (([String: Any]) -> Void)?,
    ) {
        guard let replyHandler, let envelope = try? message.encode() else { return }
        replyHandler(envelope)
    }
}

private struct SendableWatchReplyHandler: @unchecked Sendable {
    let handler: ([String: Any]) -> Void

    init(_ handler: @escaping ([String: Any]) -> Void) {
        self.handler = handler
    }

    func reply(_ response: [String: Any]?) {
        guard let response else { return }
        handler(response)
    }
}

private enum WatchSessionError: Error {
    case phoneUnavailable
}

private enum WatchTransferImportError: LocalizedError {
    case bookIdentityMismatch
    case assemblyFailed

    var errorDescription: String? {
        switch self {
            case .bookIdentityMismatch: "Transferred book identity does not match"
            case .assemblyFailed: "Could not assemble the transferred book"
        }
    }
}
#endif
