#if os(macOS)
import AppKit
import SwiftUI

struct BookContextMenuContent: View {
    let item: BookMetadata
    var onInfo: ((BookMetadata) -> Void)? = nil
    var onEditMetadata: (([BookID]) -> Void)? = nil
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        if let onInfo {
            Button {
                onInfo(item)
            } label: {
                Label("Show Book Information", systemImage: "info.circle")
            }
        }

        if let onEditMetadata {
            Button {
                onEditMetadata([item.id])
            } label: {
                Label("Edit Metadata...", systemImage: "pencil")
            }
        }

        statusSection

        deleteSection

        processingMenu

        copyToSection

        serverMediaSection
    }

    @ViewBuilder
    private var copyToSection: some View {
        let destinations = mediaViewModel.copyDestinations(for: currentItem)
        if !destinations.isEmpty {
            Divider()

            Menu {
                ForEach(destinations) { destination in
                    Button {
                        openWindow(
                            id: "CopyBook",
                            value: CopyBookData(
                                bookID: item.id,
                                destinationSourceID: destination.id,
                            ),
                        )
                    } label: {
                        Label(destination.name, systemImage: sourceIconName(destination.kind))
                    }
                }
            } label: {
                Label("Copy To...", systemImage: "square.and.arrow.up.on.square")
            }
        }
    }

    private func sourceIconName(_ kind: BookSourceKind) -> String {
        switch kind {
            case .storyteller: return "server.rack"
            case .localFolder: return "folder"
        }
    }

    private var currentItem: BookMetadata {
        mediaViewModel.library.bookMetaData.first { $0.id == item.id } ?? item
    }

    private var sortedStatuses: [BookStatus] {
        return mediaViewModel.availableStatusesBySourceID[currentSourceID] ?? []
    }

    private var currentSourceID: BookSourceID {
        currentItem.sourceID
    }

    @ViewBuilder
    private var statusSection: some View {
        if !sortedStatuses.isEmpty {
            Divider()

            Menu {
                ForEach(sortedStatuses, id: \.name) { status in
                    Button {
                        setStatus(status.name)
                    } label: {
                        if status.name == currentItem.status?.name {
                            Label(status.name, systemImage: "checkmark")
                        } else {
                            Text(status.name)
                        }
                    }
                    .disabled(status.name == currentItem.status?.name)
                }
            } label: {
                Label("Set Status", systemImage: "bookmark")
            }
        }
    }

    private func setStatus(_ name: String) {
        guard name != currentItem.status?.name else { return }
        Task {
            let success = await BookServiceActor.shared.updateStatus(
                forBooks: [item.id],
                toStatusNamed: name,
            )
            if !success {
                mediaViewModel.showSyncNotification(
                    SyncNotification(
                        message: "Failed to update status",
                        type: .error,
                    )
                )
            }
        }
    }

    private var showLocalAlign: Bool {
        canAlignFromSource
    }

    private var showServerProcessing: Bool {
        mediaViewModel.isServerBook(item.id) && hasProcessingActions
    }

    private var hasAnyProcessingActions: Bool {
        showLocalAlign || showServerProcessing || item.canUpgradeToEpub3
    }

    private var canAlignFromSource: Bool {
        item.hasAvailableEbook && item.hasAvailableAudiobook
            && (mediaViewModel.isServerBook(item.id) || mediaViewModel.isLocalFolderBook(item.id))
    }

    private var alignMenuTitle: String {
        item.hasAvailableReadaloud ? "Recreate Readaloud" : "Create Readaloud"
    }

    private var hasProcessingActions: Bool {
        let status = item.readaloud?.status?.uppercased() ?? ""
        return status == "PROCESSING" || status == "QUEUED" || status == "ALIGNED"
            || status == "ERROR" || status == "STOPPED"
            || (item.hasAvailableEbook && item.hasAvailableAudiobook)
    }

    @ViewBuilder
    private var processingMenu: some View {
        if hasAnyProcessingActions {
            Divider()

            Menu {
                if showLocalAlign {
                    Section("This Mac") {
                        localAlignButton
                    }
                }

                if showServerProcessing || item.canUpgradeToEpub3 {
                    Section("Server") {
                        if showServerProcessing {
                            serverProcessingActions
                        }
                        epubUpgradeButton
                    }
                }
            } label: {
                Label("Processing", systemImage: "wand.and.stars")
            }
        }
    }

    @ViewBuilder
    private var localAlignButton: some View {
        Button {
            if let data = LocalReadaloudAlignmentLauncher.data(
                for: item,
                mediaViewModel: mediaViewModel,
            ) {
                openWindow(
                    id: "ReadaloudGenerator",
                    value: data,
                )
            }
        } label: {
            Label(alignMenuTitle, systemImage: "desktopcomputer")
        }
    }

    @ViewBuilder
    private var serverProcessingActions: some View {
        let status = item.readaloud?.status?.uppercased() ?? ""
        let hasEbookAndAudio = item.hasAvailableEbook && item.hasAvailableAudiobook

        if status == "PROCESSING" || status == "QUEUED" {
            Button {
                Task {
                    _ = await BookServiceActor.shared.cancelAlignment(
                        for: item.id
                    )
                    await BookServiceActor.shared.fetchLibraryInformation()
                }
            } label: {
                Label("Cancel Readaloud Processing", systemImage: "xmark.circle")
            }
        } else if status == "ALIGNED" {
            Button {
                Task {
                    _ = await BookServiceActor.shared.startAlignment(
                        for: item.id,
                        restart: .sync,
                    )
                    await BookServiceActor.shared.fetchLibraryInformation()
                }
            } label: {
                Label("Re-align Readaloud (Fast)", systemImage: "arrow.triangle.2.circlepath")
            }

            Button {
                Task {
                    _ = await BookServiceActor.shared.startAlignment(
                        for: item.id,
                        restart: .transcription,
                    )
                    await BookServiceActor.shared.fetchLibraryInformation()
                }
            } label: {
                Label("Re-transcribe & Align Readaloud", systemImage: "waveform")
            }

            Button {
                Task {
                    _ = await BookServiceActor.shared.startAlignment(
                        for: item.id,
                        restart: .full,
                    )
                    await BookServiceActor.shared.fetchLibraryInformation()
                }
            } label: {
                Label("Fully Reprocess Readaloud", systemImage: "arrow.counterclockwise")
            }
        } else if status == "ERROR" || status == "STOPPED" {
            Button {
                Task {
                    _ = await BookServiceActor.shared.startAlignment(
                        for: item.id,
                        restart: .full,
                    )
                    await BookServiceActor.shared.fetchLibraryInformation()
                }
            } label: {
                Label("Retry Readaloud Processing", systemImage: "arrow.counterclockwise")
            }

            Button {
                Task {
                    _ = await BookServiceActor.shared.startAlignment(
                        for: item.id,
                        restart: .sync,
                    )
                    await BookServiceActor.shared.fetchLibraryInformation()
                }
            } label: {
                Label("Re-align Readaloud Only", systemImage: "arrow.triangle.2.circlepath")
            }
        } else if hasEbookAndAudio {
            Button {
                Task {
                    _ = await BookServiceActor.shared.startAlignment(
                        for: item.id
                    )
                    await BookServiceActor.shared.fetchLibraryInformation()
                }
            } label: {
                Label("Create Readaloud", systemImage: "cloud")
            }
        }
    }

    @ViewBuilder
    private var epubUpgradeButton: some View {
        if item.canUpgradeToEpub3 {
            if showServerProcessing {
                Divider()
            }
            Button {
                Task {
                    _ = await BookServiceActor.shared.upgradeEpub(
                        for: item.id
                    )
                    await BookServiceActor.shared.fetchLibraryInformation()
                }
            } label: {
                Label("Convert to EPUB 3", systemImage: "doc.badge.arrow.up")
            }
        }
    }

    @ViewBuilder
    private var deleteSection: some View {
        let ebookCached = mediaViewModel.hasCachedMedia(.ebook, for: item)
        let audioCached = mediaViewModel.hasCachedMedia(.audio, for: item)
        let syncedCached = mediaViewModel.hasCachedMedia(.synced, for: item)
        let isFolderBook = mediaViewModel.isLocalFolderBook(item.id)

        if isFolderBook {
            Divider()

            Menu {
                if item.hasAvailableEbook {
                    Button(role: .destructive) {
                        confirmDeleteSourceAsset(.ebook)
                    } label: {
                        Label("Delete Ebook", systemImage: "trash")
                            .foregroundStyle(.red)
                    }
                    .tint(.red)
                }

                if item.hasAvailableAudiobook {
                    Button(role: .destructive) {
                        confirmDeleteSourceAsset(.audiobook)
                    } label: {
                        Label("Delete Audiobook", systemImage: "trash")
                            .foregroundStyle(.red)
                    }
                    .tint(.red)
                }

                if item.hasAvailableReadaloud {
                    Button(role: .destructive) {
                        confirmDeleteSourceAsset(.readaloud)
                    } label: {
                        Label("Delete Readaloud", systemImage: "trash")
                            .foregroundStyle(.red)
                    }
                    .tint(.red)
                }

                Divider()

                Button(role: .destructive) {
                    confirmDeleteSourceBook()
                } label: {
                    Label("Delete All", systemImage: "trash")
                        .foregroundStyle(.red)
                }
                .tint(.red)
            } label: {
                Label("Delete from Folder", systemImage: "trash")
            }
            .tint(.red)
        } else if ebookCached || audioCached || syncedCached {
            Divider()

            if ebookCached {
                Button(role: .destructive) {
                    confirmDeleteLocalDownload(.ebook)
                } label: {
                    Label("Delete Local Ebook", systemImage: "trash")
                }
            }

            if audioCached {
                Button(role: .destructive) {
                    confirmDeleteLocalDownload(.audio)
                } label: {
                    Label("Delete Local Audiobook", systemImage: "trash")
                }
            }

            if syncedCached {
                Button(role: .destructive) {
                    confirmDeleteLocalDownload(.synced)
                } label: {
                    Label("Delete Local Readaloud", systemImage: "trash")
                }
            }
        }
    }

    private func confirmDeleteLocalDownload(_ category: LocalMediaCategory) {
        let label = localMediaLabel(category)
        guard
            confirmDestructiveAction(
                title: "Delete Local \(label)?",
                message: "This will remove the downloaded \(label.lowercased()) from this device.",
                buttonTitle: "Delete",
            )
        else { return }
        mediaViewModel.deleteDownload(for: item, category: category)
    }

    private func confirmDeleteSourceAsset(_ format: StorytellerBookFormat) {
        let label = mediaViewModel.folderAssetLabel(format)
        guard
            confirmDestructiveAction(
                title: "Delete \(label) from Folder?",
                message:
                    "This will permanently delete the \(label.lowercased()) file from the folder source. This cannot be undone.",
                buttonTitle: "Delete",
            )
        else { return }
        Task {
            _ = await mediaViewModel.deleteFolderAsset(for: item, format: format)
        }
    }

    private func confirmDeleteSourceBook() {
        guard
            confirmDestructiveAction(
                title: "Delete All from Folder?",
                message:
                    "This will permanently delete \(item.title) and all its media from the folder source. This cannot be undone.",
                buttonTitle: "Delete All",
            )
        else { return }
        Task {
            _ = await mediaViewModel.deleteFolderBook(item)
        }
    }

    private func localMediaLabel(_ category: LocalMediaCategory) -> String {
        switch category {
            case .ebook:
                return "Ebook"
            case .audio:
                return "Audiobook"
            case .synced:
                return "Readaloud"
        }
    }

    private func confirmDestructiveAction(
        title: String,
        message: String,
        buttonTitle: String,
    ) -> Bool {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: buttonTitle)
        alert.addButton(withTitle: "Cancel")
        return alert.runModal() == .alertFirstButtonReturn
    }

    @ViewBuilder
    private var serverMediaSection: some View {
        if mediaViewModel.isServerBook(item.id) {
            Divider()

            Button {
                openWindow(
                    id: "ServerMediaManagement",
                    value: ServerMediaManagementData(bookId: item.id),
                )
            } label: {
                Label("Manage Server Media...", systemImage: "server.rack")
            }
        }
    }
}
#endif
