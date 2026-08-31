import Foundation

public struct AudioPositionSyncData: Sendable {
    public let sectionIndex: Int
    public let entryIndex: Int
    public let currentTime: Double
    public let audioFile: String
    public let href: String
    public let fragment: String

    public init(
        sectionIndex: Int,
        entryIndex: Int,
        currentTime: Double,
        audioFile: String,
        href: String,
        fragment: String,
    ) {
        self.sectionIndex = sectionIndex
        self.entryIndex = entryIndex
        self.currentTime = currentTime
        self.audioFile = audioFile
        self.href = href
        self.fragment = fragment
    }
}

public enum SMILPlayerError: Error, LocalizedError {
    case noMediaOverlay
    case bookNotLoaded
    case audioLoadFailed(String)
    case invalidPosition
    case playbackUnavailable

    public var errorDescription: String? {
        switch self {
            case .noMediaOverlay:
                return "Book does not contain audio narration"
            case .bookNotLoaded:
                return "No book is currently loaded"
            case .audioLoadFailed(let reason):
                return "Failed to load audio: \(reason)"
            case .invalidPosition:
                return "Invalid playback position"
            case .playbackUnavailable:
                return "Audio playback is unavailable on this platform"
        }
    }
}

public struct SMILPlaybackState: Sendable {
    public let isPlaying: Bool
    public let currentSectionIndex: Int
    public let currentEntryIndex: Int
    public let currentFragment: String
    public let chapterLabel: String?
    public let chapterElapsed: Double
    public let chapterTotal: Double
    public let bookElapsed: Double
    public let bookTotal: Double
    public let playbackRate: Double
    public let volume: Double
    public let bookID: BookID?
    /// Increments on deliberate seeks, never on auto-advance.
    public let userSeekCount: Int

    public init(
        isPlaying: Bool,
        currentSectionIndex: Int,
        currentEntryIndex: Int,
        currentFragment: String,
        chapterLabel: String?,
        chapterElapsed: Double,
        chapterTotal: Double,
        bookElapsed: Double,
        bookTotal: Double,
        playbackRate: Double,
        volume: Double,
        bookID: BookID?,
        userSeekCount: Int = 0,
    ) {
        self.isPlaying = isPlaying
        self.currentSectionIndex = currentSectionIndex
        self.currentEntryIndex = currentEntryIndex
        self.currentFragment = currentFragment
        self.chapterLabel = chapterLabel
        self.chapterElapsed = chapterElapsed
        self.chapterTotal = chapterTotal
        self.bookElapsed = bookElapsed
        self.bookTotal = bookTotal
        self.playbackRate = playbackRate
        self.volume = volume
        self.bookID = bookID
        self.userSeekCount = userSeekCount
    }
}

public enum ActiveAudioPlayer: Sendable {
    case none
    case smil
    case audiobook
}

@globalActor
public actor SMILPlayerActor {
    public static let shared = SMILPlayerActor()

    public private(set) var activeAudioPlayer: ActiveAudioPlayer = .none

    public func setActiveAudioPlayer(_ player: ActiveAudioPlayer) {
        activeAudioPlayer = player
        debugLog("[SMILPlayerActor] Active audio player set to: \(player)")
    }

    private var player: (any AudioPlaying)?
    private var bookStructure: [SectionInfo] = []
    private var tocEntries: [TocEntry] = []
    private var cachedBookTotal: Double = 0
    private var cachedChapterStartCumSums: [Int: Double] = [:]
    private var epubPath: URL?
    private var bookID: BookID?
    private var bookTitle: String?
    private var bookAuthor: String?

    private var currentSectionIndex: Int = 0
    private var currentEntryIndex: Int = 0
    private var currentAudioFile: String = ""
    private var currentEntryBeginTime: Double = 0
    private var currentEntryEndTime: Double = 0

    private var isPlaying: Bool = false
    private var rewind = AutomaticRewind()
    private var playbackRate: Double = 1.0
    private var volume: Double = 1.0

    private var updateTask: Task<Void, Never>?
    private var advanceSuppressionCount: Int = 0
    private var userSeekCount: Int = 0

    private var stateObservers: [UUID: @Sendable @StorytellerUIActor (SMILPlaybackState) -> Void] =
        [:]
    private var sessionID = UUID()

    private init() {}

    /// Returns false when the book was already loaded and its position preserved.
    @discardableResult
    public func loadBook(
        epubPath: URL,
        bookID: BookID,
        title: String?,
        author: String?,
    ) async throws -> Bool {
        debugLog(
            "[SMILPlayerActor] Loading book: \(bookID) from \(epubPath.path) (existingBookID=\(self.bookID?.description ?? "nil"), structureCount=\(bookStructure.count))"
        )

        guard let factory = StorytellerPlatform.audioPlayerFactory else {
            throw SMILPlayerError.playbackUnavailable
        }

        if self.bookID == bookID && !bookStructure.isEmpty {
            debugLog("[SMILPlayerActor] Same book already loaded, skipping reload")
            sessionID = UUID()
            try? await factory.prepareSession(longForm: true)
            await notifyStateChange()
            return false
        }

        sessionID = UUID()
        await clearBookState()

        let result = try SMILParser.parseEPUB(at: epubPath)

        guard result.sections.contains(where: { !$0.mediaOverlay.isEmpty }) else {
            throw SMILPlayerError.noMediaOverlay
        }

        self.bookStructure = result.sections
        self.tocEntries = result.tocEntries
        self.epubPath = epubPath
        self.bookID = bookID
        self.bookTitle = title
        self.bookAuthor = author
        self.currentSectionIndex = 0
        self.currentEntryIndex = 0

        computeCachedTotals()

        try? await factory.prepareSession(longForm: true)
        setActiveAudioPlayer(.smil)

        debugLog("[SMILPlayerActor] Book loaded with \(result.sections.count) sections")
        await notifyStateChange()
        return true
    }

    public func getBookStructure() -> [SectionInfo] {
        return bookStructure
    }

    /// Chapter list plus the playing chapter, read together so a caller cannot
    /// pair a list with a position from a different book.
    public func getChapterListing() -> SMILChapterListing {
        SMILChapterListing(
            chapters: getChapterSummaries(),
            currentChapterID: bookStructure[safe: currentSectionIndex]?.id,
        )
    }

    /// Narration-free spine items are not selectable, so they are omitted and
    /// fallback numbering runs over what remains.
    public func getChapterSummaries() -> [SMILChapterSummary] {
        bookStructure
            .filter { !$0.mediaOverlay.isEmpty }
            .enumerated()
            .map { offset, section in
                let start = cachedChapterStartCumSums[section.index] ?? 0
                let end = section.mediaOverlay.last?.cumSumAtEnd ?? start
                return SMILChapterSummary(
                    id: section.id,
                    title: section.label ?? "Chapter \(offset + 1)",
                    duration: max(0, end - start),
                    sectionIndex: section.index,
                )
            }
    }

    public func seekToSection(id: String) async -> Bool {
        guard let index = findSectionIndex(for: id, in: bookStructure) else { return false }
        do {
            try await seekToEntry(sectionIndex: index, entryIndex: 0)
            return true
        } catch {
            debugLog("[SMILPlayerActor] seekToSection failed for \(id): \(error)")
            return false
        }
    }

    public func getTocEntries() -> [TocEntry] {
        return tocEntries
    }

    public func getLoadedBookID() -> BookID? {
        return bookID
    }

    public func getLoadedBookTitle() -> String? {
        return bookTitle
    }

    public func play(automaticRewind: Bool = false) async throws {
        guard !bookStructure.isEmpty else {
            throw SMILPlayerError.bookNotLoaded
        }

        if player == nil {
            try await loadCurrentEntry()
        }

        if automaticRewind {
            let seconds = rewind.secondsOnResume(
                config: await SettingsActor.shared.config.playback
            )
            if seconds > 0 {
                await skipBackward(seconds: seconds)
            }
        }

        guard let player = player else {
            throw SMILPlayerError.audioLoadFailed("Player not initialized")
        }

        if let factory = StorytellerPlatform.audioPlayerFactory {
            try? await factory.prepareSession(longForm: true)
        }

        await player.setRate(playbackRate)
        await player.play()
        isPlaying = true
        startUpdateTimer()

        debugLog("[SMILPlayerActor] Playing")
        await notifyStateChange()
    }

    public func pause() async {
        guard let player = player else { return }

        await player.pause()
        isPlaying = false
        rewind.recordPause()
        stopUpdateTimer()

        debugLog("[SMILPlayerActor] Paused")
        await notifyStateChange()
    }

    public func togglePlayPause(automaticRewind: Bool = true) async throws {
        if isPlaying {
            await pause()
        } else {
            try await play(automaticRewind: automaticRewind)
        }
    }

    public func seekToEntry(sectionIndex: Int, entryIndex: Int) async throws {
        guard sectionIndex >= 0 && sectionIndex < bookStructure.count else {
            throw SMILPlayerError.invalidPosition
        }

        let section = bookStructure[sectionIndex]
        guard entryIndex >= 0 && entryIndex < section.mediaOverlay.count else {
            throw SMILPlayerError.invalidPosition
        }

        let entry = section.mediaOverlay[entryIndex]
        userSeekCount += 1
        rewind.reset()
        await setCurrentEntry(
            sectionIndex: sectionIndex,
            entryIndex: entryIndex,
            audioFile: entry.audioFile,
            beginTime: entry.begin,
            endTime: entry.end,
        )
    }

    public func seekToFragment(sectionIndex: Int, textId: String) async -> Bool {
        guard sectionIndex >= 0 && sectionIndex < bookStructure.count else {
            debugLog("[SMILPlayerActor] seekToFragment - invalid section: \(sectionIndex)")
            return false
        }

        let section = bookStructure[sectionIndex]
        guard let entryIndex = section.mediaOverlay.firstIndex(where: { $0.textId == textId })
        else {
            debugLog("[SMILPlayerActor] seekToFragment - textId not found: \(textId)")
            return false
        }

        let entry = section.mediaOverlay[entryIndex]
        userSeekCount += 1
        rewind.reset()
        await setCurrentEntry(
            sectionIndex: sectionIndex,
            entryIndex: entryIndex,
            audioFile: entry.audioFile,
            beginTime: entry.begin,
            endTime: entry.end,
        )
        return true
    }

    public func seekToLocator(_ locator: BookLocator) async -> Bool {
        switch resolveLocatorSeek(locator: locator, sections: bookStructure) {
            case .fragment(let sectionIndex, let textId):
                if await seekToFragment(sectionIndex: sectionIndex, textId: textId) {
                    return true
                }
                if let progression = locator.locations?.totalProgression,
                    progression > 0, progression <= 1
                {
                    return await seekToTotalProgression(progression)
                }
                return false
            case .totalProgression(let progression):
                return await seekToTotalProgression(progression)
            case .none:
                debugLog("[SMILPlayerActor] seekToLocator - no usable position in locator")
                return false
        }
    }

    public func seekToTotalProgression(_ progression: Double) async -> Bool {
        guard let (sectionIndex, entryIndex, entry, offset) =
            findEntryByTotalProgression(progression)
        else {
            return false
        }

        userSeekCount += 1
        rewind.reset()
        await setCurrentEntry(
            sectionIndex: sectionIndex,
            entryIndex: entryIndex,
            audioFile: entry.audioFile,
            beginTime: entry.begin,
            endTime: entry.end,
            offsetIntoEntry: offset,
        )
        return true
    }

    /// Seeks to `seconds` measured from the start of the playing section.
    public func seekWithinCurrentChapter(to seconds: Double) async -> Bool {
        guard cachedBookTotal > 0, currentSectionIndex < bookStructure.count else { return false }
        let section = bookStructure[currentSectionIndex]
        guard let lastEntry = section.mediaOverlay.last else { return false }
        let start = cachedChapterStartCumSums[section.index] ?? 0
        let clamped = min(max(seconds, 0), max(0, lastEntry.cumSumAtEnd - start))
        return await seekToTotalProgression((start + clamped) / cachedBookTotal)
    }

    public func findPositionByTotalProgression(_ progression: Double) -> (
        sectionIndex: Int, textId: String
    )? {
        guard let (sectionIndex, _, entry, _) = findEntryByTotalProgression(progression) else {
            return nil
        }
        return (sectionIndex, entry.textId)
    }

    private func findEntryByTotalProgression(_ progression: Double) -> (
        sectionIndex: Int, entryIndex: Int, entry: SMILEntry, offsetIntoEntry: Double
    )? {
        guard !bookStructure.isEmpty else { return nil }

        var totalDuration: Double = 0
        for section in bookStructure.reversed() {
            if let lastEntry = section.mediaOverlay.last {
                totalDuration = lastEntry.cumSumAtEnd
                break
            }
        }

        guard totalDuration > 0 else { return nil }

        let targetTime = progression * totalDuration
        debugLog(
            "[SMILPlayerActor] findEntryByTotalProgression: \(progression) -> targetTime \(targetTime)s of \(totalDuration)s"
        )

        guard let match = findEntry(atTotalTime: targetTime, in: bookStructure) else { return nil }
        let entry = bookStructure[match.sectionIndex].mediaOverlay[match.entryIndex]
        return (match.sectionIndex, match.entryIndex, entry, match.offsetIntoEntry)
    }

    public func skipForward(seconds: Double = 15) async {
        await skip(by: seconds)
    }

    public func skipBackward(seconds: Double = 15) async {
        await skip(by: -seconds)
    }

    private func skip(by delta: Double) async {
        guard !bookStructure.isEmpty, cachedBookTotal > 0 else { return }
        guard let state = await buildCurrentState() else { return }
        let target = skipTarget(
            fromBookElapsed: state.bookElapsed,
            by: delta,
            bookTotal: cachedBookTotal,
        )
        _ = await seekToTotalProgression(target / cachedBookTotal)
    }

    public func setPlaybackRate(_ rate: Double) async {
        playbackRate = rate
        await player?.setRate(rate)
        debugLog("[SMILPlayerActor] Playback rate set to \(rate)")
        await notifyStateChange()
    }

    public func setVolume(_ newVolume: Double) async {
        volume = newVolume
        await player?.setVolume(newVolume)
        debugLog("[SMILPlayerActor] Volume set to \(newVolume)")
    }

    public func getCurrentState() async -> SMILPlaybackState? {
        guard !bookStructure.isEmpty else { return nil }
        return await buildCurrentState()
    }

    public func getCurrentEntry() -> SMILEntry? {
        guard currentSectionIndex < bookStructure.count else { return nil }
        let section = bookStructure[currentSectionIndex]
        guard currentEntryIndex < section.mediaOverlay.count else { return nil }
        return section.mediaOverlay[currentEntryIndex]
    }

    public func getCurrentPosition() -> (sectionIndex: Int, entryIndex: Int) {
        return (currentSectionIndex, currentEntryIndex)
    }

    public func addStateObserver(
        id: UUID = UUID(),
        observer: @escaping @Sendable @StorytellerUIActor (SMILPlaybackState) -> Void,
    ) async -> UUID {
        stateObservers[id] = observer
        if let state = await buildCurrentState() {
            await observer(state)
        }
        return id
    }

    public func removeStateObserver(id: UUID) async {
        stateObservers.removeValue(forKey: id)
    }

    public func getBackgroundSyncData() async -> AudioPositionSyncData? {
        guard !bookStructure.isEmpty else { return nil }
        guard currentSectionIndex < bookStructure.count else { return nil }
        let section = bookStructure[currentSectionIndex]
        guard currentEntryIndex < section.mediaOverlay.count else { return nil }

        let entry = section.mediaOverlay[currentEntryIndex]
        let currentTime = await player?.currentTime ?? 0

        return AudioPositionSyncData(
            sectionIndex: currentSectionIndex,
            entryIndex: currentEntryIndex,
            currentTime: currentTime,
            audioFile: currentAudioFile,
            href: entry.textHref,
            fragment: entry.textId,
        )
    }

    public func reconcilePositionFromPlayer() async {
        guard let player = player else { return }
        let currentTime = await player.currentTime
        reconcileEntryFromTime(currentTime)
    }

    private func computeCachedTotals() {
        cachedBookTotal = 0
        cachedChapterStartCumSums = [:]

        var lastCumSum: Double = 0
        for section in bookStructure {
            if !section.mediaOverlay.isEmpty {
                cachedChapterStartCumSums[section.index] = lastCumSum
                if let lastEntry = section.mediaOverlay.last {
                    lastCumSum = lastEntry.cumSumAtEnd
                }
            }
        }
        cachedBookTotal = lastCumSum
    }

    private func clearBookState() async {
        debugLog("[SMILPlayerActor] Clearing book state")
        stopUpdateTimer()
        await player?.stop()
        player = nil

        if let tempFile = tempAudioFileURL {
            try? FileManager.default.removeItem(at: tempFile)
            tempAudioFileURL = nil
        }

        bookStructure = []
        tocEntries = []
        cachedBookTotal = 0
        cachedChapterStartCumSums = [:]
        epubPath = nil
        bookID = nil
        bookTitle = nil
        bookAuthor = nil
        currentSectionIndex = 0
        currentEntryIndex = 0
        currentAudioFile = ""
        isPlaying = false
    }

    public func cleanup(expectedSessionID: UUID? = nil) async {
        if let expectedSessionID, expectedSessionID != sessionID {
            debugLog("[SMILPlayerActor] Cleanup skipped due to session mismatch")
            return
        }

        debugLog("[SMILPlayerActor] Cleanup: activeAudioPlayer=\(activeAudioPlayer)")
        await clearBookState()

        if activeAudioPlayer == .smil {
            activeAudioPlayer = .none
        }
        await StorytellerPlatform.audioPlayerFactory?.deactivateSession()
    }

    /// `offsetIntoEntry` lands partway through the entry; callers navigating to
    /// an entry leave it at zero to start from its beginning.
    private func setCurrentEntry(
        sectionIndex: Int,
        entryIndex: Int,
        audioFile: String,
        beginTime: Double,
        endTime: Double,
        offsetIntoEntry: Double = 0,
    ) async {
        debugLog(
            "[SMILPlayerActor] setCurrentEntry: section=\(sectionIndex), entry=\(entryIndex), file=\(audioFile)"
        )

        currentSectionIndex = sectionIndex
        currentEntryIndex = entryIndex
        currentEntryBeginTime = beginTime
        currentEntryEndTime = endTime

        // Loading suspends, and actors are reentrant, so the update tick could
        // otherwise compare the new entry's end against the old file's position
        // and auto-advance over the position being set here.
        advanceSuppressionCount += 1
        defer { advanceSuppressionCount -= 1 }

        let reloadedAudioFile = audioFile != currentAudioFile
        if reloadedAudioFile {
            currentAudioFile = audioFile
            await loadAudioFile(audioFile)
        }

        if let player = player {
            let duration = await player.duration
            let timeBefore = await player.currentTime
            let target = beginTime + min(max(offsetIntoEntry, 0), max(0, endTime - beginTime))
            debugLog(
                "[SMILPlayerActor] setCurrentEntry: BEFORE seek - currentTime=\(timeBefore), duration=\(duration), target=\(target)"
            )
            await player.seek(to: target)
            let timeAfter = await player.currentTime
            debugLog(
                "[SMILPlayerActor] setCurrentEntry: AFTER seek - currentTime=\(timeAfter)"
            )
            // Loading leaves the new file paused, so a seek that crosses an
            // audio file has to restart it or the timer counts against silence.
            if reloadedAudioFile && isPlaying {
                await player.play()
            }
        }

        await notifyStateChange()
    }

    private func loadCurrentEntry() async throws {
        guard currentSectionIndex < bookStructure.count else {
            throw SMILPlayerError.invalidPosition
        }

        let section = bookStructure[currentSectionIndex]

        if section.mediaOverlay.isEmpty {
            if let nextSection = bookStructure.first(where: {
                $0.index > currentSectionIndex && !$0.mediaOverlay.isEmpty
            }) {
                currentSectionIndex = nextSection.index
                currentEntryIndex = 0
                let entry = nextSection.mediaOverlay[0]
                currentAudioFile = entry.audioFile
                currentEntryBeginTime = entry.begin
                currentEntryEndTime = entry.end
            } else {
                throw SMILPlayerError.noMediaOverlay
            }
        } else if currentEntryIndex >= section.mediaOverlay.count {
            currentEntryIndex = 0
            let entry = section.mediaOverlay[0]
            currentAudioFile = entry.audioFile
            currentEntryBeginTime = entry.begin
            currentEntryEndTime = entry.end
        } else {
            let entry = section.mediaOverlay[currentEntryIndex]
            currentAudioFile = entry.audioFile
            currentEntryBeginTime = entry.begin
            currentEntryEndTime = entry.end
        }

        await loadAudioFile(currentAudioFile)
        if let player = player {
            await player.seek(to: currentEntryBeginTime)
        }
    }

    private var tempAudioFileURL: URL?

    private func loadAudioFile(_ relativeAudioFile: String) async {
        guard let epubPath = epubPath else {
            debugLog("[SMILPlayerActor] No EPUB path for audio loading")
            return
        }

        debugLog("[SMILPlayerActor] Loading audio file: \(relativeAudioFile)")

        do {
            // Clean up previous temp file
            if let oldTemp = tempAudioFileURL {
                try? FileManager.default.removeItem(at: oldTemp)
            }

            let tempDir = FileManager.default.temporaryDirectory
            let ext = (relativeAudioFile as NSString).pathExtension
            let tempFile = tempDir.appendingPathComponent("smil_audio_\(UUID().uuidString).\(ext)")
            tempAudioFileURL = tempFile

            try await FilesystemActor.shared.extractAudioToFile(
                from: epubPath,
                audioPath: relativeAudioFile,
                destination: tempFile,
            )

            debugLog("[SMILPlayerActor] Extracted to temp file: \(tempFile.path)")

            let audioPlayer: any AudioPlaying
            if let existing = player {
                audioPlayer = existing
            } else {
                guard let factory = StorytellerPlatform.audioPlayerFactory else {
                    debugLog("[SMILPlayerActor] No audio player factory available")
                    return
                }
                audioPlayer = factory.makePlayer(profile: .smilSegment)
                await audioPlayer.setEventHandler { event in
                    Task { @SMILPlayerActor in
                        await SMILPlayerActor.shared.handlePlayerEvent(event)
                    }
                }
                player = audioPlayer
            }

            await audioPlayer.setVolume(volume)
            await audioPlayer.setRate(playbackRate)
            let duration = try await audioPlayer.load(url: tempFile)
            debugLog("[SMILPlayerActor] Audio loaded, duration: \(duration)s")
        } catch {
            debugLog("[SMILPlayerActor] Failed to load audio: \(error)")
        }
    }

    private func handlePlayerEvent(_ event: AudioPlayerEvent) async {
        switch event {
            case .didFinishPlaying:
                debugLog("[SMILPlayerActor] Audio finished playing")
                await handleAudioFinished()
            case .interruptionBegan:
                debugLog("[SMILPlayerActor] Audio session interrupted - pausing")
                await pause()
            case .interruptionEnded(let shouldResume):
                if shouldResume {
                    debugLog("[SMILPlayerActor] Audio interruption ended - resuming")
                    try? await play(automaticRewind: true)
                }
            case .routeChanged(let shouldPause):
                if shouldPause {
                    debugLog("[SMILPlayerActor] Audio route lost - pausing")
                    await pause()
                }
        }
    }

    // Task.sleep loops instead of RunLoop timers: nothing drives the main
    // RunLoop on Android, so a Timer there never fires.
    private func startUpdateTimer() {
        stopUpdateTimer()
        updateTask = Task { @SMILPlayerActor in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(200))
                guard !Task.isCancelled else { return }
                await SMILPlayerActor.shared.timerFired()
            }
        }
        debugLog("[SMILPlayerActor] Update timer started")
    }

    private func stopUpdateTimer() {
        updateTask?.cancel()
        updateTask = nil
    }

    private func timerFired() async {
        // A tick spawned before pause() cancelled the loop could otherwise
        // flip isPlaying back on in the file-end branch below.
        guard updateTask != nil else {
            debugLog("[SMILPlayerActor] Ignoring update tick after timer stop")
            return
        }
        guard let player = player else { return }

        let currentTime = await player.currentTime
        let duration = await player.duration
        let tolerance = 0.02

        let reachedEntryEnd = currentTime >= currentEntryEndTime - tolerance
        let reachedFileEnd = duration > 0 && currentTime >= duration - tolerance

        let shouldAdvanceForEntryEnd = reachedEntryEnd && nextEntryUsingSameAudioFile()

        if isPlaying && (shouldAdvanceForEntryEnd || reachedFileEnd) {
            await advanceToNextEntry()
        } else if !isPlaying && reachedFileEnd {
            debugLog("[SMILPlayerActor] Audio file ended naturally, advancing...")
            isPlaying = true
            await advanceToNextEntry()
        }

        await notifyStateChange()
    }

    private func handleAudioFinished() async {
        guard isPlaying else {
            debugLog("[SMILPlayerActor] handleAudioFinished called but not playing, ignoring")
            return
        }

        debugLog("[SMILPlayerActor] handleAudioFinished - advancing to next entry/chapter")
        await advanceToNextEntry()
    }

    private func advanceToNextEntry() async {
        guard advanceSuppressionCount == 0 else {
            debugLog("[SMILPlayerActor] advanceToNextEntry already in progress, skipping")
            return
        }
        advanceSuppressionCount += 1
        defer { advanceSuppressionCount -= 1 }

        guard currentSectionIndex < bookStructure.count else {
            debugLog(
                "[SMILPlayerActor] End of book - currentSectionIndex \(currentSectionIndex) >= count \(bookStructure.count)"
            )
            await pause()
            return
        }

        let section = bookStructure[currentSectionIndex]
        let nextEntryIndex = currentEntryIndex + 1

        debugLog(
            "[SMILPlayerActor] advanceToNextEntry: section=\(currentSectionIndex), nextEntry=\(nextEntryIndex), overlayCount=\(section.mediaOverlay.count)"
        )

        if nextEntryIndex < section.mediaOverlay.count {
            let nextEntry = section.mediaOverlay[nextEntryIndex]
            currentEntryIndex = nextEntryIndex
            currentEntryBeginTime = nextEntry.begin
            currentEntryEndTime = nextEntry.end

            if nextEntry.audioFile != currentAudioFile {
                currentAudioFile = nextEntry.audioFile
                await loadAudioFile(nextEntry.audioFile)
                if let player = player {
                    await player.seek(to: nextEntry.begin)
                    if isPlaying {
                        await player.setRate(playbackRate)
                        await player.play()
                    }
                }
            }

            debugLog(
                "[SMILPlayerActor] Advanced to entry \(nextEntryIndex) in section \(currentSectionIndex)"
            )
            await notifyStateChange()
        } else {
            let nextSectionIndex = currentSectionIndex + 1
            debugLog(
                "[SMILPlayerActor] Section \(currentSectionIndex) complete, looking for next section >= \(nextSectionIndex)"
            )
            if let nextSection = bookStructure.first(where: {
                $0.index >= nextSectionIndex && !$0.mediaOverlay.isEmpty
            }) {
                let nextEntry = nextSection.mediaOverlay[0]
                currentSectionIndex = nextSection.index
                currentEntryIndex = 0
                currentEntryBeginTime = nextEntry.begin
                currentEntryEndTime = nextEntry.end
                currentAudioFile = nextEntry.audioFile

                await loadAudioFile(nextEntry.audioFile)
                if let player = player {
                    await player.seek(to: nextEntry.begin)
                    if isPlaying {
                        await player.setRate(playbackRate)
                        await player.play()
                    }
                }

                debugLog("[SMILPlayerActor] Advanced to section \(nextSection.index)")
                await notifyStateChange()
            } else {
                debugLog("[SMILPlayerActor] End of book reached")
                await pause()
            }
        }
    }

    private func reconcileEntryFromTime(_ time: Double) {
        guard currentSectionIndex < bookStructure.count else { return }

        let section = bookStructure[currentSectionIndex]
        for (index, entry) in section.mediaOverlay.enumerated() {
            if entry.audioFile == currentAudioFile && time >= entry.begin && time < entry.end {
                if index != currentEntryIndex {
                    currentEntryIndex = index
                    currentEntryBeginTime = entry.begin
                    currentEntryEndTime = entry.end
                }
                return
            }
        }

        debugLog(
            "[SMILPlayerActor] reconcileEntryFromTime: no matching entry for time \(time) in audioFile \(currentAudioFile)"
        )
    }

    private func nextEntryUsingSameAudioFile() -> Bool {
        guard currentSectionIndex < bookStructure.count else { return false }

        let section = bookStructure[currentSectionIndex]
        let nextEntryIndex = currentEntryIndex + 1

        if nextEntryIndex < section.mediaOverlay.count {
            return section.mediaOverlay[nextEntryIndex].audioFile == currentAudioFile
        }

        let nextSectionIndex = currentSectionIndex + 1
        if let nextSection = bookStructure.first(where: {
            $0.index >= nextSectionIndex && !$0.mediaOverlay.isEmpty
        }) {
            return nextSection.mediaOverlay[0].audioFile == currentAudioFile
        }

        return false
    }

    private func buildCurrentState() async -> SMILPlaybackState? {
        guard !bookStructure.isEmpty else { return nil }

        let currentTime = await player?.currentTime ?? 0

        var chapterLabel: String? = nil
        var chapterElapsed: Double = 0
        var chapterTotal: Double = 0
        var bookElapsed: Double = 0
        let bookTotal = cachedBookTotal

        if currentSectionIndex < bookStructure.count {
            let section = bookStructure[currentSectionIndex]
            chapterLabel = section.label

            if !section.mediaOverlay.isEmpty {
                let chapterStartCumSum = cachedChapterStartCumSums[section.index] ?? 0

                if let lastEntry = section.mediaOverlay.last {
                    chapterTotal = lastEntry.cumSumAtEnd - chapterStartCumSum
                }

                if currentEntryIndex < section.mediaOverlay.count {
                    let entry = section.mediaOverlay[currentEntryIndex]
                    let entryCumSum =
                        currentEntryIndex > 0
                        ? section.mediaOverlay[currentEntryIndex - 1].cumSumAtEnd
                        : chapterStartCumSum
                    let entryDuration = max(0, entry.end - entry.begin)
                    let timeInEntry = min(max(0, currentTime - entry.begin), entryDuration)
                    bookElapsed = entryCumSum + timeInEntry
                    chapterElapsed = bookElapsed - chapterStartCumSum
                }
            }
        }

        let currentFragment: String
        if currentSectionIndex < bookStructure.count {
            let section = bookStructure[currentSectionIndex]
            if currentEntryIndex < section.mediaOverlay.count {
                let entry = section.mediaOverlay[currentEntryIndex]
                currentFragment = "\(entry.textHref)#\(entry.textId)"
            } else {
                currentFragment = section.id
            }
        } else {
            currentFragment = ""
        }

        return SMILPlaybackState(
            isPlaying: isPlaying,
            currentSectionIndex: currentSectionIndex,
            currentEntryIndex: currentEntryIndex,
            currentFragment: currentFragment,
            chapterLabel: chapterLabel,
            chapterElapsed: chapterElapsed,
            chapterTotal: chapterTotal,
            bookElapsed: bookElapsed,
            bookTotal: bookTotal,
            playbackRate: playbackRate,
            volume: volume,
            bookID: bookID,
            userSeekCount: userSeekCount,
        )
    }

    private func notifyStateChange() async {
        guard let state = await buildCurrentState() else { return }

        for observer in stateObservers.values {
            await observer(state)
        }
    }

}
