import Foundation

/// Exchanges commands, snapshots, and receipts with the WebView.
@StorytellerUIActor
public final class ReaderBridge {
    public var onNavigationRequest: ((ReaderTarget) -> Void)?
    public var onDocumentNavigationRequest: ((DocumentNavigationRequest) -> Void)?
    public var onReadingState: ((ReaderSnapshot) -> Void)?
    public weak var js: (any JSEvaluating)?

    /// Notifies when book structure (TOC) is ready
    public var onBookStructureReady: ((BookStructureReadyMessage) -> Void)?

    /// Notifies when user taps to toggle overlay (iOS only)
    public var onOverlayToggled: (() -> Void)?

    /// Requests navigation from a margin click.
    public var onMarginClickNav: ((MarginClickNavMessage) -> Void)?

    /// Notifies when WebView key handling requests sentence skip
    public var onSentenceSkip: ((SentenceSkipMessage) -> Void)?

    /// Notifies when user double-clicks text to seek audio (or initial position)
    public var onMediaOverlaySeek: ((MediaOverlaySeekMessage) -> Void)?

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
            "[ReaderBridge] sendSwiftBookStructureReady - \(message.sections.count) sections"
        )
        onBookStructureReady?(message)
    }

    /// JS detected a user tap to toggle overlay visibility
    public func sendSwiftOverlayToggled(_: OverlayToggledMessage) {
        debugLog("[ReaderBridge] sendSwiftOverlayToggled")
        onOverlayToggled?()
    }

    /// JS detected a margin click for navigation
    public func sendSwiftMarginClickNav(_ message: MarginClickNavMessage) {
        debugLog("[ReaderBridge] sendSwiftMarginClickNav - direction: \(message.direction)")
        onMarginClickNav?(message)
    }

    public func sendSwiftSentenceSkip(_ message: SentenceSkipMessage) {
        debugLog("[ReaderBridge] sendSwiftSentenceSkip - direction: \(message.direction)")
        onSentenceSkip?(message)
    }

    /// JS detected a media overlay seek event (double-click or initial position)
    public func sendSwiftMediaOverlaySeek(_ message: MediaOverlaySeekMessage) {
        debugLog(
            "[ReaderBridge] sendSwiftMediaOverlaySeek - section: \(message.sectionIndex), anchor: \(message.anchor)"
        )
        onMediaOverlaySeek?(message)
    }

    // Route navigation through the session before dispatching to JS.
    private func requestNavigation(_ target: ReaderTarget) throws {
        guard let onNavigationRequest else { throw ReaderBridgeError.jsNotAvailable }
        onNavigationRequest(target)
    }

    public func sendJsGoLeftCommand() async throws {
        try await sendJsGoLeftCommand(commandID: nil)
    }

    func sendJsGoLeftCommand(commandID: String?) async throws {
        try requestNavigation(ReaderTarget(kind: "left"))
    }

    public func sendJsGoRightCommand() async throws {
        try await sendJsGoRightCommand(animated: true)
    }

    func sendJsGoRightCommand(animated: Bool, commandID: String? = nil) async throws {
        try requestNavigation(ReaderTarget(kind: "right", animated: animated))
    }

    public func sendJsGoToHrefCommand(href: String) async throws {
        try requestNavigation(ReaderTarget(kind: "href", value: href))
    }

    /// Navigates to an image by filename within a section.
    public func sendJsGoToImageCommand(sectionIndex: Int, filename: String) async throws {
        try requestNavigation(
            ReaderTarget(kind: "image", value: filename, sectionIndex: sectionIndex)
        )
    }

    public func sendJsGoToLocatorCommand(locator: BookLocator) async throws {
        try requestNavigation(.location(locator))
    }

    public func sendJsGoToFractionInSectionCommand(sectionIndex: Int, fraction: Double) async throws
    {
        try requestNavigation(
            ReaderTarget(kind: "section", sectionIndex: sectionIndex, fraction: fraction)
        )
    }

    /// Navigates to a book fraction in the range 0...1.
    public func sendJsGoToBookFractionCommand(fraction: Double) async throws {
        try requestNavigation(ReaderTarget(kind: "fraction", fraction: fraction))
    }

    /// Returns the first visible text position for bookmarking.
    public func sendJsGetFirstVisiblePosition() async throws -> FirstVisiblePosition? {
        guard let js else {
            throw ReaderBridgeError.jsNotAvailable
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
        disableReaderAnimations: Bool,
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
            throw ReaderBridgeError.jsNotAvailable
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
            "disableReaderAnimations": disableReaderAnimations,
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

        debugLog("[ReaderBridge] sendJsUpdateStyles()")
        let script = "window.foliateManager.updateStyles('\(jsonString)')"
        _ = try await js.evaluate(script)
    }

    public func sendSwiftSearchResults(_ message: SearchResultsMessage) {
        debugLog(
            "[ReaderBridge] sendSwiftSearchResults - \(message.results.count) results in \(message.sectionLabel)"
        )
        onSearchResults?(message)
    }

    public func sendSwiftSearchProgress(_ message: SearchProgressMessage) {
        debugLog("[ReaderBridge] sendSwiftSearchProgress - \(message.progress)")
        onSearchProgress?(message)
    }

    public func sendSwiftSearchComplete() {
        debugLog("[ReaderBridge] sendSwiftSearchComplete")
        onSearchComplete?()
    }

    public func sendSwiftSearchError(_ message: SearchErrorMessage) {
        debugLog("[ReaderBridge] sendSwiftSearchError - \(message.message)")
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
            throw ReaderBridgeError.jsNotAvailable
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

        debugLog("[ReaderBridge] sendJsStartSearchCommand(query: \(query))")
        _ = try await js.evaluate(
            "(function() { window.foliateManager.startSearch('\(escapedQuery)', \(optionsString)); })()"
        )
    }

    /// Swift commands JS to clear search results
    public func sendJsClearSearchCommand() async throws {
        guard let js else {
            throw ReaderBridgeError.jsNotAvailable
        }

        debugLog("[ReaderBridge] sendJsClearSearchCommand()")
        _ = try await js.evaluate("window.foliateManager.clearSearch()")
    }

    /// Swift commands JS to navigate to a CFI (for search result navigation)
    public func sendJsGoToCFICommand(cfi: String) async throws {
        try requestNavigation(ReaderTarget(kind: "cfi", value: cfi))
    }

    public func sendSwiftTextSelected(_ message: TextSelectionMessage) {
        debugLog(
            "[ReaderBridge] sendSwiftTextSelected - section: \(message.sectionIndex), text: \(message.text.prefix(50))..."
        )
        onTextSelected?(message)
    }

    public func sendSwiftSelectionHighlight(_ message: SelectionHighlightMessage) {
        debugLog("[ReaderBridge] sendSwiftSelectionHighlight - color: \(message.colorId)")
        onSelectionHighlight?(message)
    }

    public func sendSwiftHighlightSetColor(_ message: HighlightSetColorMessage) {
        debugLog(
            "[ReaderBridge] sendSwiftHighlightSetColor - id: \(message.id), color: \(message.colorId)"
        )
        onHighlightSetColor?(message)
    }

    public func sendSwiftHighlightDelete(_ message: HighlightDeleteMessage) {
        debugLog("[ReaderBridge] sendSwiftHighlightDelete - id: \(message.id)")
        onHighlightDelete?(message)
    }

    public func sendSwiftHighlightEdit(_ message: HighlightEditMessage) {
        debugLog("[ReaderBridge] sendSwiftHighlightEdit - id: \(message.id)")
        onHighlightEdit?(message)
    }

    public func sendSwiftSelectionTranslate(_ text: String) {
        debugLog("[ReaderBridge] sendSwiftSelectionTranslate")
        onSelectionTranslate?(text)
    }

    public func sendSwiftSelectionSearch(_ text: String) {
        debugLog("[ReaderBridge] sendSwiftSelectionSearch")
        onSelectionSearch?(text)
    }

    /// Swift commands JS to render user highlights
    public func sendJsRenderHighlights(_ highlights: [HighlightRenderData]) async throws {
        guard let js else {
            throw ReaderBridgeError.jsNotAvailable
        }

        let encoder = JSONEncoder()
        let jsonData = try encoder.encode(highlights)
        let jsonString = String(data: jsonData, encoding: .utf8)!
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")

        debugLog("[ReaderBridge] sendJsRenderHighlights - \(highlights.count) highlights")
        _ = try await js.evaluate(
            "(function() { window.foliateManager.renderHighlights('\(jsonString)'); })()"
        )
    }

    /// Swift commands JS to remove a specific highlight
    public func sendJsRemoveHighlight(id: String) async throws {
        guard let js else {
            throw ReaderBridgeError.jsNotAvailable
        }

        let escapedId = id.replacingOccurrences(of: "'", with: "\\'")
        debugLog("[ReaderBridge] sendJsRemoveHighlight(id: \(id))")
        _ = try await js.evaluate(
            "window.foliateManager.removeHighlight('\(escapedId)')"
        )
    }

    /// Swift pushes the configured highlight palette so the selection toolbar can render swatches
    public func sendJsSetHighlightPalette(_ entries: [HighlightPaletteEntry]) async throws {
        guard let js else {
            throw ReaderBridgeError.jsNotAvailable
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
            throw ReaderBridgeError.jsNotAvailable
        }

        _ = try await js.evaluate(
            "(function() { window.foliateManager.setTranslateAvailable(\(available ? "true" : "false")); })()"
        )
    }

    /// Pushes the last-used highlight color so the toolbar shows it as the lead swatch
    public func sendJsSetDefaultHighlightColor(_ colorId: String) async throws {
        guard let js else {
            throw ReaderBridgeError.jsNotAvailable
        }

        let escaped =
            colorId
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        _ = try await js.evaluate(
            "(function() { window.foliateManager.setDefaultHighlightColor('\(escaped)'); })()"
        )
    }

    func presentReading(
        documentID: String,
        playing: Bool,
        highlight: Bool,
        follow: Bool,
        anchor: ReaderPlayhead?,
    ) async throws {
        let request = ReaderPresentation(
            documentID: documentID,
            playing: playing,
            highlight: highlight,
            follow: follow,
            anchor: anchor,
        )
        let result = try await evaluateReading(
            "JSON.stringify(window.foliateManager.presentReading(\(try encodeReading(request))))"
        )
        guard result == "true" else { throw ReaderBridgeError.jsNotAvailable }
    }

    private func encodeReading<T: Encodable>(_ value: T) throws -> String {
        String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }
    public func readingSnapshot(playhead: ReaderPlayhead? = nil) async throws -> ReaderSnapshot {
        let argument = try encodeReading(playhead)
        guard
            let text = try await evaluateReading(
                "JSON.stringify(window.foliateManager.readingSnapshot(\(argument)))"
            ),
            let data = text.data(using: .utf8)
        else { throw ReaderBridgeError.jsNotAvailable }
        return try JSONDecoder().decode(ReaderSnapshot.self, from: data)
    }
    func dispatchReading(_ command: ReaderCommand) async throws {
        _ = try await evaluateReading(
            "JSON.stringify(window.foliateManager.readingCommand(\(try encodeReading(command))))"
        )
    }
    func acknowledgeReading(documentID: String, commandID: String? = nil, gestureID: String? = nil)
        async throws
    {
        _ = try await evaluateReading(
            "window.foliateManager.acknowledgeReading(\(try encodeReading(documentID)), \(try encodeReading(commandID)), \(try encodeReading(gestureID)))"
        )
    }

    /// Evaluates JavaScript with a 1.5-second timeout.
    func evaluateReading(_ script: String) async throws -> String? {
        guard let js else { throw ReaderBridgeError.jsNotAvailable }
        let gate = ReadingEvaluation()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                gate.continuation = continuation
                if Task.isCancelled {
                    gate.finish(.failure(CancellationError()))
                    return
                }
                Task { @StorytellerUIActor in
                    do { gate.finish(.success(try await js.evaluate(script))) } catch {
                        gate.finish(.failure(error))
                    }
                }
                Task { @StorytellerUIActor in
                    try? await Task.sleep(for: .milliseconds(1500))
                    gate.finish(.failure(ReaderBridgeError.jsNotAvailable))
                }
            }
        } onCancel: {
            Task { @StorytellerUIActor in gate.finish(.failure(CancellationError())) }
        }
    }
}

public enum ReaderBridgeError: Error, LocalizedError {
    case jsNotAvailable

    public var errorDescription: String? {
        switch self {
            case .jsNotAvailable:
                return "JS evaluator is not available"
        }
    }
}

@StorytellerUIActor
private final class ReadingEvaluation {
    var continuation: CheckedContinuation<String?, Error>?
    func finish(_ result: Result<String?, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(with: result)
    }
}
