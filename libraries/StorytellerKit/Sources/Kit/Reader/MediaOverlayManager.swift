import Foundation
import Observation

/// MediaOverlayManager - Single source of truth for audio sync decisions
///
/// Responsibilities:
/// - Decide when audio playhead should move
/// - Track current audio position
/// - Handle chapter navigation without loops
/// - Manage sync mode (enabled/disabled)
@StorytellerUIActor
@Observable
public final class MediaOverlayManager {

    private let bookStructure: [SectionInfo]
    private let bookID: BookID
    private let reloadBookIntoActor: () async -> Void
    private let settingsVM: any ReaderSettingsReading
    /// Section indices that contain at least one SMIL entry (used to skip non-audio sections).
    private let audioSectionIndices: [Int]
    /// Map from section index → position in audioSectionIndices for fast prev/next audio section jumps.
    private let audioSectionIndexBySection: [Int: Int]
    /// Map from section index → (textId → first entry index) for fast fragment lookups.
    private let textIdIndexBySection: [Int: [String: Int]]
    /// Cached TOC sections (labelled sections) to avoid refiltering on every access.
    private let tocSectionsCache: [SectionInfo]

    public weak var commsBridge: ReaderCommsBridge?
    public weak var progressManager: EphemeralProgressManager?

    /// Observer ID for SMILPlayerActor state changes
    private var smilObserverId: UUID?

    /// Cached state from SMILPlayerActor
    public private(set) var cachedSectionIndex: Int = 0
    public private(set) var cachedEntryIndex: Int = 0
    private var lastObservedFragment: String = ""

    /// Suppress actor-driven highlights briefly after user-initiated navigation
    private var suppressActorHighlightsUntil: Date? = nil

    private var lastObservedUserSeekCount: Int? = nil

    public var isPlaying: Bool = false
    public var isInBackground: Bool = false
    /// The webview missed view updates while backgrounded; cleared only after
    /// a confirmed re-anchor navigation.
    public var viewPositionDirty: Bool = false

    /// Task for delayed page flips during fractional sentence playback
    /// (i.e. when a sentence is half on this page and half on the next)
    private var pageFlipTask: Task<Void, Never>?

    /// Last time we flipped a page, used to debounce rapid flips
    /// (i.e. when a fractional sentence is paused then play starts again,
    /// causing it to fire right when the next sentence sends a ElementVisibilityMessage)
    private var lastFlipTime: Date?

    /// Peer's playback rate, for flip timing; local playback clears it.
    private var liveSyncFollowRate: Double?
    private var lastLiveSyncApplyTime: Date?

    /// Freshness window so a peer that stopped narrating cannot leave this
    /// manager ignoring user navigation.
    private var isFollowingLiveSync: Bool {
        guard liveSyncFollowRate != nil, let last = lastLiveSyncApplyTime else { return false }
        return Date().timeIntervalSince(last) < 30
    }

    public enum SeekSource {
        case userNav
        case doubleTap
        case system
    }

    /// True once the user has browsed away from the playhead without audio following.
    public private(set) var playheadDiverged = false

    private var freeBrowse: FreeBrowseMode {
        FreeBrowseMode(rawValue: settingsVM.freeBrowseMode) ?? .never
    }

    private var highlightVisibility: ReadaloudHighlightVisibility {
        ReadaloudHighlightVisibility(rawValue: settingsVM.readaloudHighlightVisibility) ?? .paused
    }

    private var audioFollowsUserNav: Bool {
        switch freeBrowse {
            case .never: return true
            case .paused: return isPlaying
            case .always: return false
        }
    }

    public var playbackRate: Double = 1.0
    public var volume: Double = 1.0

    public var sleepTimerActive: Bool = false
    public var sleepTimerRemaining: TimeInterval? = nil
    public var sleepTimerType: SleepTimerType? = nil
    private var sleepTimerTask: Task<Void, Never>? = nil

    /// Platform hook that keeps the screen awake during narration playback.
    public var setWakeLock: ((Bool) -> Void)?

    public var chapterElapsedSeconds: Double? = nil
    public var chapterTotalSeconds: Double? = nil
    public var bookElapsedSeconds: Double? = nil
    public var bookTotalSeconds: Double? = nil

    /// Current fragment being played (format: "href#anchor", e.g., "text/part0007.html#para-123")
    public var currentFragment: String? = nil

    /// Returns true if the book has any SMIL entries
    public var hasMediaOverlay: Bool {
        !audioSectionIndices.isEmpty
    }

    /// Returns sections that are in the TOC (have labels)
    public var tocSections: [SectionInfo] {
        tocSectionsCache
    }

    public var chapterTimeRemaining: TimeInterval? {
        guard let total = chapterTotalSeconds,
            let elapsed = chapterElapsedSeconds,
            playbackRate > 0
        else {
            return nil
        }
        let remaining = max(total - elapsed, 0)
        return remaining / playbackRate
    }

    public var bookTimeRemaining: TimeInterval? {
        guard let total = bookTotalSeconds,
            let elapsed = bookElapsedSeconds,
            playbackRate > 0
        else {
            return nil
        }
        let remaining = max(total - elapsed, 0)
        return remaining / playbackRate
    }

    public init(
        bookStructure: [SectionInfo],
        bookID: BookID,
        bridge: ReaderCommsBridge?,
        settingsVM: any ReaderSettingsReading,
        reloadBookIntoActor: @escaping () async -> Void,
    ) {
        self.bookStructure = bookStructure
        self.bookID = bookID
        self.commsBridge = bridge
        self.settingsVM = settingsVM
        self.reloadBookIntoActor = reloadBookIntoActor
        let audioSections = Self.buildAudioSectionIndices(bookStructure: bookStructure)
        audioSectionIndices = audioSections
        audioSectionIndexBySection = Self.buildAudioSectionIndexMap(
            audioSectionIndices: audioSections
        )
        textIdIndexBySection = Self.buildTextIdIndexBySection(bookStructure: bookStructure)
        tocSectionsCache = bookStructure.filter { $0.label != nil }
        debugLog("[MOM] MediaOverlayManager initialized for book: \(bookID)")
        debugLog("[MOM]   Total sections: \(bookStructure.count)")
        debugLog(
            "[MOM]   Sections with audio: \(bookStructure.filter { !$0.mediaOverlay.isEmpty }.count)"
        )
        debugLog("[MOM]   TOC sections: \(tocSections.count)")

        let sectionsToShow = min(20, bookStructure.count)
        debugLog("[MOM] First \(sectionsToShow) sections:")

        for i in 0..<sectionsToShow {
            let section = bookStructure[i]
            let label = section.label ?? "(no label)"
            let level = section.level?.description ?? "nil"
            let smilCount = section.mediaOverlay.count

            debugLog(
                "[MOM]   [\(i)] \(section.id) - \(label) (level: \(level), SMIL entries: \(smilCount))"
            )

            if !section.mediaOverlay.isEmpty {
                let smilToShow = min(10, section.mediaOverlay.count)
                debugLog("[MOM]     First \(smilToShow) SMIL entries:")

                for j in 0..<smilToShow {
                    let entry = section.mediaOverlay[j]
                    debugLog("[MOM]       [\(j)] #\(entry.textId) @ \(entry.textHref)")
                    debugLog(
                        "[MOM]            audio: \(entry.audioFile) [\(String(format: "%.3f", entry.begin))s - \(String(format: "%.3f", entry.end))s]"
                    )
                    debugLog(
                        "[MOM]            cumSum: \(String(format: "%.3f", entry.cumSumAtEnd))s"
                    )
                }

                if section.mediaOverlay.count > smilToShow {
                    debugLog(
                        "[MOM]       ... and \(section.mediaOverlay.count - smilToShow) more entries"
                    )
                }
            }
        }

        if bookStructure.count > sectionsToShow {
            debugLog("[MOM]   ... and \(bookStructure.count - sectionsToShow) more sections")
        }

        Task {
            await setupActorObserver()
        }
    }

    private func setupActorObserver() async {
        let observerId = await SMILPlayerActor.shared.addStateObserver { [weak self] state in
            Task { @StorytellerUIActor [weak self] in
                self?.handleActorStateUpdate(state)
            }
        }
        smilObserverId = observerId
        debugLog("[MOM] SMILPlayerActor observer registered: \(observerId)")
    }

    private func handleActorStateUpdate(_ state: SMILPlaybackState) {
        guard state.bookID == bookID else {
            if isPlaying {
                Task { await handleEngineLostToOtherBook() }
            }
            return
        }

        let previousSectionIndex = cachedSectionIndex
        let previousEntryIndex = cachedEntryIndex
        let previousFragment = lastObservedFragment

        cachedSectionIndex = state.currentSectionIndex
        cachedEntryIndex = state.currentEntryIndex
        lastObservedFragment = state.currentFragment

        let wasPlaying = isPlaying
        isPlaying = state.isPlaying
        if wasPlaying != isPlaying {
            syncPlaybackActiveToJS()
        }
        playbackRate = state.playbackRate
        if state.isPlaying {
            liveSyncFollowRate = nil
            lastLiveSyncApplyTime = nil
        }
        if isInBackground && state.isPlaying {
            if !viewPositionDirty {
                debugLog("[MOM] Audio playing while backgrounded")
            }
            viewPositionDirty = true
        }
        chapterElapsedSeconds = state.chapterElapsed
        chapterTotalSeconds = state.chapterTotal
        bookElapsedSeconds = state.bookElapsed
        bookTotalSeconds = state.bookTotal
        currentFragment = state.currentFragment

        let entryChanged =
            (state.currentSectionIndex != previousSectionIndex
                || state.currentEntryIndex != previousEntryIndex)
        let fragmentChanged = state.currentFragment != previousFragment

        // A paused reader must still follow a deliberate seek, from the media
        // notification or anywhere else, but not the narration running on.
        let userSeeked = lastObservedUserSeekCount.map { $0 != state.userSeekCount } ?? false
        lastObservedUserSeekCount = state.userSeekCount

        if entryChanged && fragmentChanged && (state.isPlaying || userSeeked) {
            handleEntryAdvancement(
                sectionIndex: state.currentSectionIndex,
                entryIndex: state.currentEntryIndex,
            )
        }

        if wasPlaying && !state.isPlaying {
            debugLog("[MOM] Audio paused - syncing progress")
            Task {
                progressManager?.recordPlaybackActivity()
                await progressManager?.syncProgressToServer(reason: .userPausedPlayback)
            }
        }

        if sleepTimerActive && sleepTimerType == .endOfChapter && state.isPlaying {
            let elapsed = state.chapterElapsed
            let total = state.chapterTotal
            if total > 0 && elapsed >= total - 0.5 {
                debugLog("[MOM] End of chapter reached - sleep timer pausing playback")
                Task {
                    self.cancelSleepTimer()
                    if self.isPlaying {
                        await self.progressManager?.togglePlaying()
                    }
                }
            }
        }
    }

    private func handleEngineLostToOtherBook() async {
        // Pushed states can be stragglers; confirm with the engine.
        guard await SMILPlayerActor.shared.getLoadedBookID() != bookID else { return }
        guard isPlaying else { return }

        debugLog("[MOM] Engine taken by another book - degrading to idle")
        isPlaying = false
        syncPlaybackActiveToJS()
        pageFlipTask?.cancel()
        pageFlipTask = nil
        disableScreenWakeLock()
        try? await commsBridge?.sendJsClearHighlight()
        progressManager?.recordPlaybackActivity()
        await progressManager?.syncProgressToServer(reason: .userPausedPlayback)
    }

    private func handleEntryAdvancement(sectionIndex: Int, entryIndex: Int) {
        if let suppressUntil = suppressActorHighlightsUntil, Date() < suppressUntil {
            debugLog("[MOM] Actor advancement suppressed during user nav")
            return
        }

        guard let section = getSection(at: sectionIndex) else { return }
        guard entryIndex < section.mediaOverlay.count else { return }

        let entry = section.mediaOverlay[entryIndex]

        debugLog(
            "[MOM] Actor advanced to: section=\(sectionIndex), entry=\(entryIndex), textId=\(entry.textId)"
        )

        // A backgrounded webview cannot be trusted to run JS; skip the send
        // and let the scene-active re-anchor issue one navigation instead.
        if isInBackground {
            viewPositionDirty = true
        } else if !playheadDiverged {
            Task {
                await sendHighlightCommand(
                    sectionIndex: sectionIndex,
                    textId: entry.textId,
                    seekToLocation: true,
                )
            }
        }

        Task {
            await LiveReadingSyncActor.shared.reportLocalAdvancement(
                bookID: bookID,
                sectionIndex: sectionIndex,
                entryIndex: entryIndex,
                textId: entry.textId,
                textHref: entry.textHref,
                playbackRate: playbackRate,
            )
        }
    }

    /// Ignored while this client is playing so two narrating clients never
    /// fight over position.
    public func applyLiveSyncAdvancement(
        sectionIndex: Int,
        entryIndex: Int,
        textId: String,
        remoteRate: Double,
    ) {
        guard !isPlaying else { return }
        guard let section = getSection(at: sectionIndex) else { return }

        var resolvedEntryIndex = entryIndex
        if entryIndex >= section.mediaOverlay.count
            || section.mediaOverlay[entryIndex].textId != textId
        {
            // Peers may hold differently-parsed structures; fall back to textId lookup.
            guard let lookedUp = textIdIndexBySection[sectionIndex]?[textId] else {
                debugLog(
                    "[MOM] LiveSync advancement dropped - textId '\(textId)' not in section \(sectionIndex)"
                )
                return
            }
            resolvedEntryIndex = lookedUp
        }

        let entry = section.mediaOverlay[resolvedEntryIndex]
        cachedSectionIndex = sectionIndex
        cachedEntryIndex = resolvedEntryIndex
        currentFragment = "\(entry.textHref)#\(entry.textId)"
        liveSyncFollowRate = remoteRate > 0 ? remoteRate : 1.0
        lastLiveSyncApplyTime = Date()

        Task {
            await sendHighlightCommand(
                sectionIndex: sectionIndex,
                textId: entry.textId,
                seekToLocation: true,
            )
        }
    }

    /// Called when user selects a chapter directly (via sidebar/chapter button)
    /// Seeks audio to the first SMIL element of that chapter
    public func handleUserChapterNavigation(sectionIndex: Int) async {
        debugLog("[MOM] User chapter nav → Section.\(sectionIndex)")

        guard audioFollowsUserNav else {
            debugLog("[MOM] Free browse - audio will not follow chapter navigation")
            if hasMediaOverlay && sectionIndex != cachedSectionIndex {
                playheadDiverged = true
            }
            return
        }

        guard let sectionInfo = getSection(at: sectionIndex) else {
            debugLog("[MOM] Invalid section index: \(sectionIndex)")
            return
        }

        guard !sectionInfo.mediaOverlay.isEmpty else {
            debugLog("[MOM] Section \(sectionIndex) has no audio, skipping sync")
            return
        }

        let firstEntry = sectionInfo.mediaOverlay[0]
        debugLog("[MOM] Chapter has audio - seeking to first fragment: \(firstEntry.textId)")
        await handleSeekEvent(sectionIndex: sectionIndex, anchor: firstEntry.textId, source: .userNav)
    }

    /// Called when user initiates navigation (arrow keys, swipe, progress seek)
    /// This is called after a debounce period to handle the final settled location
    /// Returns true if a SMIL match was found and audio position updated, false otherwise
    public func handleUserNavEvent(section: Int, page: Int, totalPages: Int) async -> Bool {
        debugLog("[MOM] User nav → Section.\(section): \(page)/\(totalPages)")

        // Nav events while following are echoes of remote-driven seeks and
        // flips (EPM's echo counter only covers its own goLeft/goRight);
        // reconciling audio to them re-highlights the top visible sentence.
        if isFollowingLiveSync {
            debugLog("[MOM] Ignoring nav event while following live sync")
            return false
        }

        guard audioFollowsUserNav else {
            debugLog("[MOM] Free browse - audio will not follow page navigation")
            await updateDivergence(section: section)
            return false
        }

        guard let sectionInfo = getSection(at: section) else {
            debugLog("[MOM] Invalid section index: \(section)")
            return false
        }

        guard !sectionInfo.mediaOverlay.isEmpty else {
            debugLog("[MOM] Section \(section) has no audio, skipping sync")
            return false
        }

        if await activeSentenceStraddlesInto(section: section) {
            debugLog("[MOM] Active sentence continues onto this page, leaving playhead alone")
            return false
        }

        suppressActorHighlightsUntil = Date().addingTimeInterval(0.5)

        if page == 1 {
            debugLog(
                "[MOM] First page of section with audio - seeking to first fragment: \(sectionInfo.mediaOverlay[0].textId)"
            )
            await handleSeekEvent(
                sectionIndex: section,
                anchor: sectionInfo.mediaOverlay[0].textId,
                source: .userNav,
            )
            return true
        }

        debugLog("[MOM] Mid-chapter page (\(page)), querying fully visible elements")

        guard let visibleIds = try? await commsBridge?.sendJsGetFullyVisibleElementIds(),
            !visibleIds.isEmpty
        else {
            debugLog("[MOM] No visible elements found, skipping audio sync")
            return false
        }

        guard let indexMap = textIdIndexBySection[section], !indexMap.isEmpty else {
            debugLog("[MOM] No SMIL index map for section, skipping audio sync")
            return false
        }

        var bestIndex: Int? = nil
        var bestTextId: String? = nil

        for textId in visibleIds {
            guard let entryIndex = indexMap[textId] else { continue }
            if let currentBest = bestIndex {
                if entryIndex < currentBest {
                    bestIndex = entryIndex
                    bestTextId = textId
                }
            } else {
                bestIndex = entryIndex
                bestTextId = textId
            }
        }

        if let textId = bestTextId {
            debugLog("[MOM] Syncing audio to first visible SMIL element: \(textId)")
            await handleSeekEvent(sectionIndex: section, anchor: textId, source: .userNav)
            return true
        }

        debugLog("[MOM] No SMIL match found on page, audio position unchanged")
        return false
    }

    private func activeSentenceStraddlesInto(section: Int) async -> Bool {
        guard hasMediaOverlay, section == cachedSectionIndex,
            let currentSection = getSection(at: cachedSectionIndex),
            cachedEntryIndex < currentSection.mediaOverlay.count
        else { return false }

        let activeTextId = currentSection.mediaOverlay[cachedEntryIndex].textId
        guard let overlappingIds = try? await commsBridge?.sendJsGetPartiallyVisibleElementIds()
        else { return false }

        return overlappingIds.contains(activeTextId)
    }

    /// Called when navigation occurs naturally (media overlay auto-progression, resize events)
    /// Excludes user-initiated actions which are handled by handleUserNavEvent
    /// This also handles media overlay progress events (anchor changes during playback)
    public func handleNaturalNavEvent(section: Int, page: Int, totalPages: Int) async {
        debugLog("[MOM] Natural nav → Section.\(section): \(page)/\(totalPages)")
    }

    /// Called when seeking audio to a specific location in the book
    /// Triggers:
    /// - User double-clicks on a sentence in the reader
    /// - Book opens at last reading position (future)
    /// Only seeks if the exact fragment exists in bookStructure for the requested section
    public func handleSeekEvent(
        sectionIndex: Int,
        anchor: String,
        takeover: Bool = false,
        source: SeekSource = .system,
    ) async {
        debugLog("[MOM] handleSeekEvent - section: \(sectionIndex), anchor: \(anchor)")

        guard let section = getSection(at: sectionIndex) else {
            debugLog("[MOM] ERROR: handleSeekEvent - invalid section index: \(sectionIndex)")
            return
        }

        let fragmentExists = section.mediaOverlay.contains { $0.textId == anchor }

        if !fragmentExists {
            debugLog(
                "[MOM] ERROR: handleSeekEvent - fragment '\(anchor)' not found in section \(sectionIndex) (\(section.id))"
            )
            debugLog(
                "[MOM]   Available fragments in section: \(section.mediaOverlay.map { $0.textId }.prefix(10).joined(separator: ", "))"
            )
            return
        }

        debugLog("[MOM] handleSeekEvent - fragment found, seeking to \(section.id)#\(anchor)")

        if takeover, await SMILPlayerActor.shared.getLoadedBookID() != bookID {
            debugLog("[MOM] handleSeekEvent - taking over engine for \(bookID)")
            await reloadBookIntoActor()
            guard await SMILPlayerActor.shared.getLoadedBookID() == bookID else {
                debugLog("[MOM] handleSeekEvent - takeover failed, engine holds another book")
                return
            }
        }

        let wasPlaying = isPlaying

        // This seek is the reader's own; its echo through the actor's state must
        // not re-drive the view, which already moved.
        suppressActorHighlightsUntil = Date().addingTimeInterval(0.5)

        let success = await SMILPlayerActor.shared.seekToFragment(
            sectionIndex: sectionIndex,
            textId: anchor,
        )
        if success {
            debugLog("[MOM] handleSeekEvent - seek successful")
            playheadDiverged = false

            if wasPlaying {
                await sendHighlightCommand(sectionIndex: sectionIndex, textId: anchor)
                debugLog("[MOM] handleSeekEvent - resuming playback")
                try? await SMILPlayerActor.shared.play()
            } else if shouldHighlightPausedSeek(source: source) {
                await sendHighlightCommand(sectionIndex: sectionIndex, textId: anchor)
            } else {
                try? await commsBridge?.sendJsClearHighlight()
            }

            if !wasPlaying && source == .doubleTap {
                await autoPlayAfterDoubleTapIfEnabled()
            }
        } else {
            debugLog("[MOM] handleSeekEvent - seek failed")
        }
    }

    /// Kindle-style paused behavior: a page flip moves the playhead silently;
    /// only deliberate seeks (double tap) draw the highlight while paused.
    private func shouldHighlightPausedSeek(source: SeekSource) -> Bool {
        switch highlightVisibility {
            case .playing: return false
            case .paused: return source != .userNav
            case .always: return true
        }
    }

    private func autoPlayAfterDoubleTapIfEnabled() async {
        switch DoubleTapPlayMode(rawValue: settingsVM.doubleTapPlay) ?? .never {
            case .never:
                return
            case .always:
                await startPlaying(automaticRewind: false)
            case .headphones:
                if StorytellerPlatform.audioRoute?.isHeadphoneRouteActive == true {
                    await startPlaying(automaticRewind: false)
                }
        }
    }

    private func updateDivergence(section: Int) async {
        guard hasMediaOverlay,
            let currentSection = getSection(at: cachedSectionIndex),
            cachedEntryIndex < currentSection.mediaOverlay.count
        else { return }

        guard section == cachedSectionIndex else {
            playheadDiverged = true
            return
        }

        guard let visibleIds = try? await commsBridge?.sendJsGetFullyVisibleElementIds(),
            !visibleIds.isEmpty,
            let indexMap = textIdIndexBySection[section]
        else { return }

        let visibleIndices = visibleIds.compactMap { indexMap[$0] }
        guard let minIndex = visibleIndices.min(), let maxIndex = visibleIndices.max() else {
            playheadDiverged = true
            return
        }
        // Tolerate boundary sentences that straddle the page break.
        playheadDiverged = !(cachedEntryIndex >= minIndex - 1 && cachedEntryIndex <= maxIndex + 1)
    }

    /// Snap the view back to the current playhead position without moving audio.
    public func returnToPlayhead() async {
        guard let section = getSection(at: cachedSectionIndex),
            cachedEntryIndex < section.mediaOverlay.count
        else { return }

        let entry = section.mediaOverlay[cachedEntryIndex]
        if isPlaying || highlightVisibility != .playing {
            await sendHighlightCommand(
                sectionIndex: cachedSectionIndex,
                textId: entry.textId,
                seekToLocation: true,
            )
        } else {
            try? await commsBridge?.sendJsClearHighlight()
            try? await commsBridge?.sendJsGoToHrefCommand(href: "\(entry.textHref)#\(entry.textId)")
        }
        playheadDiverged = false
    }

    private func syncPlaybackActiveToJS() {
        let active = isPlaying
        Task {
            try? await commsBridge?.sendJsSetPlaybackActive(active)
        }
    }

    public func togglePlaying() async {
        if isPlaying {
            await stopPlaying()
        } else {
            await startPlaying()
        }
    }

    public func startPlaying(automaticRewind: Bool = true) async {
        guard !isPlaying else {
            debugLog("[MOM] startPlaying() - already playing, ignoring")
            return
        }

        debugLog("[MOM] startPlaying()")
        enableScreenWakeLock()

        do {
            let loadedBookID = await SMILPlayerActor.shared.getLoadedBookID()
            if loadedBookID != bookID {
                debugLog(
                    "[MOM] Actor has different book (\(loadedBookID?.description ?? "none")), reloading \(bookID)"
                )
                await reloadBookIntoActor()
            }

            try await SMILPlayerActor.shared.play(automaticRewind: automaticRewind)
            isPlaying = true
            syncPlaybackActiveToJS()
            playheadDiverged = false

            if let entry = await SMILPlayerActor.shared.getCurrentEntry() {
                let (currentSectionIndex, _) = await SMILPlayerActor.shared.getCurrentPosition()
                await sendHighlightCommand(
                    sectionIndex: currentSectionIndex,
                    textId: entry.textId,
                    seekToLocation: true,
                )
            }
            debugLog("[MOM] startPlaying() - started")
        } catch {
            debugLog("[MOM] startPlaying() - failed: \(error)")
            disableScreenWakeLock()
        }
    }

    public func stopPlaying() async {
        guard isPlaying else {
            debugLog("[MOM] stopPlaying() - already stopped, ignoring")
            return
        }

        debugLog("[MOM] stopPlaying()")
        disableScreenWakeLock()
        await SMILPlayerActor.shared.pause()
        isPlaying = false
        syncPlaybackActiveToJS()
        pageFlipTask?.cancel()
        pageFlipTask = nil
        if highlightVisibility == .playing {
            try? await commsBridge?.sendJsClearHighlight()
        }
        debugLog("[MOM] stopPlaying() - paused")
    }

    public func nextSentence() {
        guard hasMediaOverlay else {
            debugLog("[MOM] nextSentence() - no media overlay available")
            return
        }

        let sectionIndex = cachedSectionIndex
        let entryIndex = cachedEntryIndex

        guard let section = getSection(at: sectionIndex) else {
            debugLog("[MOM] nextSentence() - invalid section")
            return
        }

        let nextEntryIndex = entryIndex + 1
        if nextEntryIndex < section.mediaOverlay.count {
            let entry = section.mediaOverlay[nextEntryIndex]
            debugLog(
                "[MOM] nextSentence() - advancing to entry \(nextEntryIndex) in section \(sectionIndex)"
            )
            Task {
                let wasPlaying = isPlaying
                _ = await SMILPlayerActor.shared.seekToFragment(
                    sectionIndex: sectionIndex,
                    textId: entry.textId,
                )
                await sendHighlightCommand(
                    sectionIndex: sectionIndex,
                    textId: entry.textId,
                    seekToLocation: true,
                )
                if wasPlaying { try? await SMILPlayerActor.shared.play() }
            }
        } else {
            if let position = audioSectionIndexBySection[sectionIndex] {
                let nextPosition = position + 1
                if nextPosition < audioSectionIndices.count {
                    let nextSectionIndex = audioSectionIndices[nextPosition]
                    let entry = bookStructure[nextSectionIndex].mediaOverlay[0]
                    debugLog("[MOM] nextSentence() - advancing to section \(nextSectionIndex)")
                    Task {
                        let wasPlaying = isPlaying
                        _ = await SMILPlayerActor.shared.seekToFragment(
                            sectionIndex: nextSectionIndex,
                            textId: entry.textId,
                        )
                        await sendHighlightCommand(
                            sectionIndex: nextSectionIndex,
                            textId: entry.textId,
                            seekToLocation: true,
                        )
                        if wasPlaying { try? await SMILPlayerActor.shared.play() }
                    }
                    return
                }
                debugLog("[MOM] nextSentence() - at end of book")
                return
            }

            for nextSectionIndex in (sectionIndex + 1)..<bookStructure.count {
                let nextSection = bookStructure[nextSectionIndex]
                if !nextSection.mediaOverlay.isEmpty {
                    let entry = nextSection.mediaOverlay[0]
                    debugLog("[MOM] nextSentence() - advancing to section \(nextSectionIndex)")
                    Task {
                        let wasPlaying = isPlaying
                        _ = await SMILPlayerActor.shared.seekToFragment(
                            sectionIndex: nextSectionIndex,
                            textId: entry.textId,
                        )
                        await sendHighlightCommand(
                            sectionIndex: nextSectionIndex,
                            textId: entry.textId,
                            seekToLocation: true,
                        )
                        if wasPlaying { try? await SMILPlayerActor.shared.play() }
                    }
                    return
                }
            }
            debugLog("[MOM] nextSentence() - at end of book")
        }
    }

    public func prevSentence() {
        guard hasMediaOverlay else {
            debugLog("[MOM] prevSentence() - no media overlay available")
            return
        }

        let sectionIndex = cachedSectionIndex
        let entryIndex = cachedEntryIndex

        if entryIndex > 0 {
            guard let section = getSection(at: sectionIndex) else {
                debugLog("[MOM] prevSentence() - invalid section")
                return
            }
            let entry = section.mediaOverlay[entryIndex - 1]
            debugLog(
                "[MOM] prevSentence() - going to entry \(entryIndex - 1) in section \(sectionIndex)"
            )
            Task {
                let wasPlaying = isPlaying
                _ = await SMILPlayerActor.shared.seekToFragment(
                    sectionIndex: sectionIndex,
                    textId: entry.textId,
                )
                await sendHighlightCommand(
                    sectionIndex: sectionIndex,
                    textId: entry.textId,
                    seekToLocation: true,
                )
                if wasPlaying { try? await SMILPlayerActor.shared.play() }
            }
        } else {
            if let position = audioSectionIndexBySection[sectionIndex] {
                let prevPosition = position - 1
                if prevPosition >= 0 {
                    let prevSectionIndex = audioSectionIndices[prevPosition]
                    let lastEntryIndex = bookStructure[prevSectionIndex].mediaOverlay.count - 1
                    let entry = bookStructure[prevSectionIndex].mediaOverlay[lastEntryIndex]
                    debugLog(
                        "[MOM] prevSentence() - going to section \(prevSectionIndex), entry \(lastEntryIndex)"
                    )
                    Task {
                        let wasPlaying = isPlaying
                        _ = await SMILPlayerActor.shared.seekToFragment(
                            sectionIndex: prevSectionIndex,
                            textId: entry.textId,
                        )
                        await sendHighlightCommand(
                            sectionIndex: prevSectionIndex,
                            textId: entry.textId,
                            seekToLocation: true,
                        )
                        if wasPlaying { try? await SMILPlayerActor.shared.play() }
                    }
                    return
                }
                debugLog("[MOM] prevSentence() - at beginning of book")
                return
            }

            for prevSectionIndex in (0..<sectionIndex).reversed() {
                let prevSection = bookStructure[prevSectionIndex]
                if !prevSection.mediaOverlay.isEmpty {
                    let lastEntryIndex = prevSection.mediaOverlay.count - 1
                    let entry = prevSection.mediaOverlay[lastEntryIndex]
                    debugLog(
                        "[MOM] prevSentence() - going to section \(prevSectionIndex), entry \(lastEntryIndex)"
                    )
                    Task {
                        let wasPlaying = isPlaying
                        _ = await SMILPlayerActor.shared.seekToFragment(
                            sectionIndex: prevSectionIndex,
                            textId: entry.textId,
                        )
                        await sendHighlightCommand(
                            sectionIndex: prevSectionIndex,
                            textId: entry.textId,
                            seekToLocation: true,
                        )
                        if wasPlaying { try? await SMILPlayerActor.shared.play() }
                    }
                    return
                }
            }
            debugLog("[MOM] prevSentence() - at beginning of book")
        }
    }

    public func setPlaybackRate(_ rate: Double) {
        playbackRate = rate
        debugLog("[MOM] Playback rate set to: \(rate)x")
        Task {
            await SMILPlayerActor.shared.setPlaybackRate(rate)
        }
    }

    /// Set volume level for audio narration (macOS only)
    public func setVolume(_ newVolume: Double) {
        let clampedVolume = max(0.0, min(1.0, newVolume))
        volume = clampedVolume
        debugLog("[MOM] Volume set to: \(Int(clampedVolume * 100))%")
        Task {
            await SMILPlayerActor.shared.setVolume(clampedVolume)
        }
    }

    public func startSleepTimer(duration: TimeInterval?, type: SleepTimerType) {
        cancelSleepTimer()

        sleepTimerType = type

        if type == .endOfChapter {
            debugLog("[MOM] Sleep timer: will pause at end of current chapter")
            sleepTimerActive = true
            sleepTimerRemaining = nil
        } else if let duration = duration {
            debugLog("[MOM] Sleep timer: starting \(Int(duration))s countdown")
            sleepTimerActive = true
            sleepTimerRemaining = duration

            sleepTimerTask = Task { @StorytellerUIActor [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1))
                    guard !Task.isCancelled, let self else { return }
                    await self.updateSleepTimer()
                }
            }
        }
    }

    public func cancelSleepTimer() {
        debugLog("[MOM] Sleep timer cancelled")
        sleepTimerTask?.cancel()
        sleepTimerTask = nil
        sleepTimerActive = false
        sleepTimerRemaining = nil
        sleepTimerType = nil
    }

    /// Internal: Update sleep timer countdown
    private func updateSleepTimer() async {
        guard sleepTimerActive else { return }

        if sleepTimerType == .endOfChapter {
            return
        }

        guard var remaining = sleepTimerRemaining else {
            cancelSleepTimer()
            return
        }

        remaining -= 1.0
        sleepTimerRemaining = remaining

        if remaining <= 0 {
            debugLog("[MOM] Sleep timer expired - pausing playback")
            let wasPlaying = isPlaying
            cancelSleepTimer()
            if wasPlaying {
                await progressManager?.togglePlaying()
            }
        }
    }

    public func checkChapterEndForSleepTimer(message: MediaOverlayProgressMessage) {
        guard sleepTimerActive,
            sleepTimerType == .endOfChapter,
            isPlaying
        else { return }

        guard let chapterElapsed = message.chapterElapsedSeconds,
            let chapterTotal = message.chapterTotalSeconds
        else { return }

        if chapterElapsed >= chapterTotal - 0.5 {
            debugLog("[MOM] End of chapter reached - sleep timer pausing playback")
            Task {
                self.cancelSleepTimer()
                if self.isPlaying {
                    await self.progressManager?.togglePlaying()
                }
            }
        }
    }

    /// Cleanup when closing the book (stops audio playback and sleep timer)
    public func cleanup() async {
        debugLog("[MOM] MediaOverlayManager cleanup - stopping audio playback and sleep timer")

        cancelSleepTimer()
        pageFlipTask?.cancel()
        pageFlipTask = nil
        liveSyncFollowRate = nil
        lastLiveSyncApplyTime = nil
        disableScreenWakeLock()

        if let observerId = smilObserverId {
            await SMILPlayerActor.shared.removeStateObserver(id: observerId)
            smilObserverId = nil
        }

        if isPlaying {
            isPlaying = false
            // A stale manager must not pause another book's playback.
            if await SMILPlayerActor.shared.getLoadedBookID() == bookID {
                await SMILPlayerActor.shared.pause()
            }
        }

        try? await commsBridge?.sendJsClearHighlight()
        debugLog("[MOM] Cleanup completed")
    }

    /// Tear down timers, wake lock, and the engine observer without touching playback.
    public func detach() async {
        debugLog("[MOM] MediaOverlayManager detach - releasing view resources, playback continues")

        cancelSleepTimer()
        pageFlipTask?.cancel()
        pageFlipTask = nil
        liveSyncFollowRate = nil
        lastLiveSyncApplyTime = nil
        disableScreenWakeLock()

        if let observerId = smilObserverId {
            await SMILPlayerActor.shared.removeStateObserver(id: observerId)
            smilObserverId = nil
        }
    }

    /// Handle progress update from media overlay (called via bridge)
    public func handleProgressUpdate(_ message: MediaOverlayProgressMessage) {
        chapterElapsedSeconds = message.chapterElapsedSeconds
        chapterTotalSeconds = message.chapterTotalSeconds
        bookElapsedSeconds = message.bookElapsedSeconds
        bookTotalSeconds = message.bookTotalSeconds
        currentFragment = message.currentFragment

        checkChapterEndForSleepTimer(message: message)

        debugLog(
            "[MOM] Audio progress: chapter \(message.chapterElapsedSeconds?.description ?? "nil")/\(message.chapterTotalSeconds?.description ?? "nil")s, book \(message.bookElapsedSeconds?.description ?? "nil")/\(message.bookTotalSeconds?.description ?? "nil")s, fragment: \(message.currentFragment ?? "nil")"
        )
    }

    private func enableScreenWakeLock() {
        setWakeLock?(true)
    }

    private func disableScreenWakeLock() {
        setWakeLock?(false)
    }

    private static func buildAudioSectionIndices(bookStructure: [SectionInfo]) -> [Int] {
        var indices: [Int] = []
        indices.reserveCapacity(bookStructure.count)

        for (index, section) in bookStructure.enumerated() {
            if !section.mediaOverlay.isEmpty {
                indices.append(index)
            }
        }

        return indices
    }

    private static func buildAudioSectionIndexMap(audioSectionIndices: [Int]) -> [Int: Int] {
        var map: [Int: Int] = [:]
        map.reserveCapacity(audioSectionIndices.count)

        for (position, sectionIndex) in audioSectionIndices.enumerated() {
            map[sectionIndex] = position
        }

        return map
    }

    private static func buildTextIdIndexBySection(
        bookStructure: [SectionInfo]
    ) -> [Int: [String: Int]] {
        var result: [Int: [String: Int]] = [:]
        result.reserveCapacity(bookStructure.count)

        for (sectionIndex, section) in bookStructure.enumerated() {
            guard !section.mediaOverlay.isEmpty else { continue }
            var indexMap: [String: Int] = [:]
            indexMap.reserveCapacity(section.mediaOverlay.count)

            for (entryIndex, entry) in section.mediaOverlay.enumerated() {
                if indexMap[entry.textId] == nil {
                    indexMap[entry.textId] = entryIndex
                }
            }

            result[sectionIndex] = indexMap
        }

        return result
    }

    public func getSection(at index: Int) -> SectionInfo? {
        guard index >= 0 && index < bookStructure.count else { return nil }
        return bookStructure[index]
    }

    /// Send highlight command to JS for the current fragment
    private func sendHighlightCommand(
        sectionIndex: Int,
        textId: String,
        seekToLocation: Bool = false,
    ) async {
        do {
            try await commsBridge?.sendJsHighlightFragment(
                sectionIndex: sectionIndex,
                textId: textId,
                seekToLocation: seekToLocation,
            )
            debugLog(
                "[MOM] Highlight command sent: section=\(sectionIndex), textId=\(textId), seekToLocation=\(seekToLocation)"
            )
        } catch {
            debugLog("[MOM] Error sending highlight command: \(error)")
        }
    }

    /// Handle element visibility message from JS (for page flip timing)
    public func handleElementVisibility(_ message: ElementVisibilityMessage) {
        pageFlipTask?.cancel()
        pageFlipTask = nil

        guard (isPlaying || isFollowingLiveSync) && !playheadDiverged else { return }

        debugLog(
            "[MOM] Element visibility: textId=\(message.textId), visible=\(message.visibleRatio), offScreen=\(message.offScreenRatio)"
        )

        if message.offScreenRatio >= 0.9 {
            debugLog("[MOM] Element almost fully off-screen, flipping immediately")
            Task {
                await self.flipPageIfNotDebounced()
            }
        } else if message.offScreenRatio > 0 {
            pageFlipTask = Task { @StorytellerUIActor [weak self] in
                guard let self else { return }
                guard let entry = await self.entryForPageFlipTiming() else { return }
                let entryDuration = entry.end - entry.begin
                let earlyOffset = message.visibleRatio >= 0.98 ? 0.0 : 1.0
                let rate = self.liveSyncFollowRate ?? self.playbackRate
                let delay = max(
                    0,
                    (entryDuration * message.visibleRatio / rate) - earlyOffset,
                )

                debugLog(
                    "[MOM] Scheduling page flip in \(String(format: "%.2f", delay))s (entry duration: \(String(format: "%.2f", entryDuration))s, visible: \(String(format: "%.0f", message.visibleRatio * 100))%)"
                )

                try? await Task.sleep(for: .seconds(delay))
                guard !Task.isCancelled else { return }
                await self.flipPageIfNotDebounced()
            }
        }
    }

    /// While following live sync the engine is idle, so flips time off our
    /// own structure instead of the engine's current entry.
    private func entryForPageFlipTiming() async -> SMILEntry? {
        if isPlaying {
            return await SMILPlayerActor.shared.getCurrentEntry()
        }
        guard let section = getSection(at: cachedSectionIndex),
            cachedEntryIndex < section.mediaOverlay.count
        else {
            return nil
        }
        return section.mediaOverlay[cachedEntryIndex]
    }

    private func flipPageIfNotDebounced() async {
        guard (isPlaying || isFollowingLiveSync) && !playheadDiverged else { return }

        if let last = lastFlipTime, Date().timeIntervalSince(last) < 0.3 {
            debugLog("[MOM] Debouncing page flip")
            return
        }

        lastFlipTime = Date()
        debugLog("[MOM] Page flip")
        try? await commsBridge?.sendJsGoRightCommand()
    }
}
