#if os(macOS)
import AppKit
import StorytellerAppleWidgets
import SwiftUI

extension Scene {
    func disableWindowRestoration() -> some Scene {
        if #available(macOS 15.0, *) {
            return self.restorationBehavior(.disabled)
        } else {
            return self
        }
    }
}

// TODO: Remove most of this when proper book opening is implemented.
// This is debug code
struct StorytellerReaderApp: App {
    @State private var mediaViewModel = MediaViewModel()
    @Environment(\.openWindow) private var openWindow
    @Environment(\.scenePhase) private var scenePhase
    @State private var didOpenSecondaryWindows = false
    @State private var runtimeReady = false

    init() {
        StorytellerFontRegistration.registerBundledFonts()
        SidebarSelectionColor.install()
        Task {
            guard await StorytellerRuntime.start() else { return }

            do {
                let webResourcesURL = try KitResources.webResourcesDirectory()
                try await FilesystemActor.shared.copyWebResources(from: webResourcesURL)
            } catch {
                debugLog(
                    "[StorytellerReaderApp] Failed to copy web resources: \(error.localizedDescription)"
                )
            }

            await FilesystemActor.shared.cleanupExtractedEpubDirectories()

            debugLog("[StorytellerReaderApp] Syncing pending progress queue on launch")
            let (synced, failed) = await ProgressSyncActor.shared.syncPendingQueue()
            debugLog("[StorytellerReaderApp] Queue sync: synced=\(synced), failed=\(failed)")
        }
    }

    var body: some Scene {
        libraryScene
        #if os(macOS)
        audiobookScene
        ebookScene
        settingsScene
        debugLogScene
        readaloudGeneratorScene
        contentServerScene
        liveReadingSyncScene
        mp3ToM4BConverterScene
        serverMediaManagementScene
        uploadNewBookScene
        copyBookScene
        metadataEditorScene
        #endif
    }

    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
            case .background:
                debugLog("[macApp] App entering background")
                Task {
                    guard await StorytellerRuntime.start() else { return }
                    await BookServiceActor.shared.setActive(false, source: .mac)
                }
            case .active:
                debugLog("[macApp] App becoming active")
                Task {
                    guard await StorytellerRuntime.start() else { return }
                    await BookServiceActor.shared.setActive(true, source: .mac)
                }
            case .inactive:
                break
            @unknown default:
                break
        }
    }

    private var debugLogScene: some Scene {
        Window("Debug Log", id: "DebugLog") {
            DebugLogView()
                .environment(AppLaunchContext.environment)
        }
        .defaultSize(width: 800, height: 500)
    }

    private var libraryScene: some Scene {
        Window("Library", id: "MyLibrary") {
            libraryViewContent
        }
        .windowStyle(.hiddenTitleBar)
        .onChange(of: scenePhase) { _, newPhase in
            handleScenePhaseChange(newPhase)
        }
        .commands {
            // Most secondary windows (reader, metadata editor, server tools) only make
            // sense when opened from a book context, so drop the synthesized File > New items.
            CommandGroup(replacing: .newItem) {}
        }
    }

    @ViewBuilder private var libraryViewContent: some View {
        if runtimeReady {
            LibraryView()
                .environment(AppLaunchContext.environment)
                .environment(mediaViewModel)
                #if os(macOS)
            .background(Color(nsColor: .windowBackgroundColor))
                #else
            .background(Color(uiColor: .systemBackground))
                #endif
                .task {
                    guard await StorytellerRuntime.start() else { return }
                    await mediaViewModel.start()
                    await BookServiceActor.shared.setActive(true, source: .mac)
                    guard !didOpenSecondaryWindows else { return }
                    didOpenSecondaryWindows = true
                }
                .onOpenURL { url in
                    handleOpenURL(url)
                }
                .onChange(of: mediaViewModel.pendingOpenBookID) { _, _ in
                    openPendingBookIfReady()
                }
                .onChange(of: mediaViewModel.library.bookMetaData.count) { _, _ in
                    openPendingBookIfReady()
                }
        } else {
            ProgressView("Loading...")
                .task {
                    guard await StorytellerRuntime.start() else { return }
                    await mediaViewModel.start()
                    runtimeReady = true
                }
        }
    }

    private func handleOpenURL(_ url: URL) {
        guard let bookID = StorytellerBookLink.bookID(from: url) else { return }
        mediaViewModel.pendingOpenBookID = bookID
    }

    private func openPendingBookIfReady() {
        guard let target = mediaViewModel.pendingOpenBookID,
            !mediaViewModel.library.bookMetaData.isEmpty
        else { return }
        mediaViewModel.pendingOpenBookID = nil

        guard let book = mediaViewModel.library.bookMetaData.first(where: { $0.id == target })
        else {
            debugLog("[macApp] Dropping unknown deep link for book \(target)")
            return
        }
        guard let category = mediaViewModel.preferredDownloadedCategory(for: book) else {
            debugLog("[macApp] Book \(book.id) not downloaded; showing details in library")
            mediaViewModel.pendingInfoBookID = book.id
            return
        }
        Task {
            let bookData = await mediaViewModel.makePlayerBookDataLoadingCovers(
                for: book,
                category: category,
            )
            openWindow(
                id: category == .audio ? "AudiobookPlayer" : "EbookPlayer",
                value: bookData,
            )
        }
    }

    private var audiobookScene: some Scene {
        WindowGroup("Audiobook Player", id: "AudiobookPlayer", for: PlayerBookData.self) {
            bookData in
            AudiobookPlayerView(bookData: bookData.wrappedValue)
                .environment(AppLaunchContext.environment)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .defaultSize(width: 420, height: 720)
        .disableWindowRestoration()
    }

    private var ebookScene: some Scene {
        WindowGroup("Ebook Reader", id: "EbookPlayer", for: PlayerBookData.self) { bookData in
            EbookPlayerView(bookData: bookData.wrappedValue)
                .environment(AppLaunchContext.environment)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1228, height: 768)
        .disableWindowRestoration()
    }

    private var settingsScene: some Scene {
        Settings {
            SettingsView()
                .environment(AppLaunchContext.environment)
        }
    }

    private var readaloudGeneratorScene: some Scene {
        WindowGroup("Create Readaloud", id: "ReadaloudGenerator", for: ReadaloudGeneratorData.self)
        {
            data in
            ReadaloudGeneratorView(initialData: data.wrappedValue)
                .environment(AppLaunchContext.environment)
                .environment(mediaViewModel)
        }
        .windowResizability(.contentSize)
        .disableWindowRestoration()
        .commands {
            CommandMenu("Utilities") {
                Button("Library") {
                    openWindow(id: "MyLibrary")
                }
                .keyboardShortcut("l", modifiers: [.command])

                Button("Content Server") {
                    openWindow(id: "ContentServer")
                }
                .keyboardShortcut("c", modifiers: [.command, .shift])

                Button("MP3 to M4B Converter") {
                    openWindow(id: "MP3ToM4BConverter")
                }
                .keyboardShortcut("m", modifiers: [.command, .shift])

                Button("Live Reading Sync") {
                    openWindow(id: "LiveReadingSync")
                }

                if AppLaunchContext.environment.readaloudAligner != nil {
                    Button("Create Readaloud...") {
                        openWindow(id: "ReadaloudGenerator")
                    }
                    .keyboardShortcut("R", modifiers: [.command, .shift])
                }

                Divider()

                Button("Debug Log") {
                    openWindow(id: "DebugLog")
                }
                .keyboardShortcut("d", modifiers: [.command, .option])
            }
        }
    }

    private var contentServerScene: some Scene {
        Window("Content Server", id: "ContentServer") {
            ContentServerView()
                .environment(AppLaunchContext.environment)
        }
        .windowResizability(.contentSize)
        .disableWindowRestoration()
    }

    private var liveReadingSyncScene: some Scene {
        Window("Live Reading Sync", id: "LiveReadingSync") {
            LiveReadingSyncView()
                .environment(AppLaunchContext.environment)
        }
        .windowResizability(.contentSize)
        .disableWindowRestoration()
    }

    private var mp3ToM4BConverterScene: some Scene {
        Window("MP3 to M4B Converter", id: "MP3ToM4BConverter") {
            MP3ToM4BConverterView()
                .environment(AppLaunchContext.environment)
        }
        .windowResizability(.contentSize)
        .disableWindowRestoration()
    }

    private var serverMediaManagementScene: some Scene {
        WindowGroup(
            "Server Media Management",
            id: "ServerMediaManagement",
            for: ServerMediaManagementData.self,
        ) { data in
            if let bookId = data.wrappedValue?.bookId {
                ServerMediaManagementView(bookId: bookId)
                    .environment(AppLaunchContext.environment)
                    .environment(mediaViewModel)
            }
        }
        .windowResizability(.contentSize)
        .disableWindowRestoration()
    }

    private var uploadNewBookScene: some Scene {
        WindowGroup("Upload New Book", id: "UploadNewBook", for: UploadNewBookData.self) { data in
            UploadNewBookView(initialSourceID: data.wrappedValue?.sourceID)
                .environment(AppLaunchContext.environment)
                .environment(mediaViewModel)
        }
        .windowResizability(.contentSize)
        .disableWindowRestoration()
    }

    private var copyBookScene: some Scene {
        WindowGroup("Copy Book", id: "CopyBook", for: CopyBookData.self) { data in
            if let data = data.wrappedValue {
                CopyBookView(
                    bookID: data.bookID,
                    destinationSourceID: data.destinationSourceID,
                )
                .environment(AppLaunchContext.environment)
                .environment(mediaViewModel)
            }
        }
        .windowResizability(.contentSize)
        .disableWindowRestoration()
    }

    private var metadataEditorScene: some Scene {
        WindowGroup("Edit Metadata", id: "MetadataEditor", for: MetadataEditorData.self) { data in
            MetadataEditorSceneContent(data: data.wrappedValue)
                .environment(AppLaunchContext.environment)
                .environment(mediaViewModel)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1340, height: 710)
        .disableWindowRestoration()
    }
}

private struct MetadataEditorSceneContent: View {
    @Environment(\.dismiss) private var dismiss
    let data: MetadataEditorData?

    var body: some View {
        if let data {
            MetadataEditorView(initialBookIds: data.bookIds)
        } else {
            Color.clear
                .onAppear {
                    dismiss()
                }
        }
    }
}

#endif
