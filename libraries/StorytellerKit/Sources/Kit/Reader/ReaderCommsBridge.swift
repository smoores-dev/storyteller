import Foundation

/// ReaderCommsBridge - Bridge for Swift-JS communication
///
/// Design principles:
/// - NO message wrapper/envelope pattern (no send<T> method)
/// - Swift calls JS directly through the platform's JSEvaluating adapter
/// - JS calls Swift via the platform's message-handler channel
/// - Callbacks notify the reader session of events

@StorytellerUIActor
public final class ReaderCommsBridge {
    public weak var js: (any JSEvaluating)?

    /// Notifies when book structure (TOC) is ready
    public var onBookStructureReady: ((BookStructureReadyMessage) -> Void)?

    /// Notifies when relocate event occurs (page turn, navigation, etc.)
    public var onRelocated: ((RelocatedMessage) -> Void)?

    /// Notifies when user swipe gesture flips a page (iOS touch swipe detected by JS)
    public var onPageFlipped: ((PageFlippedMessage) -> Void)?

    /// Notifies when user taps to toggle overlay (iOS only)
    public var onOverlayToggled: (() -> Void)?

    /// Notifies when user clicks margin zone to navigate (routed through EPM)
    public var onMarginClickNav: ((MarginClickNavMessage) -> Void)?

    /// Notifies when WebView key handling requests sentence skip
    public var onSentenceSkip: ((SentenceSkipMessage) -> Void)?

    /// Notifies when user double-clicks text to seek audio (or initial position)
    public var onMediaOverlaySeek: ((MediaOverlaySeekMessage) -> Void)?

    /// Notifies when media overlay progress updates (audio playback progress)
    public var onMediaOverlayProgress: ((MediaOverlayProgressMessage) -> Void)?

    /// Notifies when element visibility is reported (for page flip timing during audio)
    public var onElementVisibility: ((ElementVisibilityMessage) -> Void)?

    /// Notifies when search finds results in a section
    public var onSearchResults: ((SearchResultsMessage) -> Void)?

    /// Notifies of search progress (0.0-1.0)
    public var onSearchProgress: ((SearchProgressMessage) -> Void)?

    /// Notifies when search is complete
    public var onSearchComplete: (() -> Void)?

    /// Notifies when search encounters an error
    public var onSearchError: ((SearchErrorMessage) -> Void)?

    /// Notifies when user completes a text selection (for creating highlights)
    public var onTextSelected: ((TextSelectionMessage) -> Void)?

    /// Notifies when a selection-toolbar swatch is tapped (selection + chosen color)
    public var onSelectionHighlight: ((SelectionHighlightMessage) -> Void)?

    /// Notifies when an existing highlight's color is changed from the toolbar
    public var onHighlightSetColor: ((HighlightSetColorMessage) -> Void)?

    /// Notifies when an existing highlight is deleted from the toolbar
    public var onHighlightDelete: ((HighlightDeleteMessage) -> Void)?

    /// Notifies when an existing highlight should be edited (color/note) from the toolbar
    public var onHighlightEdit: ((HighlightEditMessage) -> Void)?

    /// Notifies when the selection should be translated via the system translate UI
    public var onSelectionTranslate: ((String) -> Void)?

    /// Notifies when the selection should be piped into the in-book search panel
    public var onSelectionSearch: ((String) -> Void)?

    public init(js: (any JSEvaluating)? = nil) {
        self.js = js
    }

    /// JS is sending Swift a BookStructureReady event when book TOC is loaded
    public func sendSwiftBookStructureReady(_ message: BookStructureReadyMessage) {
        debugLog(
            "[ReaderCommsBridge] sendSwiftBookStructureReady - \(message.sections.count) sections"
        )
        onBookStructureReady?(message)
    }

    /// JS is sending Swift a Relocated event when user navigates, page turns, resizes, etc.
    public func sendSwiftRelocated(_ message: RelocatedMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftRelocated")
        debugLog(
            "[ReaderCommsBridge]   section: \(message.sectionIndex?.description ?? "nil"), page: \(message.pageIndex?.description ?? "nil")"
        )
        debugLog("[ReaderCommsBridge]   href: \(message.href ?? "nil")")
        debugLog("[ReaderCommsBridge]   cfi: \(message.cfi)")
        debugLog(
            "[ReaderCommsBridge]   fraction: \(message.fraction?.description ?? "nil"), chapterFraction: \(message.chapterFraction?.description ?? "nil")"
        )
        onRelocated?(message)
    }

    /// JS detected a user swipe that flipped the page
    public func sendSwiftPageFlipped(_ message: PageFlippedMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftPageFlipped - direction: \(message.direction)")
        onPageFlipped?(message)
    }

    /// JS detected a user tap to toggle overlay visibility
    public func sendSwiftOverlayToggled(_: OverlayToggledMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftOverlayToggled")
        onOverlayToggled?()
    }

    /// JS detected a margin click for navigation
    public func sendSwiftMarginClickNav(_ message: MarginClickNavMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftMarginClickNav - direction: \(message.direction)")
        onMarginClickNav?(message)
    }

    public func sendSwiftSentenceSkip(_ message: SentenceSkipMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftSentenceSkip - direction: \(message.direction)")
        onSentenceSkip?(message)
    }

    /// JS detected a media overlay seek event (double-click or initial position)
    public func sendSwiftMediaOverlaySeek(_ message: MediaOverlaySeekMessage) {
        debugLog(
            "[ReaderCommsBridge] sendSwiftMediaOverlaySeek - section: \(message.sectionIndex), anchor: \(message.anchor)"
        )
        onMediaOverlaySeek?(message)
    }

    /// JS is sending Swift a media overlay progress update (audio playback position)
    public func sendSwiftMediaOverlayProgress(_ message: MediaOverlayProgressMessage) {
        debugLog(
            "[ReaderCommsBridge] sendSwiftMediaOverlayProgress - section: \(message.sectionIndex)"
        )
        onMediaOverlayProgress?(message)
    }

    /// JS is reporting element visibility for page flip timing during audio narration
    public func sendSwiftElementVisibility(_ message: ElementVisibilityMessage) {
        debugLog(
            "[ReaderCommsBridge] sendSwiftElementVisibility - textId: \(message.textId), visible: \(message.visibleRatio), offScreen: \(message.offScreenRatio)"
        )
        onElementVisibility?(message)
    }

    public func sendJsGoLeftCommand() async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        debugLog("[ReaderCommsBridge] sendJsGoLeftCommand()")
        _ = try await js.evaluate("window.foliateManager.goLeft()")
    }

    /// Swift commands JS to navigate right (next page)
    public func sendJsGoRightCommand() async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        debugLog("[ReaderCommsBridge] sendJsGoRightCommand()")
        _ = try await js.evaluate("window.foliateManager.goRight()")
    }

    /// Swift commands JS to navigate to a specific href (with optional fragment)
    public func sendJsGoToHrefCommand(href: String) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let escapedHref = href.replacingOccurrences(of: "'", with: "\\'")
        debugLog("[ReaderCommsBridge] sendJsGoToHrefCommand(href: \(href))")
        _ = try await js.evaluate("window.foliateManager.goTo('\(escapedHref)')")
    }

    /// Swift commands JS to locate an image by filename within a section and navigate to it
    public func sendJsGoToImageCommand(sectionIndex: Int, filename: String) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let escaped = filename.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        debugLog(
            "[ReaderCommsBridge] sendJsGoToImageCommand(section: \(sectionIndex), filename: \(filename))"
        )
        _ = try await js.evaluate(
            "(function() { window.foliateManager.goToImage(\(sectionIndex), '\(escaped)'); })()"
        )
    }

    /// Swift commands JS to navigate to a Readium locator (href + optional fragment)
    /// Audio locators (type contains "audio") skip fragment navigation and use totalProgression
    public func sendJsGoToLocatorCommand(locator: BookLocator) async throws {
        let isAudioLocator = locator.type.contains("audio")
        let totalProgression = locator.locations?.totalProgression

        if isAudioLocator, totalProgression == nil {
            debugLog("[ReaderCommsBridge] Audio locator missing totalProgression; skipping nav")
            return
        }

        if let fragment = locator.locations?.fragments?.first, !isAudioLocator {
            let href = "\(locator.href)#\(fragment)"
            try await sendJsGoToHrefCommand(href: href)
        } else if let totalProgression {
            try await sendJsGoToBookFractionCommand(fraction: totalProgression)
        } else {
            try await sendJsGoToHrefCommand(href: locator.href)
        }
    }

    /// Swift commands JS to navigate to a specific fraction within a section/chapter
    public func sendJsGoToFractionInSectionCommand(sectionIndex: Int, fraction: Double) async throws
    {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        debugLog(
            "[ReaderCommsBridge] sendJsGoToFractionInSectionCommand(section: \(sectionIndex), fraction: \(fraction))"
        )

        // goToFractionInSection is async, so we wrap it in an IIFE that returns undefined immediately
        // We fire-and-forget - we'll get the result via the Relocated message
        _ = try await js.evaluate(
            "(function() { window.foliateManager.goToFractionInSection(\(sectionIndex), \(fraction)); })()"
        )
    }

    /// Swift commands JS to navigate to a book-wide fraction (0.0 - 1.0)
    /// Used when translating audio locators to text positions via totalProgression
    public func sendJsGoToBookFractionCommand(fraction: Double) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        debugLog("[ReaderCommsBridge] sendJsGoToBookFractionCommand(fraction: \(fraction))")
        _ = try await js.evaluate(
            "(function() { window.foliateManager.goToBookFraction(\(fraction)); })()"
        )
    }

    /// Swift is requesting fully visible element IDs from JS
    /// Returns: Array of element IDs that are fully contained in the current page range
    public func sendJsGetFullyVisibleElementIds() async throws -> [String]? {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let result = try await js.evaluate(
            "JSON.stringify(window.foliateManager.getFullyVisibleElementIds())"
        )

        guard let jsonString = result,
            let jsonData = jsonString.data(using: .utf8)
        else {
            return nil
        }

        let decoded = try? JSONDecoder().decode([String].self, from: jsonData)
        return decoded
    }

    /// Swift is requesting the first visible position from JS for bookmarks
    /// Returns: Position data including sectionIndex, CFI, text, href, title
    public func sendJsGetFirstVisiblePosition() async throws -> FirstVisiblePosition? {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let result = try await js.evaluate(
            "JSON.stringify(window.foliateManager.getFirstVisiblePosition())"
        )

        guard let jsonString = result,
            jsonString != "null",
            let jsonData = jsonString.data(using: .utf8)
        else {
            return nil
        }

        return try? JSONDecoder().decode(FirstVisiblePosition.self, from: jsonData)
    }

    /// Swift commands JS to highlight a specific text fragment
    /// JS will apply highlight CSS and report visibility for page flip timing
    /// - Parameters:
    ///   - sectionIndex: The section index
    ///   - textId: The text element ID to highlight
    ///   - seekToLocation: If true, navigates the view to the element before highlighting
    public func sendJsHighlightFragment(
        sectionIndex: Int,
        textId: String,
        seekToLocation: Bool = false,
    )
        async throws
    {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let escapedTextId = textId.replacingOccurrences(of: "'", with: "\\'")
        debugLog(
            "[ReaderCommsBridge] sendJsHighlightFragment(sectionIndex: \(sectionIndex), textId: \(textId), seekToLocation: \(seekToLocation))"
        )
        _ = try await js.evaluate(
            "window.foliateManager.highlightFragment(\(sectionIndex), '\(escapedTextId)', \(seekToLocation))"
        )
    }

    public func sendJsSetPlaybackActive(_ active: Bool) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        debugLog("[ReaderCommsBridge] sendJsSetPlaybackActive(\(active))")
        _ = try await js.evaluate("window.foliateManager.setPlaybackActive(\(active))")
    }

    /// Swift commands JS to clear any active highlight
    public func sendJsClearHighlight() async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        debugLog("[ReaderCommsBridge] sendJsClearHighlight()")
        _ = try await js.evaluate("window.foliateManager.clearHighlight()")
    }

    /// Swift commands JS to update reader styles (font, colors, margins, etc.)
    public func sendJsUpdateStyles(
        fontSize: Double,
        fontFamily: String,
        lineSpacing: Double,
        isDarkMode: Bool,
        marginLeftRight: Double,
        marginTop: Double,
        marginBottom: Double,
        wordSpacing: Double,
        letterSpacing: Double,
        paragraphSpacing: Double,
        firstLineIndent: Bool,
        textAlignment: String,
        highlightColor: String,
        highlightThickness: Double,
        backgroundColor: String?,
        foregroundColor: String?,
        customCSS: String?,
        singleColumnMode: Bool,
        scrollingMode: Bool,
        hasAudioNarration: Bool,
        enableMarginClickNavigation: Bool,
        userHighlightMode: String,
        readaloudHighlightMode: String,
        readaloudDimOthers: Bool = false,
        readaloudDimAmount: Double = 0,
        readaloudHighlightFade: Double = 0,
        readaloudTextItalic: Bool = false,
        readaloudTextBold: Bool = false,
        readaloudUnderlineStyle: String = "solid",
    ) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        var styles: [String: Any] = [
            "fontSize": fontSize,
            "fontFamily": fontFamily,
            "lineSpacing": lineSpacing,
            "isDarkMode": isDarkMode,
            "marginLeftRight": marginLeftRight,
            "marginTop": marginTop,
            "marginBottom": marginBottom,
            "wordSpacing": wordSpacing,
            "letterSpacing": letterSpacing,
            "paragraphSpacing": paragraphSpacing,
            "firstLineIndent": firstLineIndent,
            "textAlign": textAlignment,
            "highlightColor": highlightColor,
            "highlightThickness": highlightThickness,
            "singleColumnMode": singleColumnMode,
            "scrollingMode": scrollingMode,
            "hasAudioNarration": hasAudioNarration,
            "enableMarginClickNavigation": enableMarginClickNavigation,
            "userHighlightMode": userHighlightMode,
            "readaloudHighlightMode": readaloudHighlightMode,
            "readaloudDimOthers": readaloudDimOthers,
            "readaloudDimAmount": readaloudDimAmount,
            "readaloudHighlightFade": readaloudHighlightFade,
            "readaloudTextItalic": readaloudTextItalic,
            "readaloudTextBold": readaloudTextBold,
            "readaloudUnderlineStyle": readaloudUnderlineStyle,
        ]

        styles["backgroundColor"] = backgroundColor ?? NSNull()
        styles["foregroundColor"] = foregroundColor ?? NSNull()
        if let customCSS = customCSS {
            styles["customCSS"] = customCSS
        }

        let jsonData = try JSONSerialization.data(withJSONObject: styles)
        let jsonString = String(data: jsonData, encoding: .utf8)!
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")

        debugLog("[ReaderCommsBridge] sendJsUpdateStyles()")
        let script = "window.foliateManager.updateStyles('\(jsonString)')"
        _ = try await js.evaluate(script)
    }

    public func sendSwiftSearchResults(_ message: SearchResultsMessage) {
        debugLog(
            "[ReaderCommsBridge] sendSwiftSearchResults - \(message.results.count) results in \(message.sectionLabel)"
        )
        onSearchResults?(message)
    }

    public func sendSwiftSearchProgress(_ message: SearchProgressMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftSearchProgress - \(message.progress)")
        onSearchProgress?(message)
    }

    public func sendSwiftSearchComplete() {
        debugLog("[ReaderCommsBridge] sendSwiftSearchComplete")
        onSearchComplete?()
    }

    public func sendSwiftSearchError(_ message: SearchErrorMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftSearchError - \(message.message)")
        onSearchError?(message)
    }

    /// Swift commands JS to start a search
    public func sendJsStartSearchCommand(
        query: String,
        matchCase: Bool = false,
        matchDiacritics: Bool = false,
        matchWholeWords: Bool = false,
    ) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let escapedQuery =
            query
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")

        let options: [String: Any] = [
            "matchCase": matchCase,
            "matchDiacritics": matchDiacritics,
            "matchWholeWords": matchWholeWords,
        ]
        let optionsJson = try JSONSerialization.data(withJSONObject: options)
        let optionsString = String(data: optionsJson, encoding: .utf8)!

        debugLog("[ReaderCommsBridge] sendJsStartSearchCommand(query: \(query))")
        _ = try await js.evaluate(
            "(function() { window.foliateManager.startSearch('\(escapedQuery)', \(optionsString)); })()"
        )
    }

    /// Swift commands JS to clear search results
    public func sendJsClearSearchCommand() async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        debugLog("[ReaderCommsBridge] sendJsClearSearchCommand()")
        _ = try await js.evaluate("window.foliateManager.clearSearch()")
    }

    /// Swift commands JS to navigate to a CFI (for search result navigation)
    public func sendJsGoToCFICommand(cfi: String) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let escapedCFI =
            cfi
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        debugLog("[ReaderCommsBridge] sendJsGoToCFICommand(cfi: \(cfi))")
        _ = try await js.evaluate(
            "(function() { window.foliateManager.goToCFI('\(escapedCFI)'); })()"
        )
    }

    public func sendSwiftTextSelected(_ message: TextSelectionMessage) {
        debugLog(
            "[ReaderCommsBridge] sendSwiftTextSelected - section: \(message.sectionIndex), text: \(message.text.prefix(50))..."
        )
        onTextSelected?(message)
    }

    public func sendSwiftSelectionHighlight(_ message: SelectionHighlightMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftSelectionHighlight - color: \(message.colorId)")
        onSelectionHighlight?(message)
    }

    public func sendSwiftHighlightSetColor(_ message: HighlightSetColorMessage) {
        debugLog(
            "[ReaderCommsBridge] sendSwiftHighlightSetColor - id: \(message.id), color: \(message.colorId)"
        )
        onHighlightSetColor?(message)
    }

    public func sendSwiftHighlightDelete(_ message: HighlightDeleteMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftHighlightDelete - id: \(message.id)")
        onHighlightDelete?(message)
    }

    public func sendSwiftHighlightEdit(_ message: HighlightEditMessage) {
        debugLog("[ReaderCommsBridge] sendSwiftHighlightEdit - id: \(message.id)")
        onHighlightEdit?(message)
    }

    public func sendSwiftSelectionTranslate(_ text: String) {
        debugLog("[ReaderCommsBridge] sendSwiftSelectionTranslate")
        onSelectionTranslate?(text)
    }

    public func sendSwiftSelectionSearch(_ text: String) {
        debugLog("[ReaderCommsBridge] sendSwiftSelectionSearch")
        onSelectionSearch?(text)
    }

    /// Swift commands JS to render user highlights
    public func sendJsRenderHighlights(_ highlights: [HighlightRenderData]) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let encoder = JSONEncoder()
        let jsonData = try encoder.encode(highlights)
        let jsonString = String(data: jsonData, encoding: .utf8)!
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")

        debugLog("[ReaderCommsBridge] sendJsRenderHighlights - \(highlights.count) highlights")
        _ = try await js.evaluate(
            "(function() { window.foliateManager.renderHighlights('\(jsonString)'); })()"
        )
    }

    /// Swift commands JS to remove a specific highlight
    public func sendJsRemoveHighlight(id: String) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let escapedId = id.replacingOccurrences(of: "'", with: "\\'")
        debugLog("[ReaderCommsBridge] sendJsRemoveHighlight(id: \(id))")
        _ = try await js.evaluate(
            "window.foliateManager.removeHighlight('\(escapedId)')"
        )
    }

    /// Swift pushes the configured highlight palette so the selection toolbar can render swatches
    public func sendJsSetHighlightPalette(_ entries: [HighlightPaletteEntry]) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let jsonData = try JSONEncoder().encode(entries)
        let jsonString = String(data: jsonData, encoding: .utf8)!
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")

        _ = try await js.evaluate(
            "(function() { window.foliateManager.setHighlightPalette('\(jsonString)'); })()"
        )
    }

    /// Tells the selection toolbar whether to offer a Translate button (system support is OS-version gated)
    public func sendJsSetTranslateAvailable(_ available: Bool) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        _ = try await js.evaluate(
            "(function() { window.foliateManager.setTranslateAvailable(\(available ? "true" : "false")); })()"
        )
    }

    /// Pushes the last-used highlight color so the toolbar shows it as the lead swatch
    public func sendJsSetDefaultHighlightColor(_ colorId: String) async throws {
        guard let js else {
            throw ReaderCommsBridgeError.jsNotAvailable
        }

        let escaped =
            colorId
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        _ = try await js.evaluate(
            "(function() { window.foliateManager.setDefaultHighlightColor('\(escaped)'); })()"
        )
    }
}

public enum ReaderCommsBridgeError: Error, LocalizedError {
    case jsNotAvailable

    public var errorDescription: String? {
        switch self {
            case .jsNotAvailable:
                return "JS evaluator is not available"
        }
    }
}
