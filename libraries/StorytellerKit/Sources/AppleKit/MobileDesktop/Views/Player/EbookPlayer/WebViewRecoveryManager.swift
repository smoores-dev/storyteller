#if os(iOS) || os(macOS)
import Foundation

@MainActor
struct WebViewRecoveryStateAccess {
    let extractedEbookPath: () -> URL?
    let setExtractedEbookPath: (URL?) -> Void
    let flushPosition: () async -> Void
}

/// Rebuilds the webview after the system reaps its content process. A WKWebView
/// load started in the background stalls, so the reload waits for the scene.
@MainActor
final class WebViewRecoveryManager {
    private let stateAccess: WebViewRecoveryStateAccess

    private var isRecovering = false
    private var reloadDeferred = false
    private var pendingReloadPath: URL?
    private var sceneIsActive = true

    init(viewModel: EbookPlayerViewModel) {
        stateAccess = WebViewRecoveryStateAccess(
            extractedEbookPath: { [weak viewModel] in
                viewModel?.extractedEbookPath
            },
            setExtractedEbookPath: { [weak viewModel] path in
                viewModel?.extractedEbookPath = path
            },
            flushPosition: { [weak viewModel] in
                viewModel?.session?.readerUnavailable()
                await viewModel?.session?.saveProgressLocally(reason: .appBackgrounding)
            },
        )
    }

    init(stateAccess: WebViewRecoveryStateAccess) {
        self.stateAccess = stateAccess
    }

    func handleContentPurged() {
        guard !isRecovering else { return }

        debugLog("[RecoveryManager] Content purged")
        isRecovering = true

        Task { @MainActor in
            // With no audio running, the stored position is the playhead.
            await stateAccess.flushPosition()
            reloadIfSceneActive()
        }
    }

    func setSceneActive(_ active: Bool) {
        sceneIsActive = active
        guard active, reloadDeferred else { return }
        reloadDeferred = false
        debugLog("[RecoveryManager] Scene active, running deferred reload")
        if pendingReloadPath != nil {
            restoreWebViewIfSceneActive()
        } else {
            reloadWebView()
        }
    }

    private func reloadIfSceneActive() {
        guard sceneIsActive else {
            debugLog("[RecoveryManager] Scene inactive, holding reload until active")
            reloadDeferred = true
            return
        }
        reloadWebView()
    }

    private func reloadWebView() {
        pendingReloadPath = stateAccess.extractedEbookPath()
        stateAccess.setExtractedEbookPath(nil)

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(100))
            restoreWebViewIfSceneActive()
        }
    }

    private func restoreWebViewIfSceneActive() {
        guard sceneIsActive else {
            reloadDeferred = true
            return
        }
        let path = pendingReloadPath
        pendingReloadPath = nil
        stateAccess.setExtractedEbookPath(path)
    }

    func handleBookStructureReadyIfRecovering() -> Bool {
        guard isRecovering else { return false }
        debugLog("[RecoveryManager] Recovery complete")
        isRecovering = false
        return true
    }

    var isInRecovery: Bool { isRecovering }
}
#endif
