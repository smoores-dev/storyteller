#if canImport(CWebKitGTK)
import Gtk
import GtkBackend
import SwiftCrossUI

final class WebViewWidget: Gtk.Widget {
    let bridge: WebKitBridge

    @MainActor
    init(bridge: WebKitBridge) {
        self.bridge = bridge
        super.init(OpaquePointer(bridge.rawWebViewPointer))
    }
}

struct ReaderWebView: GtkWidgetRepresentable {
    func makeCoordinator() -> WebKitBridge {
        WebKitBridge()
    }

    func makeGtkWidget(context: Context) -> WebViewWidget {
        let bridge = context.coordinator
        bridge.onMessage = { [weak bridge] message in
            print("[bridge] JS -> Swift: \(message)")
            bridge?.evaluate("window.storytellerLog('Swift received: \(message)')")
        }
        bridge.loadApp()
        return WebViewWidget(bridge: bridge)
    }

    func updateGtkWidget(_ gtkWidget: WebViewWidget, context: Context) {}
}
#endif
