// Android reader orchestration: plays the role EbookPlayerViewModel has on
// Apple platforms, wrapping the shared ReadingSession + ReaderCommsBridge
// stack for a Kotlin-owned WebView.
import Foundation
import Observation
import StorytellerKit

@StorytellerUIActor
final class AndroidJSEvaluator: JSEvaluating {
    private var pending: [String: CheckedContinuation<String?, Error>] = [:]
    private var timeouts: [String: Task<Void, Never>] = [:]
    private var isClosed = false

    nonisolated init() {}

    @discardableResult
    func evaluate(_ script: String) async throws -> String? {
        guard !isClosed else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let requestID = UUID().uuidString
        return try await withCheckedThrowingContinuation { continuation in
            pending[requestID] = continuation
            timeouts[requestID] = Task { @StorytellerUIActor [weak self] in
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                self?.complete(requestID: requestID, result: "", error: "JS evaluation timed out")
            }
            notifyAndroidEvaluateReaderJS(requestID: requestID, script: script)
        }
    }

    func complete(requestID: String, result: String, error: String) {
        timeouts.removeValue(forKey: requestID)?.cancel()
        guard let continuation = pending.removeValue(forKey: requestID) else { return }

        if !error.isEmpty {
            continuation.resume(throwing: AndroidBridgeError.readerJSFailed(error))
        } else {
            continuation.resume(returning: Self.normalizeEvalResult(result))
        }
    }

    func close() {
        isClosed = true
        for task in timeouts.values {
            task.cancel()
        }
        timeouts.removeAll()
        let continuations = pending.values
        pending.removeAll()
        for continuation in continuations {
            continuation.resume(throwing: ReaderCommsBridgeError.jsNotAvailable)
        }
    }

    // Chromium's evaluateJavascript returns the result JSON-encoded ("null",
    // "\"text\"", "2", ...). WKWebView hands back the raw value and the Apple
    // adapter keeps only strings; decode one layer and do the same.
    private nonisolated static func normalizeEvalResult(_ raw: String) -> String? {
        if raw.isEmpty || raw == "null" || raw == "undefined" {
            return nil
        }
        guard
            let object = try? JSONSerialization.jsonObject(
                with: Data(raw.utf8),
                options: [.fragmentsAllowed],
            )
        else {
            return raw
        }
        return object as? String
    }
}

@StorytellerUIActor
@Observable
final class AndroidReaderSettings: ReaderSettingsReading {
    var fontSize: Double = kDefaultFontSize
    var fontFamily: String = kDefaultFontFamily
    var lineSpacing: Double = kDefaultLineSpacing
    var marginLeftRight: Double = kDefaultMarginLeftRightIOS
    var marginTop: Double = kDefaultMarginTop
    var marginBottom: Double = kDefaultMarginBottom
    var wordSpacing: Double = kDefaultWordSpacing
    var letterSpacing: Double = kDefaultLetterSpacing
    var paragraphSpacing: Double = kDefaultParagraphSpacing
    var firstLineIndent: Bool = kDefaultFirstLineIndent
    var textAlignment: String = kDefaultTextAlignment
    var highlightColor: String? = nil
    var highlightThickness: Double = kDefaultHighlightThickness
    var backgroundColor: String? = nil
    var foregroundColor: String? = nil
    var customCSS: String? = nil
    var singleColumnMode: Bool = kDefaultSingleColumnMode
    var scrollingMode: Bool = kDefaultScrollingMode
    var disableReaderAnimations: Bool = kDefaultDisableReaderAnimations
    var enableMarginClickNavigation: Bool = kDefaultEnableMarginClickNavigation
    var userHighlightMode: String = kDefaultUserHighlightMode
    var readaloudHighlightMode: String = kDefaultReadaloudHighlightMode
    var freeBrowseMode: String = kDefaultFreeBrowseMode
    var lockViewToAudio: Bool { freeBrowseMode == "never" }
    var readaloudDimOthers: Bool = kDefaultReadaloudDimOthers
    var readaloudDimAmount: Double = kDefaultReadaloudDimAmount
    var readaloudHighlightFade: Double = kDefaultReadaloudHighlightFade
    var coverStrengthBackground: Double = kDefaultCoverTintStrength
    var coverStrengthForeground: Double = kDefaultCoverTintStrength
    var coverStrengthHighlight: Double = kDefaultCoverTintStrength
    var readaloudTextItalic: Bool = kDefaultReadaloudTextItalic
    var readaloudTextBold: Bool = kDefaultReadaloudTextBold
    var readaloudUnderlineStyle: String = kDefaultReadaloudUnderlineStyle
    var readaloudHighlightVisibility: String = kDefaultReadaloudHighlightVisibility
    var doubleTapPlay: String = kDefaultDoubleTapPlay
    var automaticRewindEnabled: Bool = kDefaultAutomaticRewindEnabled
    var automaticRewindAfterInterruption: Double = kDefaultAutomaticRewindAfterInterruption
    var automaticRewindAfterBreak: Double = kDefaultAutomaticRewindAfterBreak

    nonisolated init() {}

    private struct Update: Decodable {
        var fontSize: Double?
        var fontFamily: String?
        var lineSpacing: Double?
        var marginLeftRight: Double?
        var marginTopBottom: Double?
        var marginTop: Double?
        var marginBottom: Double?
        var wordSpacing: Double?
        var letterSpacing: Double?
        var paragraphSpacing: Double?
        var firstLineIndent: Bool?
        var textAlignment: String?
        var highlightColor: String?
        var highlightThickness: Double?
        var backgroundColor: String?
        var foregroundColor: String?
        var customCSS: String?
        var singleColumnMode: Bool?
        var scrollingMode: Bool?
        var disableReaderAnimations: Bool?
        var enableMarginClickNavigation: Bool?
        var userHighlightMode: String?
        var readaloudHighlightMode: String?
        var lockViewToAudio: Bool?
        var readaloudDimOthers: Bool?
        var readaloudDimAmount: Double?
    }

    func apply(json: String) throws {
        let update = try JSONDecoder().decode(Update.self, from: Data(json.utf8))
        if let value = update.fontSize { fontSize = value }
        if let value = update.fontFamily { fontFamily = value }
        if let value = update.lineSpacing { lineSpacing = value }
        if let value = update.marginLeftRight { marginLeftRight = value }
        if let value = update.marginTopBottom {
            marginTop = value
            marginBottom = value
        }
        if let value = update.marginTop { marginTop = value }
        if let value = update.marginBottom { marginBottom = value }
        if let value = update.wordSpacing { wordSpacing = value }
        if let value = update.letterSpacing { letterSpacing = value }
        if let value = update.paragraphSpacing { paragraphSpacing = value }
        if let value = update.firstLineIndent { firstLineIndent = value }
        if let value = update.textAlignment { textAlignment = value }
        if let value = update.highlightColor { highlightColor = value.isEmpty ? nil : value }
        if let value = update.highlightThickness { highlightThickness = value }
        if let value = update.backgroundColor { backgroundColor = value.isEmpty ? nil : value }
        if let value = update.foregroundColor { foregroundColor = value.isEmpty ? nil : value }
        if let value = update.customCSS { customCSS = value.isEmpty ? nil : value }
        if let value = update.singleColumnMode { singleColumnMode = value }
        if let value = update.scrollingMode { scrollingMode = value }
        if let value = update.disableReaderAnimations { disableReaderAnimations = value }
        if let value = update.enableMarginClickNavigation { enableMarginClickNavigation = value }
        if let value = update.userHighlightMode { userHighlightMode = value }
        if let value = update.readaloudHighlightMode { readaloudHighlightMode = value }
        if let value = update.lockViewToAudio { freeBrowseMode = value ? "never" : "paused" }
        if let value = update.readaloudDimOthers { readaloudDimOthers = value }
        if let value = update.readaloudDimAmount { readaloudDimAmount = value }
    }
}

@StorytellerUIActor
final class AndroidReaderSession {
    static let shared = AndroidReaderSession()

    private let settings = AndroidReaderSettings()
    private var session: ReadingSession?
    private var bridge: ReaderCommsBridge?
    private var evaluator: AndroidJSEvaluator?
    private var router: ReaderMessageRouter?
    private var styleManager: ReaderStyleManager?
    private var statePublisher: Task<Void, Never>?
    private var lastStatePayload: String?
    private var isDarkMode = false
    private var overlayToggleCount = 0
    private var keepScreenOn = false
    private var customThemes: [ReaderTheme] = []
    private var builtInThemeOverrides: [ReaderTheme] = []
    private var defaultPlaybackSpeed = kDefaultPlaybackSpeed
    private var selectedLightThemeId = ReaderTheme.builtInLight.id
    private var selectedDarkThemeId = ReaderTheme.builtInDark.id
    private var searchQuery = ""
    private var isSearching = false
    private var searchProgress = 0.0
    private var searchSections: [SearchResultsMessage] = []
    private var searchError: String?
    private var currentBookID: BookID?
    private var coverTone: CoverHSB?
    private var highlights: [Highlight] = []
    private var pendingSelection: TextSelectionMessage?
    private var pendingEditHighlightID: UUID?
    private var translateAvailable = false
    private var lastChapterRestart: Date?
    private var overlayOptions = OverlayOptions()
    private var miniPlayerConfig = StorytellerGlobalConfig.MiniPlayer()
    private var miniProgressIndicator = kDefaultProgressIndicatorMiniPlayer
    private var miniProgressThickness = kDefaultProgressIndicatorThickness
    private var dockOptions = DockOptions()
    private var menuBarSlots = StorytellerGlobalConfig.ReadingBar.defaultMenuBarSlots
    private var fullPlayerConfig = StorytellerGlobalConfig.FullPlayer()
    private var experimentalSettings = kDefaultExperimentalSettings
    private var pendingServerPosition: IncomingServerPosition?
    private var imageItems: [BookImageItem] = []
    private var imageIndexBuilt = false
    private var timelineBackLocator: BookLocator?
    private var timelineBackDescription = ""
    private var timelineForwardLocator: BookLocator?
    private var timelineForwardDescription = ""

    private struct OverlayOptions: Encodable {
        var showProgress = kDefaultShowProgress
        var showPageNumber = kDefaultShowPageNumber
        var showTimeRemainingInBook = kDefaultShowTimeRemainingInBook
        var showTimeRemainingInChapter = kDefaultShowTimeRemainingInChapter
        var showSkipBackward = kDefaultShowOverlaySkipBackward
        var showPlayPause = kDefaultShowOverlayPlayPause
        var showSkipForward = kDefaultShowOverlaySkipForward
        var alwaysShowMiniPlayer = kDefaultAlwaysShowMiniPlayer
        var showMiniPlayerStats = kDefaultShowMiniPlayerStats
    }

    private struct OverlayOptionsUpdate: Decodable {
        var showProgress: Bool?
        var showPageNumber: Bool?
        var showTimeRemainingInBook: Bool?
        var showTimeRemainingInChapter: Bool?
        var showSkipBackward: Bool?
        var showPlayPause: Bool?
        var showSkipForward: Bool?
        var alwaysShowMiniPlayer: Bool?
        var showMiniPlayerStats: Bool?
    }

    private struct DockOptions {
        var leadingSlots: [PlayerComplication] = []
        var trailingSlots: [PlayerComplication] = []
        var centerSlots: [PlayerComplication] = []
        var transparency = kDefaultDockTransparency
        var progressIndicator = kDefaultProgressIndicatorDock
        var progressThickness = kDefaultProgressIndicatorThickness
        var progressScope = MiniPlayerProgressScope.chapter
    }

    private struct CustomizationUpdate: Decodable {
        struct MiniPlayerUpdate: Decodable {
            var size: MiniPlayerSize?
            var leadingStyle: MiniPlayerLeadingStyle?
            var cycleFirst: MiniPlayerCycleBlock?
            var cycleSecond: MiniPlayerCycleBlock?
            var cycleShowingSecond: Bool?
            var progressScope: MiniPlayerProgressScope?
            var mirrored: Bool?
            var contentRowSlots: [PlayerComplication]?
            var statSlots: [PlayerComplication]?
            var scrubRowSlots: [PlayerComplication]?
            var extraSlots: [PlayerComplication]?
            var progressIndicator: Bool?
            var progressThickness: Double?
        }

        struct DockUpdate: Decodable {
            var leadingSlots: [PlayerComplication]?
            var trailingSlots: [PlayerComplication]?
            var centerSlots: [PlayerComplication]?
            var transparency: Double?
            var progressIndicator: Bool?
            var progressThickness: Double?
            var progressScope: MiniPlayerProgressScope?
        }

        struct MenuBarUpdate: Decodable {
            var slots: [PlayerComplication]?
        }

        struct FullPlayerUpdate: Decodable {
            var statSlots: [PlayerComplication]?
            var controlSlots: [PlayerComplication]?
        }

        struct PlaybackModesUpdate: Decodable {
            var freeBrowseMode: String?
            var readaloudHighlightVisibility: String?
            var doubleTapPlay: String?
            var automaticRewindEnabled: Bool?
            var automaticRewindAfterInterruption: Double?
            var automaticRewindAfterBreak: Double?
        }

        var miniPlayer: MiniPlayerUpdate?
        var dock: DockUpdate?
        var menuBar: MenuBarUpdate?
        var fullPlayer: FullPlayerUpdate?
        var playbackModes: PlaybackModesUpdate?
    }

    nonisolated private init() {}

    private struct OpenResult: Encodable {
        let readerPath: String
        let originalPath: String
        let hasAudioNarration: Bool
        let title: String
    }

    private func loadPersistedConfig() async {
        let config = await SettingsActor.shared.config
        settings.fontSize = config.reading.fontSize
        settings.fontFamily = config.reading.fontFamily
        settings.lineSpacing = config.reading.lineSpacing
        settings.marginLeftRight = config.reading.marginLeftRight
        settings.marginTop = config.reading.marginTop
        settings.marginBottom = config.reading.marginBottom
        settings.wordSpacing = config.reading.wordSpacing
        settings.letterSpacing = config.reading.letterSpacing
        settings.paragraphSpacing = config.reading.paragraphSpacing
        settings.firstLineIndent = config.reading.firstLineIndent
        settings.textAlignment = config.reading.textAlignment
        settings.singleColumnMode = config.reading.singleColumnMode
        settings.scrollingMode = config.reading.scrollingMode
        settings.disableReaderAnimations = config.reading.disableReaderAnimations
        settings.enableMarginClickNavigation = config.reading.enableMarginClickNavigation
        settings.readaloudDimOthers = config.reading.readaloudDimOthers
        settings.readaloudDimAmount = config.reading.readaloudDimAmount
        settings.freeBrowseMode = config.playback.freeBrowseMode
        settings.doubleTapPlay = config.playback.doubleTapPlay
        settings.automaticRewindEnabled = config.playback.automaticRewindEnabled
        settings.automaticRewindAfterInterruption = config.playback.automaticRewindAfterInterruption
        settings.automaticRewindAfterBreak = config.playback.automaticRewindAfterBreak
        experimentalSettings = config.library.experimentalSettings
        // Highlight visibility is experimental-gated (ReadaloudHighlightCard.onAppear on iOS).
        settings.readaloudHighlightVisibility =
            experimentalSettings ? config.playback.readaloudHighlightVisibility : "paused"
        overlayOptions.showProgress = config.readingBar.showProgress
        overlayOptions.showPageNumber = config.readingBar.showPageNumber
        overlayOptions.showTimeRemainingInBook = config.readingBar.showTimeRemainingInBook
        overlayOptions.showTimeRemainingInChapter = config.readingBar.showTimeRemainingInChapter
        overlayOptions.showSkipBackward = config.readingBar.showOverlaySkipBackward
        overlayOptions.showPlayPause = config.readingBar.showOverlayPlayPause
        overlayOptions.showSkipForward = config.readingBar.showOverlaySkipForward
        overlayOptions.alwaysShowMiniPlayer = config.readingBar.alwaysShowMiniPlayer
        overlayOptions.showMiniPlayerStats = config.readingBar.showMiniPlayerStats
        var mini = config.miniPlayer
        mini.contentRowSlots = SlotLayout.sanitized(mini.contentRowSlots, for: .miniContentRow)
        mini.statSlots = SlotLayout.sanitized(mini.statSlots, for: .miniStatBand)
        mini.scrubRowSlots = SlotLayout.sanitized(mini.scrubRowSlots, for: .miniScrubRow)
        mini.extraSlots = SlotLayout.sanitized(mini.extraSlots, for: .miniExtraRow)
        miniPlayerConfig = mini
        miniProgressIndicator = config.readingBar.progressIndicatorMiniPlayer
        miniProgressThickness = config.readingBar.progressIndicatorThickness
        dockOptions.leadingSlots = SlotLayout.sanitized(
            config.readingBar.dockLeadingSlots,
            for: .dockLeading,
        )
        dockOptions.trailingSlots = SlotLayout.sanitized(
            config.readingBar.dockTrailingSlots,
            for: .dockTrailing,
        )
        dockOptions.centerSlots = SlotLayout.sanitized(
            config.readingBar.dockCenterSlots,
            for: .dockCenter,
        )
        dockOptions.transparency = config.readingBar.dockTransparency
        dockOptions.progressIndicator = config.readingBar.progressIndicatorDock
        dockOptions.progressThickness = config.readingBar.progressIndicatorThicknessDock
        dockOptions.progressScope = config.readingBar.progressIndicatorScopeDock
        menuBarSlots = SlotLayout.sanitized(config.readingBar.menuBarSlots, for: .menuBar)
        fullPlayerConfig.statSlots = SlotLayout.sanitized(
            config.fullPlayer.statSlots,
            for: .fullPlayerStats,
        )
        fullPlayerConfig.controlSlots = SlotLayout.sanitized(
            config.fullPlayer.controlSlots,
            for: .fullPlayerControls,
        )
        defaultPlaybackSpeed = config.playback.defaultPlaybackSpeed
        customThemes = config.themes.customThemes
        builtInThemeOverrides = config.themes.builtInThemeOverrides
        selectedLightThemeId = config.themes.selectedLightThemeId
        selectedDarkThemeId = config.themes.selectedDarkThemeId
    }

    private var activeThemeId: String {
        isDarkMode ? selectedDarkThemeId : selectedLightThemeId
    }

    private var activeTheme: ReaderTheme {
        builtInThemeOverrides.first(where: { $0.id == activeThemeId })
            ?? ReaderTheme.resolve(id: activeThemeId, customThemes: customThemes)
            ?? (isDarkMode ? .builtInDark : .builtInLight)
    }

    private var allThemes: [ReaderTheme] {
        ReaderTheme.allBuiltIn.map { stock in
            builtInThemeOverrides.first(where: { $0.id == stock.id }) ?? stock
        } + customThemes
    }

    private func applyActiveTheme() {
        let theme = activeTheme
        settings.backgroundColor = theme.backgroundColor
        settings.foregroundColor = theme.foregroundColor
        settings.highlightColor = theme.highlightColor
        settings.highlightThickness = theme.highlightThickness
        settings.readaloudHighlightMode = theme.readaloudHighlightMode
        settings.readaloudHighlightFade = theme.readaloudHighlightFade
        settings.coverStrengthBackground = theme.coverStrengthBackground
        settings.coverStrengthForeground = theme.coverStrengthForeground
        settings.coverStrengthHighlight = theme.coverStrengthHighlight
        settings.readaloudTextItalic = theme.readaloudTextItalic
        settings.readaloudTextBold = theme.readaloudTextBold
        settings.readaloudUnderlineStyle = theme.readaloudUnderlineStyle
        settings.userHighlightMode = theme.userHighlightMode
        settings.customCSS = theme.customCSS
    }

    func scheduleCoverToneRefresh() {
        Task { @StorytellerUIActor [weak self] in
            for _ in 0..<10 {
                guard let self else { return }
                await self.refreshCoverTone()
                if self.coverTone != nil { return }
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    func refreshCoverTone() async {
        guard let bookID = currentBookID else { return }
        let library = await SettingsActor.shared.config.library
        let mode = CoverColorMode(rawValue: library.colorMode) ?? .full
        let primary = CoverColorDerivation.keys(bookID: bookID)
            .compactMap { CoverColorDerivation.cachedColors(forKey: $0)?.first }
            .first
        guard let primary else {
            coverTone = nil
            styleManager?.setCoverTone(nil)
            return
        }
        let base = CoverColorAverager.surfaceHSB(
            primary: CoverRGB8(red: primary.red, green: primary.green, blue: primary.blue)
        )
        let chrome = CoverPaletteAdjustment.adjustedSurfaceHSB(
            base,
            mode: mode,
            intensity: library.colorIntensity,
        )
        coverTone = chrome
        styleManager?.setCoverTone(chrome)
    }

    func open(bookID: BookID, mode: String) async throws -> String {
        await close()

        let category: LocalMediaCategory = mode == "synced" ? .synced : .ebook
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        guard let metadata = snapshot.books.first(where: { $0.id == bookID }) else {
            throw AndroidBridgeError.bookNotFound(bookID.uuid)
        }
        let localMedia = await BookServiceActor.shared.resolveLocalMedia(
            for: bookID,
            category: category,
        )

        let evaluator = AndroidJSEvaluator()
        let bridge = ReaderCommsBridge(js: evaluator)
        let router = ReaderMessageRouter(bridge: bridge)
        router.onConsoleLog = { level, message in
            let prefix = level == "error" ? "JS ERROR: " : level == "warn" ? "JS WARN: " : "JS: "
            debugLog("[AndroidReaderSession] \(prefix)\(message)")
        }

        let session = ReadingSessionStore.shared.obtain(
            metadata: metadata,
            category: category,
            localMediaPath: localMedia?.url,
            settings: settings,
        )

        self.evaluator = evaluator
        self.bridge = bridge
        self.router = router
        self.session = session
        overlayToggleCount = 0
        keepScreenOn = false
        lastStatePayload = nil
        resetSearchState()
        currentBookID = bookID
        highlights = []
        pendingSelection = nil
        pendingEditHighlightID = nil
        pendingServerPosition = nil
        imageItems = []
        imageIndexBuilt = false
        await loadPersistedConfig()
        applyActiveTheme()

        let styleManager = ReaderStyleManager(settingsVM: settings, bridge: bridge)
        self.styleManager = styleManager
        scheduleCoverToneRefresh()

        let persistedRate = defaultPlaybackSpeed
        session.configureMediaOverlayManager = { [weak self] manager in
            manager.setPlaybackRate(persistedRate)
            manager.setWakeLock = { on in
                Task { @StorytellerUIActor in
                    self?.keepScreenOn = on
                }
            }
        }
        session.onReadaloudAvailabilityChanged = { [weak styleManager] available in
            styleManager?.setReadaloudModeAvailable(available)
        }
        session.onViewStructureReady = { [weak self] in
            guard let self else { return }
            self.styleManager?.sendInitialStyles(isDarkMode: self.isDarkMode)
            Task { @StorytellerUIActor in
                await self.loadHighlights()
            }
        }
        session.onIncomingServerPosition = { [weak self] position in
            Task { @StorytellerUIActor [weak self] in
                guard let self else { return }
                // Live reading sync implies the user wants positions followed
                // silently, so skip the prompt even if auto-sync is off.
                let sync = await SettingsActor.shared.config.sync
                if sync.autoSyncToNewerServerPosition || sync.liveReadingSyncEnabled {
                    self.session?.progressManager?.handleServerPositionUpdate(position.locator)
                } else {
                    self.pendingServerPosition = position
                }
            }
        }

        session.prepare()
        session.attachBridge(bridge, isRecovery: false)
        bridge.onOverlayToggled = { [weak self] in
            self?.overlayToggleCount += 1
        }
        bridge.onSearchResults = { [weak self] message in
            Task { @StorytellerUIActor in
                self?.searchSections.append(message)
            }
        }
        bridge.onSearchProgress = { [weak self] message in
            Task { @StorytellerUIActor in
                self?.searchProgress = message.progress
            }
        }
        bridge.onSearchComplete = { [weak self] in
            Task { @StorytellerUIActor in
                self?.isSearching = false
                self?.searchProgress = 1.0
            }
        }
        bridge.onSearchError = { [weak self] message in
            Task { @StorytellerUIActor in
                self?.isSearching = false
                self?.searchError = message.message
            }
        }
        bridge.onTextSelected = { [weak self] message in
            Task { @StorytellerUIActor in
                self?.pendingSelection = message
            }
        }
        bridge.onSelectionHighlight = { [weak self] message in
            Task { @StorytellerUIActor in
                await self?.addHighlight(
                    from: message.selection,
                    color: HighlightColor(rawValue: message.colorId),
                    note: nil,
                )
                self?.rememberLastUsedColor(message.colorId)
            }
        }
        bridge.onHighlightSetColor = { [weak self] message in
            Task { @StorytellerUIActor in
                await self?.setHighlightColor(id: message.id, colorId: message.colorId)
                self?.rememberLastUsedColor(message.colorId)
            }
        }
        bridge.onHighlightDelete = { [weak self] message in
            Task { @StorytellerUIActor in
                await self?.deleteHighlight(id: message.id)
            }
        }
        bridge.onHighlightEdit = { [weak self] message in
            Task { @StorytellerUIActor in
                self?.pendingEditHighlightID = UUID(uuidString: message.id)
            }
        }

        await session.awaitPreparation()
        if let error = session.lastPrepareError {
            await close()
            throw error
        }
        guard let readerPath = session.extractedEbookPath else {
            await close()
            throw AndroidBridgeError.readerPrepareFailed(bookID.uuid)
        }

        startStatePublisher()

        return try encodeReaderJSON(
            OpenResult(
                readerPath: readerPath.path,
                originalPath: localMedia?.url.path ?? "",
                hasAudioNarration: session.hasAudioNarration,
                title: metadata.title,
            )
        )
    }

    func close() async {
        statePublisher?.cancel()
        statePublisher = nil
        styleManager = nil
        router = nil
        bridge = nil

        let closingSession = session
        session = nil
        if let closingSession {
            await closingSession.close(.endSession)
        }

        evaluator?.close()
        evaluator = nil
        lastStatePayload = nil
        pendingServerPosition = nil
    }

    func handleMessage(name: String, body: String) {
        guard let router else {
            debugLog("[AndroidReaderSession] Dropping JS message '\(name)' - no reader open")
            return
        }
        let parsed =
            (try? JSONSerialization.jsonObject(with: Data(body.utf8), options: [.fragmentsAllowed]))
            ?? [String: Any]()
        if !router.route(name: name, body: parsed) {
            debugLog("[AndroidReaderSession] Unhandled JS message: \(name)")
        }
    }

    func completeJSRequest(requestID: String, result: String, error: String) {
        evaluator?.complete(requestID: requestID, result: result, error: error)
    }

    func control(command: String, value: Double, text: String) async throws {
        guard let session else {
            throw AndroidBridgeError.readerNotOpen
        }

        switch command {
            case "goLeft":
                session.progressManager?.handleUserNavLeft()
            case "goRight":
                session.progressManager?.handleUserNavRight()
            case "selectChapter":
                if text.isEmpty {
                    session.progressManager?.handleUserChapterSelected(Int(value))
                } else {
                    session.progressManager?.handleUserChapterSelectedWithHref(
                        Int(value),
                        href: text,
                    )
                }
            case "selectTocEntry":
                guard let entry = session.tocEntries[safe: Int(value)] else {
                    throw AndroidBridgeError.invalidReaderCommand("selectTocEntry \(Int(value))")
                }
                let fragment = entry.href.components(separatedBy: "#").dropFirst().first
                if let fragment,
                    let sectionId = session.bookStructure[safe: entry.sectionIndex]?.id
                {
                    session.progressManager?.handleUserChapterSelectedWithHref(
                        entry.sectionIndex,
                        href: "\(sectionId)#\(fragment)",
                    )
                } else {
                    session.progressManager?.handleUserChapterSelected(entry.sectionIndex)
                }
            case "seekToFraction":
                session.progressManager?.handleUserProgressSeek(value)
            case "prevChapter":
                prevChapter(session)
            case "nextChapter":
                nextChapter(session)
            case "togglePlayPause":
                await session.progressManager?.togglePlaying()
            case "nextSentence":
                session.mediaOverlayManager?.nextSentence()
            case "prevSentence":
                session.mediaOverlayManager?.prevSentence()
            case "setRate":
                session.mediaOverlayManager?.setPlaybackRate(value)
                defaultPlaybackSpeed = value
                try await SettingsActor.shared.updateConfig(defaultPlaybackSpeed: value)
            case "setVolume":
                session.mediaOverlayManager?.setVolume(value)
            case "startSleepTimer":
                let type: SleepTimerType = text == "endOfChapter" ? .endOfChapter : .duration
                session.mediaOverlayManager?.startSleepTimer(
                    duration: type == .duration ? value : nil,
                    type: type,
                )
            case "cancelSleepTimer":
                session.mediaOverlayManager?.cancelSleepTimer()
            case "updateReaderSettings":
                try settings.apply(json: text)
                try await persistDisplaySettings()
            case "resetReaderSettings":
                resetDisplaySettings()
                try await persistDisplaySettings()
            case "updateOverlayOptions":
                try await applyOverlayOptions(json: text)
            case "updateCustomization":
                try await applyCustomization(json: text)
                publishState(session)
            case "acceptServerPosition":
                if let position = pendingServerPosition {
                    pendingServerPosition = nil
                    session.progressManager?.handleServerPositionUpdate(position.locator)
                }
            case "declineServerPosition":
                pendingServerPosition = nil
            case "saveHighlight":
                try await applyHighlightEdit(json: text)
            case "cancelSelection":
                pendingSelection = nil
                pendingEditHighlightID = nil
            case "deleteHighlight":
                await deleteHighlight(id: text)
            case "goToHighlight":
                try await goToHighlight(id: text)
            case "startSearch":
                try await startSearch(json: text)
            case "clearSearch":
                resetSearchState()
                try? await bridge?.sendJsClearSearchCommand()
            case "goToSearchResult":
                try await bridge?.sendJsGoToCFICommand(cfi: text)
            case "selectTheme":
                try await selectTheme(id: text, dark: isDarkMode)
            case "selectLightTheme":
                try await selectTheme(id: text, dark: false)
            case "selectDarkTheme":
                try await selectTheme(id: text, dark: true)
            case "saveTheme":
                try await saveTheme(json: text)
            case "deleteTheme":
                try await deleteTheme(id: text)
            case "resetTheme":
                try await resetTheme(id: text)
            case "setTranslateAvailable":
                translateAvailable = value != 0
                try? await bridge?.sendJsSetTranslateAvailable(translateAvailable)
            case "setDarkMode":
                isDarkMode = value != 0
                applyActiveTheme()
                styleManager?.handleDarkModeChange(isDarkMode)
                await sendHighlightsToJS()
            case "goToImage":
                try await goToImage(id: text)
            case "goToTimelineVisit":
                try await goToTimelineVisit(session, id: text, useStart: value != 0)
            case "timelineGoBack":
                guard let target = timelineBackLocator else { break }
                let description = timelineBackDescription
                timelineForwardLocator = currentPositionLocator(session)
                timelineForwardDescription = currentPositionDescription(session)
                timelineBackLocator = nil
                timelineBackDescription = ""
                await navigateTimeline(session, to: target, description: description)
            case "timelineGoForward":
                guard let target = timelineForwardLocator else { break }
                let description = timelineForwardDescription
                timelineBackLocator = currentPositionLocator(session)
                timelineBackDescription = currentPositionDescription(session)
                timelineForwardLocator = nil
                timelineForwardDescription = ""
                await navigateTimeline(session, to: target, description: description)
            case "dismissTimelineBreadcrumbs":
                timelineBackLocator = nil
                timelineBackDescription = ""
                timelineForwardLocator = nil
                timelineForwardDescription = ""
                publishState(session)
            case "sceneActive":
                _ = await session.reconcilePositionAfterSceneActivation()
            case "sceneBackground":
                await session.handleSceneEnteredBackground()
            default:
                throw AndroidBridgeError.invalidReaderCommand(command)
        }
    }

    func bookImageIndexJSON() async throws -> String {
        guard let session else {
            throw AndroidBridgeError.readerNotOpen
        }
        if !imageIndexBuilt {
            guard let epubURL = session.originalEbookURL else {
                throw AndroidBridgeError.readerNotOpen
            }
            imageItems = try await Task.detached(priority: .utility) {
                try BookImageIndexer.buildIndex(epubURL: epubURL)
            }.value
            imageIndexBuilt = true
        }

        let structure = session.bookStructure
        return try encodeReaderJSON(
            AndroidBookImageIndex(
                images: imageItems.map { item in
                    AndroidBookImage(
                        id: item.id,
                        title: item.displayTitle,
                        kind: item.kind.rawValue,
                        caption: item.caption ?? item.altText,
                        pageLabel: item.pageLabel,
                        sectionIndex: item.sectionIndex,
                        chapterTitle: structure[safe: item.sectionIndex]?.label,
                    )
                }
            )
        )
    }

    // The reader only opens once the epub is extracted, so image bytes always
    // come off disk rather than back out of the archive.
    func bookImageData(id: String) throws -> Data {
        guard let session, let item = imageItems.first(where: { $0.id == id }) else {
            throw AndroidBridgeError.readerNotOpen
        }
        guard let root = session.extractedEbookPath else { return Data() }
        return (try? Data(contentsOf: root.appendingPathComponent(item.imagePath))) ?? Data()
    }

    private func goToImage(id: String) async throws {
        guard let item = imageItems.first(where: { $0.id == id }) else { return }
        if let elementId = item.elementId {
            try await bridge?.sendJsGoToHrefCommand(href: "\(item.sectionId)#\(elementId)")
        } else {
            try await bridge?.sendJsGoToImageCommand(
                sectionIndex: item.sectionIndex,
                filename: (item.imagePath as NSString).lastPathComponent,
            )
        }
    }

    func readingTimelineJSON() async throws -> String {
        guard let bookID = currentBookID else {
            throw AndroidBridgeError.readerNotOpen
        }
        let structure = session?.bookStructure ?? []
        let visits = await ReadingTimelineActor.shared.getVisits(for: bookID)
        return try encodeReaderJSON(
            AndroidReadingTimeline(
                visits: visits.map { visit in
                    AndroidReadingVisit(
                        id: visit.id.uuidString,
                        startedAt: visit.startedAt,
                        endedAt: visit.endedAt,
                        startDescription: visit.startDescription,
                        endDescription: visit.endDescription,
                        startProgression: visit.startProgression,
                        endProgression: visit.endProgression,
                        source: visit.source.rawValue,
                        endText: visit.endText,
                        chapterTitle: findSectionIndex(
                            for: visit.endLocator.href,
                            in: structure,
                        ).flatMap { structure[safe: $0]?.label },
                    )
                }
            )
        )
    }

    func clearReadingTimeline(visitIDs: [String]) async {
        guard let bookID = currentBookID else { return }
        if visitIDs.isEmpty {
            await ReadingTimelineActor.shared.clearVisits(for: bookID)
        } else {
            await ReadingTimelineActor.shared.removeVisits(
                ids: Set(visitIDs.compactMap(UUID.init(uuidString:))),
                for: bookID,
            )
        }
    }

    private func goToTimelineVisit(
        _ session: ReadingSession,
        id: String,
        useStart: Bool,
    ) async throws {
        guard let bookID = currentBookID, let visitID = UUID(uuidString: id) else {
            throw AndroidBridgeError.invalidReaderCommand("goToTimelineVisit \(id)")
        }
        let visits = await ReadingTimelineActor.shared.getVisits(for: bookID)
        guard let visit = visits.first(where: { $0.id == visitID }) else {
            throw AndroidBridgeError.invalidReaderCommand("goToTimelineVisit \(id)")
        }
        timelineBackLocator = currentPositionLocator(session)
        timelineBackDescription = currentPositionDescription(session)
        timelineForwardLocator = nil
        timelineForwardDescription = ""
        await navigateTimeline(
            session,
            to: useStart ? visit.startLocator : visit.endLocator,
            description: useStart ? visit.startDescription : visit.endDescription,
        )
    }

    private func navigateTimeline(
        _ session: ReadingSession,
        to locator: BookLocator,
        description: String,
    ) async {
        session.progressManager?.handleServerPositionUpdate(locator)
        publishState(session)
        guard let bookID = currentBookID else { return }
        _ = await ProgressSyncActor.shared.restorePosition(
            bookID: bookID,
            locator: locator,
            locationDescription: description,
        )
    }

    private func currentPositionLocator(_ session: ReadingSession) -> BookLocator? {
        session.progressManager?.currentLocator()
    }

    private func currentPositionDescription(_ session: ReadingSession) -> String {
        guard let progressManager = session.progressManager else { return "" }
        if let chapterIndex = progressManager.selectedChapterId,
            let label = session.bookStructure[safe: chapterIndex]?.label
        {
            return label
        }
        if let fraction = progressManager.bookFraction {
            return "\(Int((fraction * 100).rounded()))% of book"
        }
        return ""
    }

    private func prevChapter(_ session: ReadingSession) {
        guard let progressManager = session.progressManager,
            let currentIndex = progressManager.selectedChapterId
        else { return }

        let restarts = previousChapterRestarts(
            progressInChapter: progressManager.chapterSeekBarValue,
            lastRestartAt: lastChapterRestart,
        )

        if !restarts && currentIndex > 0 {
            progressManager.handleUserChapterSelected(currentIndex - 1)
            lastChapterRestart = nil
        } else {
            progressManager.handleUserProgressSeek(0)
            lastChapterRestart = Date()
        }
    }

    private func nextChapter(_ session: ReadingSession) {
        guard let progressManager = session.progressManager,
            let currentIndex = progressManager.selectedChapterId,
            currentIndex < session.bookStructure.count - 1
        else { return }
        progressManager.handleUserChapterSelected(currentIndex + 1)
        lastChapterRestart = nil
    }

    private static let lastUsedHighlightColorKey = "lastUsedHighlightColorId"

    private var lastUsedHighlightColorId: String {
        UserDefaults.standard.string(forKey: Self.lastUsedHighlightColorKey)
            ?? HighlightColor.allCases.first!.rawValue
    }

    private func rememberLastUsedColor(_ colorId: String) {
        guard HighlightColor(rawValue: colorId) != nil else { return }
        guard colorId != lastUsedHighlightColorId else { return }
        UserDefaults.standard.set(colorId, forKey: Self.lastUsedHighlightColorKey)
        Task { try? await bridge?.sendJsSetDefaultHighlightColor(colorId) }
    }

    private func themeHighlightColor(_ color: HighlightColor) -> String {
        let theme = activeTheme
        switch color {
            case .pink: return theme.userHighlightColor1
            case .orange: return theme.userHighlightColor2
            case .yellow: return theme.userHighlightColor3
            case .green: return theme.userHighlightColor4
            case .blue: return theme.userHighlightColor5
            case .purple: return theme.userHighlightColor6
        }
    }

    private func themeHighlightLabel(_ color: HighlightColor) -> String {
        let theme = activeTheme
        switch color {
            case .pink: return theme.userHighlightLabel1
            case .orange: return theme.userHighlightLabel2
            case .yellow: return theme.userHighlightLabel3
            case .green: return theme.userHighlightLabel4
            case .blue: return theme.userHighlightLabel5
            case .purple: return theme.userHighlightLabel6
        }
    }

    private func loadHighlights() async {
        guard let bookID = currentBookID else { return }
        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)
        await sendHighlightsToJS()
    }

    private func sendHighlightsToJS() async {
        guard let bridge, let session else { return }

        let entries = HighlightColor.allCases.map { color in
            HighlightPaletteEntry(
                id: color.rawValue,
                color: themeHighlightColor(color),
                label: themeHighlightLabel(color),
            )
        }
        do {
            try await bridge.sendJsSetHighlightPalette(entries)
            try await bridge.sendJsSetTranslateAvailable(translateAvailable)
            try await bridge.sendJsSetDefaultHighlightColor(lastUsedHighlightColorId)
        } catch {
            debugLog("[AndroidReaderSession] Failed to send highlight palette: \(error)")
        }

        let structure = session.bookStructure
        let renderData = highlights.compactMap { highlight -> HighlightRenderData? in
            guard let cfi = highlight.locator.locations?.partialCfi,
                let color = highlight.color,
                let sectionIndex = findSectionIndex(
                    for: highlight.locator.href,
                    in: structure,
                )
            else { return nil }
            return HighlightRenderData(
                id: highlight.id.uuidString,
                sectionIndex: sectionIndex,
                cfi: cfi,
                color: themeHighlightColor(color),
            )
        }
        do {
            try await bridge.sendJsRenderHighlights(renderData)
        } catch {
            debugLog("[AndroidReaderSession] Failed to render highlights: \(error)")
        }
    }

    private func addHighlight(
        from selection: TextSelectionMessage,
        color: HighlightColor?,
        note: String?,
    ) async {
        guard let bookID = currentBookID else { return }

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
    }

    private func setHighlightColor(id: String, colorId: String) async {
        guard let uuid = UUID(uuidString: id),
            let existing = highlights.first(where: { $0.id == uuid }),
            let color = HighlightColor(rawValue: colorId)
        else { return }
        await updateHighlight(existing, color: color, note: existing.note)
    }

    private func updateHighlight(
        _ existing: Highlight,
        color: HighlightColor?,
        note: String?,
    ) async {
        guard let bookID = currentBookID else { return }
        let updated = Highlight(
            id: existing.id,
            bookID: existing.bookID,
            locator: existing.locator,
            text: existing.text,
            color: color,
            note: note,
            createdAt: existing.createdAt,
        )
        await BookmarkActor.shared.updateHighlight(updated)
        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)
        await sendHighlightsToJS()
    }

    private func deleteHighlight(id: String) async {
        guard let bookID = currentBookID, let uuid = UUID(uuidString: id) else { return }
        await BookmarkActor.shared.deleteHighlight(id: uuid, bookID: bookID)
        highlights = await BookmarkActor.shared.getHighlights(bookID: bookID)
        try? await bridge?.sendJsRemoveHighlight(id: uuid.uuidString)
    }

    private func goToHighlight(id: String) async throws {
        guard let bridge,
            let uuid = UUID(uuidString: id),
            let highlight = highlights.first(where: { $0.id == uuid })
        else { return }
        if let cfi = highlight.locator.locations?.partialCfi {
            try await bridge.sendJsGoToCFICommand(cfi: cfi)
        } else {
            var href = highlight.locator.href
            if let fragment = highlight.locator.locations?.fragments?.first {
                href = "\(href)#\(fragment)"
            }
            try await bridge.sendJsGoToHrefCommand(href: href)
        }
    }

    private struct HighlightEdit: Decodable {
        var id: String?
        var colorId: String?
        var note: String?
    }

    private func applyHighlightEdit(json: String) async throws {
        let edit = try JSONDecoder().decode(HighlightEdit.self, from: Data(json.utf8))
        let color = edit.colorId.flatMap(HighlightColor.init(rawValue:))
        let note = edit.note?.isEmpty == true ? nil : edit.note

        if let id = edit.id, let uuid = UUID(uuidString: id) {
            guard let existing = highlights.first(where: { $0.id == uuid }) else { return }
            await updateHighlight(existing, color: color, note: note)
            pendingEditHighlightID = nil
        } else if let selection = pendingSelection {
            await addHighlight(from: selection, color: color, note: note)
            if let colorId = edit.colorId {
                rememberLastUsedColor(colorId)
            }
        }
    }

    private func resetSearchState() {
        searchQuery = ""
        isSearching = false
        searchProgress = 0
        searchSections = []
        searchError = nil
    }

    private struct SearchRequest: Decodable {
        var query: String
        var matchCase: Bool?
        var matchWholeWords: Bool?
    }

    private func startSearch(json: String) async throws {
        guard let bridge else {
            throw AndroidBridgeError.readerNotOpen
        }
        let request = try JSONDecoder().decode(SearchRequest.self, from: Data(json.utf8))
        guard !request.query.isEmpty else { return }
        resetSearchState()
        searchQuery = request.query
        isSearching = true
        do {
            try await bridge.sendJsStartSearchCommand(
                query: request.query,
                matchCase: request.matchCase ?? false,
                matchDiacritics: false,
                matchWholeWords: request.matchWholeWords ?? false,
            )
        } catch {
            isSearching = false
            searchError = error.localizedDescription
            throw error
        }
    }

    private func resetDisplaySettings() {
        settings.fontSize = kDefaultFontSize
        settings.fontFamily = kDefaultFontFamily
        settings.lineSpacing = kDefaultLineSpacing
        settings.marginLeftRight = kDefaultMarginLeftRightIOS
        settings.marginTop = kDefaultMarginTop
        settings.marginBottom = kDefaultMarginBottom
        settings.wordSpacing = kDefaultWordSpacing
        settings.letterSpacing = kDefaultLetterSpacing
        settings.paragraphSpacing = kDefaultParagraphSpacing
        settings.firstLineIndent = kDefaultFirstLineIndent
        settings.textAlignment = kDefaultTextAlignment
        settings.singleColumnMode = kDefaultSingleColumnMode
        settings.scrollingMode = kDefaultScrollingMode
        settings.disableReaderAnimations = kDefaultDisableReaderAnimations
        settings.enableMarginClickNavigation = kDefaultEnableMarginClickNavigation
    }

    private func applyOverlayOptions(json: String) async throws {
        let update = try JSONDecoder().decode(OverlayOptionsUpdate.self, from: Data(json.utf8))
        if let value = update.showProgress { overlayOptions.showProgress = value }
        if let value = update.showPageNumber { overlayOptions.showPageNumber = value }
        if let value = update.showTimeRemainingInBook {
            overlayOptions.showTimeRemainingInBook = value
        }
        if let value = update.showTimeRemainingInChapter {
            overlayOptions.showTimeRemainingInChapter = value
        }
        if let value = update.showSkipBackward { overlayOptions.showSkipBackward = value }
        if let value = update.showPlayPause { overlayOptions.showPlayPause = value }
        if let value = update.showSkipForward { overlayOptions.showSkipForward = value }
        if let value = update.alwaysShowMiniPlayer { overlayOptions.alwaysShowMiniPlayer = value }
        if let value = update.showMiniPlayerStats { overlayOptions.showMiniPlayerStats = value }

        try await SettingsActor.shared.updateConfig(
            showProgress: overlayOptions.showProgress,
            showTimeRemainingInBook: overlayOptions.showTimeRemainingInBook,
            showTimeRemainingInChapter: overlayOptions.showTimeRemainingInChapter,
            showPageNumber: overlayOptions.showPageNumber,
            alwaysShowMiniPlayer: overlayOptions.alwaysShowMiniPlayer,
            showOverlaySkipBackward: overlayOptions.showSkipBackward,
            showOverlaySkipForward: overlayOptions.showSkipForward,
            showOverlayPlayPause: overlayOptions.showPlayPause,
            showMiniPlayerStats: overlayOptions.showMiniPlayerStats,
        )
    }

    private func applyCustomization(json: String) async throws {
        let update = try JSONDecoder().decode(CustomizationUpdate.self, from: Data(json.utf8))

        if let mini = update.miniPlayer {
            if let value = mini.size { miniPlayerConfig.size = value }
            if let value = mini.leadingStyle { miniPlayerConfig.leadingStyle = value }
            if let value = mini.cycleFirst { miniPlayerConfig.cycleFirst = value }
            if let value = mini.cycleSecond { miniPlayerConfig.cycleSecond = value }
            if let value = mini.cycleShowingSecond { miniPlayerConfig.cycleShowingSecond = value }
            if let value = mini.progressScope { miniPlayerConfig.progressScope = value }
            if let value = mini.mirrored { miniPlayerConfig.mirrored = value }
            if let value = mini.contentRowSlots {
                miniPlayerConfig.contentRowSlots = SlotLayout.sanitized(
                    value,
                    for: .miniContentRow,
                )
            }
            if let value = mini.statSlots {
                miniPlayerConfig.statSlots = SlotLayout.sanitized(value, for: .miniStatBand)
            }
            if let value = mini.scrubRowSlots {
                miniPlayerConfig.scrubRowSlots = SlotLayout.sanitized(value, for: .miniScrubRow)
            }
            if let value = mini.extraSlots {
                miniPlayerConfig.extraSlots = SlotLayout.sanitized(value, for: .miniExtraRow)
            }
            if let value = mini.progressIndicator { miniProgressIndicator = value }
            if let value = mini.progressThickness { miniProgressThickness = value }
        }

        if let dock = update.dock {
            if let value = dock.leadingSlots {
                dockOptions.leadingSlots = SlotLayout.sanitized(value, for: .dockLeading)
            }
            if let value = dock.trailingSlots {
                dockOptions.trailingSlots = SlotLayout.sanitized(value, for: .dockTrailing)
            }
            if let value = dock.centerSlots {
                dockOptions.centerSlots = SlotLayout.sanitized(value, for: .dockCenter)
            }
            if let value = dock.transparency { dockOptions.transparency = value }
            if let value = dock.progressIndicator { dockOptions.progressIndicator = value }
            if let value = dock.progressThickness { dockOptions.progressThickness = value }
            if let value = dock.progressScope { dockOptions.progressScope = value }
        }

        if let slots = update.menuBar?.slots {
            menuBarSlots = SlotLayout.sanitized(slots, for: .menuBar)
        }

        if let fullPlayer = update.fullPlayer {
            if let value = fullPlayer.statSlots {
                fullPlayerConfig.statSlots = SlotLayout.sanitized(value, for: .fullPlayerStats)
            }
            if let value = fullPlayer.controlSlots {
                fullPlayerConfig.controlSlots = SlotLayout.sanitized(
                    value, for: .fullPlayerControls)
            }
        }

        if let modes = update.playbackModes {
            if let value = modes.freeBrowseMode, kFreeBrowseModeValues.contains(value) {
                settings.freeBrowseMode = value
            }
            if let value = modes.readaloudHighlightVisibility,
                kReadaloudHighlightVisibilityValues.contains(value)
            {
                settings.readaloudHighlightVisibility = experimentalSettings ? value : "paused"
            }
            if let value = modes.doubleTapPlay, kDoubleTapPlayValues.contains(value) {
                settings.doubleTapPlay = value
            }
            if let value = modes.automaticRewindEnabled {
                settings.automaticRewindEnabled = value
            }
            if let value = modes.automaticRewindAfterInterruption {
                settings.automaticRewindAfterInterruption = value
            }
            if let value = modes.automaticRewindAfterBreak {
                settings.automaticRewindAfterBreak = value
            }
        }

        let miniChanged = update.miniPlayer != nil
        let dockChanged = update.dock != nil

        // Legacy booleans stay derived from the slot arrays so macOS/tvOS and
        // older clients keep working, mirroring SettingsViewModel.swift.
        if dockChanged {
            overlayOptions.showProgress = dockOptions.leadingSlots.contains(.statPercent)
            overlayOptions.showPageNumber = dockOptions.leadingSlots.contains(.statPage)
            overlayOptions.showTimeRemainingInBook =
                dockOptions.trailingSlots.contains(.statTimeInBook)
            overlayOptions.showTimeRemainingInChapter =
                dockOptions.trailingSlots.contains(.statTimeInChapter)
            overlayOptions.showSkipBackward = dockOptions.centerSlots.contains(.skipBackward)
            overlayOptions.showPlayPause = dockOptions.centerSlots.contains(.playPause)
            overlayOptions.showSkipForward = dockOptions.centerSlots.contains(.skipForward)
        }
        if miniChanged {
            overlayOptions.showMiniPlayerStats = miniPlayerConfig.statSlots.hasActiveComplication
        }

        try await SettingsActor.shared.updateConfig(
            freeBrowseMode: update.playbackModes?.freeBrowseMode.map { _ in
                settings.freeBrowseMode
            },
            readaloudHighlightVisibility: update.playbackModes?.readaloudHighlightVisibility.map {
                _ in settings.readaloudHighlightVisibility
            },
            doubleTapPlay: update.playbackModes?.doubleTapPlay.map { _ in settings.doubleTapPlay },
            automaticRewindEnabled: update.playbackModes?.automaticRewindEnabled.map { _ in
                settings.automaticRewindEnabled
            },
            automaticRewindAfterInterruption: update.playbackModes?.automaticRewindAfterInterruption
                .map { _ in settings.automaticRewindAfterInterruption },
            automaticRewindAfterBreak: update.playbackModes?.automaticRewindAfterBreak.map { _ in
                settings.automaticRewindAfterBreak
            },
            miniPlayerSize: miniChanged ? miniPlayerConfig.size : nil,
            miniPlayerLeadingStyle: miniChanged ? miniPlayerConfig.leadingStyle : nil,
            miniPlayerCycleFirst: miniChanged ? miniPlayerConfig.cycleFirst : nil,
            miniPlayerCycleSecond: miniChanged ? miniPlayerConfig.cycleSecond : nil,
            miniPlayerCycleShowingSecond: miniChanged
                ? miniPlayerConfig.cycleShowingSecond : nil,
            miniPlayerProgressScope: miniChanged ? miniPlayerConfig.progressScope : nil,
            miniPlayerMirrored: miniChanged ? miniPlayerConfig.mirrored : nil,
            miniPlayerContentRowSlots: miniChanged ? miniPlayerConfig.contentRowSlots : nil,
            miniPlayerStatSlots: miniChanged ? miniPlayerConfig.statSlots : nil,
            miniPlayerScrubRowSlots: miniChanged ? miniPlayerConfig.scrubRowSlots : nil,
            miniPlayerExtraSlots: miniChanged ? miniPlayerConfig.extraSlots : nil,
            fullPlayerStatSlots: update.fullPlayer?.statSlots != nil
                ? fullPlayerConfig.statSlots : nil,
            fullPlayerControlSlots: update.fullPlayer?.controlSlots != nil
                ? fullPlayerConfig.controlSlots : nil,
            dockLeadingSlots: dockChanged ? dockOptions.leadingSlots : nil,
            dockTrailingSlots: dockChanged ? dockOptions.trailingSlots : nil,
            dockCenterSlots: dockChanged ? dockOptions.centerSlots : nil,
            menuBarSlots: update.menuBar?.slots != nil ? menuBarSlots : nil,
            showProgress: dockChanged ? overlayOptions.showProgress : nil,
            showTimeRemainingInBook: dockChanged
                ? overlayOptions.showTimeRemainingInBook : nil,
            showTimeRemainingInChapter: dockChanged
                ? overlayOptions.showTimeRemainingInChapter : nil,
            showPageNumber: dockChanged ? overlayOptions.showPageNumber : nil,
            dockTransparency: dockChanged ? dockOptions.transparency : nil,
            showOverlaySkipBackward: dockChanged ? overlayOptions.showSkipBackward : nil,
            showOverlaySkipForward: dockChanged ? overlayOptions.showSkipForward : nil,
            showOverlayPlayPause: dockChanged ? overlayOptions.showPlayPause : nil,
            showMiniPlayerStats: miniChanged ? overlayOptions.showMiniPlayerStats : nil,
            progressIndicatorMiniPlayer: miniChanged ? miniProgressIndicator : nil,
            progressIndicatorDock: dockChanged ? dockOptions.progressIndicator : nil,
            progressIndicatorThickness: miniChanged ? miniProgressThickness : nil,
            progressIndicatorThicknessDock: dockChanged
                ? dockOptions.progressThickness : nil,
            progressIndicatorScopeDock: dockChanged ? dockOptions.progressScope : nil,
        )
    }

    private func persistDisplaySettings() async throws {
        try await SettingsActor.shared.updateConfig(
            fontSize: settings.fontSize,
            fontFamily: settings.fontFamily,
            lineSpacing: settings.lineSpacing,
            marginLeftRight: settings.marginLeftRight,
            marginTop: settings.marginTop,
            marginBottom: settings.marginBottom,
            wordSpacing: settings.wordSpacing,
            letterSpacing: settings.letterSpacing,
            paragraphSpacing: settings.paragraphSpacing,
            firstLineIndent: settings.firstLineIndent,
            textAlignment: settings.textAlignment,
            enableMarginClickNavigation: settings.enableMarginClickNavigation,
            singleColumnMode: settings.singleColumnMode,
            scrollingMode: settings.scrollingMode,
            disableReaderAnimations: settings.disableReaderAnimations,
            freeBrowseMode: settings.freeBrowseMode,
            readaloudDimOthers: settings.readaloudDimOthers,
            readaloudDimAmount: settings.readaloudDimAmount,
        )
    }

    private func selectTheme(id: String, dark: Bool) async throws {
        guard ReaderTheme.resolve(id: id, customThemes: customThemes) != nil else {
            throw AndroidBridgeError.invalidReaderCommand("selectTheme \(id)")
        }
        if dark {
            selectedDarkThemeId = id
            try await SettingsActor.shared.updateConfig(selectedDarkThemeId: id)
        } else {
            selectedLightThemeId = id
            try await SettingsActor.shared.updateConfig(selectedLightThemeId: id)
        }
        applyActiveTheme()
        await sendHighlightsToJS()
    }

    private struct ThemeEdit: Decodable {
        var id: String?
        var name: String
        var appearance: String?
        var backgroundColor: String
        var foregroundColor: String
        var highlightColor: String?
        var highlightThickness: Double?
        var readaloudHighlightMode: String?
        var readaloudHighlightFade: Double?
        var coverStrengthBackground: Double?
        var coverStrengthForeground: Double?
        var coverStrengthHighlight: Double?
        var readaloudTextItalic: Bool?
        var readaloudTextBold: Bool?
        var readaloudUnderlineStyle: String?
        var userHighlightMode: String?
        var userHighlightColors: [String]?
        var userHighlightLabels: [String]?
        var customCSS: String?
    }

    private func saveTheme(json: String) async throws {
        let edit = try JSONDecoder().decode(ThemeEdit.self, from: Data(json.utf8))

        // Edits to a built-in theme are stored as an override keeping the stock
        // name and appearance, so Reset to Stock can always restore it.
        if let id = edit.id, let stock = ReaderTheme.allBuiltIn.first(where: { $0.id == id }) {
            var theme = builtInThemeOverrides.first(where: { $0.id == id }) ?? stock
            apply(edit, to: &theme)
            if let index = builtInThemeOverrides.firstIndex(where: { $0.id == id }) {
                builtInThemeOverrides[index] = theme
            } else {
                builtInThemeOverrides.append(theme)
            }
            try await SettingsActor.shared.updateConfig(
                builtInThemeOverrides: builtInThemeOverrides
            )
            applyActiveTheme()
            await sendHighlightsToJS()
            return
        }

        var theme: ReaderTheme
        let existingIndex = edit.id.flatMap { id in
            customThemes.firstIndex(where: { $0.id == id })
        }
        if let existingIndex {
            theme = customThemes[existingIndex]
        } else {
            theme = ReaderTheme(
                name: edit.name,
                backgroundColor: edit.backgroundColor,
                foregroundColor: edit.foregroundColor,
                highlightColor: edit.highlightColor
                    ?? (isDarkMode
                        ? ReaderTheme.builtInDark.highlightColor
                        : ReaderTheme.builtInLight.highlightColor),
            )
        }
        theme.name = edit.name
        theme.appearance = edit.appearance.flatMap(ThemeAppearance.init(rawValue:)) ?? .any
        apply(edit, to: &theme)

        if let existingIndex {
            customThemes[existingIndex] = theme
        } else {
            customThemes.append(theme)
        }
        try await SettingsActor.shared.updateConfig(customThemes: customThemes)
        applyActiveTheme()
        await sendHighlightsToJS()
    }

    private func apply(_ edit: ThemeEdit, to theme: inout ReaderTheme) {
        theme.backgroundColor = edit.backgroundColor
        theme.foregroundColor = edit.foregroundColor
        if let value = edit.highlightColor { theme.highlightColor = value }
        if let value = edit.highlightThickness { theme.highlightThickness = value }
        if let value = edit.readaloudHighlightMode { theme.readaloudHighlightMode = value }
        if let value = edit.readaloudHighlightFade { theme.readaloudHighlightFade = value }
        if let value = edit.coverStrengthBackground { theme.coverStrengthBackground = value }
        if let value = edit.coverStrengthForeground { theme.coverStrengthForeground = value }
        if let value = edit.coverStrengthHighlight { theme.coverStrengthHighlight = value }
        if let value = edit.readaloudTextItalic { theme.readaloudTextItalic = value }
        if let value = edit.readaloudTextBold { theme.readaloudTextBold = value }
        if let value = edit.readaloudUnderlineStyle { theme.readaloudUnderlineStyle = value }
        if let value = edit.userHighlightMode { theme.userHighlightMode = value }
        if let colors = edit.userHighlightColors, colors.count == 6 {
            theme.userHighlightColor1 = colors[0]
            theme.userHighlightColor2 = colors[1]
            theme.userHighlightColor3 = colors[2]
            theme.userHighlightColor4 = colors[3]
            theme.userHighlightColor5 = colors[4]
            theme.userHighlightColor6 = colors[5]
        }
        if let labels = edit.userHighlightLabels, labels.count == 6 {
            theme.userHighlightLabel1 = labels[0]
            theme.userHighlightLabel2 = labels[1]
            theme.userHighlightLabel3 = labels[2]
            theme.userHighlightLabel4 = labels[3]
            theme.userHighlightLabel5 = labels[4]
            theme.userHighlightLabel6 = labels[5]
        }
        if let value = edit.customCSS {
            theme.customCSS = value.isEmpty ? nil : value
        }
    }

    private func resetTheme(id: String) async throws {
        builtInThemeOverrides.removeAll { $0.id == id }
        try await SettingsActor.shared.updateConfig(builtInThemeOverrides: builtInThemeOverrides)
        applyActiveTheme()
        await sendHighlightsToJS()
    }

    private func deleteTheme(id: String) async throws {
        customThemes.removeAll { $0.id == id }
        if selectedLightThemeId == id {
            selectedLightThemeId = ReaderTheme.builtInLight.id
        }
        if selectedDarkThemeId == id {
            selectedDarkThemeId = ReaderTheme.builtInDark.id
        }
        try await SettingsActor.shared.updateConfig(
            selectedLightThemeId: selectedLightThemeId,
            selectedDarkThemeId: selectedDarkThemeId,
            customThemes: customThemes,
        )
        applyActiveTheme()
        await sendHighlightsToJS()
    }

    private struct ReaderState: Encodable {
        struct Toc: Encodable {
            let label: String
            let href: String
            let level: Int
            let sectionIndex: Int
        }

        struct Theme: Encodable {
            let id: String
            let name: String
            let isBuiltIn: Bool
            let isEdited: Bool
            let appearance: String
            let backgroundColor: String
            let foregroundColor: String
            let highlightColor: String
            let highlightThickness: Double
            let readaloudHighlightMode: String
            let readaloudHighlightFade: Double
            let coverStrengthBackground: Double
            let coverStrengthForeground: Double
            let coverStrengthHighlight: Double
            let readaloudTextItalic: Bool
            let readaloudTextBold: Bool
            let readaloudUnderlineStyle: String
            let userHighlightMode: String
            let userHighlightColors: [String]
            let userHighlightLabels: [String]
            let customCSS: String?
        }

        struct HighlightItem: Encodable {
            let id: String
            let text: String
            let colorId: String?
            let note: String?
            let isBookmark: Bool
            let chapterTitle: String?
        }

        struct PaletteEntry: Encodable {
            let id: String
            let color: String
            let label: String
        }

        struct PendingEdit: Encodable {
            let id: String
            let text: String
            let colorId: String?
            let note: String?
        }

        struct ServerPosition: Encodable {
            let title: String?
            let totalProgression: Double?
        }

        struct Search: Encodable {
            struct Section: Encodable {
                let label: String
                let results: [SearchResult]
            }

            let query: String
            let isSearching: Bool
            let progress: Double
            let totalCount: Int
            let sections: [Section]
            let error: String?
        }

        struct DisplaySettings: Encodable {
            let fontSize: Double
            let fontFamily: String
            let lineSpacing: Double
            let marginLeftRight: Double
            let marginTopBottom: Double
            let marginTop: Double
            let marginBottom: Double
            let wordSpacing: Double
            let letterSpacing: Double
            let paragraphSpacing: Double
            let firstLineIndent: Bool
            let textAlignment: String
            let singleColumnMode: Bool
            let scrollingMode: Bool
            let disableReaderAnimations: Bool
            let enableMarginClickNavigation: Bool
            let lockViewToAudio: Bool
            let readaloudDimOthers: Bool
            let readaloudDimAmount: Double
        }

        struct MiniPlayerState: Encodable {
            let size: MiniPlayerSize
            let leadingStyle: MiniPlayerLeadingStyle
            let cycleFirst: MiniPlayerCycleBlock
            let cycleSecond: MiniPlayerCycleBlock
            let cycleShowingSecond: Bool
            let progressScope: MiniPlayerProgressScope
            let mirrored: Bool
            let contentRowSlots: [PlayerComplication]
            let statSlots: [PlayerComplication]
            let scrubRowSlots: [PlayerComplication]
            let extraSlots: [PlayerComplication]
            let progressIndicator: Bool
            let progressThickness: Double
        }

        struct DockState: Encodable {
            let leadingSlots: [PlayerComplication]
            let trailingSlots: [PlayerComplication]
            let centerSlots: [PlayerComplication]
            let transparency: Double
            let progressIndicator: Bool
            let progressThickness: Double
            let progressScope: MiniPlayerProgressScope
        }

        struct MenuBarState: Encodable {
            let slots: [PlayerComplication]
        }

        struct FullPlayerState: Encodable {
            let statSlots: [PlayerComplication]
            let controlSlots: [PlayerComplication]
        }

        struct PlaybackModes: Encodable {
            let freeBrowseMode: String
            let readaloudHighlightVisibility: String
            let doubleTapPlay: String
            let automaticRewindEnabled: Bool
            let automaticRewindAfterInterruption: Double
            let automaticRewindAfterBreak: Double
        }

        let title: String
        let author: String
        let hasAudioNarration: Bool
        let toc: [Toc]
        let selectedChapterId: Int?
        let chapterCount: Int
        let bookFraction: Double?
        let chapterFraction: Double?
        let chapterCurrentPage: Int?
        let chapterTotalPages: Int?
        let isPlaying: Bool
        let playbackRate: Double
        let volume: Double
        let bookTimeRemaining: Double?
        let chapterTimeRemaining: Double?
        let chapterElapsedSeconds: Double?
        let chapterTotalSeconds: Double?
        let sleepTimerActive: Bool
        let sleepTimerRemaining: Double?
        let sleepTimerType: String?
        let sleepTimerEndOfChapter: Bool
        let overlayToggleCount: Int
        let keepScreenOn: Bool
        let backgroundColor: String
        let foregroundColor: String
        let activeThemeId: String
        let selectedLightThemeId: String
        let selectedDarkThemeId: String
        let themes: [Theme]
        let settings: DisplaySettings
        let overlay: OverlayOptions
        let miniPlayer: MiniPlayerState
        let dock: DockState
        let menuBar: MenuBarState
        let fullPlayer: FullPlayerState
        let playbackModes: PlaybackModes
        let experimentalSettings: Bool
        let search: Search
        let highlights: [HighlightItem]
        let highlightPalette: [PaletteEntry]
        let pendingSelectionText: String?
        let pendingEdit: PendingEdit?
        let pendingServerPosition: ServerPosition?
        let timelineBackDescription: String?
        let timelineForwardDescription: String?
    }

    // The reader state lives across several @Observable objects whose
    // instances are replaced mid-session (EPM/MOM generations), so poll and
    // dedup instead of chaining withObservationTracking registrations.
    private func startStatePublisher() {
        statePublisher?.cancel()
        statePublisher = Task { @StorytellerUIActor [weak self] in
            while !Task.isCancelled {
                guard let self, let session = self.session else { return }
                self.publishState(session)
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
    }

    private func publishState(_ session: ReadingSession) {
        let progressManager = session.progressManager
        let overlayManager = session.mediaOverlayManager
        let state = ReaderState(
            title: session.metadata.title,
            author: session.metadata.authors?.first?.name ?? "",
            hasAudioNarration: session.hasAudioNarration,
            toc: session.tocEntries.map {
                ReaderState.Toc(
                    label: $0.label,
                    href: $0.href,
                    level: $0.level,
                    sectionIndex: $0.sectionIndex,
                )
            },
            selectedChapterId: progressManager?.uiSelectedChapterId,
            chapterCount: session.bookStructure.count,
            bookFraction: progressManager?.bookFraction,
            chapterFraction: progressManager?.chapterSeekBarValue,
            chapterCurrentPage: progressManager?.chapterCurrentPage,
            chapterTotalPages: progressManager?.chapterTotalPages,
            isPlaying: overlayManager?.isPlaying ?? false,
            playbackRate: overlayManager?.playbackRate ?? 1.0,
            volume: overlayManager?.volume ?? 1.0,
            bookTimeRemaining: overlayManager?.bookTimeRemaining?.rounded(),
            chapterTimeRemaining: overlayManager?.chapterTimeRemaining?.rounded(),
            chapterElapsedSeconds: overlayManager?.chapterElapsedSeconds?.rounded(),
            chapterTotalSeconds: overlayManager?.chapterTotalSeconds?.rounded(),
            sleepTimerActive: overlayManager?.sleepTimerActive ?? false,
            sleepTimerRemaining: overlayManager?.sleepTimerRemaining?.rounded(),
            sleepTimerType: overlayManager?.sleepTimerType?.rawValue,
            sleepTimerEndOfChapter: (overlayManager?.sleepTimerActive ?? false)
                && overlayManager?.sleepTimerType == .endOfChapter,
            overlayToggleCount: overlayToggleCount,
            keepScreenOn: keepScreenOn,
            backgroundColor: CoverReaderChrome.resolvedHex(
                settings.backgroundColor,
                role: .background,
                tone: coverTone,
                dark: isDarkMode,
                strength: settings.coverStrengthBackground,
            ) ?? (isDarkMode ? kDefaultBackgroundColorDark : kDefaultBackgroundColorLight),
            foregroundColor: CoverReaderChrome.resolvedHex(
                settings.foregroundColor,
                role: .foreground,
                tone: coverTone,
                dark: isDarkMode,
                strength: settings.coverStrengthForeground,
            ) ?? (isDarkMode ? kDefaultForegroundColorDark : kDefaultForegroundColorLight),
            activeThemeId: activeThemeId,
            selectedLightThemeId: selectedLightThemeId,
            selectedDarkThemeId: selectedDarkThemeId,
            themes: allThemes.map { theme in
                ReaderState.Theme(
                    id: theme.id,
                    name: theme.name,
                    isBuiltIn: theme.isBuiltIn,
                    isEdited: theme.isBuiltIn
                        && builtInThemeOverrides.contains(where: { $0.id == theme.id }),
                    appearance: theme.appearance.rawValue,
                    backgroundColor: theme.backgroundColor,
                    foregroundColor: theme.foregroundColor,
                    highlightColor: theme.highlightColor,
                    highlightThickness: theme.highlightThickness,
                    readaloudHighlightMode: theme.readaloudHighlightMode,
                    readaloudHighlightFade: theme.readaloudHighlightFade,
                    coverStrengthBackground: theme.coverStrengthBackground,
                    coverStrengthForeground: theme.coverStrengthForeground,
                    coverStrengthHighlight: theme.coverStrengthHighlight,
                    readaloudTextItalic: theme.readaloudTextItalic,
                    readaloudTextBold: theme.readaloudTextBold,
                    readaloudUnderlineStyle: theme.readaloudUnderlineStyle,
                    userHighlightMode: theme.userHighlightMode,
                    userHighlightColors: [
                        theme.userHighlightColor1, theme.userHighlightColor2,
                        theme.userHighlightColor3, theme.userHighlightColor4,
                        theme.userHighlightColor5, theme.userHighlightColor6,
                    ],
                    userHighlightLabels: [
                        theme.userHighlightLabel1, theme.userHighlightLabel2,
                        theme.userHighlightLabel3, theme.userHighlightLabel4,
                        theme.userHighlightLabel5, theme.userHighlightLabel6,
                    ],
                    customCSS: theme.customCSS,
                )
            },
            settings: ReaderState.DisplaySettings(
                fontSize: settings.fontSize,
                fontFamily: settings.fontFamily,
                lineSpacing: settings.lineSpacing,
                marginLeftRight: settings.marginLeftRight,
                marginTopBottom: settings.marginTop,
                marginTop: settings.marginTop,
                marginBottom: settings.marginBottom,
                wordSpacing: settings.wordSpacing,
                letterSpacing: settings.letterSpacing,
                paragraphSpacing: settings.paragraphSpacing,
                firstLineIndent: settings.firstLineIndent,
                textAlignment: settings.textAlignment,
                singleColumnMode: settings.singleColumnMode,
                scrollingMode: settings.scrollingMode,
                disableReaderAnimations: settings.disableReaderAnimations,
                enableMarginClickNavigation: settings.enableMarginClickNavigation,
                lockViewToAudio: settings.lockViewToAudio,
                readaloudDimOthers: settings.readaloudDimOthers,
                readaloudDimAmount: settings.readaloudDimAmount,
            ),
            overlay: overlayOptions,
            miniPlayer: ReaderState.MiniPlayerState(
                size: miniPlayerConfig.size,
                leadingStyle: miniPlayerConfig.leadingStyle,
                cycleFirst: miniPlayerConfig.cycleFirst,
                cycleSecond: miniPlayerConfig.cycleSecond,
                cycleShowingSecond: miniPlayerConfig.cycleShowingSecond,
                progressScope: miniPlayerConfig.progressScope,
                mirrored: miniPlayerConfig.mirrored,
                contentRowSlots: miniPlayerConfig.contentRowSlots,
                statSlots: miniPlayerConfig.statSlots,
                scrubRowSlots: miniPlayerConfig.scrubRowSlots,
                extraSlots: miniPlayerConfig.extraSlots,
                progressIndicator: miniProgressIndicator,
                progressThickness: miniProgressThickness,
            ),
            dock: ReaderState.DockState(
                leadingSlots: dockOptions.leadingSlots,
                trailingSlots: dockOptions.trailingSlots,
                centerSlots: dockOptions.centerSlots,
                transparency: dockOptions.transparency,
                progressIndicator: dockOptions.progressIndicator,
                progressThickness: dockOptions.progressThickness,
                progressScope: dockOptions.progressScope,
            ),
            menuBar: ReaderState.MenuBarState(slots: menuBarSlots),
            fullPlayer: ReaderState.FullPlayerState(
                statSlots: fullPlayerConfig.statSlots,
                controlSlots: fullPlayerConfig.controlSlots,
            ),
            playbackModes: ReaderState.PlaybackModes(
                freeBrowseMode: settings.freeBrowseMode,
                readaloudHighlightVisibility: settings.readaloudHighlightVisibility,
                doubleTapPlay: settings.doubleTapPlay,
                automaticRewindEnabled: settings.automaticRewindEnabled,
                automaticRewindAfterInterruption: settings.automaticRewindAfterInterruption,
                automaticRewindAfterBreak: settings.automaticRewindAfterBreak,
            ),
            experimentalSettings: experimentalSettings,
            search: ReaderState.Search(
                query: searchQuery,
                isSearching: isSearching,
                progress: searchProgress,
                totalCount: searchSections.reduce(0) { $0 + $1.results.count },
                sections: searchSections.map {
                    ReaderState.Search.Section(label: $0.sectionLabel, results: $0.results)
                },
                error: searchError,
            ),
            highlights: highlights.map {
                ReaderState.HighlightItem(
                    id: $0.id.uuidString,
                    text: $0.displayText,
                    colorId: $0.color?.rawValue,
                    note: $0.note,
                    isBookmark: $0.isBookmark,
                    chapterTitle: $0.chapterTitle,
                )
            },
            highlightPalette: HighlightColor.allCases.map {
                ReaderState.PaletteEntry(
                    id: $0.rawValue,
                    color: themeHighlightColor($0),
                    label: themeHighlightLabel($0),
                )
            },
            pendingSelectionText: pendingSelection?.text,
            pendingEdit: pendingEditHighlightID.flatMap { id in
                highlights.first(where: { $0.id == id }).map {
                    ReaderState.PendingEdit(
                        id: $0.id.uuidString,
                        text: $0.displayText,
                        colorId: $0.color?.rawValue,
                        note: $0.note,
                    )
                }
            },
            pendingServerPosition: pendingServerPosition.map {
                ReaderState.ServerPosition(
                    title: $0.locator.title,
                    totalProgression: $0.locator.locations?.totalProgression,
                )
            },
            timelineBackDescription: timelineBackLocator != nil ? timelineBackDescription : nil,
            timelineForwardDescription: timelineForwardLocator != nil
                ? timelineForwardDescription : nil,
        )

        guard let payload = try? encodeReaderJSON(state), payload != lastStatePayload else {
            return
        }
        lastStatePayload = payload
        notifyAndroidReaderStateDidChange(payload)
    }
}

// Mirrors SlotLayout in AppleKit Customize/ComplicationPickerSheet.swift (iOS-only module).
private enum SlotRegion {
    case miniContentRow, miniStatBand, miniScrubRow, miniExtraRow
    case dockLeading, dockTrailing, dockCenter, menuBar
    case fullPlayerStats, fullPlayerControls
}

private enum SlotLayout {
    static func slotCount(for region: SlotRegion) -> Int {
        switch region {
            case .miniContentRow: return 5
            case .miniStatBand: return 4
            case .miniScrubRow: return 4
            case .miniExtraRow: return 4
            case .dockLeading: return 2
            case .dockTrailing: return 2
            case .dockCenter: return 3
            case .menuBar: return 6
            case .fullPlayerStats: return 6
            case .fullPlayerControls: return 6
        }
    }

    static func isMiniRow(_ region: SlotRegion) -> Bool {
        switch region {
            case .miniContentRow, .miniStatBand, .miniScrubRow, .miniExtraRow: return true
            case .dockLeading, .dockTrailing, .dockCenter, .menuBar,
                .fullPlayerStats, .fullPlayerControls:
                return false
        }
    }

    static let stats: [PlayerComplication] = [
        .statPercent, .statPage, .statPagesLeft, .statChapterOf, .statChapterPercent,
        .statTimeInBook, .statTimeInChapter, .statChapterElapsed, .statChapterLength,
        .statFinishTime, .statSessionTime, .statSleepTimer,
    ]

    static let dockOnlyStats: [PlayerComplication] = [.statClock, .statBattery]

    static func isTextOnly(_ region: SlotRegion) -> Bool {
        region == .miniStatBand || region == .fullPlayerStats
    }

    static func readerControls(for region: SlotRegion) -> [PlayerComplication] {
        if isTextOnly(region) { return [] }
        if region == .fullPlayerControls {
            return [
                .chapters, .bookmarks, .readingTimeline, .imageGallery, .search, .textSettings,
                .sleepTimer,
            ]
        }
        return [
            .chapters, .bookmarks, .readingTimeline, .imageGallery, .search, .textSettings,
            .sleepTimer, .mirror, .scrollMode, .freeBrowseLock, .orientationLock,
        ]
    }

    static func playbackControls(for region: SlotRegion) -> [PlayerComplication] {
        if isTextOnly(region) { return [] }
        if isMiniRow(region) {
            return [
                .titleBlock, .scrubBar, .skipBackward, .playPause, .skipForward, .playbackSpeed,
            ]
        }
        switch region {
            case .dockCenter, .menuBar:
                return [.playPause, .skipBackward, .skipForward, .playbackSpeed]
            case .fullPlayerControls:
                return [.playbackSpeed, .volume]
            default:
                return []
        }
    }

    static func statComplications(for region: SlotRegion) -> [PlayerComplication] {
        switch region {
            case .dockLeading, .dockTrailing:
                return stats + dockOnlyStats
            default:
                return stats
        }
    }

    static func allowedComplications(for region: SlotRegion) -> [PlayerComplication] {
        [.none] + playbackControls(for: region) + readerControls(for: region)
            + statComplications(for: region)
    }

    static func sanitized(
        _ slots: [PlayerComplication],
        for region: SlotRegion,
    ) -> [PlayerComplication] {
        let allowed = allowedComplications(for: region)
        return padded(slots, for: region).map { allowed.contains($0) ? $0 : .none }
    }

    static func padded(
        _ slots: [PlayerComplication],
        for region: SlotRegion,
    ) -> [PlayerComplication] {
        let count = slotCount(for: region)
        var result = Array(slots.prefix(count))
        while result.count < count { result.append(.none) }
        return result
    }
}

private func encodeReaderJSON<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return String(decoding: try encoder.encode(value), as: UTF8.self)
}

private struct AndroidBookImageIndex: Encodable {
    let images: [AndroidBookImage]
}

private struct AndroidBookImage: Encodable {
    let id: String
    let title: String
    let kind: String
    let caption: String?
    let pageLabel: String?
    let sectionIndex: Int
    let chapterTitle: String?
}

private struct AndroidReadingTimeline: Encodable {
    let visits: [AndroidReadingVisit]
}

private struct AndroidReadingVisit: Encodable {
    let id: String
    let startedAt: Double
    let endedAt: Double
    let startDescription: String
    let endDescription: String
    let startProgression: Double?
    let endProgression: Double?
    let source: String
    let endText: String?
    let chapterTitle: String?
}
