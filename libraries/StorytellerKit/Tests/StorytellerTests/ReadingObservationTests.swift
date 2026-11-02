import Foundation
import Observation
import Synchronization
import Testing

@testable import StorytellerKit

@StorytellerUIActor
struct ReadingObservationTests {
    @Test func backgroundPresentationOnlyUpdatesForEventsAndCatchesUpWhenShown() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        h.session.navigation.foreground = false
        try await h.engine.play()
        await h.session.observedPlayback(try #require(await h.engine.getCurrentState()))
        let initial = h.session.playbackSnapshot
        let changes = Mutex(0)
        withObservationTracking {
            _ = h.session.audioState
            _ = h.session.playbackSnapshot
        } onChange: {
            changes.withLock { $0 += 1 }
        }
        await h.factory.player.advance(to: 3)
        await h.session.observedPlayback(try #require(await h.engine.getCurrentState()))
        #expect(changes.withLock { $0 } == 0)
        #expect(h.session.playbackSnapshot == initial)
        #expect(await h.engine.getCurrentState()?.bookElapsed == 3)
        await h.engine.pause()
        await h.session.observedPlayback(try #require(await h.engine.getCurrentState()))
        #expect(!h.session.isAudioPlaying)
        #expect(h.session.playbackSnapshot?.isPlaying == false)
        #expect(h.session.audioState?.bookElapsed == 3)
        #expect(changes.withLock { $0 } == 1)
        try await h.engine.seek(to: 4)
        await h.session.publishPlayback()
        #expect(h.session.audioState?.bookElapsed == 4)
        await h.factory.player.advance(to: 5)
        h.session.navigation.foreground = true
        await h.session.publishPlayback()
        #expect(h.session.audioState?.bookElapsed == 5)
        await h.close()
    }

    @Test func audiobookPresentationUsesTheSameBackgroundGate() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        let session = ReadingSession(
            metadata: h.session.metadata,
            category: .audio,
            localMediaPath: nil,
            settings: h.settings,
            engine: h.engine,
            progressAccess: h.session.progressAccess,
        )
        session.navigation.foreground = false
        try await h.engine.play()
        await session.publishPlayback()
        let initial = session.audiobookState
        #expect(initial != nil)
        await h.factory.player.advance(to: 3)
        await session.publishPlayback()
        #expect(session.audiobookState == initial)
        await h.engine.pause()
        await session.publishPlayback()
        #expect(session.audiobookState?.isPlaying == false)
        #expect(session.audiobookState?.currentTime == 3)
        #expect(session.audioState?.bookElapsed == 3)
        #expect(session.playbackSnapshot?.isPlaying == false)
        await h.factory.player.advance(to: 4)
        session.navigation.foreground = true
        await session.publishPlayback()
        #expect(session.audiobookState?.currentTime == 4)
        #expect(session.audioState?.bookElapsed == 4)
        await h.close()
    }

    @Test func bridgeBookkeepingDoesNotInvalidateViewportViews() async throws {
        let h = try await ProtocolTestSession.make()
        let changes = Mutex(0)
        func snapshot(sequence: UInt64, page: Int) -> ReaderSnapshot {
            ReaderSnapshot(
                documentID: "test",
                ready: true,
                sequence: sequence,
                location: ReaderLocation(sectionIndex: 0, pageIndex: page),
                command: nil,
                gesture: nil,
                navigationBlocked: false,
                visibleIDs: ["sentence-\(sequence)"],
                fullyVisibleIDs: nil,
                playhead: ReaderPlayhead(sectionIndex: 0, textId: "sentence-\(sequence)"),
            )
        }
        h.session.navigation.snapshot = snapshot(sequence: 1, page: 1)
        withObservationTracking {
            _ = h.session.readerLocation
        } onChange: {
            changes.withLock { $0 += 1 }
        }
        h.session.navigation.snapshot = snapshot(sequence: 2, page: 1)
        #expect(changes.withLock { $0 } == 0)
        h.session.navigation.snapshot = snapshot(sequence: 3, page: 2)
        #expect(changes.withLock { $0 } == 1)
        #expect(h.session.readerLocation?.pageIndex == 2)
        await h.close()
    }

    @Test func transportObserversIgnoreClockTicksButSeePlayAndPause() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        let changes = Mutex(0)
        withObservationTracking {
            _ = h.session.isAudioPlaying
        } onChange: {
            changes.withLock { $0 += 1 }
        }
        h.session.playback.observed = await h.engine.getCurrentState()
        #expect(changes.withLock { $0 } == 0)

        try await h.engine.play()
        h.session.playback.observed = await h.engine.getCurrentState()
        #expect(h.session.isAudioPlaying)
        #expect(changes.withLock { $0 } == 1)

        withObservationTracking {
            _ = h.session.isAudioPlaying
        } onChange: {
            changes.withLock { $0 += 1 }
        }
        h.session.playback.observed = await h.engine.getCurrentState()
        #expect(changes.withLock { $0 } == 1)
        await h.engine.pause()
        h.session.playback.observed = await h.engine.getCurrentState()
        #expect(!h.session.isAudioPlaying)
        #expect(changes.withLock { $0 } == 2)
        await h.close()
    }

    @Test func playbackBookkeepingDoesNotInvalidateAudioViews() async throws {
        let h = try await ProtocolTestSession.make(audio: true)
        #expect(h.session.audioState != nil)
        let changes = Mutex(0)
        withObservationTracking {
            _ = h.session.audioState
        } onChange: {
            changes.withLock { $0 += 1 }
        }

        h.session.playback.acceptedAt = 123
        h.session.playback.nextLocalSaveAt = Date()
        h.session.playback.wasPlaying = true
        #expect(changes.withLock { $0 } == 0)

        h.session.playback.observed = nil
        #expect(changes.withLock { $0 } == 1)
        await h.close()
    }

    @Test func reconciliationBookkeepingDoesNotInvalidateBrowseViews() async throws {
        let h = try await ProtocolTestSession.make()
        let changes = Mutex(0)
        withObservationTracking {
            _ = h.session.isBrowsing
        } onChange: {
            changes.withLock { $0 += 1 }
        }

        h.session.navigation.syncRequestID = UUID()
        h.session.navigation.retryCount += 1
        h.session.navigation.revision += 1
        #expect(changes.withLock { $0 } == 0)

        h.session.navigation.browseLocation = BookLocator(
            href: "chapter.xhtml",
            type: "application/xhtml+xml",
            title: nil,
            locations: nil,
            text: nil,
        )
        #expect(changes.withLock { $0 } == 1)
        await h.close()
    }
}
