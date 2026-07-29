import Foundation

/// WebViewMessages - Message definitions for FoliateManager
///
/// Design:
/// - Swift → JS: No wrapper needed, direct evaluateJavaScript calls
/// - JS → Swift: Simple structs decoded from webkit.messageHandlers

/// Sent from JS when foliate-view relocates (page turn, navigation, etc.)
public struct RelocatedMessage: Codable {
    public let sectionIndex: Int?
    public let pageIndex: Int?
    public let totalPages: Int?
    public let href: String?
    public let cfi: String
    public let fraction: Double?
    public let chapterFraction: Double?
    public let flow: String?
    public let reason: String?
}

/// Sent from JS when book structure is ready after opening a book
public struct BookStructureReadyMessage: Codable {
    public let sections: [SectionInfo]
}

/// Sent when foliate detects a user gesture that flips a page
public struct PageFlippedMessage: Codable {
    public let direction: String
    public let fromPage: Int?
    public let delta: Int?
}

/// Sent when user taps to toggle overlay visibility (iOS only)
public struct OverlayToggledMessage: Codable {
}

/// Sent when user clicks in margin zone to navigate - routed through EPM like arrow keys
public struct MarginClickNavMessage: Codable {
    public let direction: String
}

/// Sent when WebView-owned key handling should skip readaloud sentences
public struct SentenceSkipMessage: Codable {
    public let direction: String
}

/// Sent when user double-clicks text to seek audio to that location
public struct MediaOverlaySeekMessage: Codable {
    public let sectionIndex: Int
    public let anchor: String
}

// SectionInfo and SMILEntry are defined in Common/Models/SMILTypes.swift

/// Sent when media overlay makes progress during audio playback
public struct MediaOverlayProgressMessage: Codable {
    public let sectionIndex: Int
    public let chapterElapsedSeconds: Double?
    public let chapterTotalSeconds: Double?
    public let bookElapsedSeconds: Double?
    public let bookTotalSeconds: Double?
    public let currentFragment: String?
}

/// Sent from JS when a highlighted element's visibility is calculated
/// Used for determining when to flip pages during audio narration
public struct ElementVisibilityMessage: Codable {
    public let textId: String
    public let visibleRatio: Double
    public let offScreenRatio: Double
}

/// Sent from JS when search finds results in a section
public struct SearchResultsMessage: Codable {
    public let sectionLabel: String
    public let results: [SearchResult]
}

/// Individual search result with excerpt context
public struct SearchResult: Codable, Identifiable, Hashable {
    public let cfi: String
    public let pre: String
    public let match: String
    public let post: String

    public var id: String { cfi }
}

/// Sent from JS to report search progress (0.0-1.0)
public struct SearchProgressMessage: Codable {
    public let progress: Double
}

/// Sent from JS when search encounters an error
public struct SearchErrorMessage: Codable {
    public let message: String
}

/// Sent from JS when user completes a text selection (after long-press)
public struct TextSelectionMessage: Codable {
    public let sectionIndex: Int
    public let cfi: String
    public let text: String
    public let href: String
    public let title: String?
    public let startCssSelector: String
    public let startTextNodeIndex: Int
    public let startCharOffset: Int
    public let endCssSelector: String
    public let endTextNodeIndex: Int
    public let endCharOffset: Int
}

/// Sent from JS when a selection-toolbar swatch is tapped (mirrors TextSelectionMessage + colorId)
public struct SelectionHighlightMessage: Codable {
    public let sectionIndex: Int
    public let cfi: String
    public let text: String
    public let href: String
    public let title: String?
    public let startCssSelector: String
    public let startTextNodeIndex: Int
    public let startCharOffset: Int
    public let endCssSelector: String
    public let endTextNodeIndex: Int
    public let endCharOffset: Int
    public let colorId: String

    public var selection: TextSelectionMessage {
        TextSelectionMessage(
            sectionIndex: sectionIndex,
            cfi: cfi,
            text: text,
            href: href,
            title: title,
            startCssSelector: startCssSelector,
            startTextNodeIndex: startTextNodeIndex,
            startCharOffset: startCharOffset,
            endCssSelector: endCssSelector,
            endTextNodeIndex: endTextNodeIndex,
            endCharOffset: endCharOffset,
        )
    }
}

/// Sent from JS for a plain-text selection action (dictionary lookup / copy).
/// Rect fields (top-document viewport coords) are present for dictionary lookup
/// so macOS can anchor its definition popover at the selection.
public struct SelectionTextActionMessage: Codable {
    public let text: String
    public let x: Double?
    public let y: Double?
    public let width: Double?
    public let height: Double?
}

/// Sent from JS to recolor an existing highlight from the toolbar
public struct HighlightSetColorMessage: Codable {
    public let id: String
    public let colorId: String
}

/// Sent from JS to delete an existing highlight from the toolbar
public struct HighlightDeleteMessage: Codable {
    public let id: String
}

/// Sent from JS to edit an existing highlight (color/note) from the toolbar
public struct HighlightEditMessage: Codable {
    public let id: String
}

/// Response from getFirstVisiblePosition() for bookmark creation
public struct FirstVisiblePosition: Codable {
    public let cfi: String?
    public let text: String
    public let href: String
    public let title: String?
    public let elementId: String?
}
