import StorytellerAppleKit
import StorytellerKit
import UIKit
import WebKit
import XCTest

@MainActor
final class ReaderLayoutTests: XCTestCase {
    func testChromeVisibilityPreservesReaderViewport() async throws {
        let started = await StorytellerRuntime.start()
        XCTAssertTrue(started)
        let scene = try XCTUnwrap(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        )
        let fixture = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "reader", withExtension: "epub")
        )
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(
            UUID().uuidString
        )
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try FileManager.default.copyItem(
            at: fixture,
            to: folder.appendingPathComponent("reader.epub"),
        )
        let service = BookServiceActor.shared
        let source = await service.createBookSource(
            BookSourceConfiguration(
                kind: .localFolder,
                name: "Reader layout test",
                storagePath: folder.path,
            )
        )
        let sourceID = try XCTUnwrap(source?.id)
        addTeardownBlock { @MainActor in
            PlayerPresenter.shared.dismissCard()
            await ActiveReadingSession.shared.current?.close(.endSession)
            _ = await service.removeBookSource(id: sourceID)
            try FileManager.default.removeItem(at: folder)
        }
        let books = await service.localFolderBooks(sourceID: sourceID)
        let metadata = try XCTUnwrap(books.first)
        _ = try await service.prepareEbookForReading(bookID: metadata.id, category: .synced)
        let window = try XCTUnwrap(scene.keyWindow)
        PlayerPresenter.shared.dismissCard()
        for _ in 0..<200 {
            if PlayerPresenter.shared.card == nil,
                window.rootViewController?.presentedViewController == nil
            {
                break
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertNil(PlayerPresenter.shared.card)
        XCTAssertNil(window.rootViewController?.presentedViewController)
        PlayerPresenter.shared.present(
            PlayerBookData(metadata: metadata, localMediaPath: fixture, category: .synced)
        )

        var reader: WKWebView?
        for _ in 0..<200 {
            reader = webView(in: window)
            if let reader,
                (try? await reader.evaluateJavaScript(
                    "Boolean(window.foliateManager?.readingSnapshot().ready)"
                )) as? Bool == true
            {
                break
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        let webView = try XCTUnwrap(
            reader,
            "Reader preparation: \(String(describing: ActiveReadingSession.shared.current?.lastPrepareError))",
        )
        let ready =
            try await webView.evaluateJavaScript(
                "Boolean(window.foliateManager?.readingSnapshot().ready)"
            ) as? Bool
        XCTAssertEqual(ready, true)
        try await Task.sleep(for: .milliseconds(500))
        let initialFrame = webView.convert(webView.bounds, to: window)
        let initialHeight = try await webView.evaluateJavaScript("innerHeight") as? Double
        try await webView.evaluateJavaScript(
            "window.chromeResizeCount = 0; addEventListener('resize', () => window.chromeResizeCount++); true"
        )

        for _ in 0..<2 {
            // Exercise the production overlay message and native layout, not a
            // browser-sized imitation of the iPad safe area.
            try await webView.evaluateJavaScript(
                "webkit.messageHandlers.OverlayToggled.postMessage({}); true"
            )
            try await Task.sleep(for: .milliseconds(600))
            XCTAssertEqual(webView.convert(webView.bounds, to: window), initialFrame)
            let height = try await webView.evaluateJavaScript("innerHeight") as? Double
            XCTAssertEqual(height, initialHeight)
        }
        let resizes = try await webView.evaluateJavaScript("window.chromeResizeCount") as? Int
        XCTAssertEqual(resizes, 0, "Showing reader controls must not repaginate the book")
    }

    private func webView(in view: UIView) -> WKWebView? {
        if let webView = view as? WKWebView { return webView }
        return view.subviews.lazy.compactMap { self.webView(in: $0) }.first
    }
}
