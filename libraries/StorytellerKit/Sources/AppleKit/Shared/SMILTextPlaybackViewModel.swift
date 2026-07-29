#if canImport(AVFoundation)
import Foundation
import Observation
#if os(tvOS)
import UIKit
#endif

@MainActor
@Observable
public final class SMILTextPlaybackViewModel: NSObject {

    public var isPlaying = false
    public var isLoadingPosition = true
    public var currentTime: Double = 0
    public var chapterDuration: Double = 0
    public var bookElapsed: Double = 0
    public var bookDuration: Double = 0
    public var chapterTitle: String = ""
    public var bookTitle: String = ""
    public var playbackRate: Double = 1.0

    #if os(watchOS)
    public var volume: Double = 1.0
    public var isMuted = false
    private var volumeBeforeMute: Double = 1.0
    private static let volumeKey = "WatchPlayerVolume"
    private static let minimumVolume = 0.05
    #endif

    public var currentSectionIndex: Int = 0
    public var currentEntryIndex: Int = 0

    private var currentSectionHTML: String = ""
    private var cachedSectionHref: String = ""
    private var chapterTextByIndex: [String] = []

    private var stateObserverId: UUID?
    private var bookStructure: [SectionInfo] = []
    private var epubURL: URL?
    private var currentBookID: BookID?
    private var lastSyncTime: Date = .distantPast
    private let syncDebounceInterval: TimeInterval = 10
    private var hasRestoredPosition = false
    private var hasUserProgress = false
    private var periodicSyncTask: Task<Void, Never>?
    private var sentenceNavigationTask: Task<Void, Never>?
    private static let periodicSyncInterval: TimeInterval = 60

    public var showServerPositionDialog = false
    public var pendingServerPosition: IncomingServerPosition? = nil
    private var incomingPositionObserverId: UUID? = nil
    private var positionObserverRegistrationTask: Task<Void, Never>? = nil

    #if os(tvOS)
    private let logPrefix = "TVPlayerViewModel"
    private let syncSourceIdentifier = "TV Player"
    #elseif os(watchOS)
    private let logPrefix = "WatchPlayerViewModel"
    private let syncSourceIdentifier = "Watch Player"
    #else
    private let logPrefix = "SMILTextPlaybackViewModel"
    private let syncSourceIdentifier = "Text Player"
    #endif

    public struct ChapterInfo: Identifiable {
        public let index: Int
        public let label: String
        public var id: Int { index }
    }

    public var chapters: [ChapterInfo] {
        bookStructure
            .filter { !$0.mediaOverlay.isEmpty }
            .enumerated()
            .map { chapterNum, section in
                ChapterInfo(
                    index: section.index,
                    label: section.label ?? "Chapter \(chapterNum + 1)",
                )
            }
    }

    public var hasChapters: Bool {
        bookStructure.count > 1
    }

    private func chapterLabel(forSectionIndex sectionIndex: Int) -> String {
        guard sectionIndex < bookStructure.count else { return "Chapter" }
        if let label = bookStructure[sectionIndex].label {
            return label
        }
        let chapterNum =
            bookStructure
            .prefix(sectionIndex + 1)
            .filter { !$0.mediaOverlay.isEmpty }
            .count
        return "Chapter \(chapterNum)"
    }

    public var chapterProgress: Double {
        guard chapterDuration > 0 else { return 0 }
        return currentTime / chapterDuration
    }

    public var bookProgress: Double {
        guard bookDuration > 0 else { return 0 }
        return bookElapsed / bookDuration
    }

    public var currentTimeFormatted: String {
        formatTime(currentTime)
    }

    public var chapterDurationFormatted: String {
        formatTime(chapterDuration)
    }

    public var bookElapsedFormatted: String {
        formatTime(bookElapsed)
    }

    public var bookDurationFormatted: String {
        formatTime(bookDuration)
    }

    public var usesFullChapterCache = false
    public private(set) var previousLineText: String = ""
    public private(set) var currentLineText: String = ""
    public private(set) var nextLineText: String = ""
    public private(set) var allChapterLines: [ChapterLine] = []
    public private(set) var chapterParagraphs: [ChapterParagraph] = []
    private var cachedEntryIndex: Int = -1
    private var cachedSectionIndex: Int = -1
    private var paragraphIndexByEntry: [Int: Int] = [:]

    public struct ChapterLine: Identifiable {
        public let index: Int
        public let text: String
        public var id: Int { index }
    }

    public struct ChapterSegment: Identifiable {
        public let entryIndex: Int
        public let text: String
        public let separator: String
        public var id: Int { entryIndex }
    }

    public struct ChapterParagraph: Identifiable {
        public let index: Int
        public let segments: [ChapterSegment]
        public let text: String
        public var id: Int { index }
    }

    public func scrollTargetIndex(for entryIndex: Int) -> Int? {
        if let paragraphIndex = paragraphIndexByEntry[entryIndex],
            paragraphIndex >= 0,
            paragraphIndex < chapterParagraphs.count
        {
            return paragraphIndex
        }
        guard entryIndex >= 0, entryIndex < allChapterLines.count else { return nil }
        return entryIndex
    }

    public override init() {
        super.init()
        #if os(watchOS)
        loadSavedVolume()
        #endif
    }

    #if os(watchOS)
    private func loadSavedVolume() {
        let saved = UserDefaults.standard.double(forKey: Self.volumeKey)
        if saved > 0 {
            volume = max(saved, Self.minimumVolume)
            volumeBeforeMute = volume
        }
    }
    #endif

    public func loadBook(_ book: BookMetadata) async {
        let bookID = book.id
        let loadedBookID = await SMILPlayerActor.shared.getLoadedBookID()
        if loadedBookID == bookID {
            if let state = await SMILPlayerActor.shared.getCurrentState(), state.isPlaying {
                debugLog("[\(logPrefix)] Book already playing, skipping reload")
                return
            }
        }

        #if os(watchOS)
        loadSavedVolume()
        #endif

        bookTitle = book.title
        currentBookID = bookID
        hasRestoredPosition = false
        hasUserProgress = false
        isLoadingPosition = true

        let preparedMedia = try? await BookServiceActor.shared.prepareEbookForReading(
            bookID: book.id,
            category: .synced,
        )
        epubURL = preparedMedia?.originalURL

        guard let url = epubURL, FileManager.default.fileExists(atPath: url.path) else {
            debugLog("[\(logPrefix)] EPUB file not found")
            isLoadingPosition = false
            return
        }

        do {
            try await SMILPlayerActor.shared.loadBook(
                epubPath: url,
                bookID: bookID,
                title: book.title,
                author: book.creators?.first?.name ?? book.authors?.first?.name,
            )

            bookStructure = await SMILPlayerActor.shared.getBookStructure()
            debugLog("[\(logPrefix)] Loaded book with \(bookStructure.count) sections")

            stateObserverId = await SMILPlayerActor.shared.addStateObserver { [weak self] state in
                self?.handleStateUpdate(state)
            }

            #if os(watchOS)
            await SMILPlayerActor.shared.setVolume(volume)
            #endif

            let config = await SettingsActor.shared.config
            await SMILPlayerActor.shared.setPlaybackRate(config.playback.defaultPlaybackSpeed)

            if let firstSection = bookStructure.first(where: { !$0.mediaOverlay.isEmpty }) {
                currentSectionIndex = firstSection.index
                chapterTitle = chapterLabel(forSectionIndex: firstSection.index)
                updateChapterDuration()
            }

            registerIncomingPositionObserver(bookId: book.id)
            restorePosition(book)
            isLoadingPosition = false
            await loadCurrentSectionHTML()
        } catch {
            debugLog("[\(logPrefix)] Failed to load book: \(error)")
            isLoadingPosition = false
        }
    }

    private func handleStateUpdate(_ state: SMILPlaybackState) {
        let sectionChanged = state.currentSectionIndex != currentSectionIndex
        let playingChanged = state.isPlaying != isPlaying
        let entryChanged = state.currentEntryIndex != currentEntryIndex

        if playingChanged { isPlaying = state.isPlaying }
        if state.chapterElapsed != currentTime { currentTime = state.chapterElapsed }
        if sectionChanged { currentSectionIndex = state.currentSectionIndex }
        if entryChanged { currentEntryIndex = state.currentEntryIndex }
        if state.playbackRate != playbackRate { playbackRate = state.playbackRate }
        if state.bookElapsed != bookElapsed { bookElapsed = state.bookElapsed }
        if state.bookTotal != bookDuration { bookDuration = state.bookTotal }

        if sectionChanged {
            currentSectionHTML = ""
            chapterTextByIndex = []
            allChapterLines = []
            chapterParagraphs = []
            paragraphIndexByEntry = [:]
        }

        if sectionChanged || entryChanged {
            updateCachedTextIfNeeded()
        }

        if sectionChanged {
            chapterTitle =
                state.chapterLabel ?? chapterLabel(forSectionIndex: state.currentSectionIndex)
            chapterDuration = state.chapterTotal
            Task {
                await loadCurrentSectionHTML()
            }
            syncProgress()
        }

        if playingChanged {
            if isPlaying {
                startPeriodicSync()
                #if os(tvOS)
                UIApplication.shared.isIdleTimerDisabled = true
                #endif
            } else {
                stopPeriodicSync()
                syncProgress()
                #if os(tvOS)
                UIApplication.shared.isIdleTimerDisabled = false
                #endif
            }
        }
    }

    private func startPeriodicSync() {
        periodicSyncTask?.cancel()
        periodicSyncTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Self.periodicSyncInterval))
                guard !Task.isCancelled else { break }
                self?.syncProgress()
            }
        }
    }

    private func stopPeriodicSync() {
        periodicSyncTask?.cancel()
        periodicSyncTask = nil
    }

    public func playPause() {
        guard !isLoadingPosition else { return }
        hasUserProgress = true
        Task { @SMILPlayerActor in
            try? await SMILPlayerActor.shared.togglePlayPause()
        }
    }

    public func skipForward(seconds: Double = 30) {
        guard !isLoadingPosition else { return }
        hasUserProgress = true
        Task { @SMILPlayerActor in
            await SMILPlayerActor.shared.skipForward(seconds: seconds)
        }
    }

    public func skipBackward(seconds: Double = 30) {
        guard !isLoadingPosition else { return }
        hasUserProgress = true
        Task { @SMILPlayerActor in
            await SMILPlayerActor.shared.skipBackward(seconds: seconds)
        }
    }

    public func nextSentence() {
        guard !isLoadingPosition else { return }
        hasUserProgress = true
        sentenceNavigationTask?.cancel()
        sentenceNavigationTask = Task { @MainActor in
            let position = await SMILPlayerActor.shared.getCurrentPosition()
            guard !Task.isCancelled else { return }
            let structure = await SMILPlayerActor.shared.getBookStructure()
            guard !Task.isCancelled else { return }
            guard position.sectionIndex < structure.count else { return }
            let section = structure[position.sectionIndex]
            var targetSectionIndex = position.sectionIndex
            var targetEntryIndex = position.entryIndex + 1

            if targetEntryIndex >= section.mediaOverlay.count {
                var nextSectionIndex = position.sectionIndex + 1
                while nextSectionIndex < structure.count
                    && structure[nextSectionIndex].mediaOverlay.isEmpty
                {
                    nextSectionIndex += 1
                }
                guard nextSectionIndex < structure.count else { return }
                targetSectionIndex = nextSectionIndex
                targetEntryIndex = 0
            }
            try? await SMILPlayerActor.shared.seekToEntry(
                sectionIndex: targetSectionIndex,
                entryIndex: targetEntryIndex,
            )
        }
    }

    public func previousSentence() {
        guard !isLoadingPosition else { return }
        hasUserProgress = true
        sentenceNavigationTask?.cancel()
        sentenceNavigationTask = Task { @MainActor in
            let position = await SMILPlayerActor.shared.getCurrentPosition()
            guard !Task.isCancelled else { return }
            let structure = await SMILPlayerActor.shared.getBookStructure()
            guard !Task.isCancelled else { return }
            guard position.sectionIndex < structure.count else { return }
            var targetSectionIndex = position.sectionIndex
            var targetEntryIndex = position.entryIndex - 1

            if targetEntryIndex < 0 {
                var prevSectionIndex = position.sectionIndex - 1
                while prevSectionIndex >= 0
                    && structure[prevSectionIndex].mediaOverlay.isEmpty
                {
                    prevSectionIndex -= 1
                }
                guard prevSectionIndex >= 0 else { return }
                let prevSection = structure[prevSectionIndex]
                guard let lastEntryIndex = prevSection.mediaOverlay.indices.last else { return }
                targetSectionIndex = prevSectionIndex
                targetEntryIndex = lastEntryIndex
            }
            let targetSection = structure[targetSectionIndex]
            guard targetEntryIndex >= 0,
                targetEntryIndex < targetSection.mediaOverlay.count
            else {
                return
            }
            try? await SMILPlayerActor.shared.seekToEntry(
                sectionIndex: targetSectionIndex,
                entryIndex: targetEntryIndex,
            )
        }
    }

    public func setPlaybackRate(_ rate: Double) {
        playbackRate = rate
        Task { @SMILPlayerActor in
            await SMILPlayerActor.shared.setPlaybackRate(rate)
        }
    }

    #if os(watchOS)
    public func setVolume(_ newVolume: Double) {
        volume = newVolume
        isMuted = false
        if newVolume >= Self.minimumVolume {
            UserDefaults.standard.set(newVolume, forKey: Self.volumeKey)
        }
        Task { @SMILPlayerActor in
            await SMILPlayerActor.shared.setVolume(newVolume)
        }
    }

    public func toggleMute() {
        if isMuted {
            isMuted = false
            volume = volumeBeforeMute
            Task { @SMILPlayerActor in
                await SMILPlayerActor.shared.setVolume(self.volumeBeforeMute)
            }
        } else {
            volumeBeforeMute = volume
            isMuted = true
            Task { @SMILPlayerActor in
                await SMILPlayerActor.shared.setVolume(0)
            }
        }
    }
    #endif

    public func nextChapter() {
        guard !isLoadingPosition else { return }
        let nextIndex = currentSectionIndex + 1
        guard nextIndex < bookStructure.count else { return }

        var targetIndex = nextIndex
        while targetIndex < bookStructure.count && bookStructure[targetIndex].mediaOverlay.isEmpty {
            targetIndex += 1
        }
        guard targetIndex < bookStructure.count else { return }

        hasUserProgress = true
        Task {
            await jumpToChapter(targetIndex)
        }
    }

    public func previousChapter() {
        guard !isLoadingPosition else { return }
        let restartThreshold = 3.0
        if currentTime > restartThreshold {
            hasUserProgress = true
            Task {
                await jumpToChapter(currentSectionIndex)
            }
            return
        }

        let prevIndex = currentSectionIndex - 1
        guard prevIndex >= 0 else {
            hasUserProgress = true
            Task {
                await jumpToChapter(currentSectionIndex)
            }
            return
        }

        var targetIndex = prevIndex
        while targetIndex >= 0 && bookStructure[targetIndex].mediaOverlay.isEmpty {
            targetIndex -= 1
        }
        guard targetIndex >= 0 else {
            hasUserProgress = true
            Task {
                await jumpToChapter(currentSectionIndex)
            }
            return
        }

        hasUserProgress = true
        Task {
            await jumpToChapter(targetIndex)
        }
    }

    public func jumpToChapter(_ sectionIndex: Int) async {
        guard sectionIndex >= 0, sectionIndex < bookStructure.count else { return }

        let section = bookStructure[sectionIndex]
        guard !section.mediaOverlay.isEmpty else { return }

        hasUserProgress = true
        do {
            let wasPlaying = isPlaying
            try await SMILPlayerActor.shared.seekToEntry(sectionIndex: sectionIndex, entryIndex: 0)
            if wasPlaying {
                try? await SMILPlayerActor.shared.play()
            }
        } catch {
            debugLog("[\(logPrefix)] Failed to jump to chapter: \(error)")
        }
    }

    public func seekToProgress(_ progress: Double) {
        guard bookDuration > 0 else { return }
        let clampedProgress = max(0, min(1, progress))
        hasUserProgress = true
        Task { @SMILPlayerActor in
            let _ = await SMILPlayerActor.shared.seekToTotalProgression(clampedProgress)
        }
    }

    private func updateCachedTextIfNeeded() {
        guard cachedEntryIndex != currentEntryIndex || cachedSectionIndex != currentSectionIndex
        else {
            return
        }
        cachedEntryIndex = currentEntryIndex
        cachedSectionIndex = currentSectionIndex

        previousLineText = getTextForEntry(at: -1)
        currentLineText = getTextForEntry(at: 0)
        nextLineText = getTextForEntry(at: 1)
    }

    private func getTextForEntry(at entryOffset: Int) -> String {
        let targetIndex = currentEntryIndex + entryOffset
        guard currentSectionIndex < bookStructure.count else { return "" }

        let section = bookStructure[currentSectionIndex]
        guard targetIndex >= 0, targetIndex < section.mediaOverlay.count else { return "" }

        if usesFullChapterCache, !chapterTextByIndex.isEmpty {
            return chapterTextByIndex[targetIndex]
        }

        let entry = section.mediaOverlay[targetIndex]
        if let text = EPUBContentLoader.extractElementText(
            from: currentSectionHTML,
            elementId: entry.textId,
            excludingNestedIds: Set(section.mediaOverlay.map { $0.textId }),
        ) {
            return text
        }

        return ""
    }

    private func loadCurrentSectionHTML() async {
        guard let url = epubURL, currentSectionIndex < bookStructure.count else { return }

        let sectionIndex = currentSectionIndex
        let section = bookStructure[sectionIndex]
        let href = section.id

        if href == cachedSectionHref { return }

        do {
            let html = try EPUBContentLoader.loadSection(from: url, href: href)
            if usesFullChapterCache {
                let elementIds = section.mediaOverlay.map { $0.textId }
                let extraction = await Task.detached(priority: .utility) {
                    EPUBContentLoader.extractElementsTextAndParagraphKeys(
                        from: html,
                        elementIds: elementIds,
                    )
                }.value
                guard sectionIndex == currentSectionIndex,
                    sectionIndex < bookStructure.count,
                    href == bookStructure[sectionIndex].id,
                    usesFullChapterCache
                else {
                    return
                }
                currentSectionHTML = html
                cachedSectionHref = href
                cachedEntryIndex = -1
                chapterTextByIndex = elementIds.map { extraction.textById[$0] ?? "" }
                rebuildAllChapterLines()
                rebuildChapterParagraphs(
                    elementIds: elementIds,
                    paragraphKeyById: extraction.paragraphKeyById,
                )
                updateCachedTextIfNeeded()
            } else {
                guard sectionIndex == currentSectionIndex,
                    sectionIndex < bookStructure.count,
                    href == bookStructure[sectionIndex].id
                else {
                    return
                }
                currentSectionHTML = html
                cachedSectionHref = href
                cachedEntryIndex = -1
                chapterTextByIndex = []
                allChapterLines = []
                chapterParagraphs = []
                paragraphIndexByEntry = [:]
                updateCachedTextIfNeeded()
            }
        } catch {
            debugLog("[\(logPrefix)] Failed to load section HTML: \(error)")
            currentSectionHTML = ""
            chapterTextByIndex = []
            allChapterLines = []
            chapterParagraphs = []
            paragraphIndexByEntry = [:]
        }
    }

    private func rebuildAllChapterLines() {
        guard !chapterTextByIndex.isEmpty else {
            allChapterLines = []
            chapterParagraphs = []
            paragraphIndexByEntry = [:]
            return
        }

        var lines: [ChapterLine] = []
        for (index, text) in chapterTextByIndex.enumerated() {
            lines.append(ChapterLine(index: index, text: text))
        }
        allChapterLines = lines
    }

    private func rebuildChapterParagraphs(
        elementIds: [String],
        paragraphKeyById: [String: String],
    ) {
        guard !elementIds.isEmpty else {
            chapterParagraphs = []
            paragraphIndexByEntry = [:]
            return
        }

        var paragraphs: [ChapterParagraph] = []
        var paragraphIndexMap: [Int: Int] = [:]
        var currentKey: String? = nil
        var currentSegments: [(entryIndex: Int, text: String)] = []
        var currentParagraphIndex = 0

        func flushParagraph() {
            guard !currentSegments.isEmpty else { return }
            let segments = buildSegments(from: currentSegments)
            let text = segments.map { $0.text + $0.separator }.joined()
            paragraphs.append(
                ChapterParagraph(
                    index: currentParagraphIndex,
                    segments: segments,
                    text: text.trimmingCharacters(in: .whitespacesAndNewlines),
                )
            )
            currentParagraphIndex += 1
            currentSegments = []
        }

        for (entryIndex, elementId) in elementIds.enumerated() {
            let key = paragraphKeyById[elementId] ?? "entry-\(entryIndex)"
            if currentKey == nil {
                currentKey = key
            } else if key != currentKey {
                flushParagraph()
                currentKey = key
            }

            let text =
                chapterTextByIndex.indices.contains(entryIndex)
                ? chapterTextByIndex[entryIndex]
                : ""
            currentSegments.append((entryIndex: entryIndex, text: text))
            paragraphIndexMap[entryIndex] = currentParagraphIndex
        }

        flushParagraph()
        chapterParagraphs = paragraphs
        paragraphIndexByEntry = paragraphIndexMap
    }

    private func buildSegments(
        from rawSegments: [(entryIndex: Int, text: String)]
    ) -> [ChapterSegment] {
        var segments: [ChapterSegment] = []
        segments.reserveCapacity(rawSegments.count)
        for index in rawSegments.indices {
            let raw = rawSegments[index]
            let nextText =
                index + 1 < rawSegments.count
                ? rawSegments[index + 1].text
                : ""
            let separator = shouldInsertSpace(between: raw.text, and: nextText) ? " " : ""
            segments.append(
                ChapterSegment(
                    entryIndex: raw.entryIndex,
                    text: raw.text,
                    separator: separator,
                )
            )
        }
        return segments
    }

    private func shouldInsertSpace(between left: String, and right: String) -> Bool {
        guard let leftLast = left.last, let rightFirst = right.first else { return false }
        if leftLast.isWhitespace || rightFirst.isWhitespace { return false }

        let noSpaceBefore: Set<Character> = [".", ",", ";", ":", "!", "?", ")", "]", "}", "'"]
        if noSpaceBefore.contains(rightFirst) { return false }

        let noSpaceAfter: Set<Character> = ["(", "[", "{", "-"]
        if noSpaceAfter.contains(leftLast) { return false }

        return true
    }

    private func updateChapterDuration() {
        guard currentSectionIndex < bookStructure.count else { return }
        let section = bookStructure[currentSectionIndex]
        if let lastEntry = section.mediaOverlay.last {
            chapterDuration = lastEntry.end
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        let hours = Int(seconds) / 3600
        let mins = (Int(seconds) % 3600) / 60
        let secs = Int(seconds) % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, mins, secs)
        }
        return String(format: "%d:%02d", mins, secs)
    }

    private func restorePosition(_ book: BookMetadata) {
        Task {
            var locatorToUse: BookLocator? = nil

            if let psaProgress = await ProgressSyncActor.shared.getBookProgress(for: book.id),
                let psaLocator = psaProgress.locator
            {
                debugLog("[\(logPrefix)] Got position from PSA (source: \(psaProgress.source))")
                locatorToUse = psaLocator
            } else if let position = book.position, let locator = position.locator {
                debugLog("[\(logPrefix)] Using position from metadata")
                locatorToUse = locator
            }

            guard let locator = locatorToUse else {
                debugLog("[\(logPrefix)] No saved position for \(book.uuid)")
                hasRestoredPosition = true
                return
            }

            debugLog("[\(logPrefix)] Restoring position - href: \(locator.href)")
            await navigateToServerPosition(locator)
            hasRestoredPosition = true
        }
    }

    private func syncProgress() {
        guard let bookID = currentBookID, hasRestoredPosition,
            hasUserProgress
        else { return }

        lastSyncTime = Date()
        let progression = bookDuration > 0 ? bookElapsed / bookDuration : 0
        let timestamp = floor(Date().timeIntervalSince1970 * 1000)

        guard currentSectionIndex < bookStructure.count else { return }
        let section = bookStructure[currentSectionIndex]
        guard currentEntryIndex < section.mediaOverlay.count else { return }

        let entry = section.mediaOverlay[currentEntryIndex]

        let locator = BookLocator(
            href: entry.textHref,
            type: "application/xhtml+xml",
            title: nil,
            locations: BookLocator.Locations(
                fragments: [entry.textId],
                progression: chapterProgress,
                position: nil,
                totalProgression: progression,
                cssSelector: nil,
                partialCfi: nil,
                domRange: nil,
            ),
            text: nil,
        )

        let locationDescription = "\(chapterTitle), \(Int(chapterProgress * 100))%"

        Task {
            let _ = await ProgressSyncActor.shared.syncProgress(
                bookID: bookID,
                locator: locator,
                timestamp: timestamp,
                reason: .userPausedPlayback,
                sourceIdentifier: syncSourceIdentifier,
                locationDescription: locationDescription,
            )
        }
    }

    public var serverPositionDescription: String {
        guard let position = pendingServerPosition else {
            return "Another device has synced a more recent reading position."
        }
        let locator = position.locator
        var details: [String] = []
        if let title = locator.title {
            details.append(title)
        }
        if let prog = locator.locations?.totalProgression {
            details.append("\(Int(prog * 100))%")
        }
        let locationStr = details.isEmpty ? "" : " (\(details.joined(separator: ", ")))"
        return
            "Another device has synced a more recent reading position\(locationStr). Would you like to go to that location?"
    }

    private func registerIncomingPositionObserver(bookId: BookID) {
        positionObserverRegistrationTask = Task {
            let observerId = await ProgressSyncActor.shared.addIncomingPositionObserver(
                for: bookId
            ) { [weak self] position in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    let config = await SettingsActor.shared.config
                    if config.sync.autoSyncToNewerServerPosition {
                        await self.navigateToServerPosition(position.locator)
                    } else {
                        self.pendingServerPosition = position
                        self.showServerPositionDialog = true
                    }
                }
            }

            guard !Task.isCancelled else {
                await ProgressSyncActor.shared.removeIncomingPositionObserver(id: observerId)
                return
            }

            await MainActor.run {
                incomingPositionObserverId = observerId
            }
            debugLog("[\(logPrefix)] Registered incoming position observer for \(bookId)")
        }
    }

    private func navigateToServerPosition(_ locator: BookLocator) async {
        let isAudioLocator = locator.type.contains("audio")
        let href = locator.href
        let textId = locator.locations?.fragments?.first
        let totalProgression = locator.locations?.totalProgression

        if isAudioLocator, totalProgression == nil {
            debugLog("[\(logPrefix)] Audio locator missing totalProgression; skipping server nav")
            return
        }

        if let textId = textId, !isAudioLocator {
            debugLog("[\(logPrefix)] Navigating to server position via fragment: \(href)#\(textId)")

            if let sectionIndex = bookStructure.firstIndex(where: { section in
                section.mediaOverlay.contains { $0.textHref == href }
            }) {
                let success = await SMILPlayerActor.shared.seekToFragment(
                    sectionIndex: sectionIndex,
                    textId: textId,
                )
                if success { return }
            } else if let sectionIndex = findSectionIndex(for: href, in: bookStructure) {
                let success = await SMILPlayerActor.shared.seekToFragment(
                    sectionIndex: sectionIndex,
                    textId: textId,
                )
                if success { return }
            }
        }

        if let totalProgression = totalProgression, totalProgression > 0 {
            debugLog("[\(logPrefix)] Using totalProgression: \(totalProgression)")
            let _ = await SMILPlayerActor.shared.seekToTotalProgression(totalProgression)
        } else {
            debugLog("[\(logPrefix)] Server position has no usable location data, cannot seek")
        }
    }

    public func acceptServerPosition() {
        guard let position = pendingServerPosition else { return }
        Task {
            await navigateToServerPosition(position.locator)
        }
        pendingServerPosition = nil
        showServerPositionDialog = false
    }

    public func declineServerPosition() {
        pendingServerPosition = nil
        showServerPositionDialog = false
    }

    public func cleanup() {
        stopPeriodicSync()
        syncProgress()

        positionObserverRegistrationTask?.cancel()

        #if os(tvOS)
        UIApplication.shared.isIdleTimerDisabled = false
        #endif
        let stateObserver = stateObserverId
        let positionRegistrationTask = positionObserverRegistrationTask

        stateObserverId = nil
        isPlaying = false

        Task { @MainActor in
            await SMILPlayerActor.shared.pause()
            if let stateObserver {
                await SMILPlayerActor.shared.removeStateObserver(id: stateObserver)
            }

            await positionRegistrationTask?.value
            if let positionObserverId = incomingPositionObserverId {
                incomingPositionObserverId = nil
                await ProgressSyncActor.shared.removeIncomingPositionObserver(
                    id: positionObserverId
                )
            }
        }
    }
}

#endif
