import Foundation


public struct ReaderLocation: Codable, Sendable, Equatable {
    public var sectionIndex: Int?
    public var pageIndex: Int?
    public var totalPages: Int?
    public var href: String?
    public var cfi: String?
    public var fraction: Double?
    public var chapterFraction: Double?
    public var flow: String?
    public var reason: String?

    var locator: BookLocator? {
        guard let href else { return nil }
        return BookLocator(
            href: href,
            type: "application/xhtml+xml",
            title: nil,
            locations: BookLocator.Locations(
                fragments: nil,
                progression: chapterFraction,
                position: nil,
                totalProgression: fraction,
                cssSelector: nil,
                partialCfi: cfi?.isEmpty == false ? cfi : nil,
                domRange: nil,
            ),
            text: nil,
        )
    }
}

public struct ReaderPlayhead: Codable, Sendable, Equatable {
    public let sectionIndex: Int
    public let textId: String
    public var visible: Bool? = nil
    public var visibleRatio: Double? = nil
    public var offScreenRatio: Double? = nil
}

public struct ReaderReceipt: Codable, Sendable {
    public let id: String
    public let status: String
    public let location: ReaderLocation?
    public let error: String?
}

public struct ReaderGesture: Codable, Sendable {
    public let id: String
    public let active: Bool
    public let moved: Bool
    public let location: ReaderLocation?
}

public struct ReaderSnapshot: Codable, Sendable {
    public let documentID: String
    public let ready: Bool
    public let sequence: UInt64
    public let location: ReaderLocation?
    public let command: ReaderReceipt?
    public let gesture: ReaderGesture?
    public let navigationBlocked: Bool
    /// All elements intersecting the viewport, including split sentences.
    public let visibleIDs: [String]?
    public let fullyVisibleIDs: [String]?
    public let playhead: ReaderPlayhead?
}

/// A navigation target.
public struct ReaderTarget: Codable, Sendable, Equatable {
    public var kind: String
    public var value: String? = nil
    public var sectionIndex: Int? = nil
    public var fraction: Double? = nil
    public var textId: String? = nil
    public var animated: Bool? = nil

    var isRelative: Bool {
        ["left", "right", "next", "previous", "scrollUp", "scrollDown"].contains(kind)
    }
    static func location(_ locator: BookLocator) -> Self {
        if let cfi = locator.locations?.partialCfi, !locator.type.contains("audio") {
            return Self(kind: "cfi", value: cfi)
        }
        if let fragment = locator.locations?.fragments?.first, !locator.type.contains("audio") {
            return Self(kind: "href", value: "\(locator.href)#\(fragment)")
        }
        if let fraction = locator.locations?.totalProgression {
            return Self(kind: "fraction", fraction: fraction)
        }
        return Self(kind: "href", value: locator.href)
    }
}

struct ReaderCommand: Codable, Sendable {
    let documentID: String
    let id: String
    let kind: String
    let value: String?
    let sectionIndex: Int?
    let fraction: Double?
    let textId: String?
    let animated: Bool?

    init(documentID: String, id: String, target: ReaderTarget) {
        self.documentID = documentID
        self.id = id
        self.kind = target.kind
        self.value = target.value
        self.sectionIndex = target.sectionIndex
        self.fraction = target.fraction
        self.textId = target.textId
        self.animated = target.animated
    }
}

public struct DocumentNavigationRequest: Codable, Sendable {
    public let documentID: String
    public let target: ReaderTarget
}

/// Playback and highlight settings for the reader.
struct ReaderPresentation: Encodable {
    let documentID: String
    let playing: Bool
    let highlight: Bool
    let follow: Bool
    let anchor: ReaderPlayhead?
}

public struct BookStructureReadyMessage: Codable {
    public let sections: [SectionInfo]
    public let isRTL: Bool?

    enum CodingKeys: String, CodingKey {
        case sections
        case isRTL = "isRtl"
    }
}

/// Sent when user taps to toggle overlay visibility (iOS only)
public struct OverlayToggledMessage: Codable {
}

/// Requests navigation from a margin click.
public struct MarginClickNavMessage: Codable {
    public let documentID: String
    public let direction: String
}

/// Sent when WebView-owned key handling should skip readaloud sentences
public struct SentenceSkipMessage: Codable {
    public let documentID: String
    public let direction: String
}

/// Sent when user double-clicks text to seek audio to that location
public struct MediaOverlaySeekMessage: Codable {
    public let documentID: String
    public let sectionIndex: Int
    public let anchor: String
}

// SectionInfo and SMILEntry are defined in Common/Models/SMILTypes.swift

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
