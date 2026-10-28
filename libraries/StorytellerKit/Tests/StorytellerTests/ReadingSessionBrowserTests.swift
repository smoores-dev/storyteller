#if os(macOS)
import Foundation
import Testing

@testable import StorytellerKit

/// Real ReadingSession, engine timer, both bridge endpoints and paginator.
/// Only the audio clock and progress storage are fakes. Opt in after installing
/// the browser-test dependencies: STORYTELLER_READER_BROWSER_TESTS=1 swift test
/// --filter ReadingSessionBrowserTests.
@StorytellerUIActor
@Suite(
    "Reading session in a real browser",
    .serialized,
    .enabled(if: ProcessInfo.processInfo.environment["STORYTELLER_READER_BROWSER_TESTS"] == "1"),
)
struct ReadingSessionBrowserTests {
    @Test(arguments: ["webkit", "chromium"], [false, true])
    func manualPageTurnsSelectTheFirstWholeSentence(browser: String, playing: Bool) async throws {
        let h = try await ProtocolTestSession.make(audio: true, audioEntries: pageTurnEntries())
        let reader = try SessionBrowser(browser: browser, fixture: "page-turns")
        defer {
            reader.close()
            Task { await h.close() }
        }
        try await reader.waitUntil("browser loads") { reader.ready }
        let bridge = ReaderBridge(js: reader)
        reader.bridge = bridge
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced(reason: "browser setup") == .synced)
        await h.session.installPlaybackObservation()
        if playing { try await h.session.play() }

        var page = try #require(h.session.readerLocation?.pageIndex)
        var sawLeadingSplitSentence = false
        // Visit several pages, then turn back repeatedly. A newly selected
        // sentence must belong fully to the destination, not the previous page.
        for direction in [1, 1, 1, -1, -1, -1, 1, -1] {
            page += direction
            if direction > 0 { h.session.turnPageRight() } else { h.session.turnPageLeft() }
            try await reader.waitUntil("manual turn completes on page \(page)") {
                h.session.readerLocation?.pageIndex == page && h.session.navigation.pending == nil
                    && h.session.navigation.syncTask == nil
            }
            let expected = try await reader.firstWholeSentence()
            let snapshot = try await bridge.readingSnapshot()
            if snapshot.visibleIDs?.first != expected { sawLeadingSplitSentence = true }
            #expect(await h.engine.getBackgroundSyncData()?.fragment == expected)
            #expect(h.session.playback.accepted?.locations?.fragments == [expected])
            #expect(await h.engine.getCurrentState()?.isPlaying == playing)
            if playing { #expect(try await reader.highlightedID() == expected) }
        }
        #expect(sawLeadingSplitSentence)
        #expect(reader.errors.isEmpty)
        await h.close()
    }

    private func pageTurnEntries() -> [SMILEntry] {
        (0..<120).map { (index: Int) -> SMILEntry in
            let begin = Double(index) * 10
            return SMILEntry(
                textId: "sentence-\(index)",
                textHref: "chapter-0.xhtml",
                audioFile: "audio",
                begin: begin,
                end: begin + 10,
                cumSumAtEnd: begin + 10,
            )
        }
    }

    @Test(arguments: [false, true])
    func physicalSwipesCommitOnlyChangedPagesAndPreserveVisibleAudio(playing: Bool) async throws {
        let h = try await ProtocolTestSession.make(audio: true, audioEntries: pageTurnEntries())
        let reader = try SessionBrowser(browser: "chromium", fixture: "page-turns")
        defer {
            reader.close()
            Task { await h.close() }
        }
        try await reader.waitUntil("browser loads") { reader.ready }
        let bridge = ReaderBridge(js: reader)
        reader.bridge = bridge
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced(reason: "browser setup") == .synced)
        await h.session.installPlaybackObservation()
        if playing { try await h.session.play() }
        try await h.engine.seek(to: 41)
        await h.session.acceptAudioPosition()
        #expect(await h.session.ensureSynced(reason: "split sentence setup") == .synced)
        try await reader.waitUntil("session idle before swiping") {
            h.session.navigation.syncTask == nil
        }

        let initialSeeks = await h.factory.player.seeks.count
        let initialWrites = await h.progress.writes.count
        var navigations = 0
        h.session.onUserNavigation = { navigations += 1 }
        var page = try #require(h.session.readerLocation?.pageIndex)
        var committed = 0
        // Sentence 4 straddles pages 1 and 2. Both a snap back and a completed
        // swipe to its other half must preserve the exact audio time.
        for (direction, canceled) in [
            (1, true), (1, false), (-1, true), (-1, false), (1, false),
        ] {
            if !canceled {
                page += direction
                committed += 1
            }
            try await reader.swipe(direction, canceled: canceled)
            try await reader.waitUntil("physical swipe settles on page \(page)") {
                let snapshot = try await bridge.readingSnapshot()
                return snapshot.gesture == nil && h.session.readerLocation?.pageIndex == page
                    && h.session.navigation.syncTask == nil
            }
            #expect(navigations == committed)
            #expect(try await reader.visibleArea("sentence-4") > 0)
            #expect(await h.engine.getBackgroundSyncData()?.fragment == "sentence-4")
            #expect(await h.factory.player.currentTime == 41)
            #expect(await h.factory.player.seeks.count == initialSeeks)
            #expect(await h.progress.writes.count == initialWrites)
            #expect(await h.engine.getCurrentState()?.isPlaying == playing)
        }

        // Once the playhead leaves the viewport, choose a fully visible sentence.
        // Subsequent backwards swipes must not stick to a leading split fragment.
        for direction in [1, -1, -1] {
            page += direction
            try await reader.swipe(direction)
            try await reader.waitUntil("swipe selects a new position on page \(page)") {
                let snapshot = try await bridge.readingSnapshot()
                return snapshot.gesture == nil && h.session.readerLocation?.pageIndex == page
                    && h.session.navigation.syncTask == nil
            }
            let expected = try await reader.firstWholeSentence()
            #expect(await h.engine.getBackgroundSyncData()?.fragment == expected)
            #expect(h.session.playback.accepted?.locations?.fragments == [expected])
            #expect(await h.engine.getCurrentState()?.isPlaying == playing)
            if playing { #expect(try await reader.highlightedID() == expected) }
        }

        h.settings.freeBrowseMode = "always"
        let seeks = await h.factory.player.seeks.count
        let writes = await h.progress.writes.count
        let fragment = await h.engine.getBackgroundSyncData()?.fragment
        try await reader.swipe(1)
        try await reader.waitUntil("free browse swipe settles") {
            let snapshot = try await bridge.readingSnapshot()
            return snapshot.gesture == nil && h.session.isBrowsing
                && h.session.navigation.syncTask == nil
        }
        #expect(await h.factory.player.seeks.count == seeks)
        #expect(await h.progress.writes.count == writes)
        #expect(await h.engine.getBackgroundSyncData()?.fragment == fragment)
        #expect(await h.engine.getCurrentState()?.isPlaying == playing)
        #expect(reader.errors.isEmpty)
        await h.close()
    }

    @Test(arguments: [false, true])
    func overlappingTouchesKeepTheWholeGestureDestination(playing: Bool) async throws {
        let h = try await ProtocolTestSession.make(audio: true, audioEntries: pageTurnEntries())
        let reader = try SessionBrowser(browser: "chromium", fixture: "page-turns")
        defer {
            reader.close()
            Task { await h.close() }
        }
        try await reader.waitUntil("browser loads") { reader.ready }
        let bridge = ReaderBridge(js: reader)
        reader.bridge = bridge
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced(reason: "browser setup") == .synced)
        await h.session.installPlaybackObservation()
        if playing { try await h.session.play() }
        var navigations = 0
        h.session.onUserNavigation = { navigations += 1 }
        var page = try #require(h.session.readerLocation?.pageIndex)
        for gap in [0, 30, 80, 150] {
            let before = navigations
            page += 1
            try await reader.swipe(1, repeatAfterMilliseconds: gap)
            try await reader.waitUntil("overlapping touches commit page \(page)") {
                let snapshot = try await bridge.readingSnapshot()
                return snapshot.gesture == nil && snapshot.location?.pageIndex == page
                    && h.session.navigation.syncTask == nil
            }
            let expected = try await reader.firstWholeSentence()
            #expect(navigations == before + 1)
            #expect(await h.engine.getBackgroundSyncData()?.fragment == expected)
            #expect(h.session.playback.accepted?.locations?.fragments == [expected])
            #expect(await h.progress.writes.last?.0.locations?.fragments == [expected])
            #expect(await h.engine.getCurrentState()?.isPlaying == playing)
        }
        #expect(reader.errors.isEmpty)
        await h.close()
    }

    @Test(arguments: ["webkit", "chromium"])
    func verticalTextNavigationDoesNotRequireSplitTimingGeometry(browser: String) async throws {
        let h = try await ProtocolTestSession.make(audio: true, audioEntries: pageTurnEntries())
        let reader = try SessionBrowser(browser: browser, fixture: "vertical")
        defer {
            reader.close()
            Task { await h.close() }
        }
        try await reader.waitUntil("browser loads") { reader.ready }
        let bridge = ReaderBridge(js: reader)
        reader.bridge = bridge
        h.session.attachBridge(bridge)
        h.session.scheduleReconciliation(reason: "browser setup")
        try await reader.waitUntil("vertical reader restores its visible playhead") {
            let snapshot = try await bridge.readingSnapshot()
            return h.session.navigation.snapshot?.documentID == snapshot.documentID
                && h.session.lastSyncResult == .synced && h.session.navigation.syncTask == nil
        }
        var selectedNewSentence = false
        for _ in 0..<2 {
            let page = try #require(h.session.readerLocation?.pageIndex)
            let previous = try #require(await h.engine.getBackgroundSyncData()?.fragment)
            h.session.requestReaderNavigation(
                ReaderTarget(kind: "next", animated: false),
                reason: .userFlippedPage,
            )
            try await reader.waitUntil("vertical page turn commits its destination") {
                h.session.readerLocation?.pageIndex == page + 1
                    && h.session.navigation.pending == nil
                    && h.session.navigation.syncTask == nil
            }
            let stillVisible = try await reader.visibleArea(previous) > 0
            let expected = stillVisible ? previous : try await reader.firstWholeSentence()
            selectedNewSentence = selectedNewSentence || !stillVisible
            #expect(await h.engine.getBackgroundSyncData()?.fragment == expected)
            #expect(h.session.playback.accepted?.locations?.fragments == [expected])
            let snapshot = try await bridge.readingSnapshot(
                playhead: ReaderPlayhead(sectionIndex: 0, textId: expected)
            )
            #expect(snapshot.playhead?.visible == true)
            #expect(snapshot.playhead?.visibleRatio == nil)
            #expect(snapshot.playhead?.offScreenRatio == nil)
        }
        #expect(selectedNewSentence)
        #expect(reader.errors.isEmpty)
        await h.close()
    }

    @Test(arguments: [false, true], [false, true])
    func reflowCancelsUnfinishedInputWithoutChangingReadingPosition(audio: Bool, dragging: Bool)
        async throws
    {
        let h = try await ProtocolTestSession.make(
            audio: audio,
            freeBrowse: "always",
            audioEntries: pageTurnEntries(),
        )
        let reader = try SessionBrowser(browser: "chromium", fixture: "page-turns")
        defer {
            reader.close()
            Task { await h.close() }
        }
        try await reader.waitUntil("browser loads") { reader.ready }
        let bridge = ReaderBridge(js: reader)
        reader.bridge = bridge
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced(reason: "browser setup") == .synced)
        if audio {
            try await h.engine.seek(to: 401)
            await h.session.acceptAudioPosition()
            #expect(await h.session.ensureSynced(reason: "reflow setup") == .synced)
        } else {
            h.session.requestReaderNavigation(
                ReaderTarget(kind: "href", value: "chapter-0.xhtml#sentence-40"),
                reason: .userSelectedChapter,
            )
        }
        try await reader.waitUntil("position established before touch") {
            let visible = try await reader.visibleArea("sentence-40")
            return h.session.navigation.pending == nil && h.session.navigation.syncTask == nil
                && visible > 0
        }
        let preservedRange =
            audio
            ? """
            (() => { const r = window.reader.document().createRange();
                r.selectNodeContents(window.reader.document().getElementById('sentence-40')); \
            return r; })()
            """ : "window.reader.visibleTextRange()"
        _ = try await reader.evaluate("window.preservedRange = \(preservedRange); null")
        let before = try await bridge.readingSnapshot()
        let position = h.session.playback.accepted
        let writes = await h.progress.writes.count
        var navigations = 0
        h.session.onUserNavigation = { navigations += 1 }
        try await reader.resizeWhileTouching(height: 480, dragging: dragging)
        try await reader.waitUntil("reflow and touch finish") {
            let snapshot = try await bridge.readingSnapshot()
            return snapshot.gesture == nil && h.session.navigation.syncTask == nil
        }
        let after = try await bridge.readingSnapshot()
        #expect(after.location?.pageIndex != before.location?.pageIndex)
        let remainingArea =
            Double(
                try await reader.evaluate(
                    "String(window.reader.geometry(window.preservedRange).visibleArea)"
                ) ?? ""
            ) ?? 0
        #expect(remainingArea > 0)
        #expect(navigations == 0)
        #expect(!h.session.isBrowsing)
        #expect(h.session.playback.accepted == position)
        #expect(await h.progress.writes.count == writes)
        #expect(reader.errors.isEmpty)
        await h.close()
    }

    @Test(arguments: ["webkit", "chromium"])
    func scrollingPreservesTheSentenceStillRenderedInTheMargin(browser: String) async throws {
        let h = try await ProtocolTestSession.make(audio: true, audioEntries: pageTurnEntries())
        let reader = try SessionBrowser(browser: browser, fixture: "page-turns")
        defer {
            reader.close()
            Task { await h.close() }
        }
        try await reader.waitUntil("browser loads") { reader.ready }
        let bridge = ReaderBridge(js: reader)
        reader.bridge = bridge
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced(reason: "browser setup") == .synced)
        _ = try await reader.evaluate("window.reader.scrollingMode()")
        try await h.engine.seek(to: 51)
        await h.session.acceptAudioPosition()
        #expect(await h.session.ensureSynced(reason: "scroll setup") == .synced)
        let seeks = await h.factory.player.seeks.count
        try await reader.wheel(800)
        try await reader.waitUntil("first scroll completes") {
            let snapshot = try await bridge.readingSnapshot()
            return snapshot.gesture == nil && h.session.navigation.syncTask == nil
        }
        #expect(try await reader.visibleArea("sentence-5") > 0)
        #expect(await h.factory.player.currentTime == 51)
        #expect(await h.factory.player.seeks.count == seeks)
        try await reader.wheel(400)
        try await reader.waitUntil("scroll beyond the current sentence completes") {
            let snapshot = try await bridge.readingSnapshot()
            let seekCount = await h.factory.player.seeks.count
            return snapshot.gesture == nil && h.session.navigation.syncTask == nil
                && seekCount > seeks
        }
        #expect(try await reader.visibleArea("sentence-5") == 0)
        let expected = try #require(
            try await reader.evaluate(
                """
                Array.from(window.reader.document().querySelectorAll('[id^="sentence-"]'))
                    .find(el => window.reader.measure(el.id).visibleArea > 0)?.id
                """
            )
        )
        #expect(await h.engine.getBackgroundSyncData()?.fragment == expected)
        #expect(h.session.playback.accepted?.locations?.fragments == [expected])
        #expect(reader.errors.isEmpty)
        await h.close()
    }

    @Test(arguments: ["webkit", "chromium"])
    func splitSentenceTurnsTheRealPageAndContinuesHighlighting(browser: String) async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        let reader = try SessionBrowser(browser: browser)
        defer { reader.close() }
        try await reader.waitUntil("browser loads") { reader.ready }
        let bridge = ReaderBridge(js: reader)
        reader.bridge = bridge
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced(reason: "browser setup") == .synced)
        let anchor = ReaderPlayhead(sectionIndex: 0, textId: "s0")
        let before = try await bridge.readingSnapshot(playhead: anchor)
        #expect(before.playhead?.visible == true)
        #expect(try #require(before.playhead?.offScreenRatio) >= 0.9)
        let page = try #require(before.location?.pageIndex)
        let seeks = await h.factory.player.seeks.count

        await h.session.installPlaybackObservation()
        await h.progress.holdSaves()
        await h.factory.player.advance(to: 1)
        try await h.engine.play()
        try await reader.waitUntil("split turn queued during a progress save") {
            h.session.navigation.pending?.target.kind == "next"
        }
        #expect(await h.progress.savesWaiting > 0)
        await h.progress.releaseSaves()
        try await reader.waitUntil("page turns during the split sentence") {
            try await bridge.readingSnapshot(playhead: anchor).location?.pageIndex == page + 1
        }
        #expect(try await reader.highlightedID() == "s0")
        #expect(try await reader.visibleArea("s0") > 0)

        // The real engine timer publishes the next sentence. No manual sync,
        // page turn or pause can rescue the frozen reader here.
        await h.factory.player.advance(to: 11)
        try await reader.waitUntil("highlight follows the next sentence") {
            guard try await reader.highlightedID() == "s1" else { return false }
            return try await reader.visibleArea("s1") > 0
        }
        #expect(try await reader.visibleArea("s1") > 0)
        #expect(await h.factory.player.seeks.count == seeks)
        #expect(reader.errors.isEmpty)
        await h.close()
    }
}

@StorytellerUIActor
private final class SessionBrowser: JSEvaluating {
    private let process = Process()
    private let input = Pipe()
    private let output = Pipe()
    private var buffer = Data()
    private var pending: [String: CheckedContinuation<String?, Error>] = [:]
    private(set) var ready = false
    private(set) var errors: [String] = []
    weak var bridge: ReaderBridge?

    init(browser: String, fixture: String = "split-sentence") throws {
        let script = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Browser/session-bridge.mjs")
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", script.path, browser, fixture]
        process.standardInput = input
        process.standardOutput = output
        process.standardError = FileHandle.standardError
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            Task { @StorytellerUIActor [weak self] in self?.receive(data) }
        }
        try process.run()
    }

    func evaluate(_ script: String) async throws -> String? {
        try await request(["script": script])
    }

    func swipe(_ direction: Int, canceled: Bool = false, repeatAfterMilliseconds: Int? = nil)
        async throws
    {
        var input = ["swipe": String(direction), "canceled": String(canceled)]
        if let repeatAfterMilliseconds { input["repeatAfter"] = String(repeatAfterMilliseconds) }
        _ = try await request(input)
    }

    func resizeWhileTouching(height: Int, dragging: Bool) async throws {
        _ = try await request(["resizeHeld": String(height), "dragBeforeResize": String(dragging)])
    }
    func wheel(_ pixels: Int) async throws { _ = try await request(["wheel": String(pixels)]) }

    private func request(_ values: [String: String]) async throws -> String? {
        let id = UUID().uuidString
        let data =
            try JSONEncoder().encode(values.merging(["id": id]) { _, value in value }) + Data([10])
        return try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            do { try input.fileHandleForWriting.write(contentsOf: data) } catch {
                pending.removeValue(forKey: id)?.resume(throwing: error)
            }
        }
    }

    private func receive(_ data: Data) {
        guard !data.isEmpty else {
            for continuation in pending.values {
                continuation.resume(throwing: ReaderBridgeError.jsNotAvailable)
            }
            pending.removeAll()
            return
        }
        buffer.append(data)
        while let newline = buffer.firstIndex(of: 10) {
            let line = buffer.subdata(in: buffer.startIndex..<newline)
            buffer.removeSubrange(buffer.startIndex...newline)
            guard let message = try? JSONSerialization.jsonObject(with: line) as? [String: Any]
            else { continue }
            if message["ready"] as? Bool == true { ready = true }
            if let state = message["state"],
                let data = try? JSONSerialization.data(withJSONObject: state),
                let snapshot = try? JSONDecoder().decode(ReaderSnapshot.self, from: data)
            {
                bridge?.onReadingState?(snapshot)
            }
            if let error = message["error"] as? String { errors.append(error) }
            if let id = message["id"] as? String, let continuation = pending.removeValue(forKey: id)
            {
                if let error = message["error"] as? String {
                    continuation.resume(
                        throwing: NSError(
                            domain: "SessionBrowser",
                            code: 1,
                            userInfo: [NSLocalizedDescriptionKey: error],
                        )
                    )
                } else {
                    continuation.resume(returning: message["result"] as? String)
                }
            }
        }
    }

    func highlightedID() async throws -> String? {
        try await evaluate(
            "window.reader.document().querySelector('.epub-media-overlay-active')?.id"
        )
    }

    func firstWholeSentence() async throws -> String {
        // Independent oracle: measure actual text glyphs rather than trusting
        // the list of fully visible IDs returned by the production bridge.
        try #require(
            try await evaluate(
                """
                Array.from(window.reader.document().querySelectorAll('[id^="sentence-"]'))
                    .find(el => window.reader.measure(el.id).ratio > 0.999)?.id
                """
            )
        )
    }

    func visibleArea(_ id: String) async throws -> Double {
        let argument = String(decoding: try JSONEncoder().encode(id), as: UTF8.self)
        return Double(
            try await evaluate("String(window.reader.measure(\(argument)).visibleArea)") ?? ""
        ) ?? 0
    }

    func waitUntil(_ description: String, condition: () async throws -> Bool) async throws {
        let deadline = Date().addingTimeInterval(8)
        while !(try await condition()) {
            guard Date() < deadline, process.isRunning else {
                throw NSError(
                    domain: "SessionBrowser",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Timed out: \(description); \(errors)"],
                )
            }
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    func close() {
        try? input.fileHandleForWriting.close()
        output.fileHandleForReading.readabilityHandler = nil
        for continuation in pending.values {
            continuation.resume(throwing: ReaderBridgeError.jsNotAvailable)
        }
        pending.removeAll()
    }
}
#endif
