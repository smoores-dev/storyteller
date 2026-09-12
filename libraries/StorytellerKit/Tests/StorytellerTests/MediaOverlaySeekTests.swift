import Foundation
import Testing

@testable import StorytellerKit

@StorytellerUIActor
private final class SeekRecordingJSEvaluator: JSEvaluating {
    var scripts: [String] = []

    func evaluate(_ script: String) async throws -> String? {
        scripts.append(script)
        return nil
    }
}

@Suite("Media overlay seeks")
@StorytellerUIActor
struct MediaOverlaySeekTests {
    @Test("Paused double tap establishes the reflow anchor", arguments: ["paused", "always"])
    func doubleTapPreservesPlayheadWithoutNavigation(visibility: String) async {
        let evaluator = SeekRecordingJSEvaluator()
        let bridge = ReaderCommsBridge(js: evaluator)
        let settings = HeadlessReaderSettings()
        settings.readaloudHighlightVisibility = visibility
        let manager = makeManager(bridge: bridge, settings: settings) { section, textId in
            #expect(section == 0)
            #expect(textId == "sentence")
            return true
        }

        await manager.handleSeekEvent(sectionIndex: 0, anchor: "sentence", source: .doubleTap)

        #expect(!manager.isPlaying)
        #expect(
            evaluator.scripts == [
                "window.foliateManager.setReflowAnchor(0, 'sentence')",
                "window.foliateManager.highlightFragment(0, 'sentence', false)",
            ]
        )
        await manager.cleanup()
    }

    @Test("Page navigation preserves its new playhead without navigating again")
    func pageNavigationPreservesPlayhead() async {
        let evaluator = SeekRecordingJSEvaluator()
        let bridge = ReaderCommsBridge(js: evaluator)
        let settings = HeadlessReaderSettings()
        settings.readaloudHighlightVisibility = "always"
        let manager = makeManager(bridge: bridge, settings: settings) { _, _ in true }

        await manager.handleSeekEvent(sectionIndex: 0, anchor: "sentence", source: .userNav)

        #expect(
            evaluator.scripts == [
                "window.foliateManager.setReflowAnchor(0, 'sentence')",
                "window.foliateManager.highlightFragment(0, 'sentence', false)",
            ]
        )
        await manager.cleanup()
    }

    @Test("Hidden playhead is still preserved on reflow", arguments: ["doubleTap", "userNav"])
    func hiddenPlayheadIsPreserved(source: String) async {
        let evaluator = SeekRecordingJSEvaluator()
        let bridge = ReaderCommsBridge(js: evaluator)
        let settings = HeadlessReaderSettings()
        settings.readaloudHighlightVisibility = "playing"
        let manager = makeManager(bridge: bridge, settings: settings) { _, _ in true }

        await manager.handleSeekEvent(
            sectionIndex: 0,
            anchor: "sentence",
            source: source == "doubleTap" ? .doubleTap : .userNav,
        )

        #expect(
            evaluator.scripts == [
                "window.foliateManager.setReflowAnchor(0, 'sentence')",
                "window.foliateManager.clearHighlight()",
            ]
        )
        await manager.cleanup()
    }

    @Test("Failed double tap does not move the reflow anchor")
    func failedSeekDoesNotHighlight() async {
        let evaluator = SeekRecordingJSEvaluator()
        let bridge = ReaderCommsBridge(js: evaluator)
        let manager = makeManager(bridge: bridge, settings: HeadlessReaderSettings()) { _, _ in
            false
        }

        await manager.handleSeekEvent(sectionIndex: 0, anchor: "sentence", source: .doubleTap)

        #expect(evaluator.scripts.isEmpty)
        await manager.cleanup()
    }

    private func makeManager(
        bridge: ReaderCommsBridge,
        settings: HeadlessReaderSettings,
        seek: @escaping @Sendable (Int, String) async -> Bool,
    ) -> MediaOverlayManager {
        MediaOverlayManager(
            bookStructure: [
                SectionInfo(
                    index: 0,
                    id: "chapter.xhtml",
                    label: nil,
                    level: nil,
                    mediaOverlay: [
                        SMILEntry(
                            textId: "sentence",
                            textHref: "chapter.xhtml",
                            audioFile: "audio.mp3",
                            begin: 0,
                            end: 10,
                            cumSumAtEnd: 10,
                        )
                    ],
                )
            ],
            bookID: BookID(sourceID: "test-source", uuid: UUID().uuidString),
            bridge: bridge,
            settingsVM: settings,
            reloadBookIntoActor: {},
            seekToFragment: seek,
        )
    }
}
