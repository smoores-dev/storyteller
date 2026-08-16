import Foundation

public let kDefaultFontSize: Double = 24
public let kDefaultFontFamily = "Literata"
public let kDefaultLineSpacing: Double = 1.4
public let kDefaultMarginLeftRightIOS: Double = 2
public let kDefaultMarginLeftRightMac: Double = 5
public let kDefaultMarginTop: Double = 6
public let kDefaultMarginBottom: Double = 4
public let kDefaultWordSpacing: Double = 0
public let kDefaultLetterSpacing: Double = 0
public let kDefaultParagraphSpacing: Double = 0
public let kDefaultFirstLineIndent = false
public let kDefaultJustifyText = true
public let kDefaultTextAlignment = "justify"
public let kTextAlignmentValues = ["left", "justify", "right"]
public let kDefaultHighlightThickness: Double = 1.0
public let kDefaultEnableMarginClickNavigation = true
public let kDefaultSingleColumnMode = true
public let kDefaultScrollingMode = false

// Slot order is defined by HighlightColor's case order: Pink, Orange, Yellow,
// Green, Blue, Purple. These palettes are indexed by that position and must
// stay aligned with it.
public let kDefaultUserHighlightColorsLight = [
    "#B849B8", "#E67400", "#FFB600", "#00915A", "#005493", "#6C3CC1",
]
public let kDefaultUserHighlightColorsDark = [
    "#C4527A", "#C47A3A", "#B8A030", "#3A9E7E", "#4A7ACC", "#8A52CC",
]
public let kDefaultUserHighlightLabels = [
    "Pink", "Orange", "Yellow", "Green", "Blue", "Purple",
]

public let kDefaultUserHighlightColor1 = kDefaultUserHighlightColorsLight[0]
public let kDefaultUserHighlightColor2 = kDefaultUserHighlightColorsLight[1]
public let kDefaultUserHighlightColor3 = kDefaultUserHighlightColorsLight[2]
public let kDefaultUserHighlightColor4 = kDefaultUserHighlightColorsLight[3]
public let kDefaultUserHighlightColor5 = kDefaultUserHighlightColorsLight[4]
public let kDefaultUserHighlightColor6 = kDefaultUserHighlightColorsLight[5]
public let kDefaultUserHighlightLabel1 = kDefaultUserHighlightLabels[0]
public let kDefaultUserHighlightLabel2 = kDefaultUserHighlightLabels[1]
public let kDefaultUserHighlightLabel3 = kDefaultUserHighlightLabels[2]
public let kDefaultUserHighlightLabel4 = kDefaultUserHighlightLabels[3]
public let kDefaultUserHighlightLabel5 = kDefaultUserHighlightLabels[4]
public let kDefaultUserHighlightLabel6 = kDefaultUserHighlightLabels[5]
public let kDefaultUserHighlightMode = "underline"
public let kDefaultReadaloudHighlightMode = "background"

public let kDefaultPlaybackSpeed: Double = 1.0
public let kDefaultVolume: Double = 1.0
public let kDefaultStatsExpanded = false
public let kDefaultLockViewToAudio = true
public let kDefaultFreeBrowseMode = "never"
public let kFreeBrowseModeValues = ["never", "paused", "always"]
public let kDefaultReadaloudHighlightVisibility = "paused"
public let kReadaloudHighlightVisibilityValues = ["playing", "paused", "always"]
public let kDefaultDoubleTapPlay = "headphones"
public let kDoubleTapPlayValues = ["never", "always", "headphones"]
public let kDefaultReadaloudDimOthers = false
public let kDefaultReadaloudDimAmount: Double = 0.5
public let kDefaultReadaloudHighlightFade: Double = 0
public let kDefaultReadaloudTextItalic = false
public let kDefaultReadaloudTextBold = false
public let kDefaultReadaloudUnderlineStyle = "solid"
public let kReadaloudUnderlineStyleValues = ["solid", "double", "squiggle"]

public let kDefaultReadingBarEnabled = true
public let kDefaultShowPlayerControlsIOS = true
public let kDefaultShowPlayerControlsMac = false
public let kDefaultShowProgressBar = false
public let kDefaultShowProgress = true
public let kDefaultShowTimeRemainingInBook = true
public let kDefaultShowTimeRemainingInChapter = true
public let kDefaultShowPageNumber = true
public let kDefaultDockTransparency: Double = 0.8
public let kDefaultAlwaysShowMiniPlayer = false
public let kDefaultShowOverlaySkipBackward = true
public let kDefaultShowOverlaySkipForward = true
public let kDefaultShowOverlayPlayPause = true
public let kDefaultShowMiniPlayerStats = false
public let kDefaultProgressIndicatorMiniPlayer = true
public let kDefaultProgressIndicatorDock = true
public let kDefaultProgressIndicatorThickness: Double = 3

public let kDefaultProgressSyncIntervalSeconds: Double = 30
public let kDefaultMetadataRefreshIntervalSeconds: Double = 300
public let kDefaultIsManuallyOffline = false
public let kDefaultAutoSyncToNewerServerPosition = false
public let kDefaultLiveReadingSyncEnabled = false

public let kDefaultShowAudioIndicator = false
public let kDefaultTabBarSlot1 = "books"
public let kDefaultTabBarSlot2 = "series"
public let kDefaultTapToPlayPreferredPlayer = false
public let kDefaultPreferAudioOverEbook = false
public let kDefaultAccentColorHex = "#EB722F"
public let kDefaultColorMode = "full"
public let kDefaultColorIntensity: Double = 0.65
public let kDefaultDoubleCoverAlignment = "auto"
public let kDefaultExperimentalSettings = false

public let kDefaultTVSubtitleFontSize: Double = 48
public let kDefaultTVFontFamily = "serif"
public let kDefaultTVBackgroundStyle = "cover"
public let kDefaultTVActiveSentenceStyle = "whiteText"
public let kDefaultTVHighlightColor = "yellow"
public let kDefaultTVInactiveTextIntensity = "dim"
public let kDefaultTVTextWidth = "medium"
public let kDefaultTVLineSpacing = "medium"
public let kDefaultTVTextAlignment = "leading"
public let kDefaultTVScrollMode = "paragraph"
