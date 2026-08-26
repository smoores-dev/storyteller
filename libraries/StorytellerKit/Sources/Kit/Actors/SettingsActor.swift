import Foundation

public let kDefaultBackgroundColorLight = "#FFFFFF"
public let kDefaultForegroundColorLight = "#000000"
public let kDefaultBackgroundColorDark = "#1A1A1A"
public let kDefaultForegroundColorDark = "#EEEEEE"
public let kDefaultHighlightColorLight = "#AE1917"
public let kDefaultHighlightColorDark = "#E63513"

public struct StorytellerGlobalConfig: Codable, Equatable, Sendable {
    public var reading: Reading
    public var playback: Playback
    public var readingBar: ReadingBar
    public var miniPlayer: MiniPlayer
    public var fullPlayer: FullPlayer
    public var sync: Sync
    public var library: Library
    public var themes: Themes

    public init(
        reading: Reading = Reading(),
        playback: Playback = Playback(),
        readingBar: ReadingBar = ReadingBar(),
        miniPlayer: MiniPlayer = MiniPlayer(),
        fullPlayer: FullPlayer = FullPlayer(),
        sync: Sync = Sync(),
        library: Library = Library(),
        themes: Themes = Themes(),
    ) {
        self.reading = reading
        self.playback = playback
        self.readingBar = readingBar
        self.miniPlayer = miniPlayer
        self.fullPlayer = fullPlayer
        self.sync = sync
        self.library = library
        self.themes = themes
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: TopLevelCodingKeys.self)
        reading = (try? container.decode(Reading.self, forKey: .reading)) ?? Reading()
        playback = (try? container.decode(Playback.self, forKey: .playback)) ?? Playback()
        readingBar = (try? container.decode(ReadingBar.self, forKey: .readingBar)) ?? ReadingBar()
        if let stored = try? container.decode(MiniPlayer.self, forKey: .miniPlayer) {
            miniPlayer = stored
        } else {
            var migrated = MiniPlayer()
            if readingBar.showMiniPlayerStats {
                migrated.statSlots = [.statTimeInBook, .statTimeInChapter]
            }
            miniPlayer = migrated
        }
        fullPlayer =
            (try? container.decode(FullPlayer.self, forKey: .fullPlayer)) ?? FullPlayer()
        sync = (try? container.decode(Sync.self, forKey: .sync)) ?? Sync()
        library = (try? container.decode(Library.self, forKey: .library)) ?? Library()
        themes = (try? container.decode(Themes.self, forKey: .themes)) ?? Themes()
    }

    private enum TopLevelCodingKeys: String, CodingKey {
        case reading, playback, readingBar, miniPlayer, fullPlayer, sync, library, themes
    }

    public struct Reading: Codable, Equatable, Sendable {
        public var fontSize: Double
        public var fontFamily: String
        public var lineSpacing: Double
        public var marginLeftRight: Double
        public var marginTop: Double
        public var marginBottom: Double
        public var wordSpacing: Double
        public var letterSpacing: Double
        public var paragraphSpacing: Double
        public var firstLineIndent: Bool
        public var textAlignment: String
        public var highlightColor: String?
        public var highlightThickness: Double
        public var backgroundColor: String?
        public var foregroundColor: String?
        public var customCSS: String?
        public var enableMarginClickNavigation: Bool
        public var singleColumnMode: Bool
        public var scrollingMode: Bool
        public var disableReaderAnimations: Bool
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
        public var readaloudDimOthers: Bool
        public var readaloudDimAmount: Double
        public var readaloudHighlightFade: Double
        public var coverStrengthBackground: Double
        public var coverStrengthForeground: Double
        public var coverStrengthHighlight: Double
        public var readaloudTextItalic: Bool
        public var readaloudTextBold: Bool
        public var readaloudUnderlineStyle: String
        public var tvSubtitleFontSize: Double
        public var tvReaderAppearance: TVReaderAppearance

        public init(
            fontSize: Double = kDefaultFontSize,
            fontFamily: String = kDefaultFontFamily,
            lineSpacing: Double = kDefaultLineSpacing,
            marginLeftRight: Double? = nil,
            marginTop: Double = kDefaultMarginTop,
            marginBottom: Double = kDefaultMarginBottom,
            wordSpacing: Double = kDefaultWordSpacing,
            letterSpacing: Double = kDefaultLetterSpacing,
            paragraphSpacing: Double = kDefaultParagraphSpacing,
            firstLineIndent: Bool = kDefaultFirstLineIndent,
            textAlignment: String = kDefaultTextAlignment,
            highlightColor: String? = nil,
            highlightThickness: Double = kDefaultHighlightThickness,
            backgroundColor: String? = nil,
            foregroundColor: String? = nil,
            customCSS: String? = nil,
            enableMarginClickNavigation: Bool = kDefaultEnableMarginClickNavigation,
            singleColumnMode: Bool? = nil,
            scrollingMode: Bool = kDefaultScrollingMode,
            disableReaderAnimations: Bool = kDefaultDisableReaderAnimations,
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
            readaloudDimOthers: Bool = kDefaultReadaloudDimOthers,
            readaloudDimAmount: Double = kDefaultReadaloudDimAmount,
            readaloudHighlightFade: Double = kDefaultReadaloudHighlightFade,
            coverStrengthBackground: Double = kDefaultCoverTintStrength,
            coverStrengthForeground: Double = kDefaultCoverTintStrength,
            coverStrengthHighlight: Double = kDefaultCoverTintStrength,
            readaloudTextItalic: Bool = kDefaultReadaloudTextItalic,
            readaloudTextBold: Bool = kDefaultReadaloudTextBold,
            readaloudUnderlineStyle: String = kDefaultReadaloudUnderlineStyle,
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
            self.marginTop = marginTop
            self.marginBottom = marginBottom
            self.wordSpacing = wordSpacing
            self.letterSpacing = letterSpacing
            self.paragraphSpacing = paragraphSpacing
            self.firstLineIndent = firstLineIndent
            self.textAlignment = Self.normalizedTextAlignment(textAlignment)
            self.highlightColor = highlightColor
            self.highlightThickness = highlightThickness
            self.backgroundColor = backgroundColor
            self.foregroundColor = foregroundColor
            self.singleColumnMode = singleColumnMode ?? kDefaultSingleColumnMode
            self.customCSS = customCSS
            self.enableMarginClickNavigation = enableMarginClickNavigation
            self.scrollingMode = scrollingMode
            self.disableReaderAnimations = disableReaderAnimations
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
            self.readaloudDimOthers = readaloudDimOthers
            self.readaloudDimAmount = readaloudDimAmount
            self.readaloudHighlightFade = readaloudHighlightFade
            self.coverStrengthBackground = coverStrengthBackground
            self.coverStrengthForeground = coverStrengthForeground
            self.coverStrengthHighlight = coverStrengthHighlight
            self.readaloudTextItalic = readaloudTextItalic
            self.readaloudTextBold = readaloudTextBold
            self.readaloudUnderlineStyle = readaloudUnderlineStyle
            self.tvSubtitleFontSize = tvSubtitleFontSize
            self.tvReaderAppearance = tvReaderAppearance
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            let legacyContainer = try? decoder.container(keyedBy: LegacyCodingKeys.self)
            fontSize = (try? container?.decode(Double.self, forKey: .fontSize)) ?? kDefaultFontSize
            let storedFontFamily =
                (try? container?.decode(String.self, forKey: .fontFamily)) ?? kDefaultFontFamily
            fontFamily = storedFontFamily == "Charis SIL" ? "Charis" : storedFontFamily
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
            let legacyMarginTopBottom = try? legacyContainer?.decode(
                Double.self,
                forKey: .marginTopBottom,
            )
            marginTop =
                (try? container?.decode(Double.self, forKey: .marginTop))
                ?? legacyMarginTopBottom
                ?? kDefaultMarginTop
            marginBottom =
                (try? container?.decode(Double.self, forKey: .marginBottom))
                ?? legacyMarginTopBottom
                ?? kDefaultMarginBottom
            wordSpacing =
                (try? container?.decode(Double.self, forKey: .wordSpacing)) ?? kDefaultWordSpacing
            letterSpacing =
                (try? container?.decode(Double.self, forKey: .letterSpacing))
                ?? kDefaultLetterSpacing
            paragraphSpacing =
                (try? container?.decode(Double.self, forKey: .paragraphSpacing))
                ?? kDefaultParagraphSpacing
            firstLineIndent =
                (try? container?.decode(Bool.self, forKey: .firstLineIndent))
                ?? kDefaultFirstLineIndent
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
            disableReaderAnimations =
                (try? container?.decode(Bool.self, forKey: .disableReaderAnimations))
                ?? kDefaultDisableReaderAnimations
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
            readaloudDimOthers =
                (try? container?.decode(Bool.self, forKey: .readaloudDimOthers))
                ?? kDefaultReadaloudDimOthers
            readaloudDimAmount =
                (try? container?.decode(Double.self, forKey: .readaloudDimAmount))
                ?? kDefaultReadaloudDimAmount
            coverStrengthBackground =
                (try? container?.decode(Double.self, forKey: .coverStrengthBackground))
                ?? kDefaultCoverTintStrength
            coverStrengthForeground =
                (try? container?.decode(Double.self, forKey: .coverStrengthForeground))
                ?? kDefaultCoverTintStrength
            coverStrengthHighlight =
                (try? container?.decode(Double.self, forKey: .coverStrengthHighlight))
                ?? kDefaultCoverTintStrength
            readaloudHighlightFade =
                (try? container?.decode(Double.self, forKey: .readaloudHighlightFade))
                ?? kDefaultReadaloudHighlightFade
            readaloudTextItalic =
                (try? container?.decode(Bool.self, forKey: .readaloudTextItalic))
                ?? kDefaultReadaloudTextItalic
            readaloudTextBold =
                (try? container?.decode(Bool.self, forKey: .readaloudTextBold))
                ?? kDefaultReadaloudTextBold
            readaloudUnderlineStyle =
                (try? container?.decode(String.self, forKey: .readaloudUnderlineStyle))
                ?? kDefaultReadaloudUnderlineStyle
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
            case fontSize, fontFamily, lineSpacing, marginLeftRight, marginTop, marginBottom
            case wordSpacing, letterSpacing, paragraphSpacing, firstLineIndent
            case textAlignment, highlightColor, highlightThickness
            case backgroundColor, foregroundColor
            case customCSS, enableMarginClickNavigation, singleColumnMode
            case scrollingMode, disableReaderAnimations
            case userHighlightColor1, userHighlightColor2, userHighlightColor3
            case userHighlightColor4, userHighlightColor5, userHighlightColor6
            case userHighlightLabel1, userHighlightLabel2, userHighlightLabel3
            case userHighlightLabel4, userHighlightLabel5, userHighlightLabel6
            case userHighlightMode, readaloudHighlightMode, tvSubtitleFontSize
            case readaloudDimOthers, readaloudDimAmount, readaloudHighlightFade
            case coverStrengthBackground, coverStrengthForeground, coverStrengthHighlight
            case readaloudTextItalic, readaloudTextBold, readaloudUnderlineStyle
            case tvReaderAppearance
        }

        private enum LegacyCodingKeys: String, CodingKey {
            case readaloudHighlightUnderline, tvBackgroundStyle, readaloudScrollingMode
            case justifyText, marginTopBottom
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
        public var freeBrowseMode: String
        public var readaloudHighlightVisibility: String
        public var doubleTapPlay: String
        public var automaticRewindEnabled: Bool
        public var automaticRewindAfterInterruption: Double
        public var automaticRewindAfterBreak: Double

        public var lockViewToAudio: Bool { freeBrowseMode == "never" }

        public init(
            defaultPlaybackSpeed: Double = kDefaultPlaybackSpeed,
            defaultVolume: Double = kDefaultVolume,
            statsExpanded: Bool = kDefaultStatsExpanded,
            freeBrowseMode: String = kDefaultFreeBrowseMode,
            readaloudHighlightVisibility: String = kDefaultReadaloudHighlightVisibility,
            doubleTapPlay: String = kDefaultDoubleTapPlay,
            automaticRewindEnabled: Bool = kDefaultAutomaticRewindEnabled,
            automaticRewindAfterInterruption: Double = kDefaultAutomaticRewindAfterInterruption,
            automaticRewindAfterBreak: Double = kDefaultAutomaticRewindAfterBreak,
        ) {
            self.automaticRewindEnabled = automaticRewindEnabled
            self.automaticRewindAfterInterruption =
                Self.normalizedRewindSeconds(automaticRewindAfterInterruption)
            self.automaticRewindAfterBreak = Self.normalizedRewindSeconds(automaticRewindAfterBreak)
            self.defaultPlaybackSpeed = defaultPlaybackSpeed
            self.defaultVolume = defaultVolume
            self.statsExpanded = statsExpanded
            self.freeBrowseMode = Self.normalizedFreeBrowseMode(freeBrowseMode)
            self.readaloudHighlightVisibility =
                Self.normalizedHighlightVisibility(readaloudHighlightVisibility)
            self.doubleTapPlay = Self.normalizedDoubleTapPlay(doubleTapPlay)
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            let legacyContainer = try? decoder.container(keyedBy: LegacyCodingKeys.self)
            defaultPlaybackSpeed =
                (try? container?.decode(Double.self, forKey: .defaultPlaybackSpeed))
                ?? kDefaultPlaybackSpeed
            defaultVolume =
                (try? container?.decode(Double.self, forKey: .defaultVolume)) ?? kDefaultVolume
            statsExpanded =
                (try? container?.decode(Bool.self, forKey: .statsExpanded))
                ?? kDefaultStatsExpanded
            if let stored = try? container?.decode(String.self, forKey: .freeBrowseMode) {
                freeBrowseMode = Self.normalizedFreeBrowseMode(stored)
            } else if let legacyLock = try? legacyContainer?.decode(
                Bool.self,
                forKey: .lockViewToAudio,
            ) {
                freeBrowseMode = legacyLock ? "never" : "paused"
            } else {
                freeBrowseMode = kDefaultFreeBrowseMode
            }
            readaloudHighlightVisibility =
                Self.normalizedHighlightVisibility(
                    (try? container?.decode(String.self, forKey: .readaloudHighlightVisibility))
                        ?? kDefaultReadaloudHighlightVisibility
                )
            doubleTapPlay =
                Self.normalizedDoubleTapPlay(
                    (try? container?.decode(String.self, forKey: .doubleTapPlay))
                        ?? kDefaultDoubleTapPlay
                )
            automaticRewindEnabled =
                (try? container?.decode(Bool.self, forKey: .automaticRewindEnabled))
                ?? kDefaultAutomaticRewindEnabled
            automaticRewindAfterInterruption = Self.normalizedRewindSeconds(
                (try? container?.decode(Double.self, forKey: .automaticRewindAfterInterruption))
                    ?? kDefaultAutomaticRewindAfterInterruption
            )
            automaticRewindAfterBreak = Self.normalizedRewindSeconds(
                (try? container?.decode(Double.self, forKey: .automaticRewindAfterBreak))
                    ?? kDefaultAutomaticRewindAfterBreak
            )
        }

        private enum CodingKeys: String, CodingKey {
            case defaultPlaybackSpeed, defaultVolume, statsExpanded
            case freeBrowseMode, readaloudHighlightVisibility, doubleTapPlay
            case automaticRewindEnabled, automaticRewindAfterInterruption
            case automaticRewindAfterBreak
        }

        private enum LegacyCodingKeys: String, CodingKey {
            case lockViewToAudio
        }

        static func normalizedFreeBrowseMode(_ value: String) -> String {
            kFreeBrowseModeValues.contains(value) ? value : kDefaultFreeBrowseMode
        }

        static func normalizedHighlightVisibility(_ value: String) -> String {
            kReadaloudHighlightVisibilityValues.contains(value)
                ? value : kDefaultReadaloudHighlightVisibility
        }

        static func normalizedDoubleTapPlay(_ value: String) -> String {
            kDoubleTapPlayValues.contains(value) ? value : kDefaultDoubleTapPlay
        }

        static func normalizedRewindSeconds(_ value: Double) -> Double {
            value.isFinite ? min(max(value, 0), kAutomaticRewindMaxSeconds) : 0
        }
    }

    public struct MiniPlayer: Codable, Equatable, Sendable {
        public var size: MiniPlayerSize
        public var leadingStyle: MiniPlayerLeadingStyle
        public var cycleFirst: MiniPlayerCycleBlock
        public var cycleSecond: MiniPlayerCycleBlock
        public var cycleShowingSecond: Bool
        public var progressScope: MiniPlayerProgressScope
        public var mirrored: Bool
        public var contentRowSlots: [PlayerComplication]
        public var statSlots: [PlayerComplication]
        public var scrubRowSlots: [PlayerComplication]
        public var extraSlots: [PlayerComplication]

        public init(
            size: MiniPlayerSize = .compact,
            leadingStyle: MiniPlayerLeadingStyle = .single,
            cycleFirst: MiniPlayerCycleBlock = MiniPlayerCycleBlock(
                showCover: true, line1: .bookTitle, line2: .chapterTitle,
            ),
            cycleSecond: MiniPlayerCycleBlock = MiniPlayerCycleBlock(
                showCover: true, line1: .statPage, line2: .statPercent,
            ),
            cycleShowingSecond: Bool = false,
            progressScope: MiniPlayerProgressScope = .chapter,
            mirrored: Bool = false,
            contentRowSlots: [PlayerComplication] = [
                .titleBlock, .playbackSpeed, .none, .none, .playPause,
            ],
            statSlots: [PlayerComplication] = [],
            scrubRowSlots: [PlayerComplication] = [
                .scrubBar, .skipBackward, .playPause, .skipForward,
            ],
            extraSlots: [PlayerComplication] = [
                .statPercent, .statPage, .statTimeInBook, .statTimeInChapter,
            ],
        ) {
            self.size = size
            self.leadingStyle = leadingStyle
            self.cycleFirst = cycleFirst
            self.cycleSecond = cycleSecond
            self.cycleShowingSecond = cycleShowingSecond
            self.progressScope = progressScope
            self.mirrored = mirrored
            self.contentRowSlots = contentRowSlots
            self.statSlots = statSlots
            self.scrubRowSlots = scrubRowSlots
            self.extraSlots = extraSlots
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            let legacy = try? decoder.container(keyedBy: LegacyCodingKeys.self)
            let defaults = MiniPlayer()
            size = (try? container?.decode(MiniPlayerSize.self, forKey: .size)) ?? defaults.size
            let rawLeading = try? container?.decode(String.self, forKey: .leadingStyle)
            leadingStyle =
                (try? container?.decode(MiniPlayerLeadingStyle.self, forKey: .leadingStyle))
                ?? defaults.leadingStyle
            // Legacy coverTitle configs never showed the cycle block, so give
            // the single view the classic cover-and-title layout.
            if rawLeading == "coverTitle" {
                cycleFirst = MiniPlayerCycleBlock(
                    showCover: true, line1: .bookTitle, line2: .chapterTitle,
                )
            } else {
                cycleFirst =
                    (try? container?.decode(MiniPlayerCycleBlock.self, forKey: .cycleFirst))
                    ?? defaults.cycleFirst
            }
            cycleSecond =
                (try? container?.decode(MiniPlayerCycleBlock.self, forKey: .cycleSecond))
                ?? defaults.cycleSecond
            cycleShowingSecond =
                (try? container?.decode(Bool.self, forKey: .cycleShowingSecond))
                ?? defaults.cycleShowingSecond
            progressScope =
                (try? container?.decode(MiniPlayerProgressScope.self, forKey: .progressScope))
                ?? defaults.progressScope
            mirrored = (try? container?.decode(Bool.self, forKey: .mirrored)) ?? defaults.mirrored
            // The title block used to be a fixed element to the left of a
            // 4-slot trailing row; it is now just another slot in one row.
            if let decodedContentRow = try? container?.decode(
                [PlayerComplication].self, forKey: .contentRowSlots,
            ) {
                contentRowSlots = decodedContentRow
            } else if let legacyTrailing = try? legacy?.decode(
                [PlayerComplication].self, forKey: .trailingSlots,
            ) {
                contentRowSlots = [.titleBlock] + legacyTrailing
            } else {
                contentRowSlots = defaults.contentRowSlots
            }
            statSlots =
                (try? container?.decode([PlayerComplication].self, forKey: .statSlots))
                ?? defaults.statSlots
            // Older configs stored the scrub bar as its own single-slot array
            // next to a 3-slot transport row; fold both into the 4-slot row.
            let decodedScrubRow = try? container?.decode(
                [PlayerComplication].self, forKey: .scrubRowSlots,
            )
            if let decodedScrubRow, decodedScrubRow.count >= 4 {
                scrubRowSlots = decodedScrubRow
            } else if let decodedScrubRow {
                let legacyScrub =
                    (try? legacy?.decode([PlayerComplication].self, forKey: .scrubSlots))
                    ?? [.scrubBar]
                let lead: PlayerComplication = legacyScrub.first == .scrubBar ? .scrubBar : .none
                scrubRowSlots = [lead] + decodedScrubRow
            } else {
                scrubRowSlots = defaults.scrubRowSlots
            }
            extraSlots =
                (try? container?.decode([PlayerComplication].self, forKey: .extraSlots))
                ?? defaults.extraSlots
        }

        private enum CodingKeys: String, CodingKey {
            case size, leadingStyle, cycleFirst, cycleSecond, cycleShowingSecond
            case progressScope, mirrored, contentRowSlots, statSlots
            case scrubRowSlots, extraSlots
        }

        private enum LegacyCodingKeys: String, CodingKey {
            case scrubSlots, trailingSlots
        }
    }

    public struct FullPlayer: Codable, Equatable, Sendable {
        public var statSlots: [PlayerComplication]
        public var controlSlots: [PlayerComplication]

        public init(
            statSlots: [PlayerComplication] = [
                .statPercent, .none, .statTimeInBook,
                .statPage, .none, .statTimeInChapter,
            ],
            controlSlots: [PlayerComplication] = [
                .playbackSpeed, .chapters, .volume, .sleepTimer,
            ],
        ) {
            self.statSlots = statSlots
            self.controlSlots = controlSlots
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            let defaults = FullPlayer()
            statSlots =
                (try? container?.decode([PlayerComplication].self, forKey: .statSlots))
                ?? defaults.statSlots
            controlSlots =
                (try? container?.decode([PlayerComplication].self, forKey: .controlSlots))
                ?? defaults.controlSlots
        }

        private enum CodingKeys: String, CodingKey {
            case statSlots, controlSlots
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
        public var dockTransparency: Double
        public var alwaysShowMiniPlayer: Bool
        public var showOverlaySkipBackward: Bool
        public var showOverlaySkipForward: Bool
        public var showOverlayPlayPause: Bool
        public var showMiniPlayerStats: Bool
        public var progressIndicatorMiniPlayer: Bool
        public var progressIndicatorDock: Bool
        public var progressIndicatorThickness: Double
        public var progressIndicatorThicknessDock: Double
        public var progressIndicatorScopeDock: MiniPlayerProgressScope
        public var dockLeadingSlots: [PlayerComplication]
        public var dockTrailingSlots: [PlayerComplication]
        public var dockCenterSlots: [PlayerComplication]
        public var menuBarSlots: [PlayerComplication]

        public static let defaultMenuBarSlots: [PlayerComplication] = [
            .sleepTimer, .chapters, .bookmarks, .readingTimeline, .search, .imageGallery,
        ]

        static func leadingSlots(showProgress: Bool, showPageNumber: Bool) -> [PlayerComplication] {
            var slots: [PlayerComplication] = []
            if showProgress { slots.append(.statPercent) }
            if showPageNumber { slots.append(.statPage) }
            return slots
        }

        static func trailingSlots(showBook: Bool, showChapter: Bool) -> [PlayerComplication] {
            var slots: [PlayerComplication] = []
            if showBook { slots.append(.statTimeInBook) }
            if showChapter { slots.append(.statTimeInChapter) }
            return slots
        }

        static func centerSlots(
            skipBackward: Bool,
            playPause: Bool,
            skipForward: Bool,
        ) -> [PlayerComplication] {
            var slots: [PlayerComplication] = []
            if skipBackward { slots.append(.skipBackward) }
            if playPause { slots.append(.playPause) }
            if skipForward { slots.append(.skipForward) }
            return slots
        }

        public init(
            enabled: Bool = kDefaultReadingBarEnabled,
            showPlayerControls: Bool? = nil,
            showProgressBar: Bool = kDefaultShowProgressBar,
            showProgress: Bool = kDefaultShowProgress,
            showTimeRemainingInBook: Bool = kDefaultShowTimeRemainingInBook,
            showTimeRemainingInChapter: Bool = kDefaultShowTimeRemainingInChapter,
            showPageNumber: Bool = kDefaultShowPageNumber,
            dockTransparency: Double = kDefaultDockTransparency,
            alwaysShowMiniPlayer: Bool = kDefaultAlwaysShowMiniPlayer,
            showOverlaySkipBackward: Bool = kDefaultShowOverlaySkipBackward,
            showOverlaySkipForward: Bool = kDefaultShowOverlaySkipForward,
            showOverlayPlayPause: Bool = kDefaultShowOverlayPlayPause,
            showMiniPlayerStats: Bool = kDefaultShowMiniPlayerStats,
            progressIndicatorMiniPlayer: Bool = kDefaultProgressIndicatorMiniPlayer,
            progressIndicatorDock: Bool = kDefaultProgressIndicatorDock,
            progressIndicatorThickness: Double = kDefaultProgressIndicatorThickness,
            progressIndicatorThicknessDock: Double = kDefaultProgressIndicatorThickness,
            progressIndicatorScopeDock: MiniPlayerProgressScope = .chapter,
            dockLeadingSlots: [PlayerComplication]? = nil,
            dockTrailingSlots: [PlayerComplication]? = nil,
            dockCenterSlots: [PlayerComplication]? = nil,
            menuBarSlots: [PlayerComplication] = ReadingBar.defaultMenuBarSlots,
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
            self.dockTransparency = dockTransparency
            self.alwaysShowMiniPlayer = alwaysShowMiniPlayer
            self.showOverlaySkipBackward = showOverlaySkipBackward
            self.showOverlaySkipForward = showOverlaySkipForward
            self.showOverlayPlayPause = showOverlayPlayPause
            self.showMiniPlayerStats = showMiniPlayerStats
            self.progressIndicatorMiniPlayer = progressIndicatorMiniPlayer
            self.progressIndicatorDock = progressIndicatorDock
            self.progressIndicatorThickness = progressIndicatorThickness
            self.progressIndicatorThicknessDock = progressIndicatorThicknessDock
            self.progressIndicatorScopeDock = progressIndicatorScopeDock
            self.dockLeadingSlots =
                dockLeadingSlots
                ?? Self.leadingSlots(showProgress: showProgress, showPageNumber: showPageNumber)
            self.dockTrailingSlots =
                dockTrailingSlots
                ?? Self.trailingSlots(
                    showBook: showTimeRemainingInBook,
                    showChapter: showTimeRemainingInChapter,
                )
            self.dockCenterSlots =
                dockCenterSlots
                ?? Self.centerSlots(
                    skipBackward: showOverlaySkipBackward,
                    playPause: showOverlayPlayPause,
                    skipForward: showOverlaySkipForward,
                )
            self.menuBarSlots = menuBarSlots
        }

        public init(from decoder: Decoder) throws {
            let container = try? decoder.container(keyedBy: CodingKeys.self)
            let legacyContainer = try? decoder.container(keyedBy: LegacyCodingKeys.self)
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
            dockTransparency =
                (try? container?.decode(Double.self, forKey: .dockTransparency))
                ?? (try? legacyContainer?.decode(Double.self, forKey: .overlayTransparency))
                ?? kDefaultDockTransparency
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
            progressIndicatorMiniPlayer =
                (try? container?.decode(Bool.self, forKey: .progressIndicatorMiniPlayer))
                ?? kDefaultProgressIndicatorMiniPlayer
            progressIndicatorDock =
                (try? container?.decode(Bool.self, forKey: .progressIndicatorDock))
                ?? (try? legacyContainer?.decode(Bool.self, forKey: .progressIndicatorOverlay))
                ?? kDefaultProgressIndicatorDock
            progressIndicatorThickness =
                (try? container?.decode(Double.self, forKey: .progressIndicatorThickness))
                ?? kDefaultProgressIndicatorThickness
            progressIndicatorThicknessDock =
                (try? container?.decode(Double.self, forKey: .progressIndicatorThicknessDock))
                ?? (try? legacyContainer?.decode(
                    Double.self, forKey: .progressIndicatorThicknessOverlay))
                ?? kDefaultProgressIndicatorThickness
            progressIndicatorScopeDock =
                (try? container?.decode(
                    MiniPlayerProgressScope.self, forKey: .progressIndicatorScopeDock))
                ?? (try? legacyContainer?.decode(
                    MiniPlayerProgressScope.self, forKey: .progressIndicatorScopeOverlay))
                ?? .chapter
            dockLeadingSlots =
                (try? container?.decode([PlayerComplication].self, forKey: .dockLeadingSlots))
                ?? (try? legacyContainer?.decode(
                    [PlayerComplication].self, forKey: .overlayLeadingSlots))
                ?? (enabled
                    ? Self.leadingSlots(showProgress: showProgress, showPageNumber: showPageNumber)
                    : [])
            dockTrailingSlots =
                (try? container?.decode([PlayerComplication].self, forKey: .dockTrailingSlots))
                ?? (try? legacyContainer?.decode(
                    [PlayerComplication].self, forKey: .overlayTrailingSlots))
                ?? (enabled
                    ? Self.trailingSlots(
                        showBook: showTimeRemainingInBook,
                        showChapter: showTimeRemainingInChapter,
                    )
                    : [])
            dockCenterSlots =
                (try? container?.decode([PlayerComplication].self, forKey: .dockCenterSlots))
                ?? (try? legacyContainer?.decode(
                    [PlayerComplication].self, forKey: .overlayCenterSlots))
                ?? (enabled
                    ? Self.centerSlots(
                        skipBackward: showOverlaySkipBackward,
                        playPause: showOverlayPlayPause,
                        skipForward: showOverlaySkipForward,
                    )
                    : [])
            menuBarSlots =
                (try? container?.decode([PlayerComplication].self, forKey: .menuBarSlots))
                ?? (try? legacyContainer?.decode([PlayerComplication].self, forKey: .topBarSlots))
                ?? Self.defaultMenuBarSlots
        }

        private enum CodingKeys: String, CodingKey {
            case enabled, showPlayerControls, showProgressBar, showProgress
            case showTimeRemainingInBook, showTimeRemainingInChapter, showPageNumber
            case dockTransparency, alwaysShowMiniPlayer
            case showOverlaySkipBackward, showOverlaySkipForward, showOverlayPlayPause
            case showMiniPlayerStats
            case progressIndicatorMiniPlayer, progressIndicatorDock
            case progressIndicatorThickness
            case progressIndicatorThicknessDock, progressIndicatorScopeDock
            case dockLeadingSlots, dockTrailingSlots, dockCenterSlots
            case menuBarSlots
        }

        // Keys written by builds that predate the dock/menu bar rename.
        private enum LegacyCodingKeys: String, CodingKey {
            case overlayTransparency
            case progressIndicatorOverlay
            case progressIndicatorThicknessOverlay, progressIndicatorScopeOverlay
            case overlayLeadingSlots, overlayTrailingSlots, overlayCenterSlots
            case topBarSlots
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
        public var experimentalSettings: Bool
        public var progressBadgeBackground: Bool

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
            experimentalSettings: Bool = kDefaultExperimentalSettings,
            progressBadgeBackground: Bool = kDefaultProgressBadgeBackground,
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
            self.experimentalSettings = experimentalSettings
            self.progressBadgeBackground = progressBadgeBackground
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
            experimentalSettings =
                (try? container?.decode(Bool.self, forKey: .experimentalSettings))
                ?? kDefaultExperimentalSettings
            progressBadgeBackground =
                (try? container?.decode(Bool.self, forKey: .progressBadgeBackground))
                ?? kDefaultProgressBadgeBackground
        }

        private enum CodingKeys: String, CodingKey {
            case showAudioIndicator, tabBarSlot1, tabBarSlot2, tapToPlayPreferredPlayer,
                preferAudioOverEbook, accentColorHex, colorMode, colorIntensity,
                doubleCoverAlignment, experimentalSettings, progressBadgeBackground
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
        marginTop: Double? = nil,
        marginBottom: Double? = nil,
        wordSpacing: Double? = nil,
        letterSpacing: Double? = nil,
        paragraphSpacing: Double? = nil,
        firstLineIndent: Bool? = nil,
        textAlignment: String? = nil,
        highlightColor: String?? = nil,
        highlightThickness: Double? = nil,
        backgroundColor: String?? = nil,
        foregroundColor: String?? = nil,
        customCSS: String?? = nil,
        enableMarginClickNavigation: Bool? = nil,
        singleColumnMode: Bool? = nil,
        scrollingMode: Bool? = nil,
        disableReaderAnimations: Bool? = nil,
        defaultPlaybackSpeed: Double? = nil,
        defaultVolume: Double? = nil,
        statsExpanded: Bool? = nil,
        lockViewToAudio: Bool? = nil,
        freeBrowseMode: String? = nil,
        readaloudHighlightVisibility: String? = nil,
        doubleTapPlay: String? = nil,
        automaticRewindEnabled: Bool? = nil,
        automaticRewindAfterInterruption: Double? = nil,
        automaticRewindAfterBreak: Double? = nil,
        readaloudDimOthers: Bool? = nil,
        readaloudDimAmount: Double? = nil,
        readaloudHighlightFade: Double? = nil,
        coverStrengthBackground: Double? = nil,
        coverStrengthForeground: Double? = nil,
        coverStrengthHighlight: Double? = nil,
        readaloudTextItalic: Bool? = nil,
        readaloudTextBold: Bool? = nil,
        readaloudUnderlineStyle: String? = nil,
        miniPlayerSize: MiniPlayerSize? = nil,
        miniPlayerLeadingStyle: MiniPlayerLeadingStyle? = nil,
        miniPlayerCycleFirst: MiniPlayerCycleBlock? = nil,
        miniPlayerCycleSecond: MiniPlayerCycleBlock? = nil,
        miniPlayerCycleShowingSecond: Bool? = nil,
        miniPlayerProgressScope: MiniPlayerProgressScope? = nil,
        miniPlayerMirrored: Bool? = nil,
        miniPlayerContentRowSlots: [PlayerComplication]? = nil,
        miniPlayerStatSlots: [PlayerComplication]? = nil,
        miniPlayerScrubRowSlots: [PlayerComplication]? = nil,
        miniPlayerExtraSlots: [PlayerComplication]? = nil,
        fullPlayerStatSlots: [PlayerComplication]? = nil,
        fullPlayerControlSlots: [PlayerComplication]? = nil,
        dockLeadingSlots: [PlayerComplication]? = nil,
        dockTrailingSlots: [PlayerComplication]? = nil,
        dockCenterSlots: [PlayerComplication]? = nil,
        menuBarSlots: [PlayerComplication]? = nil,
        enableReadingBar: Bool? = nil,
        showPlayerControls: Bool? = nil,
        showProgressBar: Bool? = nil,
        showProgress: Bool? = nil,
        showTimeRemainingInBook: Bool? = nil,
        showTimeRemainingInChapter: Bool? = nil,
        showPageNumber: Bool? = nil,
        dockTransparency: Double? = nil,
        alwaysShowMiniPlayer: Bool? = nil,
        showOverlaySkipBackward: Bool? = nil,
        showOverlaySkipForward: Bool? = nil,
        showOverlayPlayPause: Bool? = nil,
        showMiniPlayerStats: Bool? = nil,
        progressIndicatorMiniPlayer: Bool? = nil,
        progressIndicatorDock: Bool? = nil,
        progressIndicatorThickness: Double? = nil,
        progressIndicatorThicknessDock: Double? = nil,
        progressIndicatorScopeDock: MiniPlayerProgressScope? = nil,
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
        experimentalSettings: Bool? = nil,
        progressBadgeBackground: Bool? = nil,
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
        if let marginTop { updated.reading.marginTop = marginTop }
        if let marginBottom { updated.reading.marginBottom = marginBottom }
        if let wordSpacing { updated.reading.wordSpacing = wordSpacing }
        if let letterSpacing { updated.reading.letterSpacing = letterSpacing }
        if let paragraphSpacing { updated.reading.paragraphSpacing = paragraphSpacing }
        if let firstLineIndent { updated.reading.firstLineIndent = firstLineIndent }
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
        if let disableReaderAnimations {
            updated.reading.disableReaderAnimations = disableReaderAnimations
        }
        if let defaultPlaybackSpeed { updated.playback.defaultPlaybackSpeed = defaultPlaybackSpeed }
        if let defaultVolume { updated.playback.defaultVolume = defaultVolume }
        if let statsExpanded { updated.playback.statsExpanded = statsExpanded }
        if let lockViewToAudio {
            updated.playback.freeBrowseMode = lockViewToAudio ? "never" : "paused"
        }
        if let freeBrowseMode {
            updated.playback.freeBrowseMode =
                StorytellerGlobalConfig.Playback.normalizedFreeBrowseMode(freeBrowseMode)
        }
        if let readaloudHighlightVisibility {
            updated.playback.readaloudHighlightVisibility =
                StorytellerGlobalConfig.Playback.normalizedHighlightVisibility(
                    readaloudHighlightVisibility
                )
        }
        if let doubleTapPlay {
            updated.playback.doubleTapPlay =
                StorytellerGlobalConfig.Playback.normalizedDoubleTapPlay(doubleTapPlay)
        }
        if let automaticRewindEnabled {
            updated.playback.automaticRewindEnabled = automaticRewindEnabled
        }
        if let automaticRewindAfterInterruption {
            updated.playback.automaticRewindAfterInterruption =
                StorytellerGlobalConfig.Playback.normalizedRewindSeconds(
                    automaticRewindAfterInterruption
                )
        }
        if let automaticRewindAfterBreak {
            updated.playback.automaticRewindAfterBreak =
                StorytellerGlobalConfig.Playback.normalizedRewindSeconds(automaticRewindAfterBreak)
        }
        if let readaloudDimOthers { updated.reading.readaloudDimOthers = readaloudDimOthers }
        if let readaloudDimAmount { updated.reading.readaloudDimAmount = readaloudDimAmount }
        if let coverStrengthBackground {
            updated.reading.coverStrengthBackground = coverStrengthBackground
        }
        if let coverStrengthForeground {
            updated.reading.coverStrengthForeground = coverStrengthForeground
        }
        if let coverStrengthHighlight {
            updated.reading.coverStrengthHighlight = coverStrengthHighlight
        }
        if let readaloudHighlightFade {
            updated.reading.readaloudHighlightFade = readaloudHighlightFade
        }
        if let readaloudTextItalic { updated.reading.readaloudTextItalic = readaloudTextItalic }
        if let readaloudTextBold { updated.reading.readaloudTextBold = readaloudTextBold }
        if let readaloudUnderlineStyle {
            updated.reading.readaloudUnderlineStyle = readaloudUnderlineStyle
        }
        if let miniPlayerSize { updated.miniPlayer.size = miniPlayerSize }
        if let miniPlayerLeadingStyle { updated.miniPlayer.leadingStyle = miniPlayerLeadingStyle }
        if let miniPlayerCycleFirst { updated.miniPlayer.cycleFirst = miniPlayerCycleFirst }
        if let miniPlayerCycleSecond { updated.miniPlayer.cycleSecond = miniPlayerCycleSecond }
        if let miniPlayerCycleShowingSecond {
            updated.miniPlayer.cycleShowingSecond = miniPlayerCycleShowingSecond
        }
        if let miniPlayerProgressScope {
            updated.miniPlayer.progressScope = miniPlayerProgressScope
        }
        if let miniPlayerMirrored { updated.miniPlayer.mirrored = miniPlayerMirrored }
        if let miniPlayerContentRowSlots {
            updated.miniPlayer.contentRowSlots = miniPlayerContentRowSlots
        }
        if let miniPlayerStatSlots {
            updated.miniPlayer.statSlots = miniPlayerStatSlots
            updated.readingBar.showMiniPlayerStats = miniPlayerStatSlots.hasActiveComplication
        }
        if let miniPlayerScrubRowSlots {
            updated.miniPlayer.scrubRowSlots = miniPlayerScrubRowSlots
        }
        if let miniPlayerExtraSlots { updated.miniPlayer.extraSlots = miniPlayerExtraSlots }
        if let fullPlayerStatSlots { updated.fullPlayer.statSlots = fullPlayerStatSlots }
        if let fullPlayerControlSlots {
            updated.fullPlayer.controlSlots = fullPlayerControlSlots
        }
        if let dockLeadingSlots {
            updated.readingBar.dockLeadingSlots = dockLeadingSlots
            updated.readingBar.showProgress = dockLeadingSlots.contains(.statPercent)
            updated.readingBar.showPageNumber = dockLeadingSlots.contains(.statPage)
        }
        if let dockTrailingSlots {
            updated.readingBar.dockTrailingSlots = dockTrailingSlots
            updated.readingBar.showTimeRemainingInBook =
                dockTrailingSlots.contains(.statTimeInBook)
            updated.readingBar.showTimeRemainingInChapter =
                dockTrailingSlots.contains(.statTimeInChapter)
        }
        if let dockCenterSlots {
            updated.readingBar.dockCenterSlots = dockCenterSlots
            updated.readingBar.showOverlaySkipBackward = dockCenterSlots.contains(.skipBackward)
            updated.readingBar.showOverlayPlayPause = dockCenterSlots.contains(.playPause)
            updated.readingBar.showOverlaySkipForward = dockCenterSlots.contains(.skipForward)
        }
        if let menuBarSlots {
            updated.readingBar.menuBarSlots = menuBarSlots
        }
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
        if let dockTransparency { updated.readingBar.dockTransparency = dockTransparency }
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
        if let progressIndicatorMiniPlayer {
            updated.readingBar.progressIndicatorMiniPlayer = progressIndicatorMiniPlayer
        }
        if let progressIndicatorDock {
            updated.readingBar.progressIndicatorDock = progressIndicatorDock
        }
        if let progressIndicatorThickness {
            updated.readingBar.progressIndicatorThickness = progressIndicatorThickness
        }
        if let progressIndicatorThicknessDock {
            updated.readingBar.progressIndicatorThicknessDock =
                progressIndicatorThicknessDock
        }
        if let progressIndicatorScopeDock {
            updated.readingBar.progressIndicatorScopeDock = progressIndicatorScopeDock
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
        if let progressBadgeBackground {
            updated.library.progressBadgeBackground = progressBadgeBackground
        }
        if let experimentalSettings {
            updated.library.experimentalSettings = experimentalSettings
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

    public func resetConfig(_ newConfig: StorytellerGlobalConfig = StorytellerGlobalConfig()) throws
    {
        config = newConfig
        try persistCurrentConfig()
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
