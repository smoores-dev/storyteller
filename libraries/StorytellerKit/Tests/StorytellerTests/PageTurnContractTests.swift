import Foundation
import Testing

@testable import StorytellerKit

@StorytellerUIActor
private final class RecordingJSEvaluator: JSEvaluating {
    var scripts: [String] = []

    func evaluate(_ script: String) async throws -> String? {
        scripts.append(script)
        return nil
    }
}

@StorytellerUIActor
private final class ControllableJSEvaluator: JSEvaluating {
    var scripts: [String] = []
    var failsEvaluation = true

    func evaluate(_ script: String) async throws -> String? {
        scripts.append(script)
        if failsEvaluation {
            throw TestJSError.evaluationFailed
        }
        return nil
    }
}

private enum TestJSError: Error {
    case evaluationFailed
}

private struct TestWaitTimeout: Error, CustomStringConvertible {
    let expectation: String

    var description: String {
        "Timed out waiting for \(expectation)"
    }
}

@StorytellerUIActor
@Test func interruptedBoundaryPageTurnDoesNotBlockLaterCommands() async throws {
    let evaluator = RecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = EphemeralProgressManager(
        bridge: bridge,
        settingsVM: HeadlessReaderSettings(),
    )
    manager.bookStructure = [
        SectionInfo(index: 0, id: "one", label: nil, level: nil, mediaOverlay: []),
        SectionInfo(index: 1, id: "two", label: nil, level: nil, mediaOverlay: []),
    ]
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 1
    manager.chapterTotalPages = 3

    manager.handleUserNavLeft()
    try await waitForScripts(1, in: evaluator)

    let interruptedID = try #require(commandID(from: evaluator.scripts[0]))
    manager.handlePageTurnSettled(
        try settlement(commandID: interruptedID, status: "interrupted")
    )

    manager.handleUserNavRight()
    try await waitForScripts(2, in: evaluator)
    #expect(evaluator.scripts[1].contains("goRight"))

    let activeID = try #require(commandID(from: evaluator.scripts[1]))
    manager.handlePageTurnSettled(
        try settlement(commandID: interruptedID, status: "completed")
    )
    manager.handleUserNavRight()
    try await Task.sleep(for: .milliseconds(50))
    #expect(evaluator.scripts.count == 2)

    manager.handlePageTurnSettled(
        try settlement(commandID: activeID, status: "rejected")
    )
    manager.handleUserNavRight()
    try await waitForScripts(3, in: evaluator)
}

@StorytellerUIActor
@Test func replacingBridgeDropsOrphanedPageTurnCommand() async throws {
    let firstEvaluator = RecordingJSEvaluator()
    let firstBridge = ReaderCommsBridge(js: firstEvaluator)
    let manager = makeBoundaryManager(bridge: firstBridge)
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 2

    manager.handleUserNavRight()
    try await waitForScripts(1, in: firstEvaluator)

    let replacementEvaluator = RecordingJSEvaluator()
    let replacementBridge = ReaderCommsBridge(js: replacementEvaluator)
    manager.rebindBridge(replacementBridge)
    manager.handleUserNavLeft()
    try await waitForScripts(1, in: replacementEvaluator)

    #expect(replacementEvaluator.scripts.first?.contains("goLeft") == true)
}

@StorytellerUIActor
@Test func completedPageTurnBeforeRelocationDoesNotBlockLaterCommands() async throws {
    let evaluator = RecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = makeBoundaryManager(bridge: bridge)
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 1

    manager.handleUserNavRight()
    try await waitForScripts(1, in: evaluator)

    let issuedID = try #require(commandID(from: evaluator.scripts[0]))
    manager.handlePageTurnSettled(
        try settlement(commandID: issuedID, status: "completed")
    )
    bridge.sendSwiftRelocated(relocation(section: 1, page: 2))
    try await waitForCurrentPage(2, in: manager)

    manager.handleUserNavLeft()
    try await waitForScripts(2, in: evaluator)
    #expect(evaluator.scripts[1].contains("goLeft"))
}

@StorytellerUIActor
@Test func evaluatorFailureDoesNotLeavePageTurnCommandPending() async throws {
    let evaluator = ControllableJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = makeBoundaryManager(bridge: bridge)
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 2

    manager.handleUserNavRight()
    try await waitForScripts(1, in: evaluator)

    evaluator.failsEvaluation = false
    manager.handleUserNavLeft()
    try await waitForScripts(2, in: evaluator)
    #expect(evaluator.scripts[1].contains("goLeft"))
}

@StorytellerUIActor
@Test func swipeSupersedesPendingPageTurnCommand() async throws {
    let evaluator = RecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = makeBoundaryManager(bridge: bridge)
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 1

    manager.handleUserNavRight()
    try await waitForScripts(1, in: evaluator)
    let supersededID = try #require(commandID(from: evaluator.scripts[0]))

    manager.handleUserNavSwipeDetected(
        PageFlippedMessage(direction: "right", fromPage: 1, toPage: 2, delta: 1)
    )

    manager.handleUserNavLeft()
    try await waitForScripts(2, in: evaluator)
    #expect(evaluator.scripts[1].contains("goLeft"))
    let replacementID = try #require(commandID(from: evaluator.scripts[1]))

    manager.handlePageTurnSettled(
        try settlement(commandID: supersededID, status: "rejected")
    )

    manager.handleUserNavRight()
    try await Task.sleep(for: .milliseconds(50))
    #expect(evaluator.scripts.count == 2)

    manager.handlePageTurnSettled(
        try settlement(commandID: replacementID, status: "rejected")
    )
    manager.handleUserNavRight()
    try await waitForScripts(3, in: evaluator)
}

@StorytellerUIActor
@Test func routedSettlementReachesReadingSessionProgressManager() async throws {
    let evaluator = RecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let session = makeReadingSession()
    session.attachBridge(bridge, isRecovery: false)
    let manager = try #require(session.progressManager)
    manager.bookStructure = makeBoundarySections()
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 2
    manager.chapterTotalPages = 3

    manager.handleUserNavRight()
    try await waitForScripts(1, in: evaluator)
    let issuedID = try #require(commandID(from: evaluator.scripts[0]))

    let router = ReaderMessageRouter(bridge: bridge)
    #expect(
        router.route(
            name: "PageTurnSettled",
            body: ["commandId": issuedID, "status": "rejected"],
        )
    )
    try await Task.sleep(for: .milliseconds(50))

    manager.handleUserNavLeft()
    try await waitForScripts(2, in: evaluator)
    #expect(evaluator.scripts[1].contains("goLeft"))

    await session.close(.endSession)
}

@StorytellerUIActor
@Test func pageTurnWithoutPageMetadataStillReachesJavaScript() async throws {
    let evaluator = RecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = EphemeralProgressManager(
        bridge: bridge,
        settingsVM: HeadlessReaderSettings(),
    )

    manager.handleUserNavRight()
    try await waitForScripts(1, in: evaluator)

    #expect(evaluator.scripts[0].contains("goRight"))
}

@StorytellerUIActor
@Test func rtlPageCommandDoesNotWedgeAtFalseChapterBoundary() async throws {
    let evaluator = RecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = makeBoundaryManager(bridge: bridge)
    manager.isRTLPageProgression = true
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 1

    manager.handleUserNavLeft()
    try await waitForScripts(1, in: evaluator)

    let firstCommandID = try #require(commandID(from: evaluator.scripts[0]))
    bridge.sendSwiftRelocated(relocation(section: 1, page: 2))
    try await waitForCurrentPage(2, in: manager)
    manager.handlePageTurnSettled(
        try settlement(commandID: firstCommandID, status: "completed")
    )

    manager.handleUserNavRight()
    try await waitForScripts(2, in: evaluator)
    #expect(evaluator.scripts[1].contains("goRight"))
}

@StorytellerUIActor
@Test func rtlForwardSwipeCrossingBoundaryTracksNextSection() async throws {
    let bridge = ReaderCommsBridge(js: RecordingJSEvaluator())
    let manager = makeBoundaryManager(bridge: bridge)
    manager.isRTLPageProgression = true
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 3

    manager.handleUserNavSwipeDetected(
        PageFlippedMessage(
            direction: "left",
            fromPage: 3,
            toPage: nil,
            delta: 1,
        )
    )
    bridge.sendSwiftRelocated(relocation(section: 0, page: 3))
    try await Task.sleep(for: .milliseconds(50))
    #expect(manager.selectedChapterId == 1)

    bridge.sendSwiftRelocated(relocation(section: 2, page: 1))

    try await waitForSelectedChapter(2, in: manager)
}

@StorytellerUIActor
@Test func rtlBackwardSwipeCrossingBoundaryTracksPreviousSection() async throws {
    let bridge = ReaderCommsBridge(js: RecordingJSEvaluator())
    let manager = makeBoundaryManager(bridge: bridge)
    manager.isRTLPageProgression = true
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 1

    manager.handleUserNavSwipeDetected(
        PageFlippedMessage(
            direction: "right",
            fromPage: 1,
            toPage: nil,
            delta: -1,
        )
    )
    bridge.sendSwiftRelocated(relocation(section: 2, page: 1))
    try await Task.sleep(for: .milliseconds(50))
    #expect(manager.selectedChapterId == 1)

    bridge.sendSwiftRelocated(relocation(section: 0, page: 3))

    try await waitForSelectedChapter(0, in: manager)
}

@StorytellerUIActor
@Test func forwardSwipeWithReportedDestinationTracksNextSection() async throws {
    let bridge = ReaderCommsBridge(js: RecordingJSEvaluator())
    let manager = makeBoundaryManager(bridge: bridge)
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 3

    manager.handleUserNavSwipeDetected(
        PageFlippedMessage(
            direction: "right",
            fromPage: 3,
            toPage: 4,
            delta: 1,
        )
    )
    bridge.sendSwiftRelocated(relocation(section: 0, page: 3))
    try await Task.sleep(for: .milliseconds(50))
    #expect(manager.selectedChapterId == 1)

    bridge.sendSwiftRelocated(relocation(section: 2, page: 1))

    try await waitForSelectedChapter(2, in: manager)
}

@StorytellerUIActor
@Test func backwardSwipeWithReportedDestinationTracksPreviousSection() async throws {
    let bridge = ReaderCommsBridge(js: RecordingJSEvaluator())
    let manager = makeBoundaryManager(bridge: bridge)
    manager.selectedChapterId = 1
    manager.chapterCurrentPage = 1

    manager.handleUserNavSwipeDetected(
        PageFlippedMessage(
            direction: "left",
            fromPage: 1,
            toPage: 0,
            delta: -1,
        )
    )
    bridge.sendSwiftRelocated(relocation(section: 2, page: 1))
    try await Task.sleep(for: .milliseconds(50))
    #expect(manager.selectedChapterId == 1)

    bridge.sendSwiftRelocated(relocation(section: 0, page: 3))

    try await waitForSelectedChapter(0, in: manager)
}

@StorytellerUIActor
@Test func forwardPageCommandSkipsNonLinearSection() async throws {
    let evaluator = RecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = makeNonLinearBoundaryManager(bridge: bridge)
    manager.selectedChapterId = 0
    manager.chapterCurrentPage = 3

    manager.handleUserNavRight()
    try await waitForScripts(1, in: evaluator)

    let activeCommandID = try #require(commandID(from: evaluator.scripts[0]))
    bridge.sendSwiftRelocated(relocation(section: 2, page: 1))
    try await waitForSelectedChapter(2, in: manager)
    manager.handlePageTurnSettled(
        try settlement(commandID: activeCommandID, status: "completed")
    )

    manager.handleUserNavRight()
    try await waitForScripts(2, in: evaluator)
}

@StorytellerUIActor
@Test func backwardPageCommandSkipsNonLinearSection() async throws {
    let evaluator = RecordingJSEvaluator()
    let bridge = ReaderCommsBridge(js: evaluator)
    let manager = makeNonLinearBoundaryManager(bridge: bridge)
    manager.selectedChapterId = 2
    manager.chapterCurrentPage = 1

    manager.handleUserNavLeft()
    try await waitForScripts(1, in: evaluator)

    let activeCommandID = try #require(commandID(from: evaluator.scripts[0]))
    bridge.sendSwiftRelocated(relocation(section: 0, page: 3))
    try await waitForSelectedChapter(0, in: manager)
    manager.handlePageTurnSettled(
        try settlement(commandID: activeCommandID, status: "completed")
    )

    manager.handleUserNavLeft()
    try await waitForScripts(2, in: evaluator)
}

@StorytellerUIActor
private func makeBoundaryManager(bridge: ReaderCommsBridge) -> EphemeralProgressManager {
    let manager = EphemeralProgressManager(
        bridge: bridge,
        settingsVM: HeadlessReaderSettings(),
    )
    manager.bookStructure = makeBoundarySections()
    manager.chapterTotalPages = 3
    return manager
}

private func makeBoundarySections() -> [SectionInfo] {
    [
        SectionInfo(index: 0, id: "one", label: nil, level: nil, mediaOverlay: []),
        SectionInfo(index: 1, id: "two", label: nil, level: nil, mediaOverlay: []),
        SectionInfo(index: 2, id: "three", label: nil, level: nil, mediaOverlay: []),
    ]
}

@StorytellerUIActor
private func makeReadingSession() -> ReadingSession {
    ReadingSession(
        metadata: BookMetadata(
            bookID: BookID(sourceID: "test-source", uuid: UUID().uuidString),
            title: "Page turn contract",
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
        settings: HeadlessReaderSettings(),
        audioPositionAccess: ReadingSessionAudioPositionAccess(
            currentState: { nil },
            loadedBookID: { nil },
            reconcilePositionFromPlayer: {},
            backgroundSyncData: { nil },
        ),
    )
}

@StorytellerUIActor
private func makeNonLinearBoundaryManager(bridge: ReaderCommsBridge) -> EphemeralProgressManager {
    let manager = EphemeralProgressManager(
        bridge: bridge,
        settingsVM: HeadlessReaderSettings(),
    )
    manager.bookStructure = [
        SectionInfo(index: 0, id: "one", label: nil, level: nil, mediaOverlay: []),
        SectionInfo(
            index: 1,
            id: "notes",
            label: nil,
            level: nil,
            linear: "no",
            mediaOverlay: [],
        ),
        SectionInfo(index: 2, id: "two", label: nil, level: nil, mediaOverlay: []),
    ]
    manager.chapterTotalPages = 3
    return manager
}

private func relocation(section: Int, page: Int) -> RelocatedMessage {
    RelocatedMessage(
        sectionIndex: section,
        pageIndex: page,
        totalPages: 3,
        href: nil,
        cfi: "epubcfi(/6/2)",
        fraction: nil,
        chapterFraction: nil,
        flow: "paginated",
        reason: "snap",
    )
}

@StorytellerUIActor
private func waitForSelectedChapter(
    _ chapter: Int,
    in manager: EphemeralProgressManager,
) async throws {
    for _ in 0..<100 where manager.selectedChapterId != chapter {
        try await Task.sleep(for: .milliseconds(50))
    }
    guard manager.selectedChapterId == chapter else {
        let lastValue = manager.selectedChapterId?.description ?? "nil"
        throw TestWaitTimeout(
            expectation: "selected chapter \(chapter) (last value: \(lastValue))"
        )
    }
}

@StorytellerUIActor
private func waitForCurrentPage(
    _ page: Int,
    in manager: EphemeralProgressManager,
) async throws {
    for _ in 0..<100 where manager.chapterCurrentPage != page {
        try await Task.sleep(for: .milliseconds(50))
    }
    guard manager.chapterCurrentPage == page else {
        let lastValue = manager.chapterCurrentPage?.description ?? "nil"
        throw TestWaitTimeout(
            expectation: "current page \(page) (last value: \(lastValue))"
        )
    }
}

private func commandID(from script: String) -> String? {
    guard let firstQuote = script.firstIndex(of: "\"") else { return nil }
    let valueStart = script.index(after: firstQuote)
    guard let secondQuote = script[valueStart...].firstIndex(of: "\"") else { return nil }
    return String(script[valueStart..<secondQuote])
}

private func settlement(commandID: String, status: String) throws -> PageTurnSettledMessage {
    let payload: [String: Any] = [
        "commandId": commandID,
        "status": status,
    ]
    let data = try JSONSerialization.data(withJSONObject: payload)
    return try JSONDecoder().decode(PageTurnSettledMessage.self, from: data)
}

@StorytellerUIActor
private func waitForScripts(
    _ count: Int,
    in evaluator: RecordingJSEvaluator,
) async throws {
    for _ in 0..<100 where evaluator.scripts.count < count {
        try await Task.sleep(for: .milliseconds(50))
    }
    guard evaluator.scripts.count >= count else {
        throw TestWaitTimeout(
            expectation: "\(count) JavaScript commands (received: \(evaluator.scripts.count))"
        )
    }
}

@StorytellerUIActor
private func waitForScripts(
    _ count: Int,
    in evaluator: ControllableJSEvaluator,
) async throws {
    for _ in 0..<100 where evaluator.scripts.count < count {
        try await Task.sleep(for: .milliseconds(50))
    }
    guard evaluator.scripts.count >= count else {
        throw TestWaitTimeout(
            expectation: "\(count) JavaScript commands (received: \(evaluator.scripts.count))"
        )
    }
}
