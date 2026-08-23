import Foundation
import Testing

@testable import StorytellerKit
#if os(iOS) || os(macOS)
@testable import StorytellerAppleKit
#endif

@StorytellerUIActor
private final class SessionRecordingJSEvaluator: JSEvaluating {
    var scripts: [String] = []
    var evaluationError: Error?

    func evaluate(_ script: String) async throws -> String? {
        scripts.append(script)
        if let evaluationError {
            throw evaluationError
        }
        return nil
    }
}

private enum SessionTestError: Error {
    case evaluationFailed
}

#if os(iOS) || os(macOS)
@MainActor
private final class RecoveryStateBox {
    var chapterID: Int? = 0
    var fraction = 0.625
    var extractedEbookPath: URL? = URL(fileURLWithPath: "/tmp/recovery.epub")
    var sectionCount = 1
}
#endif

private struct ReaderRecoveryWaitTimeout: Error, CustomStringConvertible {
    let expectation: String

    var description: String {
        "Timed out waiting for \(expectation)"
    }
}

@StorytellerUIActor
@Test func foregroundReanchorsWhenThisBooksAudioAdvancedInBackground() async throws {
    let bookID = BookID(sourceID: "test-source", uuid: UUID().uuidString)
    let evaluator = SessionRecordingJSEvaluator()
    let session = makeSession(
        bookID: bookID,
        audioPositionAccess: playingAudioAccess(bookID: bookID),
    )
    session.attachBridge(ReaderCommsBridge(js: evaluator), isRecovery: false)

    await session.handleSceneEnteredBackground()
    #expect(await session.reconcilePositionAfterSceneActivation() == .nativeAudio)
    #expect(evaluator.scripts.contains("window.foliateManager.goTo('chapter.xhtml#sentence')"))

    #expect(await session.reconcilePositionAfterSceneActivation() == .persistedProgress)
    await session.close(.endSession)
}

@StorytellerUIActor
@Test func foregroundRestoresAlwaysVisiblePlayheadHighlight() async throws {
    let bookID = BookID(sourceID: "test-source", uuid: UUID().uuidString)
    let playbackState = SessionPlaybackStateBox(bookID: bookID, isPlaying: true)
    let evaluator = SessionRecordingJSEvaluator()
    let settings = HeadlessReaderSettings()
    settings.readaloudHighlightVisibility = "always"
    let session = makeSession(
        bookID: bookID,
        settings: settings,
        audioPositionAccess: audioAccess(bookID: bookID, playbackState: playbackState),
    )
    let bridge = ReaderCommsBridge(js: evaluator)
    session.attachBridge(bridge, isRecovery: false)

    let router = ReaderMessageRouter(bridge: bridge)
    #expect(
        router.route(
            name: "BookStructureReady",
            body: [
                "sections": [
                    [
                        "index": 0,
                        "id": "chapter.xhtml",
                        "mediaOverlay": [
                            [
                                "textId": "sentence",
                                "textHref": "chapter.xhtml",
                                "audioFile": "audio.mp3",
                                "begin": 0.0,
                                "end": 10.0,
                                "cumSumAtEnd": 10.0,
                            ]
                        ],
                    ]
                ],
                "isRtl": false,
            ],
        )
    )
    try await waitForScript(containing: "sentence", in: evaluator)

    evaluator.scripts.removeAll()
    await session.handleSceneEnteredBackground()
    await playbackState.setIsPlaying(false)

    #expect(await session.reconcilePositionAfterSceneActivation() == .nativeAudio)
    try await waitForScript(
        containing: "highlightFragment(0, 'sentence', true)",
        in: evaluator,
    )
    #expect(!evaluator.scripts.contains { $0.contains("foliateManager.goTo") })
    #expect(await session.reconcilePositionAfterSceneActivation() == .persistedProgress)

    await session.close(.endSession)
}

@StorytellerUIActor
@Test func foregroundDropsDirtyPositionWhenAnotherBookOwnsAudio() async {
    let bookID = BookID(sourceID: "test-source", uuid: UUID().uuidString)
    let otherBookID = BookID(sourceID: "test-source", uuid: UUID().uuidString)
    let evaluator = SessionRecordingJSEvaluator()
    let session = makeSession(
        bookID: bookID,
        audioPositionAccess: playingAudioAccess(bookID: otherBookID),
    )
    session.attachBridge(ReaderCommsBridge(js: evaluator), isRecovery: false)

    await session.handleSceneEnteredBackground()
    #expect(await session.reconcilePositionAfterSceneActivation() == .persistedProgress)
    #expect(!evaluator.scripts.contains { $0.contains("foliateManager.goTo") })
    #expect(await session.reconcilePositionAfterSceneActivation() == .persistedProgress)

    await session.close(.endSession)
}

@StorytellerUIActor
@Test func recoveryResyncsPlaybackActiveBeforeRestoringHighlight() async throws {
    let bookID = BookID(sourceID: "test-source", uuid: UUID().uuidString)
    let playbackState = SessionPlaybackStateBox(bookID: bookID, isPlaying: true)
    let initialEvaluator = SessionRecordingJSEvaluator()
    let session = makeSession(
        bookID: bookID,
        audioPositionAccess: audioAccess(bookID: bookID, playbackState: playbackState),
    )
    let initialBridge = ReaderCommsBridge(js: initialEvaluator)
    session.attachBridge(initialBridge, isRecovery: false)

    let structureBody: [String: Any] = [
        "sections": [
            [
                "index": 0,
                "id": "chapter.xhtml",
                "mediaOverlay": [
                    [
                        "textId": "sentence",
                        "textHref": "chapter.xhtml",
                        "audioFile": "audio.mp3",
                        "begin": 0.0,
                        "end": 10.0,
                        "cumSumAtEnd": 10.0,
                    ]
                ],
            ]
        ],
        "isRtl": false,
    ]
    let initialRouter = ReaderMessageRouter(bridge: initialBridge)
    #expect(initialRouter.route(name: "BookStructureReady", body: structureBody))
    try await waitForScript(
        containing: "highlightFragment(0, 'sentence', true)",
        in: initialEvaluator,
    )

    let recoveryEvaluator = SessionRecordingJSEvaluator()
    let recoveryBridge = ReaderCommsBridge(js: recoveryEvaluator)
    session.isViewRecovering = { true }
    session.attachBridge(recoveryBridge, isRecovery: true)

    let recoveryRouter = ReaderMessageRouter(bridge: recoveryBridge)
    #expect(recoveryRouter.route(name: "BookStructureReady", body: structureBody))
    try await waitForScript(
        containing: "highlightFragment(0, 'sentence', true)",
        in: recoveryEvaluator,
    )
    let playbackActiveIndex = try #require(
        recoveryEvaluator.scripts.firstIndex(of:
            "window.foliateManager.setPlaybackActive(true)"
        )
    )
    let highlightIndex = try #require(
        recoveryEvaluator.scripts.firstIndex {
            $0.contains("highlightFragment(0, 'sentence', true)")
        }
    )
    #expect(playbackActiveIndex < highlightIndex)

    await session.close(.endSession)
}

@StorytellerUIActor
@Test func recoveryUsesNativeAudioPositionBeforePersistedReaderPosition() async throws {
    let bookID = BookID(sourceID: "test-source", uuid: UUID().uuidString)
    let session = makeSession(
        bookID: bookID,
        audioPositionAccess: playingAudioAccess(bookID: bookID),
    )
    session.attachBridge(
        ReaderCommsBridge(js: SessionRecordingJSEvaluator()),
        isRecovery: false,
    )
    await session.handleSceneEnteredBackground()

    let recoveryEvaluator = SessionRecordingJSEvaluator()
    let recoveryBridge = ReaderCommsBridge(js: recoveryEvaluator)
    #if os(iOS) || os(macOS)
    let recoveryState = RecoveryStateBox()
    let recoveryManager = makeRecoveryManager(state: recoveryState)
    recoveryManager.setBridge(recoveryBridge)
    recoveryManager.handleContentPurged()
    session.isViewRecovering = { recoveryManager.isInRecovery }
    session.onRecoveryStructureReady = { restoreSavedViewPosition in
        _ = recoveryManager.handleBookStructureReadyIfRecovering(
            restoreSavedViewPosition: restoreSavedViewPosition
        )
    }
    #else
    session.isViewRecovering = { true }
    #endif
    session.attachBridge(recoveryBridge, isRecovery: true)

    let router = ReaderMessageRouter(bridge: recoveryBridge)
    #expect(
        router.route(
            name: "BookStructureReady",
            body: [
                "sections": [
                    ["index": 0, "id": "chapter.xhtml", "mediaOverlay": []]
                ],
                "isRtl": false,
            ],
        )
    )

    try await waitForScript(containing: "goTo('chapter.xhtml#sentence')", in: recoveryEvaluator)
    #if os(iOS) || os(macOS)
    try await waitForRecoveryToComplete(recoveryManager)
    #expect(
        !recoveryEvaluator.scripts.contains { $0.contains("goToFractionInSection") }
    )
    #endif

    await session.close(.endSession)
}

#if os(iOS) || os(macOS)
@MainActor
@Test func webViewRecoveryManagerRestoresSavedPositionWhenAllowed() async throws {
    let state = RecoveryStateBox()
    let evaluator = SessionRecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = makeRecoveryManager(state: state)
    manager.setBridge(bridge)

    manager.handleContentPurged()
    #expect(manager.handleBookStructureReadyIfRecovering(restoreSavedViewPosition: true))

    try await waitForScript(containing: "goToFractionInSection(0, 0.625)", in: evaluator)
    try await waitForRecoveryToComplete(manager)
}
#endif

@StorytellerUIActor
@Test func failedForegroundReanchorRemainsDirtyForRecoveryRetry() async throws {
    let bookID = BookID(sourceID: "test-source", uuid: UUID().uuidString)
    let failingEvaluator = SessionRecordingJSEvaluator()
    failingEvaluator.evaluationError = SessionTestError.evaluationFailed
    let session = makeSession(
        bookID: bookID,
        audioPositionAccess: playingAudioAccess(bookID: bookID),
    )
    session.attachBridge(ReaderCommsBridge(js: failingEvaluator), isRecovery: false)

    await session.handleSceneEnteredBackground()
    #expect(await session.reconcilePositionAfterSceneActivation() == .nativeAudio)
    try await waitForScript(containing: "chapter.xhtml#sentence", in: failingEvaluator)

    let recoveredEvaluator = SessionRecordingJSEvaluator()
    session.attachBridge(ReaderCommsBridge(js: recoveredEvaluator), isRecovery: true)
    #expect(await session.reconcilePositionAfterSceneActivation() == .nativeAudio)
    try await waitForScript(containing: "chapter.xhtml#sentence", in: recoveredEvaluator)
    #expect(await session.reconcilePositionAfterSceneActivation() == .persistedProgress)

    await session.close(.endSession)
}

@StorytellerUIActor
@Test func missingAudioSyncDataKeepsForegroundPositionDirty() async {
    let bookID = BookID(sourceID: "test-source", uuid: UUID().uuidString)
    let evaluator = SessionRecordingJSEvaluator()
    let session = makeSession(
        bookID: bookID,
        audioPositionAccess: ReadingSessionAudioPositionAccess(
            currentState: { playingState(bookID: bookID) },
            loadedBookID: { bookID },
            reconcilePositionFromPlayer: {},
            backgroundSyncData: { nil },
        ),
    )
    session.attachBridge(ReaderCommsBridge(js: evaluator), isRecovery: false)

    await session.handleSceneEnteredBackground()
    #expect(await session.reconcilePositionAfterSceneActivation() == .nativeAudio)
    #expect(await session.reconcilePositionAfterSceneActivation() == .nativeAudio)
    #expect(!evaluator.scripts.contains { $0.contains("foliateManager.goTo") })

    await session.close(.endSession)
}

@StorytellerUIActor
@Test func rtlBookStructureMessageConfiguresPageTurnDirection() async throws {
    let evaluator = SessionRecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let session = makeSession(
        bookID: BookID(sourceID: "test-source", uuid: UUID().uuidString),
        audioPositionAccess: emptyAudioAccess(),
    )
    session.attachBridge(bridge, isRecovery: false)

    let router = ReaderMessageRouter(bridge: bridge)
    #expect(
        router.route(
            name: "BookStructureReady",
            body: [
                "sections": [
                    ["index": 0, "id": "one.xhtml", "mediaOverlay": []],
                    ["index": 1, "id": "two.xhtml", "mediaOverlay": []],
                    ["index": 2, "id": "three.xhtml", "mediaOverlay": []],
                ],
                "isRtl": true,
            ],
        )
    )

    let manager = try #require(session.progressManager)
    try await waitForRTLStructure(in: manager)
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 1
    manager.chapterTotalPages = 3
    manager.handleUserNavLeft()

    try await waitForScript(containing: "foliateManager.goLeft", in: evaluator)
    await session.close(.endSession)
}

@Test func opfParserPreservesNonLinearSpineMetadata() throws {
    let opf = """
        <?xml version="1.0" encoding="UTF-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <manifest>
            <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
            <item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine>
            <itemref idref="chapter"/>
            <itemref idref="notes" linear="no"/>
          </spine>
        </package>
        """

    let parsed = try SMILParser.parseOPF(Data(opf.utf8))

    #expect(parsed.spine.map(\.idref) == ["chapter", "notes"])
    #expect(parsed.spine.map(\.linear) == [nil, "no"])
}

@StorytellerUIActor
@Test func userPageTurnCancelsPendingMediaOverlayFlip() async throws {
    let baselineEvaluator = SessionRecordingJSEvaluator()
    let baseline = makeMediaOverlayManager(evaluator: baselineEvaluator)
    scheduleDelayedPageFlip(in: baseline.manager)
    try await waitForScript(containing: "goRight(false)", in: baselineEvaluator)

    let cancelledEvaluator = SessionRecordingJSEvaluator()
    let cancelled = makeMediaOverlayManager(evaluator: cancelledEvaluator)
    scheduleDelayedPageFlip(in: cancelled.manager)
    cancelled.manager.handleUserPageTurnStarted()

    try await Task.sleep(for: .milliseconds(250))
    #expect(!cancelledEvaluator.scripts.contains { $0.contains("goRight(false)") })
}

@StorytellerUIActor
private func makeSession(
    bookID: BookID,
    settings: any ReaderSettingsReading = HeadlessReaderSettings(),
    audioPositionAccess: ReadingSessionAudioPositionAccess,
) -> ReadingSession {
    ReadingSession(
        metadata: BookMetadata(
            bookID: bookID,
            title: "Recovery contract",
            subtitle: nil,
            description: nil,
            language: nil,
            createdAt: nil,
            updatedAt: nil,
            publicationDate: nil,
            authors: nil,
            narrators: nil,
            creators: nil,
            series: nil,
            tags: nil,
            collections: nil,
            ebook: nil,
            audiobook: nil,
            readaloud: nil,
            status: nil,
            position: nil,
            rating: nil,
        ),
        category: .ebook,
        localMediaPath: nil,
        settings: settings,
        audioPositionAccess: audioPositionAccess,
    )
}

private actor SessionPlaybackStateBox {
    let bookID: BookID
    var isPlaying: Bool

    init(bookID: BookID, isPlaying: Bool) {
        self.bookID = bookID
        self.isPlaying = isPlaying
    }

    func currentState() -> SMILPlaybackState {
        playbackState(bookID: bookID, isPlaying: isPlaying)
    }

    func setIsPlaying(_ isPlaying: Bool) {
        self.isPlaying = isPlaying
    }
}

private func audioAccess(
    bookID: BookID,
    playbackState: SessionPlaybackStateBox,
) -> ReadingSessionAudioPositionAccess {
    ReadingSessionAudioPositionAccess(
        currentState: { await playbackState.currentState() },
        loadedBookID: { bookID },
        reconcilePositionFromPlayer: {},
        backgroundSyncData: { audioSyncData() },
    )
}

@StorytellerUIActor
private func playingAudioAccess(bookID: BookID) -> ReadingSessionAudioPositionAccess {
    ReadingSessionAudioPositionAccess(
        currentState: { playingState(bookID: bookID) },
        loadedBookID: { bookID },
        reconcilePositionFromPlayer: {},
        backgroundSyncData: { audioSyncData() },
    )
}

private func playingState(bookID: BookID) -> SMILPlaybackState {
    playbackState(bookID: bookID, isPlaying: true)
}

private func playbackState(bookID: BookID, isPlaying: Bool) -> SMILPlaybackState {
    SMILPlaybackState(
        isPlaying: isPlaying,
        currentSectionIndex: 0,
        currentEntryIndex: 0,
        currentFragment: "sentence",
        chapterLabel: "Chapter",
        chapterElapsed: 1,
        chapterTotal: 10,
        bookElapsed: 1,
        bookTotal: 10,
        playbackRate: 1,
        volume: 1,
        bookID: bookID,
    )
}

private func audioSyncData() -> AudioPositionSyncData {
    AudioPositionSyncData(
        sectionIndex: 0,
        entryIndex: 0,
        currentTime: 1,
        audioFile: "audio.mp3",
        href: "chapter.xhtml",
        fragment: "sentence",
    )
}

#if os(iOS) || os(macOS)
@MainActor
private func makeRecoveryManager(state: RecoveryStateBox) -> WebViewRecoveryManager {
    WebViewRecoveryManager(
        stateAccess: WebViewRecoveryStateAccess(
            snapshot: {
                WebViewRecoveryStateAccess.Snapshot(
                    chapterID: state.chapterID,
                    fraction: state.fraction,
                    extractedEbookPath: state.extractedEbookPath,
                )
            },
            setExtractedEbookPath: { state.extractedEbookPath = $0 },
            sectionCount: { state.sectionCount },
        )
    )
}
#endif

@StorytellerUIActor
private func emptyAudioAccess() -> ReadingSessionAudioPositionAccess {
    ReadingSessionAudioPositionAccess(
        currentState: { nil },
        loadedBookID: { nil },
        reconcilePositionFromPlayer: {},
        backgroundSyncData: { nil },
    )
}

@StorytellerUIActor
private func makeMediaOverlayManager(
    evaluator: SessionRecordingJSEvaluator
) -> (manager: MediaOverlayManager, bridge: ReaderCommsBridge) {
    let entry = SMILEntry(
        textId: "sentence",
        textHref: "chapter.xhtml",
        audioFile: "audio.mp3",
        begin: 0,
        end: 0.12,
        cumSumAtEnd: 0.12,
    )
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = MediaOverlayManager(
        bookStructure: [
            SectionInfo(
                index: 0,
                id: "chapter.xhtml",
                label: "Chapter",
                level: 1,
                mediaOverlay: [entry],
            )
        ],
        bookID: BookID(sourceID: "test-source", uuid: UUID().uuidString),
        bridge: bridge,
        settingsVM: HeadlessReaderSettings(),
        reloadBookIntoActor: {},
    )
    return (manager, bridge)
}

@StorytellerUIActor
private func scheduleDelayedPageFlip(in manager: MediaOverlayManager) {
    manager.applyLiveSyncAdvancement(
        sectionIndex: 0,
        entryIndex: 0,
        textId: "sentence",
        remoteRate: 1,
    )
    manager.handleElementVisibility(
        ElementVisibilityMessage(
            textId: "sentence",
            visibleRatio: 0.99,
            offScreenRatio: 0.01,
        )
    )
}

@StorytellerUIActor
private func waitForScript(
    containing fragment: String,
    in evaluator: SessionRecordingJSEvaluator,
) async throws {
    for _ in 0..<100 where !evaluator.scripts.contains(where: { $0.contains(fragment) }) {
        try await Task.sleep(for: .milliseconds(50))
    }
    guard evaluator.scripts.contains(where: { $0.contains(fragment) }) else {
        throw ReaderRecoveryWaitTimeout(
            expectation:
                "JavaScript command containing '\(fragment)' (received: \(evaluator.scripts))"
        )
    }
}

#if os(iOS) || os(macOS)
@MainActor
private func waitForRecoveryToComplete(
    _ manager: WebViewRecoveryManager
) async throws {
    for _ in 0..<100 where manager.isInRecovery {
        try await Task.sleep(for: .milliseconds(50))
    }
    guard !manager.isInRecovery else {
        throw ReaderRecoveryWaitTimeout(expectation: "webview recovery completion")
    }
}
#endif

@StorytellerUIActor
private func waitForRTLStructure(in manager: EphemeralProgressManager) async throws {
    for _ in 0..<100
    where !manager.isRTLPageProgression || manager.bookStructure.count != 3
    {
        try await Task.sleep(for: .milliseconds(50))
    }
    guard manager.isRTLPageProgression, manager.bookStructure.count == 3 else {
        throw ReaderRecoveryWaitTimeout(
            expectation: "three-section RTL book structure"
        )
    }
}
