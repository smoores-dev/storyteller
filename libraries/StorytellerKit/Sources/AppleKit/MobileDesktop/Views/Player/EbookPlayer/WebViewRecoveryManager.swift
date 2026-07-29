#if os(iOS)
import Foundation
import WebKit

@MainActor
final class WebViewRecoveryManager {
    private weak var viewModel: EbookPlayerViewModel?
    private weak var bridge: ReaderCommsBridge?

    private var isRecovering = false
    private var savedChapterId: Int?
    private var savedFraction: Double = 0

    init(viewModel: EbookPlayerViewModel) {
        self.viewModel = viewModel
    }

    func setBridge(_ bridge: ReaderCommsBridge) {
        self.bridge = bridge
    }

    func handleContentPurged() {
        guard !isRecovering else { return }
        guard let vm = viewModel else { return }

        debugLog("[RecoveryManager] Content purged, starting recovery")
        isRecovering = true

        savedChapterId = vm.progressManager?.selectedChapterId
        savedFraction = vm.progressManager?.chapterSeekBarValue ?? 0

        debugLog(
            "[RecoveryManager] Saved view state: chapter=\(savedChapterId ?? -1), fraction=\(savedFraction)"
        )

        let path = vm.extractedEbookPath
        vm.extractedEbookPath = nil

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(100))
            vm.extractedEbookPath = path
        }
    }

    func handleBookStructureReadyIfRecovering() -> Bool {
        guard isRecovering else { return false }

        debugLog(
            "[RecoveryManager] Book reloaded, restoring view position to chapter \(savedChapterId ?? -1), fraction \(savedFraction)"
        )

        Task { @MainActor in
            if let chapterId = savedChapterId,
                let vm = viewModel,
                chapterId < vm.bookStructure.count
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
