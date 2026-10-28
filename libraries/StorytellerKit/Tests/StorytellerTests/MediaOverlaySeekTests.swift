import Foundation
import Testing

@testable import StorytellerKit

@StorytellerUIActor
@Suite("Session reading authority")
struct SessionReadingAuthorityTests {
    @Test(arguments: [false, true])
    func manualPageTurnsPreserveTheVisiblePlayhead(playing: Bool) async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        if playing { try await h.engine.play() }
        try await h.engine.seek(to: 3)
        await h.session.acceptAudioPosition()
        _ = await h.session.saveProgressLocally(reason: .userFlippedPage)
        let seeks = await h.factory.player.seeks.count
        let writes = await h.progress.writes.count
        h.view.playheadVisible = true
        h.view.visibleIDs = ["s0", "s1"]
        h.view.fullyVisibleIDs = ["s1"]
        h.session.turnPageRight()
        #expect(await h.session.ensureSynced() == .synced)
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s0")
        #expect(await h.factory.player.currentTime == 3)
        #expect(await h.engine.getCurrentState()?.isPlaying == playing)

        // Turning back to its other half also preserves time within the sentence.
        h.view.fullyVisibleIDs = ["s0"]
        h.session.turnPageLeft()
        #expect(await h.session.ensureSynced() == .synced)
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s0")
        #expect(await h.factory.player.currentTime == 3)
        #expect(await h.factory.player.seeks.count == seeks)
        #expect(await h.progress.writes.count == writes)
        #expect(await h.engine.getCurrentState()?.isPlaying == playing)
        await h.close()
    }

    @Test func pageWithoutAWholeSentenceUsesFirstIntersectingNarratedSentence() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        h.view.playheadVisible = false
        h.view.visibleIDs = ["paragraph", "s1"]
        h.view.fullyVisibleIDs = ["unnarrated-element"]
        h.session.turnPageRight()
        #expect(await h.session.ensureSynced() == .synced)
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s1")
        await h.close()
    }

    @Test(arguments: [false, true])
    func freeBrowsePageTurnDoesNotSeekToTheFirstWholeSentence(playing: Bool) async throws {
        let h = try await ProtocolTestSession.make(audio: true, freeBrowse: "always")
        if playing { try await h.engine.play() }
        h.view.playheadVisible = false
        h.view.visibleIDs = ["s1"]
        h.view.fullyVisibleIDs = ["s1"]
        let seeks = await h.factory.player.seeks.count
        h.session.turnPageRight()
        #expect(await h.session.ensureSynced() == .synced)
        #expect(h.session.isBrowsing)
        #expect(await h.factory.player.seeks.count == seeks)
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s0")
        #expect(await h.engine.getCurrentState()?.isPlaying == playing)
        #expect(await h.progress.writes.isEmpty)
        await h.close()
    }

    @Test func pausedBrowseRejoinsAudioAfterNativePlayAndDocumentReplacement() async throws {
        let h = try await ProtocolTestSession.make(audio: true, freeBrowse: "paused")
        var browse = h.view.location
        browse.sectionIndex = 1
        browse.href = "chapter-1.xhtml"
        browse.cfi = "browse"
        h.view.userGesture(at: browse)
        _ = await h.session.ensureSynced()
        #expect(h.session.isBrowsing)
        #expect(await h.progress.writes.isEmpty)
        await h.session.handleSceneEnteredBackground()
        try await h.session.play()
        #expect(!h.session.isBrowsing)
        let replacement = ProtocolTestView()
        let bridge = ReaderBridge(js: replacement)
        h.session.attachBridge(bridge)
        await h.session.handleSceneBecameActive()
        #expect(replacement.commands.contains { $0.kind == "anchor" && $0.textId == "s0" })
        await h.close()
    }
    @Test func alwaysBrowseSurvivesPlayAndReplacement() async throws {
        let h = try await ProtocolTestSession.make(audio: true, freeBrowse: "always")
        var browse = h.view.location
        browse.cfi = "independent"
        h.view.userGesture(at: browse)
        _ = await h.session.ensureSynced()
        try await h.session.play()
        #expect(h.session.isBrowsing)
        let replacement = ProtocolTestView()
        let bridge = ReaderBridge(js: replacement)
        h.session.attachBridge(bridge)
        _ = await h.session.ensureSynced()
        #expect(replacement.commands.contains { $0.kind == "cfi" && $0.value == "independent" })
        await h.close()
    }
    @Test func userScrollKeepsVisibleAudioButSeeksWhenItLeavesTheViewport() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        var viewport = h.view.location
        viewport.flow = "scrolled"
        viewport.cfi = "top-line"
        let before = await h.factory.player.seeks.count
        h.view.playheadVisible = true
        h.view.userGesture(at: viewport)
        _ = await h.session.ensureSynced()
        #expect(await h.factory.player.seeks.count == before)
        h.view.playheadVisible = false
        h.view.visibleIDs = ["s1"]
        h.view.userGesture(at: viewport)
        _ = await h.session.ensureSynced()
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s1")
        #expect(h.session.playback.accepted?.locations?.fragments == ["s1"])
        await h.close()
    }
    @Test func failedSeekCannotCommitTheReaderDestination() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        await h.factory.player.setReject(true)
        h.view.playheadVisible = false
        h.view.visibleIDs = ["s1"]
        h.view.fullyVisibleIDs = ["s1"]
        h.view.userGesture(at: h.view.location)
        _ = await h.session.ensureSynced()
        #expect(await h.progress.writes.isEmpty)
        #expect(h.session.playback.accepted?.locations?.fragments == ["s0"])
        await h.factory.player.setReject(false)
        _ = await h.session.ensureSynced()
        #expect(h.session.playback.accepted?.locations?.fragments == ["s1"])
        await h.close()
    }
    @Test func unnarratedTextSurvivesPausedEngineAndRecovery() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        var target = h.view.location
        target.sectionIndex = 1
        target.href = "chapter-1.xhtml"
        target.cfi = "unnarrated"
        h.view.playheadVisible = false
        h.view.visibleIDs = []
        h.view.userGesture(at: target)
        _ = await h.session.ensureSynced()
        #expect(!h.session.playback.acceptedAudio)
        let replacement = ProtocolTestView()
        let bridge = ReaderBridge(js: replacement)
        h.session.attachBridge(bridge)
        _ = await h.session.ensureSynced()
        #expect(replacement.commands.contains { $0.kind == "cfi" && $0.value == "unnarrated" })
        #expect(!replacement.commands.contains { $0.kind == "anchor" })
        await h.close()
    }
    @Test func aFailedReaderDoesNotPreventHeadlessAudioPlayback() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        h.view.unavailable = true
        try await h.session.play()
        #expect(await h.factory.player.playing)
        #expect(await h.session.ensureSynced() != .synced)
        h.session.readerUnavailable()
        let replacement = ProtocolTestView()
        let bridge = ReaderBridge(js: replacement)
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced() == .synced)
        await h.close()
    }
    @Test func paintingNeverNavigatesAndFailedCommandsAreNotAcknowledgedAsSuccess() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        h.view.playheadVisible = false
        h.view.status = "failed"
        h.session.navigation.confirmed = nil
        #expect(await h.session.ensureSynced() != .synced)
        #expect(
            !h.view.scripts.contains { $0.contains("highlightFragment") && $0.contains(", true)") }
        )
        h.view.status = "completed"
        #expect(await h.session.ensureSynced() == .synced)
        await h.close()
    }
    @Test func acceptedRemotePositionKeepsItsTimestampWhenTheViewReturns() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        h.session.readerUnavailable()
        let remote = BookLocator(
            href: "chapter-0.xhtml",
            type: "application/xhtml+xml",
            title: nil,
            locations: BookLocator.Locations(
                fragments: ["s1"],
                progression: nil,
                position: nil,
                totalProgression: 0.6,
                cssSelector: nil,
                partialCfi: nil,
                domRange: nil,
            ),
            text: nil,
        )
        await h.session.applyIncomingPosition(
            IncomingServerPosition(locator: remote, timestamp: 100),
            accepted: true,
        )
        await h.session.handleSceneEnteredBackground()
        #expect(h.session.playback.accepted == remote)
        #expect(h.session.playback.acceptedAt == 100)
        #expect(await h.progress.writes.isEmpty)
        let replacement = ProtocolTestView()
        let bridge = ReaderBridge(js: replacement)
        h.session.attachBridge(bridge)
        await h.session.handleSceneBecameActive()
        #expect(h.session.playback.acceptedAt == 100)
        #expect(replacement.commands.contains { $0.textId == "s1" })
        #expect(await h.progress.writes.isEmpty)
        await h.close()
    }
    @Test func pauseAndDelayedEngineReportsCannotReplaceUnnarratedText() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        var text = h.view.location
        text.sectionIndex = 1
        text.href = "chapter-1.xhtml"
        text.cfi = "unnarrated"
        h.view.playheadVisible = false
        h.view.visibleIDs = []
        h.view.userGesture(at: text)
        _ = await h.session.ensureSynced()
        let accepted = h.session.playback.accepted
        h.session.playback.wasPlaying = true
        let old = try #require(await h.engine.getCurrentState())
        await h.session.observedPlayback(old)
        await h.session.pause()
        #expect(h.session.playback.accepted == accepted)
        #expect(!h.session.playback.acceptedAudio)
        await h.close()
    }

    @Test func explicitPlaybackCommandsUseTheSameEngine() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        try await h.session.play()
        #expect(await h.factory.player.playing)
        try await h.session.togglePlayback()
        #expect(!(await h.factory.player.playing))
        try await h.session.togglePlayback()
        #expect(await h.factory.player.playing)
        await h.session.pause()
        #expect(!(await h.factory.player.playing))
        await h.close()
    }

    @Test func retiredSessionCannotPauseOrToggleTheNextBook() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        let timeline = try #require(h.session.content.audio)
        await h.close()
        try await h.engine.load(
            timeline: timeline,
            bookID: BookID(sourceID: "test", uuid: UUID().uuidString),
        )
        try await h.engine.seek(to: 0)
        try await h.engine.play()
        await h.session.pause()
        do {
            try await h.session.togglePlayback()
            Issue.record("An ended session accepted a playback command")
        } catch is CancellationError {} catch { Issue.record("Unexpected error: \(error)") }
        #expect(await h.factory.player.playing)
        await h.engine.cleanup()
    }

    @Test func lostFollowReceiptCannotFreezeHeadlessAudioSaves() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        h.view.hold = true
        h.view.playheadVisible = false
        h.session.navigation.confirmed = nil
        try await h.session.play()
        let following = Task { await h.session.ensureSynced() }
        for _ in 0..<100 where h.view.commands.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(!h.view.commands.isEmpty)
        await h.session.observedPlayback(try #require(await h.engine.getCurrentState()))
        await h.session.handleSceneEnteredBackground()
        h.session.readerUnavailable()
        _ = await following.value
        #expect(h.session.navigation.pending != nil)

        await h.factory.player.advance(to: 6)
        await h.session.updatePlayback(now: Date().addingTimeInterval(6))
        #expect(h.session.playback.accepted?.locations?.totalProgression == 0.3)
        #expect(await h.progress.writes.last?.0.locations?.totalProgression == 0.3)

        // Simulate an OS interruption rather than the session's explicit Pause.
        await h.factory.player.advance(to: 9)
        await h.engine.pause()
        await h.session.observedPlayback(try #require(await h.engine.getCurrentState()))
        #expect(await h.progress.writes.last?.0.locations?.totalProgression == 0.45)
        await h.close()
    }

    @Test func backgroundLocalSaveRetriesFailureWithoutWaitingForANewDeadline() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        try await h.engine.play()
        await h.session.handleSceneEnteredBackground()
        h.session.readerUnavailable()
        await h.factory.player.advance(to: 7)
        await h.progress.setSaveFailure(true)
        let saved = h.session.playback.savedAt
        let now = Date().addingTimeInterval(6)
        await h.session.updatePlayback(now: now)
        #expect(h.session.playback.savedAt == saved)
        await h.progress.setSaveFailure(false)
        await h.session.updatePlayback(now: now)
        #expect(await h.progress.writes.last?.0.locations?.totalProgression == 0.35)
        await h.close()
    }

    @Test func backgroundSavesTheLatestAudioBeforeThePeriodicDeadline() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        try await h.engine.play()
        await h.factory.player.advance(to: 2)
        await h.session.updatePlayback()
        let saved = h.session.playback.savedAt
        await h.factory.player.advance(to: 4)
        await h.session.handleSceneEnteredBackground()
        #expect(h.session.playback.savedAt != saved)
        #expect(await h.progress.writes.last?.0.locations?.totalProgression == 0.2)
        await h.close()
    }

    @Test func closingPausesAudioBeforeWaitingForPersistence() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        try await h.engine.play()
        await h.factory.player.advance(to: 2)
        await h.session.acceptAudioPosition()
        await h.progress.holdSaves()
        let closing = Task { await h.session.close(.endSession) }
        for _ in 0..<1_000 where await h.progress.savesWaiting == 0 {
            try await Task.sleep(for: .milliseconds(1))
        }
        #expect(await h.progress.savesWaiting > 0)
        #expect(await !h.factory.player.playing)
        #expect(await h.progress.uploadSaveCounts.isEmpty)
        await h.progress.releaseSaves()
        await closing.value
        #expect(await h.progress.writes.last?.0.locations?.totalProgression == 0.1)
        #expect(await h.progress.uploadSaveCounts == [1])
    }

    @Test func closingAfterALocalSaveUploadsWithoutRewriting() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        try await h.engine.play()
        await h.factory.player.advance(to: 7)
        await h.session.updatePlayback(now: Date().addingTimeInterval(6))
        let saved = try #require(await h.progress.writes.last)
        #expect(h.session.playback.savedAt == h.session.playback.acceptedAt)
        #expect(await h.session.ensureSynced() == .synced)
        #expect(await h.progress.uploadSaveCounts.isEmpty)

        await h.factory.player.advance(to: 7.05)
        await h.session.close(.endSession)
        #expect(await !h.factory.player.playing)
        #expect(await h.progress.writes.count == 1)
        #expect(await h.progress.writes.last?.0 == saved.0)
        #expect(await h.progress.writes.last?.1 == saved.1)
        #expect(await h.progress.uploadSaveCounts == [1])
    }

    enum SavedProgressBoundary: CaseIterable {
        case pause, background, detach, nativeStop
    }

    @Test(arguments: SavedProgressBoundary.allCases)
    func lifecycleUploadsAnAlreadySavedPosition(boundary: SavedProgressBoundary) async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        try await h.engine.play()
        await h.session.observedPlayback(try #require(await h.engine.getCurrentState()))
        await h.factory.player.advance(to: 7)
        await h.session.updatePlayback(now: Date().addingTimeInterval(6))
        let saved = h.session.playback.savedAt
        switch boundary {
            case .pause: await h.session.pause()
            case .background: await h.session.handleSceneEnteredBackground()
            case .detach: await h.session.close(.detachView)
            case .nativeStop:
                await h.engine.pause()
                await h.session.observedPlayback(try #require(await h.engine.getCurrentState()))
        }
        #expect(h.session.playback.savedAt == saved)
        #expect(await h.progress.writes.count == 1)
        #expect(await h.progress.uploadSaveCounts == [1])
        await h.close()
    }

    @Test func aFailedBoundarySaveDoesNotRequestUploadUntilRetrySucceeds() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        try await h.engine.play()
        await h.factory.player.advance(to: 7)
        await h.progress.setSaveFailure(true)
        await h.session.pause()
        #expect(await h.progress.writes.isEmpty)
        #expect(await h.progress.uploadSaveCounts.isEmpty)
        await h.progress.setSaveFailure(false)
        await h.session.pause()
        #expect(await h.progress.uploadSaveCounts == [1])
        await h.close()
    }

    @Test func closingATextSessionRetriesItsFailedSave() async throws {
        let h = try await ProtocolTestSession.make()
        await h.progress.setSaveFailure(true)
        h.view.userGesture(at: h.view.location)
        _ = await h.session.ensureSynced()
        #expect(await h.progress.writes.isEmpty)
        await h.progress.setSaveFailure(false)
        await h.session.close(.endSession)
        #expect(await !h.progress.writes.isEmpty)
    }

    @Test func freshReadaloudProjectionPreservesConfirmedAudioAndCanPlay() async throws {
        let h = try await ProtocolTestSession.make(audio: true, freshAudio: true)
        #expect(h.session.playback.accepted?.locations?.fragments == ["s0"])
        #expect(h.session.playback.acceptedAudio)
        #expect(h.session.playback.acceptedAt == nil)
        #expect(await h.progress.writes.isEmpty)
        let reader = ProtocolTestView()  // its playhead is offscreen, forcing a projection
        let bridge = ReaderBridge(js: reader)
        h.session.attachBridge(bridge)
        #expect(await h.session.ensureSynced() == .synced)
        #expect(reader.commands.contains { $0.kind == "anchor" })
        #expect(h.session.playback.acceptedAudio)
        #expect(h.session.playback.acceptedAt == nil)
        try await h.session.play()
        #expect(await h.factory.player.playing)
        await h.close()
    }

    @Test func peerPreviewDoesNotCommitAndPlayTakesOverAtPeerPosition() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        let accepted = h.session.playback.accepted
        let timestamp = h.session.playback.acceptedAt
        await h.session.receivePeerPosition(peerPacket(for: h.session))
        #expect(h.session.navigation.peer?.locator.locations?.fragments == ["s1"])
        #expect(h.session.playback.accepted == accepted)
        #expect(h.session.playback.acceptedAt == timestamp)
        #expect(await h.progress.writes.isEmpty)
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s0")
        try await h.session.play()
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s1")
        #expect(await h.factory.player.playing)
        #expect(h.session.navigation.peer == nil)
        #expect(h.session.playback.accepted?.locations?.fragments == ["s1"])
        await h.close()
    }

    @Test func failedPeerTakeoverKeepsTheTargetForRetry() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        let accepted = h.session.playback.accepted
        await h.session.receivePeerPosition(peerPacket(for: h.session))
        await h.factory.player.setReject(true)
        do {
            try await h.session.play()
            Issue.record("Failed takeover started playback")
        } catch {}
        #expect(!(await h.factory.player.playing))
        #expect(h.session.navigation.peer?.locator.locations?.fragments == ["s1"])
        #expect(h.session.playback.accepted == accepted)
        await h.factory.player.setReject(false)
        try await h.session.play()
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s1")
        #expect(await h.factory.player.playing)
        await h.close()
    }

    @Test func comicHistoryAndRemoteRestoresSelectNativePagesWithoutJS() async throws {
        let h = try await ProtocolTestSession.make()
        h.session.readerUnavailable()
        h.session.ebookFileFormat = .cbz
        h.session.nativeReaderReady(pageCount: 2)
        let bookmark = BookLocator(
            href: "chapter-1.xhtml",
            type: "application/xhtml+xml",
            title: nil,
            locations: nil,
            text: nil,
        )
        await h.session.restoreLocator(bookmark)
        #expect(h.session.readerLocation?.sectionIndex == 1)
        #expect(h.session.playback.accepted?.href == bookmark.href)
        #expect(h.session.navigation.pending == nil)
        #expect(await h.progress.writes.last?.0.href == bookmark.href)

        let timestamp = try #require(h.session.playback.acceptedAt) + 1000
        let remote = BookLocator(
            href: "chapter-0.xhtml",
            type: "application/xhtml+xml",
            title: nil,
            locations: nil,
            text: nil,
        )
        await h.session.applyIncomingPosition(
            IncomingServerPosition(locator: remote, timestamp: timestamp),
            accepted: true,
        )
        #expect(await h.session.ensureSynced() == .synced)
        #expect(h.session.readerLocation?.sectionIndex == 0)
        #expect(h.session.playback.acceptedAt == timestamp)
        #expect(h.view.commands.isEmpty)
        let writes = await h.progress.writes.count
        await h.session.restoreLocator(
            BookLocator(
                href: "missing",
                type: "application/xhtml+xml",
                title: nil,
                locations: nil,
                text: nil,
            )
        )
        #expect(h.session.readerLocation?.sectionIndex == 0)
        #expect(await h.progress.writes.count == writes)
        await h.close()
    }

    @Test func physicalScrollTakesOverPeerWithoutConfusingItsHighlightWithLocalAudio() async throws
    {
        let h = try await ProtocolTestSession.make(audio: true)
        await h.session.receivePeerPosition(peerPacket(for: h.session))
        // The peer's sentence is visible; the actual local audio playhead isn't.
        // Moving within this page must establish local audio at the user's text,
        // not preserve unrelated audio merely because the peer highlight is visible.
        h.view.visibilityByFragment = ["s0": false, "s1": true]
        h.view.visibleIDs = ["s1"]
        var location = h.view.location
        location.flow = "scrolled"
        location.cfi = "user-scroll-on-peer-page"
        h.view.userGesture(at: location)
        _ = await h.session.ensureSynced()
        #expect(h.session.navigation.peer == nil)
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s1")
        #expect(h.session.playback.accepted?.locations?.fragments == ["s1"])
        try await h.session.play()
        #expect(await h.engine.getBackgroundSyncData()?.fragment == "s1")
        await h.close()
    }

    private func peerPacket(for session: ReadingSession) -> LiveReadingSyncPacket {
        LiveReadingSyncPacket(
            version: 1,
            senderID: "peer",
            bookID: session.bookID,
            sectionIndex: 0,
            entryIndex: 1,
            textId: "s1",
            textHref: "chapter-0.xhtml",
            playbackRate: 1,
            sentAt: 1,
        )
    }

}
