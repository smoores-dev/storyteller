import Foundation

/// Exactly the settings surface the portable reader managers read. The
/// conforming type must be @Observable so ReaderStyleManager's
/// withObservationTracking sees changes through the existential.
@StorytellerUIActor
public protocol ReaderSettingsReading: AnyObject {
    var fontSize: Double { get }
    var fontFamily: String { get }
    var lineSpacing: Double { get }
    var marginLeftRight: Double { get }
    var marginTop: Double { get }
    var marginBottom: Double { get }
    var wordSpacing: Double { get }
    var letterSpacing: Double { get }
    var paragraphSpacing: Double { get }
    var firstLineIndent: Bool { get }
    var textAlignment: String { get }
    var highlightColor: String? { get }
    var highlightThickness: Double { get }
    var backgroundColor: String? { get }
    var foregroundColor: String? { get }
    var customCSS: String? { get }
    var singleColumnMode: Bool { get }
    var scrollingMode: Bool { get }
    var disableReaderAnimations: Bool { get }
    var enableMarginClickNavigation: Bool { get }
    var userHighlightMode: String { get }
    var readaloudHighlightMode: String { get }
    var readaloudDimOthers: Bool { get }
    var readaloudDimAmount: Double { get }
    var readaloudHighlightFade: Double { get }
    var coverStrengthBackground: Double { get }
    var coverStrengthForeground: Double { get }
    var coverStrengthHighlight: Double { get }
    var readaloudTextItalic: Bool { get }
    var readaloudTextBold: Bool { get }
    var readaloudUnderlineStyle: String { get }
    var freeBrowseMode: String { get }
    var readaloudHighlightVisibility: String { get }
    var doubleTapPlay: String { get }
}
