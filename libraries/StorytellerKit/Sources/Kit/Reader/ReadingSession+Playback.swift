import Foundation

@StorytellerUIActor
struct ReadingPlayback {
    enum Origin { case restored, userText, userAudio, playback, remote }
    var origin: Origin = .restored
    var playbackRequestID = UUID()
    var observed: SMILPlaybackState?
    var observerID: UUID?
    var timer: Task<Void, Never>?
    var cover: Data?
    var acceptedAudio = true
    var accepted: BookLocator?
    var acceptedAt: Double?
    var savedAt: Double?
    var wasPlaying = false
    var lastObservedFragment: String?
    var nextLocalSaveAt = Date.distantPast
    var dismissedTimestamp: Double?
    var offered: IncomingServerPosition?
    var sleepDeadline: Date?
    var sleepChapterID: String?
    var sleepMode: AudiobookSessionSleepTimerMode?
    var resumeAfterInterruption = false
}

extension ReadingSession {
    public static let playbackRateSteps: [Double] = [0.75, 1, 1.1, 1.2, 1.3, 1.5, 2, 5]
    public static let skipInterval: TimeInterval = 15

    public var audioKind: AudioSessionKind? {
        switch category {
            case .ebook: nil
            case .synced: .readaloud(bookID)
            case .audio: .audiobook(bookID)
        }
    }

    func prepareAudiobook() async throws {
        let media = await BookServiceActor.shared.resolveLocalMedia(for: bookID, category: .audio)
        guard let url = localMediaPath ?? media?.url else {
            throw AudiobookSessionError.localMediaUnavailable(bookID.uuid)
        }
        _ = try await engine.loadAudiobook(
            url: url,
            bookID: bookID,
            title: metadata.title,
        )
        try await establishAudioPosition()
    }

    func openReadaloud(epubPath: URL) async throws {
        let didLoad = try await engine.loadBook(
            epubPath: epubPath,
            bookID: bookID,
            title: metadata.title,
            author: metadata.authors?.first?.name,
        )
        let positioned = await engine.isPositioned(for: bookID)
        if didLoad || !positioned {
            try await establishAudioPosition()
        } else {
            await installPlaybackObservation()
        }
    }

    /// Restores saved progress or seeks to the beginning if none exists.
    func establishAudioPosition() async throws {
        guard !isEnded else { throw CancellationError() }
        let saved = try await progressAccess.read(bookID)
        let locator = saved?.locator ?? metadata.position?.locator
        let restored: Bool
        if let locator {
            restored = await engine.seekToLocator(locator)
        } else {
            restored = await engine.seekToTotalProgression(0)
        }
        guard !isEnded else { throw CancellationError() }
        if !restored {
            let sections = await engine.getBookStructure()
            guard let locator, !locator.type.contains("audio"),
                let index = findSectionIndex(for: locator.href, in: sections),
                sections[index].mediaOverlay.isEmpty
            else { throw SMILPlayerError.invalidPosition }
            playback.acceptedAudio = false
        }
        playback.acceptedAudio = restored
        if restored {
            guard let confirmed = await currentAudioLocator() else {
                throw SMILPlayerError.invalidPosition
            }
            playback.accepted = confirmed
        } else {
            playback.accepted = locator
        }
        playback.acceptedAt = saved?.timestamp
        playback.savedAt = saved?.timestamp
        let config = await SettingsActor.shared.config
        await engine.setPlaybackRate(config.playback.defaultPlaybackSpeed)
        await engine.setVolume(config.playback.defaultVolume)
        content = ReadingContent(
            text: category == .audio ? nil : extractedEbookPath,
            audio: await engine.getTimeline(),
        )
        await installPlaybackObservation()
    }

    func installPlaybackObservation() async {
        guard playback.observerID == nil, !isEnded else { return }
        playback.observerID = await engine.addStateObserver {
            [weak self] state in
            guard let self else { return }
            Task { @StorytellerUIActor in await self.observedPlayback(state) }
        }
        await engine.setEventHandler { [weak self] event in
            Task { @StorytellerUIActor in
                guard let self, !self.isEnded else { return }
                switch event {
                    case .interruptionBegan:
                        self.playback.resumeAfterInterruption = true
                    case .interruptionEnded(let shouldResume):
                        if shouldResume && self.playback.resumeAfterInterruption {
                            try? await self.play()
                        }
                        self.playback.resumeAfterInterruption = false
                        self.scheduleReconciliation(reason: "interruption ended")
                    case .routeChanged:
                        self.playback.resumeAfterInterruption = false
                        self.scheduleReconciliation(reason: "audio route changed")
                    case .didFinishPlaying: break
                }
            }
        }
        await StorytellerPlatform.nowPlaying?.configureCommands(
            skipForwardInterval: Self.skipInterval,
            skipBackwardInterval: Self.skipInterval,
            supportsChangePlaybackPosition: true,
            supportsChangePlaybackRate: true,
        ) { [weak self] command in
            Task { @StorytellerUIActor in
                guard let self, !self.isEnded else { return }
                await self.handleRemoteCommand(command)
            }
        }
        playback.timer = Task { @StorytellerUIActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled, let self, !self.isEnded else { return }
                await self.updatePlayback()
            }
        }
        if let cover = await BookServiceActor.shared.cachedCoverData(
            for: bookID,
            audio: category == .audio,
        ), !isEnded {
            playback.cover = cover
        }
        await publishPlayback()
    }

    func observedPlayback(_ state: SMILPlaybackState) async {
        guard !isEnded, state.bookID == bookID else { return }
        let paused = playback.wasPlaying && !state.isPlaying
        let fragmentChanged = playback.lastObservedFragment != state.currentFragment
        playback.lastObservedFragment = state.currentFragment
        let playingChanged = playback.wasPlaying != state.isPlaying
        playback.wasPlaying = state.isPlaying
        playback.observed = state
        onPlaybackActivityChanged?(state.isPlaying)
        if navigation.audioOperation == nil, playback.acceptedAudio,
            state.isPlaying || paused
        {
            await acceptAudioPosition()
            playback.origin = .playback
        }
        if paused { await saveProgressLocallyAndRequestUpload(reason: .userPausedPlayback) }
        if fragmentChanged || playingChanged {
            scheduleReconciliation(reason: "playback changed")
        }
        if state.isPlaying, fragmentChanged,
            let sync = await engine.getBackgroundSyncData()
        {
            await LiveReadingSyncActor.shared.reportLocalAdvancement(
                bookID: bookID,
                sectionIndex: sync.sectionIndex,
                entryIndex: sync.entryIndex,
                textId: sync.fragment,
                textHref: sync.href,
                playbackRate: state.playbackRate,
            )
        }
        await publishPlayback()
    }

    func updatePlayback(now: Date = Date()) async {
        guard !isEnded, let state = await engine.getCurrentState(),
            state.bookID == bookID
        else { return }
        if let deadline = playback.sleepDeadline, Date() >= deadline {
            cancelSleepTimer()
            await pause()
        } else if let chapter = playback.sleepChapterID,
            (await engine.getChapterListing()).currentChapterID != chapter
        {
            cancelSleepTimer()
            await pause()
        }
        if state.isPlaying, playback.acceptedAudio,
            navigation.audioOperation == nil
        {
            await acceptAudioPosition()
            if now >= playback.nextLocalSaveAt {
                if await saveProgressLocally(reason: .periodicDuringActivePlayback) {
                    playback.nextLocalSaveAt = now.addingTimeInterval(5)
                }
            }
        }
        await publishPlayback()
    }

    func currentAudioLocator() async -> BookLocator? {
        guard !isEnded, await engine.isPositioned(for: bookID),
            let state = await engine.getCurrentState(), state.bookID == bookID
        else { return nil }
        let locator: BookLocator
        if let sync = await engine.getBackgroundSyncData() {
            locator = BookLocator(
                href: sync.href,
                type: "application/xhtml+xml",
                title: state.chapterLabel,
                locations: BookLocator.Locations(
                    fragments: [sync.fragment],
                    progression: nil,
                    position: nil,
                    totalProgression: state.bookTotal > 0 ? state.bookElapsed / state.bookTotal : 0,
                    cssSelector: nil,
                    partialCfi: nil,
                    domRange: nil,
                ),
                text: nil,
            )
        } else if let audio = await engine.getAudiobookState() {
            locator = BookLocator(
                href: audio.currentTrackHref ?? "audiobook",
                type: audio.currentTrackType ?? "audio/mp4",
                title: state.chapterLabel,
                locations: BookLocator.Locations(
                    fragments: ["t=\(audio.currentTrackTime)"],
                    progression: state.chapterTotal > 0
                        ? state.chapterElapsed / state.chapterTotal : 0,
                    position: nil,
                    totalProgression: state.bookTotal > 0 ? state.bookElapsed / state.bookTotal : 0,
                    cssSelector: nil,
                    partialCfi: nil,
                    domRange: nil,
                ),
                text: nil,
            )
        } else {
            return nil
        }
        return isEnded ? nil : locator
    }

    func acceptAudioPosition() async {
        let revision = navigation.revision
        guard let locator = await currentAudioLocator(), navigation.revision == revision else {
            return
        }
        guard playback.accepted != locator || !playback.acceptedAudio else { return }
        playback.acceptedAudio = true
        playback.accepted = locator
        playback.acceptedAt = Date().timeIntervalSince1970 * 1000
    }

    func audioFollowsUserNavigation() async -> Bool {
        switch FreeBrowseMode(rawValue: settings.freeBrowseMode) ?? .never {
            case .never: true
            case .paused: await engine.getCurrentState()?.isPlaying == true
            case .always: false
        }
    }

    @discardableResult
    public func saveProgressLocally(reason: SyncReason) async -> Bool {
        guard let locator = playback.accepted, let timestamp = playback.acceptedAt,
            timestamp != playback.savedAt
        else { return true }
        guard await progressAccess.save(bookID, locator, timestamp, reason) else { return false }
        playback.savedAt = max(playback.savedAt ?? 0, timestamp)
        playback.nextLocalSaveAt = Date().addingTimeInterval(5)
        return true
    }

    @discardableResult
    func saveProgressLocallyAndRequestUpload(reason: SyncReason) async -> Bool {
        guard await saveProgressLocally(reason: reason) else { return false }
        await progressAccess.uploadPending()
        return true
    }

    public func pause() async {
        guard !isEnded else { return }
        playback.playbackRequestID = UUID()
        playback.resumeAfterInterruption = false
        await engine.pause()
        if playback.acceptedAudio, navigation.audioOperation == nil { await acceptAudioPosition() }
        await saveProgressLocallyAndRequestUpload(reason: .userPausedPlayback)
        scheduleReconciliation(reason: "pause")
    }

    public func togglePlayback() async throws {
        guard !isEnded else { throw CancellationError() }
        let request = UUID()
        playback.playbackRequestID = request
        let playing = await engine.getCurrentState()?.isPlaying ?? false
        guard !isEnded, playback.playbackRequestID == request else { throw CancellationError() }
        if playing { await pause() } else { try await play() }
    }

    public func play() async throws {
        let request = UUID()
        playback.playbackRequestID = request
        await awaitPreparation()
        guard !isEnded, audioKind != nil, playback.playbackRequestID == request else {
            throw CancellationError()
        }
        if let error = lastPrepareError { throw error }
        let peer = navigation.peer
        let revision = beginAudioNavigation()
        defer { finishAudioNavigation(revision) }
        if let peer {
            guard await engine.seekToLocator(peer.locator) else {
                throw SMILPlayerError.invalidPosition
            }
            guard navigation.revision == revision, playback.playbackRequestID == request, !isEnded
            else { throw CancellationError() }
            await acceptAudioPosition()
        }
        guard playback.acceptedAudio, await engine.isPositioned(for: bookID) else {
            throw SMILPlayerError.invalidPosition
        }
        guard navigation.revision == revision, playback.playbackRequestID == request, !isEnded
        else { throw CancellationError() }
        navigation.peer = nil
        if settings.freeBrowseMode != "always" { navigation.browseLocation = nil }
        try await engine.play(automaticRewind: peer == nil)
        guard playback.playbackRequestID == request, !isEnded else { return }
        await acceptAudioPosition()
        playback.origin = .playback
        finishAudioNavigation(revision)
        await saveProgressLocally(reason: .userStartedPlayback)
        scheduleReconciliation(reason: "play")
        await publishPlayback()
    }

    public func setPlaybackRate(_ value: Double) async {
        guard !isEnded, value.isFinite else { return }
        let rate = min(max(value, 0.5), 10)
        await engine.setPlaybackRate(rate)
        navigation.followTimer?.cancel()
        navigation.followTimer = nil
        scheduleReconciliation(reason: "playback rate")
        try? await SettingsActor.shared.updateConfig(defaultPlaybackSpeed: rate)
    }
    public func cyclePlaybackRate() async {
        let current = await engine.getCurrentState()?.playbackRate ?? 1
        await setPlaybackRate(
            Self.playbackRateSteps.first { $0 > current + 0.001 } ?? Self.playbackRateSteps[0]
        )
    }
    public func previousChapter() async {
        let listing = await engine.getChapterListing()
        guard let id = listing.currentChapterID,
            let i = listing.chapters.firstIndex(where: { $0.id == id })
        else { return }
        let elapsed = await engine.getCurrentState()?.chapterElapsed ?? 0
        await selectChapter(id: listing.chapters[max(0, elapsed > 3 ? i : i - 1)].id)
    }
    public func nextChapter() async {
        let listing = await engine.getChapterListing()
        guard let id = listing.currentChapterID,
            let i = listing.chapters.firstIndex(where: { $0.id == id }),
            let next = listing.chapters[safe: i + 1]
        else { return }
        await selectChapter(id: next.id)
    }
    public func selectChapter(id: String) async {
        guard !isEnded, await engine.getLoadedBookID() == bookID else { return }
        let revision = beginAudioNavigation()
        defer { finishAudioNavigation(revision) }
        if await engine.seekToSection(id: id) { await didSeek(revision: revision) }
    }
    func didSeek(revision: UInt64) async {
        guard !isEnded, navigation.revision == revision else { return }
        await acceptAudioPosition()
        guard !isEnded, navigation.revision == revision else { return }
        finishAudioNavigation(revision)
        await saveProgressLocally(reason: .userDraggedSeekBar)
        navigation.peer = nil
        navigation.browseLocation = nil
        navigation.confirmed = nil
        playback.origin = .userAudio
        scheduleReconciliation(reason: "audio seek")
        await publishPlayback()
    }
    public func control(_ command: AudiobookSessionCommand) async throws {
        guard !isEnded else { throw CancellationError() }
        switch command {
            case .togglePlayPause: try await togglePlayback()
            case .skipBackward: await handleRemoteCommand(.skipBackward(Self.skipInterval))
            case .skipForward: await handleRemoteCommand(.skipForward(Self.skipInterval))
            case .previousChapter: await previousChapter()
            case .nextChapter: await nextChapter()
            case .selectChapter(let id): await selectChapter(id: id)
            case .seekChapterFraction(let fraction):
                if let state = await engine.getCurrentState(), fraction.isFinite {
                    let revision = beginAudioNavigation()
                    defer { finishAudioNavigation(revision) }
                    if await engine.seekWithinCurrentChapter(
                        to: state.chapterTotal * min(max(0, fraction), 1)
                    ) {
                        await didSeek(revision: revision)
                    }
                }
            case .setPlaybackRate(let rate): await setPlaybackRate(rate)
            case .setVolume(let volume): await engine.setVolume(volume)
            case .startSleepTimer(let seconds):
                playback.sleepMode = .duration
                playback.sleepDeadline = Date().addingTimeInterval(max(0, seconds))
                playback.sleepChapterID = nil
            case .startEndOfChapterSleepTimer:
                playback.sleepMode = .endOfChapter
                playback.sleepDeadline = nil
                playback.sleepChapterID =
                    (await engine.getChapterListing()).currentChapterID
            case .cancelSleepTimer: cancelSleepTimer()
            case .acceptServerPosition:
                if let offered = playback.offered {
                    await applyIncomingPosition(offered, accepted: true)
                }
            case .declineServerPosition:
                playback.dismissedTimestamp = playback.offered?.timestamp
                playback.offered = nil
        }
        await publishPlayback()
    }
    func cancelSleepTimer() {
        playback.sleepMode = nil
        playback.sleepDeadline = nil
        playback.sleepChapterID = nil
    }
    func handleRemoteCommand(_ command: RemoteCommand) async {
        guard !isEnded else { return }
        switch command {
            case .play: try? await play()
            case .pause: await pause()
            case .togglePlayPause: try? await togglePlayback()
            case .skipForward(let seconds):
                let revision = beginAudioNavigation()
                defer { finishAudioNavigation(revision) }
                await engine.skipForward(seconds: seconds)
                await didSeek(revision: revision)
            case .skipBackward(let seconds):
                let revision = beginAudioNavigation()
                defer { finishAudioNavigation(revision) }
                await engine.skipBackward(seconds: seconds)
                await didSeek(revision: revision)
            case .changePlaybackPosition(let seconds):
                let revision = beginAudioNavigation()
                defer { finishAudioNavigation(revision) }
                if await engine.seekWithinCurrentChapter(to: seconds) {
                    await didSeek(revision: revision)
                }
            case .changePlaybackRate(let rate): await setPlaybackRate(rate)
            case .selectChapter(let id): await selectChapter(id: id)
            case .nextChapter: await nextChapter()
            case .previousChapter: await previousChapter()
            case .nextTrack:
                await handleRemoteCommand(.skipForward(Self.skipInterval))
            case .previousTrack:
                await handleRemoteCommand(.skipBackward(Self.skipInterval))
        }
    }

    func applyIncomingPosition(_ position: IncomingServerPosition, accepted: Bool = false) async {
        guard !isEnded else { return }
        guard position.timestamp > (playback.acceptedAt ?? 0) else {
            playback.offered = nil
            return
        }
        guard accepted || position.timestamp > (playback.dismissedTimestamp ?? 0) else { return }
        playback.offered = position
        let sync = await SettingsActor.shared.config.sync
        guard accepted || sync.autoSyncToNewerServerPosition || sync.liveReadingSyncEnabled else {
            onIncomingServerPosition?(position)
            await publishPlayback()
            return
        }
        guard navigation.pending == nil, navigation.snapshot?.gesture?.active != true else {
            return
        }
        let revision = beginAudioNavigation()
        defer { finishAudioNavigation(revision) }
        if content.hasAudio {
            let restored = await engine.seekToLocator(position.locator)
            if !restored {
                guard !position.locator.type.contains("audio"),
                    let section = findSectionIndex(for: position.locator.href, in: bookStructure),
                    bookStructure[section].mediaOverlay.isEmpty
                else { return }
                await engine.pause()
            }
            guard navigation.revision == revision, !isEnded else { return }
            playback.acceptedAudio = restored
        } else {
            playback.acceptedAudio = false
        }
        playback.accepted = position.locator
        playback.acceptedAt = position.timestamp
        playback.savedAt = position.timestamp
        playback.origin = .remote
        playback.offered = nil
        navigation.peer = nil
        finishAudioNavigation(revision)
        navigation.browseLocation = nil
        navigation.confirmed = nil
        scheduleReconciliation(reason: "accepted remote progress")
        await publishPlayback()
    }

    public func currentSnapshot() async -> AudioSessionSnapshot? {
        guard !isEnded, let kind = audioKind,
            let state = await engine.getCurrentState(), state.bookID == bookID
        else { return nil }
        return AudioSessionSnapshot(
            kind: kind,
            title: metadata.title,
            author: metadata.authors?.first?.name,
            isPlaying: state.isPlaying,
            chapterLabel: state.chapterLabel,
            bookProgress: state.bookTotal > 0 ? state.bookElapsed / state.bookTotal : 0,
            playbackRate: state.playbackRate,
        )
    }
    public func currentState() async -> AudiobookSessionState? {
        guard category == .audio, !isEnded,
            let state = await engine.getCurrentState(), state.bookID == bookID
        else { return nil }
        let listing = await engine.getChapterListing()
        return AudiobookSessionState(
            bookID: bookID.uuid,
            sourceID: bookID.sourceID,
            title: metadata.title,
            author: metadata.authors?.first?.name ?? "",
            isPlaying: state.isPlaying,
            currentTime: state.bookElapsed,
            duration: state.bookTotal,
            bookProgress: state.bookTotal > 0 ? state.bookElapsed / state.bookTotal : 0,
            currentChapterID: listing.currentChapterID,
            currentChapterIndex: listing.chapters.firstIndex { $0.id == listing.currentChapterID },
            chapterElapsed: state.chapterElapsed,
            chapterDuration: state.chapterTotal,
            chapterProgress: state.chapterTotal > 0 ? state.chapterElapsed / state.chapterTotal : 0,
            playbackRate: state.playbackRate,
            volume: state.volume,
            chapters: listing.chapters.map {
                AudiobookSessionChapter(id: $0.id, title: $0.title, duration: $0.duration)
            },
            sleepTimerMode: playback.sleepMode,
            sleepTimerRemaining: playback.sleepDeadline.map { max(0, $0.timeIntervalSinceNow) },
            pendingServerPosition: playback.offered.map {
                AudiobookSessionServerPosition(
                    title: $0.locator.title,
                    totalProgression: $0.locator.locations?.totalProgression,
                )
            },
        )
    }
    func publishPlayback() async {
        guard !isEnded, ActiveReadingSession.shared.current === self else { return }
        let stateSnapshot = await currentState()
        let playbackSnapshot = await currentSnapshot()
        guard !isEnded, ActiveReadingSession.shared.current === self else { return }
        if self.audiobookState != stateSnapshot { self.audiobookState = stateSnapshot }
        if self.playbackSnapshot != playbackSnapshot { self.playbackSnapshot = playbackSnapshot }
        guard let state = await engine.getCurrentState(),
            state.bookID == bookID,
            !isEnded
        else { return }
        let listing = await engine.getChapterListing()
        guard !isEnded else { return }
        if chapters != listing { chapters = listing }
        await StorytellerPlatform.nowPlaying?.update(
            NowPlayingInfo(
                title: metadata.title,
                artist: metadata.authors?.first?.name,
                albumTitle: state.chapterLabel,
                duration: state.chapterTotal,
                elapsedTime: state.chapterElapsed,
                playbackRate: state.playbackRate,
                isPlaying: state.isPlaying,
                artwork: playback.cover,
            )
        )
        await StorytellerPlatform.nowPlaying?.updateChapters(
            NowPlayingChapters(
                currentChapterID: listing.currentChapterID,
                currentChapterIndex: listing.chapters.firstIndex {
                    $0.id == listing.currentChapterID
                },
                chapters: listing.chapters.map {
                    NowPlayingChapter(id: $0.id, title: $0.title, duration: $0.duration)
                },
            )
        )
    }
    func stopPlaybackSession() async {
        playback.timer?.cancel()
        playback.timer = nil
        if let id = playback.observerID {
            await engine.removeStateObserver(id: id)
        }
        playback.observerID = nil
        if await engine.getLoadedBookID() == bookID {
            await engine.pause()
            await saveProgressLocally(reason: .userClosedBook)
            await engine.cleanup()
            await StorytellerPlatform.nowPlaying?.teardownCommands()
            await StorytellerPlatform.nowPlaying?.clear()
        }
    }
}

extension ReadingSession {
    public func handlePlaybackCommand(_ command: RemoteCommand) async {
        await handleRemoteCommand(command)
    }
    public func setVolume(_ value: Double) async {
        guard !isEnded else { return }
        await engine.setVolume(value)
    }
    public func seekToEntry(sectionIndex: Int, entryIndex: Int) async throws {
        guard !isEnded, await engine.getLoadedBookID() == bookID else {
            throw CancellationError()
        }
        let revision = beginAudioNavigation()
        defer { finishAudioNavigation(revision) }
        try await engine.seekToEntry(
            sectionIndex: sectionIndex,
            entryIndex: entryIndex,
        )
        await didSeek(revision: revision)
    }
    public func seekToProgress(_ fraction: Double) async -> Bool {
        guard !isEnded, await engine.getLoadedBookID() == bookID else {
            return false
        }
        let revision = beginAudioNavigation()
        defer { finishAudioNavigation(revision) }
        let success = await engine.seekToTotalProgression(fraction)
        if success { await didSeek(revision: revision) }
        return success
    }
    public func restoreLocator(_ locator: BookLocator) async {
        if let offered = playback.offered, offered.locator == locator {
            await applyIncomingPosition(offered, accepted: true)
        } else if ebookFileFormat == .cbz {
            guard let index = nativePageIndex(for: locator) else {
                lastSyncResult = .failed("Native reading position is unavailable")
                return
            }
            selectNativePage(index)
            await saveProgressLocally(reason: .userRestoredFromHistory)
        } else if content.hasAudio, locator.type.contains("audio") {
            let revision = beginAudioNavigation()
            defer { finishAudioNavigation(revision) }
            if await engine.seekToLocator(locator) { await didSeek(revision: revision) }
        } else {
            // Restoring a bookmark or history entry counts as new activity.
            requestReaderNavigation(.location(locator), reason: .userRestoredFromHistory)
            _ = await ensureSynced(reason: "explicit locator")
        }
    }
}
