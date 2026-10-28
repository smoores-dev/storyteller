import Foundation

#if canImport(CoreFoundation)
import CoreFoundation
#endif
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct LibraryRefreshSchedule {
    var owners: Set<UUID> = []
    var lastAttempt: Date?

    func delay(interval: TimeInterval, now: Date) -> TimeInterval? {
        guard !owners.isEmpty, interval > 0 else { return nil }
        guard let lastAttempt else { return 0 }
        return max(0, lastAttempt.addingTimeInterval(interval).timeIntervalSince(now))
    }
}

@globalActor
public actor BookServiceActor {
    public static let shared = BookServiceActor()

    private var sourceRecords: [BookSourceRecord]
    private var sourcesByID: [BookSourceID: any BookSourceActor]
    private var sourceRegistryLoaded = false
    private var lastUpdateErrorsBySourceID: [BookSourceID: String] = [:]
    private var libraryObservers: [UUID: @Sendable () -> Void] = [:]
    private var localMediaObserverID: UUID?
    private var networkAvailable: Bool?
    private var periodicLibraryRefreshTask: Task<Void, Never>?
    private var libraryRefreshSchedule = LibraryRefreshSchedule()

    public init() {
        self.sourceRecords = []
        self.sourcesByID = [:]
    }

    init(sources: [BookSourceRecord: any BookSourceActor]) {
        sourceRecords = Array(sources.keys)
        sourcesByID = Dictionary(uniqueKeysWithValues: sources.map { ($0.key.id, $0.value) })
        sourceRegistryLoaded = true
    }

    func start() async {
        await ensureSourceRegistryLoaded()
        await ensureLocalMediaObserver()
    }

    private func ensureLocalMediaObserver() async {
        guard localMediaObserverID == nil else { return }
        localMediaObserverID = await LocalMediaActor.shared.addObserver {
            Task {
                await BookServiceActor.shared.notifyLibraryObservers()
            }
        }
    }

    private func notifyLibraryObservers() async {
        for (_, callback) in libraryObservers {
            callback()
        }
    }

    private func sourceActor(for sourceID: BookSourceID) -> (any BookSourceActor)? {
        sourcesByID[sourceID]
    }

    private func closeFolderAccessIfNeeded(sourceID: BookSourceID) async {
        guard let folder = sourcesByID[sourceID] as? FolderSourceActor else { return }
        await folder.closeFolderAccess()
    }

    private func closeAllFolderAccess() async {
        for source in sourcesByID.values {
            guard let folder = source as? FolderSourceActor else { continue }
            await folder.closeFolderAccess()
        }
    }

    private func storytellerActor(for sourceID: BookSourceID) async -> StorytellerActor? {
        await ensureSourceRegistryLoaded()
        return sourceActor(for: sourceID) as? StorytellerActor
    }

    private func folderSourceActor(for sourceID: BookSourceID) async -> FolderSourceActor? {
        await ensureSourceRegistryLoaded()
        return sourceActor(for: sourceID) as? FolderSourceActor
    }

    public var bookSources: [BookSourceRecord] {
        get async {
            await ensureSourceRegistryLoaded()
            return sourceRecords
        }
    }

    public func lastUpdateBookError(sourceID: BookSourceID) async -> String? {
        await ensureSourceRegistryLoaded()
        if let actorError = await storytellerActor(for: sourceID)?.lastUpdateBookError {
            return actorError
        }
        return lastUpdateErrorsBySourceID[sourceID]
    }

    public var connectionStatus: ConnectionStatus {
        get async {
            await ensureSourceRegistryLoaded()
            var sawConnecting = false
            var firstError: String?
            for record in sourceRecords {
                guard let source = sourcesByID[record.id] else { continue }
                switch await source.connectionStatus {
                    case .connected:
                        return .connected
                    case .connecting:
                        sawConnecting = true
                    case .error(let message):
                        firstError = firstError ?? message
                    case .disconnected:
                        break
                }
            }
            if sawConnecting { return .connecting }
            if let firstError { return .error(firstError) }
            return .disconnected
        }
    }

    public func connectionStatus(sourceID: BookSourceID) async -> ConnectionStatus {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: sourceID) else { return .disconnected }
        return await source.connectionStatus
    }

    public func hasConnectedSource() async -> Bool {
        await ensureSourceRegistryLoaded()
        for record in sourceRecords {
            guard let source = sourcesByID[record.id] else { continue }
            if await source.connectionStatus == .connected {
                return true
            }
        }
        return false
    }

    public func sourceConnectionInfos() async -> [SourceConnectionInfo] {
        await ensureSourceRegistryLoaded()
        var result: [SourceConnectionInfo] = []
        for record in sourceRecords {
            guard let source = sourcesByID[record.id] else { continue }
            let status = await source.connectionStatus
            var netOpSucceeded: Bool? = nil
            if let storyteller = source as? StorytellerActor {
                netOpSucceeded = await storyteller.lastNetworkOpSucceeded
            }
            result.append(
                SourceConnectionInfo(
                    id: record.id,
                    name: record.name,
                    kind: record.kind,
                    status: status,
                    lastNetworkOpSucceeded: netOpSucceeded,
                )
            )
        }
        return result
    }

    public var isConfigured: Bool {
        get async {
            await ensureSourceRegistryLoaded()
            for actor in storytellerActors() {
                if await actor.isConfigured {
                    return true
                }
            }
            return false
        }
    }

    public var lastNetworkOpSucceeded: Bool? {
        get async {
            await ensureSourceRegistryLoaded()
            var sawValue = false
            for actor in storytellerActors() {
                guard let succeeded = await actor.lastNetworkOpSucceeded else { continue }
                sawValue = true
                if !succeeded {
                    return false
                }
            }
            return sawValue ? true : nil
        }
    }

    public func request_notify(callback: @escaping @Sendable () -> Void) async {
        await ensureSourceRegistryLoaded()
        for actor in storytellerActors() {
            await actor.request_notify(callback: callback)
        }
    }

    public func setActive(_ active: Bool, source: ActivitySource) async {
        await ensureSourceRegistryLoaded()
        for actor in storytellerActors() {
            await actor.setActive(active, source: source)
        }
    }

    public func networkAvailabilityDidChange(_ available: Bool) async {
        await ensureSourceRegistryLoaded()
        networkAvailable = available
        for actor in storytellerActors() {
            await actor.networkAvailabilityDidChange(available)
        }
    }

    /// New source actors must start from the platform's last reported network state,
    /// not the optimistic default, or a source created while offline would attempt
    /// doomed requests until the next path change.
    private func makeStorytellerActor(record: BookSourceRecord) async -> StorytellerActor {
        let actor = StorytellerActor(sourceRecord: record)
        if let networkAvailable {
            await actor.networkAvailabilityDidChange(networkAvailable)
        }
        return actor
    }

    public func setLogin(
        sourceID: BookSourceID,
        baseURL baseURLString: String,
        username: String,
        password: String,
    ) async -> Bool {
        guard let actor = await storytellerActor(for: sourceID) else { return false }
        return await actor.setLogin(baseURL: baseURLString, username: username, password: password)
    }

    public func createBookSource(_ configuration: BookSourceConfiguration) async
        -> BookSourceRecord?
    {
        await ensureSourceRegistryLoaded()
        let sourceID = await sourceIDForNewSource(
            kind: configuration.kind,
            configuredPath: configuration.storagePath,
        )
        return await createBookSource(id: sourceID, configuration: configuration)
    }

    public func createBookSource(
        id sourceID: BookSourceID,
        configuration: BookSourceConfiguration,
    ) async -> BookSourceRecord? {
        await ensureSourceRegistryLoaded()

        if sourceID.isEmpty || sourceRecords.contains(where: { $0.id == sourceID }) {
            return nil
        }
        let now = StorytellerDate.isoTimestamp(from: Date())
        let storageURL = await storageURLForNewSource(
            kind: configuration.kind,
            sourceID: sourceID,
            configuredPath: configuration.storagePath,
        )
        let record = BookSourceRecord(
            id: sourceID,
            name: normalizedSourceName(
                configuration.name,
                fallback: configuration.kind.defaultName,
            ),
            kind: configuration.kind,
            capabilities: capabilities(for: configuration.kind),
            createdAt: now,
            updatedAt: now,
            storagePath: storageURL?.path,
            storageBookmarkData: configuration.storageBookmarkData,
        )

        switch configuration.kind {
            case .storyteller:
                guard
                    let serverURL = configuration.serverURL,
                    let username = configuration.username,
                    let password = configuration.password
                        ?? (configuration.sessionToken != nil ? "" : nil)
                else {
                    return nil
                }
                let actor = await makeStorytellerActor(record: record)
                sourcesByID[record.id] = actor

                guard
                    await actor.configureCredentials(
                        baseURL: serverURL,
                        username: username,
                        password: password,
                        sessionToken: configuration.sessionToken,
                    )
                else {
                    sourcesByID[record.id] = nil
                    return nil
                }

                do {
                    try await AuthenticationActor.shared.saveCredentials(
                        url: serverURL,
                        username: username,
                        password: password,
                        sourceID: record.id,
                    )
                    if let sessionToken = configuration.sessionToken {
                        try await AuthenticationActor.shared.saveSessionToken(
                            sessionToken,
                            sourceID: record.id,
                        )
                    }
                } catch {
                    sourcesByID[record.id] = nil
                    return nil
                }
            case .localFolder:
                guard record.storagePath != nil else { return nil }
                if let storageURL {
                    try? await FilesystemActor.shared.ensureSourceIDMarker(
                        in: storageURL,
                        sourceID: record.id,
                    )
                }
                await closeFolderAccessIfNeeded(sourceID: record.id)
                sourcesByID[record.id] = await makeFolderSourceActor(record: record)
        }

        await upsertSourceRecord(record)
        return record
    }

    /// Every FolderSourceActor must be created through here: the change handler is what routes
    /// watcher-triggered rescans to UI observers, and a bare actor rescans invisibly.
    private func makeFolderSourceActor(record: BookSourceRecord) async -> FolderSourceActor {
        let actor = FolderSourceActor(sourceRecord: record)
        await actor.setLibraryChangeHandler { [weak self] in
            await self?.notifyLibraryObservers()
        }
        return actor
    }

    public func updateBookSource(
        id sourceID: BookSourceID,
        configuration: BookSourceConfiguration,
    ) async -> Bool {
        await ensureSourceRegistryLoaded()
        guard let existing = sourceRecords.first(where: { $0.id == sourceID }) else {
            return false
        }
        let kind = existing.kind

        let updatedRecord = BookSourceRecord(
            id: existing.id,
            name: normalizedSourceName(configuration.name, fallback: existing.name),
            kind: kind,
            capabilities: capabilities(for: kind),
            createdAt: existing.createdAt,
            updatedAt: StorytellerDate.isoTimestamp(from: Date()),
            storagePath: updatedStoragePath(
                existing: existing,
                configuration: configuration,
            ),
            storageBookmarkData: updatedStorageBookmarkData(
                existing: existing,
                configuration: configuration,
            ),
        )

        switch kind {
            case .storyteller:
                guard
                    let serverURL = configuration.serverURL,
                    let username = configuration.username,
                    let password = configuration.password
                        ?? (configuration.sessionToken != nil ? "" : nil)
                else {
                    return false
                }

                let actor: StorytellerActor
                if let existingActor = sourcesByID[sourceID] as? StorytellerActor {
                    actor = existingActor
                } else {
                    await closeFolderAccessIfNeeded(sourceID: sourceID)
                    actor = await makeStorytellerActor(record: updatedRecord)
                    sourcesByID[sourceID] = actor
                }

                guard
                    await actor.configureCredentials(
                        baseURL: serverURL,
                        username: username,
                        password: password,
                        sessionToken: configuration.sessionToken,
                    )
                else {
                    return false
                }

                do {
                    try await AuthenticationActor.shared.saveCredentials(
                        url: serverURL,
                        username: username,
                        password: password,
                        sourceID: sourceID,
                    )
                    if let sessionToken = configuration.sessionToken {
                        try await AuthenticationActor.shared.saveSessionToken(
                            sessionToken,
                            sourceID: sourceID,
                        )
                    }
                } catch {
                    return false
                }

                await upsertSourceRecord(updatedRecord)
                await actor.updateSourceRecord(updatedRecord)
            case .localFolder:
                guard updatedRecord.storagePath != nil else { return false }
                if let storagePath = updatedRecord.storagePath {
                    let storageURL = URL(fileURLWithPath: storagePath, isDirectory: true)
                    if let marker = try? await FilesystemActor.shared.sourceIDMarker(
                        in: storageURL
                    ),
                        marker != sourceID
                    {
                        return false
                    }
                    try? await FilesystemActor.shared.ensureSourceIDMarker(
                        in: storageURL,
                        sourceID: sourceID,
                    )
                }
                await closeFolderAccessIfNeeded(sourceID: sourceID)
                sourcesByID[sourceID] = await makeFolderSourceActor(record: updatedRecord)
                await upsertSourceRecord(updatedRecord)
        }
        return true
    }

    public func testBookSourceConnection(sourceID: BookSourceID) async -> Bool {
        await ensureSourceRegistryLoaded()
        guard
            sourceRecords.contains(where: { $0.id == sourceID }),
            let credentials = try? await AuthenticationActor.shared.loadCredentials(
                sourceID: sourceID
            ),
            let actor = await storytellerActor(for: sourceID)
        else {
            return false
        }

        return await actor.setLogin(
            baseURL: credentials.url,
            username: credentials.username,
            password: credentials.password,
            sessionToken: try? await AuthenticationActor.shared.loadSessionToken(
                sourceID: sourceID
            ),
        )
    }

    /// setLogin's internal fetch never writes the local media cache that UI observers
    /// read, so the library must be re-fetched at the service level to appear at all.
    public func connectBookSource(sourceID: BookSourceID) async -> Bool {
        guard await testBookSourceConnection(sourceID: sourceID) else { return false }
        _ = await fetchLibraryInformation(sourceID: sourceID)
        await notifyLibraryObservers()
        return true
    }

    public func removeBookSource(
        id sourceID: BookSourceID,
        removeLocalData: Bool = true,
    ) async -> Bool {
        await ensureSourceRegistryLoaded()
        guard sourceRecords.contains(where: { $0.id == sourceID }) else {
            return false
        }

        if let actor = sourcesByID[sourceID] as? StorytellerActor {
            _ = await actor.logout()
        }
        await closeFolderAccessIfNeeded(sourceID: sourceID)

        do {
            try await AuthenticationActor.shared.deleteCredentials(sourceID: sourceID)
            if removeLocalData {
                try await LocalMediaActor.shared.removeSourceCacheData(sourceID: sourceID)
            }
        } catch {
            return false
        }

        sourceRecords.removeAll { $0.id == sourceID }
        sourcesByID[sourceID] = nil

        try? await FilesystemActor.shared.saveBookSources(sourceRecords)
        await notifyLibraryObservers()
        return true
    }

    public func credentials(for sourceID: BookSourceID) async
        -> (url: String, username: String, password: String)?
    {
        try? await AuthenticationActor.shared.loadCredentials(sourceID: sourceID)
    }

    public func sessionToken(for sourceID: BookSourceID) async -> String? {
        try? await AuthenticationActor.shared.loadSessionToken(sourceID: sourceID)
    }

    public func checkBookUpdatePermission(
        sourceID: BookSourceID
    ) async -> StorytellerActor.PermissionCheckResult {
        guard let storyteller = await storytellerActor(for: sourceID) else {
            return .error("Not connected to server")
        }
        return await storyteller.checkBookUpdatePermission()
    }

    public func reloadSourceRegistry() async {
        await closeAllFolderAccess()
        sourcesByID.removeAll()
        sourceRegistryLoaded = false
        await ensureSourceRegistryLoaded()
        _ = await fetchLibraryInformation()
        await notifyLibraryObservers()
    }

    /// Cold-start library refresh. Unlike `reloadSourceRegistry`, this loads the registry in place
    /// rather than tearing it down and rebuilding, so a concurrent book restore resolving its local
    /// media is never momentarily left with an empty source table. The slow network listing
    /// (`fetchLibraryInformation`, a serial per-source fetch) lives here so it stays off the restore
    /// critical path.
    public func refreshLibraryFromSources() async {
        await ensureSourceRegistryLoaded()
        _ = await fetchLibraryInformation()
        await notifyLibraryObservers()
    }

    public func setLibraryRefreshDemand(_ needed: Bool, owner: UUID) {
        let previous = libraryRefreshSchedule.owners
        if needed {
            libraryRefreshSchedule.owners.insert(owner)
        } else {
            libraryRefreshSchedule.owners.remove(owner)
        }
        guard previous.isEmpty != libraryRefreshSchedule.owners.isEmpty else { return }
        restartPeriodicLibraryRefresh()
    }

    public func restartPeriodicLibraryRefresh() {
        periodicLibraryRefreshTask?.cancel()
        periodicLibraryRefreshTask = nil
        guard !libraryRefreshSchedule.owners.isEmpty else { return }
        periodicLibraryRefreshTask = Task {
            while !Task.isCancelled {
                let config = await SettingsActor.shared.config
                guard
                    let delay = libraryRefreshSchedule.delay(
                        interval: config.sync.metadataRefreshIntervalSeconds,
                        now: Date(),
                    )
                else { return }
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                guard !Task.isCancelled, !libraryRefreshSchedule.owners.isEmpty else { return }
                _ = await fetchLibraryInformation()
            }
        }
    }

    @discardableResult
    public func fetchLibraryInformation() async -> [BookMetadata]? {
        await ensureSourceRegistryLoaded()
        defer {
            if !Task.isCancelled { libraryRefreshSchedule.lastAttempt = Date() }
        }

        var metadata: [BookMetadata] = []
        var sawSource = false

        let loopStart = Date().timeIntervalSinceReferenceDate
        debugLog(
            "[ConnDiag] fetchLibraryInformation: serial loop over \(sourceRecords.count) sources start"
        )
        for record in sourceRecords {
            guard !Task.isCancelled else { return nil }
            guard let source = sourcesByID[record.id] else { continue }
            sawSource = true

            let sourceStart = Date().timeIntervalSinceReferenceDate
            let sourceMetadataOptional = await source.fetchLibraryInformation()
            let sourceElapsed = (Date().timeIntervalSinceReferenceDate - sourceStart) * 1000
            debugLog(
                "[ConnDiag] fetchLibraryInformation: source='\(record.name)' kind=\(record.kind) elapsed=\(String(format: "%.0f", sourceElapsed))ms books=\(sourceMetadataOptional?.count ?? -1)"
            )
            guard let sourceMetadata = sourceMetadataOptional else {
                continue
            }

            let named = sourceMetadata.map { book in
                var named = book
                named.source = named.source ?? record.name
                return named
            }
            metadata.append(contentsOf: named)
            CoverCacheActor.shared.noteLibrary(books: named)
        }

        let loopElapsed = (Date().timeIntervalSinceReferenceDate - loopStart) * 1000
        debugLog(
            "[ConnDiag] fetchLibraryInformation: serial loop done total=\(String(format: "%.0f", loopElapsed))ms books=\(metadata.count)"
        )

        guard sawSource else { return nil }
        return metadata
    }

    @discardableResult
    public func fetchLibraryInformation(sourceID: BookSourceID) async -> [BookMetadata]? {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: sourceID) else { return nil }
        guard let metadata = await source.fetchLibraryInformation() else { return nil }
        let sourceRecord = sourceRecords.first(where: { $0.id == sourceID })
        let named = metadata.map { book in
            var named = book
            named.source = named.source ?? sourceRecord?.name
            return named
        }
        CoverCacheActor.shared.noteLibrary(books: named)
        return named
    }

    public func refreshBookFromSource(
        bookID: BookID,
        policy: BookRefreshPolicy = .refresh,
    ) async -> BookRefreshResult {
        await ensureSourceRegistryLoaded()
        debugLog(
            "[MetadataCoverRefresh] BSA refreshBookFromSource start bookID=\(bookID) policy=\(policy)"
        )
        guard let source = sourceActor(for: bookID.sourceID) else {
            debugLog(
                "[MetadataCoverRefresh] BSA refreshBookFromSource missing source bookID=\(bookID)"
            )
            return BookRefreshResult(
                book: nil,
                source: .cache,
                error: "Book source is unavailable.",
            )
        }

        let cachedBook = await cachedBookMetadata(bookID: bookID)
        debugLog(
            "[MetadataCoverRefresh] BSA cached book bookID=\(bookID) found=\(cachedBook != nil) cachedUpdatedAt=\(cachedBook?.updatedAt ?? "nil")"
        )
        guard policy != .cachedOnly else {
            return BookRefreshResult(book: cachedBook, source: .cache)
        }

        if policy == .forceRefresh, let storyteller = source as? StorytellerActor {
            debugLog(
                "[MetadataCoverRefresh] BSA fetching Storyteller book details bookID=\(bookID)"
            )
            guard let refreshed = await storyteller.fetchBookDetails(for: bookID.uuid) else {
                debugLog(
                    "[MetadataCoverRefresh] BSA Storyteller book details failed bookID=\(bookID) returningCache=\(cachedBook != nil)"
                )
                return BookRefreshResult(
                    book: cachedBook,
                    source: .cache,
                    error: "Could not refresh book from Storyteller.",
                )
            }
            debugLog(
                "[MetadataCoverRefresh] BSA replacing cached book metadata bookID=\(bookID) refreshedUpdatedAt=\(refreshed.updatedAt ?? "nil")"
            )
            // Atomic replace with a single observer notification. Removing the book
            // first would delete its downloaded media and strand cover states held by
            // views, and the intermediate notify defeats updatedAt change detection.
            try? await LocalMediaActor.shared.updateSourceCacheBookMetadata(
                refreshed
            )
            debugLog(
                "[MetadataCoverRefresh] BSA force refresh complete bookID=\(bookID) refreshedUpdatedAt=\(refreshed.updatedAt ?? "nil")"
            )
            return BookRefreshResult(book: refreshed, source: .source)
        }

        debugLog(
            "[MetadataCoverRefresh] BSA fetching full source library bookID=\(bookID)"
        )
        guard let sourceMetadata = await fetchLibraryInformation(sourceID: bookID.sourceID),
            let refreshed = sourceMetadata.first(where: { $0.id == bookID })
        else {
            debugLog(
                "[MetadataCoverRefresh] BSA full source refresh failed bookID=\(bookID) returningCache=\(cachedBook != nil)"
            )
            return BookRefreshResult(
                book: cachedBook,
                source: .cache,
                error: "Could not refresh book from source.",
            )
        }

        debugLog(
            "[MetadataCoverRefresh] BSA full source refresh complete bookID=\(bookID) refreshedUpdatedAt=\(refreshed.updatedAt ?? "nil")"
        )
        return BookRefreshResult(book: refreshed, source: .source)
    }

    public func librarySnapshot(policy: LibrarySnapshotPolicy = .cachedOnly) async
        -> BookServiceLibrarySnapshot
    {
        await ensureSourceRegistryLoaded()

        switch policy {
            case .cachedOnly:
                return await cachedLibrarySnapshot()
            case .cachedThenRefresh:
                let snapshot = await cachedLibrarySnapshot()
                Task {
                    _ = await self.fetchLibraryInformation()
                    await self.notifyLibraryObservers()
                }
                return snapshot
            case .refresh:
                _ = await fetchLibraryInformation()
                return await cachedLibrarySnapshot()
        }
    }

    private func cachedLibrarySnapshot() async -> BookServiceLibrarySnapshot {
        let folderSourceIDs = Set(sourceRecords.filter { $0.kind == .localFolder }.map(\.id))
        let cachedMetadata = await LocalMediaActor.shared.libraryMetadata()
            .filter { !folderSourceIDs.contains($0.sourceID) }
        let metadata = cachedMetadata + (await cachedLocalFolderBooks())
        return BookServiceLibrarySnapshot(
            books: metadata,
            mediaPaths: await resolvedLocalMediaPaths(for: metadata),
            cachedMediaPaths: await LocalMediaActor.shared.cachedMediaPaths(for: cachedMetadata),
            sources: sourceRecords,
        )
    }

    private func cachedBookMetadata(bookID: BookID) async -> BookMetadata? {
        let folderSourceIDs = Set(sourceRecords.filter { $0.kind == .localFolder }.map(\.id))
        if folderSourceIDs.contains(bookID.sourceID) {
            return await localFolderBooks(sourceID: bookID.sourceID).first { $0.id == bookID }
        }
        return await LocalMediaActor.shared.libraryMetadata().first { $0.id == bookID }
    }

    public func addLibraryCacheObserver(
        _ callback: @escaping @Sendable () -> Void
    ) async -> UUID {
        let id = UUID()
        libraryObservers[id] = callback
        await ensureLocalMediaObserver()
        return id
    }

    public func scanLibraryCache() async throws {
        await LocalMediaActor.shared.reconcileDownloadedMedia()
    }

    public func updateLibraryCacheMetadata(
        _ metadata: [BookMetadata],
        replacingSourceID sourceID: BookSourceID,
    ) async throws {
        await ensureSourceRegistryLoaded()
        let folderSourceIDs = Set(sourceRecords.filter { $0.kind == .localFolder }.map(\.id))
        if folderSourceIDs.contains(sourceID) {
            await notifyLibraryObservers()
            return
        }
        let cacheableMetadata = metadata.filter { !folderSourceIDs.contains($0.sourceID) }
        try await LocalMediaActor.shared.updateSourceCacheMetadata(
            cacheableMetadata,
            replacingSourceID: sourceID,
        )
    }

    public func importDownloadedFileToCache(
        from tempURL: URL,
        metadata: BookMetadata,
        category: LocalMediaCategory,
        filename: String,
        audioIsPackage: Bool = true,
    ) async throws {
        try await LocalMediaActor.shared.importDownloadedFile(
            from: tempURL,
            metadata: metadata,
            category: category,
            filename: filename,
            audioIsPackage: audioIsPackage,
        )
    }

    public func localFolderBooks() async -> [BookMetadata] {
        await ensureSourceRegistryLoaded()
        return await localFolderBooks(
            in: sourceRecords.filter { $0.kind == .localFolder }
        )
    }

    public func localFolderBooks(sourceID: BookSourceID) async -> [BookMetadata] {
        await ensureSourceRegistryLoaded()
        return await localFolderBooks(
            in: sourceRecords.filter { $0.id == sourceID && $0.kind == .localFolder }
        )
    }

    private func localFolderBooks(in folderRecords: [BookSourceRecord]) async -> [BookMetadata] {
        var metadata: [BookMetadata] = []
        for record in folderRecords {
            guard let folder = sourceActor(for: record.id) as? FolderSourceActor else { continue }
            guard let sourceMetadata = await folder.fetchLibraryInformation() else { continue }
            let named = sourceMetadata.map { book in
                var named = book
                named.source = named.source ?? record.name
                return named
            }
            metadata.append(contentsOf: named)
        }
        return metadata
    }

    public func cachedLocalFolderBooks() async -> [BookMetadata] {
        await ensureSourceRegistryLoaded()
        return await cachedLocalFolderBooks(
            in: sourceRecords.filter { $0.kind == .localFolder }
        )
    }

    public func cachedLocalFolderBooks(sourceID: BookSourceID) async -> [BookMetadata] {
        await ensureSourceRegistryLoaded()
        return await cachedLocalFolderBooks(
            in: sourceRecords.filter { $0.id == sourceID && $0.kind == .localFolder }
        )
    }

    private func cachedLocalFolderBooks(in folderRecords: [BookSourceRecord]) async
        -> [BookMetadata]
    {
        var metadata: [BookMetadata] = []
        for record in folderRecords {
            guard let folder = sourceActor(for: record.id) as? FolderSourceActor else { continue }
            let sourceMetadata = await folder.cachedLibraryInformation()
            let named = sourceMetadata.map { book in
                var named = book
                named.source = named.source ?? record.name
                return named
            }
            metadata.append(contentsOf: named)
        }
        return metadata
    }

    public func localMediaDirectory(
        for bookID: BookID,
        category: LocalMediaCategory,
    ) async -> URL? {
        guard
            let media = await resolveLocalMedia(
                for: bookID,
                category: category,
            )
        else {
            return nil
        }
        return media.url.deletingLastPathComponent()
    }

    public func deleteCachedMedia(
        for bookID: BookID,
        category: LocalMediaCategory,
    ) async throws {
        await ensureSourceRegistryLoaded()
        try await LocalMediaActor.shared.deleteMedia(
            for: bookID,
            category: category,
        )
    }

    public func fetchCoverImage(
        for bookID: BookID,
        audio: Bool = false,
        width: Int? = 209,
        height: Int? = 320,
        version: String? = nil,
        ifNoneMatch: String? = nil,
        ifModifiedSince: String? = nil,
    ) async -> BookCover? {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return nil }
        return await source.fetchCoverImage(
            for: bookID.uuid,
            audio: audio,
            width: width,
            height: height,
            version: version,
            ifNoneMatch: ifNoneMatch,
            ifModifiedSince: ifModifiedSince,
        )
    }

    public func cachedCoverData(for bookID: BookID, audio: Bool) async -> Data? {
        await CoverCacheActor.shared.cachedSizedCoverData(for: bookID, audio: audio)
    }

    public func cachedFullCoverData(for bookID: BookID, audio: Bool) async -> Data? {
        await CoverCacheActor.shared.cachedFullCoverData(for: bookID, audio: audio)
    }

    public func loadFullCover(
        for bookID: BookID,
        audio: Bool,
        version: String? = nil,
        allowNetwork: Bool = true,
    ) async -> Data? {
        await CoverCacheActor.shared.fullCover(
            for: bookID,
            audio: audio,
            version: version,
            allowNetwork: allowNetwork,
        )
    }

    public func loadCover(
        for bookID: BookID,
        audio: Bool,
        width: Int?,
        height: Int?,
        version: String?,
        allowNetwork: Bool,
        policy: CoverLoadPolicy,
    ) async -> CoverLoadResponse {
        let ask: CoverCacheActor.Ask =
            if let width, let height {
                .sized(width: width, height: height)
            } else {
                .full
            }
        return await CoverCacheActor.shared.cover(
            for: bookID,
            audio: audio,
            ask: ask,
            version: version,
            allowNetwork: allowNetwork,
            policy: policy,
        )
    }

    public func persistCachedCover(bookID: BookID, audio: Bool, data: Data) async {
        await CoverCacheActor.shared.persistSizedCover(bookID: bookID, audio: audio, data: data)
    }

    public func invalidateCachedCovers(for bookID: BookID) async throws {
        await CoverCacheActor.shared.invalidate(bookID: bookID)
    }

    public func removeAllCachedCovers() async throws {
        await CoverCacheActor.shared.removeAll()
    }

    func fetchBookDetails(for bookID: BookID) async -> BookMetadata? {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return nil }
        return await storyteller.fetchBookDetails(for: bookID.uuid)
    }

    public func resolveLocalMedia(
        for bookID: BookID,
        category: LocalMediaCategory,
    ) async -> ResolvedLocalMedia? {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return nil }
        return await source.resolveLocalMedia(for: bookID.uuid, category: category)
    }

    /// Packages a book's local audiobook into a Readium `.audiobook` zip for the content server's
    /// download. Returns a temp file URL the caller is responsible for deleting after sending it.
    public func packageAudiobook(for bookID: BookID) async -> URL? {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return nil }
        return await source.packageAudiobook(for: bookID.uuid)
    }

    public func resolvedLocalMediaPaths(for metadata: [BookMetadata]) async -> [BookID: MediaPaths]
    {
        await ensureSourceRegistryLoaded()
        let folderSourceIDs = Set(sourceRecords.filter { $0.kind == .localFolder }.map(\.id))

        var pathsByBookID = await LocalMediaActor.shared.cachedMediaPaths(for: metadata)

        for book in metadata {
            guard folderSourceIDs.contains(book.sourceID) else { continue }
            var paths = pathsByBookID[book.id] ?? MediaPaths()
            if paths.ebookPath == nil,
                let ebook = await resolveLocalMedia(
                    for: book.id,
                    category: .ebook,
                )
            {
                paths.ebookPath = ebook.url
            }
            if paths.audioPath == nil,
                let audio = await resolveLocalMedia(
                    for: book.id,
                    category: .audio,
                )
            {
                paths.audioPath = audio.url
            }
            if paths.syncedPath == nil,
                let synced = await resolveLocalMedia(
                    for: book.id,
                    category: .synced,
                )
            {
                paths.syncedPath = synced.url
            }
            if paths.ebookPath != nil || paths.audioPath != nil || paths.syncedPath != nil {
                pathsByBookID[book.id] = paths
            }
        }
        return pathsByBookID
    }

    public func prepareEbookForReading(
        bookID: BookID,
        category: LocalMediaCategory,
    ) async throws -> PreparedEbookMedia {
        guard
            let resolved = await resolveLocalMedia(
                for: bookID,
                category: category,
            )
        else {
            throw LocalMediaError.importFailed("Local EPUB media is unavailable.")
        }

        let readerURL = try await FilesystemActor.shared.prepareEpubForReading(
            epubPath: resolved.url,
            sourceID: resolved.sourceID,
            bookID: resolved.bookID.uuid,
            category: resolved.category,
        )

        return PreparedEbookMedia(
            bookID: resolved.bookID,
            category: resolved.category,
            originalURL: resolved.url,
            readerURL: readerURL,
            locationKind: resolved.kind,
        )
    }

    public func createAuthenticatedDownloadRequest(
        for bookID: BookID,
        format: StorytellerBookFormat,
    ) async -> URLRequest? {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return nil }
        return await storyteller.createAuthenticatedDownloadRequest(
            for: bookID.uuid,
            format: format,
        )
    }

    public func createAuthenticatedPositionUploadRequest(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
    ) async -> ProgressUploadRequest? {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return nil }
        return await storyteller.createAuthenticatedPositionUploadRequest(
            bookId: bookID.uuid,
            locator: locator,
            timestamp: timestamp,
        )
    }

    public func updateBook(
        _ payload: StorytellerBookUpdatePayload,
        bookID: BookID,
        textCover: StorytellerCoverUpload? = nil,
        audioCover: StorytellerCoverUpload? = nil,
    ) async -> BookMetadata? {
        await ensureSourceRegistryLoaded()
        guard let storyteller = sourceActor(for: bookID.sourceID) as? StorytellerActor else {
            lastUpdateErrorsBySourceID[bookID.sourceID] =
                "No Storyteller server is configured for this book."
            return nil
        }

        guard
            let metadata = await storyteller.updateBook(
                payload,
                textCover: textCover,
                audioCover: audioCover,
            )
        else {
            lastUpdateErrorsBySourceID[bookID.sourceID] =
                await storyteller.lastUpdateBookError ?? "Update failed"
            return nil
        }

        lastUpdateErrorsBySourceID[bookID.sourceID] = nil

        debugLog(
            "[MetadataCoverRefresh] BSA updateBook success bookID=\(bookID) updatedAt=\(metadata.updatedAt ?? "nil")"
        )

        let refreshResult = await refreshBookFromSource(
            bookID: bookID,
            policy: .forceRefresh,
        )
        if let refreshed = refreshResult.book, refreshResult.source == .source {
            debugLog(
                "[MetadataCoverRefresh] BSA updateBook force refreshed bookID=\(bookID) updatedAt=\(refreshed.updatedAt ?? "nil")"
            )
            return refreshed
        }

        debugLog(
            "[MetadataCoverRefresh] BSA updateBook force refresh failed; caching update response bookID=\(bookID) updatedAt=\(metadata.updatedAt ?? "nil") error=\(refreshResult.error ?? "nil")"
        )
        do {
            try await LocalMediaActor.shared.updateSourceCacheBookMetadata(
                metadata
            )
        } catch {
            debugLog(
                "[MetadataCoverRefresh] BSA updateBook cache fallback write failed bookID=\(metadata.uuid) error=\(error)"
            )
        }
        return metadata
    }

    public func deleteBook(_ bookID: BookID) async -> Bool {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return false }

        let success = await source.deleteBook(bookID.uuid)
        if success {
            await notifyLibraryObservers()
        }
        return success
    }

    public func deleteBookAsset(
        _ bookID: BookID,
        type: StorytellerBookFormat,
    ) async -> DeleteAssetResult {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return .failed }

        let result = await source.deleteAsset(bookID.uuid, category: localMediaCategory(for: type))
        if case .success = result {
            await notifyLibraryObservers()
        }
        return result
    }

    public func startAlignment(
        for bookID: BookID,
        restart: AlignmentRestartMode = .none,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return false }
        return await storyteller.startAlignment(for: bookID.uuid, restart: restart)
    }

    public func cancelAlignment(for bookID: BookID) async -> Bool {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return false }
        return await storyteller.cancelAlignment(for: bookID.uuid)
    }

    public func upgradeEpub(for bookID: BookID) async -> Bool {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return false }
        return await storyteller.upgradeEpub(for: bookID.uuid)
    }

    public func uploadBookAssets(
        bookID: BookID,
        ebook: StorytellerUploadAsset? = nil,
        audiobook: StorytellerUploadAsset? = nil,
        audiobooks: [StorytellerUploadAsset] = [],
        readaloud: StorytellerUploadAsset? = nil,
        collectionUUID: String? = nil,
        onProgress: (@Sendable (Double) -> Void)? = nil,
    ) async -> Bool {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return false }

        let audiobookAssets = audiobooks + [audiobook].compactMap(\.self)
        let title =
            ebook?.filename
            ?? readaloud?.filename
            ?? audiobookAssets.first?.filename
            ?? "Book"
        let acceptedBookID = await source.acceptBook(
            bookUUID: bookID.uuid,
            title: title,
            ebook: ebook,
            audiobooks: audiobookAssets,
            readaloud: readaloud,
            collectionUUID: collectionUUID,
            onProgress: onProgress,
        )
        if acceptedBookID != nil {
            await notifyLibraryObservers()
        }
        return acceptedBookID != nil
    }

    public func replaceBookAsset(
        _ asset: StorytellerUploadAsset,
        bookID: BookID,
        replaceMetadata: Bool = false,
        onProgress: (@Sendable (Double) -> Void)? = nil,
    ) async -> ReplaceAssetResult {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return .failed }

        let result = await source.replaceAsset(
            asset,
            bookID: bookID.uuid,
            replaceMetadata: replaceMetadata,
            onProgress: onProgress,
        )
        if case .success = result {
            await notifyLibraryObservers()
        }
        return result
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

    public func locallyAvailableMedia(for bookID: BookID) async -> Set<LocalMediaCategory> {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return [] }
        return await source.locallyAvailableMedia(for: bookID.uuid)
    }

    /// Copies a book between sources. The source actor exports its locally-available media and the
    /// destination accepts it; neither end's storage layout is visible here. The caller should ensure
    /// every existing category is downloaded first (see `locallyAvailableMedia`).
    public func copyBook(
        _ book: BookMetadata,
        to destinationSourceID: BookSourceID,
        onProgress: (@Sendable (Double) -> Void)? = nil,
    ) async -> Bool {
        await ensureSourceRegistryLoaded()
        guard let destination = sourceActor(for: destinationSourceID) else {
            debugLog("[BookServiceActor] copyBook: unknown destination \(destinationSourceID)")
            return false
        }
        guard let source = sourceActor(for: book.sourceID) else {
            debugLog("[BookServiceActor] copyBook: unknown source for \(book.id)")
            return false
        }

        let available = await source.locallyAvailableMedia(for: book.uuid)
        guard requiredCategories(for: book).isSubset(of: available) else {
            debugLog("[BookServiceActor] copyBook: \(book.id) not fully downloaded at source")
            return false
        }

        guard let assets = await source.exportAssets(for: book.uuid) else {
            debugLog("[BookServiceActor] copyBook: source could not export \(book.id)")
            return false
        }

        // acceptBook reports the id the destination actually gave the book (a folder source's
        // scan can mint its own or merge into an existing work); progress must target that id,
        // not the one we proposed.
        guard
            let destinationBookID = await destination.acceptBook(
                bookUUID: UUID().uuidString,
                title: book.title,
                ebook: assets.ebook,
                audiobooks: assets.audiobooks,
                readaloud: assets.readaloud,
                collectionUUID: nil,
                onProgress: onProgress,
            )
        else { return false }

        // Carry reading progress across: read the source's locator and push it onto the new book id.
        // Best-effort: a progress-mirror failure does not undo the media copy.
        if let position = await source.fetchBookPosition(bookId: book.uuid),
            let locator = position.locator
        {
            let result = await destination.sendProgressToServer(
                bookId: destinationBookID,
                locator: locator,
                timestamp: position.timestamp ?? floor(Date().timeIntervalSince1970 * 1000),
            )
            if case .success = result {
            } else {
                debugLog(
                    "[BookServiceActor] copyBook: progress mirror failed for \(destinationBookID)"
                )
            }
        }

        await fetchLibraryInformation()
        await notifyLibraryObservers()
        return true
    }

    private func requiredCategories(for book: BookMetadata) -> Set<LocalMediaCategory> {
        var categories: Set<LocalMediaCategory> = []
        if book.hasAvailableEbook { categories.insert(.ebook) }
        if book.hasAvailableAudiobook { categories.insert(.audio) }
        if book.hasAvailableReadaloud { categories.insert(.synced) }
        return categories
    }

    public func getAvailableStatuses() async -> [BookStatus] {
        await ensureSourceRegistryLoaded()
        var statusesByKey: [String: BookStatus] = [:]
        for status in FolderSourceActor.availableStatuses {
            statusesByKey[status.uuid ?? status.name.lowercased()] = status
        }
        for storyteller in storytellerActors() {
            for status in await storyteller.getAvailableStatuses() {
                statusesByKey[status.uuid ?? status.name.lowercased()] = status
            }
        }
        return statusesByKey.values.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    public func getAvailableStatuses(sourceID: BookSourceID) async -> [BookStatus] {
        await ensureSourceRegistryLoaded()
        if let storyteller = sourceActor(for: sourceID) as? StorytellerActor {
            return await storyteller.getAvailableStatuses()
        }
        if sourceActor(for: sourceID) is FolderSourceActor {
            return FolderSourceActor.availableStatuses
        }
        return []
    }

    public func updateStatus(
        forBooks bookIDs: [BookID],
        toStatusNamed statusName: String,
    ) async -> Bool {
        await ensureSourceRegistryLoaded()
        for (sourceID, sourceBookIDs) in Dictionary(grouping: bookIDs, by: \.sourceID) {
            guard let source = sourceActor(for: sourceID) else { return false }
            let success = await source.updateStatus(
                forBooks: sourceBookIDs.map(\.uuid),
                toStatusNamed: statusName,
            )
            guard success else { return false }
        }
        if !bookIDs.isEmpty {
            await notifyLibraryObservers()
        }
        return true
    }

    public func fetchCollections(sourceID: BookSourceID) async -> [StorytellerCollection]? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchCollections()
    }

    public func createCollection(
        _ payload: StorytellerCollectionCreatePayload,
        sourceID: BookSourceID,
    ) async
        -> StorytellerCollection?
    {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.createCollection(payload)
    }

    public func deleteCollection(uuid: String, sourceID: BookSourceID) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.deleteCollection(uuid: uuid)
    }

    public func sendProgressToServer(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
    ) async -> HTTPResult {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return .noConnection }
        return await source.sendProgressToServer(
            bookId: bookID.uuid,
            locator: locator,
            timestamp: timestamp,
        )
    }

    public func fetchBookPosition(bookID: BookID) async -> BookReadingPosition? {
        await ensureSourceRegistryLoaded()
        guard let source = sourceActor(for: bookID.sourceID) else { return nil }
        return await source.fetchBookPosition(bookId: bookID.uuid)
    }

    private func ensureSourceRegistryLoaded() async {
        guard !sourceRegistryLoaded else { return }

        let loadedSources =
            (try? await FilesystemActor.shared.loadOrCreateBookSources())
            ?? []

        sourceRecords = loadedSources
        sourceRegistryLoaded = true

        for record in sourceRecords {
            switch record.kind {
                case .storyteller:
                    let actor: StorytellerActor
                    if let existing = sourcesByID[record.id] as? StorytellerActor {
                        actor = existing
                    } else {
                        actor = await makeStorytellerActor(record: record)
                        sourcesByID[record.id] = actor
                    }

                    if !(await actor.isConfigured),
                        let credentials = try? await AuthenticationActor.shared.loadCredentials(
                            sourceID: record.id
                        )
                    {
                        _ = await actor.configureCredentials(
                            baseURL: credentials.url,
                            username: credentials.username,
                            password: credentials.password,
                            sessionToken: try? await AuthenticationActor.shared.loadSessionToken(
                                sourceID: record.id
                            ),
                        )
                    }

                    sourcesByID[record.id] = actor
                case .localFolder:
                    if sourcesByID[record.id] as? FolderSourceActor == nil {
                        sourcesByID[record.id] = await makeFolderSourceActor(record: record)
                    }
            }
        }
    }

    /// Sources the logged-in user may upload new books to right now: folders always, storyteller
    /// servers when the user holds the server's book-create permission.
    public func uploadPermittedSourceIDs() async -> Set<BookSourceID> {
        await ensureSourceRegistryLoaded()
        var permitted: Set<BookSourceID> = []
        for record in sourceRecords where record.capabilities.canUploadBooks {
            if let storyteller = sourcesByID[record.id] as? StorytellerActor {
                if await storyteller.currentUserCanUploadBooks() {
                    permitted.insert(record.id)
                }
            } else {
                permitted.insert(record.id)
            }
        }
        return permitted
    }

    private func storytellerActors() -> [StorytellerActor] {
        sourceRecords.compactMap { record in
            guard record.kind == .storyteller else { return nil }
            return sourcesByID[record.id] as? StorytellerActor
        }
    }

    private func upsertSourceRecord(_ record: BookSourceRecord) async {
        await ensureSourceRegistryLoaded()

        sourceRecords.replaceOrAppend(record)

        try? await FilesystemActor.shared.saveBookSources(sourceRecords)
        await notifyLibraryObservers()
    }

    private func normalizedSourceName(_ name: String, fallback: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }

    private func capabilities(for kind: BookSourceKind) -> BookSourceCapabilities {
        switch kind {
            case .storyteller:
                return .storyteller
            case .localFolder:
                return .localFolder
        }
    }

    private func storageURLForNewSource(
        kind: BookSourceKind,
        sourceID: BookSourceID,
        configuredPath: String?,
    ) async -> URL? {
        switch kind {
            case .storyteller:
                return nil
            case .localFolder:
                if let configuredPath,
                    !configuredPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                {
                    let url = URL(fileURLWithPath: configuredPath, isDirectory: true)
                    try? await FilesystemActor.shared.ensureDirectoryExists(at: url)
                    return url
                }
                return nil
        }
    }

    private func sourceIDForNewSource(
        kind: BookSourceKind,
        configuredPath: String?,
    ) async -> BookSourceID {
        guard kind == .localFolder,
            let configuredPath = configuredPath?.trimmingCharacters(in: .whitespacesAndNewlines),
            !configuredPath.isEmpty
        else {
            return UUID().uuidString
        }
        let url = URL(fileURLWithPath: configuredPath, isDirectory: true)
        if let sourceID = try? await FilesystemActor.shared.sourceIDMarker(in: url),
            !sourceID.isEmpty
        {
            return sourceID
        }
        return UUID().uuidString
    }

    private func updatedStoragePath(
        existing: BookSourceRecord,
        configuration: BookSourceConfiguration,
    ) -> String? {
        switch existing.kind {
            case .storyteller:
                return existing.storagePath
            case .localFolder:
                let configuredPath = configuration.storagePath?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                return configuredPath?.isEmpty == false ? configuredPath : existing.storagePath
        }
    }

    private func updatedStorageBookmarkData(
        existing: BookSourceRecord,
        configuration: BookSourceConfiguration,
    ) -> Data? {
        switch existing.kind {
            case .storyteller:
                return existing.storageBookmarkData
            case .localFolder:
                return configuration.storageBookmarkData ?? existing.storageBookmarkData
        }
    }

    public func sourceKind(for sourceID: BookSourceID) async -> BookSourceKind? {
        await ensureSourceRegistryLoaded()
        return sourceRecords.first(where: { $0.id == sourceID })?.kind
    }

    public func fetchUserSettings(sourceID: BookSourceID) async -> [String: JSONValue]? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchUserSettings()
    }

    public func updateUserSettings(
        _ values: [String: JSONValue],
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.updateUserSettings(values)
    }

    public func fetchUserPreferences(sourceID: BookSourceID) async -> ServerUserPreferences? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchUserPreferences()
    }

    public func updateUserPreference(
        _ key: ServerUserPreferenceKey,
        to value: JSONValue,
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.updateUserPreference(key, to: value)
    }

    public func fetchBookRating(for bookID: BookID) async -> UserBookRating? {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return nil }
        return await storyteller.fetchBookRating(for: bookID.uuid)
    }

    public func updateBookRating(
        for bookID: BookID,
        update: UserBookRatingUpdate,
    ) async -> UserBookRatingUpdateResult {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else {
            return .failed(message: "No Storyteller server is configured for this book.")
        }
        let result = await storyteller.updateBookRating(for: bookID.uuid, update: update)
        if case .failed = result {
            return result
        }
        await refreshCachedUserRating(for: bookID)
        return result
    }

    public func deleteBookRating(for bookID: BookID) async -> Bool {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return false }
        let success = await storyteller.deleteBookRating(for: bookID.uuid)
        if success {
            await refreshCachedUserRating(for: bookID)
        }
        return success
    }

    // The library payload carries the user's rating, so the cached book has to be re-read for
    // grids, tables and smart shelves to show the new value.
    private func refreshCachedUserRating(for bookID: BookID) async {
        _ = await refreshBookFromSource(bookID: bookID, policy: .forceRefresh)
    }

    public func fetchUserRatings(sourceID: BookSourceID) async -> [UserBookRating]? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchUserRatings()
    }

    public func fetchShelves(sourceID: BookSourceID) async -> [UserShelf]? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchShelves()
    }

    public func createShelf(
        _ payload: UserShelfCreatePayload,
        sourceID: BookSourceID,
    ) async -> UserShelf? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.createShelf(payload)
    }

    public func fetchShelf(uuid: String, sourceID: BookSourceID) async -> UserShelf? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchShelf(uuid: uuid)
    }

    public func updateShelf(
        uuid: String,
        with payload: UserShelfUpdatePayload,
        sourceID: BookSourceID,
    ) async -> UserShelf? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.updateShelf(uuid: uuid, with: payload)
    }

    public func deleteShelf(uuid: String, sourceID: BookSourceID) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.deleteShelf(uuid: uuid)
    }

    public func fetchShelfBooks(
        uuid: String,
        sourceID: BookSourceID,
        limit: Int? = nil,
        offset: Int? = nil,
    ) async -> [BookMetadata]? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchShelfBooks(uuid: uuid, limit: limit, offset: offset)
    }

    public func addBooksToShelf(
        uuid: String,
        bookUUIDs: [String],
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.addBooksToShelf(uuid: uuid, bookUUIDs: bookUUIDs)
    }

    public func removeBooksFromShelf(
        uuid: String,
        bookUUIDs: [String],
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.removeBooksFromShelf(uuid: uuid, bookUUIDs: bookUUIDs)
    }

    public func fetchAlignmentReport(for bookID: BookID) async -> BookAlignmentReport? {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return nil }
        return await storyteller.fetchAlignmentReport(for: bookID.uuid)
    }

    public func updateAlignmentOverrides(
        for bookID: BookID,
        overrides: AlignmentOverrides,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return false }
        return await storyteller.updateAlignmentOverrides(for: bookID.uuid, overrides: overrides)
    }

    public func fetchAlignmentFacets(sourceID: BookSourceID) async -> AlignmentFacets? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchAlignmentFacets()
    }

    public func fetchBookIdentifiers(for bookID: BookID) async -> [BookIdentifierRelation]? {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return nil }
        return await storyteller.fetchBookIdentifiers(bookUUID: bookID.uuid)
    }

    public func replaceBookIdentifiers(
        for bookID: BookID,
        identifiers: [IdentifierRelationPayload],
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: bookID.sourceID) else { return false }
        let success = await storyteller.replaceBookIdentifiers(
            bookUUID: bookID.uuid,
            identifiers: identifiers,
        )
        if success {
            await notifyLibraryObservers()
        }
        return success
    }

    public func fetchIdentifierTypes(sourceID: BookSourceID) async -> [IdentifierType]? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.fetchIdentifierTypes()
    }

    public func createIdentifierType(
        name: String,
        urlTemplate: String? = nil,
        sourceID: BookSourceID,
    ) async -> IdentifierType? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.createIdentifierType(name: name, urlTemplate: urlTemplate)
    }

    public func deleteIdentifierType(typeUUID: String, sourceID: BookSourceID) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        let success = await storyteller.deleteIdentifierType(typeUUID: typeUUID)
        if success {
            await notifyLibraryObservers()
        }
        return success
    }

    public func deleteBooks(
        _ bookIDs: [BookID],
        preventReImport: Bool? = nil,
    ) async -> Bool {
        var allSucceeded = true
        for (sourceID, sourceBookIDs) in Dictionary(grouping: bookIDs, by: \.sourceID) {
            guard let storyteller = await storytellerActor(for: sourceID) else {
                allSucceeded = false
                continue
            }
            let success = await storyteller.deleteBooks(
                sourceBookIDs.map(\.uuid),
                preventReImport: preventReImport,
            )
            allSucceeded = allSucceeded && success
        }
        if !bookIDs.isEmpty {
            await notifyLibraryObservers()
        }
        return allSucceeded
    }

    public func addTags(_ tagNames: [String], toBooks bookIDs: [BookID]) async -> Bool {
        var allSucceeded = true
        var anySucceeded = false
        for (sourceID, sourceBookIDs) in Dictionary(grouping: bookIDs, by: \.sourceID) {
            guard let storyteller = await storytellerActor(for: sourceID) else {
                allSucceeded = false
                continue
            }
            let success = await storyteller.addTags(tagNames, toBooks: sourceBookIDs.map(\.uuid))
            if success {
                anySucceeded = true
                _ = await storyteller.fetchLibraryInformation()
            }
            allSucceeded = allSucceeded && success
        }
        if anySucceeded {
            await notifyLibraryObservers()
        }
        return allSucceeded
    }

    /// Tag uuids are source-specific, so this call requires every book to belong to the
    /// given source.
    public func removeTags(
        _ tagUUIDs: [String],
        fromBooks bookIDs: [BookID],
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        let uuids = bookIDs.filter { $0.sourceID == sourceID }.map(\.uuid)
        let success = await storyteller.removeTags(tagUUIDs, fromBooks: uuids)
        if success {
            _ = await storyteller.fetchLibraryInformation()
            await notifyLibraryObservers()
        }
        return success
    }

    /// Collection uuids are source-specific, so membership calls require every book to
    /// belong to the given source.
    public func addBooks(
        _ bookIDs: [BookID],
        toCollectionUUIDs collectionUUIDs: [String],
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        let uuids = bookIDs.filter { $0.sourceID == sourceID }.map(\.uuid)
        let success = await storyteller.addBooks(uuids, toCollections: collectionUUIDs)
        if success {
            _ = await storyteller.fetchLibraryInformation()
            await notifyLibraryObservers()
        }
        return success
    }

    public func removeBooks(
        _ bookIDs: [BookID],
        fromCollectionUUIDs collectionUUIDs: [String],
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        let uuids = bookIDs.filter { $0.sourceID == sourceID }.map(\.uuid)
        let success = await storyteller.removeBooks(uuids, fromCollections: collectionUUIDs)
        if success {
            _ = await storyteller.fetchLibraryInformation()
            await notifyLibraryObservers()
        }
        return success
    }

    public func addCreators(
        _ creatorNames: [String],
        toBooks bookIDs: [BookID],
        role: CreatorRole,
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        let uuids = bookIDs.filter { $0.sourceID == sourceID }.map(\.uuid)
        let success = await storyteller.addCreators(creatorNames, toBooks: uuids, role: role)
        if success {
            _ = await storyteller.fetchLibraryInformation()
            await notifyLibraryObservers()
        }
        return success
    }

    public func removeCreators(
        _ creatorUUIDs: [String],
        fromBooks bookIDs: [BookID],
        role: CreatorRole,
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        let uuids = bookIDs.filter { $0.sourceID == sourceID }.map(\.uuid)
        let success = await storyteller.removeCreators(creatorUUIDs, fromBooks: uuids, role: role)
        if success {
            _ = await storyteller.fetchLibraryInformation()
            await notifyLibraryObservers()
        }
        return success
    }

    public func deleteProcessingCache(
        sourceID: BookSourceID,
        bookUUIDs: [String]? = nil,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.deleteProcessingCache(bookUUIDs: bookUUIDs)
    }

    public func createStatus(
        name: String,
        label: String? = nil,
        sourceID: BookSourceID,
    ) async -> BookStatus? {
        guard let storyteller = await storytellerActor(for: sourceID) else { return nil }
        return await storyteller.createStatus(name: name, label: label)
    }

    public func updateStatusDefinition(
        uuid: String,
        label: String? = nil,
        isDefault: Bool? = nil,
        sourceID: BookSourceID,
    ) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.updateStatusDefinition(
            uuid: uuid,
            label: label,
            isDefault: isDefault,
        )
    }

    public func deleteStatus(uuid: String, sourceID: BookSourceID) async -> Bool {
        guard let storyteller = await storytellerActor(for: sourceID) else { return false }
        return await storyteller.deleteStatus(uuid: uuid)
    }

    public func updateStatus(
        forBooks bookIDs: [BookID],
        toStatusUUID statusUUID: String,
    ) async -> Bool {
        var allSucceeded = true
        for (sourceID, sourceBookIDs) in Dictionary(grouping: bookIDs, by: \.sourceID) {
            guard let storyteller = await storytellerActor(for: sourceID) else {
                allSucceeded = false
                continue
            }
            let success = await storyteller.updateStatus(
                forBooks: sourceBookIDs.map(\.uuid),
                toStatusUUID: statusUUID,
            )
            allSucceeded = allSucceeded && success
        }
        if !bookIDs.isEmpty {
            await notifyLibraryObservers()
        }
        return allSucceeded
    }
}

extension Array where Element == BookSourceRecord {
    fileprivate mutating func replaceOrAppend(_ record: BookSourceRecord) {
        if let index = firstIndex(where: { $0.id == record.id }) {
            self[index] = record
        } else {
            append(record)
        }
    }
}
