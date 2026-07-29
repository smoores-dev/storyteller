// Kotlin-to-Storyteller entry points exported through JExtract.
import Foundation
import StorytellerKit

public func bootstrapAndroid(filesDirectory: String) async throws {
    try AndroidPlatformBootstrap.bootstrap(filesDirectory: filesDirectory)
    guard await StorytellerRuntime.start() else {
        throw AndroidBridgeError.runtimeStartupFailed
    }
}

public func androidNetworkAvailabilityDidChange(_ available: Bool) async throws {
    try requireAndroidBootstrap()
    await BookServiceActor.shared.networkAvailabilityDidChange(available)
}

public func liveSyncPeerFound(instanceID: String, host: String, port: Int32) async {
    AndroidNsdPeerDiscovery.shared.handlePeerFound(
        id: instanceID,
        host: host,
        port: UInt16(truncatingIfNeeded: port),
    )
}

public func liveSyncPeerLost(instanceID: String) async {
    AndroidNsdPeerDiscovery.shared.handlePeerLost(id: instanceID)
}

public func androidAppDidBecomeActive() async throws {
    try requireAndroidBootstrap()
    await BookServiceActor.shared.setActive(true, source: .app)
    await BookServiceActor.shared.startPeriodicLibraryRefresh()
}

public func androidAppDidEnterBackground() async throws {
    try requireAndroidBootstrap()
    await BookServiceActor.shared.stopPeriodicLibraryRefresh()
    await BookServiceActor.shared.setActive(false, source: .app)
}

public func storytellerSettingsJSON(requestID: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        return try await encodeStorytellerSettings()
    }
}

public func saveStorytellerSettings(
    requestID: String,
    serverURL: String,
    username: String,
    password: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try await saveStorytellerSettingsJSON(
            serverURL: serverURL,
            username: username,
            password: password,
        )
    }
}

private func saveStorytellerSettingsJSON(
    serverURL: String,
    username: String,
    password: String,
) async throws -> String {
    try requireAndroidBootstrap()

    let normalizedServerURL = try normalizeServerURL(serverURL)
    let trimmedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedUsername.isEmpty else {
        throw AndroidBridgeError.missingUsername
    }
    let existing = await BookServiceActor.shared.bookSources.first {
        $0.kind == .storyteller
    }
    let resolvedPassword: String
    if !password.isEmpty {
        resolvedPassword = password
    } else if let existing,
        let credentials = await BookServiceActor.shared.credentials(for: existing.id)
    {
        resolvedPassword = credentials.password
    } else {
        throw AndroidBridgeError.missingPassword
    }
    let configuration = BookSourceConfiguration(
        kind: .storyteller,
        name: existing?.name ?? "Storyteller",
        serverURL: normalizedServerURL,
        username: trimmedUsername,
        password: resolvedPassword,
    )

    let saved: Bool
    if let existing {
        saved = await BookServiceActor.shared.updateBookSource(
            id: existing.id,
            configuration: configuration,
        )
    } else {
        saved = await BookServiceActor.shared.createBookSource(configuration) != nil
    }
    guard saved else {
        throw AndroidBridgeError.couldNotSaveStorytellerSettings
    }

    await installAndroidConnectionObserver()
    _ = await BookServiceActor.shared.librarySnapshot(policy: .refresh)
    return try await encodeStorytellerSettings()
}

public func appSettingsJSON(requestID: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        return try await encodeAppSettings()
    }
}

public func saveAppSettings(requestID: String, json: String) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let update = try JSONDecoder().decode(
            AndroidAppSettingsUpdate.self,
            from: Data(json.utf8),
        )
        try await SettingsActor.shared.updateConfig(
            progressSyncIntervalSeconds: update.progressSyncIntervalSeconds,
            metadataRefreshIntervalSeconds: update.metadataRefreshIntervalSeconds,
            autoSyncToNewerServerPosition: update.autoSyncToNewerServerPosition,
            liveReadingSyncEnabled: update.liveReadingSyncEnabled,
        )
        await LiveReadingSyncActor.shared.reconcileWithSettings()
        return try await encodeAppSettings()
    }
}

private struct AndroidAppSettingsUpdate: Decodable {
    var progressSyncIntervalSeconds: Double?
    var metadataRefreshIntervalSeconds: Double?
    var autoSyncToNewerServerPosition: Bool?
    var liveReadingSyncEnabled: Bool?
}

private struct AndroidAppSettings: Encodable {
    let progressSyncIntervalSeconds: Double
    let metadataRefreshIntervalSeconds: Double
    let autoSyncToNewerServerPosition: Bool
    let liveReadingSyncEnabled: Bool
}

private func encodeAppSettings() async throws -> String {
    let sync = await SettingsActor.shared.config.sync
    return try encodeJSON(
        AndroidAppSettings(
            progressSyncIntervalSeconds: sync.progressSyncIntervalSeconds,
            metadataRefreshIntervalSeconds: sync.metadataRefreshIntervalSeconds,
            autoSyncToNewerServerPosition: sync.autoSyncToNewerServerPosition,
            liveReadingSyncEnabled: sync.liveReadingSyncEnabled,
        )
    )
}

public func librarySnapshotJSON(requestID: String, refresh: Bool) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try await makeLibrarySnapshotJSON(refresh: refresh)
    }
}

public func bookDetailsJSON(
    requestID: String,
    bookID: String,
    sourceID: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        let id = BookID(sourceID: sourceID, uuid: bookID)
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        guard let book = snapshot.books.first(where: { $0.id == id }) else {
            throw AndroidBridgeError.bookNotFound(bookID)
        }
        return try encodeJSON(
            AndroidBookDetails(
                version: book.updatedAt ?? "",
                description: book.description.map { BookDescriptionText.plain(from: $0) },
                publicationDateDisplay: StorytellerDate.full(book.publicationDateValue),
                createdAtDisplay: StorytellerDate.dateTimeWithZone(book.createdAtValue),
                updatedAtDisplay: StorytellerDate.dateTimeWithZone(
                    StorytellerDate.parse(
                        book.updatedAt,
                        field: .updatedAt,
                        context: book.title,
                    )
                ),
            )
        )
    }
}

private func makeLibrarySnapshotJSON(refresh: Bool) async throws -> String {
    try requireAndroidBootstrap()

    let snapshot = await BookServiceActor.shared.librarySnapshot(
        policy: refresh ? .refresh : .cachedOnly
    )
    let progress = await ProgressSyncActor.shared.getAllBookProgress()
    let downloads = await DownloadManager.shared.incompleteDownloads
    let downloadsByBookID = Dictionary(grouping: downloads, by: \.bookID)
    var books: [AndroidBook] = []
    books.reserveCapacity(snapshot.books.count)

    for book in snapshot.books {
        let sourceID = book.sourceID

        let paths = snapshot.mediaPaths[book.id]
        let cachedPaths = snapshot.cachedMediaPaths[book.id]
        if let owner = paths?.playbackOwner {
            debugLog(
                "[AutoClassify] \(book.title): owner=\(owner.rawValue) "
                    + "audio=\(paths?.audioPath != nil) synced=\(paths?.syncedPath != nil) "
                    + "availAudio=\(book.hasAvailableAudiobook) availReadaloud=\(book.hasAvailableReadaloud)"
            )
        }
        let media = [
            androidMedia(
                bookID: book.id,
                category: .ebook,
                info: AndroidMediaInfo(asset: book.ebook),
                available: book.hasAvailableEbook,
                paths: paths,
                cachedPaths: cachedPaths,
                downloadsByBookID: downloadsByBookID,
            ),
            androidMedia(
                bookID: book.id,
                category: .audio,
                info: AndroidMediaInfo(asset: book.audiobook),
                available: book.hasAvailableAudiobook,
                paths: paths,
                cachedPaths: cachedPaths,
                downloadsByBookID: downloadsByBookID,
            ),
            androidMedia(
                bookID: book.id,
                category: .synced,
                info: AndroidMediaInfo(readaloud: book.readaloud),
                available: book.hasAvailableReadaloud,
                paths: paths,
                cachedPaths: cachedPaths,
                downloadsByBookID: downloadsByBookID,
            ),
        ].compactMap { $0 }

        books.append(
            AndroidBook(
                id: book.uuid,
                sourceID: sourceID,
                title: book.title,
                subtitle: book.subtitle,
                authors: book.authors?.compactMap(\.name).joined(separator: ", ") ?? "",
                authorNames: book.authors?.compactMap(\.name) ?? [],
                narrators: book.narrators?.compactMap(\.name) ?? [],
                series: book.series?.map {
                    AndroidSeries(name: $0.name, position: $0.position.map(Double.init))
                } ?? [],
                tags: book.tagNames,
                collections: book.collections?.map(\.name) ?? [],
                language: book.language,
                rating: book.rating,
                progress: book.status?.name.lowercased() == "read"
                    ? 1
                    : (progress[book.id]?.progressFraction ?? 0),
                pageCount: book.pageCountValue,
                durationDisplay: book.durationDisplay,
                durationSeconds: book.sortableDuration,
                sortTitle: book.sortableTitle,
                sortAuthor: book.sortableAuthor,
                sortNarrator: book.sortableNarrator,
                sortSeriesName: book.sortableSeries.name,
                sortSeriesPosition: Double(book.sortableSeries.position),
                sortAdded: book.sortableAdded,
                sortLastRead: book.sortableLastRead,
                sortPublicationDate: book.sortablePublicationDate,
                publicationYear: book.sortablePublicationYear,
                status: book.status?.name,
                fileSizeBytes: book.sortableFileSize,
                coverVersion: book.updatedAt ?? "",
                media: media,
                playbackOwner: paths?.playbackOwner?.rawValue,
            )
        )
    }

    let status = connectionFields(await androidStorytellerConnectionStatus())
    let homeSections = HomeSectionDeriver.sections(
        books: snapshot.books,
        progress: progress,
    ).map { section in
        AndroidHomeSection(
            kind: section.kind.rawValue,
            title: section.kind.title,
            bookIDs: section.books.map(\.id),
        )
    }
    return try encodeJSON(
        AndroidLibrary(
            books: books,
            homeSections: homeSections,
            sourceStatus: status.status,
            sourceMessage: status.message,
        )
    )
}

public func coverResponseBytes(
    requestID: String,
    bookID: String,
    sourceID: String,
    version: String,
    audio: Bool,
    width: Int32,
    height: Int32,
    refresh: Bool,
) async {
    do {
        try requireAndroidBootstrap()
        guard width > 0, height > 0 else {
            throw AndroidBridgeError.invalidCoverSize
        }

        let id = BookID(sourceID: sourceID, uuid: bookID)
        let response = await BookServiceActor.shared.loadCover(
            for: id,
            audio: audio,
            width: Int(width),
            height: Int(height),
            version: version.isEmpty ? nil : version,
            allowNetwork: await BookServiceActor.shared.connectionStatus(sourceID: id.sourceID)
                == .connected,
            policy: refresh ? .forceRefresh : .cachedThenFetch,
        )

        switch response {
            case .cached(let data):
                deliverAndroidCoverPayload(
                    requestID: requestID,
                    data: data,
                    shouldPersist: false,
                )
            case .fetched(let cover):
                deliverAndroidCoverPayload(
                    requestID: requestID,
                    data: cover.data,
                    shouldPersist: true,
                )
            case .missing, .skippedOffline:
                deliverAndroidCoverPayload(
                    requestID: requestID,
                    data: Data(),
                    shouldPersist: false,
                )
        }
    } catch {
        deliverAndroidCoverError(requestID: requestID, error: error)
    }
}

public func persistCoverBytes(
    bookID: String,
    sourceID: String,
    audio: Bool,
    data: [UInt8],
) async throws {
    try requireAndroidBootstrap()
    await BookServiceActor.shared.persistCachedCover(
        bookID: BookID(sourceID: sourceID, uuid: bookID),
        audio: audio,
        data: Data(data),
    )
}

public func coverSurfaceColorARGB(rgbaBase64: String, dark: Bool) throws -> Int32 {
    guard let data = Data(base64Encoded: rgbaBase64) else {
        throw AndroidBridgeError.invalidCoverPixels
    }
    let color = CoverColorAverager.surfaceColor(rgbaPixels: Array(data), dark: dark)
    let argb =
        0xFF00_0000 | UInt32(color.red) << 16 | UInt32(color.green) << 8
        | UInt32(color.blue)
    return Int32(bitPattern: argb)
}

public func coverPaletteJSON(rgbaBase64: String, dark: Bool) throws -> String {
    guard let data = Data(base64Encoded: rgbaBase64) else {
        throw AndroidBridgeError.invalidCoverPixels
    }
    let palette = CoverDerivedPaletteValues.make(rgbaPixels: Array(data))
    return try encodeJSON(
        AndroidCoverPalette(
            surface: argb(dark ? palette.surface : palette.lightSurface),
            accent: argb(palette.accent),
            brightAccent: argb(palette.brightAccent),
            mutedAccent: argb(palette.mutedAccent),
            accentBackground: argb(palette.accentBackground),
            contentBackground: argb(
                dark ? palette.contentBackground : palette.lightContentBackground
            ),
            cardBackground: argb(dark ? palette.cardBackground : palette.lightCardBackground),
            cardBorder: argb(dark ? palette.cardBorder : palette.lightCardBorder),
        )
    )
}

private func argb(_ color: CoverPaletteColor) -> UInt32 {
    let rgb = color.rgb8
    return UInt32(color.alpha8) << 24 | UInt32(rgb.red) << 16 | UInt32(rgb.green) << 8
        | UInt32(rgb.blue)
}

public func downloadBook(
    bookID: String,
    sourceID: String,
    category: String,
) async throws {
    try requireAndroidBootstrap()
    let bookID = BookID(sourceID: sourceID, uuid: bookID)

    guard let mediaCategory = LocalMediaCategory(rawValue: category) else {
        throw AndroidBridgeError.invalidMediaCategory(category)
    }

    let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
    guard let book = snapshot.books.first(where: { $0.id == bookID }) else {
        throw AndroidBridgeError.bookNotFound(bookID.uuid)
    }
    let available =
        switch mediaCategory {
            case .ebook: book.hasAvailableEbook
            case .audio: book.hasAvailableAudiobook
            case .synced: book.hasAvailableReadaloud
        }
    guard available else {
        throw AndroidBridgeError.mediaUnavailable(category: category, bookID: bookID.uuid)
    }

    await DownloadManager.shared.startDownload(for: book, category: mediaCategory)
}

public func cancelBookDownload(
    bookID: String,
    sourceID: String,
    category: String,
) async throws {
    try requireAndroidBootstrap()
    let bookID = BookID(sourceID: sourceID, uuid: bookID)

    guard let mediaCategory = LocalMediaCategory(rawValue: category) else {
        throw AndroidBridgeError.invalidMediaCategory(category)
    }
    await DownloadManager.shared.cancelDownload(for: bookID, category: mediaCategory)
}

public func deleteBookDownload(
    bookID: String,
    sourceID: String,
    category: String,
) async throws {
    try requireAndroidBootstrap()
    let bookID = BookID(sourceID: sourceID, uuid: bookID)

    guard let mediaCategory = LocalMediaCategory(rawValue: category) else {
        throw AndroidBridgeError.invalidMediaCategory(category)
    }
    try await BookServiceActor.shared.deleteCachedMedia(
        for: bookID,
        category: mediaCategory,
    )
}

public func openAudiobook(bookID: String, sourceID: String) async throws {
    try requireAndroidBootstrap()
    try await AndroidAudiobookSession.shared.open(
        bookID: BookID(sourceID: sourceID, uuid: bookID)
    )
}

public func closeAudiobook() async {
    await AndroidAudiobookSession.shared.close()
}

public func controlAudiobook(command: String, value: Double, text: String) async throws {
    try requireAndroidBootstrap()
    try await AndroidAudiobookSession.shared.control(
        command: command,
        value: value,
        text: text,
    )
}

public func openHeadlessPlayback(
    bookID: String,
    sourceID: String,
    category: String,
) async throws {
    try requireAndroidBootstrap()
    guard let mediaCategory = LocalMediaCategory(rawValue: category) else {
        throw AndroidBridgeError.invalidMediaCategory(category)
    }
    try await AndroidAudiobookSession.shared.openHeadless(
        bookID: BookID(sourceID: sourceID, uuid: bookID),
        category: mediaCategory,
    )
}

public func cyclePlaybackRate() async throws {
    try requireAndroidBootstrap()
    await AudioSessionActor.shared.cyclePlaybackRate()
}

public func sessionTogglePlayPause() async throws {
    try requireAndroidBootstrap()
    try await AudioSessionActor.shared.transport(.togglePlayPause)
}

public func sessionClose() async throws {
    try requireAndroidBootstrap()
    if case .readaloud(let bookID) = await AudioSessionActor.shared.currentSessionKind() {
        await ReadingSessionStore.shared.endIfViewDetached(for: bookID)
    }
    await AudioSessionActor.shared.closeCurrent()
}

public func openReader(
    requestID: String,
    bookID: String,
    sourceID: String,
    mode: String,
) async throws {
    try await deliverAndroidBridgePayload(requestID: requestID) {
        try requireAndroidBootstrap()
        return try await AndroidReaderSession.shared.open(
            bookID: BookID(sourceID: sourceID, uuid: bookID),
            mode: mode,
        )
    }
}

public func closeReader() async {
    await AndroidReaderSession.shared.close()
}

public func readerMessageFromJS(name: String, body: String) async {
    await AndroidReaderSession.shared.handleMessage(name: name, body: body)
}

public func readerJSResult(requestID: String, result: String, error: String) async {
    await AndroidReaderSession.shared.completeJSRequest(
        requestID: requestID,
        result: result,
        error: error,
    )
}

public func readerControl(command: String, value: Double, text: String) async throws {
    try requireAndroidBootstrap()
    try await AndroidReaderSession.shared.control(command: command, value: value, text: text)
}

public func startLibraryObservation() async throws {
    try requireAndroidBootstrap()
    guard androidObserverStore.claimInstallation() else { return }

    _ = await BookServiceActor.shared.addLibraryCacheObserver {
        notifyAndroidLibrarySnapshotDidChange()
    }
    _ = await ProgressSyncActor.shared.addObserver {
        Task {
            notifyAndroidLibrarySnapshotDidChange()
        }
    }
    _ = await DownloadManager.shared.addObserver { records in
        let updates = records.map { record in
            AndroidDownloadUpdate(
                bookID: record.bookID.uuid,
                sourceID: record.bookID.sourceID,
                category: record.category.rawValue,
                state: downloadStateName(record.state) ?? "queued",
                progress: downloadProgress(record),
            )
        }
        guard let payload = try? encodeJSON(updates) else { return }
        notifyAndroidDownloadStateDidChange(payload)
    }
    await AndroidSessionState.startObserving()
    await installAndroidConnectionObserver()
}

private struct AndroidBook: Encodable {
    let id: String
    let sourceID: String
    let title: String
    let subtitle: String?
    let authors: String
    let authorNames: [String]
    let narrators: [String]
    let series: [AndroidSeries]
    let tags: [String]
    let collections: [String]
    let language: String?
    let rating: Double?
    let progress: Double
    let pageCount: Int?
    let durationDisplay: String
    let durationSeconds: Double
    let sortTitle: String
    let sortAuthor: String
    let sortNarrator: String
    let sortSeriesName: String
    let sortSeriesPosition: Double
    let sortAdded: String
    let sortLastRead: String
    let sortPublicationDate: String
    let publicationYear: String
    let status: String?
    let fileSizeBytes: Int
    let coverVersion: String
    let media: [AndroidMedia]
    let playbackOwner: String?
}

private struct AndroidBookDetails: Encodable {
    let version: String
    let description: String?
    let publicationDateDisplay: String
    let createdAtDisplay: String
    let updatedAtDisplay: String
}

private struct AndroidSeries: Encodable {
    let name: String
    let position: Double?
}

private struct AndroidMedia: Encodable {
    let category: String
    let format: String?
    let pageCount: Int?
    let durationDisplay: String
    let fileSizeDisplay: String
    let status: String?
    let downloaded: Bool
    let removable: Bool
    let downloadState: String?
    let downloadProgress: Double?
}

private struct AndroidDownloadUpdate: Encodable {
    let bookID: String
    let sourceID: String
    let category: String
    let state: String
    let progress: Double?
}

private struct AndroidSourceStatus: Encodable {
    let status: String
    let message: String?
}

private struct AndroidMediaInfo {
    let format: String?
    let pageCount: Int?
    let durationDisplay: String
    let fileSizeDisplay: String
    let status: String?

    init(asset: BookAsset?) {
        if let path = asset?.filepath {
            let value = URL(fileURLWithPath: path).pathExtension.uppercased()
            format = value.isEmpty ? nil : value
        } else {
            format = nil
        }
        pageCount = asset?.pageCount
        if let duration = asset?.duration, duration > 0 {
            durationDisplay = BookMetadata.formatDuration(seconds: Int(duration.rounded()))
        } else {
            durationDisplay = ""
        }
        if let size = asset?.fileSize, size > 0 {
            fileSizeDisplay = BookMetadata.formatFileSize(bytes: size)
        } else {
            fileSizeDisplay = ""
        }
        status = nil
    }

    init(readaloud: BookReadaloud?) {
        format = nil
        pageCount = readaloud?.pageCount
        if let duration = readaloud?.duration, duration > 0 {
            durationDisplay = BookMetadata.formatDuration(seconds: Int(duration.rounded()))
        } else {
            durationDisplay = ""
        }
        if let size = readaloud?.fileSize, size > 0 {
            fileSizeDisplay = BookMetadata.formatFileSize(bytes: size)
        } else {
            fileSizeDisplay = ""
        }
        status = readaloud?.status
    }
}

private struct AndroidCoverPalette: Encodable {
    let surface: UInt32
    let accent: UInt32
    let brightAccent: UInt32
    let mutedAccent: UInt32
    let accentBackground: UInt32
    let contentBackground: UInt32
    let cardBackground: UInt32
    let cardBorder: UInt32
}

private struct AndroidHomeSection: Encodable {
    let kind: String
    let title: String
    let bookIDs: [BookID]
}

private struct AndroidLibrary: Encodable {
    let books: [AndroidBook]
    let homeSections: [AndroidHomeSection]
    let sourceStatus: String
    let sourceMessage: String?
}

private struct AndroidStorytellerSettings: Encodable {
    let configured: Bool
    let sourceID: String?
    let serverURL: String?
    let username: String?
    let connectionStatus: String
    let connectionMessage: String?
}

private final class AndroidObserverStore: @unchecked Sendable {
    private let lock = NSLock()
    private var observersInstalled = false

    func claimInstallation() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !observersInstalled else { return false }
        observersInstalled = true
        return true
    }
}

private let androidObserverStore = AndroidObserverStore()

private func installAndroidConnectionObserver() async {
    await BookServiceActor.shared.request_notify {
        Task {
            let fields = connectionFields(await androidStorytellerConnectionStatus())
            guard
                let payload = try? encodeJSON(
                    AndroidSourceStatus(status: fields.status, message: fields.message)
                )
            else { return }
            notifyAndroidSourceStatusDidChange(payload)
        }
    }
}

private func androidStorytellerConnectionStatus() async -> ConnectionStatus {
    guard
        let source = await BookServiceActor.shared.bookSources.first(where: {
            $0.kind == .storyteller
        })
    else {
        return .disconnected
    }
    return await BookServiceActor.shared.connectionStatus(sourceID: source.id)
}

private func encodeStorytellerSettings() async throws -> String {
    let source = await BookServiceActor.shared.bookSources.first {
        $0.kind == .storyteller
    }
    let credentials: (url: String, username: String, password: String)?
    let connection: ConnectionStatus

    if let source {
        credentials = await BookServiceActor.shared.credentials(for: source.id)
        connection = await BookServiceActor.shared.connectionStatus(sourceID: source.id)
    } else {
        credentials = nil
        connection = .disconnected
    }

    let status = connectionFields(connection)
    return try encodeJSON(
        AndroidStorytellerSettings(
            configured: source != nil && credentials != nil,
            sourceID: source?.id,
            serverURL: credentials?.url,
            username: credentials?.username,
            connectionStatus: status.status,
            connectionMessage: status.message,
        )
    )
}

private func requireAndroidBootstrap() throws {
    guard AndroidPlatformBootstrap.isBootstrapped else {
        throw AndroidBridgeError.notBootstrapped
    }
}

private func normalizeServerURL(_ value: String) throws -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        throw AndroidBridgeError.invalidServerURL(value)
    }
    let normalized = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
    guard let url = URL(string: normalized),
        let scheme = url.scheme?.lowercased(),
        scheme == "http" || scheme == "https",
        url.host != nil
    else {
        throw AndroidBridgeError.invalidServerURL(value)
    }
    return normalized
}

private func connectionFields(_ connection: ConnectionStatus) -> (
    status: String,
    message: String?
) {
    switch connection {
        case .disconnected:
            return ("disconnected", nil)
        case .connecting:
            return ("connecting", nil)
        case .connected:
            return ("connected", nil)
        case .error(let message):
            return ("error", message)
    }
}

private func downloadStateName(_ state: DownloadState?) -> String? {
    switch state {
        case .queued: return "queued"
        case .downloading: return "downloading"
        case .paused: return "paused"
        case .failed: return "failed"
        case .importing: return "importing"
        case .completed: return "completed"
        case nil: return nil
    }
}

private func downloadProgress(_ record: DownloadRecord?) -> Double? {
    guard let record, record.isActive else { return nil }
    return record.progressFraction
}

private func androidMedia(
    bookID: BookID,
    category: LocalMediaCategory,
    info: AndroidMediaInfo,
    available: Bool,
    paths: MediaPaths?,
    cachedPaths: MediaPaths?,
    downloadsByBookID: [BookID: [DownloadRecord]],
) -> AndroidMedia? {
    guard available else { return nil }
    let record = downloadsByBookID[bookID]?.first { $0.category == category }
    return AndroidMedia(
        category: category.rawValue,
        format: info.format,
        pageCount: info.pageCount,
        durationDisplay: info.durationDisplay,
        fileSizeDisplay: info.fileSizeDisplay,
        status: info.status,
        downloaded: paths?.path(for: category) != nil,
        removable: cachedPaths?.path(for: category) != nil,
        downloadState: downloadStateName(record?.state),
        downloadProgress: downloadProgress(record),
    )
}

private func encodeJSON<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return String(decoding: try encoder.encode(value), as: UTF8.self)
}

enum AndroidBridgeError: Error, LocalizedError, CustomStringConvertible {
    case notBootstrapped
    case runtimeStartupFailed
    case alreadyBootstrapped(existing: String, requested: String)
    case invalidServerURL(String)
    case missingUsername
    case missingPassword
    case couldNotSaveStorytellerSettings
    case invalidCoverSize
    case invalidCoverPixels
    case invalidMediaCategory(String)
    case bookNotFound(String)
    case mediaUnavailable(category: String, bookID: String)
    case localMediaUnavailable(category: String, bookID: String)
    case audiobookNotOpen
    case invalidAudiobookCommand(String)
    case secureStorageFailure(String)
    case readerNotOpen
    case invalidReaderCommand(String)
    case readerPrepareFailed(String)
    case readerJSFailed(String)

    var errorDescription: String? {
        switch self {
            case .notBootstrapped:
                return "Storyteller's Android platform has not been bootstrapped."
            case .runtimeStartupFailed:
                return "Storyteller could not migrate its stored library data."
            case .alreadyBootstrapped(let existing, let requested):
                return "Storyteller was already bootstrapped with \(existing), not \(requested)."
            case .invalidServerURL(let value):
                return "Invalid Storyteller server URL: \(value)"
            case .missingUsername:
                return "A Storyteller username is required."
            case .missingPassword:
                return "A Storyteller password is required."
            case .couldNotSaveStorytellerSettings:
                return "Could not save the Storyteller server settings."
            case .invalidCoverSize:
                return "Cover width and height must be greater than zero."
            case .invalidCoverPixels:
                return "Cover pixels must be base64-encoded RGBA bytes."
            case .invalidMediaCategory(let category):
                return "Unsupported media category: \(category)"
            case .bookNotFound(let bookID):
                return "Book \(bookID) is no longer in the library."
            case .mediaUnavailable(let category, let bookID):
                return "Book \(bookID) has no \(category) available to download."
            case .localMediaUnavailable(let category, let bookID):
                return "Book \(bookID) has no downloaded \(category)."
            case .audiobookNotOpen:
                return "No audiobook is open."
            case .invalidAudiobookCommand(let command):
                return "Unknown audiobook command: \(command)"
            case .secureStorageFailure(let account):
                return "Android secure storage failed for account \(account)."
            case .readerNotOpen:
                return "No reader is open."
            case .invalidReaderCommand(let command):
                return "Unknown reader command: \(command)"
            case .readerPrepareFailed(let bookID):
                return "Could not prepare book \(bookID) for reading."
            case .readerJSFailed(let message):
                return "Reader JS evaluation failed: \(message)"
        }
    }

    var description: String {
        errorDescription ?? "Android bridge error"
    }
}
