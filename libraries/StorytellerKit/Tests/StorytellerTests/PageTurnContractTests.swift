import Foundation
import Testing

@testable import StorytellerKit

// The old tests asserted EPM's inferred pending-page flags. The replacement
// tests drive ReadingSession with document-bound receipts and actual locations.
@StorytellerUIActor
final class ProtocolTestView: JSEvaluating {
    let documentID = UUID().uuidString
    var ready = true
    var navigationBlocked = false
    var sequence: UInt64 = 0
    var location = ReaderLocation(
        sectionIndex: 0,
        pageIndex: 1,
        totalPages: 10,
        href: "chapter-0.xhtml",
        cfi: "initial-cfi",
        fraction: 0,
        chapterFraction: 0,
        flow: "paginated",
        reason: "restore",
    )
    var receipt: ReaderReceipt?
    var gesture: ReaderGesture?
    var visibleIDs: [String]? = ["s0"]
    var fullyVisibleIDs: [String]? = ["s0"]
    var playheadVisible: Bool? = false
    var visibleRatio: Double? = nil
    var offScreenRatio: Double? = nil
    var visibilityByFragment: [String: Bool] = [:]
    var commands: [ReaderCommand] = []
    var scripts: [String] = []
    var hold = false
    var dropReply = false
    var unavailable = false
    var hangSnapshot = false
    var status = "completed"
    var completionLocation: ReaderLocation?
    private var receipts: [String: ReaderReceipt] = [:]

    func evaluate(_ script: String) async throws -> String? {
        scripts.append(script)
        if unavailable { throw ReaderBridgeError.jsNotAvailable }
        let commandPrefix = "JSON.stringify(window.foliateManager.readingCommand("
        let snapshotPrefix = "JSON.stringify(window.foliateManager.readingSnapshot("
        if script.hasPrefix(commandPrefix) {
            let json = String(script.dropFirst(commandPrefix.count).dropLast(2))
            let command = try JSONDecoder().decode(ReaderCommand.self, from: Data(json.utf8))
            guard command.documentID == documentID else { return "{\"status\":\"staleDocument\"}" }
            if let old = receipts[command.id] {
                receipt = old
            } else {
                commands.append(command)
                receipt = ReaderReceipt(
                    id: command.id,
                    status: "running",
                    location: nil,
                    error: nil,
                )
                receipts[command.id] = receipt
                if !hold { complete() }
            }
            if dropReply {
                dropReply = false
                throw ReaderBridgeError.jsNotAvailable
            }
            return "{}"
        }
        if script.hasPrefix("JSON.stringify(window.foliateManager.presentReading(") {
            return "true"
        }
        if script.hasPrefix(snapshotPrefix) {
            if hangSnapshot { try await Task.sleep(for: .seconds(10)) }
            let json = String(script.dropFirst(snapshotPrefix.count).dropLast(2))
            let anchor = try JSONDecoder().decode(ReaderPlayhead?.self, from: Data(json.utf8))
            return String(decoding: try JSONEncoder().encode(snapshot(anchor)), as: UTF8.self)
        }
        let ackPrefix = "window.foliateManager.acknowledgeReading("
        if script.hasPrefix(ackPrefix) {
            let json = "[" + String(script.dropFirst(ackPrefix.count).dropLast()) + "]"
            let args = try JSONDecoder().decode([String?].self, from: Data(json.utf8))
            if args[0] == documentID {
                if args[1] == receipt?.id { receipt = nil }
                if args[2] == gesture?.id { gesture = nil }
            }
        }
        return nil
    }
    func snapshot(_ anchor: ReaderPlayhead? = nil) -> ReaderSnapshot {
        var anchor = anchor
        if let id = anchor?.textId { anchor?.visible = visibilityByFragment[id] ?? playheadVisible }
        anchor?.visibleRatio = visibleRatio
        anchor?.offScreenRatio = offScreenRatio
        return ReaderSnapshot(
            documentID: documentID,
            ready: ready,
            sequence: sequence,
            location: location,
            command: receipt,
            gesture: gesture,
            navigationBlocked: navigationBlocked,
            visibleIDs: visibleIDs,
            fullyVisibleIDs: fullyVisibleIDs,
            playhead: anchor,
        )
    }
    func complete() {
        guard let command = commands.last else { return }
        if status == "completed" {
            if let completionLocation {
                location = completionLocation
            } else {
                switch command.kind {
                    case "right", "next":
                        location.pageIndex = (location.pageIndex ?? 1) + 1
                        location.cfi = "page-\(location.pageIndex!)"
                        visibleRatio = 1
                        offScreenRatio = 0
                    case "left":
                        location.pageIndex = max(1, (location.pageIndex ?? 2) - 1)
                        location.cfi = "page-\(location.pageIndex!)"
                    case "cfi": location.cfi = command.value
                    case "section":
                        location.sectionIndex = command.sectionIndex
                        location.href = "chapter-\(command.sectionIndex ?? 0).xhtml"
                    case "anchor":
                        location.sectionIndex = command.sectionIndex
                        location.href = "chapter-\(command.sectionIndex ?? 0).xhtml"
                        location.cfi = command.textId
                        visibleIDs = command.textId.map { [$0] }
                        fullyVisibleIDs = visibleIDs
                        playheadVisible = true
                    case "href": location.href = command.value?.components(separatedBy: "#").first
                    default: break
                }
            }
        }
        sequence += 1
        receipt = ReaderReceipt(
            id: command.id,
            status: status,
            location: location,
            error: status == "failed" ? "No target" : nil,
        )
        receipts[command.id] = receipt
    }
    func userGesture(at destination: ReaderLocation, active: Bool = false) {
        sequence += 1
        location = destination
        gesture = ReaderGesture(
            id: "gesture-\(sequence)",
            active: active,
            moved: true,
            location: destination,
        )
        if let pending = receipt, pending.status == "running" {
            receipt = ReaderReceipt(
                id: pending.id,
                status: "interrupted",
                location: destination,
                error: nil,
            )
            receipts[pending.id] = receipt
        }
    }
}

actor ProtocolTestProgress {
    var stored: BookProgress?
    var writes: [(BookLocator, Double)] = []
    var uploadSaveCounts: [Int] = []
    var failRead = false
    var failSave = false
    private var heldSaves: [CheckedContinuation<Void, Never>]?
    var savesWaiting: Int { heldSaves?.count ?? 0 }
    func read() throws -> BookProgress? {
        if failRead { throw ReaderBridgeError.jsNotAvailable }
        return stored
    }
    func save(_ locator: BookLocator, _ time: Double) async -> Bool {
        if heldSaves != nil {
            await withCheckedContinuation { heldSaves?.append($0) }
        }
        if failSave { return false }
        writes.append((locator, time))
        return true
    }
    func set(_ value: BookProgress?) { stored = value }
    func uploadPending() { uploadSaveCounts.append(writes.count) }
    func setSaveFailure(_ value: Bool) { failSave = value }
    func holdSaves() { heldSaves = [] }
    func releaseSaves() {
        let waiting = heldSaves ?? []
        heldSaves = nil
        for continuation in waiting { continuation.resume() }
    }
    func setFailure(_ value: Bool) { failRead = value }
}

actor ProtocolTestAudio: AudioPlaying {
    var currentTime = 0.0
    var duration = 20.0
    var playing = false
    var rejectSeek = false
    var seeks: [Double] = []
    func load(url: URL) async throws -> TimeInterval {
        currentTime = 0
        return duration
    }
    func play() async { playing = true }
    func pause() async { playing = false }
    func stop() async { playing = false }
    func seek(to time: TimeInterval) async {
        seeks.append(time)
        if !rejectSeek { currentTime = time }
    }
    func setRate(_ rate: Double) async {}
    func setVolume(_ volume: Double) async {}
    func setEventHandler(_ handler: @escaping @Sendable (AudioPlayerEvent) -> Void) async {}
    func setReject(_ value: Bool) { rejectSeek = value }
    func advance(to time: Double) { currentTime = time }
    func setDuration(_ value: Double) { duration = value }
}
struct ProtocolTestFactory: AudioPlayerFactory {
    let player = ProtocolTestAudio()
    func makePlayer(profile: AudioPlaybackProfile) -> any AudioPlaying { player }
    func prepareSession(longForm: Bool) async throws {}
    func deactivateSession() async {}
}

@StorytellerUIActor
struct ProtocolTestSession {
    let session: ReadingSession
    let view: ProtocolTestView
    let bridge: ReaderBridge
    let progress: ProtocolTestProgress
    let settings: HeadlessReaderSettings
    let factory: ProtocolTestFactory
    let engine: PlaybackEngineActor

    static func make(
        audio: Bool = false,
        freeBrowse: String = "never",
        freshAudio: Bool = false,
        audioEntries: [SMILEntry]? = nil,
    )
        async throws -> Self
    {
        let book = BookID(sourceID: "protocol-tests", uuid: UUID().uuidString)
        let metadata = BookMetadata(
            bookID: book,
            title: "Protocol",
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
        )
        let progress = ProtocolTestProgress()
        let settings = HeadlessReaderSettings()
        settings.freeBrowseMode = freeBrowse
        let factory = ProtocolTestFactory()
        let engine = PlaybackEngineActor(factory: factory)
        let session = ReadingSession(
            metadata: metadata,
            category: audio ? .synced : .ebook,
            localMediaPath: nil,
            settings: settings,
            engine: engine,
            progressAccess: ReadingProgressAccess(
                read: { _ in try await progress.read() },
                save: { _, locator, time, _ in await progress.save(locator, time) },
                uploadPending: { await progress.uploadPending() },
            ),
        )
        let entries: [SMILEntry] =
            audioEntries ?? [
                SMILEntry(
                    textId: "s0",
                    textHref: "chapter-0.xhtml",
                    audioFile: "audio",
                    begin: 0,
                    end: 10,
                    cumSumAtEnd: 10,
                ),
                SMILEntry(
                    textId: "s1",
                    textHref: "chapter-0.xhtml",
                    audioFile: "audio",
                    begin: 10,
                    end: 20,
                    cumSumAtEnd: 20,
                ),
            ]
        session.bookStructure = [
            SectionInfo(
                index: 0,
                id: "chapter-0.xhtml",
                label: "One",
                level: nil,
                mediaOverlay: audio ? entries : [],
            ),
            SectionInfo(
                index: 1,
                id: "chapter-1.xhtml",
                label: "Unnarrated",
                level: nil,
                mediaOverlay: [],
            ),
        ]
        if audio {
            let mapped = PlaybackTimeline(sections: session.bookStructure)
            let timeline = PlaybackTimeline(
                spans: mapped.spans.map {
                    PlaybackTimeline.Span(
                        source: $0.source,
                        url: URL(fileURLWithPath: "/tmp/protocol-audio"),
                        sourceStart: $0.sourceStart,
                        sourceEnd: $0.sourceEnd,
                        bookStart: $0.bookStart,
                        alignment: $0.alignment,
                    )
                },
                chapters: mapped.chapters,
            )
            await factory.player.setDuration(timeline.duration)
            try await engine.load(
                timeline: timeline,
                bookID: book,
                sections: session.bookStructure,
            )
            try await engine.seek(to: 0)
            session.content = ReadingContent(
                text: URL(fileURLWithPath: "/tmp/protocol-text"),
                audio: timeline,
            )
            if freshAudio {
                // Exercise real initialization, including the initially paused
                // engine observer, instead of seeding the accepted position.
                try await session.establishAudioPosition()
            } else {
                await session.acceptAudioPosition()
                session.playback.acceptedAt = 1
                session.playback.savedAt = 1
            }
        }
        let view = ProtocolTestView()
        let bridge = ReaderBridge(js: view)
        session.attachBridge(bridge)
        _ = await session.ensureSynced(reason: "test setup")
        view.commands = []
        view.scripts = []
        return Self(
            session: session,
            view: view,
            bridge: bridge,
            progress: progress,
            settings: settings,
            factory: factory,
            engine: engine,
        )
    }
    func close() async { await session.close(.endSession) }
}

@StorytellerUIActor
@Suite("Session navigation receipts")
struct SessionNavigationReceiptTests {
    @Test func restoringOntoASplitSentenceAlsoSchedulesItsPageTurn() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        h.view.playheadVisible = false
        h.view.visibleRatio = 0.06
        h.view.offScreenRatio = 0.94
        try await h.engine.play()
        _ = await h.session.ensureSynced(reason: "restore split sentence")
        for _ in 0..<100 where !h.view.commands.contains(where: { $0.kind == "next" }) {
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(h.view.commands.map(\.kind) == ["anchor", "next"])
        #expect(h.view.location.pageIndex == 2)
        await h.close()
    }

    @Test func splitSentenceTurnsWhileThePreviousSyncIsSavingAndKeepsFollowing() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        // Device log: 6% of the sentence is visible, requiring an immediate turn,
        // while the sync that measured it is still saving progress (~130 ms).
        h.view.visibleRatio = 0.06
        h.view.offScreenRatio = 0.94
        await h.progress.holdSaves()
        await h.factory.player.advance(to: 1)
        try await h.engine.play()
        await h.session.acceptAudioPosition()
        let syncing = Task { await h.session.ensureSynced(reason: "split sentence regression") }
        for _ in 0..<100 where h.session.navigation.pending?.target.kind != "next" {
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(await h.progress.savesWaiting > 0)
        #expect(h.session.navigation.pending?.target.kind == "next")
        await h.progress.releaseSaves()
        _ = await syncing.value
        for _ in 0..<100 where h.view.commands.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(h.view.commands.filter { $0.kind == "next" }.count == 1)
        #expect(h.view.location.pageIndex == 2)

        // Advancing into the next sentence must update the highlight without a
        // pause, tap, or another manual ensureSynced() to unstick the session.
        await h.factory.player.advance(to: 11)
        await h.engine.reconcilePositionFromPlayer()
        let state = try #require(await h.engine.getCurrentState())
        await h.session.observedPlayback(state)
        for _ in 0..<100
        where !h.view.scripts.contains(where: {
            $0.contains("presentReading(") && $0.contains("s1")
        }) {
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(h.view.scripts.contains { $0.contains("presentReading(") && $0.contains("s1") })
        await h.close()
    }

    @Test func navigationIsNotProgressUntilItsReceiptCompletes() async throws {
        let h = try await ProtocolTestSession.make()
        h.view.hold = true
        h.session.requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        _ = await h.session.ensureSynced()
        #expect(await h.progress.writes.isEmpty)
        h.view.complete()
        #expect(await h.session.ensureSynced() == .synced)
        #expect(await h.progress.writes.count == 1)
        await h.close()
    }
    @Test func completedReceiptWaitsForLayoutBeforeChangingProgress() async throws {
        let h = try await ProtocolTestSession.make()
        h.view.hold = true
        h.session.requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        let sync = Task { await h.session.ensureSynced() }
        for _ in 0..<100 where h.view.commands.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(!h.view.commands.isEmpty)

        h.view.complete()
        h.view.navigationBlocked = true
        _ = await sync.value
        #expect(await h.progress.writes.isEmpty)
        #expect(h.view.receipt?.status == "completed")

        h.view.navigationBlocked = false
        #expect(await h.session.ensureSynced() == .synced)
        #expect(await h.progress.writes.count == 1)
        #expect(h.view.commands.filter { $0.kind == "right" }.count == 1)
        await h.close()
    }
    @Test func lostEvaluationReplyRecoversWithoutAnotherPageTurn() async throws {
        let h = try await ProtocolTestSession.make()
        h.view.dropReply = true
        h.session.requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        _ = await h.session.ensureSynced()
        _ = await h.session.ensureSynced()
        #expect(h.view.commands.filter { $0.kind == "right" }.count == 1)
        #expect(await h.progress.writes.count == 1)
        await h.close()
    }
    @Test func rejectedTurnDoesNotSaveAndDoesNotWedgeLaterCommands() async throws {
        let h = try await ProtocolTestSession.make()
        h.view.status = "rejected"
        h.session.requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        _ = await h.session.ensureSynced()
        #expect(await h.progress.writes.isEmpty)
        h.view.status = "completed"
        h.session.requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        _ = await h.session.ensureSynced()
        #expect(await h.progress.writes.count == 1)
        await h.close()
    }
    @Test func replacementDoesNotReplayAnUncertainRelativeTurn() async throws {
        let h = try await ProtocolTestSession.make()
        h.view.hold = true
        h.session.requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        _ = await h.session.ensureSynced()
        let replacement = ProtocolTestView()
        let bridge = ReaderBridge(js: replacement)
        h.session.attachBridge(bridge)
        _ = await h.session.ensureSynced()
        #expect(!replacement.commands.contains { $0.kind == "right" })
        #expect(await h.progress.writes.isEmpty)
        let revision = h.session.navigation.revision
        h.bridge.onReadingState?(h.view.snapshot())  // Late old-document callback.
        #expect(h.session.navigation.revision == revision)
        await h.close()
    }
    @Test func gestureSupersedesPendingNavigation() async throws {
        let h = try await ProtocolTestSession.make()
        h.view.hold = true
        h.session.requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        _ = await h.session.ensureSynced()
        var target = h.view.location
        target.cfi = "gesture-destination"
        h.view.userGesture(at: target)
        h.view.hold = false
        _ = await h.session.ensureSynced()
        #expect(h.session.playback.accepted?.locations?.partialCfi == "gesture-destination")
        #expect(await h.progress.writes.count == 1)
        await h.close()
    }
    @Test func receiptDestinationReplacesPageAndChapterInference() async throws {
        let h = try await ProtocolTestSession.make()
        h.view.location.pageIndex = nil
        var target = h.view.location
        target.sectionIndex = 1
        target.href = "chapter-1.xhtml"
        target.cfi = "next-section"
        h.view.completionLocation = target
        h.session.requestReaderNavigation(ReaderTarget(kind: "left"), reason: .userFlippedPage)
        _ = await h.session.ensureSynced()
        #expect(h.session.readerLocation?.sectionIndex == 1)
        #expect(h.session.playback.accepted?.href == "chapter-1.xhtml")
        await h.close()
    }
    @Test func unreadableProgressNeverRestoresZero() async throws {
        let h = try await ProtocolTestSession.make()
        h.session.playback.accepted = nil
        await h.progress.setFailure(true)
        let result = await h.session.ensureSynced()
        #expect(result != .synced)
        #expect(h.view.commands.isEmpty)
        await h.close()
    }
    @Test func failedLocalSaveRemainsDirtyAndRetriesWithoutAnotherTurn() async throws {
        let h = try await ProtocolTestSession.make()
        await h.progress.setSaveFailure(true)
        h.session.requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        #expect(await h.session.ensureSynced() != .synced)
        let id = h.view.commands.first { $0.kind == "right" }?.id
        await h.progress.setSaveFailure(false)
        #expect(await h.session.ensureSynced() == .synced)
        #expect(h.view.commands.filter { $0.id == id }.count == 1)
        #expect(await h.progress.writes.count == 1)
        await h.close()
    }
    @Test func detachingCancelsAReaderEvaluationThatNeverCompletes() async throws {
        let h = try await ProtocolTestSession.make()
        h.view.hangSnapshot = true
        let task = Task { await h.session.ensureSynced() }
        await Task.yield()
        h.session.readerUnavailable()
        let result = await task.value
        #expect(result != .synced)
        let replacement = ProtocolTestView()
        let bridge = ReaderBridge(js: replacement)
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced() == .synced)
        await h.close()
    }

}
