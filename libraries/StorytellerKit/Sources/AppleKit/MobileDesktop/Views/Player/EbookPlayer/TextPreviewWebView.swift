#if os(iOS) || os(macOS)
import SwiftUI
import WebKit

struct TextPreviewWebView {
    let fontFamily: String
    let html: String

    static let fontFacePlaceholder = "/*FONT-FACE*/"

    final class Coordinator {
        var lastKey = ""
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    private func makeWebView() -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        #if os(iOS)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.scrollView.alwaysBounceHorizontal = false
        #endif
        return webView
    }

    private func update(_ webView: WKWebView, coordinator: Coordinator) {
        let key = fontFamily + "|" + html
        guard coordinator.lastKey != key else { return }
        coordinator.lastKey = key
        let family = fontFamily
        let template = html
        Task { @MainActor in
            let fontCSS = await CustomFontsActor.shared.fontFaceCSS(bundledFamily: family)
            webView.loadHTMLString(
                template.replacingOccurrences(of: Self.fontFacePlaceholder, with: fontCSS),
                baseURL: nil,
            )
        }
    }
}

#if os(iOS)
extension TextPreviewWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { makeWebView() }
    func updateUIView(_ webView: WKWebView, context: Context) {
        update(webView, coordinator: context.coordinator)
    }
}
#else
extension TextPreviewWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { makeWebView() }
    func updateNSView(_ webView: WKWebView, context: Context) {
        update(webView, coordinator: context.coordinator)
    }
}
#endif

@MainActor
func textPreviewHTML(
    settingsVM: SettingsViewModel,
    backgroundHex: String,
    foregroundHex: String,
    samples: [String],
) -> String {
    let resolvedFamily =
        settingsVM.fontFamily == "System Default" ? "serif" : settingsVM.fontFamily
    let generics = ["serif", "sans-serif", "monospace"]
    let fontFamilyCSS = generics.contains(resolvedFamily)
        ? "font-family: \(resolvedFamily);"
        : "font-family: \"\(resolvedFamily)\", serif;"
    let paragraphGap = settingsVM.paragraphSpacing > 0 ? settingsVM.paragraphSpacing : 1.0
    let firstLineIndentCSS =
        settingsVM.firstLineIndent ? "p { text-indent: 1.4em; }" : ""
    let paragraphs = samples.map { "<p>\($0)</p>" }.joined(separator: "\n")
    return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" \
        content="width=device-width, initial-scale=1, user-scalable=no">
        <style>
        \(TextPreviewWebView.fontFacePlaceholder)
        html, body {
            margin: 0;
            overflow-x: hidden;
            background-color: \(backgroundHex);
            -webkit-user-select: none;
            user-select: none;
        }
        body {
            padding-left: \(settingsVM.marginLeftRight)%;
            padding-right: \(settingsVM.marginLeftRight)%;
            padding-top: calc(10px + \(settingsVM.marginTop)vh);
            padding-bottom: \(settingsVM.marginBottom)vh;
        }
        p {
            margin-top: 0;
            margin-bottom: \(paragraphGap)em;
            font-size: \(settingsVM.fontSize)px;
            \(fontFamilyCSS)
            line-height: \(settingsVM.lineSpacing);
            text-align: \(settingsVM.textAlignment);
            -webkit-hyphens: manual;
            hyphens: manual;
            hanging-punctuation: allow-end last;
            word-spacing: \(settingsVM.wordSpacing)em;
            letter-spacing: \(settingsVM.letterSpacing)em;
            color: \(foregroundHex);
        }
        \(firstLineIndentCSS)
        </style>
        </head>
        <body>
        \(paragraphs)
        </body>
        </html>
        """
}
#endif
