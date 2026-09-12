#if os(iOS) || os(macOS)
import SwiftUI
import WebKit

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@MainActor
@Observable
class EbookPlayerViewModel {
    let bookData: PlayerBookData?
    var settingsVM: SettingsViewModel

    private(set) var session: ReadingSession? = nil
    private var userSelectedTocId: String? = nil
    private var comicBookStructure: [SectionInfo] = []
    private var comicProgressManager: EphemeralProgressManager? = nil
    private var bridgeInitialColorScheme: ColorScheme = .light
    @ObservationIgnored private var scenePhaseTask: Task<Void, Never>?
    var styleManager: ReaderStyleManager? = nil
    var coverTone: CoverHSB? = nil
    var searchManager: EbookSearchManager? = nil
    var comicPageURLs: [URL] = []
    #if os(iOS)
    private(set) var recoveryManager: WebViewRecoveryManager?
    #endif

    var bookStructure: [SectionInfo] {
        if !comicBookStructure.isEmpty {
            return comicBookStructure
        }
        return session?.bookStructure ?? []
    }

    var tocEntries: [TocEntry] {
        session?.tocEntries ?? []
    }

    var mediaOverlayManager: MediaOverlayManager? {
        session?.mediaOverlayManager
    }

    var progressManager: EphemeralProgressManager? {
        comicProgressManager ?? session?.progressManager
    }

    var extractedEbookPath: URL? {
        get { session?.extractedEbookPath }
        set { session?.extractedEbookPath = newValue }
    }

    var ebookFileFormat: EbookFileFormat {
        session?.ebookFileFormat ?? .epub
    }

    var hasAudioNarration: Bool {
        session?.hasAudioNarration ?? false
    }

    var chapterList: [ChapterItem] {
        if !tocEntries.isEmpty {
            return tocEntries.enumerated().map { idx, entry in
                ChapterItem(
                    id: "toc-\(idx)",
                    label: entry.label,
                    href: entry.href,
                    level: entry.level,
                )
            }
        }
        return bookStructure.filter { $0.label != nil }.map {
            ChapterItem(
                id: $0.id,
                label: $0.label ?? "Untitled",
                href: $0.id,
                level: $0.level ?? 0,
            )
        }
    }

    var isComicBook: Bool {
        ebookFileFormat == .cbz
    }

    var currentSectionIndex: Int? {
        progressManager?.selectedChapterId
    }

    private var _sidebarInitialized = false
    #if os(macOS)
    var showChapterSidebar: Bool = false {
        didSet {
            if _sidebarInitialized && oldValue != showChapterSidebar {
                debugLog(
                    "[EbookPlayerViewModel] Chapter sidebar changed: \(oldValue) -> \(showChapterSidebar), saving..."
                )
                UserDefaults.standard.set(
                    showChapterSidebar,
                    forKey: "EbookPlayerShowChapterSidebar",
                )
            }
        }
    }
    var showAudioSidebar: Bool = false {
        didSet {
            if _sidebarInitialized && oldValue != showAudioSidebar {
                debugLog(
                    "[EbookPlayerViewModel] Sidebar changed: \(oldValue) -> \(showAudioSidebar), saving..."
                )
                UserDefaults.standard.set(showAudioSidebar, forKey: "EbookPlayerShowAudioSidebar")
            }
        }
    }
    var isTitleBarHovered = false
    #else
    var showAudioSidebar: Bool = false {
        didSet {
            if _sidebarInitialized && oldValue != showAudioSidebar {
                UserDefaults.standard.set(
                    showAudioSidebar,
                    forKey: "EbookPlayerShowAudioSidebarIOS",
                )
            }
        }
    }
    var showAudioSheet = false
    var isDockVisible = true
    var isMenuBarVisible = true
    var collapseCardTrigger = 0
    #endif
    var showCustomizePopover = false
    var commsBridge: ReaderCommsBridge? = nil
    var playbackProgressMessage: Any? = nil

    var chapterProgressBinding: Binding<Double> {
        Binding(
            get: {
                if self.isComicBook {
                    return self.progressManager?.bookFraction ?? 0.0
                }
                return self.progressManager?.chapterSeekBarValue ?? 0.0
            },
            set: { newValue in
                if self.isComicBook {
                    self.progressManager?.handleNativeProgressSeek(newValue)
                } else {
                    self.progressManager?.handleUserProgressSeek(newValue)
                }
            },
        )
    }

    var selectedChapterHref: String? {
        guard let index = progressManager?.selectedChapterId else { return nil }
        if !tocEntries.isEmpty {
            // If user explicitly clicked a toc entry, and it still matches the current section, use it
            if let userSelected = userSelectedTocId,
                userSelected.hasPrefix("toc-"),
                let idx = Int(userSelected.dropFirst(4)),
                idx < tocEntries.count,
                tocEntries[idx].sectionIndex == index
            {
                return userSelected
            }
            // Otherwise find the first toc entry that matches this section index
            for (offset, entry) in tocEntries.enumerated() {
                if entry.sectionIndex == index {
                    return "toc-\(offset)"
                }
            }
            // No exact match - find the last entry with a lower section index
            var lastOffset: Int? = nil
            for (offset, entry) in tocEntries.enumerated() {
                if entry.sectionIndex < index {
                    lastOffset = offset
                }
            }
            if let offset = lastOffset {
                return "toc-\(offset)"
            }
            return nil
        }
        return bookStructure[safe: index]?.id
    }

    var sleepTimerActive = false
    var sleepTimerRemaining: TimeInterval? = nil
    var sleepTimerType: Any? = nil
    var lastRestartTime: Date? = nil
    var showKeybindingsPopover = false
    var showSearchPanel = false
    var pendingSearchReveal = false
    var showTranslation = false
    var translationText = ""
    var showBookmarksPanel = false
    var showReadingTimeline = false
    var showImageGallery = false
    var timelineBackLocator: BookLocator? = nil
    var timelineBackDescription = ""
    var timelineForwardLocator: BookLocator? = nil
    var timelineForwardDescription = ""
    var showSleepTimerSheet = false
    var bookmarksPanelInitialTab: BookmarksPanel.Tab = .bookmarks
    var highlights: [Highlight] = []
    var pendingSelection: TextSelectionMessage? = nil
    var pendingEditHighlight: Highlight? = nil

    var showServerPositionDialog = false
    var pendingServerPosition: IncomingServerPosition? = nil

    var serverPositionDescription: String {
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

    var bookmarks: [Highlight] {
        highlights.filter { $0.isBookmark }.sorted { $0.createdAt > $1.createdAt }
    }

    var coloredHighlights: [Highlight] {
        highlights.filter { !$0.isBookmark }.sorted { $0.createdAt > $1.createdAt }
    }

    init(bookData: PlayerBookData?, settingsVM: SettingsViewModel = SettingsViewModel()) {
        self.bookData = bookData
        self.settingsVM = settingsVM
        #if os(macOS)
        let savedAudioSidebarState =
            UserDefaults.standard.object(forKey: "EbookPlayerShowAudioSidebar") as? Bool
        self.showAudioSidebar = savedAudioSidebarState ?? true
        let savedChapterSidebarState =
            UserDefaults.standard.object(forKey: "EbookPlayerShowChapterSidebar") as? Bool
        self.showChapterSidebar = savedChapterSidebarState ?? false
        debugLog(
            "[EbookPlayerViewModel] Init - audio sidebar: \(self.showAudioSidebar), chapter sidebar: \(self.showChapterSidebar)"
        )
        #else
        self.showAudioSidebar =
            UserDefaults.standard.object(forKey: "EbookPlayerShowAudioSidebarIOS") as? Bool ?? false
        #endif
        self._sidebarInitialized = true
    }

    func handleChapterSelection(_ chapter: ChapterItem) {
        userSelectedTocId = chapter.id
        if isComicBook, let index = Int(chapter.href) ?? Int(chapter.id) {
            progressManager?.handleNativePageSelected(index)
            return
        }
        if !tocEntries.isEmpty, chapter.id.hasPrefix("toc-"),
            let idx = Int(chapter.id.dropFirst(4)), idx < tocEntries.count
        {
            let entry = tocEntries[idx]
            let fragment = entry.href.components(separatedBy: "#").dropFirst().first

            if let fragment, let sectionId = bookStructure[safe: entry.sectionIndex]?.id {
                let fullHref = "\(sectionId)#\(fragment)"
                progressManager?.handleUserChapterSelectedWithHref(
                    entry.sectionIndex,
                    href: fullHref,
                )
            } else {
                progressManager?.handleUserChapterSelected(entry.sectionIndex)
            }
            return
        }
        handleChapterSelectionByHref(chapter.href)
    }

    func handleChapterSelectionByHref(_ href: String) {
        debugLog("[EbookPlayerViewModel] Chapter selected by href: \(href)")

        guard let chapterIndex = findSectionIndex(for: href, in: bookStructure) else {
            debugLog("[EbookPlayerViewModel] Chapter not found for href: \(href)")
            return
        }

        debugLog("[EbookPlayerViewModel] Found chapter at index: \(chapterIndex)")
        progressManager?.handleUserChapterSelected(chapterIndex)
    }

    func handlePrevChapter() {
        userSelectedTocId = nil
        if isComicBook {
            progressManager?.handleNativeNavLeft()
            return
        }
        guard let currentIndex = progressManager?.selectedChapterId else {
            debugLog("[EbookPlayerViewModel] Cannot navigate - no chapter selected")
            return
        }

        let restarts = previousChapterRestarts(
            progressInChapter: progressManager?.chapterSeekBarValue ?? 0,
            lastRestartAt: lastRestartTime,
        )

        if !restarts && currentIndex > 0 {
            progressManager?.handleUserChapterSelected(currentIndex - 1)
            lastRestartTime = nil
        } else {
            handleProgressSeek(0.0)
            lastRestartTime = Date()
        }
    }

    func handleNextChapter() {
        userSelectedTocId = nil
        if isComicBook {
            progressManager?.handleNativeNavRight()
            return
        }
        guard let currentIndex = progressManager?.selectedChapterId,
            currentIndex < bookStructure.count - 1
        else {
            debugLog(
                "[EbookPlayerViewModel] Cannot go to next chapter - at last chapter or no selection"
            )
            return
        }

        let nextChapter = bookStructure[safe: currentIndex + 1]
        debugLog(
            "[EbookPlayerViewModel] Navigating to next chapter: \(nextChapter?.label ?? "nil")"
        )
        progressManager?.handleUserChapterSelected(currentIndex + 1)
    }

    func handlePlaybackRateChange(_ rate: Double) {
        debugLog("[EbookPlayerViewModel] Received playback rate change to \(rate)")
        settingsVM.defaultPlaybackSpeed = rate
        mediaOverlayManager?.setPlaybackRate(rate)

        Task { @MainActor in
            do {
                try await settingsVM.save()
            } catch {
                debugLog("[EbookPlayerViewModel] Failed to save playback rate: \(error)")
            }
        }
    }

    func handleVolumeChange(_ newVolume: Double) {
        debugLog("[EbookPlayerViewModel] Received volume change to \(newVolume)")
        settingsVM.defaultVolume = newVolume
        mediaOverlayManager?.setVolume(newVolume)

        Task { @MainActor in
            do {
                try await settingsVM.save()
            } catch {
                debugLog("[EbookPlayerViewModel] Failed to save volume: \(error)")
            }
        }
    }

    func handleSleepTimerStart(_ duration: TimeInterval?, _ type: SleepTimerType) {
        debugLog(
            "[EbookPlayerViewModel] Starting sleep timer - type: \(type), duration: \(duration?.description ?? "N/A")"
        )
        mediaOverlayManager?.startSleepTimer(duration: duration, type: type)
    }

    func handleSleepTimerCancel() {
        debugLog("[EbookPlayerViewModel] Cancelling sleep timer")
        mediaOverlayManager?.cancelSleepTimer()
    }

    func handleToggleOverlay() {
        #if os(iOS)
        if settingsVM.alwaysShowMiniPlayer {
            isMenuBarVisible.toggle()
            if !isMenuBarVisible {
                collapseCardTrigger += 1
            }
            debugLog("[EbookPlayerViewModel] Toggled menu bar visibility: \(isMenuBarVisible)")
        } else {
            isDockVisible.toggle()
            isMenuBarVisible = isDockVisible
            debugLog("[EbookPlayerViewModel] Toggled dock visibility: \(isDockVisible)")
        }
        #endif
    }

    func handleNextSentence() {
        mediaOverlayManager?.nextSentence()
    }

    func handlePrevSentence() {
        mediaOverlayManager?.prevSentence()
    }

    func handleProgressSeek(_ fraction: Double) {
        if isComicBook {
            progressManager?.handleNativeProgressSeek(fraction)
        } else {
            progressManager?.handleUserProgressSeek(fraction)
        }
    }

    func handleColorSchemeChange(_ colorScheme: ColorScheme) {
        settingsVM.applyActiveTheme(for: colorScheme)
        styleManager?.handleDarkModeChange(colorScheme == .dark)
    }

    func handleAppBackgrounding() async {
        debugLog(
            "[EbookPlayerViewModel] App backgrounding - syncing progress (audio continues in background)"
        )

        await progressManager?.syncProgressToServer(reason: .appBackgrounding)

        debugLog("[EbookPlayerViewModel] Background sync complete")
    }

    func handleOnAppear() {
        #if os(iOS)
        recoveryManager = WebViewRecoveryManager(viewModel: self)
        ScreenWakeLock.shared.set(true, reason: .bookOpen)
        #endif

        if let data = bookData {
            let session = ReadingSessionStore.shared.obtain(
                metadata: data.metadata,
                category: data.category,
                localMediaPath: data.localMediaPath,
                settings: settingsVM,
            )
            self.session = session
            configureSessionHooks(session)
            session.prepare()
            #if os(macOS)
            EbookWindowRouter.shared.register(self, for: data.metadata.id)
            #endif
        }
    }

    private func configureSessionHooks(_ session: ReadingSession) {
        session.onComicPrepared = { [weak self] url in
            self?.prepareComicPages(from: url)
        }
        session.onUserNavigation = { [weak self] in
            self?.userSelectedTocId = nil
        }
        #if os(iOS)
        session.isViewRecovering = { [weak self] in
            self?.recoveryManager?.isInRecovery == true
        }
        session.onRecoveryStructureReady = { [weak self] in
            _ = self?.recoveryManager?.handleBookStructureReadyIfRecovering()
        }
        #endif
        session.configureMediaOverlayManager = { [weak self] manager in
            guard let self else { return }
            manager.setWakeLock = { ScreenWakeLock.shared.set($0) }
            manager.setPlaybackRate(self.settingsVM.defaultPlaybackSpeed)
        }
        session.onReadaloudAvailabilityChanged = { [weak self] available in
            self?.styleManager?.setReadaloudModeAvailable(available)
        }
        session.onViewStructureReady = { [weak self] in
            guard let self else { return }
            self.settingsVM.applyActiveTheme(for: self.bridgeInitialColorScheme)
            self.styleManager?.sendInitialStyles(
                isDarkMode: self.bridgeInitialColorScheme == .dark
            )
            await self.loadHighlights()
        }
        session.onIncomingServerPosition = { [weak self] position in
            Task { @MainActor [weak self] in
                guard let self else { return }
                // Live reading sync implies the user wants positions followed
                // silently, so skip the dialog even if auto-sync is off.
                if self.settingsVM.autoSyncToNewerServerPosition
                    || self.settingsVM.liveReadingSyncEnabled
                {
                    await self.navigateToServerPosition(position.locator)
                } else {
                    self.pendingServerPosition = position
                    self.showServerPositionDialog = true
                }
            }
        }
    }

    private func prepareComicPages(from extractedDirectory: URL) {
        let urls = Self.comicImageURLs(in: extractedDirectory)
        comicPageURLs = urls
        comicBookStructure = urls.enumerated().map { index, url in
            SectionInfo(
                index: index,
                id: "\(index)",
                label: "Page \(index + 1)",
                level: 0,
                mediaOverlay: [],
            )
        }
        session?.hasAudioNarration = false
        searchManager = nil
        styleManager = nil
        let manager = EphemeralProgressManager(
            bridge: nil,
            settingsVM: settingsVM,
            bookID: bookData?.metadata.id,
            initialLocator: bookData?.metadata.position?.locator,
        )
        manager.bookStructure = comicBookStructure
        manager.bookTitle = bookData?.metadata.title
        manager.bookAuthor = bookData?.metadata.authors?.first?.name
        manager.handleNativeBookStructureReady(pageCount: urls.count)
        comicProgressManager = manager

        Task { @MainActor in
            let syncInterval = await SettingsActor.shared.config.sync.progressSyncIntervalSeconds
            self.comicProgressManager?.startPeriodicSync(syncInterval: syncInterval)
        }
    }

    private static func comicImageURLs(in directory: URL) -> [URL] {
        let allowedExtensions: Set<String> = [
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "jxl", "avif",
        ]
        guard
            let enumerator = FileManager.default.enumerator(
                at: directory,
                includingPropertiesForKeys: [.isRegularFileKey],
            )
        else {
            return []
        }

        return enumerator.compactMap { item -> URL? in
            guard let url = item as? URL else { return nil }
            let ext = url.pathExtension.lowercased()
            guard allowedExtensions.contains(ext) else { return nil }
            let values = try? url.resourceValues(forKeys: [.isRegularFileKey])
            return values?.isRegularFile == false ? nil : url
        }
        .sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
    }

    func handleComicPageSelected(_ index: Int) {
        userSelectedTocId = nil
        progressManager?.handleNativePageSelected(index)
    }

    func navigateToServerPosition(_ locator: BookLocator) async {
        debugLog("[EbookPlayerViewModel] Navigating to server position: \(locator.href)")
        progressManager?.handleServerPositionUpdate(locator)
    }

    private func currentPositionLocator() async -> BookLocator? {
        if let live = progressManager?.currentLocator() {
            return live
        }
        if let bookID = bookData?.metadata.id,
            let synced = await ProgressSyncActor.shared.getBookProgress(for: bookID)?.locator
        {
            return synced
        }
        guard let fraction = progressManager?.bookFraction else { return nil }
        return ReadingTimelineSheet.fractionLocator(fraction)
    }

    func currentPositionDescription() -> String {
        guard let pm = progressManager else { return "" }
        if let chapterIdx = pm.selectedChapterId,
            let chapterName = bookStructure[safe: chapterIdx]?.label
        {
            return chapterName
        }
        if let fraction = pm.bookFraction {
            return "\(Int((fraction * 100).rounded()))% of book"
        }
        return ""
    }

    func jumpFromTimeline(to locator: BookLocator, description: String) async {
        if let origin = await currentPositionLocator() {
            timelineBackLocator = origin
            timelineBackDescription = currentPositionDescription()
        }
        timelineForwardLocator = nil
        timelineForwardDescription = ""
        showReadingTimeline = false
        await navigateToServerPosition(locator)
        await recordTimelineJump(to: locator, description: description)
    }

    func timelineGoBack() async {
        guard let target = timelineBackLocator else { return }
        let description = timelineBackDescription
        timelineForwardLocator = await currentPositionLocator()
        timelineForwardDescription = currentPositionDescription()
        timelineBackLocator = nil
        timelineBackDescription = ""
        await navigateToServerPosition(target)
        await recordTimelineJump(to: target, description: description)
    }

    func timelineGoForward() async {
        guard let target = timelineForwardLocator else { return }
        let description = timelineForwardDescription
        timelineBackLocator = await currentPositionLocator()
        timelineBackDescription = currentPositionDescription()
        timelineForwardLocator = nil
        timelineForwardDescription = ""
        await navigateToServerPosition(target)
        await recordTimelineJump(to: target, description: description)
    }

    // Server-position navigation alone never syncs the new position.
    private func recordTimelineJump(to locator: BookLocator, description: String) async {
        guard let bookID = bookData?.metadata.id else { return }
        _ = await ProgressSyncActor.shared.restorePosition(
            bookID: bookID,
            locator: locator,
            locationDescription: description,
        )
    }

    func dismissTimelineBreadcrumbs() {
        timelineBackLocator = nil
        timelineBackDescription = ""
        timelineForwardLocator = nil
        timelineForwardDescription = ""
    }

    func acceptServerPosition() {
        guard let position = pendingServerPosition else { return }
        Task {
            await navigateToServerPosition(position.locator)
        }
        pendingServerPosition = nil
        showServerPositionDialog = false
    }

    func declineServerPosition() {
        pendingServerPosition = nil
        showServerPositionDialog = false
    }

    #if os(macOS)
    // Awaited so the incoming book cannot race this one for the shared audio actors.
    func closeForSwitch() async {
        if let bookID = bookData?.metadata.id,
            EbookWindowRouter.shared.viewModel(for: bookID) === self
        {
            EbookWindowRouter.shared.unregister(for: bookID)
        }
        session?.removeIncomingPositionObserver()
        await comicProgressManager?.cleanup()
        await session?.close(.endSession)
    }
    #endif

    func handleOnDisappear(close policy: ReadingSessionClosePolicy? = .endSession) {
        debugLog("[EbookPlayerViewModel] View disappearing (policy: \(String(describing: policy)))")

        #if os(iOS)
        ScreenWakeLock.shared.set(false, reason: .bookOpen)
        #endif

        #if os(macOS)
        if let bookID = bookData?.metadata.id,
            EbookWindowRouter.shared.viewModel(for: bookID) === self
        {
            EbookWindowRouter.shared.unregister(for: bookID)
        }
        #endif

        session?.removeIncomingPositionObserver()

        guard let policy else {
            debugLog("[EbookPlayerViewModel] Background disappear - preserving SMIL playback")
            return
        }

        Task { @MainActor in
            if policy == .endSession {
                await comicProgressManager?.cleanup()
            }
            await session?.close(policy)
        }
    }

    func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
            case .active:
                #if os(iOS)
                recoveryManager?.setSceneActive(true)
                #endif
                let precedingTask = scenePhaseTask
                scenePhaseTask = Task { @MainActor [weak self] in
                    await precedingTask?.value
                    await self?.session?.handleSceneBecameActive()
                }
            case .background:
                debugLog("[EbookPlayerViewModel] Entering background - audio continues natively")
                #if os(iOS)
                recoveryManager?.setSceneActive(false)
                #endif
                let precedingTask = scenePhaseTask
                scenePhaseTask = Task { @MainActor [weak self] in
                    await precedingTask?.value
                    await self?.session?.handleSceneEnteredBackground()
                }
            case .inactive:
                break
            @unknown default:
                break
        }
    }

    func installBridgeHandlers(_ bridge: ReaderCommsBridge, initialColorScheme: ColorScheme) {
        debugLog("[EbookPlayerViewModel] Installing bridge handlers")
        bridgeInitialColorScheme = initialColorScheme

        #if os(iOS)
        if recoveryManager?.isInRecovery == true {
            debugLog(
                "[EbookPlayerViewModel] Recovery mode - updating existing managers with new bridge"
            )
            session?.attachBridge(bridge, isRecovery: true)
            styleManager?.updateBridge(bridge)
            searchManager = EbookSearchManager(bridge: bridge)
            setupBridgeCallbacks(bridge)
            return
        }
        #endif

        session?.attachBridge(bridge, isRecovery: false)

        searchManager = EbookSearchManager(bridge: bridge)
        debugLog("[EbookPlayerViewModel] SearchManager initialized")

        styleManager = ReaderStyleManager(
            settingsVM: settingsVM,
            bridge: bridge,
        )
        styleManager?.setCoverTone(coverTone)

        setupBridgeCallbacks(bridge)
    }

    private func setupBridgeCallbacks(_ bridge: ReaderCommsBridge) {

        bridge.onOverlayToggled = { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                self.handleToggleOverlay()
            }
        }

        bridge.onTextSelected = { [weak self] message in
            guard let self else { return }
            Task { @MainActor in
                self.handleTextSelectionComplete(message)
            }
        }

        bridge.onSelectionHighlight = { [weak self] message in
            guard let self else { return }
            Task { @MainActor in
                let color = HighlightColor(rawValue: message.colorId)
                await self.addHighlight(from: message.selection, color: color)
                self.rememberLastUsedColor(message.colorId)
            }
        }

        bridge.onHighlightSetColor = { [weak self] message in
            guard let self else { return }
            Task { @MainActor in
                await self.handleHighlightSetColor(id: message.id, colorId: message.colorId)
                self.rememberLastUsedColor(message.colorId)
            }
        }

        bridge.onHighlightDelete = { [weak self] message in
            guard let self else { return }
            Task { @MainActor in
                await self.handleHighlightDelete(id: message.id)
            }
        }

        bridge.onHighlightEdit = { [weak self] message in
            guard let self else { return }
            Task { @MainActor in
                self.handleHighlightEdit(id: message.id)
            }
        }

        bridge.onSelectionTranslate = { [weak self] text in
            guard let self else { return }
            Task { @MainActor in
                self.translationText = text
                self.showTranslation = true
            }
        }

        bridge.onSelectionSearch = { [weak self] text in
            guard let self else { return }
            Task { @MainActor in
                self.searchManager?.searchQuery = text
                #if os(macOS)
                // The search popover anchors to the toolbar magnifier, which is
                // hidden until the title bar reveals. Reveal it first; the panel
                // is presented once the toolbar is on-screen (handleTitleBarApplied).
                self.pendingSearchReveal = true
                #else
                self.showSearchPanel = true
                await self.searchManager?.startSearch(query: text)
                #endif
            }
        }
    }

    #if os(macOS)
    /// Defers the search popover until the toolbar anchor is on-screen, avoiding a flicker.
    func handleTitleBarApplied() {
        guard pendingSearchReveal, !showSearchPanel else { return }
        pendingSearchReveal = false
        showSearchPanel = true
        let query = searchManager?.searchQuery ?? ""
        Task { await searchManager?.startSearch(query: query) }
    }
    #endif

    /// Navigate to search result - view only, no audio sync
    func handleSearchResultNavigation(_ result: SearchResult) {
        Task { @MainActor in
            await searchManager?.navigateToResult(result)
        }
    }

    func loadHighlights() async {
        guard let bookID = bookData?.metadata.id else { return }

        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)
        debugLog("[EbookPlayerViewModel] Loaded \(highlights.count) highlights for book \(bookID)")

        await sendHighlightsToJS()
    }

    func addHighlight(
        from selection: TextSelectionMessage,
        color: HighlightColor?,
        note: String? = nil,
    ) async {
        guard let bookID = bookData?.metadata.id else { return }

        let locator = BookLocator(
            href: selection.href,
            type: "application/xhtml+xml",
            title: selection.title,
            locations: BookLocator.Locations(
                fragments: [selection.cfi],
                progression: nil,
                position: nil,
                totalProgression: nil,
                cssSelector: selection.startCssSelector,
                partialCfi: selection.cfi,
                domRange: BookLocator.Locations.DomRange(
                    start: BookLocator.Locations.DomRangeBoundary(
                        cssSelector: selection.startCssSelector,
                        textNodeIndex: selection.startTextNodeIndex,
                        charOffset: selection.startCharOffset,
                    ),
                    end: BookLocator.Locations.DomRangeBoundary(
                        cssSelector: selection.endCssSelector,
                        textNodeIndex: selection.endTextNodeIndex,
                        charOffset: selection.endCharOffset,
                    ),
                ),
            ),
            text: BookLocator.Text(
                after: nil,
                before: nil,
                highlight: selection.text,
            ),
        )

        let highlight = Highlight(
            bookID: bookID,
            locator: locator,
            text: selection.text,
            color: color,
            note: note,
        )

        await BookmarkActor.shared.addHighlight(highlight)
        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)

        pendingSelection = nil

        await sendHighlightsToJS()

        debugLog("[EbookPlayerViewModel] Added highlight: isBookmark=\(highlight.isBookmark)")
    }

    func deleteHighlight(_ highlight: Highlight) async {
        guard let bookID = bookData?.metadata.id else { return }

        await BookmarkActor.shared.deleteHighlight(id: highlight.id, bookID: bookID)
        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)

        if let bridge = commsBridge {
            do {
                try await bridge.sendJsRemoveHighlight(id: highlight.id.uuidString)
            } catch {
                debugLog("[EbookPlayerViewModel] Failed to remove highlight from JS: \(error)")
            }
        }

        debugLog("[EbookPlayerViewModel] Deleted highlight: \(highlight.id)")
    }

    #if os(iOS) || os(macOS)
    enum ImageIndexState {
        case idle
        case loading
        case ready
        case failed
    }

    var imageItems: [BookImageItem] = []
    var imageIndexState: ImageIndexState = .idle
    var hiddenImageIDs: Set<String> = []
    var pinnedImageIDs: Set<String> = []
    var tinyImageIDs: Set<String> = []
    private(set) var imageProvider: BookImageDataProvider?

    private static let tinyImageAreaThreshold: CGFloat = 22_500

    private var imagePrefsKey: String? {
        guard let id = bookData?.metadata.id else { return nil }
        return "\(id.sourceID):\(id.uuid)"
    }

    func buildImageIndexIfNeeded() async {
        guard imageIndexState == .idle, !isComicBook else { return }
        guard let epubURL = session?.originalEbookURL else { return }
        imageIndexState = .loading
        do {
            let items = try await Task.detached(priority: .utility) {
                try BookImageIndexer.buildIndex(epubURL: epubURL)
            }.value
            // Must exist before items publish; cells load thumbnails on appear.
            let provider = BookImageDataProvider(
                extractedRoot: extractedEbookPath,
                archiveURL: epubURL,
            )
            imageProvider = provider
            imageItems = items
            loadImagePrefs()
            imageIndexState = .ready
            let threshold = Self.tinyImageAreaThreshold
            tinyImageIDs = await Task.detached(priority: .utility) {
                var tiny: Set<String> = []
                for item in items {
                    guard let size = provider.pixelSize(for: item) else { continue }
                    if size.width * size.height < threshold {
                        tiny.insert(item.id)
                    }
                }
                return tiny
            }.value
        } catch {
            debugLog("[EbookPlayerViewModel] Image index failed: \(error)")
            imageIndexState = .failed
        }
    }

    private func loadImagePrefs() {
        guard let key = imagePrefsKey else { return }
        let defaults = UserDefaults.standard
        hiddenImageIDs = Set(defaults.stringArray(forKey: "EbookImagesHidden:\(key)") ?? [])
        pinnedImageIDs = Set(defaults.stringArray(forKey: "EbookImagesPinned:\(key)") ?? [])
    }

    func setImageHidden(_ item: BookImageItem, hidden: Bool) {
        if hidden {
            hiddenImageIDs.insert(item.id)
            pinnedImageIDs.remove(item.id)
        } else {
            hiddenImageIDs.remove(item.id)
        }
        saveImagePrefs()
    }

    func setImagePinned(_ item: BookImageItem, pinned: Bool) {
        if pinned {
            pinnedImageIDs.insert(item.id)
            hiddenImageIDs.remove(item.id)
        } else {
            pinnedImageIDs.remove(item.id)
        }
        saveImagePrefs()
    }

    private func saveImagePrefs() {
        guard let key = imagePrefsKey else { return }
        let defaults = UserDefaults.standard
        defaults.set(Array(hiddenImageIDs).sorted(), forKey: "EbookImagesHidden:\(key)")
        defaults.set(Array(pinnedImageIDs).sorted(), forKey: "EbookImagesPinned:\(key)")
    }

    func navigateToImage(_ item: BookImageItem) async {
        guard let bridge = commsBridge else { return }
        do {
            if let elementId = item.elementId {
                try await bridge.sendJsGoToHrefCommand(href: "\(item.sectionId)#\(elementId)")
            } else {
                try await bridge.sendJsGoToImageCommand(
                    sectionIndex: item.sectionIndex,
                    filename: (item.imagePath as NSString).lastPathComponent,
                )
            }
        } catch {
            debugLog("[EbookPlayerViewModel] Failed to navigate to image: \(error)")
        }
    }
    #endif

    func navigateToHighlight(_ highlight: Highlight) async {
        guard let bridge = commsBridge else { return }

        if let cfi = highlight.locator.locations?.partialCfi {
            do {
                try await bridge.sendJsGoToCFICommand(cfi: cfi)
                debugLog("[EbookPlayerViewModel] Navigated to highlight CFI: \(cfi)")
            } catch {
                debugLog("[EbookPlayerViewModel] Failed to navigate to highlight: \(error)")
            }
        } else {
            var href = highlight.locator.href
            if let fragment = highlight.locator.locations?.fragments?.first {
                href = "\(href)#\(fragment)"
            }
            do {
                try await bridge.sendJsGoToHrefCommand(href: href)
                debugLog("[EbookPlayerViewModel] Navigated to highlight href: \(href)")
            } catch {
                debugLog("[EbookPlayerViewModel] Failed to navigate to highlight: \(error)")
            }
        }
    }

    func refreshHighlightColors() async {
        await sendHighlightsToJS()
    }

    private func sendHighlightPaletteToJS() async {
        guard let bridge = commsBridge else { return }

        let entries = HighlightColor.allCases.map { color in
            HighlightPaletteEntry(
                id: color.rawValue,
                color: settingsVM.hexColor(for: color),
                label: settingsVM.label(for: color),
            )
        }

        let translateAvailable: Bool
        if #available(iOS 17.4, macOS 14.4, *) {
            translateAvailable = true
        } else {
            translateAvailable = false
        }

        do {
            try await bridge.sendJsSetHighlightPalette(entries)
            try await bridge.sendJsSetTranslateAvailable(translateAvailable)
            try await bridge.sendJsSetDefaultHighlightColor(lastUsedHighlightColorId)
        } catch {
            debugLog("[EbookPlayerViewModel] Failed to send highlight palette to JS: \(error)")
        }
    }

    private static let lastUsedHighlightColorKey = "lastUsedHighlightColorId"

    var lastUsedHighlightColorId: String {
        get {
            UserDefaults.standard.string(forKey: Self.lastUsedHighlightColorKey)
                ?? HighlightColor.allCases.first!.rawValue
        }
        set { UserDefaults.standard.set(newValue, forKey: Self.lastUsedHighlightColorKey) }
    }

    private func rememberLastUsedColor(_ colorId: String) {
        guard HighlightColor(rawValue: colorId) != nil else { return }
        guard colorId != lastUsedHighlightColorId else { return }
        lastUsedHighlightColorId = colorId
        Task { try? await commsBridge?.sendJsSetDefaultHighlightColor(colorId) }
    }

    private func sendHighlightsToJS() async {
        guard let bridge = commsBridge else { return }

        await sendHighlightPaletteToJS()

        let coloredOnly = highlights.filter { !$0.isBookmark }
        let renderData = coloredOnly.compactMap { highlight -> HighlightRenderData? in
            guard let cfi = highlight.locator.locations?.partialCfi,
                let color = highlight.color
            else { return nil }

            guard
                let sectionIndex = findSectionIndex(
                    for: highlight.locator.href,
                    in: bookStructure,
                )
            else { return nil }

            return HighlightRenderData(
                id: highlight.id.uuidString,
                sectionIndex: sectionIndex,
                cfi: cfi,
                color: settingsVM.hexColor(for: color),
            )
        }

        do {
            try await bridge.sendJsRenderHighlights(renderData)
            debugLog("[EbookPlayerViewModel] Sent \(renderData.count) highlights to JS")
        } catch {
            debugLog("[EbookPlayerViewModel] Failed to send highlights to JS: \(error)")
        }
    }

    func handleTextSelectionComplete(_ message: TextSelectionMessage) {
        debugLog("[EbookPlayerViewModel] Text selection complete: \(message.text.prefix(50))...")
        pendingSelection = message
    }

    func handleHighlightSetColor(id: String, colorId: String) async {
        guard let bookID = bookData?.metadata.id,
            let uuid = UUID(uuidString: id),
            let existing = highlights.first(where: { $0.id == uuid }),
            let color = HighlightColor(rawValue: colorId)
        else { return }

        let updated = Highlight(
            id: existing.id,
            bookID: existing.bookID,
            locator: existing.locator,
            text: existing.text,
            color: color,
            note: existing.note,
            createdAt: existing.createdAt,
        )

        await BookmarkActor.shared.updateHighlight(updated)
        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)
        await sendHighlightsToJS()
    }

    func handleHighlightDelete(id: String) async {
        guard let uuid = UUID(uuidString: id),
            let existing = highlights.first(where: { $0.id == uuid })
        else { return }
        await deleteHighlight(existing)
    }

    func handleHighlightEdit(id: String) {
        guard let uuid = UUID(uuidString: id),
            let existing = highlights.first(where: { $0.id == uuid })
        else { return }
        pendingEditHighlight = existing
    }

    func saveEditedHighlight(_ original: Highlight, color: HighlightColor?, note: String?) async {
        guard let bookID = bookData?.metadata.id else { return }
        let updated = Highlight(
            id: original.id,
            bookID: original.bookID,
            locator: original.locator,
            text: original.text,
            color: color,
            note: note,
            createdAt: original.createdAt,
        )
        await BookmarkActor.shared.updateHighlight(updated)
        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)
        await sendHighlightsToJS()
        pendingEditHighlight = nil
    }

    func cancelPendingSelection() {
        pendingSelection = nil
    }

    func cancelPendingEdit() {
        pendingEditHighlight = nil
    }

    func addBookmarkAtCurrentPage() async {
        guard let bookID = bookData?.metadata.id else {
            debugLog("[EbookPlayerViewModel] Cannot add bookmark - missing book ID")
            return
        }

        guard let position = try? await commsBridge?.sendJsGetFirstVisiblePosition() else {
            debugLog(
                "[EbookPlayerViewModel] Cannot add bookmark - failed to get visible position from JS"
            )
            return
        }

        let locator = BookLocator(
            href: position.href,
            type: "application/xhtml+xml",
            title: position.title,
            locations: BookLocator.Locations(
                fragments: position.elementId.map { [$0] },
                progression: nil,
                position: nil,
                totalProgression: progressManager?.bookFraction,
                cssSelector: nil,
                partialCfi: position.cfi,
                domRange: nil,
            ),
            text: nil,
        )

        let highlight = Highlight(
            bookID: bookID,
            locator: locator,
            text: position.text,
            color: nil,
            note: nil,
        )

        await BookmarkActor.shared.addHighlight(highlight)
        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)

        debugLog("[EbookPlayerViewModel] Added bookmark: \(position.text.prefix(50))...")
    }
}

#endif
