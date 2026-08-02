#if canImport(CWebKitGTK)
import CWebKitGTK
import Foundation

@MainActor
final class WebKitBridge {
    let rawWebViewPointer: UnsafeMutableRawPointer
    var onMessage: ((String) -> Void)?

    private var webView: UnsafeMutablePointer<WebKitWebView> {
        rawWebViewPointer.assumingMemoryBound(to: WebKitWebView.self)
    }

    init() {
        Self.registerSchemeIfNeeded()

        let widget = webkit_web_view_new()!
        g_object_ref_sink(widget)
        rawWebViewPointer = UnsafeMutableRawPointer(widget)

        gtk_widget_set_hexpand(widget, 1)
        gtk_widget_set_vexpand(widget, 1)

        let contentManager = webkit_web_view_get_user_content_manager(webView)
        _ = storyteller_signal_connect(
            UnsafeMutableRawPointer(contentManager),
            "script-message-received::storyteller",
            unsafeBitCast(messageReceivedCallback, to: GCallback.self),
            Unmanaged.passUnretained(self).toOpaque(),
        )
        webkit_user_content_manager_register_script_message_handler(
            contentManager,
            "storyteller",
            nil,
        )
    }

    func loadApp() {
        webkit_web_view_load_uri(webView, "storyteller://app/index.html")
    }

    func evaluate(_ script: String) {
        webkit_web_view_evaluate_javascript(webView, script, -1, nil, nil, nil, nil, nil)
    }

    fileprivate func received(message: String) {
        onMessage?(message)
    }

    private static var schemeRegistered = false

    private static func registerSchemeIfNeeded() {
        guard !schemeRegistered else { return }
        schemeRegistered = true
        webkit_web_context_register_uri_scheme(
            webkit_web_context_get_default(),
            "storyteller",
            schemeRequestCallback,
            nil,
            nil,
        )
    }
}

private let messageReceivedCallback:
    @convention(c) (
        UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, UnsafeMutableRawPointer?
    ) -> Void = { _, value, userData in
        guard let value, let userData else { return }
        let jscValue = OpaquePointer(value)
        guard let cString = jsc_value_to_string(jscValue) else { return }
        let message = String(cString: cString)
        g_free(cString)
        let userDataAddress = UInt(bitPattern: userData)
        Task { @MainActor in
            let userData = UnsafeMutableRawPointer(bitPattern: userDataAddress)!
            Unmanaged<WebKitBridge>.fromOpaque(userData).takeUnretainedValue().received(
                message: message
            )
        }
    }

private let schemeRequestCallback:
    @convention(c) (OpaquePointer?, UnsafeMutableRawPointer?) -> Void =
        {
            request,
            _ in
            guard let request else { return }
            let path = webkit_uri_scheme_request_get_path(request).map { String(cString: $0) } ?? ""
            guard let content = WebAppContent.resource(at: path) else {
                let error = g_error_new_literal(
                    g_quark_from_string("storyteller-scheme"),
                    404,
                    "Not found: \(path)",
                )
                webkit_uri_scheme_request_finish_error(request, error)
                g_error_free(error)
                return
            }
            let bytes = Array(content.body.utf8)
            let length = bytes.count
            let buffer = g_malloc(gsize(length))!
            _ = bytes.withUnsafeBytes { source in
                memcpy(buffer, source.baseAddress!, length)
            }
            let stream = g_memory_input_stream_new_from_data(buffer, gssize(length), g_free)
            webkit_uri_scheme_request_finish(request, stream, gint64(length), content.mimeType)
            g_object_unref(stream)
        }

enum WebAppContent {
    static func resource(at path: String) -> (body: String, mimeType: String)? {
        switch path {
            case "/index.html", "/":
                return (indexHTML, "text/html")
            case "/app.js":
                return (appJS, "application/javascript")
            default:
                return nil
        }
    }

    private static let indexHTML = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Storyteller PoC</title>
            <style>
                body { font-family: sans-serif; margin: 2rem; background: #1e2126; color: #dde1e6; }
                button { font-size: 1rem; padding: 0.5rem 1rem; }
                #log { margin-top: 1rem; white-space: pre-line; color: #8fd18f; }
            </style>
        </head>
        <body>
            <h2>WebKitGTK bridge test</h2>
            <p>This page was served over the storyteller:// custom scheme.</p>
            <button id="ping">Send message to Swift</button>
            <div id="log"></div>
            <script src="app.js"></script>
        </body>
        </html>
        """

    private static let appJS = """
        document.getElementById('log').textContent = 'app.js loaded as a scheme sub-resource\\n';
        document.getElementById('ping').addEventListener('click', () => {
            window.webkit.messageHandlers.storyteller.postMessage('ping from JS');
        });
        window.storytellerLog = (text) => {
            document.getElementById('log').textContent += text + '\\n';
        };
        """
}
#endif
