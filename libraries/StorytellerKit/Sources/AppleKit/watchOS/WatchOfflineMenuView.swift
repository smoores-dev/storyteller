#if os(watchOS)
import StorytellerKit
import SwiftUI

struct WatchOfflineMenuView: View {
    @Environment(WatchViewModel.self) private var viewModel
    @State private var showSettingsView = false

    var body: some View {
        List {
            NavigationLink {
                WatchLibraryView()
            } label: {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Read Books")
                            .font(.caption)
                        Text("\(viewModel.books.count) downloaded")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "books.vertical")
                        .foregroundStyle(.blue)
                }
            }

            NavigationLink {
                WatchDownloadMenuView()
            } label: {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Download Books")
                            .font(.caption)
                        Text("From book sources")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "arrow.down.circle")
                        .foregroundStyle(.green)
                }
            }

            NavigationLink {
                WatchTransferInstructionsView()
            } label: {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("iPhone Transfer")
                            .font(.caption)
                        Text("Send via iPhone app")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "iphone.and.arrow.right.outward")
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("On Watch")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showSettingsView = true
                } label: {
                    Image(systemName: "gearshape")
                }
            }
        }
        .sheet(isPresented: $showSettingsView) {
            WatchSettingsView()
        }
    }
}

struct WatchDownloadMenuView: View {
    @State private var incompleteDownloads: [DownloadRecord] = []

    var body: some View {
        List {
            if !incompleteDownloads.isEmpty {
                Section {
                    NavigationLink {
                        WatchIncompleteDownloadsView()
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Downloading")
                                    .font(.caption)
                                Text("\(incompleteDownloads.count) in progress")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "arrow.down.circle.dotted")
                                .foregroundStyle(.green)
                        }
                    }
                }
            }

            Section {
                NavigationLink {
                    WatchCurrentlyReadingView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Currently Reading")
                                .font(.caption)
                            Text("Books in progress")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "book")
                            .foregroundStyle(.blue)
                    }
                }

                NavigationLink {
                    WatchAllBooksView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("All Books")
                                .font(.caption)
                            Text("Full library")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "books.vertical")
                            .foregroundStyle(.purple)
                    }
                }

                NavigationLink {
                    WatchCollectionsView()
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Collections")
                                .font(.caption)
                            Text("Curated sets")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "rectangle.stack")
                            .foregroundStyle(.orange)
                    }
                }
            } header: {
                Text("Browse by:")
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .textCase(nil)
                    .padding(.bottom, 4)
            }
        }
        .navigationTitle("Download")
        .task {
            incompleteDownloads = await DownloadManager.shared.incompleteDownloads
            let _ = await DownloadManager.shared.addObserver { records in
                Task { @MainActor in
                    incompleteDownloads = records.filter { $0.isIncomplete }
                }
            }
        }
    }
}

struct WatchIncompleteDownloadsView: View {
    @State private var downloads: [DownloadRecord] = []
    @State private var selectedRecord: DownloadRecord?

    var body: some View {
        List {
            if downloads.isEmpty {
                Text("No active downloads")
                    .foregroundStyle(.secondary)
                    .font(.caption)
            } else {
                ForEach(downloads) { record in
                    Button {
                        selectedRecord = record
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "book.fill")
                                .font(.title3)
                                .foregroundStyle(watchProgressTint(for: record))
                                .frame(width: 24)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(record.bookTitle)
                                    .font(.caption)
                                    .lineLimit(1)

                                ProgressView(value: record.progressFraction)
                                    .tint(watchProgressTint(for: record))

                                Text(watchStateLabel(for: record))
                                    .font(.caption2)
                                    .foregroundStyle(watchStateLabelColor(for: record))
                            }

                            Image(systemName: "chevron.right")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task {
                                await DownloadManager.shared.cancelDownload(
                                    for: record.bookID,
                                    category: record.category,
                                )
                            }
                        } label: {
                            Label("Cancel", systemImage: "xmark.circle")
                        }
                    }
                }
            }
        }
        .navigationTitle("Downloads")
        .fullScreenCover(item: $selectedRecord) { record in
            WatchDownloadProgressView(
                record: record,
                onDismiss: {
                    selectedRecord = nil
                },
            )
        }
        .task {
            downloads = await DownloadManager.shared.incompleteDownloads
            let _ = await DownloadManager.shared.addObserver { records in
                Task { @MainActor in
                    downloads =
                        records
                        .filter { $0.isIncomplete }
                        .sorted { $0.createdAt < $1.createdAt }
                }
            }
        }
    }

    private func watchStateLabel(for record: DownloadRecord) -> String {
        switch record.state {
            case .queued: "Queued"
            case .downloading(let p): String(format: "%.1f%%", p * 100)
            case .paused: "Paused"
            case .failed(let e, _): "Failed: \(e)"
            case .importing: "Importing..."
            case .completed: "Done"
        }
    }

    private func watchStateLabelColor(for record: DownloadRecord) -> Color {
        switch record.state {
            case .failed: .red
            case .paused: .orange
            default: .secondary
        }
    }

    private func watchProgressTint(for record: DownloadRecord) -> Color {
        switch record.state {
            case .failed: .red
            case .paused: .orange
            default: .accentColor
        }
    }
}

struct WatchTransferInstructionsView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "iphone.badge.play")
                    .font(.system(size: 40))
                    .foregroundStyle(.orange)

                Text("Transfer from iPhone")
                    .font(.headline)

                VStack(alignment: .leading, spacing: 12) {
                    InstructionRow(number: 1, text: "Open Storyteller on iPhone")
                    InstructionRow(number: 2, text: "Go to More tab")
                    InstructionRow(number: 3, text: "Tap Apple Watch")
                    InstructionRow(number: 4, text: "Tap + to select a book")
                }
                .padding()
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))

                Text("Books transfer in the background, even when the watch screen is off.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal)
        }
        .navigationTitle("Transfer")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct InstructionRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(number)")
                .font(.caption2.bold())
                .foregroundStyle(.white)
                .frame(width: 18, height: 18)
                .background(Circle().fill(.orange))

            Text(text)
                .font(.caption2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#Preview {
    WatchOfflineMenuView()
}
#endif
