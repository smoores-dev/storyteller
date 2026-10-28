import Foundation
import Testing

@testable import StorytellerKit

private actor EngineTestPlayer: AudioPlaying {
    var currentTime: TimeInterval = 0
    var duration: TimeInterval = 100
    var loads: [URL] = []
    var seeks: [Double] = []
    var playing = false
    var rejectSeek = false
    private var handler: (@Sendable (AudioPlayerEvent) -> Void)?
    func load(url: URL) async throws -> TimeInterval {
        loads.append(url)
        currentTime = 0
        playing = false
        return duration
    }
    func play() async { playing = true }
    func pause() async { playing = false }
    func stop() async { playing = false }
    func seek(to seconds: TimeInterval) async {
        seeks.append(seconds)
        if !rejectSeek { currentTime = seconds }
    }
    func setRate(_ rate: Double) async {}
    func setVolume(_ volume: Double) async {}
    func setEventHandler(_ handler: @escaping @Sendable (AudioPlayerEvent) -> Void) async {
        self.handler = handler
    }
    func setRejectSeek() { rejectSeek = true }
    func advance(to time: Double) { currentTime = time }
}

private struct EngineTestFactory: AudioPlayerFactory {
    let player = EngineTestPlayer()
    func makePlayer(profile: AudioPlaybackProfile) -> any AudioPlaying { player }
    func prepareSession(longForm: Bool) async throws {}
    func deactivateSession() async {}
}

private func engineTestBook() -> BookID {
    BookID(sourceID: "engine-tests", uuid: UUID().uuidString)
}
private func audioTimeline() -> (AudiobookMetadata, PlaybackTimeline) {
    let metadata = AudiobookMetadata(
        chapters: [
            AudiobookChapter(
                id: "one",
                title: "One",
                startTime: 0,
                duration: 4,
                href: "a.mp3#t=0",
            ),
            AudiobookChapter(
                id: "two",
                title: "Two",
                startTime: 4,
                duration: 9,
                href: "a.mp3#t=4",
            ),
            AudiobookChapter(
                id: "three",
                title: "Three",
                startTime: 13,
                duration: 7,
                href: "b.mp3#t=3",
            ),
        ],
        tracks: [
            AudiobookTrack(
                href: "a.mp3",
                url: URL(fileURLWithPath: "/tmp/a.mp3"),
                type: "audio/mpeg",
                duration: 10,
                startTime: 0,
            ),
            AudiobookTrack(
                href: "b.mp3",
                url: URL(fileURLWithPath: "/tmp/b.mp3"),
                type: "audio/mpeg",
                duration: 10,
                startTime: 10,
            ),
        ],
        totalDuration: 20,
        title: "Test",
        author: nil,
    )
    return (metadata, PlaybackTimeline(audiobook: metadata))
}

@Test func audiobookChaptersAreIndependentOfTracks() async throws {
    let factory = EngineTestFactory()
    let engine = PlaybackEngineActor(factory: factory)
    let (metadata, timeline) = audioTimeline()
    let book = engineTestBook()
    try await engine.load(timeline: timeline, bookID: book, audiobook: metadata)
    #expect(await engine.getCurrentState() == nil)  // Loading is not position restoration.
    do {
        try await engine.play()
        Issue.record("Unpositioned playback succeeded")
    } catch {}
    #expect(await engine.seekToSection(id: "two"))
    let state = try #require(await engine.getAudiobookState())
    #expect(state.currentChapterIndex == 1)
    #expect(state.currentTrackHref == "a.mp3")
    #expect(state.currentTrackTime == 4)
    #expect(await engine.seekToSection(id: "three"))
    let second = try #require(await engine.getAudiobookState())
    #expect(second.currentTime == 13)
    #expect(second.currentTrackTime == 3)
    #expect(second.currentChapterIndex == 2)
    await engine.cleanup()
}

@Test func failedSeekDoesNotAuthorizePlaybackOrProgress() async throws {
    let factory = EngineTestFactory()
    let engine = PlaybackEngineActor(factory: factory)
    let (metadata, timeline) = audioTimeline()
    let book = engineTestBook()
    try await engine.load(timeline: timeline, bookID: book, audiobook: metadata)
    await factory.player.setRejectSeek()
    #expect(!(await engine.seekToTotalProgression(0.4)))
    #expect(!(await engine.isPositioned(for: book)))
    #expect(await engine.getCurrentState() == nil)
    do {
        try await engine.play()
        Issue.record("Playback started after failed seek")
    } catch {}
    await engine.cleanup()
}

@Test func sameEngineCanReplaceAlignedTimelineWithAudioOnly() async throws {
    let factory = EngineTestFactory()
    let engine = PlaybackEngineActor(factory: factory)
    let section = SectionInfo(
        index: 0,
        id: "text.xhtml",
        label: "Text",
        level: nil,
        mediaOverlay: [
            SMILEntry(
                textId: "s1",
                textHref: "text.xhtml",
                audioFile: "voice.mp3",
                begin: 2,
                end: 4,
                cumSumAtEnd: 2,
            ),
            SMILEntry(
                textId: "s2",
                textHref: "text.xhtml",
                audioFile: "voice.mp3",
                begin: 6,
                end: 8,
                cumSumAtEnd: 4,
            ),
        ],
    )
    let aligned = PlaybackTimeline(sections: [section])
    #expect(aligned.hasTextAlignment)
    #expect(aligned.landing(at: 2)?.sourceTime == 6)
    #expect(aligned.spans[1].alignment?.fragment == "s2")
    // Use direct resources in this engine test; EPUB extraction has its own tests.
    let direct = PlaybackTimeline(
        spans: aligned.spans.map {
            PlaybackTimeline.Span(
                source: $0.source,
                url: URL(fileURLWithPath: "/tmp/voice.mp3"),
                sourceStart: $0.sourceStart,
                sourceEnd: $0.sourceEnd,
                bookStart: $0.bookStart,
                alignment: $0.alignment,
            )
        },
        chapters: aligned.chapters,
    )
    let first = engineTestBook()
    try await engine.load(timeline: direct, bookID: first, sections: [section])
    try await engine.seek(to: 2.5)
    #expect(await engine.getBackgroundSyncData()?.fragment == "s2")
    #expect(await factory.player.currentTime == 6.5)
    let (metadata, audio) = audioTimeline()
    let second = engineTestBook()
    try await engine.load(timeline: audio, bookID: second, audiobook: metadata)
    #expect(await engine.getLoadedBookID() == second)
    #expect(await engine.getBackgroundSyncData() == nil)
    #expect(!(await engine.isPositioned(for: first)))
    #expect(await engine.seekToTotalProgression(0))
    #expect(await engine.getAudiobookState()?.currentTime == 0)
    await engine.cleanup()
}

@Test func audiobookAdvancementUsesTheCommonTimeline() async throws {
    let factory = EngineTestFactory()
    let engine = PlaybackEngineActor(factory: factory)
    let (metadata, timeline) = audioTimeline()
    try await engine.load(timeline: timeline, bookID: engineTestBook(), audiobook: metadata)
    try await engine.seek(to: 9)
    try await engine.play()
    await factory.player.advance(to: 10)
    await engine.reconcilePositionFromPlayer()
    let state = try #require(await engine.getAudiobookState())
    #expect(state.currentTrackHref == "b.mp3")
    #expect(state.currentTrackTime == 0)
    #expect(state.currentTime == 10)
    #expect(state.currentChapterIndex == 1)  // Chapter two spans the track boundary.
    #expect(state.isPlaying)
    await engine.cleanup()
}

@Test func alignedAdvancementSkipsGapsWithoutReloadingTheSameFile() async throws {
    let factory = EngineTestFactory()
    let engine = PlaybackEngineActor(factory: factory)
    let url = URL(fileURLWithPath: "/tmp/narration.mp3")
    let timeline = PlaybackTimeline(
        spans: [
            .init(
                source: "voice",
                url: url,
                sourceStart: 2,
                sourceEnd: 4,
                bookStart: 0,
                alignment: .init(section: 0, entry: 0, href: "text", fragment: "s1"),
            ),
            .init(
                source: "voice",
                url: url,
                sourceStart: 6,
                sourceEnd: 8,
                bookStart: 2,
                alignment: .init(section: 1, entry: 0, href: "text2", fragment: "s2"),
            ),
        ],
        chapters: [
            .init(id: "c1", title: "One", start: 0, duration: 2, section: 0),
            .init(id: "c2", title: "Two", start: 2, duration: 2, section: 1),
        ],
    )
    try await engine.load(timeline: timeline, bookID: engineTestBook())
    try await engine.seek(to: 0)
    try await engine.play()
    await factory.player.advance(to: 4)
    await engine.reconcilePositionFromPlayer()
    #expect(await factory.player.currentTime == 6)
    #expect(await factory.player.loads.count == 1)
    #expect(await engine.getBackgroundSyncData()?.fragment == "s2")
    #expect(await engine.getCurrentState()?.bookElapsed == 2)
    await engine.cleanup()
}

@StorytellerUIActor
@Test func activatingAnotherBookRetiresTheOnlyPreviousSession() async {
    func metadata(_ id: BookID) -> BookMetadata {
        BookMetadata(
            bookID: id,
            title: "Session test",
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
    }
    let store = ActiveReadingSession.shared
    let firstBook = metadata(engineTestBook())
    let first = await store.open(
        metadata: firstBook,
        category: .ebook,
        localMediaPath: nil,
        settings: nil,
    )
    let joined = await store.open(
        metadata: firstBook,
        category: .ebook,
        localMediaPath: nil,
        settings: nil,
    )
    #expect(first === joined)
    let second = await store.open(
        metadata: metadata(engineTestBook()),
        category: .audio,
        localMediaPath: nil,
        settings: nil,
    )
    #expect(first.isEnded)
    #expect(store.current === second)
    #expect(store.current?.bookID != firstBook.id)
    await second.close(.detachView)
    #expect(store.current === second)
    #expect(!second.isEnded)
    await second.close(.endSession)
    #expect(store.current == nil)
    async let third = store.open(
        metadata: metadata(engineTestBook()),
        category: .ebook,
        localMediaPath: nil,
        settings: nil,
    )
    async let fourth = store.open(
        metadata: metadata(engineTestBook()),
        category: .ebook,
        localMediaPath: nil,
        settings: nil,
    )
    let (a, b) = await (third, fourth)
    #expect(a.isEnded != b.isEnded)
    #expect(store.current === a || store.current === b)
    await store.current?.close(.endSession)
    #expect(store.current == nil)

}

private actor EnginePreparationGate {
    var armed = false
    func arm() { armed = true }
    var entered = false
    var continuation: CheckedContinuation<Void, Never>?
    func wait() async {
        guard armed else { return }
        entered = true
        await withCheckedContinuation { continuation = $0 }
    }
    func release() {
        continuation?.resume()
        continuation = nil
    }
}
private struct SuspendedEngineFactory: AudioPlayerFactory {
    let player = EngineTestPlayer()
    let gate = EnginePreparationGate()
    func makePlayer(profile: AudioPlaybackProfile) -> any AudioPlaying { player }
    func prepareSession(longForm: Bool) async throws { await gate.wait() }
    func deactivateSession() async {}
}

@Test func pauseInvalidatesPlaySuspendedInPlatformPreparation() async throws {
    let factory = SuspendedEngineFactory()
    let engine = PlaybackEngineActor(factory: factory)
    let (metadata, timeline) = audioTimeline()
    try await engine.load(timeline: timeline, bookID: engineTestBook(), audiobook: metadata)
    #expect(await engine.seekToTotalProgression(0.4))
    await factory.gate.arm()
    let play = Task { try? await engine.play() }
    for _ in 0..<200 {
        if await factory.gate.entered { break }
        try await Task.sleep(for: .milliseconds(5))
    }
    #expect(await factory.gate.entered)
    let pause = Task { await engine.pause() }
    // Let Pause invalidate the queued Play before platform activation returns.
    try await Task.sleep(for: .milliseconds(20))
    await factory.gate.release()
    await play.value
    await pause.value
    #expect(!(await factory.player.playing))
    #expect(await engine.getCurrentState()?.isPlaying == false)
    await engine.cleanup()
}
