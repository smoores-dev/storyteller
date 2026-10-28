import Foundation
import Testing

@testable import StorytellerKit

#if os(iOS) || os(macOS)
@testable import StorytellerAppleKit
@MainActor
private final class RecoveryStateBox {
    var extractedEbookPath: URL? = URL(fileURLWithPath: "/tmp/recovery.epub")
    var reloadCount = 0
    var flushCount = 0
}

@MainActor
@Test func webViewRecoveryHoldsReloadUntilSceneIsActive() async throws {
    let state = RecoveryStateBox()
    let manager = makeRecoveryManager(state: state)

    manager.setSceneActive(false)
    manager.handleContentPurged()
    try await Task.sleep(for: .milliseconds(200))
    #expect(state.reloadCount == 0)

    manager.setSceneActive(true)
    for _ in 0..<100 where state.reloadCount == 0 {
        try await Task.sleep(for: .milliseconds(50))
    }
    #expect(state.reloadCount == 1)
    #expect(state.flushCount == 1)

    #expect(manager.handleBookStructureReadyIfRecovering())
    try await waitForRecoveryToComplete(manager)
}

@MainActor
@Test func webViewRecoveryDefersIfBackgroundedDuringReloadDelay() async throws {
    let state = RecoveryStateBox()
    let manager = makeRecoveryManager(state: state)
    manager.handleContentPurged()
    for _ in 0..<100 where state.reloadCount == 0 {
        await Task.yield()
    }
    #expect(state.reloadCount == 1)
    #expect(state.extractedEbookPath == nil)

    // The user leaves the app after the dead view is removed, before its
    // replacement is created. Never start that replacement in the background.
    manager.setSceneActive(false)
    try await Task.sleep(for: .milliseconds(200))
    #expect(state.extractedEbookPath == nil)
    manager.setSceneActive(true)
    #expect(state.extractedEbookPath == URL(fileURLWithPath: "/tmp/recovery.epub"))
    #expect(manager.handleBookStructureReadyIfRecovering())
}

@MainActor
@Test func webViewRecoveryReloadsImmediatelyWhileSceneIsActive() async throws {
    let state = RecoveryStateBox()
    let manager = makeRecoveryManager(state: state)

    manager.handleContentPurged()
    for _ in 0..<100 where state.reloadCount == 0 {
        try await Task.sleep(for: .milliseconds(50))
    }
    #expect(state.reloadCount == 1)

    #expect(manager.handleBookStructureReadyIfRecovering())
    try await waitForRecoveryToComplete(manager)
}

@MainActor
private func makeRecoveryManager(state: RecoveryStateBox) -> WebViewRecoveryManager {
    WebViewRecoveryManager(
        stateAccess: WebViewRecoveryStateAccess(
            extractedEbookPath: { state.extractedEbookPath },
            setExtractedEbookPath: { path in
                if path == nil { state.reloadCount += 1 }
                state.extractedEbookPath = path
            },
            flushPosition: { state.flushCount += 1 },
        )
    )
}

@MainActor
private func waitForRecoveryToComplete(_ manager: WebViewRecoveryManager) async throws {
    for _ in 0..<100 where manager.isInRecovery { try await Task.sleep(for: .milliseconds(20)) }
    #expect(!manager.isInRecovery)
}
#endif

@Test func opfParserPreservesNonLinearSpineMetadata() throws {
    let opf = """
        <?xml version="1.0" encoding="UTF-8"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <manifest>
            <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
            <item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/>
          </manifest>
          <spine>
            <itemref idref="chapter"/>
            <itemref idref="notes" linear="no"/>
          </spine>
        </package>
        """

    let parsed = try SMILParser.parseOPF(Data(opf.utf8))

    #expect(parsed.spine.map(\.idref) == ["chapter", "notes"])
    #expect(parsed.spine.map(\.linear) == [nil, "no"])
}

#if os(iOS) || os(macOS)
@MainActor
@Test func readerDisappearancePreservesSessionProgressSubscription() async throws {
    let h = try await ProtocolTestSession.make()
    h.session.prepare()
    for _ in 0..<100 where h.session.incomingObserver == nil {
        try await Task.sleep(for: .milliseconds(10))
    }
    let subscription = try #require(h.session.incomingObserver)
    let viewModel = EbookPlayerViewModel(bookData: nil, session: h.session)
    viewModel.handleOnDisappear(close: nil)  // background disappearance
    #expect(h.session.incomingObserver == subscription)
    viewModel.handleOnDisappear(close: .detachView)  // minimized while session survives
    for _ in 0..<100 where h.session.isViewAttached { try await Task.sleep(for: .milliseconds(10)) }
    #expect(!h.session.isEnded)
    #expect(h.session.incomingObserver == subscription)
    h.session.attachBridge(h.bridge)
    h.session.prepare()  // reuse must not need another subscription
    #expect(h.session.incomingObserver == subscription)
    await h.close()
    #expect(h.session.incomingObserver == nil)
}
#endif
