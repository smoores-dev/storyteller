import Foundation
import Observation

public struct ReadingContent: Sendable {
    public let text: URL?
    public let audio: PlaybackTimeline?
    public var hasText: Bool { text != nil }
    public var hasAudio: Bool { audio != nil }
    public var hasAlignment: Bool { audio?.hasTextAlignment == true }
}

public enum ReadingSessionClosePolicy: Sendable { case detachView, endSession }

/// Placeholder for headless sessions; only view-driven paths read settings.
@StorytellerUIActor
final class HeadlessReaderSettings: ReaderSettingsReading {
    var fontSize: Double { 16 }
    var fontFamily: String { "system" }
    var lineSpacing: Double { 1.5 }
    var marginLeftRight: Double { 0 }
    var marginTop: Double { 0 }
    var marginBottom: Double { 0 }
    var wordSpacing: Double { 0 }
    var letterSpacing: Double { 0 }
    var paragraphSpacing: Double { 0 }
    var firstLineIndent: Bool { false }
    var textAlignment: String { "left" }
    var highlightColor: String? { nil }
    var highlightThickness: Double { 1 }
    var backgroundColor: String? { nil }
    var foregroundColor: String? { nil }
    var customCSS: String? { nil }
    var singleColumnMode: Bool { false }
    var scrollingMode: Bool { false }
    var disableReaderAnimations: Bool { false }
    var enableMarginClickNavigation: Bool { false }
    var userHighlightMode: String { "underline" }
    var readaloudHighlightMode: String { "underline" }
    var readaloudDimOthers: Bool { false }
    var readaloudDimAmount: Double { kDefaultReadaloudDimAmount }
    var readaloudHighlightFade: Double { kDefaultReadaloudHighlightFade }
    var coverStrengthBackground: Double { kDefaultCoverTintStrength }
    var coverStrengthForeground: Double { kDefaultCoverTintStrength }
    var coverStrengthHighlight: Double { kDefaultCoverTintStrength }
    var readaloudTextItalic: Bool { kDefaultReadaloudTextItalic }
    var readaloudTextBold: Bool { kDefaultReadaloudTextBold }
    var readaloudUnderlineStyle: String { kDefaultReadaloudUnderlineStyle }
    var freeBrowseMode: String = "never"
    var readaloudHighlightVisibility: String = "paused"
    var doubleTapPlay: String { "never" }
}

/// Coordinates navigation, playback, and progress saving for a book.
@StorytellerUIActor
@Observable
public final class ReadingSession {
    public let bookID: BookID
    public let metadata: BookMetadata
    public let category: LocalMediaCategory
    public var localMediaPath: URL?
    @ObservationIgnored var settings: any ReaderSettingsReading
    @ObservationIgnored let engine: PlaybackEngineActor
    @ObservationIgnored let progressAccess: ReadingProgressAccess
    public private(set) var commsBridge: ReaderBridge?
    public var isViewAttached: Bool { commsBridge != nil }
    public var bookStructure: [SectionInfo] = []
    public var tocEntries: [TocEntry] = []
    public var hasAudioNarration = false
    public var extractedEbookPath: URL?
    public var originalEbookURL: URL?
    public var ebookFileFormat: EbookFileFormat = .epub
    public private(set) var lastPrepareError: Error?
    public internal(set) var content = ReadingContent(text: nil, audio: nil)
    public internal(set) var playbackSnapshot: AudioSessionSnapshot?
    public internal(set) var audiobookState: AudiobookSessionState?
    public internal(set) var chapters = SMILChapterListing(chapters: [], currentChapterID: nil)
    var playback = ReadingPlayback()
    var navigation = ReadingNavigation()
    var isEnded = false
    public var isBrowsing: Bool { navigation.browseLocation != nil }
    public var offeredProgress: IncomingServerPosition? { playback.offered }
    public internal(set) var lastSyncResult: ReadingSyncResult = .deferred("Not prepared")
    @ObservationIgnored private var closingTask: Task<Void, Never>?
    @ObservationIgnored private var nativeLoadingTask: Task<Void, Never>?
    @ObservationIgnored private(set) var incomingObserver: UUID?
    @ObservationIgnored private var liveObserver: UUID?
    @ObservationIgnored private var observerRegistration: Task<Void, Never>?

    @ObservationIgnored public var onComicPrepared: ((URL) -> Void)?
    @ObservationIgnored public var onUserNavigation: (() -> Void)?
    @ObservationIgnored public var onRecoveryStructureReady: (() -> Void)?
    @ObservationIgnored public var onPlaybackActivityChanged: ((Bool) -> Void)?
    @ObservationIgnored public var onReadaloudAvailabilityChanged: ((Bool) -> Void)?
    @ObservationIgnored public var onViewStructureReady: (() async -> Void)?
    /// Notifies the UI of a server position awaiting acceptance.
    @ObservationIgnored public var onIncomingServerPosition: ((IncomingServerPosition) -> Void)?

    init(
        metadata: BookMetadata,
        category: LocalMediaCategory,
        localMediaPath: URL?,
        settings: any ReaderSettingsReading,
        engine: PlaybackEngineActor = .shared,
        progressAccess: ReadingProgressAccess = .live,
    ) {
        bookID = metadata.id
        self.metadata = metadata
        self.category = category
        self.localMediaPath = localMediaPath
        self.settings = settings
        self.engine = engine
        self.progressAccess = progressAccess
        updateContentCapabilities()
    }

    public func prepare() {
        guard nativeLoadingTask == nil, !isEnded else { return }
        nativeLoadingTask = Task { @StorytellerUIActor in
            do {
                if category == .audio {
                    try await prepareAudiobook()
                } else {
                    let prepared = try await BookServiceActor.shared.prepareEbookForReading(
                        bookID: bookID,
                        category: category,
                    )
                    try Task.checkCancellation()
                    guard !isEnded else { return }
                    extractedEbookPath = prepared.readerURL
                    originalEbookURL = prepared.originalURL
                    ebookFileFormat = EbookFileFormat(fileURL: prepared.originalURL)
                    content = ReadingContent(text: prepared.readerURL, audio: nil)
                    if ebookFileFormat == .cbz {
                        try await initializeTextProgress()
                        onComicPrepared?(prepared.readerURL)
                    } else if category == .synced {
                        try await openReadaloud(epubPath: prepared.originalURL)
                        bookStructure = await engine.getBookStructure()
                        tocEntries = await engine.getTocEntries()
                    } else {
                        let parsed = try SMILParser.parseEPUB(at: prepared.originalURL)
                        bookStructure = parsed.sections
                        tocEntries = parsed.tocEntries
                        try await initializeTextProgress()
                    }
                }
                updateContentCapabilities()
            } catch { lastPrepareError = error }
        }
        observerRegistration = Task { @StorytellerUIActor [weak self] in
            guard let self else { return }
            let incoming = await ProgressSyncActor.shared.addIncomingPositionObserver(for: bookID) {
                [weak self] position in
                Task { @StorytellerUIActor in await self?.applyIncomingPosition(position) }
            }
            if isEnded {
                await ProgressSyncActor.shared.removeIncomingPositionObserver(id: incoming)
                return
            }
            incomingObserver = incoming
            let live = await LiveReadingSyncActor.shared.addIncomingObserver(for: bookID) {
                [weak self] packet in
                Task { @StorytellerUIActor in await self?.receivePeerPosition(packet) }
            }
            if isEnded {
                await LiveReadingSyncActor.shared.removeIncomingObserver(id: live)
                return
            }
            liveObserver = live
        }
    }
    public func awaitPreparation() async { await nativeLoadingTask?.value }

    func updateContentCapabilities() {
        hasAudioNarration = content.hasAlignment
    }

    public func attachBridge(_ bridge: ReaderBridge) {
        guard !isEnded else { return }
        navigation.syncTask?.cancel()
        navigation.syncTask = nil
        navigation.retry?.cancel()
        navigation.retry = nil
        navigation.followTimer?.cancel()
        navigation.followTimer = nil
        navigation.snapshot = nil
        navigation.confirmed = nil
        commsBridge = bridge
        updateContentCapabilities()
        bridge.onNavigationRequest = { [weak self, weak bridge] target in
            guard let self, self.commsBridge === bridge else { return }
            self.requestReaderNavigation(target, reason: .userSelectedChapter)
        }
        bridge.onReadingState = { [weak self, weak bridge] state in
            guard let self, let bridge, self.commsBridge === bridge, !self.isEnded else { return }
            if let known = self.navigation.snapshot, known.documentID != state.documentID { return }
            if let known = self.navigation.snapshot, known.sequence > state.sequence { return }
            if state.gesture?.active == true,
                self.navigation.snapshot?.gesture?.id != state.gesture?.id
            {
                self.navigation.revision &+= 1
                self.navigation.pending = nil
                self.navigation.followTimer?.cancel()
            }
            self.navigation.snapshot = state
            self.scheduleReconciliation(reason: "reader event")
        }
        bridge.onBookStructureReady = { [weak self, weak bridge] message in
            Task { @StorytellerUIActor in
                guard let self, let bridge, self.commsBridge === bridge, !self.isEnded else {
                    return
                }
                await self.awaitPreparation()
                guard self.commsBridge === bridge, !self.isEnded else { return }
                if self.bookStructure.isEmpty { self.bookStructure = message.sections }
                self.updateContentCapabilities()
                self.onReadaloudAvailabilityChanged?(self.hasAudioNarration)
                await self.onViewStructureReady?()
                self.onRecoveryStructureReady?()
                _ = await self.ensureSynced(reason: "reader ready")
            }
        }
        bridge.onDocumentNavigationRequest = { [weak self, weak bridge] request in
            Task { @StorytellerUIActor in
                guard let self, let bridge,
                    await self.validRequest(from: request.documentID, bridge: bridge)
                else { return }
                self.requestReaderNavigation(request.target, reason: .userSelectedChapter)
            }
        }
        bridge.onMarginClickNav = { [weak self, weak bridge] message in
            Task { @StorytellerUIActor in
                guard let self, let bridge,
                    await self.validRequest(from: message.documentID, bridge: bridge)
                else { return }
                self.requestReaderNavigation(
                    ReaderTarget(kind: message.direction == "left" ? "left" : "right"),
                    reason: .userFlippedPage,
                )
            }
        }
        bridge.onSentenceSkip = { [weak self, weak bridge] message in
            Task { @StorytellerUIActor in
                guard let self, let bridge,
                    await self.validRequest(from: message.documentID, bridge: bridge)
                else { return }
                await self.skipSentence(by: message.direction == "previous" ? -1 : 1)
            }
        }
        bridge.onMediaOverlaySeek = { [weak self, weak bridge] message in
            Task { @StorytellerUIActor in
                guard let self, let bridge,
                    await self.validRequest(from: message.documentID, bridge: bridge)
                else { return }
                await self.userSeekNarration(
                    sectionIndex: message.sectionIndex,
                    anchor: message.anchor,
                    doubleTap: true,
                )
            }
        }
    }

    private func validRequest(from documentID: String, bridge: ReaderBridge) async -> Bool {
        guard !isEnded, commsBridge === bridge,
            let facts = try? await bridge.readingSnapshot(),
            facts.documentID == documentID, commsBridge === bridge
        else { return false }
        return true
    }

    public func handleSceneBecameActive() async {
        navigation.foreground = true
        _ = await ensureSynced(reason: "foreground")
    }
    public func handleSceneEnteredBackground() async {
        navigation.foreground = false
        navigation.followTimer?.cancel()
        navigation.followTimer = nil
        navigation.retry?.cancel()
        navigation.retry = nil
        if playback.acceptedAudio, navigation.audioOperation == nil,
            await engine.getCurrentState()?.isPlaying == true
        {
            await acceptAudioPosition()
        }
        await saveProgressLocallyAndRequestUpload(reason: .appBackgrounding)
    }
    public func readerUnavailable() {
        navigation.syncTask?.cancel()
        navigation.syncTask = nil
        navigation.retry?.cancel()
        navigation.retry = nil
        navigation.followTimer?.cancel()
        navigation.followTimer = nil
        navigation.snapshot = nil
        navigation.confirmed = nil
        commsBridge = nil
        onPlaybackActivityChanged?(false)
    }

    private func removeIncomingPositionObserver() {
        if let id = incomingObserver {
            incomingObserver = nil
            Task { await ProgressSyncActor.shared.removeIncomingPositionObserver(id: id) }
        }
    }
    public func close(_ policy: ReadingSessionClosePolicy) async {
        // Finish closing before another session can use the engine.
        if let closingTask {
            await closingTask.value
            return
        }
        guard !isEnded else { return }
        readerUnavailable()
        if policy == .detachView {
            await saveProgressLocallyAndRequestUpload(reason: .userClosedBook)
            return
        }
        isEnded = true
        navigation.revision &+= 1
        let task = Task { @StorytellerUIActor in
            nativeLoadingTask?.cancel()
            await nativeLoadingTask?.value
            await observerRegistration?.value
            removeIncomingPositionObserver()
            if let id = liveObserver {
                await LiveReadingSyncActor.shared.removeIncomingObserver(id: id)
                liveObserver = nil
            }
            await stopPlaybackSession()
            await saveProgressLocallyAndRequestUpload(reason: .userClosedBook)
            playbackSnapshot = nil
            audiobookState = nil
            chapters = SMILChapterListing(chapters: [], currentChapterID: nil)
            onPlaybackActivityChanged?(false)
            ActiveReadingSession.shared.release(self)
        }
        closingTask = task
        await task.value
    }

}

struct ReadingProgressAccess: Sendable {
    let read: @Sendable (BookID) async throws -> BookProgress?
    let save: @Sendable (BookID, BookLocator, Double, SyncReason) async -> Bool
    let uploadPending: @Sendable () async -> Void
    static let live = ReadingProgressAccess(
        read: { try await ProgressSyncActor.shared.readBookProgress(for: $0) },
        save: { book, locator, timestamp, reason in
            let result = await ProgressSyncActor.shared.syncProgress(
                bookID: book,
                locator: locator,
                timestamp: timestamp,
                reason: reason,
                sourceIdentifier: "Reading Session",
            )
            guard result != .failed,
                let persisted = try? await ProgressSyncActor.shared.readBookProgress(for: book)
            else { return false }
            return persisted.locator == locator && persisted.timestamp == timestamp
        },
        uploadPending: { await ProgressSyncActor.shared.scheduleQueueFlush() },
    )
}
