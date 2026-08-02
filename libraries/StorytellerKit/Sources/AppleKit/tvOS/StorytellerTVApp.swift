#if os(tvOS)
import StorytellerKit
import SwiftUI

struct StorytellerTVApp: App {
    @State private var mediaViewModel = MediaViewModel()
    @State private var runtimeReady = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if runtimeReady {
                    TVContentView()
                        .environment(AppLaunchContext.environment)
                        .environment(mediaViewModel)
                } else {
                    ProgressView("Loading...")
                }
            }
            .task {
                guard await StorytellerRuntime.start() else { return }
                await mediaViewModel.start()
                await BookServiceActor.shared.setActive(true, source: .tv)
                await initializeBookSources()
                runtimeReady = true
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            handleScenePhaseChange(newPhase)
        }
    }

    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
            case .background:
                debugLog("[TVApp] App entering background")
                Task {
                    guard await StorytellerRuntime.start() else { return }
                    await BookServiceActor.shared.setActive(false, source: .tv)
                }
            case .active:
                debugLog("[TVApp] App becoming active")
                Task {
                    guard await StorytellerRuntime.start() else { return }
                    await BookServiceActor.shared.setActive(true, source: .tv)
                }
            case .inactive:
                break
            @unknown default:
                break
        }
    }

    private func initializeBookSources() async {
        await syncOnLaunch()
        await mediaViewModel.refreshMetadata(source: "tvApp.registry")
    }

    private func syncOnLaunch() async {
        let result = await ProgressSyncActor.shared.syncPendingQueue()
        debugLog("[TVApp] Sync on launch: synced=\(result.synced), failed=\(result.failed)")

        if let library = await BookServiceActor.shared.fetchLibraryInformation() {
            debugLog("[TVApp] Library metadata updated: \(library.count) books")
        }
    }
}
#endif
