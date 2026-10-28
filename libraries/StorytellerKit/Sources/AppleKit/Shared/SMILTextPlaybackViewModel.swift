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

    public var showServerPositionDialog = false
    public var pendingServerPosition: IncomingServerPosition? = nil

    private var readingSession: ReadingSession?

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

    /// Cached because this view model is synchronous and cannot await the actor.
    private var chapterSummaries: [SMILChapterSummary] = []

    public var chapters: [ChapterInfo] {
        chapterSummaries.map { ChapterInfo(index: $0.sectionIndex, label: $0.title) }
    }

    public var hasChapters: Bool {
        bookStructure.count > 1
    }

    private func chapterLabel(forSectionIndex sectionIndex: Int) -> String {
        chapterSummaries.first { $0.sectionIndex == sectionIndex }?.title ?? "Chapter"
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
        #if os(watchOS)
        loadSavedVolume()
        #endif

        bookTitle = book.title
        currentBookID = bookID
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
            let session = await ActiveReadingSession.shared.open(
                metadata: book,
                category: .synced,
                localMediaPath: url,
                settings: nil,
            )
            readingSession = session
            session.prepare()
            await session.awaitPreparation()
            if let error = session.lastPrepareError { throw error }
            session.onIncomingServerPosition = { [weak self] position in
                self?.pendingServerPosition = position
                self?.showServerPositionDialog = true
            }

            bookStructure = await PlaybackEngineActor.shared.getBookStructure()
            chapterSummaries = await PlaybackEngineActor.shared.getChapterSummaries()
            debugLog("[\(logPrefix)] Loaded book with \(bookStructure.count) sections")

            stateObserverId = await PlaybackEngineActor.shared.addStateObserver {
                [weak self] state in
                self?.handleStateUpdate(state)
            }

            #if os(watchOS)
            await readingSession?.setVolume(volume)
            #endif

            let config = await SettingsActor.shared.config
            await PlaybackEngineActor.shared.setPlaybackRate(config.playback.defaultPlaybackSpeed)

            if let firstSection = bookStructure.first(where: { !$0.mediaOverlay.isEmpty }) {
                currentSectionIndex = firstSection.index
                chapterTitle = chapterLabel(forSectionIndex: firstSection.index)
                updateChapterDuration()
            }
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
        }

        if playingChanged {
            if isPlaying {

                #if os(tvOS)
                UIApplication.shared.isIdleTimerDisabled = true
                #endif
            } else {

                #if os(tvOS)
                UIApplication.shared.isIdleTimerDisabled = false
                #endif
            }
        }
    }

    public func playPause() {
        guard !isLoadingPosition else { return }
        Task { @MainActor in
            try? await readingSession?.togglePlayback()
        }
    }

    public func skipForward(seconds: Double = 30) {
        guard !isLoadingPosition else { return }
        Task { @MainActor in
            await readingSession?.handlePlaybackCommand(.skipForward(seconds))
        }
    }

    public func skipBackward(seconds: Double = 30) {
        guard !isLoadingPosition else { return }
        Task { @MainActor in
            await readingSession?.handlePlaybackCommand(.skipBackward(seconds))
        }
    }

    public func nextSentence() {
        Task { await readingSession?.skipSentence(by: 1) }
    }

    public func previousSentence() {
        Task { await readingSession?.skipSentence(by: -1) }
    }

    public func setPlaybackRate(_ rate: Double) {
        playbackRate = rate
        Task { @MainActor in
            await readingSession?.setPlaybackRate(rate)
        }
    }

    #if os(watchOS)
    public func setVolume(_ newVolume: Double) {
        volume = newVolume
        isMuted = false
        if newVolume >= Self.minimumVolume {
            UserDefaults.standard.set(newVolume, forKey: Self.volumeKey)
        }
        Task { @MainActor in
            await readingSession?.setVolume(newVolume)
        }
    }

    public func toggleMute() {
        if isMuted {
            isMuted = false
            volume = volumeBeforeMute
            Task { @MainActor in
                await readingSession?.setVolume(self.volumeBeforeMute)
            }
        } else {
            volumeBeforeMute = volume
            isMuted = true
            Task { @MainActor in
                await readingSession?.setVolume(0)
            }
        }
    }
    #endif

    public func nextChapter() {
        Task { await readingSession?.nextChapter() }
    }

    public func previousChapter() {
        Task { await readingSession?.previousChapter() }
    }

    public func jumpToChapter(_ sectionIndex: Int) async {
        guard sectionIndex >= 0, sectionIndex < bookStructure.count else { return }

        let section = bookStructure[sectionIndex]
        guard !section.mediaOverlay.isEmpty else { return }
        do {
            try await readingSession?.seekToEntry(sectionIndex: sectionIndex, entryIndex: 0)
        } catch {
            debugLog("[\(logPrefix)] Failed to jump to chapter: \(error)")
        }
    }

    public func seekToProgress(_ progress: Double) {
        guard bookDuration > 0 else { return }
        let clampedProgress = max(0, min(1, progress))
        Task { @MainActor in
            let _ = await readingSession?.seekToProgress(clampedProgress)
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

    private func navigateToServerPosition(_ locator: BookLocator) async {
        await readingSession?.restoreLocator(locator)
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
        Task { try? await readingSession?.control(.declineServerPosition) }
        pendingServerPosition = nil
        showServerPositionDialog = false
    }

    public func cleanup() {

        #if os(tvOS)
        UIApplication.shared.isIdleTimerDisabled = false
        #endif
        let stateObserver = stateObserverId

        stateObserverId = nil
        isPlaying = false

        Task { @MainActor in
            await readingSession?.pause()
            if let stateObserver {
                await PlaybackEngineActor.shared.removeStateObserver(id: stateObserver)
            }

        }
    }
}

#endif
