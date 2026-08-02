#if os(watchOS)
import StorytellerKit
import SwiftUI
import WatchConnectivity
import WatchKit

class StorytellerWatchAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        for task in backgroundTasks {
            if let urlTask = task as? WKURLSessionRefreshBackgroundTask {
                if urlTask.sessionIdentifier == "dev.smoores.storyteller.watch.downloads" {
                    Task {
                        guard await StorytellerRuntime.start() else {
                            urlTask.setTaskCompletedWithSnapshot(false)
                            return
                        }
                        await DownloadManager.shared.handleBackgroundSessionEvents {
                            urlTask.setTaskCompletedWithSnapshot(false)
                        }
                    }
                } else {
                    urlTask.setTaskCompletedWithSnapshot(false)
                }
            } else {
                task.setTaskCompletedWithSnapshot(false)
            }
        }
    }
}

struct StorytellerWatchApp: App {
    @WKApplicationDelegateAdaptor(StorytellerWatchAppDelegate.self) var appDelegate
    @State private var watchViewModel = WatchViewModel()
    @State private var runtimeReady = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if runtimeReady {
                    ContentView()
                        .environment(AppLaunchContext.environment)
                        .environment(watchViewModel)
                } else {
                    ProgressView()
                }
            }
            .task {
                guard await StorytellerRuntime.start() else { return }
                WatchSessionManager.shared.activate()
                watchViewModel.start()
                await BookServiceActor.shared.setActive(true, source: .watch)
                await initializeBookSources()
                // Start DownloadManager init + retry loop. On iOS/macOS/tvOS this
                // happens via MediaViewModel.setupDownloadManagerObserver() instead.
                _ = await DownloadManager.shared.incompleteDownloads
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
                debugLog("[WatchApp] App entering background")
                Task {
                    guard await StorytellerRuntime.start() else { return }
                    await BookServiceActor.shared.setActive(false, source: .watch)
                    await WatchSessionManager.shared.relayPendingProgress()
                }

            case .active:
                debugLog("[WatchApp] App becoming active")
                Task {
                    guard await StorytellerRuntime.start() else { return }
                    await BookServiceActor.shared.setActive(true, source: .watch)
                }

            case .inactive:
                break

            @unknown default:
                break
        }
    }

    private func initializeBookSources() async {
        await syncOnLaunch()
    }

    private func syncOnLaunch() async {
        let result = await ProgressSyncActor.shared.syncPendingQueue()
        debugLog("[WatchApp] Sync on launch: synced=\(result.synced), failed=\(result.failed)")
        await WatchSessionManager.shared.relayPendingProgress()

        if let library = await BookServiceActor.shared.fetchLibraryInformation() {
            debugLog("[WatchApp] Library metadata updated: \(library.count) books")
        }
    }
}

struct ContentView: View {
    @Environment(WatchViewModel.self) private var viewModel

    var body: some View {
        ZStack {
            if viewModel.receivingTitle != nil {
                TransferProgressView()
            } else {
                WatchModeSelectionView()
            }
        }
    }
}
#endif
