import Foundation

/// Plays an audio timeline with optional text alignment. Seek before playing.
@globalActor
public actor PlaybackEngineActor {
    public static let shared = PlaybackEngineActor()

    private let factoryOverride: (any AudioPlayerFactory)?
    private var factory: (any AudioPlayerFactory)? {
        factoryOverride ?? StorytellerPlatform.audioPlayerFactory
    }
    private var player: (any AudioPlaying)?
    private var timeline: PlaybackTimeline?
    private var sections: [SectionInfo] = []
    private var toc: [TocEntry] = []
    private var audiobook: AudiobookMetadata?
    private var epubURL: URL?
    private var bookID: BookID?
    private var title: String?
    private var spanIndex = 0
    private var sourceTime = 0.0
    private var loadedSource: String?
    private var sourceGeneration = UUID()
    private var temporaryURL: URL?
    private var positioned = false
    private var playing = false
    private var transportEpoch: UInt64 = 0
    private var rate = 1.0
    private var volume = 1.0
    private var rewind = AutomaticRewind()
    private var seekCount = 0
    private var generation = UUID()
    private var mutation: Task<Void, Error>?
    private var updateTask: Task<Void, Never>?
    private var observers: [UUID: @Sendable @StorytellerUIActor (SMILPlaybackState) -> Void] = [:]
    private var audiobookObservers: [UUID: @Sendable (AudiobookPlaybackState) -> Void] = [:]
    private var eventHandler: (@Sendable (AudioPlayerEvent) -> Void)?

    public init(factory: (any AudioPlayerFactory)? = nil) { factoryOverride = factory }

    public func setEventHandler(_ handler: (@Sendable (AudioPlayerEvent) -> Void)?) {
        eventHandler = handler
    }

    /// Serializes player operations across suspension points.
    private func mutate(_ body: @escaping @Sendable () async throws -> Void) async throws {
        let previous = mutation
        let task = Task {
            _ = try? await previous?.value
            try Task.checkCancellation()
            try await body()
        }
        mutation = task
        try await task.value
    }

    @discardableResult
    public func loadBook(epubPath: URL, bookID: BookID, title: String?, author: String?)
        async throws
        -> Bool
    {
        if self.bookID == bookID, epubURL == epubPath, timeline != nil { return false }
        let parsed = try SMILParser.parseEPUB(at: epubPath)
        let timeline = PlaybackTimeline(sections: parsed.sections)
        guard !timeline.spans.isEmpty else { throw SMILPlayerError.noMediaOverlay }
        try await load(
            timeline: timeline,
            bookID: bookID,
            title: title,
            sections: parsed.sections,
            toc: parsed.tocEntries,
            epubURL: epubPath,
            audiobook: nil,
        )
        return true
    }

    public func loadAudiobook(url: URL, bookID: BookID, title: String?) async throws
        -> AudiobookMetadata
    {
        let metadata = try await AudiobookLoader().load(from: url)
        try await load(
            timeline: PlaybackTimeline(audiobook: metadata),
            bookID: bookID,
            title: title ?? metadata.title,
            sections: [],
            toc: [],
            epubURL: nil,
            audiobook: metadata,
        )
        return metadata
    }

    func load(
        timeline: PlaybackTimeline,
        bookID: BookID,
        title: String? = nil,
        sections: [SectionInfo] = [],
        toc: [TocEntry] = [],
        epubURL: URL? = nil,
        audiobook: AudiobookMetadata? = nil,
    ) async throws {
        guard !timeline.spans.isEmpty, timeline.duration > 0 else {
            throw SMILPlayerError.noMediaOverlay
        }
        let token = UUID()
        generation = token
        updateTask?.cancel()
        updateTask = nil
        try await mutate { [self] in
            try await install(
                timeline: timeline,
                bookID: bookID,
                title: title,
                sections: sections,
                toc: toc,
                epubURL: epubURL,
                audiobook: audiobook,
                token: token,
            )
        }
    }

    private func install(
        timeline: PlaybackTimeline,
        bookID: BookID,
        title: String?,
        sections: [SectionInfo],
        toc: [TocEntry],
        epubURL: URL?,
        audiobook: AudiobookMetadata?,
        token: UUID,
    ) async throws {
        guard generation == token else { throw CancellationError() }
        await player?.stop()
        guard generation == token else { throw CancellationError() }
        player = nil
        removeTemporaryFile()
        self.timeline = timeline
        self.bookID = bookID
        self.title = title
        self.sections = sections
        self.toc = toc
        self.epubURL = epubURL
        self.audiobook = audiobook
        spanIndex = 0
        sourceTime = timeline.spans[0].sourceStart
        loadedSource = nil
        positioned = false
        playing = false
        rewind.reset()
        seekCount = 0
    }

    public func isPositioned(for bookID: BookID) -> Bool { self.bookID == bookID && positioned }
    public func getLoadedBookID() -> BookID? { bookID }
    public func getLoadedBookTitle() -> String? { title }
    public func getBookStructure() -> [SectionInfo] { sections }
    public func getTocEntries() -> [TocEntry] { toc }
    public func getTimeline() -> PlaybackTimeline? { timeline }

    public func getChapterSummaries() -> [SMILChapterSummary] {
        timeline?.chapters.enumerated().map { index, chapter in
            SMILChapterSummary(
                id: chapter.id,
                title: chapter.title,
                duration: chapter.duration,
                sectionIndex: chapter.section ?? index,
            )
        } ?? []
    }

    public func getChapterListing() async -> SMILChapterListing {
        await refreshPosition()
        let chapter = timeline?.chapterIndex(at: elapsed)
        return SMILChapterListing(
            chapters: getChapterSummaries(),
            currentChapterID: chapter.flatMap { timeline?.chapters[safe: $0]?.id },
        )
    }

    private var elapsed: Double {
        guard let span = timeline?.spans[safe: spanIndex] else { return 0 }
        return span.bookStart + min(max(0, sourceTime - span.sourceStart), span.duration)
    }

    public func seek(to time: Double) async throws {
        let token = generation
        try await mutate { [self] in
            guard await generation == token else { throw CancellationError() }
            try await performSeek(to: time, token: token, deliberate: true)
        }
        await notify()
    }

    private func performSeek(to time: Double, token: UUID, deliberate: Bool) async throws {
        guard generation == token, let timeline, let landing = timeline.landing(at: time) else {
            throw SMILPlayerError.invalidPosition
        }
        let span = timeline.spans[landing.index]
        let resume = playing
        let playEpoch = transportEpoch
        positioned = false
        do {
            try await loadSource(span, token: token)
            guard generation == token, let player else { throw CancellationError() }
            await player.seek(to: landing.sourceTime)
            guard generation == token else { throw CancellationError() }
            let actual = await player.currentTime
            guard generation == token, actual.isFinite, abs(actual - landing.sourceTime) <= 0.5
            else {
                throw SMILPlayerError.audioLoadFailed("Player did not reach the requested position")
            }
            spanIndex = landing.index
            sourceTime = actual
            positioned = true
            if deliberate {
                seekCount += 1
                rewind.reset()
            }
            if resume && transportEpoch == playEpoch { await player.play() }
        } catch {
            if generation == token {
                playing = false
                await player?.pause()
            }
            throw error
        }
    }

    private func loadSource(_ span: PlaybackTimeline.Span, token: UUID) async throws {
        if loadedSource == span.source, player != nil { return }
        guard let factory else { throw SMILPlayerError.playbackUnavailable }
        let url: URL
        var extracted: URL?
        if let directURL = span.url {
            url = directURL
        } else {
            guard let epubURL else { throw SMILPlayerError.bookNotLoaded }
            let target = FileManager.default.temporaryDirectory.appendingPathComponent(
                "storyteller_\(UUID().uuidString).\((span.source as NSString).pathExtension)"
            )
            do {
                try await FilesystemActor.shared.extractAudioToFile(
                    from: epubURL,
                    audioPath: span.source,
                    destination: target,
                )
            } catch {
                try? FileManager.default.removeItem(at: target)
                throw error
            }
            extracted = target
            url = target
        }
        guard generation == token else {
            if let extracted { try? FileManager.default.removeItem(at: extracted) }
            throw CancellationError()
        }
        try await factory.prepareSession(longForm: true)
        let output =
            player
            ?? factory.makePlayer(
                profile: timeline?.hasTextAlignment == true ? .smilSegment : .audiobookTrack
            )
        player = output
        loadedSource = nil
        let sourceToken = UUID()
        sourceGeneration = sourceToken
        await output.setEventHandler { [weak self] event in
            Task { await self?.playerEvent(event, token: token, sourceToken: sourceToken) }
        }
        do { _ = try await output.load(url: url) } catch {
            if let extracted { try? FileManager.default.removeItem(at: extracted) }
            throw error
        }
        guard generation == token else {
            await output.stop()
            if let extracted { try? FileManager.default.removeItem(at: extracted) }
            throw CancellationError()
        }
        removeTemporaryFile()
        temporaryURL = extracted
        loadedSource = span.source
        await output.setRate(rate)
        await output.setVolume(volume)
    }

    public func play(automaticRewind: Bool = false) async throws {
        let token = generation
        let epoch = transportEpoch
        try await mutate { [self] in
            try await startPlaying(token: token, epoch: epoch, automaticRewind: automaticRewind)
        }
        await notify()
    }

    private func startPlaying(token: UUID, epoch: UInt64, automaticRewind: Bool) async throws {
        guard generation == token, transportEpoch == epoch, positioned, let player else {
            throw SMILPlayerError.invalidPosition
        }
        if playing { return }
        if automaticRewind {
            let seconds = rewind.secondsOnResume(config: await SettingsActor.shared.config.playback)
            if seconds > 0 {
                try await performSeek(
                    to: max(0, elapsed - seconds),
                    token: token,
                    deliberate: false,
                )
            }
        }
        guard generation == token, transportEpoch == epoch, positioned else {
            throw CancellationError()
        }
        try await factory?.prepareSession(longForm: true)
        guard generation == token, transportEpoch == epoch else { throw CancellationError() }
        await player.setRate(rate)
        guard transportEpoch == epoch else { throw CancellationError() }
        await player.play()
        guard generation == token, transportEpoch == epoch else {
            await player.pause()
            throw CancellationError()
        }
        playing = true
        startTimer(token: token)
    }

    public func pause() async {
        transportEpoch &+= 1
        _ = try? await mutate { [self] in await stopPlaying() }
        await notify()
    }

    private func stopPlaying() async {
        await player?.pause()
        await refreshPosition()
        playing = false
        rewind.recordPause()
        updateTask?.cancel()
        updateTask = nil
    }

    public func togglePlayPause(automaticRewind: Bool = true) async throws {
        if playing { await pause() } else { try await play(automaticRewind: automaticRewind) }
    }

    public func setPlaybackRate(_ rate: Double) async {
        guard rate.isFinite, rate > 0 else { return }
        self.rate = rate
        await player?.setRate(rate)
        await notify()
    }
    public func setVolume(_ volume: Double) async {
        guard volume.isFinite else { return }
        self.volume = min(max(0, volume), 1)
        await player?.setVolume(self.volume)
        await notify()
    }

    public func seekToEntry(sectionIndex: Int, entryIndex: Int) async throws {
        guard
            let span = timeline?.spans.first(where: {
                $0.alignment?.section == sectionIndex && $0.alignment?.entry == entryIndex
            })
        else { throw SMILPlayerError.invalidPosition }
        try await seek(to: span.bookStart)
    }
    public func seekToFragment(sectionIndex: Int, textId: String) async -> Bool {
        guard
            let span = timeline?.spans.first(where: {
                $0.alignment?.section == sectionIndex && $0.alignment?.fragment == textId
            })
        else { return false }
        do {
            try await seek(to: span.bookStart)
            return true
        } catch { return false }
    }
    public func seekToLocator(_ locator: BookLocator) async -> Bool {
        if !sections.isEmpty,
            case .fragment(let section, let fragment) = resolveLocatorSeek(
                locator: locator,
                sections: sections,
            )
        {
            if await seekToFragment(sectionIndex: section, textId: fragment) { return true }
        }
        if let fragment = locator.locations?.fragments?.first, fragment.hasPrefix("t="),
            let offset = Double(fragment.dropFirst(2)), offset.isFinite,
            let span = timeline?.spans.first(where: { $0.source == locator.href })
        {
            do {
                try await seek(to: span.bookStart + offset - span.sourceStart)
                return true
            } catch { return false }
        }
        guard let fraction = locator.locations?.totalProgression else { return false }
        return await seekToTotalProgression(fraction)
    }
    public func seekToTotalProgression(_ fraction: Double) async -> Bool {
        guard fraction.isFinite, (0...1).contains(fraction), let timeline else { return false }
        do {
            try await seek(to: fraction * timeline.duration)
            return true
        } catch { return false }
    }
    public func seekToSection(id: String) async -> Bool {
        guard let chapter = timeline?.chapters.first(where: { $0.id == id }) else { return false }
        do {
            try await seek(to: chapter.start)
            return true
        } catch { return false }
    }
    public func seekWithinCurrentChapter(to seconds: Double) async -> Bool {
        await refreshPosition()
        guard seconds.isFinite, let timeline, let i = timeline.chapterIndex(at: elapsed) else {
            return false
        }
        let chapter = timeline.chapters[i]
        do {
            try await seek(to: chapter.start + min(max(0, seconds), chapter.duration))
            return true
        } catch { return false }
    }
    public func skipForward(seconds: Double = 15) async { await skip(by: seconds) }
    public func skipBackward(seconds: Double = 15) async { await skip(by: -seconds) }
    private func skip(by delta: Double) async {
        await refreshPosition()
        guard let timeline else { return }
        try? await seek(
            to: skipTarget(fromBookElapsed: elapsed, by: delta, bookTotal: timeline.duration)
        )
    }
    public func findPositionByTotalProgression(_ fraction: Double) -> (
        sectionIndex: Int, textId: String
    )? {
        guard let timeline, let landing = timeline.landing(at: fraction * timeline.duration),
            let alignment = timeline.spans[landing.index].alignment
        else { return nil }
        return (alignment.section, alignment.fragment)
    }
    public func getCurrentEntry() -> SMILEntry? {
        guard let a = timeline?.spans[safe: spanIndex]?.alignment else { return nil }
        return sections[safe: a.section]?.mediaOverlay[safe: a.entry]
    }
    public func getCurrentPosition() -> (sectionIndex: Int, entryIndex: Int) {
        let a = timeline?.spans[safe: spanIndex]?.alignment
        return (a?.section ?? 0, a?.entry ?? 0)
    }
    public func getBackgroundSyncData() async -> AudioPositionSyncData? {
        await refreshPosition()
        guard positioned, let span = timeline?.spans[safe: spanIndex], let a = span.alignment else {
            return nil
        }
        return AudioPositionSyncData(
            sectionIndex: a.section,
            entryIndex: a.entry,
            currentTime: sourceTime,
            audioFile: span.source,
            href: a.href,
            fragment: a.fragment,
        )
    }
    public func reconcilePositionFromPlayer() async {
        await refreshPosition()
        let token = generation
        if playing { _ = try? await mutate { [self] in try await advanceIfNeeded(token: token) } }
    }
    private func refreshPosition() async {
        guard positioned, let player else { return }
        let token = generation
        let time = await player.currentTime
        guard generation == token, time.isFinite else { return }
        sourceTime = time
    }

    public func getCurrentState() async -> SMILPlaybackState? {
        await refreshPosition()
        guard positioned, let timeline, let span = timeline.spans[safe: spanIndex] else {
            return nil
        }
        let chapter = timeline.chapterIndex(at: elapsed).map { timeline.chapters[$0] }
        return SMILPlaybackState(
            isPlaying: playing,
            currentSectionIndex: span.alignment?.section ?? timeline.chapterIndex(at: elapsed) ?? 0,
            currentEntryIndex: span.alignment?.entry ?? 0,
            currentFragment: span.alignment.map { "\($0.href)#\($0.fragment)" } ?? "",
            chapterLabel: chapter?.title,
            chapterElapsed: elapsed - (chapter?.start ?? 0),
            chapterTotal: chapter?.duration ?? 0,
            bookElapsed: elapsed,
            bookTotal: timeline.duration,
            playbackRate: rate,
            volume: volume,
            bookID: bookID,
            userSeekCount: seekCount,
        )
    }
    public func getAudiobookState() async -> AudiobookPlaybackState? {
        await refreshPosition()
        guard positioned, let timeline, let audiobook, let span = timeline.spans[safe: spanIndex]
        else {
            return nil
        }
        return AudiobookPlaybackState(
            isPlaying: playing,
            currentTime: elapsed,
            duration: timeline.duration,
            currentChapterIndex: timeline.chapterIndex(at: elapsed),
            playbackRate: Float(rate),
            volume: Float(volume),
            currentTrackHref: span.source,
            currentTrackType: audiobook.tracks.first { $0.href == span.source }?.type,
            currentTrackTime: sourceTime,
        )
    }
    public func addStateObserver(
        id: UUID = UUID(),
        observer: @escaping @Sendable @StorytellerUIActor (SMILPlaybackState) -> Void,
    ) async -> UUID {
        observers[id] = observer
        if let state = await getCurrentState() { await observer(state) }
        return id
    }
    public func removeStateObserver(id: UUID) { observers.removeValue(forKey: id) }
    public func addAudiobookObserver(
        id: UUID = UUID(),
        observer: @escaping @Sendable (AudiobookPlaybackState) -> Void,
    ) async -> UUID {
        audiobookObservers[id] = observer
        if let state = await getAudiobookState() { observer(state) }
        return id
    }
    public func removeAudiobookObserver(id: UUID) { audiobookObservers.removeValue(forKey: id) }
    private func notify() async {
        if let state = await getCurrentState() {
            for observer in observers.values { await observer(state) }
        }
        if let state = await getAudiobookState() {
            for observer in audiobookObservers.values { observer(state) }
        }
    }

    private func startTimer(token: UUID) {
        updateTask?.cancel()
        updateTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard !Task.isCancelled else { return }
                await self?.tick(token: token)
            }
        }
    }
    private func tick(token: UUID) async {
        guard generation == token, playing else { return }
        _ = try? await mutate { [self] in try await advanceIfNeeded(token: token) }
        await notify()
    }
    private func advanceIfNeeded(token: UUID, finished: Bool = false) async throws {
        guard generation == token, playing, let timeline else { return }
        await refreshPosition()
        guard generation == token else { return }
        while let span = timeline.spans[safe: spanIndex],
            finished || sourceTime >= span.sourceEnd - 0.02
        {
            let nextIndex = spanIndex + 1
            guard let next = timeline.spans[safe: nextIndex] else {
                await stopPlaying()
                return
            }
            // Keep playing through adjacent clips in the same file.
            if !finished, next.source == span.source, abs(next.sourceStart - span.sourceEnd) < 0.02
            {
                spanIndex = nextIndex
            } else {
                try await performSeek(to: next.bookStart, token: token, deliberate: false)
                return
            }
        }
    }
    private func playerEvent(_ event: AudioPlayerEvent, token: UUID, sourceToken: UUID) async {
        guard generation == token, sourceGeneration == sourceToken else { return }
        switch event {
            case .didFinishPlaying:
                _ = try? await mutate { [self] in
                    guard await sourceGeneration == sourceToken else { return }
                    try await advanceIfNeeded(token: token, finished: true)
                }
                await notify()
            case .interruptionBegan:
                let wasPlaying = playing
                await pause()
                if wasPlaying { eventHandler?(event) }
            case .routeChanged(let shouldPause):
                if shouldPause { await pause() }
                eventHandler?(event)
            case .interruptionEnded:
                eventHandler?(event)
        }
    }
    public func cleanup(expectedSessionID: UUID? = nil) async {
        if let expectedSessionID, expectedSessionID != generation { return }
        generation = UUID()
        updateTask?.cancel()
        updateTask = nil
        _ = try? await mutate { [self] in await clear() }
    }
    private func clear() async {
        await player?.stop()
        player = nil
        removeTemporaryFile()
        timeline = nil
        audiobook = nil
        epubURL = nil
        bookID = nil
        title = nil
        sections = []
        toc = []
        loadedSource = nil
        playing = false
        positioned = false
        eventHandler = nil
        await factory?.deactivateSession()
    }
    private func removeTemporaryFile() {
        if let temporaryURL { try? FileManager.default.removeItem(at: temporaryURL) }
        temporaryURL = nil
    }
}
