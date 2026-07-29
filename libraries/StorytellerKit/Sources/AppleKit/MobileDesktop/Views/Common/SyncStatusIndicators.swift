#if os(iOS) || os(macOS)
import SwiftUI

struct SyncStatusIndicators: View {
    let bookId: BookID
    @Environment(MediaViewModel.self) private var mediaViewModel: MediaViewModel
    @State private var storytellerConfigured: Bool = false
    @State private var isRefreshing: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            if storytellerConfigured {
                storytellerIndicator
                refreshButton
            }
        }
        .task {
            storytellerConfigured = await BookServiceActor.shared.isConfigured
        }
    }

    private var pendingSync: PendingProgressSync? {
        mediaViewModel.pendingSync(for: bookId)
    }

    private var storytellerSynced: Bool {
        guard let pending = pendingSync else { return true }
        return pending.syncedToStoryteller
    }

    private var storytellerIndicator: some View {
        Image(systemName: "server.rack")
            .font(.system(size: 12))
            .foregroundStyle(storytellerSynced ? .green : .orange)
            .help(storytellerSynced ? "Synced to Storyteller" : "Pending sync to Storyteller")
    }

    private var refreshButton: some View {
        Button {
            Task { await refreshMetadata() }
        } label: {
            if isRefreshing {
                ProgressView()
                    .controlSize(.mini)
            } else {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .disabled(isRefreshing)
        .help("Refresh metadata from server")
    }

    private func refreshMetadata() async {
        isRefreshing = true

        if await BookServiceActor.shared.fetchLibraryInformation() != nil {
            await mediaViewModel.refreshMetadata(source: "SyncStatusIndicators.refresh")
            mediaViewModel.showSyncNotification(
                SyncNotification(message: "Metadata refreshed", type: .success)
            )
        } else {
            mediaViewModel.showSyncNotification(
                SyncNotification(message: "Failed to fetch metadata from server", type: .error)
            )
        }

        isRefreshing = false
    }
}

#endif
