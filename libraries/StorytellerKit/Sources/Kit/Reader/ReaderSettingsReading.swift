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
    var marginTopBottom: Double { get }
    var wordSpacing: Double { get }
    var letterSpacing: Double { get }
    var textAlignment: String { get }
    var highlightColor: String? { get }
    var highlightThickness: Double { get }
    var backgroundColor: String? { get }
    var foregroundColor: String? { get }
    var customCSS: String? { get }
    var singleColumnMode: Bool { get }
    var scrollingMode: Bool { get }
    var enableMarginClickNavigation: Bool { get }
    var userHighlightMode: String { get }
    var readaloudHighlightMode: String { get }
    var lockViewToAudio: Bool { get }
}
