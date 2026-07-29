import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public actor DownloadManager {
    public static let shared = DownloadManager()

    private static let maxAutoRetries = 3
    private static let retryBaseDelay: TimeInterval = 30

    private let delegate = DownloadManagerDelegate()
    private lazy var downloadSession: URLSession = {
        let identifier: String
        #if os(watchOS)
        identifier = "dev.smoores.storyteller.watch.downloads"
        #else
        identifier = "dev.smoores.storyteller.downloads"
        #endif

        #if !canImport(Darwin)
        let config = URLSessionConfiguration.default
        #else
        let config = URLSessionConfiguration.background(withIdentifier: identifier)
        #endif
        #if canImport(Darwin)
        config.waitsForConnectivity = true
        config.sessionSendsLaunchEvents = true
        config.allowsCellularAccess = true
        #endif
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 3600

        #if os(watchOS)
        config.isDiscretionary = false
        #endif

        return URLSession(
            configuration: config,
            delegate: delegate,
            delegateQueue: nil,
        )
    }()

    private var downloads: [UUID: DownloadRecord] = [:]
    private var activeTasks: [UUID: URLSessionDownloadTask] = [:]
    private var bookMetadataCache: [BookID: BookMetadata] = [:]
    private var observers: [UUID: @Sendable ([DownloadRecord]) -> Void] = [:]
    private var backgroundCompletionHandler: (@Sendable () -> Void)?
    private var initialized = false
    private var retryLoopRunning = false

    private init() {}

    private func ensureInitialized() async {
        guard !initialized else { return }
        let persisted = await loadPersistedState()
        initialized = true

        for record in persisted {
            if await BookServiceActor.shared.resolveLocalMedia(
                for: record.bookID,
                category: record.category,
            ) != nil {
                await deleteResumeData(for: record.id)
                continue
            }
            downloads[record.id] = record
        }

        await reconnectOutstandingTasks()
        startRetryLoop()
    }

    private func reconnectOutstandingTasks() async {
        let tasks = await withCheckedContinuation {
            (continuation: CheckedContinuation<[URLSessionDownloadTask], Never>) in
            downloadSession.getTasksWithCompletionHandler { _, _, downloadTasks in
                continuation.resume(returning: downloadTasks)
            }
        }

        for task in tasks {
            guard let description = task.taskDescription,
                let downloadID = UUID(uuidString: description)
            else {
                task.cancel()
                continue
            }

            if let record = downloads[downloadID] {
                activeTasks[downloadID] = task
                delegate.registerTask(task, downloadId: description)

                var updated = record
                updated.state = .downloading(progress: record.progressFraction)
                updated.lastUpdatedAt = Date()
                downloads[downloadID] = updated
            } else {
                task.cancel()
            }
        }

        for (id, record) in downloads {
            if record.isActive && activeTasks[id] == nil {
                var updated = record
                let hasResume = await hasResumeData(for: id)
                updated.state = .paused(hasResumeData: hasResume)
                updated.lastUpdatedAt = Date()
                downloads[id] = updated
            }
        }

        await persistState()
        notifyObservers()
    }

    private func startRetryLoop() {
        guard !retryLoopRunning else { return }
        retryLoopRunning = true

        Task { [weak self = self] in
            while true {
                try? await Task.sleep(for: .seconds(10))
                guard let self else { break }
                await self.retryIncompleteDownloads()
            }
        }
    }

    private func retryIncompleteDownloads() async {
        let now = Date()
        var stalled: [DownloadRecord] = []

        for record in downloads.values where !record.isActive && record.isIncomplete {
            if case .failed = record.state {
                guard record.retryCount < Self.maxAutoRetries else { continue }

                let backoff = Self.retryBaseDelay * pow(2.0, Double(record.retryCount))
                guard now.timeIntervalSince(record.lastUpdatedAt) >= backoff else { continue }

                var updated = record
                updated.retryCount += 1
                downloads[record.id] = updated
                stalled.append(updated)
            } else {
                stalled.append(record)
            }
        }

        guard !stalled.isEmpty else { return }

        debugLog("[DownloadManager] Retry loop: resuming \(stalled.count) stalled download(s)")
        for record in stalled {
            await performResume(downloadId: record.id)
        }
    }

    private func recordID(for bookID: BookID, category: LocalMediaCategory) -> UUID? {
        downloads.values.first {
            $0.bookID == bookID && $0.category == category
        }?.id
    }

    public func startDownload(for book: BookMetadata, category: LocalMediaCategory) async {
        await ensureInitialized()
        let bookID = book.id

        if let existingID = recordID(for: bookID, category: category),
            let existing = downloads[existingID]
        {
            if existing.isActive {
                debugLog("[DownloadManager] Download already active: \(existingID)")
                return
            }
            bookMetadataCache[bookID] = book
            await resumeDownload(for: bookID, category: category)
            return
        }

        let format = formatForCategory(category, book: book)
        guard let format else {
            debugLog("[DownloadManager] No available format for \(book.title) / \(category)")
            return
        }
        var record = DownloadRecord(
            bookID: bookID,
            category: category,
            bookTitle: book.title,
            format: format,
        )
        record.expectedBytes = expectedDownloadBytes(for: category, book: book)

        downloads[record.id] = record
        bookMetadataCache[bookID] = book

        await beginDownloadTask(for: record, book: book)
    }

    public func pauseDownload(for bookID: BookID, category: LocalMediaCategory) async {
        await ensureInitialized()

        guard let id = recordID(for: bookID, category: category),
            let task = activeTasks.removeValue(forKey: id)
        else { return }

        let resumeData = await withCheckedContinuation {
            (continuation: CheckedContinuation<Data?, Never>) in
            task.cancel { data in
                continuation.resume(returning: data)
            }
        }

        if let resumeData {
            await saveResumeData(resumeData, for: id)
        }

        if var record = downloads[id] {
            record.state = .paused(hasResumeData: resumeData != nil)
            record.lastUpdatedAt = Date()
            downloads[id] = record
        }

        await persistState()
        notifyObservers()
    }

    public func resumeDownload(for bookID: BookID, category: LocalMediaCategory) async {
        await ensureInitialized()

        guard let id = recordID(for: bookID, category: category),
            var record = downloads[id]
        else { return }

        // A manual resume restores the auto-retry budget.
        record.retryCount = 0
        downloads[id] = record

        await performResume(downloadId: id)
    }

    private func performResume(downloadId id: UUID) async {
        guard var record = downloads[id] else { return }

        if record.isActive && activeTasks[id] != nil {
            debugLog("[DownloadManager] Download already active, skipping resume: \(id)")
            return
        }

        let hasResume = await hasResumeData(for: id)

        var book = bookMetadataCache[record.bookID]
        if book == nil && !hasResume {
            book = await BookServiceActor.shared.fetchBookDetails(
                for: record.bookID
            )
        }

        if book == nil && !hasResume {
            debugLog(
                "[DownloadManager] Cannot resume: no metadata and no resume data for \(record.bookID)"
            )
            return
        }

        if let book {
            bookMetadataCache[record.bookID] = book
            if record.expectedBytes == nil {
                record.expectedBytes = expectedDownloadBytes(for: record.category, book: book)
            }
        }

        record.state = .queued
        record.lastUpdatedAt = Date()
        downloads[id] = record
        notifyObservers()

        await beginDownloadTask(for: record, book: book)
    }

    public func cancelDownload(for bookID: BookID, category: LocalMediaCategory) async {
        await ensureInitialized()

        guard let id = recordID(for: bookID, category: category) else { return }

        if let task = activeTasks.removeValue(forKey: id) {
            task.cancel()
        }

        downloads.removeValue(forKey: id)
        await deleteResumeData(for: id)

        await persistState()
        notifyObservers()
    }

    public var incompleteDownloads: [DownloadRecord] {
        get async {
            await ensureInitialized()
            return downloads.values
                .filter { $0.isIncomplete }
                .sorted { $0.createdAt < $1.createdAt }
        }
    }

    public func downloadState(for bookID: BookID, category: LocalMediaCategory) async
        -> DownloadRecord?
    {
        await ensureInitialized()
        guard let id = recordID(for: bookID, category: category) else { return nil }
        return downloads[id]
    }

    public func downloadProgress(for bookID: BookID, category: LocalMediaCategory) async -> Double?
    {
        await ensureInitialized()
        guard let id = recordID(for: bookID, category: category),
            let record = downloads[id], record.isActive
        else { return nil }
        return record.progressFraction
    }

    // Ensures the retry loop starts on boot: called from MediaViewModel.init on iOS/macOS/tvOS,
    // and from StorytellerWatchApp.task on watchOS.
    public func addObserver(_ callback: @escaping @Sendable ([DownloadRecord]) -> Void)
        async -> UUID
    {
        await ensureInitialized()
        let id = UUID()
        observers[id] = callback
        return id
    }

    public func removeObserver(id: UUID) {
        observers.removeValue(forKey: id)
    }

    private func notifyObservers() {
        let snapshot = Array(downloads.values)
        let callbacks = Array(observers.values)
        for callback in callbacks {
            callback(snapshot)
        }
    }

    public func handleBackgroundSessionEvents(completionHandler: @escaping @Sendable () -> Void)
        async
    {
        await ensureInitialized()
        backgroundCompletionHandler = completionHandler
    }

    func handleBackgroundSessionFinished() {
        if let handler = backgroundCompletionHandler {
            backgroundCompletionHandler = nil
            DispatchQueue.main.async {
                handler()
            }
        }
    }

    func handleProgress(
        downloadId: String,
        receivedBytes: Int64,
        expectedBytes: Int64?,
        progress: Double,
    ) {
        guard let downloadID = UUID(uuidString: downloadId),
            var record = downloads[downloadID]
        else { return }
        record.receivedBytes = receivedBytes
        if let expectedBytes {
            record.expectedBytes = expectedBytes
        }
        let resolvedProgress =
            record.expectedBytes.flatMap { expectedBytes in
                expectedBytes > 0 ? Double(receivedBytes) / Double(expectedBytes) : nil
            } ?? progress
        record.state = .downloading(progress: min(max(resolvedProgress, 0), 1))
        record.lastUpdatedAt = Date()
        downloads[downloadID] = record
        notifyObservers()
    }

    func handleFileDownloaded(downloadId: String, tempURL: URL) async {
        guard let downloadID = UUID(uuidString: downloadId) else {
            try? FileManager.default.removeItem(at: tempURL)
            return
        }
        activeTasks.removeValue(forKey: downloadID)
        guard var record = downloads[downloadID] else {
            try? FileManager.default.removeItem(at: tempURL)
            return
        }

        record.state = .importing
        record.lastUpdatedAt = Date()
        downloads[downloadID] = record
        notifyObservers()

        var book = bookMetadataCache[record.bookID]
        if book == nil {
            book = await BookServiceActor.shared.fetchBookDetails(
                for: record.bookID
            )
        }

        guard let book else {
            debugLog("[DownloadManager] No metadata for import: \(record.bookID)")
            record.state = .failed(error: "Missing book metadata", hasResumeData: false)
            record.lastUpdatedAt = Date()
            downloads[downloadID] = record
            await persistState()
            notifyObservers()
            return
        }

        let filename = fallbackFilename(bookId: record.bookID.uuid, format: record.format)

        do {
            try await LocalMediaActor.shared.importDownloadedFile(
                from: tempURL,
                metadata: book,
                category: record.category,
                filename: filename,
            )

            record.state = .completed
            record.lastUpdatedAt = Date()
            if let expected = record.expectedBytes {
                record.receivedBytes = expected
            }
            downloads[downloadID] = record

            downloads.removeValue(forKey: downloadID)
            await deleteResumeData(for: downloadID)
        } catch {
            debugLog("[DownloadManager] Import failed for \(record.bookTitle): \(error)")
            record.state = .failed(error: error.localizedDescription, hasResumeData: false)
            // The file downloaded fine, so the import error will recur on every attempt.
            // Exhaust the auto-retry budget; the user can still retry manually.
            record.retryCount = Self.maxAutoRetries
            record.lastUpdatedAt = Date()
            downloads[downloadID] = record
        }

        await persistState()
        notifyObservers()
    }

    func handleFailure(downloadId: String, error: Error, resumeData: Data?) async {
        guard let downloadID = UUID(uuidString: downloadId),
            var record = downloads[downloadID]
        else { return }

        activeTasks.removeValue(forKey: downloadID)

        if let resumeData {
            await saveResumeData(resumeData, for: downloadID)
        }

        var hasResume = resumeData != nil
        if !hasResume {
            hasResume = await hasResumeData(for: downloadID)
        }

        // System-cancelled downloads (-999) are interruptions, not real failures
        if let urlError = error as? URLError, urlError.code == .cancelled {
            record.state = .paused(hasResumeData: hasResume)
        } else {
            record.state = .failed(error: error.localizedDescription, hasResumeData: hasResume)
        }

        record.lastUpdatedAt = Date()
        downloads[downloadID] = record

        await persistState()
        notifyObservers()
    }

    func handleHTTPError(downloadId: String, statusCode: Int) async {
        guard let downloadID = UUID(uuidString: downloadId),
            var record = downloads[downloadID]
        else { return }

        activeTasks.removeValue(forKey: downloadID)
        await deleteResumeData(for: downloadID)

        if statusCode == 401 || statusCode == 403 {
            debugLog(
                "[DownloadManager] Auth expired for \(record.bookTitle), retrying with fresh credentials"
            )

            var book = bookMetadataCache[record.bookID]
            if book == nil {
                book = await BookServiceActor.shared.fetchBookDetails(
                    for: record.bookID
                )
            }

            if let book {
                bookMetadataCache[record.bookID] = book
                record.state = .queued
                record.lastUpdatedAt = Date()
                downloads[downloadID] = record
                notifyObservers()
                await beginDownloadTask(for: record, book: book)
                return
            }
        }

        record.state = .failed(error: "Server error (\(statusCode))", hasResumeData: false)
        record.lastUpdatedAt = Date()
        downloads[downloadID] = record
        await persistState()
        notifyObservers()
    }

    private func beginDownloadTask(for record: DownloadRecord, book: BookMetadata?) async {
        if let existingTask = activeTasks.removeValue(forKey: record.id) {
            existingTask.cancel()
        }

        let sourceRecords = await BookServiceActor.shared.bookSources
        let sourceRecord = sourceRecords.first {
            $0.id == record.bookID.sourceID
        }

        if sourceRecord?.kind == .localFolder {
            await resolveFolderSourceMedia(for: record)
            return
        }

        let resumeData = await loadResumeData(for: record.id)
        let task: URLSessionDownloadTask

        if let resumeData {
            task = downloadSession.downloadTask(withResumeData: resumeData)
            await deleteResumeData(for: record.id)
        } else {
            guard book != nil else {
                debugLog(
                    "[DownloadManager] Cannot start download: no metadata for \(record.bookTitle)"
                )
                var updated = record
                updated.state = .failed(error: "Missing book metadata", hasResumeData: false)
                updated.lastUpdatedAt = Date()
                downloads[record.id] = updated
                await persistState()
                notifyObservers()
                return
            }

            guard
                let request = await BookServiceActor.shared.createAuthenticatedDownloadRequest(
                    for: record.bookID,
                    format: record.format,
                )
            else {
                debugLog("[DownloadManager] Failed to create request for \(record.bookTitle)")
                var updated = record
                updated.state = .failed(error: "Authentication failed", hasResumeData: false)
                updated.lastUpdatedAt = Date()
                downloads[record.id] = updated
                await persistState()
                notifyObservers()
                return
            }

            task = downloadSession.downloadTask(with: request)
        }

        let taskDescription = record.id.uuidString
        task.taskDescription = taskDescription
        delegate.registerTask(task, downloadId: taskDescription)
        activeTasks[record.id] = task

        var updated = record
        updated.state = .downloading(progress: updated.progressFraction)
        updated.lastUpdatedAt = Date()
        downloads[record.id] = updated

        task.resume()

        await persistState()
        notifyObservers()
    }

    private func resolveFolderSourceMedia(for record: DownloadRecord) async {
        var importing = record
        importing.state = .importing
        importing.lastUpdatedAt = Date()
        downloads[record.id] = importing
        notifyObservers()

        if await BookServiceActor.shared.resolveLocalMedia(
            for: record.bookID,
            category: record.category,
        ) != nil {
            downloads.removeValue(forKey: record.id)
            await deleteResumeData(for: record.id)
        } else {
            debugLog(
                "[DownloadManager] Folder source media unavailable for \(record.bookTitle) / \(record.category.rawValue)"
            )
            var failed = record
            failed.state = .failed(error: "Source media is unavailable", hasResumeData: false)
            failed.lastUpdatedAt = Date()
            downloads[record.id] = failed
        }

        await persistState()
        notifyObservers()
    }

    private func formatForCategory(_ category: LocalMediaCategory, book: BookMetadata)
        -> StorytellerBookFormat?
    {
        switch category {
            case .ebook:
                return book.hasAvailableEbook ? .ebook : nil
            case .audio:
                return book.hasAvailableAudiobook ? .audiobook : nil
            case .synced:
                return book.hasAvailableReadaloud ? .readaloud : nil
        }
    }

    private func expectedDownloadBytes(
        for category: LocalMediaCategory,
        book: BookMetadata,
    ) -> Int64? {
        let bytes =
            switch category {
                case .ebook: book.ebook?.fileSize
                case .audio: book.audiobook?.fileSize
                case .synced: book.readaloud?.fileSize
            }
        guard let bytes, bytes > 0 else { return nil }
        return Int64(bytes)
    }

    private func fallbackFilename(bookId: String, format: StorytellerBookFormat) -> String {
        let ext: String =
            switch format {
                case .ebook, .readaloud: "epub"
                case .audiobook: "audiobook"
            }
        return "\(bookId).\(ext)"
    }

    private func persistState() async {
        let records = Array(downloads.values)
        do {
            try await FilesystemActor.shared.saveDownloadState(records)
        } catch {
            debugLog("[DownloadManager] Failed to persist state: \(error)")
        }
    }

    private func loadPersistedState() async -> [DownloadRecord] {
        do {
            return try await FilesystemActor.shared.loadDownloadState()
        } catch {
            debugLog("[DownloadManager] Discarding unreadable persisted state: \(error)")
            do {
                try await FilesystemActor.shared.saveDownloadState([])
            } catch {
                debugLog("[DownloadManager] Failed to reset persisted state: \(error)")
            }
            return []
        }
    }

    private func saveResumeData(_ data: Data, for id: UUID) async {
        do {
            try await FilesystemActor.shared.saveResumeData(data, for: id.uuidString)
        } catch {
            debugLog("[DownloadManager] Failed to save resume data: \(error)")
        }
    }

    private func loadResumeData(for id: UUID) async -> Data? {
        do {
            return try await FilesystemActor.shared.loadResumeData(for: id.uuidString)
        } catch {
            return nil
        }
    }

    private func hasResumeData(for id: UUID) async -> Bool {
        await FilesystemActor.shared.hasResumeData(for: id.uuidString)
    }

    private func deleteResumeData(for id: UUID) async {
        do {
            try await FilesystemActor.shared.deleteResumeData(for: id.uuidString)
        } catch {
            debugLog("[DownloadManager] Failed to delete resume data: \(error)")
        }
    }
}
