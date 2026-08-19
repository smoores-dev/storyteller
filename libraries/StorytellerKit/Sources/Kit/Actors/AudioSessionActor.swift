import Foundation

public struct AudiobookSessionChapter: Sendable, Codable, Hashable {
    public let id: String
    public let title: String
    public let duration: TimeInterval

    public init(id: String, title: String, duration: TimeInterval) {
        self.id = id
        self.title = title
        self.duration = duration
    }
}

public struct AudiobookSessionServerPosition: Sendable, Codable, Hashable {
    public let title: String?
    public let totalProgression: Double?

    public init(title: String?, totalProgression: Double?) {
        self.title = title
        self.totalProgression = totalProgression
    }
}

public enum AudiobookSessionSleepTimerMode: String, Sendable, Codable {
    case duration
    case endOfChapter
}

public struct AudiobookSessionState: Sendable, Codable, Hashable {
    public let bookID: String
    public let sourceID: String
    public let title: String
    public let author: String
    public let isPlaying: Bool
    public let currentTime: TimeInterval
    public let duration: TimeInterval
    public let bookProgress: Double
    public let currentChapterID: String?
    public let currentChapterIndex: Int?
    public let chapterElapsed: TimeInterval
    public let chapterDuration: TimeInterval
    public let chapterProgress: Double
    public let playbackRate: Double
    public let volume: Double
    public let chapters: [AudiobookSessionChapter]
    public let sleepTimerMode: AudiobookSessionSleepTimerMode?
    public let sleepTimerRemaining: TimeInterval?
    public let pendingServerPosition: AudiobookSessionServerPosition?
}

public enum AudiobookSessionCommand: Sendable {
    case togglePlayPause
    case skipBackward
    case skipForward
    case previousChapter
    case nextChapter
    case seekChapterFraction(Double)
    case selectChapter(String)
    case setPlaybackRate(Double)
    case setVolume(Double)
    case startSleepTimer(TimeInterval)
    case startEndOfChapterSleepTimer
    case cancelSleepTimer
    case acceptServerPosition
    case declineServerPosition
}

public enum AudiobookSessionError: Error, LocalizedError, Sendable {
    case bookNotFound(String)
    case localMediaUnavailable(String)
    case audiobookNotOpen

    public var errorDescription: String? {
        switch self {
            case .bookNotFound(let id):
                return "Book not found: \(id)"
            case .localMediaUnavailable(let id):
                return "No downloaded audiobook is available for \(id)."
            case .audiobookNotOpen:
                return "No audiobook is open."
        }
    }
}

public enum AudioSessionKind: Sendable, Equatable {
    case audiobook(BookID)
    case readaloud(BookID)

    public var bookID: BookID {
        switch self {
            case .audiobook(let id), .readaloud(let id):
                return id
        }
    }
}

public enum ReadaloudOpenResult: Sendable, Equatable {
    case joinedLiveSession
    case openedFresh
}

public struct AudioSessionSnapshot: Sendable {
    public let kind: AudioSessionKind
    public let title: String?
    public let author: String?
    public let isPlaying: Bool
    public let chapterLabel: String?
    public let bookProgress: Double
    public let playbackRate: Double
}

public enum AudioSessionTransportCommand: Sendable {
    case play
    case pause
    case togglePlayPause
}

/// The one app-wide audio session.
///
/// `AudiobookActor` and `SMILPlayerActor` remain the low-level engines. This
/// actor owns which book currently holds the audio pipeline (audiobook or
/// readaloud) and, for audiobooks, the user-visible session lifecycle,
/// progress restoration and synchronization, semantic controls, sleep timers,
/// and the state rendered by platform UIs. For readaloud, position/nav
/// authority stays with the reading session; this actor only owns the
/// engine's lifetime and exclusivity.
@globalActor
public actor AudioSessionActor {
    public static let shared = AudioSessionActor()

    public static let playbackRateSteps: [Double] = [
        0.75, 1.0, 1.1, 1.2, 1.3, 1.5, 2.0, 5.0,
    ]

    public static let skipInterval: TimeInterval = 15

    private var currentKind: AudioSessionKind?
    private var artworkData: Data?
    private var readaloudTitle: String?
    private var readaloudAuthor: String?
    private var smilObserverID: UUID?
    private var lastPublishedChapters: NowPlayingChapters?
    private var attachments: Set<UUID> = []
    private var snapshotObservers: [UUID: @Sendable (AudioSessionSnapshot?) -> Void] = [:]

    private var book: BookMetadata?
    private var mediaURL: URL?
    private var metadata: AudiobookMetadata?
    private var activeSessionID: UUID?
    private var playbackObserverID: UUID?
    private var playbackEventContinuation: AsyncStream<AudiobookPlaybackState>.Continuation?
    private var playbackEventTask: Task<Void, Never>?
    private var incomingPositionObserverID: UUID?
    private var refreshTask: Task<Void, Never>?
    private var coverTask: Task<Void, Never>?
    private var observers: [UUID: @Sendable (AudiobookSessionState?) -> Void] = [:]

    private var lastObservedIsPlaying = false
    private var lastSyncedLocator: BookLocator?
    private var nextPeriodicSync = Date.distantFuture
    private var syncInterval: TimeInterval = 60
    private var pendingServerPosition: IncomingServerPosition?
    private var lastRestartTime: Date?

    private var sleepTimerMode: AudiobookSessionSleepTimerMode?
    private var sleepTimerRemaining: TimeInterval?
    private var sleepTimerChapterID: String?
    private var lastSleepTimerUpdate = Date()

    private init() {}

    public func openAudiobook(bookID: BookID) async throws {
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        guard let book = snapshot.books.first(where: { $0.id == bookID }) else {
            throw AudiobookSessionError.bookNotFound(bookID.uuid)
        }
        guard
            let media = await BookServiceActor.shared.resolveLocalMedia(
                for: bookID,
                category: .audio,
            )
        else {
            throw AudiobookSessionError.localMediaUnavailable(bookID.uuid)
        }

        try await openAudiobook(book: book, mediaURL: media.url)
    }

    public func openAudiobook(book: BookMetadata, mediaURL: URL) async throws {
        if self.book?.id == book.id,
            self.mediaURL?.standardizedFileURL == mediaURL.standardizedFileURL,
            metadata != nil
        {
            await publishState()
            return
        }

        await teardown(syncReason: self.book == nil ? nil : .userClosedBook)

        let sessionID = UUID()
        activeSessionID = sessionID
        self.book = book
        self.mediaURL = mediaURL
        currentKind = .audiobook(book.id)

        do {
            await closeReadaloudArm(onlyIfEngineActive: true)
            await AudiobookActor.shared.cleanup()

            let loadedMetadata = try await AudiobookActor.shared.validateAndLoadAudiobook(
                url: mediaURL
            )
            metadata = loadedMetadata

            let config = await SettingsActor.shared.config
            syncInterval = config.sync.progressSyncIntervalSeconds
            await AudiobookActor.shared.setPlaybackRate(config.playback.defaultPlaybackSpeed)
            await AudiobookActor.shared.setVolume(config.playback.defaultVolume)

            let progression = min(max(await initialProgression(for: book) ?? 0, 0), 1)
            if progression > 0 {
                try await AudiobookActor.shared.preparePlayer(
                    at: loadedMetadata.totalDuration * progression
                )
            } else {
                try await AudiobookActor.shared.preparePlayer()
            }
            if let state = await AudiobookActor.shared.getCurrentState() {
                lastObservedIsPlaying = state.isPlaying
                lastSyncedLocator = makeLocator(state: state, metadata: loadedMetadata)
            }

            await installPlaybackObserver(for: sessionID)
            incomingPositionObserverID = await ProgressSyncActor.shared
                .addIncomingPositionObserver(for: book.id) { position in
                    Task {
                        await AudioSessionActor.shared.handleIncomingPosition(
                            position,
                            sessionID: sessionID,
                        )
                    }
                }

            nextPeriodicSync =
                syncInterval > 0 ? Date().addingTimeInterval(syncInterval) : .distantFuture
            startRefreshTask()
            await configureNowPlayingCommands(for: .audiobook(book.id))
            await publishState()
            startCoverTask(for: book, sessionID: sessionID)
        } catch {
            await teardown(syncReason: nil)
            notifyObservers(nil)
            throw error
        }
    }

    public func openReadaloud(
        bookID: BookID,
        epubPath: URL,
        title: String?,
        author: String?,
    ) async throws -> ReadaloudOpenResult {
        let loadedBookID = await SMILPlayerActor.shared.getLoadedBookID()
        let isPlaying = await SMILPlayerActor.shared.getCurrentState()?.isPlaying ?? false

        if loadedBookID == bookID && isPlaying {
            currentKind = .readaloud(bookID)
            readaloudTitle = title
            readaloudAuthor = author
            await configureNowPlayingCommands(for: .readaloud(bookID))
            await installSMILObserver()
            return .joinedLiveSession
        }

        await closeAudiobookArmIfActive()

        try await SMILPlayerActor.shared.loadBook(
            epubPath: epubPath,
            bookID: bookID,
            title: title,
            author: author,
        )
        let config = await SettingsActor.shared.config
        await SMILPlayerActor.shared.setPlaybackRate(config.playback.defaultPlaybackSpeed)
        await SMILPlayerActor.shared.setVolume(config.playback.defaultVolume)

        currentKind = .readaloud(bookID)
        readaloudTitle = title
        readaloudAuthor = author
        await configureNowPlayingCommands(for: .readaloud(bookID))
        await installSMILObserver()
        return .openedFresh
    }

    public func setSessionCover(_ data: Data?, for bookID: BookID) async {
        guard let currentKind, currentKind.bookID == bookID else { return }
        artworkData = data
        switch currentKind {
            case .audiobook:
                await updateNowPlaying(audiobookNowPlaying(from: await makeState()))
            case .readaloud:
                await updateNowPlaying(
                    readaloudNowPlaying(from: await SMILPlayerActor.shared.getCurrentState())
                )
        }
    }

    public func closeAudiobook() async {
        await teardown(syncReason: .userClosedBook)
        notifyObservers(nil)
    }

    public func closeAudiobookArmIfActive() async {
        if case .audiobook = currentKind {
            await closeAudiobook()
        } else if await SMILPlayerActor.shared.activeAudioPlayer == .audiobook {
            await AudiobookActor.shared.cleanup()
        }
    }

    public func closeCurrent() async {
        switch currentKind {
            case .audiobook:
                await closeAudiobook()
            case .readaloud:
                await closeReadaloudArm()
            case nil:
                break
        }
    }

    public func close(ifOwnedBy bookID: BookID) async {
        switch currentKind {
            case .audiobook(let id) where id == bookID:
                await closeAudiobook()
            case .readaloud(let id) where id == bookID:
                await closeReadaloudArm()
            default:
                if await SMILPlayerActor.shared.getLoadedBookID() == bookID {
                    await SMILPlayerActor.shared.cleanup()
                }
        }
    }

    public func currentSessionKind() -> AudioSessionKind? {
        currentKind
    }

    @discardableResult
    public func attach(id: UUID = UUID()) -> UUID {
        attachments.insert(id)
        return id
    }

    public func detach(id: UUID) {
        attachments.remove(id)
    }

    public var attachmentCount: Int {
        attachments.count
    }

    public func transport(_ command: AudioSessionTransportCommand) async throws {
        switch currentKind {
            case .audiobook:
                switch command {
                    case .play:
                        try await AudiobookActor.shared.play(automaticRewind: true)
                    case .pause:
                        await AudiobookActor.shared.pause()
                    case .togglePlayPause:
                        try await AudiobookActor.shared.togglePlayPause()
                }
            case .readaloud:
                switch command {
                    case .play:
                        try await SMILPlayerActor.shared.play(automaticRewind: true)
                    case .pause:
                        await SMILPlayerActor.shared.pause()
                    case .togglePlayPause:
                        try await SMILPlayerActor.shared.togglePlayPause()
                }
            case nil:
                break
        }
    }

    public func setPlaybackRate(_ rate: Double) async {
        let clamped = min(max(rate, 0.5), 10)
        switch currentKind {
            case .audiobook:
                await AudiobookActor.shared.setPlaybackRate(clamped)
                await publishState()
            case .readaloud:
                await SMILPlayerActor.shared.setPlaybackRate(clamped)
            case nil:
                return
        }
        try? await SettingsActor.shared.updateConfig(defaultPlaybackSpeed: clamped)
    }

    public func cyclePlaybackRate() async {
        let current = await currentSnapshot()?.playbackRate ?? 1
        let next =
            Self.playbackRateSteps.first { $0 > current + 0.001 }
            ?? Self.playbackRateSteps[0]
        await setPlaybackRate(next)
    }

    public func control(_ command: AudiobookSessionCommand) async throws {
        guard metadata != nil else { throw AudiobookSessionError.audiobookNotOpen }

        switch command {
            case .togglePlayPause:
                try await transport(.togglePlayPause)
            case .skipBackward:
                await skip(by: -Self.skipInterval)
            case .skipForward:
                await skip(by: Self.skipInterval)
            case .previousChapter:
                await previousChapter()
            case .nextChapter:
                await nextChapter()
            case .seekChapterFraction(let fraction):
                await scrubWithinCurrentChapter(fraction: fraction)
            case .selectChapter(let chapterID):
                await selectChapter(id: chapterID)
            case .setPlaybackRate(let value):
                await setPlaybackRate(value)
            case .setVolume(let value):
                let volume = min(max(value, 0), 1)
                await AudiobookActor.shared.setVolume(volume)
                try await SettingsActor.shared.updateConfig(defaultVolume: volume)
            case .startSleepTimer(let seconds):
                startSleepTimer(seconds: seconds)
            case .startEndOfChapterSleepTimer:
                await startEndOfChapterSleepTimer()
            case .cancelSleepTimer:
                cancelSleepTimer()
            case .acceptServerPosition:
                await acceptServerPosition()
            case .declineServerPosition:
                pendingServerPosition = nil
        }

        await publishState()
    }

    @discardableResult
    public func addStateObserver(
        id: UUID = UUID(),
        _ observer: @escaping @Sendable (AudiobookSessionState?) -> Void,
    ) async -> UUID {
        observers[id] = observer
        observer(await makeState())
        return id
    }

    public func removeStateObserver(id: UUID) {
        observers.removeValue(forKey: id)
    }

    public func currentState() async -> AudiobookSessionState? {
        await makeState()
    }

    @discardableResult
    public func addSnapshotObserver(
        id: UUID = UUID(),
        _ observer: @escaping @Sendable (AudioSessionSnapshot?) -> Void,
    ) async -> UUID {
        snapshotObservers[id] = observer
        observer(await currentSnapshot())
        return id
    }

    public func removeSnapshotObserver(id: UUID) {
        snapshotObservers.removeValue(forKey: id)
    }

    public func currentSnapshot() async -> AudioSessionSnapshot? {
        switch currentKind {
            case .audiobook:
                return (await makeState()).flatMap(audiobookSnapshot(from:))
            case .readaloud(let id):
                guard let state = await SMILPlayerActor.shared.getCurrentState() else {
                    return nil
                }
                return readaloudSnapshot(from: state, fallbackBookID: id)
            case nil:
                return nil
        }
    }

    private func closeReadaloudArm(onlyIfEngineActive: Bool = false) async {
        if let smilObserverID {
            await SMILPlayerActor.shared.removeStateObserver(id: smilObserverID)
            self.smilObserverID = nil
        }
        if case .readaloud = currentKind {
            currentKind = nil
            readaloudTitle = nil
            readaloudAuthor = nil
            artworkData = nil
            notifySnapshotObservers(nil)
            await teardownNowPlayingCommands()
        }
        if onlyIfEngineActive {
            if await SMILPlayerActor.shared.activeAudioPlayer == .smil {
                await SMILPlayerActor.shared.cleanup()
            }
        } else {
            await SMILPlayerActor.shared.cleanup()
        }
    }

    private func installSMILObserver() async {
        guard smilObserverID == nil else { return }
        smilObserverID = await SMILPlayerActor.shared.addStateObserver { state in
            Task {
                await AudioSessionActor.shared.handleSMILStateChange(state)
            }
        }
    }

    private func handleSMILStateChange(_ state: SMILPlaybackState) async {
        guard case .readaloud(let id) = currentKind else { return }
        guard let bookID = state.bookID else {
            if let smilObserverID {
                await SMILPlayerActor.shared.removeStateObserver(id: smilObserverID)
                self.smilObserverID = nil
            }
            currentKind = nil
            readaloudTitle = nil
            readaloudAuthor = nil
            artworkData = nil
            notifySnapshotObservers(nil)
            await teardownNowPlayingCommands()
            return
        }
        if bookID != id {
            currentKind = .readaloud(bookID)
        }
        notifySnapshotObservers(readaloudSnapshot(from: state, fallbackBookID: bookID))
        await updateNowPlaying(readaloudNowPlaying(from: state))
        await updateNowPlayingChapters()
    }

    private func readaloudSnapshot(
        from state: SMILPlaybackState,
        fallbackBookID: BookID,
    ) -> AudioSessionSnapshot {
        AudioSessionSnapshot(
            kind: .readaloud(state.bookID ?? fallbackBookID),
            title: readaloudTitle,
            author: readaloudAuthor,
            isPlaying: state.isPlaying,
            chapterLabel: state.chapterLabel,
            bookProgress: state.bookTotal > 0 ? state.bookElapsed / state.bookTotal : 0,
            playbackRate: state.playbackRate,
        )
    }

    private func audiobookSnapshot(from state: AudiobookSessionState) -> AudioSessionSnapshot? {
        guard case .audiobook(let id) = currentKind else { return nil }
        let chapter = state.currentChapterIndex.flatMap { state.chapters[safe: $0] }
        return AudioSessionSnapshot(
            kind: .audiobook(id),
            title: state.title,
            author: state.author,
            isPlaying: state.isPlaying,
            chapterLabel: chapter?.title,
            bookProgress: state.bookProgress,
            playbackRate: state.playbackRate,
        )
    }

    private func notifySnapshotObservers(_ snapshot: AudioSessionSnapshot?) {
        for observer in snapshotObservers.values {
            observer(snapshot)
        }
    }

    private func installPlaybackObserver(for sessionID: UUID) async {
        let (stream, continuation) = AsyncStream.makeStream(
            of: AudiobookPlaybackState.self
        )
        playbackEventContinuation = continuation
        playbackEventTask = Task { [weak self] in
            for await state in stream {
                guard !Task.isCancelled, let self else { return }
                await self.handlePlaybackStateChange(state, sessionID: sessionID)
            }
        }
        if let playbackObserverID {
            await AudiobookActor.shared.removeStateObserver(id: playbackObserverID)
        }
        playbackObserverID = await AudiobookActor.shared.addStateObserver { state in
            continuation.yield(state)
        }
    }

    private func handlePlaybackStateChange(
        _ state: AudiobookPlaybackState,
        sessionID: UUID,
    ) async {
        guard activeSessionID == sessionID else { return }
        let shouldSyncPause = lastObservedIsPlaying && !state.isPlaying
        lastObservedIsPlaying = state.isPlaying

        if shouldSyncPause {
            await syncProgress(reason: .userPausedPlayback)
        }
        await publishState(using: state)
    }

    private func handleIncomingPosition(
        _ position: IncomingServerPosition,
        sessionID: UUID,
    ) async {
        guard activeSessionID == sessionID, book != nil else { return }
        let config = await SettingsActor.shared.config
        if config.sync.autoSyncToNewerServerPosition {
            await navigate(to: position)
        } else {
            pendingServerPosition = position
            await publishState()
        }
    }

    private func acceptServerPosition() async {
        guard let position = pendingServerPosition else { return }
        pendingServerPosition = nil
        await navigate(to: position)
    }

    private func navigate(to position: IncomingServerPosition) async {
        guard let progression = position.locator.locations?.totalProgression else { return }
        let clampedProgression = min(max(progression, 0), 1)
        await AudiobookActor.shared.seekToTotalProgressFraction(clampedProgression)
        if let metadata, let state = await AudiobookActor.shared.getCurrentState() {
            lastSyncedLocator = makeLocator(state: state, metadata: metadata)
        }
        pendingServerPosition = nil
    }

    private func chapterContext() async -> (
        ids: [String], position: Int, progress: Double
    )? {
        switch currentKind {
            case .audiobook:
                guard let metadata,
                    let index = await AudiobookActor.shared.getCurrentChapterIndex(),
                    let chapter = metadata.chapters[safe: index],
                    let state = await AudiobookActor.shared.getCurrentState()
                else { return nil }
                let elapsed = max(0, state.currentTime - chapter.startTime)
                return (
                    metadata.chapters.map(\.id),
                    index,
                    chapter.duration > 0 ? elapsed / chapter.duration : 0
                )
            case .readaloud:
                let listing = await SMILPlayerActor.shared.getChapterListing()
                guard let currentID = listing.currentChapterID,
                    let position = listing.chapters.firstIndex(where: { $0.id == currentID })
                else { return nil }
                let state = await SMILPlayerActor.shared.getCurrentState()
                let progress = (state?.chapterTotal ?? 0) > 0
                    ? (state?.chapterElapsed ?? 0) / (state?.chapterTotal ?? 1)
                    : 0
                return (listing.chapters.map(\.id), position, progress)
            case nil:
                return nil
        }
    }

    public func previousChapter() async {
        guard let context = await chapterContext() else { return }
        let restarts = previousChapterRestarts(
            progressInChapter: context.progress,
            lastRestartAt: lastRestartTime,
        )
        let target =
            !restarts && context.position > 0 ? context.position - 1 : context.position
        lastRestartTime = target == context.position ? Date() : nil
        await selectChapter(id: context.ids[target])
    }

    public func nextChapter() async {
        guard let context = await chapterContext(),
            let next = context.ids[safe: context.position + 1]
        else { return }
        lastRestartTime = nil
        await selectChapter(id: next)
    }

    public func selectChapter(id: String) async {
        switch currentKind {
            case .audiobook:
                await AudiobookActor.shared.seekToChapter(href: id)
            case .readaloud:
                _ = await SMILPlayerActor.shared.seekToSection(id: id)
            case nil:
                break
        }
    }

    /// Where the playing chapter starts in engine time, and how long it runs.
    private func currentChapterWindow() async -> (start: TimeInterval, duration: TimeInterval)? {
        switch currentKind {
            case .audiobook:
                guard let metadata,
                    let index = await AudiobookActor.shared.getCurrentChapterIndex(),
                    let chapter = metadata.chapters[safe: index]
                else { return nil }
                return (chapter.startTime, chapter.duration)
            case .readaloud:
                guard let state = await SMILPlayerActor.shared.getCurrentState() else { return nil }
                return (0, state.chapterTotal)
            case nil:
                return nil
        }
    }

    /// Staying off both chapter edges keeps a scrub to the end from tripping
    /// the end-of-chapter advance straight into the next one.
    private func scrubWithinCurrentChapter(toSeconds seconds: TimeInterval) async {
        guard let window = await currentChapterWindow() else { return }
        let clamped = max(0.1, min(seconds, max(0.1, window.duration - 0.5)))
        switch currentKind {
            case .audiobook:
                await AudiobookActor.shared.seek(to: window.start + clamped)
            case .readaloud:
                _ = await SMILPlayerActor.shared.seekWithinCurrentChapter(to: clamped)
            case nil:
                break
        }
    }

    private func scrubWithinCurrentChapter(fraction: Double) async {
        guard let window = await currentChapterWindow() else { return }
        await scrubWithinCurrentChapter(
            toSeconds: window.duration * min(max(fraction, 0), 1)
        )
    }

    private func skip(by seconds: TimeInterval) async {
        switch currentKind {
            case .audiobook:
                if seconds >= 0 {
                    await AudiobookActor.shared.skipForward(seconds)
                } else {
                    await AudiobookActor.shared.skipBackward(-seconds)
                }
            case .readaloud:
                if seconds >= 0 {
                    await SMILPlayerActor.shared.skipForward(seconds: seconds)
                } else {
                    await SMILPlayerActor.shared.skipBackward(seconds: -seconds)
                }
            case nil:
                break
        }
    }

    private func startSleepTimer(seconds: TimeInterval) {
        guard seconds > 0 else {
            cancelSleepTimer()
            return
        }
        sleepTimerMode = .duration
        sleepTimerRemaining = seconds
        sleepTimerChapterID = nil
        lastSleepTimerUpdate = Date()
    }

    private func startEndOfChapterSleepTimer() async {
        let index = await AudiobookActor.shared.getCurrentChapterIndex()
        sleepTimerMode = .endOfChapter
        sleepTimerRemaining = nil
        sleepTimerChapterID = index.flatMap { metadata?.chapters[safe: $0]?.id }
        lastSleepTimerUpdate = Date()
    }

    private func cancelSleepTimer() {
        sleepTimerMode = nil
        sleepTimerRemaining = nil
        sleepTimerChapterID = nil
    }

    private func startRefreshTask() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled, let self else { return }
                await self.refresh()
            }
        }
    }

    private func refresh() async {
        guard let state = await AudiobookActor.shared.getCurrentState() else { return }
        await updateSleepTimer(using: state)

        if state.isPlaying, syncInterval > 0, Date() >= nextPeriodicSync {
            await syncProgress(reason: .periodicDuringActivePlayback)
            nextPeriodicSync = Date().addingTimeInterval(syncInterval)
        }
        await publishState(using: state)
    }

    private func updateSleepTimer(using state: AudiobookPlaybackState) async {
        let now = Date()
        defer { lastSleepTimerUpdate = now }
        guard state.isPlaying, let sleepTimerMode else { return }

        switch sleepTimerMode {
            case .duration:
                let remaining = max(
                    0,
                    (sleepTimerRemaining ?? 0) - now.timeIntervalSince(lastSleepTimerUpdate),
                )
                sleepTimerRemaining = remaining
                if remaining <= 0 {
                    cancelSleepTimer()
                    await AudiobookActor.shared.pause()
                }
            case .endOfChapter:
                guard let metadata,
                    let index = state.currentChapterIndex,
                    metadata.chapters.indices.contains(index)
                else { return }
                let chapter = metadata.chapters[index]
                let elapsed = max(0, state.currentTime - chapter.startTime)
                if chapter.id != sleepTimerChapterID || elapsed >= chapter.duration - 0.5 {
                    cancelSleepTimer()
                    await AudiobookActor.shared.pause()
                }
        }
    }

    private func publishState(using suppliedState: AudiobookPlaybackState? = nil) async {
        let state = await makeState(using: suppliedState)
        notifyObservers(state)
        if case .audiobook = currentKind {
            await updateNowPlaying(audiobookNowPlaying(from: state))
            await updateNowPlayingChapters(from: state)
        }
    }

    private func updateNowPlayingChapters(from state: AudiobookSessionState?) async {
        guard let state else {
            await publishNowPlayingChapters(nil, for: currentKind)
            return
        }
        await publishNowPlayingChapters(
            NowPlayingChapters(
                currentChapterID: state.currentChapterID,
                currentChapterIndex: state.currentChapterIndex,
                chapters: state.chapters.map {
                    NowPlayingChapter(id: $0.id, title: $0.title, duration: $0.duration)
                },
            ),
            for: currentKind,
        )
    }

    private func updateNowPlayingChapters() async {
        let kind = currentKind
        let listing = await SMILPlayerActor.shared.getChapterListing()
        let index = listing.currentChapterID.flatMap { id in
            listing.chapters.firstIndex { $0.id == id }
        }
        await publishNowPlayingChapters(
            NowPlayingChapters(
                currentChapterID: listing.currentChapterID,
                currentChapterIndex: index,
                chapters: listing.chapters.map {
                    NowPlayingChapter(id: $0.id, title: $0.title, duration: $0.duration)
                },
            ),
            for: kind,
        )
    }

    /// Reading the listing suspends; `kind` guards against publishing chapters
    /// for a session torn down mid-read.
    private func publishNowPlayingChapters(
        _ chapters: NowPlayingChapters?,
        for kind: AudioSessionKind?,
    ) async {
        guard let presenter = StorytellerPlatform.nowPlaying else { return }
        guard kind == currentKind else { return }
        guard chapters != lastPublishedChapters else { return }
        await presenter.updateChapters(chapters)
        lastPublishedChapters = chapters
    }

    private func makeState(
        using suppliedState: AudiobookPlaybackState? = nil
    ) async -> AudiobookSessionState? {
        guard let book, let metadata else { return nil }

        let state: AudiobookPlaybackState
        if let suppliedState {
            state = suppliedState
        } else if let currentState = await AudiobookActor.shared.getCurrentState() {
            state = currentState
        } else {
            return nil
        }

        let chapter = state.currentChapterIndex.flatMap { metadata.chapters[safe: $0] }
        let rawChapterElapsed = chapter.map { state.currentTime - $0.startTime } ?? 0
        let chapterDuration = chapter?.duration ?? 0
        let chapterElapsed = min(max(rawChapterElapsed, 0), max(chapterDuration, 0))
        let chapterProgress =
            chapterDuration > 0 ? min(max(chapterElapsed / chapterDuration, 0), 1) : 0
        let bookProgress =
            state.duration > 0 ? min(max(state.currentTime / state.duration, 0), 1) : 0

        return AudiobookSessionState(
            bookID: book.uuid,
            sourceID: book.sourceID,
            title: book.title,
            author: book.authors?.first?.name ?? metadata.author ?? "",
            isPlaying: state.isPlaying,
            currentTime: state.currentTime,
            duration: state.duration,
            bookProgress: bookProgress,
            currentChapterID: chapter?.id,
            currentChapterIndex: state.currentChapterIndex,
            chapterElapsed: chapterElapsed,
            chapterDuration: chapterDuration,
            chapterProgress: chapterProgress,
            playbackRate: Double(state.playbackRate),
            volume: Double(state.volume),
            chapters: metadata.chapters.map {
                AudiobookSessionChapter(id: $0.id, title: $0.title, duration: $0.duration)
            },
            sleepTimerMode: sleepTimerMode,
            sleepTimerRemaining: sleepTimerRemaining,
            pendingServerPosition: pendingServerPosition.map {
                AudiobookSessionServerPosition(
                    title: $0.locator.title,
                    totalProgression: $0.locator.locations?.totalProgression,
                )
            },
        )
    }

    private func notifyObservers(_ state: AudiobookSessionState?) {
        for observer in observers.values {
            observer(state)
        }
        if case .audiobook = currentKind {
            notifySnapshotObservers(state.flatMap(audiobookSnapshot(from:)))
        }
    }

    private func syncProgress(reason: SyncReason) async {
        guard let book, let metadata,
            let state = await AudiobookActor.shared.getCurrentState()
        else { return }

        let chapter = state.currentChapterIndex.flatMap { metadata.chapters[safe: $0] }
        let chapterProgress =
            chapter.map {
                $0.duration > 0
                    ? min(max((state.currentTime - $0.startTime) / $0.duration, 0), 1)
                    : 0
            } ?? 0
        let locator = makeLocator(state: state, metadata: metadata)
        guard locator != lastSyncedLocator else { return }
        let result = await ProgressSyncActor.shared.syncProgress(
            bookID: book.id,
            locator: locator,
            timestamp: floor(Date().timeIntervalSince1970 * 1_000),
            reason: reason,
            sourceIdentifier: "Audiobook Player",
            locationDescription: "\(chapter?.title ?? "Audiobook"), \(Int(chapterProgress * 100))%",
        )
        switch result {
            case .success, .queued:
                lastSyncedLocator = locator
            case .failed:
                break
        }
    }

    private func makeLocator(
        state: AudiobookPlaybackState,
        metadata: AudiobookMetadata,
    ) -> BookLocator {
        let progress = state.duration > 0 ? state.currentTime / state.duration : 0
        let chapter = state.currentChapterIndex.flatMap { metadata.chapters[safe: $0] }
        let chapterProgress =
            chapter.map {
                $0.duration > 0
                    ? min(max((state.currentTime - $0.startTime) / $0.duration, 0), 1)
                    : 0
            } ?? 0
        return BookLocator(
            href: state.currentTrackHref ?? "audiobook",
            type: state.currentTrackType ?? "audio/mp4",
            title: chapter?.title,
            locations: BookLocator.Locations(
                fragments: ["t=\(state.currentTrackTime)"],
                progression: chapterProgress,
                position: nil,
                totalProgression: progress,
                cssSelector: nil,
                partialCfi: nil,
                domRange: nil,
            ),
            text: nil,
        )
    }

    private func initialProgression(for book: BookMetadata) async -> Double? {
        if let progress = await ProgressSyncActor.shared.getBookProgress(for: book.id),
            let progression = progress.locator?.locations?.totalProgression
        {
            return progression
        }
        return book.position?.locator?.locations?.totalProgression
    }

    private func coverData(for book: BookMetadata) async -> Data? {
        if let data = await BookServiceActor.shared.cachedCoverData(for: book.id, audio: true) {
            return data
        }
        if let data = await BookServiceActor.shared.cachedCoverData(for: book.id, audio: false) {
            return data
        }

        for audio in [true, false] {
            let response = await BookServiceActor.shared.loadCover(
                for: book.id,
                audio: audio,
                width: 1_024,
                height: 1_024,
                version: book.updatedAt,
                allowNetwork: true,
                policy: .cachedThenFetch,
            )
            switch response {
                case .cached(let data): return data
                case .fetched(let cover): return cover.data
                case .missing, .skippedOffline: continue
            }
        }
        return nil
    }

    private func startCoverTask(for book: BookMetadata, sessionID: UUID) {
        coverTask?.cancel()
        coverTask = Task { [weak self] in
            guard let self, let cover = await self.coverData(for: book), !Task.isCancelled else {
                return
            }
            await self.applyCover(cover, sessionID: sessionID)
        }
    }

    private func applyCover(_ cover: Data, sessionID: UUID) async {
        guard activeSessionID == sessionID else { return }
        artworkData = cover
        await publishState()
    }

    private func teardown(syncReason: SyncReason?) async {
        activeSessionID = nil
        refreshTask?.cancel()
        refreshTask = nil
        coverTask?.cancel()
        coverTask = nil

        if let playbackObserverID {
            await AudiobookActor.shared.removeStateObserver(id: playbackObserverID)
        }
        playbackEventContinuation?.finish()
        playbackEventContinuation = nil
        playbackEventTask?.cancel()
        playbackEventTask = nil
        if let incomingPositionObserverID {
            await ProgressSyncActor.shared.removeIncomingPositionObserver(
                id: incomingPositionObserverID
            )
        }
        if let syncReason {
            await syncProgress(reason: syncReason)
        }
        await AudiobookActor.shared.cleanup()

        book = nil
        mediaURL = nil
        metadata = nil
        playbackObserverID = nil
        incomingPositionObserverID = nil
        lastObservedIsPlaying = false
        lastSyncedLocator = nil
        nextPeriodicSync = .distantFuture
        syncInterval = 60
        pendingServerPosition = nil
        lastRestartTime = nil
        cancelSleepTimer()
        if case .audiobook = currentKind {
            currentKind = nil
            artworkData = nil
            notifySnapshotObservers(nil)
            await teardownNowPlayingCommands()
        }
    }

    private func configureNowPlayingCommands(for kind: AudioSessionKind) async {
        guard let presenter = StorytellerPlatform.nowPlaying else { return }
        await presenter.configureCommands(
            skipForwardInterval: Self.skipInterval,
            skipBackwardInterval: Self.skipInterval,
            supportsChangePlaybackPosition: true,
            supportsChangePlaybackRate: false,
        ) { command in
            Task { await AudioSessionActor.shared.handleRemoteCommand(command) }
        }
    }

    private func teardownNowPlayingCommands() async {
        // Cleared directly: publishNowPlayingChapters' kind guard drops calls
        // made after currentKind is nil, which close paths are.
        lastPublishedChapters = nil
        guard let presenter = StorytellerPlatform.nowPlaying else { return }
        await presenter.updateChapters(nil)
        await presenter.clear()
        await presenter.teardownCommands()
    }

    private func updateNowPlaying(_ info: NowPlayingInfo?) async {
        guard let presenter = StorytellerPlatform.nowPlaying else { return }
        if let info {
            await presenter.update(info)
        } else {
            await presenter.clear()
        }
    }

    private func handleRemoteCommand(_ command: RemoteCommand) async {
        switch command {
            case .play:
                try? await transport(.play)
            case .pause:
                try? await transport(.pause)
            case .togglePlayPause:
                try? await transport(.togglePlayPause)
            case .skipForward(let interval):
                await skip(by: interval)
            case .skipBackward(let interval):
                await skip(by: -interval)
            case .changePlaybackPosition(let position):
                await scrubWithinCurrentChapter(toSeconds: position)
            case .changePlaybackRate(let rate):
                await setPlaybackRate(rate)
            case .selectChapter(let chapterID):
                await selectChapter(id: chapterID)
            case .nextChapter:
                await nextChapter()
            case .previousChapter:
                await previousChapter()
            // Spoken audio convention: the dedicated track keys (AirPods
            // double/triple press) skip rather than change chapter.
            case .nextTrack:
                await skip(by: Self.skipInterval)
            case .previousTrack:
                await skip(by: -Self.skipInterval)
        }

        if case .audiobook = currentKind {
            await publishState()
        }
    }

    private func audiobookNowPlaying(from state: AudiobookSessionState?) -> NowPlayingInfo? {
        guard let state else { return nil }
        let chapter = state.currentChapterIndex.flatMap { state.chapters[safe: $0] }
        return NowPlayingInfo(
            title: state.title,
            artist: chapter?.title,
            albumTitle: state.author,
            duration: state.chapterDuration,
            elapsedTime: state.chapterElapsed,
            playbackRate: state.playbackRate,
            isPlaying: state.isPlaying,
            artwork: artworkData,
        )
    }

    private func readaloudNowPlaying(from state: SMILPlaybackState?) -> NowPlayingInfo? {
        guard let state else { return nil }
        return NowPlayingInfo(
            title: readaloudTitle ?? "Storyteller",
            artist: state.chapterLabel ?? "Playing",
            albumTitle: readaloudAuthor ?? "",
            duration: state.chapterTotal,
            elapsedTime: state.chapterElapsed,
            playbackRate: state.playbackRate,
            isPlaying: state.isPlaying,
            artwork: artworkData,
        )
    }
}
