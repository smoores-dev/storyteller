#if os(iOS) || os(macOS)
import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
public final class SettingsViewModel {
    public var fontSize: Double = kDefaultFontSize
    public var fontFamily: String = kDefaultFontFamily
    public var lineSpacing: Double = kDefaultLineSpacing
    #if os(iOS)
    public var marginLeftRight: Double = kDefaultMarginLeftRightIOS
    #else
    public var marginLeftRight: Double = kDefaultMarginLeftRightMac
    #endif
    public var marginTop: Double = kDefaultMarginTop
    public var marginBottom: Double = kDefaultMarginBottom
    public var wordSpacing: Double = kDefaultWordSpacing
    public var letterSpacing: Double = kDefaultLetterSpacing
    public var paragraphSpacing: Double = kDefaultParagraphSpacing
    public var firstLineIndent: Bool = kDefaultFirstLineIndent
    public var textAlignment: String = kDefaultTextAlignment
    public var highlightColor: String? = nil
    public var highlightThickness: Double = kDefaultHighlightThickness
    public var backgroundColor: String? = nil
    public var foregroundColor: String? = nil
    public var customCSS: String? = nil
    public var enableMarginClickNavigation: Bool = kDefaultEnableMarginClickNavigation
    public var singleColumnMode: Bool = kDefaultSingleColumnMode
    public var scrollingMode: Bool = kDefaultScrollingMode

    public var defaultPlaybackSpeed: Double = kDefaultPlaybackSpeed
    public var defaultVolume: Double = kDefaultVolume
    public var statsExpanded: Bool = kDefaultStatsExpanded
    public var freeBrowseMode: String = kDefaultFreeBrowseMode
    public var readaloudHighlightVisibility: String = kDefaultReadaloudHighlightVisibility
    public var doubleTapPlay: String = kDefaultDoubleTapPlay

    public var lockViewToAudio: Bool {
        get { freeBrowseMode == "never" }
        set { freeBrowseMode = newValue ? "never" : "paused" }
    }

    public var enableReadingBar: Bool = kDefaultReadingBarEnabled
    #if os(iOS)
    public var showPlayerControls: Bool = kDefaultShowPlayerControlsIOS
    #else
    public var showPlayerControls: Bool = kDefaultShowPlayerControlsMac
    #endif
    public var showProgressBar: Bool = kDefaultShowProgressBar
    public var showProgress: Bool = kDefaultShowProgress
    public var showTimeRemainingInBook: Bool = kDefaultShowTimeRemainingInBook
    public var showTimeRemainingInChapter: Bool = kDefaultShowTimeRemainingInChapter
    public var showPageNumber: Bool = kDefaultShowPageNumber
    public var dockTransparency: Double = kDefaultDockTransparency
    public var progressIndicatorMiniPlayer: Bool = kDefaultProgressIndicatorMiniPlayer
    public var progressIndicatorDock: Bool = kDefaultProgressIndicatorDock
    public var progressIndicatorThickness: Double = kDefaultProgressIndicatorThickness
    public var progressIndicatorThicknessDock: Double = kDefaultProgressIndicatorThickness
    public var progressIndicatorScopeDock: MiniPlayerProgressScope = .chapter
    #if os(iOS)
    public var alwaysShowMiniPlayer: Bool = kDefaultAlwaysShowMiniPlayer
    public var showOverlaySkipBackward: Bool = kDefaultShowOverlaySkipBackward
    public var showOverlaySkipForward: Bool = kDefaultShowOverlaySkipForward
    public var showOverlayPlayPause: Bool = kDefaultShowOverlayPlayPause
    public var showMiniPlayerStats: Bool = kDefaultShowMiniPlayerStats
    public var miniPlayerSize: MiniPlayerSize = .compact
    public var miniPlayerLeadingStyle: MiniPlayerLeadingStyle = .single
    public var miniPlayerCycleFirst: MiniPlayerCycleBlock = MiniPlayerCycleBlock(
        showCover: true, line1: .bookTitle, line2: .chapterTitle,
    )
    public var miniPlayerCycleSecond: MiniPlayerCycleBlock = MiniPlayerCycleBlock(
        showCover: true, line1: .statPage, line2: .statPercent,
    )
    public var miniPlayerCycleShowingSecond: Bool = false
    public var miniPlayerProgressScope: MiniPlayerProgressScope = .chapter
    public var miniPlayerMirrored: Bool = false
    public var miniPlayerContentRowSlots: [PlayerComplication] = [
        .titleBlock, .playbackSpeed, .none, .none, .playPause,
    ]
    public var miniPlayerStatSlots: [PlayerComplication] = []
    public var miniPlayerScrubRowSlots: [PlayerComplication] = [
        .scrubBar, .skipBackward, .playPause, .skipForward,
    ]
    public var miniPlayerExtraSlots: [PlayerComplication] = [
        .statPercent, .statPage, .statTimeInBook, .statTimeInChapter,
    ]
    public var dockLeadingSlots: [PlayerComplication] = [.statPercent, .statPage]
    public var dockTrailingSlots: [PlayerComplication] = [
        .statTimeInBook, .statTimeInChapter,
    ]
    public var dockCenterSlots: [PlayerComplication] = [
        .skipBackward, .playPause, .skipForward,
    ]
    public var menuBarSlots: [PlayerComplication] =
        StorytellerGlobalConfig.ReadingBar.defaultMenuBarSlots

    public var miniPlayerConfig: StorytellerGlobalConfig.MiniPlayer {
        StorytellerGlobalConfig.MiniPlayer(
            size: miniPlayerSize,
            leadingStyle: miniPlayerLeadingStyle,
            cycleFirst: miniPlayerCycleFirst,
            cycleSecond: miniPlayerCycleSecond,
            cycleShowingSecond: miniPlayerCycleShowingSecond,
            progressScope: miniPlayerProgressScope,
            mirrored: miniPlayerMirrored,
            contentRowSlots: miniPlayerContentRowSlots,
            statSlots: miniPlayerStatSlots,
            scrubRowSlots: miniPlayerScrubRowSlots,
            extraSlots: miniPlayerExtraSlots,
        )
    }
    #endif

    public var progressSyncIntervalSeconds: Double = kDefaultProgressSyncIntervalSeconds
    public var metadataRefreshIntervalSeconds: Double = kDefaultMetadataRefreshIntervalSeconds
    public var autoSyncToNewerServerPosition: Bool = kDefaultAutoSyncToNewerServerPosition
    public var liveReadingSyncEnabled: Bool = kDefaultLiveReadingSyncEnabled

    public var showAudioIndicator: Bool = kDefaultShowAudioIndicator
    #if os(iOS)
    public var tabBarSlot1: String = kDefaultTabBarSlot1
    public var tabBarSlot2: String = kDefaultTabBarSlot2
    public var tapToPlayPreferredPlayer: Bool = kDefaultTapToPlayPreferredPlayer
    public var preferAudioOverEbook: Bool = kDefaultPreferAudioOverEbook
    #endif
    public var accentColorHex: String = kDefaultAccentColorHex
    public var colorMode: String = kDefaultColorMode
    public var colorIntensity: Double = kDefaultColorIntensity
    public var doubleCoverAlignment: String = kDefaultDoubleCoverAlignment
    public var experimentalSettings: Bool = kDefaultExperimentalSettings

    public var userHighlightColor1: String = kDefaultUserHighlightColor1
    public var userHighlightColor2: String = kDefaultUserHighlightColor2
    public var userHighlightColor3: String = kDefaultUserHighlightColor3
    public var userHighlightColor4: String = kDefaultUserHighlightColor4
    public var userHighlightColor5: String = kDefaultUserHighlightColor5
    public var userHighlightColor6: String = kDefaultUserHighlightColor6
    public var userHighlightLabel1: String = kDefaultUserHighlightLabel1
    public var userHighlightLabel2: String = kDefaultUserHighlightLabel2
    public var userHighlightLabel3: String = kDefaultUserHighlightLabel3
    public var userHighlightLabel4: String = kDefaultUserHighlightLabel4
    public var userHighlightLabel5: String = kDefaultUserHighlightLabel5
    public var userHighlightLabel6: String = kDefaultUserHighlightLabel6
    public var userHighlightMode: String = kDefaultUserHighlightMode
    public var readaloudHighlightMode: String = kDefaultReadaloudHighlightMode
    public var readaloudDimOthers: Bool = kDefaultReadaloudDimOthers
    public var readaloudDimAmount: Double = kDefaultReadaloudDimAmount
    public var readaloudHighlightFade: Double = kDefaultReadaloudHighlightFade
    public var readaloudTextItalic: Bool = kDefaultReadaloudTextItalic
    public var readaloudTextBold: Bool = kDefaultReadaloudTextBold
    public var readaloudUnderlineStyle: String = kDefaultReadaloudUnderlineStyle

    public var selectedLightThemeId: String = "builtin-light"
    public var selectedDarkThemeId: String = "builtin-dark"
    public var customThemes: [ReaderTheme] = []
    public var builtInThemeOverrides: [ReaderTheme] = []

    public var isLoaded: Bool = false

    @ObservationIgnored private var observerID: UUID?
    @ObservationIgnored private var saveTask: Task<Void, Never>?

    public var readingBarConfig: StorytellerGlobalConfig.ReadingBar {
        StorytellerGlobalConfig.ReadingBar(
            enabled: enableReadingBar,
            showPlayerControls: showPlayerControls,
            showProgressBar: showProgressBar,
            showProgress: showProgress,
            showTimeRemainingInBook: showTimeRemainingInBook,
            showTimeRemainingInChapter: showTimeRemainingInChapter,
            showPageNumber: showPageNumber,
            dockTransparency: dockTransparency,
        )
    }

    private var userHighlightColors: [String] {
        [
            userHighlightColor1, userHighlightColor2, userHighlightColor3,
            userHighlightColor4, userHighlightColor5, userHighlightColor6,
        ]
    }

    private var userHighlightLabels: [String] {
        [
            userHighlightLabel1, userHighlightLabel2, userHighlightLabel3,
            userHighlightLabel4, userHighlightLabel5, userHighlightLabel6,
        ]
    }

    public func hexColor(for color: HighlightColor) -> String {
        userHighlightColors[color.slotIndex]
    }

    public func label(for color: HighlightColor) -> String {
        userHighlightLabels[color.slotIndex]
    }

    public var highlightColorsHash: String {
        "\(userHighlightColor1)\(userHighlightColor2)\(userHighlightColor3)\(userHighlightColor4)\(userHighlightColor5)\(userHighlightColor6)"
    }

    public init() {
        Task {
            await loadSettings()
            await registerObserver()
        }
    }

    deinit {
        if let id = observerID {
            Task {
                await SettingsActor.shared.removeObserver(id: id)
            }
        }
    }

    private func loadSettings() async {
        let config = await SettingsActor.shared.config

        fontSize = config.reading.fontSize
        fontFamily = config.reading.fontFamily
        lineSpacing = config.reading.lineSpacing
        marginLeftRight = config.reading.marginLeftRight
        marginTop = config.reading.marginTop
        marginBottom = config.reading.marginBottom
        wordSpacing = config.reading.wordSpacing
        letterSpacing = config.reading.letterSpacing
        paragraphSpacing = config.reading.paragraphSpacing
        firstLineIndent = config.reading.firstLineIndent
        textAlignment = config.reading.textAlignment
        highlightColor = config.reading.highlightColor
        highlightThickness = config.reading.highlightThickness
        backgroundColor = config.reading.backgroundColor
        foregroundColor = config.reading.foregroundColor
        customCSS = config.reading.customCSS
        enableMarginClickNavigation = config.reading.enableMarginClickNavigation
        singleColumnMode = config.reading.singleColumnMode
        scrollingMode = config.reading.scrollingMode

        defaultPlaybackSpeed = config.playback.defaultPlaybackSpeed
        defaultVolume = config.playback.defaultVolume
        statsExpanded = config.playback.statsExpanded
        freeBrowseMode = config.playback.freeBrowseMode
        readaloudHighlightVisibility = config.playback.readaloudHighlightVisibility
        doubleTapPlay = config.playback.doubleTapPlay

        enableReadingBar = config.readingBar.enabled
        showPlayerControls = config.readingBar.showPlayerControls
        showProgressBar = config.readingBar.showProgressBar
        showProgress = config.readingBar.showProgress
        showTimeRemainingInBook = config.readingBar.showTimeRemainingInBook
        showTimeRemainingInChapter = config.readingBar.showTimeRemainingInChapter
        showPageNumber = config.readingBar.showPageNumber
        dockTransparency = config.readingBar.dockTransparency
        progressIndicatorMiniPlayer = config.readingBar.progressIndicatorMiniPlayer
        progressIndicatorDock = config.readingBar.progressIndicatorDock
        progressIndicatorThickness = config.readingBar.progressIndicatorThickness
        progressIndicatorThicknessDock = config.readingBar.progressIndicatorThicknessDock
        progressIndicatorScopeDock = config.readingBar.progressIndicatorScopeDock
        #if os(iOS)
        alwaysShowMiniPlayer = config.readingBar.alwaysShowMiniPlayer
        showOverlaySkipBackward = config.readingBar.showOverlaySkipBackward
        showOverlaySkipForward = config.readingBar.showOverlaySkipForward
        showOverlayPlayPause = config.readingBar.showOverlayPlayPause
        showMiniPlayerStats = config.readingBar.showMiniPlayerStats
        miniPlayerSize = config.miniPlayer.size
        miniPlayerLeadingStyle = config.miniPlayer.leadingStyle
        miniPlayerCycleFirst = config.miniPlayer.cycleFirst
        miniPlayerCycleSecond = config.miniPlayer.cycleSecond
        miniPlayerCycleShowingSecond = config.miniPlayer.cycleShowingSecond
        miniPlayerProgressScope = config.miniPlayer.progressScope
        miniPlayerMirrored = config.miniPlayer.mirrored
        miniPlayerContentRowSlots = config.miniPlayer.contentRowSlots
        miniPlayerStatSlots = config.miniPlayer.statSlots
        miniPlayerScrubRowSlots = config.miniPlayer.scrubRowSlots
        miniPlayerExtraSlots = config.miniPlayer.extraSlots
        dockLeadingSlots = config.readingBar.dockLeadingSlots
        dockTrailingSlots = config.readingBar.dockTrailingSlots
        dockCenterSlots = config.readingBar.dockCenterSlots
        menuBarSlots = config.readingBar.menuBarSlots
        #endif

        progressSyncIntervalSeconds = config.sync.progressSyncIntervalSeconds
        metadataRefreshIntervalSeconds = config.sync.metadataRefreshIntervalSeconds
        autoSyncToNewerServerPosition = config.sync.autoSyncToNewerServerPosition
        liveReadingSyncEnabled = config.sync.liveReadingSyncEnabled

        showAudioIndicator = config.library.showAudioIndicator
        #if os(iOS)
        tabBarSlot1 = config.library.tabBarSlot1
        tabBarSlot2 = config.library.tabBarSlot2
        tapToPlayPreferredPlayer = config.library.tapToPlayPreferredPlayer
        preferAudioOverEbook = config.library.preferAudioOverEbook
        #endif
        accentColorHex = config.library.accentColorHex
        colorMode = config.library.colorMode
        colorIntensity = config.library.colorIntensity
        doubleCoverAlignment = config.library.doubleCoverAlignment
        experimentalSettings = config.library.experimentalSettings

        userHighlightColor1 = config.reading.userHighlightColor1
        userHighlightColor2 = config.reading.userHighlightColor2
        userHighlightColor3 = config.reading.userHighlightColor3
        userHighlightColor4 = config.reading.userHighlightColor4
        userHighlightColor5 = config.reading.userHighlightColor5
        userHighlightColor6 = config.reading.userHighlightColor6
        userHighlightLabel1 = config.reading.userHighlightLabel1
        userHighlightLabel2 = config.reading.userHighlightLabel2
        userHighlightLabel3 = config.reading.userHighlightLabel3
        userHighlightLabel4 = config.reading.userHighlightLabel4
        userHighlightLabel5 = config.reading.userHighlightLabel5
        userHighlightLabel6 = config.reading.userHighlightLabel6
        userHighlightMode = config.reading.userHighlightMode
        readaloudHighlightMode = config.reading.readaloudHighlightMode
        readaloudDimOthers = config.reading.readaloudDimOthers
        readaloudDimAmount = config.reading.readaloudDimAmount
        readaloudHighlightFade = config.reading.readaloudHighlightFade
        readaloudTextItalic = config.reading.readaloudTextItalic
        readaloudTextBold = config.reading.readaloudTextBold
        readaloudUnderlineStyle = config.reading.readaloudUnderlineStyle

        selectedLightThemeId = ReaderTheme.migrateThemeId(config.themes.selectedLightThemeId)
        selectedDarkThemeId = ReaderTheme.migrateThemeId(config.themes.selectedDarkThemeId)
        customThemes = config.themes.customThemes
        builtInThemeOverrides = config.themes.builtInThemeOverrides

        isLoaded = true
    }

    private func registerObserver() async {
        let id = await SettingsActor.shared.request_notify { @MainActor [weak self] in
            guard let self else { return }
            guard self.saveTask == nil else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.loadSettings()
            }
        }
        observerID = id
    }

    public var effectiveBuiltInThemes: [ReaderTheme] {
        ReaderTheme.effectiveBuiltIn(overrides: builtInThemeOverrides)
    }

    public var allThemes: [ReaderTheme] {
        effectiveBuiltInThemes + customThemes
    }

    public var lightThemes: [ReaderTheme] {
        ReaderTheme.themesForLightMode(
            customThemes: customThemes,
            builtInOverrides: builtInThemeOverrides,
        )
    }

    public var darkThemes: [ReaderTheme] {
        ReaderTheme.themesForDarkMode(
            customThemes: customThemes,
            builtInOverrides: builtInThemeOverrides,
        )
    }

    public func resolveTheme(id: String) -> ReaderTheme? {
        ReaderTheme.resolve(
            id: id,
            customThemes: customThemes,
            builtInOverrides: builtInThemeOverrides,
        )
    }

    public func isBuiltInEdited(id: String) -> Bool {
        builtInThemeOverrides.contains { $0.id == id }
    }

    public func activeThemeId(for colorScheme: ColorScheme) -> String {
        colorScheme == .dark ? selectedDarkThemeId : selectedLightThemeId
    }

    public func applyActiveTheme(for colorScheme: ColorScheme) {
        let themeId = activeThemeId(for: colorScheme)
        guard let theme = resolveTheme(id: themeId) else {
            debugLog(
                "[SettingsViewModel] Could not resolve theme \(themeId), falling back to built-in"
            )
            let fallback =
                colorScheme == .dark
                ? ReaderTheme.builtInDark
                : ReaderTheme.builtInLight
            applyThemeValues(fallback)
            return
        }
        applyThemeValues(theme)
    }

    public func applyThemeValues(_ theme: ReaderTheme) {
        backgroundColor = theme.backgroundColor
        foregroundColor = theme.foregroundColor
        highlightColor = theme.highlightColor
        highlightThickness = theme.highlightThickness
        readaloudHighlightMode = theme.readaloudHighlightMode
        readaloudHighlightFade = theme.readaloudHighlightFade
        readaloudTextItalic = theme.readaloudTextItalic
        readaloudTextBold = theme.readaloudTextBold
        readaloudUnderlineStyle = theme.readaloudUnderlineStyle
        userHighlightColor1 = theme.userHighlightColor1
        userHighlightColor2 = theme.userHighlightColor2
        userHighlightColor3 = theme.userHighlightColor3
        userHighlightColor4 = theme.userHighlightColor4
        userHighlightColor5 = theme.userHighlightColor5
        userHighlightColor6 = theme.userHighlightColor6
        userHighlightLabel1 = theme.userHighlightLabel1
        userHighlightLabel2 = theme.userHighlightLabel2
        userHighlightLabel3 = theme.userHighlightLabel3
        userHighlightLabel4 = theme.userHighlightLabel4
        userHighlightLabel5 = theme.userHighlightLabel5
        userHighlightLabel6 = theme.userHighlightLabel6
        userHighlightMode = theme.userHighlightMode
        customCSS = theme.customCSS
        save()
    }

    public func selectTheme(id: String, for colorScheme: ColorScheme) {
        if colorScheme == .dark {
            selectedDarkThemeId = id
        } else {
            selectedLightThemeId = id
        }
        applyActiveTheme(for: colorScheme)
    }

    public func addCustomTheme(_ theme: ReaderTheme) {
        customThemes.append(theme)
        save()
    }

    public func deleteCustomTheme(id: String) {
        customThemes.removeAll { $0.id == id }
        if selectedLightThemeId == id {
            selectedLightThemeId = "builtin-light"
        }
        if selectedDarkThemeId == id {
            selectedDarkThemeId = "builtin-dark"
        }
        save()
    }

    public func duplicateTheme(_ source: ReaderTheme) -> ReaderTheme {
        let newTheme = ReaderTheme(
            name: uniqueCopyName(for: source.name, existing: allThemes.map(\.name)),
            isBuiltIn: false,
            appearance: source.appearance,
            backgroundColor: source.backgroundColor,
            foregroundColor: source.foregroundColor,
            highlightColor: source.highlightColor,
            highlightThickness: source.highlightThickness,
            readaloudHighlightMode: source.readaloudHighlightMode,
            readaloudHighlightFade: source.readaloudHighlightFade,
            readaloudTextItalic: source.readaloudTextItalic,
            readaloudTextBold: source.readaloudTextBold,
            readaloudUnderlineStyle: source.readaloudUnderlineStyle,
            userHighlightColor1: source.userHighlightColor1,
            userHighlightColor2: source.userHighlightColor2,
            userHighlightColor3: source.userHighlightColor3,
            userHighlightColor4: source.userHighlightColor4,
            userHighlightColor5: source.userHighlightColor5,
            userHighlightColor6: source.userHighlightColor6,
            userHighlightLabel1: source.userHighlightLabel1,
            userHighlightLabel2: source.userHighlightLabel2,
            userHighlightLabel3: source.userHighlightLabel3,
            userHighlightLabel4: source.userHighlightLabel4,
            userHighlightLabel5: source.userHighlightLabel5,
            userHighlightLabel6: source.userHighlightLabel6,
            userHighlightMode: source.userHighlightMode,
            customCSS: source.customCSS,
        )
        addCustomTheme(newTheme)
        return newTheme
    }

    public func updateCustomTheme(_ theme: ReaderTheme) {
        guard let index = customThemes.firstIndex(where: { $0.id == theme.id }) else { return }
        customThemes[index] = theme
        if !theme.availableFor(colorScheme: "light") && selectedLightThemeId == theme.id {
            selectedLightThemeId = "builtin-light"
        }
        if !theme.availableFor(colorScheme: "dark") && selectedDarkThemeId == theme.id {
            selectedDarkThemeId = "builtin-dark"
        }
        save()
    }

    // Edits to a built-in theme are stored as an override keeping the stock
    // name and appearance, so Reset to Stock can always restore it.
    public func updateBuiltInTheme(_ theme: ReaderTheme) {
        guard let stock = ReaderTheme.allBuiltIn.first(where: { $0.id == theme.id }) else {
            return
        }
        var override = theme
        override.name = stock.name
        override.appearance = stock.appearance
        if let index = builtInThemeOverrides.firstIndex(where: { $0.id == override.id }) {
            builtInThemeOverrides[index] = override
        } else {
            builtInThemeOverrides.append(override)
        }
        save()
    }

    public func resetBuiltInTheme(id: String, for colorScheme: ColorScheme) {
        builtInThemeOverrides.removeAll { $0.id == id }
        save()
        if activeThemeId(for: colorScheme) == id,
            let stock = ReaderTheme.allBuiltIn.first(where: { $0.id == id })
        {
            applyThemeValues(stock)
        }
    }

    public func save() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            try? await persistNow()
            saveTask = nil
        }
    }

    private func persistNow() async throws {
        try await SettingsActor.shared.updateConfig(
            fontSize: fontSize,
            fontFamily: fontFamily,
            lineSpacing: lineSpacing,
            marginLeftRight: marginLeftRight,
            marginTop: marginTop,
            marginBottom: marginBottom,
            wordSpacing: wordSpacing,
            letterSpacing: letterSpacing,
            paragraphSpacing: paragraphSpacing,
            firstLineIndent: firstLineIndent,
            textAlignment: textAlignment,
            highlightColor: .some(highlightColor),
            highlightThickness: highlightThickness,
            backgroundColor: .some(backgroundColor),
            foregroundColor: .some(foregroundColor),
            customCSS: .some(customCSS),
            enableMarginClickNavigation: enableMarginClickNavigation,
            singleColumnMode: singleColumnMode,
            scrollingMode: scrollingMode,
            defaultPlaybackSpeed: defaultPlaybackSpeed,
            defaultVolume: defaultVolume,
            statsExpanded: statsExpanded,
            freeBrowseMode: freeBrowseMode,
            readaloudHighlightVisibility: readaloudHighlightVisibility,
            doubleTapPlay: doubleTapPlay,
            readaloudDimOthers: readaloudDimOthers,
            readaloudDimAmount: readaloudDimAmount,
            readaloudHighlightFade: readaloudHighlightFade,
            readaloudTextItalic: readaloudTextItalic,
            readaloudTextBold: readaloudTextBold,
            readaloudUnderlineStyle: readaloudUnderlineStyle,
            miniPlayerSize: miniPlayerSizeValue,
            miniPlayerLeadingStyle: miniPlayerLeadingStyleValue,
            miniPlayerCycleFirst: miniPlayerCycleFirstValue,
            miniPlayerCycleSecond: miniPlayerCycleSecondValue,
            miniPlayerCycleShowingSecond: miniPlayerCycleShowingSecondValue,
            miniPlayerProgressScope: miniPlayerProgressScopeValue,
            miniPlayerMirrored: miniPlayerMirroredValue,
            miniPlayerContentRowSlots: miniPlayerContentRowSlotsValue,
            miniPlayerStatSlots: miniPlayerStatSlotsValue,
            miniPlayerScrubRowSlots: miniPlayerScrubRowSlotsValue,
            miniPlayerExtraSlots: miniPlayerExtraSlotsValue,
            dockLeadingSlots: dockLeadingSlotsValue,
            dockTrailingSlots: dockTrailingSlotsValue,
            dockCenterSlots: dockCenterSlotsValue,
            menuBarSlots: menuBarSlotsValue,
            enableReadingBar: enableReadingBar,
            showPlayerControls: showPlayerControls,
            showProgressBar: showProgressBar,
            showProgress: showProgressValue,
            showTimeRemainingInBook: showTimeRemainingInBookValue,
            showTimeRemainingInChapter: showTimeRemainingInChapterValue,
            showPageNumber: showPageNumberValue,
            dockTransparency: dockTransparency,
            alwaysShowMiniPlayer: alwaysShowMiniPlayerValue,
            showOverlaySkipBackward: showOverlaySkipBackwardValue,
            showOverlaySkipForward: showOverlaySkipForwardValue,
            showOverlayPlayPause: showOverlayPlayPauseValue,
            showMiniPlayerStats: showMiniPlayerStatsValue,
            progressIndicatorMiniPlayer: progressIndicatorMiniPlayer,
            progressIndicatorDock: progressIndicatorDock,
            progressIndicatorThickness: progressIndicatorThickness,
            progressIndicatorThicknessDock: progressIndicatorThicknessDock,
            progressIndicatorScopeDock: progressIndicatorScopeDock,
            progressSyncIntervalSeconds: progressSyncIntervalSeconds,
            metadataRefreshIntervalSeconds: metadataRefreshIntervalSeconds,
            autoSyncToNewerServerPosition: autoSyncToNewerServerPosition,
            liveReadingSyncEnabled: liveReadingSyncEnabled,
            showAudioIndicator: showAudioIndicator,
            tapToPlayPreferredPlayer: tapToPlayPreferredPlayerValue,
            preferAudioOverEbook: preferAudioOverEbookValue,
            accentColorHex: accentColorHex,
            colorMode: colorMode,
            colorIntensity: colorIntensity,
            doubleCoverAlignment: doubleCoverAlignment,
            experimentalSettings: experimentalSettings,
            userHighlightMode: userHighlightMode,
            readaloudHighlightMode: readaloudHighlightMode,
            tabBarSlot1: tabBarSlot1Value,
            tabBarSlot2: tabBarSlot2Value,
            selectedLightThemeId: selectedLightThemeId,
            selectedDarkThemeId: selectedDarkThemeId,
            customThemes: customThemes,
            builtInThemeOverrides: builtInThemeOverrides,
        )
    }

    #if os(iOS)
    private var alwaysShowMiniPlayerValue: Bool { alwaysShowMiniPlayer }
    private var showProgressValue: Bool { dockLeadingSlots.contains(.statPercent) }
    private var showPageNumberValue: Bool { dockLeadingSlots.contains(.statPage) }
    private var showTimeRemainingInBookValue: Bool {
        dockTrailingSlots.contains(.statTimeInBook)
    }
    private var showTimeRemainingInChapterValue: Bool {
        dockTrailingSlots.contains(.statTimeInChapter)
    }
    private var showOverlaySkipBackwardValue: Bool { dockCenterSlots.contains(.skipBackward) }
    private var showOverlaySkipForwardValue: Bool { dockCenterSlots.contains(.skipForward) }
    private var showOverlayPlayPauseValue: Bool { dockCenterSlots.contains(.playPause) }
    private var showMiniPlayerStatsValue: Bool { miniPlayerStatSlots.hasActiveComplication }
    private var miniPlayerSizeValue: MiniPlayerSize? { miniPlayerSize }
    private var miniPlayerLeadingStyleValue: MiniPlayerLeadingStyle? { miniPlayerLeadingStyle }
    private var miniPlayerCycleFirstValue: MiniPlayerCycleBlock? { miniPlayerCycleFirst }
    private var miniPlayerCycleSecondValue: MiniPlayerCycleBlock? { miniPlayerCycleSecond }
    private var miniPlayerCycleShowingSecondValue: Bool? { miniPlayerCycleShowingSecond }
    private var miniPlayerProgressScopeValue: MiniPlayerProgressScope? { miniPlayerProgressScope }
    private var miniPlayerMirroredValue: Bool? { miniPlayerMirrored }
    private var miniPlayerContentRowSlotsValue: [PlayerComplication]? { miniPlayerContentRowSlots }
    private var miniPlayerStatSlotsValue: [PlayerComplication]? { miniPlayerStatSlots }
    private var miniPlayerScrubRowSlotsValue: [PlayerComplication]? { miniPlayerScrubRowSlots }
    private var miniPlayerExtraSlotsValue: [PlayerComplication]? { miniPlayerExtraSlots }
    private var dockLeadingSlotsValue: [PlayerComplication]? { dockLeadingSlots }
    private var dockTrailingSlotsValue: [PlayerComplication]? { dockTrailingSlots }
    private var dockCenterSlotsValue: [PlayerComplication]? { dockCenterSlots }
    private var menuBarSlotsValue: [PlayerComplication]? { menuBarSlots }
    private var tabBarSlot1Value: String { tabBarSlot1 }
    private var tabBarSlot2Value: String { tabBarSlot2 }
    private var tapToPlayPreferredPlayerValue: Bool { tapToPlayPreferredPlayer }
    private var preferAudioOverEbookValue: Bool { preferAudioOverEbook }
    #else
    private var alwaysShowMiniPlayerValue: Bool { kDefaultAlwaysShowMiniPlayer }
    private var showProgressValue: Bool { showProgress }
    private var showPageNumberValue: Bool { showPageNumber }
    private var showTimeRemainingInBookValue: Bool { showTimeRemainingInBook }
    private var showTimeRemainingInChapterValue: Bool { showTimeRemainingInChapter }
    private var showOverlaySkipBackwardValue: Bool { kDefaultShowOverlaySkipBackward }
    private var showOverlaySkipForwardValue: Bool { kDefaultShowOverlaySkipForward }
    private var showOverlayPlayPauseValue: Bool { kDefaultShowOverlayPlayPause }
    private var showMiniPlayerStatsValue: Bool { kDefaultShowMiniPlayerStats }
    private var miniPlayerSizeValue: MiniPlayerSize? { nil }
    private var miniPlayerLeadingStyleValue: MiniPlayerLeadingStyle? { nil }
    private var miniPlayerCycleFirstValue: MiniPlayerCycleBlock? { nil }
    private var miniPlayerCycleSecondValue: MiniPlayerCycleBlock? { nil }
    private var miniPlayerCycleShowingSecondValue: Bool? { nil }
    private var miniPlayerProgressScopeValue: MiniPlayerProgressScope? { nil }
    private var miniPlayerMirroredValue: Bool? { nil }
    private var miniPlayerContentRowSlotsValue: [PlayerComplication]? { nil }
    private var miniPlayerStatSlotsValue: [PlayerComplication]? { nil }
    private var miniPlayerScrubRowSlotsValue: [PlayerComplication]? { nil }
    private var miniPlayerExtraSlotsValue: [PlayerComplication]? { nil }
    private var dockLeadingSlotsValue: [PlayerComplication]? { nil }
    private var dockTrailingSlotsValue: [PlayerComplication]? { nil }
    private var dockCenterSlotsValue: [PlayerComplication]? { nil }
    private var menuBarSlotsValue: [PlayerComplication]? { nil }
    private var tabBarSlot1Value: String { kDefaultTabBarSlot1 }
    private var tabBarSlot2Value: String { kDefaultTabBarSlot2 }
    private var tapToPlayPreferredPlayerValue: Bool { kDefaultTapToPlayPreferredPlayer }
    private var preferAudioOverEbookValue: Bool { kDefaultPreferAudioOverEbook }
    #endif

    private func uniqueCopyName(for baseName: String, existing: [String]) -> String {
        let candidate = "\(baseName) Copy"
        if !existing.contains(candidate) { return candidate }
        var n = 2
        while existing.contains("\(baseName) Copy \(n)") { n += 1 }
        return "\(baseName) Copy \(n)"
    }
}

extension SettingsViewModel: ReaderSettingsReading {}

extension SettingsViewModel {
    public func pageBackground(for colorScheme: ColorScheme) -> Color {
        if let hex = backgroundColor, let color = Color(hex: hex) {
            return color
        }
        return colorScheme == .dark
            ? Color(hex: kDefaultBackgroundColorDark) ?? .black
            : Color(hex: kDefaultBackgroundColorLight) ?? .white
    }

    public func pageForeground(for colorScheme: ColorScheme) -> Color {
        if let hex = foregroundColor, let color = Color(hex: hex) {
            return color
        }
        return colorScheme == .dark
            ? Color(hex: kDefaultForegroundColorDark) ?? .white
            : Color(hex: kDefaultForegroundColorLight) ?? .black
    }
}

#endif
