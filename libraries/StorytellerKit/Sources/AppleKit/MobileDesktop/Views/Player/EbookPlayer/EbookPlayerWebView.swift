#if os(iOS) || os(macOS)
import SwiftUI
import WebKit

#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// EbookPlayerWebView - WebView integration for ebook reading
///
/// Handles messages from FoliateManager (see WebViewMessages.swift).

@available(macOS 14.0, iOS 17.0, *)
@MainActor
private let consoleOverrideScript = WKUserScript(
    source: """
        console.log = function(...args) {
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try { return JSON.stringify(arg); }
                    catch { return String(arg); }
                }
                return String(arg);
            }).join(' ');
            window.webkit.messageHandlers.ConsoleLog.postMessage({level: 'log', message});
        };
        console.error = function(...args) {
            const message = args.map(arg => {
                if (arg instanceof Error) {
                    return 'Error: ' + arg.message + '\\n' + (arg.stack || '');
                }
                if (typeof arg === 'object') {
                    try { return JSON.stringify(arg); }
                    catch { return String(arg); }
                }
                return String(arg);
            }).join(' ');
            window.webkit.messageHandlers.ConsoleLog.postMessage({level: 'error', message});
        };
        console.warn = function(...args) {
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try { return JSON.stringify(arg); }
                    catch { return String(arg); }
                }
                return String(arg);
            }).join(' ');
            window.webkit.messageHandlers.ConsoleLog.postMessage({level: 'warn', message});
        };
        window.addEventListener('error', function(e) {
            console.error('Global error:', e.error || e.message, 'at', e.filename, e.lineno, \
        e.colno);
        });
        window.addEventListener('unhandledrejection', function(e) {
            console.error('Unhandled promise rejection:', e.reason);
        });
        """,
    injectionTime: .atDocumentStart,
    forMainFrameOnly: false,
)

@available(macOS 14.0, iOS 17.0, *)
private func javaScriptStringLiteral(_ string: String) -> String {
    guard
        let data = try? JSONSerialization.data(withJSONObject: [string]),
        let arrayLiteral = String(data: data, encoding: .utf8)
    else {
        return "''"
    }

    return String(arrayLiteral.dropFirst().dropLast())
}

@available(macOS 14.0, iOS 17.0, *)
@MainActor
private func makeBookOpenScript(ebookPath: URL?) -> WKUserScript {
    let pathLiteral = ebookPath.map { javaScriptStringLiteral($0.path) } ?? "null"

    return WKUserScript(
        source: """
            (function() {
                window.storytellerBookPath = \(pathLiteral);
                window.nativeReady = window.storytellerBookPath !== null;
                window.jsReady = window.jsReady || false;
                window.storytellerOpenedBookPath = window.storytellerOpenedBookPath || null;
                window.storytellerOpeningBookPath = window.storytellerOpeningBookPath || null;

                window.tryOpenStorytellerBook = function(reason) {
                    if (!window.nativeReady || !window.jsReady || !window.storytellerBookPath) {
                        return false;
                    }

                    const loader = window.bookLoader;
                    if (!loader) {
                        window.jsReady = false;
                        return false;
                    }

                    if (window.storytellerOpenedBookPath === window.storytellerBookPath ||
                        window.storytellerOpeningBookPath === window.storytellerBookPath) {
                        return true;
                    }

                    window.storytellerOpeningBookPath = window.storytellerBookPath;
                    console.log('[StorytellerBookOpen] opening book', reason, window.storytellerBookPath);

                    const openPromise = loader.openBookFromDirectory(window.storytellerBookPath);

                    Promise.resolve(openPromise).then(function() {
                        window.storytellerOpenedBookPath = window.storytellerBookPath;
                        window.storytellerOpeningBookPath = null;
                    }).catch(function(error) {
                        window.storytellerOpeningBookPath = null;
                        console.error('[StorytellerBookOpen] failed to open book', error);
                    });

                    return true;
                };

                window.tryOpenStorytellerBook('nativeReady');
            })();
            """,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true,
    )
}

@available(macOS 14.0, iOS 17.0, *)
@MainActor
private class WebViewCoordinator2: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let onNavigationFinished: () -> Void
    let router = ReaderMessageRouter()
    var jsEvaluator: WKWebViewJSEvaluator?
    var commsBridge: ReaderCommsBridge? {
        didSet { router.bridge = commsBridge }
    }
    var onContentPurged: (() -> Void)?
    var onReaderReady: (() -> Void)?

    init(onNavigationFinished: @escaping () -> Void) {
        self.onNavigationFinished = onNavigationFinished
        super.init()
        router.onConsoleLog = { level, msg in
            let prefix =
                level == "error" ? "JS ERROR: " : level == "warn" ? "JS WARN: " : "JS: "
            debugLog("[EbookPlayerWebView] \(prefix)\(msg)")
        }
        router.onReaderReady = { [weak self] in
            self?.onReaderReady?()
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        debugLog("[EbookPlayerWebView] Web content process terminated")
        onContentPurged?()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
    ) {
        if router.route(name: message.name, body: message.body) {
            return
        }

        let decoder = JSONDecoder()

        do {
            switch message.name {
                case "SelectionDefine":
                    let data = try JSONSerialization.data(withJSONObject: message.body)
                    let msg = try decoder.decode(SelectionTextActionMessage.self, from: data)
                    let term = msg.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    #if os(macOS)
                    var rect: CGRect? = nil
                    if let x = msg.x, let y = msg.y, let w = msg.width, let h = msg.height {
                        rect = CGRect(x: x, y: y, width: w, height: h)
                    }
                    (message.webView as? HighlightableWebView)?
                        .presentDictionary(for: term, atViewportRect: rect)
                    #else
                    (message.webView as? HighlightableWebView)?.presentDictionary(for: term)
                    #endif

                case "SelectionShare":
                    let data = try JSONSerialization.data(withJSONObject: message.body)
                    let msg = try decoder.decode(SelectionTextActionMessage.self, from: data)
                    let text = msg.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    var rect: CGRect? = nil
                    if let x = msg.x, let y = msg.y, let w = msg.width, let h = msg.height {
                        rect = CGRect(x: x, y: y, width: w, height: h)
                    }
                    (message.webView as? HighlightableWebView)?
                        .presentShare(for: text, atViewportRect: rect)

                case "SelectionCopy":
                    let data = try JSONSerialization.data(withJSONObject: message.body)
                    let msg = try decoder.decode(SelectionTextActionMessage.self, from: data)
                    Self.copyToPasteboard(msg.text)

                case "FileAccessDiagnostic":
                    if let body = message.body as? [String: Any],
                        let filePath = body["filePath"] as? String,
                        let errorMessage = body["errorMessage"] as? String
                    {
                        Self.runFileAccessDiagnostic(
                            filePath: filePath,
                            errorMessage: errorMessage,
                        )
                    }

                default:
                    debugLog("[EbookPlayerWebView] Unknown message type: \(message.name)")
            }
        } catch {
            debugLog("[EbookPlayerWebView] Failed to decode message '\(message.name)': \(error)")
        }
    }

    static func copyToPasteboard(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(trimmed, forType: .string)
        #else
        UIPasteboard.general.string = trimmed
        #endif
    }

    static func runFileAccessDiagnostic(filePath: String, errorMessage: String) {
        let fm = FileManager.default
        let tag = "[FileAccessDiagnostic]"

        debugLog("\(tag) JS fetch failed for: \(filePath)")
        debugLog("\(tag) JS error: \(errorMessage)")

        let exists = fm.fileExists(atPath: filePath)
        debugLog("\(tag) FileManager.fileExists: \(exists)")

        if exists {
            let readable = fm.isReadableFile(atPath: filePath)
            debugLog("\(tag) FileManager.isReadableFile: \(readable)")

            do {
                let attrs = try fm.attributesOfItem(atPath: filePath)
                let protection = attrs[.protectionKey] as? FileProtectionType
                let fileSize = attrs[.size] as? UInt64 ?? 0
                debugLog("\(tag) File size: \(fileSize) bytes")
                debugLog(
                    "\(tag) File protection: \(protection?.rawValue ?? "nil (inheriting default)")"
                )
            } catch {
                debugLog("\(tag) Failed to read file attributes: \(error)")
            }

            do {
                let data = try Data(
                    contentsOf: URL(fileURLWithPath: filePath),
                    options: .mappedIfSafe,
                )
                debugLog("\(tag) Swift Data(contentsOf:) succeeded, \(data.count) bytes")
            } catch {
                debugLog("\(tag) Swift Data(contentsOf:) FAILED: \(error)")
            }
        }

        #if os(iOS)
        let protectedDataAvailable = UIApplication.shared.isProtectedDataAvailable
        debugLog("\(tag) isProtectedDataAvailable: \(protectedDataAvailable)")

        let availableMemory = os_proc_available_memory()
        debugLog("\(tag) os_proc_available_memory: \(availableMemory / 1_048_576) MB")
        #endif
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        debugLog("[EbookPlayerWebView] Navigation finished successfully")
        onNavigationFinished()
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error,
    ) {
        debugLog("[EbookPlayerWebView] Navigation failed: \(error.localizedDescription)")
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error,
    ) {
        debugLog(
            "[EbookPlayerWebView] Provisional navigation failed: \(error.localizedDescription)"
        )
    }
}

#if os(iOS)
@available(iOS 17.0, *)
class HighlightableWebView: WKWebView {
    var commsBridge: ReaderCommsBridge?

    func presentDictionary(for term: String) {
        guard !term.isEmpty,
            UIReferenceLibraryViewController.dictionaryHasDefinition(forTerm: term),
            let presenter = nearestViewController()
        else { return }
        presenter.present(UIReferenceLibraryViewController(term: term), animated: true)
    }

    func presentShare(for text: String, atViewportRect rect: CGRect?) {
        guard !text.isEmpty, let presenter = nearestViewController() else { return }
        let activityVC = UIActivityViewController(
            activityItems: [text],
            applicationActivities: nil,
        )
        if let pop = activityVC.popoverPresentationController {
            pop.sourceView = self
            pop.sourceRect = rect ?? CGRect(x: bounds.midX, y: bounds.midY, width: 0, height: 0)
        }
        presenter.present(activityVC, animated: true)
    }

    private func nearestViewController() -> UIViewController? {
        var responder: UIResponder? = self
        while let next = responder?.next {
            if let vc = next as? UIViewController { return vc }
            responder = next
        }
        return window?.rootViewController
    }

    // The compact in-page selection toolbar replaces the native callout menu entirely.
    override func buildMenu(with builder: any UIMenuBuilder) {
        super.buildMenu(with: builder)
        builder.remove(menu: .standardEdit)
        builder.remove(menu: .lookup)
        builder.remove(menu: .share)
        builder.remove(menu: .replace)
        builder.remove(menu: .learn)
    }
}
#endif

#if os(macOS)
@available(macOS 14.0, *)
class HighlightableWebView: WKWebView {
    var commsBridge: ReaderCommsBridge?

    func presentDictionary(for term: String, atViewportRect rect: CGRect?) {
        guard !term.isEmpty else { return }

        let point: NSPoint
        if let rect {
            // rect is top-left-origin viewport coords; flip if the view isn't flipped.
            var p = NSPoint(x: rect.midX, y: rect.maxY)
            if !isFlipped { p.y = bounds.height - p.y }
            point = p
        } else {
            point = NSPoint(x: bounds.midX, y: bounds.midY)
        }

        showDefinition(for: NSAttributedString(string: term), at: point)
    }

    func presentShare(for text: String, atViewportRect rect: CGRect?) {
        guard !text.isEmpty else { return }

        let anchor: NSRect
        if let rect {
            // rect is top-left-origin viewport coords; flip to bottom-left if needed.
            var r = rect
            if !isFlipped { r.origin.y = bounds.height - rect.maxY }
            anchor = r
        } else {
            anchor = NSRect(x: bounds.midX, y: bounds.midY, width: 1, height: 1)
        }

        let picker = NSSharingServicePicker(items: [text])
        picker.show(relativeTo: anchor, of: self, preferredEdge: .minY)
    }
}
#endif

@available(macOS 14.0, iOS 17.0, *)
@MainActor
private func makeWebViewConfiguration2(
    coordinator: WebViewCoordinator2,
    ebookPath: URL?,
) -> WKWebViewConfiguration {
    let config = WKWebViewConfiguration()
    config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

    #if os(iOS)
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    #endif

    let contentController = WKUserContentController()
    contentController.add(coordinator, name: "ConsoleLog")
    contentController.add(coordinator, name: "BookStructureReady")
    contentController.add(coordinator, name: "Relocated")
    contentController.add(coordinator, name: "PageFlipped")
    contentController.add(coordinator, name: "PageTurnSettled")
    contentController.add(coordinator, name: "OverlayToggled")
    contentController.add(coordinator, name: "MarginClickNav")
    contentController.add(coordinator, name: "SentenceSkip")
    contentController.add(coordinator, name: "mediaOverlaySeek")
    contentController.add(coordinator, name: "MediaOverlayProgress")
    contentController.add(coordinator, name: "ElementVisibility")
    contentController.add(coordinator, name: "SearchResults")
    contentController.add(coordinator, name: "SearchProgress")
    contentController.add(coordinator, name: "SearchComplete")
    contentController.add(coordinator, name: "SearchError")
    contentController.add(coordinator, name: "TextSelection")
    contentController.add(coordinator, name: "SelectionHighlight")
    contentController.add(coordinator, name: "SelectionDefine")
    contentController.add(coordinator, name: "SelectionShare")
    contentController.add(coordinator, name: "SelectionTranslate")
    contentController.add(coordinator, name: "SelectionSearch")
    contentController.add(coordinator, name: "SelectionCopy")
    contentController.add(coordinator, name: "HighlightSetColor")
    contentController.add(coordinator, name: "HighlightDelete")
    contentController.add(coordinator, name: "HighlightEdit")
    contentController.add(coordinator, name: "FileAccessDiagnostic")
    contentController.add(coordinator, name: "ReaderReady")

    contentController.addUserScript(consoleOverrideScript)
    contentController.addUserScript(makeBookOpenScript(ebookPath: ebookPath))
    config.userContentController = contentController

    return config
}

@available(macOS 14.0, iOS 17.0, *)
struct EbookPlayerWebView: View {
    let ebookPath: URL?
    @Binding var commsBridge: ReaderCommsBridge?
    let onBridgeReady: ((ReaderCommsBridge) -> Void)?
    let onContentPurged: (() -> Void)?

    init(
        ebookPath: URL?,
        commsBridge: Binding<ReaderCommsBridge?>,
        onBridgeReady: ((ReaderCommsBridge) -> Void)?,
        onContentPurged: (() -> Void)? = nil,
    ) {
        self.ebookPath = ebookPath
        self._commsBridge = commsBridge
        self.onBridgeReady = onBridgeReady
        self.onContentPurged = onContentPurged
    }

    var body: some View {
        WebViewWrapper2(
            ebookPath: ebookPath,
            commsBridge: $commsBridge,
            onBridgeReady: onBridgeReady,
            onContentPurged: onContentPurged,
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

@available(macOS 14.0, iOS 17.0, *)
private struct WebViewWrapper2: View {
    let ebookPath: URL?
    @Binding var commsBridge: ReaderCommsBridge?
    let onBridgeReady: ((ReaderCommsBridge) -> Void)?
    let onContentPurged: (() -> Void)?
    @State private var webView: WKWebView?

    var body: some View {
        WebViewRepresentable2(
            webView: $webView,
            commsBridge: $commsBridge,
            ebookPath: ebookPath,
            onBridgeReady: onBridgeReady,
            onReaderReady: {
                markJsReady(reason: "ReaderReady")
            },
            onContentPurged: onContentPurged,
        )
        .onChange(of: webView) { oldValue, newValue in
            if newValue != nil {
                loadReader()
            }
        }
    }

    private func loadReader() {
        guard let webView = webView else {
            debugLog("[EbookPlayerWebView] WebView not ready yet")
            return
        }

        Task { @MainActor in
            let webResourcesDir = await FilesystemActor.shared.getWebResourcesDirectory()
            let url = webResourcesDir.appendingPathComponent("foliate_wrap.html")

            guard FileManager.default.fileExists(atPath: url.path) else {
                debugLog("[EbookPlayerWebView] ERROR: foliate_wrap.html not found at \(url.path)")
                return
            }

            debugLog("[EbookPlayerWebView] Loading foliate_wrap.html from: \(url)")
            debugLog(
                "[EbookPlayerWebView] Granting read access to: \(webResourcesDir.deletingLastPathComponent().path)"
            )
            // Grant access to Application Support (parent of WebResources) so that BookLoader.js
            // can fetch EPUB files from sibling directories like SourceCache/
            webView.loadFileURL(
                url,
                allowingReadAccessTo: webResourcesDir.deletingLastPathComponent(),
            )
        }
    }

    private func markJsReady(reason: String) {
        guard let webView = webView else {
            debugLog("[EbookPlayerWebView] Cannot mark JS ready - webView is nil")
            return
        }

        Task { @MainActor in
            do {
                let reasonLiteral = javaScriptStringLiteral(reason)
                _ = try await webView.evaluateJavaScript(
                    "window.jsReady = true; window.tryOpenStorytellerBook?.(\(reasonLiteral))"
                )
            } catch {
                debugLog("[EbookPlayerWebView] Failed to mark JS ready: \(error)")
            }
        }
    }
}

@available(macOS 14.0, iOS 17.0, *)
private struct WebViewRepresentable2: PlatformViewRepresentable {
    @Binding var webView: WKWebView?
    @Binding var commsBridge: ReaderCommsBridge?
    let ebookPath: URL?
    let onBridgeReady: ((ReaderCommsBridge) -> Void)?
    let onReaderReady: () -> Void
    let onContentPurged: (() -> Void)?

    #if os(macOS)
    func makeNSView(context: Context) -> WKWebView {
        makeWebView(context: context)
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
    #else
    func makeUIView(context: Context) -> WKWebView {
        makeWebView(context: context)
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
    #endif

    private func makeWebView(context: Context) -> WKWebView {
        let config = makeWebViewConfiguration2(
            coordinator: context.coordinator,
            ebookPath: ebookPath,
        )

        #if os(macOS)
        let wkWebView = HighlightableWebView(frame: .zero, configuration: config)
        wkWebView.allowsMagnification = false
        wkWebView.magnification = 1
        wkWebView.wantsLayer = true
        wkWebView.layer?.backgroundColor = .clear
        #else
        let wkWebView = HighlightableWebView(frame: .zero, configuration: config)
        wkWebView.isOpaque = false
        wkWebView.backgroundColor = .clear
        wkWebView.scrollView.backgroundColor = .clear
        // The native layout fits the webview between notch and bottom chrome, so
        // WebKit must not also subtract safe-area insets from the layout viewport:
        // with .automatic every status-bar toggle fires window.resize and Foliate
        // repaginates, and the intentional full-bleed bottom (no overlay items)
        // would lose the home-indicator strip.
        wkWebView.scrollView.contentInsetAdjustmentBehavior = .never
        wkWebView.scrollView.pinchGestureRecognizer?.isEnabled = false
        #endif

        wkWebView.navigationDelegate = context.coordinator

        #if DEBUG
        wkWebView.isInspectable = true
        #endif

        DispatchQueue.main.async {
            self.webView = wkWebView
            let evaluator = WKWebViewJSEvaluator(webView: wkWebView)
            let bridge = ReaderCommsBridge(js: evaluator)
            context.coordinator.jsEvaluator = evaluator
            context.coordinator.commsBridge = bridge
            self.commsBridge = bridge
            self.onBridgeReady?(bridge)

            wkWebView.commsBridge = bridge

            #if os(macOS)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                wkWebView.window?.makeFirstResponder(wkWebView)
            }
            #endif

        }

        return wkWebView
    }

    func makeCoordinator() -> WebViewCoordinator2 {
        let coordinator = WebViewCoordinator2(onNavigationFinished: {})
        coordinator.onReaderReady = onReaderReady
        coordinator.onContentPurged = onContentPurged
        return coordinator
    }
}

#if os(macOS)
private typealias PlatformViewRepresentable = NSViewRepresentable
#else
private typealias PlatformViewRepresentable = UIViewRepresentable
#endif

#endif
