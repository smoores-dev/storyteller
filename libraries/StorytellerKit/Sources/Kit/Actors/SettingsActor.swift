import Foundation

public let kDefaultBackgroundColorLight = "#FFFFFF"
public let kDefaultForegroundColorLight = "#000000"
public let kDefaultBackgroundColorDark = "#1A1A1A"
public let kDefaultForegroundColorDark = "#EEEEEE"

public struct StorytellerGlobalConfig: Codable, Equatable, Sendable {
    public var reading: Reading
    public var playback: Playback
    public var readingBar: ReadingBar
    public var sync: Sync
    public var library: Library
    public var themes: Themes

    public init(
        reading: Reading = Reading(),
        playback: Playback = Playback(),
        readingBar: ReadingBar = ReadingBar(),
        sync: Sync = Sync(),
        library: Library = Library(),
        themes: Themes = Themes(),
    ) {
        self.reading = reading
        self.playback = playback
        self.readingBar = readingBar
        self.sync = sync
        self.library = library
        self.themes = themes
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: TopLevelCodingKeys.self)
        reading = (try? container.decode(Reading.self, forKey: .reading)) ?? Reading()
        playback = (try? container.decode(Playback.self, forKey: .playback)) ?? Playback()
        readingBar = (try? container.decode(ReadingBar.self, forKey: .readingBar)) ?? ReadingBar()
        sync = (try? container.decode(Sync.self, forKey: .sync)) ?? Sync()
        library = (try? container.decode(Library.self, forKey: .library)) ?? Library()
        themes = (try? container.decode(Themes.self, forKey: .themes)) ?? Themes()
    }

    private enum TopLevelCodingKeys: String, CodingKey {
        case reading, playback, readingBar, sync, library, themes
    }

    public struct Reading: Codable, Equatable, Sendable {
        public var fontSize: Double
        public var fontFamily: String
        public var lineSpacing: Double
        public var marginLeftRight: Double
        public var marginTopBottom: Double
        public var wordSpacing: Double
        public var letterSpacing: Double
        public var textAlignment: String
        public var highlightColor: String?
        public var highlightThickness: Double
        public var backgroundColor: String?
        public var foregroundColor: String?
        public var customCSS: String?
        public var enableMarginClickNavigation: Bool
        public var singleColumnMode: Bool
        public var scrollingMode: Bool
        public var userHighlightColor1: String
        public var userHighlightColor2: String
        public var userHighlightColor3: String
        public var userHighlightColor4: String
        public var userHighlightColor5: String
        public var userHighlightColor6: String
        public var userHighlightLabel1: String
        public var userHighlightLabel2: String
        public var userHighlightLabel3: String
        public var userHighlightLabel4: String
        public var userHighlightLabel5: String
        public var userHighlightLabel6: String
        public var userHighlightMode: String
        public var readaloudHighlightMode: String
        public var tvSubtitleFontSize: Double
        public var tvReaderAppearance: TVReaderAppearance

        public init(
            fontSize: Double = kDefaultFontSize,
            fontFamily: String = kDefaultFontFamily,
            lineSpacing: Double = kDefaultLineSpacing,
            marginLeftRight: Double? = nil,
            marginTopBottom: Double = kDefaultMarginTopBottom,
            wordSpacing: Double = kDefaultWordSpacing,
            letterSpacing: Double = kDefaultLetterSpacing,
            textAlignment: String = kDefaultTextAlignment,
            highlightColor: String? = nil,
            highlightThickness: Double = kDefaultHighlightThickness,
            backgroundColor: String? = nil,
            foregroundColor: String? = nil,
            customCSS: String? = nil,
            enableMarginClickNavigation: Bool = kDefaultEnableMarginClickNavigation,
            singleColumnMode: Bool? = nil,
            scrollingMode: Bool = kDefaultScrollingMode,
            userHighlightColor1: String = kDefaultUserHighlightColor1,
            userHighlightColor2: String = kDefaultUserHighlightColor2,
            userHighlightColor3: String = kDefaultUserHighlightColor3,
            userHighlightColor4: String = kDefaultUserHighlightColor4,
            userHighlightColor5: String = kDefaultUserHighlightColor5,
            userHighlightColor6: String = kDefaultUserHighlightColor6,
            userHighlightLabel1: String = kDefaultUserHighlightLabel1,
            userHighlightLabel2: String = kDefaultUserHighlightLabel2,
            userHighlightLabel3: String = kDefaultUserHighlightLabel3,
            userHighlightLabel4: String = kDefaultUserHighlightLabel4,
            userHighlightLabel5: String = kDefaultUserHighlightLabel5,
            userHighlightLabel6: String = kDefaultUserHighlightLabel6,
            userHighlightMode: String = kDefaultUserHighlightMode,
            readaloudHighlightMode: String = kDefaultReadaloudHighlightMode,
            tvSubtitleFontSize: Double = kDefaultTVSubtitleFontSize,
            tvReaderAppearance: TVReaderAppearance = TVReaderAppearance(),
        ) {
            self.fontSize = fontSize
            self.fontFamily = fontFamily
            self.lineSpacing = lineSpacing
            #if os(iOS)
            self.marginLeftRight = marginLeftRight ?? kDefaultMarginLeftRightIOS
            #else
            self.marginLeftRight = marginLeftRight ?? kDefaultMarginLeftRightMac
            #endif
            self.marginTopBottom = marginTopBottom
            self.wordSpacing = wordSpacing
            self.letterSpacing = letterSpacing
            self.textAlignment = Self.normalizedTextAlignment(textAlignment)
            self.highlightColor = highlightColor
            self.highlightThickness = highlightThickness
            self.backgroundColor = backgroundColor
            self.foregroundColor = foregroundColor
            self.singleColumnMode = singleColumnMode ?? kDefaultSingleColumnMode
            self.customCSS = customCSS
            self.enableMarginClickNavigation = enableMarginClickNavigation
            self.scrollingMode = scrollingMode
            self.userHighlightColor1 = userHighlightColor1
            self.userHighlightColor2 = userHighlightColor2
            self.userHighlightColor3 = userHighlightColor3
            self.userHighlightColor4 = userHighlightColor4
            self.userHighlightColor5 = userHighlightColor5
            self.userHighlightColor6 = userHighlightColor6
            self.userHighlightLabel1 = userHighlightLabel1
            self.userHighlightLabel2 = userHighlightLabel2
            self.userHighlightLabel3 = userHighlightLabel3
            self.userHighlightLabel4 = userHighlightLabel4
            self.userHighlightLabel5 = userHighlightLabel5
            self.userHighlightLabel6 = userHighlightLabel6
            self.userHighlightMode = userHighlightMode
            self.readaloudHighlightMode = readaloudHighlightMode
            self.tvSubtitleFontSize = tvSubtitleFontSize
            self.tvReaderAppearance = tvReaderAppearance
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            let legacyContainer = try? decoder.container(keyedBy: LegacyCodingKeys.self)
            fontSize = (try? container?.decode(Double.self, forKey: .fontSize)) ?? kDefaultFontSize
            fontFamily =
                (try? container?.decode(String.self, forKey: .fontFamily)) ?? kDefaultFontFamily
            lineSpacing =
                (try? container?.decode(Double.self, forKey: .lineSpacing)) ?? kDefaultLineSpacing
            #if os(iOS)
            marginLeftRight =
                (try? container?.decode(Double.self, forKey: .marginLeftRight))
                ?? kDefaultMarginLeftRightIOS
            #else
            marginLeftRight =
                (try? container?.decode(Double.self, forKey: .marginLeftRight))
                ?? kDefaultMarginLeftRightMac
            #endif
            marginTopBottom =
                (try? container?.decode(Double.self, forKey: .marginTopBottom))
                ?? kDefaultMarginTopBottom
            wordSpacing =
                (try? container?.decode(Double.self, forKey: .wordSpacing)) ?? kDefaultWordSpacing
            letterSpacing =
                (try? container?.decode(Double.self, forKey: .letterSpacing))
                ?? kDefaultLetterSpacing
            if let storedAlignment = try? container?.decode(String.self, forKey: .textAlignment) {
                textAlignment = Self.normalizedTextAlignment(storedAlignment)
            } else if let legacyJustify = try? legacyContainer?.decode(
                Bool.self,
                forKey: .justifyText,
            ) {
                textAlignment = legacyJustify ? "justify" : "left"
            } else {
                textAlignment = kDefaultTextAlignment
            }
            highlightColor = try? container?.decode(String.self, forKey: .highlightColor)
            highlightThickness =
                (try? container?.decode(Double.self, forKey: .highlightThickness))
                ?? kDefaultHighlightThickness
            backgroundColor = try? container?.decode(String.self, forKey: .backgroundColor)
            foregroundColor = try? container?.decode(String.self, forKey: .foregroundColor)
            customCSS = try? container?.decode(String.self, forKey: .customCSS)
            enableMarginClickNavigation =
                (try? container?.decode(Bool.self, forKey: .enableMarginClickNavigation))
                ?? kDefaultEnableMarginClickNavigation
            singleColumnMode =
                (try? container?.decode(Bool.self, forKey: .singleColumnMode))
                ?? kDefaultSingleColumnMode
            scrollingMode =
                (try? container?.decode(Bool.self, forKey: .scrollingMode))
                ?? (try? legacyContainer?.decode(Bool.self, forKey: .readaloudScrollingMode))
                ?? kDefaultScrollingMode
            userHighlightColor1 =
                (try? container?.decode(String.self, forKey: .userHighlightColor1))
                ?? kDefaultUserHighlightColor1
            userHighlightColor2 =
                (try? container?.decode(String.self, forKey: .userHighlightColor2))
                ?? kDefaultUserHighlightColor2
            userHighlightColor3 =
                (try? container?.decode(String.self, forKey: .userHighlightColor3))
                ?? kDefaultUserHighlightColor3
            userHighlightColor4 =
                (try? container?.decode(String.self, forKey: .userHighlightColor4))
                ?? kDefaultUserHighlightColor4
            userHighlightColor5 =
                (try? container?.decode(String.self, forKey: .userHighlightColor5))
                ?? kDefaultUserHighlightColor5
            userHighlightColor6 =
                (try? container?.decode(String.self, forKey: .userHighlightColor6))
                ?? kDefaultUserHighlightColor6
            userHighlightLabel1 =
                (try? container?.decode(String.self, forKey: .userHighlightLabel1))
                ?? kDefaultUserHighlightLabel1
            userHighlightLabel2 =
                (try? container?.decode(String.self, forKey: .userHighlightLabel2))
                ?? kDefaultUserHighlightLabel2
            userHighlightLabel3 =
                (try? container?.decode(String.self, forKey: .userHighlightLabel3))
                ?? kDefaultUserHighlightLabel3
            userHighlightLabel4 =
                (try? container?.decode(String.self, forKey: .userHighlightLabel4))
                ?? kDefaultUserHighlightLabel4
            userHighlightLabel5 =
                (try? container?.decode(String.self, forKey: .userHighlightLabel5))
                ?? kDefaultUserHighlightLabel5
            userHighlightLabel6 =
                (try? container?.decode(String.self, forKey: .userHighlightLabel6))
                ?? kDefaultUserHighlightLabel6
            userHighlightMode =
                (try? container?.decode(String.self, forKey: .userHighlightMode))
                ?? kDefaultUserHighlightMode

            // Migrate from old readaloudHighlightUnderline boolean to new mode value
            let legacyUnderline =
                (try? legacyContainer?.decode(Bool.self, forKey: .readaloudHighlightUnderline))
                ?? false
            let storedMode =
                (try? container?.decode(String.self, forKey: .readaloudHighlightMode))
                ?? kDefaultReadaloudHighlightMode
            if legacyUnderline && storedMode == "background" {
                readaloudHighlightMode = "underline"
            } else {
                readaloudHighlightMode = storedMode
            }
            tvSubtitleFontSize =
                (try? container?.decode(Double.self, forKey: .tvSubtitleFontSize))
                ?? kDefaultTVSubtitleFontSize
            tvReaderAppearance =
                (try? container?.decode(TVReaderAppearance.self, forKey: .tvReaderAppearance))
                ?? TVReaderAppearance(
                    backgroundStyle: (try? legacyContainer?.decode(
                        String.self,
                        forKey: .tvBackgroundStyle,
                    ))
                        ?? kDefaultTVBackgroundStyle
                )
        }

        private enum CodingKeys: String, CodingKey {
            case fontSize, fontFamily, lineSpacing, marginLeftRight, marginTopBottom
            case wordSpacing, letterSpacing, textAlignment, highlightColor, highlightThickness
            case backgroundColor, foregroundColor
            case customCSS, enableMarginClickNavigation, singleColumnMode
            case scrollingMode
            case userHighlightColor1, userHighlightColor2, userHighlightColor3
            case userHighlightColor4, userHighlightColor5, userHighlightColor6
            case userHighlightLabel1, userHighlightLabel2, userHighlightLabel3
            case userHighlightLabel4, userHighlightLabel5, userHighlightLabel6
            case userHighlightMode, readaloudHighlightMode, tvSubtitleFontSize
            case tvReaderAppearance
        }

        private enum LegacyCodingKeys: String, CodingKey {
            case readaloudHighlightUnderline, tvBackgroundStyle, readaloudScrollingMode
            case justifyText
        }

        static func normalizedTextAlignment(_ value: String) -> String {
            kTextAlignmentValues.contains(value) ? value : kDefaultTextAlignment
        }

        public struct TVReaderAppearance: Codable, Equatable, Sendable {
            public var fontFamily: String
            public var backgroundStyle: String
            public var activeSentenceStyle: String
            public var highlightColor: String
            public var inactiveTextIntensity: String
            public var textWidth: String
            public var lineSpacing: String
            public var textAlignment: String
            public var scrollMode: String

            public init(
                fontFamily: String = kDefaultTVFontFamily,
                backgroundStyle: String = kDefaultTVBackgroundStyle,
                activeSentenceStyle: String = kDefaultTVActiveSentenceStyle,
                highlightColor: String = kDefaultTVHighlightColor,
                inactiveTextIntensity: String = kDefaultTVInactiveTextIntensity,
                textWidth: String = kDefaultTVTextWidth,
                lineSpacing: String = kDefaultTVLineSpacing,
                textAlignment: String = kDefaultTVTextAlignment,
                scrollMode: String = kDefaultTVScrollMode,
            ) {
                self.fontFamily = fontFamily
                self.backgroundStyle = Self.normalizedBackgroundStyle(backgroundStyle)
                self.activeSentenceStyle = Self.normalizedActiveSentenceStyle(activeSentenceStyle)
                self.highlightColor = highlightColor
                self.inactiveTextIntensity = inactiveTextIntensity
                self.textWidth = textWidth
                self.lineSpacing = lineSpacing
                self.textAlignment = textAlignment
                self.scrollMode = scrollMode
            }

            public init(from decoder: Decoder) throws {
                let container = try? decoder.container(keyedBy: CodingKeys.self)
                fontFamily =
                    (try? container?.decode(String.self, forKey: .fontFamily))
                    ?? kDefaultTVFontFamily
                backgroundStyle =
                    Self.normalizedBackgroundStyle(
                        (try? container?.decode(String.self, forKey: .backgroundStyle))
                            ?? kDefaultTVBackgroundStyle
                    )
                activeSentenceStyle =
                    Self.normalizedActiveSentenceStyle(
                        (try? container?.decode(String.self, forKey: .activeSentenceStyle))
                            ?? kDefaultTVActiveSentenceStyle
                    )
                highlightColor =
                    (try? container?.decode(String.self, forKey: .highlightColor))
                    ?? kDefaultTVHighlightColor
                inactiveTextIntensity =
                    (try? container?.decode(String.self, forKey: .inactiveTextIntensity))
                    ?? kDefaultTVInactiveTextIntensity
                textWidth =
                    (try? container?.decode(String.self, forKey: .textWidth))
                    ?? kDefaultTVTextWidth
                lineSpacing =
                    (try? container?.decode(String.self, forKey: .lineSpacing))
                    ?? kDefaultTVLineSpacing
                textAlignment =
                    (try? container?.decode(String.self, forKey: .textAlignment))
                    ?? kDefaultTVTextAlignment
                scrollMode =
                    (try? container?.decode(String.self, forKey: .scrollMode))
                    ?? kDefaultTVScrollMode
            }

            private enum CodingKeys: String, CodingKey {
                case fontFamily, backgroundStyle, activeSentenceStyle, highlightColor
                case inactiveTextIntensity, textWidth, lineSpacing, textAlignment
                case scrollMode
            }

            private static func normalizedBackgroundStyle(_ value: String) -> String {
                switch value {
                    case "black", "oledBlack":
                        return "highContrast"
                    default:
                        return value
                }
            }

            private static func normalizedActiveSentenceStyle(_ value: String) -> String {
                value == "brightText" ? "whiteText" : value
            }
        }
    }

    public struct Playback: Codable, Equatable, Sendable {
        public var defaultPlaybackSpeed: Double
        public var defaultVolume: Double
        public var statsExpanded: Bool
        public var lockViewToAudio: Bool

        public init(
            defaultPlaybackSpeed: Double = kDefaultPlaybackSpeed,
            defaultVolume: Double = kDefaultVolume,
            statsExpanded: Bool = kDefaultStatsExpanded,
            lockViewToAudio: Bool = kDefaultLockViewToAudio,
        ) {
            self.defaultPlaybackSpeed = defaultPlaybackSpeed
            self.defaultVolume = defaultVolume
            self.statsExpanded = statsExpanded
            self.lockViewToAudio = lockViewToAudio
        }
    }

    public struct ReadingBar: Codable, Equatable, Sendable {
        public var enabled: Bool
        public var showPlayerControls: Bool
        public var showProgressBar: Bool
        public var showProgress: Bool
        public var showTimeRemainingInBook: Bool
        public var showTimeRemainingInChapter: Bool
        public var showPageNumber: Bool
        public var overlayTransparency: Double
        public var alwaysShowMiniPlayer: Bool
        public var showOverlaySkipBackward: Bool
        public var showOverlaySkipForward: Bool
        public var showOverlayPlayPause: Bool
        public var showMiniPlayerStats: Bool

        public init(
            enabled: Bool = kDefaultReadingBarEnabled,
            showPlayerControls: Bool? = nil,
            showProgressBar: Bool = kDefaultShowProgressBar,
            showProgress: Bool = kDefaultShowProgress,
            showTimeRemainingInBook: Bool = kDefaultShowTimeRemainingInBook,
            showTimeRemainingInChapter: Bool = kDefaultShowTimeRemainingInChapter,
            showPageNumber: Bool = kDefaultShowPageNumber,
            overlayTransparency: Double = kDefaultOverlayTransparency,
            alwaysShowMiniPlayer: Bool = kDefaultAlwaysShowMiniPlayer,
            showOverlaySkipBackward: Bool = kDefaultShowOverlaySkipBackward,
            showOverlaySkipForward: Bool = kDefaultShowOverlaySkipForward,
            showOverlayPlayPause: Bool = kDefaultShowOverlayPlayPause,
            showMiniPlayerStats: Bool = kDefaultShowMiniPlayerStats,
        ) {
            self.enabled = enabled
            #if os(iOS)
            self.showPlayerControls = showPlayerControls ?? kDefaultShowPlayerControlsIOS
            #else
            self.showPlayerControls = showPlayerControls ?? kDefaultShowPlayerControlsMac
            #endif
            self.showProgressBar = showProgressBar
            self.showProgress = showProgress
            self.showTimeRemainingInBook = showTimeRemainingInBook
            self.showTimeRemainingInChapter = showTimeRemainingInChapter
            self.showPageNumber = showPageNumber
            self.overlayTransparency = overlayTransparency
            self.alwaysShowMiniPlayer = alwaysShowMiniPlayer
            self.showOverlaySkipBackward = showOverlaySkipBackward
            self.showOverlaySkipForward = showOverlaySkipForward
            self.showOverlayPlayPause = showOverlayPlayPause
            self.showMiniPlayerStats = showMiniPlayerStats
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            enabled =
                (try? container?.decode(Bool.self, forKey: .enabled)) ?? kDefaultReadingBarEnabled
            #if os(iOS)
            showPlayerControls =
                (try? container?.decode(Bool.self, forKey: .showPlayerControls))
                ?? kDefaultShowPlayerControlsIOS
            #else
            showPlayerControls =
                (try? container?.decode(Bool.self, forKey: .showPlayerControls))
                ?? kDefaultShowPlayerControlsMac
            #endif
            showProgressBar =
                (try? container?.decode(Bool.self, forKey: .showProgressBar))
                ?? kDefaultShowProgressBar
            showProgress =
                (try? container?.decode(Bool.self, forKey: .showProgress)) ?? kDefaultShowProgress
            showTimeRemainingInBook =
                (try? container?.decode(Bool.self, forKey: .showTimeRemainingInBook))
                ?? kDefaultShowTimeRemainingInBook
            showTimeRemainingInChapter =
                (try? container?.decode(Bool.self, forKey: .showTimeRemainingInChapter))
                ?? kDefaultShowTimeRemainingInChapter
            showPageNumber =
                (try? container?.decode(Bool.self, forKey: .showPageNumber))
                ?? kDefaultShowPageNumber
            overlayTransparency =
                (try? container?.decode(Double.self, forKey: .overlayTransparency))
                ?? kDefaultOverlayTransparency
            alwaysShowMiniPlayer =
                (try? container?.decode(Bool.self, forKey: .alwaysShowMiniPlayer))
                ?? kDefaultAlwaysShowMiniPlayer
            showOverlaySkipBackward =
                (try? container?.decode(Bool.self, forKey: .showOverlaySkipBackward))
                ?? kDefaultShowOverlaySkipBackward
            showOverlaySkipForward =
                (try? container?.decode(Bool.self, forKey: .showOverlaySkipForward))
                ?? kDefaultShowOverlaySkipForward
            showOverlayPlayPause =
                (try? container?.decode(Bool.self, forKey: .showOverlayPlayPause))
                ?? kDefaultShowOverlayPlayPause
            showMiniPlayerStats =
                (try? container?.decode(Bool.self, forKey: .showMiniPlayerStats))
                ?? kDefaultShowMiniPlayerStats
        }

        private enum CodingKeys: String, CodingKey {
            case enabled, showPlayerControls, showProgressBar, showProgress
            case showTimeRemainingInBook, showTimeRemainingInChapter, showPageNumber
            case overlayTransparency, alwaysShowMiniPlayer
            case showOverlaySkipBackward, showOverlaySkipForward, showOverlayPlayPause
            case showMiniPlayerStats
        }
    }

    public struct Sync: Codable, Equatable, Sendable {
        public var progressSyncIntervalSeconds: Double
        public var metadataRefreshIntervalSeconds: Double
        public var autoSyncToNewerServerPosition: Bool
        public var liveReadingSyncEnabled: Bool

        public init(
            progressSyncIntervalSeconds: Double = kDefaultProgressSyncIntervalSeconds,
            metadataRefreshIntervalSeconds: Double = kDefaultMetadataRefreshIntervalSeconds,
            autoSyncToNewerServerPosition: Bool = kDefaultAutoSyncToNewerServerPosition,
            liveReadingSyncEnabled: Bool = kDefaultLiveReadingSyncEnabled,
        ) {
            self.progressSyncIntervalSeconds = progressSyncIntervalSeconds
            self.metadataRefreshIntervalSeconds = metadataRefreshIntervalSeconds
            self.autoSyncToNewerServerPosition = autoSyncToNewerServerPosition
            self.liveReadingSyncEnabled = liveReadingSyncEnabled
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            progressSyncIntervalSeconds =
                (try? container?.decode(Double.self, forKey: .progressSyncIntervalSeconds))
                ?? kDefaultProgressSyncIntervalSeconds
            metadataRefreshIntervalSeconds =
                (try? container?.decode(Double.self, forKey: .metadataRefreshIntervalSeconds))
                ?? kDefaultMetadataRefreshIntervalSeconds
            autoSyncToNewerServerPosition =
                (try? container?.decode(Bool.self, forKey: .autoSyncToNewerServerPosition))
                ?? kDefaultAutoSyncToNewerServerPosition
            liveReadingSyncEnabled =
                (try? container?.decode(Bool.self, forKey: .liveReadingSyncEnabled))
                ?? kDefaultLiveReadingSyncEnabled
        }

        private enum CodingKeys: String, CodingKey {
            case progressSyncIntervalSeconds, metadataRefreshIntervalSeconds
            case autoSyncToNewerServerPosition, liveReadingSyncEnabled
        }

        public var isMetadataRefreshDisabled: Bool {
            metadataRefreshIntervalSeconds < 0
        }
    }

    public struct Themes: Codable, Equatable, Sendable {
        public var selectedLightThemeId: String
        public var selectedDarkThemeId: String
        public var customThemes: [ReaderTheme]
        public var builtInThemeOverrides: [ReaderTheme]

        public init(
            selectedLightThemeId: String = "builtin-light",
            selectedDarkThemeId: String = "builtin-dark",
            customThemes: [ReaderTheme] = [],
            builtInThemeOverrides: [ReaderTheme] = [],
        ) {
            self.selectedLightThemeId = selectedLightThemeId
            self.selectedDarkThemeId = selectedDarkThemeId
            self.customThemes = customThemes
            self.builtInThemeOverrides = builtInThemeOverrides
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            let rawLightId =
                (try? container?.decode(String.self, forKey: .selectedLightThemeId))
                ?? "builtin-light"
            selectedLightThemeId = ReaderTheme.migrateThemeId(rawLightId)
            let rawDarkId =
                (try? container?.decode(String.self, forKey: .selectedDarkThemeId))
                ?? "builtin-dark"
            selectedDarkThemeId = ReaderTheme.migrateThemeId(rawDarkId)
            customThemes =
                (try? container?.decode([ReaderTheme].self, forKey: .customThemes))
                ?? []
            builtInThemeOverrides =
                (try? container?.decode([ReaderTheme].self, forKey: .builtInThemeOverrides))
                ?? []
        }

        private enum CodingKeys: String, CodingKey {
            case selectedLightThemeId, selectedDarkThemeId, customThemes
            case builtInThemeOverrides
        }
    }

    public struct Library: Codable, Equatable, Sendable {
        public var showAudioIndicator: Bool
        public var tabBarSlot1: String
        public var tabBarSlot2: String
        public var tapToPlayPreferredPlayer: Bool
        public var preferAudioOverEbook: Bool
        public var accentColorHex: String
        public var colorMode: String
        public var colorIntensity: Double
        public var doubleCoverAlignment: String

        public init(
            showAudioIndicator: Bool = kDefaultShowAudioIndicator,
            tabBarSlot1: String = kDefaultTabBarSlot1,
            tabBarSlot2: String = kDefaultTabBarSlot2,
            tapToPlayPreferredPlayer: Bool = kDefaultTapToPlayPreferredPlayer,
            preferAudioOverEbook: Bool = kDefaultPreferAudioOverEbook,
            accentColorHex: String = kDefaultAccentColorHex,
            colorMode: String = kDefaultColorMode,
            colorIntensity: Double = kDefaultColorIntensity,
            doubleCoverAlignment: String = kDefaultDoubleCoverAlignment,
        ) {
            self.showAudioIndicator = showAudioIndicator
            self.tabBarSlot1 = tabBarSlot1
            self.tabBarSlot2 = tabBarSlot2
            self.tapToPlayPreferredPlayer = tapToPlayPreferredPlayer
            self.preferAudioOverEbook = preferAudioOverEbook
            self.accentColorHex = accentColorHex
            self.colorMode = colorMode
            self.colorIntensity = colorIntensity
            self.doubleCoverAlignment = doubleCoverAlignment
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            showAudioIndicator =
                (try? container?.decode(Bool.self, forKey: .showAudioIndicator))
                ?? kDefaultShowAudioIndicator
            tabBarSlot1 =
                (try? container?.decode(String.self, forKey: .tabBarSlot1)) ?? kDefaultTabBarSlot1
            tabBarSlot2 =
                (try? container?.decode(String.self, forKey: .tabBarSlot2)) ?? kDefaultTabBarSlot2
            tapToPlayPreferredPlayer =
                (try? container?.decode(Bool.self, forKey: .tapToPlayPreferredPlayer))
                ?? kDefaultTapToPlayPreferredPlayer
            preferAudioOverEbook =
                (try? container?.decode(Bool.self, forKey: .preferAudioOverEbook))
                ?? kDefaultPreferAudioOverEbook
            accentColorHex =
                (try? container?.decode(String.self, forKey: .accentColorHex))
                ?? kDefaultAccentColorHex
            colorMode =
                (try? container?.decode(String.self, forKey: .colorMode)) ?? kDefaultColorMode
            colorIntensity =
                (try? container?.decode(Double.self, forKey: .colorIntensity))
                ?? kDefaultColorIntensity
            doubleCoverAlignment =
                (try? container?.decode(String.self, forKey: .doubleCoverAlignment))
                ?? kDefaultDoubleCoverAlignment
        }

        private enum CodingKeys: String, CodingKey {
            case showAudioIndicator, tabBarSlot1, tabBarSlot2, tapToPlayPreferredPlayer,
                preferAudioOverEbook, accentColorHex, colorMode, colorIntensity,
                doubleCoverAlignment
        }
    }
}

@globalActor
public actor SettingsActor {
    public static let shared = SettingsActor()

    private(set) public var config: StorytellerGlobalConfig
    private var observers: [UUID: @Sendable @StorytellerUIActor () -> Void] = [:]

    private let fileManager: FileManager
    private let storageURL: URL

    public init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        let resolvedURL = Self.defaultStorageURL(fileManager: fileManager)
        storageURL = resolvedURL

        do {
            try Self.ensureStorageDirectory(for: resolvedURL, using: fileManager)
            config = try Self.loadConfig(from: resolvedURL, fileManager: fileManager)
            #if os(iOS)
            config.readingBar.showPlayerControls = true
            #endif
        } catch {
            config = StorytellerGlobalConfig()
            try? Self.save(config: config, to: resolvedURL, fileManager: fileManager)
        }
    }

    @discardableResult
    public func request_notify(callback: @Sendable @StorytellerUIActor @escaping () -> Void) -> UUID {
        let id = UUID()
        observers[id] = callback
        return id
    }

    public func removeObserver(id: UUID) {
        observers.removeValue(forKey: id)
    }

    public func updateConfig(
        fontSize: Double? = nil,
        fontFamily: String? = nil,
        lineSpacing: Double? = nil,
        marginLeftRight: Double? = nil,
        marginTopBottom: Double? = nil,
        wordSpacing: Double? = nil,
        letterSpacing: Double? = nil,
        textAlignment: String? = nil,
        highlightColor: String?? = nil,
        highlightThickness: Double? = nil,
        backgroundColor: String?? = nil,
        foregroundColor: String?? = nil,
        customCSS: String?? = nil,
        enableMarginClickNavigation: Bool? = nil,
        singleColumnMode: Bool? = nil,
        scrollingMode: Bool? = nil,
        defaultPlaybackSpeed: Double? = nil,
        defaultVolume: Double? = nil,
        statsExpanded: Bool? = nil,
        lockViewToAudio: Bool? = nil,
        enableReadingBar: Bool? = nil,
        showPlayerControls: Bool? = nil,
        showProgressBar: Bool? = nil,
        showProgress: Bool? = nil,
        showTimeRemainingInBook: Bool? = nil,
        showTimeRemainingInChapter: Bool? = nil,
        showPageNumber: Bool? = nil,
        overlayTransparency: Double? = nil,
        alwaysShowMiniPlayer: Bool? = nil,
        showOverlaySkipBackward: Bool? = nil,
        showOverlaySkipForward: Bool? = nil,
        showOverlayPlayPause: Bool? = nil,
        showMiniPlayerStats: Bool? = nil,
        progressSyncIntervalSeconds: Double? = nil,
        metadataRefreshIntervalSeconds: Double? = nil,
        autoSyncToNewerServerPosition: Bool? = nil,
        liveReadingSyncEnabled: Bool? = nil,
        showAudioIndicator: Bool? = nil,
        tapToPlayPreferredPlayer: Bool? = nil,
        preferAudioOverEbook: Bool? = nil,
        accentColorHex: String? = nil,
        colorMode: String? = nil,
        colorIntensity: Double? = nil,
        doubleCoverAlignment: String? = nil,
        userHighlightColor1: String? = nil,
        userHighlightColor2: String? = nil,
        userHighlightColor3: String? = nil,
        userHighlightColor4: String? = nil,
        userHighlightColor5: String? = nil,
        userHighlightColor6: String? = nil,
        userHighlightLabel1: String? = nil,
        userHighlightLabel2: String? = nil,
        userHighlightLabel3: String? = nil,
        userHighlightLabel4: String? = nil,
        userHighlightLabel5: String? = nil,
        userHighlightLabel6: String? = nil,
        userHighlightMode: String? = nil,
        readaloudHighlightMode: String? = nil,
        tabBarSlot1: String? = nil,
        tabBarSlot2: String? = nil,
        tvSubtitleFontSize: Double? = nil,
        tvReaderAppearance: StorytellerGlobalConfig.Reading.TVReaderAppearance? = nil,
        tvBackgroundStyle: String? = nil,
        selectedLightThemeId: String? = nil,
        selectedDarkThemeId: String? = nil,
        customThemes: [ReaderTheme]? = nil,
        builtInThemeOverrides: [ReaderTheme]? = nil,
    ) throws {
        var updated = config

        if let fontSize { updated.reading.fontSize = fontSize }
        if let fontFamily { updated.reading.fontFamily = fontFamily }
        if let lineSpacing { updated.reading.lineSpacing = lineSpacing }
        if let marginLeftRight { updated.reading.marginLeftRight = marginLeftRight }
        if let marginTopBottom { updated.reading.marginTopBottom = marginTopBottom }
        if let wordSpacing { updated.reading.wordSpacing = wordSpacing }
        if let letterSpacing { updated.reading.letterSpacing = letterSpacing }
        if let textAlignment {
            updated.reading.textAlignment = StorytellerGlobalConfig.Reading.normalizedTextAlignment(
                textAlignment
            )
        }
        if let highlightColor { updated.reading.highlightColor = highlightColor }
        if let highlightThickness { updated.reading.highlightThickness = highlightThickness }
        if let backgroundColor { updated.reading.backgroundColor = backgroundColor }
        if let foregroundColor { updated.reading.foregroundColor = foregroundColor }
        if let customCSS { updated.reading.customCSS = customCSS }
        if let enableMarginClickNavigation {
            updated.reading.enableMarginClickNavigation = enableMarginClickNavigation
        }
        if let singleColumnMode { updated.reading.singleColumnMode = singleColumnMode }
        if let scrollingMode {
            updated.reading.scrollingMode = scrollingMode
        }
        if let defaultPlaybackSpeed { updated.playback.defaultPlaybackSpeed = defaultPlaybackSpeed }
        if let defaultVolume { updated.playback.defaultVolume = defaultVolume }
        if let statsExpanded { updated.playback.statsExpanded = statsExpanded }
        if let lockViewToAudio { updated.playback.lockViewToAudio = lockViewToAudio }
        if let enableReadingBar { updated.readingBar.enabled = enableReadingBar }
        if let showPlayerControls { updated.readingBar.showPlayerControls = showPlayerControls }
        if let showProgressBar { updated.readingBar.showProgressBar = showProgressBar }
        if let showProgress { updated.readingBar.showProgress = showProgress }
        if let showTimeRemainingInBook {
            updated.readingBar.showTimeRemainingInBook = showTimeRemainingInBook
        }
        if let showTimeRemainingInChapter {
            updated.readingBar.showTimeRemainingInChapter = showTimeRemainingInChapter
        }
        if let showPageNumber { updated.readingBar.showPageNumber = showPageNumber }
        if let overlayTransparency { updated.readingBar.overlayTransparency = overlayTransparency }
        if let alwaysShowMiniPlayer {
            updated.readingBar.alwaysShowMiniPlayer = alwaysShowMiniPlayer
        }
        if let showOverlaySkipBackward {
            updated.readingBar.showOverlaySkipBackward = showOverlaySkipBackward
        }
        if let showOverlaySkipForward {
            updated.readingBar.showOverlaySkipForward = showOverlaySkipForward
        }
        if let showOverlayPlayPause {
            updated.readingBar.showOverlayPlayPause = showOverlayPlayPause
        }
        if let showMiniPlayerStats {
            updated.readingBar.showMiniPlayerStats = showMiniPlayerStats
        }
        if let progressSyncIntervalSeconds {
            debugLog(
                "[SettingsActor] Updating progressSyncIntervalSeconds to \(progressSyncIntervalSeconds)s"
            )
            updated.sync.progressSyncIntervalSeconds = progressSyncIntervalSeconds
        }
        if let metadataRefreshIntervalSeconds {
            debugLog(
                "[SettingsActor] Updating metadataRefreshIntervalSeconds to \(metadataRefreshIntervalSeconds)s"
            )
            updated.sync.metadataRefreshIntervalSeconds = metadataRefreshIntervalSeconds
        }
        if let autoSyncToNewerServerPosition {
            updated.sync.autoSyncToNewerServerPosition = autoSyncToNewerServerPosition
        }
        if let liveReadingSyncEnabled {
            updated.sync.liveReadingSyncEnabled = liveReadingSyncEnabled
        }
        if let showAudioIndicator {
            updated.library.showAudioIndicator = showAudioIndicator
        }
        if let tapToPlayPreferredPlayer {
            updated.library.tapToPlayPreferredPlayer = tapToPlayPreferredPlayer
        }
        if let preferAudioOverEbook {
            updated.library.preferAudioOverEbook = preferAudioOverEbook
        }
        if let accentColorHex {
            updated.library.accentColorHex = accentColorHex
        }
        if let colorMode {
            updated.library.colorMode = colorMode
        }
        if let colorIntensity {
            updated.library.colorIntensity = colorIntensity
        }
        if let doubleCoverAlignment {
            updated.library.doubleCoverAlignment = doubleCoverAlignment
        }
        if let tabBarSlot1 {
            updated.library.tabBarSlot1 = tabBarSlot1
        }
        if let tabBarSlot2 {
            updated.library.tabBarSlot2 = tabBarSlot2
        }
        if let userHighlightColor1 {
            updated.reading.userHighlightColor1 = userHighlightColor1
        }
        if let userHighlightColor2 {
            updated.reading.userHighlightColor2 = userHighlightColor2
        }
        if let userHighlightColor3 {
            updated.reading.userHighlightColor3 = userHighlightColor3
        }
        if let userHighlightColor4 {
            updated.reading.userHighlightColor4 = userHighlightColor4
        }
        if let userHighlightColor5 {
            updated.reading.userHighlightColor5 = userHighlightColor5
        }
        if let userHighlightColor6 {
            updated.reading.userHighlightColor6 = userHighlightColor6
        }
        if let userHighlightLabel1 {
            updated.reading.userHighlightLabel1 = userHighlightLabel1
        }
        if let userHighlightLabel2 {
            updated.reading.userHighlightLabel2 = userHighlightLabel2
        }
        if let userHighlightLabel3 {
            updated.reading.userHighlightLabel3 = userHighlightLabel3
        }
        if let userHighlightLabel4 {
            updated.reading.userHighlightLabel4 = userHighlightLabel4
        }
        if let userHighlightLabel5 {
            updated.reading.userHighlightLabel5 = userHighlightLabel5
        }
        if let userHighlightLabel6 {
            updated.reading.userHighlightLabel6 = userHighlightLabel6
        }
        if let userHighlightMode {
            updated.reading.userHighlightMode = userHighlightMode
        }
        if let readaloudHighlightMode {
            updated.reading.readaloudHighlightMode = readaloudHighlightMode
        }
        if let tvSubtitleFontSize {
            updated.reading.tvSubtitleFontSize = tvSubtitleFontSize
        }
        if let tvReaderAppearance {
            updated.reading.tvReaderAppearance = tvReaderAppearance
        }
        if let tvBackgroundStyle {
            updated.reading.tvReaderAppearance.backgroundStyle = tvBackgroundStyle
        }
        if let selectedLightThemeId {
            updated.themes.selectedLightThemeId = selectedLightThemeId
        }
        if let selectedDarkThemeId {
            updated.themes.selectedDarkThemeId = selectedDarkThemeId
        }
        if let customThemes {
            updated.themes.customThemes = customThemes
        }
        if let builtInThemeOverrides {
            updated.themes.builtInThemeOverrides = builtInThemeOverrides
        }

        #if os(iOS)
        updated.readingBar.showPlayerControls = true
        #endif

        config = updated
        try persistCurrentConfig()
        debugLog(
            "[SettingsActor] Config updated and persisted - Progress: \(config.sync.progressSyncIntervalSeconds)s, Metadata: \(config.sync.metadataRefreshIntervalSeconds)s"
        )

        let observersList = Array(observers.values)
        Task { @StorytellerUIActor in
            for observer in observersList {
                observer()
            }
        }
    }
}

extension SettingsActor {
    fileprivate static func defaultStorageURL(fileManager: FileManager) -> URL {
        let base = StorytellerPlatform.applicationSupportDirectory(fileManager: fileManager)
        let configDirectory = base.appendingPathComponent("Config", isDirectory: true)
        return configDirectory.appendingPathComponent(
            "StorytellerGlobalConfig.json",
            isDirectory: false,
        )
    }

    fileprivate static func ensureStorageDirectory(
        for fileURL: URL,
        using fileManager: FileManager,
    )
        throws
    {
        let directory = fileURL.deletingLastPathComponent()
        if !fileManager.fileExists(atPath: directory.path) {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        }
    }

    fileprivate static func loadConfig(from url: URL, fileManager: FileManager) throws
        -> StorytellerGlobalConfig
    {
        guard fileManager.fileExists(atPath: url.path) else {
            return StorytellerGlobalConfig()
        }

        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(StorytellerGlobalConfig.self, from: data)
    }

    fileprivate static func save(
        config: StorytellerGlobalConfig,
        to url: URL,
        fileManager _: FileManager,
    ) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(config)
        try data.write(to: url, options: [.atomic])
    }

    fileprivate func persistCurrentConfig() throws {
        try Self.ensureStorageDirectory(for: storageURL, using: fileManager)
        try Self.save(config: config, to: storageURL, fileManager: fileManager)
    }
}
