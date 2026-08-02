#if os(iOS)
import SwiftUI

struct iOSReadaloudContextMenuContent: View {
    let item: BookMetadata
    @Environment(MediaViewModel.self) private var mediaViewModel

    private var isServerBook: Bool {
        mediaViewModel.isServerBook(item.id)
    }

    private var canAlignLocally: Bool {
        item.hasAvailableEbook && item.hasAvailableAudiobook
            && (isServerBook || mediaViewModel.isLocalFolderBook(item.id))
    }

    private var localAlignTitle: String {
        item.hasAvailableReadaloud ? "Recreate Readaloud" : "Create Readaloud"
    }

    private var readaloudStatus: String {
        item.readaloud?.status?.uppercased() ?? ""
    }

    private var hasServerActions: Bool {
        guard isServerBook else { return false }
        switch readaloudStatus {
            case "PROCESSING", "QUEUED", "ALIGNED", "ERROR", "STOPPED":
                return true
            default:
                return item.hasAvailableEbook && item.hasAvailableAudiobook
        }
    }

    var body: some View {
        if canAlignLocally || hasServerActions {
            Menu {
                if canAlignLocally {
                    Section("This Device") {
                        Button {
                            openLocalGenerator()
                        } label: {
                            Label(localAlignTitle, systemImage: "iphone")
                        }
                    }
                }

                if hasServerActions {
                    Section("Server") {
                        serverActions
                    }
                }
            } label: {
                Label("Processing", systemImage: "wand.and.stars")
            }
        }
    }

    @ViewBuilder
    private var serverActions: some View {
        switch readaloudStatus {
            case "PROCESSING", "QUEUED":
                Button {
                    cancelAlignment()
                } label: {
                    Label("Cancel Readaloud Processing", systemImage: "xmark.circle")
                }
            case "ALIGNED":
                Button {
                    startServerAlignment(.sync)
                } label: {
                    Label("Re-align Readaloud (Fast)", systemImage: "arrow.triangle.2.circlepath")
                }
                Button {
                    startServerAlignment(.transcription)
                } label: {
                    Label("Re-transcribe & Align Readaloud", systemImage: "waveform")
                }
                Button {
                    startServerAlignment(.full)
                } label: {
                    Label("Fully Reprocess Readaloud", systemImage: "arrow.counterclockwise")
                }
            case "ERROR", "STOPPED":
                Button {
                    startServerAlignment(.full)
                } label: {
                    Label("Retry Readaloud Processing", systemImage: "arrow.counterclockwise")
                }
                Button {
                    startServerAlignment(.sync)
                } label: {
                    Label("Re-align Readaloud Only", systemImage: "arrow.triangle.2.circlepath")
                }
            default:
                Button {
                    startServerAlignment(.none)
                } label: {
                    Label("Create on Server", systemImage: "server.rack")
                }
        }
    }

    private func startServerAlignment(_ restart: AlignmentRestartMode) {
        Task {
            _ = await BookServiceActor.shared.startAlignment(
                for: item.id,
                restart: restart,
            )
            await BookServiceActor.shared.fetchLibraryInformation()
        }
    }

    private func cancelAlignment() {
        Task {
            _ = await BookServiceActor.shared.cancelAlignment(for: item.id)
            await BookServiceActor.shared.fetchLibraryInformation()
        }
    }

    private func openLocalGenerator() {
        if let data = LocalReadaloudAlignmentLauncher.data(
            for: item,
            mediaViewModel: mediaViewModel,
        ) {
            NotificationCenter.default.post(name: .storytellerCreateReadaloud, object: data)
        }
    }
}
#endif
