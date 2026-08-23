#if os(iOS) || os(macOS)
import Foundation

@MainActor
struct WebViewRecoveryStateAccess {
    struct Snapshot {
        let chapterID: Int?
        let fraction: Double
        let extractedEbookPath: URL?
    }

    let snapshot: () -> Snapshot?
    let setExtractedEbookPath: (URL?) -> Void
    let sectionCount: () -> Int?
}

@MainActor
final class WebViewRecoveryManager {
    private weak var bridge: ReaderCommsBridge?
    private let stateAccess: WebViewRecoveryStateAccess

    private var isRecovering = false
    private var savedChapterId: Int?
    private var savedFraction: Double = 0

    init(viewModel: EbookPlayerViewModel) {
        stateAccess = WebViewRecoveryStateAccess(
            snapshot: { [weak viewModel] in
                guard let viewModel else { return nil }
                return WebViewRecoveryStateAccess.Snapshot(
                    chapterID: viewModel.progressManager?.selectedChapterId,
                    fraction: viewModel.progressManager?.chapterSeekBarValue ?? 0,
                    extractedEbookPath: viewModel.extractedEbookPath,
                )
            },
            setExtractedEbookPath: { [weak viewModel] path in
                viewModel?.extractedEbookPath = path
            },
            sectionCount: { [weak viewModel] in
                viewModel?.bookStructure.count
            },
        )
    }

    init(stateAccess: WebViewRecoveryStateAccess) {
        self.stateAccess = stateAccess
    }

    func setBridge(_ bridge: ReaderCommsBridge) {
        self.bridge = bridge
    }

    func handleContentPurged() {
        guard !isRecovering else { return }
        guard let snapshot = stateAccess.snapshot() else { return }

        debugLog("[RecoveryManager] Content purged, starting recovery")
        isRecovering = true

        savedChapterId = snapshot.chapterID
        savedFraction = snapshot.fraction

        debugLog(
            "[RecoveryManager] Saved view state: chapter=\(savedChapterId ?? -1), fraction=\(savedFraction)"
        )

        let path = snapshot.extractedEbookPath
        stateAccess.setExtractedEbookPath(nil)

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(100))
            stateAccess.setExtractedEbookPath(path)
        }
    }

    func handleBookStructureReadyIfRecovering(
        restoreSavedViewPosition: Bool = true
    ) -> Bool {
        guard isRecovering else { return false }

        if restoreSavedViewPosition {
            debugLog(
                "[RecoveryManager] Book reloaded, restoring view position to chapter \(savedChapterId ?? -1), fraction \(savedFraction)"
            )
        } else {
            debugLog("[RecoveryManager] Book reloaded at native audio position")
        }

        Task { @MainActor in
            if restoreSavedViewPosition,
                let chapterId = savedChapterId,
                let sectionCount = stateAccess.sectionCount(),
                chapterId < sectionCount
            {
                try? await bridge?.sendJsGoToFractionInSectionCommand(
                    sectionIndex: chapterId,
                    fraction: savedFraction,
                )
            }

            debugLog("[RecoveryManager] Recovery complete")
            isRecovering = false
            savedChapterId = nil
            savedFraction = 0
        }

        return true
    }

    var isInRecovery: Bool { isRecovering }
}
#endif
