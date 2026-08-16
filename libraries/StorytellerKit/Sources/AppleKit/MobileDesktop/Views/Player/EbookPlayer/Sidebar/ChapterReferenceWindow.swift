#if os(macOS)
import SwiftUI
import WebKit

struct ChapterReferenceWindow: View {
    let request: ChapterReferenceRequest?

    @Environment(\.colorScheme) private var colorScheme
    @State private var searchText = ""
    @State private var matchFound = true
    @State private var webViewHolder = ReferenceWebViewHolder()
    @State private var fontFaceCSS = ""

    private var viewModel: EbookPlayerViewModel? {
        request.flatMap { EbookWindowRouter.shared.viewModel(for: $0.bookID) }
    }

    private var section: SectionInfo? {
        guard let request, let viewModel else { return nil }
        return viewModel.bookStructure[safe: request.sectionIndex]
    }

    var body: some View {
        Group {
            if let request, let viewModel, let section,
                let root = viewModel.extractedEbookPath
            {
                content(
                    request: request,
                    viewModel: viewModel,
                    section: section,
                    root: root,
                )
            } else {
                ContentUnavailableView(
                    "Reference Unavailable",
                    systemImage: "book",
                    description: Text("The reader window for this book is closed."),
                )
                .frame(minWidth: 380, minHeight: 300)
            }
        }
        .background(WindowFloatingConfigurator())
    }

    private func content(
        request: ChapterReferenceRequest,
        viewModel: EbookPlayerViewModel,
        section: SectionInfo,
        root: URL,
    ) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(section.label ?? (section.id as NSString).lastPathComponent)
                        .font(.headline)
                        .lineLimit(1)
                    Text("Reference window - your reading position stays put")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                searchControls

                Button("Go to") {
                    viewModel.progressManager?.handleUserChapterSelected(request.sectionIndex)
                }
                .controlSize(.small)
                .fixedSize()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            ReferenceWebView(
                sectionURL: root.appendingPathComponent(section.id),
                root: root,
                holder: webViewHolder,
                styleCSS: styleCSS(settingsVM: viewModel.settingsVM),
            )
        }
        .frame(minWidth: 420, minHeight: 480)
        .onChange(of: searchText) { _, _ in
            find(forward: true)
        }
        .task {
            fontFaceCSS = await CustomFontsActor.shared.fontFaceCSS(
                bundledFamily: viewModel.settingsVM.fontFamily)
        }
    }

    private func styleCSS(settingsVM: SettingsViewModel) -> String {
        let isDark = colorScheme == .dark
        let background =
            (settingsVM.backgroundColor?.isEmpty == false ? settingsVM.backgroundColor : nil)
            ?? (isDark ? kDefaultBackgroundColorDark : kDefaultBackgroundColorLight)
        let foreground =
            (settingsVM.foregroundColor?.isEmpty == false ? settingsVM.foregroundColor : nil)
            ?? (isDark ? kDefaultForegroundColorDark : kDefaultForegroundColorLight)
        let family =
            settingsVM.fontFamily == "System Default"
            ? "serif" : "\"\(settingsVM.fontFamily)\", serif"
        return """
            \(fontFaceCSS)
            body {
                margin: 24px auto;
                max-width: 42em;
                padding: 0 16px;
                font-size: \(settingsVM.fontSize)px !important;
                font-family: \(family) !important;
                line-height: \(settingsVM.lineSpacing) !important;
                background: \(background) !important;
                color: \(foreground) !important;
            }
            img { max-width: 100%; height: auto; }
            """
    }

    private var searchControls: some View {
        HStack(spacing: 4) {
            DebouncedSearchField(placeholder: "Find in chapter", searchText: $searchText)
                .frame(width: 170)
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(
                            matchFound ? Color.clear : Color.red.opacity(0.6),
                            lineWidth: 1,
                        )
                )

            Button {
                find(forward: false)
            } label: {
                Image(systemName: "chevron.up")
            }
            .buttonStyle(.borderless)
            .disabled(searchText.isEmpty)

            Button {
                find(forward: true)
            } label: {
                Image(systemName: "chevron.down")
            }
            .buttonStyle(.borderless)
            .disabled(searchText.isEmpty)
        }
    }

    private func find(forward: Bool) {
        guard !searchText.isEmpty else {
            matchFound = true
            return
        }
        let configuration = WKFindConfiguration()
        configuration.backwards = !forward
        configuration.caseSensitive = false
        configuration.wraps = true
        webViewHolder.webView?.find(searchText, configuration: configuration) { result in
            matchFound = result.matchFound
        }
    }
}

@MainActor
final class ReferenceWebViewHolder {
    weak var webView: WKWebView?
}

private struct ReferenceWebView: NSViewRepresentable {
    let sectionURL: URL
    let root: URL
    let holder: ReferenceWebViewHolder
    let styleCSS: String

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.loadFileURL(sectionURL, allowingReadAccessTo: root)
        holder.webView = webView
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.styleCSS = styleCSS
        if context.coordinator.loadedURL != sectionURL {
            context.coordinator.loadedURL = sectionURL
            webView.loadFileURL(sectionURL, allowingReadAccessTo: root)
        } else if context.coordinator.injectedCSS != styleCSS,
            context.coordinator.pageLoaded
        {
            context.coordinator.injectStyles(into: webView)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(loadedURL: sectionURL, styleCSS: styleCSS)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedURL: URL
        var styleCSS: String
        var injectedCSS: String?
        var pageLoaded = false

        init(loadedURL: URL, styleCSS: String) {
            self.loadedURL = loadedURL
            self.styleCSS = styleCSS
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void,
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(url.isFileURL ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            pageLoaded = true
            injectStyles(into: webView)
        }

        func injectStyles(into webView: WKWebView) {
            injectedCSS = styleCSS
            guard let encoded = try? JSONEncoder().encode(styleCSS),
                let literal = String(data: encoded, encoding: .utf8)
            else { return }
            let js = """
                (function() { \
                var style = document.getElementById('storyteller-ref-style'); \
                if (!style) { \
                style = document.createElement('style'); \
                style.id = 'storyteller-ref-style'; \
                document.head.appendChild(style); \
                } \
                style.textContent = \(literal); \
                })()
                """
            webView.evaluateJavaScript(js)
        }
    }
}
#endif
