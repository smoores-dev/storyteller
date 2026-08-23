import Foundation

/// Decodes JS-to-Swift reader messages and dispatches them into the
/// ReaderCommsBridge callbacks. Platform coordinators feed every incoming
/// message through `route`; a false return means the message is
/// platform-local (native selection UI, diagnostics) and the caller keeps it.
@StorytellerUIActor
public final class ReaderMessageRouter {
    public weak var bridge: ReaderCommsBridge?
    public var onConsoleLog: ((_ level: String, _ message: String) -> Void)?
    public var onReaderReady: (() -> Void)?

    public init(bridge: ReaderCommsBridge? = nil) {
        self.bridge = bridge
    }

    @discardableResult
    public func route(name: String, body: Any) -> Bool {
        switch name {
            case "ConsoleLog":
                if let dict = body as? [String: Any],
                    let level = dict["level"] as? String,
                    let message = dict["message"] as? String
                {
                    onConsoleLog?(level, message)
                }
                return true

            case "ReaderReady":
                debugLog("[ReaderMessageRouter] Reader JS modules initialized")
                onReaderReady?()
                return true

            case "SelectionDefine", "SelectionShare", "SelectionCopy", "FileAccessDiagnostic":
                return false

            default:
                break
        }

        guard let bridge else {
            debugLog("[ReaderMessageRouter] CommsBridge not initialized for message: \(name)")
            return true
        }

        let decoder = JSONDecoder()

        do {
            switch name {
                case "BookStructureReady":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(BookStructureReadyMessage.self, from: data)
                    bridge.sendSwiftBookStructureReady(msg)

                case "Relocated":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(RelocatedMessage.self, from: data)
                    bridge.sendSwiftRelocated(msg)

                case "PageFlipped":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(PageFlippedMessage.self, from: data)
                    bridge.sendSwiftPageFlipped(msg)

                case "PageTurnSettled":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(PageTurnSettledMessage.self, from: data)
                    bridge.sendSwiftPageTurnSettled(msg)

                case "OverlayToggled":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(OverlayToggledMessage.self, from: data)
                    bridge.sendSwiftOverlayToggled(msg)

                case "MarginClickNav":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(MarginClickNavMessage.self, from: data)
                    bridge.sendSwiftMarginClickNav(msg)

                case "SentenceSkip":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(SentenceSkipMessage.self, from: data)
                    bridge.sendSwiftSentenceSkip(msg)

                case "mediaOverlaySeek":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(MediaOverlaySeekMessage.self, from: data)
                    bridge.sendSwiftMediaOverlaySeek(msg)

                case "MediaOverlayProgress":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(MediaOverlayProgressMessage.self, from: data)
                    bridge.sendSwiftMediaOverlayProgress(msg)

                case "ElementVisibility":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(ElementVisibilityMessage.self, from: data)
                    bridge.sendSwiftElementVisibility(msg)

                case "SearchResults":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(SearchResultsMessage.self, from: data)
                    bridge.sendSwiftSearchResults(msg)

                case "SearchProgress":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(SearchProgressMessage.self, from: data)
                    bridge.sendSwiftSearchProgress(msg)

                case "SearchComplete":
                    bridge.sendSwiftSearchComplete()

                case "SearchError":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(SearchErrorMessage.self, from: data)
                    bridge.sendSwiftSearchError(msg)

                case "TextSelection":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(TextSelectionMessage.self, from: data)
                    bridge.sendSwiftTextSelected(msg)

                case "SelectionHighlight":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(SelectionHighlightMessage.self, from: data)
                    bridge.sendSwiftSelectionHighlight(msg)

                case "SelectionTranslate":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(SelectionTextActionMessage.self, from: data)
                    bridge.sendSwiftSelectionTranslate(msg.text)

                case "SelectionSearch":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(SelectionTextActionMessage.self, from: data)
                    bridge.sendSwiftSelectionSearch(msg.text)

                case "HighlightSetColor":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(HighlightSetColorMessage.self, from: data)
                    bridge.sendSwiftHighlightSetColor(msg)

                case "HighlightDelete":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(HighlightDeleteMessage.self, from: data)
                    bridge.sendSwiftHighlightDelete(msg)

                case "HighlightEdit":
                    let data = try JSONSerialization.data(withJSONObject: body)
                    let msg = try decoder.decode(HighlightEditMessage.self, from: data)
                    bridge.sendSwiftHighlightEdit(msg)

                default:
                    return false
            }
        } catch {
            debugLog("[ReaderMessageRouter] Failed to decode message '\(name)': \(error)")
        }
        return true
    }
}
